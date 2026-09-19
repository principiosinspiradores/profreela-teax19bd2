// Migration to inspect users collection properties
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const superusers = app.findCollectionByNameOrId('_superusers')

    let usersProps = {}
    for (let k in users) {
      if (typeof users[k] !== 'function') {
        usersProps[k] = users[k]
      }
    }

    let superusersProps = {}
    for (let k in superusers) {
      if (typeof superusers[k] !== 'function') {
        superusersProps[k] = superusers[k]
      }
    }

    throw new Error(
      'DEBUG: users=' + JSON.stringify(usersProps) + ' || super=' + JSON.stringify(superusersProps),
    )
  },
  (app) => {},
)
