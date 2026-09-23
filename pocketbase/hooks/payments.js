// Server-side payment intent / split helper for the "pay at request" escrow
// flow (Airbnb / GetNinjas style) with real Mercado Pago integration.
//
// Webhook configuration in Mercado Pago panel:
// Configure notification URL: https://<PB_INSTANCE_URL>/backend/v1/payments/webhook
// Events: Payment (payment.created, payment.updated)
//
// The client pays BEFORE the job is created: the amount is captured up-front
// and held in escrow by the platform. When a professional later accepts and
// completes the job, a guarantee window runs from `completed_at`, after
// which the held payment is released to the professional (see the
// release_held_payments cron). If the job is cancelled before release, the
// held amount is refunded to the client (payment_status = 'refunded').
//
// Endpoints
//   GET  /backend/v1/payments/config
//   POST /backend/v1/payments/create-split       -> capture + hold (escrow)
//   POST /backend/v1/payments/capture-split      -> capture + split (admin/release)
//   POST /backend/v1/payments/release-payment    -> start the guarantee window
//   POST /backend/v1/payments/dispute-payment    -> pause the guarantee window
//   POST /backend/v1/payments/cancel-auth        -> refund the held payment
//   POST /backend/v1/payments/webhook            -> Mercado Pago IPN/webhook (public)
//
// NOTE (hooks run in a separate VM): all helper logic (settings lookup, fee
// computation, job lookup, event recording) is inlined inside each callback —
// top-level functions are NOT accessible at runtime.

// ---------------------------------------------------------------------------
// GET /backend/v1/payments/config
// ---------------------------------------------------------------------------
routerAdd('GET', '/backend/v1/payments/config', (e) => {
  const provider = $os.getenv('PAYMENT_PROVIDER') || ''
  let publicKey = ''
  if (provider === 'stripe') {
    publicKey = $os.getenv('STRIPE_PUBLIC_KEY') || ''
  } else if (provider === 'mercadopago') {
    publicKey = $os.getenv('MERCADOPAGO_PUBLIC_KEY') || ''
  }
  if (!provider) {
    return e.json(200, { ok: true, config: null })
  }
  return e.json(200, { ok: true, config: { provider: provider, publicKey: publicKey } })
})

// ---------------------------------------------------------------------------
// POST /backend/v1/payments/create-split
//   body: { amount, currency, proAccountId, description, jobId, paymentToken, paymentMethodId, payerEmail, installments }
// ---------------------------------------------------------------------------
routerAdd('POST', '/backend/v1/payments/create-split', (e) => {
  const auth = e.requestInfo().auth
  if (!auth) {
    return e.json(401, { ok: false, error: 'Autenticação necessária.' })
  }

  const body = e.requestInfo().body || {}
  const amount = parseFloat(body.amount || '0')
  const currency = (body.currency || 'brl').toString().toLowerCase()
  const proAccountId = (body.proAccountId || '').toString().trim()
  const description = (body.description || 'Serviço ProFreela').toString()
  const jobId = (body.jobId || '').toString().trim()
  const provider = $os.getenv('PAYMENT_PROVIDER') || ''

  // Blindagem geral: rejeitar amount <= 0
  if (!amount || amount <= 0) {
    return e.json(400, { ok: false, error: 'Valor inválido.' })
  }

  // Blindagem geral: quando provider é mercadopago, toda cobrança real precisa estar amarrada a um job
  if (provider === 'mercadopago' && !jobId) {
    return e.json(400, { ok: false, error: 'jobId é obrigatório para pagamentos Mercado Pago.' })
  }

  // Helper inline para registrar auditoria em payment_events
  const logPaymentEvent = function (jId, pIntentId, evType, provStatus, payloadData) {
    try {
      const pCol = $app.findCollectionByNameOrId('payment_events')
      const rec = new Record(pCol)
      if (jId) rec.set('job_id', jId)
      if (pIntentId) rec.set('payment_intent_id', pIntentId)
      rec.set('type', evType)
      if (provStatus) rec.set('provider_status', provStatus)
      if (payloadData) rec.set('payload', payloadData)
      $app.save(rec)
    } catch (err) {
      console.log('[create-split] erro ao salvar payment_event:', err)
    }
  }

  // --- read settings (inlined) ---------------------------------------------
  let feePercent = 15
  let minFee = 5
  try {
    const rows = $app.findRecordsByFilter('settings', '1=1', '', 1, 0)
    if (rows.length > 0) {
      const s = rows[0]
      const fp = s.getFloat('service_fee_percent')
      const mf = s.getFloat('min_service_fee')
      if (fp > 0) feePercent = fp
      if (mf > 0) minFee = mf
    }
  } catch (_) {}

  // --- compute platform fee (inlined) --------------------------------------
  let feeAmountCents = Math.round(amount * (feePercent / 100) * 100) // cents
  const minFeeCents = Math.round(minFee * 100)
  if (feeAmountCents < minFeeCents) feeAmountCents = minFeeCents

  const nowIso = new Date().toISOString()
  let intentId = ''
  let providerResponse = null
  let paymentMethodId = (body.paymentMethodId || '').toString().trim()
  let installments = parseInt(body.installments || '1', 10) || 1

  if (provider === 'stripe') {
    const secretKey = $os.getenv('STRIPE_SECRET_KEY') || ''
    if (!secretKey) {
      return e.json(503, { ok: false, error: 'Stripe não configurado.' })
    }
    let stripeBody =
      'amount=' +
      Math.round(amount * 100) +
      '&currency=' +
      currency +
      '&description=' +
      encodeURIComponent(description) +
      '&capture_method=automatic' +
      '&application_fee_amount=' +
      feeAmountCents
    if (proAccountId) {
      stripeBody += '&transfer_data[destination]=' + encodeURIComponent(proAccountId)
    }
    const res = $http.send({
      url: 'https://api.stripe.com/v1/payment_intents',
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + secretKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: stripeBody,
      timeout: 20,
    })
    providerResponse = res.json || {}
    if (res.statusCode >= 200 && res.statusCode < 300 && providerResponse.id) {
      intentId = providerResponse.id
      logPaymentEvent(jobId, intentId, 'create', providerResponse.status || 'succeeded', {
        provider: 'stripe',
        amount: amount,
      })
    } else {
      logPaymentEvent(jobId, '', 'error', 'failed', {
        provider: 'stripe',
        statusCode: res.statusCode,
        response: providerResponse,
      })
      return e.json(res.statusCode, providerResponse || { ok: false, error: 'Falha no Stripe.' })
    }
  } else if (provider === 'mercadopago') {
    const accessToken = $os.getenv('MERCADOPAGO_ACCESS_TOKEN') || ''
    if (!accessToken) {
      return e.json(503, { ok: false, error: 'Mercado Pago não configurado.' })
    }

    const payload = {
      transaction_amount: amount,
      description: description,
      capture: true,
      installments: installments,
      statement_descriptor: 'PROFREELA',
    }
    if (jobId) {
      payload.external_reference = jobId
      payload.metadata = { job_id: jobId }
    }
    if (body.paymentToken) {
      payload.token = body.paymentToken
      if (paymentMethodId) {
        payload.payment_method_id = paymentMethodId
      }
    }
    payload.payer = { entity_type: 'individual' }
    if (body.payerEmail) payload.payer.email = body.payerEmail
    if (proAccountId) payload.application_fee = feeAmountCents / 100

    const res = $http.send({
      url: 'https://api.mercadopago.com/v1/payments',
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      timeout: 25,
    })
    providerResponse = res.json || {}
    const mpStatus = providerResponse.status || ''

    if (res.statusCode >= 200 && res.statusCode < 300 && providerResponse.id) {
      intentId = String(providerResponse.id)

      // CRÍTICO: Exigir status === 'approved' para considerar sucesso
      if (mpStatus !== 'approved') {
        // Recusado, pendente ou cancelado
        logPaymentEvent(jobId, intentId, 'error', mpStatus, {
          provider: 'mercadopago',
          status_detail: providerResponse.status_detail,
          statusCode: res.statusCode,
          amount: amount,
          payment_method_id: paymentMethodId || providerResponse.payment_method_id,
        })

        return e.json(402, {
          ok: false,
          error: 'Pagamento recusado pela operadora. Tente outro cartão.',
          status: mpStatus,
          status_detail: providerResponse.status_detail,
        })
      }

      // Status é 'approved'! Registrar evento de sucesso
      logPaymentEvent(jobId, intentId, 'create', mpStatus, {
        provider: 'mercadopago',
        amount: amount,
        installments: installments,
        payment_method_id: paymentMethodId || providerResponse.payment_method_id,
        status_detail: providerResponse.status_detail,
      })
    } else {
      // Erro HTTP do Mercado Pago
      logPaymentEvent(jobId, '', 'error', mpStatus || 'error', {
        provider: 'mercadopago',
        statusCode: res.statusCode,
        response: providerResponse,
      })
      return e.json(
        res.statusCode || 500,
        providerResponse || { ok: false, error: 'Falha no Mercado Pago.' },
      )
    }
  } else {
    // Demo mode: synthesize a realistic intent id.
    intentId = 'pi_demo_' + $security.randomString(16)
    logPaymentEvent(jobId, intentId, 'create', 'approved', {
      provider: 'demo',
      amount: amount,
      installments: installments,
      payment_method_id: paymentMethodId || 'credit_card',
    })
  }

  // Persist the held (escrow) state and audit data on the job (if a jobId was provided).
  if (jobId) {
    let job = null
    try {
      job = $app.findFirstRecordByData('jobs', 'id', jobId)
    } catch (_) {}
    if (job) {
      job.set('payment_status', 'held')
      job.set('payment_intent_id', intentId)
      job.set('payment_authorized_at', nowIso)
      if (paymentMethodId) {
        job.set('payment_method', paymentMethodId)
      } else if (providerResponse && providerResponse.payment_method_id) {
        job.set('payment_method', String(providerResponse.payment_method_id))
      }
      if (installments > 0) {
        job.set('payment_installments', installments)
      }
      $app.save(job)
    }
  }

  return e.json(200, {
    ok: true,
    demo: provider === '',
    payment_status: 'held',
    payment_intent_id: intentId,
    authorized_at: nowIso,
    split: {
      total: amount,
      currency: currency,
      platform_fee: feeAmountCents / 100,
      pro_amount: (Math.round(amount * 100) - feeAmountCents) / 100,
      fee_percent: feePercent,
      min_fee: minFee,
      capture_method: 'automatic',
    },
  })
})

// ---------------------------------------------------------------------------
// POST /backend/v1/payments/capture-split
//   body: { jobId, force }
// ---------------------------------------------------------------------------
routerAdd('POST', '/backend/v1/payments/capture-split', (e) => {
  const auth = e.requestInfo().auth
  if (!auth) {
    return e.json(401, { ok: false, error: 'Autenticação necessária.' })
  }
  const body = e.requestInfo().body || {}
  const jobId = (body.jobId || '').toString().trim()
  const force = body.force === true || body.force === 'true'

  if (!jobId) {
    return e.json(400, { ok: false, error: 'jobId é obrigatório.' })
  }

  // Helper inline para registrar auditoria em payment_events
  const logPaymentEvent = function (jId, pIntentId, evType, provStatus, payloadData) {
    try {
      const pCol = $app.findCollectionByNameOrId('payment_events')
      const rec = new Record(pCol)
      if (jId) rec.set('job_id', jId)
      if (pIntentId) rec.set('payment_intent_id', pIntentId)
      rec.set('type', evType)
      if (provStatus) rec.set('provider_status', provStatus)
      if (payloadData) rec.set('payload', payloadData)
      $app.save(rec)
    } catch (err) {
      console.log('[capture-split] erro ao salvar payment_event:', err)
    }
  }

  // --- find job (inlined) --------------------------------------------------
  let job = null
  try {
    job = $app.findFirstRecordByData('jobs', 'id', jobId)
  } catch (_) {}
  if (!job) {
    return e.json(404, { ok: false, error: 'Serviço não encontrado.' })
  }

  const status = job.getString('payment_status')
  if (status !== 'held' && status !== 'authorized' && status !== 'disputed') {
    return e.json(400, {
      ok: false,
      error: 'Captura não permitida no status atual: ' + (status || 'vazio') + '.',
    })
  }

  // Enforce the guarantee window unless this is an admin override.
  const isAdmin = auth.getString('role') === 'admin'
  const holdUntil = job.getString('payment_hold_until')
  if (!force && !isAdmin && holdUntil) {
    const holdTs = new Date(holdUntil).getTime()
    if (!isNaN(holdTs) && Date.now() < holdTs) {
      const daysLeft = Math.ceil((holdTs - Date.now()) / (24 * 3600 * 1000))
      return e.json(400, {
        ok: false,
        error: 'Período de garantia em andamento. Faltam ' + daysLeft + ' dia(s).',
      })
    }
  }

  const intentId = job.getString('payment_intent_id')
  const amount = job.getFloat('price')

  // --- read settings (inlined) ---------------------------------------------
  let feePercent = 15
  let minFee = 5
  try {
    const rows = $app.findRecordsByFilter('settings', '1=1', '', 1, 0)
    if (rows.length > 0) {
      const s = rows[0]
      const fp = s.getFloat('service_fee_percent')
      const mf = s.getFloat('min_service_fee')
      if (fp > 0) feePercent = fp
      if (mf > 0) minFee = mf
    }
  } catch (_) {}

  // --- compute platform fee (inlined) --------------------------------------
  let feeAmountCents = Math.round(amount * (feePercent / 100) * 100) // cents
  const minFeeCents = Math.round(minFee * 100)
  if (feeAmountCents < minFeeCents) feeAmountCents = minFeeCents

  const nowIso = new Date().toISOString()
  const provider = $os.getenv('PAYMENT_PROVIDER') || ''

  if (provider === 'stripe') {
    const secretKey = $os.getenv('STRIPE_SECRET_KEY') || ''
    if (!secretKey) {
      return e.json(503, { ok: false, error: 'Stripe não configurado.' })
    }
    const res = $http.send({
      url: 'https://api.stripe.com/v1/payment_intents/' + encodeURIComponent(intentId) + '/capture',
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + secretKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'amount_to_capture=' + Math.round(amount * 100),
      timeout: 20,
    })
    if (res.statusCode < 200 || res.statusCode >= 300) {
      logPaymentEvent(jobId, intentId, 'error', 'failed', {
        provider: 'stripe',
        action: 'capture',
        statusCode: res.statusCode,
        response: res.json,
      })
      return e.json(res.statusCode, res.json || { ok: false, error: 'Falha na captura Stripe.' })
    }
    logPaymentEvent(jobId, intentId, 'capture', 'succeeded', {
      provider: 'stripe',
      amount: amount,
    })
  } else if (provider === 'mercadopago') {
    const accessToken = $os.getenv('MERCADOPAGO_ACCESS_TOKEN') || ''
    if (!accessToken) {
      return e.json(503, { ok: false, error: 'Mercado Pago não configurado.' })
    }

    // 1. GET /v1/payments/{intentId} para checar status atual
    let getRes = null
    try {
      getRes = $http.send({
        url: 'https://api.mercadopago.com/v1/payments/' + encodeURIComponent(intentId),
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + accessToken,
        },
        timeout: 20,
      })
    } catch (netErr) {
      logPaymentEvent(jobId, intentId, 'error', 'network_error', {
        action: 'capture_check',
        error: String(netErr),
      })
      return e.json(502, { ok: false, error: 'Erro de conexão ao consultar Mercado Pago.' })
    }

    if (!getRes || getRes.statusCode < 200 || getRes.statusCode >= 300) {
      logPaymentEvent(jobId, intentId, 'error', 'get_failed', {
        action: 'capture_check',
        statusCode: getRes ? getRes.statusCode : 0,
        response: getRes ? getRes.json : null,
      })
      return e.json(
        (getRes && getRes.statusCode) || 502,
        (getRes && getRes.json) || { ok: false, error: 'Falha ao consultar Mercado Pago.' },
      )
    }

    const currentData = getRes.json || {}
    const curStatus = currentData.status || ''

    if (curStatus === 'approved') {
      // Já aprovado/capturado: pular chamada PUT de captura
      logPaymentEvent(jobId, intentId, 'capture', 'approved', {
        note: 'Pagamento já aprovado/capturado previamente no Mercado Pago. Captura idempotente ignorada.',
      })
    } else if (curStatus === 'authorized') {
      // Authorized: fazer o PUT capture:true
      const putRes = $http.send({
        url: 'https://api.mercadopago.com/v1/payments/' + encodeURIComponent(intentId),
        method: 'PUT',
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ capture: true }),
        timeout: 20,
      })
      if (putRes.statusCode < 200 || putRes.statusCode >= 300) {
        logPaymentEvent(jobId, intentId, 'error', 'capture_failed', {
          statusCode: putRes.statusCode,
          response: putRes.json,
        })
        return e.json(
          putRes.statusCode,
          putRes.json || { ok: false, error: 'Falha na captura Mercado Pago.' },
        )
      }
      logPaymentEvent(jobId, intentId, 'capture', 'approved', {
        action: 'captured_from_authorized',
      })
    } else {
      // Outro status inesperado
      logPaymentEvent(jobId, intentId, 'error', curStatus, {
        action: 'unexpected_status_on_capture',
        response: currentData,
      })
      return e.json(400, {
        ok: false,
        error: 'Status no Mercado Pago incompatível com captura: ' + curStatus,
      })
    }
  } else {
    // Demo mode
    logPaymentEvent(jobId, intentId, 'capture', 'approved', {
      provider: 'demo',
      amount: amount,
    })
  }

  job.set('payment_status', 'captured')
  job.set('payment_released_at', nowIso)
  $app.save(job)

  return e.json(200, {
    ok: true,
    demo: provider === '',
    payment_status: 'captured',
    payment_intent_id: intentId,
    released_at: nowIso,
    split: {
      total: amount,
      platform_fee: feeAmountCents / 100,
      pro_amount: (Math.round(amount * 100) - feeAmountCents) / 100,
      fee_percent: feePercent,
    },
  })
})

// ---------------------------------------------------------------------------
// POST /backend/v1/payments/release-payment
//   body: { jobId }
// ---------------------------------------------------------------------------
routerAdd('POST', '/backend/v1/payments/release-payment', (e) => {
  const auth = e.requestInfo().auth
  if (!auth) {
    return e.json(401, { ok: false, error: 'Autenticação necessária.' })
  }
  const body = e.requestInfo().body || {}
  const jobId = (body.jobId || '').toString().trim()
  if (!jobId) {
    return e.json(400, { ok: false, error: 'jobId é obrigatório.' })
  }
  // --- find job (inlined) --------------------------------------------------
  let job = null
  try {
    job = $app.findFirstRecordByData('jobs', 'id', jobId)
  } catch (_) {}
  if (!job) {
    return e.json(404, { ok: false, error: 'Serviço não encontrado.' })
  }

  const status = job.getString('payment_status')
  if (status !== 'authorized' && status !== 'held' && status !== '') {
    return e.json(400, {
      ok: false,
      error: 'Liberação não permitida no status atual: ' + (status || 'vazio') + '.',
    })
  }

  // --- read settings (inlined) ---------------------------------------------
  let guaranteeDays = 7
  try {
    const rows = $app.findRecordsByFilter('settings', '1=1', '', 1, 0)
    if (rows.length > 0) {
      const gd = rows[0].getFloat('guarantee_period_days')
      if (gd > 0) guaranteeDays = gd
    }
  } catch (_) {}

  const holdUntil = new Date(Date.now() + guaranteeDays * 24 * 3600 * 1000).toISOString()
  const nowIso = new Date().toISOString()

  job.set('payment_status', 'held')
  job.set('payment_hold_until', holdUntil)
  if (!job.getString('payment_authorized_at')) {
    job.set('payment_authorized_at', nowIso)
  }
  $app.save(job)

  return e.json(200, {
    ok: true,
    payment_status: 'held',
    hold_until: holdUntil,
    guarantee_days: guaranteeDays,
  })
})

// ---------------------------------------------------------------------------
// POST /backend/v1/payments/dispute-payment
//   body: { jobId, reason }
// ---------------------------------------------------------------------------
routerAdd('POST', '/backend/v1/payments/dispute-payment', (e) => {
  const auth = e.requestInfo().auth
  if (!auth) {
    return e.json(401, { ok: false, error: 'Autenticação necessária.' })
  }
  const body = e.requestInfo().body || {}
  const jobId = (body.jobId || '').toString().trim()
  const reason = (body.reason || '').toString().trim()
  if (!jobId) {
    return e.json(400, { ok: false, error: 'jobId é obrigatório.' })
  }
  // --- find job (inlined) --------------------------------------------------
  let job = null
  try {
    job = $app.findFirstRecordByData('jobs', 'id', jobId)
  } catch (_) {}
  if (!job) {
    return e.json(404, { ok: false, error: 'Serviço não encontrado.' })
  }

  const status = job.getString('payment_status')
  if (status === 'captured' || status === 'cancelled') {
    return e.json(400, {
      ok: false,
      error: 'Disputa não permitida no status atual: ' + status + '.',
    })
  }

  const nowIso = new Date().toISOString()
  job.set('payment_status', 'disputed')
  job.set('payment_disputed_at', nowIso)
  if (reason) job.set('dispute_reason', reason)
  $app.save(job)

  return e.json(200, {
    ok: true,
    payment_status: 'disputed',
    disputed_at: nowIso,
    reason: reason,
  })
})

// ---------------------------------------------------------------------------
// POST /backend/v1/payments/cancel-auth
//   body: { jobId }
// ---------------------------------------------------------------------------
routerAdd('POST', '/backend/v1/payments/cancel-auth', (e) => {
  const auth = e.requestInfo().auth
  if (!auth) {
    return e.json(401, { ok: false, error: 'Autenticação necessária.' })
  }
  const body = e.requestInfo().body || {}
  const jobId = (body.jobId || '').toString().trim()
  if (!jobId) {
    return e.json(400, { ok: false, error: 'jobId é obrigatório.' })
  }

  // Helper inline para registrar auditoria em payment_events
  const logPaymentEvent = function (jId, pIntentId, evType, provStatus, payloadData) {
    try {
      const pCol = $app.findCollectionByNameOrId('payment_events')
      const rec = new Record(pCol)
      if (jId) rec.set('job_id', jId)
      if (pIntentId) rec.set('payment_intent_id', pIntentId)
      rec.set('type', evType)
      if (provStatus) rec.set('provider_status', provStatus)
      if (payloadData) rec.set('payload', payloadData)
      $app.save(rec)
    } catch (err) {
      console.log('[cancel-auth] erro ao salvar payment_event:', err)
    }
  }

  // --- find job (inlined) --------------------------------------------------
  let job = null
  try {
    job = $app.findFirstRecordByData('jobs', 'id', jobId)
  } catch (_) {}
  if (!job) {
    return e.json(404, { ok: false, error: 'Serviço não encontrado.' })
  }

  const status = job.getString('payment_status')
  if (status === 'captured' || status === 'cancelled') {
    return e.json(400, {
      ok: false,
      error: 'Cancelamento não permitido no status atual: ' + status + '.',
    })
  }

  const intentId = job.getString('payment_intent_id')
  const provider = $os.getenv('PAYMENT_PROVIDER') || ''
  let targetPaymentStatus = 'cancelled'

  if (provider === 'stripe' && intentId) {
    const secretKey = $os.getenv('STRIPE_SECRET_KEY') || ''
    if (!secretKey) {
      return e.json(503, { ok: false, error: 'Stripe não configurado.' })
    }
    const res = $http.send({
      url: 'https://api.stripe.com/v1/payment_intents/' + encodeURIComponent(intentId) + '/cancel',
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + secretKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 20,
    })
    if (res.statusCode < 200 || res.statusCode >= 300) {
      logPaymentEvent(jobId, intentId, 'error', 'cancel_failed', {
        provider: 'stripe',
        statusCode: res.statusCode,
        response: res.json,
      })
      return e.json(
        res.statusCode,
        res.json || { ok: false, error: 'Falha no cancelamento Stripe.' },
      )
    }
    logPaymentEvent(jobId, intentId, 'refund', 'cancelled', {
      provider: 'stripe',
    })
  } else if (provider === 'mercadopago' && intentId) {
    const accessToken = $os.getenv('MERCADOPAGO_ACCESS_TOKEN') || ''
    if (!accessToken) {
      return e.json(503, { ok: false, error: 'Mercado Pago não configurado.' })
    }

    // 1. GET /v1/payments/{intentId} para checar se é approved vs pending/authorized
    let getRes = null
    try {
      getRes = $http.send({
        url: 'https://api.mercadopago.com/v1/payments/' + encodeURIComponent(intentId),
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + accessToken,
        },
        timeout: 20,
      })
    } catch (netErr) {
      logPaymentEvent(jobId, intentId, 'error', 'network_error', {
        action: 'cancel_check',
        error: String(netErr),
      })
      return e.json(502, { ok: false, error: 'Erro de rede ao consultar Mercado Pago.' })
    }

    if (!getRes || getRes.statusCode < 200 || getRes.statusCode >= 300) {
      logPaymentEvent(jobId, intentId, 'error', 'get_failed', {
        action: 'cancel_check',
        statusCode: getRes ? getRes.statusCode : 0,
        response: getRes ? getRes.json : null,
      })
      return e.json(
        (getRes && getRes.statusCode) || 502,
        (getRes && getRes.json) || { ok: false, error: 'Falha ao consultar Mercado Pago.' },
      )
    }

    const currentData = getRes.json || {}
    const curStatus = currentData.status || ''

    if (curStatus === 'approved') {
      // Pagamento já APROVADO: estorno via POST /v1/payments/{intentId}/refunds
      const refRes = $http.send({
        url: 'https://api.mercadopago.com/v1/payments/' + encodeURIComponent(intentId) + '/refunds',
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
        timeout: 25,
      })

      if (refRes.statusCode < 200 || refRes.statusCode >= 300) {
        logPaymentEvent(jobId, intentId, 'error', 'refund_failed', {
          provider: 'mercadopago',
          statusCode: refRes.statusCode,
          response: refRes.json,
        })
        return e.json(
          refRes.statusCode,
          refRes.json || { ok: false, error: 'Falha no reembolso Mercado Pago.' },
        )
      }

      targetPaymentStatus = 'refunded'
      logPaymentEvent(jobId, intentId, 'refund', 'refunded', {
        provider: 'mercadopago',
        response: refRes.json,
      })
    } else if (
      curStatus === 'pending' ||
      curStatus === 'authorized' ||
      curStatus === 'in_process'
    ) {
      // Pagamento pendente ou autorizado: cancelar via PUT
      const canRes = $http.send({
        url: 'https://api.mercadopago.com/v1/payments/' + encodeURIComponent(intentId),
        method: 'PUT',
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'cancelled' }),
        timeout: 20,
      })

      if (canRes.statusCode < 200 || canRes.statusCode >= 300) {
        logPaymentEvent(jobId, intentId, 'error', 'cancel_failed', {
          provider: 'mercadopago',
          statusCode: canRes.statusCode,
          response: canRes.json,
        })
        return e.json(
          canRes.statusCode,
          canRes.json || { ok: false, error: 'Falha no cancelamento Mercado Pago.' },
        )
      }

      targetPaymentStatus = 'cancelled'
      logPaymentEvent(jobId, intentId, 'refund', 'cancelled', {
        provider: 'mercadopago',
        response: canRes.json,
      })
    } else {
      // Já cancelado ou reembolsado
      targetPaymentStatus = curStatus === 'refunded' ? 'refunded' : 'cancelled'
      logPaymentEvent(jobId, intentId, 'refund', curStatus, {
        note: 'Pagamento já estava em status terminal: ' + curStatus,
      })
    }
  } else {
    // Demo mode
    targetPaymentStatus = 'cancelled'
    logPaymentEvent(jobId, intentId, 'refund', 'cancelled', {
      provider: 'demo',
    })
  }

  const nowIso = new Date().toISOString()
  job.set('payment_status', targetPaymentStatus)
  // If the service is still pre-clock-in, mark it cancelled too.
  const jobStatus = job.getString('status')
  if (jobStatus === 'accepted' || jobStatus === 'pending') {
    job.set('status', 'cancelled')
  }
  $app.save(job)

  return e.json(200, {
    ok: true,
    demo: provider === '',
    payment_status: targetPaymentStatus,
    cancelled_at: nowIso,
    payment_intent_id: intentId,
  })
})

// ---------------------------------------------------------------------------
// POST /backend/v1/payments/webhook
//   Público (sem requireAuth). O Mercado Pago envia notificações IPN/webhook.
//   Body do MP: { type: 'payment', action: '...', data: { id: '...' } }
//   Busca sempre o pagamento na API do Mercado Pago usando MERCADOPAGO_ACCESS_TOKEN.
// ---------------------------------------------------------------------------
routerAdd('POST', '/backend/v1/payments/webhook', (e) => {
  // Helper inline para registrar auditoria em payment_events
  const logPaymentEvent = function (jId, pIntentId, evType, provStatus, payloadData) {
    try {
      const pCol = $app.findCollectionByNameOrId('payment_events')
      const rec = new Record(pCol)
      if (jId) rec.set('job_id', jId)
      if (pIntentId) rec.set('payment_intent_id', pIntentId)
      rec.set('type', evType)
      if (provStatus) rec.set('provider_status', provStatus)
      if (payloadData) rec.set('payload', payloadData)
      $app.save(rec)
    } catch (err) {
      console.log('[webhook] erro ao salvar payment_event:', err)
    }
  }

  try {
    const body = e.requestInfo().body || {}
    const query = e.requestInfo().query || {}

    // Extrair ID do pagamento (pode vir no body { data: { id } } ou { id } ou na query ?data.id=... / ?id=...)
    let mpPaymentId = ''
    if (body.data && body.data.id) {
      mpPaymentId = String(body.data.id)
    } else if (body.id) {
      mpPaymentId = String(body.id)
    } else if (query['data.id']) {
      mpPaymentId = String(query['data.id'])
    } else if (query.id) {
      mpPaymentId = String(query.id)
    }

    const eventType = body.type || body.action || query.topic || 'payment'

    // Se não for evento de pagamento ou não tiver ID, responder 200 rápido
    if (!mpPaymentId) {
      return e.json(200, { ok: true, ignored: true, reason: 'Nenhum ID de pagamento informado' })
    }

    const accessToken = $os.getenv('MERCADOPAGO_ACCESS_TOKEN') || ''
    if (!accessToken) {
      console.log('[webhook] MERCADOPAGO_ACCESS_TOKEN não configurado — ignorando webhook')
      return e.json(200, { ok: true, ignored: true, reason: 'Mercado Pago não configurado' })
    }

    // Consultar dados oficiais na API do Mercado Pago (nunca confiar no corpo recebido)
    let mpRes = null
    try {
      mpRes = $http.send({
        url: 'https://api.mercadopago.com/v1/payments/' + encodeURIComponent(mpPaymentId),
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + accessToken,
        },
        timeout: 15,
      })
    } catch (netErr) {
      console.log('[webhook] erro de rede ao buscar pagamento MP:', mpPaymentId, netErr)
      logPaymentEvent('', mpPaymentId, 'error', 'network_error', {
        action: 'webhook_fetch',
        error: String(netErr),
      })
      return e.json(200, { ok: true, handled: false, error: 'Network error' })
    }

    if (!mpRes || mpRes.statusCode < 200 || mpRes.statusCode >= 300) {
      console.log(
        '[webhook] falha ao buscar pagamento no MP:',
        mpPaymentId,
        mpRes ? mpRes.statusCode : 0,
      )
      logPaymentEvent('', mpPaymentId, 'error', 'fetch_failed', {
        action: 'webhook_fetch',
        statusCode: mpRes ? mpRes.statusCode : 0,
        response: mpRes ? mpRes.json : null,
      })
      return e.json(200, { ok: true, handled: false, error: 'MP payment not found' })
    }

    const paymentData = mpRes.json || {}
    const mpStatus = paymentData.status || ''
    const externalRef = (paymentData.external_reference || '').toString().trim()
    const metadataJobId =
      paymentData.metadata && paymentData.metadata.job_id
        ? String(paymentData.metadata.job_id).trim()
        : ''

    // Localizar o job: por external_reference, metadata.job_id ou por payment_intent_id
    let job = null
    const targetJobId = externalRef || metadataJobId
    if (targetJobId) {
      try {
        job = $app.findFirstRecordByData('jobs', 'id', targetJobId)
      } catch (_) {}
    }
    if (!job) {
      try {
        job = $app.findFirstRecordByData('jobs', 'payment_intent_id', mpPaymentId)
      } catch (_) {}
    }

    const resolvedJobId = job ? job.getString('id') : ''

    // Registrar evento de webhook auditado
    logPaymentEvent(resolvedJobId, mpPaymentId, 'webhook', mpStatus, {
      event_type: eventType,
      status_detail: paymentData.status_detail,
      amount: paymentData.transaction_amount,
      payment_method_id: paymentData.payment_method_id,
      installments: paymentData.installments,
      external_reference: externalRef,
    })

    // Reconciliar job se encontrado
    if (job) {
      const curJobPaymentStatus = job.getString('payment_status')
      const curJobStatus = job.getString('status')
      let jobChanged = false

      if (!job.getString('payment_intent_id')) {
        job.set('payment_intent_id', mpPaymentId)
        jobChanged = true
      }
      if (!job.getString('payment_method') && paymentData.payment_method_id) {
        job.set('payment_method', String(paymentData.payment_method_id))
        jobChanged = true
      }
      if (!job.getInt('payment_installments') && paymentData.installments) {
        job.set('payment_installments', parseInt(paymentData.installments, 10))
        jobChanged = true
      }

      if (mpStatus === 'approved') {
        // approved + job held/authorized -> nada a forçar (fluxo normal segue)
        // se estava pendente e não held, pode ser atualizado para held
        if (curJobPaymentStatus === 'pending' || !curJobPaymentStatus) {
          job.set('payment_status', 'held')
          if (!job.getString('payment_authorized_at')) {
            job.set('payment_authorized_at', new Date().toISOString())
          }
          jobChanged = true
        }
      } else if (mpStatus === 'rejected' || mpStatus === 'cancelled') {
        // rejected/cancelled -> payment_status = 'cancelled' e job.status = 'cancelled' se ainda pendente
        if (curJobPaymentStatus !== 'captured' && curJobPaymentStatus !== 'released') {
          job.set('payment_status', 'cancelled')
          jobChanged = true
        }
        if (curJobStatus === 'pending') {
          job.set('status', 'cancelled')
          job.set('cancellation_reason', 'Pagamento recusado pela operadora')
          job.set('cancelled_at', new Date().toISOString())
          jobChanged = true
        }
      } else if (mpStatus === 'refunded') {
        if (curJobPaymentStatus !== 'refunded') {
          job.set('payment_status', 'refunded')
          jobChanged = true
        }
      }

      if (jobChanged) {
        try {
          $app.save(job)
          console.log(
            '[webhook] job reconciliado com sucesso:',
            resolvedJobId,
            'novo payment_status:',
            job.getString('payment_status'),
          )
        } catch (saveErr) {
          console.log('[webhook] erro ao salvar job:', resolvedJobId, saveErr)
        }
      }
    } else {
      console.log(
        '[webhook] job não encontrado para pagamento MP:',
        mpPaymentId,
        'ref:',
        externalRef,
      )
    }

    return e.json(200, { ok: true, reconciled: !!job })
  } catch (err) {
    console.log('[webhook] erro interno não tratado:', err)
    return e.json(200, { ok: true, handled: false, error: 'Internal handled error' })
  }
})
