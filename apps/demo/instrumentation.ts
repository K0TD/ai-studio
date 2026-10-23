export const register = async () => {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.NEXT_PHASE === "phase-production-build"
  ) {
    return;
  }
  const { initLogging } = await import("./lib/logging");
  initLogging("web");
  if (process.env.NODE_ENV === "production") {
    const { validateRuntimeEnv } = await import("./lib/env");
    validateRuntimeEnv();
  }
  const { ensureDatabase } = await import("./lib/db/auto-migrate");
  await ensureDatabase();
};
