// Guard do UPDATE de `documents` e `pro_payment_accounts` (nível HTTP):
// blindagem de auto-aprovação de KYC.
//
// BREACH corrigida: a updateRule de ambas as coleções permite que o DONO do
// registro edite — necessário para subir/replace documento e editar dados Pix.
// Porém, sem guard, o dono podia também alterar via API os campos de
// auditoria (status, reviewed_at, reviewed_by, reviewer_note), recusado→
// approved ou →verified, furando o gate de verificação inteiro por dentro.
//
// COMO A CORREÇÃO FUNCIONA:
//   Igual ao jobs_payment_guard.js: em update vindo da API HTTP, se quem
//   escreve não é admin, campos de auditoria alterados são restaurados para
//   o valor original antes do save. O dono continua podendo editar TODOS os
//   campos de conteúdo (arquivo, tipo, dados da conta Pix) — nenhum fluxo
//   legítimo afetado.
//
//   Aprovação/recusa legítima (admin em Admin → Documentos e contas de
//   pagamento) não é afetada: admin passa direto.
//
// Hook type: onRecordUpdateRequest em `documents` e `pro_payment_accounts`.

const REVIEWED_FIELDS = ['status', 'reviewed_at', 'reviewed_by', 'reviewer_note']

const kycRestore = (e) => {
  const auth = e.requestInfo().auth

  // Sem auth o PocketBase já barrou pela updateRule; segue o fluxo normal.
  if (!auth) {
    e.next()
    return
  }

  // Admin passa direto (aprova/recusa normalmente).
  if (auth.getString && auth.getString('role') === 'admin') {
    e.next()
    return
  }

  const original = e.record.original()
  if (!original) {
    e.next()
    return
  }

  const restored = []
  for (let i = 0; i < REVIEWED_FIELDS.length; i++) {
    const field = REVIEWED_FIELDS[i]
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
      restored.push(field)
    }
  }

  if (restored.length > 0) {
    console.log(
      '[kyc_status_guard] campos de review restaurados (' +
        e.record.collection().name +
        ' #' +
        e.record.getString('id') +
        '): ' +
        restored.join(', '),
    )
  }

  e.next()
}

onRecordUpdateRequest(kycRestore, 'documents')
onRecordUpdateRequest(kycRestore, 'pro_payment_accounts')
