// Admin-only endpoint to update the platform business rules.
// Requires an authenticated user with role = 'admin'.
// Sensitive keys (Google Maps, Stripe) are intentionally NOT accepted here.
//
// PUT /backend/v1/settings  (body: partial settings object)
routerAdd(
  'PUT',
  '/backend/v1/settings',
  (e) => {
    const auth = e.requestInfo().auth
    if (!auth || auth.getString('role') !== 'admin') {
      return e.json(403, { ok: false, error: 'Acesso restrito a administradores.' })
    }

    const body = e.requestInfo().body || {}

    // Allowlist of updatable fields — never accept secrets here.
    const allowed = [
      'name',
      'service_fee_percent',
      'emergency_margin_percent',
      'scheduled_margin_percent',
      'demand_factors',
      'price_per_hour',
      'min_service_fee',
      'module_chat_enabled',
      'module_reviews_enabled',
      'module_referrals_enabled',
      'module_dynamic_pricing_enabled',
      'guarantee_period_days',
      'clock_in_deadline_hours',
      'min_hours',
      'short_job_multiplier_4_5',
      'short_job_multiplier_6_7',
      'normal_hours_threshold',
      'distance_price_per_km',
      'min_distance_fee',
      'flat_travel_fee',
      'service_radius_km',
    ]

    let record = null
    try {
      const rows = $app.findRecordsByFilter('settings', '1=1', '', 1, 0)
      if (rows.length > 0) record = rows[0]
    } catch (_) {}

    let collection
    try {
      collection = $app.findCollectionByNameOrId('settings')
    } catch (err) {
      return e.json(500, { ok: false, error: 'Coleção settings não encontrada.' })
    }

    if (!record) {
      record = new Record(collection)
      record.set('name', 'Plataforma')
    }

    let changed = false
    for (let i = 0; i < allowed.length; i++) {
      const key = allowed[i]
      if (body[key] !== undefined && body[key] !== null) {
        record.set(key, body[key])
        changed = true
      }
    }

    if (!changed) {
      return e.json(200, { ok: true, settings: { id: record.getString('id') }, updated: false })
    }

    $app.save(record)

    return e.json(200, {
      ok: true,
      settings: {
        id: record.getString('id'),
        name: record.getString('name'),
        service_fee_percent: record.getFloat('service_fee_percent'),
        emergency_margin_percent: record.getFloat('emergency_margin_percent'),
        scheduled_margin_percent: record.getFloat('scheduled_margin_percent'),
        demand_factors: record.get('demand_factors') || {},
        price_per_hour: record.getFloat('price_per_hour'),
        min_service_fee: record.getFloat('min_service_fee'),
        module_chat_enabled: record.getBool('module_chat_enabled'),
        module_reviews_enabled: record.getBool('module_reviews_enabled'),
        module_referrals_enabled: record.getBool('module_referrals_enabled'),
        module_dynamic_pricing_enabled: record.getBool('module_dynamic_pricing_enabled'),
        guarantee_period_days: record.getFloat('guarantee_period_days') || 7,
        clock_in_deadline_hours: record.getFloat('clock_in_deadline_hours') || 24,
        min_hours: record.getFloat('min_hours') || 4,
        short_job_multiplier_4_5: record.getFloat('short_job_multiplier_4_5') || 1.5,
        short_job_multiplier_6_7: record.getFloat('short_job_multiplier_6_7') || 1.3,
        normal_hours_threshold: record.getFloat('normal_hours_threshold') || 8,
        distance_price_per_km: record.getFloat('distance_price_per_km') || 2.5,
        min_distance_fee: record.getFloat('min_distance_fee') || 8,
        flat_travel_fee: record.getFloat('flat_travel_fee') || 10,
        service_radius_km: record.getFloat('service_radius_km') || 15,
        updated: record.getString('updated'),
      },
      updated: true,
    })
  },
  $apis.requireAuth(),
)
