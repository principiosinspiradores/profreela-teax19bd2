// Public, read-only endpoint that returns the platform business rules stored
// in the single `settings` row. Sensitive secrets (Google Maps, Stripe, etc.)
// are NEVER exposed here — they live only in the environment.
//
// GET /backend/v1/settings
routerAdd('GET', '/backend/v1/settings', (e) => {
  let record = null
  try {
    const rows = $app.findRecordsByFilter('settings', '1=1', '', 1, 0)
    if (rows.length > 0) record = rows[0]
  } catch (_) {}

  if (!record) {
    return e.json(200, { ok: true, settings: null })
  }

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
      // --- Short-job dynamic pricing -------------------------------------
      min_hours: record.getFloat('min_hours') || 4,
      short_job_multiplier_4_5: record.getFloat('short_job_multiplier_4_5') || 1.5,
      short_job_multiplier_6_7: record.getFloat('short_job_multiplier_6_7') || 1.3,
      normal_hours_threshold: record.getFloat('normal_hours_threshold') || 8,
      // --- Travel / displacement fee --------------------------------------
      distance_price_per_km: record.getFloat('distance_price_per_km') || 2.5,
      min_distance_fee: record.getFloat('min_distance_fee') || 8,
      updated: record.getString('updated'),
    },
  })
})
