#!/usr/bin/env bash
# Backup das KEYSTORES white-label (as "upload keys" da Google Play Store).
# Perder essas chaves = NUNCA MAIS conseguir atualizar os apps já publicados.
#
# Faz um .tar.gz por execução, mantém os últimos 30 e registra em log.
#
# ⚠️ IMPORTANTE: backup no MESMO disco não protege contra falha de disco.
# Copie os .tar.gz gerados PARA FORA do servidor (Google Drive, HD externo,
# outro servidor). Este script só garante uma cópia local versionada.
set -euo pipefail

SRC="${KEYSTORE_DIR:-$HOME/toolchain/keystores}"
DEST="${KEYSTORE_BACKUP_DIR:-$HOME/keystore-backups}"
KEEP="${KEYSTORE_BACKUP_KEEP:-30}"

mkdir -p "$DEST"
if [[ ! -d "$SRC" ]] || [[ -z "$(ls -A "$SRC" 2>/dev/null)" ]]; then
  echo "$(date -u +%FT%TZ) nada a fazer: sem keystores em $SRC"
  exit 0
fi

ts="$(date -u +%Y%m%dT%H%M%SZ)"
out="$DEST/keystores-$ts.tar.gz"
tar -czf "$out" -C "$(dirname "$SRC")" "$(basename "$SRC")"
chmod 600 "$out"

# Mantém só os KEEP mais recentes.
ls -1t "$DEST"/keystores-*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f

echo "$(date -u +%FT%TZ) backup ok: $out ($(du -h "$out" | cut -f1))"
