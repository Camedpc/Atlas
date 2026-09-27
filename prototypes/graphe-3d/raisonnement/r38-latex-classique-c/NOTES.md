# R38 · LaTeX classique (essai C)

Le schéma R14 (blocs à ports, liaisons orthogonales, statut par le trait, règle des rangs, cartouche),
tel qu'il serait composé dans un article de physique ordinaire : figure TikZ noir sur blanc, texte en
Computer Modern, énoncés en environnements de théorème, formules en mode mathématique, légende sous la
figure. Aucune originalité recherchée : la traduction la plus attendue de chaque élément de R14.
Jeu par défaut : fontaine de chaîne (`?jeu=edp` pour le jeu synthétique). Thème clair uniquement.

## Traduction élément par élément

| R14 (plan d'ingénieur) | R38 (figure d'article) |
|---|---|
| Sans-serif, chasse fixe pour les repères | Computer Modern Unicode partout (CMU Serif, jsDelivr) ; formules KaTeX (KaTeX_Main = Computer Modern) |
| En-tête `B7 · LEMME · IA+H`, titre | Environnement amsthm : **Lemme 7** (Nom). — compteur commun à tous les énoncés (`\newtheorem{lemme}[theoreme]{Lemme}`), donc Lemme 3, Proposition 4, Théorème 5… |
| Énoncé visible au survol seulement | La formule de l'énoncé est dans le bloc, centrée, numérotée à droite (1), (2)… (compteur d'équations séparé, comme `equation`) |
| Jauge de confiance graduée | Écrite : $\hat c = 0{,}82\;[0{,}76\,;\,0{,}90]$ au pied, validation H / IA / IA+H à droite |
| Statut par code de trait | Identique, en motifs TikZ : plein = validé, `dashed` = à vérifier, barré (`cross out`) = réfuté, `dotted` gris = piste abandonnée |
| Résultat : bandeau noir | `double` : cadre doublé (plus sobre qu'un aplat, lisible en noir et blanc) |
| Sous-système : contour décalé | `copy shadow` de TikZ (ombre recopiée en bas à droite) ; « sous-argument » plutôt que « sous-système » |
| Pointe fine pleine | Pointe `to` de TikZ (celle de `->`) : deux barbes incurvées |
| Jonctions en point plein | Conservées (convention circuitikz) |
| Connecteurs pentagonaux `B3` | Citations sous le bloc : « (4) » si l'énoncé cité a une équation, sinon « lem. 3 » (`\eqref` / `\cref`) |
| Bornes de contexte (cases à lettre) | Lettre encadrée à la `\fbox` (H, D, O, A, L, +) |
| Spécifications « Hyp. : … » à coin replié | Hypothèses de travail (H1), (H2)… en boîtes grisées (`fill=black!5`), nom puis hypothèse en italique avec ses formules, « portée : n énoncés » |
| `⊢ H1 H3` en bleu | `⊢ (H1), (H3)` en bleu au-dessus du cadre |
| Décision : losange `D2`, `× NC : …` | Losange (`diamond`) avec `D2` ; libellé en italique au-dessus ; sortie tiretée terminée par ×, « *non retenu :* … » dessous |
| Règle graduée `SPEC. R0 R1…`, cotes `├ OUTILS ┤` | Axe à la pgfplots au-dessus de la figure : graduations, étiquettes 0 1 2…, titre *rang logique* ; zones nommées par des accolades (`decorations.pathreplacing`) en italique |
| Trame, cadre double, repères A B C | Supprimés : une figure d'article n'a ni trame ni cadre |
| Cartouche (titre, révision, échelle, date) | Légende **Figure 1 –** *titre*. sous le schéma, justifiée : niveau, effectifs, conventions de trait, source |
| Nomenclature du panneau | Tableau à la booktabs (filets haut et bas, pas de filets verticaux) |
| Liens sémantiques `CONTREDIT` encadré | Étiquette en italique minuscule sur fond blanc (`node[midway, fill=white]`) |

Couleur : noir (#111) sur blanc, gris pour le secondaire, un seul bleu (`blue!60!black` adouci, #1f4aa8)
pour le survol, la sélection, l'aval de la lignée et les hypothèses actives. L'amont reste en encre
renforcée, comme dans R14. Aucun halo, aucune animation décorative.

## Formules : règle générique d'extraction (`latex.ts`)

Les énoncés sont du texte Unicode (`v² = g h₂ / (1 − α − β)`). Aucune formule n'est écrite à la main,
aucun identifiant de jeu n'est lu :

1. **Mots** : découpage aux espaces ; ponctuation de fin et guillemets détachés.
2. **Classe** : *fort* si le mot contient une lettre grecque, un indice ou un exposant Unicode, une lettre
   mathématique grasse (𝐩, 𝟎), un opérateur (= ≈ < > ≤ ≥ ∝ ± × · − ∂ ∇ Σ ′…), un indice ASCII (`C_x`),
   ou s'il est une lettre latine isolée (sauf « a », « à », « y » devant « a ») ; *neutre* s'il est un
   nombre, un opérateur seul ou une unité SI (m·s⁻², ou « m » juste après un nombre) ; sinon *texte*.
3. **Passages** : suite maximale de mots forts / neutres avec au moins un fort. Une ponctuation de fin de
   mot le clôt ; une parenthèse ouverte dans le passage et fermée hors de lui le coupe ; un passage entier
   entre parenthèses rend ses parenthèses au texte ; les opérateurs de bord reviennent au texte.
4. **Formule affichée** : parmi les passages qui contiennent une relation (= ≈ ≠ < > ≤ ≥ ∝ ∈) et ne sont
   pas *coupés* (un passage qui se terminait par un opérateur suivi de prose — « d𝐩/dt = Σ𝐅 + flux
   entrant… » — n'est pas une formule complète), le premier après le premier deux-points, sinon le
   premier. Deux passages séparés par un seul mot de liaison (en, pour, si, avec, dans, quand, lorsque)
   sont réunis : `T' \approx 0 \quad\text{en}\quad y = h_1`.
5. **Conversion** : grec → `\alpha`, indices / exposants → `_{}` `^{}`, gras → `\mathbf`, ′ → `'`,
   − → `-`, virgule décimale → `{,}`, unités → `\mathrm`, indice textuel → `_{\mathrm{air}}`. En formule
   affichée seulement, un membre `A / (B)` sans + ni − au premier niveau devient `\frac{A}{B}` ; en ligne la
   barre oblique reste (usage typographique). La ponctuation qui suit une formule affichée entre dedans.

Sur la fontaine (39 énoncés), la règle trouve une formule affichée pour 21 énoncés, dont toutes les
équations du récit : `\partial_s(T\mathbf t) - \lambda v^2\kappa\mathbf n + \lambda\mathbf g = \mathbf 0`,
`T_0 = (1-\alpha)\lambda v^2`, `v^2 = \frac{g h_2}{1-\alpha-\beta}`, `\alpha v^2 = g h_1`,
`\frac{h_1}{h_2} = \frac{\alpha}{1-\alpha-\beta}`, `\alpha \approx 0{,}11 \pm 0{,}03`. Tout le reste (noms,
hypothèses, alternatives, fiche) passe en math en ligne par la même règle (`htmlTexte`, `mathifier`).

## Rendu technique

- **Texte en HTML, cadres en canevas** (`texte.ts`) : KaTeX ne dessine pas sur un canevas. Le contenu de
  chaque bloc est composé en HTML dans une couche posée au-dessus du canevas (sous l'interface), déplacée
  par `transform` à chaque image avec la caméra ; les cadres, liaisons, axe et accolades restent sur le
  canevas « dessous » / « dessus ». La couche ne capte pas la souris (le survol passe par `cibleSous`).
- **Hauteurs mesurées** : la mise en page de R14 mesurait le titre au canevas ; ici `mettreEnPage` reçoit
  `mesurer`, qui compose le HTML du bloc hors écran à la largeur du bloc et lit sa hauteur (cache). Une
  formule plus large que le bloc est réduite (au plus à 62 %, comme un `\resizebox` borné). À l'arrivée de
  KaTeX et des polices (`document.fonts`), tout est remesuré et recomposé.
- **KaTeX** est importé dynamiquement depuis jsDelivr (`katex@0.16.11/dist/katex.mjs`, `@vite-ignore`),
  sa feuille de style est liée dans `index.html` ; aucun paquet npm. Avant son arrivée (ou s'il est
  inaccessible), les passages s'affichent en italique Unicode.
- **Polices** : CMU Serif et CMU Typewriter du paquet npm `computer-modern` sur jsDelivr, redéclarées dans
  `style.css` (le CSS du paquet utilise `font-style: roman`, invalide).
- **Fiche de survol** : titre « **Lemme 3** (Nom). », énoncé complet en italique (corps de théorème) avec la
  formule affichée et son `\tag` ; le reste de la fiche par défaut passe par `mathifier`.
- Dérivation, disposition (rangs, barycentres, PAV, ports, pistes, jonctions), survol, lignée, épingles des
  hypothèses, dépliage au double-clic, niveaux squelette / + auxiliaires / tout : repris de R14 sans
  changement de logique (stratégies renommées `r38-*`).

## Limites

- **Non vérifié visuellement** (pas de navigateur sur cette machine) : seuls `tsc` et le service Vite ont
  été contrôlés. À regarder en priorité : netteté du texte HTML mis à l'échelle par `transform`,
  alignement exact texte / cadre (mesure hors écran contre rendu), largeur des formules longues
  (l'équation du mouvement est réduite), recouvrement de l'axe par la barre du haut.
- La couche HTML n'a pas d'ordre de profondeur par bloc : deux blocs qui se chevauchent montrent leurs deux
  textes (rare en 2D). En 3D, le texte reste plat (projeté comme les cadres).
- Heuristiques d'extraction : « 11,4 ± 0,6 m·s⁻² » reste du texte (aucun mot fort) ; « constante » n'est
  pas reconnu comme `\text{cste}`, donc « T − λ g y = constante » n'est pas affichée ; un énoncé dont la
  première relation est accessoire (« (α ≈ 0,1) » dans l'explication finale) affiche celle-ci.
- Mêmes limites de dérivation que R14 (choix de modélisation issu d'une décision rattaché par la marge).

## Idées

- Numéroter les liaisons comme des renvois d'équation et lister « (4) ⇒ (7) » dans le panneau.
- Exporter la figure en vrai TikZ (les coordonnées de la mise en page suffisent) pour un article.
- Titre courant de la figure repris du résumé du jeu, et renvois cliquables « (4) » dans la légende.
