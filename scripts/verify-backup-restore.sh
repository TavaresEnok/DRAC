#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="${DRAC_ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="${DRAC_ENV_FILE:-$ROOT_DIR/infra/.env}"
BACKUP_FILE="${1:-}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
VERIFY_DB="${DRAC_RESTORE_VERIFY_DB:-drac_restore_verify_$STAMP}"

log() {
  printf '[DRAC restore-check] %s\n' "$*"
}

fail() {
  printf '[DRAC restore-check][ERRO] %s\n' "$*" >&2
  exit 1
}

load_env() {
  [ -f "$ENV_FILE" ] || fail "infra/.env nao encontrado em $ENV_FILE"
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in
      ''|\#*) continue ;;
    esac
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      local key="${BASH_REMATCH[1]}"
      local value="${BASH_REMATCH[2]}"
      if [[ "$value" =~ ^\"(.*)\"$ ]] || [[ "$value" =~ ^\'(.*)\'$ ]]; then
        value="${BASH_REMATCH[1]}"
      fi
      export "$key=$value"
    fi
  done < "$ENV_FILE"
}

psql_postgres() {
  docker exec -e PGPASSWORD="${POSTGRES_PASSWORD:-}" vms-postgres \
    psql -U "${POSTGRES_USER:-vms}" -d postgres "$@"
}

psql_verify() {
  docker exec -e PGPASSWORD="${POSTGRES_PASSWORD:-}" vms-postgres \
    psql -U "${POSTGRES_USER:-vms}" -d "$VERIFY_DB" "$@"
}

cleanup() {
  set +e
  docker exec vms-postgres rm -f /tmp/drac-restore-verify.dump >/dev/null 2>&1
  psql_postgres -v ON_ERROR_STOP=1 -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$VERIFY_DB';" >/dev/null 2>&1
  psql_postgres -v ON_ERROR_STOP=1 -c "drop database if exists \"$VERIFY_DB\";" >/dev/null 2>&1
}

load_env

if [ -z "$BACKUP_FILE" ]; then
  BACKUP_FILE="$(find "$ROOT_DIR/infra/backups/postgres" -type f -name 'drac-postgres-*.dump' -printf '%T@ %p\n' 2>/dev/null | sort -nr | awk 'NR==1 {print $2}')"
fi

[ -n "$BACKUP_FILE" ] || fail "Nenhum dump encontrado em infra/backups/postgres"
[ -f "$BACKUP_FILE" ] || fail "Dump nao encontrado: $BACKUP_FILE"
docker inspect vms-postgres >/dev/null 2>&1 || fail "Container vms-postgres nao encontrado"

trap cleanup EXIT

log "Validando dump: $BACKUP_FILE"
cleanup

psql_postgres -v ON_ERROR_STOP=1 -c "create database \"$VERIFY_DB\";" >/dev/null
docker cp "$BACKUP_FILE" vms-postgres:/tmp/drac-restore-verify.dump

log "Restaurando em banco temporario $VERIFY_DB"
docker exec -e PGPASSWORD="${POSTGRES_PASSWORD:-}" vms-postgres \
  pg_restore -U "${POSTGRES_USER:-vms}" -d "$VERIFY_DB" --no-owner --no-privileges /tmp/drac-restore-verify.dump >/dev/null

log "Conferindo schema restaurado"
psql_verify -v ON_ERROR_STOP=1 -Atc 'select count(*) from "Camera";' >/dev/null
psql_verify -v ON_ERROR_STOP=1 -Atc 'select count(*) from "User";' >/dev/null

camera_count="$(psql_verify -v ON_ERROR_STOP=1 -Atc 'select count(*) from "Camera";' | head -n 1)"
user_count="$(psql_verify -v ON_ERROR_STOP=1 -Atc 'select count(*) from "User";' | head -n 1)"

log "Restore temporario OK: cameras=$camera_count usuarios=$user_count banco=$VERIFY_DB"
