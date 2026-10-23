import { validateRuntimeEnv } from "../lib/env";
import { initLogging } from "../lib/logging";

initLogging("startup");

try {
  validateRuntimeEnv();
  console.info("Production configuration is valid.");
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Invalid configuration"
  );
  process.exitCode = 1;
}
