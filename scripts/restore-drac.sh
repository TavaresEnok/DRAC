#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="${DRAC_ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="${DRAC_ENV_FILE:-$ROOT_DIR/infra/.env}"
BACKUP_FILE="${1:-}"
STORAGE_ARCHIVE="${2:-}"
YES="${DRAC_RESTORE_YES:-false}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/infra/docker-compose.yml" -f "$ROOT_DIR/infra/docker-compose.dev.yml")

log() {
  printf '[DRAC restore] %s\n' "$*"
}

fail() {
  printf '[DRAC restore][ERRO] %s\n' "$*" >&2
  exit 1
}

if [ -z "$BACKUP_FILE" ]; then
  BACKUP_FILE="$(find "$ROOT_DIR/infra/backups/postgres" -type f -name 'drac-postgres-*.dump' -printf '%T@ %p\n' 2>/dev/null | sort -nr | awk 'NR==1 {print $2}')"
fi

[ -n "$BACKUP_FILE" ] || fail "Informe o dump do Postgres ou mantenha backups em infra/backups/postgres"
[ -f "$BACKUP_FILE" ] || fail "Dump nao encontrado: $BACKUP_FILE"
[ -f "$ENV_FILE" ] || fail "infra/.env nao encontrado"

if [ "$YES" != "true" ] && [ "${3:-}" != "--yes" ]; then
  printf 'Esta operacao restaura o banco e pode sobrescrever dados atuais.\n'
  printf 'Use DRAC_RESTORE_YES=true ou passe --yes como terceiro argumento para executar.\n'
  exit 2
fi

log "Parando servicos de aplicacao"
"${COMPOSE[@]}" stop api web >/dev/null || true

log "Restaurando banco a partir de $BACKUP_FILE"
docker cp "$BACKUP_FILE" vms-postgres:/tmp/drac-restore.dump
docker exec vms-postgres sh -lc '
  set -eu
  export PGPASSWORD="$POSTGRES_PASSWORD"
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner /tmp/drac-restore.dump
  rm -f /tmp/drac-restore.dump
'

if [ -n "$STORAGE_ARCHIVE" ]; then
  [ -f "$STORAGE_ARCHIVE" ] || fail "Arquivo de storage nao encontrado: $STORAGE_ARCHIVE"
  log "Restaurando storage a partir de $STORAGE_ARCHIVE"
  mkdir -p "$ROOT_DIR/infra/storage"
  tar -xf "$STORAGE_ARCHIVE" -C "$ROOT_DIR/infra/storage"
fi

log "Subindo servicos"
"${COMPOSE[@]}" up -d api web postgres redis mediamtx postgres-backup

log "Validando API e Web"
curl -fsS --max-time 20 http://127.0.0.1:3000/health >/dev/null
curl -fsSI --max-time 20 http://127.0.0.1:5173/ >/dev/null

if [ -x "$ROOT_DIR/scripts/production-readiness.sh" ]; then
  "$ROOT_DIR/scripts/production-readiness.sh" || true
fi

log "Restore concluido"
