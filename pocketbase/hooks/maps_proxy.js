// Server-side proxy for Google Maps Geocoding + Distance Matrix.
// The API key is read from the GOOGLE_MAPS_API_KEY secret and is NEVER sent
// to the client. Authenticated users can geocode an address or compute the
// driving distance/duration between two points.
//
// POST /backend/v1/maps/geocode      { address: string }
// POST /backend/v1/maps/distance     { origins: string, destinations: string }
routerAdd('POST', '/backend/v1/maps/geocode', (e) => {
  const auth = e.requestInfo().auth
  if (!auth) {
    return e.json(401, { ok: false, error: 'Autenticação necessária.' })
  }

  const body = e.requestInfo().body || {}
  const address = (body.address || '').toString().trim()
  if (!address) {
    return e.json(400, { ok: false, error: 'Endereço é obrigatório.' })
  }

  const apiKey = $os.getenv('GOOGLE_MAPS_API_KEY') || ''
  if (!apiKey) {
    return e.json(503, { ok: false, error: 'Integração Google Maps não configurada.' })
  }

  const res = $http.send({
    url: 'https://maps.googleapis.com/maps/api/geocode/json',
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    params: {
      address: address,
      key: apiKey,
    },
    timeout: 15,
  })

  return e.json(res.statusCode, res.json || {})
})

routerAdd('POST', '/backend/v1/maps/distance', (e) => {
  const auth = e.requestInfo().auth
  if (!auth) {
    return e.json(401, { ok: false, error: 'Autenticação necessária.' })
  }

  const body = e.requestInfo().body || {}
  const origins = (body.origins || '').toString().trim()
  const destinations = (body.destinations || '').toString().trim()
  if (!origins || !destinations) {
    return e.json(400, { ok: false, error: 'Origens e destinos são obrigatórios.' })
  }

  const apiKey = $os.getenv('GOOGLE_MAPS_API_KEY') || ''
  if (!apiKey) {
    return e.json(503, { ok: false, error: 'Integração Google Maps não configurada.' })
  }

  const res = $http.send({
    url: 'https://maps.googleapis.com/maps/api/distancematrix/json',
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    params: {
      origins: origins,
      destinations: destinations,
      key: apiKey,
    },
    timeout: 15,
  })

  return e.json(res.statusCode, res.json || {})
})
