migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    try {
      app.findAuthRecordByEmail('_pb_users_auth_', 'janluyfranca@gmail.com')
    } catch (_) {
      const admin = new Record(users)
      admin.setEmail('janluyfranca@gmail.com')
      admin.setPassword('Skip@Pass')
      admin.setVerified(true)
      admin.set('name', 'Admin')
      admin.set('role', 'admin')
      admin.set('status', 'active')
      admin.set('terms_accepted', true)
      app.save(admin)
    }

    try {
      app.findAuthRecordByEmail('_pb_users_auth_', 'pro@example.com')
    } catch (_) {
      const pro = new Record(users)
      pro.setEmail('pro@example.com')
      pro.setPassword('Skip@Pass')
      pro.setVerified(true)
      pro.set('name', 'Ana Silva (Pro)')
      pro.set('role', 'pro')
      pro.set('status', 'active')
      pro.set('terms_accepted', true)
      app.save(pro)
    }

    try {
      app.findAuthRecordByEmail('_pb_users_auth_', 'client@example.com')
    } catch (_) {
      const client = new Record(users)
      client.setEmail('client@example.com')
      client.setPassword('Skip@Pass')
      client.setVerified(true)
      client.set('name', 'Hotel Plaza (Client)')
      client.set('role', 'client')
      client.set('status', 'active')
      client.set('terms_accepted', true)
      app.save(client)
    }

    const services = app.findCollectionByNameOrId('services')
    const serviceData = [
      { name: 'Faxineira', base_price: 150, description: 'Limpeza geral', icon: 'sparkles' },
      { name: 'Camareira', base_price: 180, description: 'Organização de quartos', icon: 'bed' },
      {
        name: 'Auxiliar de Serviços Gerais',
        base_price: 130,
        description: 'Apoio operacional',
        icon: 'briefcase',
      },
      {
        name: 'Ajudante Operacional',
        base_price: 140,
        description: 'Carga, descarga e apoio',
        icon: 'package',
      },
    ]

    for (const s of serviceData) {
      try {
        app.findFirstRecordByData('services', 'name', s.name)
      } catch (_) {
        const rec = new Record(services)
        rec.set('name', s.name)
        rec.set('base_price', s.base_price)
        rec.set('description', s.description)
        rec.set('icon', s.icon)
        app.save(rec)
      }
    }

    const banners = app.findCollectionByNameOrId('banners')
    try {
      app.findFirstRecordByData('banners', 'city', 'Campinas')
    } catch (_) {
      const rec = new Record(banners)
      rec.set('image_url', 'https://img.usecurling.com/p/800/200?q=cleaning%20supplies')
      rec.set('link', 'https://example.com')
      rec.set('active', true)
      rec.set('city', 'Campinas')
      app.save(rec)
    }
  },
  (app) => {},
)
