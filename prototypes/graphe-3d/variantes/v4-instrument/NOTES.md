# V4 · Instrument

Le graphe lu comme un **instrument de mesure** : viewport Blender + logiciel scientifique. C'est la
variante qui rend lisibles les axes et les faces du cube.

## Fichiers

| Fichier | Rôle |
|---|---|
| `main.ts` | Montage de la vue, réglages, réducteur des symboles, fiche technique, libellés, bascule catégories / cases |
| `programme-forme.ts` | Programme WebGL sigma maison : ● validé, ◐ incertain, ✕ réfuté, ◎ agrégat, ▣ case + indicateurs de validation |
| `echelles.ts` | Échelles sémantiques : dates → X, couloirs type × origine → Y, bandes thématiques → Z, secteurs (vue de dessus) |
| `axes.ts` | Faces du fond, grilles, axes d'origine, secteurs (calque dessous) ; règles graduées et réticule (calque dessus) |
| `confiance.ts` | Barres d'erreur (intervalle de confiance) |
| `entete.ts` | En-tête de viewport, menus, surimpression d'état, menu circulaire des vues |
| `npanel.ts` | Panneau gauche « N-panel » à onglets verticaux (Élément, Vue, Filtres, Outils) + légende |
| `cases.ts` | Données du regroupement « par cases » période × type × origine |

## Choix de conception

- **Faces du fond du cube** (comme un graphique 3D scientifique) : pour chaque axe, la face la plus
  éloignée de l'œil est teintée et quadrillée ; son opacité suit `|visée · normale|`, donc une face
  vue de biais s'efface. En vue de face on lit un graphique temps × thème ; en 3D on voit le coin
  de trois faces.
- **Grilles sémantiques** : X = mois (majeurs, années), semaines (lundis) ou jours selon les pixels
  disponibles ; Y = bords des couloirs de type et séparations d'origine ; Z = frontières de domaines,
  thèmes et sous-thèmes. En « faces sémantiques », chaque grille est pondérée par le poids de la face
  (le temps n'a de sens en X que si la face avant domine) ; ailleurs, une grille neutre (« carte »).
  En « cube strict », toutes les graduations sont exactes en permanence.
- **Règles graduées** posées sur une arête du cube : la plus basse à l'écran pour un axe horizontal,
  la plus à gauche pour un axe vertical. Quand l'arête sort de la zone utile (zoom), la règle se
  **colle au bord du viewport** avec un bandeau (règle d'écran) ; les libellés d'une règle verticale
  basculent à l'intérieur quand la place manque (panneau ouvert). Libellés sans chevauchement (par
  priorité, deux rangées possibles). Une règle s'estompe quand son axe est vu de bout.
  Les domaines sont en petites capitales colorées sur la règle Z ; les dates en monospace.
- **Secteurs thématiques** (vue de dessus) : cercles englobants des domaines (trait plein, léger
  fond) et des thèmes (pointillés, affichés quand ils sont assez grands), dessinés au sol.
- **Axes façon Blender** : X rouge, Y vert, Z bleu sur les épines des règles, le gizmo et les
  pastilles du réticule ; axes d'origine rouge / vert au sol.
- **Réticule au survol** : mire autour du symbole, rappels pointillés vers chaque règle visible et
  pastille de valeur sur l'axe (date exacte `AAAA-MM-JJ hh:mm`, couloir « Lemme · IA », sous-thème).
  Pour un agrégat : crochet d'étendue sur chaque axe (période couverte, couloirs, bandes) et valeur
  résumée (« 2026-04-05 → 2026-04-15 (10 j) », « surtout Calcul (100 %) »).
- **Fiche technique compacte** : id, type · origine, date ISO, statut, validation, confiance en
  monospace + petite échelle 0…1 avec barre d'erreur ; pour un agrégat : n, statuts empilés,
  période, μ ± écart-type des estimations, types dominants, validations, principaux nœuds.
- **Symboles** (programme WebGL `ProgrammeForme`, dérivé du cercle de sigma) : la forme dit le
  statut, deux petits points disent qui a validé (point creux nord-ouest = IA, point plein nord-est
  = humain, les deux = IA + humain). Contour couleur du fond (séparation), remplacé par la couleur de
  lignée / d'accent quand le symbole est surligné ou survolé. Couleurs de validation passées en
  uniformes (constantes par thème), pas de couleurs calculées par image (cache sigma).
- **Barres d'erreur** : de `haut − estimation` au-dessus à `estimation − bas` au-dessous (ou
  horizontales, ou en croix), butées réglables, couleur du statut, regroupées par palier d'opacité.
  Agrégats : intervalle moyen, trait épais partant du bord du symbole.
- **Regroupement par cases** (Outils ou menu Granularité) : les agrégats deviennent période × type
  × origine (pas : mois / quinzaine / semaine ; ordre période › type ou type › période). Symboles
  carrés, couleur en rampe séquentielle chronologique. Les feuilles gardent leurs positions
  thématiques (dispositions d'origine réinjectées) : en vue de face les cases s'alignent sur les
  colonnes de période, en vue de droite sur les couloirs de type ; les transitions sortie / rentrée
  du moteur fonctionnent telles quelles.
- **Transitions** : courbe « ease-out-expo » normalisée (raideur réglable) pour la granularité **et**
  la caméra, durées courtes (360 ms / 340 ms) : nettes, sans rebond.
- **En-tête de viewport** : ☰ (panneau), marque (lien vers le catalogue), menus Vue / Sélection /
  Granularité (coches, raccourcis), nom de vue façon Blender (« Face orthographique »,
  « Utilisateur perspective »), curseur de granularité compact (glisser = défiler la transition),
  2D/3D, Ortho/Persp, faces sémantiques / cube strict, thème, aide. Surimpression d'état en haut à
  droite (niveau, nœuds actifs, placement, **échelle** « 1 mois ≈ 80 px »).
- **Menu circulaire** (`` ` `` / ²) : 8 directions, aiguille qui suit le pointeur, part présélectionnée
  selon la direction, vue courante cerclée, sortie des parts depuis le centre en ease-out-expo.
- **N-panel à gauche** : onglets verticaux Élément (emplacement X/Y/Z + lecture, puis détail de la
  sélection du moteur), Vue (points de vue, superpositions, légende), Filtres (filtres + arbre des
  catégories du moteur), Outils (agrégation, transitions, configuration).
- **Cadrage** : « tout cadrer » vise le cube de l'instrument (règles comprises) dans la zone utile
  (sous l'en-tête, au-dessus de l'histogramme, place des libellés de la règle Z réservée).
- **Thèmes** : clair « papier de mesure » par défaut (fond #f5f6f8, faces #e4e8f0, encre #161c2a) ;
  sombre « oscilloscope » (fond #0f1218, couleurs rehaussées). Police monospace système (Cascadia
  Mono / Consolas) pour les nombres : aucune police chargée depuis le réseau.

## Réglages (Tweakpane, dossiers « Instrument · … »)

Grille (affichage, faces teintées, opacité, densité, axes d'origine, secteurs), graduations
(affichage, collées au bord, taille police, longueur des traits), réticule (affichage, écart de la
mire, valeurs sur les axes, étendue d'un agrégat), confiance (orientation des barres, px par unité,
butées, épaisseur, opacité, agrégats), symboles (taille, taille des agrégats, indicateur de
validation, contour), agrégation (regroupement, pas, ordre), transitions (sortie exponentielle,
raideur). Valeurs par défaut du moteur surchargées : durées, taille des nœuds, opacité des arêtes,
netteté des faces, densité et taille des libellés.

## Extensions du moteur faites dans ce dossier (sans toucher `src/core`)

- `MenuRadialInstrument` étend `MenuRadial` (importé de `src/core/ui/barre`) ; il remplace
  `vue.ui.menu` après la création.
- Le panneau du moteur (`PanneauGauche`) est créé puis vidé : ses sections `selection`, `filtres`,
  `categories` sont déplacées dans les onglets (les écouteurs suivent les éléments DOM).
- `vue.camera.animerVers` est enveloppée (courbe ease-out-expo) ; `vue.camera.cadrer` aussi
  (zone utile, décalage de la cible via le champ privé `anim`) ; `vue.cadrerTout` est remplacée.
- `vue.courbePerso` est posée dynamiquement selon le réglage.
- Libellés : `reglagesSigma.defaultDrawNodeLabel` (agrégat : nom + effectif en monospace) et
  `defaultDrawNodeHover` neutralisé (la fiche et le réticule suffisent).
- Changement de regroupement = destruction puis recréation de la vue (caméra, mode, granularité,
  sélection et onglet conservés). Tous les réglages sont écrits immédiatement dans `localStorage`
  avant la recréation (la sauvegarde du moteur est différée de 250 ms).

## Remarques sur le moteur (bugs / manques rencontrés)

- `Reglages` sauvegarde avec 250 ms de retard : une vue recréée tout de suite relit l'ancienne
  valeur (contourné ici).
- Les réducteurs sont appelés pendant la construction de sigma (dans le constructeur de
  `VueGraphe`), avant que `creerVue` ne rende la vue : un réducteur ne doit pas dépendre d'une
  variable posée après `creerVue` (piège rencontré ici, corrigé en passant la vue en paramètre).
- Pas de point d'extension pour le cadrage (marges de la zone utile) ni pour la courbe des
  animations de caméra : il faut envelopper des méthodes.
- `Camera3D.projeterPoint` ne renvoie pas la profondeur (utile pour trier des éléments dessinés).
- Pas d'API publique pour forcer une image (onglet masqué) : `vue.image` est privée.

## Vérification

- `npx tsc --noEmit -p .` : aucune erreur dans ce dossier.
- Navigateur (Claude in Chrome, onglet dédié, fermé ensuite). La fenêtre étant masquée
  (`document.hidden`, pas de `requestAnimationFrame`), la boucle a été avancée à la main
  (`atlasVue.image(t)`) et les calques canvas composés en PNG pour être relus. Console : aucune
  erreur au chargement ni après les manipulations (après correction d'un plantage au démarrage
  en mode cases).
- Mesure (boucle forcée, orbite continue, granularité 2) : ≈ 18 ms par image au total, dont
  ≈ 2,4 ms pour le calque dessous (faces, grilles, barres) et ≈ 1,6 ms pour le calque dessus
  (règles, réticule) ; le reste est sigma / moteur.

### Captures décrites

1. **Face orthographique, sous-thèmes** : fond gris-bleu très clair quadrillé ; colonnes des mois
   (traits forts) et semaines ; bandes horizontales des thèmes ; règle Z à gauche avec thèmes en
   gris et domaines en petites capitales colorées (ANALYSE bleu, APPRENTISSAGE AUTOMATIQUE
   sarcelle…) ; règle X en bas « avr. 2026 … sept. 2026 » en monospace, épine rouge, titre
   « X · date ». Agrégats ◎ avec barre d'erreur moyenne, libellé + effectif.
2. **Survol d'un nœud (nœuds)** : mire bleue, pointillés vers le bas et vers la gauche, pastille
   rouge « 2026-03-23 09:10 » sur la règle X et pastille bleue « Convergence monotone » sur la
   règle Z ; fiche technique à droite du pointeur.
3. **Zoom ×5** : règle X collée au-dessus de l'histogramme avec les numéros des jours, règle Z
   collée à gauche avec bandeau et libellés vers l'intérieur ; symboles ● ◐ ✕ nets avec leurs
   points de validation.
4. **Isométrique (perspective)** : trois faces du fond en coin, règles sur les arêtes basses
   (mois le long de X, couloirs le long de Y, thèmes sur Z), secteurs estompés au sol.
5. **Dessus** : cercles des domaines colorés avec leur nom en capitales, thèmes en pointillés,
   axes d'origine rouge / vert.
6. **Droite** : couloirs Définition … Observation sur la règle Y (verte).
7. **Cases (période × type, quinzaines)** : carrés alignés sur les colonnes de période ; survol
   d'une case : crochets d'étendue sur X et Z, pastille « 2026-04-05 → 2026-04-15 (10 j) ».
8. **Thème sombre** : fond presque noir, grilles claires discrètes, symboles rehaussés.
9. **Menu circulaire** : huit parts autour d'une aiguille, « Face » présélectionnée selon la
   direction du pointeur.

## Limites

- En « faces sémantiques », les graduations sont exactes seulement quand une face domine ; entre
  deux faces elles s'estompent (les positions sont un mélange). Le cube strict est la lecture exacte.
- Les cases sont placées au barycentre de leurs feuilles : en vue de face leur Z est la moyenne des
  thèmes (elles se regroupent au milieu) ; une vraie grille période × type n'est exacte que dans la
  vue de dessus en cube strict.
- Les bandeaux de règles collées masquent les points situés dessous.
- Les libellés de sigma (grille) peuvent encore se chevaucher entre agrégats proches.
- Fenêtre masquée pendant la vérification : les animations CSS (menu circulaire, tiroir) n'ont pas pu
  être vues en mouvement ; seul l'état final a été contrôlé.

## Idées suivantes

- Aimanter les cases sur les centres de colonne / couloir de la face regardée (grille 2D exacte).
- Brosse sur les règles (sélectionner une période ou un couloir en glissant sur l'axe) reliée aux
  filtres.
- Mesure entre deux points (Maj + clic : Δt, Δ couloir) comme un pied à coulisse.
- Graduations de confiance : une 4e règle (0…1) pour lire l'estimation du nœud survolé.
