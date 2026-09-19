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

    // --- deadline calculation (started_at + hours + 2h tolerance) ----------
    const nowMs = Date.now()
    const startedAtStr = job.getString('started_at') || job.getString('clocked_in_at')
    let isPastDeadline = false
    if (startedAtStr) {
      const startMs = new Date(startedAtStr).getTime()
      if (!isNaN(startMs)) {
        let hrs = job.getFloat('hours')
        if (!hrs || hrs <= 0) hrs = 1
        const deadlineMs = startMs + hrs * 60 * 60 * 1000 + 2 * 60 * 60 * 1000
        if (nowMs > deadlineMs) {
          isPastDeadline = true
        }
      }
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

    let isOutsideGeofence = false
    if (hasJobCoords && hasProCoords) {
      const dist = haversineMeters(proLat, proLng, jobLat, jobLng)
      if (dist > GEOFENCE_RADIUS_M) {
        isOutsideGeofence = true
        // If not past deadline, strictly block finalization outside the geofence
        if (!isPastDeadline) {
          return e.json(403, {
            ok: false,
            error: 'Você precisa estar no local para finalizar o serviço.',
            code: 'OUTSIDE_GEOFENCE',
            distance_m: Math.round(dist),
            radius_m: GEOFENCE_RADIUS_M,
          })
        }
      }
    }

    // --- end evidence photo (required in all cases) -------------------------
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
    const nowIso = new Date(nowMs).toISOString()
    const completedBy = isPastDeadline ? 'pro_late' : 'pro'
    job.set('status', 'completed')
    job.set('completed_at', nowIso)
    job.set('completed_by', completedBy)
    $app.save(job)

    // If finished late and outside the perimeter, notify the client
    if (isPastDeadline && isOutsideGeofence) {
      const customerId = job.getString('customer_id')
      if (customerId) {
        try {
          const notifCol = $app.findCollectionByNameOrId('notifications')
          if (notifCol) {
            const clientNotif = new Record(notifCol)
            clientNotif.set('user_id', customerId)
            clientNotif.set('type', 'system')
            clientNotif.set('title', 'Serviço finalizado após o prazo')
            clientNotif.set(
              'message',
              'O serviço foi finalizado após o horário previsto e fora do perímetro do local.',
            )
            clientNotif.set('job_id', jobId)
            clientNotif.set('read_status', false)
            $app.save(clientNotif)
          }
        } catch (err) {
          console.log('[finish_job] falha ao notificar cliente sobre pro_late:', err)
        }
      }
    }

    // --- start the 24h guarantee window (payment release) -------------------
    // In the pay-at-request flow the payment is already `held` from job
    // creation (captured by the platform, in escrow). Completion starts the
    // release window: payment_hold_until = completed_at + guarantee_period_days
    // (now 1 day = 24h). The release_held_payments cron flips it to `released`.
    let guaranteeDays = 1
    try {
      const rows = $app.findRecordsByFilter('settings', '1=1', '', 1, 0)
      if (rows.length > 0) {
        const gd = rows[0].getFloat('guarantee_period_days')
        if (gd > 0) guaranteeDays = gd
      }
    } catch (_) {}

    const holdUntil = new Date(Date.now() + guaranteeDays * 24 * 3600 * 1000).toISOString()
    const prevPaymentStatus = job.getString('payment_status')
    // Move into `held` + set the release window. In the pay-at-request flow the
    // payment is already `held`, so this mainly stamps payment_hold_until. For
    // legacy `authorized` / empty states, also move to `held`. Never clobber a
    // terminal state (captured/disputed/cancelled/refunded).
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
