// When a new `pending` job is created (including each job in a batch request),
// notifies all eligible professionals so they can accept it.
//
// Hook type: onRecordAfterCreateSuccess on `jobs` (fires after the DB commit,
// so the job row is readable by the eligibility query).
//
// Eligible professionals:
//   - role = 'pro'
//   - status = 'active'
//   - not suspended
//   - not the job's own customer (defensive — a pro cannot also be the client)
//
// Creates one `notifications` row per eligible pro with type = 'new_job',
// linking back to the job via job_id. The job's service name and scheduled
// date/time are resolved here so the message is human-readable.
onRecordAfterCreateSuccess((e) => {
  const job = e.record
  if (!job) {
    e.next()
    return
  }

  const status = job.getString('status')
  if (status !== 'pending') {
    e.next()
    return
  }

  const jobId = job.getString('id')
  const customerId = job.getString('customer_id')
  const serviceId = job.getString('service_id')
  const scheduledAt = job.getString('scheduled_at')
  const jobType = job.getString('type')

  // Resolve the service name for the message body.
  let serviceName = 'serviço'
  if (serviceId) {
    try {
      const svc = $app.findFirstRecordByData('services', 'id', serviceId)
      if (svc) serviceName = svc.getString('name')
    } catch (_) {}
  }

  // Build a readable date/time string from scheduled_at.
  let whenLabel = 'agendamento a definir'
  if (scheduledAt) {
    try {
      const d = new Date(scheduledAt)
      const pad = function (n) {
        n = String(n)
        return n.length < 2 ? '0' + n : n
      }
      whenLabel =
        pad(d.getUTCDate()) +
        '/' +
        pad(d.getUTCMonth() + 1) +
        '/' +
        d.getUTCFullYear() +
        ' às ' +
        pad(d.getUTCHours()) +
        ':' +
        pad(d.getUTCMinutes())
    } catch (_) {}
  } else if (jobType === 'emergency') {
    whenLabel = 'início imediato'
  }

  const title = 'Nova solicitação disponível'
  const message = 'Uma nova solicitação de ' + serviceName + ' está disponível para ' + whenLabel

  // Find every eligible professional.
  let pros = []
  try {
    pros = $app.findRecordsByFilter(
      'users',
      "role = 'pro' && status = 'active'",
      '-created',
      500,
      0,
    )
  } catch (_) {
    e.next()
    return
  }

  // Suspended pros are filtered out (suspended is a bool, not in the filter
  // expression above to keep the query simple).
  let notifCol = null
  try {
    notifCol = $app.findCollectionByNameOrId('notifications')
  } catch (_) {
    e.next()
    return
  }

  for (let i = 0; i < pros.length; i++) {
    const pro = pros[i]
    if (pro.getBool('suspended')) continue
    const proId = pro.getString('id')
    if (!proId || proId === customerId) continue

    try {
      const notif = new Record(notifCol)
      notif.set('user_id', proId)
      notif.set('type', 'new_job')
      notif.set('title', title)
      notif.set('message', message)
      notif.set('job_id', jobId)
      notif.set('read_status', false)
      $app.save(notif)
    } catch (err) {
      console.log('[on_job_created] falha ao criar notificação para pro ' + proId + ':', err)
    }
  }

  e.next()
}, 'jobs')
