#!/usr/bin/env bash
set -euo pipefail

scheduler_database="${1:-}"
scheduler_restore_point="${2:-}"
scheduler_confirmation="${3:-}"

if [[ -z "${scheduler_database}" || -z "${scheduler_restore_point}" ]]; then
  echo "Uso: $0 <base-d1> <timestamp-rfc3339-o-bookmark> --confirm"
  exit 2
fi

if [[ "${scheduler_confirmation}" != "--confirm" ]]; then
  echo "Operación cancelada: agrega --confirm después de verificar el respaldo y el punto de restauración."
  exit 2
fi

echo "Creando respaldo previo a la recuperación..."
"$(dirname "$0")/db-backup.sh" "${scheduler_database}"

if [[ "${scheduler_restore_point}" == *T*Z ]]; then
  npx wrangler d1 time-travel restore "${scheduler_database}" \
    --timestamp "${scheduler_restore_point}"
else
  npx wrangler d1 time-travel restore "${scheduler_database}" \
    --bookmark "${scheduler_restore_point}"
fi
