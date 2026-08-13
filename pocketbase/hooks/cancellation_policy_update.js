// Admin-only endpoint to update the cancellation policy.
// Requires an authenticated user with role = 'admin'.
//
// PUT /backend/v1/cancellation-policy  (body: partial policy object)
routerAdd(
  'PUT',
  '/backend/v1/cancellation-policy',
  (e) => {
    const auth = e.requestInfo().auth
    if (!auth || auth.getString('role') !== 'admin') {
      return e.json(403, { ok: false, error: 'Acesso restrito a administradores.' })
    }

    const body = e.requestInfo().body || {}

    const allowed = [
      'client_grace_hours',
      'client_pct_over_24h',
      'client_pct_4_to_24h',
      'client_pct_under_4h',
      'client_pro_share_pct',
      'pro_grace_hours',
      'pro_fee_over_24h',
      'pro_fee_4_to_24h',
      'pro_fee_under_4h',
      'pro_monthly_limit',
    ]

    let collection
    try {
      collection = $app.findCollectionByNameOrId('cancellation_policies')
    } catch (err) {
      return e.json(500, { ok: false, error: 'Coleção cancellation_policies não encontrada.' })
    }

    let record = null
    try {
      const rows = $app.findRecordsByFilter('cancellation_policies', '1=1', '', 1, 0)
      if (rows.length > 0) record = rows[0]
    } catch (_) {}

    if (!record) {
      record = new Record(collection)
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
      return e.json(200, { ok: true, updated: false })
    }

    $app.save(record)

    return e.json(200, {
      ok: true,
      updated: true,
      policy: {
        client_grace_hours: record.getFloat('client_grace_hours'),
        client_pct_over_24h: record.getFloat('client_pct_over_24h'),
        client_pct_4_to_24h: record.getFloat('client_pct_4_to_24h'),
        client_pct_under_4h: record.getFloat('client_pct_under_4h'),
        client_pro_share_pct: record.getFloat('client_pro_share_pct'),
        pro_grace_hours: record.getFloat('pro_grace_hours'),
        pro_fee_over_24h: record.getFloat('pro_fee_over_24h'),
        pro_fee_4_to_24h: record.getFloat('pro_fee_4_to_24h'),
        pro_fee_under_4h: record.getFloat('pro_fee_under_4h'),
        pro_monthly_limit: record.getFloat('pro_monthly_limit'),
      },
    })
  },
  $apis.requireAuth(),
)
