#!/bin/bash
# Copy Unraid bind mounts from prod yuvomi → yuvomi-hnmz-dev.
# Does not modify the running prod container or /mnt/user/appdata/yuvomi in place.
set -euo pipefail

PROD_ROOT=/mnt/user/appdata/yuvomi
DEV_ROOT=/mnt/user/appdata/yuvomi-hnmz-dev
STAMP=$(date +%Y%m%d-%H%M%S)

if [ ! -d "$PROD_ROOT/data" ]; then
  echo "Prod appdata missing: $PROD_ROOT/data" >&2
  exit 1
fi

echo "=== stopping yuvomi-hnmz-dev (prod stays up) ==="
docker compose -f /mnt/user/yuvomi-hnmz/docker-compose.dev.yml stop yuvomi-hnmz-dev >/dev/null 2>&1 || docker stop yuvomi-hnmz-dev >/dev/null 2>&1 || true

mkdir -p "$DEV_ROOT/data" "$DEV_ROOT/backups" "$DEV_ROOT/documents" "$DEV_ROOT/modules"

if [ -f "$DEV_ROOT/data/yuvomi.db" ]; then
  echo "=== snapshot current dev data → $DEV_ROOT/data/.pre-copy-$STAMP ==="
  mkdir -p "$DEV_ROOT/data/.pre-copy-$STAMP"
  find "$DEV_ROOT/data" -maxdepth 1 -type f -exec cp -a {} "$DEV_ROOT/data/.pre-copy-$STAMP/" \;
fi

copy_tree() {
  local src="$1"
  local dst="$2"
  mkdir -p "$dst"
  rsync -a --delete --exclude '.pre-copy-*' "$src/" "$dst/"
}

echo "=== copying bind mounts (read-only from prod) ==="
copy_tree "$PROD_ROOT/data" "$DEV_ROOT/data"
copy_tree "$PROD_ROOT/backups" "$DEV_ROOT/backups"
copy_tree "$PROD_ROOT/documents" "$DEV_ROOT/documents"
copy_tree "$PROD_ROOT/modules" "$DEV_ROOT/modules"

chown -R 1000:1000 "$DEV_ROOT/data" "$DEV_ROOT/backups" "$DEV_ROOT/documents" "$DEV_ROOT/modules" || true

echo "=== copied ==="
du -sh "$DEV_ROOT"/data "$DEV_ROOT"/backups "$DEV_ROOT"/documents "$DEV_ROOT"/modules
ls -lah "$DEV_ROOT/data"
