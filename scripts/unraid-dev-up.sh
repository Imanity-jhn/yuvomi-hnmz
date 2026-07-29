#!/bin/bash
# Prepare .env + appdata and start yuvomi-hnmz-dev (hot reload) on Unraid.
# Safe: does not touch prod container Yuvomi / port 3007 / appdata/yuvomi.
set -euo pipefail
cd /mnt/user/yuvomi-hnmz

if [ ! -f .env ]; then
  cp .env.example .env
fi

SESSION_SECRET="$(openssl rand -hex 32)"
export SESSION_SECRET

python3 <<'PY'
from pathlib import Path
import os

path = Path(".env")
text = path.read_text()
secret = os.environ["SESSION_SECRET"]

replacements = {
    "OIKOS_HTTP_PORT": "3008",
    "SESSION_SECRET": secret,
    "DB_ENCRYPTION_KEY": "",
    "NODE_ENV": "development",
    "SESSION_SECURE": "false",
    "TRUST_PROXY": "loopback",
    "TZ": "Europe/Paris",
}

lines = text.splitlines(keepends=True)
out = []
seen = set()
for line in lines:
    stripped = line.lstrip()
    if stripped.startswith("#") or "=" not in line:
        out.append(line)
        continue
    key = stripped.split("=", 1)[0].strip()
    if key in replacements:
        out.append(f"{key}={replacements[key]}\n")
        seen.add(key)
    else:
        out.append(line)

for key, val in replacements.items():
    if key not in seen:
        out.append(f"{key}={val}\n")

path.write_text("".join(out))
print("Updated .env keys:", ", ".join(sorted(replacements)))
PY

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
