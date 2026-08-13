// Recomputes the denormalized rating_avg / rating_count on the reviewed pro
// after a review is created, then applies low-rating penalties (warning /
// suspension) when the pro's average drops below thresholds. Mirrors the
// cancellation-penalty model: low scores create moderation_logs rows and, if
// the average stays below 3.0 after at least 3 reviews, suspend the pro.
//
// Hook type: onRecordAfterCreateSuccess on `reviews`. Fires for every review
// creation (including the /backend/v1/reviews route and any direct API write).
onRecordAfterCreateSuccess((e) => {
  const review = e.record
  if (!review) {
    e.next()
    return
  }

  const recipientId = review.getString('recipient_id')
  if (!recipientId) {
    e.next()
    return
  }

  // --- recompute denormalized average ------------------------------------
  let proRecord = null
  try {
    proRecord = $app.findFirstRecordByData('users', 'id', recipientId)
  } catch (err) {
    e.next()
    return
  }

  let reviews = []
  try {
    reviews = $app.findRecordsByFilter(
      'reviews',
      "recipient_id = '" + recipientId + "'",
      '-created',
      200,
      0,
    )
  } catch (_) {}

  const count = reviews.length
  let sum = 0
  for (let i = 0; i < reviews.length; i++) {
    sum += reviews[i].getFloat('rating')
  }
  const avg = count > 0 ? sum / count : 0

  proRecord.set('rating_avg', Math.round(avg * 100) / 100)
  proRecord.set('rating_count', count)
  $app.save(proRecord)

  // --- low-rating penalties (only with enough signal) --------------------
  // Requires at least 3 reviews; below 3.0 average → warning; below 2.0
  // average → suspend (set suspended=true) and create a block moderation log.
  if (count >= 3) {
    const LOW_WARNING = 3.0
    const LOW_SUSPEND = 2.0

    if (avg < LOW_SUSPEND) {
      // Suspend the pro (mirrors the cancellation suspension model).
      if (!proRecord.getBool('suspended')) {
        proRecord.set('suspended', true)
        $app.save(proRecord)
      }
      try {
        const modCol = $app.findCollectionByNameOrId('moderation_logs')
        const log = new Record(modCol)
        log.set('pro_id', recipientId)
        log.set('type', 'block')
        log.set(
          'reason',
          'Nota média abaixo de 2.0 (' + avg.toFixed(2) + ') após ' + count + ' avaliações',
        )
        $app.save(log)
      } catch (_) {}
    } else if (avg < LOW_WARNING) {
      // Warn once per average band crossing (avoid spamming: only if no
      // recent warning for low rating exists in the last 30 days).
      const sinceIso = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
      let recent = []
      try {
        recent = $app.findRecordsByFilter(
          'moderation_logs',
          "pro_id = '" + recipientId + "' && type = 'warning' && created >= '" + sinceIso + "'",
          '-created',
          1,
          0,
        )
      } catch (_) {}
      if (!recent || recent.length === 0) {
        try {
          const modCol = $app.findCollectionByNameOrId('moderation_logs')
          const log = new Record(modCol)
          log.set('pro_id', recipientId)
          log.set('type', 'warning')
          log.set(
            'reason',
            'Nota média abaixo de 3.0 (' + avg.toFixed(2) + ') após ' + count + ' avaliações',
          )
          $app.save(log)
        } catch (_) {}
      }
    }
  }

  e.next()
}, 'reviews')
