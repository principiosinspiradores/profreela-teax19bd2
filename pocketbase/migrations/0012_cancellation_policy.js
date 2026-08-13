// Cancellation policy (Uber-style) — asymmetric rules for client vs professional.
//
// New collections:
//   cancellation_policies  — single-row config of fees/grace windows (public read, admin write)
//   cancellations          — audit log of every cancellation (who, when, reason, penalty)
//
// jobs  += cancelled_by, cancelled_at, cancellation_reason, penalty_amount
// users += suspended (bool, default false) — suspended pros cannot accept jobs / appear in searches
//
// Default policy seeded from the spec:
//   Client:   <=2h after confirm = free; >24h before = 10%; 4-24h before = 30%; <4h before = 50%
//             penalty split 50% platform / 50% pro
//   Pro:      <=1h after accept = free; >24h before = R$25; 4-24h before = R$50; <4h before = R$80
//             penalty 100% platform; 3 cancellations/month => auto suspension
migrate(
  (app) => {
    // ------------------------------------------------------------------
    // 1) cancellation_policies collection
    // ------------------------------------------------------------------
    let policiesCol
    try {
      policiesCol = app.findCollectionByNameOrId('cancellation_policies')
    } catch (_) {
      policiesCol = new Collection({
        name: 'cancellation_policies',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          // --- Client rules -------------------------------------------------
          // Grace window (hours) after confirmation during which cancellation is free.
          { name: 'client_grace_hours', type: 'number', required: false, min: 0 },
          // Penalty % applied when cancelling >24h before the scheduled time.
          { name: 'client_pct_over_24h', type: 'number', required: false, min: 0, max: 100 },
          // Penalty % applied when cancelling between 4h and 24h before.
          { name: 'client_pct_4_to_24h', type: 'number', required: false, min: 0, max: 100 },
          // Penalty % applied when cancelling <4h before.
          { name: 'client_pct_under_4h', type: 'number', required: false, min: 0, max: 100 },
          // Share of the client penalty routed to the professional (rest to platform). 0-100.
          { name: 'client_pro_share_pct', type: 'number', required: false, min: 0, max: 100 },

          // --- Professional rules -------------------------------------------
          // Grace window (hours) after acceptance during which cancellation is free.
          { name: 'pro_grace_hours', type: 'number', required: false, min: 0 },
          // Fixed fee (R$) when cancelling >24h before.
          { name: 'pro_fee_over_24h', type: 'number', required: false, min: 0 },
          // Fixed fee (R$) when cancelling between 4h and 24h before.
          { name: 'pro_fee_4_to_24h', type: 'number', required: false, min: 0 },
          // Fixed fee (R$) when cancelling <4h before.
          { name: 'pro_fee_under_4h', type: 'number', required: false, min: 0 },
          // Monthly cancellation limit before automatic suspension.
          { name: 'pro_monthly_limit', type: 'number', required: false, min: 1, onlyInt: true },

          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [],
      })
      app.save(policiesCol)
    }

    // Seed a single default policy row (idempotent).
    let existing = []
    try {
      existing = app.findRecordsByFilter('cancellation_policies', '1=1', '', 1, 0)
    } catch (_) {}
    if (existing.length === 0) {
      const rec = new Record(policiesCol)
      rec.set('client_grace_hours', 2)
      rec.set('client_pct_over_24h', 10)
      rec.set('client_pct_4_to_24h', 30)
      rec.set('client_pct_under_4h', 50)
      rec.set('client_pro_share_pct', 50)
      rec.set('pro_grace_hours', 1)
      rec.set('pro_fee_over_24h', 25)
      rec.set('pro_fee_4_to_24h', 50)
      rec.set('pro_fee_under_4h', 80)
      rec.set('pro_monthly_limit', 3)
      app.save(rec)
    }

    // ------------------------------------------------------------------
    // 2) cancellations collection
    // ------------------------------------------------------------------
    let cancCol
    try {
      cancCol = app.findCollectionByNameOrId('cancellations')
    } catch (_) {
      const jobsId = app.findCollectionByNameOrId('jobs').id
      const usersId = '_pb_users_auth_'
      cancCol = new Collection({
        name: 'cancellations',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          {
            name: 'job_id',
            type: 'relation',
            required: true,
            collectionId: jobsId,
            cascadeDelete: true,
            maxSelect: 1,
          },
          // cancelled_by is the user id of whoever cancelled; role stored on cancelled_by_role.
          {
            name: 'cancelled_by',
            type: 'relation',
            required: true,
            collectionId: usersId,
            maxSelect: 1,
          },
          {
            name: 'cancelled_by_role',
            type: 'select',
            required: false,
            values: ['client', 'pro'],
            maxSelect: 1,
          },
          { name: 'cancelled_at', type: 'date', required: true },
          { name: 'reason', type: 'text', required: false },
          { name: 'penalty_amount', type: 'number', required: false, min: 0 },
          // pending = to be charged/deducted; charged = collected; waived = no charge
          {
            name: 'penalty_status',
            type: 'select',
            required: false,
            values: ['pending', 'charged', 'waived'],
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_cancellations_job ON cancellations (job_id)',
          'CREATE INDEX idx_cancellations_by ON cancellations (cancelled_by)',
        ],
      })
      app.save(cancCol)
    }

    // ------------------------------------------------------------------
    // 3) jobs += cancellation fields
    // ------------------------------------------------------------------
    const jobsCol = app.findCollectionByNameOrId('jobs')
    if (!jobsCol.fields.getByName('cancelled_by')) {
      jobsCol.fields.add(new TextField({ name: 'cancelled_by' }))
    }
    if (!jobsCol.fields.getByName('cancelled_at')) {
      jobsCol.fields.add(new DateField({ name: 'cancelled_at' }))
    }
    if (!jobsCol.fields.getByName('cancellation_reason')) {
      jobsCol.fields.add(new TextField({ name: 'cancellation_reason' }))
    }
    if (!jobsCol.fields.getByName('penalty_amount')) {
      jobsCol.fields.add(new NumberField({ name: 'penalty_amount', min: 0 }))
    }
    app.save(jobsCol)

    // ------------------------------------------------------------------
    // 4) users += suspended (bool, default false)
    // ------------------------------------------------------------------
    const usersCol = app.findCollectionByNameOrId('users')
    if (!usersCol.fields.getByName('suspended')) {
      usersCol.fields.add(new BoolField({ name: 'suspended' }))
    }
    app.save(usersCol)
  },
  (app) => {
    // Revert: remove added fields + drop new collections.
    try {
      const jobsCol = app.findCollectionByNameOrId('jobs')
      ;['cancelled_by', 'cancelled_at', 'cancellation_reason', 'penalty_amount'].forEach((n) => {
        const f = jobsCol.fields.getByName(n)
        if (f) jobsCol.fields.remove(f)
      })
      app.save(jobsCol)
    } catch (_) {}

    try {
      const usersCol = app.findCollectionByNameOrId('users')
      const f = usersCol.fields.getByName('suspended')
      if (f) usersCol.fields.remove(f)
      app.save(usersCol)
    } catch (_) {}

    try {
      app.delete(app.findCollectionByNameOrId('cancellations'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('cancellation_policies'))
    } catch (_) {}
  },
)
