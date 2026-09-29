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

  // --- Validação aditiva do raio de atendimento (Alteração 1c) ----------------
  // Se settings tiver centro configurado e o payload trouxer latitude/longitude,
  // calcular haversine e rejeitar com erro 400 se ultrapassar o raio de atendimento.
  // Falha aberta: se sem centro ou sem coordenadas, aceita normalmente.
  const jobLat = record.getFloat('latitude')
  const jobLng = record.getFloat('longitude')

  if (jobLat && jobLng) {
    try {
      const settingsRows = $app.findRecordsByFilter('settings', '1=1', '', 1, 0)
      if (settingsRows.length > 0) {
        const s = settingsRows[0]
        const centerLatVal = s.get('service_center_lat')
        const centerLngVal = s.get('service_center_lng')
        const hasCenter =
          centerLatVal !== null &&
          centerLatVal !== undefined &&
          centerLatVal !== '' &&
          centerLngVal !== null &&
          centerLngVal !== undefined &&
          centerLngVal !== ''

        if (hasCenter) {
          const centerLat = s.getFloat('service_center_lat')
          const centerLng = s.getFloat('service_center_lng')
          const radiusKm = s.getFloat('service_radius_km') || 15

          // Haversine inline em km
          const R = 6371
          const dLat = ((jobLat - centerLat) * Math.PI) / 180
          const dLng = ((jobLng - centerLng) * Math.PI) / 180
          const lat1 = (centerLat * Math.PI) / 180
          const lat2 = (jobLat * Math.PI) / 180
          const h =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2)
          const distanceKm = 2 * R * Math.asin(Math.sqrt(h))

          if (distanceKm > radiusKm) {
            throw new BadRequestError('Fora da área de atendimento (raio de ' + radiusKm + ' km)')
          }
        }
      }
    } catch (err) {
      if (err instanceof BadRequestError || (err && err.name === 'BadRequestError')) {
        throw err
      }
      // Outros erros: falha aberta para não quebrar fluxos existentes
      console.log('[job_payment_guard] erro ao verificar raio de atendimento:', err)
    }
  }

  const requested = record.getString('payment_status')
  const intentId = record.getString('payment_intent_id')

  if ((requested === 'authorized' || requested === 'held') && intentId) {
    // Valid pre-auth creation (or held for backwards compatibility): allow it,
    // and stamp the authorized time if the client didn't provide one.
    if (!record.getString('payment_authorized_at')) {
      record.set('payment_authorized_at', new Date().toISOString())
    }
    e.next()
    return
  }

  // Any other client-supplied payment_status (released, captured, refunded, ...)
  // is not allowed from a client create. Strip it so the job is created unpaid —
  // the client cannot self-release funds.
  if (requested) {
    record.set('payment_status', '')
  }
  if (intentId && requested !== 'authorized' && requested !== 'held') {
    record.set('payment_intent_id', '')
  }

  e.next()
}, 'jobs')
