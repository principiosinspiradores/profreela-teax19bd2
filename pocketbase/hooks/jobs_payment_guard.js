// Guard do UPDATE de `jobs` (nível HTTP): campos de pagamento + integridade de fluxo.
//
// BREACH corrigida: a updateRule de `jobs` é "@request.auth.id != ''", então
// qualquer usuário logado (cliente ou profissional) podia atualizar qualquer
// job — inclusive os campos de dinheiro. Com o cron_release_held_payments,
// dava para forjar payment_status='held' + payment_hold_until no passado e
// gerar repasse sem dinheiro capturado.
//
// POR QUE NÃO MEXER NA updateRule DO REGISTRO:
//   O app depende dela. O profissional aceita o serviço com updateJob
//   (status/pro_id/accepted_at) e o cliente cancela/reagenda pelo app.
//   Restringir o registro inteiro quebraria esses fluxos.
//
// COMO A CORREÇÃO FUNCIONA:
//   Este hook roda SÓ em update vindo da API HTTP. Se quem escreve não é
//   admin, os campos de pagamento são restaurados para o valor original antes
//   do save. Nenhum fluxo legítimo é afetado, porque:
//     - todos os caminhos de pagamento (create-split, release-payment,
//       capture-split, dispute-payment, cancel-auth) são endpoints do backend
//       que gravam com $app.save(), e $app.save() NÃO dispara hooks HTTP;
//     - os crons também usam $app.save();
//     - aceitar/iniciar/concluir só tocam status/pro_id/accepted_at/started_at.
//
// INTEGRIDADE DE FLUXO (segunda camada deste mesmo hook):
//   Além do dinheiro, um não-admin não pode mover o job no fluxo de vida
//   (status), se apoderar dele (pro_id), reagendar (scheduled_at) nem mudar o
//   endereço (address) fora das exceções abaixo. Exceções = exatamente o que o
//   app já faz por HTTP hoje:
//     - PRO: status pending→accepted E pro_id '' → auth.id (aceitar oferta);
//     - CLIENTE: status →cancelled no próprio job (defensivo: o cancelamento
//       real vai por /backend/v1/cancel-job, mas a exceção não abre buraco —
//       só o dono do job se beneficia);
//     - CLIENTE: scheduled_at no próprio job (reagendar);
//   address sempre volta ao original para não-admin; latitude/longitude ficam
//   de fora (o pro grava a geolocalização por HTTP em ActiveJob.tsx) e
//   declined_by também não é protegido (recusar oferta). Qualquer outra
//   mudança nesses campos é restaurada e logada.
//
// ORDEM DOS HOOKS: este arquivo é carregado depois de accept_job.js e os
// handlers do PocketBase rodam em LIFO (último registrado executa primeiro),
// então este guard roda ANTES da captura de pagamento do accept_job — restaurar
// campos aqui não desfaz o payment_status='held' que o accept_job define.
//
// Hook type: onRecordUpdateRequest on `jobs`.

onRecordUpdateRequest((e) => {
  const auth = e.requestInfo().auth

  // Sem auth o PocketBase já barrou pela updateRule; segue o fluxo normal.
  if (!auth) {
    e.next()
    return
  }

  // Admin (role) passa direto.
  if (auth.getString && auth.getString('role') === 'admin') {
    e.next()
    return
  }

  const original = e.record.original()
  if (!original) {
    e.next()
    return
  }

  const MONEY_FIELDS = [
    'payment_status',
    'payment_intent_id',
    'payment_authorized_at',
    'payment_hold_until',
    'payment_released_at',
    'payment_disputed_at',
    'dispute_reason',
    'payment_method',
    'payment_installments',
    'penalty_amount',
    'penalty_applied',
    'penalty_forgiven',
    'price',
    'client_price',
    'emergency_fee',
  ]

  // Restaura campos de dinheiro alterados por não-admin.
  for (let i = 0; i < MONEY_FIELDS.length; i++) {
    const field = MONEY_FIELDS[i]
    const before = original.get(field)
    const after = e.record.get(field)
    let changed = false
    try {
      changed = JSON.stringify(before) !== JSON.stringify(after)
    } catch (_) {
      changed = String(before) !== String(after)
    }
    if (changed) {
      e.record.set(field, before)
      console.log('[jobs_payment_guard] campo de pagamento restaurado: ' + field)
    }
  }

  // ------------------------------------------------------------------
  // INTEGRIDADE: status / pro_id / scheduled_at / address
  // ------------------------------------------------------------------
  const PROTECTED_STATUS_FIELDS = ['status', 'pro_id', 'scheduled_at', 'address']

  // Detecta mudanças antes de restaurar — se nada mudou, não há o que fazer.
  const changedFields = []
  for (let i = 0; i < PROTECTED_STATUS_FIELDS.length; i++) {
    const field = PROTECTED_STATUS_FIELDS[i]
    const before = original.get(field)
    const after = e.record.get(field)
    let diff = false
    try {
      diff = JSON.stringify(before) !== JSON.stringify(after)
    } catch (_) {
      diff = String(before) !== String(after)
    }
    if (diff) changedFields.push(field)
  }
  if (changedFields.length === 0) {
    e.next()
    return
  }

  // Papéis. isPro cobre tanto o pro já vinculado quanto quem está ACEITANDO
  // (original sem pro e novo pro_id = auth.id — o par status+pro_id da oferta).
  const authId = auth.getString('id')
  const originalProId = original.getString('pro_id') || ''
  const newProId = e.record.getString('pro_id') || ''
  const isPro = originalProId === authId || (originalProId === '' && newProId === authId)
  const isClient = (original.getString('customer_id') || '') === authId

  const restored = []

  // pro_id: só o pro pode se atribuir um job que ainda não tem pro.
  let newProIdFinal = newProId
  if (changedFields.indexOf('pro_id') !== -1) {
    const keepNewPro = isPro && originalProId === '' && newProId === authId
    if (!keepNewPro) {
      e.record.set('pro_id', originalProId)
      newProIdFinal = originalProId
      restored.push('pro_id')
    }
  }

  // status: apenas pending→accepted pelo pro (com pro_id final = ele mesmo)
  // ou →cancelled pelo cliente dono do job.
  if (changedFields.indexOf('status') !== -1) {
    const beforeStatus = original.getString('status')
    const afterStatus = e.record.getString('status')
    const proAccept =
      isPro && beforeStatus === 'pending' && afterStatus === 'accepted' && newProIdFinal === authId
    const clientCancel = isClient && afterStatus === 'cancelled'
    if (!proAccept && !clientCancel) {
      e.record.set('status', beforeStatus)
      restored.push('status')
    }
  }

  // scheduled_at: só o cliente dono do job pode reagendar por HTTP.
  if (changedFields.indexOf('scheduled_at') !== -1 && !isClient) {
    e.record.set('scheduled_at', original.get('scheduled_at'))
    restored.push('scheduled_at')
  }

  // address: sempre restaurado para não-admin — nenhum fluxo legítimo de HTTP
  // altera o endereço após a criação do job.
  if (changedFields.indexOf('address') !== -1) {
    e.record.set('address', original.get('address'))
    restored.push('address')
  }

  if (restored.length > 0) {
    console.log(
      '[jobs_payment_guard] campos de fluxo restaurados (' +
        (isPro ? 'pro' : isClient ? 'cliente' : 'terceiro') +
        '): ' +
        restored.join(', '),
    )
  }

  e.next()
}, 'jobs')
