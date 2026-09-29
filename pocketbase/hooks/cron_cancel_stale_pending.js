// Cron: cancel stale pending jobs and reopen once as emergency.
//
// Runs every 5 minutes: */5 * * * *
//
// Identifies jobs with:
//   status = 'pending' && scheduled_at != ''
//   where scheduled_at <= cutoff:
//     - type = 'emergency' -> cutoff = now - 60 min
//     - type != 'emergency' (scheduled) -> cutoff = now - 2 hours
//
// For each stale job:
//   1. Mark cancelled:
//      status = 'cancelled'
//      cancellation_reason = 'expired_no_acceptance'
//      cancelled_by = ''
//      cancelled_at = now
//      If payment_status == 'held' -> 'refunded'
//      Save.
//
//   2. Notify customer: "Solicitação expirada" — no pro accepted in time;
//      if payment was held, inform that it was refunded.
//
//   3. REOPEN ONCE as emergency (if job.reopened == false):
//      Create new job:
//        customer_id, service_id, address, latitude, longitude, hours, price, client_price
//        type = 'emergency'
//        emergency_fee = 1.2
//        scheduled_at = now
//        reopened = true
//        payment_status = 'held' (same payment_intent_id)
//        status = 'pending'
//      Notify eligible pros (role='pro', status='active', not suspended, not blocked via blocked_until,
//      id != customer_id) EXCEPT those in declined_by of original job.
//
//   4. If job.reopened == true:
//      DO NOT reopen again — already cancelled + refunded + notify customer suggesting a new request.
//
// NOTE: Hooks run in separate VMs. All logic is inline inside the cronAdd callback.

cronAdd('cancel_stale_pending', '*/5 * * * *', () => {
  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()
  const cutoffScheduled = new Date(nowMs - 2 * 60 * 60 * 1000).toISOString()
  const cutoffEmergency = new Date(nowMs - 60 * 60 * 1000).toISOString()

  let notifCol = null
  try {
    notifCol = $app.findCollectionByNameOrId('notifications')
  } catch (_) {
    notifCol = null
  }

  const serviceNameFor = function (jobRecord) {
    const serviceId = jobRecord.getString('service_id')
    if (!serviceId) return 'serviço'
    try {
      const svc = $app.findFirstRecordByData('services', 'id', serviceId)
      if (svc) return svc.getString('name')
    } catch (_) {}
    return 'serviço'
  }

  const notifyUser = function (userId, type, title, message, jobId) {
    if (!userId || !notifCol) return
    try {
      const n = new Record(notifCol)
      n.set('user_id', userId)
      n.set('type', type)
      n.set('title', title)
      n.set('message', message)
      if (jobId) n.set('job_id', jobId)
      n.set('read_status', false)
      $app.save(n)
    } catch (err) {
      console.log('[cancel_stale_pending] falha ao notificar ' + userId + ':', err)
    }
  }

  // Find pending jobs with scheduled_at set
  // To avoid complex or slow queries, fetch pending jobs with scheduled_at <= cutoffEmergency (1 hour ago)
  // and check each job's cutoff depending on whether it's emergency (1h) or scheduled (2h).
  let pendingJobs = []
  try {
    pendingJobs = $app.findRecordsByFilter(
      'jobs',
      "status = 'pending' && scheduled_at != '' && scheduled_at <= '" + cutoffEmergency + "'",
      'scheduled_at',
      200,
      0,
    )
  } catch (err) {
    console.log('[cancel_stale_pending] erro ao buscar jobs pendentes:', err)
    return
  }

  let cancelledCount = 0
  let reopenedCount = 0

  for (let i = 0; i < pendingJobs.length; i++) {
    const job = pendingJobs[i]
    const jobId = job.getString('id')
    const customerId = job.getString('customer_id')
    const jobType = job.getString('type')
    const scheduledAt = job.getString('scheduled_at')
    if (!scheduledAt) continue

    const schedMs = new Date(scheduledAt).getTime()
    if (isNaN(schedMs)) continue

    // Determine cutoff based on job type:
    // emergency: now - 60 min
    // scheduled: now - 2 hours
    const isEmergency = jobType === 'emergency'
    const cutoffMs = isEmergency ? nowMs - 60 * 60 * 1000 : nowMs - 2 * 60 * 60 * 1000

    if (schedMs > cutoffMs) {
      // Not yet stale for scheduled jobs (which require 2h cutoff)
      continue
    }

    const wasReopened = job.getBool('reopened')
    const originalPaymentStatus = job.getString('payment_status')
    const hadHeldPayment = originalPaymentStatus === 'held'
    const hadAuthorizedPayment = originalPaymentStatus === 'authorized'
    const intentId = job.getString('payment_intent_id')

    // 1. Mark cancelled and cancel pre-auth on gateway if authorized
    try {
      job.set('status', 'cancelled')
      job.set('cancellation_reason', 'expired_no_acceptance')
      job.set('cancelled_by', '')
      job.set('cancelled_at', nowIso)
      if (hadHeldPayment) {
        job.set('payment_status', 'refunded')
      } else if (hadAuthorizedPayment) {
        job.set('payment_status', 'cancelled')
        // Cancel authorization on gateway if was not reopened
        if (intentId) {
          const provider = $os.getenv('PAYMENT_PROVIDER') || ''
          if (provider === 'mercadopago') {
            const accessToken = $os.getenv('MERCADOPAGO_ACCESS_TOKEN') || ''
            if (accessToken) {
              try {
                $http.send({
                  url: 'https://api.mercadopago.com/v1/payments/' + encodeURIComponent(intentId),
                  method: 'PUT',
                  headers: {
                    Authorization: 'Bearer ' + accessToken,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ status: 'cancelled' }),
                  timeout: 15,
                })
              } catch (_) {}
            }
          } else if (provider === 'stripe') {
            const secretKey = $os.getenv('STRIPE_SECRET_KEY') || ''
            if (secretKey) {
              try {
                $http.send({
                  url:
                    'https://api.stripe.com/v1/payment_intents/' +
                    encodeURIComponent(intentId) +
                    '/cancel',
                  method: 'POST',
                  headers: {
                    Authorization: 'Bearer ' + secretKey,
                    'Content-Type': 'application/x-www-form-urlencoded',
                  },
                  timeout: 15,
                })
              } catch (_) {}
            }
          }
        }
      }
      $app.save(job)
      cancelledCount++
    } catch (err) {
      console.log('[cancel_stale_pending] erro ao cancelar job ' + jobId + ':', err)
      continue
    }

    const svcName = serviceNameFor(job)

    // 2. Notify customer
    let notifMsg = 'Nenhum profissional aceitou a sua solicitação de ' + svcName + ' a tempo.'
    if (hadHeldPayment) {
      notifMsg += ' O valor retido foi reembolsado integralmente.'
    } else if (hadAuthorizedPayment) {
      notifMsg += ' A pré-autorização no seu cartão foi cancelada sem cobrança.'
    }
    if (wasReopened) {
      notifMsg +=
        ' Como esta solicitação já havia sido reaberta, sugerimos criar uma nova solicitação se ainda precisar do serviço.'
    }

    notifyUser(customerId, 'system', 'Solicitação expirada', notifMsg, jobId)

    // 3. REOPEN ONCE as emergency (if wasReopened == false)
    if (!wasReopened) {
      try {
        const jobsCol = $app.findCollectionByNameOrId('jobs')
        const newJob = new Record(jobsCol)
        newJob.set('customer_id', customerId)
        newJob.set('service_id', job.getString('service_id'))
        newJob.set('status', 'pending')

        const originalPrice = job.getFloat('price')
        const originalClientPrice = job.getFloat('client_price') || originalPrice
        newJob.set('price', originalPrice)
        newJob.set('client_price', originalClientPrice)
        newJob.set('type', 'emergency')
        newJob.set('emergency_fee', 1.2)
        newJob.set('address', job.getString('address'))
        newJob.set('latitude', job.getFloat('latitude'))
        newJob.set('longitude', job.getFloat('longitude'))
        newJob.set('scheduled_at', nowIso)

        const hours = job.getFloat('hours')
        newJob.set('hours', hours > 0 ? hours : 1)

        // If the original was refunded or held, the new emergency job carries 'held' with the same intent.
        // If it was authorized, carry over 'authorized' so the new job can be captured on acceptance.
        let newPaymentStatus = originalPaymentStatus
        if (hadHeldPayment || originalPaymentStatus === 'refunded') {
          newPaymentStatus = 'held'
        } else if (hadAuthorizedPayment || originalPaymentStatus === 'cancelled') {
          newPaymentStatus = 'authorized'
        }
        newJob.set('payment_status', newPaymentStatus)
        newJob.set('payment_intent_id', job.getString('payment_intent_id'))
        newJob.set('payment_authorized_at', job.getString('payment_authorized_at'))
        newJob.set('reopened', true)

        // Carry over declined_by so previous decliners won't see this new emergency job
        // declined_by is a relation list field
        const declinedList = job.get('declined_by') || []
        let declinedArray = []
        if (Array.isArray(declinedList)) {
          declinedArray = declinedList
        } else if (typeof declinedList === 'string' && declinedList) {
          declinedArray = [declinedList]
        }
        if (declinedArray.length > 0) {
          newJob.set('declined_by', declinedArray)
        }

        $app.save(newJob)
        reopenedCount++

        const newJobId = newJob.getString('id')

        // Notify client of the emergency reopen
        notifyUser(
          customerId,
          'system',
          'Serviço reaberto como emergência',
          'Sua solicitação de ' +
            svcName +
            ' não recebeu profissionais a tempo e foi convertida automaticamente em atendimento de emergência sem custo adicional.',
          newJobId,
        )

        // Notify eligible pros EXCEPT those who declined the original job
        let pros = []
        try {
          pros = $app.findRecordsByFilter(
            'users',
            "role = 'pro' && status = 'active'",
            '-created',
            500,
            0,
          )
        } catch (_) {}

        const nowMsNotif = Date.now()
        for (let p = 0; p < pros.length; p++) {
          const pro = pros[p]
          if (pro.getBool('suspended')) continue
          if (pro.getString('status') === 'deleted') continue
          if (!pro.getBool('profile_complete')) continue
          const blockedUntilStr = pro.getString('blocked_until')
          if (blockedUntilStr) {
            const blockedMs = new Date(blockedUntilStr).getTime()
            if (!isNaN(blockedMs) && blockedMs > nowMsNotif) continue
          }
          const proId = pro.getString('id')
          if (!proId || proId === customerId) continue

          // Skip pros who declined the original job
          if (declinedArray.indexOf(proId) !== -1) continue

          notifyUser(
            proId,
            'new_job',
            'Nova solicitação de emergência disponível',
            'Uma solicitação de ' +
              svcName +
              ' expirou sem interessados e foi reaberta como emergência para atendimento imediato.',
            newJobId,
          )
        }
      } catch (err) {
        console.log(
          '[cancel_stale_pending] erro ao reabrir job emergencial para ' + jobId + ':',
          err,
        )
      }
    }
  }

  console.log(
    '[cancel_stale_pending] ciclo concluído — cancelados:',
    cancelledCount,
    'reabertos emergenciais:',
    reopenedCount,
  )
})
