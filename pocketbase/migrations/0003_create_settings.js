migrate(
  (app) => {
    // Single-row "settings" collection that stores the platform's business rules.
    // Public read (so the app can render prices/margins), admin-only write.
    // Sensitive keys (Google Maps, Stripe) are NEVER stored here — they live in
    // the environment secrets and are read server-side via $os.getenv.
    const collection = new Collection({
      name: 'settings',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: "@request.auth.role = 'admin'",
      updateRule: "@request.auth.role = 'admin'",
      deleteRule: "@request.auth.role = 'admin'",
      fields: [
        // Human-readable label for the settings entry (e.g. "Plataforma")
        { name: 'name', type: 'text', required: false },

        // --- Pricing / fees -------------------------------------------------
        // Platform service fee charged on every transaction (%)
        { name: 'service_fee_percent', type: 'number', required: false, min: 0, max: 100 },
        // Margin applied to emergency (on-demand) services (%)
        { name: 'emergency_margin_percent', type: 'number', required: false, min: 0, max: 500 },
        // Margin applied to scheduled services (%)
        { name: 'scheduled_margin_percent', type: 'number', required: false, min: 0, max: 500 },

        // --- Dynamic pricing ------------------------------------------------
        // Demand factor multipliers stored as JSON, e.g.
        // { "low": 0.9, "medium": 1.0, "high": 1.2, "peak": 1.5 }
        { name: 'demand_factors', type: 'json', required: false },
        // Base price per km used for distance-based pricing
        { name: 'price_per_km', type: 'number', required: false, min: 0 },
        // Minimum platform fee in currency units (floor for small jobs)
        { name: 'min_service_fee', type: 'number', required: false, min: 0 },

        // --- Feature toggles (module activation) ---------------------------
        { name: 'module_chat_enabled', type: 'bool', required: false },
        { name: 'module_reviews_enabled', type: 'bool', required: false },
        { name: 'module_referrals_enabled', type: 'bool', required: false },
        { name: 'module_dynamic_pricing_enabled', type: 'bool', required: false },

        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [],
    })
    app.save(collection)

    // Seed a single default settings row so the app always has values to read.
    let settingsCol
    try {
      settingsCol = app.findCollectionByNameOrId('settings')
    } catch (_) {
      return
    }

    // Idempotent: only create if no row exists yet.
    let existing = []
    try {
      existing = app.findRecordsByFilter('settings', '1=1', '', 1, 0)
    } catch (_) {}
    if (existing.length > 0) return

    const record = new Record(settingsCol)
    record.set('name', 'Plataforma')
    record.set('service_fee_percent', 15)
    record.set('emergency_margin_percent', 25)
    record.set('scheduled_margin_percent', 10)
    record.set('demand_factors', {
      low: 0.9,
      medium: 1.0,
      high: 1.2,
      peak: 1.5,
    })
    record.set('price_per_km', 2.5)
    record.set('min_service_fee', 5)
    record.set('module_chat_enabled', true)
    record.set('module_reviews_enabled', true)
    record.set('module_referrals_enabled', true)
    record.set('module_dynamic_pricing_enabled', true)
    app.save(record)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('settings')
      app.delete(collection)
    } catch (_) {}
  },
)
