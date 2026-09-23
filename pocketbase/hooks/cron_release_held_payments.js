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
      console.log('[release_held_payments] erro ao salvar payment_event:', err)
    }
  }

  const provider = $os.getenv('PAYMENT_PROVIDER') || ''
  let released = 0
  let failed = 0

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]
    const jobId = job.getString('id')
    const intentId = job.getString('payment_intent_id')

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
          logPaymentEvent(jobId, intentId, 'error', 'stripe_capture_failed', {
            statusCode: res.statusCode,
            response: res.json,
          })
        } else {
          logPaymentEvent(jobId, intentId, 'capture', 'succeeded', {
            provider: 'stripe',
            source: 'cron_release_held_payments',
          })
        }
      } catch (err) {
        console.log('[release_held_payments] exceção Stripe no job', jobId, err)
        gatewayOk = false
        logPaymentEvent(jobId, intentId, 'error', 'stripe_exception', {
          error: String(err),
        })
      }
    } else if (provider === 'mercadopago' && intentId) {
      const accessToken = $os.getenv('MERCADOPAGO_ACCESS_TOKEN') || ''
      if (!accessToken) {
        console.log('[release_held_payments] MERCADOPAGO_ACCESS_TOKEN ausente — pulando job', jobId)
        failed++
        continue
      }

      // CORREÇÃO: Antes de capturar, fazer GET /v1/payments/{intentId}
      // Se status='approved' -> já capturado: pular a chamada de captura e seguir o fluxo normal
      // Se status='authorized' -> fazer o PUT {capture:true}
      // Se erro de rede/5xx -> retornar erro e NÃO alterar status do job (tenta no próximo ciclo)
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
        console.log('[release_held_payments] erro de rede Mercado Pago no job', jobId, netErr)
        logPaymentEvent(jobId, intentId, 'error', 'network_error', {
          source: 'cron_release_held_payments',
          error: String(netErr),
        })
        failed++
        continue
      }

      if (!getRes || getRes.statusCode < 200 || getRes.statusCode >= 300) {
        console.log(
          '[release_held_payments] falha ao consultar status MP no job',
          jobId,
          getRes ? getRes.statusCode : 0,
        )
        logPaymentEvent(jobId, intentId, 'error', 'get_failed', {
          source: 'cron_release_held_payments',
          statusCode: getRes ? getRes.statusCode : 0,
          response: getRes ? getRes.json : null,
        })
        failed++
        continue
      }

      const mpData = getRes.json || {}
      const curMpStatus = mpData.status || ''

      if (curMpStatus === 'approved') {
        // Já capturado na criação (capture: true) - pular chamada PUT e seguir liberação
        logPaymentEvent(jobId, intentId, 'capture', 'approved', {
          source: 'cron_release_held_payments',
          note: 'Pagamento já approved/capturado no MP. Chamada PUT de captura ignorada com sucesso.',
        })
      } else if (curMpStatus === 'authorized') {
        // Fazer captura
        try {
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
            console.log(
              '[release_held_payments] falha na captura PUT Mercado Pago no job',
              jobId,
              putRes.statusCode,
            )
            logPaymentEvent(jobId, intentId, 'error', 'put_capture_failed', {
              source: 'cron_release_held_payments',
              statusCode: putRes.statusCode,
              response: putRes.json,
            })
            gatewayOk = false
          } else {
            logPaymentEvent(jobId, intentId, 'capture', 'approved', {
              source: 'cron_release_held_payments',
              action: 'captured_from_authorized',
            })
          }
        } catch (err) {
          console.log('[release_held_payments] exceção captura PUT Mercado Pago no job', jobId, err)
          gatewayOk = false
          logPaymentEvent(jobId, intentId, 'error', 'put_exception', {
            source: 'cron_release_held_payments',
            error: String(err),
          })
        }
      } else {
        console.log(
          '[release_held_payments] status inesperado no MP para liberação:',
          jobId,
          curMpStatus,
        )
        logPaymentEvent(jobId, intentId, 'error', curMpStatus, {
          source: 'cron_release_held_payments',
          note: 'Status inesperado no MP antes da liberação',
          response: mpData,
        })
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

        // --- debit outstanding penalty_balance from this payout ------------
        let penaltyDebitApplied = 0
        try {
          const proRec = $app.findFirstRecordByData('users', 'id', proId)
          const debt = proRec.getFloat('penalty_balance') || 0
          const payout = job.getFloat('price') || 0
          if (debt > 0 && payout > 0) {
            const roundedDebit = Math.round(Math.min(debt, payout) * 100) / 100
            penaltyDebitApplied = roundedDebit
            const newBalance = Math.max(0, Math.round((debt - roundedDebit) * 100) / 100)
            proRec.set('penalty_balance', newBalance)
            $app.save(proRec)
            // Record the debit transaction as a notification.
            try {
              const dNotifCol = $app.findCollectionByNameOrId('notifications')
              const dNotif = new Record(dNotifCol)
              dNotif.set('user_id', proId)
              dNotif.set('type', 'payment')
              dNotif.set('title', 'Débito de penalidade aplicado')
              dNotif.set(
                'message',
                'R$ ' +
                  roundedDebit.toFixed(2).replace('.', ',') +
                  ' foram descontados deste recebimento para abater seu saldo devedor por atraso. Saldo restante: R$ ' +
                  newBalance.toFixed(2).replace('.', ',') +
                  '.',
              )
              dNotif.set('job_id', jobId)
              dNotif.set('read_status', false)
              $app.save(dNotif)
            } catch (_) {}
            console.log(
              '[release_held_payments] débito de penalidade — pro',
              proId,
              'debitado',
              roundedDebit,
              'saldo restante',
              newBalance,
            )
          }
        } catch (err) {
          console.log('[release_held_payments] falha ao debitar penalty do pro', proId, err)
        }

        // --- create payout record (idempotent) -----------------------------
        try {
          let existingPayout = null
          try {
            existingPayout = $app.findFirstRecordByData('payouts', 'job_id', jobId)
          } catch (_) {}

          if (!existingPayout) {
            let feePercent = 15
            try {
              const sRows = $app.findRecordsByFilter('settings', '1=1', '', 1, 0)
              if (sRows.length > 0) {
                const fp = sRows[0].getFloat('service_fee_percent')
                if (fp > 0) feePercent = fp
              }
            } catch (_) {}

            const clientPrice = job.getFloat('client_price')
            const price = job.getFloat('price')
            const gross = clientPrice > 0 ? clientPrice : price > 0 ? price : 0
            const platformFee = Math.round(gross * (feePercent / 100) * 100) / 100
            const amountNet = Math.max(
              0,
              Math.round((gross - platformFee - penaltyDebitApplied) * 100) / 100,
            )

            const payoutsCol = $app.findCollectionByNameOrId('payouts')
            const payoutRec = new Record(payoutsCol)
            payoutRec.set('pro_id', proId)
            payoutRec.set('job_id', jobId)
            payoutRec.set('amount_gross', gross)
            payoutRec.set('platform_fee', platformFee)
            payoutRec.set('penalty_debit', penaltyDebitApplied)
            payoutRec.set('amount_net', amountNet)
            payoutRec.set('status', 'pending')
            payoutRec.set('method', 'pix')
            payoutRec.set('external_id', '')
            payoutRec.set('notes', '')
            $app.save(payoutRec)

            console.log(
              '[release_held_payments] payout criado — pro',
              proId,
              'job',
              jobId,
              'gross',
              gross,
              'fee',
              platformFee,
              'penalty',
              penaltyDebitApplied,
              'net',
              amountNet,
            )
          }
        } catch (err) {
          console.log('[release_held_payments] falha ao criar payout:', err)
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
