// Reviews denormalization + low-rating penalties + saved client locations.
//
// 1) users += rating_avg (number), rating_count (number)
//    Denormalized average rating + review count, kept in sync by the
//    on_review_create hook so cards/profiles can show the score without an
//    extra query. Publicly readable (users list/view rules already expose
//    the whole record to self/admin — these fields are non-sensitive).
//
// 2) reviews += indexes (recipient_id, job_id) and a unique (job_id, author_id)
//    index so a client can review a given job at most once.
//
// 3) saved_locations — addresses saved by a client for quick reuse when
//    requesting a service. Owner-only access.
migrate(
  (app) => {
    // ------------------------------------------------------------------
    // 1) users += rating_avg, rating_count
    // ------------------------------------------------------------------
    const usersCol = app.findCollectionByNameOrId('users')
    if (!usersCol.fields.getByName('rating_avg')) {
      usersCol.fields.add(new NumberField({ name: 'rating_avg', min: 0, max: 5 }))
    }
    if (!usersCol.fields.getByName('rating_count')) {
      usersCol.fields.add(new NumberField({ name: 'rating_count', min: 0, onlyInt: true }))
    }
    app.save(usersCol)

    // Backfill rating_avg / rating_count from existing reviews.
    try {
      app
        .db()
        .newQuery(`
        UPDATE users
        SET rating_count = COALESCE((
          SELECT COUNT(*) FROM reviews r WHERE r.recipient_id = users.id
        ), 0),
        rating_avg = COALESCE((
          SELECT AVG(r.rating) FROM reviews r WHERE r.recipient_id = users.id
        ), 0)
        WHERE role = 'pro'
      `)
        .execute()
    } catch (_) {}

    // ------------------------------------------------------------------
    // 2) reviews indexes (idempotent)
    // ------------------------------------------------------------------
    const reviewsCol = app.findCollectionByNameOrId('reviews')
    reviewsCol.addIndex('idx_reviews_recipient', false, 'recipient_id', '')
    reviewsCol.addIndex('idx_reviews_job', false, 'job_id', '')
    // Deduplicate before adding the unique index (keep the oldest per job+author).
    try {
      app
        .db()
        .newQuery(`
        DELETE FROM reviews WHERE id NOT IN (
          SELECT MIN(id) FROM reviews GROUP BY job_id, author_id
        )
      `)
        .execute()
    } catch (_) {}
    reviewsCol.addIndex('idx_reviews_job_author', true, 'job_id,author_id', '')
    app.save(reviewsCol)

    // ------------------------------------------------------------------
    // 3) saved_locations collection
    // ------------------------------------------------------------------
    let locationsCol
    try {
      locationsCol = app.findCollectionByNameOrId('saved_locations')
    } catch (_) {
      locationsCol = new Collection({
        name: 'saved_locations',
        type: 'base',
        listRule: "@request.auth.id != '' && client_id = @request.auth.id",
        viewRule: "@request.auth.id != '' && client_id = @request.auth.id",
        createRule: "@request.auth.id != '' && client_id = @request.auth.id",
        updateRule: "@request.auth.id != '' && client_id = @request.auth.id",
        deleteRule: "@request.auth.id != '' && client_id = @request.auth.id",
        fields: [
          {
            name: 'client_id',
            type: 'relation',
            required: true,
            collectionId: '_pb_users_auth_',
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'label', type: 'text', required: true },
          { name: 'address', type: 'text', required: true },
          { name: 'latitude', type: 'number', required: false },
          { name: 'longitude', type: 'number', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_saved_locations_client ON saved_locations (client_id)'],
      })
      app.save(locationsCol)
    }
  },
  (app) => {
    try {
      const usersCol = app.findCollectionByNameOrId('users')
      ;['rating_avg', 'rating_count'].forEach((n) => {
        const f = usersCol.fields.getByName(n)
        if (f) usersCol.fields.remove(f)
      })
      app.save(usersCol)
    } catch (_) {}

    try {
      const reviewsCol = app.findCollectionByNameOrId('reviews')
      ;['idx_reviews_recipient', 'idx_reviews_job', 'idx_reviews_job_author'].forEach((n) => {
        try {
          reviewsCol.removeIndex(n)
        } catch (_) {}
      })
      app.save(reviewsCol)
    } catch (_) {}

    try {
      app.delete(app.findCollectionByNameOrId('saved_locations'))
    } catch (_) {}
  },
)
