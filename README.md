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
| `frontend/` | Interface : conversations à gauche, graphe sigma.js à droite |
| `tests/` | Tests Python (sans réseau) |
| `protocoles/` | JSON Schema des liaisons voix → commandes → affichage (P1 à P4) et exemples de contrat |

## API

| Route | Renvoie |
|---|---|
| `GET /api/health` | État de la connexion Supabase |
| `GET /api/graphe` | Tous les nœuds (avec statut et démonstrations) et toutes les arêtes |
| `GET /api/noeuds/{id}` | Un nœud, ses prémisses et les nœuds qui l'utilisent |
| `GET /api/journal?noeud_id=&limite=&avant_id=` | Historique, le plus récent d'abord |
| `GET /api/docs` | Documentation interactive |

Servies seulement par `atlas.serveur` (pas sur Vercel) :

| Route | Rôle |
|---|---|
| `GET /api/conversations` | Conversations, la plus récente d'abord |
| `POST /api/conversations` | Crée une conversation (`{"titre"?}`) |
| `GET /api/conversations/{id}` | Conversation, exécution en cours et dernière exécution |
| `GET /api/conversations/{id}/messages?apres_id=` | Messages (utilisateur, assistant, outil, systeme) |
| `POST /api/conversations/{id}/messages` | Lance un tour de l'orchestrateur (`{"contenu"}`), 409 si déjà en cours |
| `POST /api/conversations/{id}/arreter` | Interrompt le tour en cours |

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

- Consignes : `atlas/orchestrateur/consignes.py`
- Sous-agents (rôles multi-agents de Codex) : `atlas/orchestrateur/sous_agents.py`
- Étapes après chaque tour (textGrapher, vérificateur…) : `atlas/orchestrateur/pipeline.py`
- Réglages : variables `ATLAS_*` et `OPENAI_API_KEY` dans `.env.example`

Connexion, dans le `CODEX_HOME` d'Atlas uniquement :

- en dev, ton compte ChatGPT : `.venv/Scripts/python -m atlas.orchestrateur.connexion` (ouvre le navigateur ;
  `--code` pour une connexion par code sur une VM, à activer dans ChatGPT → Paramètres → Sécurité ;
  `--statut` affiche le compte utilisé) ;
- en production, une clé API : renseigner `OPENAI_API_KEY` dans le `.env` suffit, elle est prioritaire.

### Sur une VM

Docker + Caddy (HTTPS) + jeton d'accès : voir [`deploiement/README.md`](deploiement/README.md).

Tout l'état utile est dans Supabase. Les threads Codex vivent dans `espace/.codex` : copier `espace/` sur la VM
les conserve ; sinon chaque conversation repart de son historique de messages, sans perte visible.
