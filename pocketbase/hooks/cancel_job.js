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
        if (grace > 0 && hoursSinceAccepted <= grace) {
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

    // --- persist job cancellation ------------------------------------------
    job.set('status', 'cancelled')
    job.set('cancelled_by', authId)
    job.set('cancelled_at', nowIso)
    if (reason) job.set('cancellation_reason', reason)
    job.set('penalty_amount', penaltyAmount)
    // release / cancel any pending pre-authorization that was not captured
    if (paymentStatus === 'authorized' && penaltyStatus !== 'charged') {
      job.set('payment_status', 'cancelled')
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
      monthly_cancellations: monthlyCount,
      monthly_limit: policy.pro_monthly_limit,
    })
  },
  $apis.requireAuth(),
)
