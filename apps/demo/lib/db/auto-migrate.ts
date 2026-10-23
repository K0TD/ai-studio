import { setTimeout as delay } from "node:timers/promises";

import { synchronizeAdmin } from "../admin/bootstrap";
import { isPostgres, pool } from "./index";
import { migrateSchema, SCHEMA_VERSION } from "./migrations";

export const ensureDatabase = async (): Promise<void> => {
  await migrateSchema();
  const login = process.env.ADMIN_LOGIN?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (login && password) {
    const outcome = await synchronizeAdmin({
      email: process.env.ADMIN_EMAIL?.trim() || "admin@studio.internal",
      login,
      password,
    });
    console.info(
      JSON.stringify({
        changed: outcome.changed,
        event: "admin.auto_synchronized",
      })
    );
  }
};

export const waitForDatabase = async (timeoutMs = 60_000): Promise<void> => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await pool.query<{ version: number }>(
        "SELECT max(version) AS version FROM studio_schema_migrations"
      );
      if (Number(result.rows[0]?.version) === SCHEMA_VERSION) {
        return;
      }
    } catch {
      // The web startup migration owns initialization; workers only wait.
    }
    await delay(
      Math.min(1000, Math.max(1, timeoutMs - (Date.now() - started)))
    );
  }
  throw new Error(
    `Database schema is not ready (${isPostgres ? "postgres" : "sqlite"}, expected version ${SCHEMA_VERSION})`
  );
};
