// Adds service area center fields and demo payment flag to the `settings` collection:
//   service_center_lat      — latitude of the service coverage center (number, optional)
//   service_center_lng      — longitude of the service coverage center (number, optional)
//   service_center_address  — friendly label/address of the center (text, optional)
//   payments_demo_enabled   — whether fallback demo card payment mode is allowed (bool, default: false)

migrate(
  (app) => {
    let col
    try {
      col = app.findCollectionByNameOrId('settings')
    } catch (err) {
      return
    }

    // --- Add fields (idempotent) -------------------------------------------
    if (!col.fields.getByName('service_center_lat')) {
      col.fields.add(new NumberField({ name: 'service_center_lat' }))
    }
    if (!col.fields.getByName('service_center_lng')) {
      col.fields.add(new NumberField({ name: 'service_center_lng' }))
    }
    if (!col.fields.getByName('service_center_address')) {
      col.fields.add(new TextField({ name: 'service_center_address' }))
    }
    if (!col.fields.getByName('payments_demo_enabled')) {
      // Bool flags should not be required in PocketBase
      col.fields.add(new BoolField({ name: 'payments_demo_enabled' }))
    }

    app.save(col)

    // --- Seed defaults on the existing settings row -----------------------
    let record = null
    try {
      const rows = app.findRecordsByFilter('settings', '1=1', '', 1, 0)
      if (rows.length > 0) record = rows[0]
    } catch (_) {}

    if (record) {
      // payments_demo_enabled defaults to false if not set
      if (
        record.get('payments_demo_enabled') === undefined ||
        record.get('payments_demo_enabled') === null
      ) {
        record.set('payments_demo_enabled', false)
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
    const names = [
      'service_center_lat',
      'service_center_lng',
      'service_center_address',
      'payments_demo_enabled',
    ]
    for (let i = 0; i < names.length; i++) {
      const f = col.fields.getByName(names[i])
      if (f) col.fields.remove(f)
    }
    app.save(col)
  },
)
