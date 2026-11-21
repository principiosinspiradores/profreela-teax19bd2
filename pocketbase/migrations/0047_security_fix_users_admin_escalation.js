// 0047_security_fix_users_admin_escalation
//
// BREACH: users.createRule estava vazio (''), ou seja, criação pública livre
// pela API. Como o campo `role` aceita o valor 'admin' e é enviado no corpo,
// qualquer pessoa criava uma conta de administrador por POST direto em
// /api/collections/users/records — sem usar a interface e sem estar logada.
//
// Também era possível a um usuário comum se autopromover a admin, porque a
// updateRule permitia editar o próprio registro inteiro, incluindo `role`.
//
// CORREÇÃO (aditiva, sem mexer no fluxo do app):
//   - createRule passa a exigir que o registro criado NÃO tenha role='admin'.
//     O auto-cadastro público continua funcionando exatamente como hoje
//     (AuthDialog faz signUp com role 'client' ou 'pro').
//   - updateRule impede que alguém coloque role='admin' no próprio registro
//     ou no de outro; só um admin já autenticado pode gravar role='admin'.
//
// Nenhuma tela, componente ou campo é alterado. Só as duas regras de acesso.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // Criação pública permitida (cadastro do app), mas nunca como admin.
    users.createRule = "role != 'admin'"

    // Atualização: dono do registro ou admin — e role='admin' só por admin.
    users.updateRule =
      "@request.auth.id != '' && (((id = @request.auth.id) && (@request.body.role != 'admin')) || (@request.auth.role = 'admin'))"

    app.save(users)
  },
  (app) => {
    try {
      const users = app.findCollectionByNameOrId('_pb_users_auth_')
      users.createRule = ''
      users.updateRule = "id = @request.auth.id || @request.auth.role = 'admin'"
      app.save(users)
    } catch (_) {}
  },
)
