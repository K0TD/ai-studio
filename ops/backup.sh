#!/bin/sh
set -eu
umask 077

# Refuse a repository on this VPS: backups must survive losing the host.
case "${RESTIC_REPOSITORY:-}" in
  s3:*|sftp:*|rest:https://*|b2:*|gs:*|azure:*) ;;
  *) echo "RESTIC_REPOSITORY must point to an external encrypted repository." >&2; exit 1 ;;
esac
test -s "${RESTIC_PASSWORD_FILE:?Missing restic password file}"
media_root=${MEDIA_ROOT:-/data/media}
test -d "$media_root"

if [ "${1:-}" = "init" ]; then
  exec restic init
fi
if [ "${1:-}" = "check" ]; then
  exec restic check --read-data
fi
if [ "${STUDIO_WRITERS_STOPPED:-}" != "yes" ]; then
  echo "Stop web and worker first; invoke ops/backup-host.sh." >&2
  exit 1
fi

snapshot_dir=$(mktemp -d "${BACKUP_WORK_ROOT:-/work}/studio-backup.XXXXXX")
trap 'rm -rf "$snapshot_dir"' EXIT HUP INT TERM
case "${DATABASE_URL:-}" in
  postgres://*|postgresql://*)
    backend=postgres
    pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-acl --file="$snapshot_dir/database.dump"
    ;;
  "")
    backend=sqlite
    sqlite_path=${SQLITE_PATH:-/app/storage/database/studio.sqlite}
    test -s "$sqlite_path"
    # SQLite's backup API includes committed WAL data without copying live sidecars.
    sqlite3 -readonly "$sqlite_path" ".backup '$snapshot_dir/database.sqlite'"
    test "$(sqlite3 -readonly "$snapshot_dir/database.sqlite" 'PRAGMA integrity_check;')" = "ok"
    test -z "$(sqlite3 -readonly "$snapshot_dir/database.sqlite" 'PRAGMA foreign_key_check;')"
    ;;
  *) echo "Unsupported DATABASE_URL scheme." >&2; exit 1 ;;
esac
tar -czf "$snapshot_dir/media.tar.gz" -C "$media_root" .
printf 'format=2\ncreated_at=%s\nbackend=%s\n' "$(date -u +%FT%TZ)" "$backend" > "$snapshot_dir/manifest.txt"
restic backup --host studio --tag production "$snapshot_dir"
# The temporary source path changes each time; keep-group must not include paths.
restic forget --host studio --tag production --group-by host,tags --keep-within 30d --prune
restic check
