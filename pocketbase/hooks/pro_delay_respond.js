// Client endpoint to respond to the "professional delayed +15 min" flow.
//
// The cron `cron_pro_delay.js` arms the client delay notification when the pro
// is more than 15 min late. The client then chooses between:
//   - extend_1h   → reschedule +1h (respecting the 22h closing limit)
//   - extend_2h   → reschedule +2h (respecting the 22h closing limit)
//   - cancel_reopen → cancel this job and create an emergency reopen job
//
// Endpoint: POST /backend/v1/jobs/{id}/pro-delay-response
// Body:     { "response": "extend_1h" | "extend_2h" | "cancel_reopen" }
//
// The endpoint is idempotent: a second call returns the already-applied
// response without re-applying it. The cron's 10-min timeout path uses the
// same cancel+reopen logic for the case where the client never answers.
//
// Closing limit: we never let a job's scheduled_end cross 22:00 local time.
// If the requested extension would push the end past 22:00 we clamp it: the
// new scheduled_start becomes the latest start that keeps scheduled_end <=
// 22:00 (still today), unless even the original job would end after 22:00, in
// which case we just keep the natural +1h/+2h.
//
// NOTE (hooks run in a separate VM): all logic is inlined inside the handler
// callback — no top-level declarations are referenced from within it.

routerAdd(
  'POST',
  '/backend/v1/jobs/{id}/pro-delay-response',
  async (e) => {
    const authRecord = e.requestInfo().auth
    if (!authRecord) {
      return e.json(401, { ok: false, error: 'Autenticação necessária.' })
    }
    const userId = authRecord.getString('id')

    // PocketBase does not always parse the JSON request body into an object on
    // `requestInfo().body` (it can arrive as a raw JSON string, a byte array or
    // a buffer), so parse it manually before extracting the `response` field.
    let body = {}
    try {
      const rawBody = await e.requestInfo().body
      if (typeof rawBody === 'string') {
        body = JSON.parse(rawBody)
      } else if (rawBody instanceof Uint8Array || rawBody instanceof ArrayBuffer) {
        body = JSON.parse(new TextDecoder().decode(rawBody))
      } else if (rawBody && typeof rawBody === 'object') {
        body = rawBody
      }
    } catch (_) {
      body = {}
    }
    const response = String(body.response || '').trim()

    if (response !== 'extend_1h' && response !== 'extend_2h' && response !== 'cancel_reopen') {
      return e.json(400, {
        ok: false,
        error: 'Resposta inválida. Use extend_1h, extend_2h ou cancel_reopen.',
      })
    }

    // Load the job from the {id} path parameter.
    const jobIdParam = e.request.pathValue('id') || ''
    let job = null
    try {
      job = $app.findFirstRecordByData('jobs', 'id', jobIdParam)
    } catch (err) {
      return e.json(404, { ok: false, error: 'Serviço não encontrado.' })
    }
    if (!job) {
      return e.json(404, { ok: false, error: 'Serviço não encontrado.' })
    }

    const jobId = job.getString('id')
    const customerId = job.getString('customer_id')
    if (customerId !== userId) {
      return e.json(403, { ok: false, error: 'Apenas o cliente deste serviço pode responder.' })
    }

    // The flow only applies to accepted (not yet started) jobs.
    if (job.getString('status') !== 'accepted') {
      return e.json(409, {
        ok: false,
        error: 'Este serviço não está mais aguardando o profissional.',
      })
    }

    // Idempotency: if the client already answered, return the existing result.
    const existingResponse = job.getString('client_delay_response')
    if (existingResponse) {
      return e.json(200, {
        ok: true,
        already_responded: true,
        response: existingResponse,
        job_id: jobId,
      })
    }

    // Only the cron arms delay_notification_sent; if the flow was never armed
    // (the pro was never +15 min late) we reject the call.
    if (!job.getBool('delay_notification_sent')) {
      return e.json(409, {
        ok: false,
        error: 'Este serviço não está em fluxo de atraso do profissional.',
      })
    }

    const nowMs = Date.now()
    const nowIso = new Date(nowMs).toISOString()

    // --- cancel + emergency reopen (shared with the cron timeout path) ----
    function cancelAndReopen(reason) {
      // Cancel the current job.
      try {
        job.set('status', 'cancelled')
        job.set('cancelled_by', job.getString('pro_id') || '')
        job.set('cancelled_at', nowIso)
        job.set('cancellation_reason', reason || 'professional_delay')
        const ps = job.getString('payment_status')
        if (ps === 'authorized') {
          job.set('payment_status', 'cancelled')
        } else if (ps === 'held') {
          job.set('payment_status', 'refunded')
        }
        $app.save(job)
      } catch (err) {
        return { ok: false, error: 'Falha ao cancelar o serviço: ' + err }
      }

      // Create the emergency reopen job with the same data.
      let newJobId = ''
      try {
        const jobsCol = $app.findCollectionByNameOrId('jobs')
        const newJob = new Record(jobsCol)
        newJob.set('customer_id', customerId)
        newJob.set('service_id', job.getString('service_id'))
        newJob.set('status', 'pending')
        const originalPrice = job.getFloat('price')
        newJob.set('price', originalPrice)
        newJob.set('client_price', originalPrice)
        newJob.set('type', 'emergency')
        newJob.set('emergency_fee', 1.2)
        newJob.set('address', job.getString('address'))
        newJob.set('latitude', job.getFloat('latitude'))
        newJob.set('longitude', job.getFloat('longitude'))
        newJob.set('scheduled_at', nowIso)
        const hours = job.getFloat('hours')
        newJob.set('hours', hours > 0 ? hours : 1)
        newJob.set(
          'payment_status',
          job.getString('payment_status') === 'refunded' ? 'held' : job.getString('payment_status'),
        )
        newJob.set('payment_intent_id', job.getString('payment_intent_id'))
        newJob.set('payment_authorized_at', job.getString('payment_authorized_at'))
        newJob.set('reopened', true)
        $app.save(newJob)
        newJobId = newJob.getString('id')

        // Notify the client the emergency reopen was triggered.
        let notifCol = null
        try {
          notifCol = $app.findCollectionByNameOrId('notifications')
        } catch (_) {}
        if (notifCol) {
          try {
            const n = new Record(notifCol)
            n.set('user_id', customerId)
            n.set('type', 'system')
            n.set('title', 'Serviço reaberto como emergência')
            n.set(
              'message',
              'O serviço foi cancelado e reaberto como emergência. Estamos buscando um novo profissional para você.',
            )
            n.set('job_id', newJobId)
            n.set('read_status', false)
            $app.save(n)
          } catch (_) {}

          // Notify available pros in the region about the new emergency job.
          let pros = []
          try {
            pros = $app.findRecordsByFilter(
              'users',
              "role = 'pro' && status = 'active'",
              '-created',
              500,
              0,
            )
          } catch (_) {}
          const originalProId = job.getString('pro_id')
          for (let p = 0; p < pros.length; p++) {
            const pro = pros[p]
            if (pro.getBool('suspended')) continue
            const blockedUntilStr = pro.getString('blocked_until')
            if (blockedUntilStr) {
              const blockedMs = new Date(blockedUntilStr).getTime()
              if (!isNaN(blockedMs) && blockedMs > nowMs) continue
            }
            const proId2 = pro.getString('id')
            if (!proId2 || proId2 === customerId) continue
            if (proId2 === originalProId) continue
            try {
              const n = new Record(notifCol)
              n.set('user_id', proId2)
              n.set('type', 'new_job')
              n.set('title', 'Nova solicitação de emergência disponível')
              n.set(
                'message',
                'Uma solicitação foi reaberta como emergência e está disponível para atendimento imediato.',
              )
              n.set('job_id', newJobId)
              n.set('read_status', false)
              $app.save(n)
            } catch (_) {}
          }
        }
      } catch (err) {
        return { ok: false, error: 'Falha ao reabrir como emergência: ' + err }
      }

      return { ok: true, cancelled_job_id: jobId, emergency_job_id: newJobId }
    }

    // --- extend (1h or 2h) respecting the 22:00 closing limit -------------
    function applyExtension(minutes) {
      const scheduledAtStr = job.getString('scheduled_at')
      if (!scheduledAtStr) {
        return { ok: false, error: 'Serviço sem horário agendado.' }
      }
      const schedMs = new Date(scheduledAtStr).getTime()
      if (isNaN(schedMs)) {
        return { ok: false, error: 'Horário agendado inválido.' }
      }
      const hours = job.getFloat('hours') || 1

      // The spec says the extension is measured from NOW, not from the original
      // scheduled_start: "scheduled_start = agora + extensão escolhida".
      let newStartMs = nowMs + minutes * 60000
      let newEndMs = newStartMs + hours * 3600000

      // Closing limit: scheduled_end must not cross 22:00 local (-03:00).
      // Compute the local (wall-clock) hour of the new end instant.
      function localHourOf(ms) {
        // -03:00 offset → wall-clock = UTC - 3h
        const adjusted = new Date(ms - 3 * 3600000)
        return adjusted.getUTCHours() + adjusted.getUTCMinutes() / 60
      }
      // 22:00 local ⇒ if newEnd's wall-clock > 22.0, clamp the start so the end
      // lands at or before 22:00. If even the original job would end after 22:00
      // we just keep the natural extension.
      const LOCAL_CLOSING = 22.0
      if (localHourOf(newEndMs) > LOCAL_CLOSING && localHourOf(newEndMs) < 24.0) {
        // Move newEnd to 22:00 local on the same day, then back out the start.
        // Build the 22:00 -03:00 instant for the same calendar day as newEnd.
        const endAdjusted = new Date(newEndMs - 3 * 3600000)
        const pad2Local = function (n) {
          return n < 10 ? '0' + n : String(n)
        }
        const y = endAdjusted.getUTCFullYear()
        const m = pad2Local(endAdjusted.getUTCMonth() + 1)
        const d = pad2Local(endAdjusted.getUTCDate())
        const closingIso = y + '-' + m + '-' + d + 'T22:00:00-03:00'
        const closingMs = new Date(closingIso).getTime()
        if (!isNaN(closingMs) && closingMs > newStartMs) {
          newEndMs = closingMs
          newStartMs = newEndMs - hours * 3600000
        }
      }

      try {
        job.set('scheduled_at', new Date(newStartMs).toISOString())
        // scheduled_end isn't a stored column (end is derived from start+hours),
        // so we only store start + hours. extended / extension_minutes record that
        // the pro got an extension.
        job.set('extended', true)
        job.set('extension_minutes', minutes)
        job.set('client_delay_response', minutes === 60 ? 'extend_1h' : 'extend_2h')
        job.set('client_delay_responded_at', nowIso)
        job.set('delay_notification_sent', false)
        job.set('delay_notified_at', '')
        // Status stays `accepted`; the job proceeds normally.
        $app.save(job)

        // Notify the pro that the client extended the deadline.
        const proId = job.getString('pro_id')
        let notifCol = null
        try {
          notifCol = $app.findCollectionByNameOrId('notifications')
        } catch (_) {}
        if (proId && notifCol) {
          try {
            const n = new Record(notifCol)
            n.set('user_id', proId)
            n.set('type', 'system')
            n.set('title', 'Prazo estendido pelo cliente')
            n.set(
              'message',
              'O cliente estendeu o prazo em ' +
                minutes +
                ' minutos. Novo horário de início: ' +
                new Date(newStartMs).toISOString() +
                '.',
            )
            n.set('job_id', jobId)
            n.set('read_status', false)
            $app.save(n)
          } catch (_) {}
        }
      } catch (err) {
        return { ok: false, error: 'Falha ao aplicar extensão: ' + err }
      }

      return {
        ok: true,
        extended: true,
        extension_minutes: minutes,
        new_scheduled_at: new Date(newStartMs).toISOString(),
        new_scheduled_end: new Date(newEndMs).toISOString(),
        job_id: jobId,
      }
    }

    let result = null
    if (response === 'extend_1h') {
      result = applyExtension(60)
    } else if (response === 'extend_2h') {
      result = applyExtension(120)
    } else {
      // cancel_reopen
      try {
        job.set('client_delay_response', 'cancel_reopen')
        job.set('client_delay_responded_at', nowIso)
      } catch (_) {}
      result = cancelAndReopen('professional_delay')
    }

    if (!result.ok) {
      return e.json(500, result)
    }
    return e.json(200, result)
  },
  $apis.requireAuth(),
)
