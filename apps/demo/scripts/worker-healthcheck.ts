import { pool } from "../lib/db";
import { workerHeartbeatIsHealthy } from "../lib/generation/worker";

try {
  process.exitCode = (await workerHeartbeatIsHealthy()) ? 0 : 1;
} catch {
  process.exitCode = 1;
} finally {
  await pool.end();
}
