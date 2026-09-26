# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@README.md

Lint : `.venv/Scripts/ruff check .` (config `ruff.toml`) et `npm run lint --prefix frontend` (oxlint).
Un hook vérifie les types du front (`tsc --noEmit`) après chaque édition de `frontend/src/*.ts`.

## Vision

Atlas est un harnais de recherche scientifique : un orchestrateur mène une recherche, l'agent textGrapher
transforme le raisonnement en graphe (nœud = assertion, démonstration = liaison depuis ses prémisses
`justifie_par`), puis le vérificateur note chaque liaison. L'UI cible : conversations à gauche, graphe
sigma.js à droite. L'orchestrateur existe (`atlas/orchestrateur/`) ; textGrapher et vérificateur se brancheront
dans `pipeline.py`, les sous-agents dans `sous_agents.py` — c'est Camille qui les définit, ne pas les inventer.

## Modèle de graphe

- `validite` et `confiance` (note sur 1) vivent **sur la démonstration**, pas sur le nœud — même si les
  prototypes (`prototypes/graphe-3d/src/core/donnees.ts`) les mettent sur le nœud. Les prototypes s'adaptent.
- Le `statut` d'un nœud n'est jamais stocké : il est recalculé par `atlas/graphe.py` à chaque lecture.
- Toute évolution de schéma passe par une nouvelle migration dans `supabase/migrations/`, jamais en
  modifiant `20260925000000_init.sql`. Garder `atlas/modeles.py` aligné sur le SQL.
- `journal` est append-only (triggers) : on n'y fait que des `insert`.
- `noeuds.parents` / `noeuds.enfants` (parents = prémisses) sont maintenus par trigger depuis `demonstrations` :
  ne jamais les écrire. Le graphe est global ; `noeuds.conversation_id` dit seulement qui a créé le nœud.

## Agents : local d'abord, VM ensuite

Les agents tournent d'abord sur la machine de Camille, puis migreront sur une VM cloud. Pour que la
migration reste triviale :
- toute config (clés, modèles, URL, ports, chemins) passe par des variables d'env lues au même endroit,
  documentées dans `.env.example` ; rien de spécifique à Windows ou à la machine en dur ;
- les agents tournent dans `atlas.serveur` (process longue durée), jamais dans `api/` : Vercel déploie chaque
  fichier de `api/` en fonction à durée limitée et n'installe que `requirements.txt` (le SDK agents est dans
  `requirements-agents.txt`) ; le front ne doit dépendre que d'une URL d'API configurable ;
- l'état persiste dans Supabase, pas sur disque local.

L'orchestrateur est Codex via son SDK Python officiel `openai-codex` (pas `openai-codex-sdk`, sans dépôt officiel) :
`Sandbox.full_access` + `ApprovalMode.deny_all` (jamais de demande d'approbation), un thread par conversation.
Isolation totale de la machine (produit destiné à une VM) : `CODEX_HOME` dédié (`espace/.codex`),
`project_root_markers = []` ; ne jamais retomber sur `~/.codex`. Connexion : compte ChatGPT de Camille en dev
(`python -m atlas.orchestrateur.connexion`), `OPENAI_API_KEY` en production — la clé, si présente, est prioritaire.
Pas d'outils Python en process avec Codex : les outils Atlas passent par le serveur MCP stdio
`atlas/orchestrateur/mcp_atlas.py` (lecture + écriture via `atlas/ecriture.py`, qui journalise chaque écriture),
déclaré dans `surcharges_thread()` avec `features.hooks = false`. Codex ne transmet pas tout l'environnement aux
serveurs MCP : toute variable nécessaire va dans `env_vars` (noms) ou `env` (ex. `ATLAS_CONVERSATION_ID`). Le paquet `mcp` est en 2.x : `MCPServer`, plus `FastMCP`.
Lancer le serveur avec `--reload-dir atlas --reload-dir api` en dev (sinon les fichiers écrits dans `espace/` le
redémarrent). Sous Windows, `--reload` peut rester bloqué après une rafale de modifications en laissant l'ancien
processus répondre : si un changement Python semble ignoré, tuer le port 8000 et relancer. Un vrai tour d'agent consomme le quota Codex : les tests remplacent `agent.tour` et Supabase.

L'ancien backend agents (chercheur, vérificateur) reste lisible via `git show 1aa2d62:backend/app/agents/…`.

## Conventions

- Tout en français : identifiants, commentaires, docstrings, textes d'UI, messages de commit.
- Python : fonctions pures (`atlas/graphe.py`) séparées des I/O (`atlas/lecture.py`) ; les tests ne touchent
  jamais le réseau (monkeypatch de `atlas.lecture`).
- TypeScript : pas de point-virgule, guillemets simples, indentation 2 espaces ; `erasableSyntaxOnly` interdit les
  propriétés déclarées dans le constructeur (`constructor(private x)`).
- Front (TS sans framework) : `api.ts` (appels, `VITE_API_URL` pour viser un serveur d'orchestrateur distant),
  `conversations.ts`, `graphe.ts` (sigma : réglages en tête, couleurs opaques uniquement), `rendu.ts` (Markdown + LaTeX).
- Git : une branche par sujet (ex. `visu/graphe-3d`), merge dans `main`. Commits = phrase française courte,
  sans préfixe conventional-commit.

## Pièges

- Vercel ne route que `/api/*` vers `api/index.py` : toute route FastAPI garde le préfixe `/api`.
- Une branche locale s'appelle `atlas`, comme le dossier `atlas/` : utiliser `--` dans les commandes git
  sur des chemins (`git checkout -- atlas/`).
- Le dépôt est sous OneDrive : en cas d'erreur EPERM/EBUSY sur `node_modules`, suspecter la synchro.
- `prototypes/graphe-3d/` n'a pas de proxy `/api` : il tourne sur des données synthétiques. Lire
  `prototypes/graphe-3d/src/core/README.md` avant de toucher au moteur sigma.
