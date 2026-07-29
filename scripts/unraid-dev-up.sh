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
    local esc
    esc=$(printf '%s' "$val" | sed 's/[&\\]/\\&/g')
    sed -i "s|^${key}=.*|${key}=${esc}|" .env
  else
    printf '%s=%s\n' "$key" "$val" >> .env
  fi
}

# Always pin non-secret runtime values for the isolated dev instance.
set_env OIKOS_HTTP_PORT 3008
set_env DB_ENCRYPTION_KEY ""
set_env NODE_ENV development
set_env SESSION_SECURE false
set_env TRUST_PROXY loopback
set_env TZ Europe/Paris

# Generate SESSION_SECRET only when still a placeholder / empty.
if grep -qE '^SESSION_SECRET=(REPLACE_WITH_A_LONG_RANDOM_STRING)?$' .env; then
  set_env SESSION_SECRET "$SESSION_SECRET"
fi

echo "Updated .env for hot-reload (port 3008, empty DB_ENCRYPTION_KEY)"

mkdir -p /mnt/user/appdata/yuvomi-hnmz-dev/data \
         /mnt/user/appdata/yuvomi-hnmz-dev/backups \
         /mnt/user/appdata/yuvomi-hnmz-dev/documents

echo "=== prod before (must stay Up on :3007) ==="
docker ps --filter name=^Yuvomi$ --format '{{.Names}} {{.Status}} {{.Ports}}'

echo "=== building / starting yuvomi-hnmz-dev ==="
# Unraid compose/buildx combo rejects `compose ... --build`; build image first.
docker build -f Dockerfile.dev -t yuvomi-hnmz-dev:local .
docker compose -f docker-compose.dev.yml up -d

echo "=== status ==="
docker ps --filter name=yuvomi-hnmz-dev --format '{{.Names}} {{.Status}} {{.Ports}}'
docker ps --filter name=^Yuvomi$ --format '{{.Names}} {{.Status}} {{.Ports}}'
