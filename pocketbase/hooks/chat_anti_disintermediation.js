// Scans new chat messages on the `messages` collection for external contact details / disintermediation attempts.
//
// Rules:
// 1. Never blocks or rejects the original message — the user's message is created normally.
// 2. Ignores messages sent by admins or system warning messages.
// 3. Detects phone patterns (Brazilian formats, numbers with spaces/dashes/parens) and suspicious keywords
//    (whatsapp, whats, zap, wpp, me chama no, me liga, telefone, celular, instagram, @gmail, @hotmail, @outlook, facebook, telegram, @username).
// 4. Ignores phone numbers matching the professional's own registered phone (if available).
// 5. If disintermediation pattern detected:
//    - Counts how many detections have occurred so far for this job (from disintermediation_alerts count OR previous warning messages).
//    - 1st detection in job: sends system warning 1:
//      "⚠️ O ProFreela oferece chat seguro e pagamento garantido. Não compartilhe informações de contato pessoal. Esta mensagem foi registrada."
//    - 2nd+ detection in job (reincidência):
//      * sends severe system warning 2:
//        "🚨 Sua conversa está sendo monitorada. Compartilhar contatos externos viola os termos de uso do ProFreela."
//      * creates a record in `disintermediation_alerts` (job, pro_id, client_id, detected_content, pattern_matched)
//      * logs console.warn for admin audit.
//
// Hook type: onRecordAfterCreateSuccess on `messages`.
onRecordAfterCreateSuccess((e) => {
  const msg = e.record
  if (!msg) {
    e.next()
    return
  }

  const content = msg.getString('content') || ''
  const jobId = msg.getString('job') || ''
  const senderId = msg.getString('sender') || ''

  if (!content || !jobId || !senderId) {
    e.next()
    return
  }

  // System warning texts to avoid recursion / re-scanning system messages
  const WARNING_1 =
    '⚠️ O ProFreela oferece chat seguro e pagamento garantido. Não compartilhe informações de contato pessoal. Esta mensagem foi registrada.'
  const WARNING_2 =
    '🚨 Sua conversa está sendo monitorada. Compartilhar contatos externos viola os termos de uso do ProFreela.'

  if (content === WARNING_1 || content === WARNING_2) {
    e.next()
    return
  }

  // Check if sender is an admin
  let senderRole = ''
  try {
    const senderUser = $app.findFirstRecordByData('users', 'id', senderId)
    senderRole = senderUser.getString('role')
  } catch (_) {}

  if (senderRole === 'admin') {
    e.next()
    return
  }

  // Load job details to identify pro, client, and pro's registered phone
  let proId = ''
  let clientId = ''
  let proPhoneClean = ''

  try {
    const jobRecord = $app.findFirstRecordByData('jobs', 'id', jobId)
    proId = jobRecord.getString('pro_id') || ''
    clientId = jobRecord.getString('customer_id') || ''

    if (proId) {
      try {
        const proUser = $app.findFirstRecordByData('users', 'id', proId)
        const rawPhone = proUser.getString('phone') || ''
        proPhoneClean = rawPhone.replace(/\D/g, '')
      } catch (_) {}
    }
  } catch (_) {}

  // Detection logic
  const lower = content.toLowerCase()
  let matchedPattern = ''
  let detectedSnippet = ''

  // 1. Keyword check
  // Keywords: whatsapp, whats, zap, wpp, me chama no, me liga, telefone, celular, instagram, @gmail, @hotmail, @outlook, facebook, telegram, @username
  const keywords = [
    'whatsapp',
    'whats',
    'zap',
    'wpp',
    'me chama no',
    'me liga',
    'telefone',
    'celular',
    'instagram',
    'facebook',
    'telegram',
    '@gmail',
    '@hotmail',
    '@outlook',
    '@yahoo',
    '@icloud',
  ]

  for (let k = 0; k < keywords.length; k++) {
    const kw = keywords[k]
    const idx = lower.indexOf(kw)
    if (idx !== -1) {
      matchedPattern = 'keyword: ' + kw
      const start = Math.max(0, idx - 15)
      const end = Math.min(content.length, idx + kw.length + 15)
      detectedSnippet = content.substring(start, end).trim()
      break
    }
  }

  // 2. Social handle check: @ followed by username (at least 3 alphanumeric/dots/underscores)
  if (!matchedPattern) {
    const handleRegex = /@[a-zA-Z0-9_.-]{3,}/g
    const handleMatch = handleRegex.exec(content)
    if (handleMatch) {
      matchedPattern = 'handle: ' + handleMatch[0]
      detectedSnippet = handleMatch[0]
    }
  }

  // 3. Phone number regex check (Brazilian phone numbers and digit sequences)
  // Covers: (XX) XXXXX-XXXX, (XX) 9XXXX-XXXX, XX XXXX-XXXX, XX9XXXXXXXX, +55XXXXXXXXXXX, 19 971396126, 11988887777, etc.
  if (!matchedPattern) {
    // Regex for phone sequences with optional +55, ddd in parens or spaces, 8 or 9 digits
    const phoneRegexes = [
      /(?:\+?55\s?)?(?:\(?\d{2}\)?[\s.-]?)?\b9?\d{4}[\s.-]?\d{4}\b/g,
      /\b\d{2}\s?9\d{8}\b/g,
      /\b\d{10,11}\b/g,
    ]

    for (let r = 0; r < phoneRegexes.length; r++) {
      const regex = phoneRegexes[r]
      let match = regex.exec(content)
      while (match) {
        const found = match[0]
        const digitsOnly = found.replace(/\D/g, '')

        // Verify that it's 8 to 13 digits (valid phone / cell range in BR)
        if (digitsOnly.length >= 8 && digitsOnly.length <= 13) {
          // Check if it's the pro's own registered phone (ignore if exact match)
          let isProPhone = false
          if (proPhoneClean && proPhoneClean.length >= 8) {
            if (
              digitsOnly === proPhoneClean ||
              digitsOnly.endsWith(proPhoneClean) ||
              proPhoneClean.endsWith(digitsOnly)
            ) {
              isProPhone = true
            }
          }

          if (!isProPhone) {
            matchedPattern = 'phone: ' + found.trim()
            detectedSnippet = found.trim()
            break
          }
        }
        match = regex.exec(content)
      }
      if (matchedPattern) break
    }
  }

  // If nothing suspicious matched, exit
  if (!matchedPattern) {
    e.next()
    return
  }

  // Find system / admin user to act as sender of the automated warning message
  let systemSenderId = ''
  try {
    const adminUser = $app.findFirstRecordByData('users', 'role', 'admin')
    systemSenderId = adminUser.getString('id')
  } catch (_) {
    // Fallback: use the sender or pro
    systemSenderId = senderId
  }

  // Check previous alert/warning count for this job
  let previousWarningsCount = 0
  try {
    const existingAlerts = $app.findRecordsByFilter(
      'disintermediation_alerts',
      "job = '" + jobId + "'",
      '-created',
      50,
      0,
    )
    previousWarningsCount = existingAlerts.length
  } catch (_) {}

  // Also check if any WARNING_1 was already posted to this job's chat
  if (previousWarningsCount === 0) {
    try {
      const pastSystemMsgs = $app.findRecordsByFilter(
        'messages',
        "job = '" + jobId + "' && content ~ 'Não compartilhe informações de contato pessoal'",
        '-created',
        10,
        0,
      )
      if (pastSystemMsgs && pastSystemMsgs.length > 0) {
        previousWarningsCount = pastSystemMsgs.length
      }
    } catch (_) {}
  }

  const isReincidence = previousWarningsCount >= 1
  const messagesCol = $app.findCollectionByNameOrId('messages')

  if (!isReincidence) {
    // 1st detection in this job: Post warning 1
    try {
      const warnMsg = new Record(messagesCol)
      warnMsg.set('job', jobId)
      warnMsg.set('sender', systemSenderId)
      warnMsg.set('content', WARNING_1)
      warnMsg.set('read', false)
      $app.save(warnMsg)
    } catch (err) {
      console.error('Failed to post 1st anti-disintermediation warning:', err)
    }
  } else {
    // 2nd detection or more in this job: Post warning 2 + create disintermediation_alerts record
    try {
      const warnMsg = new Record(messagesCol)
      warnMsg.set('job', jobId)
      warnMsg.set('sender', systemSenderId)
      warnMsg.set('content', WARNING_2)
      warnMsg.set('read', false)
      $app.save(warnMsg)
    } catch (err) {
      console.error('Failed to post 2nd anti-disintermediation warning:', err)
    }

    // Create disintermediation_alerts record
    try {
      const alertCol = $app.findCollectionByNameOrId('disintermediation_alerts')
      const alertRec = new Record(alertCol)
      alertRec.set('job', jobId)
      if (proId) alertRec.set('pro_id', proId)
      if (clientId) alertRec.set('client_id', clientId)
      alertRec.set('detected_content', detectedSnippet || content.substring(0, 100))
      alertRec.set('pattern_matched', matchedPattern)
      $app.save(alertRec)

      console.warn(
        '[ANTI-DESINTERMEDIAÇÃO] Reincidência detectada no Job #' +
          jobId +
          ' | Pro: ' +
          proId +
          ' | Cliente: ' +
          clientId +
          ' | Padrão: ' +
          matchedPattern +
          ' | Trecho: ' +
          (detectedSnippet || content),
      )
    } catch (alertErr) {
      console.error('Failed to save disintermediation_alert record:', alertErr)
    }
  }

  e.next()
}, 'messages')
