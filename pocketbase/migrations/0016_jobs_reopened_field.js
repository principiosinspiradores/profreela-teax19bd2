// Adds a `reopened` boolean to the `jobs` collection.
//
// When a professional cancels an `accepted` job, the cancel-job hook reopens
// the job (status -> pending, pro cleared) instead of cancelling it, so other
// pros can pick it up. `reopened = true` flags these reopened jobs so the UI
// can distinguish them from freshly-created ones (e.g. for badges/labels).
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('jobs')
    if (!col.fields.getByName('reopened')) {
      col.fields.add(new BoolField({ name: 'reopened' }))
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('jobs')
    const f = col.fields.getByName('reopened')
    if (f) col.fields.remove(f)
    app.save(col)
  },
)
