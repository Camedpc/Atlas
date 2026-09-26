# R2 · Plan de métro des arguments

Le raisonnement dessiné comme un plan de métro. Chaque fil d'argument est une ligne colorée et
numérotée. Les résultats clés sont des stations, les décisions des aiguillages et les hypothèses des
terminus de départ, à gauche. Les choix de modélisation sont des zones tarifaires en fond. Les étapes
intermédiaires restent rangées dans les tronçons et s'ouvrent au clic.

## Chiffres (jeu synthétique, 1600 × 1000, thème clair)

| Élément | Nombre | Où le voir |
|---|---|---|
| **Arrêts sur le plan** (terminus, stations, correspondances, aiguillages) | **33** sur 224 nœuds | à l'ouverture, tous libellés |
| Lignes (fils d'argument) | 4, dont une abandonnée | plan, légende |
| Tronçons | 45 | plan (tracés) |
| Zones tarifaires | 2 (7 choix et décisions de cadre) | fond, légende (puces) |
| Étapes intermédiaires dans les tronçons | 120 | clic sur un tronçon, perles blanches sur la ligne |
| Impasses (vérifications, annexes) | 27 | clic sur leur station |
| Contexte pur (définitions, axiomes, outils admis) | 37 | touche `L` |

33 + 7 + 120 + 27 + 37 = 224 : chaque nœud du graphe complet a une place, et la légende
(« Ce qui est caché ») affiche ce décompte. À l'ouverture, on voit donc 33 arrêts libellés, quelques
voies rejetées et deux étiquettes (« contredit », « résout ») : l'objectif de 25 à 40 éléments est
tenu. Les libellés font 12 px (12,5 px pour les résultats) au cadrage initial.

Mesure Playwright : environ 44 images/s en déplacement 2D et 46 en orbite 3D, sans erreur ni
avertissement dans la console.

## Comment les lignes sont déduites (`plan.ts`)

1. **Stratégie de lecture `r2-metro`** : on garde les prémisses principales et auxiliaires. Le cadre
   commun (sous-problème « cadre », outils admis hors définitions) devient du contexte. Les choix de
   modélisation ne tracent plus d'arêtes : ils deviendront des zones.
2. **Genres** : les théorèmes, résultats, propositions et conjectures non admis deviennent des
   **stations**, de même que les nœuds reliés par « contredit » ou « résout ». Les décisions sont des
   **aiguillages** et les hypothèses des **terminus**. Tout le reste est une **étape**. Une
   proposition en impasse, sans station en aval, redevient une étape.
3. **Tronçons** : il y a un tronçon de station à station quand un chemin de lecture les relie sans
   passer par une autre station, après réduction transitive. Un raccourci n'est gardé que s'il porte
   au moins 4 étapes. Chaque étape est rangée dans un seul tronçon, entre sa station amont la plus
   proche et sa station aval la plus précoce. Une étape sans aval va dans l'**annexe en impasse**
   d'une station amont.
4. **Lignes** : il y a une ligne par sous-problème (SP1 Stabilité, SP2 Convergence forte, SP3
   Validation numérique, piste compacité abandonnée). Un tronçon appartient au sous-problème
   majoritaire de ses étapes, sinon à celui de son chemin, sinon à celui de sa station de départ : un
   fil court ainsi jusqu'à la correspondance où il est utilisé. Une ligne coupée en morceaux est
   raccordée par le plus court chemin de stations. Les tronçons partagés portent alors plusieurs
   lignes, dessinées en **parallèle**, et une station desservie par plusieurs lignes devient une
   **correspondance** (capsule).
5. **Zones tarifaires** : pour chaque choix, on prend les stations qui en dépendent dans le graphe de
   justification complet (`dependantsDe`). Les choix dont les ensembles se recouvrent presque
   (Jaccard ≥ 0,85) sont regroupés. Ici, cela donne la zone 1 « Cadre discret » (six choix, 25
   arrêts) et la zone 2 « Stratonovich » (15 arrêts).
6. **Mise en page** : l'axe horizontal est la profondeur logique (plus long chemin depuis les
   terminus). Des points fictifs découpent les tronçons longs. Les lignes sont ordonnées en bandes,
   puis on fait des balayages de barycentres et une relaxation des hauteurs, avec une régression
   isotone qui garantit l'ordre et l'écart minimal. Enfin, on arrondit sur une grille et une recherche
   locale réduit les croisements et les coudes. Les tracés sont **octolinéaires** : sortie
   horizontale, diagonale à 45°, et une verticale si la dénivelée est trop grande.

## Choix de conception

- **Rendu sur les calques de la vue** (`rendu.ts`). Sigma ne dessine plus que des disques invisibles
  qui servent de cibles au survol. Les zones, les lignes (avec un liseré de la couleur du fond aux
  croisements), les symboles et les libellés sont dessinés en coordonnées écran. En 3D, la profondeur
  est interpolée le long des tracés.
- **Symboles** : cercle pour une station, cercle à point central pour un théorème ou un résultat,
  capsule pour une correspondance, carré pour un terminus, losange pour un aiguillage. La bordure
  indique le statut : pointillés orange pour « incertain », croix rouge pour « réfuté ». Une pastille
  indique qui a validé (humain, IA, IA + humain). L'intervalle de confiance est dans la fiche.
- **Aiguillages** : chaque alternative rejetée devient une courte voie en tirets terminée par un
  butoir, avec son libellé « ✗ … » au survol ou à la sélection. La piste abandonnée est une ligne
  creuse (deux rails) qui finit en **terminus barré** avant l'aiguillage, avec sa raison en toutes
  lettres dans la couleur de la ligne.
- **Étapes** : une perle blanche par étape masquée (12 au plus) montre qu'un tronçon « contient
  quelque chose ». Le survol d'un tronçon ouvre une bulle (ligne, extrémités, liste des étapes). Le
  clic le déplie : les étapes se placent le long du tracé, avec leurs libellés à 45°.
- **Libellés** : un placement glouton par priorité (voies rejetées, résultats, aiguillages, terminus,
  stations) essaie 8 positions. Les pénalités portent sur le recouvrement, la proximité d'un autre
  libellé (écart minimal de 7 px) et le passage sur les tracés. Un libellé sans place disparaît, sauf
  s'il est prioritaire, et il revient au zoom ou au survol.
- **Légende façon métro** : un bandeau bas en quatre colonnes (lignes, symboles, zones avec leurs
  puces de choix, ce qui est caché). Survoler une ligne fait ressortir tout son parcours et la cliquer
  l'épingle. Survoler une puce de zone ouvre la fiche du choix et allume sa zone, et la cliquer montre
  sa portée. En 3D, la légende se replie automatiquement.
- **Panneau ☰** : il permet de masquer ou d'afficher chaque ligne, de tout déplier ou tout replier,
  et liste les tronçons dépliés avec leurs étapes.
- **Tweakpane** : les dossiers « Plan de métro » (épaisseurs, tailles, police et largeur des
  libellés, estompe, zones, teinte, voies rejetées, perles, pastilles) et « Plan · mise en page »
  (largeur des colonnes, écart des parallèles, attraction des bandes) recalculent le plan.
- **Thème sombre** : la palette des lignes et des zones est redéfinie sur
  `.rsn-vue[data-theme='sombre']`. Dernière passe : j'ai éclairci le fond et le trait des zones 1 et
  2, qui se perdaient dans le fond.

## Captures

Les captures sont dans `scratchpad/shots/out-raisonnement/r2-metro/`. `capture-raisonnement.mjs`
produit les vues 01 à 07 : démarrage, survol, lignée, liens complets, 3D de côté, thème sombre et
stratégie « complet ». `capture-r2-etats.mjs` produit les vues 08 à 13 : survol et dépliage d'un
tronçon, ligne survolée dans la légende, puce de zone, aiguillage et panneau.

Corrections de la dernière passe :

- les libellés des voies rejetées passent désormais par le placement anticollision : avant, ils
  chevauchaient « Bruit de trace infinie » et les étapes dépliées ;
- deux libellés voisins sont séparés par un écart minimal : « Bruit de trace infinie » et « Ordre 1/4
  sous bruit de trace infinie » se lisaient comme un seul libellé ;
- les zones sont plus lisibles en thème sombre.

## Limites

- Les lignes viennent des **sous-problèmes** déclarés dans les données. Sans cette annotation, il
  faudrait les déduire, par exemple par communautés sur le graphe de lecture ou par chemins
  disjoints maximaux.
- Avec seulement 2 zones, le regroupement Jaccard fonctionne bien ; au-delà de 3, les couleurs de
  zone saturent (palette de 3 teintes) et l'imbrication n'est pas dessinée explicitement.
- Les étapes dépliées d'un long tronçon (23 étapes de validation numérique) donnent un peigne de
  libellés à 45°, lisible seulement après le cadrage automatique. Ces libellés ne passent pas par
  l'anticollision.
- La mise en page est entièrement maison : il n'y a pas de garantie d'optimalité sur les croisements,
  et quelques libellés restent posés sur un tracé.
- Quand le panneau ☰ est ouvert, la légende se resserre et la colonne des symboles passe sur deux
  lignes.
- Le compteur de la barre dit « 33 arrêts sur 224 nœuds », mais les 120 étapes restent accessibles.

## Idées suivantes

- Déduire les lignes sans sous-problèmes : décomposer en chemins, avec un coût de correspondance.
- Replier aussi les impasses en « voies de garage » visibles, avec leur nombre, sur la station.
- Diagramme de ligne linéaire : isoler une ligne en une barre droite avec toutes ses étapes, comme
  les plans de ligne affichés dans les rames.
- Carte de zones imbriquées : zones en courbes de niveau quand les choix sont emboîtés.
- Dépliage animé : les stations voisines s'écartent pour faire de la place aux étapes.
