// Rename `price_per_km` -> `price_per_hour` on the `settings` collection.
// The platform prices per worked hour, not per travelled distance.
migrate(
  (app) => {
    let collection
    try {
      collection = app.findCollectionByNameOrId('settings')
    } catch (_) {
      return
    }

    // If the old field still exists, rename it in-place. This preserves the
    // stored value (only the name/semantics change) and avoids data loss.
    const oldField = collection.fields.getByName('price_per_km')
    if (oldField) {
      oldField.name = 'price_per_hour'
    }

    app.save(collection)

    // Defensive: if for some reason the new field is missing (e.g. the rename
    // above didn't apply because the field was already gone), add it fresh.
    const updated = app.findCollectionByNameOrId('settings')
    if (!updated.fields.getByName('price_per_hour')) {
      updated.fields.add(
        // eslint-disable-next-line no-undef
        new NumberField({ name: 'price_per_hour', min: 0 }),
      )
      app.save(updated)
    }

    // Ensure the seed row carries a sensible default value for the new field.
    try {
      const rows = app.findRecordsByFilter('settings', '1=1', '', 1, 0)
      if (rows.length > 0) {
        const rec = rows[0]
        const v = rec.getFloat('price_per_hour')
        if (!v || v <= 0) {
          rec.set('price_per_hour', 2.5)
          app.save(rec)
        }
      }
    } catch (_) {}
  },
  (app) => {
    // Revert: rename price_per_hour back to price_per_km.
    let collection
    try {
      collection = app.findCollectionByNameOrId('settings')
    } catch (_) {
      return
    }
    const field = collection.fields.getByName('price_per_hour')
    if (field) {
      field.name = 'price_per_km'
    }
    app.save(collection)
  },
)
