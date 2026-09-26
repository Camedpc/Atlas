# V7 · Synthèse

Une seule proposition, un seul langage visuel : la **figure de revue** de V1 (papier, encre, palette
désaturée, Source Serif + Inter), dans laquelle on a intégré ce que les autres variantes font
le mieux. Ce qui ne s'accordait pas avec ce langage est devenu une option, ou a été écarté.
Le thème clair est la référence ; le sombre reprend les mêmes encodages.

## Fichiers

| Fichier | Rôle |
|---|---|
| `main.ts` | Assemblage : vue, crochets, palette, panneau, légende de figure, clavier (Espace, L) |
| `reglages.ts` | Réglages Tweakpane de la variante (dossiers « V7 · … ») et surcharges du moteur |
| `figure.ts` | Programmes sigma, réducteurs, trajectoire « jaillir / se resserrer », territoires, anneaux |
| `libelles.ts` | Placement des libellés sans chevauchement (boîtes, disques d'agrégats, zones réservées) |
| `axes.ts` | Vues de face et de droite : grille, règles graduées, réticule, barres d'erreur, couloirs |
| `lignee.ts` | Impulsions de lignée le long des arêtes courbes + boucle légère de redessin des calques |
| `lentille.ts` | Lentille focus + contexte (option) : ouvertures locales, fisheye, cercle gradué |
| `zoom.ts` | Zoom sémantique (option) : manuel, paliers ou continu |
| `fiche.ts` | Fiche de survol hiérarchisée + glyphes SVG (validation, échelle de confiance, statuts) |
| `commandes.ts` | Palette Ctrl + K |
| `panneau.ts` | Panneau gauche « application » (Graphe, Nœud, Activité, Réglages) |
| `activite.ts` | Maquette d'activité des agents (données factices) + pastilles de présence sur le graphe |

## Ce qui vient d'où, et pourquoi

- **V1, base esthétique.** Papier `#f6f4ee` avec un grain léger, encre presque noire, palette
  désaturée, typographie serif pour les noms. On reprend aussi le **placement de libellés maison** :
  domaines en capitales espacées, thèmes en romain gras, sous-thèmes en italique, corps ∝ √poids,
  halo papier. Ajouts : un libellé ne recouvre plus le disque d'un autre agrégat, ni les bandes des
  règles graduées. On garde la **bordure de validation** (filet pointillé, simple, double ou pleine),
  l'**anneau de confiance** des feuilles (arc foncé = estimation, arc clair = intervalle), les
  **territoires** des domaines, affichés en vue de dessus seulement, et les **arêtes courbes fléchées**.
  La transition « jaillir / se resserrer » passe maintenant par le point d'extension officiel
  `PointTrajectoire.sens`, sans remplacer `calculerPositions` sur l'instance.
- **V6, composition des agrégats.** L'anneau épais et le donut central sont remplacés par un
  **anneau fin segmenté** (validé, incertain, réfuté), séparé par un jeu constant en pixels : on lit
  la composition d'un coup d'œil sans alourdir la figure. En lignée, une **jauge** extérieure fine
  donne la part de sélection, d'ancêtres et de descendants de chaque agrégat.
- **V4, vues de face et de droite.** Chaque face a sa propre lecture :
  - la **face** (temps × thème) a une grille des mois et des semaines, des bandes de domaines, une
    règle X (dates en monospace, qui passent aux jours quand on zoome) et une règle Z (domaines en
    petites capitales colorées, thèmes en serif, sous-thèmes en italique) ;
  - la **droite** (type × origine) a des **couloirs de types teintés** un sur deux et nommés sur la
    règle Y, avec les origines H, IA et Ord. quand on zoome.

  Au survol, un **réticule** trace des rappels pointillés vers les règles, avec des pastilles de
  valeur aux couleurs Blender. Pour un agrégat, il ajoute un crochet d'étendue sur chaque axe. Les
  **étendues temporelles** s'affichent en **barres d'erreur** : moustaches min–max avec butées,
  boîte interquartile pâle. Les règles se collent au bord de la zone utile quand on zoome. En vue
  de dessus, il n'y a **aucune graduation**. Dans les vues d'axes, les disques d'agrégats rétrécissent
  (réglage « réduction en vues temps / type ») pour laisser lire les barres.
- **V3, lignée animée.** Des impulsions courtes coulent des ancêtres les plus lointains vers le
  nœud, puis vers les descendants, avec un décalage calculé par parcours en largeur. Elles suivent
  **exactement la courbe** dessinée par `@sigma/edge-curve` (même Bézier) et partent du bord des
  disques. Un fin anneau respire autour de la sélection. Hors de la lignée, le contexte recule
  davantage (réglage « estompage hors lignée »). Le rendu est sobre : ni halo, ni mélange additif.
- **V5, fiche de survol.** Elle est hiérarchisée : un surtitre en petites capitales et un titre
  serif, puis **trois informations clés** (statut + échelle 0–1 + valeurs ; glyphe de validation ;
  date, session et liens), puis un **détail que la touche Espace déplie** (chemin, énoncé, preuves).
  Pour un agrégat : effectif, **barre empilée des statuts**, période avec un histogramme temporel
  empilé, **trois nœuds principaux**.
- **Options activables** (panneau Réglages, palette ou Tweakpane) :
  - **Lentille** de V5 (désactivée par défaut, profondeur 1) : `L` l'épingle, Maj + molette règle
    son rayon, et le nombre de libellés qu'elle ajoute est plafonné ;
  - **zoom sémantique** de V2 (manuel par défaut, ou automatique par paliers ou en continu) : toucher
    au curseur de granularité ou aux touches `[` `]` repasse en manuel ;
  - **palette Ctrl + K** de V5 (active), enrichie des commandes du panneau et des options.

## Panneau gauche : pensé comme l'application

Bouton ☰ en haut à gauche, qui se change en ✕, ou touche **N** comme le N-panel de Blender.
Le panneau s'ouvre en 0,22 s. Deux modes :

- **pousse** (défaut) : la scène rétrécit et le graphe se recentre ;
- **surimpression** : le panneau flotte au-dessus de la scène, et le bas de l'interface se décale.

L'état ouvert et l'onglet sont mémorisés. Quatre onglets :

1. **Graphe** : aperçu (nœuds actifs, vue, granularité, barre des statuts globale), puis les filtres
   et l'arbre des catégories **du moteur**, déplacés tels quels (le moteur est monté en mode
   `externe`), et une légende en glyphes SVG.
2. **Nœud** : nœud sélectionné (surtitre, titre, fil d'Ariane cliquable, badges, **énoncé**,
   échelle de confiance), **lignée** (compteurs, descendants oui ou non, cadrer, effacer),
   **démonstrations** (validité, auteur, prémisses cliquables), **journal** en frise chronologique
   (dérivé des données), « utilisé par ». Pour un agrégat : composition et nœuds principaux.
   Un clic sur le graphe bascule sur cet onglet, ou pose une pastille sur ☰ si le panneau est fermé.
3. **Activité** (**maquette**, signalée comme telle) : **qui travaille où** (humains, agents IA,
   calcul, avec leur état), **verrous de zone**, **conflits en attente** (« Voir dans le graphe »,
   « Arbitrer… » désactivé), **sessions récentes** (vraies données). Tant que l'onglet est ouvert,
   des **pastilles de présence** (initiales, cadenas) se posent sur le graphe, à côté des zones concernées.
4. **Réglages** : réglages d'usage en segments et interrupteurs (thème, mode du panneau, 2D/3D,
   faces ou cube, zoom sémantique, lentille, impulsions, fiche, règles, palette, présence),
   bouton « Réglages avancés (Tweakpane) », raccourcis clavier.

## Écarté, et pourquoi

- **Territoires de V2** (courbes de niveau, marching squares) : coûteux (15 à 25 ms) et trop
  chargés à côté des anneaux. Les territoires en union de disques de V1 suffisent en vue de dessus.
- **Mini-carte de V2** : redondante avec le cadrage (Home) et avec la vue de dessus.
- **Halos, scintillement, poussière et profondeur de champ de V3** : spectaculaires en sombre, mais
  ils brouillent la lecture sur papier clair. Seules les impulsions ont été gardées.
- **Squelette par importance de V3** et **communautés Louvain de V6** : ce sont d'autres
  agrégations, qui changent la hiérarchie. Elles sont intéressantes mais demandent leur propre
  interface. À reprendre comme « regroupement » alternatif dans une itération suivante.
- **Symboles de forme de V4** (◐ ✕) et **barres d'erreur de confiance verticales** : ils doublent
  l'anneau de confiance et la couleur de statut. Nous avons gardé un seul encodage par dimension.
- **Faces du cube teintées en 3D de V4** : dans les vues d'axe, seule la face du fond est dessinée.
  En orbite libre, pas de cube : la figure reste légère.
- **Corolles de V6** (éclosion en pétales) : belles, mais concurrentes du jaillissement à ressort
  de V1, plus sobre. Un seul type de transition.
- **Légende de figure et onglets de V1** : la légende de figure est gardée, en plus compact. Les
  onglets sont repensés en onglets d'application.

## Réglages (Tweakpane)

Dossiers « V7 · figure / nœuds / agrégats / arêtes / transitions / libellés / axes / lignée /
fiche / zoom sémantique / lentille / interface ». Tout ce qui est visuel y est réglable : teintes,
épaisseurs, écarts, jeu entre segments, pâleur des disques, courbure, ressort, corps des libellés,
opacité de la grille, graduations, réticule, impulsions, lentille… Les réglages du moteur (tailles,
arêtes, durée et courbe des transitions, caméra, brouillard, thème) restent à côté. Seules les
valeurs modifiées sont mémorisées, et un bouton exporte la configuration en JSON.

## Vérifié

- `npx tsc --noEmit -p .` : aucune erreur dans ce dossier.
- Captures Playwright réelles (rAF actif, 1600 × 1000) : `capture.mjs v7-synthese` (dessus, face,
  droite, iso, mi-transition, granularités, survol, lignée, sombre), plus deux scripts propres
  (`v7.mjs`, `v7b.mjs`) : panneau sur ses quatre onglets, surimpression, fiche d'agrégat, fiche de
  nœud dépliée, lentille, palette « monte », mi-transition g = 1,45, face et droite avec réticule,
  face au niveau des nœuds, lignée d'une feuille (impulsions recadrées), iso, sombre avec le panneau.
- Aucune erreur console. **61 images/s** pendant une orbite, et aussi pendant une lignée animée.
- Deux passes de correction visuelle :
  1. **Première passe** :
     - agrégats réduits en vues d'axes ;
     - règles fantômes supprimées en orbite (seuil plus net) ;
     - libellés tenus à l'écart des disques des autres agrégats ;
     - légende de figure qui ne passe plus sous la barre des vues (bornée, puis masquée par requête de conteneur) ;
     - bas de l'interface décalé en surimpression ;
     - jauge de lignée amincie ;
     - bogue corrigé : la boucle d'impulsions demandait deux rAF par image, d'où une croissance exponentielle.
  2. **Seconde passe** :
     - impulsions qui suivent la courbe réelle des arêtes, plus visibles ;
     - contexte hors lignée plus estompé ;
     - bandes de libellés des règles réservées avant les noms de nœuds ;
     - lentille calmée (profondeur 1, libellés plafonnés, cercle plus lisible).

## Limites

- **Framing** : changer de vue (7, 1, 3) garde la cible et le zoom de la caméra, comme dans
  Blender. En venant d'une vue zoomée, la face peut être décentrée : Home recadre.
- **Lignée d'un agrégat** (clic sur un thème) : des centaines d'ancêtres et de descendants, donc
  beaucoup d'arêtes colorées. La lignée est surtout lisible sur une feuille.
- Les **libellés** sont placés de façon gloutonne à chaque image, sans hystérésis : pendant une
  animation, un nom peut changer de côté.
- En **vue de face au niveau des nœuds**, les sessions sont des rafales (des nœuds empilés à la
  même date). C'est la donnée elle-même, mais cela se lit mal sans zoom.
- L'onglet **Activité** est une maquette (données factices déterministes). Les verrous et conflits
  n'ont aucun effet.
- Le **journal** du nœud est reconstruit à partir des données (création, démonstrations,
  validation, statut) : la table `journal` d'Atlas n'est pas encore branchée.
- Le **zoom sémantique automatique** est global. La lentille et les ouvertures locales
  (double-clic, palette) restent actives et peuvent s'additionner.

## Recommandations pour la suite (quelle base retenir pour Atlas)

1. **Retenir V7 comme base d'interface.** Le langage « figure » (V1) est le plus lisible en thème
   clair, et le panneau à onglets est déjà une coquille d'application. La vraie app devra brancher
   l'onglet Nœud (journal réel, édition), l'onglet Activité (sessions et agents en temps réel,
   verrous, arbitrage) et les réglages persistants par utilisateur.
2. **Remonter dans le moteur** ce que V7 a dû écrire à côté :
   - réservation de zones pour les libellés, et placement sans chevauchement comme stratégie officielle ;
   - « calques animés » : un redessin des canvas sans `sigma.refresh`, au lieu de la boucle de `lignee.ts` ;
   - échelles sémantiques et règles de V4 en module partagé ;
   - courbure des arêtes lisible par les calques, pour les impulsions et les annotations.
3. **Garder les autres idées comme modes, pas comme variantes** :
   - regroupement alternatif (communautés de V6, squelette de V3) dans l'onglet Graphe ;
   - lentille pour l'exploration ;
   - zoom sémantique pour les très gros graphes.
4. **Tester sur données réelles** (`chargerDonnees()`) : les seuils de libellés, la réduction en
   vues d'axes et la vitesse des impulsions ont été réglés sur le jeu synthétique de 1 200 nœuds.
