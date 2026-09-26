# V6 · Corolles

Les agrégats sont des **diagrammes** : on lit leur composition sans les survoler.

## Choix de conception

- **Agrégat = anneau (donut)** dessiné sur le calque canvas « dessus » (`anneaux.ts`) :
  anneau épais = statuts (validé / incertain / réfuté), anneau fin intérieur = validation
  (aucune / IA / humain / IA + humain), centre teinté par le domaine avec **effectif**, et le
  **nom** au centre s'il y tient sans ellipse (sinon sous l'anneau, avec anti-collision des noms,
  les plus gros d'abord). Rayon = `rayonMin + tailleAnneau·√n`, × perspective.
  Le nœud sigma de l'agrégat reste présent (pointage, zIndex, arêtes) mais transparent
  (`a.extra = { color, couleurBordure: 'rgba(0,0,0,0)' }`, sans libellé). Le disque central
  cache les arêtes et les enfants encore « rentrés ».
- **Anti-chevauchement** : après chaque image, le rayon d'un agrégat est plafonné à la moitié
  de la distance écran à son plus proche voisin visible (réglage 0…1). Pendant une éclosion, les
  enfants partent petits et grossissent en s'écartant.
- **Éclosion en corolle** (`corolle.ts`) : trajectoire personnalisée. Les enfants d'un parent sont
  triés (statut, date, validation ou confiance) et placés sur un anneau de pétales dans le plan
  de l'écran, rayon = rayon parent + plus gros enfant + marge (ou périmètre / arc s'il y a beaucoup
  d'enfants). Mouvement : sortie radiale vers le pétale (part « pétales » du temps) puis glissement
  vers la position finale ; décalage en cascade selon le rang. Le repli est l'inverse exact
  (retour sur l'anneau puis vers le centre). En ordre « statut », les pétales sortent dans l'axe
  du secteur correspondant du parent (mêmes angles de départ et même sens).
- **Le parent se déroule** : avec l'ouverture, ses secteurs s'écartent (angle et éclat radial),
  l'anneau s'amincit et s'efface plus vite, le nom disparaît.
- **Survol d'un agrégat** : secteurs détachés (animation amortie), voisins en avant (moteur).
  **Survol d'un secteur** : bulle « 51 incertains · 30,9 % », secteur mis en relief, autres
  secteurs estompés ; les feuilles concernées sont grossies si elles sont visibles, sinon un
  **aperçu en graines** est rangé en arcs à l'extérieur du secteur (une graine par nœud, couleur =
  l'autre dimension : validation pour un secteur de statut et inversement).
- **Fiche d'agrégat** : effectif et période, barres statut et validation, intervalle de confiance
  moyen, nœuds principaux. Fiche de feuille : celle du moteur.
- **Violon de confiance** au-dessus d'une feuille survolée (et de la feuille sélectionnée) :
  axe [0,1], cloche entre bas et haut centrée sur l'estimation, remplissage = statut, contour =
  validation (pointillé aucune, fin IA, moyen humain, double IA + humain), valeurs chiffrées.
  Placé au-dessus du nœud car la fiche s'ouvre en bas à droite du pointeur.
- **Lignée** : jauge extérieure autour des agrégats (part sélection / ancêtres / descendants).
- **Communautés** (`communautes.ts`) : réglage « agréger par » (Tweakpane et carte Filtres).
  Graphe non orienté (prémisses + liens faibles entre nœuds consécutifs d'une session), Louvain
  déterministe à la résolution choisie pour le niveau fin, puis agglomération hiérarchique sur le
  graphe quotient (paire la plus liée normalisée par les tailles) pour les niveaux thème et
  domaine ; petits groupes et composantes isolées fusionnés (lien le plus fort, sinon date la plus
  proche). Noms « ≈ terme le plus fréquent » (ou nœud le plus cité s'il n'y a pas de catégorie).
  Le résultat est un `JeuDonnees` dont `categorie` = chemin de communautés : le moteur (hiérarchie,
  dispositions, granularité, filtres) marche sans modification. Changer de regroupement
  reconstruit la vue (`detruire()` puis `creerVue`) après 450 ms, le temps que les réglages soient
  enregistrés. Sur le jeu synthétique : 2 › 7 › 20 groupes en ~120 ms.
- **Panneau gauche en cartes flottantes** (CSS seul) : Filtres, Légende (schéma SVG d'un anneau),
  Sélection, Catégories/Communautés ; entrée en cascade (délai par carte), sortie inverse.
- Thème clair soigné (palette légèrement ajustée, fond pointillé discret), sombre correct ;
  bouton thème ajouté dans la barre de vues.

## Réglages (Tweakpane)

- Corolles · anneaux : rayon ∝ √n, rayon minimal, épaisseurs statut/validation, écart entre
  anneaux, écart entre secteurs, teinte du centre, ombre, noms, taille et seuil du nom,
  anti-chevauchement, bordure = validation des feuilles, fond pointillé.
- Corolles · éclosion : trajectoire (corolle ou celles du moteur), ordre, amplitude, arc, part
  « pétales », décalage en cascade, déroulé du parent. La durée et la courbe restent celles du
  moteur (Transitions ; durée par défaut 1 200 ms ici).
- Corolles · survol : détachement des secteurs, aperçu des nœuds repliés, violon, largeur.
- Corolles · regroupement : catégories / communautés, résolution Louvain, poids des liens de session.

## Extensions du moteur faites dans le dossier (pas de modification de `src/core`)

- **Trajectoire par unité** : le moteur ne passe à la trajectoire que `graine`, pas l'unité.
  `Corolle` remplace `h.graines[u]` par `u` (entier exact en Float32) et garde les graines
  d'origine pour les trajectoires du moteur. Suggestion : ajouter `u` (et le parent) à
  `PointTrajectoire`.
- Le réglage moteur « trajectoire » est ignoré dès qu'une trajectoire perso est fournie : on le
  remplace par « Corolles · éclosion › trajectoire ».
- `@sigma/node-piechart` n'est pas installé (et on ne modifie pas `package.json`) : dessin canvas.

## Bugs / pièges rencontrés

- `lirePalette` est lue à la construction, avant qu'on puisse ajouter une classe à `.atlas-vue` :
  les variables de la variante sont donc posées sur `#app .atlas-vue` (le conteneur existe avant).
- Le moteur remet sa propre légende au changement de thème : on la remplace à nouveau derrière.
- Vérification navigateur : fenêtre Chrome masquée, `requestAnimationFrame` et `setTimeout`
  bridés. On pilote la boucle à la main avec `atlasVue.image(t)` en passant des temps choisis
  (les animations du moteur lisent le `t` fourni), ce qui fige un état intermédiaire exact d'une
  transition ; pour le voir, on compose les calques dans un `<img>` plein écran puis on capture.
  Le serveur Vite recharge souvent la page (autres agents) : tout test doit tenir en un seul appel.

## Vérifié

- `npx tsc --noEmit -p .` : aucune erreur dans ce dossier.
- Navigateur (page de la variante, aucune erreur console) : anneaux au niveau thèmes (noms au
  centre ou dessous, effectifs), survol de secteur (bulle « 51 incertains · 30,9 % », graines),
  fiche d'agrégat, thème sombre, cartes du panneau, violon sur une feuille, bascule vers les
  communautés et retour, parcours g = 0 → 3, vue iso, filtres, lignée.
- Éclosion mesurée : sous-thème de 46 nœuds, pétales à ~92 px ; à ouverture 0,44 les feuilles sont
  à 5…88 px du parent (médiane 64, cascade), puis se resserrent à 13…19 px (position finale).

## Captures décrites

1. Vue de dessus, thèmes : anneaux vert/ambre/rose, anneau fin bleu-violet, effectifs au centre,
   noms dessous ; arêtes agrégées fines en gris.
2. Survol d'« Optimisation » (sombre) : secteur « validé » détaché, bulle « 65 validés 52,4 % »,
   arc de graines colorées par validation, voisins en avant, fiche détaillée à gauche.
3. Nœuds (g = 3) : violon étroit au-dessus de « Convergence d'une suite » (0,99 [0,97 – 1]).

## Limites et idées suivantes

- Anti-chevauchement par plafond de rayon : simple et stable, mais à forte densité (sous-thèmes
  tous ouverts) les anneaux deviennent petits ; un relâchement de positions en espace écran ou une
  taille liée au zoom (zoom sémantique) serait mieux.
- Les pétales sont dans le plan de l'écran ; en 3D libre on pourrait les orienter selon la face.
- Quand beaucoup d'agrégats s'ouvrent ensemble (granularité globale), les corolles se superposent :
  échelonner les ouvertures (cascade entre parents) aiderait.
- Aperçu des graines limité à 400 nœuds ; le secteur « hors filtre » n'a pas d'aperçu.
- Idée : un troisième anneau très fin pour l'intervalle de confiance moyen (arc = estimation).
