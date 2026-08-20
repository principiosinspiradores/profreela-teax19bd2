// Endpoint to list anti-disintermediation alerts for admins.
// Analyzes all jobs in the database to detect potential direct off-platform hiring between clients and professionals.
//
// Rules checked:
// 1. Same client + pro pair 3+ times: count completed jobs for the pair >= 3.
// 2. Very short jobs (< 15 minutes between started_at/clocked_in_at and completed_at): suspicious contact exchange.
// 3. Recurrent jobs in short window: 2+ jobs between same client + pro within 7 days.
//
// GET /backend/v1/admin/anti-disintermediation-alerts
routerAdd(
  'GET',
  '/backend/v1/admin/anti-disintermediation-alerts',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { ok: false, error: 'Autenticação necessária.' })
    }
    const role = authRecord.getString('role')
    if (role !== 'admin') {
      return e.json(403, { ok: false, error: 'Acesso restrito a administradores.' })
    }

    // Fetch all jobs with relations expanded or load users/services map
    let jobs = []
    try {
      jobs = $app.findRecordsByFilter('jobs', '1=1', '-created', 500, 0)
    } catch (err) {
      return e.json(500, { ok: false, error: 'Falha ao buscar serviços: ' + err })
    }

    // Cache user records for quick name/phone lookup
    const userCache = {}
    function getUser(userId) {
      if (!userId) return null
      if (userCache[userId] !== undefined) return userCache[userId]
      try {
        const u = $app.findFirstRecordByData('users', 'id', userId)
        userCache[userId] = {
          id: u.getString('id'),
          name: u.getString('name') || 'Sem nome',
          email: u.getString('email') || '',
          phone: u.getString('phone') || '',
          role: u.getString('role') || '',
        }
      } catch (_) {
        userCache[userId] = null
      }
      return userCache[userId]
    }

    // Group jobs by pair (clientId_proId)
    const pairMap = {}
    const shortJobs = []

    for (let i = 0; i < jobs.length; i++) {
      const j = jobs[i]
      const clientId = j.getString('customer_id')
      const proId = j.getString('pro_id')
      const status = j.getString('status')
      const created = j.getString('created')
      const startedAt = j.getString('started_at') || j.getString('clocked_in_at')
      const completedAt = j.getString('completed_at')
      const phoneUnlocked = j.getBool('phone_unlocked_for_client')
      const jobId = j.getString('id')

      if (clientId && proId) {
        const pairKey = clientId + '__' + proId
        if (!pairMap[pairKey]) {
          pairMap[pairKey] = {
            clientId: clientId,
            proId: proId,
            allJobs: [],
            completedJobs: [],
          }
        }
        const jobSummary = {
          id: jobId,
          status: status,
          created: created,
          startedAt: startedAt,
          completedAt: completedAt,
          phoneUnlocked: phoneUnlocked,
          price: j.getFloat('price'),
        }
        pairMap[pairKey].allJobs.push(jobSummary)
        if (status === 'completed') {
          pairMap[pairKey].completedJobs.push(jobSummary)
        }
      }

      // Check Rule 2: Short job (< 15 min duration)
      if (status === 'completed' && startedAt && completedAt && clientId && proId) {
        const startMs = new Date(startedAt).getTime()
        const endMs = new Date(completedAt).getTime()
        if (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs) {
          const durationMinutes = Math.round((endMs - startMs) / 60000)
          if (durationMinutes < 15 && durationMinutes >= 0) {
            shortJobs.push({
              jobId: jobId,
              clientId: clientId,
              proId: proId,
              durationMinutes: durationMinutes,
              startedAt: startedAt,
              completedAt: completedAt,
              created: created,
            })
          }
        }
      }
    }

    const alerts = []
    let alertIdCounter = 1

    // 1. Process pair stats (Rule 1 & Rule 3)
    const pairKeys = Object.keys(pairMap)
    for (let k = 0; k < pairKeys.length; k++) {
      const pair = pairMap[pairKeys[k]]
      const client = getUser(pair.clientId)
      const pro = getUser(pair.proId)
      const clientName = client ? client.name : 'Cliente #' + pair.clientId.slice(0, 5)
      const proName = pro ? pro.name : 'Profissional #' + pair.proId.slice(0, 5)

      // Rule 1: 3+ completed jobs together
      if (pair.completedJobs.length >= 3) {
        // Find earliest and latest date
        const dates = pair.completedJobs
          .map((j) => new Date(j.created).getTime())
          .filter((t) => !isNaN(t))
        const firstDate = dates.length > 0 ? new Date(Math.min(...dates)).toISOString() : null
        const lastDate = dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : null

        alerts.push({
          id: 'alert-reincidence-' + alertIdCounter++,
          type: 'high_frequency_completed',
          severity: 'high',
          title: 'Par recorrente (3+ serviços concluídos)',
          description:
            'O cliente ' +
            clientName +
            ' e o profissional ' +
            proName +
            ' já concluíram ' +
            pair.completedJobs.length +
            ' serviços juntos. Alto risco de migração para contratação direta.',
          clientId: pair.clientId,
          clientName: clientName,
          clientPhone: client ? client.phone : '',
          proId: pair.proId,
          proName: proName,
          proPhone: pro ? pro.phone : '',
          totalJobsTogether: pair.allJobs.length,
          completedJobsTogether: pair.completedJobs.length,
          firstJobDate: firstDate,
          lastJobDate: lastDate,
          jobIds: pair.completedJobs.map((j) => j.id),
        })
      }

      // Rule 3: 2+ jobs in 7 days window (any status except cancelled, or all jobs)
      // Check pairs of jobs whose created timestamp difference is <= 7 days
      const validJobs = pair.allJobs.filter((j) => j.status !== 'cancelled')
      validJobs.sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime())

      let hasShortWindowAlert = false
      let shortWindowJobs = []

      for (let i = 0; i < validJobs.length; i++) {
        const timeI = new Date(validJobs[i].created).getTime()
        if (isNaN(timeI)) continue
        const windowJobs = [validJobs[i]]
        for (let j = i + 1; j < validJobs.length; j++) {
          const timeJ = new Date(validJobs[j].created).getTime()
          if (isNaN(timeJ)) continue
          const diffDays = (timeJ - timeI) / (1000 * 60 * 60 * 24)
          if (diffDays <= 7) {
            windowJobs.push(validJobs[j])
          }
        }
        if (windowJobs.length >= 2) {
          hasShortWindowAlert = true
          shortWindowJobs = windowJobs
          break
        }
      }

      if (hasShortWindowAlert) {
        alerts.push({
          id: 'alert-short-window-' + alertIdCounter++,
          type: 'short_interval_recurrent',
          severity: 'medium',
          title: 'Serviços recorrentes em intervalo curto (≤ 7 dias)',
          description:
            clientName +
            ' e ' +
            proName +
            ' criaram ' +
            shortWindowJobs.length +
            ' solicitações em menos de 7 dias.',
          clientId: pair.clientId,
          clientName: clientName,
          clientPhone: client ? client.phone : '',
          proId: pair.proId,
          proName: proName,
          proPhone: pro ? pro.phone : '',
          totalJobsTogether: pair.allJobs.length,
          completedJobsTogether: pair.completedJobs.length,
          firstJobDate: shortWindowJobs[0].created,
          lastJobDate: shortWindowJobs[shortWindowJobs.length - 1].created,
          jobIds: shortWindowJobs.map((j) => j.id),
        })
      }
    }

    // 2. Rule 2: Short jobs (< 15 mins)
    for (let s = 0; s < shortJobs.length; s++) {
      const sj = shortJobs[s]
      const client = getUser(sj.clientId)
      const pro = getUser(sj.proId)
      const clientName = client ? client.name : 'Cliente #' + sj.clientId.slice(0, 5)
      const proName = pro ? pro.name : 'Profissional #' + sj.proId.slice(0, 5)

      alerts.push({
        id: 'alert-short-duration-' + alertIdCounter++,
        type: 'short_duration_completed',
        severity: 'high',
        title: 'Serviço concluído muito rápido (< 15 min)',
        description:
          'O serviço #' +
          sj.jobId.slice(0, 6) +
          ' durou apenas ' +
          sj.durationMinutes +
          ' minutos entre início e conclusão. Forte indício de comparecimento apenas para troca de contato/WhatsApp.',
        clientId: sj.clientId,
        clientName: clientName,
        clientPhone: client ? client.phone : '',
        proId: sj.proId,
        proName: proName,
        proPhone: pro ? pro.phone : '',
        jobId: sj.jobId,
        jobIds: [sj.jobId],
        durationMinutes: sj.durationMinutes,
        firstJobDate: sj.startedAt,
        lastJobDate: sj.completedAt,
      })
    }

    return e.json(200, {
      ok: true,
      count: alerts.length,
      alerts: alerts,
    })
  },
  $apis.requireAuth(),
)
