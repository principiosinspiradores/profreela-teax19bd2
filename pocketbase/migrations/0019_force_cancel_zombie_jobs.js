// Follow-up to 0018: that migration's `findFirstRecordByData('jobs','id',id)`
// lookup silently no-ops for the system `id` field, so the two zombie jobs
// were never actually cancelled. Use a raw SQL UPDATE keyed on id instead.
//
// Idempotent: only flips records that are still `pending`.
migrate(
  (app) => {
    app
      .db()
      .newQuery(
        "UPDATE jobs SET status = 'cancelled' " +
          "WHERE id IN ('umgluhcokqnv3sf', '1lrq56nxz5zfsij') " +
          "AND status = 'pending'",
      )
      .execute()
  },
  (app) => {
    // No-op revert.
  },
)
