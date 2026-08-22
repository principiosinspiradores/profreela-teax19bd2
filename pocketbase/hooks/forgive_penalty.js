// Admin endpoint: forgive (zero out) a professional's outstanding penalty balance.
//
// POST /backend/v1/admin/forgive-penalty   (admin only)
//   body: { proId }
//
// Entrega 2 — "Perdoar débito" action on the admin Penalties panel.
//
// Sets the pro's penalty_balance to 0 and marks every job that generated a
// penalty against them (penalty_applied = true && penalty_forgiven = false) as
// penalty_forgiven = true. The penalty history is preserved (the jobs keep
// penalty_applied + penalty_amount), but the outstanding debit is cleared so it
// is no longer deducted from future payouts.
//
// NOTE (hooks run in a separate VM): all logic is inlined inside the callback.

routerAdd(
  'POST',
  '/backend/v1/admin/forgive-penalty',
  (e) => {
    const auth = e.requestInfo().auth
    if (!auth || auth.getString('role') !== 'admin') {
      return e.json(403, { ok: false, error: 'Acesso restrito a administradores.' })
    }

    const body = e.requestInfo().body || {}
    const proId = (body.proId || '').toString().trim()
    if (!proId) {
      return e.json(400, { ok: false, error: 'proId é obrigatório.' })
    }

    // --- load the pro ------------------------------------------------------
    let pro = null
    try {
      pro = $app.findFirstRecordByData('users', 'id', proId)
    } catch (_) {}
    if (!pro) {
      return e.json(404, { ok: false, error: 'Profissional não encontrado.' })
    }

    const forgivenAmount = pro.getFloat('penalty_balance') || 0

    // Zero the balance.
    try {
      pro.set('penalty_balance', 0)
      $app.save(pro)
    } catch (err) {
      return e.json(500, { ok: false, error: 'Falha ao zerar o saldo devedor: ' + err })
    }

    // Mark every penalty-generating job for this pro as forgiven.
    let marked = 0
    try {
      const jobs = $app.findRecordsByFilter(
        'jobs',
        "pro_id = '" + proId + "' && penalty_applied = true && penalty_forgiven = false",
        '-created',
        500,
        0,
      )
      for (let i = 0; i < jobs.length; i++) {
        try {
          jobs[i].set('penalty_forgiven', true)
          $app.save(jobs[i])
          marked++
        } catch (_) {}
      }
    } catch (err) {
      console.log('[forgive-penalty] falha ao marcar jobs como peroados:', err)
    }

    return e.json(200, {
      ok: true,
      pro_id: proId,
      forgiven_amount: forgivenAmount,
      jobs_marked: marked,
    })
  },
  $apis.requireAuth(),
)
