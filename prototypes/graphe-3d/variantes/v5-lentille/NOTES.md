# V5 · Lentille — focus + contexte

Le graphe reste agrégé partout (granularité globale initiale : thèmes), sauf **là où regarde le
chercheur** : une lentille suit le curseur, et les agrégats qui passent dessous s'ouvrent localement.

## Fichiers

| Fichier | Rôle |
|---|---|
| `main.ts` | Assemblage : réglages, réducteurs, calques de la loupe, souris / tactile / clavier, barre d'outils, fil d'Ariane |
| `lentille.ts` | Classe `Lentille` : logique d'ouverture / fermeture (délais + hystérésis), fisheye, intensité lissée |
| `confiance.ts` | Réducteur de confiance + calque (arcs d'intervalle, badges de validation, anneaux d'agrégats) |
| `fiche.ts` | Fiche de survol hiérarchisée et mini-histogrammes (SVG) |
| `commandes.ts` | Palette de commandes Ctrl + K |

## Choix de conception

- **Lentille** (`lentille.ts`). Toutes les 50 ms : un agrégat visible et fermé, moins profond que
  `floor(g) + profondeur`, dont le disque touche la lentille depuis `delaiOuverture` ms, est ouvert
  (`granularite.ouvrir`). Les enfants sortent donc du parent, avec la transition du moteur. Une catégorie
  ouverte par la lentille se referme quand ni son centre ni ses enfants affichés ne sont dans
  `rayon × hystérésis`, et seulement après `delaiFermeture` ms. Elle referme aussi ses descendantes
  ouvertes par la lentille, les plus profondes d'abord. La lentille ne touche jamais une catégorie
  qui porte déjà une surcharge de l'utilisateur (double-clic, arbre du panneau).
- **Refermer = revenir au global** : j'appelle `Granularite.retirer(c)` (méthode *privée* du moteur,
  appelée par un cast), et non `replier`, qui forcerait une fermeture même si la granularité globale est
  plus fine.
- **Épinglage** : `L` (ou la puce « Lentille ») fige la lentille à l'écran. On peut alors lire les
  fiches sans que tout bouge. `Maj` + molette change le rayon.
- **Tablette** : un appui long (450 ms sans bouger) fait apparaître la lentille sous le doigt, qui la
  suit. Les `pointermove` sont interceptés en phase de capture sur `window`, donc le moteur n'orbite pas.
  Au relâchement, la lentille reste épinglée.
- **Fisheye** (Sarkar & Brown, `d' = R(k+1)t/(kt+1)`) : il est continu au bord et appliqué **en place
  sur la projection** juste avant `rendu.positionner`, que j'enveloppe (monkey-patch de l'instance).
  Calques, pointage (`uniteSous`) et survol sigma voient donc les mêmes positions déformées.
- **Effet visuel** : une ombre portée douce fait « flotter » la loupe, avec un voile très léger à
  l'intérieur. Une trame de points fixée à l'écran est déformée par le même fisheye : on *voit* la
  lentille grossir. Autour, un réticule gradué tous les 15° et une étiquette de niveaux
  (« Thèmes → nœuds », « épinglée »).
- **Contexte** : hors de la lentille, légère estompe en rampe (sur 25 % du rayon, pas de saut).
  Dans la lentille, les nœuds grossissent. Leurs libellés sont placés par mon calque (glouton, les plus
  gros d'abord, sans chevauchement, dans une bande autour du disque) et non par la grille sigma.
- **Confiance** : le remplissage est une teinte adoucie du statut. La **bordure** prend la couleur du
  statut et son épaisseur suit la certitude (1 − largeur de l'intervalle). Un **arc fin** montre
  l'intervalle [bas, haut] sur un cadran (0 en haut, sens horaire), avec un trait pour l'estimation. Il
  apparaît au survol, pour les voisins, pour la sélection et dès `seuilArc` px. Le **badge**
  IA / H / IA+H apparaît au survol et dès `seuilBadge` px, plafonné à `maxBadges`. Les **agrégats**
  ont un anneau segmenté par statut, avec environ 2 px d'écart entre segments.
- **Fiche** : d'abord une ligne de titre, puis 3 infos clés (statut + mini-intervalle + valeurs ;
  type · origine + badge ; date · session), puis un détail repliable. Comme la fiche ne capte pas la
  souris, le détail se déplie avec **Espace**. Pour un agrégat : compte et nombre d'enfants, un
  histogramme des statuts (barres + compte + %) et un histogramme temporel empilé par statut, sur toute
  la période du graphe (la position dit « quand »).
- **Palette Ctrl + K** (aussi `/`) : nœuds (ouvre la chaîne, sélectionne donc affiche la lignée,
  puis cadre), catégories, vues, granularité, filtres (seulement / exclure par statut, validation,
  origine, type, confiance min., mode), lignée, lentille, thème, panneau. Préfixes `>` actions,
  `#` catégories, `@` nœuds. Les correspondances sont surlignées. Navigation ↑ ↓ ↵ Échap.
- **Panneau en surimpression** : carte flottante translucide (flou d'arrière-plan). En tête, un fil
  d'Ariane cliquable (cadrage) de la catégorie courante : celle de la sélection, sinon celle du
  nœud le plus proche du centre de la lentille. Ensuite, section « Sélection » du moteur (énoncé,
  démonstrations, historique) et section « Lire un nœud » (glyphe légendé des encodages).
- **Réglages Tweakpane** : dossiers « Lentille » (rayon, profondeur, délais, hystérésis, fisheye,
  grossissements, estompe, apparition, cercle, trame, libellés), « Confiance (V5) » (teinte,
  bordures min/max, arc, anneau, badges et seuils) et « Fiche (V5) » (détail déplié, nombre de
  barres de l'histogramme).

## Vérifié (Chrome, fenêtre masquée : boucle avancée à la main via `atlasVue.image(t)`)

- `npx tsc --noEmit -p .` : aucune erreur dans ce dossier. Aucune erreur console.
- Ouverture sous la lentille (4 à 20 catégories selon l'endroit), fermeture après sortie et
  maintien quand elle est épinglée. Désactiver la lentille referme tout.
- Fonctionne aussi en vue 3D isométrique.
- Appui long tactile simulé : la lentille suit le doigt, la caméra ne bouge pas, et la lentille
  reste épinglée au relâchement.
- `Maj` + molette change le rayon.
- Fiches nœud et agrégat : contenu, histogrammes (24 barres), bascule Espace.
- Palette : « monte carlo » donne la catégorie puis les simulations ; ↵ sélectionne, puis le fil
  d'Ariane affiche « Atlas › Probabilités et statistique › Méthodes Monte-Carlo ». `>sombre` bascule
  le thème.
- Coût d'une image complète quand la lentille bouge : environ 7 ms (1 200 nœuds).
- Captures décrites (calques composés en JPEG) :
  - *clair, vue d'ensemble* : thèmes en disques bleus, cyans et violets avec anneaux de statut. Sous
    la lentille, les feuilles d'« Optimisation » sortent en petits anneaux verts, jaunes et rouges,
    avec une quinzaine de libellés sans chevauchement. Voile lavande et ombre douce, réticule gris.
  - *zoom + survol* : le nœud survolé grossit, ses 3 voisins restent nets avec des badges H / IA+H, le
    reste est estompé. L'arc rouge fin montre l'intervalle [0 ; 0,16] d'une observation réfutée.
  - *fiche d'agrégat* (« Analyse fonctionnelle », 165 nœuds) : barres Validé 91 / Incertain 51 /
    Réfuté 23, histogramme temporel empilé, détail déplié (validations, origines, types).
  - *sombre* : fond #0e1117, ombre noire autour de la loupe, libellés clairs lisibles.

## Limites

- Le fisheye tasse les nœuds vers le bord quand le centre de la lentille est vide. C'est normal pour
  cette déformation ; le facteur est réglable et vaut 0 pour la couper.
- Les sessions très denses (petits paquets de feuilles) restent serrées même agrandies : il faut
  zoomer, ou monter `fisheye` / `grossissement`.
- Si la lentille couvre beaucoup de thèmes, elle en ouvre beaucoup (cascade possible avec la
  profondeur 3). On peut réduire le rayon ou la profondeur.
- La pastille de survol sigma et mes libellés de lentille peuvent se toucher : une seule boîte est
  réservée pour le nœud survolé.
- L'épinglage fige la lentille en coordonnées **écran**, pas monde : si la caméra bouge, la
  lentille reste au même endroit de l'écran.
- La durée des transitions de la lentille est celle du moteur (`dureeTransition`), sans réglage
  propre.

## Moteur : ce que j'ai contourné (sans modifier `src/core`)

- `Granularite.retirer` est privée : je l'appelle par un cast. **Suggestion** : l'exposer, par
  exemple `granularite.revenirAuGlobal(c)`.
- Pas de point d'extension entre la projection et `rendu.positionner` : j'enveloppe la méthode de
  l'instance. **Suggestion** : un crochet `apresProjection(projection)`.
- La vue ne réagit pas aux `pointermove` quand rien ne bouge : j'appelle `demanderRendu()` sur
  chaque mouvement quand la lentille est active.
- Le style de la variante doit utiliser `#app .atlas-…` pour passer devant la feuille du moteur, qui
  est injectée après le `<link>` de la page. Attention, redéfinir `--fond` sur `.atlas-vue` écrase
  aussi le thème sombre, d'où la redéfinition explicite.
- Dans cette session, la page était rechargée à chaque sauvegarde de fichier par les autres agents
  (rechargement complet Vite) : il faut redéfinir les aides de test à chaque fois.

## Idées suivantes

- Lentille « sémantique » : ouvrir aussi les voisins (prémisses) des nœuds sous la lentille,
  même hors du disque, avec un trait de liaison.
- Plusieurs lentilles épinglées (comparer deux régions), chacune avec sa couleur.
- Lentille temporelle en vue de face : une bande verticale plutôt qu'un disque.
- Mémoriser la dernière lentille épinglée par vue (dessus / face / droite).

## Itération 2

Vérification faite avec Playwright (requestAnimationFrame actif) : `capture.mjs v5-lentille` (61 images/s,
aucune erreur) et mon script `scratchpad/shots/v5-scenarios.mjs` (captures dans
`out/v5-lentille-scenarios/`). `npx tsc --noEmit -p .` : aucune erreur dans ce dossier.

### Retours traités

1. **Niveau Nœuds : la lentille devient une loupe.** Quand la granularité globale vaut Nœuds, il n'y a
   plus rien à ouvrir. La lentille devient une loupe de lecture : fisheye, grossissement plus fort
   (réglage `grossissementLoupe`), libellés placés sans chevauchement, et surtout l'**arc d'intervalle
   et le badge de validation** pour chaque nœud sous la loupe, même petit. L'étiquette affiche
   « loupe : libellés et confiance » et la puce « Loupe : suit le curseur ». Réglage `loupeNoeuds` pour
   revenir à une loupe simple.
   *Pourquoi ce choix.* La désactiver retirerait l'outil précisément quand le graphe est le plus dense,
   alors que c'est là qu'un détail à la demande sert le plus. Ouvrir les démonstrations serait un
   nouveau niveau de données (les démonstrations ne sont pas des unités du graphe) : ça demanderait
   de nouvelles unités dans le moteur, et le panneau montre déjà les démonstrations de la sélection.
   Au niveau Nœuds, la question du chercheur devient « que dit ce paquet et à quel point est-ce
   sûr ? » : c'est exactement ce que la loupe affiche.
2. **Contexte plus lisible hors lentille.** Le remplissage des nœuds est plus saturé
   (`teinteRemplissage` 0,5 → 0,28), la bordure minimale plus épaisse (0,14 → 0,18) et l'estompe
   hors lentille plus faible (0,22 → 0,15). En mode loupe, il n'y a **aucune** estompe hors du
   disque : le graphe entier reste net. Le fisheye passe à un profil **doux**,
   `d' = d(1 + k(1 − t)²)`, tangent à l'identité au bord : les nœuds ne se tassent plus contre le
   cercle. L'ancien profil Sarkar-Brown y écrasait les nœuds sous un anneau de libellés.
3. **Lentille ancrée au graphe** (réglage `ancrageLentille`, défaut `graphe`, commande dans la
   palette). À l'épinglage, je convertis le centre écran en point monde (plan de la cible caméra).
   Chaque image, dans le crochet `apresProjection`, je le reprojette avant d'appliquer le fisheye.
   Vérifié : après un déplacement de caméra de (−220, +90) px, la lentille passe de (820, 470) à
   (600, 560) (capture `09-ancree-apres-deplacement`). Le rayon reste en pixels (instrument
   d'écran). L'appui long tactile épingle avec le même ancrage.
4. **Palette, fiche et dépli vérifiés en capture réelle.**
   - `04-palette-vide`, `05-palette-recherche` : « monte carlo » donne la catégorie puis 11
     simulations, avec correspondances surlignées et ligne active marquée d'un filet bleu.
   - `07-palette-actions` : `>filtre` liste les actions. À score égal, elles gardent leur ordre
     logique.
   - `02-fiche-noeud` : titre, « Validé » + mini-intervalle 0,92 [0,91–0,97], « Calcul · Ordinateur »
     + badge IA+H, date · session.
   - `03-fiche-noeud-detail` (après Espace) : chemin, validation, liens (2 prémisses · 135
     descendants), preuves, énoncé.
5. **Vues face et droite.** En vue de face (poids de l'axe temps > 0,3), un agrégat s'ouvre si la
   lentille croise la **boîte de sa capsule** (q25 → q75 projetés, `etendueTempsEcran`), et pas
   seulement son disque à la médiane. La fermeture utilise la même emprise (avec l'hystérésis).
   Vérifié sur « Intégration » : la lentille posée sur q25, à 530 px de la médiane, l'ouvre
   (`10-face-capsule`). En vue de droite, j'ai d'abord essayé la capsule des couloirs : chaque
   thème couvre presque tous les types, donc 29 catégories s'ouvraient d'un coup. J'ai retiré cet
   axe, et seuls le disque et la médiane comptent en vue de droite (`11-droite`).

### Aussi corrigé

- Des libellés de lentille « flottaient » loin de leur nœud. Le placement à gauche dépendait
  d'une largeur mesurée avant le chargement de la police web. Le texte est maintenant ancré au
  nœud (`textAlign: right`) et les largeurs sont remesurées après `document.fonts.ready`.
- Les badges ne se chevauchent plus (placement glouton, survol et voisins d'abord). Pendant un
  survol, il n'y a plus de badges sur les nœuds estompés.
- Moteur : j'utilise maintenant `apresProjection` (au lieu d'envelopper `rendu.positionner`) et
  `granularite.revenirAuGlobal(c)` (au lieu du cast vers la méthode privée).

### Limites restantes

- En vue de droite, la lentille n'utilise pas les étendues par type (décision ci-dessus). Une
  meilleure piste : n'ouvrir que les tranches « catégorie × couloir » sous le disque, ce qui
  demanderait des unités par couloir dans le moteur.
- Le mode loupe s'active seulement si la granularité globale est entière à 3. Avec des ouvertures
  locales complètes à un niveau inférieur, la lentille reste en mode ouverture (sans effet visible).
- Une lentille ancrée hors écran (après un grand déplacement) n'est pas ramenée. Il faut appuyer
  sur L pour la désépingler.
