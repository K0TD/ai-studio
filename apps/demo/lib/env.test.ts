import { expect, test } from "bun:test";

import { validateRuntimeEnv } from "./env";

test("database configuration cannot silently select SQLite for a mistyped PostgreSQL URL", () => {
  const settings = {
    ADMIN_LOGIN: "test_admin",
    ADMIN_PASSWORD: "isolated-test-password-482",
    BETTER_AUTH_SECRET:
      "isolated-test-secret-longer-than-thirty-two-characters",
    BETTER_AUTH_URL: "http://localhost:3000",
    DATABASE_URL: "",
    MEDIA_ROOT: "/tmp/studio-env-test-media",
    ROUTERAI_API_KEY: "isolated-test-routerai-key",
    SQLITE_PATH: "/tmp/studio-env-test/database.sqlite",
    STORAGE_ROOT: "/tmp/studio-env-test",
  };
  const previous = Object.fromEntries(
    Object.keys(settings).map((key) => [key, process.env[key]])
  );
  try {
    Object.assign(process.env, settings);
    expect(validateRuntimeEnv().DATABASE_URL).toBe("");
    for (const url of [
      "postgres://localhost/studio",
      "postgresql://localhost/studio",
    ]) {
      process.env.DATABASE_URL = url;
      expect(validateRuntimeEnv().DATABASE_URL).toBe(url);
    }
    for (const url of [
      "postgre://localhost/studio",
      "postgres://",
      "sqlite:///tmp/studio.sqlite",
    ]) {
      process.env.DATABASE_URL = url;
      expect(() => validateRuntimeEnv()).toThrow("DATABASE_URL");
    }
    process.env.DATABASE_URL = "";
    process.env.SQLITE_PATH = "relative/database.sqlite";
    expect(() => validateRuntimeEnv()).toThrow("SQLITE_PATH");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        // Assigning undefined stores a string in Node; restore absence instead.
        // oxlint-disable-next-line typescript/no-dynamic-delete
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});
