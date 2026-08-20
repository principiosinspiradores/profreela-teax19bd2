migrate(
  (app) => {
    // Remove duplicate saved_locations records with the same client_id and address,
    // keeping only the oldest record (smallest created date) for each group.
    app
      .db()
      .newQuery(`
    DELETE FROM saved_locations
    WHERE id NOT IN (
      SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY client_id, address ORDER BY created ASC, id ASC) as rn
        FROM saved_locations
      )
      WHERE rn = 1
    )
  `)
      .execute()
  },
  (app) => {
    // Cleanup migration down() is a no-op since deleted duplicate rows cannot/should not be restored
  },
)
