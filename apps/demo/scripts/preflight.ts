import { validateRuntimeEnv } from "../lib/env";

try {
  validateRuntimeEnv();
  console.info("Production configuration is valid.");
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Invalid configuration"
  );
  process.exitCode = 1;
}
