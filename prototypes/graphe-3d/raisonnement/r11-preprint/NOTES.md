# R11 · Preprint

Le squelette déductif de R1, redessiné comme une figure d'article (Physical Review, preprint arXiv) :
la structure et la clarté de R1 sont conservées, seul le langage visuel change. Objectif : un outil
scientifique précis, pas un assistant pédagogique.

## Ce qui est repris de R1 sans changement

- Dérivation (`squelette.ts`, stratégies renommées `r11-squelette`, `r11-auxiliaires`, `r11-tout`) :
  contexte rattaché, élagage vers les résultats majeurs, réduction transitive, repli des
  sous-arguments exclusifs, dépliage au double-clic.
- Mise en page (`mise-en-page.ts`) : marge des hypothèses de travail, colonnes, rangées horizontales,
  arêtes orthogonales, renvois pour les prémisses lointaines.
- Interactions : survol, lignée au clic, portée d'un choix au survol et épinglage, niveaux de détail,
  liens complets (`L`), 3D (`T`).

## Choix

- **Numérotation « article »** (`typo.ts`, `numeroter()` dans `mise-en-page.ts`) : un seul compteur
  dans l'ordre de lecture (colonne, puis hauteur), comme lemmes et théorèmes partagent la numérotation
  dans un article : *Hypothèse 1, Définition 2, Lemme 3, Proposition 4, Théorème 5*, et *(6)* pour une
  assertion, citée comme une équation. Les choix de modélisation deviennent des hypothèses de travail
  numérotées à part : *(M1), (M2)…*
- **Renvois** : les prémisses lointaines (qui, dans R1, portaient un onglet « (k) » propre) sont citées
  par leur référence courte, *Lem. 3*, *Thm 5*, *(6)*, sous l'énoncé qui les utilise.
- **Contexte** : les pastilles colorées deviennent des étiquettes numérotées par nature, dans l'ordre
  de première citation : H1 (hypothèse), D2 (définition), L3 (lemme admis), Ax1 (axiome), [4]
  (littérature, comme une citation bibliographique), a5 (auxiliaire). Survol : les énoncés qui les
  citent restent nets, le reste s'estompe. La rangée est mesurée en texte, « +n » au bout.
- **Typographie** : STIX Two Text (Google Fonts) pour tout ce qui est dans la figure ; en-têtes en
  petites capitales ; corps en italique pour ce qu'on démontre ou suppose (lemme, proposition,
  théorème, conjecture, hypothèse), en romain sinon, comme avec amsthm. La mise en page est refaite une
  fois la police chargée (les largeurs de texte changent).
- **Couleur quasi absente** : encre sur papier blanc. Statut en symboles (✓ établi, ? incertain,
  ✗ réfuté ; seul le réfuté est en rouge sombre), validation en exposant après le numéro
  († humain, * IA, ‡ IA et humain). Lignée : ascendance en encre, descendance en bleu d'imprimerie.
- **Confiance écrite en chiffres** au pied de chaque énoncé : `0,82 [0,74 ; 0,89]`, suivie d'une barre
  d'erreur miniature sur [0 ; 1] (bornes marquées, intervalle, repère de l'estimation).
- **Filets fins à angles vifs** au lieu de cartes arrondies : cadre de 0,7 px ; résultat principal en
  cadre double (énoncé encadré) ; sous-argument replié en feuillets décalés ; piste abandonnée en
  pointillés sur fond gris très clair ; décision en losange au trait, avec « Décision k » au-dessus et
  l'alternative écartée **barrée** en gris dessous ; hypothèse de travail entre deux filets (haut et
  bas), sans drapeau ni couleur.
- **Portée d'une hypothèse de travail** : au lieu des bandes de couleur, chaque énoncé qui en dépend
  (graphe complet) porte « M1 M3 » dans son en-tête (réglage « marques M » : toujours, ou seulement au
  survol / épinglage). Survoler (M k) estompe le reste ; clic pour épingler.
- **Colonnes** : les zones nommées (« Outils », « Étapes intermédiaires ») deviennent des en-têtes
  sobres en italique minuscule (*hypothèses de travail, prémisses, dérivation, résultats*) entre des
  filets de tableau (haut épais, milieu fin, bas épais, comme booktabs), sans bandes alternées ni
  flèches. Désactivables (« en-têtes de colonnes ») : il reste les filets haut et bas.
- **Légende de figure** sous le filet du bas, calculée d'après ce qui est affiché : « Fig. 1 — … »
  (nombre d'énoncés, décisions, sous-arguments repliés, hypothèses de travail, taille du graphe de
  justification, conventions). Elle sert de légende de lecture ; le panneau ☰ la reprend sous forme
  de liste.
- **Arêtes** : filets de 0,9 px, coins presque vifs (rayon 2), pointes fines et effilées.
- **Fiche de survol** : référence (« Lemme 3† — confiance 0,82 [0,74 ; 0,89] ») en tête, titre et
  énoncé en STIX, coins vifs, ombre à peine visible.

## Limites

- Les numéros dépendent de ce qui est affiché : changer de niveau de détail, déplier un sous-argument
  ou changer de stratégie renumérote la figure (comme recompiler un article). Un identifiant stable par
  nœud (en base) serait nécessaire pour citer « Lemme 3 » ailleurs que dans la figure.
- Les étiquettes de contexte (H1, D2…) sont numérotées d'après les énoncés visibles ; un élément de
  contexte non cité n'a pas de numéro.
- La légende est longue au niveau « + auxiliaires » et « Tout » : elle grandit avec la largeur de la
  figure mais peut sortir du cadrage initial (elle reste visible en dézoomant).
- En-tête d'énoncé chargé (numéro long, mention « n pas », plusieurs marques M) : les marques se
  replient en « M×k », puis la mention disparaît si la place manque.
- Avant le chargement de STIX Two Text, la figure s'affiche en police de repli (Times), puis se
  recalcule une fois ; hors ligne, elle reste en Times (lisible, largeurs cohérentes).
- Non vérifié visuellement dans ce passage (pas de navigateur) : types vérifiés par `tsc`, modules
  servis par Vite sans erreur de transformation.

## Idées

- Exporter la figure en SVG / PDF vectoriel (le rendu est déjà « imprimable »).
- Mode « article » : la liste des énoncés numérotés sous la figure, comme le corps du texte.
- Numéros stables stockés en base (annotés par l'agent rédacteur) pour citer la figure depuis le rapport.
