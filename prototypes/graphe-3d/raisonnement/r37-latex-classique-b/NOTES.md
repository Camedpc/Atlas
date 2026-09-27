# R37 · LaTeX classique (essai B)

Le schéma R14 (blocs, liaisons orthogonales, rangs, statut par le trait) composé comme une figure d'un
article de physique ordinaire : TikZ pour le dessin, Computer Modern pour le texte, `amsmath` pour les
formules, `\caption` sous la figure. On a visé la version la plus attendue, sans effet de style. Jeu par
défaut : fontaine de chaîne (`?jeu=edp` pour le jeu synthétique).

## Traduction de R14

| R14 (schéma d'ingénieur) | R37 B (figure LaTeX) |
|---|---|
| Sans-serif et chasse fixe | Computer Modern (CMU Serif, jsDelivr) ; formules KaTeX (fontes CM) |
| Titre seul dans le bloc, énoncé au survol | Titre + **formule principale composée hors texte** (`\displaystyle`) |
| Repères B7 / D2 / H1 | Énoncés numérotés **comme des équations « (7) »**, décisions D2, hypothèses **(i), (ii)** |
| En-tête 16 px, jauge graduée | Type en petites capitales + numéro à droite ; confiance **écrite** `ĉ = 0,82 [0,72 ; 0,90]`, validation `ia+h` en petites capitales |
| Bandeau noir des résultats | **Double cadre** (TikZ `double`) et titre gras |
| Sous-système : contour décalé | Sous-argument replié : `copy shadow` (cadre doublé en retrait) |
| Barré (diagonale) | `strike out` : même diagonale, trait fin |
| Bornes H D O A L + connecteurs pentagonaux | **Citations** sous le bloc : `cf. (3), (5) [1, 4, 7]` ; renvois par numéro d'équation, contexte numéroté comme une bibliographie dans l'ordre de première citation |
| Spécification « Hyp. : … » en chasse fixe | Hypothèse composée comme un `\newtheorem` : **Hypothèse (ii)** (nom). *Énoncé en italique.* puis « portée : n énoncés » |
| « ⊢ H1 H3 » | « *sous (i), (iii)* » en italique, bleu |
| Losange + « NC : … » | Losange TikZ `diamond` avec D1 ; alternative rejetée : sortie coupée d'une × et libellé gris |
| Feuille de plan (trame, cadre double, repères A B C, règle) | Aucun cadre : en-têtes de colonnes en petites capitales avec **filets `\cmidrule`**, numéros de rang dessous, séparations de zones en tireté gris |
| Cartouche fixe à l'écran | **Légende** « FIGURE 1 – … » sous la figure (dans le monde, suit le zoom) : conventions, niveau, comptes, puis `[1] … ; [2] …` |
| Pointe triangulaire | Pointe `latex` (flancs et dos légèrement creusés), trait ≈ 0,8 px, jonctions en point plein |

Couleurs : noir sur blanc ; gris pour le secondaire ; un seul bleu (celui des liens `hyperref`) pour le
survol, la sélection, l'aval de la lignée et les hypothèses actives. L'amont de la lignée est en noir
renforcé, comme dans R14. Aucun halo, aucune animation décorative.

## Extraction des formules (`formules.ts`)

Règle générique, sans liste propre au jeu :

1. Jetons séparés par les espaces ; ponctuation de tête `( [` et de queue `, ; : . ) ]` détachée (la
   virgule décimale reste dans le nombre).
2. Classes : relation (`= ≈ ∝ < > ≤ ≥ ≠ →`…), opérateur (`+ − × · / ±`), nombre, **jeton mathématique**
   (grec, exposant ou indice Unicode, lettre grasse 𝐩, `∂ ∇ Σ ′ _`, opérateur collé à une lettre),
   lettre latine isolée (variable, sauf « a »), mot.
3. Une course = suite de jetons mathématiques. Elle absorbe les mots après un opérateur
   (`+ flux entrant − flux sortant` → `\text{…}`), au plus trois mots après une relation (`= constante`),
   et une virgule suivie d'une autre relation (`𝐠 = −g𝐞_y, g = 9,81 m·s⁻²`).
4. Course avec relation → formule ; sinon expression en ligne (`$h_1$`, `$\lambda v^2$`) ; un nombre
   seul reste du texte. Parenthèses appariées aux bouts et opérateurs orphelins sont rendus au texte.
5. Traduction : grec → `\alpha`, `²` → `^{2}`, `₀` → `_{0}`, `_ext` → `_{\mathrm{ext}}`, `𝐩` →
   `\mathbf{p}`, `9,81` → `9{,}81`, unité après un nombre → `\mathrm{m\,s^{-2}}`. Hors texte,
   `A / B` → `\frac{A}{B}` (A = facteurs depuis le dernier `+ −` ou relation, B = facteur ou groupe).
6. Formule principale d'un énoncé = la plus longue course à relation. Titres, hypothèses, légende, fiche
   et panneau passent par la même règle (mathématiques en ligne).

Testé hors navigateur (Node) sur les énoncés du jeu fontaine : `v^2 = \frac{g h_2}{1-\alpha-\beta}`,
`\frac{h_1}{h_2} = \frac{\alpha}{1-\alpha-\beta}`, `\partial_s(T\mathbf t) - \lambda v^2\kappa\mathbf n + \lambda\mathbf g = \mathbf 0`,
`T - \lambda g y = \text{constante}`, `\frac{d\mathbf p}{dt} = \Sigma\mathbf F_{\mathrm{ext}} + \text{flux entrant…}`.

## Technique

- **Texte en HTML, géométrie en canvas.** KaTeX ne dessine pas dans un canvas : le texte des blocs est une
  couche DOM (`composition.ts`) posée dans la scène au-dessus des calques, sans événements. Chaque
  élément est construit une fois, **mesuré à l'échelle 1** (`offsetHeight`), et la mise en page reçoit
  ces hauteurs (option `mesurer`) ; à chaque image il suit la projection (`translate + scale`).
  Une formule trop large est réduite (jusqu'à 60 %), comme un `\resizebox`.
- Polices : relayout quand CMU Serif et les fontes KaTeX sont chargées (`document.fonts`).
- **Cadrage** : en 2D, `cadrerTout` cadre les coins de la figure, en-têtes et légende compris.
- Dérivation, mise en page (rangs, entrées réparties, jonctions), survol, lignée, épingles, dépliage au
  double-clic, 3D : repris de R14 sans changement de principe ; stratégies renommées `r37b-*`.
- KaTeX 0.16.11 (script et feuille depuis jsDelivr, global `window.katex`) ; aucun paquet npm.

## Limites

- **Non vérifié visuellement** (pas de navigateur sur cette machine) : seuls `tsc` et la
  transformation Vite ont été contrôlés, et l'extraction des formules en Node. À regarder en priorité :
  netteté du texte DOM mis à l'échelle pendant le zoom, hauteur des blocs avec fractions, recouvrement
  des liens sémantiques avec les numéros de rang, lisibilité de la légende à faible zoom.
- La lettre isolée « y » est lue comme une variable (juste ici : « y est l'altitude »), fausse dans
  « il y a ». Les unités ne sont reconnues qu'après un nombre.
- Petites capitales synthétisées par le navigateur (CMU Serif web n'a pas de fonte `smcp`).
- En 3D, en-têtes et légende s'effacent ; le texte reste à plat, projeté avec le bloc.
- La légende peut devenir longue si le contexte cité est abondant (réglage « légende de la figure »).
