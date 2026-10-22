#!/bin/sh
set -eu
umask 077

# This command intentionally refuses existing data. Use a separate empty Compose
# project for drills, or provision replacement volumes during disaster recovery.
if [ "${RESTORE_CONFIRM:-}" != "EMPTY_DATABASE_AND_MEDIA" ]; then
  echo "Set RESTORE_CONFIRM=EMPTY_DATABASE_AND_MEDIA after verifying the target." >&2
  exit 1
fi
test -s "${RESTIC_PASSWORD_FILE:?Missing restic password file}"
test -d /data/media
if [ -n "$(find /data/media -mindepth 1 -maxdepth 1 -print -quit)" ]; then
  echo "Media target is not empty." >&2; exit 1
fi
table_count=$(psql -X -A -t -v ON_ERROR_STOP=1 -c "select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema') and table_type='BASE TABLE'")
if [ "$table_count" != "0" ]; then
  echo "Database target is not empty." >&2; exit 1
fi

restore_dir=$(mktemp -d /work/studio-restore.XXXXXX)
trap 'rm -rf "$restore_dir"' EXIT HUP INT TERM
restic restore "${1:-latest}" --host studio --tag production --target "$restore_dir"
dump_file=$(find "$restore_dir" -type f -name database.dump)
if [ -z "$dump_file" ] || [ "$(printf '%s\n' "$dump_file" | wc -l)" != "1" ]; then
  echo "Expected exactly one database dump in snapshot." >&2; exit 1
fi
snapshot_dir=$(dirname "$dump_file")
test -s "$snapshot_dir/manifest.txt"
test -f "$snapshot_dir/media.tar.gz"
pg_restore --exit-on-error --single-transaction --no-owner --no-acl --dbname="$PGDATABASE" "$dump_file"
tar -xzf "$snapshot_dir/media.tar.gz" -C /data/media --no-same-owner
echo "Restore completed. Keep writers stopped until permissions and acceptance checks pass."
