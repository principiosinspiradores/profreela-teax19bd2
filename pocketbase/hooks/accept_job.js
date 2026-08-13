// Blocks a professional from accepting a job that overlaps in time with another
// job they already have in `accepted` or `in_progress` status on the same day.
//
// Hook type: onRecordUpdateRequest on `jobs` (HTTP-level, fires before save).
// Returning a JSON response WITHOUT calling e.next() aborts the update and
// short-circuits the API call, so the job stays unchanged.
//
// Conflict rule:
//   - Only applies when status is transitioning to `accepted` with a pro_id.
//   - Only applies when the job has both `scheduled_at` and `hours` set.
//   - For every existing accepted/in_progress job of the same pro on the same
//     calendar date, compute [start, start+hours) intervals and check overlap.
//   - On overlap → HTTP 409 with the spec message.
//   - Otherwise → e.next() and the update proceeds normally.
onRecordUpdateRequest((e) => {
  const record = e.record
  if (!record) {
    e.next()
    return
  }

  const newStatus = record.getString('status')
  if (newStatus !== 'accepted') {
    e.next()
    return
  }

  // Only validate a real transition into `accepted` (ignore no-op updates).
  const prev = record.original()
  const prevStatus = prev ? prev.getString('status') : ''
  if (prevStatus === 'accepted') {
    e.next()
    return
  }

  const proId = record.getString('pro_id')
  if (!proId) {
    e.next()
    return
  }

  const scheduledAt = record.getString('scheduled_at')
  const hours = record.getFloat('hours')
  // Do NOT skip validation when the time window is missing — that would let a
  // pro accept several jobs on the same day without any overlap check. Instead
  // reject: a service must have a scheduled date/time and a duration before it
  // can be accepted, otherwise the conflict window cannot be computed.
  if (!scheduledAt || !hours || hours <= 0) {
    return e.json(400, {
      code: 400,
      message: 'Dados incompletos: o serviço precisa ter data e horário definidos.',
      data: { conflict: false, incomplete: true },
    })
  }

  const jobId = record.getString('id')
  // Same calendar date (YYYY-MM-DD) — works for both ISO and PB date formats.
  const datePart = scheduledAt.slice(0, 10)

  const newStart = new Date(scheduledAt).getTime()
  const newEnd = newStart + hours * 3600000

  // Find the pro's other accepted / in_progress jobs on the same date.
  let conflicting = []
  try {
    conflicting = $app.findRecordsByFilter(
      'jobs',
      "pro_id = '" + proId + "' && (status = 'accepted' || status = 'in_progress')",
      '-scheduled_at',
      100,
      0,
    )
  } catch (_) {
    // If the lookup fails, don't block the acceptance.
    e.next()
    return
  }

  for (let i = 0; i < conflicting.length; i++) {
    const other = conflicting[i]
    if (other.getString('id') === jobId) continue

    const otherScheduled = other.getString('scheduled_at')
    if (!otherScheduled) continue
    if (otherScheduled.slice(0, 10) !== datePart) continue

    const otherHours = other.getFloat('hours')
    if (!otherHours || otherHours <= 0) continue

    const otherStart = new Date(otherScheduled).getTime()
    const otherEnd = otherStart + otherHours * 3600000

    // Interval overlap: [newStart, newEnd) ∩ [otherStart, otherEnd)
    if (newStart < otherEnd && otherStart < newEnd) {
      return e.json(409, {
        code: 409,
        message:
          'Você já tem um serviço agendado para este horário. Conclua ou cancele o serviço atual antes de aceitar outro.',
        data: { conflict: true, conflict_job_id: other.getString('id') },
      })
    }
  }

  e.next()
}, 'jobs')
