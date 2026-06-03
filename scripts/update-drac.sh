#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="${DRAC_ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="${DRAC_ENV_FILE:-$ROOT_DIR/infra/.env}"
BRANCH="${DRAC_UPDATE_BRANCH:-main}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$ROOT_DIR/infra/backups/update-$STAMP"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/infra/docker-compose.yml" -f "$ROOT_DIR/infra/docker-compose.dev.yml")

log() {
  printf '[DRAC update] %s\n' "$*"
}

fail() {
  printf '[DRAC update][ERRO] %s\n' "$*" >&2
  exit 1
}

require_file() {
  [ -f "$1" ] || fail "Arquivo obrigatorio nao encontrado: $1"
}

require_file "$ENV_FILE"
mkdir -p "$BACKUP_DIR"

log "Gerando ponto de seguranca em $BACKUP_DIR"
cp "$ENV_FILE" "$BACKUP_DIR/env.snapshot"
git -C "$ROOT_DIR" rev-parse HEAD > "$BACKUP_DIR/git-before.txt"
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
log "Atualizacao concluida. Ponto de seguranca: $BACKUP_DIR"
