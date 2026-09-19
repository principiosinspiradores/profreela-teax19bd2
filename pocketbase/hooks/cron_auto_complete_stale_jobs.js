// Cron job: auto-complete stale in_progress jobs.
//
// Identifies jobs left in `in_progress` status that were forgotten by the pro
// (or where the pro left the geofence perimeter and couldn't finish manually).
//
// Deadline calculation:
//   deadline = (started_at || clocked_in_at) + (hours * 60 min) + 2h tolerance.
//   When now > deadline:
//     1. status = 'completed', completed_at = now, auto_completed = true, completed_by = 'auto_timeout'.
//        If payment_status is 'authorized', '' or 'held' (non-terminal), set payment_status = 'held'
//        and payment_hold_until = now + guarantee_period_days (from settings, default 1 day).
//        Terminal states (captured, disputed, cancelled, refunded) remain untouched.
//     2. Notify PRO:
//        Title: "Serviço finalizado automaticamente"
//        Message: "O tempo do serviço foi excedido e ele não foi finalizado manualmente — o sistema o encerrou automaticamente. Lembre-se de finalizar com a foto de encerramento antes de sair do local nos próximos serviços."
//     3. Notify CLIENT:
//        Title: "Encerramento automático do serviço"
//        Message: "O tempo contratado foi excedido sem finalização manual e o sistema encerrou o serviço automaticamente. A janela de garantia de 24h para revisão ou contestação começa agora."
//
// Cadence: runs every 5 minutes ('*/5 * * * *'), id: 'auto_complete_stale_jobs'
//
// NOTE: All logic is strictly inline inside the cronAdd callback (separate VM per hook).

cronAdd('auto_complete_stale_jobs', '*/5 * * * *', () => {
  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()
  const TOLERANCE_MS = 2 * 60 * 60 * 1000 // 2 hours tolerance

  let jobs = []
  try {
    jobs = $app.findRecordsByFilter('jobs', "status = 'in_progress'", '-created', 100, 0)
  } catch (err) {
    console.log('[auto_complete_stale_jobs] erro ao buscar jobs in_progress:', err)
    return
  }

  if (!jobs || jobs.length === 0) {
    return
  }

  // Load guarantee_period_days from settings (default 1 day = 24h)
  let guaranteeDays = 1
  try {
    const rows = $app.findRecordsByFilter('settings', '1=1', '', 1, 0)
    if (rows && rows.length > 0) {
      const gd = rows[0].getFloat('guarantee_period_days')
      if (gd > 0) guaranteeDays = gd
    }
  } catch (_) {}

  const holdUntil = new Date(nowMs + guaranteeDays * 24 * 3600 * 1000).toISOString()

  let notifCol = null
  try {
    notifCol = $app.findCollectionByNameOrId('notifications')
  } catch (_) {
    notifCol = null
  }

  let completedCount = 0

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]
    const jobId = job.getString('id')
    const proId = job.getString('pro_id')
    const customerId = job.getString('customer_id')

    // Base start time: started_at, fallback clocked_in_at
    const startedAtStr = job.getString('started_at') || job.getString('clocked_in_at')
    if (!startedAtStr) {
      continue
    }

    const startMs = new Date(startedAtStr).getTime()
    if (isNaN(startMs)) {
      continue
    }

    let hours = job.getFloat('hours')
    if (!hours || hours <= 0) {
      hours = 1
    }

    const serviceDurationMs = hours * 60 * 60 * 1000
    const deadlineMs = startMs + serviceDurationMs + TOLERANCE_MS

    if (nowMs <= deadlineMs) {
      // Deadline not reached yet
      continue
    }

    // --- Action: complete the job ------------------------------------------
    try {
      job.set('status', 'completed')
      job.set('completed_at', nowIso)
      job.set('auto_completed', true)
      job.set('completed_by', 'auto_timeout')

      const prevPaymentStatus = job.getString('payment_status')
      // Non-terminal states: 'authorized', 'held', ''
      // Terminal states (captured, disputed, cancelled, refunded) remain untouched
      if (
        prevPaymentStatus === 'authorized' ||
        prevPaymentStatus === 'held' ||
        prevPaymentStatus === ''
      ) {
        job.set('payment_status', 'held')
        job.set('payment_hold_until', holdUntil)
        if (!job.getString('payment_authorized_at')) {
          job.set('payment_authorized_at', nowIso)
        }
      }

      $app.save(job)
      completedCount++
      console.log('[auto_complete_stale_jobs] job finalizado automaticamente:', jobId)

      // --- Notify PRO --------------------------------------------------------
      if (proId && notifCol) {
        try {
          const proNotif = new Record(notifCol)
          proNotif.set('user_id', proId)
          proNotif.set('type', 'system')
          proNotif.set('title', 'Serviço finalizado automaticamente')
          proNotif.set(
            'message',
            'O tempo do serviço foi excedido e ele não foi finalizado manualmente — o sistema o encerrou automaticamente. Lembre-se de finalizar com a foto de encerramento antes de sair do local nos próximos serviços.',
          )
          proNotif.set('job_id', jobId)
          proNotif.set('read_status', false)
          $app.save(proNotif)
        } catch (err) {
          console.log('[auto_complete_stale_jobs] falha ao notificar pro:', proId, err)
        }
      }

      // --- Notify CLIENT -----------------------------------------------------
      if (customerId && notifCol) {
        try {
          const clientNotif = new Record(notifCol)
          clientNotif.set('user_id', customerId)
          clientNotif.set('type', 'system')
          clientNotif.set('title', 'Encerramento automático do serviço')
          clientNotif.set(
            'message',
            'O tempo contratado foi excedido sem finalização manual e o sistema encerrou o serviço automaticamente. A janela de garantia de 24h para revisão ou contestação começa agora.',
          )
          clientNotif.set('job_id', jobId)
          clientNotif.set('read_status', false)
          $app.save(clientNotif)
        } catch (err) {
          console.log('[auto_complete_stale_jobs] falha ao notificar cliente:', customerId, err)
        }
      }
    } catch (err) {
      console.log('[auto_complete_stale_jobs] erro ao atualizar job:', jobId, err)
    }
  }

  if (completedCount > 0) {
    console.log('[auto_complete_stale_jobs] ciclo concluído — finalizados:', completedCount)
  }
})
