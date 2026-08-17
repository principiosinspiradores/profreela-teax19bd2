// Cancellation endpoint — Uber-style asymmetric penalties for client vs pro.
//
// POST /backend/v1/cancel-job   (auth required)
//   body: { jobId, reason? }
//
// Determines who cancelled (client or pro) by matching the authenticated user
// against the job's customer_id / pro_id, computes the penalty according to the
// cancellation_policies row, persists the cancellation on the job + a new
// `cancellations` audit row, and — for professionals — auto-suspends after the
// monthly limit is reached.
//
// NOTE (hooks run in a separate VM): all logic is inlined inside the callback.

routerAdd(
  'POST',
  '/backend/v1/cancel-job',
  (e) => {
    const auth = e.requestInfo().auth
    if (!auth) {
      return e.json(401, { ok: false, error: 'Autenticação necessária.' })
    }
    const authId = auth.getString('id')
    const authRole = auth.getString('role')

    const body = e.requestInfo().body || {}
    const jobId = (body.jobId || '').toString().trim()
    const reason = (body.reason || '').toString().trim()
    if (!jobId) {
      return e.json(400, { ok: false, error: 'jobId é obrigatório.' })
    }

    // --- load job -----------------------------------------------------------
    let job = null
    try {
      job = $app.findFirstRecordByData('jobs', 'id', jobId)
    } catch (_) {}
    if (!job) {
      return e.json(404, { ok: false, error: 'Serviço não encontrado.' })
    }

    const jobStatus = job.getString('status')
    if (jobStatus === 'cancelled') {
      return e.json(400, { ok: false, error: 'Este serviço já foi cancelado.' })
    }
    if (jobStatus === 'completed' || jobStatus === 'in_progress') {
      return e.json(400, {
        ok: false,
        error: 'Não é possível cancelar um serviço concluído ou em andamento.',
      })
    }

    // --- determine who is cancelling ---------------------------------------
    const customerId = job.getString('customer_id')
    const proId = job.getString('pro_id')
    let cancelledByRole = ''
    if (authId === customerId) {
      cancelledByRole = 'client'
    } else if (authId === proId) {
      cancelledByRole = 'pro'
    } else if (authRole === 'admin') {
      // Admin override: cancel without penalty, record who did it.
      cancelledByRole = customerId ? 'client' : 'pro'
    } else {
      return e.json(403, { ok: false, error: 'Você não tem permissão para cancelar este serviço.' })
    }

    // --- load policy (with spec defaults) ----------------------------------
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
    let policy = defaults
    let policyRecord = null
    try {
      const rows = $app.findRecordsByFilter('cancellation_policies', '1=1', '', 1, 0)
      if (rows.length > 0) {
        policyRecord = rows[0]
        const num = function (key, fallback) {
          const v = policyRecord.getFloat(key)
          return v !== 0 ? v : fallback
        }
        policy = {
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
        }
      }
    } catch (_) {}

    // --- timestamps ---------------------------------------------------------
    const nowMs = Date.now()
    const nowIso = new Date(nowMs).toISOString()

    // Build a -03:00 (Brasília) offset ISO string from a millisecond timestamp.
    // Used when a reopened job's original slot is already in the past and must
    // be pushed forward to "now" while preserving the -03:00 offset.
    const buildMinus3Iso = function (ms) {
      const local = new Date(ms - 3 * 3600000) // shift UTC → Brasília wall-clock
      const pad = function (n) {
        n = String(n)
        return n.length < 2 ? '0' + n : n
      }
      return (
        local.getUTCFullYear() +
        '-' +
        pad(local.getUTCMonth() + 1) +
        '-' +
        pad(local.getUTCDate()) +
        'T' +
        pad(local.getUTCHours()) +
        ':' +
        pad(local.getUTCMinutes()) +
        ':' +
        pad(local.getUTCSeconds()) +
        '-03:00'
      )
    }

    const acceptedAtStr = job.getString('accepted_at')
    const acceptedMs = acceptedAtStr ? new Date(acceptedAtStr).getTime() : 0

    const scheduledAtStr = job.getString('scheduled_at')
    const scheduledMs = scheduledAtStr ? new Date(scheduledAtStr).getTime() : 0

    const price = job.getFloat('price')

    // hours since acceptance / confirmation
    const hoursSinceAccepted = acceptedMs ? (nowMs - acceptedMs) / 3600000 : Infinity
    // hours until the scheduled service (negative = past)
    const hoursUntilService = scheduledMs ? (scheduledMs - nowMs) / 3600000 : 0

    // --- compute penalty ---------------------------------------------------
    let penaltyAmount = 0
    let penaltyLabel = 'Cancelamento gratuito'
    let penaltyStatus = 'waived'

    const isAdminOverride = authRole === 'admin' && authId !== customerId && authId !== proId

    if (!isAdminOverride) {
      if (cancelledByRole === 'client') {
        const grace = policy.client_grace_hours
        if (jobStatus === 'pending' || !acceptedMs) {
          // No professional has accepted yet — cancellation is always free.
          penaltyAmount = 0
          penaltyLabel = 'Cancelamento gratuito (serviço ainda não aceito)'
        } else if (grace > 0 && hoursSinceAccepted <= grace) {
          penaltyAmount = 0
          penaltyLabel = 'Cancelamento gratuito (dentro da carência de ' + grace + 'h)'
        } else {
          let pct = 0
          if (hoursUntilService > 24) {
            pct = policy.client_pct_over_24h
            penaltyLabel = 'Taxa de ' + pct + '% do valor (mais de 24h de antecedência)'
          } else if (hoursUntilService > 4) {
            pct = policy.client_pct_4_to_24h
            penaltyLabel = 'Taxa de ' + pct + '% do valor (entre 4h e 24h de antecedência)'
          } else {
            pct = policy.client_pct_under_4h
            penaltyLabel = 'Taxa de ' + pct + '% do valor (menos de 4h de antecedência)'
          }
          penaltyAmount = Math.round(price * (pct / 100) * 100) / 100
          penaltyStatus = 'pending'
        }
      } else {
        // professional
        const grace = policy.pro_grace_hours
        if (grace > 0 && hoursSinceAccepted <= grace) {
          penaltyAmount = 0
          penaltyLabel = 'Cancelamento gratuito (dentro da carência de ' + grace + 'h)'
        } else {
          if (hoursUntilService > 24) {
            penaltyAmount = policy.pro_fee_over_24h
            penaltyLabel =
              'Taxa fixa de R$ ' +
              penaltyAmount.toFixed(2).replace('.', ',') +
              ' (mais de 24h de antecedência)'
          } else if (hoursUntilService > 4) {
            penaltyAmount = policy.pro_fee_4_to_24h
            penaltyLabel =
              'Taxa fixa de R$ ' +
              penaltyAmount.toFixed(2).replace('.', ',') +
              ' (entre 4h e 24h de antecedência)'
          } else {
            penaltyAmount = policy.pro_fee_under_4h
            penaltyLabel =
              'Taxa fixa de R$ ' +
              penaltyAmount.toFixed(2).replace('.', ',') +
              ' (menos de 4h de antecedência)'
          }
          penaltyStatus = 'pending'
        }
      }
    }

    // --- attempt to charge the client penalty from the pre-authorization ----
    // (Stripe only; demo / Mercado Pago leave it as a pending debt.)
    const paymentStatus = job.getString('payment_status')
    const intentId = job.getString('payment_intent_id')
    const provider = $os.getenv('PAYMENT_PROVIDER') || ''

    if (
      cancelledByRole === 'client' &&
      penaltyAmount > 0 &&
      paymentStatus === 'authorized' &&
      intentId
    ) {
      if (provider === 'stripe') {
        const secretKey = $os.getenv('STRIPE_SECRET_KEY') || ''
        if (secretKey) {
          try {
            const res = $http.send({
              url:
                'https://api.stripe.com/v1/payment_intents/' +
                encodeURIComponent(intentId) +
                '/capture',
              method: 'POST',
              headers: {
                Authorization: 'Bearer ' + secretKey,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: 'amount_to_capture=' + Math.round(penaltyAmount * 100),
              timeout: 20,
            })
            if (res.statusCode >= 200 && res.statusCode < 300) {
              penaltyStatus = 'charged'
            }
          } catch (_) {}
        }
      }
    }

    // --- persist job cancellation / reopening ------------------------------
    //
    // Professional cancelling an ACCEPTED job reopens it instead of cancelling:
    // the job goes back to `pending`, the pro is detached, and eligible pros
    // (plus the client) are notified. The penalty is still computed & recorded.
    // Every other case (client cancel, pro cancel of a pending job) cancels.
    const isProReopen = cancelledByRole === 'pro' && jobStatus === 'accepted' && !isAdminOverride

    let reopened = false
    let newScheduledAt = scheduledAtStr

    if (isProReopen) {
      // scheduled_at: if the original slot already passed, push it forward to
      // "now" keeping the same duration (hours). Otherwise keep the original.
      if (scheduledMs && scheduledMs < nowMs) {
        // Original slot already passed: push the start to "now". The job's
        // `hours` field (duration) is preserved unchanged.
        newScheduledAt = buildMinus3Iso(nowMs)
      }

      job.set('status', 'pending')
      job.set('pro_id', '')
      job.set('accepted_at', '')
      job.set('reopened', true)
      if (newScheduledAt) {
        job.set('scheduled_at', newScheduledAt)
      }
      // Keep cancellation audit fields so the history is traceable.
      job.set('cancelled_by', authId)
      job.set('cancelled_at', nowIso)
      if (reason) job.set('cancellation_reason', reason)
      job.set('penalty_amount', penaltyAmount)
      // Release any pre-authorization the previous pro held.
      if (paymentStatus === 'authorized' && penaltyStatus !== 'charged') {
        job.set('payment_status', 'cancelled')
      }
      reopened = true
    } else {
      job.set('status', 'cancelled')
      job.set('cancelled_by', authId)
      job.set('cancelled_at', nowIso)
      if (reason) job.set('cancellation_reason', reason)
      job.set('penalty_amount', penaltyAmount)
      // release / cancel any pending pre-authorization that was not captured
      if (paymentStatus === 'authorized' && penaltyStatus !== 'charged') {
        job.set('payment_status', 'cancelled')
      }
    }
    $app.save(job)

    // --- create cancellations audit row ------------------------------------
    let cancellationId = ''
    try {
      const cancCol = $app.findCollectionByNameOrId('cancellations')
      const canc = new Record(cancCol)
      canc.set('job_id', jobId)
      canc.set('cancelled_by', authId)
      canc.set('cancelled_by_role', cancelledByRole)
      canc.set('cancelled_at', nowIso)
      if (reason) canc.set('reason', reason)
      canc.set('penalty_amount', penaltyAmount)
      canc.set('penalty_status', penaltyStatus)
      $app.save(canc)
      cancellationId = canc.getString('id')
    } catch (err) {
      console.log('[cancel-job] falha ao registrar cancellation:', err)
    }

    // --- professional cancelling accepted job → 24h accept block ----------
    //
    // A pro who cancels a job they had already accepted is blocked from
    // accepting ANY job for 24h (blocked_until). This discourages the practice
    // of dropping a job because a better-paying one appeared. Only applied on
    // the reopen path (accepted job cancelled by its pro) — the suspension
    // below still handles serial offenders.
    let blockedUntil = ''
    if (isProReopen && proId) {
      try {
        const proRecord = $app.findFirstRecordByData('users', 'id', proId)
        blockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        proRecord.set('blocked_until', blockedUntil)
        $app.save(proRecord)
      } catch (err) {
        console.log('[cancel-job] falha ao bloquear profissional (blocked_until):', err)
      }
    }

    // --- professional reincidence → auto suspend ---------------------------
    let suspended = false
    let monthlyCount = 0
    if (cancelledByRole === 'pro' && proId) {
      // count this pro's cancellations in the current calendar month
      const d = new Date()
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
      let rows = []
      try {
        rows = $app.findRecordsByFilter(
          'cancellations',
          "cancelled_by = '" +
            proId +
            "' && cancelled_by_role = 'pro' && cancelled_at >= '" +
            monthStart +
            "'",
          '-cancelled_at',
          100,
          0,
        )
      } catch (_) {}
      monthlyCount = rows.length
      if (monthlyCount >= policy.pro_monthly_limit) {
        try {
          const proRecord = $app.findFirstRecordByData('users', 'id', proId)
          proRecord.set('suspended', true)
          $app.save(proRecord)
          suspended = true
        } catch (err) {
          console.log('[cancel-job] falha ao suspender profissional:', err)
        }
      }
    }

    // --- notifications -----------------------------------------------------
    //
    // Resolve the service name and a human-readable scheduled-time label so the
    // notification messages are self-contained. Mirrors on_job_created.js: the
    // -03:00 offset on scheduled_at means we read the wall-clock time through
    // the offset-adjusted date (UTC + 3h) instead of the raw UTC getters.
    let serviceName = 'serviço'
    const serviceId = job.getString('service_id')
    if (serviceId) {
      try {
        const svc = $app.findFirstRecordByData('services', 'id', serviceId)
        if (svc) serviceName = svc.getString('name')
      } catch (_) {}
    }

    const effectiveScheduledAt = job.getString('scheduled_at')
    const jobHours = job.getFloat('hours')
    let whenLabel = 'agendamento a definir'
    if (effectiveScheduledAt) {
      try {
        const d = new Date(effectiveScheduledAt)
        const local = new Date(d.getTime() - 3 * 3600000)
        const pad = function (n) {
          n = String(n)
          return n.length < 2 ? '0' + n : n
        }
        const datePart = pad(local.getUTCDate()) + '/' + pad(local.getUTCMonth() + 1)
        const startTime = pad(local.getUTCHours()) + ':' + pad(local.getUTCMinutes())
        if (jobHours > 0) {
          const end = new Date(d.getTime() + jobHours * 3600000 - 3 * 3600000)
          const endTime = pad(end.getUTCHours()) + ':' + pad(end.getUTCMinutes())
          whenLabel = datePart + ' das ' + startTime + ' às ' + endTime
        } else {
          whenLabel = datePart + ' às ' + startTime
        }
      } catch (_) {}
    } else if (job.getString('type') === 'emergency') {
      whenLabel = 'início imediato'
    }

    let notifCol = null
    try {
      notifCol = $app.findCollectionByNameOrId('notifications')
    } catch (_) {}

    if (notifCol) {
      const createNotif = function (userId, type, title, message) {
        if (!userId) return
        try {
          const n = new Record(notifCol)
          n.set('user_id', userId)
          n.set('type', type)
          n.set('title', title)
          n.set('message', message)
          n.set('job_id', jobId)
          n.set('read_status', false)
          $app.save(n)
        } catch (err) {
          console.log('[cancel-job] falha ao criar notificação para ' + userId + ':', err)
        }
      }

      if (reopened) {
        // Professional cancelled → reopen. Notify the client…
        createNotif(
          customerId,
          'system',
          'Profissional cancelou o serviço',
          'O profissional cancelou o serviço de ' +
            serviceName +
            ' agendado para ' +
            whenLabel +
            '. Estamos buscando outro profissional para você.',
        )
        // …and every eligible pro (same logic as on_job_created.js).
        let pros = []
        try {
          pros = $app.findRecordsByFilter(
            'users',
            "role = 'pro' && status = 'active'",
            '-created',
            500,
            0,
          )
        } catch (_) {}
        const reopenedTitle = 'Nova solicitação disponível (reaberta)'
        const reopenedMsg =
          'Uma solicitação de ' + serviceName + ' foi reaberta e está disponível para ' + whenLabel
        const nowMsNotif = Date.now()
        for (let i = 0; i < pros.length; i++) {
          const pro = pros[i]
          if (pro.getBool('suspended')) continue
          // Pros blocked for cancelling an accepted job don't get job offers.
          const blockedUntilStr = pro.getString('blocked_until')
          if (blockedUntilStr) {
            const blockedMs = new Date(blockedUntilStr).getTime()
            if (!isNaN(blockedMs) && blockedMs > nowMsNotif) continue
          }
          const proId2 = pro.getString('id')
          if (!proId2 || proId2 === customerId || proId2 === authId) continue
          createNotif(proId2, 'new_job', reopenedTitle, reopenedMsg)
        }
      } else {
        // Client (or admin) cancelled → notify the assigned professional.
        if (proId) {
          createNotif(
            proId,
            'system',
            'Cliente cancelou o serviço',
            'O cliente cancelou o serviço de ' + serviceName + ' agendado para ' + whenLabel + '.',
          )
        }
      }
    }

    return e.json(200, {
      ok: true,
      job_id: jobId,
      cancelled_by: authId,
      cancelled_by_role: cancelledByRole,
      cancelled_at: nowIso,
      penalty_amount: penaltyAmount,
      penalty_status: penaltyStatus,
      penalty_label: penaltyLabel,
      payment_status: job.getString('payment_status'),
      cancellation_id: cancellationId,
      suspended: suspended,
      blocked_until: blockedUntil,
      monthly_cancellations: monthlyCount,
      monthly_limit: policy.pro_monthly_limit,
      reopened: reopened,
    })
  },
  $apis.requireAuth(),
)
