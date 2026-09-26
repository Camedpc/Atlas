# R13 · Assistant de preuve

R1 (squelette déductif) garde sa structure et sa clarté ; le langage visuel devient celui d'un assistant
de preuve et de son blueprint (Lean 4 / leanblueprint, Isabelle jEdit) : un outil de travail précis,
pas un support pédagogique.

## Ce qui est repris de R1 tel quel

- Dérivation (`squelette.ts`) : contexte rattaché, élagage vers les résultats majeurs, réduction
  transitive, repli des sous-arguments exclusifs. Stratégies renommées `r13-squelette`,
  `r13-auxiliaires`, `r13-tout`.
- Mise en page (`mise-en-page.ts`) : sections de gauche à droite, rangées horizontales, arêtes
  orthogonales, renvois « (k) » au lieu des longues flèches, dépliage sur place au double-clic.

## Choix

- **Vocabulaire** (`preuve.ts`) : identifiant de blueprint par énoncé (`thm:conv`, `lem:energie`,
  `var:bruit`, `dec:abandon` ; préfixe = type, préfixe redondant de l'id retiré) et **état de preuve** :
  - `✓ vérifié` : trait plein vert ; `? à vérifier` : trait fin ambre ; `… en cours` : tirets bleus
    (étape repliée dont une partie seulement est vérifiée, fraction `3/5`) ; `✗ échec` : trait rouge
    épais (réfuté ou démonstration invalide) ; `admis` / `sorry` : pointillé gris (axiomes,
    définitions, littérature, hypothèses ; `sorry` pour une conjecture ou un énoncé sans preuve).
  - aucun aplat de couleur : fond blanc partout, la couleur n'est que dans le trait et le symbole.
- **Énoncé** : cadre à angles vifs ; en-tête monospace (identifiant à gauche ; validation H / IA /
  IA+H puis état à droite ; filet dessous), énoncé en sans-empattement, pied `[c₁ c₃]` (variables
  portées), filet d'intervalle de confiance neutre avec le repère de l'estimation dans la couleur
  d'état. Résultat principal : **double cadre**. Preuve repliée : `▸` devant l'identifiant, un seul
  feuillet en filet (plus de pile de cartes).
- **Choix de modélisation → variables de section** : dans la section de gauche, une déclaration
  `variable c₁` + la phrase + `→ n` (énoncés visibles qui la portent). Chaque énoncé qui en dépend
  (graphe complet) porte explicitement `[c₁ c₃]` ; au survol ou à l'épinglage d'une variable, ses
  occurrences passent en couleur et le reste s'atténue. Remplace les bandes de couleur de R1 (six
  couleurs → une seule, réservée au mot-clé `variable`).
- **Décisions → points de branchement annotés** : petit losange au trait sur la ligne de la preuve,
  identifiant `dec:…` et branche retenue au-dessus, branche écartée `✗ …` en pointillé dessous.
- **Contexte** : lettres encadrées en gris (H D O A L +, pointillé pour les auxiliaires) au lieu des
  pastilles colorées ; renvois `(k)` en monospace encadrés.
- **Sections** : `§1 variables & décisions`, `§2 outils`, `§3 étapes`, `§4 résultats`, en monospace,
  filet dessous, séparateurs verticaux pointillés ; plus de bandes alternées.
- **Inspecteur au clic** (panneau à droite, façon Infoview) : identifiant, état, type, sous-problème,
  validation, confiance chiffrée ; **contexte de but** : `variable cₖ : …`, puis `h₁ : lem:… ✓
  principale`, … (prémisses extérieures à l'unité, toutes démonstrations, triées par rôle ; chaque
  identifiant est un lien qui sélectionne et cadre l'énoncé), trait, `⊢ énoncé` en monospace ;
  démonstration principale (nom, validité, auteur, date, texte) ; preuve repliée en `have … / show …`
  avec l'état de chaque énoncé ; point de branchement (alternatives, raisons) ; portée d'une variable ;
  « utilisé par ». Réglage « inspecteur au clic » pour le couper.
- **Progression globale** (en haut à gauche) : `125 / 161 vérifiés ? 31 sorry 4 ✗ 1 · 49 admis` sur
  le jeu synthétique (tous les nœuds, pas seulement les visibles), barre segmentée par état. Le panneau
  ☰ compte aussi les états des énoncés visibles et sert de légende.
- Palette : fond papier neutre, encre presque noire, accent marine pour les liens ; lignée = cadre
  supplémentaire autour du cadre d'état (qui reste lisible), bleu pour les prémisses, brun pour les
  conséquences. Thème sombre défini.

## Limites

- **Non vérifié à l'écran** : la machine manquait de mémoire, aucun navigateur ni capture. Vérifié :
  `tsc --noEmit` sans erreur dans le dossier, modules servis par Vite (200), états et progression
  calculés sur le jeu synthétique (script Node). Chevauchements de texte, densité réelle et lisibilité
  au cadrage initial restent à contrôler visuellement.
- Largeur des énoncés portée à 148 px (122 dans R1) pour loger l'en-tête monospace : le cadrage
  initial rétrécit un peu le texte.
- « En cours » n'existe que pour les étapes repliées (agrégat) : les données n'ont pas d'état « preuve
  en cours d'écriture » par énoncé. En base, un état explicite serait plus juste.
- Les identifiants sont dérivés des ids ; avec des uuid (données réelles), ils sont abrégés à 8
  caractères : un champ `etiquette` annoté par l'agent rédacteur serait préférable.
- La fermeture de l'inspecteur suit la vue : changer de niveau ou déplier une preuve le ferme (les
  points sont renumérotés).
- En 3D, les cadres restent plats (comme R1).

## Idées

- Numéroter les résultats comme un blueprint (Théorème 2.3) et exporter le graphe en `\uses{…}`.
- Filtre « montrer seulement ce qui bloque » : chemins qui mènent d'un `?`, `✗` ou `sorry` aux résultats.
- Inspecteur : afficher le but de chaque `have` de la preuve repliée, dépliable sur place.
