// POST /backend/v1/reviews   (auth required)
//   body: { jobId, rating, comment? }
//
// Validates a review for a completed job and creates a `reviews` record.
// - Only the job's customer can review.
// - The job must be `completed` and have a pro assigned.
// - A job can be reviewed at most once by its customer (enforced by a unique
//   index, but we pre-check for a friendlier error).
//
// The denormalized `rating_avg` / `rating_count` on the professional and the
// low-rating penalty logic live in on_review_create.js (model hook), so they
// fire regardless of how the review record is created.
routerAdd(
  'POST',
  '/backend/v1/reviews',
  (e) => {
    const auth = e.requestInfo().auth
    if (!auth) {
      return e.json(401, { ok: false, error: 'Autenticação necessária.' })
    }
    const authId = auth.getString('id')

    const body = e.requestInfo().body || {}
    const jobId = (body.jobId || '').toString().trim()
    const ratingRaw = body.rating
    const comment = (body.comment || '').toString().trim()

    if (!jobId) {
      return e.json(400, { ok: false, error: 'jobId é obrigatório.' })
    }
    const rating = Math.round(Number(ratingRaw))
    if (isNaN(rating) || rating < 1 || rating > 5) {
      return e.json(400, { ok: false, error: 'Nota inválida (use 1 a 5).' })
    }

    // --- load job -----------------------------------------------------------
    let job = null
    try {
      job = $app.findFirstRecordByData('jobs', 'id', jobId)
    } catch (_) {}
    if (!job) {
      return e.json(404, { ok: false, error: 'Serviço não encontrado.' })
    }

    const customerId = job.getString('customer_id')
    const proId = job.getString('pro_id')
    if (authId !== customerId) {
      return e.json(403, { ok: false, error: 'Apenas o cliente do serviço pode avaliar.' })
    }
    if (job.getString('status') !== 'completed') {
      return e.json(400, { ok: false, error: 'Só é possível avaliar serviços concluídos.' })
    }
    if (!proId) {
      return e.json(400, { ok: false, error: 'Este serviço não possui profissional para avaliar.' })
    }

    // --- one review per job+author (pre-check; unique index also enforces) --
    try {
      const existing = $app.findRecordsByFilter(
        'reviews',
        "job_id = '" + jobId + "' && author_id = '" + authId + "'",
        '-created',
        1,
        0,
      )
      if (existing && existing.length > 0) {
        return e.json(400, { ok: false, error: 'Você já avaliou este serviço.' })
      }
    } catch (_) {}

    // --- create the review --------------------------------------------------
    let reviewId = ''
    try {
      const col = $app.findCollectionByNameOrId('reviews')
      const rec = new Record(col)
      rec.set('job_id', jobId)
      rec.set('author_id', authId)
      rec.set('recipient_id', proId)
      rec.set('rating', rating)
      if (comment) rec.set('comment', comment)
      $app.save(rec)
      reviewId = rec.getString('id')
    } catch (err) {
      return e.json(500, { ok: false, error: 'Não foi possível registrar a avaliação.' })
    }

    return e.json(200, {
      ok: true,
      review_id: reviewId,
      job_id: jobId,
      recipient_id: proId,
      rating: rating,
    })
  },
  $apis.requireAuth(),
)
