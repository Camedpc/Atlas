# Cahier des charges — chaîne voix → commandes → affichage

Document unique, à donner tel quel à Claude Code. Il décrit l'architecture cible, ce qui existe déjà
(vérifié le 26/09/2026), les décisions prises, et **un protocole par liaison**, pour que chaque brique
se code, se teste et se remplace **séparément**. Lire aussi `CLAUDE.md`, `AtlasVoice/README.md`,
`AtlasVoice/docs/contrat-agents.md`, `prototypes/graphe-3d/RAISONNEMENT.md` et
`prototypes/graphe-3d/src/raisonnement/README.md`.

## 0. Décisions prises

| Sujet | Décision |
|---|---|
| Moteur d'affichage | **`src/raisonnement`** (graphe de lecture, gauche → droite, 2D avec bascule 3D), pas le cube `src/core` |
| Où vit l'affichage | **Il remplace `frontend/src/graphe.ts`** (sigma 2D actuel) dans l'application Atlas |
| Relais des commandes d'affichage | **Dans le backend d'AtlasVoice** (`AtlasVoice/backend/app/affichage/`) |
| Agent moyen 2 / agent navigateur | **Un seul agent navigateur** : il prend les tâches `navigateur` dans le registre (plus d'agent moyen 2 ni de P2) |

## 1. Architecture cible

```
            Gradium (STT / TTS, via Gradbot)
 parole ◀──────────────────────────────────▶ texte                                   [P0]
                                               │ agent moyen 1 (Atlas vocal)
                                               ▼
                         tâches du registre (texte brut du tour)                     [P1]
                           │ type navigateur                        │ autres types
                           │                                        │  (hors périmètre)
                           │                                        ▼
                           │ agent navigateur (modèle)     noyau calculatoire (agents)
                           │                                        │ écrit en base
                           ▼                                        ▼
               commandes bas niveau      [P3]  ◀── données du graphe (GET /api/graphe) [P5]
                           │ programme déterministe (frontend)
                           ▼
                       affichage ──── état d'affichage ────▶ relais ──▶ navigateur, Atlas  [P4]
```

Principes :

1. **Une liaison = un protocole versionné** (`version` dans chaque message), décrit par un JSON Schema
   dans `protocoles/` (racine du dépôt), avec des exemples dans `protocoles/exemples/`. Python (Pydantic)
   et TypeScript valident les mêmes exemples : c'est le test de contrat qui permet de coder chaque brique
   seule.
2. **Calcul et affichage ne se parlent jamais directement.** Le noyau calculatoire écrit dans Supabase ;
   l'affichage ne lit que `GET /api/graphe` (et `/api/noeuds/{id}`). Aucune commande d'affichage ne
   modifie les données ; aucun agent de calcul n'envoie de commande d'affichage.
3. **Plus on descend, plus c'est déterministe** : les agents (LLM) s'arrêtent aux commandes bas niveau ;
   le programme d'affichage ne contient aucun appel à un modèle.
4. **Identifiants stables uniquement** dans les protocoles : id de nœud (`noeuds.id`, slug `^[a-z0-9_]+$`) et UUID de conversation.
   Jamais les index de point du moteur (`p`) : ils changent à chaque dérivation (`definirStrategie`
   reconstruit le graphe sigma) et une étape fusionnée regroupe plusieurs nœuds.
5. Conventions du dépôt : tout en français, config par variables d'env (`.env.example`), tests sans réseau.

**Périmètre** : P1 (compléments), P3, P4, l'agent navigateur, le relais, le programme
déterministe et le nouvel affichage du front. **Hors périmètre** : les agents du noyau calculatoire
(définis par Camille, ne pas les inventer) et les champs de données qui leur reviennent en base.

## 2. État des lieux (vérifié)

### 2.1 Parole ↔ texte ↔ commandes haut niveau : **en place, avec trois manques**

`AtlasVoice/` fait déjà : navigateur → WebSocket `/ws/atlas` (audio Opus) → Gradbot (Gradium STT/TTS,
voix française) → modèle d'Atlas (Claude Haiku 4.5 par défaut) → 6 outils → **registre des tâches**
(Postgres + LISTEN/NOTIFY, ou mémoire). Le chat texte crée les mêmes tâches par `POST /api/taches`
(canal `texte`). Une tâche (`backend/app/registre/modele.py`) porte `demande_brute`, `reformulation`,
`type_agent`, `contexte` : c'est bien une « commande haut niveau ». Les agents les consomment via
`/api/agents/*` (`docs/contrat-agents.md`, client `backend/app/agents/contrat.py`).

| # | Manque | Où | Conséquence |
|---|---|---|---|
| M1 | Pas de branche navigation : `type_agent ∈ {explorateur, editeur_graphe, conversation}` (liste fermée dans `modele.py`, `outils.py`, `api/taches.py` et la contrainte `check` de `supabase/migrations/20260926000000_registre_taches.sql`) | registre | « Montre-moi la lignée du lemme X » part chez l'explorateur, qui répond à l'oral au lieu d'afficher |
| M2 | Le texte n'est pas **découpé** : `demande_brute` = la phrase entière (`session.derniere_demande`), copiée telle quelle dans chaque tâche si Atlas en lance plusieurs | `voix/outils.py`, `voix/session.py` | L'agent ne sait pas quelle partie de la phrase le concerne |
| M3 | Le `contexte` ne connaît pas l'écran : seulement `graphe_actif`, `conversation_active`, `derniers_echanges` | `registre/modele.py` | « Ouvre celui-là », « zoome ici » sont irrésolubles |

### 2.2 Séparation calcul / affichage : **partielle**

Moteur retenu : `prototypes/graphe-3d/src/raisonnement` (≈ 4 000 lignes). Il réutilise sans les modifier
`src/core/{camera3d, controles, gizmo, reglages, anim, apparence, maths, ui/dom}`. Dépendances :
`sigma`, `graphology`, `@dagrejs/dagre`, `elkjs` (chargé à la demande), `tweakpane` et
`@tweakpane/plugin-essentials`.

Ce qui est bon :
- rendu déterministe piloté par une **API impérative** : `definirStrategie`, `definirParametresLecture`,
  `montrerLiensComplets`, `definirMode('2d'|'3d')`, `allerVue`, `selectionner`, `montrerPortee`,
  `cadrer`/`cadrerTout`/`cadrerSelection`, `definirSurvol`, `definirTheme`, `camera.orbiter/zoomer`,
  `redisposer`, événements `vue.on(...)` ; `vue.pointDeNoeud(i)` / `vue.noeud(p)` font le lien avec les nœuds ;
- données lues par un adaptateur (`depuisApiAtlas()` / `chargerJeu()`, repli synthétique) ;
- `vue.avancer(ms)` pour piloter en test.

Ce qui manque :

| # | Manque | Conséquence |
|---|---|---|
| S1 | Aucun **protocole de commandes** sérialisable : seulement des appels de méthodes | Un agent distant ne peut pas piloter l'affichage |
| S2 | L'API prend des **index de point**, pas des ids | Commandes non rejouables, cassées par un changement de stratégie |
| S3 | Aucun **export de l'état d'affichage** | Le navigateur et Atlas agissent à l'aveugle |
| S4 | Jeu de données figé à la création de la vue : pas de `remplacerJeu` | L'affichage ne suit pas le calcul (le front actuel relit le graphe pendant une exécution) |
| S5 | **Pas de filtres** dans ce moteur (le cube en avait) ; le front actuel filtre par conversation | À ajouter dans le front, par réducteur |
| S6 | Le moteur a son propre modèle : `statut ∈ {valide, incertain, refute}`, `type`, `sousProbleme`, `piste`, `validation`, `confiance`, rôles de prémisses sur le nœud. Atlas a 5 statuts (`etabli`, `suspendu`, `a_verifier`, `invalide`, `ouvert`), recalculés par `atlas/graphe.py`, et `validite`/`confiance` **sur la démonstration** | L'adaptateur doit suivre le modèle Atlas (règle de `CLAUDE.md` : les prototypes s'adaptent), dériver le reste ou afficher « non renseigné » |
| S7 | Le moteur n'est pas dans le front : il vit dans `prototypes/` (TypeScript 7, Vite 8), le front est en TypeScript ~6 avec `noUnusedLocals`, `erasableSyntaxOnly` | Portage à faire (B6) |

## 3. Protocoles

Format commun : JSON UTF-8, champ `version` (entier, 1 pour commencer), dates ISO 8601 UTC, champs en
`snake_case` français ; champs inconnus refusés, champ facultatif absent plutôt que `null`. Schémas et
exemples : `protocoles/` (ils font foi). Un message invalide est **refusé avec une erreur structurée**, jamais ignoré :

```ts
interface ErreurProtocole { code: 'invalide' | 'introuvable' | 'ambigu' | 'etat_invalide' | 'delai'; message: string; details?: unknown }
```

Références stables (P3, P4) :

```ts
type RefNoeud = { noeud: string }              // noeuds.id : slug ^[a-z0-9_]+$
type RefConversation = { conversation: string } // les nœuds créés par cette conversation (noeuds.conversation_id)
type Cible = RefNoeud | RefConversation
```

Un nœud fusionné dans une **étape** (chaîne linéaire) est désigné par son propre id ; le programme
déterministe agit sur le point qui le contient.

### P0 — Parole ↔ texte (existant, ne pas changer)

WebSocket `/ws/atlas` d'AtlasVoice. Client → serveur : `start {jeton, contexte}`, audio Opus binaire,
`contexte {…}`, `veille {active}`, `stop`. Serveur → client : `session_prete`, messages Gradbot (audio,
transcriptions), `fin_demandee`, `error`. **Aucun ajout** : l'état de l'écran est lu côté serveur dans le
relais (P4), pas envoyé par le client vocal. Le client vocal et l'écran du graphe peuvent donc être deux
pages différentes.

### P1 — Texte → commande haut niveau (existant, à compléter)

L'enveloppe reste la **tâche du registre**. Ajouts :

| Champ | Type | Rôle |
|---|---|---|
| `type_agent` | + `"navigateur"` | Nouvelle branche. **Nouvelle** migration SQL (ne jamais toucher l'ancienne) qui remplace la contrainte `check` ; mettre à jour `TYPES_AGENT`, l'`enum` de `lancer_tache`, `NouvelleTache`, le prompt d'Atlas (« montre, affiche, zoome, déplie, filtre, cadre, reviens à la vue… → navigateur ») et `bench/enonces.jsonl` (énoncés de navigation + pièges navigation / explorateur). |
| `extrait` | `string` | **Le segment de la demande brute qui concerne cette commande** (découpage). Paramètre requis de `lancer_tache`, rempli par Atlas ; `demande_brute` garde la phrase entière et fait toujours foi. Côté serveur : vérifier que `extrait` est une sous-chaîne (après normalisation) de `demande_brute`, sinon le remplacer par `demande_brute`. Colonne ajoutée par la même migration. |
| `contexte.affichage` | `EtatResume \| null` | Rempli **par le serveur** à la création de la tâche, depuis le relais (dernier écran actif de l'utilisateur). Même chose pour le prompt d'Atlas : une ligne « À l'écran : … » à côté de la liste des tâches. |

Règles propres aux tâches `navigateur` : pas de confirmation (rien n'est écrit en base), pas de verrou,
`resultat_oral` d'une phrase au plus (« C'est affiché. »), budget de bout en bout **< 1,5 s** entre la fin
de phrase et le premier mouvement à l'écran. Ambiguïté (« lequel des deux lemmes ? ») → `besoin_precision`.

### P2 — (supprimé)

Plus d'agent moyen 2 : l'agent navigateur prend lui-même les tâches `navigateur` du registre (P1), avec tout le
texte brut du tour (`demande_brute`, morceaux de transcription réunis) et l'extrait d'Atlas comme indice.

### P3 — Commandes de navigation → commandes bas niveau (agent navigateur → écran)

L'agent navigateur **comprend** le texte brut avec un modèle, sur les vraies données (`GET /api/graphe`
avec prémisses et conséquences, `GET /api/conversations`) et sur l'état d'affichage (P4), puis choisit ses
outils : les commandes ci-dessous. S'il ne sait pas lequel choisir, il pose la question via `besoin_precision`
sur sa tâche ; jamais de choix au hasard.

```ts
interface LotCommandes {
  version: 1
  lot_id: string                       // UUID, pour le compte rendu et l'idempotence
  ecran: string                        // identifiant de l'écran piloté
  origine: 'navigateur' | 'interface' | 'test'
  tache_id?: number
  atomique?: boolean                   // défaut true : tout ou rien (validation avant exécution)
  emis_le?: string                     // horodatage ISO UTC, pour mesurer la latence
  commandes: CommandeBas[]             // vide permis : le compte rendu renvoie l'état courant
}
type CommandeBas =
  // lecture du graphe
  | { op: 'strategie'; id: 'defaut' | 'roles' | 'roles_aux' | 'transitive' | 'chaines' | 'complet' }
  | { op: 'parametres_lecture'; patch: Partial<ParametresLecture> }   // types de lecture.ts, clés en snake_case
  | { op: 'liens_complets'; oui: boolean }
  // caméra
  | { op: 'mode'; mode: '2d' | '3d' }
  | { op: 'vue'; nom: 'dessus' | 'dessous' | 'face' | 'arriere' | 'droite' | 'gauche' | 'iso' }
  | { op: 'orbiter'; d_azimut_deg: number; d_elevation_deg: number }  // 3D seulement
  | { op: 'zoomer'; facteur: number }                                 // > 1 rapproche
  | { op: 'cadrer'; cibles: Cible[] | 'tout' | 'selection' }
  // mise en avant
  | { op: 'selectionner'; cible: RefNoeud | null }                    // lignée
  | { op: 'portee'; cible: RefNoeud }                                 // montrerPortee
  | { op: 'surligner'; cibles: RefNoeud[] }                           // [] efface
  | { op: 'filtres'; patch: Partial<EtatFiltres> }                    // fusion ; {} ne change rien
  | { op: 'effacer_filtres' }
  // interface
  | { op: 'fiche'; cible: RefNoeud | null }                           // panneau de détail du front
  | { op: 'panneau'; ouvert: boolean }
  | { op: 'theme'; theme: 'clair' | 'sombre' }
  // état et données
  | { op: 'restaurer'; etat: EtatAffichage }                          // pour « revenir »
  | { op: 'recharger_donnees' }
interface EtatFiltres {
  conversation: string | null          // UUID ; remplace le filtre « cette conversation » du front actuel
  noeuds: string[]                     // liste explicite des nœuds à garder (vide = pas de filtre par liste)
  statuts: string[]; types: string[]   // vides = pas de filtre
  periode: { debut: string | null; fin: string | null }
  texte: string
  mode: 'masquer' | 'estomper'
}
```

Pas de table fixe : le navigateur choisit ses commandes. Le code garde ce qui doit être sûr (ids existants,
lot validé, `restaurer` rempli depuis la pile de 20 états par écran). Côté
navigateur seulement, `filtres.patch.autour: [{noeud, etendue: lignee | premisses | consequences | seul}]`
est calculé sur le graphe et remplacé par la liste `noeuds` avant l'envoi à l'écran.

### P4 — Écran → état d'affichage (retour)

```ts
interface EtatAffichage {
  version: 1
  ecran: string
  utilisateur_id: string
  version_donnees: string              // empreinte du graphe chargé (max(modifie_le) + nb de nœuds)
  strategie: string
  parametres_lecture: Partial<ParametresLecture>   // seulement les surcharges
  liens_complets: boolean
  camera: { mode: '2d' | '3d'; vue: string | null; orientation: [number, number, number, number];
            cible: [number, number, number]; distance: number }
  selection: RefNoeud | null
  portee: RefNoeud | null
  surlignes: string[]
  filtres: EtatFiltres
  fiche: RefNoeud | null
  panneau_ouvert: boolean
  theme: 'clair' | 'sombre'
  visibles: { noeud: string; libelle: string; x: number; y: number }[]  // ≤ 50 plus importants, px écran
  survol: RefNoeud | null
  conversation_affichee: string | null  // conversation ouverte dans le panneau gauche du front
}
type EtatResume = Pick<EtatAffichage, 'ecran' | 'strategie' | 'selection' | 'filtres' | 'conversation_affichee'> & {
  mode: '2d' | '3d'
  visibles: { libelle: string }[]       // ≤ 15 : pour Atlas (P1) et le contexte des tâches
}
```

L'état est envoyé au relais après chaque lot **et** après chaque action souris / clavier / tactile (au
plus 4 par seconde) : l'utilisateur et les agents partagent le même écran. `restaurer(etat)` puis un nouvel
export doit redonner le même état (hors `visibles` et `survol`).

### P5 — Données du graphe (lecture seule)

Inchangé : `GET /api/graphe`, `GET /api/noeuds/{id}` (`atlas/routes_lecture.py`, modèles dans
`atlas/modeles.py`). L'adaptateur du front est le **seul** endroit qui connaît ce format et le
traduit vers le modèle du moteur :
- `statut` : les **5 statuts Atlas** sont conservés tels quels (le moteur est adapté, pas l'inverse) ;
- `validite` et `confiance` restent **par démonstration** ; la fiche les montre par démonstration ; une
  valeur agrégée pour la couleur du nœud (ex. meilleure démonstration) est calculée dans l'adaptateur ;
- `type`, `sousProbleme`, `piste`, rôles de prémisses, décisions, choix de modélisation : absents en base
  → dérivés quand c'est sûr (`admis` → fondation, sans enfant → résultat…), sinon « non renseigné ».
  Ne pas ajouter de colonnes : c'est une décision du noyau calculatoire.

Détection des changements : `version_donnees` comparée pendant les exécutions de l'orchestrateur (même
rythme que le front actuel, `INTERVALLE_GRAPHE_MS`) et sur `recharger_donnees` ; au rechargement, l'état
d'affichage est réappliqué par identifiants stables.

## 4. Briques à coder (chacune testable seule)

### B1 — Compléments P1 dans AtlasVoice
Type `navigateur`, champ `extrait`, `contexte.affichage` rempli depuis le relais, ligne « À l'écran » du
prompt, migration, énoncés de bench. Tests : `test_outils.py` (extrait valide / invalide / absent),
`test_api.py` (création `navigateur`), bench relancé : aucune régression sur les autres types, ≥ 90 % de
routage correct sur les énoncés de navigation.

### B2 — (supprimé : l'agent navigateur prend les tâches lui-même)

### B3 — Agent navigateur (P1 → P3)
`AtlasVoice/backend/app/agents/navigation/navigateur.py`. Il prend les tâches `navigateur` du registre via
`ClientRegistre`, les mène jusqu'au bout (résultat « C'est affiché. », question, échec). Un modèle puissant
(`ATLAS_NAVIGATEUR_LLM_*`, gpt-5.5 par défaut) reçoit le texte brut, tout l'écran, le graphe (nœuds avec
prémisses et conséquences), les conversations et l'historique des demandes précédentes sur cet écran ; il
comprend librement ce que l'utilisateur veut voir et répond par ses outils (commandes P3) ou par une question.
Le code ne tient que le non négociable (ids, validité, `autour`, pile `revenir`) et redonne un essai au modèle
si sa sortie n'est pas exécutable. Tests : modèle factice, graphe et état de fixture, sans réseau.

### B4 — Relais d'affichage (transport P3, P4), dans AtlasVoice
`AtlasVoice/backend/app/affichage/` + routeur monté dans `main.py`. État en mémoire (éphémère : l'état
d'un écran n'a pas à survivre à un redémarrage ; les tâches, elles, restent dans le registre).

| Appel | Par | Effet |
|---|---|---|
| `POST /api/affichage/ecrans` → `{ecran}` | front (JWT, `auth.utilisateur`) | Déclare un écran pour l'utilisateur ; le dernier actif est l'écran par défaut |
| `GET /api/affichage/ecrans/{ecran}/flux` (SSE) | front | Reçoit les `LotCommandes`, dans l'ordre |
| `POST /api/affichage/ecrans/{ecran}/etat` (`EtatAffichage`) | front | Met à jour l'état (P4) |
| `POST /api/affichage/ecrans/{ecran}/compte-rendu` (`CompteRendu`) | front | Résultat d'un lot |
| `POST /api/affichage/commandes` (`LotCommandes`) | agent navigateur (`X-Agents-Cle`) ou tests | Pousse vers l'écran ; répond avec le `CompteRendu` (délai max 3 s) |
| `GET /api/affichage/utilisateurs/{id}/etat` | agents, session vocale | Dernier `EtatAffichage` de l'écran actif (404 si aucun écran) |

```ts
interface CompteRendu {
  version: 1
  lot_id: string
  ok: boolean
  resultats: { index: number; ok: boolean; erreur?: ErreurProtocole }[]
  erreur?: ErreurProtocole             // erreur du lot entier (invalide, introuvable, delai)
  etat?: EtatAffichage                 // après exécution (ou inchangé si refus atomique) ; absent si l'écran n'a pas répondu
  emis_le?: string
}
```

Le front de l'application Atlas vise ce relais par une nouvelle variable `VITE_AFFICHAGE_URL` (AtlasVoice,
port 8001 en local), distincte de `VITE_API_URL` ; CORS à ouvrir en conséquence. Sans relais joignable,
le front fonctionne normalement, simplement sans pilotage. Tests FastAPI sans réseau (ordre, délai,
écran inconnu, écran par défaut, droits : un utilisateur ne pilote que ses écrans).

### B5 — Programme déterministe (P3 → écran) : cœur du chantier
Dans `frontend/src/pilotage/` :
- `protocole.ts` : types P3/P4 + validation (depuis les schémas de `protocoles/`) ;
- `etat.ts` : **modèle d'état pur** `appliquer(etat, commande, index) → etat | ErreurProtocole`, sans DOM
  ni sigma (`index` = ensemble des ids connus, nœuds par conversation) ;
- `adaptateur.ts` : `synchroniser(vue: VueRaisonnement, etat)` et `exporter(vue) → EtatAffichage` ; seul
  fichier qui traduit id ↔ point (`pointDeNoeud`, `noeud(p)`), refait après chaque événement `lecture` ;
- `filtres.ts` : les filtres (S5), par réducteur de point et d'arête (`a.cache` pour masquer, opacité
  de contexte pour estomper) ;
- `client.ts` : déclaration de l'écran, abonnement SSE, exécution des lots dans l'ordre, comptes rendus,
  envoi de l'état après les actions de l'utilisateur ;
- `window.atlasAffichage = { executer(lot), etat() }` pour la console et les tests de bout en bout.

Exigences : aucune commande ne plante la vue (référence inconnue → erreur dans le compte rendu) ; lot
atomique validé entièrement avant la première action ; même suite de lots depuis le même état = même
écran (rejouable) ; une commande reçue pendant une animation la remplace proprement ; les actions de
l'utilisateur (souris, clavier, panneau de conversation) passent **aussi** par `appliquer` pour que
l'état exporté soit toujours juste. Tests : `etat.ts` exhaustivement (sans navigateur) ; aller-retour
`restaurer`/`exporter` ; un test Playwright qui envoie un lot et compare une capture.

### B6 — Nouvel affichage du front (remplace `frontend/src/graphe.ts`)
1. **Porter le moteur** : copier `prototypes/graphe-3d/src/raisonnement/` et les modules de `src/core`
   qu'il importe dans `frontend/src/graphe/` (le prototype reste intact, comme laboratoire). Ajouter au
   front `@dagrejs/dagre`, `elkjs`, `tweakpane`, `@tweakpane/plugin-essentials`. Compiler avec le
   `tsconfig` du front (TS ~6, `noUnusedLocals`, `erasableSyntaxOnly`) et `oxlint` : corriger le code
   porté, pas assouplir la config. Retirer du code porté ce que le front n'utilise pas (jeu synthétique
   gardé seulement pour les tests).
2. **Adaptateur de données** (P5) : modèle Atlas (5 statuts, validité et confiance par démonstration).
3. **`remplacerJeu(jeu)`** sur la vue (S4) : nouvelle dérivation, disposition et graphe sigma, sans
   recréer la page ni perdre caméra, sélection, filtres (réappliqués par id via B5).
4. **Brancher dans `main.ts`** à la place de `VueGraphe`, en gardant ce que fait l'écran actuel :
   conversations à gauche ; clic sur un nœud → détail rendu par `rendre()` (Markdown + LaTeX) ;
   case « nœuds de cette conversation » → `filtres.conversation` ; relecture du graphe pendant une
   exécution ; couleurs et libellés de statut (`COULEURS_STATUT`, `LIBELLES_STATUT`) repris dans le thème.
   Le panneau gauche ☰ du moteur et Tweakpane : désactivés par défaut dans l'application
   (`ui: { panneau: false, reglages: false }`), réglages accessibles en mode développement seulement.
5. **Supprimer `frontend/src/graphe.ts`** une fois l'écran équivalent, et **mettre à jour `CLAUDE.md`** :
   la ligne « `graphe.ts` (sigma : réglages en tête, couleurs opaques uniquement) » devient une
   description de `graphe/` et `pilotage/` ; la règle sur les couleurs devient « couleurs translucides
   uniquement via `rgbaGL` (alpha prémultiplié) » (piège documenté dans le README du moteur).
6. Base visuelle : **r0 · Référence**. Les autres visions (r1–r5) restent dans le prototype ; en reprendre
   des idées est un chantier séparé.

Critères : fluidité équivalente au prototype (images/s mesurées par le script de capture du README du
moteur), aucune régression des fonctions de l'écran actuel, `npm run build --prefix frontend` et le lint
passent, le hook `tsc --noEmit` reste vert.

## 5. Ordre de réalisation

1. `protocoles/` : schémas P2–P4 (+ ajouts P1) + exemples + tests de contrat Python et TS. **Rien d'autre avant.**
2. B6 étapes 1 à 4 (sans pilotage) : l'application affiche le graphe avec le nouveau moteur, à fonctions égales.
3. B5 avec des lots écrits à la main (`window.atlasAffichage`) → l'écran est pilotable.
4. B4 → on pilote l'écran avec `curl`.
5. B3 sur des tâches `navigateur` créées à la main (champ de texte de l'écran, `POST /api/taches`).
6. B1 puis B2 → la chaîne complète, à la voix et au chat texte.
7. B6 étape 5 (suppression de l'ancien graphe, `CLAUDE.md`).

Une branche par brique (ex. `affichage/protocoles`, `affichage/moteur-front`, `affichage/pilotage`,
`voix/relais-affichage`, `voix/agents-navigation`), merge dans `main`.

## 6. Points à surveiller

- **Latence** : B2 + B3 + relais + animation doivent tenir dans 1,5 s. Mesurer chaque saut (horodatages
  dans les lots, journal de session d'AtlasVoice) avant d'optimiser.
- **Quota** : un vrai tour d'agent consomme le modèle ; les tests remplacent les modèles et le réseau.
- **Deux fronts** : le client vocal (AtlasVoice, React, port 5174) et l'application (TS sans framework,
  port 5173) restent séparés ; ils ne se parlent que par le relais. Les fusionner n'est pas dans ce chantier.
