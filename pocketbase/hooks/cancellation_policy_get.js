// Public, read-only endpoint that returns the cancellation policy stored in the
// single `cancellation_policies` row. Falls back to spec defaults when no row
// exists yet.
//
// GET /backend/v1/cancellation-policy
routerAdd('GET', '/backend/v1/cancellation-policy', (e) => {
  // Spec defaults (kept in sync with migration 0012).
  const defaults = {
    client_grace_hours: 2,
    client_pct_over_24h: 10,
    client_pct_4_to_24h: 30,
    client_pct_under_4h: 50,
    client_pro_share_pct: 50,
    pro_grace_hours: 1,
    pro_fee_over_24h: 25,
    pro_fee_4_to_24h: 50,
    pro_fee_under_4h: 80,
    pro_monthly_limit: 3,
  }

  let record = null
  try {
    const rows = $app.findRecordsByFilter('cancellation_policies', '1=1', '', 1, 0)
    if (rows.length > 0) record = rows[0]
  } catch (_) {}

  if (!record) {
    return e.json(200, { ok: true, policy: defaults })
  }

  const num = function (key, fallback) {
    const v = record.getFloat(key)
    return v !== 0 ? v : fallback
  }

  return e.json(200, {
    ok: true,
    policy: {
      client_grace_hours: num('client_grace_hours', defaults.client_grace_hours),
      client_pct_over_24h: num('client_pct_over_24h', defaults.client_pct_over_24h),
      client_pct_4_to_24h: num('client_pct_4_to_24h', defaults.client_pct_4_to_24h),
      client_pct_under_4h: num('client_pct_under_4h', defaults.client_pct_under_4h),
      client_pro_share_pct: num('client_pro_share_pct', defaults.client_pro_share_pct),
      pro_grace_hours: num('pro_grace_hours', defaults.pro_grace_hours),
      pro_fee_over_24h: num('pro_fee_over_24h', defaults.pro_fee_over_24h),
      pro_fee_4_to_24h: num('pro_fee_4_to_24h', defaults.pro_fee_4_to_24h),
      pro_fee_under_4h: num('pro_fee_under_4h', defaults.pro_fee_under_4h),
      pro_monthly_limit: num('pro_monthly_limit', defaults.pro_monthly_limit),
      updated: record.getString('updated'),
    },
  })
})
