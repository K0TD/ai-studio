import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("SQLite worker persists images, survives retries and retains uncertain reserves", async () => {
  const root = await mkdtemp(join(tmpdir(), "studio-worker-sqlite-"));
  try {
    const child = Bun.spawn(
      [process.execPath, "tests/fixtures/generation-worker.ts"],
      {
        cwd: join(import.meta.dir, ".."),
        env: {
          ...process.env,
          ADMIN_LOGIN: "",
          ADMIN_PASSWORD: "",
          BETTER_AUTH_URL: "http://localhost:3000",
          DATABASE_URL: "",
          MEDIA_ROOT: join(root, "media"),
          ROUTERAI_API_KEY: "fixture-routerai-key",
          SQLITE_PATH: join(root, "database.sqlite"),
          STORAGE_ROOT: root,
        },
        stderr: "pipe",
        stdout: "pipe",
      }
    );
    const [code, output, errors] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect({ code, errors, output }).toMatchObject({ code: 0 });
    expect(output).toContain("generation.sqlite_success");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}, 30_000);
