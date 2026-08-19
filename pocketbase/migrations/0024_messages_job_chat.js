// Recreates the `messages` collection for direct job-based chat (Phase 1).
//
// The original messages collection (0001) tied messages to a separate `chats`
// collection via `chat_id`. Phase 1 simplifies this: messages are tied directly
// to a job, with `sender`, `content`, and a `read` flag. Access is limited to
// the job's customer and professional.
//
// Business rules (enforced at the API-rule layer):
//   - list/view: participant AND chat window is open
//       (status accepted/in_progress, OR completed within the last 7 days
//        measured from `completed_at`)
//   - create:     participant AND status is accepted or in_progress
//       (completed => read-only; >7d after completed => fully blocked)
//   - update:     participant (used to mark received messages as read)
//   - delete:     admin only
//
// The collection has no production data, so it is dropped and recreated cleanly
// (the JSVM FieldsList has no working field-removal method, so mutating the
// existing collection's fields is unreliable).
migrate(
  (app) => {
    // Drop the existing (empty) messages collection if present.
    try {
      app.delete(app.findCollectionByNameOrId('messages'))
    } catch (_) {}

    const jobsId = app.findCollectionByNameOrId('jobs').id
    const usersId = '_pb_users_auth_'

    const participantRule =
      "@request.auth.id != '' && (job.customer_id = @request.auth.id || job.pro_id = @request.auth.id)"

    // Chat window is open while accepted/in_progress, or completed within the
    // last 7 days (measured from completed_at). After that the chat is fully
    // blocked — not even readable.
    const windowOpenRule =
      participantRule +
      " && (job.status = 'accepted' || job.status = 'in_progress' || (job.status = 'completed' && job.completed_at > strftime('%Y-%m-%d %H:%M:%S', @now, '-7 days')))"

    const col = new Collection({
      name: 'messages',
      type: 'base',
      listRule: windowOpenRule,
      viewRule: windowOpenRule,
      // Read-only once completed: creation is only allowed while the job is
      // accepted or in_progress.
      createRule: participantRule + " && (job.status = 'accepted' || job.status = 'in_progress')",
      updateRule: participantRule,
      deleteRule: "@request.auth.role = 'admin'",
      fields: [
        {
          name: 'job',
          type: 'relation',
          required: true,
          collectionId: jobsId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'sender',
          type: 'relation',
          required: true,
          collectionId: usersId,
          maxSelect: 1,
        },
        { name: 'content', type: 'text', required: true },
        { name: 'read', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_messages_job ON messages (job)'],
    })
    app.save(col)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('messages'))
    } catch (_) {}
  },
)
