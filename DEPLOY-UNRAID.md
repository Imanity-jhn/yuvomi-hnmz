# Unraid — yuvomi-hnmz

## Accès SSH

```
Host unraid
    HostName 192.168.50.2
    User root
    IdentityFile C:/Users/Imanity/.ssh/id_ed25519
```

```bash
ssh unraid
# ou : ssh root@192.168.50.2
```

## Chemins

| Rôle | Chemin | Action |
|------|--------|--------|
| Clone du fork (code / git) | `/mnt/user/yuvomi-hnmz` | OK — travail ici |
| **Dev hot-reload** — données isolées | `/mnt/user/appdata/yuvomi-hnmz-dev` | OK — instance fork |
| Données prod Yuvomi | `/mnt/user/appdata/yuvomi` | **INTERDIT** |
| Template Docker prod | `/boot/config/plugins/dockerMan/templates-user/my-Yuvomi.xml` (port hôte **3007**) | **INTERDIT** |

## Garde-fous (strict)

| | Prod (interdite) | Dev hot-reload (autorisée) |
|--|------------------|----------------------------|
| Conteneur | `Yuvomi` | `yuvomi-hnmz-dev` |
| Image | `ghcr.io/ulsklyc/yuvomi*` | `yuvomi-hnmz-dev:local` |
| Port hôte | **3007** | **3008** |
| Appdata | `/mnt/user/appdata/yuvomi` | `/mnt/user/appdata/yuvomi-hnmz-dev` |
| Compose | template Unraid / image officielle | `docker-compose.dev.yml` |

- **Ne jamais toucher la prod** : ne pas stop / restart / modifier le conteneur `Yuvomi`, ses volumes, ni son template.
- **Runtime fork autorisé uniquement** via `docker-compose.dev.yml` (port **3008**, data `yuvomi-hnmz-dev`). Ne pas réutiliser `docker-compose.yml` « prod-like » tant qu’on n’en a pas besoin explicitement.

## Clone / remotes (déjà en place)

```bash
cd /mnt/user/yuvomi-hnmz
git remote -v
# origin    git@github.com:Imanity-jhn/yuvomi-hnmz.git
# upstream  https://github.com/ulsklyc/yuvomi.git

git checkout hnmz   # branche de travail par défaut
```

Mettre à jour le custom (sans sync upstream) :

```bash
cd /mnt/user/yuvomi-hnmz
git fetch origin && git checkout hnmz && git pull origin hnmz
```

Sync upstream **à la demande seulement** (politique merge) :

```bash
cd /mnt/user/yuvomi-hnmz
bash scripts/sync-upstream.sh
```

Détails : [FORK.md](./FORK.md).

## Auth GitHub (`gh`)

Compte : **Imanity-jhn**. Releases / tags autorisés.

Binaire : `/mnt/user/bin/gh`

```bash
export PATH="/mnt/user/bin:$PATH"
gh auth status
# Si non connecté (login interactif) :
gh auth login -h github.com -p https -w
```

Sans `gh` auth, `git push` via SSH (`origin` en `git@github.com:…`) reste utilisable si la clé SSH Unraid est connue de GitHub.

## Instance dev hot-reload

Compose : `docker-compose.dev.yml` + `Dockerfile.dev`.

- Monte le code (`/mnt/user/yuvomi-hnmz` → `/app`)
- `npm run dev` = `node --watch` (redémarrage auto du serveur Node)
- Fichiers statiques `public/` servis directement (pas de rebuild frontend)
- **URL** : http://192.168.50.2:3008
- Data : `/mnt/user/appdata/yuvomi-hnmz-dev/{data,backups,documents}`

### Première mise en route

```bash
cd /mnt/user/yuvomi-hnmz
git checkout hnmz && git pull origin hnmz

# .env dédié (ne jamais committer) — secrets générés, DB non chiffrée pour le dev
cp -n .env.example .env
# Éditer au minimum :
#   OIKOS_HTTP_PORT=3008
#   SESSION_SECRET=<aléatoire long>
#   DB_ENCRYPTION_KEY=          # vide OK en dev (DB fraîche)
#   SESSION_SECURE=false
#   TRUST_PROXY=loopback
#   TZ=Europe/Paris

mkdir -p /mnt/user/appdata/yuvomi-hnmz-dev/{data,backups,documents}

docker compose -f docker-compose.dev.yml up -d --build
```

### Commandes quotidiennes

```bash
cd /mnt/user/yuvomi-hnmz

# Démarrer / rebuild
docker compose -f docker-compose.dev.yml up -d --build

# Logs
docker compose -f docker-compose.dev.yml logs -f

# Stop (prod Yuvomi inchangée)
docker compose -f docker-compose.dev.yml down

# Santé
docker ps --filter name=yuvomi-hnmz-dev
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3008/health
```

Après changement de `package.json` / lockfile : `docker compose -f docker-compose.dev.yml up -d --build` (rafraîchit le volume `node_modules`).

## Compose prod-like (sans hot reload)

`docker-compose.yml` reste disponible pour un build/image classique. Sur Unraid, préférer `docker-compose.dev.yml`. Si un jour vous lancez la variante prod-like : port ≠ **3007** et appdata ≠ `/mnt/user/appdata/yuvomi`.

## État actuel

- Clone Git Unraid : **oui** (`/mnt/user/yuvomi-hnmz`, branche `hnmz`)
- Prod `Yuvomi` : port **3007** — **ne pas toucher**
- Dev hot-reload `yuvomi-hnmz-dev` : port **3008**, data `yuvomi-hnmz-dev`
- `gh` : binaire `/mnt/user/bin/gh` (auth selon `gh auth status`)
