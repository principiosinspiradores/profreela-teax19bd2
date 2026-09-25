// Server-side proxy for Google Maps Geocoding + Distance Matrix.
// The API key is read from the GOOGLE_MAPS_API_KEY secret and is NEVER sent
// to the client. Authenticated users can geocode an address or compute the
// driving distance/duration between two points.
//
// POST /backend/v1/maps/geocode      { address: string }
// POST /backend/v1/maps/distance     { origins: string, destinations: string }
//
// NOTE (hooks run in a separate VM): all logic is inlined inside each callback.

routerAdd(
  'POST',
  '/backend/v1/maps/geocode',
  async (e) => {
    const auth = e.requestInfo().auth
    if (!auth) {
      return e.json(401, { ok: false, error: 'Autenticação necessária.' })
    }

    // PocketBase does not always parse the JSON request body into an object
    // on `requestInfo().body` — it can arrive as a raw JSON string, a byte
    // array or a buffer, which makes `body.address` undefined and trips our
    // own "Endereço é obrigatório." validation. Parse the body manually
    // before extracting any field.
    let body = {}
    try {
      const rawBody = await e.requestInfo().body
      if (typeof rawBody === 'string') {
        body = JSON.parse(rawBody)
      } else if (rawBody instanceof Uint8Array || rawBody instanceof ArrayBuffer) {
        body = JSON.parse(new TextDecoder().decode(rawBody))
      } else if (rawBody && typeof rawBody === 'object') {
        body = rawBody
      }
    } catch (err) {
      console.log('[maps_proxy] Erro ao parsear body:', err)
      return e.json(400, { ok: false, error: 'Body inválido.' })
    }

    const address = (body.address || '').toString().trim()
    if (!address) {
      console.log('[maps_proxy] Body recebido:', JSON.stringify(body))
      return e.json(400, { ok: false, error: 'Endereço é obrigatório.' })
    }

    // Read GOOGLE_MAPS_SERVER_GEO_KEY first (server-side unrestricted key dedicated to Geocoding API).
    // Fall back to GOOGLE_MAPS_API_KEY if not configured.
    const serverGeoKey = $os.getenv('GOOGLE_MAPS_SERVER_GEO_KEY') || ''
    const fallbackKey = $os.getenv('GOOGLE_MAPS_API_KEY') || ''
    const apiKey = serverGeoKey || fallbackKey

    console.log(
      '[maps_proxy/geocode] GOOGLE_MAPS_SERVER_GEO_KEY prefix:',
      serverGeoKey ? serverGeoKey.substring(0, 5) + '...' : '(empty)',
      '| usingKeySource:',
      serverGeoKey ? 'GOOGLE_MAPS_SERVER_GEO_KEY' : fallbackKey ? 'GOOGLE_MAPS_API_KEY' : 'none',
      '| keyPrefix:',
      apiKey ? apiKey.substring(0, 5) + '...' : '(empty)',
    )
    if (!apiKey) {
      return e.json(503, { ok: false, error: 'Integração Google Maps não configurada.' })
    }

    // Build the full URL manually with query params in the query string.
    // Previously this used $http.send with `params`, which produced a 400 from
    // Google. Inline-encoding the params into the URL avoids any ambiguity in
    // how the HTTP client serialises the request.
    const enc = function (s) {
      return encodeURIComponent(s)
    }
    const url =
      'https://maps.googleapis.com/maps/api/geocode/json?address=' +
      enc(address) +
      '&key=' +
      enc(apiKey)

    console.log('[maps_proxy/geocode] request url:', url.replace(enc(apiKey), 'REDACTED'))

    const res = $http.send({
      url: url,
      method: 'GET',
      headers: { Accept: 'application/json' },
      timeout: 15,
    })

    if (res.statusCode !== 200) {
      // Surface exactly what Google returned so we can diagnose 4xx/5xx.
      console.log(
        '[maps_proxy/geocode] non-200 from Google:',
        'status=',
        res.statusCode,
        'body=',
        res.rawBody || res.body || '',
      )
    }

    // Parse the JSON body if possible; otherwise return the raw text so the
    // client can see the actual error message from Google.
    let parsed = null
    try {
      parsed = res.json
    } catch (_) {
      parsed = { ok: false, raw: res.rawBody || res.body || '' }
    }

    return e.json(res.statusCode, parsed || {})
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/maps/distance',
  async (e) => {
    const auth = e.requestInfo().auth
    if (!auth) {
      return e.json(401, { ok: false, error: 'Autenticação necessária.' })
    }

    // PocketBase does not always parse the JSON request body into an object
    // on `requestInfo().body` — it can arrive as a raw JSON string, a byte
    // array or a buffer, which makes `body.origins`/`body.destinations`
    // undefined. Parse the body manually before extracting any field.
    let body = {}
    try {
      const rawBody = await e.requestInfo().body
      if (typeof rawBody === 'string') {
        body = JSON.parse(rawBody)
      } else if (rawBody instanceof Uint8Array || rawBody instanceof ArrayBuffer) {
        body = JSON.parse(new TextDecoder().decode(rawBody))
      } else if (rawBody && typeof rawBody === 'object') {
        body = rawBody
      }
    } catch (err) {
      console.log('[maps_proxy] Erro ao parsear body:', err)
      return e.json(400, { ok: false, error: 'Body inválido.' })
    }

    const origins = (body.origins || '').toString().trim()
    const destinations = (body.destinations || '').toString().trim()
    if (!origins || !destinations) {
      console.log('[maps_proxy] Body recebido:', JSON.stringify(body))
      return e.json(400, { ok: false, error: 'Origens e destinos são obrigatórios.' })
    }

    const apiKey = $os.getenv('GOOGLE_MAPS_API_KEY') || ''
    if (!apiKey) {
      return e.json(503, { ok: false, error: 'Integração Google Maps não configurada.' })
    }

    const enc = function (s) {
      return encodeURIComponent(s)
    }
    const url =
      'https://maps.googleapis.com/maps/api/distancematrix/json?origins=' +
      enc(origins) +
      '&destinations=' +
      enc(destinations) +
      '&key=' +
      enc(apiKey)

    const res = $http.send({
      url: url,
      method: 'GET',
      headers: { Accept: 'application/json' },
      timeout: 15,
    })

    if (res.statusCode !== 200) {
      console.log(
        '[maps_proxy/distance] non-200 from Google:',
        'status=',
        res.statusCode,
        'body=',
        res.rawBody || res.body || '',
      )
    }

    let parsed = null
    try {
      parsed = res.json
    } catch (_) {
      parsed = { ok: false, raw: res.rawBody || res.body || '' }
    }

    return e.json(res.statusCode, parsed || {})
  },
  $apis.requireAuth(),
)
