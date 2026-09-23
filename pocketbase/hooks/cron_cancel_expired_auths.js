// Cron job: auto-cancel expired pre-authorizations / refund expired payments.
//
// When a professional accepts a service, the client's card is pre-authorized
// (payment_status = 'authorized'). The pro must clock in within a configurable
// deadline (settings.clock_in_deadline_hours, default 24h). If the deadline
// passes without a clock-in, the pre-authorization is cancelled / refunded
// automatically and the job is marked cancelled.
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
      console.log('[cron_cancel_expired_auths] erro ao salvar payment_event:', err)
    }
  }

  const provider = $os.getenv('PAYMENT_PROVIDER') || ''
  const nowIso = new Date().toISOString()
  let cancelled = 0
  let failed = 0

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]
    const jobId = job.getString('id')
    const intentId = job.getString('payment_intent_id')

    let gatewayOk = true
    let targetPaymentStatus = 'cancelled'

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
          logPaymentEvent(jobId, intentId, 'error', 'stripe_cancel_failed', {
            statusCode: res.statusCode,
            response: res.json,
          })
        } else {
          logPaymentEvent(jobId, intentId, 'refund', 'cancelled', {
            provider: 'stripe',
            source: 'cron_cancel_expired_auths',
          })
        }
      } catch (err) {
        console.log('[cron_cancel_expired_auths] exceção Stripe no job', jobId, err)
        gatewayOk = false
        logPaymentEvent(jobId, intentId, 'error', 'stripe_exception', {
          error: String(err),
        })
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

      // CORREÇÃO: GET /v1/payments/{intentId} primeiro.
      // Se 'pending'/'authorized' -> PUT {status:'cancelled'}
      // Se 'approved' -> POST /v1/payments/{intentId}/refunds (reembolso total) e payment_status='refunded'
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
        console.log('[cron_cancel_expired_auths] erro de rede Mercado Pago no job', jobId, netErr)
        gatewayOk = false
        logPaymentEvent(jobId, intentId, 'error', 'network_error', {
          source: 'cron_cancel_expired_auths',
          error: String(netErr),
        })
      }

      if (getRes) {
        if (getRes.statusCode < 200 || getRes.statusCode >= 300) {
          console.log(
            '[cron_cancel_expired_auths] falha ao buscar status MP no job',
            jobId,
            getRes.statusCode,
          )
          gatewayOk = false
          logPaymentEvent(jobId, intentId, 'error', 'get_failed', {
            source: 'cron_cancel_expired_auths',
            statusCode: getRes.statusCode,
            response: getRes.json,
          })
        } else {
          const mpData = getRes.json || {}
          const curMpStatus = mpData.status || ''

          if (curMpStatus === 'approved') {
            // Pagamento já aprovado: fazer POST /refunds
            try {
              const refRes = $http.send({
                url:
                  'https://api.mercadopago.com/v1/payments/' +
                  encodeURIComponent(intentId) +
                  '/refunds',
                method: 'POST',
                headers: {
                  Authorization: 'Bearer ' + accessToken,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({}),
                timeout: 25,
              })
              if (refRes.statusCode < 200 || refRes.statusCode >= 300) {
                console.log(
                  '[cron_cancel_expired_auths] falha no reembolso MP no job',
                  jobId,
                  refRes.statusCode,
                )
                gatewayOk = false
                logPaymentEvent(jobId, intentId, 'error', 'refund_failed', {
                  source: 'cron_cancel_expired_auths',
                  statusCode: refRes.statusCode,
                  response: refRes.json,
                })
              } else {
                targetPaymentStatus = 'refunded'
                logPaymentEvent(jobId, intentId, 'refund', 'refunded', {
                  source: 'cron_cancel_expired_auths',
                  provider: 'mercadopago',
                  response: refRes.json,
                })
              }
            } catch (err) {
              console.log('[cron_cancel_expired_auths] exceção reembolso MP no job', jobId, err)
              gatewayOk = false
              logPaymentEvent(jobId, intentId, 'error', 'refund_exception', {
                source: 'cron_cancel_expired_auths',
                error: String(err),
              })
            }
          } else if (
            curMpStatus === 'pending' ||
            curMpStatus === 'authorized' ||
            curMpStatus === 'in_process'
          ) {
            // Pendente ou autorizado: cancelar via PUT
            try {
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
                console.log(
                  '[cron_cancel_expired_auths] falha no cancelamento PUT MP no job',
                  jobId,
                  canRes.statusCode,
                )
                gatewayOk = false
                logPaymentEvent(jobId, intentId, 'error', 'cancel_failed', {
                  source: 'cron_cancel_expired_auths',
                  statusCode: canRes.statusCode,
                  response: canRes.json,
                })
              } else {
                targetPaymentStatus = 'cancelled'
                logPaymentEvent(jobId, intentId, 'refund', 'cancelled', {
                  source: 'cron_cancel_expired_auths',
                  provider: 'mercadopago',
                  response: canRes.json,
                })
              }
            } catch (err) {
              console.log(
                '[cron_cancel_expired_auths] exceção cancelamento PUT MP no job',
                jobId,
                err,
              )
              gatewayOk = false
              logPaymentEvent(jobId, intentId, 'error', 'cancel_exception', {
                source: 'cron_cancel_expired_auths',
                error: String(err),
              })
            }
          } else {
            // Já cancelado/reembolsado
            targetPaymentStatus = curMpStatus === 'refunded' ? 'refunded' : 'cancelled'
            logPaymentEvent(jobId, intentId, 'refund', curMpStatus, {
              source: 'cron_cancel_expired_auths',
              note: 'Pagamento já em status terminal: ' + curMpStatus,
            })
          }
        }
      }
    }

    if (!gatewayOk) {
      failed++
      continue
    }

    // --- persist cancelled state on the job --------------------------------
    try {
      job.set('payment_status', targetPaymentStatus)
      // If the service is still pre-clock-in, mark it cancelled too.
      const jobStatus = job.getString('status')
      if (jobStatus === 'accepted' || jobStatus === 'pending') {
        job.set('status', 'cancelled')
      }
      $app.save(job)
      cancelled++
      console.log(
        '[cron_cancel_expired_auths] pré-autorização cancelada/reembolsada — job',
        jobId,
        'intent',
        intentId || '(demo)',
        'targetStatus',
        targetPaymentStatus,
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
