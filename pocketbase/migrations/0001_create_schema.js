migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.fields.add(
      new SelectField({
        name: 'role',
        values: ['client', 'pro', 'admin'],
        maxSelect: 1,
        required: true,
      }),
    )
    users.fields.add(
      new SelectField({ name: 'status', values: ['pending', 'active', 'blocked'], maxSelect: 1 }),
    )
    users.fields.add(new BoolField({ name: 'terms_accepted' }))
    users.fields.add(new NumberField({ name: 'latitude' }))
    users.fields.add(new NumberField({ name: 'longitude' }))
    users.fields.add(new TextField({ name: 'phone' }))
    app.save(users)

    const services = new Collection({
      name: 'services',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: "@request.auth.role = 'admin'",
      updateRule: "@request.auth.role = 'admin'",
      deleteRule: "@request.auth.role = 'admin'",
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'base_price', type: 'number', required: true },
        { name: 'description', type: 'text' },
        { name: 'icon', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(services)

    const jobs = new Collection({
      name: 'jobs',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.role = 'admin'",
      fields: [
        {
          name: 'customer_id',
          type: 'relation',
          collectionId: users.id,
          required: true,
          maxSelect: 1,
        },
        { name: 'pro_id', type: 'relation', collectionId: users.id, maxSelect: 1 },
        {
          name: 'service_id',
          type: 'relation',
          collectionId: services.id,
          required: true,
          maxSelect: 1,
        },
        {
          name: 'status',
          type: 'select',
          values: ['pending', 'accepted', 'in_progress', 'completed', 'cancelled'],
          required: true,
          maxSelect: 1,
        },
        { name: 'price', type: 'number', required: true },
        { name: 'type', type: 'select', values: ['scheduled', 'emergency'], maxSelect: 1 },
        { name: 'address', type: 'text', required: true },
        { name: 'latitude', type: 'number' },
        { name: 'longitude', type: 'number' },
        { name: 'scheduled_at', type: 'date' },
        { name: 'completed_at', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(jobs)

    const availability = new Collection({
      name: 'availability',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'pro_id', type: 'relation', collectionId: users.id, required: true, maxSelect: 1 },
        {
          name: 'type',
          type: 'select',
          values: ['immediate', 'recurring'],
          required: true,
          maxSelect: 1,
        },
        { name: 'start_date', type: 'date' },
        { name: 'end_date', type: 'date' },
        { name: 'active', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(availability)

    const reviews = new Collection({
      name: 'reviews',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.role = 'admin'",
      fields: [
        { name: 'job_id', type: 'relation', collectionId: jobs.id, required: true, maxSelect: 1 },
        {
          name: 'author_id',
          type: 'relation',
          collectionId: users.id,
          required: true,
          maxSelect: 1,
        },
        {
          name: 'recipient_id',
          type: 'relation',
          collectionId: users.id,
          required: true,
          maxSelect: 1,
        },
        { name: 'rating', type: 'number', required: true, min: 1, max: 5 },
        { name: 'comment', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(reviews)

    const documents = new Collection({
      name: 'documents',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'user_id', type: 'relation', collectionId: users.id, required: true, maxSelect: 1 },
        { name: 'type', type: 'text', required: true },
        {
          name: 'file',
          type: 'file',
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
        },
        {
          name: 'status',
          type: 'select',
          values: ['pending', 'approved', 'rejected'],
          required: true,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(documents)

    const notifications = new Collection({
      name: 'notifications',
      type: 'base',
      listRule: '@request.auth.id = user_id',
      viewRule: '@request.auth.id = user_id',
      createRule: "@request.auth.id != ''",
      updateRule: '@request.auth.id = user_id',
      deleteRule: '@request.auth.id = user_id',
      fields: [
        { name: 'user_id', type: 'relation', collectionId: users.id, required: true, maxSelect: 1 },
        { name: 'title', type: 'text', required: true },
        { name: 'message', type: 'text', required: true },
        { name: 'read_status', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(notifications)

    const chats = new Collection({
      name: 'chats',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.role = 'admin'",
      fields: [
        { name: 'job_id', type: 'relation', collectionId: jobs.id, required: true, maxSelect: 1 },
        {
          name: 'participant_ids',
          type: 'relation',
          collectionId: users.id,
          required: true,
          maxSelect: 2,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(chats)

    const messages = new Collection({
      name: 'messages',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.role = 'admin'",
      fields: [
        { name: 'chat_id', type: 'relation', collectionId: chats.id, required: true, maxSelect: 1 },
        {
          name: 'sender_id',
          type: 'relation',
          collectionId: users.id,
          required: true,
          maxSelect: 1,
        },
        { name: 'text', type: 'text', required: true },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(messages)

    const banners = new Collection({
      name: 'banners',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: "@request.auth.role = 'admin'",
      updateRule: "@request.auth.role = 'admin'",
      deleteRule: "@request.auth.role = 'admin'",
      fields: [
        { name: 'image_url', type: 'url', required: true },
        { name: 'link', type: 'url' },
        { name: 'active', type: 'bool' },
        { name: 'city', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(banners)

    const moderation_logs = new Collection({
      name: 'moderation_logs',
      type: 'base',
      listRule: "@request.auth.role = 'admin'",
      viewRule: "@request.auth.role = 'admin'",
      createRule: "@request.auth.role = 'admin'",
      updateRule: "@request.auth.role = 'admin'",
      deleteRule: "@request.auth.role = 'admin'",
      fields: [
        { name: 'pro_id', type: 'relation', collectionId: users.id, required: true, maxSelect: 1 },
        {
          name: 'type',
          type: 'select',
          values: ['warning', 'block'],
          required: true,
          maxSelect: 1,
        },
        { name: 'reason', type: 'text', required: true },
        { name: 'duration', type: 'number' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(moderation_logs)
  },
  (app) => {},
)
