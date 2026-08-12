// Adds an `hours` field to the `jobs` collection so the client can specify how
// many hours of service they need. The price calculation becomes
//   (basePrice * hours) + distanceFee, multiplied by the emergency factor.
//
// Existing jobs are backfilled to 1 so nothing breaks.
//
// jobs.hours : number, min 1, max 12, default 1
migrate(
  (app) => {
    const jobs = app.findCollectionByNameOrId('jobs')

    if (!jobs.fields.getByName('hours')) {
      jobs.fields.add(new NumberField({ name: 'hours', min: 1, max: 12, onlyInt: true }))
    }
    app.save(jobs)

    // Backfill existing rows to 1 (NULL otherwise).
    app.db().newQuery('UPDATE jobs SET hours = 1 WHERE hours IS NULL').execute()
  },
  (app) => {
    const jobs = app.findCollectionByNameOrId('jobs')
    const f = jobs.fields.getByName('hours')
    if (f) jobs.fields.remove(f)
    app.save(jobs)
  },
)
