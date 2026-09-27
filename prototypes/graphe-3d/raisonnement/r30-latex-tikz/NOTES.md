# R30 · LaTeX · figure TikZ

Le schéma technique de R14 (blocs à ports, liaisons orthogonales, statut par le trait, rangs logiques)
tel qu'il serait composé dans un article : figure TikZ, Computer Modern, formules en mode mathématique,
légende « Figure 1 : … » en dessous. Jeu par défaut : fontaine de chaîne (`?jeu=edp` pour le jeu
synthétique). Dérivation (`squelette.ts`) et placement (`mise-en-page.ts`) sont ceux de R14 ; seules
changent la composition du texte et la manière de tracer.

## Choix

- **Deux calques** : le canvas trace ce que TikZ tracerait (contours, flèches, accolades, losanges) ;
  tout ce qui est typographié (têtes de nœuds, formules, légende) est du HTML + KaTeX posé au-dessus
  (`composition.ts`, `CalqueTeX`), un élément par pièce, déplacé à chaque image par
  `translate + scale` pour suivre la caméra. `pointer-events: none` : le survol reste celui du canvas.
- **Taille des nœuds = texte composé** : la mise en page mesure chaque pièce dans un conteneur caché
  (police et formules réelles) au lieu de couper des lignes sur un canvas. Une formule trop large est
  réduite (jusqu'à 55 %) plutôt que coupée. Cache vidé et figure recomposée quand une police finit de
  charger (`document.fonts`), recadrage seulement à la première composition.
- **Polices** : `computer-modern@0.1.3` (CMU Serif) et `katex@0.16.11`, CSS et JS depuis
  cdn.jsdelivr.net dans `index.html` (script classique : `window.katex` existe avant le module). Aucun
  paquet npm. Le canvas écrit en `'CMU Serif', KaTeX_Main, serif`.
- **Nœuds d'énoncé façon amsthm** : « **Lemme 7** (Invariant le long de la chaîne) », compteur partagé
  (B de R14 → numéro d'environnement), puis les formules de l'énoncé centrées (`\displaystyle`, 2 au
  plus, réglable), puis un pied : validation en petites capitales (h, ia, ia+h) et
  « *c* = 0,82 [0,74 ; 0,90] » à la place de la jauge graduée. Réglage « contenu des nœuds » : titre +
  formules (défaut ; énoncé en italique s'il est court et sans formule), titre + énoncé, titre seul.
- **Tracé TikZ** : `draw, rounded corners=1pt`, trait fin (0,8 px de mise en page, ≥ 0,7 px écran) ;
  résultats en `double` ; sous-arguments repliés en `copy shadow` ; statut par le motif (plein, `dashed`,
  barré, `dotted` gris pour une piste abandonnée) ; liaisons orthogonales à coins arrondis, pointe
  `Stealth` (le trait s'arrête dans le creux) ; jonctions en point plein ; décisions en `diamond`
  portant « D1 », alternative rejetée par un × et « non retenu : … » ; hypothèses de modélisation en
  note à coin replié « **(H1)** Nom → 14 » avec l'hypothèse en italique ; contexte en petits cercles
  lettrés ; renvois en forme `signal` portant le numéro du nœud cité (comme un `\ref`).
- **Cadre** : plus de trame, de cadre double ni de cartouche (un article n'en a pas). Accolades
  nommées des zones (`decorations.pathreplacing`, noms en petites capitales) et axe fin des rangs
  logiques (numéros, « *r* », « rang logique ») ; la légende « Figure 1 » résume le jeu, le niveau, les
  comptes et tient lieu de légende du code de trait (réglage pour la masquer).
- **Couleurs** : noir (`black`), gris (`black!50`, `black!25`) et une seule couleur,
  `blue!60!black` = `#000099`, pour le survol, la sélection, l'aval de la lignée, les hypothèses
  actives (« ⊢ (H1), (H3) ») et le nœud cité par un renvoi survolé.
- **Fiche de survol** : titre et énoncé complets avec leurs formules composées, bandeau
  « Lemme 7 · rang 3 · tireté : à vérifier ».

## Extraction des formules (`formules.ts`)

Règle générique, documentée en tête du fichier ; rien n'est propre au jeu.

1. Un mot est mathématique s'il n'est fait que de caractères mathématiques (latin, chiffres, grec,
   indices et exposants Unicode, alphabets mathématiques 𝐩 𝔼 𝓕, opérateurs, relations, parenthèses,
   prime, `_`), sans accent ni apostrophe, sans suite de plus de 2 lettres latines (sauf après `_` ou
   fonction usuelle), et n'est pas un mot outil français (le, de, et, en, si, soit…).
2. Une suite de mots mathématiques est coupée par une ponctuation finale (sauf dans une parenthèse
   ouverte) et par une parenthèse juxtaposée sans opérateur ; les opérateurs en bout retournent au texte.
3. Suite avec relation (= ≈ ∝ < > ≤ ≥ ≠ → ∼ ∈) et une variable : formule, affichée centrée dans le
   nœud. Avec un opérateur : math en ligne. Sinon, variables isolées (α, h₁, T′, lettre seule sauf
   « a » et « y ») et produits juxtaposés (« λ v² ») en ligne.
4. Conversion : grec, Σ → `\sum`, indices / exposants groupés, gras → `\mathbf`, ajourées → `\mathbb`,
   rondes → `\mathcal`, indice de plusieurs lettres en romain, virgule décimale `{,}`, unité après un
   nombre en romain (`9{,}81\,\mathrm{m\cdot s^{-2}}`), fonctions usuelles (`\sup`), et en bloc seulement
   `A / B` → `\frac{A}{B}` (numérateur : produit juxtaposé ; rien dans un groupe `{…}` déjà en LaTeX).

Contrôle hors navigateur (Node + `katex.min.js`) : les 82 expressions du jeu fontaine (noms, énoncés,
alternatives, hypothèses) et plus de 200 expressions tirées des énoncés à relation du jeu synthétique sont
rendues par KaTeX sans erreur, en ligne et en bloc ; exemples :
`T_{0} = (1 - \alpha) \lambda v^{2}`, `v^{2} = \frac{g h_{2}}{1 - \alpha - \beta}`,
`\frac{h_{1}}{h_{2}} = \frac{\alpha}{1 - \alpha - \beta}`, `\frac{d\mathbf{p}}{dt} = \sum \mathbf{F}_{\mathrm{ext}}`.

## Limites

- **Non vérifié visuellement** (pas de navigateur sur cette machine) : seuls `tsc`, le service Vite et le
  rendu KaTeX des formules (Node) ont été contrôlés. À regarder en priorité : alignement du texte DOM
  sur les contours canvas au zoom et pendant les transitions, netteté du texte mis à l'échelle par
  `transform`, hauteur réelle des nœuds une fois CMU chargée, place des accolades sous la barre du haut.
- Coût : un élément DOM par pièce (≈ 25 à 60), transformé à chaque image ; au-delà de quelques
  centaines de nœuds (niveau « tout » d'un gros graphe), il faudrait un rendu en image (SVG → canvas).
- La règle d'extraction se trompe sur les cas limites : une phrase qui écrit une formule en toutes
  lettres (« T′ − λgy est constant ») n'a pas de relation, donc pas de formule centrée (on montre alors
  l'énoncé s'il est court) ; « soit », « en » coupent une expression (« T′ ≈ 0 en y = h₁ » donne deux
  formules) ; une unité sans « · » (« 50 m ») reste en italique ; au-delà de 2 formules, les suivantes
  ne sont visibles qu'au survol.
- CMU Serif n'a pas de vraies petites capitales : le navigateur les synthétise.
- Les réfutés sont barrés sous le texte (le trait est sur le canvas, le texte au-dessus).
- En 3D, l'axe, les accolades et la légende s'effacent ; le texte reste projeté à plat.
- Thème sombre non travaillé (palette minimale seulement ; le texte composé reste noir).

## Idées

- Numéroter aussi les formules (`\tag`) et faire des renvois « par (3) » au lieu de numéros de nœuds.
- Exporter la figure en vrai code TikZ (`\node[draw, rounded corners=1pt] (b7) at (…) {…};`) depuis la
  même mise en page, pour la coller dans un article.
- Laisser l'agent écrire les formules en LaTeX dans un champ dédié de l'énoncé : l'extraction
  deviendrait un simple repli.
