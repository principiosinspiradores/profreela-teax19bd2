// Normalize CPF to digits only and enforce uniqueness with friendly error message.
// Runs onRecordCreate and onRecordUpdate for `users`.

onRecordCreate((e) => {
  const record = e.record
  if (!record) {
    e.next()
    return
  }

  const rawCpf = record.getString('cpf') || ''
  const digits = rawCpf.replace(/\D/g, '')

  record.set('cpf', digits)

  if (digits) {
    let existing = null
    try {
      existing = $app.findFirstRecordByData('users', 'cpf', digits)
    } catch (_) {}

    if (existing) {
      throw new BadRequestError(
        "Já existe uma conta com este CPF. Se é você, use 'Esqueci minha senha'.",
      )
    }
  }

  e.next()
}, 'users')

onRecordUpdate((e) => {
  const record = e.record
  if (!record) {
    e.next()
    return
  }

  const rawCpf = record.getString('cpf') || ''
  const digits = rawCpf.replace(/\D/g, '')

  record.set('cpf', digits)

  if (digits) {
    let existing = null
    try {
      existing = $app.findFirstRecordByData('users', 'cpf', digits)
    } catch (_) {}

    // If another user already has this CPF, reject with friendly message.
    if (existing && existing.getString('id') !== record.getString('id')) {
      throw new BadRequestError(
        "Já existe uma conta com este CPF. Se é você, use 'Esqueci minha senha'.",
      )
    }
  }

  e.next()
}, 'users')
