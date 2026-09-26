# R1 · Squelette déductif

Une preuve telle qu'un mathématicien la dessinerait au tableau : seule la colonne vertébrale des
déductions, lue de gauche à droite en quatre colonnes nommées, le reste à la demande.

## Chiffres (jeu synthétique, 1600 × 1000)

| Niveau | Unités visibles | Flèches | Détail |
|---|---|---|---|
| **Squelette** (défaut) | **39** sur 224 nœuds | 52 sur 618 arêtes (dont ~12 en renvois « (k) ») | 25 cartes (12 étapes repliées), 8 décisions, 6 drapeaux ; 8 impasses, ~70 pastilles |
| + auxiliaires | 87 | 129 | branches annexes (ordre faible, trace infinie, annexes) repliées |
| Tout | 179 | 236 | aucun repli ; le contexte reste en pastilles |

Texte des cartes : 13 px de mise en page, ≈ 11 px à l'écran au cadrage initial. 2D ≈ 40–58 i/s, 3D ≈ 33–53 i/s selon les passes (capture Playwright, sans erreur console).

## Choix

- **Dérivation maison** (`squelette.ts`, trois stratégies enregistrées `r1-squelette`, `r1-auxiliaires`,
  `r1-tout`) :
  1. *le contexte n'est jamais une flèche* : hypothèses, axiomes, définitions admises, lemmes outils,
     littérature et choix de modélisation deviennent du contexte rattaché. Exception : les « objets
     centraux » (définition construite par une décision, ou citée comme prémisse principale ≥ 6 fois :
     le schéma, le schéma corrigé) restent des cartes ;
  2. *élagage* (squelette) : seul ce qui mène à un résultat majeur (théorème / résultat non admis) ou à
     une décision reste ; le reste est masqué (visible avec `L` ou au niveau « + auxiliaires ») ;
  3. réduction transitive (étape partagée) ;
  4. *repli des sous-arguments exclusifs* : tout ce dont l'unique usage (direct ou non) est un même
     énoncé C est replié dans C. Généralise la fusion de chaînes aux arbres (chaînes et éventails).
     Les ancres (décisions, choix, conjectures, théorèmes et résultats) ne se replient jamais ; dans
     une piste abandonnée tout se replie en une seule impasse grisée.
- **Mise en page maison** (`mise-en-page.ts`) remplaçant dagre (`vue.redisposer` surchargé, disposition
  appliquée par la transition animée de la vue) :
  - marge « Hypothèses & choix » (drapeaux, décisions sans prémisse), puis zones *Outils* (racines et
    leurs enfants partagés), *Étapes intermédiaires*, *Résultats* (majeurs dont toute la descendance
    est majeure) ; rangs = plus long chemin borné par zone ;
  - ordre par barycentres avec nœuds fictifs (les longues arêtes réservent un couloir), hauteurs par
    régression isotone vers la moyenne des voisins : les chaînes deviennent des lignes horizontales ;
  - arêtes orthogonales à coins arrondis (ou lissées), une piste verticale par destination ;
  - **renvois « (k) »** : une prémisse outil ou très partagée citée ≥ 2 rangs plus loin n'est pas une
    longue flèche ; la cible la cite par son numéro, comme une équation. C'est ce qui a supprimé le
    plat de spaghettis de la première version.
- **Rendu** (`rendu.ts`) sur les calques de la vue ; sigma ne dessine plus que les liens complets (L),
  ses points sont rendus invisibles par un réducteur, le survol passe par `vue.pointSous` surchargé.
  - carte : étiquette de type, statut ✓ ? ✕, validation H / IA / IA+H, titre (≤ 4 lignes), trait
    d'intervalle de confiance ; étape = feuillets empilés ; résultats en teinte foncée ;
  - décision : losange, libellé au-dessus, alternative rejetée en pointillé vers une pastille grisée ✕ ;
  - choix : drapeau à queue d'aronde dans la marge ; survol = bande de couleur à gauche de toutes les
    cartes qui en dépendent (graphe complet), le reste s'atténue ; clic = épingler la bande ;
  - pastilles sous la carte (H, D, O, A, L, +) ; survol = les cartes qui l'utilisent s'allument ;
  - double-clic sur une étape : dépliage sur place (animation depuis la position de l'étape, ordre
    stable grâce aux positions précédentes), halo pointillé « déplié · double-clic : replier ».
- Tweakpane, dossier **Squelette R1** : niveau de détail, largeur des cartes, écarts, taille du texte,
  pastilles max., arêtes orthogonales / lissées, rayon des coins, bandes de choix (survol / toujours),
  impasses, colonnes nommées. Panneau ☰ : niveaux, compte des éléments visibles, choix à épingler,
  « Tout replier », légende de lecture.

## Limites

- Le cadrage initial est limité par la largeur : 10 rangs + la marge. Au-delà (niveau « + auxiliaires »,
  stratégie « complet »), il faut zoomer ; les cartes restent à taille « papier » et rapetissent.
- Les renvois cachent des flèches réelles : la lignée (clic) les suit, mais pas le tracé.
- Le dépliage recalcule toute la mise en page : l'ordre est stable mais les rangs peuvent glisser d'une
  colonne quand le sous-argument est long ; la caméra ne recadre que si quelque chose sort de l'écran.
- En 3D, les cartes gardent leur forme 2D (projetées à plat) : lisible en vue de côté, dense en orbite.
- Les éléments de la marge (drapeaux) n'ont pas de flèche vers ce qui en dépend, par choix : la bande
  de couleur les remplace.
- Les objets centraux sont reconnus par une heuristique (décision ou ≥ 6 usages principaux) ; en base,
  un drapeau `central` annoté par l'agent rédacteur serait plus sûr.

## Idées

- Remplacer l'heuristique « objet central / outil » par un rôle annoté sur le nœud.
- Numéroter aussi les résultats (Théorème 1, Proposition 2…) pour une lecture « article ».
- Déplier en « loupe » (sous-graphe dans une bulle) au lieu de recalculer toute la page.
- Brosser une colonne entière pour la déplier d'un coup.
