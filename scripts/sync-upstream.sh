#!/bin/bash
# Sync upstream → main → hnmz (politique merge, pas rebase)
# À lancer à la demande uniquement, depuis Unraid : /mnt/user/yuvomi-hnmz
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Fetch upstream + origin"
git fetch upstream
git fetch origin

current=$(git branch --show-current)

echo "==> Mettre à jour main (miroir strict, ff-only)"
git checkout main
if ! git merge --ff-only upstream/main; then
  echo "ERREUR: fast-forward impossible sur main."
  echo "main doit rester un miroir strict d'upstream/main."
  echo "Arrêt — résoudre manuellement (ne pas rebase, ne pas --force sans accord)."
  git checkout "$current" 2>/dev/null || true
  exit 1
fi
echo "main fast-forward OK"
git push origin main

echo "==> Merger main dans hnmz"
git checkout hnmz
if ! git merge main -m "merge: sync main into hnmz"; then
  echo "CONFLIT lors du merge main → hnmz."
  echo "Si le conflit est clair : résoudre, git add, git commit, puis git push origin hnmz."
  echo "Sinon : s'arrêter et signaler (git merge --abort pour annuler)."
  exit 1
fi
git push origin hnmz

if [ -n "$current" ] && [ "$current" != "hnmz" ] && [ "$current" != "main" ]; then
  git checkout "$current" || true
fi

echo "Sync terminé (upstream → main → hnmz, merge only)."
