// Cron job: auto-cancel expired pre-authorizations.
//
// When a professional accepts a service, the client's card is pre-authorized
// (payment_status = 'authorized'). The pro must clock in within a configurable
// deadline (settings.clock_in_deadline_hours, default 24h). If the deadline
// passes without a clock-in, the pre-authorization is cancelled automatically
// and the job is marked cancelled.
//
// Runs every 15 minutes: */15 * * * *
//
// Works in demo mode (no live gateway keys): in that case it only updates the
// payment_/status fields on the job record, exactly like the cancel-auth endpoint.
//
// NOTE (hooks run in a separate VM): all logic is inlined inside the cronAdd
// callback — top-level helpers/variables are NOT accessible at runtime.

cronAdd('cancel_expired_auths', '*/15 * * * *', () => {
  // --- read the clock-in deadline from the single settings row -------------
  let clockInHours = 24
  try {
    const rows = $app.findRecordsByFilter('settings', '1=1', '', 1, 0)
    if (rows.length > 0) {
      const ch = rows[0].getFloat('clock_in_deadline_hours')
      if (ch > 0) clockInHours = ch
    }
  } catch (_) {}

  // --- find authorized jobs whose clock-in deadline has passed -------------
  // payment_status = 'authorized' && clocked_in_at empty && accepted_at present
  // && accepted_at <= (now - deadline)
  const cutoff = new Date(Date.now() - clockInHours * 3600 * 1000).toISOString()
  const filter =
    "payment_status = 'authorized' && clocked_in_at = '' && accepted_at != '' && accepted_at <= '" +
    cutoff +
    "'"

  let jobs = []
  try {
    jobs = $app.findRecordsByFilter('jobs', filter, '-accepted_at', 100, 0)
  } catch (err) {
    console.log('[cron_cancel_expired_auths] erro ao buscar jobs:', err)
    return
  }

  if (jobs.length === 0) {
    return
  }

  const provider = $os.getenv('PAYMENT_PROVIDER') || ''
  const nowIso = new Date().toISOString()
  let cancelled = 0
  let failed = 0

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]
    const jobId = job.getString('id')
    const intentId = job.getString('payment_intent_id')

    // --- cancel the pre-authorization at the gateway (when configured) -----
    let gatewayOk = true

    if (provider === 'stripe' && intentId) {
      const secretKey = $os.getenv('STRIPE_SECRET_KEY') || ''
      if (!secretKey) {
        console.log('[cron_cancel_expired_auths] STRIPE_SECRET_KEY ausente — pulando job', jobId)
        failed++
        continue
      }
      try {
        const res = $http.send({
          url:
            'https://api.stripe.com/v1/payment_intents/' + encodeURIComponent(intentId) + '/cancel',
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + secretKey,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 20,
        })
        if (res.statusCode < 200 || res.statusCode >= 300) {
          console.log('[cron_cancel_expired_auths] falha Stripe no job', jobId, res.statusCode)
          gatewayOk = false
        }
      } catch (err) {
        console.log('[cron_cancel_expired_auths] exceção Stripe no job', jobId, err)
        gatewayOk = false
      }
    } else if (provider === 'mercadopago' && intentId) {
      const accessToken = $os.getenv('MERCADOPAGO_ACCESS_TOKEN') || ''
      if (!accessToken) {
        console.log(
          '[cron_cancel_expired_auths] MERCADOPAGO_ACCESS_TOKEN ausente — pulando job',
          jobId,
        )
        failed++
        continue
      }
      try {
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
          console.log(
            '[cron_cancel_expired_auths] falha Mercado Pago no job',
            jobId,
            res.statusCode,
          )
          gatewayOk = false
        }
      } catch (err) {
        console.log('[cron_cancel_expired_auths] exceção Mercado Pago no job', jobId, err)
        gatewayOk = false
      }
    }

    if (!gatewayOk) {
      failed++
      continue
    }

    // --- persist cancelled state on the job --------------------------------
    try {
      job.set('payment_status', 'cancelled')
      // If the service is still pre-clock-in, mark it cancelled too.
      const jobStatus = job.getString('status')
      if (jobStatus === 'accepted' || jobStatus === 'pending') {
        job.set('status', 'cancelled')
      }
      $app.save(job)
      cancelled++
      console.log(
        '[cron_cancel_expired_auths] pré-autorização cancelada — job',
        jobId,
        'intent',
        intentId || '(demo)',
        'provider',
        provider || 'demo',
      )
    } catch (err) {
      console.log('[cron_cancel_expired_auths] erro ao salvar job', jobId, err)
      failed++
    }
  }

  console.log(
    '[cron_cancel_expired_auths] ciclo concluído — cancelados:',
    cancelled,
    'falhas:',
    failed,
    'provider:',
    provider || 'demo',
  )
})
