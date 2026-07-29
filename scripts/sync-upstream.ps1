# Sync upstream → main → hnmz pour le fork yuvomi-hnmz (Windows PowerShell)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

git fetch upstream
git fetch origin

$current = (git branch --show-current).Trim()

git checkout main
git merge --ff-only upstream/main
if ($LASTEXITCODE -ne 0) {
  Write-Host "Fast-forward impossible — merge classique"
  git merge upstream/main -m "merge: sync upstream/main into main"
}
git push origin main

git checkout hnmz
git merge main -m "merge: sync main into hnmz"
git push origin hnmz

if ($current -and $current -ne "hnmz" -and $current -ne "main") {
  git checkout $current
}

Write-Host "Sync terminé (upstream → main → hnmz)."
