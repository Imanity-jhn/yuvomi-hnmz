#!/bin/bash
# Point BunkerWeb dashboard.huvelin-maniez.fr at yuvomi-hnmz-dev, then stop prod
# so only one scheduler sends notifications. Prod volumes are left untouched.
set -euo pipefail

SERVICE_ID='dashboard.huvelin-maniez.fr'
DEV_UPSTREAM='http://yuvomi-hnmz-dev:3000'
PROD_UPSTREAM='http://yuvomi:3000'

if ! docker inspect yuvomi-hnmz-dev --format '{{.State.Status}}' 2>/dev/null | grep -q running; then
  echo "yuvomi-hnmz-dev is not running" >&2
  exit 1
fi

on_bw_apps=$(docker inspect yuvomi-hnmz-dev --format '{{index .NetworkSettings.Networks "bw-apps"}}')
if [ -z "$on_bw_apps" ] || [ "$on_bw_apps" = "<no value>" ]; then
  echo "yuvomi-hnmz-dev is not on bw-apps — start it with docker-compose.dev.yml first" >&2
  exit 1
fi

echo "=== current BunkerWeb upstream ==="
docker exec bunkerweb-db psql -U bunkerweb -d db -tA -c \
  "SELECT value FROM bw_services_settings WHERE service_id='${SERVICE_ID}' AND setting_id='REVERSE_PROXY_HOST';"

echo "=== pointing ${SERVICE_ID} → ${DEV_UPSTREAM} ==="
docker exec bunkerweb-db psql -U bunkerweb -d db -c \
  "UPDATE bw_services_settings SET value='${DEV_UPSTREAM}' WHERE service_id='${SERVICE_ID}' AND setting_id='REVERSE_PROXY_HOST';
   UPDATE bw_services SET last_update=NOW() WHERE id='${SERVICE_ID}';"

echo "=== reloading BunkerWeb scheduler ==="
docker restart bunkerweb-scheduler >/dev/null
# Scheduler regenerates nginx config on start; wait until bunkerweb is healthy again.
for i in $(seq 1 30); do
  if docker inspect bunkerweb --format '{{.State.Health.Status}}' 2>/dev/null | grep -q healthy; then
    break
  fi
  sleep 2
done

echo "=== public health ==="
curl -ksS -o /dev/null -w "https://${SERVICE_ID}/health → %{http_code}\n" "https://${SERVICE_ID}/health" || true

echo "=== stopping prod yuvomi (rollback: docker start yuvomi && restore upstream ${PROD_UPSTREAM}) ==="
docker stop yuvomi >/dev/null
docker ps --filter name=yuvomi --format '{{.Names}} {{.Status}} {{.Ports}}'
