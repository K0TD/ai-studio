export const register = async () => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateRuntimeEnv } = await import("./lib/env");
    const settings = validateRuntimeEnv();
    try {
      const { synchronizeAdmin } = await import("./lib/admin/bootstrap");
      await synchronizeAdmin({
        email: process.env.ADMIN_EMAIL?.trim() || "admin@studio.internal",
        login: settings.ADMIN_LOGIN,
        password: settings.ADMIN_PASSWORD,
      });
    } catch (error) {
      console.warn(
        "Не удалось синхронизировать администратора при старте:",
        error instanceof Error ? error.message : error
      );
    }
  }
};
