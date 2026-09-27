# Atlas

**Un outil pour le chercheur : il dirige une équipe d'agents IA, et leur raisonnement devient un graphe qu'il
lit, vérifie, corrige et réorganise.** Atlas ne remplace pas le chercheur : il lui donne une équipe qui travaille
sous ses yeux, et le dernier mot lui revient.

![Atlas : la conversation avec l'orchestrateur à gauche, le graphe de raisonnement à droite](docs/images/01-ensemble.jpg)

---

## En bref

- **Le chercheur pose une question** (« Comment la période d'un pendule dépend-elle de l'amplitude ? »).
- **Une équipe d'agents la traite sous ses yeux** : un orchestrateur confie des missions à des *directeurs de
  labo*, qui font chercher la littérature et lancer des calculs ou des simulations, puis rédigent un rapport. Le
  chercheur suit chaque agent en direct, peut écrire à n'importe lequel en cours de route pour le réorienter, ou
  l'arrêter.
- **Un *graphiste* transforme chaque rapport en graphe de raisonnement** : chaque case est un énoncé (hypothèse,
  définition, lemme, résultat, décision…), chaque flèche une démonstration qui part de ses prémisses.
- **Un vérificateur indépendant note chaque démonstration** (valide ou non, avec une confiance entre 0 et 1).
  Le statut de chaque énoncé (*établi*, *suspendu*, *invalide*…) en découle et se propage dans tout le graphe :
  on voit d'un coup d'œil ce qui tient et ce qui repose sur une hypothèse fragile.
- **Le chercheur garde la main sur le résultat** : il ouvre chaque énoncé, voit sur quoi il repose et son
  verdict, réorganise le graphe à la souris, relance les agents là où le raisonnement est faible, et peut leur
  parler à la voix. Formules LaTeX, figures (courbes, images, animations, scènes 3D) et fichiers produits sont
  tous consultables.

**Démo en ligne** : <https://atlas-nine-bay.vercel.app> (lancer une recherche demande un jeton d'accès, à
demander à l'équipe). **Pour l'essayer chez soi** : [Démarrage rapide](#démarrage-rapide), une quinzaine de
minutes.

---

## Sommaire

1. [Démarrage rapide](#démarrage-rapide)
2. [Visite guidée](#visite-guidée)
3. [Comment ça marche](#comment-ça-marche)
4. [Installation détaillée et réglages](#installation-détaillée-et-réglages)
5. [Dépannage](#dépannage)
6. [Organisation du dépôt](#organisation-du-dépôt)
7. [Équipe](#équipe)

---

## Démarrage rapide

Tout tourne sur votre machine : une base Supabase locale (dans Docker), le serveur Python et l'interface web.
Rien ne touche la production.

### Il vous faut

| Outil | Version | Vérifier |
|---|---|---|
| Git | toute | `git --version` |
| Python | 3.10 minimum, 3.13 conseillé | `python --version` |
| Node.js | 20 ou plus | `node --version` |
| Docker Desktop | installé **et démarré** | `docker info` |
| Un accès OpenAI | une clé API (<https://platform.openai.com/api-keys>) **ou** un abonnement ChatGPT | |

### 1. Récupérer le code et les dépendances

```bash
git clone https://github.com/Camedpc/Atlas.git
cd Atlas
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt   # macOS / Linux : .venv/bin/pip
npm install                                          # outils Supabase
npm install --prefix frontend                        # interface
```

Le paquet `openai-codex` installe aussi le moteur d'agents Codex : rien d'autre à installer.

### 2. Démarrer la base locale

```bash
npm run db:local        # 1er lancement : quelques minutes (images Docker)
npm run db:local:env    # affiche API_URL et la clé secrète locale
```

La base est créée avec toutes les tables et un petit graphe de démonstration.

### 3. Remplir `.env`

```bash
cp .env.example .env
```

Dans `.env`, changez ou ajoutez ces lignes :

```ini
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SECRET_KEY=<SECRET_KEY, ou SERVICE_ROLE_KEY, affichée par npm run db:local:env>
ATLAS_BASE_LOCALE=1            # garde-fou : refuse toute base qui n'est pas locale
OPENAI_API_KEY=sk-...          # votre clé ; laissez vide si vous utilisez ChatGPT (voir ci-dessous)
ATLAS_MAX_SOUS_AGENTS=2        # conseillé pour un premier essai : moins d'agents en parallèle, moins cher
```

Sans clé API, connectez votre compte ChatGPT (une fenêtre de navigateur s'ouvre) :

```bash
.venv/Scripts/python -m atlas.orchestrateur.connexion
```

> Si votre compte n'a pas accès aux modèles par défaut, renseignez `ATLAS_MODELE_ORCHESTRATEUR` et les
> `ATLAS_MODELE_*` des agents avec des modèles disponibles (voir les commentaires de `.env.example`).

### 4. Lancer

Dans deux terminaux :

```bash
.venv/Scripts/python -m uvicorn atlas.serveur:app --port 8000 --reload --reload-dir atlas --reload-dir api
```

```bash
npm run dev --prefix frontend
```

Ouvrez <http://localhost:5173>. Vous devez voir le graphe de démonstration (« une suite croissante et majorée
converge »). Vérification rapide : `curl http://localhost:8000/api/health` répond `{"ok":true,"supabase":"ok"}`.

### 5. Première recherche

Cliquez sur **+ Nouvelle recherche** et envoyez par exemple :

> Montre que la somme de deux entiers pairs est paire, en construisant le raisonnement dans le graphe, en peu de
> nœuds.

Les messages et les appels d'outils de l'orchestrateur défilent au centre, les agents apparaissent dans
**Agent graph**, puis les nœuds arrivent dans **Graphe de raisonnement**. Un vrai tour d'agents consomme des
crédits OpenAI (ou le quota de l'abonnement ChatGPT).

Guide pas à pas, avec vérifications à chaque étape : [`docs/tester-en-local.md`](docs/tester-en-local.md).

---

## Visite guidée

L'écran a trois colonnes : **les espaces et leurs sessions** à gauche, **la conversation** au centre, et à droite
trois onglets : **Graphe de raisonnement**, **Agent graph** et **Documents**. Chaque *espace* (sélecteur en haut à
gauche) a son propre graphe et son propre dossier de fichiers ; chaque *session* est une conversation avec
l'orchestrateur.

### 1. Le graphe de raisonnement

![Graphe de raisonnement zoomé : hypothèses de modélisation, décision, puis équation du mouvement](docs/images/02-graphe.jpg)

Chaque case est un **énoncé**, numéroté comme dans un article (« Hypothèse (ii) », « Proposition 6 »,
« Définition 3 »). Les flèches vont des **prémisses** vers ce qu'elles démontrent ; les prémisses secondaires
apparaissent en renvoi (« cf. 3 ») pour ne pas surcharger le dessin. Les **cadres** colorés (§1, §2…) regroupent
les énoncés d'une même partie du raisonnement ; on peut les réduire en un seul bloc.

Le contour d'une case dit son **statut**, recalculé à chaque lecture à partir de tout le graphe :

| Contour | Statut | Signification |
|---|---|---|
| plein | **établi** | admis, ou démontré de façon valide à partir de prémisses toutes établies |
| tirets | **à vérifier** | une démonstration existe mais n'a pas encore été jugée |
| tirets espacés | **suspendu** | la démonstration est valide, mais une prémisse n'est pas (encore) établie |
| barré | **invalide** | le vérificateur a rejeté la démonstration |
| pointillés | **ouvert** | aucune démonstration pour l'instant (hypothèse de travail, conjecture) |

Le zoom change le niveau de détail : de loin, des carrés colorés et les titres des cadres ; de près, les formules
et le texte complet.

**Se déplacer** : glisser le fond comme une carte, molette pour zoomer, `0` pour tout cadrer, `F` pour cadrer la
sélection. **Réorganiser** : glisser un nœud (il se range case par case), `C` pour créer un cadre autour de la
sélection, clic droit pour le menu, `Ctrl+Z` pour annuler. Le bouton **?** en haut à droite liste toutes les
commandes, souris et tactile. La case **Cette conversation** n'affiche que les nœuds créés par la session ouverte.

### 2. La fiche d'un énoncé et son verdict

![Fiche de la Proposition 6 : énoncé, prémisses, démonstration vérifiée avec une confiance de 0,99](docs/images/03-fiche.jpg)

Un **double-clic** sur une case ouvre sa fiche : l'énoncé complet, ses prémisses et les énoncés qui l'utilisent
(cliquables), puis chaque démonstration avec son **verdict** (« vérifiée · c = 0,99 ») et le rôle de chaque
prémisse (principale, auxiliaire, technique, contexte). Le verdict vient du vérificateur : un premier modèle
juge chaque démonstration ; si elle est jugée invalide ou avec une confiance trop faible, un second modèle plus
puissant la rejuge et c'est son avis qui compte.

### 3. Les décisions

![Figure illustrant une décision : deux conventions de coordonnées pour le même mouvement](docs/images/04-decision.jpg)

Quand un raisonnement fait un **choix** (quel modèle, quelle convention, quelle méthode), le graphiste le pose
comme un nœud *décision*, dessiné en losange : sa fiche donne la question, les options et les raisons du choix, et
des flèches partent vers la branche de chaque option. Une décision n'a pas à être démontrée : elle est toujours
établie, et tout ce qui en dépend l'est sous cette condition.

### 4. Les figures

![Deux figures vectorielles rattachées au Calcul 18 : altitude et vitesse au cours de la chute](docs/images/05-figures.jpg)

Un énoncé peut porter des **figures**, placées à côté de lui et reliées par un pointillé. Elles sont soit
**vectorielles** (mesures avec barres d'erreur, courbes, lois tracées avec leur bande d'incertitude, rendues
comme dans un article LaTeX), soit des **images** produites par les agents (schémas, graphiques matplotlib,
diagrammes Graphviz, GIF et WebP animés joués dans le graphe). Double-clic pour l'ouvrir en grand.

![Figure image : schéma et courbes du lâcher, produite par un agent](docs/images/06-schema.jpg)

### 5. Les figures 3D animées (branche `visu/figures-3d`)

![Scène 3D d'un pendule simple, avec les énergies et l'angle tracés en direct à côté](docs/images/07-figure-3d.jpg)

Un agent peut aussi produire une **scène 3D animée** (Plotly) : Atlas exécute son script à part (sans secrets,
durée bornée), vérifie la scène et la range comme une figure. Dans le graphe, elle apparaît comme une case
marquée d'un cube « 3D » ; **double-cliquer** fait plonger la caméra dans la scène, qui tourne en boucle (vitesse
×0,5 / ×1 / ×2, glisser pour tourner autour), avec ses graphiques 2D synchronisés à côté.

![La case d'une figure 3D dans le graphe, à droite](docs/images/08-case-3d.jpg)

Cette fonction est sur la branche `visu/figures-3d`, pas encore fusionnée dans `main`. Pour l'essayer sans lancer
d'agent : `git switch visu/figures-3d`, puis `npm run db:local:reset` (la branche ajoute une migration),
relancez le serveur et ouvrez <http://localhost:5173/?synthetique=40> : un graphe synthétique en lecture seule,
qui contient la scène du pendule.

### 6. Les agents au travail

![Agent graph : l'orchestrateur, un directeur de labo et ses deux sous-agents, et le graphiste](docs/images/09-agent-graph.jpg)

L'onglet **Agent graph** montre en direct qui fait quoi : la question, l'orchestrateur, les directeurs de labo
qu'il a lancés et leurs propres sous-agents (littérature, expérimentateur), le graphiste. Chaque bloc donne son
état, sa durée, ses jetons et son résultat. **Cliquer sur un agent** en fait le destinataire de la saisie : votre
message lui est transmis pendant qu'il travaille. Le bouton d'arrêt stoppe tout, ou un seul agent.

Au centre, la conversation affiche la réponse de l'orchestrateur (Markdown et LaTeX), ses étapes et chacun de
ses appels d'outils, dépliables. Le sélecteur sous la saisie choisit le modèle et l'effort de raisonnement ; on
peut y mettre sa propre clé OpenAI, gardée dans le navigateur.

### 7. Les documents

L'onglet **Documents** montre le dossier de l'espace : rapports et journaux des directeurs de labo, scripts,
données CSV, figures, PDF, avec un aperçu de chaque fichier.

### 8. Parler à Atlas

![Session lancée à la voix : la demande transmise par Atlas voix à l'orchestrateur](docs/images/10-voix.jpg)

Le bouton **micro** de la saisie ouvre un appel avec **Atlas voix** (demande une clé
[Gradium](https://gradium.ai) : `GRADIUM_API_KEY`). On parle en continu, on peut lui couper la parole ; elle
confie les recherches à l'orchestrateur, annonce ses étapes clés dans les silences, et peut piloter l'écran du
graphe (« montre-moi le lemme 7 », « vue d'ensemble »). Au raccrochage, la transcription est jointe au prochain
message de la conversation.

---

## Comment ça marche

```
Question ─► Orchestrateur ─┬─► Directeur de labo ─┬─► Littérature      (sources, état de l'art)
                           │   (journal, rapport)  └─► Expérimentateur  (code, simulations, figures)
                           ├─► Graphiste           rapport ─► nœuds, démonstrations, cadres, figures
                           ├─► Vérificateur        note chaque démonstration (validité, confiance)
                           └─► Réponse à l'utilisateur
```

- **Agents** : [Codex](https://github.com/openai/codex) piloté par son SDK Python, un thread par conversation,
  sous-agents natifs de Codex. Rôles, modèles et efforts dans `atlas/orchestrateur/sous_agents.py`, consignes de
  chaque agent dans `atlas/orchestrateur/prompts/`.
- **Outils** : les agents lisent et écrivent le graphe par un serveur MCP (`atlas/orchestrateur/mcp_atlas.py`) ;
  chaque écriture est journalisée. Chaque conversation travaille dans son propre dossier.
- **Graphe** : stocké dans Supabase (Postgres). Le statut des nœuds n'est jamais stocké, il est recalculé à
  chaque lecture (`atlas/graphe.py`) ; un cycle de démonstrations ne peut pas s'auto-valider.
- **Interface** : TypeScript sans framework (Vite), graphe dessiné sur canevas avec KaTeX.
- **En production** : le site et la lecture du graphe sur Vercel, les agents sur une VM (Docker + Caddy),
  Supabase entre les deux. Guide : [`deploiement/README.md`](deploiement/README.md).

Référence complète (routes de l'API, modèle de données, bunker des agents, voix) :
[`docs/technique.md`](docs/technique.md).

---

## Installation détaillée et réglages

- **Pas à pas complet**, avec les règles de sécurité et la vérification de chaque étape :
  [`docs/tester-en-local.md`](docs/tester-en-local.md).
- **Tous les réglages** sont des variables d'environnement, commentées dans [`.env.example`](.env.example).
  Les principales :

| Variable | Rôle |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | la base (locale en développement) |
| `OPENAI_API_KEY` | clé OpenAI ; vide = compte ChatGPT connecté par `atlas.orchestrateur.connexion` |
| `ATLAS_MODELE_*`, `ATLAS_EFFORT_*` | modèle et effort de chaque agent (orchestrateur, directeur, littérature, expérimentateur, graphiste, vérificateur) |
| `ATLAS_MAX_SOUS_AGENTS` | nombre de sous-agents simultanés |
| `ATLAS_SEUIL_CONFIANCE` | en dessous, le verdict est rejugé par le modèle de recours |
| `GRADIUM_API_KEY` | voix (facultatif) |
| `ATLAS_BUNKER` | `1` : le sandbox de Codex limite les écritures des agents à leur dossier |

**Au quotidien**

| Besoin | Commande |
|---|---|
| Repartir d'une base propre | `npm run db:local:reset` |
| Arrêter la base locale | `npm run db:local:stop` |
| Tests (sans réseau ni base) | `.venv/Scripts/python -m pytest -q` et `npm test --prefix frontend` |
| Lint | `.venv/Scripts/ruff check .` et `npm run lint --prefix frontend` |

---

## Dépannage

| Symptôme | Solution |
|---|---|
| `docker info` échoue | démarrer Docker Desktop, attendre qu'il soit prêt, relancer `npm run db:local` |
| Ports 54321 à 54324 déjà pris | un autre projet Supabase tourne : `npx supabase stop --all` |
| « ATLAS_BASE_LOCALE est activé mais SUPABASE_URL pointe vers… » | `.env` vise une base distante : remettre `SUPABASE_URL=http://127.0.0.1:54321` |
| « Codex n'est pas connecté » | `OPENAI_API_KEY` vide ou mal collée, ou lancer `python -m atlas.orchestrateur.connexion` |
| Modèle introuvable ou non autorisé | renseigner les `ATLAS_MODELE_*` avec des modèles de votre compte |
| Le graphe reste vide | vérifier `curl http://localhost:8000/api/health` ; le front attend l'API sur le port 8000 |
| Un changement Python semble ignoré (Windows) | arrêter tous les processus du port 8000 et relancer le serveur |
| Erreur EPERM / EBUSY sur `node_modules` | dossier synchronisé (OneDrive…) : mettre la synchronisation en pause |

---

## Organisation du dépôt

| Dossier | Contenu |
|---|---|
| `atlas/` | cœur Python : modèles, calcul des statuts, lecture et écriture du graphe, vue, figures |
| `atlas/orchestrateur/` | agents Codex, prompts, serveurs MCP, vérificateur |
| `atlas/voix/` | Atlas voix (appel vocal) |
| `atlas/serveur.py` | serveur complet (lecture, conversations, agents) |
| `api/index.py` | API en lecture seule, déployée sur Vercel |
| `frontend/` | interface web |
| `supabase/` | schéma (`migrations/`) et données de démonstration (`seed.sql`) |
| `tests/` | tests Python, sans réseau |
| `deploiement/` | installation sur une VM (Docker, Caddy) |
| `film/` | film de présentation (Remotion), voir `film/README.md` |
| `docs/` | guide d'installation locale, référence technique, captures |

---

## Équipe

*(noms à compléter)*
