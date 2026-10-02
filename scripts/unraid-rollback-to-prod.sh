#!/bin/bash
# Restore BunkerWeb to the official yuvomi container and start prod again.
set -euo pipefail

SERVICE_ID='dashboard.huvelin-maniez.fr'
PROD_UPSTREAM='http://yuvomi:3000'

echo "=== starting prod yuvomi ==="
docker start yuvomi >/dev/null
for i in $(seq 1 30); do
  if curl -sf -o /dev/null http://127.0.0.1:3007/health; then
    break
  fi
  sleep 2
done

echo "=== pointing ${SERVICE_ID} → ${PROD_UPSTREAM} ==="
docker exec bunkerweb-db psql -U bunkerweb -d db -c \
  "UPDATE bw_services_settings SET value='${PROD_UPSTREAM}' WHERE service_id='${SERVICE_ID}' AND setting_id='REVERSE_PROXY_HOST';
   UPDATE bw_services SET last_update=NOW() WHERE id='${SERVICE_ID}';"

docker restart bunkerweb-scheduler >/dev/null
for i in $(seq 1 30); do
  if docker inspect bunkerweb --format '{{.State.Health.Status}}' 2>/dev/null | grep -q healthy; then
    break
  fi
  sleep 2
done

curl -ksS -o /dev/null -w "https://${SERVICE_ID}/health → %{http_code}\n" "https://${SERVICE_ID}/health" || true
docker ps --filter name=yuvomi --format '{{.Names}} {{.Status}} {{.Ports}}'
