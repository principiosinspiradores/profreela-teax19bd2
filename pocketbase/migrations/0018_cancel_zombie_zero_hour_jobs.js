// Cancels two legacy "zombie" jobs created in April 2026 (before the scheduling
// system existed) that ended up with `hours: 0`. They were reactivated during
// testing and show up on the pro dashboard as `pending`, where accepting them
// fails with "Dados incompletos". Setting them to `cancelled` hides them.
//
// Idempotent: only touches records that are still pending.
migrate(
  (app) => {
    const ids = ['umgluhcokqnv3sf', '1lrq56nxz5zfsij']
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]
      try {
        const job = $app.findFirstRecordByData('jobs', 'id', id)
        if (!job) continue
        if (job.getString('status') === 'pending') {
          job.set('status', 'cancelled')
          $app.save(job)
        }
      } catch (_) {
        // Record may have already been deleted — nothing to do.
      }
    }
  },
  (app) => {
    // No-op revert: re-opening historically-cancelled test jobs would only
    // reintroduce the bug this migration cleans up.
  },
)
