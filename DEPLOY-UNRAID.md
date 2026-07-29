# Déploiement Unraid — yuvomi-hnmz

## Accès SSH

Depuis le PC Windows Imanity (`~/.ssh/config`) :

```
Host unraid
    HostName 192.168.50.2
    User root
    IdentityFile C:/Users/Imanity/.ssh/id_ed25519
```

Connexion :

```powershell
ssh unraid
```

## Chemins

| Rôle | Chemin |
|------|--------|
| Clone du fork (code) | `/mnt/user/yuvomi-hnmz` |
| Données instance Docker existante (image officielle) | `/mnt/user/appdata/yuvomi` |
| Template Unraid actuel | `/boot/config/plugins/dockerMan/templates-user/my-Yuvomi.xml` (port hôte **3007**) |

> L'instance Docker **Yuvomi** déjà en prod utilise `ghcr.io/ulsklyc/yuvomi:latest` et le port hôte **3007**. Ne pas la casser. Pour tester le fork, utiliser un autre port (ex. **3008**) et un autre répertoire de données.

## Clone / remotes sur le serveur

Déjà en place :

```bash
cd /mnt/user/yuvomi-hnmz
git remote -v
# origin    git@github.com:Imanity-jhn/yuvomi-hnmz.git
# upstream  https://github.com/ulsklyc/yuvomi.git

git checkout hnmz
```

Mettre à jour le code :

```bash
cd /mnt/user/yuvomi-hnmz
bash scripts/sync-upstream.sh
# ou simplement :
git fetch origin && git checkout hnmz && git pull origin hnmz
```

## Docker Compose (fork)

Le dépôt fournit `docker-compose.yml` (port conteneur **3000**, hôte via `OIKOS_HTTP_PORT`).

1. Copier l'exemple d'env (ne pas committer `.env`) :

```bash
cd /mnt/user/yuvomi-hnmz
cp -n .env.example .env
# Éditer .env : SESSION_SECRET, DB_ENCRYPTION_KEY, OIKOS_HTTP_PORT=3008, etc.
```

2. Données isolées du conteneur prod (exemple) :

```bash
export DATA_DIR=/mnt/user/appdata/yuvomi-hnmz/data
export BACKUP_DIR=/mnt/user/appdata/yuvomi-hnmz/backups
export MODULES_DIR=/mnt/user/yuvomi-hnmz/modules
export DOCUMENT_STORAGE_LOCAL_DIR=/mnt/user/appdata/yuvomi-hnmz/documents
mkdir -p "$DATA_DIR" "$BACKUP_DIR" "$DOCUMENT_STORAGE_LOCAL_DIR"
```

3. Démarrer **uniquement** quand `.env` est prêt (non fait automatiquement pour éviter d'interférer avec le conteneur `Yuvomi` existant) :

```bash
cd /mnt/user/yuvomi-hnmz
# Option A — image GHCR upstream (rapide)
# OIKOS_HTTP_PORT=3008 docker compose up -d

# Option B — build local depuis ce fork
# OIKOS_HTTP_PORT=3008 docker compose up -d --build
```

Variables sensibles listées dans `.env.example` (ne pas inventer de secrets ici) : `SESSION_SECRET`, `DB_ENCRYPTION_KEY`, clés OAuth/météo, etc.

## État actuel

- Clone Git sur Unraid : **oui** (`/mnt/user/yuvomi-hnmz`, branche `hnmz`)
- `docker compose up` du fork : **non** (volontairement) — l'instance officielle tourne déjà sur le port 3007
