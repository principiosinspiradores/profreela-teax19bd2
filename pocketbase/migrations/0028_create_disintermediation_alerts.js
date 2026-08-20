migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('disintermediation_alerts')
      return
    } catch (_) {}

    const jobsId = app.findCollectionByNameOrId('jobs').id
    const usersId = '_pb_users_auth_'

    const col = new Collection({
      name: 'disintermediation_alerts',
      type: 'base',
      listRule: "@request.auth.role = 'admin'",
      viewRule: "@request.auth.role = 'admin'",
      createRule: null, // Only backend / admin creates
      updateRule: "@request.auth.role = 'admin'",
      deleteRule: "@request.auth.role = 'admin'",
      fields: [
        {
          name: 'job',
          type: 'relation',
          required: true,
          collectionId: jobsId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'pro_id',
          type: 'relation',
          collectionId: usersId,
          maxSelect: 1,
        },
        {
          name: 'client_id',
          type: 'relation',
          collectionId: usersId,
          maxSelect: 1,
        },
        {
          name: 'detected_content',
          type: 'text',
          required: true,
        },
        {
          name: 'pattern_matched',
          type: 'text',
        },
        {
          name: 'created',
          type: 'autodate',
          onCreate: true,
          onUpdate: false,
        },
        {
          name: 'updated',
          type: 'autodate',
          onCreate: true,
          onUpdate: true,
        },
      ],
      indexes: [
        'CREATE INDEX idx_disintermediation_alerts_job ON disintermediation_alerts (job)',
        'CREATE INDEX idx_disintermediation_alerts_created ON disintermediation_alerts (created DESC)',
      ],
    })

    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('disintermediation_alerts')
      app.delete(col)
    } catch (_) {}
  },
)
