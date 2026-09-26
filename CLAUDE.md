# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@README.md

Lint : `.venv/Scripts/ruff check .` (config `ruff.toml`) et `npm run lint --prefix frontend` (oxlint).
Un hook vérifie les types du front (`tsc --noEmit`) après chaque édition de `frontend/src/*.ts`.

## Vision

Atlas est un harnais de recherche scientifique. Dans un seul thread Codex par conversation, l'orchestrateur confie
des missions à des directeurs de labo (qui convoquent `litterature` et `experimentateur`, tiennent `journal.md` et
rédigent `rapport.md` dans `directeurs/NN-sujet/`), fait transformer chaque rapport en graphe par le `graphiste`
(nœud = assertion, démonstration = liaison depuis ses prémisses `justifie_par`), puis appelle l'outil `verifier`
qui note chaque liaison. L'UI : conversations à gauche, graphe sigma.js à droite. Rôles dans `sous_agents.py`,
prompts dans `atlas/orchestrateur/prompts/*.md` : c'est Camille qui les fait évoluer (prompt engineering).

## Modèle de graphe

- `validite` et `confiance` (note sur 1) vivent **sur la démonstration**, pas sur le nœud — même si les
  prototypes (`prototypes/graphe-3d/src/core/donnees.ts`) les mettent sur le nœud. Les prototypes s'adaptent.
- Le `statut` d'un nœud n'est jamais stocké : il est recalculé par `atlas/graphe.py` à chaque lecture.
- Toute évolution de schéma passe par une nouvelle migration dans `supabase/migrations/`, jamais en
  modifiant `20260925000000_init.sql`. Garder `atlas/modeles.py` aligné sur le SQL.
- `journal` est append-only (triggers) : on n'y fait que des `insert`.
- `noeuds.parents` / `noeuds.enfants` (parents = prémisses) sont maintenus par trigger depuis `demonstrations` :
  ne jamais les écrire. Le graphe est global ; `noeuds.conversation_id` dit seulement qui a créé le nœud.

## Architecture en production

```
navigateur ── https://atlas-nine-bay.vercel.app ── Vercel : front (frontend/dist) + api/index.py (lecture seule)
     │ /api/conversations… (VITE_API_URL + Authorization: Bearer <jeton>)
     └─→ https://2-28-235-109.sslip.io ── VM Hetzner : Caddy (HTTPS) → conteneur atlas (atlas.serveur)
                                                         └─ Codex + serveur MCP atlas
Supabase (uykaupigovrvgwsckbcn) : graphe, conversations, messages, journal — lu/écrit par Vercel, la VM et le local
```

- **Vercel** (projet `atlas`, équipe `atlas-e95e`) : redéploie la production à chaque push sur `main`. Variables :
  `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `VITE_API_URL` (intégrée au build : après modification, redéployer).
  Ne sert que la lecture : `/api/conversations` y répond 404, c'est normal.
- **VM** (Hetzner CPX32, Nuremberg, Ubuntu 26.04, serveur `atlas`, IP 2.28.235.109, accès `ssh root@2.28.235.109`
  par clé) : code dans `/opt/atlas`, `.env` propre à la VM (`ATLAS_JETON_ACCES`, `ATLAS_DOMAINE`,
  `ATLAS_CORS_ORIGINES`), volume Docker `atlas_donnees` = espace des agents + `CODEX_HOME` (connexion Codex).
  **Pas de déploiement automatique** : après un push sur `main`,
  `ssh root@2.28.235.109 "cd /opt/atlas && git pull && docker compose up -d --build"`. Guide : `deploiement/README.md`.
- **Supabase** : partagé avec la couche vocale `AtlasVoice/` (tables `taches`, `taches_evenements`, `verrous`).
  Migrations : `npx supabase db push` depuis un checkout de `main` (toutes les migrations doivent y être), avec
  `SUPABASE_ACCESS_TOKEN` et `SUPABASE_DB_PASSWORD` du `.env` local ; `--dry-run` d'abord, jamais `--include-seed`.
- **Codex** : connecté au compte ChatGPT de Camille (abonnement), en local comme sur la VM ; renseigner
  `OPENAI_API_KEY` bascule sur les crédits API au tour suivant.
- **Local** : `.env` sans `ATLAS_JETON_ACCES` (pas de contrôle), Vite proxifie `/api` vers `:8000`.
- Le jeton d'accès ne s'affiche jamais : le lire ou le vérifier sur la VM (empreinte), ne pas le mettre dans la
  conversation ni dans le build. Sans lui, les routes `/api/conversations` exposeraient un agent qui exécute des
  commandes.

Règles pour que ça reste déployable : toute config passe par des variables d'env documentées dans `.env.example`
(rien de propre à Windows en dur) ; les agents tournent dans `atlas.serveur`, jamais dans `api/` (Vercel en fait
des fonctions à durée limitée et n'installe que `requirements.txt`, le SDK agents est dans `requirements-agents.txt`) ;
l'état persiste dans Supabase.

## Agents

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

Sous-agents (multi-agents natif de Codex, testé sur 3 niveaux) : chaque rôle de `sous_agents.ROLES` devient
`[agents.<nom>]` avec une couche de config générée dans `CODEX_HOME/roles/` (modèle, effort, prompt) ; modèles
réglables par `ATLAS_MODELE_<ROLE>` / `ATLAS_EFFORT_<ROLE>`. Les rôles sont visibles de tous les agents : la
hiérarchie tient aux prompts. Un sous-agent doit être lancé avec `fork_turns = "none"` : sinon il hérite de tout
l'historique du parent, se perd, et Codex ignore le modèle de son rôle. Places simultanées :
`ATLAS_MAX_SOUS_AGENTS` (+1 pour l'orchestrateur, défaut Codex 4 au total). Le flux du thread principal ne montre
que « sous-agent démarré / terminé » : `agent.tour` intercepte donc toutes les notifications sur le routeur interne
du SDK (`_espionner`), `suivi_agents.py` en tire l'arbre (chemin `/root/…`, rôle et surnom lus par `thread/read` ;
la mission est chiffrée par Codex, on affiche le nom de tâche) et les items des sous-agents vont dans `messages`
avec `agent` = leur chemin ; l'arbre final est gardé dans `executions.agents`. Codex refuse toute entrée directe
vers un sous-agent (« direct app-server input is not allowed for multi-agent v2 sub-agents ») : un message de
Camille à un sous-agent est injecté (`steer`) dans le tour de l'orchestrateur avec `prompts/relais.md`, qui le
transmet par `send_message` / `followup_task` ; hors tour, il lance un tour de relais.
Bunker (`bunker.py`) : chaque conversation travaille dans `espace/utilisateurs/<utilisateur>/<projet>/sessions/<id>/`
(`conv/`, `docs_session/`, `scripts/`, `.tmp/`) ; Python partagé dans `espace/partage/` (`pip install` sert à toutes
les sessions) ; `shell_environment_policy.inherit = "core"` masque les secrets du serveur aux commandes en local, mais
Codex l'ignore sur la VM (les agents y voient toutes les variables, et partagent l'utilisateur Unix du serveur). Le
confinement est une consigne (`prompts/environnement.md`, ajouté à tous les agents de la session) : Camille a choisi
de ne pas restreindre la lecture techniquement. `ATLAS_BUNKER=1` ajoute un profil de permissions Codex
(`default_permissions` + `[permissions.bunker]` : lecture partout, écriture dans la session et le partage), qui ne se
combine pas avec `sandbox_mode` (ne pas passer `sandbox=` au thread) et demande `windows.sandbox = "unelevated"` sous
Windows (sinon « blocked by policy »). **La VM tourne à `ATLAS_BUNKER=0`** : sous Linux, tout sandbox Codex (profil,
`workspace_write`, même `use_legacy_landlock`) exige bubblewrap, donc des user namespaces que Docker et
`kernel.apparmor_restrict_unprivileged_userns=1` d'Ubuntu refusent ; Camille a refusé d'assouplir le noyau.
Vérificateur : serveur MCP `mcp_verificateur.py` (délai `ATLAS_DELAI_VERIFICATION`), qui lance son propre Codex
(threads éphémères, lecture seule, sortie structurée) : `ATLAS_MODELE_VERIFICATEUR` juge, et si « invalide » ou sous
`ATLAS_SEUIL_CONFIANCE`, `ATLAS_MODELE_VERIFICATEUR_RECOURS` rejuge et fait foi ; verdict écrit par
`ecriture.noter_demonstration` (validite, confiance ; justification au journal, action `verdict`).

L'ancien backend agents (chercheur, vérificateur) reste lisible via `git show 1aa2d62:backend/app/agents/…`.

## Conventions

- Tout en français : identifiants, commentaires, docstrings, textes d'UI, messages de commit.
- Python : fonctions pures (`atlas/graphe.py`) séparées des I/O (`atlas/lecture.py`) ; les tests ne touchent
  jamais le réseau (monkeypatch de `atlas.lecture`).
- TypeScript : pas de point-virgule, guillemets simples, indentation 2 espaces ; `erasableSyntaxOnly` interdit les
  propriétés déclarées dans le constructeur (`constructor(private x)`).
- Front (TS sans framework) : `api.ts` (appels, `VITE_API_URL` pour viser un serveur d'orchestrateur distant),
  `conversations.ts` (colonne centrale), `sessions.ts` (barre latérale), `agents.ts` (état partagé des agents et
  sélection = destinataire de la saisie), `arbre.ts` (arbre façon Claude Code), `agentgraph.ts` (Blueprint porté de
  `visu/vue-sous-agents`), `graphe.ts` (sigma : réglages en tête, couleurs opaques uniquement), `rendu.ts`
  (Markdown + LaTeX). Thème clair uniquement.
- Git : une branche par sujet (ex. `visu/graphe-3d`), merge dans `main`. Commits = phrase française courte,
  sans préfixe conventional-commit.

## Pièges

- Vercel ne route que `/api/*` vers `api/index.py` : toute route FastAPI garde le préfixe `/api`.
- Une branche locale s'appelle `atlas`, comme le dossier `atlas/` : utiliser `--` dans les commandes git
  sur des chemins (`git checkout -- atlas/`).
- Le dépôt est sous OneDrive : en cas d'erreur EPERM/EBUSY sur `node_modules`, suspecter la synchro.
- `prototypes/graphe-3d/` n'a pas de proxy `/api` : il tourne sur des données synthétiques. Lire
  `prototypes/graphe-3d/src/core/README.md` avant de toucher au moteur sigma.
