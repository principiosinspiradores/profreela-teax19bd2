migrate(
  (app) => {
    const usersId = '_pb_users_auth_'
    const jobsId = app.findCollectionByNameOrId('jobs').id

    // 1. pro_payment_accounts collection
    let accountsCol = null
    try {
      accountsCol = app.findCollectionByNameOrId('pro_payment_accounts')
    } catch (_) {}

    if (!accountsCol) {
      accountsCol = new Collection({
        name: 'pro_payment_accounts',
        type: 'base',
        listRule:
          "@request.auth.id != '' && (user_id = @request.auth.id || @request.auth.role = 'admin')",
        viewRule:
          "@request.auth.id != '' && (user_id = @request.auth.id || @request.auth.role = 'admin')",
        createRule: "@request.auth.id != '' && user_id = @request.auth.id",
        updateRule:
          "@request.auth.id != '' && (user_id = @request.auth.id || @request.auth.role = 'admin')",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          {
            name: 'user_id',
            type: 'relation',
            required: true,
            collectionId: usersId,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'holder_name',
            type: 'text',
            required: true,
          },
          {
            name: 'doc_type',
            type: 'select',
            required: true,
            values: ['cpf', 'cnpj'],
            maxSelect: 1,
          },
          {
            name: 'doc_number',
            type: 'text',
            required: true,
          },
          {
            name: 'pix_key_type',
            type: 'select',
            required: false,
            values: ['cpf', 'cnpj', 'email', 'phone', 'random', 'none'],
            maxSelect: 1,
          },
          {
            name: 'pix_key',
            type: 'text',
          },
          {
            name: 'bank_name',
            type: 'text',
          },
          {
            name: 'bank_agency',
            type: 'text',
          },
          {
            name: 'bank_account',
            type: 'text',
          },
          {
            name: 'status',
            type: 'select',
            required: false,
            values: ['pending', 'verified', 'rejected'],
            maxSelect: 1,
          },
          {
            name: 'reviewed_at',
            type: 'date',
          },
          {
            name: 'reviewed_by',
            type: 'relation',
            collectionId: usersId,
            maxSelect: 1,
          },
          {
            name: 'reviewer_note',
            type: 'text',
          },
          {
            name: 'created',
            type: 'autodate',
            onCreate: true,
            onUpdate: false,
          },
          {
            name: 'updated',
            type: 'autodate',
            onCreate: true,
            onUpdate: true,
          },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_pro_payment_accounts_user ON pro_payment_accounts (user_id)',
          'CREATE INDEX idx_pro_payment_accounts_status ON pro_payment_accounts (status)',
        ],
      })
      app.save(accountsCol)
    }

    // 2. payouts collection
    let payoutsCol = null
    try {
      payoutsCol = app.findCollectionByNameOrId('payouts')
    } catch (_) {}

    if (!payoutsCol) {
      payoutsCol = new Collection({
        name: 'payouts',
        type: 'base',
        listRule:
          "@request.auth.id != '' && (pro_id = @request.auth.id || @request.auth.role = 'admin')",
        viewRule:
          "@request.auth.id != '' && (pro_id = @request.auth.id || @request.auth.role = 'admin')",
        createRule: "@request.auth.role = 'admin'", // Pro cannot create payouts; created via backend/cron/admin
        updateRule: "@request.auth.role = 'admin'",
        deleteRule: "@request.auth.role = 'admin'",
        fields: [
          {
            name: 'pro_id',
            type: 'relation',
            required: true,
            collectionId: usersId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'job_id',
            type: 'relation',
            required: true,
            collectionId: jobsId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'amount_gross',
            type: 'number',
          },
          {
            name: 'platform_fee',
            type: 'number',
          },
          {
            name: 'penalty_debit',
            type: 'number',
          },
          {
            name: 'amount_net',
            type: 'number',
          },
          {
            name: 'status',
            type: 'select',
            required: false,
            values: ['pending', 'paid', 'failed'],
            maxSelect: 1,
          },
          {
            name: 'method',
            type: 'text',
          },
          {
            name: 'external_id',
            type: 'text',
          },
          {
            name: 'paid_at',
            type: 'date',
          },
          {
            name: 'notes',
            type: 'text',
          },
          {
            name: 'created',
            type: 'autodate',
            onCreate: true,
            onUpdate: false,
          },
          {
            name: 'updated',
            type: 'autodate',
            onCreate: true,
            onUpdate: true,
          },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_payouts_job ON payouts (job_id)',
          'CREATE INDEX idx_payouts_pro ON payouts (pro_id, created DESC)',
          'CREATE INDEX idx_payouts_status ON payouts (status)',
        ],
      })
      app.save(payoutsCol)
    }

    // 3. Retroactive data repair:
    // For each job with payment_status IN ('released','captured') AND pro_id != '' without an existing payout,
    // create retroactive payout: status='paid', paid_at=payment_released_at (or now if empty),
    // platform_fee calculated with service_fee_percent of settings, amount_gross = client_price || price.
    try {
      let feePercent = 15
      try {
        const settingsRecords = app.findRecordsByFilter('settings', '1=1', '', 1, 0)
        if (settingsRecords.length > 0) {
          const s = settingsRecords[0]
          const fp = s.getFloat('service_fee_percent')
          if (fp > 0) feePercent = fp
        }
      } catch (_) {}

      const jobsFilter =
        "(payment_status = 'released' || payment_status = 'captured') && pro_id != ''"
      const eligibleJobs = app.findRecordsByFilter('jobs', jobsFilter, '-created', 500, 0)
      const nowIso = new Date().toISOString()
      const savedPayoutsCol = app.findCollectionByNameOrId('payouts')

      for (let i = 0; i < eligibleJobs.length; i++) {
        const j = eligibleJobs[i]
        const jId = j.getString('id')
        const pId = j.getString('pro_id')

        if (!pId) continue

        // Check if payout already exists for this job
        let existing = null
        try {
          existing = app.findFirstRecordByData('payouts', 'job_id', jId)
        } catch (_) {}

        if (existing) continue

        const clientPrice = j.getFloat('client_price')
        const price = j.getFloat('price')
        const gross = clientPrice > 0 ? clientPrice : price > 0 ? price : 0
        const fee = Math.round(gross * (feePercent / 100) * 100) / 100
        const penaltyDebit = 0
        const net = Math.max(0, Math.round((gross - fee - penaltyDebit) * 100) / 100)
        const relAt = j.getString('payment_released_at') || nowIso

        const pRec = new Record(savedPayoutsCol)
        pRec.set('pro_id', pId)
        pRec.set('job_id', jId)
        pRec.set('amount_gross', gross)
        pRec.set('platform_fee', fee)
        pRec.set('penalty_debit', penaltyDebit)
        pRec.set('amount_net', net)
        pRec.set('status', 'paid')
        pRec.set('method', 'pix')
        pRec.set('external_id', '')
        pRec.set('paid_at', relAt)
        pRec.set('notes', 'Repasse retroativo automático')
        app.save(pRec)
      }
    } catch (e) {
      console.log('[0039_payouts] erro ao criar payouts retroativos:', e)
    }
  },
  (app) => {
    try {
      const pCol = app.findCollectionByNameOrId('payouts')
      app.delete(pCol)
    } catch (_) {}
    try {
      const aCol = app.findCollectionByNameOrId('pro_payment_accounts')
      app.delete(aCol)
    } catch (_) {}
  },
)
