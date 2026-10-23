#!/bin/sh
# Requires Docker Compose >= 2.24.4 (!override) and a built studio-app image.
set -eu
umask 077

case "${1:-}" in
  "") build_option= ;;
  --build) build_option=--build ;;
  *) echo "Usage: APP_IMAGE_TAG=<tag> $0 [--build]" >&2; exit 2 ;;
esac
if [ "$#" -gt 1 ]; then
  echo "Usage: APP_IMAGE_TAG=<tag> $0 [--build]" >&2; exit 2
fi

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
image_tag=${APP_IMAGE_TAG:-local}
owner_uid=$(id -u)
owner_gid=$(id -g)
scratch=$(mktemp -d /tmp/studio-persistence.XXXXXX)
project="studio-persistence-$(basename "$scratch" | tr '[:upper:].' '[:lower:]-')"
started=no

# Compose gives the caller's environment precedence over --env-file. Remove all
# application settings so a shell with production credentials cannot affect this test.
unset DATABASE_URL ROUTERAI_API_KEY BETTER_AUTH_SECRET BETTER_AUTH_URL
unset ADMIN_LOGIN ADMIN_PASSWORD ADMIN_EMAIL APP_IMAGE_TAG APP_DOMAIN APP_PORT
unset MEDIA_ROOT STORAGE_ROOT SQLITE_PATH QUOTE_MAXIMUM_MULTIPLIER
unset POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB ACME_EMAIL
unset RESTIC_REPOSITORY BACKUP_AWS_ACCESS_KEY_ID BACKUP_AWS_SECRET_ACCESS_KEY BACKUP_AWS_DEFAULT_REGION
unset COMPOSE_PROFILES

compose() {
  docker compose --env-file "$scratch/test.env" --project-name "$project" \
    -f "$project_dir/docker-compose.yml" -f "$scratch/override.yml" "$@"
}
cleanup() {
  result=$?
  trap - EXIT HUP INT TERM
  if [ "$started" = yes ]; then
    if [ "$result" -ne 0 ]; then
      compose logs --tail=25 web worker >&2 || true
    fi
    cleanup_ok=yes
    compose stop --timeout 20 web worker || cleanup_ok=no
    # media-init owns the bind contents as UID 1001; return them to the caller
    # before host removal, including when this check runs without sudo.
    compose run --rm --no-deps --entrypoint sh media-init -c \
      'chown -R "$1:$2" /data/media /app/storage /work' sh "$owner_uid" "$owner_gid" || cleanup_ok=no
    compose down --volumes --remove-orphans --timeout 20 || cleanup_ok=no
    if [ "$cleanup_ok" != yes ]; then
      echo "Cleanup failed; isolated test files remain at $scratch (project $project)." >&2
      exit 1
    fi
  fi
  rm -rf -- "$scratch"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' HUP TERM

mkdir "$scratch/storage" "$scratch/media" "$scratch/work"
cat > "$scratch/test.env" <<EOF
APP_IMAGE_TAG=$image_tag
DATABASE_URL=
ROUTERAI_API_KEY=fixture-routerai-key-never-used
BETTER_AUTH_SECRET=persistence-test-only-secret-at-least-32-characters
BETTER_AUTH_URL=http://localhost:3000
ADMIN_LOGIN=persistence_admin
ADMIN_PASSWORD=persistence-test-password-429
ADMIN_EMAIL=persistence-admin@example.invalid
APP_DOMAIN=example.invalid
MEDIA_ROOT=/data/media
EOF
cat > "$scratch/override.yml" <<EOF
services:
  media-init:
    volumes: !override
      - $scratch/media:/data/media
      - $scratch/storage:/app/storage
      - $scratch/work:/work
  web:
    ports: !override
      - "127.0.0.1::3000"
    volumes: !override
      - $scratch/media:/data/media
      - $scratch/storage:/app/storage
  worker:
    network_mode: none
    volumes: !override
      - $scratch/media:/data/media
      - $scratch/storage:/app/storage
EOF

compose config -q
started=yes
compose up -d --wait --wait-timeout 150 web worker

seed_script=$(cat <<'JS'
import { pool } from "./lib/db";
import { initLogging } from "./lib/logging";
initLogging("web");
try {
  await pool.query('INSERT INTO "user" (id,name,email,balance_rub,reserved_rub,activated_at) VALUES ($1,$2,$3,$4,$5,now())', ["persistence-user", "Persistence smoke", "persistence-member@example.invalid", "345.67", "0.00"]);
  await pool.query("INSERT INTO syntx_chats (id,user_id,title,tab) VALUES ($1,$2,$3,$4)", ["persistence-chat", "persistence-user", "Chat must survive recreation", "image"]);
  await pool.query("INSERT INTO transactions (id,user_id,amount_rub,balance_before_rub,balance_after_rub,type,reason,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", ["persistence-opening", "persistence-user", "345.67", "0.00", "345.67", "topup", "Persistence test opening", "persistence-opening"]);
  await Bun.write("/data/media/persistence-check.txt", "media-must-survive-recreation");
  console.info(JSON.stringify({event:"persistence.smoke_marker", marker:"logs-must-survive-recreation"}));
} finally {
  await pool.end();
}
JS
)
compose exec -T web bun -e "$seed_script"

snapshot_script=$(cat <<'JS'
import assert from "node:assert/strict";
import { Database } from "bun:sqlite";
const db = new Database(process.env.SQLITE_PATH, {readonly:true});
try {
  const member = db.query('SELECT id,balance_rub,reserved_rub FROM "user" WHERE id=?').get("persistence-user");
  assert.deepEqual(member, {id:"persistence-user",balance_rub:"345.67",reserved_rub:"0.00"});
  assert.equal(db.query("SELECT user_id FROM syntx_chats WHERE id=?").get("persistence-chat")?.user_id, "persistence-user");
  assert.equal(db.query("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.deepEqual(db.query("PRAGMA foreign_key_check").all(), []);
  for (const service of ["web", "worker", "startup"]) {
    assert.ok((await Bun.file(`/app/storage/logs/${service}.jsonl`).text()).trim(), `${service} log missing`);
  }
  assert.ok((await Bun.file("/app/storage/logs/web.jsonl").text()).includes("logs-must-survive-recreation"), "old log marker missing");
  assert.equal(await Bun.file("/data/media/persistence-check.txt").text(), "media-must-survive-recreation");
  console.log(JSON.stringify({
    users:db.query('SELECT id,balance_rub,reserved_rub FROM "user" ORDER BY id').all(),
    chats:db.query("SELECT * FROM syntx_chats ORDER BY id").all(),
    ledger:db.query("SELECT * FROM transactions ORDER BY id").all(),
    schema:db.query("SELECT * FROM studio_schema_migrations ORDER BY version").all()
  }));
} finally {
  db.close();
}
JS
)
baseline=$(compose exec -T web bun -e "$snapshot_script")
for cycle in 1 2; do
  echo "Recreation cycle $cycle/2 (isolated project $project)"
  if [ -n "$build_option" ]; then
    compose up -d --build --force-recreate --wait --wait-timeout 150 web worker
  else
    compose up -d --force-recreate --wait --wait-timeout 150 web worker
  fi
  compose exec -T web bun scripts/healthcheck.ts
  actual=$(compose exec -T web bun -e "$snapshot_script")
  if [ "$actual" != "$baseline" ]; then
    echo "Persistence check failed: database rows changed after recreation." >&2
    exit 1
  fi
done
echo "SQLite persistence passed: two recreations preserve wallets, chat, ledger, media, schema and old logs."
compose port web 3000
