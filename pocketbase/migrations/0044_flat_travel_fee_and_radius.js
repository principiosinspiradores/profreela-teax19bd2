// Adds flat travel fee and service radius fields to the `settings` collection:
//   flat_travel_fee    — fixed travel/displacement fee in R$ (default: 10)
//   service_radius_km  — maximum service coverage radius in km (default: 15)
//
// These replace the variable per-km displacement calculation with a fixed fee
// within the configured coverage radius.

migrate(
  (app) => {
    let col
    try {
      col = app.findCollectionByNameOrId('settings')
    } catch (err) {
      return
    }

    // --- Add fields (idempotent) -------------------------------------------
    if (!col.fields.getByName('flat_travel_fee')) {
      col.fields.add(new NumberField({ name: 'flat_travel_fee', min: 0 }))
    }
    if (!col.fields.getByName('service_radius_km')) {
      col.fields.add(new NumberField({ name: 'service_radius_km', min: 0 }))
    }

    app.save(col)

    // --- Seed defaults on the existing settings row -----------------------
    let record = null
    try {
      const rows = app.findRecordsByFilter('settings', '1=1', '', 1, 0)
      if (rows.length > 0) record = rows[0]
    } catch (_) {}

    if (record) {
      if (!record.getFloat('flat_travel_fee')) {
        record.set('flat_travel_fee', 10)
      }
      if (!record.getFloat('service_radius_km')) {
        record.set('service_radius_km', 15)
      }
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
    const names = ['flat_travel_fee', 'service_radius_km']
    for (let i = 0; i < names.length; i++) {
      const f = col.fields.getByName(names[i])
      if (f) col.fields.remove(f)
    }
    app.save(col)
  },
)
