migrate(
  (app) => {
    // -------------------------------------------------------------
    // Limpeza de dados de teste para preparação do ambiente de produção.
    //
    // MANTER INTACTOS:
    // - settings (registro "Plataforma")
    // - cancellation_policies (registro atual)
    // - services (os 4 serviços base)
    // - Usuário admin real: janluyfranca@gmail.com
    // - Usuário cliente real: ligalhardo@msn.com (Eliana Galhardo)
    //
    // APAGAR TUDO O RESTO em ordem segura de dependências:
    // 1. job_photos, messages, chats, notifications, disintermediation_alerts,
    //    moderation_logs, cancellations, reviews, payouts, payment_events
    // 2. pro_payment_accounts, documents, availability, saved_locations, banners
    // 3. jobs (todos)
    // 4. users: todos exceto janluyfranca@gmail.com e ligalhardo@msn.com
    //
    // Usamos app.delete(record) para garantir que arquivos de storage
    // (fotos, documentos, avatars) sejam removidos corretamente.
    // Usamos batches em loop para não estourar memória e garantir que
    // todos os registros sejam excluídos de forma idempotente.
    // -------------------------------------------------------------

    function deleteCollectionRecords(colName) {
      try {
        // Itera até que não existam mais registros na coleção
        let count = 0
        while (true) {
          const records = app.findRecordsByFilter(colName, '1=1', '', 200, 0)
          if (!records || records.length === 0) break
          for (let i = 0; i < records.length; i++) {
            try {
              app.delete(records[i])
              count++
            } catch (err) {
              // Se falhar via app.delete, tenta fallback SQL no registro
              const id = records[i].getString('id')
              try {
                app
                  .db()
                  .newQuery('DELETE FROM ' + colName + ' WHERE id = {:id}')
                  .bind({ id: id })
                  .execute()
              } catch (_) {}
            }
          }
        }
        // Fallback garantido via SQL caso tenha sobrado algum registro órfão
        try {
          app
            .db()
            .newQuery('DELETE FROM ' + colName)
            .execute()
        } catch (_) {}
      } catch (err) {
        console.log('[0042_cleanup] Erro ao limpar coleção ' + colName + ':', err)
      }
    }

    // 1. Coleções dependentes de jobs e de usuários
    const childCollections = [
      'job_photos',
      'messages',
      'chats',
      'notifications',
      'disintermediation_alerts',
      'moderation_logs',
      'cancellations',
      'reviews',
      'payouts',
      'payment_events',
      'pro_payment_accounts',
      'documents',
      'availability',
      'saved_locations',
      'banners',
      'jobs',
    ]

    for (let c = 0; c < childCollections.length; c++) {
      deleteCollectionRecords(childCollections[c])
    }

    // 2. Limpar usuários de teste (mantendo apenas janluyfranca@gmail.com e ligalhardo@msn.com)
    try {
      while (true) {
        const testUsers = app.findRecordsByFilter(
          'users',
          "email != 'janluyfranca@gmail.com' && email != 'ligalhardo@msn.com'",
          '',
          100,
          0,
        )
        if (!testUsers || testUsers.length === 0) break

        for (let u = 0; u < testUsers.length; u++) {
          try {
            app.delete(testUsers[u])
          } catch (err) {
            const uid = testUsers[u].getString('id')
            try {
              app.db().newQuery('DELETE FROM users WHERE id = {:id}').bind({ id: uid }).execute()
            } catch (_) {}
          }
        }
      }

      // Fallback SQL defensivo para garantir que nenhum email de teste restou
      app
        .db()
        .newQuery(
          "DELETE FROM users WHERE email != 'janluyfranca@gmail.com' AND email != 'ligalhardo@msn.com'",
        )
        .execute()
    } catch (err) {
      console.log('[0042_cleanup] Erro ao limpar usuários de teste:', err)
    }

    // 3. Garantir integridade dos 2 usuários mantidos
    try {
      const admin = app.findAuthRecordByEmail('_pb_users_auth_', 'janluyfranca@gmail.com')
      if (admin) {
        admin.set('penalty_balance', 0)
        admin.set('blocked_until', '')
        admin.set('suspended', false)
        app.save(admin)
      }
    } catch (_) {}

    try {
      const client = app.findAuthRecordByEmail('_pb_users_auth_', 'ligalhardo@msn.com')
      if (client) {
        client.set('penalty_balance', 0)
        client.set('blocked_until', '')
        client.set('suspended', false)
        app.save(client)
      }
    } catch (_) {}
  },
  (app) => {
    // Reversão de limpeza de teste em migração de dados é no-op.
  },
)
