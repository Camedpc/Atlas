# Atlas

Harness de hackathon : des agents IA transforment leurs raisonnements scientifiques en graphe
(nœuds = énoncés, démonstrations = arêtes depuis les prémisses), stocké dans Supabase.

## Structure

| Dossier | Rôle |
|---|---|
| `supabase/` | Schéma (`migrations/`) et données de démo (`seed.sql`) |
| `atlas/` | Graphe en Python : modèles, calcul des statuts, requêtes Supabase, conversations |
| `atlas/orchestrateur/` | Orchestrateur de recherche (SDK Codex) et ses routes |
| `atlas/serveur.py` | Serveur longue durée : lecture + conversations (local, puis VM) |
| `api/index.py` | Lecture seule, déployée comme fonction Python sur Vercel |
| `frontend/` | Interface : espace et sessions à gauche, conversation et arbre des agents au centre, graphe, agent graph ou documents à droite |
| `tests/` | Tests Python (sans réseau) |

## API

| Route | Renvoie |
|---|---|
| `GET /api/health` | État de la connexion Supabase |
| `GET /api/graphe?projet_id=` | Tous les nœuds (avec statut et démonstrations) et toutes les arêtes du graphe d'un espace |
| `GET /api/noeuds/{id}?projet_id=` | Un nœud, ses prémisses et les nœuds qui l'utilisent |
| `GET /api/journal?projet_id=&noeud_id=&limite=&avant_id=` | Historique, le plus récent d'abord |
| `GET /api/docs` | Documentation interactive |

Chaque espace de travail (projet) a son propre graphe : `projet_id` le choisit, et son absence désigne le
projet « defaut ».

Servies seulement par `atlas.serveur` (pas sur Vercel) :

| Route | Rôle |
|---|---|
| `GET /api/projets` | Espaces de travail (projets) et utilisateur |
| `POST /api/projets` | Crée un espace (`{"nom", "description"?}`) et son dossier dans le bunker |
| `GET /api/projets/{id}/fichiers` | Arborescence du dossier de l'espace dans le bunker (vue Documents) |
| `GET /api/projets/{id}/fichier?chemin=` | Contenu d'un fichier de l'espace, pour l'aperçu |
| `GET /api/conversations?projet_id=` | Conversations (d'un espace), la plus récente d'abord |
| `POST /api/conversations` | Crée une conversation (`{"titre"?, "projet_id"?}`) |
| `GET /api/conversations/{id}` | Conversation, exécution en cours et dernière exécution |
| `GET /api/conversations/{id}/messages?apres_id=&agent=` | Messages de l'orchestrateur, ou d'un sous-agent (`agent` = chemin Codex) |
| `GET /api/conversations/{id}/agents` | Arbre des agents : en direct pendant un tour, sinon celui du dernier tour |
| `POST /api/conversations/{id}/messages` | `{"contenu", "agent"?, "modele"?, "effort"?}` : lance un tour, ou s'injecte dans le tour en cours |
| `POST /api/conversations/{id}/arreter` | Interrompt le tour en cours |
| `WS /api/conversations/{id}/voix` | Appel vocal avec Atlas voix (premier message : `{"type": "auth", "jeton"}`) |
| `/api/voix/appels/{appel}/…` | Outils du serveur MCP `voix` : confier à l'orchestrateur, son état, petites tâches |
| `GET /api/orchestrateur/modeles` | Modèles Codex proposés à l'orchestrateur, leurs efforts, et les réglages par défaut |

Chaque nœud porte aussi `parents` (ses prémisses) et `enfants` (les nœuds qui le citent), maintenus par
trigger à partir des démonstrations, et `conversation_id` (la conversation qui l'a créé).

Le statut d'un nœud (`etabli`, `suspendu`, `a_verifier`, `invalide`, `ouvert`) n'est pas stocké :
il est calculé à partir de tout le graphe dans `atlas/graphe.py`.

## Dev local

```bash
cp .env.example .env            # puis renseigner SUPABASE_SECRET_KEY
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt   # macOS/Linux : .venv/bin/pip
.venv/Scripts/python -m uvicorn atlas.serveur:app --port 8000 --reload --reload-dir atlas --reload-dir api
npm install --prefix frontend
npm run dev --prefix frontend   # http://localhost:5173 (proxy /api → :8000)
.venv/Scripts/python -m pytest
```

## Base de données

```bash
npx supabase link --project-ref uykaupigovrvgwsckbcn
npm run db:push                 # applique les migrations et le seed
```

## Déploiement

Vercel, configuré par `vercel.json` : build du front dans `frontend/dist`, et `/api/*` servi par
`api/index.py`. Variables à définir sur Vercel : `SUPABASE_URL`, `SUPABASE_SECRET_KEY`.

## Orchestrateur

L'orchestrateur est Codex piloté par son [SDK Python](https://github.com/openai/codex/tree/main/sdk/python)
(`openai-codex`, qui installe aussi le binaire Codex) : accès complet sans demande d'approbation, recherche web
en direct, un dossier `espace/<conversation>/` et un thread Codex par conversation. Il lit le graphe via le
serveur MCP `atlas`, lancé par Codex : il lit le graphe (`lire_graphe`, `lire_noeud`) et l'écrit lui-même
(`creer_noeud`, `ajouter_demonstration` ; nœuds tagués par la conversation, démonstrations « à vérifier »). Il est isolé de la machine : son propre
`CODEX_HOME` (`espace/.codex`), aucune lecture de `~/.codex`, de hooks ni d'`AGENTS.md` du dépôt.

L'orchestrateur délègue à des sous-agents Codex dans le même thread : `directeur_de_labo` (qui lance lui-même
`litterature` et `experimentateur`, et écrit `journal.md` et `rapport.md` dans `directeurs/NN-sujet/`) et
`graphiste` (qui met un rapport en graphe). Il fait ensuite juger les démonstrations par l'outil `verifier` du
serveur MCP `verificateur` : un modèle économique juge chaque démonstration, un modèle de recours rejuge les
verdicts invalides ou peu sûrs, et le verdict (`validite`, `confiance`) est écrit sur la démonstration.

Chaque conversation a son dossier (`atlas/orchestrateur/bunker.py`) :
`espace/utilisateurs/<utilisateur>/<projet>/sessions/<conversation>/`, avec `conv/` (copie de la conversation),
`docs_session/`, `scripts/` et `.tmp/`, et un Python partagé dans `espace/partage/`. Les agents ont pour consigne de
ne rien consulter hors de leur session et de leur projet ; en local, `ATLAS_BUNKER=1` confine en plus leurs
écritures par le sandbox de Codex (impossible sur la VM, qui tourne à 0).

- Prompts (un fichier par agent, relus à chaque tour) : `atlas/orchestrateur/prompts/`
- Rôles, modèles et efforts par défaut : `atlas/orchestrateur/sous_agents.py`
- Vérificateur : `atlas/orchestrateur/verificateur.py` et `mcp_verificateur.py`
- Étapes après chaque tour (vide pour l'instant) : `atlas/orchestrateur/pipeline.py`
- Réglages : variables `ATLAS_*` et `OPENAI_API_KEY` dans `.env.example`

Connexion, dans le `CODEX_HOME` d'Atlas uniquement :

- en dev, ton compte ChatGPT : `.venv/Scripts/python -m atlas.orchestrateur.connexion` (ouvre le navigateur ;
  `--code` pour une connexion par code sur une VM, à activer dans ChatGPT → Paramètres → Sécurité ;
  `--statut` affiche le compte utilisé) ;
- en production, une clé API : renseigner `OPENAI_API_KEY` dans le `.env` suffit, elle est prioritaire.

### Atlas voix

Le bouton micro de la saisie ouvre un appel avec **Atlas voix** (`atlas/voix/`), la façade vocale de la
conversation : transcription et synthèse Gradium en direct (on parle en continu, on lui coupe la parole, on lui
donne des consignes), cerveau Codex rapide (`gpt-6-sol`, effort bas, mode fast), dans le bunker de la session.

- Au décroché, elle reçoit les 30 derniers messages de la conversation (tour d'échauffement muet).
- Recherche : elle la confie à l'orchestrateur (outil `confier_orchestrateur` du serveur MCP `voix`) — nouveau
  tour, ou consigne injectée dans son tour en cours. Il n'y a jamais d'orchestrateur imbriqué.
- Elle reçoit ses étapes clés (sous-agents directs lancés ou terminés, `SuiviAgents` → `gestionnaire.abonner`)
  et sa réponse finale, et les annonce dans les silences, une phrase par étape. Les rapports bruts restent chez
  l'orchestrateur.
- Petites tâches pratiques : elle-même ou un petit sous-agent de fond (`lancer_tache`).
- « Stop » la fait taire ; seule une demande explicite arrête la recherche.
- Au raccrochage, la transcription de l'appel (enregistrée sous l'agent `/voix`) est ajoutée en tête du
  prochain message que reçoit l'orchestrateur, sur le modèle choisi dans la saisie.
- Dans l'arbre et l'agent graph, Atlas voix est un sommet (`/voix`) ; l'orchestrateur devient son enfant s'il
  lui a confié du travail. Elle y reste jusqu'à la prochaine relance écrite de l'orchestrateur.

Prompts : `atlas/orchestrateur/prompts/voix.md` et `tache_vocale.md`. Réglages : `GRADIUM_API_KEY` et
`ATLAS_VOIX_*` dans `.env.example`. Prototype autonome d'origine et ses bancs d'essai : `voix-live/`.

### Sur une VM

Docker + Caddy (HTTPS) + jeton d'accès : voir [`deploiement/README.md`](deploiement/README.md).

Tout l'état utile est dans Supabase. Les threads Codex vivent dans `espace/.codex` : copier `espace/` sur la VM
les conserve ; sinon chaque conversation repart de son historique de messages, sans perte visible.
