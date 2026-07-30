# (Id??e future) Sync sant?? Amazfit Bip Max ??? module sant?? via Gadgetbridge

Statut : **en pause, non impl??ment??**. Ce document conserve le plan pour reprendre plus tard.

## Objectif

Faire remonter automatiquement les donn??es de la montre Amazfit Bip Max (sommeil, FC/SpO2,
pas quotidiens, s??ances de sport) dans le module sant?? de yuvomi-hnmz, sans action manuelle
r??currente.

## Pourquoi pas une simple API Zepp

Zepp n'a pas d'API publique. Options ??valu??es :

- **API Zepp/Huami non-officielle (reverse-engineered)** : la plus riche, mais zone grise ToS
  et `apptoken` qui expire ~30 jours (renouvellement manuel via capture r??seau) ??? pas vraiment
  automatique dans la dur??e.
- **Export RGPD manuel Zepp** : l??gal mais demande un email + code de v??rification ?? chaque
  export ??? inadapt?? ?? un besoin automatique.
- **Strava** (sync native Zepp ??? Strava + API officielle Strava) : ne couvre que les s??ances de
  sport, pas le sommeil/FC/SpO2/pas.
- **Gadgetbridge (retenu)** : remplace l'app Zepp sur le t??l??phone, open-source, le Bip Max est
  list?? "Highly supported". Couvre toutes les m??triques vis??es et s'automatise de bout en bout
  une fois le pairing initial fait (extraction unique de la cl?? Huami via l'app Zepp).

## Architecture envisag??e

```
Amazfit Bip Max --BLE--> Gadgetbridge (Android)
  --Auto export DB (SAF, ~1h)--> dossier local t??l??phone
  --Syncthing--> /mnt/user/appdata/yuvomi-hnmz-dev/gadgetbridge-import (Unraid)
  --lecture SQLite--> bridge Node (nouveau scheduler, opt-in)
  --INSERT/UPSERT idempotent--> health_vitals / health_activities
  --> module sant?? (UI :3008, dev uniquement)
```

- **Transport** : Gadgetbridge a une fonction native "Auto export database"
  (Settings ??? Automations) qui ??crit p??riodiquement une copie SQLite dans un dossier choisi
  via le s??lecteur Android (SAF). Ce dossier serait synchronis?? vers Unraid avec **Syncthing**
  (appli Android + conteneur Unraid) ??? pas de d??pendance ?? un cloud tiers. Ports libres
  confirm??s c??t?? Unraid au moment de l'??tude : 8384 (web UI), 22000 (sync).
- **Bridge** : un nouveau fichier service Node suivant le pattern des schedulers d??j?? pr??sents
  (`server/index.js` d??marre `startBackupScheduler`, `startMedicationScheduler`, etc. via
  `setInterval`/`node-cron`). Il lirait le fichier SQLite export?? en lecture seule
  (`better-sqlite3`, d??j?? utilis?? par le projet), calculerait les nouveaut??s depuis le dernier
  sync, et les ins??rerait dans `health_vitals` / `health_activities`.
- **Isolation upstream** : bridge **opt-in** via variables d'env (`GADGETBRIDGE_SYNC_ENABLED`,
  `GADGETBRIDGE_DB_PATH`), actif uniquement sur le conteneur dev (`yuvomi-hnmz-dev`, :3008),
  jamais sur la prod (:3007). Code dans un fichier d??di?? pour limiter les conflits de merge
  lors des prochains `sync-upstream`.

## Modifications DB envisag??es (additive, faible risque de conflit upstream)

Le sch??ma actuel (`server/db.js`, migration v65) n'a pas de colonne `source` ni d'identifiant
externe sur `health_vitals` / `health_activities`, donc pas moyen d'??viter les doublons ??
chaque sync. Migration additive pr??vue (nouveau num??ro de version, colonnes nullable) :

- `source TEXT` (ex: `gadgetbridge`)
- `external_id TEXT` (ex: id d'??chantillon/activit?? Gadgetbridge)
- Index unique `(user_id, source, external_id)` quand `source` n'est pas NULL, pour un upsert
  idempotent (`INSERT ... ON CONFLICT DO NOTHING/UPDATE`).

## Mapping des m??triques envisag??

| Donn??e Gadgetbridge  | Table cible        | `type`                              | Notes |
|-----------------------|---------------------|--------------------------------------|-------|
| Pas quotidiens         | `health_vitals`     | `steps`                              | 1 valeur/jour, `measured_at` = fin de journ??e |
| FC (agr??g??e)           | `health_vitals`     | `heart_rate_resting` / `heart_rate_avg` | Agr??gation journali??re pour ??viter d'inonder la table |
| SpO2                   | `health_vitals`     | `spo2`                               | Par mesure ou agr??gat journalier selon densit?? r??elle |
| Sommeil                | `health_vitals`     | `sleep_duration`                     | `value_num` = minutes ; phases en `note` (JSON) si dispo |
| S??ances de sport       | `health_activities` | presets existants (`running`, `cycling`, ...) | distance/dur??e/calories d??j?? support??s |

Le champ `type` est libre en base (`TEXT NOT NULL`, pas de `CHECK`/enum), donc aucune migration
n??cessaire pour ajouter ces nouveaux types.

Note d'impl??mentation : les noms exacts de tables/colonnes Gadgetbridge pour un appareil
Zepp OS (Bip Max) sont ?? v??rifier en inspectant un vrai export SQLite au moment du
d??veloppement (le sch??ma peut diff??rer des anciens Huami/Mi Band).

## ??tapes pr??vues (pour reprise)

1. C??t?? t??l??phone (manuel, guid??) : installer Gadgetbridge (F-Droid/nightly), extraire la cl??
   Huami via l'app Zepp, appairer le Bip Max, activer "Auto export database" (~1h) vers un
   dossier d??di??, activer "Auto fetch activity data". Installer Syncthing (Android) et pointer
   ce dossier vers Unraid.
2. Unraid ??? Syncthing : d??ployer un petit conteneur Syncthing, dossier partag?? vers
   `/mnt/user/appdata/yuvomi-hnmz-dev/gadgetbridge-import` (dev uniquement, pas de partage
   avec la prod).
3. Migration DB additive : `source`/`external_id` + index unique sur `health_vitals` et
   `health_activities` dans `server/db.js`.
4. Bridge de sync : nouveau fichier (ex. `server/services/gadgetbridge-sync.js`) : lecture
   seule du dernier export, extraction incr??mentale (??tat de dernier sync stock?? en DB), upsert
   idempotent via le mapping ci-dessus.
5. C??blage scheduler : d??marrage conditionnel (`GADGETBRIDGE_SYNC_ENABLED=true`) aux c??t??s des
   autres schedulers dans `server/index.js`, actif uniquement dans la config du conteneur dev.
6. Docs : mettre ?? jour ce fichier + `hnmz/README.md` / `FORK.md` une fois impl??ment??.
7. Test : v??rifier sur http://192.168.50.2:3008 que les donn??es apparaissent apr??s un export
   Gadgetbridge r??el ; valider l'absence de doublons sur exports r??p??t??s.
8. Commit/push sur `hnmz`.

## Hors p??rim??tre (pour l'instant, et si repris)

- Pas de d??ploiement sur la prod (:3007) tant que la fonctionnalit?? n'est pas valid??e.
- Pas de r??activation de l'app Zepp ni d'API cloud Zepp/Huami.
- Presets UI d??di??s (s??lection de type sant?? dans l'interface) pour `steps`/`sleep_duration`/etc.
  : ?? ajouter dans un second temps si besoin d'affichage d??di?? ??? au d??part les donn??es seraient
  visibles via les vitals g??n??riques.

