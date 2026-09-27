# R34 · LaTeX · tcolorbox

Le schéma technique de R14 (même dérivation, mêmes colonnes de rangs, mêmes liaisons orthogonales), composé
comme des notes de cours LaTeX : chaque énoncé est une `tcolorbox`, chaque sous-problème une `tcolorbox`
englobante, les formules des énoncés sont composées par KaTeX, le texte en Latin Modern. Jeu par défaut :
**fontaine de chaîne** (`?jeu=edp` pour le jeu synthétique ; le sélecteur reste en haut à gauche).

## Choix

- **Boîte = tcolorbox** (`boites.ts`, HTML sur un calque posé au-dessus des canvas, transformé à chaque image) :
  `enhanced, arc=1mm, colframe=<famille>, colback=<famille>!5`. Bandeau de titre plein, texte blanc :
  « **Lemme 3** — Tension au point de prise », validation (H, IA, IA+H) à droite. Corps : formule(s) en display,
  sinon l'énoncé justifié avec les mathématiques inline. Partie basse (`\tcblower`, filet tireté) : renvois
  (« Lem. 2 », encadrés comme un `\fbox`), bornes de contexte (H, D, O, A, L, +), confiance `c = 0,84 [0,76 ; 0,90]`.
- **Numérotation par environnement** (compteurs façon amsthm, de gauche à droite puis de haut en bas) : Lemme,
  Proposition, Théorème, Observation, Décision… ; les choix de modélisation sont des **Hypothèses (H1)**,
  et les boîtes qui en dépendent portent `⊢ (H1)` au survol / à l'épingle. Remplace les repères B / D / H de R14.
- **Familles xcolor** (`familles.ts`), écrites comme dans un préambule puis converties en hex :
  hypothèses `orange!70!black`, lemmes / propositions / définitions `blue!50!black`, théorèmes et résultats
  `red!50!black`, observations / expériences / calculs `green!40!black`, décisions `violet!60!black`, piste
  abandonnée `black!50` ; fond `!5` (`black!3` pour l'abandon). Le panneau ☰ affiche le nuancier avec ces codes.
- **Statut par le trait du cadre**, comme R14 : continu = validé, tireté = à vérifier, diagonale = réfuté,
  pointillé gris = piste abandonnée (avec la mention *(abandonnée)* dans le titre). Résultats : cadre 2 px.
  Démonstration repliée : une seconde feuille décalée derrière la boîte (double-clic : déplier sur place).
- **Décisions** : des boîtes comme les autres (plus de losange) : question en italique, alternatives en liste
  ✓ retenue / × rejetée (grisée). **Hypothèses** : leur énoncé, et « portée n » dans la partie basse.
- **Sous-problèmes = tcolorbox englobantes** (les boîtes « Comment » de Blueprint) : `enhanced, attach boxed
  title`, cadre `black!55`, fond `black!2`, titre en surimpression sur le filet du haut ; piste abandonnée en
  tireté. Pour qu'elles ne se chevauchent pas, la mise en page (`mise-en-page.ts`, étapes 6 bis et 7 bis)
  regroupe dans chaque colonne les éléments par sous-problème (ordre global = position moyenne des boîtes),
  garde entre deux sous-problèmes d'une colonne l'écart d'un cadre, puis descend chaque sous-problème jusqu'à
  ce que son cadre ne recouvre aucun cadre déjà posé qui partage ses abscisses. La marge des hypothèses a
  son cadre « Hypothèses de modélisation ». Réglage « cadres des sous-problèmes » pour revenir à R14.
- **Hauteurs mesurées** : chaque boîte est composée hors écran à sa largeur (formules réduites si elles
  débordent), sa hauteur nourrit la mise en page ; les numéros encore inconnus sont réservés à « 99 ».
- **En-tête des rangs façon booktabs** (canvas) : `\toprule`, noms de zones en petites capitales avec un
  `\cmidrule` sous chacun, « rang 0, rang 1… » en italique, `\midrule`. Plus de trame, de cadre double ni de
  repères de lignes. **Cartouche** = tableau booktabs avec sa légende au-dessus (« TABLEAU 1 — Fontaine de
  chaîne… ») : éléments, liaisons, niveau, révision, date, échelle, environnements présents (« Lem. 5 · Prop. 3 … »).
- **Liaisons** de R14 inchangées (orthogonales, ports répartis, jonctions en point plein), pointe « latex »
  de TikZ. Pas de couleur d'accent : au survol, les liaisons du bloc prennent la couleur de sa famille ; la
  lignée passe à l'encre, trait renforcé, le reste s'atténue ; sélection = filet décalé (`outline`) autour
  de la boîte, bloc cité par un renvoi survolé = filet tireté.
- **Polices** : Latin Modern (woff2 du paquet `latex.css` sur cdn.jsdelivr.net) pour tout le texte, y compris
  la fiche et le panneau ; KaTeX 0.16.11 (module ES et feuille de style sur cdn.jsdelivr.net). Première mise
  en page quand KaTeX et les polices sont prêts (au plus 2,5 s d'attente), recomposée si une police arrive après.

## Règle d'extraction des formules (`formules.ts`)

Générique, sans rien de propre à un jeu :

1. Jetons séparés par les espaces ; la ponctuation finale `. , ; : ! ?` (ou isolée) clôt une proposition.
2. Jeton **mathématique** : contient un caractère mathématique fort (grec, indice / exposant Unicode,
   alphanumérique mathématique `𝐩 𝔼 𝓕`, opérateur ou relation, chiffre, `_ ^ / |`) sans suite de trois lettres
   latines hors indice ou fonction connue ; ou 1–2 lettres latines qui ne sont pas un mot court français
   (`de, la, en, et, si, a, ni…`). Un groupe entre accolades reste un seul jeton.
3. **Formule** = suite maximale de jetons mathématiques dans une proposition, contenant une relation
   (`= ≈ < > ≤ ≥ ≠ ∝ → ∼ ≡ ∈`) avec un opérande de chaque côté. Pas de relation en tête (un `+` initial est
   retiré). Fin sur une relation ou un opérateur : gardée seulement si le mot suivant clôt la proposition
   (`= constante ;` → `= \text{constante}`), sinon rejetée (formule tronquée). Une parenthèse non appariée au
   milieu coupe la suite en deux ; aux extrémités elle est retirée ; une paire qui englobe tout aussi.
4. Deux formules séparées par un seul mot de liaison (`soit, en, pour, et, donc, avec, si, où, alors, donne`),
   éventuellement après une virgule, fusionnent : `A, \quad\text{soit}\quad B`.
5. Au plus deux formules par énoncé (display). Sans formule, l'énoncé est composé en texte et chaque suite de
   jetons mathématiques passe en inline. KaTeX refuse la formule ou manque : l'énoncé en texte.

Conversion Unicode → LaTeX : grec (`Σ` → `\sum`), indices / exposants → `_{…}` / `^{…}` (deux de suite séparés
par `{}`), `𝐩` → `\mathbf{p}`, `𝔼` → `\mathbb{E}`, `𝓕` → `\mathcal{F}`, virgule décimale → `{,}`, unité après
un nombre → `\,\mathrm{m\cdot s^{-2}}`, mots → `\text{…}`, fonctions → `\sup`, `\exp`… ; une barre `A / B` de
premier niveau devient `\frac{A}{B}` (A : le produit qui précède jusqu'à l'opérateur précédent ; B : l'atome
suivant, parenthèses retirées) : `h₁ / h₂ = α / (1 − α − β)` → `\frac{h_1}{h_2} = \frac{\alpha}{1-\alpha-\beta}`.

Contrôle hors navigateur (Node + KaTeX 0.16.11) : sur les énoncés des deux jeux, toutes les formules display
et inline extraites passent sans erreur (les seuls refus du script de test venaient de fragments de code
qu'il avait pris pour des énoncés) ; fontaine : 24 énoncés sur 39 ont au moins une formule display.

## Limites

- **Non vérifié visuellement** (pas de navigateur sur cette machine) : seuls `tsc`, la transformation Vite et
  le rendu KaTeX des formules en Node ont été contrôlés. À regarder en priorité : hauteur réelle des boîtes
  (mesure avant / après chargement des polices KaTeX), empilement des bandes de sous-problèmes (un
  sous-problème étalé sur beaucoup de rangs repousse les autres vers le bas : mise en page plus haute que R14),
  lisibilité du texte à l'échelle ≈ 0,7, position des titres de cadres par rapport à l'en-tête.
- Les liaisons traversent les cadres (comme dans Blueprint) et passent sur leurs titres.
- Hors ligne : Latin Modern retombe sur Georgia, KaTeX manque : les énoncés restent en texte, les
  mathématiques inline en italique Unicode.
- Le calque HTML suit la projection : en 3D les boîtes restent à plat, l'en-tête et les cadres s'effacent.
- Même dérivation que R14 : un choix de modélisation issu d'une décision (« Force de prise anormale ») part
  dans la marge sans liaison depuis sa décision (limite relevée sur la fontaine dans R14).
- L'extraction ne voit que ce qui est écrit en Unicode mathématique : « T′ − λ g y est constant » reste du texte.
  Des agents qui écriraient la formule à part (champ `formule` en LaTeX) rendraient la règle inutile.

## Idées

- Numéroter par sous-problème (« Lemme 2.3 ») comme un `\numberwithin{lemme}{section}`.
- Renvois cliquables façon `hyperref` (cadrer la boîte citée).
- Export du graphe en vrai source LaTeX (tcolorbox + TikZ) : la même composition, compilable.
