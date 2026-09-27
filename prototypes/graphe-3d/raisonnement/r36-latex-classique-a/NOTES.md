# R36 · LaTeX classique (essai A)

Le schéma R14 (blocs à ports, liaisons orthogonales, statut par le trait, rangs logiques) tel qu'il serait
composé dans un article de physique ordinaire : une figure TikZ en Computer Modern, noir sur blanc, avec
sa légende. Aucune originalité recherchée : à chaque question, la réponse la plus attendue d'un lecteur
de *Physical Review* ou des *Proc. R. Soc.* Jeu par défaut : fontaine de chaîne (`?jeu=edp` pour le jeu
synthétique).

## Choix

- **Police** : Computer Modern partout, via les fontes de KaTeX (`KaTeX_Main`, `KaTeX_Math`) chargées
  depuis cdn.jsdelivr.net avec `katex.min.css` ; repli Latin Modern / CMU s'ils sont installés. Même
  corps pour le texte et les formules (`.katex { font-size: 1em }`), puisque les deux sont en CM.
- **Blocs = énoncés numérotés façon amsthm** : « **Lemme 7** (Invariant le long de la chaîne). », puis la
  formule en mode display, puis un pied `c = 0{,}91^{+0{,}04}_{-0{,}05}` à gauche et la validation (H, IA, IA+H) à
  droite. Un seul compteur pour tous les énoncés (comme `\newtheorem{lemme}[theoreme]{Lemme}`), D1… pour
  les décisions, H1… pour les hypothèses de modélisation, attribués de gauche à droite puis de haut en bas.
  Les repères B7 et les en-têtes en chasse fixe de R14 disparaissent : c'est le numéro qui sert de repère.
- **Vraies formules** : chaque bloc affiche les relations de son énoncé (`v² = g h₂ / (1 − α − β)` devient
  une fraction) composées par KaTeX ; titres, hypothèses, alternatives, légende et fiche passent par la même
  règle en mode « en ligne ». Règle ci-dessous.
- **Confiance** : notation d'incertitude asymétrique de physique, `c = 0,82` avec l'écart à la borne haute
  en exposant et à la borne basse en indice. Pas de jauge : un article écrit le nombre. La fiche ajoute
  l'intervalle `[0,72 ; 0,90]`.
- **Statut par le trait (inchangé depuis R14)** : trait plein = validé, tireté (`dashed`) = à vérifier,
  barré d'une diagonale = réfuté, pointillé gris = piste abandonnée (texte en gris, « — piste abandonnée »
  dans l'en-tête). Résultat : **double cadre** (style `double` de TikZ) au lieu du bandeau noir.
  Sous-système replié : copie décalée derrière le bloc (`copy shadow`) et « — n énoncés » dans l'en-tête.
- **Traits** : 0,8 px (≈ 0,4 pt à l'échelle 1, l'épaisseur par défaut de TikZ), angles vifs, pointe « to »
  de TikZ (deux barbes incurvées tracées au trait, pas de triangle plein). Jonctions en point plein, comme
  dans un schéma de circuit (`circuitikz`). Ports d'entrée répartis sur le flanc gauche comme R14, mais
  sans marque de port : en LaTeX, la flèche touche le cadre.
- **Rangs** : la règle graduée de R14 devient un **axe** au-dessus de la figure, gradué 0, 1, 2…,
  pointe LaTeX à droite et libellé « rang logique *r* ». Les zones deviennent des **accolades**
  (`decorations.pathreplacing`, brace) avec leur nom en italique : *Modélisation*, *Prémisses*,
  *Déduction*, *Résultats*. Plus de trame, de cadre double ni de repères de grille A B C : une figure
  d'article n'en a pas.
- **Légende de figure** (remplace le cartouche) : sous la figure, justifiée, « FIGURE 1 – *titre.* »
  (petites capitales, tiret demi-cadratin : la convention de babel-french), puis le résumé du jeu (avec
  ses formules), les effectifs (énoncés, décisions, hypothèses / nœuds, liaisons / arêtes) et la clé de
  lecture complète (traits, cadres, losange, ×, coins arrondis, *c*, validations, lettres encadrées,
  « cf. *n* »). Elle suit le zoom comme le reste de la figure ; réglage « légende de figure ».
- **Décisions** : losange (`diamond`) à trait fin portant « D1 », intitulé centré au-dessus ;
  l'alternative non retenue garde la sortie non connectée de R14 (court trait tireté, ×) avec
  « *non retenu :* … » en gris. **Hypothèses de modélisation** : cadre à coins arrondis (`rounded
  corners`), « **Hypothèse H1** (Chaîne parfaitement souple). » puis l'hypothèse en italique, comme le
  corps d'un énoncé en style `plain`, et « portée : 14 éléments ». Au survol ou à l'épingle, les blocs
  dépendants portent « *sous H1, H3* » en bleu au-dessus de leur coin (le « ⊢ H1 » de R14).
- **Renvois** : le connecteur pentagonal de R14 devient « cf. 7 » (une référence croisée, `\ref`) ; au
  survol, il se souligne en bleu et le numéro du bloc cité aussi. Bornes de contexte : lettres encadrées
  (`\fbox`) H, D, O, A, L, +.
- **Couleur** : noir, gris (`black!60`), un seul bleu sombre (#1c4fa0) réservé à l'interaction : survol,
  sélection, aval de la lignée, hypothèses actives ; l'amont de la lignée est en noir renforcé.
- **Interface** : fiche, panneau et sélecteur de jeu en CM, angles vifs, filets fins, sans ombre. La fiche
  donne l'énoncé complet avec ses mathématiques en ligne, puis les formules en display. Le panneau ☰ a un
  tableau façon **booktabs** (filets haut / bas épais, filet médian fin, aucun filet vertical).

## Architecture

- `formules.ts` : découpage prose / mathématiques, conversion Unicode → LaTeX, rendu KaTeX (ou texte en
  italique si KaTeX n'est pas encore chargé).
- `composition.ts` : couche HTML posée dans la scène (au-dessus des calques canvas, sous l'interface,
  `pointer-events: none`) ; un élément par bloc, placé à chaque image par `translate + scale`. Le texte est
  **mesuré avant la mise en page** : `mettreEnPage` reçoit les hauteurs (bloc entier, ou libellé d'une
  décision), un bloc a donc exactement la hauteur de son texte composé. Numéros provisoires « 00 »,
  mise en page, numéros définitifs, et une seconde mise en page seulement si une hauteur a changé.
  Quand KaTeX et les fontes arrivent du CDN, tout est recomposé.
- `rendu.ts` : cadres, liaisons, axe, accolades, placement des éléments HTML et de la légende ; les
  cibles de survol restent calculées sur le canevas, comme dans R14.
- `mise-en-page.ts`, `squelette.ts` : ceux de R14, avec les hauteurs mesurées, la numérotation continue
  et les zones renommées ; stratégies `r36-squelette`, `r36-auxiliaires`, `r36-tout`.

## Règle d'extraction des formules (générique)

Les énoncés mêlent prose française et mathématiques Unicode sans balise. La règle ne connaît aucun
identifiant ni énoncé ; elle est décrite en tête de `formules.ts` :

1. **Mots** coupés aux espaces : *fort* s'il contient un caractère mathématique (grec, indice / exposant
   Unicode, opérateur ou relation, lettre mathématique 𝐠 𝔼 ℝ, `_`, `^`, `|`…) ; *faible* s'il est un
   nombre, une lettre latine seule (sauf « a », « à » et le « y » de « il y a »), une ou deux lettres
   appliquées à un argument (« W(t, », « dF(X) »), un nom d'opérateur (sup, div) ou un mot de deux lettres
   avec une capitale (dX, BV) ; prose sinon.
2. **Suites** de mots forts ou faibles = un morceau mathématique, gardé s'il contient un mot fort (ou s'il
   est une variable seule). Une ponctuation finale le termine, sauf à l'intérieur d'une parenthèse. Après
   un opérateur, jusqu'à six mots de prose sont absorbés en `\text{…}` (« T − λ g y = constante »,
   « + flux entrant … − flux sortant »). Les parenthèses non appariées aux bords et un opérateur final
   retournent à la prose ; une parenthèse ouverte non refermée coupe le morceau.
3. **Formules affichées** : les morceaux qui ont une relation (= ≈ < > ≤ ≥ ≠ ∝ ≡ →) précédée d'un membre
   gauche, trois au plus ; à défaut l'expression la plus longue (≥ 3 mots, un opérateur). Deux formules
   séparées par un seul mot de liaison le gardent (« soit », « en ») ; une ligne si l'ensemble fait au
   plus 24 signes, sinon `gathered`. Une formule trop large est réduite jusqu'à 60 %.
4. **Conversion** : grec → `\alpha` (Σ → `\sum`), indices / exposants → `_{…}` / `^{…}`, lettres
   grasses / ajourées / calligraphiées, accents combinants, `−` → `-`, `·` → `\cdot`, virgule décimale →
   `{,}`, unité SI après un nombre → `\,\mathrm{m\cdot s^{-2}}` (si composée ou après un nombre de plus
   d'un chiffre : « 2 g h » reste un produit), `sup` → `\sup`, `div` → `\operatorname{div}`, sigles →
   `\mathrm{BV}`. En display seulement, `a / b` → `\frac{a}{b}` (numérateur jusqu'à la relation ou au
   signe précédent, dénominateur = groupe parenthésé suivant) ; en ligne la barre reste, comme dans le
   texte courant d'un article.

Contrôle hors navigateur (Node + `katex.min.js` du CDN, dans le scratchpad) : les 147 formules du jeu
fontaine (affichées, en ligne, confiance) se compilent sans erreur KaTeX en mode strict, et les ≈ 280
formules issues des titres, énoncés et hypothèses du jeu EDP sans erreur non plus.

Exemples (fontaine) : `\frac{h_1}{h_2} = \frac{\alpha}{1-\alpha-\beta}` (loi de la fontaine),
`v^2 = \frac{g h_2}{1-\alpha-\beta}`, `T_0 = (1-\alpha)\lambda v^2 \\ \text{soit}\;T'_0 = -\alpha\lambda v^2`,
`T - \lambda g y = \text{constante}`, `\frac{d\mathbf p}{dt} = \sum \mathbf F_{\mathrm{ext}} + \text{flux entrant…}`.

## Limites

- **Non vérifié visuellement** (pas de navigateur sur cette machine) : seuls `tsc`, la transformation
  Vite (HTTP 200) et la compilation KaTeX des formules en Node ont été contrôlés. À regarder en priorité :
  alignement de la couche HTML sur les cadres (même point d'ancrage, `transform-origin: 0 0`), netteté du
  texte pendant le zoom, largeur des formules en gathered (réduites), superposition de l'axe avec la barre
  du haut, position de la légende.
- La couche HTML est au-dessus de tous les calques canvas : si deux blocs se recouvrent (3D, transition),
  le texte de l'un peut passer sur le cadre de l'autre. En 3D, les blocs restent projetés à plat.
- Au premier affichage, la composition utilise les fontes de repli, puis tout est recomposé à l'arrivée de
  KaTeX et des fontes (un léger saut). Sans réseau, les formules restent en Unicode italique.
- Extraction : ce qui n'est pas écrit comme une relation n'est pas affiché en display (`T′ − λ g y`
  s'affiche seul, sa relation « est constant » étant en prose) ; un produit écrit « ab » en minuscules est
  lu comme de la prose ; la parenthèse « (β = 0 pour un arrêt parfaitement inélastique) » perd sa fin.
  Des énoncés écrits directement en LaTeX (`$…$`) par les agents rendraient tout cela exact.
- Mêmes limites de dérivation et de mise en page que R14 (choix issus d'une décision rangés en marge,
  renvois qui cachent des flèches).
