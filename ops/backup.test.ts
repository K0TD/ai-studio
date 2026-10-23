import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

// The remote transport is a fixture; the actual backup/restore shell scripts,
// SQLite backup API, integrity checks and media archive run against isolated paths.
const resticFixture = `#!/bin/sh
set -eu
case "$1" in
  backup) cp -R "$6" "$TEST_SNAPSHOT_ROOT/snapshot" ;;
  restore) cp -R "$TEST_SNAPSHOT_ROOT/." "$8" ;;
  check|forget) ;;
  *) exit 1 ;;
esac
`;

const run = async (script: string, env: NodeJS.ProcessEnv) => {
  const child = Bun.spawn(["sh", resolve(import.meta.dir, script)], {
    env,
    stderr: "pipe",
    stdout: "pipe",
  });
  return {
    code: await child.exited,
    error: await new Response(child.stderr).text(),
  };
};

test("SQLite snapshot restores WAL commits and media, rejects populated targets and backend mismatches", async () => {
  const directory = mkdtempSync(join(tmpdir(), "studio-backup-test-"));
  const source = join(directory, "source.sqlite");
  const target = join(directory, "restore", "database.sqlite");
  const sourceMedia = join(directory, "source-media");
  const targetMedia = join(directory, "target-media");
  const binaries = join(directory, "bin");
  const snapshot = join(directory, "snapshot");
  for (const path of [sourceMedia, targetMedia, binaries, snapshot]) {
    mkdirSync(path);
  }
  writeFileSync(join(binaries, "restic"), resticFixture);
  chmodSync(join(binaries, "restic"), 0o700);
  writeFileSync(join(directory, "password"), "fixture-password");
  writeFileSync(join(sourceMedia, "result.png"), "generated-image-bytes");
  const db = new Database(source);
  db.run("PRAGMA journal_mode=WAL");
  db.run("CREATE TABLE generation(id TEXT PRIMARY KEY, cost TEXT)");
  db.run("INSERT INTO generation VALUES ('generation-id','18.20')");
  const environment = {
    ...process.env,
    BACKUP_WORK_ROOT: directory,
    DATABASE_URL: "",
    MEDIA_ROOT: sourceMedia,
    PATH: `${binaries}:${process.env.PATH}`,
    RESTIC_PASSWORD_FILE: join(directory, "password"),
    RESTIC_REPOSITORY: "s3:fixture-only",
    RESTORE_CONFIRM: "EMPTY_DATABASE_AND_MEDIA",
    SQLITE_PATH: source,
    STUDIO_WRITERS_STOPPED: "yes",
    TEST_SNAPSHOT_ROOT: snapshot,
  };
  try {
    expect(await run("backup.sh", environment)).toEqual({ code: 0, error: "" });
    db.close();
    const restoreEnvironment = {
      ...environment,
      MEDIA_ROOT: targetMedia,
      SQLITE_PATH: target,
    };
    expect(await run("restore.sh", restoreEnvironment)).toEqual({
      code: 0,
      error: "",
    });
    const restored = new Database(target, { readonly: true });
    expect(restored.query("SELECT * FROM generation").all()).toEqual([
      { cost: "18.20", id: "generation-id" },
    ]);
    expect(restored.query("PRAGMA integrity_check").get()).toEqual({
      integrity_check: "ok",
    });
    restored.close();
    expect(readFileSync(join(targetMedia, "result.png"), "utf-8")).toBe(
      "generated-image-bytes"
    );
    const populatedMedia = await run("restore.sh", restoreEnvironment);
    expect(populatedMedia.code).toBe(1);
    const anotherMedia = join(directory, "empty-media");
    mkdirSync(anotherMedia);
    const populatedDatabase = await run("restore.sh", {
      ...restoreEnvironment,
      MEDIA_ROOT: anotherMedia,
    });
    expect(populatedDatabase.error).toContain("SQLite target must not exist");
    writeFileSync(
      join(snapshot, "snapshot", "manifest.txt"),
      "format=2\nbackend=postgres\n"
    );
    const wrongBackend = await run("restore.sh", {
      ...restoreEnvironment,
      MEDIA_ROOT: anotherMedia,
      SQLITE_PATH: join(directory, "another.sqlite"),
    });
    expect(wrongBackend.error).toContain("backend does not match");
  } finally {
    db.close();
    rmSync(directory, { force: true, recursive: true });
  }
});
