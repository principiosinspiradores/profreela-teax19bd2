// After a job moves to `completed`, notify the customer that they can review
// the professional. Idempotent: only fires when the status actually changed
// to completed AND a pro is assigned AND no "pending review" notification
// already exists for that job+customer.
//
// Hook type: onRecordAfterUpdateSuccess (fires after the DB commit).
onRecordAfterUpdateSuccess((e) => {
  const record = e.record
  if (!record) {
    e.next()
    return
  }

  const status = record.getString('status')
  if (status !== 'completed') {
    e.next()
    return
  }

  // Only when the status actually transitioned to completed.
  const prev = record.original()
  const prevStatus = prev ? prev.getString('status') : ''
  if (prevStatus === 'completed') {
    e.next()
    return
  }

  const proId = record.getString('pro_id')
  const customerId = record.getString('customer_id')
  const jobId = record.getString('id')
  if (!proId || !customerId || !jobId) {
    e.next()
    return
  }

  // Avoid duplicate notifications for the same job.
  try {
    const existing = $app.findRecordsByFilter(
      'notifications',
      "user_id = '" + customerId + "' && message ~ '" + jobId + "'",
      '-created',
      1,
      0,
    )
    if (existing && existing.length > 0) {
      e.next()
      return
    }
  } catch (_) {}

  try {
    const notifCol = $app.findCollectionByNameOrId('notifications')
    const notif = new Record(notifCol)
    notif.set('user_id', customerId)
    notif.set('title', 'Avalie o profissional')
    notif.set(
      'message',
      'Serviço concluído! Avalie o profissional para ajudar outros clientes. job:' + jobId,
    )
    notif.set('read_status', false)
    $app.save(notif)
  } catch (err) {
    console.log('[on_job_complete] falha ao criar notificação:', err)
  }

  e.next()
}, 'jobs')
