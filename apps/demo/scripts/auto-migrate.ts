import { pool } from "../lib/db";
import { ensureDatabase } from "../lib/db/auto-migrate";
import { validateRuntimeEnv } from "../lib/env";
import { initLogging } from "../lib/logging";

initLogging("startup");

try {
  if (process.env.NODE_ENV === "production") {
    validateRuntimeEnv();
  }
  await ensureDatabase();
  console.info(JSON.stringify({ event: "database.auto_migrate_success" }));
} catch (error) {
  console.error(
    "Ошибка автоматической миграции базы данных:",
    error instanceof Error ? error.message : error
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
