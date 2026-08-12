// Allow admins to manage (list/view/update) any user record, so the admin
// "Usuários" page can fetch the full user list and block/unblock or change
// roles. Delete remains superuser-only to prevent accidental data loss.
migrate(
  (app) => {
    let collection
    try {
      collection = app.findCollectionByNameOrId('_pb_users_auth_')
    } catch (_) {
      return
    }

    // Admin can see every user; a user can still see/edit only themselves.
    collection.listRule = "id = @request.auth.id || @request.auth.role = 'admin'"
    collection.viewRule = "id = @request.auth.id || @request.auth.role = 'admin'"
    collection.updateRule = "id = @request.auth.id || @request.auth.role = 'admin'"

    app.save(collection)
  },
  (app) => {
    let collection
    try {
      collection = app.findCollectionByNameOrId('_pb_users_auth_')
    } catch (_) {
      return
    }
    collection.listRule = 'id = @request.auth.id'
    collection.viewRule = 'id = @request.auth.id'
    collection.updateRule = 'id = @request.auth.id'
    app.save(collection)
  },
)
