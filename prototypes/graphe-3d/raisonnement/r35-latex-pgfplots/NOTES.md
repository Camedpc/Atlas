# R35 · LaTeX · pgfplots

Le schéma technique de R14 (blocs à ports, liaisons orthogonales, statut par le trait, règle des rangs,
cartouche) tel qu'il serait composé en LaTeX, enrichi des graphiques qu'un physicien ajouterait avec
`pgfplots` à côté des blocs de prédiction et de mesure. Jeu par défaut : fontaine de chaîne (`?jeu=edp` pour le
jeu synthétique). URL : `/raisonnement/r35-latex-pgfplots/`.

## Ce qui change par rapport à R14

- **Composition LaTeX** (`composition.ts`) : Latin Modern Roman et Mono (cdn.jsdelivr.net) partout ; repères
  en gras (`\textbf{B7}`), types en petites capitales (`\textsc`), validation en italique, spécifications
  « Hyp. : … » en `\texttt`, rangs de la règle en mathématiques ($R_0$, $R_1$…), cotes de zones en petites
  capitales. Pointes de flèche « latex » de TikZ. Résultats : double filet sous l'en-tête au lieu du bandeau
  plein. Cartouche en tableau booktabs (filets haut et bas, pas de filets verticaux). Trame masquée par défaut.
- **Formules dans les blocs** : première équation de l'énoncé, extraite par la règle générique de R18
  (copiée dans `formules.ts`, documentée en tête), convertie en LaTeX (`\frac` pour « a / (b) », indices,
  exposants, gras mathématique, unités en `\mathrm` après un nombre, virgule décimale `{,}`) et composée par
  KaTeX sur un calque HTML qui suit la caméra (`CalqueFormules` : un élément par bloc, `transform` à chaque
  image, réduit pour tenir dans la largeur, masqué sous 3 px). Sans KaTeX : repli unicode sur le canvas.
  La fiche de survol montre aussi les formules en mode display.
- **Confiance en barre d'erreur** au pied de chaque bloc (façon `errorbars`) : axe [0, 1] gradué 0, ½, 1,
  point plein = estimation, moustaches à taquets = intervalle, valeur « 0,82 ».
- **Figures pgfplots** (`graphiques.ts`), accrochées sous le bloc qui énonce la loi (la mise en page leur
  réserve la hauteur). Style pgfplots par défaut : axe encadré, graduations vers l'intérieur sur les quatre
  côtés, pas de grille, virgule décimale, légende en haut à gauche ; prédiction en `blue!60!black` (#000099,
  seule couleur, aussi utilisée pour le survol et la lignée), bande ±1σ en pointillé bleu, mesures en points
  noirs avec barres d'erreur, pente déclarée en tirets gris ; légende « Figure n – … » avec renvois aux blocs
  (B12…) et mention « illustratives » quand la série ou l'énoncé le dit.
- **Règle de construction des figures** (générique, en tête de `graphiques.ts`) : une loi « Y / X = f » ou
  « Y = f(X) » extraite d'un énoncé devient une figure si une série du champ optionnel `mesures`
  (`mesures.ts`, ou `noeud.mesures`) ou une pente déclarée (« h₁ / h₂ = 0,13 ± 0,03 », « pente de v² contre
  h₂ : 11,4 ± 0,6 ») porte sur le même couple. Les autres symboles prennent une valeur « symbole = nombre ± σ »
  lue dans les énoncés **indépendants des mesures tracées** (on écarte les descendants des nœuds de mesure :
  sinon α viendrait de « Estimation de α », ajustée sur ces mêmes points). Bande : coins du pavé des σ.
- **Panneau** : liste des figures (loi, paramètres), table des valeurs lues dans les énoncés, légende mise à
  jour. Réglages : « formules (KaTeX) », « figures pgfplots ». Blocs plus larges (180 px) pour les formules.

Sur la fontaine, sans aucun identifiant codé en dur dans la règle : **Figure 1** v² contre h₂ sous « Vitesse
de la chaîne » (ou sous « Loi de la fontaine » quand la vitesse est repliée dans son sous-système), prédiction
g h₂ / (1 − α − β) avec g = 9,81, α = 0,10 ± 0,04 (simulation de maillons), β = 0,1 ; **Figure 2** h₁ contre
h₂, pente α / (1 − α − β) ≈ 0,125 contre 0,13 ± 0,03 mesuré. La prédiction de v² (pente ≈ 12,3) est un peu
au-dessus des mesures (11,4 ± 0,6) : la figure le montre, c'est ce qu'on attend d'elle.

## Limites

- **Non vérifié visuellement** (pas de navigateur sur cette machine) : seuls `tsc` et la transformation Vite
  ont été contrôlés, et la construction des figures a été testée hors navigateur (Node) sur le jeu fontaine.
  À regarder d'abord : lisibilité des figures à l'échelle de cadrage (polices de 6,4 à 7,4 px de mise en
  page), taille des formules KaTeX dans la rangée de 22 px, recouvrement des légendes de figure (5 lignes max.).
- Les points de mesure du jeu fontaine sont **illustratifs** (tirés pour être cohérents avec les énoncés),
  comme le reste des mesures du jeu. En production, l'expérimentateur devrait écrire la série (`mesures`).
- La formule du bloc est la première extraite : pour « Réduction à un problème statique », c'est la
  définition T′ = T − λv² plutôt que l'équation réduite. Une annotation `$…$` dans l'énoncé suffirait.
- Le calque KaTeX est au-dessus du canvas : en 3D, ou quand deux blocs se recouvrent, une formule peut passer
  devant un bloc voisin. Au survol, l'ordre des blocs change mais pas celui des formules.
- La version web de Latin Modern n'a que deux graisses (400, 700) ; si un glyphe manque (grec, indices
  unicode), le navigateur le prend dans la police de repli (KaTeX garde ses propres polices).
- Mêmes limites de dérivation et de mise en page que R14.

## Idées

- Figures repliables (clic sur la légende) et export du code `pgfplots` de chaque figure (\addplot table…).
- Résidus sous la figure (mesure − prédiction), comme un second axe `groupplot`.
- Numéroter les équations des blocs (1), (2)… et citer « éq. (3) » dans les légendes et les renvois.
