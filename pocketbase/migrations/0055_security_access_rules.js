// Regras de acesso de `documents`, `pro_payment_accounts`, `job_photos`,
// `settings`, `payment_events`, `services`, `cancellation_policies`,
// `cancellations` — correções de segurança 0.0.125.
//
// 1. documents / pro_payment_accounts: o DONO mantém update (sobe/replace
//    documento, edita dados Pix) mas os campos de auditoria de review
//    (status, reviewed_at, reviewed_by, reviewer_note) são protegidos pelo
//    hook pocketbase/hooks/kyc_status_guard.js (restaura valor original para
//    não-admin). Nenhuma mudança de regra necessária aqui.
//
// 2. job_photos: list/view agora exige participação no job (cliente, pro) ou
//    admin. Create/update/delete já eram do dono/admin — mantidos.
//
// 3. settings: list/view travado em admin. O front consumia via
//    getSettings() -> /backend/v1/settings (hook público já existente), não
//    direto da coleção — verificado antes de travar.
//
// 4. payment_events: list/view travado em admin (payload com dados do
//    gateway). Nenhum fluxo de usuário final lê a coleção direto.
//
// 5. services / cancellation_policies / cancellations: create/update agora
//    admin-only (impacto financeiro). O front de cliente/pro não cria nem
//    edita esses registros (verificado em src/services/cancellation.ts e
//    src/pages/admin/*) — nenhum fluxo afetado.

migrate(
  (app) => {
    const col = (name) => app.findCollectionByNameOrId(name)

    // job_photos: participantes do job (cliente OU pro vinculado) + admin
    const jobPhotos = col('job_photos')
    const jpParticipant =
      "@request.auth.id != '' && (job_id.customer_id = @request.auth.id || job_id.pro_id = @request.auth.id || @request.auth.role = 'admin')"
    jobPhotos.listRule = jpParticipant
    jobPhotos.viewRule = jpParticipant
    app.save(jobPhotos)

    // settings: somente admin lê
    const settings = col('settings')
    settings.listRule = "@request.auth.role = 'admin'"
    settings.viewRule = "@request.auth.role = 'admin'"
    app.save(settings)

    // payment_events: somente admin lê
    const pe = col('payment_events')
    pe.listRule = "@request.auth.role = 'admin'"
    pe.viewRule = "@request.auth.role = 'admin'"
    app.save(pe)

    // services: escrita já é admin-only ao vivo (confirmado) — idempotente.
    const services = col('services')
    services.createRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    services.updateRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    services.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    app.save(services)

    // cancellation_policies: escrita já é admin-only ao vivo — idempotente.
    const cp = col('cancellation_policies')
    cp.createRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    cp.updateRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    cp.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    app.save(cp)

    // cancellations: create agora admin-only (era qualquer logado) — o front
    // grava cancellations via endpoint /backend/v1/cancel-job ($app.save,
    // server-side), nunca por HTTP direto. update/delete já eram admin.
    const ca = col('cancellations')
    ca.createRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    ca.updateRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    ca.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    app.save(ca)
  },
  (app) => {
    // Revert: volta às regras anteriores (amplo) — apenas para rollback.
    const col = (name) => app.findCollectionByNameOrId(name)

    const jobPhotos = col('job_photos')
    jobPhotos.listRule = "@request.auth.id != ''"
    jobPhotos.viewRule = "@request.auth.id != ''"
    app.save(jobPhotos)

    const settings = col('settings')
    settings.listRule = null
    settings.viewRule = null
    app.save(settings)

    const pe = col('payment_events')
    pe.listRule = null
    pe.viewRule = null
    app.save(pe)

    const services = col('services')
    services.createRule = null
    services.updateRule = null
    services.deleteRule = null
    app.save(services)

    const cp = col('cancellation_policies')
    cp.createRule = null
    cp.updateRule = null
    cp.deleteRule = null
    app.save(cp)

    const ca = col('cancellations')
    ca.createRule = null
    ca.updateRule = null
    ca.deleteRule = null
    app.save(ca)
  },
)
