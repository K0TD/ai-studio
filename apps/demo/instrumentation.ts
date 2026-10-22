export const register = async () => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateRuntimeEnv } = await import("./lib/env");
    validateRuntimeEnv();
  }
};
