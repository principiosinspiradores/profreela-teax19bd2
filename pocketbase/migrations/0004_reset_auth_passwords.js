// Resets the bcrypt password hash for the admin and seed auth records.
//
// The records existed in the database but their password hash was not
// generated correctly, so `authWithPassword` returned 400 "Failed to
// authenticate." Re-assigning the password via `record.setPassword()` +
// `app.save()` guarantees the hash is produced with the correct bcrypt
// cost, independent of how the record was originally created.
//
// (Skip Cloud runs PocketBase v0.36, where `app.dao()` was removed in
// favor of the `app.*` methods used below — see the v0.23 upgrade guide.)
migrate(
  (app) => {
    const resets = [
      {
        email: 'janluyfranca@gmail.com',
        name: 'Admin',
        role: 'admin',
        status: 'active',
      },
      {
        email: 'pro@example.com',
        name: 'Ana Silva (Pro)',
        role: 'pro',
        status: 'active',
      },
      {
        email: 'client@example.com',
        name: 'Hotel Plaza (Client)',
        role: 'client',
        status: 'active',
      },
    ]

    for (const r of resets) {
      let record
      try {
        record = app.findAuthRecordByEmail('_pb_users_auth_', r.email)
      } catch (_) {
        // Record does not exist — nothing to reset.
        continue
      }

      record.setPassword('Skip@Pass')
      record.setVerified(true)
      record.set('name', r.name)
      record.set('role', r.role)
      record.set('status', r.status)
      record.set('terms_accepted', true)
      app.save(record)
    }
  },
  (app) => {},
)
