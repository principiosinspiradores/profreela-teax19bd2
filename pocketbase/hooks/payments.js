// Server-side payment intent / split helper.
//
// Public keys for Stripe / Mercado Pago are exposed (read-only) to the client
// so it can bootstrap the gateway SDK; the SECRET keys live only in the
// environment and are used here to create the charge with a platform fee split.
//
// GET  /backend/v1/payments/config   -> { provider, publicKey } (or null)
// POST /backend/v1/payments/create-split
//   body: { amount, currency, proAccountId, description }
//   -> creates a payment intent with application_fee_amount = platform fee
//      computed from the `settings` collection.
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

  if (!amount || amount <= 0) {
    return e.json(400, { ok: false, error: 'Valor inválido.' })
  }
  if (!proAccountId) {
    return e.json(400, { ok: false, error: 'Conta do profissional é obrigatória.' })
  }

  // Read the platform service fee (%) from settings.
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

  // Compute platform fee in the smallest currency unit (cents).
  let feeAmount = Math.round(amount * (feePercent / 100))
  const minFeeCents = Math.round(minFee * 100)
  if (feeAmount < minFeeCents) feeAmount = minFeeCents

  const provider = $os.getenv('PAYMENT_PROVIDER') || ''

  if (provider === 'stripe') {
    const secretKey = $os.getenv('STRIPE_SECRET_KEY') || ''
    if (!secretKey) {
      return e.json(503, { ok: false, error: 'Stripe não configurado.' })
    }
    const res = $http.send({
      url: 'https://api.stripe.com/v1/payment_intents',
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + secretKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body:
        'amount=' +
        Math.round(amount * 100) +
        '&currency=' +
        currency +
        '&description=' +
        encodeURIComponent(description) +
        '&application_fee_amount=' +
        feeAmount +
        '&transfer_data[destination]=' +
        encodeURIComponent(proAccountId),
      timeout: 20,
    })
    return e.json(res.statusCode, res.json || {})
  }

  if (provider === 'mercadopago') {
    const accessToken = $os.getenv('MERCADOPAGO_ACCESS_TOKEN') || ''
    if (!accessToken) {
      return e.json(503, { ok: false, error: 'Mercado Pago não configurado.' })
    }
    const payload = {
      transaction_amount: amount,
      description: description,
      application_fee: feeAmount / 100,
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
    return e.json(res.statusCode, res.json || {})
  }

  // No live gateway configured — return the computed split so the frontend
  // checkout flow can be exercised in demo mode.
  return e.json(200, {
    ok: true,
    demo: true,
    split: {
      total: amount,
      currency: currency,
      platform_fee: feeAmount / 100,
      pro_amount: (amount * 100 - feeAmount) / 100,
      fee_percent: feePercent,
      min_fee: minFee,
    },
  })
})
