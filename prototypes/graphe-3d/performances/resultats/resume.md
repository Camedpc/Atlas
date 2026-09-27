# Mesures brutes (générées par resume.mjs)

### Jeu et graphe de justification

| N | arêtes | prém./nœud | génération (ms) | construireJustification (ms) | tas (Mo) |
|---|---|---|---|---|---|
| 200 | 556 | 2.78 | 64.9 | 0.9 | 0.2 |
| 1000 | 3065 | 3.07 | 24.9 | 4.4 | 1.2 |
| 5000 | 15807 | 3.16 | 48.2 | 28.8 | 6 |

### Dérivation « defaut »

| N | unités / arêtes | total (ms) | détail par étape (ms) |
|---|---|---|---|
| 200 | 139 / 201 | 17 | etapeRoles 1.9 · etapeReductionTransitive 2 · etapeFusionChaines 8.3 · finaliser 4.8 |
| 1000 | 740 / 1105 | 81.3 | etapeRoles 9.6 · etapeReductionTransitive 13.6 · etapeFusionChaines 46.1 · finaliser 12 |
| 5000 | 3752 / 5721 | 600.3 | etapeRoles 31.1 · etapeReductionTransitive 62.4 · etapeFusionChaines 482.2 · finaliser 24.6 |

### Dérivation « r36-squelette »

| N | unités / arêtes | total (ms) | détail par étape (ms) |
|---|---|---|---|
| 200 | 36 / 47 | 12.5 | etapeContexte 2.7 · etapeElagage 1.1 · etapeReductionTransitive 1.8 · etapeRepli 3.1 · finaliser 3.8 |
| 1000 | 228 / 339 | 46.9 | etapeContexte 9.1 · etapeElagage 2.3 · etapeReductionTransitive 9.7 · etapeRepli 18.7 · finaliser 7.1 |
| 5000 | 1150 / 1827 | 304.7 | etapeContexte 31.6 · etapeElagage 18.2 · etapeReductionTransitive 41.1 · etapeRepli 194.3 · finaliser 19.5 |

### Dérivation « r36-tout »

| N | unités / arêtes | total (ms) | détail par étape (ms) |
|---|---|---|---|
| 200 | 156 / 199 | 11.5 | etapeContexte 3.3 · etapeReductionTransitive 3.5 · finaliser 4.7 |
| 1000 | 859 / 1184 | 29.3 | etapeContexte 8.7 · etapeReductionTransitive 10.5 · finaliser 10.1 |
| 5000 | 4404 / 6264 | 121.1 | etapeContexte 31.7 · etapeReductionTransitive 64.1 · finaliser 25.3 |

### Dérivation « r19-squelette »

| N | unités / arêtes | total (ms) | détail par étape (ms) |
|---|---|---|---|
| 200 | 37 / 48 | 18.9 | etapeContexte 3.4 · etapeElagage 1.3 · etapeReductionTransitive 2.5 · etapeRepli 4 · etapeGroupes 0.5 · finaliser 7.2 |
| 1000 | 243 / 355 | 51.3 | etapeContexte 11.8 · etapeElagage 3.3 · etapeReductionTransitive 7.7 · etapeRepli 20.6 · etapeGroupes 0.4 · finaliser 7.5 |
| 5000 | 1223 / 1902 | 286.4 | etapeContexte 30.4 · etapeElagage 19.1 · etapeReductionTransitive 35.5 · etapeRepli 182 · etapeGroupes 0.3 · finaliser 19.1 |

### Dérivation « r19-squelette-reduits »

| N | unités / arêtes | total (ms) | détail par étape (ms) |
|---|---|---|---|
| 200 | 28 / 31 | 14.9 | etapeContexte 2.7 · etapeElagage 1.1 · etapeReductionTransitive 2 · etapeRepli 3.6 · etapeGroupes 1.5 · finaliser 4 |
| 1000 | 140 / 196 | 59 | etapeContexte 8.4 · etapeElagage 2.9 · etapeReductionTransitive 9.3 · etapeRepli 17.9 · etapeGroupes 14.1 · finaliser 6.4 |
| 5000 | 555 / 821 | 455.8 | etapeContexte 29.9 · etapeElagage 17.6 · etapeReductionTransitive 37.1 · etapeRepli 169.8 · etapeGroupes 184.4 · finaliser 17 |

### Mise en page (mettreEnPage, une passe)

| vision | N = 200 | N = 1000 | N = 5000 |
|---|---|---|---|
| r36 squelette | 24.1 ms (36 u., 31 routes, 8/rang) | 120.3 ms (228 u., 231 routes, 43/rang) | 8530.7 ms (1150 u., 1263 routes, 222/rang) |
| r36 tout | 62.2 ms (156 u., 158 routes, 20/rang) | 1055.7 ms (859 u., 1006 routes, 78/rang) | > 240 s |
| r18 auxiliaires | 82.7 ms (84 u., 86 routes, 10/rang) | 230.7 ms (456 u., 498 routes, 38/rang) | 2719.5 ms (2370 u., 2631 routes, 189/rang) |
| r19 squelette | 35.6 ms (37 u., 32 routes, 7/rang) | 160.9 ms (243 u., 245 routes, 39/rang) | 22290.8 ms (1223 u., 1329 routes, 199/rang) |
| r35 squelette | 30.3 ms (36 u., 31 routes, 8/rang) | 128 ms (228 u., 231 routes, 43/rang) | 20236.8 ms (1150 u., 1263 routes, 222/rang) |

### Taille de la figure (px de mise en page, largeur × hauteur)

| vision | N = 200 | N = 1000 | N = 5000 |
|---|---|---|---|
| r36 squelette | 2266 × 865 | 8476 × 4736 | 32856 × 24519 |
| r36 tout | 5716 × 2498 | 17906 × 10703 | > 240 s |
| r18 auxiliaires | 4084 × 2767 | 13767 × 13498 | 56374 × 55749 |
| r19 squelette | 2172 × 1679 | 7324 × 10893 | 27196 × 53302 |
| r35 squelette | 2226 × 874 | 8328 × 4499 | 32284 × 23319 |

### Composition KaTeX de R36 (tous les blocs, comme Composition.composer)

| niveau | N | blocs | KaTeX (ms) | ms / bloc | éléments DOM / bloc (moy. / max) | éléments DOM total | HTML (Mo) | avec cache (ms) | TeX uniques / total |
|---|---|---|---|---|---|---|---|---|---|
| squelette | 200 | 36 | 78.3 | 2.175 | 97.2 / 279 | 3498 | 0.3 | 37.6 | 52 / 72 |
| squelette | 1000 | 228 | 288.1 | 1.264 | 88.6 / 279 | 20203 | 1.5 | 80.6 | 80 / 456 |
| squelette | 5000 | 1150 | 2731.2 | 2.375 | 87.1 / 279 | 100127 | 7.7 | 254.9 | 94 / 2300 |
| tout | 200 | 156 | 206.2 | 1.322 | 83.1 / 279 | 12960 | 1 | 95.2 | 152 / 312 |
| tout | 1000 | 859 | 746.9 | 0.869 | 81.1 / 279 | 69625 | 5.3 | 125.5 | 199 / 1718 |
| tout | 5000 | 4404 | 6884.6 | 1.563 | 79.1 / 279 | 348215 | 26.5 | 657.4 | 212 / 8808 |

### Une image (vue d'ensemble) : tracés canvas, appels, écritures DOM, temps JS

| vision | N | unités | tracés | appels canvas | placements / écritures style | JS (ms) | zoom lecture : unités à l'écran / tracés |
|---|---|---|---|---|---|---|---|
| r36 squelette | 200 | 36 | 468 | 1317 | 216 / 468 | 2.4 | 24 / 468 |
| r36 squelette | 1000 | 228 | 2853 | 9564 | 1368 / 2964 | 10.3 | 28 / 2854 |
| r36 squelette | 5000 | 1150 | 14594 | 86424 | 6900 / 14950 | 116.4 | 7 / 14669 |
| r36 tout | 200 | 156 | 1487 | 5048 | 936 / 2028 | 6.5 | 43 / 1487 |
| r36 tout | 1000 | 859 | 8477 | 38612 | 5154 / 11167 | 23.1 | 26 / 8479 |
| r36 tout | 5000 | – | – | – | – | – | – |
| r18 auxiliaires | 200 | 84 | 2813 | 8045 | – | 13.2 | 18 / 2825 |
| r18 auxiliaires | 1000 | 456 | 15311 | 40149 | – | 143.2 | 16 / 15471 |
| r18 auxiliaires | 5000 | – | – | – | – | – | – |
| r19 squelette | 200 | 37 | 918 | 3239 | – | 3.6 | 18 / 918 |
| r19 squelette | 1000 | 243 | 5820 | 18610 | – | 18.9 | 13 / 5961 |
| r19 squelette | 5000 | – | – | – | – | – | – |
| r35 squelette | 200 | 36 | 1180 | 4018 | 90 formules | 6.5 | 24 / 1180 |
| r35 squelette | 1000 | 228 | 7188 | 23658 | 552 formules | 29.5 | 26 / 7203 |
| r35 squelette | 5000 | – | – | – | – | – | – |
