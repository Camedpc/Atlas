# Performances des visions de raisonnement à grand nombre de nœuds

Mesures hors navigateur (Node 24, Windows, machine à mémoire limitée) des visions R36 (LaTeX classique),
R18 (Blueprint · équations), R19 (Blueprint · réduction) et R35 (LaTeX · pgfplots), du générateur au
dessin d'une image, et plan d'optimisation pour la synthèse R40–R42 (niveaux de détail selon le zoom).
Outils et résultats bruts : `performances/`. Aucun autre fichier n'a été modifié.

## 1. Méthode

| Étape | Outil | Détail |
|---|---|---|
| Grands jeux | `performances/src/generateur.ts` | Chapitres copiés du jeu EDP (≈ 200 nœuds) et du jeu fontaine (≈ 70), en alternance 2 : 1, reliés par (1) une littérature partagée (60 % des nœuds admis d'une copie remplacés par ceux de la première copie), (2) des dépendances entre chapitres (50 % des racines de travail citent un théorème, résultat ou proposition d'un des 3 chapitres précédents), (3) du contexte croisé (30 % des démonstrations). Préfixe des N premiers nœuds, ordre topologique garanti, déterministe. 200 / 1 000 / 5 000 / 20 000 nœuds, **2,8 à 3,2 prémisses par nœud**, 14 types, 5 à 695 sous-problèmes. |
| Assemblage | `performances/construire.mjs` | rolldown (déjà dans `node_modules`, dépendance de Vite) ; `src/raisonnement/index.ts` remplacé par un shim sans sigma ni DOM. |
| Environnement | `performances/src/environnement.ts` | `document` minimal ; mesure de texte simulée (largeur = caractères × corps × 0,52) ; KaTeX 0.16.11 réel (`katex.min.js` du CDN dans `performances/.cache/`) ; contexte canvas « compteur » (Proxy) qui compte chaque appel. |
| Banc | `performances/src/banc.ts`, `mesurer.mjs` | Une tâche par processus (`--max-old-space-size=1500`, délai 240 s) : `jeu`, `lecture` (chaque étape chronométrée), `page` (`mettreEnPage` d'une vision, réglages par défaut), `katex` (composition des blocs de R36 comme `Composition.composer`), `rendu` (une image de `dessinerDessous` + `dessinerDessus` sur une vue simulée, vue d'ensemble et zoom de lecture 1 px = 1 px). |
| Prototype | `performances/src/lod.ts`, `banc-lod.ts`, `points/` | Niveaux de détail + grille spatiale + pool HTML recyclé + cache KaTeX, mesuré sur 20 000 nœuds (§ 5). |

Reproduire : `node performances/construire.mjs && node performances/mesurer.mjs && node performances/resume.mjs`
(tableaux complets dans `performances/resultats/resume.md`, lignes brutes dans `resultats/brut.jsonl`).

**Ce qui n'a pas été mesuré, et pourquoi.** La campagne a été arrêtée volontairement (machine à court de
mémoire, consigne de ne rien relancer de lourd) après `rendu r36 squelette N = 5000` :

- **N = 20 000 : aucune mise en page, dérivation ni image mesurée** (seuls le générateur, `construireJustification`
  et le prototype LOD l'ont été). Les chiffres à 20 000 ci-dessous sont **extrapolés** des pentes mesurées
  entre 1 000 et 5 000 (exposant local `log(t₅₀₀₀/t₁₀₀₀) / log(u₅₀₀₀/u₁₀₀₀)`, u = unités) et signalés « ≈ extrap. ».
- **`page r36 tout` à N = 5 000 : délai de 240 s dépassé** (non terminé).
- **`rendu` à N = 5 000 pour R36 tout, R18, R19, R35** : non lancés (campagne arrêtée) ; extrapolés depuis 1 000.
- **Aucun profil CPU** (`performances/profil.mjs` est prêt mais n'a pas tourné) : les goulots du § 3 viennent
  de la lecture du code, confirmés par les pentes mesurées, pas d'un profileur.
- **Aucune mesure navigateur** (ni layout, ni peinture, ni GPU) : le § 4 est une **estimation** à partir des
  comptes exacts d'appels et d'ordres de grandeur connus.
- Les temps d'image « JS » sont pris avec le contexte compteur (Proxy) : ils incluent le coût du Proxy et
  excluent toute rastérisation ; c'est un ordre de grandeur du travail JavaScript, pas un temps d'image.
- Correctif après coup : dans les lignes `rendu` de `brut.jsonl`, les compteurs DOM de R36
  (`placements`, `ecrituresStyle`) cumulent 6 images (1 comptée + 5 chronométrées) ; ils sont divisés
  ici (le banc est corrigé mais n'a pas été réassemblé ni relancé).

## 2. Mesures

### 2.1 Jeu et graphe de justification

| N | arêtes | prémisses / nœud | génération | `construireJustification` | tas |
|---|---|---|---|---|---|
| 200 | 556 | 2,78 | 19–65 ms | 0,9 ms | 0,2 Mo |
| 1 000 | 3 065 | 3,07 | 25 ms | 4,4 ms | 1,2 Mo |
| 5 000 | 15 807 | 3,16 | 48 ms | 29 ms | 6 Mo |
| 20 000 | 63 819 | 3,19 | 133 ms | 83 ms | 24 Mo |

Linéaire, négligeable. Ce n'est pas là que ça coince.

### 2.2 Dérivation du graphe de lecture (ms, étapes chronométrées)

| Stratégie | N = 1 000 | N = 5 000 | N = 20 000 (≈ extrap.) | Étape dominante |
|---|---|---|---|---|
| `defaut` (a+b+c) | 81 (740 unités) | 600 (3 752) | ≈ 6–8 s | `etapeFusionChaines` 46 → 482 ms (pente ≈ 1,5 ; quadratique en principe) |
| `r36-squelette` | 47 (228) | 305 (1 150) | ≈ 2–3 s | `etapeRepli` 19 → 194 ms |
| `r36-tout` | 29 (859) | 121 (4 404) | ≈ 0,6 s | réduction transitive 10 → 64 ms |
| `r19-squelette` | 51 (243) | 286 (1 223) | ≈ 2–3 s | `etapeRepli` 21 → 182 ms |
| `r19` groupes réduits | 59 (140) | 456 (555) | ≈ 5 s | `etapeGroupes` 14 → 184 ms |

Mémoire modeste (≤ 2 Mo à 5 000) sauf la réduction transitive : ensembles de bits n × n/32, soit
**50 Mo à 20 000 nœuds** (Uint32Array par unité).

### 2.3 Mise en page (`mettreEnPage`, une passe ; R36 en fait 1 ou 2 à chaque recalcul)

| Vision | N = 200 | N = 1 000 | N = 5 000 | pente 1 000 → 5 000 | N = 20 000 (≈ extrap.) |
|---|---|---|---|---|---|
| R36 squelette | 24 ms (36 u.) | 120 ms (228 u.) | **8,5 s** (1 150 u.) | ≈ 2,6 | ≈ 5 min |
| R36 tout | 62 ms (156 u.) | 1,06 s (859 u.) | **> 240 s** (4 404 u.) | ≥ 3,3 | plusieurs heures |
| R18 auxiliaires | 83 ms (84 u.) | 231 ms (456 u.) | 2,7 s (2 370 u.) | ≈ 1,5 | ≈ 30 s |
| R19 squelette | 36 ms (37 u.) | 161 ms (243 u.) | **22,3 s** (1 223 u.) | ≈ 3,0 | ≈ 15–25 min |
| R35 squelette | 30 ms (36 u.) | 128 ms (228 u.) | **20,2 s** (1 150 u.) | ≈ 3,0 | ≈ 15–20 min |

À 5 000 nœuds : 142 à 201 rangs, jusqu'à 222 unités par rang, 35 000 à 50 000 points de routes,
figures de 32 856 × 24 519 px (R36) à 56 374 × 55 749 px (R18). Mémoire de la page : 7–10 Mo,
RSS max ≈ 210 Mo. **Le temps, pas la mémoire, est le mur** : la mise en page est super-linéaire (pente
2,6 à 3,3) et passe du dixième de seconde à la minute entre 1 000 et 5 000 nœuds.

### 2.4 Composition KaTeX de R36 (tous les blocs, comme `Composition.composer`)

| Niveau | N | blocs | `renderToString` | ms / bloc | éléments DOM / bloc (moy. / max) | éléments DOM total | HTML | avec cache TeX → HTML | TeX uniques / total |
|---|---|---|---|---|---|---|---|---|---|
| squelette | 1 000 | 228 | 288 ms | 1,3 | 89 / 279 | 20 203 | 1,5 Mo | 81 ms | 80 / 456 |
| squelette | 5 000 | 1 150 | 2,7 s | 2,4 | 87 / 279 | 100 127 | 7,7 Mo | 255 ms | 94 / 2 300 |
| tout | 1 000 | 859 | 747 ms | 0,9 | 81 / 279 | 69 625 | 5,3 Mo | 126 ms | 199 / 1 718 |
| tout | 5 000 | 4 404 | 6,9 s | 1,6 | 79 / 279 | 348 215 | 26,5 Mo | 657 ms | 212 / 8 808 |
| tout | 20 000 (≈ extrap.) | ≈ 17 600 | ≈ 25–30 s | | ≈ 80 | **≈ 1,4 million** | ≈ 105 Mo | | |

- **≈ 1 à 2,5 ms et ≈ 80–90 éléments DOM par bloc** (KaTeX produit beaucoup de `span`), 3 Ko de HTML.
- Le cache chaîne → HTML divise le temps par ≈ 10 **sur ce jeu répliqué** (les copies répètent les mêmes
  formules : 212 chaînes distinctes sur 8 808). Sur le jeu d'origine (N = 200), 52 chaînes distinctes sur
  72 : sur de vraies données, compter plutôt un gain ×1,3 à ×3 (confiance `c = …` souvent identique,
  formules du modèle répétées), le vrai gain vient de **ne rendre que ce qui est visible**.
- Ces chiffres ne comptent que KaTeX en JS : dans le navigateur s'ajoutent l'insertion du HTML et la
  mesure (`offsetWidth` / `offsetHeight`, § 3.3), probablement plus chères que KaTeX lui-même.

### 2.5 Une image : appels canvas et écritures DOM (vue d'ensemble, 2D)

| Vision | N | unités | tracés (stroke/fill/texte) | appels canvas | écritures de style HTML / image en mouvement | JS mesuré |
|---|---|---|---|---|---|---|
| R36 squelette | 1 000 | 228 | 2 853 | 9 564 | 456 (228 éléments placés) | 10 ms |
| R36 squelette | 5 000 | 1 150 | 14 594 | 86 424 (dont 49 949 `lineTo`) | 2 300 (1 150 placés) | 116 ms |
| R36 tout | 1 000 | 859 | 8 477 | 38 612 | 1 718 (859 placés) | 23 ms |
| R18 auxiliaires | 1 000 | 456 | 15 311 | 40 149 (dont **5 127 `measureText`**) | – (tout canvas) | 143 ms |
| R19 squelette | 1 000 | 243 | 5 820 | 18 610 | – | 19 ms |
| R35 squelette | 1 000 | 228 | 7 188 | 23 658 (dont 4 695 `measureText`) | ≈ 92 formules HTML | 30 ms |

**Zoom de lecture** (1 px de mise en page = 1 px écran, centré dans la figure) : 7 à 43 unités sont à l'écran,
mais **le nombre de tracés est identique à la vue d'ensemble** (R36 squelette 5 000 : 7 unités visibles,
14 669 tracés). Aucune vision ne fait de culling : `projection.visible` ne teste que « devant la caméra »,
toutes les routes, cadres, pastilles et éléments HTML sont traités à chaque image.

Extrapolation linéaire (le coût par unité est à peu près constant) à 20 000 nœuds, R36 tout
(≈ 17 600 unités) : ≈ 175 000 tracés, ≈ 800 000 appels canvas, ≈ 35 000 écritures de style par image.

## 3. Goulots (algorithmes super-linéaires et coûts cachés)

### 3.1 Mise en page (mêmes fonctions, reprises de R14, dans R36 / R19 / R35 ; R18 en partie)

| # | Où | Complexité | Pourquoi ça coûte |
|---|---|---|---|
| 1 | Routage : `[...parCanal.values()].flat().find((s) => s.route === r && s.i === k)` pour chaque tronçon de chaque route | **O(S²) avec allocation d'un tableau de S segments à chaque appel** | À 5 000 nœuds S ≈ 25 000 tronçons → ≈ 6 × 10⁸ comparaisons et 25 000 tableaux de 25 000 éléments. Probablement le premier poste. Correction triviale : garder le segment dans la route au moment où on le crée. |
| 2 | Nœuds fictifs : `couches.findIndex((c) => c.includes(e))` pour chaque nœud fictif de chaque route | O(D × E) | D (fictifs) et E (éléments) croissent comme la longueur des arêtes × leur nombre. Le rang est connu à la création : le stocker. |
| 3 | `croisements()` : toutes les paires de segments de chaque rang, 17 fois | O(Σ k_r²) × 17 | 222 unités + fictifs par rang à 5 000. Remplacer par un comptage par tri + arbre de Fenwick (O(k log k)) ou ne l'évaluer qu'une passe sur deux. |
| 4 | Pistes par canal : `segs.find` / `segs.filter` pour chaque destination | O(dest × segs) par canal | Grouper une fois par clé (Map). |
| 5 | Portées des choix : `dependantsDe` par choix + `masques.indexOf(i)` par dépendant | O(C × (n + m) × M) | C et M (masqués) croissent avec N : 740 choix et 2 145 masqués à 20 000/5 000. Index inverse `Int32Array` + une passe topologique avec ensembles de bits. |
| 6 | Barycentres (16 passes) et régression isotone (60 itérations sur tous les éléments) | O(passes × E log E) | Linéaire mais constante énorme (60 ×) ; converge souvent bien avant : arrêt quand le déplacement max < 0,5 px. |
| 7 | Kahn avec `file.shift()` (lecture, squelette, mise en page) | O(n²) | Remplacer par un indice de tête. |
| 8 | R19 : `G.ordre.indexOf`, `idsBandes.indexOf(cleBande(…))` par arête ou unité | O(m × bandes) | Map. |

### 3.2 Dérivation

- `fusionner` (lecture.ts, chaînes) et `replier` (squelette) parcourent **toutes les arêtes pour chaque
  groupe** (`for (const [k, a] of [...t.aretes])`, copie de la Map comprise) : O(groupes × m). `etapeRepli`
  recopie `[...g]` à chaque tour de `while (change)`. Adjacence par unité = correction locale.
- Réduction transitive : bitsets O(n² / 32) en mémoire (50 Mo à 20 000) ; acceptable jusque-là, à borner
  au-delà (par sous-problème ou limitée aux arêtes de lecture).

### 3.3 Rendu

- **Pas de culling** (voir § 2.5) : le coût d'une image est proportionnel au graphe, pas à l'écran.
- **Un tracé par élément** : chaque route = `beginPath` + `stroke` + pointe (`beginPath` + `stroke`), avec
  `setLineDash` et une chaîne `rgba()` construite à chaque fois ; aucun regroupement par style.
- **Tri de toutes les unités à chaque image** (`ordre.sort` par profondeur) et, avec des hypothèses actives,
  `page.portees.get(q)?.includes(p)` pour chaque hypothèse et chaque bloc : O(nU × H × portée).
- **R18 / R35 : `measureText` dans la boucle d'image** (5 127 appels à 456 unités) : les largeurs de
  texte et de formules devraient être mesurées une fois, à la mise en page.
- **R36, composition HTML** : `composer()` crée **tous** les blocs d'emblée (≈ 90 éléments DOM chacun),
  puis alterne dans une boucle `f.offsetWidth` (lecture) et `f.style.fontSize = …` (écriture) : chaque
  lecture après une écriture force un **layout synchrone de toute la couche** (« layout thrashing »),
  O(n) layouts de O(n) éléments. Puis `mesurer()` relit `offsetHeight` de tous les blocs, et le cycle
  est refait jusqu'à 2 fois (numéros), plus une fois à l'arrivée des fontes KaTeX.
- **R36, placement** : `placer()` construit une chaîne `translate(...) scale(...)` et écrit `transform` +
  `opacity` pour chaque bloc à chaque image en mouvement ; `finImage()` parcourt tous les éléments.
  R35 crée ses formules paresseusement et saute les minuscules (`f × TAILLE < 3,2`), mais lit
  `offsetWidth` juste après `k.render` pendant l'image (layout synchrone à la première apparition).
- **sigma** tourne aussi en dessous (`sigma.refresh()` sur tous les points à chaque image).

## 4. Estimation du coût navigateur (sans navigateur : ordres de grandeur)

Repères usuels (Chrome, portable récent, canvas 2D accéléré) : ≈ 0,5–2 µs par appel de chemin simple
(`moveTo`/`lineTo`/`rect`), ≈ 5–20 µs par `stroke()`/`fill()` isolé (changement d'état + rastérisation),
≈ 10–30 µs par `fillText`, ≈ 20–50 µs par `measureText` non mis en cache ; DOM : une page reste fluide
jusqu'à ≈ 10⁴–10⁵ nœuds en tout, un layout complet coûte ≈ 1 µs × nœud, et quelques centaines d'éléments
dont le `transform` change à chaque image coûtent ≈ 2–10 ms (style + composition), davantage si
l'échelle change (re-rastérisation du texte).

| Vision · N | canvas / image | DOM vivant | mouvement de caméra | composition initiale | verdict |
|---|---|---|---|---|---|
| R36 squelette · 1 000 | ≈ 2 900 tracés → 15–40 ms | ≈ 20 000 nœuds | 456 écritures → ≈ 3–8 ms | ≈ 0,3 s KaTeX + ≈ 0,2–1 s de layouts forcés | limite de 60 i/s, 20–40 i/s |
| R36 squelette · 5 000 | ≈ 14 600 tracés, 86 000 appels → 100–250 ms | ≈ 100 000 nœuds | 2 300 écritures → 20–50 ms | ≈ 2,7 s KaTeX + **plusieurs secondes à dizaines de secondes** de layouts forcés (O(n²)) + mise en page 8,5 s (×1 à ×2) | 3–8 i/s, ouverture de 15–40 s |
| R36 tout · 20 000 (extrap.) | ≈ 175 000 tracés → 1–3 s | ≈ 1,4 million de nœuds (mémoire du navigateur ≫ 1 Go) | ≈ 35 000 écritures | mise en page : heures | inutilisable |
| R18 auxiliaires · 5 000 (extrap.) | ≈ 80 000 tracés + ≈ 27 000 `measureText` → 1–2 s | canvas seul | – | 2,7 s | < 1 i/s |
| R19 / R35 squelette · 5 000 (extrap.) | ≈ 30 000–36 000 tracés → 0,3–0,6 s | R35 : ≈ 500 formules | – | 20–22 s | 2–3 i/s |

Budget : **16 ms par image**, dont ≈ 4–6 ms pour le JS, ≈ 6–8 ms pour style / layout / peinture, le reste
de marge. Aujourd'hui on sort du budget entre ≈ 300 et 1 000 unités affichées, **quelle que soit la
portion visible**.

## 5. Prototype mesuré : niveaux de détail + culling + pool HTML (`performances/src/lod.ts`)

Sans toucher aux visions. Grille uniforme (cellules de 512 px, stockage CSR), requête de la fenêtre
à chaque image, trois niveaux selon `s` = px écran par px de mise en page :

- `s < 0,3` **points** : un carré par bloc (≥ 2 px), triés par couleur par comptage, **un chemin et un
  `fill()` par couleur** ;
- `0,3 ≤ s < 0,6` **titres** : cadres en un seul `stroke()`, un `fillText` par bloc, police fixée une fois ;
- `s ≥ 0,6` **contenu** : en plus, un élément HTML par bloc **visible** pris dans un pool recyclé, contenu
  KaTeX rendu à la demande et mis en cache (clé = chaîne TeX).

Mesure (`banc-lod.mjs 20000 r36-tout` → `resultats/lod-20000.json`) : 17 644 unités, disposition en
couches linéaire (1,5 s pour dériver + disposer 20 000 nœuds, contre des heures pour R36), grille 70 ms,
parcours de 360 images (vue d'ensemble → zoom × 200 → panoramique → dézoom) :

| Niveau | images | visibles max | tracés max / image | JS médiane / p95 / max | KaTeX rendus max / image |
|---|---|---|---|---|---|
| points | 184 | 17 644 (tout) | **13** | 0,23 / 3,0 / 40 ms (première image, JIT) | 0 |
| titres | 32 | 117 | 118 | 0,04 / 0,35 / 0,5 ms | 0 |
| contenu | 144 | 34 | 35 | 0,07 / 0,18 / **77 ms** | 29 |

Pool : **34 éléments HTML vivants au maximum** pour 17 644 blocs, 34 créés, 14 réutilisés, 31 rendus
KaTeX sur toute la session. Le seul pic (77 ms) est l'entrée dans le niveau « contenu » : 29 formules
KaTeX rendues dans la même image → il faut **un budget de rendus par image** (≈ 4, le reste au titre en
attendant, ou `requestIdleCallback`). Référence naïve (17 644 `fill()` séparés) : 17 644 tracés par image,
soit en navigateur ≈ 100–300 ms contre ≈ 13 tracés en lots. La démo navigateur
(`performances/points/`, `http://localhost:5181/performances/points/?n=20000`) n'a **pas** été ouverte ici.

Bornes utiles pour dimensionner (écran 1 600 × 1 000, blocs 184 × 90 + écarts 46 × 20) : au plus
≈ 1 600 × 1 000 / (230 × 110 × s²) blocs visibles, soit ≈ 700 à s = 0,3 (titres) et ≈ 175 à s = 0,6
(contenu) ; au-dessus d'environ 150–200 éléments HTML riches, remonter le seuil « contenu ».

## 6. Recommandations chiffrées pour R40–R42

1. **Niveaux de détail** (seuils sur `s`, avec hystérésis de ±10 % pour ne pas clignoter) :
   - `s < 0,15–0,3` : **points / carrés colorés** en lots (canvas : un `fill` par couleur ; WebGL si
     > 50 000 points ou si la 3D doit suivre — sigma le fait déjà : lui confier ce niveau). Arêtes :
     rien, ou un seul chemin gris très fin pour toutes (≤ 1 `stroke`), ou seulement les arêtes de la lignée.
   - `0,3 ≤ s < 0,6` : **titres en canvas** (cadres groupés, `fillText` avec largeurs mesurées une fois),
     arêtes en lots par style (≤ 4 `stroke` : plein, tireté, abandonné, lignée), pointes groupées.
   - `s ≥ 0,6` : **contenu HTML/KaTeX seulement pour les blocs visibles**, ≤ 150–200 éléments ; au-delà
     (écran 4K), repasser en titres.
2. **Culling par fenêtre** partout (blocs, routes par boîte englobante, pastilles, cibles de survol) : grille
   uniforme reconstruite à chaque mise en page (70 ms à 17 600 blocs, O(n)) ; la requête coûte < 0,3 ms.
3. **Virtualisation / recyclage HTML** : pool d'éléments (création seulement si le pool est vide), `innerHTML`
   seulement quand le contenu change, `transform` seul en mouvement (pas `opacity` si inchangée), jamais de
   lecture de layout pendant l'image.
4. **Cache KaTeX** : `Map<tex, html>` (et `Map<tex, {largeur, hauteur}>`) pour toute la session ;
   budget ≈ 4 rendus par image ; option : pré-rendu en bitmap (`OffscreenCanvas` / image SVG) pour le
   niveau intermédiaire, qui évite le DOM quand on zoome vite.
5. **Hauteurs sans DOM** : estimer la hauteur d'un bloc à partir de la chaîne (nombre de lignes, présence
   d'une fraction / `gathered`) pour la mise en page, puis corriger paresseusement quand le bloc devient
   visible ; au minimum, **grouper les lectures puis les écritures** dans `composer()` (supprime le O(n²)).
6. **Agrégation automatique** : au-delà de ≈ 300 unités, ouvrir par défaut en **groupes réduits** (R19,
   un nœud-fonction par sous-problème : 5 000 → 555 unités mesurées) ou au niveau « squelette »
   (5 000 → 1 150 unités), et déplier à la demande ; c'est aussi ce qui garde la mise en page actuelle
   sous la seconde.
7. **Mise en page incrémentale ou dans un Web Worker** : la mise en page est pure (données → positions),
   elle peut partir telle quelle dans un worker ; recalcul local au dépliage d'un groupe (seulement les
   rangs touchés, `precedent` fixe le reste).
8. **Budget de 16 ms** : afficher un compteur d'image en mode développement et dégrader automatiquement
   (niveau inférieur) si trois images de suite dépassent 20 ms.

## 7. Plan d'optimisation (ordonné par gain / effort)

| # | Action | Effort | Gain attendu |
|---|---|---|---|
| 1 | Supprimer les recherches linéaires de la mise en page : segment rangé dans sa route (§ 3.1-1), rang des fictifs mémorisé (-2), groupage des canaux (-4), index inverse des masqués (-5), `file.shift` (-7) | ½ journée, sans changement de résultat | mise en page 5 000 : de 8–22 s à ≈ 1 s (probable ; à confirmer par `profil.mjs`) ; R36 tout 5 000 : de > 240 s à quelques secondes |
| 2 | Culling par fenêtre (grille `lod.ts`) des blocs, routes, pastilles, éléments HTML | ½–1 journée | coût d'image ∝ écran : au zoom de lecture, 14 600 → quelques centaines de tracés (÷ 30 à ÷ 100) |
| 3 | Niveaux de détail points / titres / contenu (prototype prêt) | 1 journée | vue d'ensemble de 20 000 nœuds en ≈ 13 tracés ; HTML vivant borné à ≈ 35–200 éléments |
| 4 | Composition HTML paresseuse + pool + cache KaTeX + budget de rendus par image ; plus de layout forcé dans `composer()` | 1 journée | ouverture : de ≈ 3–30 s (5 000) à < 0,2 s ; DOM : de 100 000–1,4 M nœuds à < 20 000 |
| 5 | Largeurs de texte / formules mesurées à la mise en page (R18, R35), tracés regroupés par style, plus de tri global par image | ½ journée | R18 : ÷ 3 à ÷ 5 sur le JS d'une image |
| 6 | Agrégation par défaut au-delà de 300 unités (groupes R19 ou squelette) | ½ journée (existe déjà) | ÷ 4 à ÷ 9 unités affichées ; garde toute la chaîne sous la seconde |
| 7 | `croisements()` en O(k log k), arrêt anticipé des 60 itérations de hauteurs | ½ journée | mise en page encore ÷ 2 à ÷ 5 |
| 8 | Dérivation : adjacence par unité dans `fusionner` / `replier` ; bitsets de la réduction transitive bornés | ½ journée | `defaut` 20 000 : ≈ 6–8 s → < 1 s |
| 9 | Mise en page dans un Web Worker, recalcul incrémental au dépliage | 1–2 jours | interface jamais bloquée ; utile au-delà de ≈ 10 000 nœuds |

Commencer par 1 (correctifs mécaniques, gain énorme, aucun risque visuel), puis 2 + 3 + 4 qui forment
ensemble la base de R40–R42.
