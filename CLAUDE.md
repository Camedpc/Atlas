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
qui note chaque liaison ; après une recherche d'ampleur, le `scribe` en rédige l'article (LaTeX compilé en PDF, dans
`doc_projet/<sujet>/papiers/NN-…/`, avec les figures et la carte du raisonnement). L'UI : conversations à gauche, graphe de raisonnement (vision R41, éditable façon Blueprint d'UE5) à droite. Rôles dans `sous_agents.py`,
prompts dans `atlas/orchestrateur/prompts/*.md` : c'est Camille qui les fait évoluer (prompt engineering).

## Modèle de graphe

- `validite` et `confiance` (note sur 1) vivent **sur la démonstration**, pas sur le nœud — même si les
  prototypes (`prototypes/graphe-3d/src/core/donnees.ts`) les mettent sur le nœud. Les prototypes s'adaptent.
- Le `statut` d'un nœud n'est jamais stocké : il est recalculé par `atlas/graphe.py` à chaque lecture.
- Toute évolution de schéma passe par une nouvelle migration dans `supabase/migrations/`, jamais en
  modifiant `20260925000000_init.sql`. Garder `atlas/modeles.py` aligné sur le SQL.
- `journal` est append-only (triggers) : on n'y fait que des `insert`.
- Espaces de travail : table `projets` (nom, description, `dossier` dans le bunker) ; `conversations.projet_id`
  (null = le projet « defaut », dossier historique du bunker). Le front arrive sur la page du dernier espace ouvert.
- Vue du graphe (2D uniquement, une par espace, façon Blueprint) : `groupes` (cadres imbricables), `placements`
  (case de grille colonne/ligne de chaque nœud, un seul cadre par nœud, `fixe` = placé à la main), `etiquettes`.
  Les rectangles des cadres ne sont pas stockés (ils englobent leurs nœuds). Règles et placement automatique
  (à droite des prémisses, sans chevauchement) dans `atlas/vue.py` (pur) ; écriture par `ecriture.organiser_vue`,
  tout ou rien, journalisée (action `vue`). Le sens reste dans `noeuds.type`, `noeuds.details` et
  `demonstrations.roles` (rôle des prémisses non principales ; `justifie_par` garde la liste complète).
- Figures (`figures`, module pur `atlas/figures.py`) : un graphique rattaché à un nœud, vectoriel (`trace` : axes,
  séries `mesures` / `courbe` / `loi` ; les lois sont évaluées sans `eval` et échantillonnées côté serveur avec leur
  bande d'incertitude) et/ou une image (bucket privé Supabase Storage « figures », servie par
  `/api/figures/{id}/image`, renvoyée en bloc image par l'outil MCP `lire_figure` : Codex la montre au modèle).
  Sa case est dans sa propre ligne (`colonne`, `ligne`…) ; dans `vue.py` elle est un pseudo-nœud `fig:<id>` dont la
  prémisse est son nœud, et elle remonte au cadre parent si le sien est trop serré (`placer_figure`). Quatre formats
  seulement (`FORMATS_FIGURE`) : 1 × 1, 2 × 1, 1 × 2 ou 2 × 2 cases, 2 × 2 par défaut.
  Un GIF ou un WebP animé est joué sur le canevas (`ImagesFigures`, `ImageDecoder`, une image décodée à la fois,
  seulement quand la figure est dessinée) ; pas de SVG. Les prompts poussent tous les agents à produire schémas,
  courbes et animations (Graphviz et pillow dans l'image Docker), et l'orchestrateur peut rattacher une figure lui-même.
  Scène 3D animée (`atlas/figures3d.py`, pur ; `figures.scene_chemin` / `scene_script`) : outil MCP `creer_figure_3d`,
  Atlas exécute lui-même le script Plotly de l'agent (`orchestrateur/figure3d.py` : processus à part, sans secrets,
  `ATLAS_DELAI_FIGURE3D`), garde la seule scène 3D et les graphiques 2D vérifiés, la range en JSON dans le bucket
  (`/api/figures/{id}/scene`). Front : case avec un cube « 3D », double-clic = mode 3D (`graphe-3d.ts`, plotly.js
  chargé à la demande, boucle, vitesse, glisser pour tourner) ; `?synthetique=N` contient une scène (pendule).
  Avant d'écrire, Atlas rend la scène telle que le front la montre (`figures3d.vue_du_front` : caméra finale =
  `layout.scene.camera.eye` de l'agent, fond blanc, marges) en 3 PNG par Kaleido (`orchestrateur/apercu3d.py`,
  Chrome dans `/opt/chrome` via `BROWSER_PATH` sur la VM) : une scène vide est refusée, sinon l'agent reçoit les
  rendus et les prompts lui interdisent de conclure sans les avoir jugés nets. Front et serveur partagent l'œil par
  défaut et les marges (à garder alignés).
- Repères (`atlas/navigation.py`, pur) : la numérotation de l'écran (« Lemme 7 », « §1.2 », « Figure 2 ») recopie
  `construireModele` de `graphe-modele.ts` ; un jeu commun (`tests/donnees/reperes.json`) est vérifié des deux
  côtés, à garder à jour si l'une change. Rien de purement visuel (cadrage, zoom, filtres) n'est enregistré ; seul un
  déplacement l'est (vue de l'espace, auteur `voix`).
- Documents (`documents`, `liens_documents`, module `atlas/documents.py`) : un fichier ou un dossier du projet
  (script, dossier de résultats, PDF, données) mis dans le graphe, pseudo-nœud `doc:<id>` d'une case, placé à droite
  des bouts de départ de ses liens entrants. Chemin relatif au dossier du projet ; aperçu (premières lignes,
  colonnes, pages, contenu du dossier) et présence calculés à l'écriture : le graphe se lit sans disque (Vercel).
  Liens nommés (`source`, `implemente`, `produit`, `ecrit_dans`, `entree`, `redige_dans`) vers un nœud, `fig:<id>` ou `doc:<id>` :
  gris et étiquetés au front, jamais des prémisses (le vérificateur ne les voit pas). Déplacer un fichier passe par
  l'outil MCP `deplacer_document` (disque puis base, tout ou rien : chemins des documents, `figures.fichier` et
  `figures.source`) ; les agents rangent leurs livrables dans `doc_projet/<sujet>/` et `scripts_projet/<sujet>/`
  (`prompts/environnement.md`), inscriptibles aussi sous `ATLAS_BUNKER=1`. Front : `graphe-documents.ts`
  (silhouettes coin corné / onglet, HTML de l'aperçu), double-clic = aperçu dans la vue Documents.
- `noeuds.parents` / `noeuds.enfants` (parents = prémisses) sont maintenus par trigger depuis `demonstrations` :
  ne jamais les écrire. `noeuds.conversation_id` dit seulement qui a créé le nœud.
- Un graphe par espace : `noeuds`, `demonstrations` et `journal` portent `projet_id` (non nul, « defaut » pour
  l'historique) ; clés `(projet_id, id)` et `(projet_id, noeud_id, nom_demonstration)`, un id n'est unique que dans
  son espace, et les triggers (prémisses, parents / enfants) ne regardent que l'espace. Toute lecture ou écriture
  (`lecture.py`, `ecriture.py`) prend le `projet_id` ; les serveurs MCP le reçoivent par `ATLAS_PROJET_ID`, les
  routes par `?projet_id=` (absent = « defaut », `projets.id_ou_defaut`).

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
Clé de l'utilisateur (réglages du front, « Clé OpenAI » dans le sélecteur de modèle) : gardée dans son navigateur,
envoyée en en-tête `X-Atlas-Cle-OpenAI`, vérifiée auprès d'OpenAI (`GET /v1/models`, Codex accepte n'importe quelle
clé), ses tours passent par un second app-server (`codex_vivant.pour_cle`, `CODEX_HOME` =
`espace/.codex-cles/<empreinte>`, supprimé par « Oublier ») ; le vérificateur reprend ce `CODEX_HOME`. Jamais en base
ni dans les messages. L'appel vocal reste sur les comptes d'Atlas (Gradium, Codex du serveur), avec ou sans clé ; ce
qu'il confie à l'orchestrateur s'injecte aussi dans un tour payé par une clé.
Pas d'outils Python en process avec Codex : les outils Atlas passent par le serveur MCP stdio
`atlas/orchestrateur/mcp_atlas.py` (lecture + écriture via `atlas/ecriture.py`, qui journalise chaque écriture),
déclaré dans `surcharges_thread()` avec `features.hooks = false`. Codex ne transmet pas tout l'environnement aux
serveurs MCP : toute variable nécessaire va dans `env_vars` (noms) ou `env` (ex. `ATLAS_CONVERSATION_ID`). Le paquet `mcp` est en 2.x : `MCPServer`, plus `FastMCP`.
Lancer le serveur avec `--reload-dir atlas --reload-dir api` en dev (sinon les fichiers écrits dans `espace/` le
redémarrent). Sous Windows, `--reload` peut rester bloqué après une rafale de modifications en laissant l'ancien
processus répondre (un ancien worker orphelin peut même garder le port et servir l'ancien code) : si un changement Python semble ignoré, tuer tous les `python.exe` du port et relancer. Un vrai tour d'agent consomme le quota Codex : les tests remplacent `agent.tour` et Supabase.

Processus Codex vivant (`codex_vivant.py`) : un seul app-server pour tout le serveur, gardé ouvert entre les tours, threads gardés chargés (`ATLAS_DUREE_THREAD_CHAUD`) — comme la CLI. Sans lui, les sous-agents mouraient à la fin du tour de l'orchestrateur (réponse jamais affichée) et chaque message coûtait ~4 s de démarrage. Le gestionnaire écoute en permanence toutes les notifications : un sous-agent qui continue après le tour (non attendu, relancé par `followup_task`) est suivi et enregistré ; `actif` (orchestrateur ou sous-agent au travail) pilote le suivi du front, `brouillons` le texte en cours d'écriture. Arrêter : tout (orchestrateur + `turn/interrupt` de chaque sous-agent, que Codex accepte en v2) ou un seul sous-agent (l'orchestrateur est prévenu par `prompts/interruption.md`, sinon il l'attend jusqu'au délai de `wait_agent`). Un message pendant le démarrage d'un tour attend qu'il soit prêt, juste après sa fin il lance le suivant (plus de 409).
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
(`<projet>` = `projets.dossier` de sa conversation, lu par `projets.dossier_de` ; la vue Documents lit ce dossier via
`routes_projets.py`, jamais au-delà)
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
Dans l'arbre et l'agent graph, il n'est pas un sous-agent Codex : son serveur MCP raconte son avancement à
`POST /api/conversations/{id}/verification` (`ATLAS_URL_INTERNE`), et `SuiviAgents.verification` en fait des agents
(`<appelant>/verification`, un juge par démonstration titré par son repère, `…/recours` s'il rejuge) ; chaque verdict
va dans le fil de son juge et du vérificateur, en lecture seule. La fin de l'outil clôt ce qui n'a pas été raconté.

Atlas voix (`atlas/voix/`) : appel vocal par WebSocket (`/api/conversations/{id}/voix`, jeton dans le premier
message), Gradium STT/TTS (`GRADIUM_API_KEY`, 3 sessions max en offre gratuite → un appel à la fois), thread Codex
éphémère `gpt-6-sol` en mode fast. Façade, pas parent : elle confie le travail à l'orchestrateur de la
conversation via le serveur MCP `voix` (qui rappelle `atlas.serveur`, `ATLAS_URL_INTERNE`) et reçoit ses étapes par
`gestionnaire.abonner` ; au raccrochage, `gestionnaire.deposer_pont` ajoute la transcription au prochain tour.
Sous `ATLAS_BUNKER=1`, un outil MCP sans `default_tools_approval_mode = "approve"` est refusé ou invisible
(approval never) : la voix le pose sur ses serveurs. Transcription dans `messages` sous l'agent `/voix`.
Écran du graphe (`atlas/voix/ecran.py`) : la voix le pilote elle-même (outils `montrer`, `vue_d_ensemble`,
`zoomer`, `effacer_ecran`, `lire_ecran`, `deplacer`) ; les références sont résolues côté serveur
(`navigation.py`), et les lots de commandes (P3) comme l'état de l'écran (P4) passent par la WebSocket de l'appel
(messages `commandes`, `compte_rendu`, `ecran`), exécutés par `pilotage/` (contrat dans `protocoles/`, origine
`voix`). Le registre et le relais d'AtlasVoice ne
servent plus à Atlas. Lecture de la voix par boucle WebRTC locale
(`voix.ts`) : en sortie Web Audio directe, l'annulation d'écho de Chrome décroche après des interruptions et la
voix s'entend en boucle. Gradium : 300 s max par session STT (renouvelée au silence, `ATLAS_VOIX_STT_DUREE`).

L'ancien backend agents (chercheur, vérificateur) reste lisible via `git show 1aa2d62:backend/app/agents/…`.

## Conventions

- Tout en français : identifiants, commentaires, docstrings, textes d'UI, messages de commit.
- Python : fonctions pures (`atlas/graphe.py`) séparées des I/O (`atlas/lecture.py`) ; les tests ne touchent
  jamais le réseau (monkeypatch de `atlas.lecture`).
- TypeScript : pas de point-virgule, guillemets simples, indentation 2 espaces ; `erasableSyntaxOnly` interdit les
  propriétés déclarées dans le constructeur (`constructor(private x)`).
- Front (TS sans framework) : `api.ts` (appels, `VITE_API_URL` pour viser un serveur d'orchestrateur distant),
  `conversations.ts` (colonne centrale), `sessions.ts` (barre latérale et sélecteur d'espace), `documents.ts`
  (arbre du bunker et aperçus, pdf.js), `agents.ts` (état partagé des agents et
  sélection = destinataire de la saisie), `arbre.ts` (arbre façon Claude Code), `agentgraph.ts` (Blueprint porté de
  `visu/vue-sous-agents`), `rendu.ts` (Markdown + LaTeX). Thème clair uniquement.
- Graphe de raisonnement (onglet de droite), porté du prototype R41 (worktree `Atlas-raisonnement`,
  `prototypes/graphe-3d/raisonnement/r41-synthese-b/`) : positions = cases de `/api/vue` (× `GRILLE` de
  `graphe-modele.ts`), jamais de mise en page côté front (les nœuds sans placement sont rangés provisoirement sous le
  reste). `graphe-modele.ts` (pur : numérotation « Lemme 7 » / « Hypothèse (ii) » dans l'ordre colonne puis ligne,
  cadres, cadres réduits en nœuds-fonctions, liaisons orthogonales dans les couloirs entre cases ; seules les prémisses
  principales et auxiliaires sont des flèches, technique et contexte = renvois « cf. »), `graphe-dessin.ts` (canevas,
  niveaux de détail z < 0,175 carrés / < 0,6 titres / contenu, culling), `graphe-contenu.ts` (HTML KaTeX des seuls
  blocs visibles : cache, pool recyclé, budget par image, mesures groupées), `graphe.ts` (caméra aux paliers de zoom
  d'UE5, zoom continu au pincement ; commandes courantes pour un non-initié : fond glissé comme une carte, Maj ou Ctrl +
  glisser = rectangle, gestes tactiles, listées dans `AIDE_COMMANDES` / `AIDE_TACTILE` et l'aide « ? », opérations
  `POST /api/projets/{id}/vue` tout ou rien, annuler / rétablir par différence d'états dans `graphe-annuler.ts`),
  `formules.ts` (extraction des formules de R41, plus le LaTeX explicite `$…$`). Texte en CMU Serif (jsdelivr,
  `graphe.css`) : les fontes KaTeX n'ont pas les accents ; ligatures coupées (« ff » sort en carré). En dev,
  `?synthetique=1000` charge un jeu synthétique en lecture seule et `window.atlasGraphe` expose la vue. Un onglet
  masqué gèle requestAnimationFrame : pour tester par script, appeler `atlasGraphe.dessinerMaintenant()`.
- Git : une branche par sujet (ex. `visu/graphe-3d`), merge dans `main`. Commits = phrase française courte,
  sans préfixe conventional-commit.

## Pièges

- Vercel ne route que `/api/*` vers `api/index.py` : toute route FastAPI garde le préfixe `/api`.
- Une branche locale s'appelle `atlas`, comme le dossier `atlas/` : utiliser `--` dans les commandes git
  sur des chemins (`git checkout -- atlas/`).
- Une migration qui fait un `update` sur `conversations` déclenche `toucher_modifie_le` et brouille l'ordre des
  sessions : couper le trigger le temps de l'`update` (voir `20260927030000_projets_dates.sql`).
- Le dépôt est sous OneDrive : en cas d'erreur EPERM/EBUSY sur `node_modules`, suspecter la synchro.
- `prototypes/graphe-3d/` n'a pas de proxy `/api` : il tourne sur des données synthétiques. Lire
  `prototypes/graphe-3d/src/core/README.md` avant de toucher au moteur sigma.
