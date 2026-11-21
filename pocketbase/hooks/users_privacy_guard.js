// Privacidade de `users` — sanitização por onRecordEnrich (nível HTTP).
//
// BREACH corrigida: a listRule/viewRule de `users` permite a qualquer conta
// logada listar usuários com role="pro" (necessário para descoberta de pros).
// Com isso, cpf, phone, latitude e longitude de QUALQUER pro ficavam legíveis
// por API — e também via expand (jobs → pro_id) — risco LGPD (cpf) e físico
// (geolocalização possivelmente a casa do pro).
//
// COMO A CORREÇÃO FUNCIONA:
//   onRecordEnrich roda em TODA serialização de registro (list, view, create,
//   update e expand de outras coleções). Para um registro de pro cujo dono
//   NÃO é o próprio auth e auth não é admin:
//     - cpf, latitude, longitude: sempre removidos (valor zerado + hide);
//     - phone: removido, EXCETO quando há vínculo de job entre o pro e o
//       requisitante (cliente/pro de um MESMO serviço) — a tela de história
//       do cliente exibe o telefone do pro do serviço (mascarado até a
//       liberação, regra em src/lib/phone.ts).
//
// NÃO QUEBRA:
//   - próprio perfil (auth.id === registro) — nunca sanitizado (o pro edita
//     e vê tudo em Configurações);
//   - admin — vê tudo em todas as telas;
//   - telas que só usam name/rating_avg/avatar — esses campos permanecem;
//   - escrita (update do próprio perfil) — hook só afeta serialização.

onRecordEnrich((e) => {
  try {
    const auth = e.requestInfo ? e.requestInfo().auth || null : null
    if (!auth) return e.next()
    if (auth.getString && auth.getString('role') === 'admin') return e.next()

    const rec = e.record
    if (!rec) return e.next()
    const recId = rec.getString('id')
    const authId = auth.getString('id')
    if (recId === authId) return e.next()
    if (rec.getString('role') !== 'pro') return e.next()

    // Vínculo por job, com cache por requisição (requestInfo é o mesmo
    // objeto durante o request; se não for, o cache simplesmente não pega
    // e a consulta roda por registro — correto, só mais lento).
    let isLinked = false
    try {
      const ri = e.requestInfo()
      if (!ri.__pf_linked_pros) {
        ri.__pf_linked_pros = {}
        const linked = $app.findRecordsByFilter(
          'jobs',
          'customer_id = "' + authId + '" || pro_id = "' + authId + '"',
          '',
          0,
          0,
        )
        for (let i = 0; i < linked.length; i++) {
          const customerId = linked[i].getString('customer_id') || ''
          const proId = linked[i].getString('pro_id') || ''
          if (proId && proId !== authId) ri.__pf_linked_pros[proId] = true
          if (customerId && customerId !== authId) ri.__pf_linked_pros[customerId] = true
        }
      }
      isLinked = !!ri.__pf_linked_pros[recId]
    } catch (_) {
      isLinked = false
    }

    rec.set('cpf', '')
    rec.set('latitude', 0)
    rec.set('longitude', 0)
    if (!isLinked) {
      rec.set('phone', '')
    }
    rec.hide(['cpf', 'latitude', 'longitude'])
  } catch (err) {
    console.log('[users_privacy_guard] erro ao sanitizar:', err)
  }
  e.next()
}, 'users')
