// Shift the escrow model to "pay at request" (Airbnb / GetNinjas style):
// the client pays BEFORE the job is created, so every job is born with a
// guaranteed payment. The professional sees a "Pagamento garantido" badge
// and can accept with confidence.
//
// Two new payment_status values are added to the existing `payment_status`
// select on the `jobs` collection:
//   - pending  : payment not yet processed (only used transiently, if ever)
//   - refunded : a held payment was released back to the client (e.g. the
//                job was cancelled after the client had already paid)
//
// The existing values are preserved:
//   authorized | held | released | captured | disputed | cancelled
//
// SelectField replacement: PocketBase select values are immutable through
// `col.fields.getByName(name).set('values', ...)` at runtime, so we recreate
// the field with the full new value set. The FieldsList API exposes
// `removeByName(name)` (NOT `remove(field)`), so we drop the old field by
// name and add the new one. Because `payment_status` is not referenced by
// any index, dropping + re-adding it is safe.
//
// Also seeds `guarantee_period_days = 1` (the 24h escrow window) on the
// existing settings row — the new flow releases the held payment 24h after
// `completed_at`, not after 7 days.

migrate(
  (app) => {
    const jobs = app.findCollectionByNameOrId('jobs')

    // PocketBase's FieldsList has removeByName(name) — there is no
    // remove(field) method (the original migration crashed here with
    // "Object has no member 'remove'").
    jobs.fields.removeByName('payment_status')
    jobs.fields.add(
      new SelectField({
        name: 'payment_status',
        required: false,
        maxSelect: 1,
        values: [
          'pending',
          'authorized',
          'held',
          'released',
          'captured',
          'disputed',
          'cancelled',
          'refunded',
        ],
      }),
    )
    app.save(jobs)

    // Seed the 24h guarantee window on the existing settings row. The settings
    // collection already has `guarantee_period_days` (added by 0008); this just
    // lowers the value to 1 so the release cron runs 24h after completion.
    try {
      const rows = app.findRecordsByFilter('settings', '1=1', '', 1, 0)
      if (rows.length > 0) {
        const s = rows[0]
        s.set('guarantee_period_days', 1)
        app.save(s)
      }
    } catch (_) {}
  },
  (app) => {
    // Revert the select to its previous value set (drops pending/refunded).
    const jobs = app.findCollectionByNameOrId('jobs')
    jobs.fields.removeByName('payment_status')
    jobs.fields.add(
      new SelectField({
        name: 'payment_status',
        required: false,
        maxSelect: 1,
        values: ['authorized', 'held', 'released', 'captured', 'disputed', 'cancelled'],
      }),
    )
    app.save(jobs)

    try {
      const rows = app.findRecordsByFilter('settings', '1=1', '', 1, 0)
      if (rows.length > 0) {
        const s = rows[0]
        s.set('guarantee_period_days', 7)
        app.save(s)
      }
    } catch (_) {}
  },
)
