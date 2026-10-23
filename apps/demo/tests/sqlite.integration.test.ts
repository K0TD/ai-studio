import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

for (const scenario of [
  "fresh",
  "legacy",
  "invalid",
  "rollback",
  "concurrent",
]) {
  test(`SQLite database: ${scenario}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "studio-sqlite-test-"));
    try {
      const child = Bun.spawn(
        [
          "bun",
          "run",
          new URL("fixtures/sqlite-database.ts", import.meta.url).pathname,
          scenario,
        ],
        {
          env: {
            ...process.env,
            ADMIN_LOGIN: "",
            ADMIN_PASSWORD: "",
            BETTER_AUTH_SECRET:
              "sqlite-integration-only-secret-at-least-32-characters",
            BETTER_AUTH_URL: "http://localhost:3000",
            DATABASE_URL: "",
            SQLITE_PATH: join(directory, "database.sqlite"),
            STORAGE_ROOT: directory,
            TEST_DATABASE_URL: "",
          },
          stderr: "pipe",
          stdout: "pipe",
        }
      );
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect({ code, errors: code ? stderr + stdout : "" }).toEqual({
        code: 0,
        errors: "",
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  }, 30_000);
}
