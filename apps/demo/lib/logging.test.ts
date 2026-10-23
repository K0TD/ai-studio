import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createLogWriter, sanitizeLogValue } from "./logging";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("redacts nested secrets, signed URLs, headers, inline data and configured secrets", () => {
  const previous = process.env.ROUTERAI_API_KEY;
  process.env.ROUTERAI_API_KEY = "private-provider-key-probe";
  try {
    const serialized = JSON.stringify(
      sanitizeLogValue({
        accessToken: "opaque-token-probe",
        error: "provider rejected private-provider-key-probe",
        headers: { authorization: "Bearer auth-probe", cookie: "session=abc" },
        image: `data:image/png;base64,${"a".repeat(200)}`,
        result: {
          b64_json: "image-probe",
          url: "https://user:pass@cdn.example/result.png?signature=signature-probe#token",
        },
        trace: new Error("Authorization: Bearer header-probe"),
      })
    );
    for (const secret of [
      "opaque-token-probe",
      "private-provider-key-probe",
      "auth-probe",
      "session=abc",
      "image-probe",
      "signature-probe",
      "user:pass",
      "header-probe",
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).toContain("https://cdn.example/result.png");
  } finally {
    if (previous === undefined) {
      delete process.env.ROUTERAI_API_KEY;
    } else {
      process.env.ROUTERAI_API_KEY = previous;
    }
  }
});

test("persists structured events and keeps five rotation archives", () => {
  const directory = mkdtempSync(join(tmpdir(), "studio-logging-"));
  directories.push(directory);
  const write = createLogWriter(directory, "worker", 200);
  for (let index = 0; index < 10; index += 1) {
    write("error", [
      JSON.stringify({ event: "worker.maintenance_failed", index }),
    ]);
  }
  expect(readdirSync(directory).toSorted()).toEqual([
    "worker.jsonl",
    "worker.jsonl.1",
    "worker.jsonl.2",
    "worker.jsonl.3",
    "worker.jsonl.4",
    "worker.jsonl.5",
  ]);
  const current = JSON.parse(
    readFileSync(join(directory, "worker.jsonl"), "utf-8").trim()
  );
  expect(current).toMatchObject({
    details: { event: "worker.maintenance_failed", index: 9 },
    level: "error",
    service: "worker",
  });
  expect(new Date(current.timestamp).toISOString()).toBe(current.timestamp);
});

test("handles circular objects and bigint without losing the event", () => {
  interface CircularEvent {
    event: string;
    nested?: CircularEvent;
    value: bigint;
  }
  const event: CircularEvent = { event: "probe", value: 1n };
  event.nested = event;
  expect(sanitizeLogValue(event)).toEqual({
    event: "probe",
    nested: "[CIRCULAR]",
    value: "1",
  });
});

test("initializes once and sanitizes both persistent logs and retained console output", async () => {
  const directory = mkdtempSync(join(tmpdir(), "studio-logging-process-"));
  directories.push(directory);
  const script = `import { initLogging } from ${JSON.stringify(resolve(import.meta.dir, "logging.ts"))}; initLogging("startup"); initLogging("startup"); console.error(JSON.stringify({event:"startup.probe",apiKey:"provider-secret-probe"}));`;
  const child = Bun.spawn([process.execPath, "-e", script], {
    env: { ...process.env, STORAGE_ROOT: directory },
    stderr: "pipe",
    stdout: "pipe",
  });
  expect(await child.exited).toBe(0);
  const stderr = await new Response(child.stderr).text();
  expect(stderr).toContain("startup.probe");
  expect(stderr).not.toContain("provider-secret-probe");
  const persisted = readFileSync(
    join(directory, "logs", "startup.jsonl"),
    "utf-8"
  );
  expect(persisted).not.toContain("provider-secret-probe");
  expect(persisted.trim().split("\n")).toHaveLength(2);
});
