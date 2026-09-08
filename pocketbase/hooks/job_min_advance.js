// Trava de antecedência mínima: jobs "scheduled" com menos de 12h entre a
// criação e o scheduled_at são convertidos para "emergency" (scheduled_at = agora).
// Roda ANTES da gravação (onRecordCreate), diferente do on_job_created.js
// (que roda depois e só cria notificações).
onRecordCreate((e) => {
  const job = e.record
  if (!job) {
    e.next()
    return
  }

  const MIN_ADVANCE_MS = 12 * 3600 * 1000
  if (job.getString('type') === 'scheduled' && job.getString('scheduled_at')) {
    const scheduledMs = new Date(job.getString('scheduled_at')).getTime()
    if (!isNaN(scheduledMs) && scheduledMs < Date.now() + MIN_ADVANCE_MS) {
      job.set('type', 'emergency')
      job.set('scheduled_at', new Date().toISOString())
      console.log(
        '[job_min_advance] job agendado com menos de 12h convertido para emergência: ' +
          job.getString('id'),
      )
    }
  }

  e.next()
}, 'jobs')
