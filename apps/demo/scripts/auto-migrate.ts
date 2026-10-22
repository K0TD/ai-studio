import { ensureDatabase } from "../lib/db/auto-migrate";
import { pool } from "../lib/db";

try {
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
