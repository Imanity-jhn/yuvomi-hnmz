#!/bin/bash
# Prepare .env + appdata and start yuvomi-hnmz-dev (hot reload) on Unraid.
# Safe: does not recreate or modify prod container yuvomi / port 3007 / appdata/yuvomi.
set -euo pipefail
cd /mnt/user/yuvomi-hnmz

if [ ! -f .env ]; then
  cp .env.example .env
fi

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

set_env_if_placeholder() {
  local key="$1"
  local val="$2"
  if grep -qE "^${key}=(REPLACE_WITH_A_LONG_RANDOM_STRING|REPLACE_WITH_A_STRONG_ENCRYPTION_KEY|YOUR_API_KEY)?$" .env; then
    set_env "$key" "$val"
  fi
}

# Host port stays 3008. Public URL and proxy trust match BunkerWeb / prod.
set_env OIKOS_HTTP_PORT 3008
set_env NODE_ENV development
set_env TZ Europe/Paris
set_env BASE_URL https://dashboard.huvelin-maniez.fr
set_env TRUST_PROXY 1
# Same as Unraid prod template: Secure cookies off so LAN :3008 still logs in.
set_env SESSION_SECURE false
# Host-path vars used by docker-compose.dev.yml (BACKUP_DIR inside the container is /backups).
set_env YUVOMI_DEV_DATA /mnt/user/appdata/yuvomi-hnmz-dev/data
set_env YUVOMI_DEV_BACKUPS /mnt/user/appdata/yuvomi-hnmz-dev/backups
set_env YUVOMI_DEV_MODULES /mnt/user/appdata/yuvomi-hnmz-dev/modules
set_env YUVOMI_DEV_DOCUMENTS /mnt/user/appdata/yuvomi-hnmz-dev/documents

# Copy live secrets from the running prod container when placeholders are still in .env.
if docker inspect yuvomi >/dev/null 2>&1; then
  prod_env=$(docker inspect yuvomi --format '{{range .Config.Env}}{{println .}}{{end}}')
  prod_session=$(printf '%s\n' "$prod_env" | sed -n 's/^SESSION_SECRET=//p')
  prod_dbkey=$(printf '%s\n' "$prod_env" | sed -n 's/^DB_ENCRYPTION_KEY=//p')
  if [ -n "$prod_session" ]; then
    set_env SESSION_SECRET "$prod_session"
  fi
  if [ -n "$prod_dbkey" ]; then
    set_env DB_ENCRYPTION_KEY "$prod_dbkey"
  fi
fi

set_env_if_placeholder SESSION_SECRET "$(openssl rand -hex 32)"
set_env_if_placeholder OPENWEATHER_API_KEY ""

# Example OIDC issuer from .env.example must not stay set (prod leaves OIDC empty).
if grep -qE '^OIDC_ISSUER=https://authentik\.example\.com/' .env; then
  set_env OIDC_ISSUER ""
fi
if grep -qE '^OIDC_REDIRECT_URI=https://your-domain\.com/' .env; then
  set_env OIDC_REDIRECT_URI ""
fi
if grep -qE '^GOOGLE_REDIRECT_URI=https://your-domain\.com/' .env; then
  set_env GOOGLE_REDIRECT_URI ""
fi
if grep -qE '^GOOGLE_DRIVE_REDIRECT_URI=https://your-domain\.com/' .env; then
  set_env GOOGLE_DRIVE_REDIRECT_URI ""
fi

echo "Updated .env for hot-reload (port 3008, BASE_URL + TRUST_PROXY=1, secrets from prod if present)"

mkdir -p /mnt/user/appdata/yuvomi-hnmz-dev/data \
         /mnt/user/appdata/yuvomi-hnmz-dev/backups \
         /mnt/user/appdata/yuvomi-hnmz-dev/documents \
         /mnt/user/appdata/yuvomi-hnmz-dev/modules

echo "=== prod before ==="
docker ps --filter name=yuvomi --format '{{.Names}} {{.Status}} {{.Ports}}'

echo "=== building / starting yuvomi-hnmz-dev ==="
# Unraid compose/buildx combo rejects `compose ... --build`; build image first.
docker build -f Dockerfile.dev -t yuvomi-hnmz-dev:local .
docker compose -f docker-compose.dev.yml up -d --force-recreate

echo "=== status ==="
docker ps --filter name=yuvomi --format '{{.Names}} {{.Status}} {{.Ports}}'
