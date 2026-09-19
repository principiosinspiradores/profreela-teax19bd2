// Add auto_completed and completed_by fields to jobs and repair zombie job iiwnwnyfabotde8.
//
// 1) Add auto_completed (bool, default false).
// 2) Add completed_by (text, values: 'pro' | 'auto_timeout' | 'pro_late').
// 3) Repair data: close zombie job iiwnwnyfabotde8:
//    status='completed', completed_at=now, auto_completed=true, completed_by='auto_timeout'.
//    Keep payment_status intact ('captured').
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('jobs')

    if (!col.fields.getByName('auto_completed')) {
      col.fields.add(
        new BoolField({
          name: 'auto_completed',
          required: false,
        }),
      )
    }

    if (!col.fields.getByName('completed_by')) {
      col.fields.add(
        new TextField({
          name: 'completed_by',
          required: false,
        }),
      )
    }

    app.save(col)

    // Data repair: close zombie job iiwnwnyfabotde8 if it exists and is still in_progress
    const nowIso = new Date().toISOString()
    try {
      const job = app.findFirstRecordByData('jobs', 'id', 'iiwnwnyfabotde8')
      if (job && job.getString('status') === 'in_progress') {
        job.set('status', 'completed')
        job.set('completed_at', nowIso)
        job.set('auto_completed', true)
        job.set('completed_by', 'auto_timeout')
        // Do NOT change payment_status - it is already 'captured' (terminal state)
        app.save(job)
      }
    } catch (_) {
      // Job not found or DB query fallback
      app
        .db()
        .newQuery(
          "UPDATE jobs SET status = 'completed', completed_at = {:now}, auto_completed = 1, completed_by = 'auto_timeout' " +
            "WHERE id = 'iiwnwnyfabotde8' AND status = 'in_progress'",
        )
        .bind({ now: nowIso })
        .execute()
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('jobs')
      const f1 = col.fields.getByName('auto_completed')
      if (f1) col.fields.remove(f1)
      const f2 = col.fields.getByName('completed_by')
      if (f2) col.fields.remove(f2)
      app.save(col)
    } catch (_) {}
  },
)
