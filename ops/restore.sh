#!/bin/sh
set -eu
umask 077

# This command intentionally refuses existing data. Use a separate empty Compose
# project for drills, or provision replacement volumes during disaster recovery.
if [ "${RESTORE_CONFIRM:-}" != "EMPTY_DATABASE_AND_MEDIA" ]; then
  echo "Set RESTORE_CONFIRM=EMPTY_DATABASE_AND_MEDIA after verifying the target." >&2
  exit 1
fi
if [ "${STUDIO_WRITERS_STOPPED:-}" != "yes" ]; then
  echo "Stop web and worker before restoring." >&2; exit 1
fi
test -s "${RESTIC_PASSWORD_FILE:?Missing restic password file}"
media_root=${MEDIA_ROOT:-/app/storage/generation}
test -d "$media_root"
if [ -n "$(find "$media_root" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
  echo "Media target is not empty." >&2; exit 1
fi
case "${DATABASE_URL:-}" in
  postgres://*|postgresql://*)
    backend=postgres
    table_count=$(psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema') and table_type='BASE TABLE'")
    if [ "$table_count" != "0" ]; then
      echo "Database target is not empty." >&2; exit 1
    fi
    ;;
  "")
    backend=sqlite
    sqlite_path=${SQLITE_PATH:-/app/storage/database/studio.sqlite}
    if [ -e "$sqlite_path" ] || [ -e "$sqlite_path-wal" ] || [ -e "$sqlite_path-shm" ]; then
      echo "SQLite target must not exist, including WAL/SHM files." >&2; exit 1
    fi
    ;;
  *) echo "Unsupported DATABASE_URL scheme." >&2; exit 1 ;;
esac

restore_dir=$(mktemp -d "${BACKUP_WORK_ROOT:-/work}/studio-restore.XXXXXX")
trap 'rm -rf "$restore_dir"' EXIT HUP INT TERM
restic restore "${1:-latest}" --host studio --tag production --target "$restore_dir"
manifest=$(find "$restore_dir" -type f -name manifest.txt)
if [ -z "$manifest" ] || [ "$(printf '%s\n' "$manifest" | wc -l)" != "1" ]; then
  echo "Expected exactly one manifest in snapshot." >&2; exit 1
fi
snapshot_dir=$(dirname "$manifest")
# Never source an archive's manifest as shell code. Format 1 was PostgreSQL-only.
if grep -qx 'format=1' "$manifest"; then
  snapshot_backend=postgres
elif grep -qx 'format=2' "$manifest"; then
  snapshot_backend=$(sed -n 's/^backend=//p' "$manifest")
else
  echo "Unsupported snapshot format." >&2; exit 1
fi
if [ "$snapshot_backend" != "$backend" ]; then
  echo "Snapshot database backend does not match the target." >&2; exit 1
fi
test -f "$snapshot_dir/media.tar.gz"
if [ "$backend" = "postgres" ]; then
  test -s "$snapshot_dir/database.dump"
  pg_restore --exit-on-error --single-transaction --no-owner --no-acl --dbname="$DATABASE_URL" "$snapshot_dir/database.dump"
else
  test -s "$snapshot_dir/database.sqlite"
  test "$(sqlite3 -readonly "$snapshot_dir/database.sqlite" 'PRAGMA integrity_check;')" = "ok"
  test -z "$(sqlite3 -readonly "$snapshot_dir/database.sqlite" 'PRAGMA foreign_key_check;')"
  mkdir -p "$(dirname "$sqlite_path")"
  # Publish a fully verified database only; the target was required to be absent.
  cp "$snapshot_dir/database.sqlite" "$sqlite_path"
  chmod 0600 "$sqlite_path"
fi
tar -xzf "$snapshot_dir/media.tar.gz" -C "$media_root" --no-same-owner
echo "Restore completed. Keep writers stopped until permissions and acceptance checks pass."
