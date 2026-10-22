import { synchronizeAdmin } from "../lib/admin/bootstrap";
import { pool } from "../lib/db";
import { validateRuntimeEnv } from "../lib/env";

try {
  const settings = validateRuntimeEnv();
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
} catch {
  console.error(
    "Не удалось синхронизировать администратора. Проверьте конфигурацию, миграции и уникальность логина/email."
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
