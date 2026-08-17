// Returns the Google Maps API key to the frontend so it can load the Google
// Maps JavaScript API (Places Autocomplete). The key is intentionally exposed
// to authenticated clients: it should be restricted (by API + HTTP referrer)
// in the Google Cloud console. It is NOT the same secret used for server-side
// Geocoding — both can be the same key, but the Places Autocomplete call must
// originate from the browser.
//
// GET /backend/v1/maps/api-key   (auth required)
//
// Returns: { ok: true, key: "AIza..." }
//
// NOTE (hooks run in a separate VM): all logic is inlined inside the callback.

routerAdd(
  'GET',
  '/backend/v1/maps/api-key',
  (e) => {
    const auth = e.requestInfo().auth
    if (!auth) {
      return e.json(401, { ok: false, error: 'Autenticação necessária.' })
    }

    const apiKey = $os.getenv('GOOGLE_MAPS_API_KEY') || ''
    if (!apiKey) {
      return e.json(503, { ok: false, error: 'Integração Google Maps não configurada.' })
    }

    return e.json(200, { ok: true, key: apiKey })
  },
  $apis.requireAuth(),
)
