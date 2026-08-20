// Returns a Google Maps Embed API URL for a directions view between an origin
// and a destination. The API key is read from the GOOGLE_MAPS_API_KEY secret
// and is NEVER sent to the client as a standalone value — it is only embedded
// inside the signed embed URL that the browser loads as an <iframe src>.
//
// POST /backend/v1/maps/embed-url   (auth required)
//   body: { origin?: "lat,lng", destination: "lat,lng" | address }
//
// Returns: { ok: true, url: "https://www.google.com/maps/embed/v1/directions?..." | ".../place?..." }
//
// NOTE (hooks run in a separate VM): all logic is inlined inside the callback.

routerAdd(
  'POST',
  '/backend/v1/maps/embed-url',
  (e) => {
    const auth = e.requestInfo().auth
    if (!auth) {
      return e.json(401, { ok: false, error: 'Autenticação necessária.' })
    }

    const body = e.requestInfo().body || {}
    const origin = (body.origin || '').toString().trim()
    const destination = (body.destination || '').toString().trim()
    if (!destination) {
      return e.json(400, { ok: false, error: 'Destino é obrigatório.' })
    }

    const apiKey = $os.getenv('GOOGLE_MAPS_API_KEY') || ''
    if (!apiKey) {
      return e.json(503, { ok: false, error: 'Integração Google Maps não configurada.' })
    }

    const enc = function (s) {
      return encodeURIComponent(s)
    }

    let url = ''
    if (origin) {
      url =
        'https://www.google.com/maps/embed/v1/directions?key=' +
        enc(apiKey) +
        '&origin=' +
        enc(origin) +
        '&destination=' +
        enc(destination) +
        '&mode=driving'
    } else {
      url =
        'https://www.google.com/maps/embed/v1/place?key=' + enc(apiKey) + '&q=' + enc(destination)
    }

    return e.json(200, { ok: true, url: url })
  },
  $apis.requireAuth(),
)
