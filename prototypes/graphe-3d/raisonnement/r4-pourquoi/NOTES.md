# R4 · Lecture progressive : « pourquoi ? »

Au lieu de tout montrer, on part de ce qui compte : les résultats à droite, les fondations à gauche,
et on déplie le raisonnement à la demande, comme on remonte une preuve.

## Ce qu'on voit

- **À l'ouverture** (jeu synthétique, 1600 × 1000 px), il y a **21 unités** : 6 résultats (4 résultats
  et 2 théorèmes non admis) et 15 fondations (7 hypothèses, 6 choix de modélisation, 2 décisions de
  départ). S'y ajoutent **5 arêtes** et **5 fils repliés**, avec leur compteur (« 55 étapes », « 34
  étapes »…). On compte donc environ 31 éléments, sur 160 unités de lecture et 224 nœuds.
- **Fils repliés** : ce sont des pointillés qui s'estompent vers la gauche. Ils se terminent par un
  bouton « ‹ pourquoi ? ». Le compteur donne le nombre d'unités masquées en amont, atteintes sans
  traverser une unité visible. Survoler le bouton trace en éventail les fondations sur lesquelles
  repose la partie repliée.
- **« ‹ pourquoi ? »** déplie **un niveau** de prémisses de lecture. Elles glissent depuis la gauche,
  apparaissent en fondu et prennent la colonne de gauche. La prémisse principale, celle qui a la plus
  longue histoire, reste **sur la même horizontale** que sa conclusion ; la chaîne se lit alors comme
  une phrase. Les autres prémisses s'écartent au-dessus puis au-dessous.
- **Fil d'Ariane** : il se lit Résultat ← Étape ← … ← focus ← fondation directe. Chaque élément est
  cliquable (sélection et cadrage). Les arêtes du chemin sont en accent.
- **Lecture guidée** (G, puis ← et →) : c'est un diaporama de la preuve d'un résultat au choix.
  Le parcours se fait en profondeur, prémisse principale d'abord ; « Résultat principal » compte
  68 pas. Chaque pas affiche « Pourquoi « C » ? » et la phrase « De A et B, on déduit C », avec le
  verbe adapté au type (on décide, on observe, le calcul donne…), les prémisses auxiliaires et
  techniques, et les décisions rencontrées. Par défaut, le mode compact montre le chemin et les
  prémisses du pas, soit au plus environ 30 unités. Le mode cumulatif est un réglage.
- **Décisions** : un losange orange, souligné. L'étiquette porte « ✓ retenu plutôt que … ». Dès
  qu'un dépliage révèle une décision, un encart **« Ici, on a fait un choix »** s'ancre sous le
  graphe, relié au nœud par un trait : question, choix retenu, alternatives écartées (leur raison au
  survol), puis « parce que ». Le panneau ☰ liste toutes les décisions et tous les choix ; un clic
  révèle la décision et son chemin vers un résultat.
- **Mode « comment ? »** : c'est le sens inverse. On part d'une hypothèse ou d'un choix, et ce qu'ils
  ont permis apparaît à droite. Pour un choix sans suite de lecture, comme le domaine périodique, on
  montre les unités qui le citent en contexte.
- **Ruban d'ensemble** (en bas) : il montre les 160 unités en miniature, dans la disposition dagre de
  la référence. Les unités affichées sont en couleur, le chemin est entouré. Survol = nom ; clic =
  révéler l'unité et son plus court chemin vers ce qui est visible.
- **Fiche de survol**, sur le nœud ou sur son étiquette : c'est la fiche partagée, enrichie de la
  phrase de déduction et de l'état des fils (prémisses repliées, étapes en amont et en aval). Elle
  donne aussi le statut, la validation et l'intervalle de confiance. Chaque étiquette affiche le type,
  le statut et la confiance.
- **3D** (T) : vue de côté, où la profondeur correspond au type. Les étiquettes se réduisent au nom ;
  boutons et encarts sont masqués.

## Choix de conception

- **Visibilité dérivée**. L'ensemble affiché n'est jamais stocké : il se calcule à partir de la base
  (résultats et fondations) et des demandes de l'utilisatrice (`deplies`, `comments`, `explicites`).
  Replier un nœud ne retire que ce que rien d'autre ne retient. Un changement de stratégie conserve
  l'état, grâce aux ids.
- **Disposition maison** (`disposition.ts`) :
  - seules les unités visibles sont placées ;
  - colonne = C − (plus long chemin visible vers un résultat) ;
  - le côté « comment » part de la gauche ;
  - tant qu'il reste des fils, une colonne vide sépare les fondations du raisonnement ;
  - chaque colonne est tassée par régression isotone : déplacement minimal, ordre conservé, rangée
    plus haute pour une décision ;
  - les unités masquées attendent derrière le fil de leur descendant visible, d'où l'effet de
    glissement depuis la gauche.
- **Arêtes longues en arc** (au moins 2 colonnes, hors fondations). Elles sont dessinées sur le calque
  et contournent les rangées au lieu de les traverser.
- **Caméra qui suit la lecture**. Si toutes les colonnes ne tiennent pas avec un écart lisible
  (200 px), on cadre une fenêtre de colonnes autour du focus : ses prémisses et le chemin vers la
  droite. « Cadrer » (Origine) montre tout.
- **Bouton court**. Si un voisin occupe la gauche d'un nœud, « pourquoi ? » passe dans l'étiquette
  (« ‹ pourquoi ? · 27 »), où la place est garantie. Une hystérésis évite le clignotement.
- **Étiquettes HTML** plutôt que sigma : taille 13 px, deux lignes au plus, boutons cliquables. Les
  fondations tiennent sur une ligne, leur groupe donnant le type.

## Réglages (Tweakpane, dossier « Vision R4 · pourquoi ? »)

Sens, un seul chemin déplié, lecture guidée cumulative, encarts de décision, ruban et sa hauteur,
écarts (colonnes, lignes, fondations), colonnes vides, colonnes min., colonne lisible min.,
taille et largeur des étiquettes, opacité des fils, opacité des arêtes issues des fondations. Plus
tous les réglages partagés (thème, 3D, liens complets…).

Clavier : P = pourquoi ?, C = comment ? (sur la sélection ou le focus), G = lecture guidée,
← → = pas, R = tout replier, Échap = quitter le guide ou effacer la lignée, plus les raccourcis
partagés (T, L, N, Origine).

## Chiffres (captures Playwright, 1600 × 1000)

| État | Unités affichées |
|---|---|
| Ouverture | 21 / 160 |
| « pourquoi ? » sur le théorème de convergence | 24 |
| puis sur « Estimation d'énergie de l'erreur » | 27 |
| puis sur la décision « norme L² » | 28 |
| « Déplier un niveau » depuis l'ouverture | 31 |
| Lecture guidée, pas 21 / 68 (compact) | 27 |
| « comment ? » sur la condition CFL | 29 |

Il n'y a aucune erreur console. On mesure environ 55 à 60 images/s en déplacement 2D et 50 à
60 images/s en orbite 3D.

## Limites

- La vision appelle la méthode interne `appliquerDisposition` de la vue (cast TypeScript) pour
  imposer sa disposition. `src/raisonnement` n'expose pas d'API publique pour une disposition fournie
  par la vision. Il faudrait ajouter `vue.imposerDisposition(d)` aux fondations.
- La vision remplace aussi `vue.pointsVisibles` et `vue.pointSous` sur l'instance : le premier pour
  le cadrage, le second pour que le survol d'une étiquette vaille le survol du nœud.
- Les arêtes issues des fondations restent droites et atténuées. Quand une étape profonde cite une
  hypothèse, elles traversent le graphe.
- Avec beaucoup de dépliages (plus de 8 colonnes), la caméra ne montre plus qu'une fenêtre. Le ruban
  et « Cadrer » donnent le reste.
- La lecture guidée ne va que dans le sens « pourquoi ». Elle est longue (68 pas pour le résultat
  principal), mais la barre de progression est cliquable.
- La « prémisse principale » est choisie par le nombre d'ancêtres, faute d'annotation explicite.

## Idées

- Annoter en base la prémisse « porteuse » de chaque démonstration pour guider l'alignement
  horizontal, au lieu de l'heuristique du nombre d'ancêtres.
- Lecture guidée « comment ? » : partir d'une hypothèse et dérouler tout ce qu'elle permet.
- Résumer la preuve dépliée en texte continu, exportable dans l'article.
- Mettre en valeur la contradiction résolue (« Pente 0,26 » contredit « Ordre 1/2 sans correction »)
  comme un pas spécial de la lecture guidée.
