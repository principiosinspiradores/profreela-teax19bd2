/**
 * Block users whose status is 'blocked' or 'deleted' from authenticating via authWithPassword.
 */
onRecordAuthWithPasswordRequest((e) => {
  const record = e.record
  if (!record) {
    e.next()
    return
  }

  const status = record.getString('status')
  if (status === 'blocked') {
    throw new ForbiddenError('Sua conta está bloqueada. Entre em contato com o suporte.')
  }
  if (status === 'deleted') {
    throw new ForbiddenError('Esta conta foi desativada ou excluída.')
  }

  e.next()
}, 'users')
