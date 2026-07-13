#!/bin/sh
set -eu

remote="${OFFSITE_BACKUP_REMOTE:-}"
interval="${OFFSITE_BACKUP_INTERVAL_SECONDS:-86400}"
include_recordings="${OFFSITE_INCLUDE_RECORDINGS:-false}"

if [ -z "$remote" ]; then
  echo "OFFSITE_BACKUP_REMOTE não configurado; defina, por exemplo, s3-drac:cliente-flashnet" >&2
  exit 2
fi

while true; do
  started="$(date -u +%FT%TZ)"
  rclone copy /data/backups "$remote/database" \
    --checksum --transfers "${OFFSITE_BACKUP_TRANSFERS:-4}" \
    --checkers "${OFFSITE_BACKUP_CHECKERS:-8}" --log-level INFO
  if [ -d /data/keystores ]; then
    rclone copy /data/keystores "$remote/keystores" \
      --checksum --transfers "${OFFSITE_BACKUP_TRANSFERS:-4}" \
      --checkers "${OFFSITE_BACKUP_CHECKERS:-8}" --log-level INFO
  fi
  if [ "$include_recordings" = "true" ]; then
    # copy (não sync) evita que uma exclusão local remova evidência já enviada.
    # Imutabilidade/WORM deve ser habilitada também no bucket/provedor remoto.
    rclone copy /data/storage "$remote/recordings" \
      --checksum --transfers "${OFFSITE_BACKUP_TRANSFERS:-4}" \
      --checkers "${OFFSITE_BACKUP_CHECKERS:-8}" --log-level INFO
  fi
  echo "$started offsite_backup=ok remote=$remote recordings=$include_recordings"
  sleep "$interval"
done
