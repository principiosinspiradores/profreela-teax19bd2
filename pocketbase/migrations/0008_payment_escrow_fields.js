// Adds escrow / payment-tracking fields to the `jobs` collection and the
// configurable guarantee window + clock-in deadline to the `settings`
// collection.
//
// jobs.payment_status      : authorized | held | released | captured | disputed | cancelled
// jobs.payment_intent_id   : gateway-side payment intent / charge id
// jobs.payment_authorized_at : when the manual-capture authorization was created
// jobs.payment_hold_until  : end of the 7-day guarantee window (capture allowed)
// jobs.payment_released_at : when the capture + split was executed
// jobs.payment_disputed_at : when a dispute was opened (pauses the hold timer)
// jobs.dispute_reason      : free-text reason supplied by the client
// jobs.clocked_in_at       : when the pro did clock-in (used by the 24h rule)
// jobs.accepted_at         : when the pro accepted (start of the 24h clock-in window)
//
// settings.guarantee_period_days : default 7
// settings.clock_in_deadline_hours : default 24
migrate(
  (app) => {
    // --- jobs collection: add escrow fields ---
    const jobs = app.findCollectionByNameOrId('jobs')

    if (!jobs.fields.getByName('payment_status')) {
      jobs.fields.add(
        new SelectField({
          name: 'payment_status',
          required: false,
          values: ['authorized', 'held', 'released', 'captured', 'disputed', 'cancelled'],
          maxSelect: 1,
        }),
      )
    }
    if (!jobs.fields.getByName('payment_intent_id')) {
      jobs.fields.add(new TextField({ name: 'payment_intent_id' }))
    }
    if (!jobs.fields.getByName('payment_authorized_at')) {
      jobs.fields.add(new DateField({ name: 'payment_authorized_at' }))
    }
    if (!jobs.fields.getByName('payment_hold_until')) {
      jobs.fields.add(new DateField({ name: 'payment_hold_until' }))
    }
    if (!jobs.fields.getByName('payment_released_at')) {
      jobs.fields.add(new DateField({ name: 'payment_released_at' }))
    }
    if (!jobs.fields.getByName('payment_disputed_at')) {
      jobs.fields.add(new DateField({ name: 'payment_disputed_at' }))
    }
    if (!jobs.fields.getByName('dispute_reason')) {
      jobs.fields.add(new TextField({ name: 'dispute_reason' }))
    }
    if (!jobs.fields.getByName('clocked_in_at')) {
      jobs.fields.add(new DateField({ name: 'clocked_in_at' }))
    }
    if (!jobs.fields.getByName('accepted_at')) {
      jobs.fields.add(new DateField({ name: 'accepted_at' }))
    }
    app.save(jobs)

    // --- settings collection: add guarantee window + clock-in deadline ---
    const settings = app.findCollectionByNameOrId('settings')
    if (!settings.fields.getByName('guarantee_period_days')) {
      settings.fields.add(new NumberField({ name: 'guarantee_period_days', min: 0, onlyInt: true }))
    }
    if (!settings.fields.getByName('clock_in_deadline_hours')) {
      settings.fields.add(
        new NumberField({ name: 'clock_in_deadline_hours', min: 1, onlyInt: true }),
      )
    }
    app.save(settings)

    // Seed defaults on the existing settings row (if any).
    try {
      const rows = app.findRecordsByFilter('settings', '1=1', '', 1, 0)
      if (rows.length > 0) {
        const s = rows[0]
        if (!s.get('guarantee_period_days')) {
          s.set('guarantee_period_days', 7)
        }
        if (!s.get('clock_in_deadline_hours')) {
          s.set('clock_in_deadline_hours', 24)
        }
        app.save(s)
      }
    } catch (_) {}
  },
  (app) => {
    const jobs = app.findCollectionByNameOrId('jobs')
    ;[
      'payment_status',
      'payment_intent_id',
      'payment_authorized_at',
      'payment_hold_until',
      'payment_released_at',
      'payment_disputed_at',
      'dispute_reason',
      'clocked_in_at',
      'accepted_at',
    ].forEach((name) => {
      const f = jobs.fields.getByName(name)
      if (f) jobs.fields.remove(f)
    })
    app.save(jobs)

    const settings = app.findCollectionByNameOrId('settings')
    ;['guarantee_period_days', 'clock_in_deadline_hours'].forEach((name) => {
      const f = settings.fields.getByName(name)
      if (f) settings.fields.remove(f)
    })
    app.save(settings)
  },
)
