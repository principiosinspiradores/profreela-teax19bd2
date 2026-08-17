// Clock-in endpoint — transitions an accepted job to `in_progress`.
//
// POST /backend/v1/start-job   (auth required)
//   body: { jobId }
//
// Validations:
//   - the authenticated user must be the pro assigned to the job (pro_id)
//   - the job status must be `accepted` (you can't start a pending/completed job)
//
// On success sets status = 'in_progress', started_at = now and clocked_in_at = now,
// and returns the updated job. Returns 200 with { ok, job } or 4xx with { ok, error }.
//
// NOTE (hooks run in a separate VM): all logic is inlined inside the callback.

routerAdd(
  'POST',
  '/backend/v1/start-job',
  (e) => {
    const auth = e.requestInfo().auth
    if (!auth) {
      return e.json(401, { ok: false, error: 'Autenticação necessária.' })
    }
    const authId = auth.getString('id')

    const body = e.requestInfo().body || {}
    const jobId = (body.jobId || '').toString().trim()
    if (!jobId) {
      return e.json(400, { ok: false, error: 'jobId é obrigatório.' })
    }

    // --- load job -----------------------------------------------------------
    let job = null
    try {
      job = $app.findFirstRecordByData('jobs', 'id', jobId)
    } catch (_) {}
    if (!job) {
      return e.json(404, { ok: false, error: 'Serviço não encontrado.' })
    }

    const proId = job.getString('pro_id')
    if (!proId || proId !== authId) {
      return e.json(403, {
        ok: false,
        error: 'Você não tem permissão para iniciar este serviço.',
      })
    }

    const status = job.getString('status')
    if (status === 'in_progress') {
      // Already started — treat as idempotent success so the UI doesn't break.
      return e.json(200, { ok: true, job: job, already_started: true })
    }
    if (status !== 'accepted') {
      return e.json(400, {
        ok: false,
        error: 'Apenas serviços aceitos podem ser iniciados.',
      })
    }

    const nowIso = new Date().toISOString()
    job.set('status', 'in_progress')
    job.set('started_at', nowIso)
    // Also stamp clocked_in_at so the 24h auto-cancel rule stays satisfied.
    if (!job.getString('clocked_in_at')) {
      job.set('clocked_in_at', nowIso)
    }
    $app.save(job)

    return e.json(200, { ok: true, job: job, started_at: nowIso })
  },
  $apis.requireAuth(),
)
