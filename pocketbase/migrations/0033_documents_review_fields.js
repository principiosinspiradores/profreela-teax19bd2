// Document verification workflow (admin).
//
// 1) documents += reviewed_at (date), reviewer_note (text), resubmit_count (number),
//    reviewed_by (relation -> users, optional). All optional/idempotent — no data
//    migration needed, existing rows keep working.
//
// 2) documents API rules: self-or-admin. The pro must only see/touch their own
//    documents; admins review all. Previously any authenticated user could list
//    every document in the base (list/view had no ownership constraint).
//
// 3) notifications.type += 'document' so admins/pros can receive in-app
//    document-related notifications without schema changes elsewhere.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('documents')

    if (!col.fields.getByName('reviewed_at')) {
      col.fields.add(new DateField({ name: 'reviewed_at' }))
    }
    if (!col.fields.getByName('reviewer_note')) {
      col.fields.add(new TextField({ name: 'reviewer_note', required: false }))
    }
    if (!col.fields.getByName('resubmit_count')) {
      col.fields.add(new NumberField({ name: 'resubmit_count', min: 0, onlyInt: true }))
    }
    if (!col.fields.getByName('reviewed_by')) {
      col.fields.add(
        new RelationField({
          name: 'reviewed_by',
          required: false,
          collectionId: app.findCollectionByNameOrId('users').id,
          cascadeDelete: false,
          minSelect: 0,
          maxSelect: 1,
        }),
      )
    }

    col.listRule =
      "@request.auth.id != '' && (user_id = @request.auth.id || @request.auth.role = 'admin')"
    col.viewRule =
      "@request.auth.id != '' && (user_id = @request.auth.id || @request.auth.role = 'admin')"
    col.createRule = "@request.auth.id != '' && user_id = @request.auth.id"
    col.updateRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || user_id = @request.auth.id)"
    col.deleteRule =
      "@request.auth.id != '' && (user_id = @request.auth.id || @request.auth.role = 'admin')"

    app.save(col)

    const notifCol = app.findCollectionByNameOrId('notifications')
    const typeField = notifCol.fields.getByName('type')
    if (typeField && Array.isArray(typeField.values) && !typeField.values.includes('document')) {
      typeField.values.push('document')
      app.save(notifCol)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('documents')
    ;['reviewed_at', 'reviewer_note', 'resubmit_count', 'reviewed_by'].forEach((n) => {
      const f = col.fields.getByName(n)
      if (f) col.fields.remove(f)
    })
    col.listRule = "@request.auth.id != ''"
    col.viewRule = "@request.auth.id != ''"
    col.createRule = "@request.auth.id != ''"
    col.updateRule = "@request.auth.id != ''"
    col.deleteRule = "@request.auth.id != ''"
    app.save(col)
  },
)
