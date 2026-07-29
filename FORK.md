# Fork yuvomi-hnmz (HNMZ)

Fork personnalisé de [ulsklyc/yuvomi](https://github.com/ulsklyc/yuvomi) pour les adaptations HNMZ.

- **Fork GitHub** : https://github.com/Imanity-jhn/yuvomi-hnmz
- **Upstream** : https://github.com/ulsklyc/yuvomi
- **Branche custom** : `hnmz` (features / docs / scripts HNMZ)
- **Branche miroir** : `main` (reste alignée avec upstream)

## Remotes

| Remote   | URL |
|----------|-----|
| `origin` | `git@github.com:Imanity-jhn/yuvomi-hnmz.git` |
| `upstream` | `https://github.com/ulsklyc/yuvomi.git` |

## Sync upstream (recommandé)

Garder `main` propre (miroir upstream), puis reporter les changements dans `hnmz` :

```bash
# 1. Récupérer upstream
git fetch upstream

# 2. Mettre à jour main
git checkout main
git merge --ff-only upstream/main   # ou: git reset --hard upstream/main si main n'a que du miroir
git push origin main

# 3. Reporter dans la branche custom
git checkout hnmz
git merge main
# résoudre les conflits si besoin
git push origin hnmz
```

Sous Windows (PowerShell), utiliser aussi :

```powershell
.\scripts\sync-upstream.ps1
```

Sous Linux / Unraid :

```bash
bash scripts/sync-upstream.sh
```

## Où mettre les customisations

- Dossier `hnmz/` : notes, patches et configs spécifiques HNMZ (ne pas écraser le cœur upstream sans besoin)
- Modules Yuvomi : déposer les modules dans `modules/` (monté en `/app/modules` en Docker)
- Config runtime : `.env` (jamais committer) — partir de `.env.example`

## Déploiement Unraid

Voir [DEPLOY-UNRAID.md](./DEPLOY-UNRAID.md).
