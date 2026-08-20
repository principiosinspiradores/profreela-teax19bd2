// Emergency phone unlock endpoint for admins.
// Allows an administrator to toggle or unlock the pro's real phone number for a specific job/client.
//
// POST /backend/v1/admin/unlock-phone
// Body: { jobId: string, unlocked?: boolean }
routerAdd(
  'POST',
  '/backend/v1/admin/unlock-phone',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { ok: false, error: 'Autenticação necessária.' })
    }
    const role = authRecord.getString('role')
    if (role !== 'admin') {
      return e.json(403, { ok: false, error: 'Acesso restrito a administradores.' })
    }

    let body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (_) {}

    const jobId = body.jobId
    if (!jobId) {
      return e.json(400, { ok: false, error: 'Parâmetro jobId é obrigatório.' })
    }

    const unlocked = body.unlocked !== undefined ? Boolean(body.unlocked) : true

    let jobRecord = null
    try {
      jobRecord = $app.findFirstRecordByData('jobs', 'id', jobId)
    } catch (_) {
      return e.json(404, { ok: false, error: 'Serviço não encontrado.' })
    }

    jobRecord.set('phone_unlocked_for_client', unlocked)
    try {
      $app.save(jobRecord)
    } catch (err) {
      return e.json(500, { ok: false, error: 'Falha ao atualizar permissão de telefone: ' + err })
    }

    return e.json(200, {
      ok: true,
      jobId: jobId,
      unlocked: unlocked,
      message: unlocked
        ? 'Telefone real liberado para o cliente com sucesso.'
        : 'Liberação de telefone revogada.',
    })
  },
  $apis.requireAuth(),
)
