# Vue des sous-agents

Six prototypes de visualisation des sous-agents d'une recherche Atlas, en direct, indépendants du `frontend/`.
Ils tournent tous sur la même simulation (`commun/simulation.js`) : aucun vrai agent n'est lancé.

```bash
python -m http.server 8765 --directory prototypes/vue-sous-agents
# puis http://localhost:8765
```

| Option | Idée |
|---|---|
| `options/arbre` | Arbre rangé vivant, branches terminées repliées en grappes |
| `options/couloirs` | Flame chart temps réel (réflexion, outils, attente, file) |
| `options/orbites` | Constellation : orbites imbriquées, comètes et particules |
| `options/soleil` | Sunburst vivant pondéré par les tokens, zoom par sous-arbre |
| `options/salle` | Panneaux imbriqués façon tmux, un mini-terminal par agent |
| `options/rails` | Plan de métro / `git log --graph` avec fil d'événements |

La simulation reprend les rôles de `atlas/orchestrateur/sous_agents.py` (directeur de labo, littérature,
expérimentateur, graphiste) plus le vérificateur et son recours, et la limite de places simultanées
(`ATLAS_MAX_SOUS_AGENTS`) : un agent qui attend ses enfants libère sa place. Paramètres d'URL :
`?graine=7&vitesse=3&places=6&t=90`. Pour brancher une vue sur le vrai flux, il suffit de produire le même
état (`agents`, `etat`, `journal`, `tokens`) depuis les rollouts de `CODEX_HOME/sessions/`.
