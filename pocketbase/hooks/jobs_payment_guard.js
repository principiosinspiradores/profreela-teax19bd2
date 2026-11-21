// Guard dos campos de pagamento no UPDATE de `jobs` (nível HTTP).
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

  e.next()
}, 'jobs')
