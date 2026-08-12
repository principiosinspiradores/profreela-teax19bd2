// Relax the `services` collection API rules so an authenticated admin can
// create, update and delete service records.
//
// The original rule was `@request.auth.role = 'admin'`. On its own this works,
// but PocketBase evaluates create/update/delete rules as a "dry-run" submit
// against an unsaved record, and an empty-string auth (`@request.auth.id = ''`)
// causes the rule engine to fail with HTTP 400 "Failed to create record"
// instead of a clean 403. Combining the auth-id check with the role check
// makes the rule resolve deterministically for authenticated admins while
// still rejecting everyone else (unauthenticated requests short-circuit on
// the first clause).
migrate(
  (app) => {
    let collection
    try {
      collection = app.findCollectionByNameOrId('services')
    } catch (_) {
      return
    }

    // Public read (list/view) stays open so the app can render the service
    // catalogue without authentication. Only the write rules change.
    collection.createRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    collection.updateRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    collection.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"

    app.save(collection)
  },
  (app) => {
    let collection
    try {
      collection = app.findCollectionByNameOrId('services')
    } catch (_) {
      return
    }
    collection.createRule = "@request.auth.role = 'admin'"
    collection.updateRule = "@request.auth.role = 'admin'"
    collection.deleteRule = "@request.auth.role = 'admin'"
    app.save(collection)
  },
)
