migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('_pb_users_auth_')

    if (!col.fields.getByName('cpf')) {
      col.fields.add(
        new TextField({
          name: 'cpf',
          required: false,
          max: 20,
        }),
      )
    }

    // Add unique index on cpf WHERE cpf != '' AND cpf IS NOT NULL
    // In SQLite: CREATE UNIQUE INDEX idx_users_cpf ON users (cpf) WHERE cpf != '' AND cpf IS NOT NULL
    col.addIndex('idx_users_cpf', true, 'cpf', "cpf != '' AND cpf IS NOT NULL")

    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('_pb_users_auth_')
      try {
        col.removeIndex('idx_users_cpf')
      } catch (_) {}
      const f = col.fields.getByName('cpf')
      if (f) {
        col.fields.remove(f)
      }
      app.save(col)
    } catch (_) {}
  },
)
