# Fork yuvomi-hnmz (HNMZ)

Fork personnalisé de [ulsklyc/yuvomi](https://github.com/ulsklyc/yuvomi) pour les adaptations HNMZ.

| | |
|--|--|
| **Fork GitHub** | https://github.com/Imanity-jhn/yuvomi-hnmz |
| **Compte** | `Imanity-jhn` |
| **Upstream** | https://github.com/ulsklyc/yuvomi |
| **Travail** | Unraid uniquement — `/mnt/user/yuvomi-hnmz` |
| **Branche défaut** | `hnmz` (tout le custom) |
| **Branche miroir** | `main` (miroir strict upstream) |

## Règles verrouillées

- **Auth GitHub** : `gh` sur Unraid (`gh auth login` si besoin).
- **Releases / tags** : autorisés sur ce fork.
- **Sync upstream** : **à la demande seulement** (pas de sync automatique).
- **Politique** : **merge** (pas de rebase) — voir ci-dessous.
- **Conflits** : résoudre si clair ; sinon s’arrêter et signaler (ne pas forcer).
- **Prod** : **ne jamais toucher** — container/port **3007**, `/mnt/user/appdata/yuvomi`, image officielle.
- **Runtime fork** : **interdit pour l’instant** — pas de `docker compose` du fork, pas d’autre port (3008, etc.). Dev = code + git + releases seulement ; migration runtime plus tard.
- **Windows** : hors scope — tout le travail git se fait sur Unraid.

## Remotes

| Remote | URL |
|--------|-----|
| `origin` | `git@github.com:Imanity-jhn/yuvomi-hnmz.git` |
| `upstream` | `https://github.com/ulsklyc/yuvomi.git` |

## Sync upstream (à la demande)

Politique **merge** uniquement :

```text
fetch upstream → merge --ff-only upstream/main dans main → push origin main
→ merge main dans hnmz → push origin hnmz
```

Sur Unraid :

```bash
cd /mnt/user/yuvomi-hnmz
bash scripts/sync-upstream.sh
```

Équivalent manuel :

```bash
cd /mnt/user/yuvomi-hnmz
git fetch upstream
git checkout main
git merge --ff-only upstream/main
git push origin main
git checkout hnmz
git merge main
# si conflit clair → résoudre, commit, push
# si doute → s’arrêter et signaler (ne pas --force)
git push origin hnmz
```

## Checklist autonomie (Unraid)

1. Travailler sur `hnmz` : `cd /mnt/user/yuvomi-hnmz && git checkout hnmz`
2. Commit + push : `git add … && git commit && git push origin hnmz`
3. Sync upstream **seulement si demandé** : `bash scripts/sync-upstream.sh`
4. Releases / tags : OK via `gh release` / `git tag` + push (compte `Imanity-jhn`)
5. **Prod interdite** : ne pas modifier le container Yuvomi (3007), `/mnt/user/appdata/yuvomi`, ni l’image officielle
6. **Pas de runtime fork** tant que la migration n’est pas demandée

## Auth `gh` (Unraid)

Binaire installé (persistant) : `/mnt/user/bin/gh` (v2.74.2).

```bash
export PATH="/mnt/user/bin:$PATH"
gh auth status
# État actuel : non connecté — login interactif requis (device code) :
gh auth login -h github.com -p https -w
# Compte : Imanity-jhn — suivre le code affiché sur github.com/login/device
```

Sans `gh` auth, `git push` via SSH (`origin` = `git@github.com:Imanity-jhn/yuvomi-hnmz.git`) reste utilisable si la clé SSH Unraid est connue de GitHub.

## Où mettre les customisations

- Dossier `hnmz/` : notes, patches et configs HNMZ
- Modules : `modules/` (monté en `/app/modules` en Docker — **après** migration runtime)
- Config runtime : `.env` (jamais committer) — à partir de `.env.example` **uniquement** quand le runtime fork sera autorisé

## Déploiement / garde-fous Unraid

Voir [DEPLOY-UNRAID.md](./DEPLOY-UNRAID.md).
