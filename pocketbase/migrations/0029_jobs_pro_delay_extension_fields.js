// Adds the fields powering the "professional delayed +15 min" flow to the
// `jobs` collection. The full flow is implemented in pb_hooks
// (cron_pro_delay.js + pro_delay_respond.js); this migration only adds the
// schema columns they read and write.
//
// New fields:
//   - extended               (bool, default false) — extension already applied
//   - extension_minutes      (number, nullable) — 60 | 120 when extended
//   - delay_notification_sent (bool, default false) — client already notified
//   - delay_notified_at      (date, nullable) — when the client was notified
//   - client_delay_response  (select, nullable) — "extend_1h" | "extend_2h" | "cancel_reopen"
//   - client_delay_responded_at (date, nullable) — when the client answered
//   - emergency_fee          (number, nullable) — multiplier for emergency reopen (1.2)
//   - client_price           (number, nullable) — price the client pays (kept equal on reopen)
//
// Notes:
//   - All bool/select fields are intentionally NOT `required`. A required bool
//     rejects every create that sends false/omits the field (PocketBase treats
//     false as the empty value). Absent → treated as false/null by the hooks.
//   - The `type` select already has an "emergency" value (added in 0001), so
//     emergency reopen jobs reuse it; no schema change needed for that.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('jobs')

    if (!col.fields.getByName('extended')) {
      col.fields.add(new BoolField({ name: 'extended', required: false }))
    }
    if (!col.fields.getByName('extension_minutes')) {
      col.fields.add(new NumberField({ name: 'extension_minutes', required: false, onlyInt: true }))
    }
    if (!col.fields.getByName('delay_notification_sent')) {
      col.fields.add(new BoolField({ name: 'delay_notification_sent', required: false }))
    }
    if (!col.fields.getByName('delay_notified_at')) {
      col.fields.add(new DateField({ name: 'delay_notified_at' }))
    }
    if (!col.fields.getByName('client_delay_response')) {
      col.fields.add(
        new SelectField({
          name: 'client_delay_response',
          required: false,
          maxSelect: 1,
          values: ['extend_1h', 'extend_2h', 'cancel_reopen'],
        }),
      )
    }
    if (!col.fields.getByName('client_delay_responded_at')) {
      col.fields.add(new DateField({ name: 'client_delay_responded_at' }))
    }
    if (!col.fields.getByName('emergency_fee')) {
      col.fields.add(new NumberField({ name: 'emergency_fee', required: false }))
    }
    if (!col.fields.getByName('client_price')) {
      col.fields.add(new NumberField({ name: 'client_price', required: false }))
    }

    // Backfill `client_price` from `price` for existing accepted jobs so the
    // reopen-on-timeout logic has a stable "what the client paid" value even
    // for jobs created before this migration.
    try {
      app.db().newQuery('UPDATE jobs SET client_price = price WHERE client_price IS NULL').execute()
    } catch (_) {}

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('jobs')
    ;[
      'extended',
      'extension_minutes',
      'delay_notification_sent',
      'delay_notified_at',
      'client_delay_response',
      'client_delay_responded_at',
      'emergency_fee',
      'client_price',
    ].forEach((name) => {
      const f = col.fields.getByName(name)
      if (f) col.fields.remove(f)
    })
    app.save(col)
  },
)
