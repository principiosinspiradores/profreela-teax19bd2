// Migration 0046:
// 1. users.status: add 'deleted' to the select values ('pending', 'active', 'blocked', 'deleted').
// 2. users.profile_complete: bool field (default false).
// 3. Recalculate profile_complete for existing pros:
//    - role = 'pro'
//    - has at least 1 approved document in `documents`
//    - users.phone is not empty
//    - has a verified account in `pro_payment_accounts` with status = 'verified' and valid pix_key
//
// Access rules:
// - Keep documents.deleteRule permitting admin deletion
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // 1. Update status select to include 'deleted'
    users.fields.removeByName('status')
    users.fields.add(
      new SelectField({
        name: 'status',
        values: ['pending', 'active', 'blocked', 'deleted'],
        required: true,
        maxSelect: 1,
      }),
    )

    // 2. Add profile_complete bool field (optional so false is allowed)
    if (!users.fields.getByName('profile_complete')) {
      users.fields.add(
        new BoolField({
          name: 'profile_complete',
          required: false,
        }),
      )
    }

    app.save(users)

    // Ensure documents deleteRule allows admin or owner
    try {
      const docs = app.findCollectionByNameOrId('documents')
      docs.deleteRule =
        "@request.auth.id != '' && (user_id = @request.auth.id || @request.auth.role = 'admin')"
      app.save(docs)
    } catch (_) {}

    // 3. Recalculate profile_complete for existing pros
    try {
      const pros = app.findRecordsByFilter('users', "role = 'pro'", '-created', 500, 0)
      for (let i = 0; i < pros.length; i++) {
        const pro = pros[i]
        const proId = pro.getString('id')
        const phone = (pro.getString('phone') || '').trim()

        if (!phone) {
          pro.set('profile_complete', false)
          app.save(pro)
          continue
        }

        // Check documents (at least 1 approved document)
        let hasApprovedDoc = false
        try {
          const approvedDocs = app.findRecordsByFilter(
            'documents',
            "user_id = '" + proId + "' && status = 'approved'",
            '-created',
            1,
            0,
          )
          if (approvedDocs && approvedDocs.length > 0) {
            hasApprovedDoc = true
          }
        } catch (_) {}

        if (!hasApprovedDoc) {
          pro.set('profile_complete', false)
          app.save(pro)
          continue
        }

        // Check Pix in pro_payment_accounts
        let hasVerifiedPix = false
        try {
          const accounts = app.findRecordsByFilter(
            'pro_payment_accounts',
            "user_id = '" + proId + "' && status = 'verified'",
            '-created',
            1,
            0,
          )
          if (accounts && accounts.length > 0) {
            const acc = accounts[0]
            const pixKey = (acc.getString('pix_key') || '').trim()
            const pixType = acc.getString('pix_key_type')
            if (pixKey && pixType && pixType !== 'none') {
              hasVerifiedPix = true
            }
          }
        } catch (_) {}

        pro.set('profile_complete', hasApprovedDoc && !!phone && hasVerifiedPix)
        app.save(pro)
      }
    } catch (err) {
      console.log('[0046_status_deleted_profile_complete] erro ao recalcular pros:', err)
    }
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.fields.removeByName('status')
    users.fields.add(
      new SelectField({
        name: 'status',
        values: ['pending', 'active', 'blocked'],
        required: true,
        maxSelect: 1,
      }),
    )
    const pc = users.fields.getByName('profile_complete')
    if (pc) {
      users.fields.remove(pc)
    }
    app.save(users)
  },
)
