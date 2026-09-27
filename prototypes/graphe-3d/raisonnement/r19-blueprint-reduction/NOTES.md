# R19 · Blueprint · sous-graphes réductibles

Le schéma technique de R14 (blocs à angles vifs, ports, liaisons orthogonales, statut par le trait, règle
des rangs) avec deux mécanismes du Blueprint d'Unreal Engine : les boîtes **« Comment »** colorées et
**« Collapse to Function »**. Jeu par défaut : fontaine de chaîne (`?jeu=edp` pour le jeu synthétique).

## Choix

- **Boîtes « Comment » = sous-problèmes** (`mise-en-page.ts`, `rendu.ts`) : fond teinté translucide, contour
  fin, barre de titre colorée (▾ nom du groupe, nombre d'énoncés, `OUVRIR ↗`). Tireté pour une piste
  abandonnée. Teintes : cadre gris, SP1 violet, SP2 ambre, SP3 azur, piste abandonnée gris clair.
- **Bandes sans chevauchement** : chaque groupe occupe une bande horizontale ; l'ordre et les hauteurs sont
  calculés dans la bande (voisins de la même bande seulement), puis les bandes sont empilées avec la place
  de la barre de titre. Ordre des bandes : la permutation (≤ 7 bandes) qui minimise la longueur verticale des
  liaisons entre bandes, départagée par l'ordre du jeu. Les rangs logiques (colonnes, règle) sont inchangés.
- **Frontières respectées par le repli** (`squelette.ts`) : un sous-argument exclusif ne se replie plus à
  travers deux groupes, pour que chaque boîte ne contienne que son sous-problème.
- **Réduction = étape de dérivation** (`groupes.ts`, `etapeGroupes`, en fin de chaque stratégie) : les unités
  d'un groupe fusionnent en une seule (arêtes internes → `aretesInternes`, arêtes externes reportées), donc
  liaisons, lignée, repères et invariant de correspondance restent exacts sans cas particulier. Refusée si
  elle créerait un cycle (G → X → G) : la barre l'indique au survol, le bouton du panneau est désactivé.
- **Nœud-fonction** : en-tête framboise (`FONCTION · n`, ƒ), nom du groupe, **broches d'entrée** ▶ (une par
  liaison entrante, étiquetée par le repère et le nom de la source, dans l'ordre des arrivées : pas de
  croisement), **broches de sortie** ● (un énoncé du groupe utilisé dehors ; triées par ordonnée des
  destinations ; chaque liaison part de la broche de son énoncé), pied : `n énoncés · k à vérif.` et jauge
  du **maillon le plus faible** (`min 0,62`). Contour = code de trait du **statut le plus faible**. Second
  contour décalé : plusieurs énoncés derrière. Fiche : statut agrégé, maillon faible, liste des membres.
- **Transition fonctionnelle** : à la réduction, les rectangles des anciens blocs (couleur du groupe) se
  resserrent vers le nœud-fonction pendant que la mise en page se recompose ; au déploiement, les blocs
  sortent de la position de la fonction (mécanisme de la vue : chaque unité part de l'ancien point qui
  contenait sa conclusion). Rien en boucle.
- **Onglet** (`OUVRIR ↗`, double-clic sur un nœud-fonction, ou panneau) : seule la bande du groupe, avec
  ses sources directes empilées en nœud **Entrée** (colonne de gauche) et ses utilisateurs directs en nœud
  **Sortie** (colonne de droite), cotes `ENTRÉE · SOUS-GRAPHE · SORTIE` sur la règle. Barre d'onglets et fil
  d'Ariane sous la barre d'outils (« Fontaine de chaîne › SP2 · Conditions aux extrémités ») ; × ou clic
  sur la racine pour revenir ; double-clic sur une rangée Entrée / Sortie aussi.
- **En-têtes colorés par famille** : déduction bleu acier, empirique vert, calcul sarcelle, conjecture ocre,
  résultat encre ; fonction framboise. Le statut reste porté par le trait (continu / tireté / barré), le bleu
  d'accent reste réservé au survol, à la sélection et à l'aval de la lignée.
- **Cartouche sur la feuille** (correction) : dessiné dans le coin bas droit du cadre, **sous** le schéma
  (la feuille lui réserve sa hauteur), au lieu d'un encart HTML fixé à l'écran qui recouvrait les blocs du
  bas à droite. Le cadrage 2D (`cadrerTout`) cadre la feuille entière. Champs : titre, vue (graphe principal
  ou onglet), éléments, liaisons, groupes (dont réduits), niveau, révision, échelle, date, source.
- Une décision sans prémisse reste dans la bande de son groupe (« Estimer α » n'est plus isolée en marge).
  Les limites de zones ne traversent plus la feuille (elles couperaient les boîtes) : un court repère sous
  la règle.

## Vérifié

- `tsc --noEmit` sans erreur dans le dossier ; Vite sert `index.html` et les modules (200).
- Dérivation et mise en page exécutées hors navigateur (bundle rolldown, canvas simulé) sur la fontaine, aux
  trois niveaux, déployé / SP2 réduit / tout réduit / onglets SP2 et SP3 : correspondance exacte partout,
  aucune boîte « Comment » qui en chevauche une autre, aucun bloc dans la boîte d'un autre groupe, aucun bloc
  sous le cartouche, chaque liaison sortant d'un nœud-fonction part de sa broche.

## Limites

- **Non vu dans un navigateur** (pas de navigateur sur cette machine) : couleurs, lisibilité des broches à
  136 px de large, barres de titre à petite échelle, transition, onglets : à regarder en priorité.
- Une bande par groupe allonge le schéma en hauteur (5 bandes pour la fontaine) ; une liaison entre deux
  bandes éloignées descend dans le canal et traverse les bandes intermédiaires.
- En onglet, les réductions des autres groupes sont ignorées (les entrées sont les énoncés eux-mêmes).
- La réduction d'un groupe ne relance pas la réduction transitive : une broche peut doubler un chemin.
- En 3D, boîtes et feuille s'effacent ; les blocs restent projetés à plat.

## Idées

- Réduire / déployer par la sélection (lasso), comme « Collapse Nodes » sur une sélection arbitraire.
- Survol d'une broche : surligner la source ou les utilisateurs extérieurs correspondants.
- Imbriquer : un groupe réduit à l'intérieur d'un onglet ouvert (fil d'Ariane à plusieurs niveaux).
- Boîtes « Comment » redimensionnables et renommables à la main, mémorisées par projet.
