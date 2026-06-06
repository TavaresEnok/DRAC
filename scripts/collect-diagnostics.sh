#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="${DRAC_ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="${DRAC_ENV_FILE:-$ROOT_DIR/infra/.env}"
OUT_DIR="${DRAC_DIAGNOSTICS_DIR:-$ROOT_DIR/diagnostics}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK_DIR="$OUT_DIR/drac-diagnostics-$STAMP"
ARCHIVE="$OUT_DIR/drac-diagnostics-$STAMP.tar.gz"

log() {
  printf '[DRAC diagnostics] %s\n' "$*"
}

sanitize_env() {
  sed -E 's/^([A-Za-z0-9_]*(PASSWORD|SECRET|TOKEN|KEY|PASS)[A-Za-z0-9_]*=).*/\1<redacted>/I'
}

mkdir -p "$WORK_DIR"

log "Coletando estado do sistema"
{
  date -u
  uname -a
  uptime || true
  df -h || true
  free -h || true
} > "$WORK_DIR/host.txt" 2>&1

git -C "$ROOT_DIR" rev-parse HEAD > "$WORK_DIR/git-head.txt" 2>&1 || true
git -C "$ROOT_DIR" status --short > "$WORK_DIR/git-status.txt" 2>&1 || true

if [ -f "$ENV_FILE" ]; then
  sanitize_env < "$ENV_FILE" > "$WORK_DIR/env.sanitized"
  central_url="$(sed -n 's/^CLOUD_API_URL=//p' "$ENV_FILE" | tail -n 1 | tr -d '\r' | sed -E 's/^["'\"']|["'\"']$//g')"
  installation_id="$(sed -n 's/^CLOUD_INSTALLATION_ID=//p' "$ENV_FILE" | tail -n 1 | tr -d '\r' | sed -E 's/^["'\"']|["'\"']$//g')"
  license_key="$(sed -n 's/^CLOUD_LICENSE_KEY=//p' "$ENV_FILE" | tail -n 1 | tr -d '\r' | sed -E 's/^["'\"']|["'\"']$//g')"
  if [ -n "$central_url" ] && [ -n "$installation_id" ] && [ -n "$license_key" ]; then
    curl -fsS --max-time 10 \
      -H "X-DRAC-Installation-Id: $installation_id" \
      -H "X-DRAC-License-Key: $license_key" \
      "${central_url%/}/api/agent/status" > "$WORK_DIR/central-agent-status.json" 2>&1 || true
  fi
fi

docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' > "$WORK_DIR/docker-ps.txt" 2>&1 || true
docker stats --no-stream > "$WORK_DIR/docker-stats.txt" 2>&1 || true
docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/infra/docker-compose.yml" -f "$ROOT_DIR/infra/docker-compose.dev.yml" ps > "$WORK_DIR/docker-compose-ps.txt" 2>&1 || true

for name in vms-api vms-web vms-mediamtx vms-postgres vms-redis vms-postgres-backup vms-ai-service drac-central; do
  docker logs --tail=400 "$name" > "$WORK_DIR/$name.log" 2>&1 || true
done

curl -fsS --max-time 10 http://127.0.0.1:3000/health > "$WORK_DIR/api-health.json" 2>&1 || true
curl -fsS --max-time 10 http://127.0.0.1:9765/api/health > "$WORK_DIR/central-health.json" 2>&1 || true
curl -fsSI --max-time 10 http://127.0.0.1:5173/ > "$WORK_DIR/web-health.txt" 2>&1 || true

if [ -x "$ROOT_DIR/scripts/production-readiness.sh" ]; then
  "$ROOT_DIR/scripts/production-readiness.sh" > "$WORK_DIR/readiness.txt" 2>&1 || true
fi

if docker exec vms-postgres true >/dev/null 2>&1; then
  docker exec vms-postgres sh -lc '
    set -eu
    export PGPASSWORD="$POSTGRES_PASSWORD"
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*) from \"Camera\";"
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select status, count(*) from \"Camera\" group by status order by status;"
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*) from \"Recording\";"
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select key, value from \"SystemSetting\" where key like '\''cloud.%'\'' order by key;"
  ' > "$WORK_DIR/database-summary.txt" 2>&1 || true
fi

log "Compactando pacote"
tar -czf "$ARCHIVE" -C "$OUT_DIR" "$(basename "$WORK_DIR")"
rm -rf "$WORK_DIR"
log "Pacote gerado: $ARCHIVE"
