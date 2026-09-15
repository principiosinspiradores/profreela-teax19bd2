// Documents review: admin-only rules + review fields.
//
// 1) documents: tighten API rules — only the owner or an admin can read/update;
//    only the owner can create (their own docs); nobody deletes (audit trail).
//    Adds review fields: reviewed_at, reviewed_by, reviewer_note, resubmit_count.
//    Adds (user_id, status) index for the admin pending queue.
// 2) Idempotent: safe to re-run.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('documents')

    col.listRule =
      "@request.auth.id != '' && (user_id = @request.auth.id || @request.auth.role = 'admin')"
    col.viewRule =
      "@request.auth.id != '' && (user_id = @request.auth.id || @request.auth.role = 'admin')"
    col.createRule = "@request.auth.id != '' && user_id = @request.auth.id"
    col.updateRule =
      "@request.auth.id != '' && (user_id = @request.auth.id || @request.auth.role = 'admin')"
    col.deleteRule = null

    if (!col.fields.getByName('reviewed_at')) {
      col.fields.add(new DateField({ name: 'reviewed_at' }))
    }
    if (!col.fields.getByName('reviewed_by')) {
      col.fields.add(
        new RelationField({
          name: 'reviewed_by',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          required: false,
        }),
      )
    }
    if (!col.fields.getByName('reviewer_note')) {
      col.fields.add(new TextField({ name: 'reviewer_note', max: 500 }))
    }
    if (!col.fields.getByName('resubmit_count')) {
      col.fields.add(new NumberField({ name: 'resubmit_count', min: 0, onlyInt: true }))
    }

    col.addIndex('idx_documents_user_status', false, 'user_id,status', '')

    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('documents')
      col.listRule = "@request.auth.id != ''"
      col.viewRule = "@request.auth.id != ''"
      col.createRule = "@request.auth.id != ''"
      col.updateRule = "@request.auth.id != ''"
      col.deleteRule = "@request.auth.id != ''"
      ;['reviewed_at', 'reviewed_by', 'reviewer_note', 'resubmit_count'].forEach((n) => {
        const f = col.fields.getByName(n)
        if (f) col.fields.remove(f)
      })
      try {
        col.removeIndex('idx_documents_user_status')
      } catch (_) {}
      app.save(col)
    } catch (_) {}
  },
)
