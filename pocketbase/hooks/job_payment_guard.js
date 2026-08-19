// Guards the `payment_status` field on job creation so a client cannot forge
// a released/captured state.
//
// In the "pay at request" (escrow) model, the client pays BEFORE creating the
// job, then creates it with `payment_status = 'held'` + the gateway payment
// intent id returned by /backend/v1/payments/create-split. A malicious client
// could otherwise send `payment_status = 'released'` directly and skip the
// escrow entirely. This hook clamps the client-supplied value:
//
//   - A client may only set payment_status to 'held', and only when a non-empty
//     payment_intent_id is also provided. Anything else is stripped to empty
//     (the job is created unpaid, like the legacy flow).
//   - Admins are trusted and can set any value.
//
// Hook type: onRecordCreateRequest on `jobs` (HTTP-level, fires before save).
onRecordCreateRequest((e) => {
  const record = e.record
  if (!record) {
    e.next()
    return
  }

  const auth = e.requestInfo().auth
  const isAdmin = auth && auth.getString('role') === 'admin'
  if (isAdmin) {
    e.next()
    return
  }

  const requested = record.getString('payment_status')
  const intentId = record.getString('payment_intent_id')

  if (requested === 'held' && intentId) {
    // Valid paid-at-request creation: allow it, and stamp the authorized time
    // if the client didn't provide one.
    if (!record.getString('payment_authorized_at')) {
      record.set('payment_authorized_at', new Date().toISOString())
    }
    e.next()
    return
  }

  // Any other client-supplied payment_status (released, captured, refunded,
  // authorized, ...) is not allowed from a client create. Strip it so the job
  // is created unpaid — the client cannot self-release funds.
  if (requested) {
    record.set('payment_status', '')
  }
  if (intentId && requested !== 'held') {
    record.set('payment_intent_id', '')
  }

  e.next()
}, 'jobs')
