// Adds `type` (select) and `job_id` (relation -> jobs) to the `notifications`
// collection so notifications can be categorized (new_job, review_request, ...)
// and linked back to the job that triggered them.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('notifications')

    if (!col.fields.getByName('type')) {
      col.fields.add(
        new SelectField({
          name: 'type',
          required: false,
          values: ['new_job', 'review_request', 'payment', 'system'],
          maxSelect: 1,
        }),
      )
    }

    if (!col.fields.getByName('job_id')) {
      col.fields.add(
        new RelationField({
          name: 'job_id',
          required: false,
          collectionId: app.findCollectionByNameOrId('jobs').id,
          cascadeDelete: false,
          minSelect: 0,
          maxSelect: 1,
        }),
      )
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('notifications')
    const typeField = col.fields.getByName('type')
    if (typeField) col.fields.remove(typeField)
    const jobField = col.fields.getByName('job_id')
    if (jobField) col.fields.remove(jobField)
    app.save(col)
  },
)
