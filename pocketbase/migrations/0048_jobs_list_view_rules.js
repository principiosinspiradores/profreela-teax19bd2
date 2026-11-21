// 0048_jobs_list_view_rules
//
// BREACH: as listRule/viewRule de `jobs` eram "@request.auth.id != ''", ou
// seja, qualquer usuário logado conseguia, via API direta, LISTAR todos os
// jobs do sistema — incluindo o endereço (address/latitude/longitude) de todos
// os clientes.
//
// CORREÇÃO (só regras de acesso — nenhuma tela muda):
//   list/view passam a permitir apenas:
//     - admin (vê tudo);
//     - dono do job (customer_id = @request.auth.id);
//     - pro vinculado (pro_id = @request.auth.id);
//     - QUALQUER pro logado vê jobs em oferta: status = 'pending' sem pro
//       atribuído. Isso mantém o fluxo de ofertas intacto: o Dashboard do pro
//       busca na coleção `jobs` os pendentes elegíveis (raio, declined_by,
//       reopened etc. são filtros aplicados pelo front/serviço) e o cliente
//       continua vendo o próprio job reaberto em 'pending' após o
//       cancelamento do pro (reoferta).
//   create/update/delete não mudam (update já é guardado pelo hook
//   jobs_payment_guard.js; delete já era só admin).
//
// Rollback: restaura as regras anteriores.

migrate(
  (app) => {
    const jobs = app.findCollectionByNameOrId('jobs')
    jobs.listRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || customer_id = @request.auth.id || pro_id = @request.auth.id || (status = 'pending' && pro_id = ''))"
    jobs.viewRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || customer_id = @request.auth.id || pro_id = @request.auth.id || (status = 'pending' && pro_id = ''))"
    app.save(jobs)
  },
  (app) => {
    try {
      const jobs = app.findCollectionByNameOrId('jobs')
      jobs.listRule = "@request.auth.id != ''"
      jobs.viewRule = "@request.auth.id != ''"
      app.save(jobs)
    } catch (_) {}
  },
)
