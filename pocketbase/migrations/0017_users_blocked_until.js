// Adds a `blocked_until` date field to the `users` collection.
//
// When a professional cancels an `accepted` job, the cancel-job hook reopens
// the job AND blocks the pro from accepting any new job for 24 hours. The
// block is time-bounded by `blocked_until`; when that instant is in the past
// the pro is free to accept again. Optional, non-sensitive (self-readable on
// the already self/admin-scoped users collection).
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('users')
    if (!col.fields.getByName('blocked_until')) {
      col.fields.add(new DateField({ name: 'blocked_until' }))
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('users')
    const f = col.fields.getByName('blocked_until')
    if (f) col.fields.remove(f)
    app.save(col)
  },
)
