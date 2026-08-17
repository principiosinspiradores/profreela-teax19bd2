// Adds a `started_at` date field to the `jobs` collection, stamped when a pro
// clocks in and the job moves to `in_progress`. Mirrors `accepted_at` /
// `completed_at` so the transit/working timeline is auditable.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('jobs')

    // Guard: skip if the field already exists (idempotent).
    if (!col.fields.getByName('started_at')) {
      col.fields.add(new DateField({ name: 'started_at' }))
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('jobs')
    const f = col.fields.getByName('started_at')
    if (f) {
      col.fields.remove(f)
      app.save(col)
    }
  },
)
