migrate(
  (app) => {
    let col
    try {
      col = app.findCollectionByNameOrId('settings')
    } catch (err) {
      return
    }

    // --- Add short-job pricing fields (idempotent) -------------------------
    // Minimum hours for any booking (default 4). Short jobs are less attractive
    // to pros (same travel cost, lower payout), so a surcharge multiplier is
    // applied below the normal-hours threshold.
    if (!col.fields.getByName('min_hours')) {
      col.fields.add(new NumberField({ name: 'min_hours', min: 1, onlyInt: false }))
    }
    // Multiplier for jobs in the [min_hours, 5] window — default 1.5x
    if (!col.fields.getByName('short_job_multiplier_4_5')) {
      col.fields.add(new NumberField({ name: 'short_job_multiplier_4_5', min: 0 }))
    }
    // Multiplier for jobs in the [6, 7] window — default 1.3x
    if (!col.fields.getByName('short_job_multiplier_6_7')) {
      col.fields.add(new NumberField({ name: 'short_job_multiplier_6_7', min: 0 }))
    }
    // Hours at/above which the normal price applies (no surcharge) — default 8
    if (!col.fields.getByName('normal_hours_threshold')) {
      col.fields.add(new NumberField({ name: 'normal_hours_threshold', min: 1, onlyInt: false }))
    }

    app.save(col)

    // --- Seed defaults on the existing settings row ------------------------
    let record = null
    try {
      const rows = app.findRecordsByFilter('settings', '1=1', '', 1, 0)
      if (rows.length > 0) record = rows[0]
    } catch (_) {}

    if (record) {
      // Only set defaults when the field is empty/zero so admins keep their edits.
      if (!record.getFloat('min_hours')) record.set('min_hours', 4)
      if (!record.getFloat('short_job_multiplier_4_5')) record.set('short_job_multiplier_4_5', 1.5)
      if (!record.getFloat('short_job_multiplier_6_7')) record.set('short_job_multiplier_6_7', 1.3)
      if (!record.getFloat('normal_hours_threshold')) record.set('normal_hours_threshold', 8)
      app.save(record)
    }
  },
  (app) => {
    let col
    try {
      col = app.findCollectionByNameOrId('settings')
    } catch (err) {
      return
    }
    const names = [
      'min_hours',
      'short_job_multiplier_4_5',
      'short_job_multiplier_6_7',
      'normal_hours_threshold',
    ]
    for (let i = 0; i < names.length; i++) {
      const f = col.fields.getByName(names[i])
      if (f) col.fields.remove(f)
    }
    app.save(col)
  },
)
