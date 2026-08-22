// Cron: professional-delayed service flow.
//
// The platform keeps a 15-minute tolerance starting at `scheduled_start`
// (the pro can clock-in up to 15 min late without penalties). This cron
// implements the *beyond-15-min* flow described in the spec:
//
//   1) Progressive warnings to the professional:
//        - 10 min after scheduled_start → "Você tem 5 min para iniciar o serviço."
//        -  0 min (at scheduled_start)  → "Horário marcado! Tolerância de 15 min."
//        - +15 min after scheduled_start → decision flow for the client is armed.
//
//   2) Client delay notification when the pro is +15 min late:
//        - Sends the "O profissional [nome] atrasou. Deseja estender o prazo?"
//          notification (3 options are presented by the client Dashboard UI).
//        - Marks delay_notification_sent = true and delay_notified_at = now.
//
//   3) Client 10-min inactivity timeout (measured by this cron, not the client):
//        - If delay_notified_at is older than 10 min AND client_delay_response is
//          still null → cancel the job (status = 'cancelled', reason
//          'professional_delay') and create an emergency reopen job with the
//          same data (service, address, hours, customer), type = 'emergency',
//          emergency_fee = 1.2, client_price = original price (client pays no
//          extra), and notify available pros in the region.
//
// Runs every 1 minute: * * * * *
//
// NOTE (hooks run in a separate VM): all logic is inlined inside the cronAdd
// callback — no top-level declarations are referenced from within the callback.

cronAdd('pro_delay_flow', '* * * * *', () => {
  const TOLERANCE_MIN = 15 // existing 15-min tolerance (kept)
  const CLIENT_TIMEOUT_MIN = 10 // client has 10 min to answer
  const WARN_5MIN_BEFORE_MS = 10 * 60 * 1000 // 10 min after scheduled_start
  const AT_SCHEDULED_MS = 0
  const LATE_MS = TOLERANCE_MIN * 60 * 1000 // +15 min after scheduled_start

  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()

  // --- load the notifications collection once (best-effort) ----------------
  let notifCol = null
  try {
    notifCol = $app.findCollectionByNameOrId('notifications')
  } catch (_) {
    notifCol = null
  }

  // Helper: resolve the service name for a job (best-effort).
  const serviceNameFor = function (jobRecord) {
    const serviceId = jobRecord.getString('service_id')
    if (!serviceId) return 'serviço'
    try {
      const svc = $app.findFirstRecordByData('services', 'id', serviceId)
      if (svc) return svc.getString('name')
    } catch (_) {}
    return 'serviço'
  }

  // Helper: resolve the pro name for a job (best-effort).
  const proNameFor = function (jobRecord) {
    const proId = jobRecord.getString('pro_id')
    if (!proId) return 'o profissional'
    try {
      const pro = $app.findFirstRecordByData('users', 'id', proId)
      if (pro) return pro.getString('name') || 'o profissional'
    } catch (_) {}
    return 'o profissional'
  }

  // Helper: create a notification (best-effort).
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
      console.log('[pro_delay_flow] falha ao notificar ' + userId + ':', err)
    }
  }

  // --- 1) Progressive warnings to the professional -------------------------
  // Only for jobs that are still `accepted` (not yet started), with a real
  // scheduled_start, and that haven't been notified yet at that threshold.
  // We use two flags on the pro side: pro_warned_5min / pro_warned_scheduled
  // — but since we don't have dedicated columns, we use the existing
  // `delay_notified_at` + `client_delay_response` lifecycle only for the
  // +15min arm. For the 10min and 0min warnings we simply dedupe by scanning
  // existing notifications (cheap enough at 1/min cadence).
  let acceptedJobs = []
  try {
    acceptedJobs = $app.findRecordsByFilter(
      'jobs',
      "status = 'accepted' && scheduled_at != '' && clocked_in_at = ''",
      'scheduled_at',
      200,
      0,
    )
  } catch (err) {
    console.log('[pro_delay_flow] erro ao buscar accepted jobs:', err)
    acceptedJobs = []
  }

  let warned = 0
  for (let i = 0; i < acceptedJobs.length; i++) {
    const job = acceptedJobs[i]
    const jobId = job.getString('id')
    const proId = job.getString('pro_id')
    const scheduledAt = job.getString('scheduled_at')
    if (!scheduledAt) continue
    const schedMs = new Date(scheduledAt).getTime()
    if (isNaN(schedMs)) continue
    const elapsedMs = nowMs - schedMs // positive when past scheduled_start

    // 10 min after scheduled_start → "5 min to start"
    if (elapsedMs >= WARN_5MIN_BEFORE_MS && elapsedMs < LATE_MS) {
      // Dedupe: avoid sending the same warning twice.
      let already = false
      try {
        const existing = $app.findRecordsByFilter(
          'notifications',
          "user_id = '" +
            proId +
            "' && title = 'Você tem 5 min para iniciar o serviço' && job_id = '" +
            jobId +
            "'",
          '-created',
          1,
          0,
        )
        if (existing && existing.length > 0) already = true
      } catch (_) {}
      if (!already) {
        notifyUser(
          proId,
          'system',
          'Você tem 5 min para iniciar o serviço',
          'Faltam 5 minutos para o fim da tolerância de 15 min. Inicie o serviço agora para evitar reabertura.',
          jobId,
        )
        warned++
      }
      continue
    }

    // 0 min at scheduled_start → "Horário marcado! Tolerância de 15 min."
    // (sent once when the pro is within the first minute after the scheduled time)
    if (elapsedMs >= AT_SCHEDULED_MS && elapsedMs < WARN_5MIN_BEFORE_MS) {
      let already = false
      try {
        const existing = $app.findRecordsByFilter(
          'notifications',
          "user_id = '" +
            proId +
            "' && title = 'Horário marcado! Tolerância de 15 min' && job_id = '" +
            jobId +
            "'",
          '-created',
          1,
          0,
        )
        if (existing && existing.length > 0) already = true
      } catch (_) {}
      if (!already) {
        notifyUser(
          proId,
          'system',
          'Horário marcado! Tolerância de 15 min',
          'O horário do serviço chegou. Você tem 15 minutos de tolerância para iniciar.',
          jobId,
        )
        warned++
      }
      continue
    }
  }

  // --- 2) Arm the client delay notification when the pro is +15 min late ---
  // Jobs that are still accepted, +15 min past scheduled_start, not yet
  // notified (delay_notification_sent = false/empty), and not already extended.
  const lateCutoff = new Date(nowMs - LATE_MS).toISOString()
  let lateJobs = []
  try {
    // findRecordsByFilter supports a comparison against a quoted ISO timestamp
    // for date fields. We ask for accepted jobs whose scheduled_at <= lateCutoff.
    lateJobs = $app.findRecordsByFilter(
      'jobs',
      "status = 'accepted' && scheduled_at != '' && scheduled_at <= '" + lateCutoff + "'",
      'scheduled_at',
      200,
      0,
    )
  } catch (err) {
    console.log('[pro_delay_flow] erro ao buscar jobs atrasados:', err)
    lateJobs = []
  }

  let armed = 0
  for (let i = 0; i < lateJobs.length; i++) {
    const job = lateJobs[i]
    const jobId = job.getString('id')
    const customerId = job.getString('customer_id')
    const proId = job.getString('pro_id')

    // Skip jobs already extended (extension already applied — pro got a new slot)
    if (job.getBool('extended')) continue
    // Skip jobs already notified
    if (job.getBool('delay_notification_sent')) continue
    // Skip jobs whose client already answered
    if (job.getString('client_delay_response')) continue

    // Notify the client.
    const proName = proNameFor(job)
    const svcName = serviceNameFor(job)
    notifyUser(
      customerId,
      'system',
      'O profissional atrasou',
      'O profissional ' +
        proName +
        ' atrasou para o serviço de ' +
        svcName +
        '. Deseja estender o prazo ou cancelar e reabrir? Você tem 10 minutos para responder.',
      jobId,
    )

    // Arm: mark delay_notification_sent + delay_notified_at.
    try {
      job.set('delay_notification_sent', true)
      job.set('delay_notified_at', nowIso)
      $app.save(job)
      armed++
    } catch (err) {
      console.log('[pro_delay_flow] erro ao armar job ' + jobId + ':', err)
    }
  }

  // --- 3) Client 10-min timeout → cancel + emergency reopen ---------------
  // Jobs whose delay_notified_at is older than CLIENT_TIMEOUT_MIN AND
  // client_delay_response is still empty. We cancel the job and create a new
  // emergency job with the same data.
  const timeoutCutoff = new Date(nowMs - CLIENT_TIMEOUT_MIN * 60 * 1000).toISOString()
  let timedOutJobs = []
  try {
    timedOutJobs = $app.findRecordsByFilter(
      'jobs',
      "status = 'accepted' && delay_notification_sent = true && delay_notified_at != '' && delay_notified_at <= '" +
        timeoutCutoff +
        "' && client_delay_response = ''",
      'delay_notified_at',
      50,
      0,
    )
  } catch (err) {
    console.log('[pro_delay_flow] erro ao buscar jobs em timeout:', err)
    timedOutJobs = []
  }

  let cancelled = 0
  let reopened = 0
  for (let i = 0; i < timedOutJobs.length; i++) {
    const job = timedOutJobs[i]
    const jobId = job.getString('id')
    const customerId = job.getString('customer_id')
    const proId = job.getString('pro_id')

    // Mark the (timed-out) client response so this job is never reprocessed.
    try {
      job.set('client_delay_response', 'cancel_reopen')
      job.set('client_delay_responded_at', nowIso)
    } catch (_) {}

    // --- cancel the current job (professional_delay) -------------------
    try {
      job.set('status', 'cancelled')
      job.set('cancelled_by', proId || '')
      job.set('cancelled_at', nowIso)
      job.set('cancellation_reason', 'professional_delay')
      // Release/cancel any pending payment that was not captured. In the
      // pay-at-request flow the payment is `held` (captured by the platform),
      // so a delay-driven cancel refunds it back to the client.
      const ps = job.getString('payment_status')
      if (ps === 'authorized') {
        job.set('payment_status', 'cancelled')
      } else if (ps === 'held') {
        job.set('payment_status', 'refunded')
      }
      $app.save(job)
      cancelled++
    } catch (err) {
      console.log('[pro_delay_flow] erro ao cancelar job ' + jobId + ':', err)
      continue
    }

    // --- create the emergency reopen job -------------------------------
    try {
      const jobsCol = $app.findCollectionByNameOrId('jobs')
      const newJob = new Record(jobsCol)
      newJob.set('customer_id', customerId)
      newJob.set('service_id', job.getString('service_id'))
      newJob.set('status', 'pending')
      // client_price = same value the client originally paid (no extra charge)
      const originalPrice = job.getFloat('price')
      newJob.set('price', originalPrice)
      newJob.set('client_price', originalPrice)
      newJob.set('type', 'emergency')
      newJob.set('emergency_fee', 1.2)
      newJob.set('address', job.getString('address'))
      newJob.set('latitude', job.getFloat('latitude'))
      newJob.set('longitude', job.getFloat('longitude'))
      // Emergency job starts immediately.
      newJob.set('scheduled_at', nowIso)
      // Preserve the original duration.
      const hours = job.getFloat('hours')
      newJob.set('hours', hours > 0 ? hours : 1)
      // Carry the payment intent + held status so the new job keeps the same
      // guaranteed payment (the client already paid; reopening as emergency
      // does not re-charge).
      newJob.set(
        'payment_status',
        job.getString('payment_status') === 'refunded' ? 'held' : job.getString('payment_status'),
      )
      newJob.set('payment_intent_id', job.getString('payment_intent_id'))
      newJob.set('payment_authorized_at', job.getString('payment_authorized_at'))
      newJob.set('reopened', true)
      $app.save(newJob)
      reopened++

      // Notify the client that the emergency reopen was triggered.
      const svcName = serviceNameFor(job)
      notifyUser(
        customerId,
        'system',
        'Serviço reaberto como emergência',
        'Como não houve resposta a tempo, o serviço de ' +
          svcName +
          ' foi cancelado e reaberto como emergência. Estamos buscando um novo profissional para você.',
        newJob.getString('id'),
      )

      // Notify available pros in the region about the new emergency job.
      // We reuse the same eligibility logic as on_job_created.js.
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
      const newJobId = newJob.getString('id')
      const nowMsNotif = Date.now()
      for (let p = 0; p < pros.length; p++) {
        const pro = pros[p]
        if (pro.getBool('suspended')) continue
        const blockedUntilStr = pro.getString('blocked_until')
        if (blockedUntilStr) {
          const blockedMs = new Date(blockedUntilStr).getTime()
          if (!isNaN(blockedMs) && blockedMs > nowMsNotif) continue
        }
        const proId2 = pro.getString('id')
        if (!proId2 || proId2 === customerId) continue
        // Don't re-offer to the pro who delayed this job.
        if (proId2 === proId) continue
        notifyUser(
          proId2,
          'new_job',
          'Nova solicitação de emergência disponível',
          'Uma solicitação de ' +
            svcName +
            ' foi reaberta como emergência e está disponível para atendimento imediato.',
          newJobId,
        )
      }
    } catch (err) {
      console.log('[pro_delay_flow] erro ao criar job emergencial para ' + jobId + ':', err)
    }
  }

  console.log(
    '[pro_delay_flow] ciclo concluído — avisos pro:',
    warned,
    'clientes notificados:',
    armed,
    'cancelados por timeout:',
    cancelled,
    'reabertos emergenciais:',
    reopened,
  )
})
