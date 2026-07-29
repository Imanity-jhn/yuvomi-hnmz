# Unraid — yuvomi-hnmz (code & git uniquement)

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
| Données prod Yuvomi | `/mnt/user/appdata/yuvomi` | **INTERDIT** |
| Template Docker prod | `/boot/config/plugins/dockerMan/templates-user/my-Yuvomi.xml` (port hôte **3007**) | **INTERDIT** |

## Garde-fous (strict)

- **Ne jamais toucher la prod** : container `Yuvomi`, port hôte **3007**, `/mnt/user/appdata/yuvomi`, image `ghcr.io/ulsklyc/yuvomi` (ou équivalent officiel).
- **Pas de runtime fork pour l’instant** : ne pas lancer `docker compose` depuis ce dépôt, ne pas ouvrir un autre port (3008, etc.), ne pas créer de conteneur / appdata parallèle qui entrerait en conflit.
- **Dev actuel** = code + git + releases seulement. La migration runtime sera une étape séparée, explicitement demandée.

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

## Runtime fork — plus tard uniquement

Le dépôt contient `docker-compose.yml` et `.env.example` pour une migration future. **Ne pas les utiliser tant que la migration runtime n’est pas demandée.**

Quand ce sera le moment (hors scope actuel) :

- Isoler données / backups / modules hors de `/mnt/user/appdata/yuvomi`
- Choisir un port hôte **différent de 3007**
- Ne jamais écraser le conteneur prod

## État actuel

- Clone Git Unraid : **oui** (`/mnt/user/yuvomi-hnmz`, branche `hnmz`)
- Runtime / `docker compose` du fork : **non** (volontairement, jusqu’à migration)
- Prod officielle (port **3007**) : **ne pas toucher**
- `gh` : binaire présent, **auth login encore à faire** (voir ci-dessus)
