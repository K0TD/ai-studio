import { synchronizeAdmin } from "../lib/admin/bootstrap";
import { ensureDatabase } from "../lib/db/auto-migrate";
import { pool } from "../lib/db";
import { validateRuntimeEnv } from "../lib/env";

try {
  const settings = validateRuntimeEnv();
  await ensureDatabase();
  const outcome = await synchronizeAdmin({
    email: process.env.ADMIN_EMAIL?.trim() || "admin@studio.internal",
    login: settings.ADMIN_LOGIN,
    password: settings.ADMIN_PASSWORD,
  });
  console.info(
    JSON.stringify({
      changed: outcome.changed,
      event: "admin.environment_sync",
    })
  );
} catch (error) {
  console.error(
    "Не удалось синхронизировать администратора:",
    error instanceof Error ? error.message : error
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
