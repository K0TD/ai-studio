#!/bin/sh
set -eu
# Run from cron using the repository root; never enable shell tracing here.
project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_dir"
# Prevent overlapping cron jobs and deploy/backup operators using this lock.
exec 9>/tmp/studio-backup.lock
flock -n 9 || { echo "Another studio backup is running." >&2; exit 1; }
docker compose stop web worker
trap 'docker compose start web worker' EXIT HUP INT TERM
docker compose --profile ops run --rm --no-deps -e STUDIO_WRITERS_STOPPED=yes backup
