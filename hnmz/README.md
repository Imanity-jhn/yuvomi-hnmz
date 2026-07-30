# Customisations HNMZ

Placez ici la documentation et les artefacts propres au fork **yuvomi-hnmz** :

- notes de config Unraid / réseau local
- listes de modules à activer
- patches ou snippets non encore fusionnés upstream

Le code applicatif upstream reste à la racine. Préférez des modules dans `../modules/` quand c'est possible (mécanisme natif Yuvomi).

## Features custom (notes)

- **Checklists interactives** : dans une note, syntaxe Markdown `- [ ]` / `- [x]` (bouton barre d'outils checklist). En lecture (carte ou modal), cocher/décocher persiste via `PATCH /api/v1/notes/:id/checklist` sans passer par l'éditeur.


## Id??es / features en attente

- **Sync sant?? Amazfit Bip Max (Gadgetbridge)** : plan complet en pause, voir [docs/gadgetbridge-health-sync.md](docs/gadgetbridge-health-sync.md) pour reprendre plus tard.

