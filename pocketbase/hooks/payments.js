// Server-side payment intent / split helper for the "pay at request" escrow
// flow (Airbnb / GetNinjas style).
//
// The client pays BEFORE the job is created: the amount is captured up-front
// and held in escrow by the platform. When a professional later accepts and
// completes the job, a 24h guarantee window runs from `completed_at`, after
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
//
// All endpoints work in "demo" mode (no live gateway keys): they persist the
// payment_* fields on the job record and return consistent mock payloads.
//
// NOTE (hooks run in a separate VM): all helper logic (settings lookup, fee
// computation, job lookup) is inlined inside each callback — top-level
// functions are NOT accessible at runtime.

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
//   body: { amount, currency, proAccountId, description, jobId }
//   -> captures + holds the amount in escrow. Stores payment_intent_id +
//      payment_status=held + payment_authorized_at on the job (when a jobId
//      is provided). `proAccountId` is optional in the pay-at-request flow:
//      the client pays before a professional has accepted, so the split
//      destination may not be known yet.
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

  if (!amount || amount <= 0) {
    return e.json(400, { ok: false, error: 'Valor inválido.' })
  }
  // proAccountId is optional: in the pay-at-request flow the client pays
  // before any pro has accepted, so the split destination is not known yet.
  // The split is finalized when the payment is released (capture-split).

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
  let intentId = ''
  let providerResponse = null

  if (provider === 'stripe') {
    const secretKey = $os.getenv('STRIPE_SECRET_KEY') || ''
    if (!secretKey) {
      return e.json(503, { ok: false, error: 'Stripe não configurado.' })
    }
    // Pay-at-request: capture immediately (capture_method=automatic) so the
    // funds are held in escrow by the platform. The platform-fee split
    // (application_fee_amount) + transfer destination are set now when a
    // pro is known; otherwise the split is applied at release time.
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
    } else {
      return e.json(res.statusCode, providerResponse || { ok: false, error: 'Falha no Stripe.' })
    }
  } else if (provider === 'mercadopago') {
    const accessToken = $os.getenv('MERCADOPAGO_ACCESS_TOKEN') || ''
    if (!accessToken) {
      return e.json(503, { ok: false, error: 'Mercado Pago não configurado.' })
    }
    // Pay-at-request: capture=true so the payment is captured immediately and
    // held in the platform's escrow balance. When a marketplace/seller account
    // id is provided via proAccountId, the split is applied now; otherwise it
    // is applied at release time.
    const payload = {
      transaction_amount: amount,
      description: description,
      application_fee: feeAmountCents / 100,
      capture: true,
      payer: { entity_type: 'individual' },
    }
    const res = $http.send({
      url: 'https://api.mercadopago.com/v1/payments',
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      timeout: 20,
    })
    providerResponse = res.json || {}
    if (res.statusCode >= 200 && res.statusCode < 300 && providerResponse.id) {
      intentId = String(providerResponse.id)
    } else {
      return e.json(
        res.statusCode,
        providerResponse || { ok: false, error: 'Falha no Mercado Pago.' },
      )
    }
  } else {
    // Demo mode: synthesize a realistic intent id.
    intentId = 'pi_demo_' + $security.randomString(16)
  }

  // Persist the held (escrow) state on the job (if a jobId was provided).
  // payment_status = 'held' means "captured by the platform, held in escrow";
  // the 24h release window starts when the job is completed (finish_job).
  if (jobId) {
    let job = null
    try {
      job = $app.findFirstRecordByData('jobs', 'id', jobId)
    } catch (_) {}
    if (job) {
      job.set('payment_status', 'held')
      job.set('payment_intent_id', intentId)
      job.set('payment_authorized_at', nowIso)
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
//   body: { jobId }
//   -> captures (if still pre-authorized) and finalizes the platform-fee split
//      for a held payment. Only callable after the guarantee window has
//      elapsed (or by admin override). Sets payment_status=captured +
//      payment_released_at. In the pay-at-request flow the payment is already
//      captured at creation time, so this mainly finalizes the split to the pro.
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
      return e.json(res.statusCode, res.json || { ok: false, error: 'Falha na captura Stripe.' })
    }
  } else if (provider === 'mercadopago') {
    const accessToken = $os.getenv('MERCADOPAGO_ACCESS_TOKEN') || ''
    if (!accessToken) {
      return e.json(503, { ok: false, error: 'Mercado Pago não configurado.' })
    }
    const res = $http.send({
      url: 'https://api.mercadopago.com/v1/payments/' + encodeURIComponent(intentId),
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ capture: true }),
      timeout: 20,
    })
    if (res.statusCode < 200 || res.statusCode >= 300) {
      return e.json(
        res.statusCode,
        res.json || { ok: false, error: 'Falha na captura Mercado Pago.' },
      )
    }
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
//   -> starts the 7-day guarantee window. Called when the service is
//      completed (clock-out + client confirmation). Sets payment_status=held
//      and payment_hold_until = now + guarantee_period_days.
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
//   -> pauses the guarantee window. Sets payment_status=disputed +
//      payment_disputed_at. The hold timer is frozen (not extended).
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
//   -> cancels the pre-authorization (auto-refund). Used when the pro does
//      not clock in within the deadline. Sets payment_status=cancelled and
//      (when applicable) the job status to cancelled.
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
      return e.json(
        res.statusCode,
        res.json || { ok: false, error: 'Falha no cancelamento Stripe.' },
      )
    }
  } else if (provider === 'mercadopago' && intentId) {
    const accessToken = $os.getenv('MERCADOPAGO_ACCESS_TOKEN') || ''
    if (!accessToken) {
      return e.json(503, { ok: false, error: 'Mercado Pago não configurado.' })
    }
    const res = $http.send({
      url: 'https://api.mercadopago.com/v1/payments/' + encodeURIComponent(intentId),
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'cancelled' }),
      timeout: 20,
    })
    if (res.statusCode < 200 || res.statusCode >= 300) {
      return e.json(
        res.statusCode,
        res.json || { ok: false, error: 'Falha no cancelamento Mercado Pago.' },
      )
    }
  }

  const nowIso = new Date().toISOString()
  job.set('payment_status', 'cancelled')
  // If the service is still pre-clock-in, mark it cancelled too.
  const jobStatus = job.getString('status')
  if (jobStatus === 'accepted' || jobStatus === 'pending') {
    job.set('status', 'cancelled')
  }
  $app.save(job)

  return e.json(200, {
    ok: true,
    demo: provider === '',
    payment_status: 'cancelled',
    cancelled_at: nowIso,
    payment_intent_id: intentId,
  })
})
