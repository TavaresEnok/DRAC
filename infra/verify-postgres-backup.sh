#!/bin/sh
set -eu

interval="${POSTGRES_BACKUP_VERIFY_INTERVAL_SECONDS:-86400}"
initial_delay="${POSTGRES_BACKUP_VERIFY_INITIAL_DELAY_SECONDS:-900}"
verify_db="${POSTGRES_BACKUP_VERIFY_DB:-vms_restore_verify}"

export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

cleanup() {
  dropdb --if-exists --force -h postgres -U "$POSTGRES_USER" "$verify_db" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

sleep "$initial_delay"
while true; do
  latest="$(find /backups -maxdepth 1 -type f -name 'drac-postgres-*.dump' -print | sort | tail -n 1)"
  if [ -z "$latest" ]; then
    echo "$(date -u +%FT%TZ) backup_verify=no_dump"
  else
    cleanup
    pg_restore --list "$latest" >/dev/null
    createdb -h postgres -U "$POSTGRES_USER" "$verify_db"
    pg_restore --exit-on-error --no-owner --no-privileges \
      -h postgres -U "$POSTGRES_USER" -d "$verify_db" "$latest" >/dev/null
    migrations="$(psql -h postgres -U "$POSTGRES_USER" -d "$verify_db" -Atc \
      "select count(*) from \"_prisma_migrations\" where finished_at is not null" 2>/dev/null || printf '0')"
    cleanup
    echo "$(date -u +%FT%TZ) backup_restore_verify=ok file=$(basename "$latest") migrations=$migrations"
  fi
  sleep "$interval"
done
