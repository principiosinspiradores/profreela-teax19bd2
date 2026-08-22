migrate(
  (app) => {
    // Remove todos os registros de teste da collection saved_locations.
    // O auto-save de endereços continua funcionando normalmente depois,
    // pois apenas os registros existentes sao removidos (a collection/schema nao e alterada).
    app.db().newQuery(`DELETE FROM saved_locations`).execute()
  },
  (app) => {
    // down() e no-op: registros removidos nao podem ser restaurados.
  },
)
