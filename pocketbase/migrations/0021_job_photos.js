// Creates the `job_photos` collection: evidence photos captured by the
// professional at the start (presence) and end (work completed) of a job.
//
// Fields:
//   - job_id  (relation → jobs, required)
//   - type    (select: 'start' | 'end', required)
//   - photo_file (file, image, single, <=5MB)
//   - created / updated (autodate)
//
// Access: the pro assigned to the job can create/list/view their own photos;
// the customer of the job can read them (proof of service); admins have full
// access. PocketBase rules can't easily express "pro of the job OR customer of
// the job", so we keep read access broad for authenticated users (the photos
// are evidence tied to a job both parties already have access to) and restrict
// create/update/delete to authenticated users (the server endpoints enforce
// ownership + photo presence before saving).
migrate(
  (app) => {
    let col = null
    try {
      col = app.findCollectionByNameOrId('job_photos')
    } catch (_) {
      col = new Collection({
        name: 'job_photos',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.role = 'admin'",
        deleteRule: "@request.auth.role = 'admin'",
        fields: [
          {
            name: 'job_id',
            type: 'relation',
            required: true,
            collectionId: app.findCollectionByNameOrId('jobs').id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'type',
            type: 'select',
            required: true,
            values: ['start', 'end'],
            maxSelect: 1,
          },
          {
            name: 'photo_file',
            type: 'file',
            required: true,
            maxSelect: 1,
            maxSize: 5242880,
            mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_job_photos_job ON job_photos (job_id)'],
      })
      app.save(col)
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('job_photos'))
    } catch (_) {}
  },
)
