#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="${DRAC_ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="${DRAC_ENV_FILE:-$ROOT_DIR/infra/.env}"
BRANCH="${DRAC_UPDATE_BRANCH:-main}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$ROOT_DIR/infra/backups/update-$STAMP"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/infra/docker-compose.yml" -f "$ROOT_DIR/infra/docker-compose.dev.yml")
BEFORE_COMMIT=""
ROLLBACK_NEEDED=false
ROLLBACK_IN_PROGRESS=false

log() {
  printf '[DRAC update] %s\n' "$*"
}

fail() {
  printf '[DRAC update][ERRO] %s\n' "$*" >&2
  rollback "falha: $*" || true
  exit 1
}

require_file() {
  [ -f "$1" ] || fail "Arquivo obrigatorio nao encontrado: $1"
}

rollback() {
  local reason="${1:-erro desconhecido}"
  if [ "$ROLLBACK_NEEDED" != "true" ] || [ "$ROLLBACK_IN_PROGRESS" = "true" ]; then
    return 0
  fi
  ROLLBACK_IN_PROGRESS=true
  printf '[DRAC update] Rollback automatico iniciado (%s)\n' "$reason" >&2

  if [ -n "$BEFORE_COMMIT" ]; then
    git -C "$ROOT_DIR" reset --hard "$BEFORE_COMMIT" >/dev/null 2>&1 || true
  fi

  if [ -f "$BACKUP_DIR/env.snapshot" ]; then
    cp "$BACKUP_DIR/env.snapshot" "$ENV_FILE" || true
    chmod 600 "$ENV_FILE" || true
  fi

  if [ -s "$BACKUP_DIR/postgres-before.dump" ] && docker inspect vms-postgres >/dev/null 2>&1; then
    printf '[DRAC update] Restaurando banco do ponto de seguranca\n' >&2
    docker cp "$BACKUP_DIR/postgres-before.dump" vms-postgres:/tmp/drac-update-rollback.dump >/dev/null 2>&1 || true
    docker exec vms-postgres sh -lc '
      set -eu
      export PGPASSWORD="$POSTGRES_PASSWORD"
      pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner /tmp/drac-update-rollback.dump
      rm -f /tmp/drac-update-rollback.dump
    ' >/dev/null 2>&1 || true
  fi

  "${COMPOSE[@]}" build api web >/dev/null 2>&1 || true
  "${COMPOSE[@]}" up -d api web >/dev/null 2>&1 || true
  printf '[DRAC update] Rollback finalizado. Ponto de seguranca: %s\n' "$BACKUP_DIR" >&2
}

on_error() {
  local status=$?
  local line="${1:-?}"
  rollback "erro na linha $line"
  exit "$status"
}

trap 'on_error $LINENO' ERR

require_file "$ENV_FILE"
mkdir -p "$BACKUP_DIR"

if [ "${DRAC_UPDATE_ALLOW_DIRTY:-false}" != "true" ] && [ -n "$(git -C "$ROOT_DIR" status --porcelain)" ]; then
  fail "Repositorio possui alteracoes locais. Faça commit/stash ou use DRAC_UPDATE_ALLOW_DIRTY=true conscientemente."
fi

log "Gerando ponto de seguranca em $BACKUP_DIR"
cp "$ENV_FILE" "$BACKUP_DIR/env.snapshot"
BEFORE_COMMIT="$(git -C "$ROOT_DIR" rev-parse HEAD)"
printf '%s\n' "$BEFORE_COMMIT" > "$BACKUP_DIR/git-before.txt"
git -C "$ROOT_DIR" status --short > "$BACKUP_DIR/git-status-before.txt"

if "${COMPOSE[@]}" ps postgres >/dev/null 2>&1; then
  log "Gerando backup rapido do banco"
  set +e
  docker exec vms-postgres sh -lc 'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BACKUP_DIR/postgres-before.dump"
  dump_status=$?
  set -e
  if [ "$dump_status" -ne 0 ] || [ ! -s "$BACKUP_DIR/postgres-before.dump" ]; then
    rm -f "$BACKUP_DIR/postgres-before.dump"
    fail "Falha ao gerar backup do banco antes da atualizacao"
  fi
fi

log "Atualizando codigo pela branch $BRANCH"
ROLLBACK_NEEDED=true
git -C "$ROOT_DIR" fetch origin "$BRANCH"
git -C "$ROOT_DIR" merge --ff-only "origin/$BRANCH"

log "Recriando API e Web"
"${COMPOSE[@]}" build api web
"${COMPOSE[@]}" up -d api web

log "Aplicando migracoes"
"${COMPOSE[@]}" exec -T -w /app/apps/api api npx prisma migrate deploy

log "Validando healthchecks"
curl -fsS --max-time 15 http://127.0.0.1:3000/health >/dev/null
curl -fsSI --max-time 15 http://127.0.0.1:5173/ >/dev/null

if [ -x "$ROOT_DIR/scripts/production-readiness.sh" ]; then
  log "Executando readiness"
  set +e
  "$ROOT_DIR/scripts/production-readiness.sh"
  readiness_status=$?
  set -e
  if [ "$readiness_status" -ge 2 ]; then
    fail "Readiness bloqueado apos atualizacao. Backup em $BACKUP_DIR"
  fi
fi

git -C "$ROOT_DIR" rev-parse HEAD > "$BACKUP_DIR/git-after.txt"
ROLLBACK_NEEDED=false
log "Atualizacao concluida. Ponto de seguranca: $BACKUP_DIR"
