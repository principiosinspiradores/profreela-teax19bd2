// Cron job: release escrow payments 24h after service completion.
//
// In the "pay at request" model, the client pays when requesting the service
// (payment_status = 'held' from creation, money held in escrow by the
// platform). When the professional finishes the job, `finish_job` stamps
// `completed_at` and `payment_hold_until = completed_at + guarantee_period_days`
// (1 day = 24h). Once that window elapses without a dispute, the held payment
// is released to the professional: payment_status moves 'held' -> 'released'
// and payment_released_at is stamped.
//
// Runs every 15 minutes: */15 * * * *
//
// Works in demo mode (no live gateway keys): only updates the payment_* fields
// on the job record, exactly like the capture-split endpoint.
//
// NOTE (hooks run in a separate VM): all logic is inlined inside the cronAdd
// callback — top-level helpers/variables are NOT accessible at runtime.

cronAdd('release_held_payments', '*/15 * * * *', () => {
  // Find held jobs whose guarantee window has elapsed. payment_hold_until is
  // set by finish_job (or by the release-payment endpoint). Jobs that are
  // 'held' but have no payment_hold_until yet (e.g. just created, not yet
  // completed) are skipped — the window only starts at completion.
  const nowIso = new Date().toISOString()
  const filter =
    "payment_status = 'held' && payment_hold_until != '' && payment_hold_until <= '" + nowIso + "'"

  let jobs = []
  try {
    jobs = $app.findRecordsByFilter('jobs', filter, '-payment_hold_until', 100, 0)
  } catch (err) {
    console.log('[release_held_payments] erro ao buscar jobs:', err)
    return
  }

  if (jobs.length === 0) {
    return
  }

  const provider = $os.getenv('PAYMENT_PROVIDER') || ''
  let released = 0
  let failed = 0

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]
    const jobId = job.getString('id')
    const intentId = job.getString('payment_intent_id')

    // --- capture + release the held payment at the gateway (when configured) -
    // For Stripe, capturing the pre-authorization finalizes the charge; the
    // platform-fee split was set at intent creation. For Mercado Pago, the
    // payment was created with capture:false, so we capture it now. In demo
    // mode (no provider keys), we just update the local payment_* fields.
    let gatewayOk = true

    if (provider === 'stripe' && intentId) {
      const secretKey = $os.getenv('STRIPE_SECRET_KEY') || ''
      if (!secretKey) {
        console.log('[release_held_payments] STRIPE_SECRET_KEY ausente — pulando job', jobId)
        failed++
        continue
      }
      const amount = job.getFloat('price')
      try {
        const res = $http.send({
          url:
            'https://api.stripe.com/v1/payment_intents/' +
            encodeURIComponent(intentId) +
            '/capture',
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + secretKey,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'amount_to_capture=' + Math.round(amount * 100),
          timeout: 20,
        })
        if (res.statusCode < 200 || res.statusCode >= 300) {
          console.log('[release_held_payments] falha Stripe no job', jobId, res.statusCode)
          gatewayOk = false
        }
      } catch (err) {
        console.log('[release_held_payments] exceção Stripe no job', jobId, err)
        gatewayOk = false
      }
    } else if (provider === 'mercadopago' && intentId) {
      const accessToken = $os.getenv('MERCADOPAGO_ACCESS_TOKEN') || ''
      if (!accessToken) {
        console.log('[release_held_payments] MERCADOPAGO_ACCESS_TOKEN ausente — pulando job', jobId)
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
          body: JSON.stringify({ capture: true }),
          timeout: 20,
        })
        if (res.statusCode < 200 || res.statusCode >= 300) {
          console.log('[release_held_payments] falha Mercado Pago no job', jobId, res.statusCode)
          gatewayOk = false
        }
      } catch (err) {
        console.log('[release_held_payments] exceção Mercado Pago no job', jobId, err)
        gatewayOk = false
      }
    }

    if (!gatewayOk) {
      failed++
      continue
    }

    // --- persist released state on the job --------------------------------
    try {
      job.set('payment_status', 'released')
      job.set('payment_released_at', nowIso)
      $app.save(job)
      released++
      console.log(
        '[release_held_payments] pagamento liberado — job',
        jobId,
        'intent',
        intentId || '(demo)',
        'provider',
        provider || 'demo',
      )

      // Notify the professional that the payment was released.
      const proId = job.getString('pro_id')
      if (proId) {
        try {
          const notifCol = $app.findCollectionByNameOrId('notifications')
          const notif = new Record(notifCol)
          notif.set('user_id', proId)
          notif.set('type', 'payment')
          notif.set('title', 'Pagamento liberado')
          notif.set(
            'message',
            'O pagamento de R$ ' +
              job.getFloat('price').toFixed(2).replace('.', ',') +
              ' foi liberado e está disponível para saque.',
          )
          notif.set('job_id', jobId)
          notif.set('read_status', false)
          $app.save(notif)
        } catch (err) {
          console.log('[release_held_payments] falha ao notificar pro', proId, err)
        }
      }
    } catch (err) {
      console.log('[release_held_payments] erro ao salvar job', jobId, err)
      failed++
    }
  }

  console.log(
    '[release_held_payments] ciclo concluído — liberados:',
    released,
    'falhas:',
    failed,
    'provider:',
    provider || 'demo',
  )
})
