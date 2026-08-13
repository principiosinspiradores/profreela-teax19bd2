// Lock down `reviews` API rules so reviews can ONLY be created/edited through
// the validated /backend/v1/reviews route (which enforces: only the job's
// customer, job must be `completed`, one review per job+author, rating 1-5).
//
// - list/view: any authenticated user (so clients/pros/admin can read reviews)
// - create/update: superusers (admin) only — the app never writes reviews
//   directly to the collection; it goes through the hook route.
// - delete: admin only
//
// This is a forward-only migration (the rules intentionally lock down the
// collection). The down() restores the previous permissive rules.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('reviews')
    col.listRule = "@request.auth.id != ''"
    col.viewRule = "@request.auth.id != ''"
    // Only superusers (admin via the Admin UI) can create/update reviews
    // directly. App clients must go through /backend/v1/reviews, where the
    // author/recipient/job/status/uniqueness are all validated server-side.
    col.createRule = null
    col.updateRule = null
    col.deleteRule = "@request.auth.role = 'admin'"
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('reviews')
    col.listRule = "@request.auth.id != ''"
    col.viewRule = "@request.auth.id != ''"
    col.createRule = "@request.auth.id != ''"
    col.updateRule = "@request.auth.id != ''"
    col.deleteRule = "@request.auth.role = 'admin'"
    app.save(col)
  },
)
