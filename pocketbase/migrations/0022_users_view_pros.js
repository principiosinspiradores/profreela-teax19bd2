// Allow any authenticated user to view/list professional (role='pro') user
// records. Client records remain visible only to their owner and to admins.
//
// Why: the client dashboard calls `getClientJobs` with `expand: 'pro_id'`,
// and the "Serviços em Andamento" card reads `job.expand.pro_id` to show the
// pro's photo and name after a job is accepted. PocketBase enforces the
// target collection's `view` rule on each expanded record, so the previous
// rule (`id = @request.auth.id || @request.auth.role = 'admin'`) caused the
// pro's record to be silently dropped from the expand — the card fell back to
// the emoji placeholder. `getNearbyPros` (the "Profissionais Disponíveis"
// card) was broken for the same reason, since it lists pro records.
//
// Pros are the public-facing service providers of the marketplace, so showing
// their name / avatar / rating to clients is the intended behaviour. The
// `email` field stays protected by PocketBase's per-record `emailVisibility`
// flag (off by default), and create/update/delete rules are unchanged, so
// no client can mutate another user's record.
migrate(
  (app) => {
    let collection
    try {
      collection = app.findCollectionByNameOrId('_pb_users_auth_')
    } catch (_) {
      return
    }

    // Self OR admin OR the record being read is a professional.
    collection.listRule = "id = @request.auth.id || @request.auth.role = 'admin' || role = 'pro'"
    collection.viewRule = "id = @request.auth.id || @request.auth.role = 'admin' || role = 'pro'"

    app.save(collection)
  },
  (app) => {
    let collection
    try {
      collection = app.findCollectionByNameOrId('_pb_users_auth_')
    } catch (_) {
      return
    }
    collection.listRule = "id = @request.auth.id || @request.auth.role = 'admin'"
    collection.viewRule = "id = @request.auth.id || @request.auth.role = 'admin'"
    app.save(collection)
  },
)
