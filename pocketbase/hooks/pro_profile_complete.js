/**
 * Server-side hooks to keep `profile_complete` synchronized for professionals:
 *
 * 1. When a document changes status, or is created/deleted/updated:
 *    recalculate profile_complete for that document's user_id.
 * 2. When users.phone or user record is saved:
 *    if role === 'pro', recalculate.
 * 3. When pro_payment_accounts is created, updated or deleted:
 *    recalculate for that user_id.
 *
 * Note: Skip Cloud / PocketBase JSVM runs callbacks in separate VMs.
 * Helper functions MUST be defined inside the callback to avoid ReferenceError.
 */

onRecordAfterCreateSuccess((e) => {
  try {
    const userId = e.record.getString('user_id')
    if (!userId) {
      e.next()
      return
    }

    let user = null
    try {
      user = $app.findRecordById('users', userId)
    } catch (_) {
      e.next()
      return
    }

    if (!user || user.getString('role') !== 'pro') {
      e.next()
      return
    }

    const phone = (user.getString('phone') || '').trim()
    let hasApprovedDoc = false
    try {
      const approvedDocs = $app.findRecordsByFilter(
        'documents',
        "user_id = '" + userId + "' && status = 'approved'",
        '-created',
        1,
        0,
      )
      if (approvedDocs && approvedDocs.length > 0) {
        hasApprovedDoc = true
      }
    } catch (_) {}

    let hasVerifiedPix = false
    try {
      const accounts = $app.findRecordsByFilter(
        'pro_payment_accounts',
        "user_id = '" + userId + "' && status = 'verified'",
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

    const isComplete = hasApprovedDoc && !!phone && hasVerifiedPix
    const wasComplete = user.getBool('profile_complete')

    if (isComplete !== wasComplete) {
      user.set('profile_complete', isComplete)
      $app.save(user)

      if (isComplete && !wasComplete) {
        try {
          const notifCol = $app.findCollectionByNameOrId('notifications')
          const notif = new Record(notifCol)
          notif.set('user_id', userId)
          notif.set('type', 'system')
          notif.set('title', 'Perfil completo!')
          notif.set('message', 'Perfil completo! Você já pode receber solicitações.')
          notif.set('read_status', false)
          $app.save(notif)
        } catch (_) {}
      }
    }
  } catch (err) {
    console.log('[pro_profile_complete] doc create err:', err)
  }
  e.next()
}, 'documents')

onRecordAfterUpdateSuccess((e) => {
  try {
    const userId = e.record.getString('user_id')
    if (!userId) {
      e.next()
      return
    }

    let user = null
    try {
      user = $app.findRecordById('users', userId)
    } catch (_) {
      e.next()
      return
    }

    if (!user || user.getString('role') !== 'pro') {
      e.next()
      return
    }

    const phone = (user.getString('phone') || '').trim()
    let hasApprovedDoc = false
    try {
      const approvedDocs = $app.findRecordsByFilter(
        'documents',
        "user_id = '" + userId + "' && status = 'approved'",
        '-created',
        1,
        0,
      )
      if (approvedDocs && approvedDocs.length > 0) {
        hasApprovedDoc = true
      }
    } catch (_) {}

    let hasVerifiedPix = false
    try {
      const accounts = $app.findRecordsByFilter(
        'pro_payment_accounts',
        "user_id = '" + userId + "' && status = 'verified'",
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

    const isComplete = hasApprovedDoc && !!phone && hasVerifiedPix
    const wasComplete = user.getBool('profile_complete')

    if (isComplete !== wasComplete) {
      user.set('profile_complete', isComplete)
      $app.save(user)

      if (isComplete && !wasComplete) {
        try {
          const notifCol = $app.findCollectionByNameOrId('notifications')
          const notif = new Record(notifCol)
          notif.set('user_id', userId)
          notif.set('type', 'system')
          notif.set('title', 'Perfil completo!')
          notif.set('message', 'Perfil completo! Você já pode receber solicitações.')
          notif.set('read_status', false)
          $app.save(notif)
        } catch (_) {}
      }
    }
  } catch (err) {
    console.log('[pro_profile_complete] doc update err:', err)
  }
  e.next()
}, 'documents')

onRecordAfterDeleteSuccess((e) => {
  try {
    const userId = e.record.getString('user_id')
    if (!userId) {
      e.next()
      return
    }

    let user = null
    try {
      user = $app.findRecordById('users', userId)
    } catch (_) {
      e.next()
      return
    }

    if (!user || user.getString('role') !== 'pro') {
      e.next()
      return
    }

    const phone = (user.getString('phone') || '').trim()
    let hasApprovedDoc = false
    try {
      const approvedDocs = $app.findRecordsByFilter(
        'documents',
        "user_id = '" + userId + "' && status = 'approved'",
        '-created',
        1,
        0,
      )
      if (approvedDocs && approvedDocs.length > 0) {
        hasApprovedDoc = true
      }
    } catch (_) {}

    let hasVerifiedPix = false
    try {
      const accounts = $app.findRecordsByFilter(
        'pro_payment_accounts',
        "user_id = '" + userId + "' && status = 'verified'",
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

    const isComplete = hasApprovedDoc && !!phone && hasVerifiedPix
    const wasComplete = user.getBool('profile_complete')

    if (isComplete !== wasComplete) {
      user.set('profile_complete', isComplete)
      $app.save(user)
    }
  } catch (err) {
    console.log('[pro_profile_complete] doc delete err:', err)
  }
  e.next()
}, 'documents')

onRecordAfterCreateSuccess((e) => {
  try {
    const userId = e.record.getString('user_id')
    if (!userId) {
      e.next()
      return
    }

    let user = null
    try {
      user = $app.findRecordById('users', userId)
    } catch (_) {
      e.next()
      return
    }

    if (!user || user.getString('role') !== 'pro') {
      e.next()
      return
    }

    const phone = (user.getString('phone') || '').trim()
    let hasApprovedDoc = false
    try {
      const approvedDocs = $app.findRecordsByFilter(
        'documents',
        "user_id = '" + userId + "' && status = 'approved'",
        '-created',
        1,
        0,
      )
      if (approvedDocs && approvedDocs.length > 0) {
        hasApprovedDoc = true
      }
    } catch (_) {}

    let hasVerifiedPix = false
    try {
      const accounts = $app.findRecordsByFilter(
        'pro_payment_accounts',
        "user_id = '" + userId + "' && status = 'verified'",
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

    const isComplete = hasApprovedDoc && !!phone && hasVerifiedPix
    const wasComplete = user.getBool('profile_complete')

    if (isComplete !== wasComplete) {
      user.set('profile_complete', isComplete)
      $app.save(user)

      if (isComplete && !wasComplete) {
        try {
          const notifCol = $app.findCollectionByNameOrId('notifications')
          const notif = new Record(notifCol)
          notif.set('user_id', userId)
          notif.set('type', 'system')
          notif.set('title', 'Perfil completo!')
          notif.set('message', 'Perfil completo! Você já pode receber solicitações.')
          notif.set('read_status', false)
          $app.save(notif)
        } catch (_) {}
      }
    }
  } catch (err) {
    console.log('[pro_profile_complete] pro_payment_accounts create err:', err)
  }
  e.next()
}, 'pro_payment_accounts')

onRecordAfterUpdateSuccess((e) => {
  try {
    const userId = e.record.getString('user_id')
    if (!userId) {
      e.next()
      return
    }

    let user = null
    try {
      user = $app.findRecordById('users', userId)
    } catch (_) {
      e.next()
      return
    }

    if (!user || user.getString('role') !== 'pro') {
      e.next()
      return
    }

    const phone = (user.getString('phone') || '').trim()
    let hasApprovedDoc = false
    try {
      const approvedDocs = $app.findRecordsByFilter(
        'documents',
        "user_id = '" + userId + "' && status = 'approved'",
        '-created',
        1,
        0,
      )
      if (approvedDocs && approvedDocs.length > 0) {
        hasApprovedDoc = true
      }
    } catch (_) {}

    let hasVerifiedPix = false
    try {
      const accounts = $app.findRecordsByFilter(
        'pro_payment_accounts',
        "user_id = '" + userId + "' && status = 'verified'",
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

    const isComplete = hasApprovedDoc && !!phone && hasVerifiedPix
    const wasComplete = user.getBool('profile_complete')

    if (isComplete !== wasComplete) {
      user.set('profile_complete', isComplete)
      $app.save(user)

      if (isComplete && !wasComplete) {
        try {
          const notifCol = $app.findCollectionByNameOrId('notifications')
          const notif = new Record(notifCol)
          notif.set('user_id', userId)
          notif.set('type', 'system')
          notif.set('title', 'Perfil completo!')
          notif.set('message', 'Perfil completo! Você já pode receber solicitações.')
          notif.set('read_status', false)
          $app.save(notif)
        } catch (_) {}
      }
    }
  } catch (err) {
    console.log('[pro_profile_complete] pro_payment_accounts update err:', err)
  }
  e.next()
}, 'pro_payment_accounts')

onRecordAfterDeleteSuccess((e) => {
  try {
    const userId = e.record.getString('user_id')
    if (!userId) {
      e.next()
      return
    }

    let user = null
    try {
      user = $app.findRecordById('users', userId)
    } catch (_) {
      e.next()
      return
    }

    if (!user || user.getString('role') !== 'pro') {
      e.next()
      return
    }

    const phone = (user.getString('phone') || '').trim()
    let hasApprovedDoc = false
    try {
      const approvedDocs = $app.findRecordsByFilter(
        'documents',
        "user_id = '" + userId + "' && status = 'approved'",
        '-created',
        1,
        0,
      )
      if (approvedDocs && approvedDocs.length > 0) {
        hasApprovedDoc = true
      }
    } catch (_) {}

    let hasVerifiedPix = false
    try {
      const accounts = $app.findRecordsByFilter(
        'pro_payment_accounts',
        "user_id = '" + userId + "' && status = 'verified'",
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

    const isComplete = hasApprovedDoc && !!phone && hasVerifiedPix
    const wasComplete = user.getBool('profile_complete')

    if (isComplete !== wasComplete) {
      user.set('profile_complete', isComplete)
      $app.save(user)
    }
  } catch (err) {
    console.log('[pro_profile_complete] pro_payment_accounts delete err:', err)
  }
  e.next()
}, 'pro_payment_accounts')

onRecordAfterUpdateSuccess((e) => {
  try {
    const user = e.record
    if (!user || user.getString('role') !== 'pro') {
      e.next()
      return
    }

    const userId = user.getString('id')
    const phone = (user.getString('phone') || '').trim()

    let hasApprovedDoc = false
    try {
      const approvedDocs = $app.findRecordsByFilter(
        'documents',
        "user_id = '" + userId + "' && status = 'approved'",
        '-created',
        1,
        0,
      )
      if (approvedDocs && approvedDocs.length > 0) {
        hasApprovedDoc = true
      }
    } catch (_) {}

    let hasVerifiedPix = false
    try {
      const accounts = $app.findRecordsByFilter(
        'pro_payment_accounts',
        "user_id = '" + userId + "' && status = 'verified'",
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

    const isComplete = hasApprovedDoc && !!phone && hasVerifiedPix
    const wasComplete = user.getBool('profile_complete')

    if (isComplete !== wasComplete) {
      user.set('profile_complete', isComplete)
      $app.save(user)

      if (isComplete && !wasComplete) {
        try {
          const notifCol = $app.findCollectionByNameOrId('notifications')
          const notif = new Record(notifCol)
          notif.set('user_id', userId)
          notif.set('type', 'system')
          notif.set('title', 'Perfil completo!')
          notif.set('message', 'Perfil completo! Você já pode receber solicitações.')
          notif.set('read_status', false)
          $app.save(notif)
        } catch (_) {}
      }
    }
  } catch (err) {
    console.log('[pro_profile_complete] user update err:', err)
  }
  e.next()
}, 'users')
