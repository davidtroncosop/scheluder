#!/usr/bin/env bash
set -euo pipefail

scheduler_database="${1:-scheduler-pro-db}"
scheduler_backup_root="${SCHEDULER_BACKUP_DIR:-.backups/d1}"
scheduler_backup_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
scheduler_backup_file="${scheduler_backup_root}/${scheduler_database}-${scheduler_backup_stamp}.sql"

mkdir -p "${scheduler_backup_root}"
npx wrangler d1 export "${scheduler_database}" \
  --remote \
  --skip-confirmation \
  --output "${scheduler_backup_file}"

echo "Backup: ${scheduler_backup_file}"
shasum -a 256 "${scheduler_backup_file}"
