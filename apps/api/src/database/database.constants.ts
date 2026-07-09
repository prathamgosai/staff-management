// DI token for the pg Pool. Kept in its own file (not database.module.ts) so that
// DbKeepWarmService can import it without creating a circular import with the module
// — a cycle would leave the token `undefined` at decorator-eval time and break DI.
export const DB_POOL = "DB_POOL";
