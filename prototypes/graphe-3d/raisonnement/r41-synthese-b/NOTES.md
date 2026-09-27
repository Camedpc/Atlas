# R41 · Synthèse (essai B)

Synthèse demandée par Camille : la figure LaTeX classique de R36, organisée en boîtes comme R18, réductible
comme R19, avec les hypothèses de R37 et les graphiques clés de R35, plus des niveaux de détail selon le zoom.
Thème clair seulement. Jeu par défaut : fontaine de chaîne (`?jeu=edp` ou le sélecteur pour le jeu synthétique).
URL : `http://localhost:5180/raisonnement/r41-synthese-b/`.

## Ce qui vient de chaque vision

| Vision | Repris | Fichiers |
|---|---|---|
| **R36** (base) | Computer Modern (fontes KaTeX), en-têtes amsthm « **Lemme 7** (nom). », formule display KaTeX centrée (règle d'extraction inchangée), confiance `c = 0,82` avec bornes en exposant / indice, validation en pied, statut par le trait (plein, tireté, barré, pointillé gris), double cadre des résultats, copie décalée des sous-systèmes, losange de décision et alternative ×, bornes de contexte, renvois « cf. 7 », axe « rang logique *r* », accolades des zones, légende « Figure 1 – … » sous la figure, noir sur blanc et un seul bleu (#1c4fa0) d'interaction, fiche et tableau booktabs du panneau | `formules.ts` (copie), `composition.ts`, `rendu.ts`, `style.css` |
| **R37** | Présentation des hypothèses de modélisation : un paragraphe `\newtheorem` — « **Hypothèse (ii)** (nom). » puis l'hypothèse en *italique*, justifié, « portée : n énoncés » en pied ; numérotation (i), (ii)… ; « *sous (i), (iii)* » en bleu au-dessus des blocs dépendants ; cadre simple, renforcé en bleu quand l'hypothèse est active (survol, épingle) | `composition.ts`, `mise-en-page.ts` (`romain`), `rendu.ts` |
| **R35** | Construction des graphiques (loi « Y / X = f » ou « Y = f(X) » confrontée à une série `mesures` ou à une pente déclarée, paramètres lus dans les énoncés indépendants des mesures, bande ±1σ), style pgfplots, figure accrochée sous le bloc qui énonce la loi (hauteur réservée par la mise en page). Prédiction en trait plein **noir** (pas de second bleu) | `graphiques.ts`, `lois.ts` (copie de `formules.ts` de R35), `mesures.ts` (copie) |
| **R18** | Boîtes englobantes telles quelles : rectangle teinté translucide, barre de titre colorée (teintes de R18), contour fin, piste abandonnée hachurée et tiretée, boîtes imbriquées « parent.enfant », boîte des hypothèses de modélisation ; mise en page boîte par boîte (chaque sous-problème mis en page seul, puis posé comme une pièce rigide sans chevauchement), rangs « au plus tard », liaisons longues par des passages libres ; le repli ne franchit pas un sous-problème ; jeu fontaine avec ses deux sous-problèmes imbriqués | `mise-en-page.ts`, `rendu.ts`, `squelette.ts`, `jeu-fontaine.ts` (celui de R18 = R14 + imbrication) |
| **R19** | Réduction : clic sur la barre de titre → nœud-fonction (étape de dérivation `etapeGroupes`, correspondance exacte), broches ▷ d'entrée (une par liaison entrante, « cf. 3 (nom) ») et ● de sortie (un énoncé utilisé dehors), statut le plus faible par le trait, maillon le plus faible (« min c = 0,62 ») ; nouveau clic : redéploiement ; refus si cycle. Onglet (« ouvrir ↗ » dans la barre, double-clic sur un nœud-fonction, ou panneau) avec fil d'Ariane sous la barre d'outils. R41 : les boîtes imbriquées se réduisent seules, et réduire un parent réduit ses enfants | `groupes.ts`, `main.ts` |

Composé en LaTeX, le nœud-fonction s'écrit « **Sous-problème §1** (Conditions aux extrémités) — réduit, 7 énoncés. »,
puis ses rangées de broches, puis « 2 à vérifier · min *c* = 0,62 ».

## Défaut de R36 corrigé : hypothèses écrasées

Le bloc d'hypothèse de R36 portait la classe `r36-hyp`, que la feuille de style donnait aussi aux lignes du
panneau (`display: flex`) : en-tête, corps et pied se mettaient en colonnes côte à côte. R41 sépare les classes
(`r41-hyp-bloc` pour le bloc, `r41-hyp-liste` pour le panneau).

## Niveaux de détail (zoom)

`s` = pixels d'écran par pixel de mise en page (1 = taille nominale). Réglages « zoom : points sous » et
« zoom : contenu dès » (dossier *Figure R41*).

| `s` | Affichage |
|---|---|
| `s < 0,22` | un **carré** de 3 à 7 px par bloc, de la **couleur de sa boîte** (teinte R18 ; bleu s'il est dans la lignée) ; boîtes teintées sans titre (le titre apparaît dès 6,5 px) ; liaisons atténuées, sans pointes ; aucun texte, aucun KaTeX |
| `0,22 ≤ s < 0,55` | cadres (statut par le trait) et **titre seul** écrit sur le canevas : numéro en gras puis le nom, en corps ≥ 8,5 px, coupé et tronqué (« … ») dans le cadre ; figures réduites à leur cadre et « Figure n » |
| `s ≥ 0,55` | **contenu complet** : composition HTML (formule KaTeX, confiance, validation), figures pgfplots, bornes, renvois, « sous (ii) », « voir fig. n » |

Passage fonctionnel : fondu sur 15 % (points ↔ cadres) et 12 % (titres ↔ contenu) au-dessus du seuil ; rien en
boucle. Seuls les blocs dont le rectangle touche l'écran sont dessinés et composés.

**Composition paresseuse** (`composition.ts`) : la mise en page n'a besoin d'aucun DOM — les hauteurs sont
estimées (mots mesurés sur un canevas en Computer Modern, formule : 1,45 em par ligne, 2,45 em avec `\frac`,
2,2 em avec `\sum`). L'élément HTML d'un bloc et son KaTeX ne sont créés qu'à son premier affichage en vue
rapprochée, puis gardés en cache (600 au plus, clé = contenu). Si le contenu réel dépasse la hauteur réservée,
la formule est réduite (jusqu'à 55 %), puis le contenu entier ; le cadre coupe le reste. Le panneau compte les
blocs composés.

## Graphiques clés (règle générique, `graphiques.ts`)

Candidate : une figure qui confronte une loi à des **mesures** (série `mesures`) ; une loi seulement confrontée
à une pente déclarée ne l'est pas. Classement : (a) la loi est un résultat majeur (théorème / résultat non admis),
(b) nombre d'énoncés qui dépendent de la loi dans le graphe complet, (c) nombre de points mesurés. Les *N*
premières sont affichées d'office (réglage « graphiques clés », 2 par défaut, 3 au plus) ; les autres sont
accessibles à la demande : « voir fig. n » sous le bloc (clic : l'afficher) et cases du panneau (afficher /
retirer n'importe laquelle). Sous un sous-problème réduit, une figure n'est qu'un renvoi. Sur la fontaine, les
deux figures (v² contre h₂ ; h₁ contre h₂, sous « Loi de la fontaine ») sont clés ; le jeu EDP n'en a aucune.

## Cadrage

`cadrerTout` (2D) cadre la figure entière — axe et accolades en haut, boîtes, légende mesurée en bas — à la
taille de l'écran (sans les 150 px que la vue réserve à droite pour des libellés que R41 n'a pas).

## Vérifié

- `npx tsc --noEmit` : aucune erreur ; `meta.json` valide (Python) ; Vite sert `index.html`, `main.ts`,
  `meta.json?import` et les modules (200).
- Hors navigateur (bundle rolldown, canevas simulé) : dérivation + mise en page sur la fontaine (squelette,
  auxiliaires, tout ; `bords` réduit ; `bords.extremites` seul réduit ; tout réduit ; onglets `bords` et
  `pred.mesures`) et sur le jeu EDP (squelette, auxiliaires, tout réduit — `conv` et `num` refusés : cycle) :
  correspondance exacte partout, **aucun bloc qui en chevauche un autre, aucune boîte de premier niveau qui en
  chevauche une autre, aucun bloc dans la boîte d'un autre sous-problème**. Fontaine squelette ≈ 1 840 × 1 090 px
  de mise en page (22 blocs), 2 figures clés.

## Non vérifié / limites

- **Rien n'a été regardé dans un navigateur** (consigne : pas de navigateur sur cette machine). À regarder
  d'abord : justesse des hauteurs estimées (blocs trop hauts = blanc sous la formule ; trop bas = formule
  réduite), alignement couche HTML / cadres, rangées de broches face aux ▷ et ●, lisibilité des titres canevas
  au niveau intermédiaire, seuils par défaut (au cadrage initial de la fontaine, `s` vaut environ 0,5 à 0,8 selon la largeur de
  l'écran : sur un petit écran, on arrive au niveau « titres » et il faut zoomer pour le contenu).
- Estimation des hauteurs sans DOM : un énoncé à la typographie inhabituelle peut être un peu réduit ou laisser
  du blanc ; la mise en page, elle, ne bouge jamais après coup.
- Onglet d'un sous-problème imbriqué : la boîte parente est dessinée autour (même contenu). Entrées et sorties
  d'onglet sont des blocs ordinaires hors boîte, entourés d'un tireté gris.
- La réduction ne relance pas la réduction transitive (comme R19) ; une liaison entre boîtes éloignées peut
  traverser une boîte intermédiaire (comme R18, jamais un bloc).
- En 3D, boîtes, axe et légende s'effacent ; le texte reste à plat.
