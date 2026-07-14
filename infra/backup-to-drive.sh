#!/usr/bin/env bash
# Backup OFFSITE para um remote rclone (ex.: Google Drive) — CÓDIGO + CONFIGS +
# CHAVES + BANCO. NÃO inclui vídeo (gravações), por design (Drive pequeno).
#
# Configure o remote uma vez com `rclone config` (ver instruções) e ajuste:
#   DRIVE_BACKUP_REMOTE=gdrive:drac-backup   (remote:pasta)
#
# Roda 1x por execução; agende no cron. Envia um diretório datado e mantém os
# últimos DRIVE_BACKUP_KEEP no remote.
set -euo pipefail

REMOTE="${DRIVE_BACKUP_REMOTE:-gdrive:drac-backup}"
REPO="${DRAC_REPO:-/home/flashnet/Drac}"
KEEP="${DRIVE_BACKUP_KEEP:-14}"
KEYSTORE_DIR="${KEYSTORE_DIR:-$HOME/toolchain/keystores}"
CENTRAL_DATA="${CENTRAL_DATA_DIR:-/home/flashnet/drac-central/data}"
NGINX_CONF="${NGINX_CONF:-/etc/nginx/sites-available/ajustcam}"

ts="$(date -u +%Y%m%dT%H%M%SZ)"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

# 1) CÓDIGO — git bundle carrega TODO o histórico num único arquivo (melhor que
#    tar do working tree; reconstrói o repo com `git clone drac-code.bundle`).
if git -C "$REPO" rev-parse --git-dir >/dev/null 2>&1; then
  git -C "$REPO" bundle create "$stage/drac-code-$ts.bundle" --all
fi

# 2) CONFIGS sensíveis que ficam FORA do git (.env com segredos, nginx, mediamtx)
tmpcfg="$stage/drac-configs-$ts.tar.gz"
tar -czf "$tmpcfg" \
  $( [ -f "$REPO/infra/.env" ] && echo "-C $REPO/infra .env" ) 2>/dev/null || true
# Anexa outros arquivos de config úteis (best-effort, cada um se existir).
for extra in "$REPO/infra/mediamtx.yml" "$REPO/infra/.env.prod.example" "$NGINX_CONF"; do
  [ -f "$extra" ] && tar -rf "${tmpcfg%.gz}" -C "$(dirname "$extra")" "$(basename "$extra")" 2>/dev/null || true
done
[ -f "${tmpcfg%.gz}" ] && gzip -f "${tmpcfg%.gz}" 2>/dev/null || true

# 3) KEYSTORES — CRÍTICO (upload keys da Play; ver aviso no backup-keystores.sh)
if [ -d "$KEYSTORE_DIR" ] && [ -n "$(ls -A "$KEYSTORE_DIR" 2>/dev/null)" ]; then
  tar -czf "$stage/keystores-$ts.tar.gz" -C "$(dirname "$KEYSTORE_DIR")" "$(basename "$KEYSTORE_DIR")"
fi

# 4) BANCO — o dump mais recente do Postgres + dados da Central (pequenos)
latest_db="$(find "$REPO/infra/backups/postgres" -maxdepth 1 -name 'drac-postgres-*.dump' 2>/dev/null | sort | tail -1 || true)"
[ -n "$latest_db" ] && cp "$latest_db" "$stage/"
[ -d "$CENTRAL_DATA" ] && tar -czf "$stage/drac-central-$ts.tar.gz" -C "$CENTRAL_DATA" .

# Envia (copy, não sync — nunca apaga no remote por exclusão local)
rclone copy "$stage" "$REMOTE/$ts" --checksum --log-level INFO

# Retenção no remote: mantém as últimas KEEP pastas datadas.
mapfile -t folders < <(rclone lsf "$REMOTE" --dirs-only 2>/dev/null | sed 's#/$##' | sort)
if [ "${#folders[@]}" -gt "$KEEP" ]; then
  to_del=$(( ${#folders[@]} - KEEP ))
  for ((i=0; i<to_del; i++)); do
    rclone purge "$REMOTE/${folders[$i]}" 2>/dev/null || true
  done
fi

echo "$(date -u +%FT%TZ) drive_backup=ok remote=$REMOTE/$ts (sem vídeo)"
