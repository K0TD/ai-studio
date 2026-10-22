#!/bin/sh
set -eu
umask 077

# Refuse a repository on this VPS: backups must survive losing the host.
case "${RESTIC_REPOSITORY:-}" in
  s3:*|sftp:*|rest:https://*|b2:*|gs:*|azure:*) ;;
  *) echo "RESTIC_REPOSITORY must point to an external encrypted repository." >&2; exit 1 ;;
esac
test -s "${RESTIC_PASSWORD_FILE:?Missing restic password file}"
test -d /data/media

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

snapshot_dir=$(mktemp -d /work/studio-backup.XXXXXX)
trap 'rm -rf "$snapshot_dir"' EXIT HUP INT TERM
pg_dump --format=custom --no-owner --no-acl --file="$snapshot_dir/database.dump"
tar -czf "$snapshot_dir/media.tar.gz" -C /data/media .
printf 'format=1\ncreated_at=%s\npostgres_major=16\n' "$(date -u +%FT%TZ)" > "$snapshot_dir/manifest.txt"
restic backup --host studio --tag production "$snapshot_dir"
# The temporary source path changes each time; keep-group must not include paths.
restic forget --host studio --tag production --group-by host,tags --keep-within 30d --prune
restic check
