import { ensureDatabase } from "../lib/db/auto-migrate";
import { pool } from "../lib/db";
import { validateRuntimeEnv } from "../lib/env";
import { runWorker } from "../lib/generation/worker";

const shutdown = new AbortController();
process.once("SIGTERM", () => shutdown.abort());
process.once("SIGINT", () => shutdown.abort());

try {
  validateRuntimeEnv();
  await ensureDatabase();
  await runWorker({ signal: shutdown.signal });
} catch {
  // Provider exceptions can contain sensitive URLs or response bodies.
  console.error(JSON.stringify({ event: "worker.fatal" }));
  process.exitCode = 1;
} finally {
  await pool.end();
}
