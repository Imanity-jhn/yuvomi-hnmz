#!/bin/bash
# Sync upstream → main → hnmz pour le fork yuvomi-hnmz
set -euo pipefail
cd "$(dirname "$0")/.."

git fetch upstream
git fetch origin

current=$(git branch --show-current)

git checkout main
if git merge --ff-only upstream/main; then
  echo "main fast-forward OK"
else
  echo "Fast-forward impossible — merge classique"
  git merge upstream/main -m "merge: sync upstream/main into main"
fi
git push origin main

git checkout hnmz
git merge main -m "merge: sync main into hnmz"
git push origin hnmz

if [ -n "$current" ] && [ "$current" != "hnmz" ] && [ "$current" != "main" ]; then
  git checkout "$current" || true
fi

echo "Sync terminé (upstream → main → hnmz)."
