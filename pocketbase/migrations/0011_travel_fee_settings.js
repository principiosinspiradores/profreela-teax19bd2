// Adds editable travel/displacement fee fields to the `settings` collection:
//   distance_price_per_km  — price charged per km travelled by the pro (R$/km)
//   min_distance_fee       — minimum fee charged even for short distances (R$)
//
// The request form previously hard-coded R$ 2,50/km. These fields make it
// admin-configurable with a sensible fallback default (seeded here) so existing
// behaviour is preserved.
migrate(
  (app) => {
    let col
    try {
      col = app.findCollectionByNameOrId('settings')
    } catch (err) {
      return
    }

    // --- Add travel-fee fields (idempotent) -------------------------------
    if (!col.fields.getByName('distance_price_per_km')) {
      col.fields.add(new NumberField({ name: 'distance_price_per_km', min: 0 }))
    }
    if (!col.fields.getByName('min_distance_fee')) {
      col.fields.add(new NumberField({ name: 'min_distance_fee', min: 0 }))
    }

    app.save(col)

    // --- Seed defaults on the existing settings row -----------------------
    let record = null
    try {
      const rows = app.findRecordsByFilter('settings', '1=1', '', 1, 0)
      if (rows.length > 0) record = rows[0]
    } catch (_) {}

    if (record) {
      // Only set defaults when the field is empty/zero so admins keep edits.
      if (!record.getFloat('distance_price_per_km')) {
        record.set('distance_price_per_km', 2.5)
      }
      if (!record.getFloat('min_distance_fee')) {
        record.set('min_distance_fee', 8)
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
    const names = ['distance_price_per_km', 'min_distance_fee']
    for (let i = 0; i < names.length; i++) {
      const f = col.fields.getByName(names[i])
      if (f) col.fields.remove(f)
    }
    app.save(col)
  },
)
