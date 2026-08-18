// Finish-job endpoint — transitions an `in_progress` job to `completed` and
// starts the 7-day guarantee window (payment release). Server-side enforcement
// of the 50m geofence and the end-of-service evidence photo.
//
// POST /backend/v1/finish-job   (auth required)
//   body: { jobId, latitude?, longitude? }
//
// Validations:
//   - the authenticated user must be the pro assigned to the job (pro_id)
//   - the job status must be `in_progress`
//   - if latitude/longitude are provided, the pro must be within 50m of the
//     job's coordinates (50m geofence).
//   - an `end` evidence photo (job_photos record) must exist for this job
//     before the service can be finished.
//
// On success sets status = 'completed', completed_at = now, then starts the
// payment guarantee window. Returns 200 with { ok, job } or 4xx with { ok, error }.
//
// NOTE (hooks run in a separate VM): all logic is inlined inside the callback —
// no top-level declarations are referenced from within the callback.

routerAdd(
  'POST',
  '/backend/v1/finish-job',
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
        error: 'Você não tem permissão para finalizar este serviço.',
      })
    }

    const status = job.getString('status')
    if (status === 'completed') {
      // Idempotent success.
      return e.json(200, { ok: true, job: job, already_completed: true })
    }
    if (status !== 'in_progress') {
      return e.json(400, {
        ok: false,
        error: 'Apenas serviços em andamento podem ser finalizados.',
      })
    }

    // --- geofence check (50m) ----------------------------------------------
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
          error: 'Você precisa estar no local para finalizar o serviço.',
          code: 'OUTSIDE_GEOFENCE',
          distance_m: Math.round(dist),
          radius_m: GEOFENCE_RADIUS_M,
        })
      }
    }

    // --- end evidence photo (required) -------------------------------------
    let hasEndPhoto = false
    try {
      const photos = $app.findRecordsByFilter(
        'job_photos',
        "job_id = '" + jobId + "' && type = 'end'",
        '-created',
        1,
        0,
      )
      if (photos && photos.length > 0) hasEndPhoto = true
    } catch (_) {}
    if (!hasEndPhoto) {
      return e.json(400, {
        ok: false,
        error:
          'É obrigatório tirar uma foto de evidência do trabalho concluído antes de finalizar o serviço.',
        code: 'MISSING_END_PHOTO',
      })
    }

    // --- complete the job ---------------------------------------------------
    const nowIso = new Date().toISOString()
    job.set('status', 'completed')
    job.set('completed_at', nowIso)
    $app.save(job)

    // --- start the guarantee window (payment release) -----------------------
    // Mirrors the release-payment endpoint: set payment_status=held and
    // payment_hold_until = now + guarantee_period_days (default 7).
    let guaranteeDays = 7
    try {
      const rows = $app.findRecordsByFilter('settings', '1=1', '', 1, 0)
      if (rows.length > 0) {
        const gd = rows[0].getFloat('guarantee_period_days')
        if (gd > 0) guaranteeDays = gd
      }
    } catch (_) {}

    const holdUntil = new Date(Date.now() + guaranteeDays * 24 * 3600 * 1000).toISOString()
    const prevPaymentStatus = job.getString('payment_status')
    // Only move into `held` if it makes sense for the current payment state
    // (authorized / held / empty). Avoid clobbering captured/disputed/cancelled.
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
      $app.save(job)
    }

    return e.json(200, {
      ok: true,
      job: job,
      completed_at: nowIso,
      payment_status: job.getString('payment_status'),
      hold_until: holdUntil,
    })
  },
  $apis.requireAuth(),
)
