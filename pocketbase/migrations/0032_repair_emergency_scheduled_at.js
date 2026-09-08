// Preenche scheduled_at para jobs do tipo "emergency" que foram criados sem data/horário
// e que ainda estão pendentes ou aceitos recentemente (últimas 48 horas).
// Isso permite que jobs de emergência em aberto possam ser aceitos sem erro de "Dados incompletos".
migrate(
  (app) => {
    app
      .db()
      .newQuery(
        `UPDATE jobs
         SET scheduled_at = datetime('now')
         WHERE type = 'emergency'
           AND (scheduled_at IS NULL OR scheduled_at = '')
           AND status IN ('pending', 'accepted')
           AND created >= datetime('now', '-2 days')`,
      )
      .execute()
  },
  (app) => {
    // Reversão no-op: manter o scheduled_at reparado
  },
)
