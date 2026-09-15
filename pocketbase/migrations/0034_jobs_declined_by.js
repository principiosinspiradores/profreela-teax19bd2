// Add declined_by field to jobs and cancel expired pending zombie jobs.
//
// 1) Add declined_by (relation -> users, multiple, no cascade delete).
// 2) Data repair: cancel expired pending zombie jobs (>2 hours in the past)
//    with payment_status IN ('refunded', 'cancelled', '').
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('jobs')

    if (!col.fields.getByName('declined_by')) {
      col.fields.add(
        new RelationField({
          name: 'declined_by',
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 999,
          required: false,
        }),
      )
      app.save(col)
    }

    // Data repair: cancel zombie pending jobs that expired >2h ago without acceptance
    const nowIso = new Date().toISOString()
    app
      .db()
      .newQuery(
        'UPDATE jobs SET ' +
          "status = 'cancelled', " +
          "cancellation_reason = 'expired_no_acceptance', " +
          'cancelled_at = {:now} ' +
          "WHERE status = 'pending' " +
          "AND scheduled_at != '' AND scheduled_at IS NOT NULL " +
          "AND scheduled_at < datetime('now', '-2 hours') " +
          "AND payment_status IN ('refunded', 'cancelled', '')",
      )
      .bind({ now: nowIso })
      .execute()
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('jobs')
      const f = col.fields.getByName('declined_by')
      if (f) {
        col.fields.remove(f)
        app.save(col)
      }
    } catch (_) {}
  },
)
