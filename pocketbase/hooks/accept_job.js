// Blocks a professional from accepting a job that overlaps in time with another
// job they already have in `accepted` or `in_progress` status on the same day.
//
// Hook type: onRecordUpdateRequest on `jobs` (HTTP-level, fires before save).
// Returning a JSON response WITHOUT calling e.next() aborts the update and
// short-circuits the API call, so the job stays unchanged.
//
// Conflict rule:
//   - Only applies when status is transitioning to `accepted` with a pro_id.
//   - Only applies when the job has both `scheduled_at` and `hours` set.
//   - For every existing accepted/in_progress job of the same pro on the same
//     calendar date, compute [start, start+hours) intervals and check overlap.
//   - On overlap → HTTP 409 with the spec message.
//   - Otherwise → e.next() and the update proceeds normally.
onRecordUpdateRequest((e) => {
  const record = e.record
  if (!record) {
    e.next()
    return
  }

  const newStatus = record.getString('status')
  if (newStatus !== 'accepted') {
    e.next()
    return
  }

  // Only validate a real transition into `accepted` (ignore no-op updates).
  const prev = record.original()
  const prevStatus = prev ? prev.getString('status') : ''
  if (prevStatus === 'accepted') {
    e.next()
    return
  }

  const proId = record.getString('pro_id')
  if (!proId) {
    e.next()
    return
  }

  // A pro blocked for cancelling a previously-accepted job cannot accept any
  // job until `blocked_until` is in the past.
  try {
    const proUser = $app.findFirstRecordByData('users', 'id', proId)
    if (proUser) {
      const blockedUntilStr = proUser.getString('blocked_until')
      if (blockedUntilStr) {
        const blockedMs = new Date(blockedUntilStr).getTime()
        const nowMs = Date.now()
        if (!isNaN(blockedMs) && blockedMs > nowMs) {
          const hoursLeft = Math.ceil((blockedMs - nowMs) / 3600000)
          return e.json(403, {
            code: 403,
            message:
              'Você está temporariamente bloqueado por ter cancelado um serviço. Disponível novamente em ' +
              hoursLeft +
              ' hora(s).',
            data: { blocked: true, blocked_until: blockedUntilStr, hours_left: hoursLeft },
          })
        }
      }
    }
  } catch (_) {
    // If we can't load the pro, don't block acceptance.
  }

  const scheduledAt = record.getString('scheduled_at')
  const hours = record.getFloat('hours')
  // Do NOT skip validation when the time window is missing — that would let a
  // pro accept several jobs on the same day without any overlap check. Instead
  // reject: a service must have a scheduled date/time and a duration before it
  // can be accepted, otherwise the conflict window cannot be computed.
  // `getFloat` returns 0 both for an absent field and for an explicit `0`, so
  // `!hours` (falsy) wrongly reads the same as "missing". Reject only when the
  // duration is truly absent, zero or negative — a valid positive duration
  // must pass so jobs scheduled with a real `hours` value can be accepted.
  if (!scheduledAt || hours == null || hours <= 0) {
    return e.json(400, {
      code: 400,
      message: 'Dados incompletos: o serviço precisa ter data e horário definidos.',
      data: { conflict: false, incomplete: true },
    })
  }

  const jobId = record.getString('id')
  // Same calendar date (YYYY-MM-DD) — works for both ISO and PB date formats.
  const datePart = scheduledAt.slice(0, 10)

  const newStart = new Date(scheduledAt).getTime()
  const newEnd = newStart + hours * 3600000

  // Find the pro's other accepted / in_progress jobs on the same date.
  let conflicting = []
  try {
    conflicting = $app.findRecordsByFilter(
      'jobs',
      "pro_id = '" + proId + "' && (status = 'accepted' || status = 'in_progress')",
      '-scheduled_at',
      100,
      0,
    )
  } catch (_) {
    // If the lookup fails, don't block the acceptance.
    e.next()
    return
  }

  for (let i = 0; i < conflicting.length; i++) {
    const other = conflicting[i]
    if (other.getString('id') === jobId) continue

    const otherScheduled = other.getString('scheduled_at')
    if (!otherScheduled) continue
    if (otherScheduled.slice(0, 10) !== datePart) continue

    const otherHours = other.getFloat('hours')
    if (!otherHours || otherHours <= 0) continue

    const otherStart = new Date(otherScheduled).getTime()
    const otherEnd = otherStart + otherHours * 3600000

    // Interval overlap: [newStart, newEnd) ∩ [otherStart, otherEnd)
    if (newStart < otherEnd && otherStart < newEnd) {
      return e.json(409, {
        code: 409,
        message:
          'Você já tem um serviço agendado para este horário. Conclua ou cancele o serviço atual antes de aceitar outro.',
        data: { conflict: true, conflict_job_id: other.getString('id') },
      })
    }
  }

  // --- CAPTURA DO PAGAMENTO NA ACEITAÇÃO DO PRO ---------------------------
  // O job foi pré-autorizado no checkout (payment_status = 'authorized').
  // Ao aceitar, capturar a pré-autorização na operadora (Mercado Pago / Stripe / Demo).
  // Se a captura tiver sucesso: payment_status passa para 'held'.
  // Se a captura falhar (expirada, limite indisponível, etc):
  //   - O job NÃO fica com o pro (pro_id removido, status volta a 'pending' ou cancelado)
  //   - A reserva é cancelada se necessário
  //   - Registra payment_event do erro
  //   - Notifica o admin
  //   - Retorna erro HTTP impedindo que o pro fique com o job não pago
  const paymentStatus = record.getString('payment_status')
  const intentId = record.getString('payment_intent_id')
  const provider = $os.getenv('PAYMENT_PROVIDER') || ''

  // Função auxiliar para registrar auditoria de pagamento
  const logPaymentEvent = function (jId, pIntentId, evType, provStatus, payloadData) {
    try {
      const pCol = $app.findCollectionByNameOrId('payment_events')
      const pRec = new Record(pCol)
      if (jId) pRec.set('job_id', jId)
      if (pIntentId) pRec.set('payment_intent_id', pIntentId)
      pRec.set('type', evType)
      if (provStatus) pRec.set('provider_status', provStatus)
      if (payloadData) pRec.set('payload', payloadData)
      $app.save(pRec)
    } catch (peErr) {
      console.log('[accept_job] erro ao salvar payment_event:', peErr)
    }
  }

  // Função auxiliar para notificar admin de erro de captura
  const notifyAdminCaptureFailure = function (jId, errDetails) {
    try {
      const notifCol = $app.findCollectionByNameOrId('notifications')
      let adminUsers = []
      try {
        adminUsers = $app.findRecordsByFilter('users', "role = 'admin'", '-created', 10, 0)
      } catch (_) {}
      for (let ai = 0; ai < adminUsers.length; ai++) {
        const adminId = adminUsers[ai].getString('id')
        if (!adminId) continue
        try {
          const n = new Record(notifCol)
          n.set('user_id', adminId)
          n.set('type', 'system')
          n.set('title', 'Falha na captura de pagamento')
          n.set(
            'message',
            'Falha ao capturar pré-autorização do serviço #' +
              jId.slice(0, 6) +
              ': ' +
              (errDetails || 'Erro na operadora') +
              '. A reserva foi cancelada e o cliente notificado para reautorizar.',
          )
          n.set('job_id', jId)
          n.set('read_status', false)
          $app.save(n)
        } catch (_) {}
      }
    } catch (_) {}
  }

  // Função auxiliar para notificar cliente para atualizar cartão / reautorizar
  const notifyClientCaptureFailure = function (cId, jId, errDetails) {
    if (!cId) return
    try {
      const notifCol = $app.findCollectionByNameOrId('notifications')
      const n = new Record(notifCol)
      n.set('user_id', cId)
      n.set('type', 'system')
      n.set('title', 'Pagamento não autorizado')
      n.set(
        'message',
        'Não foi possível concluir a cobrança no cartão para o serviço #' +
          jId.slice(0, 6) +
          (errDetails ? ' (' + errDetails + ')' : '') +
          '. A pré-autorização foi cancelada. Por favor, atualize sua forma de pagamento para que os profissionais possam aceitar seu pedido.',
      )
      n.set('job_id', jId)
      n.set('read_status', false)
      $app.save(n)
    } catch (notifErr) {
      console.log('[accept_job] erro ao notificar cliente sobre falha de captura:', notifErr)
    }
  }

  // Executa captura se o pagamento estiver 'authorized'
  if (paymentStatus === 'authorized' && intentId) {
    let captureOk = false
    let captureErrorMsg = ''

    if (provider === 'stripe') {
      const secretKey = $os.getenv('STRIPE_SECRET_KEY') || ''
      if (!secretKey) {
        captureErrorMsg = 'Stripe não configurado no servidor.'
      } else {
        const amount = record.getFloat('price')
        try {
          const res = $http.send({
            url:
              'https://api.stripe.com/v1/payment_intents/' +
              encodeURIComponent(intentId) +
              '/capture',
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + secretKey,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: 'amount_to_capture=' + Math.round(amount * 100),
            timeout: 20,
          })
          if (res.statusCode >= 200 && res.statusCode < 300) {
            captureOk = true
            logPaymentEvent(jobId, intentId, 'capture', 'succeeded', {
              provider: 'stripe',
              amount: amount,
              source: 'accept_job',
            })
          } else {
            const respJson = res.json || {}
            captureErrorMsg =
              (respJson.error && respJson.error.message) ||
              'Falha na captura do Stripe (HTTP ' + res.statusCode + ')'
            logPaymentEvent(jobId, intentId, 'error', 'stripe_capture_failed', {
              provider: 'stripe',
              statusCode: res.statusCode,
              response: respJson,
              source: 'accept_job',
            })
          }
        } catch (sErr) {
          captureErrorMsg = 'Exceção ao chamar captura Stripe: ' + String(sErr)
          logPaymentEvent(jobId, intentId, 'error', 'stripe_exception', {
            error: String(sErr),
            source: 'accept_job',
          })
        }
      }
    } else if (provider === 'mercadopago') {
      const accessToken = $os.getenv('MERCADOPAGO_ACCESS_TOKEN') || ''
      if (!accessToken) {
        captureErrorMsg = 'Mercado Pago não configurado no servidor.'
      } else {
        // 1. GET /v1/payments/{intentId} para checar status atual
        let getRes = null
        try {
          getRes = $http.send({
            url: 'https://api.mercadopago.com/v1/payments/' + encodeURIComponent(intentId),
            method: 'GET',
            headers: {
              Authorization: 'Bearer ' + accessToken,
            },
            timeout: 20,
          })
        } catch (netErr) {
          captureErrorMsg = 'Erro de conexão ao consultar Mercado Pago: ' + String(netErr)
          logPaymentEvent(jobId, intentId, 'error', 'network_error', {
            action: 'capture_check',
            source: 'accept_job',
            error: String(netErr),
          })
        }

        if (getRes && getRes.statusCode >= 200 && getRes.statusCode < 300) {
          const currentData = getRes.json || {}
          const curStatus = currentData.status || ''

          if (curStatus === 'approved') {
            // Já capturado anteriormente
            captureOk = true
            logPaymentEvent(jobId, intentId, 'capture', 'approved', {
              source: 'accept_job',
              note: 'Pagamento já aprovado/capturado previamente no Mercado Pago.',
            })
          } else if (curStatus === 'authorized') {
            // Fazer PUT capture:true
            try {
              const putRes = $http.send({
                url: 'https://api.mercadopago.com/v1/payments/' + encodeURIComponent(intentId),
                method: 'PUT',
                headers: {
                  Authorization: 'Bearer ' + accessToken,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ capture: true }),
                timeout: 20,
              })
              if (putRes.statusCode >= 200 && putRes.statusCode < 300) {
                captureOk = true
                logPaymentEvent(jobId, intentId, 'capture', 'approved', {
                  source: 'accept_job',
                  action: 'captured_from_authorized',
                })
              } else {
                captureErrorMsg =
                  'Mercado Pago rejeitou a captura (HTTP ' + putRes.statusCode + ').'
                logPaymentEvent(jobId, intentId, 'error', 'capture_failed', {
                  source: 'accept_job',
                  statusCode: putRes.statusCode,
                  response: putRes.json,
                })
              }
            } catch (pErr) {
              captureErrorMsg = 'Erro ao enviar captura ao Mercado Pago: ' + String(pErr)
              logPaymentEvent(jobId, intentId, 'error', 'capture_exception', {
                source: 'accept_job',
                error: String(pErr),
              })
            }
          } else {
            captureErrorMsg =
              'Status da pré-autorização no Mercado Pago incompatível (' + curStatus + ').'
            logPaymentEvent(jobId, intentId, 'error', curStatus, {
              source: 'accept_job',
              action: 'unexpected_status_on_capture',
              response: currentData,
            })
          }
        } else if (!captureErrorMsg) {
          captureErrorMsg =
            'Falha ao verificar status do pagamento no Mercado Pago (' +
            (getRes ? getRes.statusCode : 0) +
            ').'
        }
      }
    } else {
      // Demo mode
      captureOk = true
      logPaymentEvent(jobId, intentId, 'capture', 'approved', {
        provider: 'demo',
        amount: record.getFloat('price'),
        source: 'accept_job',
      })
    }

    if (!captureOk) {
      // Falha na captura: cancelar reserva no gateway se ainda houver
      let cancelGatewayOk = false
      if (provider === 'mercadopago') {
        const accessToken = $os.getenv('MERCADOPAGO_ACCESS_TOKEN') || ''
        if (accessToken) {
          try {
            const canRes = $http.send({
              url: 'https://api.mercadopago.com/v1/payments/' + encodeURIComponent(intentId),
              method: 'PUT',
              headers: {
                Authorization: 'Bearer ' + accessToken,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ status: 'cancelled' }),
              timeout: 15,
            })
            if (canRes.statusCode >= 200 && canRes.statusCode < 300) {
              cancelGatewayOk = true
            }
          } catch (_) {}
        }
      } else if (provider === 'stripe') {
        const secretKey = $os.getenv('STRIPE_SECRET_KEY') || ''
        if (secretKey) {
          try {
            const canRes = $http.send({
              url:
                'https://api.stripe.com/v1/payment_intents/' +
                encodeURIComponent(intentId) +
                '/cancel',
              method: 'POST',
              headers: {
                Authorization: 'Bearer ' + secretKey,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              timeout: 15,
            })
            if (canRes.statusCode >= 200 && canRes.statusCode < 300) {
              cancelGatewayOk = true
            }
          } catch (_) {}
        }
      } else {
        cancelGatewayOk = true
      }

      // CORREÇÃO 3:
      // Se a reserva foi cancelada no gateway com sucesso (ou em demo):
      // setar no banco o job payment_status='cancelled', limpar payment_intent_id e payment_authorized_at
      // para que o job volte às ofertas em estado limpo — evitando loop 402 no próximo pro.
      // Registrar payment_event do cancelamento.
      if (cancelGatewayOk) {
        try {
          const freshJob = $app.findFirstRecordByData('jobs', 'id', jobId)
          if (freshJob) {
            freshJob.set('payment_status', 'cancelled')
            freshJob.set('payment_intent_id', '')
            freshJob.set('payment_authorized_at', '')
            $app.save(freshJob)
          }
        } catch (jSaveErr) {
          console.log(
            '[accept_job] erro ao limpar status de pagamento do job ' + jobId + ':',
            jSaveErr,
          )
        }

        logPaymentEvent(jobId, intentId, 'refund', 'cancelled', {
          source: 'accept_job',
          action: 'cancel_reservation_after_capture_failure',
          error: captureErrorMsg,
        })
      }

      // Notificar administradores
      notifyAdminCaptureFailure(jobId, captureErrorMsg)

      // Notificar o cliente do job para atualizar o cartão/reautorizar
      const customerId = record.getString('customer_id')
      notifyClientCaptureFailure(customerId, jobId, captureErrorMsg)

      // Retornar 402 impedindo o pro de ficar com o job sem pagamento
      return e.json(402, {
        code: 402,
        message:
          'Não foi possível capturar a pré-autorização de pagamento deste serviço (' +
          captureErrorMsg +
          '). A reserva foi cancelada e o cliente notificado para atualizar o pagamento.',
        data: {
          capture_failed: true,
          error: captureErrorMsg,
        },
      })
    }

    // Captura ok! Atualizar payment_status para 'held'
    record.set('payment_status', 'held')
    record.set('payment_captured_at', new Date().toISOString())
  }

  e.next()
}, 'jobs')
