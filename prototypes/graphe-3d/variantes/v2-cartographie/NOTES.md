# V2 · Cartographie

Le graphe se lit comme une carte topographique : on zoome pour descendre de niveau (domaines, puis
thèmes, sous-thèmes, nœuds), les territoires se fendent en sous-territoires et les toponymes
apparaissent au fil du zoom.

## Fichiers

- `main.ts` : assemblage, réglages Tweakpane (dossiers « Carte · … »), réducteur des agrégats,
  mise en avant des territoires au survol / à la sélection, bascule manuel ↔ automatique.
- `carte.ts` : calques canvas. Dessous : quadrillage, cadre de feuille en damier, territoires,
  courbes de niveau, halos de confiance. Dessus : toponymes.
- `zoom.ts` : zoom sémantique (paliers avec hystérésis, continu, manuel).
- `minicarte.ts` : mini-carte cliquable (bas à gauche).
- `interface.ts` : rail d'icônes, onglets du panneau, fiche de survol, sections Couches, Recherche
  et légende de la carte.

## Choix de conception

- **Zoom sémantique** : facteur `z = pixels par unité × 2 / min(L, H)` (1 = la carte remplit
  l'écran). Seuils réglables : thèmes 0,62, sous-thèmes 1,45, nœuds 3,1, hystérésis ±12 %. En
  « paliers », le niveau entier change avec une transition animée. En « continu », `g` est une somme
  de smoothsteps en log(z) : zoomer fait défiler la transition. Toucher au curseur de granularité,
  à ses boutons ou aux touches `[` `]` passe en manuel. La case « suit le zoom », la puce de la
  mini-carte et l'onglet Couches permettent de revenir en automatique.
- **Territoires** : chaque feuille dépose un noyau compact `(1 − d²/R²)²` sur une grille écran,
  dans le champ de chaque catégorie de sa chaîne. Le territoire est l'isoligne `F = seuil`,
  extraite par un marching squares orienté (segments chaînés en boucles), puis lissée par des
  courbes quadratiques. Le rayon se resserre à chaque niveau (réglage « resserrement ») pour que les
  sous-territoires se séparent. Le terrain utilise les positions **cibles** (`positionsBase`) : la
  carte ne bouge pas quand on agrège.
- **Fente** : un enfant est dessiné avec le champ `(1 − t)·F_parent + t·F_enfant`, où t est
  l'ouverture du parent passée par la courbe de transition. À t = 0 l'enfant a la forme du parent,
  puis il se rétracte vers la sienne. Les points sortent du parent au même moment (moteur).
  Le dézoom inverse le mouvement.
- **Traits** : côte pleine pour les domaines, tirets pour les thèmes, pointillés pour les
  sous-thèmes. Courbes de niveau de densité par domaine, avec une courbe maîtresse toutes les quatre.
- **Toponymes** : capitales espacées (`letterSpacing`), italique pour les sous-thèmes, coupés en
  deux lignes si le nom est long. L'opacité dépend du niveau ouvert : les domaines restent en
  filigrane quand on zoome. Un nom n'apparaît que si son territoire est assez large à l'écran pour
  le porter. Les chevauchements sont évités de façon gloutonne. Les agrégats ne portent plus de
  libellé sigma (sauf au survol et à la sélection).
- **Agrégats** : pastille claire cerclée de la teinte du territoire, comme une « ville ».
- **Confiance** : un sprite de dégradé radial par statut. Rayon = taille + largeur de l'intervalle
  × k, intensité décroissante avec la largeur : un nœud incertain a un halo large et diffus. Les
  agrégats reçoivent un halo par statut, au prorata. Les pictogrammes de validation (puce IA,
  silhouette humaine, les deux, cercle pointillé) sont dans la fiche et la légende.
- **Survol** : fiche compacte avec liseré de couleur, chemin en petites capitales, statut en
  pastille, pictogrammes, barre d'intervalle et incertitude ±. Les territoires et toponymes sans
  rapport avec le nœud survolé ou ses voisins s'estompent. Même chose pour la lignée au clic.
- **Mini-carte** : toute la carte sous l'orientation courante, rectangle de la vue, épingle de la
  sélection. Clic ou glisser pour déplacer la vue, molette pour zoomer. Le pied affiche le niveau,
  le facteur de zoom et le mode.
- **Rail** : ☰ (panneau), Filtres (filtres + catégories du moteur), Couches (mode de zoom,
  interrupteurs, thème, légendes), Recherche (`/`, lieux puis nœuds, Entrée pour aller au premier
  résultat), Sélection (détail du moteur, avec une pastille si une sélection existe), Thème,
  Catalogue. Le panneau s'ouvre en surimpression. Échap le ferme.
- **Qualité adaptative** : si les territoires et courbes coûtent plus que le budget (7 ms par
  défaut), le pas de la grille s'élargit, puis se resserre quand ça redevient léger.

## Réglages (Tweakpane)

- **Zoom** : mode, trois seuils, hystérésis, largeur du mode continu.
- **Territoires** : oui/non, opacité, douceur (rayon), resserrement, seuil du contour, finesse,
  budget, épaisseur des côtes, opacité hors vue 7, courbes oui/non, nombre, rapport, opacité.
- **Toponymes** : oui/non, taille, espacement des lettres, opacité, place exigée.
- **Confiance** : halo oui/non, intensité, rayon par largeur d'intervalle, halo des agrégats,
  anneau des agrégats.
- **Fond** : quadrillage, opacité, cadre, mini-carte.

## Vérifié

- `npx tsc --noEmit -p .` : aucune erreur dans ce dossier.
- Navigateur (onglet masqué : boucle avancée à la main en appelant `vue.image(t)`, puis captures) :
  - vue d'ensemble au niveau Thèmes ;
  - zoom ×2,2 → Sous-thèmes, et zoom ×5 → Nœuds, avec les territoires qui se fendent ;
  - granularité 0,5 : les thèmes sortent des domaines (tirets qui se rétractent) ;
  - fiche de survol d'un nœud ;
  - thème sombre, onglet Couches ;
  - recherche « convex » qui amène sur le sous-thème Convexité ;
  - vue iso en perspective, mode continu (g = 1,29), sélection.
  Aucune erreur console.

## Captures décrites

1. Vue d'ensemble, clair : îlots teintés par domaine (bleu analyse, sarcelle apprentissage, prune
   physique, ocre probabilités) avec courbes de niveau. Noms de thèmes espacés (INTÉGRATION,
   OPTIMISATION…), nom de domaine en filigrane. Cadre en damier et quadrillage léger. Mini-carte en
   bas à gauche.
2. Zoom sous-thèmes : sous-territoires en pointillés dans les frontières de thème en tirets,
   toponymes en italique.
3. Nœuds : points colorés par statut sur le terrain. Au survol, voisins en avant, reste estompé,
   fiche compacte « Définition : critère de Cauchy · Validé · IA + humain · 0,8 [0,79–0,84] ».
4. Sombre : même carte sur fond nuit, teintes plus lumineuses.

## Limites

- Coût : à g = 3 zoomé, la carte coûtait 15 à 25 ms par image avant la qualité adaptative (mesuré
  dans l'onglet masqué, donc sans doute pessimiste). Le budget rend la grille plus grossière si
  besoin. Autre piste : ne recalculer les champs que quand la caméra ou la granularité changent.
- Pendant la fente, les frères se superposent brièvement (ils partent tous de la forme du parent).
  Le remplissage en t² limite l'assombrissement.
- Toponymes : placement au barycentre, gloutonnerie sans lissage temporel, donc un nom peut
  apparaître d'un coup quand un voisin disparaît.
- En vues 1 et 3, les territoires suivent les positions projetées (bandes temporelles, couloirs) :
  c'est lisible mais moins « carte ». Ils sont donc atténués hors vue de dessus (réglage).
- Le zoom sémantique est global : un zoom sur une zone ouvre partout, même hors écran (sans coût
  visible).

## Moteur : remarques

- Aucune modification de `src/core`. J'utilise des membres privés seulement pour les tests en
  console (`vue.image`, `vue.definirSurvol`).
- Le serveur Vite recharge souvent la page quand d'autres agents modifient leurs fichiers : pour
  tester, il faut enchaîner le script et la capture.
- `Fiche` : le moteur place la fiche selon `controles.souris`, relatif à la scène. Si une variante
  décale la scène (rail en dehors), la fiche serait décalée : ici le rail recouvre la scène.
- Une API publique `vue.definirSurvol(u)` et un `vue.avancer(ms)` pour les tests seraient utiles.

## Idées suivantes

- Zoom sémantique **local** : n'ouvrir que les agrégats dont le territoire occupe assez de place à
  l'écran (granularité par surface apparente), comme les tuiles d'une carte.
- Territoires en régions contiguës (partition façon Voronoï pondéré) au lieu d'îlots.
- Survol d'un territoire vide : surligner la côte et afficher sa fiche.
- Échelle graphique en bas de carte, rose des vents discrète, étiquettes le long des côtes.
- Mettre en cache les champs entre deux images quand seules les opacités changent.

## Itération 2

Vérification : script Playwright du coordinateur (`node capture.mjs v2-cartographie`, rAF réel),
plus deux scripts de mesure à moi dans le même dossier (`mesure-v2.mjs`, `profil2-v2.mjs`).
Aucune erreur console, 61 images/s à la dernière capture (53 à 55 sur certaines exécutions : la
machine est partagée ; en même temps et dans les mêmes conditions, v0 donne 61).

1. **Bandes grises verticales** : le cadre en damier est supprimé. Il reste un liseré fin
   (opacité 0,14), éloigné des données et **désactivé par défaut** (Couches › « Liseré de
   feuille »). Le quadrillage s'efface hors vue de dessus : de face, il faisait un trait noir.
2. **Vues face et droite** :
   - les territoires en îlots ne s'affichent plus qu'en vue de dessus (poids de la face 7
     lissé, 0,55 → 0,95) ;
   - en **vue temps (1)**, chaque catégorie affichée devient une **rivière** : une bande
     horizontale sur la ligne de son agrégat (placé par `pointSurAxe`, donc à la médiane), de sa
     première à sa dernière semaine ;
   - la largeur de la rivière suit l'effectif hebdomadaire lissé (`etendues.tranches`, noyau
     1-2-3-2-1). Quand un thème s'ouvre, les rivières des sous-thèmes prennent le relais comme
     des affluents, et le parent reste en lit pâle ;
   - en **vue droite (3)**, même principe le long des couloirs de type (`etendues.types`) ;
   - les capsules du moteur sont coupées (`etendues: 'aucune'`) puisque les rivières les
     remplacent ; les segments par couloir du moteur restent pilotés par `etenduesCouloirs`.
   - Réglages : « rivières », « largeur des rivières ».
3. **Noms qui se chevauchent** : deux familles.
   - **Actifs** (niveau affiché) : placés d'abord, sur le calque du dessus. Leur opacité ne
     descend pas sous 0,6 même sur un petit territoire (c'était le cas de « Expériences »). Ils
     essaient d'éviter les disques au-dessus ou au-dessous, sinon ils restent à leur place.
   - **Filigranes** (catégories déjà ouvertes, par exemple les domaines quand on voit les
     thèmes) : dessinés sur le calque du **dessous**, derrière nœuds et arêtes, uniquement s'ils
     ne touchent ni un nom actif ni un disque visible. Trois positions sont essayées (centre,
     au-dessus, au-dessous), sinon le nom est omis.
   - Les noms suivent la projection affichée (agrégat à la médiane en vue temps).
4. **Performance** : le poste coûteux était le remplissage des territoires (raster), pas le
   calcul du champ. Corrections :
   - le calque de la carte est mis en **cache hors écran**, clé = caméra, granularité, filtres,
     réglages, thème, mise en avant et taille ; une image sans changement ne fait qu'un
     `drawImage` ;
   - en simple **déplacement orthographique**, l'image en cache est **décalée** au lieu d'être
     recalculée, puis affinée 160 ms après l'arrêt ;
   - **en mouvement** (zoom, orbite, transition) : rendu à 0,65 de la résolution
     (« résolution en mouvement »), grille 1,7 fois plus grossière, traits pleins sans tirets,
     pas de courbes de niveau ; une image affinée suit l'arrêt ;
   - le budget adaptatif (« budget carte ») est conservé ;
   - garde-fous en perspective proche : échelle des noyaux bornée à 3 ; halos limités à 60 px,
     ignorés pour les nœuds énormes ou hors écran, surface totale plafonnée à 4 écrans ;
   - résultat : carte ≤ 0,4 ms par image en orbite, 61 images/s en déplacement, zoom continu
     et orbite type capture.
5. **Cadrage** : la mini-carte porte `data-zone-sure` et est donc prise en compte par
   `zoneSure()` du moteur, avec la barre et le bas. La recherche (« aller à ») passe
   `vue.zoneSure()` à `camera.cadrer`. Dans les captures, le bas de la carte (« Processus
   stochastiques ») n'est plus masqué. La mini-carte a une largeur fixe : son pied ne déborde
   plus sur la granularité pendant une transition.

Captures décrites (1600 × 1000) :
- **01** : vue de dessus au niveau Thèmes, sans bandes. Filigranes de domaines déplacés hors des
  disques (« PROBABILITÉS ET STATISTIQUE » au-dessus de son territoire).
- **03** : vue temps, rivières horizontales teintées, noms au-dessus des disques à la médiane.
- **04** : vue droite, bandes le long des couloirs de type.
- **06** : transition vers les sous-thèmes, rendue à résolution réduite pendant le mouvement.
- **08** et **09** : nœuds, survol avec fiche. Les autres sont estompés.
- **11** : thème sombre.

Moteur, bug constaté : dans `image(t)`, `dt = min(64, t − dernierT)` n'est pas borné à 0.
Après un `vue.avancer(ms)` (temps synthétiques dans le futur), l'image rAF suivante reçoit un
dt négatif. Le lissage de `camera.perspective` diverge alors (−10,6 observé) et la projection
devient absurde. Correction suggérée : `dt = clamp(t − dernierT, 0, 64)`, ou recaler
`dernierT` à la fin de `avancer`. Cela ne touche que les tests.

Limites restantes :
- le décalage en cache laisse brièvement une marge vide au bord pendant un grand déplacement ;
- les rivières d'un même domaine en vue droite sont presque toutes pleine largeur, car chaque
  thème a tous les types : l'information est dans les variations d'épaisseur, pas dans l'étendue ;
- à granularité fine, beaucoup de filigranes de sous-thèmes sont omis faute de place, ce qui est
  voulu.
