// Clock-in endpoint — transitions an accepted job to `in_progress`.
//
// POST /backend/v1/start-job   (auth required)
//   body: { jobId, latitude?, longitude?, photoId? }
//
// Validations:
//   - the authenticated user must be the pro assigned to the job (pro_id)
//   - the job status must be `accepted` (you can't start a pending/completed job)
//   - if latitude/longitude are provided, the pro must be within 50m of the
//     job's coordinates (50m geofence). The job must have latitude/longitude.
//   - a `start` evidence photo (job_photos record) must exist for this job
//     before the service can be started.
//
// On success sets status = 'in_progress', started_at = now and clocked_in_at = now,
// and returns the updated job. Returns 200 with { ok, job } or 4xx with { ok, error }.
//
// NOTE (hooks run in a separate VM): all logic is inlined inside the callback —
// no top-level declarations are referenced from within the callback.

routerAdd(
  'POST',
  '/backend/v1/start-job',
  (e) => {
    // Geofence radius in meters (reduced from 150m to 50m).
    const GEOFENCE_RADIUS_M = 50

    /** Haversine distance in meters between two lat/lng points. */
    function haversineMeters(lat1, lng1, lat2, lng2) {
      const R = 6371000
      const dLat = ((lat2 - lat1) * Math.PI) / 180
      const dLng = ((lng2 - lng1) * Math.PI) / 180
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2)
      return 2 * R * Math.asin(Math.sqrt(a))
    }

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

    // --- geofence check (50m) ----------------------------------------------
    // Only enforced when the client sends its coordinates AND the job has
    // coordinates. If either is missing we don't hard-block (legacy jobs
    // without coordinates would become unstartable); the photo evidence
    // requirement still gates the start.
    const jobLat = job.getFloat('latitude')
    const jobLng = job.getFloat('longitude')
    const proLatRaw = body.latitude
    const proLngRaw = body.longitude
    const proLat = Number(proLatRaw)
    const proLng = Number(proLngRaw)
    const hasJobCoords = !isNaN(jobLat) && !isNaN(jobLng) && jobLat !== 0
    const hasProCoords = proLatRaw != null && proLngRaw != null && !isNaN(proLat) && !isNaN(proLng)

    if (hasJobCoords && hasProCoords) {
      const dist = haversineMeters(proLat, proLng, jobLat, jobLng)
      if (dist > GEOFENCE_RADIUS_M) {
        return e.json(403, {
          ok: false,
          error: 'Você precisa estar no local para iniciar o serviço.',
          code: 'OUTSIDE_GEOFENCE',
          distance_m: Math.round(dist),
          radius_m: GEOFENCE_RADIUS_M,
        })
      }
    }

    // --- start evidence photo (required) -----------------------------------
    let hasStartPhoto = false
    try {
      const photos = $app.findRecordsByFilter(
        'job_photos',
        "job_id = '" + jobId + "' && type = 'start'",
        '-created',
        1,
        0,
      )
      if (photos && photos.length > 0) hasStartPhoto = true
    } catch (_) {}
    if (!hasStartPhoto) {
      return e.json(400, {
        ok: false,
        error: 'É obrigatório tirar uma foto de evidência no local antes de iniciar o serviço.',
        code: 'MISSING_START_PHOTO',
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
