migrate(
  (app) => {
    // 1. Add payment_method and payment_installments to jobs
    const jobsCol = app.findCollectionByNameOrId('jobs')
    const jobsId = jobsCol.id

    if (!jobsCol.fields.getByName('payment_method')) {
      jobsCol.fields.add(
        new TextField({
          name: 'payment_method',
          required: false,
        }),
      )
    }

    if (!jobsCol.fields.getByName('payment_installments')) {
      jobsCol.fields.add(
        new NumberField({
          name: 'payment_installments',
          required: false,
        }),
      )
    }

    app.save(jobsCol)

    // 2. Create payment_events collection
    // Rules: null for all (only backend/admin can read/write)
    let eventsCol = null
    try {
      eventsCol = app.findCollectionByNameOrId('payment_events')
    } catch (_) {}

    if (!eventsCol) {
      eventsCol = new Collection({
        name: 'payment_events',
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'job_id',
            type: 'relation',
            required: false,
            collectionId: jobsId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'payment_intent_id',
            type: 'text',
            required: false,
          },
          {
            name: 'type',
            type: 'text',
            required: true, // create | capture | refund | webhook | error
          },
          {
            name: 'provider_status',
            type: 'text',
            required: false,
          },
          {
            name: 'payload',
            type: 'json',
            required: false,
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
          'CREATE INDEX idx_payment_events_job ON payment_events (job_id)',
          'CREATE INDEX idx_payment_events_intent ON payment_events (payment_intent_id)',
          'CREATE INDEX idx_payment_events_type ON payment_events (type)',
        ],
      })
      app.save(eventsCol)
    }
  },
  (app) => {
    try {
      const eCol = app.findCollectionByNameOrId('payment_events')
      app.delete(eCol)
    } catch (_) {}
    try {
      const jobsCol = app.findCollectionByNameOrId('jobs')
      const f1 = jobsCol.fields.getByName('payment_method')
      if (f1) jobsCol.fields.remove(f1)
      const f2 = jobsCol.fields.getByName('payment_installments')
      if (f2) jobsCol.fields.remove(f2)
      app.save(jobsCol)
    } catch (_) {}
  },
)
