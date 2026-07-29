#!/bin/bash
# Prepare .env + appdata and start yuvomi-hnmz-dev (hot reload) on Unraid.
# Safe: does not touch prod container Yuvomi / port 3007 / appdata/yuvomi.
set -euo pipefail
cd /mnt/user/yuvomi-hnmz

if [ ! -f .env ]; then
  cp .env.example .env
fi

SESSION_SECRET="$(openssl rand -hex 32)"

set_env() {
  local key="$1"
  local val="$2"
  if grep -qE "^${key}=" .env; then
    # Escape & \ for sed replacement
    local esc
    esc=$(printf '%s' "$val" | sed 's/[&\\]/\\&/g')
    sed -i "s|^${key}=.*|${key}=${esc}|" .env
  else
    printf '%s=%s\n' "$key" "$val" >> .env
  fi
}

set_env OIKOS_HTTP_PORT 3008
set_env SESSION_SECRET "$SESSION_SECRET"
set_env DB_ENCRYPTION_KEY ""
set_env NODE_ENV development
set_env SESSION_SECURE false
set_env TRUST_PROXY loopback
set_env TZ Europe/Paris

echo "Updated .env for hot-reload (port 3008, empty DB_ENCRYPTION_KEY)"

mkdir -p /mnt/user/appdata/yuvomi-hnmz-dev/data \
         /mnt/user/appdata/yuvomi-hnmz-dev/backups \
         /mnt/user/appdata/yuvomi-hnmz-dev/documents

echo "=== prod before (must stay Up on :3007) ==="
docker ps --filter name=^Yuvomi$ --format '{{.Names}} {{.Status}} {{.Ports}}'

echo "=== building / starting yuvomi-hnmz-dev ==="
docker compose -f docker-compose.dev.yml up -d --build

echo "=== status ==="
docker ps --filter name=yuvomi-hnmz-dev --format '{{.Names}} {{.Status}} {{.Ports}}'
docker ps --filter name=^Yuvomi$ --format '{{.Names}} {{.Status}} {{.Ports}}'
