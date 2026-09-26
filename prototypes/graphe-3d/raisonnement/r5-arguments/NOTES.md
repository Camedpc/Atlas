# R5 · Carte d'arguments

Le raisonnement se lit comme une suite d'**arguments** (modèle de Toulmin), avec les questions et les
décisions d'IBIS. Une carte = une conclusion, ses 1 à 3 raisons principales, la garantie qui fait le lien
et un qualificatif (statut, confiance, intervalle). Les cartes s'enchaînent de gauche à droite : la
conclusion d'une carte devient la raison de la suivante.

## Chiffres (jeu synthétique, 1600 × 1000)

| | Graphe complet | R0 (lecture a+b+c) | **R5** |
|---|---|---|---|
| Nœuds / unités visibles | 224 | 160 | **28 cartes** |
| Arêtes visibles | 618 | 233 | **35 flèches** (+ 3 liens objection / réponse / clôture) |
| Autres éléments | — | — | 1 bloc « Données » (H1–H7), 1 bandeau de 6 hypothèses de travail, 4 couloirs |

Au total, on voit environ 39 éléments à l'ouverture. Les libellés restent lisibles sans zoomer : les
cartes font environ 145 × 58 px et le titre est en 12 px. Il y a très peu de croisements.

## Choix

- **Stratégie de dérivation maison** (`arguments.ts`, `enregistrerStrategie('r5-arguments')`) :
  - chaque nœud reçoit un rôle argumentatif :
    - *carte* : théorème, proposition, résultat, décision, conjecture ou objection (un nœud qui contredit) ;
    - *membre* : lemme, assertion, calcul ou mesure ;
    - *donnée* : hypothèse ;
    - *modèle* : choix de modélisation ;
    - *garantie* : énoncé admis ;
  - un membre est absorbé dans la carte qu'il sert : la première carte atteinte par ses prémisses
    principales, sinon la plus proche. À égalité, un argument actif l'emporte sur une question ;
  - les vérifications et compléments sans aval suivent leur parent ;
  - un admis « dérivé » (le schéma corrigé, issu d'une décision) redevient une étape ;
  - ensuite : réduction transitive entre cartes et rupture des cycles.
  L'invariant de `lecture.ts` est respecté : aucun avertissement de correspondance.
- **Disposition maison** (`mise-en-page.ts`) : la disposition dagre de la vue place des points, alors que
  les cartes sont des rectangles.
  - Colonne = plus long chemin.
  - Une **décision se pose au-dessus** de la carte qu'elle gouverne : même colonne, flèche verticale
    orange. Cela gagne 2 colonnes et rend visible « cette question tranchée conditionne ceci ».
  - Une **objection se place juste sous** la carte qu'elle attaque, avec un lien rouge « ✗ contredit ».
  - Les **couloirs** correspondent aux sous-problèmes : piste abandonnée hachurée, SP1, SP2, SP3.
  - Les rangées sont choisies par balayages barycentriques.
  - Le résultat est installé dans la vue comme une `Disposition` ordinaire. Sigma reste donc le moteur
    de caméra, de survol, de lignée, de 3D et de liens complets.
- **Cartes en HTML** (`rendu.ts`), synchronisées sur `vue.projection`. Les flèches, les garanties, les
  couloirs et les liens d'objection sont dessinés sur le calque « dessous ». Le point sigma de chaque
  carte reste actif, mais petit et recouvert par la carte.
- **Zoom sémantique**, selon la largeur de la carte à l'écran (seuils réglables) :
  - moins de 235 px : conclusion et qualificatif ;
  - à partir de 235 px : raisons (∵ membre avec son nombre de sous-étapes ; ◂ raison venue d'une autre
    carte), attaques et réponses, alternatives ✗ d'une décision, données citées (« sous H2 H5 »),
    vérifications. La **garantie** apparaît sur la flèche entrante, sous la forme « ⊢ Grönwall discret +5 » ;
  - à partir de 370 px : énoncé, garanties, réserves et raison de la décision.
- **Visible dès l'ouverture** :
  - onglet rouge ✗ : carte attaquée ou réfutée ;
  - onglet ambre ⚠n : réserves, c'est-à-dire énoncés incertains ou variantes à vérifier ;
  - bulles « ? » à bord pointillé pour les questions : ouverte, réfutée (barrée) ou abandonnée ;
  - cartes « Décision ✓ » sur fond orangé ;
  - bandeau M au-dessus des cartes qui dépendent directement d'une hypothèse de travail.
- **Hypothèses de travail** : un bandeau global M1–M6. Chaque puce indique sa portée (nombre de cartes)
  et la décision qui l'a produite. Au survol, les cartes concernées sont mises en avant ; au clic,
  `montrerPortee` donne la portée complète. Les **données** H1–H7 sont citées par étiquette et jamais
  par des arêtes, ce qui évite les croisements.
- **Fiche de survol structurée à la Toulmin** : qualificatif, décision (✓ retenu / ✗ rejeté + raisons),
  raisons, garantie, hypothèses, attaques et réponses, réserves.
- **Panneau ☰** :
  - mode d'emploi illustré ;
  - listes cliquables des décisions, des questions, des objections, de M et de H ;
  - « carte dépliée » : tous les nœuds de la carte sélectionnée, dans l'ordre (chemin principal,
    vérifications, compléments).
- **3D** (`T`) : les cartes sont simplifiées et placées à la profondeur de leur type. Les plans de
  couches sont ceux de la vue ; le bloc H et le bandeau M sont sur leurs couches (« hypothèses »,
  « choix »).
- **Tweakpane**, dossier « Vision R5 · cartes » :
  - seuils de zoom, taille des cartes, écarts, couloirs ;
  - décisions au-dessus, garanties, objections, bandeaux ;
  - courbure, opacité des flèches, police.

## Limites

- `appliquerDisposition` est privée dans `vue.ts`. On l'appelle par un transtypage : c'est le seul moyen
  d'installer une disposition calculée hors de `disposition.ts`. Une API publique
  `vue.installerDisposition(d)` serait plus propre.
- `vue.cadrer` et `vue.pointSous` sont surchargés sur l'instance :
  - `cadrer` cadre les coins des cartes, pas seulement leurs centres ;
  - `pointSous` fait un test géométrique sur les rectangles et les étiquettes, car sigma écoute les
    clics sur son propre canvas, sous le calque HTML.
- La carte « Ordre 1/2 observé » absorbe 33 nœuds, dont les mesures de coût (compléments). Les réserves y
  sont nombreuses (⚠8), parce que chaque mesure incertaine compte.
- Un lien de « réemploi » en pointillé part de la conjecture réfutée vers le théorème. Ses lemmes de
  consistance sont repris par la preuve correcte : c'est exact, mais la sémantique est subtile.
- Avec les liens complets (`L`), les cartes deviennent translucides et les arêtes passent dessous. Ce
  mode reste un mode de vérification.
- La 3D reste un outil de lecture des couches. Les cartes y sont petites et l'étiquette de lien peut
  chevaucher.

## Idées

- Un bouton « déplier sur place » : la carte s'ouvre en mini-chaîne de ses membres dans la carte.
- Des positions IBIS pour les conjectures ouvertes (« pour / contre ») dès que la base les stocke.
- Un score d'attaque : propager les réserves vers l'aval pour montrer ce qui est fragile par héritage.
