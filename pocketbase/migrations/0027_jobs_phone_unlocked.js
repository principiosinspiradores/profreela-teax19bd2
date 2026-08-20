// Migration 0027: add emergency phone unlock flag to jobs collection
// Allows an admin to manually unlock the pro's real phone for a specific job/client.
migrate(
  (app) => {
    let jobsCol
    try {
      jobsCol = app.findCollectionByNameOrId('jobs')
    } catch (_) {
      return
    }

    if (!jobsCol.fields.getByName('phone_unlocked_for_client')) {
      jobsCol.fields.add(
        new BoolField({
          name: 'phone_unlocked_for_client',
          required: false,
        }),
      )
    }

    app.save(jobsCol)
  },
  (app) => {
    let jobsCol
    try {
      jobsCol = app.findCollectionByNameOrId('jobs')
    } catch (_) {
      return
    }

    const field = jobsCol.fields.getByName('phone_unlocked_for_client')
    if (field) {
      jobsCol.fields.remove(field)
      app.save(jobsCol)
    }
  },
)
