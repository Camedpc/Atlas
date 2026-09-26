# V3 · Constellation

Le graphe comme une constellation lumineuse en profondeur. Thème clair par défaut : fond très clair
légèrement bleuté (dégradés radiaux discrets), halos pastel lumineux. Thème sombre plus spectaculaire :
mélange additif (`lighter`), poussière d'étoiles avec un léger parallaxe, palette plus lumineuse.
Démarrage en 3D isométrique, granularité 2 (sous-thèmes).

## Fichiers

| Fichier | Rôle |
|---|---|
| `main.ts` | assemblage, réducteurs nœud / arête, trajectoire « étincelle », carte Agrégation, tiroir, raccourcis |
| `reglages.ts` | réglages propres (dossiers « ✦ … » de Tweakpane) + surcharges des réglages moteur |
| `lumiere.ts` | halos (sprites), couronnes, anneaux de survol, traînées, impulsions de lignée, poussière ; boucle rAF propre |
| `squelette.ts` | agrégation « squelette par importance » |
| `fiche.ts` | fiche de survol en verre dépoli (nœud et agrégat) |
| `style.css` | palettes claire et sombre, verre dépoli (fiche, tiroir, cartes, barre), légende en CSS |

## Choix de conception

- **Halos = confiance.** Un sprite pré-rendu (dégradé radial) par couleur × palier de netteté (6 paliers),
  posé avec `drawImage` : ~1 200 halos par image restent rapides. Éclat et netteté = estimation ; rayon
  augmenté de `(haut − bas) × haloIncertitude` (largeur = incertitude). Couleur au choix : statut, domaine,
  origine, unie. Pendant une lignée, les halos prennent la couleur du rôle (ancêtre orange, descendant violet).
  Les agrégats ont une « nébuleuse » plus large et plus douce (confiance moyenne de leurs feuilles).
- **Profondeur de champ (3D, en perspective).** Côté sigma, un réducteur rapetisse et pâlit les lointains
  (couleur mélangée vers le fond, quantifiée au 1/8 pour ne pas saturer le cache de couleurs de sigma).
  Côté halos, le flou suit l'écart à un plan de **mise au point** réglable : halos plus larges, plus doux, plus pâles.
  S'ajoute au brouillard du moteur (opacité).
- **Scintillement « incertain »** : deux sinusoïdes désaccordées par nœud (phase = graine), amplitude
  bornée et réglable, désactivable. Seuls les halos scintillent : le nœud reste lisible.
- **Validation** : liseré de bordure (humain bleu, IA violet) et **couronne perlée** (anneau fin + 4 perles)
  pour IA + humain ; la couronne n'est dessinée qu'au-dessus d'une taille minimale (342 nœuds sont IA + humain :
  sinon c'est trop chargé).
- **Transitions en étincelles** : trajectoire personnalisée (`vue.trajectoirePerso`) en arc spiralé
  (sens et amplitude propres à chaque nœud, léger soulèvement en Z) + **traînée** : historique des positions 3D
  des unités en transition, reprojeté à chaque image (la caméra ne crée pas de fausse traînée), tracé en
  4 tranches d'opacité/épaisseur décroissantes, regroupé par couleur (quelques `stroke` par image).
- **Lignée animée** : au clic, des impulsions (tête lumineuse + queue) coulent des ancêtres les plus lointains
  vers le nœud, puis du nœud vers ses descendants. Le décalage de chaque arête = sa distance (BFS) à la
  sélection ; « espacement des vagues » règle la fréquence ; une onde s'élargit autour de la sélection quand
  une vague l'atteint, et un anneau « respire » autour d'elle. Le reste s'éteint (halos × `estompeHalos`).
  Les impulsions suivent les représentants affichés (agrégats à granularité faible, clés en mode squelette).
- **Survol** : fiche en verre dépoli (`backdrop-filter`), voisins qui s'allument (halos renforcés + fin anneau
  accent), reste estompé ; en mode squelette, les voisins des nœuds absorbés par la clé survolée s'allument aussi.
- **Tiroir** : le panneau du moteur restylé en tiroir flottant translucide (marges, coins arrondis, glissement
  + fondu), sections repliables : « Constellation » (thème, 2D/3D, bascules des effets, vitesse des impulsions),
  « Lire la lumière » (légende des encodages, vignettes en CSS), puis sélection / filtres / légende / catégories du moteur.

## Squelette par importance

- Score = `poidsDescendants · √(descendants/max) + poidsCentralite · √(degré/max) + bonusRésultats · (résultat, lemme,
  validé, IA+humain, réfuté)`, puis rang (percentile). **Clés** = rang ≥ `seuilImportance` (0,85 → 180 clés).
- Chaque autre nœud se replie vers la clé la plus proche parmi ses **ancêtres** (BFS par niveaux, départage au score),
  sinon parmi ses descendants, sinon la meilleure clé de son sous-thème / thème / domaine.
- Carte « Agrégation » en bas : Catégories | Importance ; en mode importance, le curseur de granularité du moteur est
  remplacé par le curseur de seuil. `[` `]` changent le nombre de clés (×1,6). Double-clic sur une clé : ses nœuds
  jaillissent ; Alt + double-clic : ils rentrent. Option « la lignée sort du squelette ».
- Une seule arête affichée par paire orientée de représentants, épaisseur ∝ √nombre.

## Ce qui a été ajouté hors des points d'extension (dans ce dossier)

- ~~Enveloppe de `granularite.calculerPositions`~~ (itération 1) → remplacée en itération 2 par le crochet
  `apresPositions` du moteur : après le moteur, les feuilles repliées sont tirées vers leur clé. Pendant l'animation du squelette, un écouteur `image` incrémente
  `granularite.version` pour forcer le recalcul des positions à l'image suivante.
- **Boucle rAF propre** dans `lumiere.ts` pour le scintillement, les impulsions et la fin des traînées : elle efface
  et redessine seulement les deux calques canvas (`rendu.preparerCalques()`), sans relancer sigma. Pas de double
  dessin dans une même image (horodatage rAF comparé).
- Feuilles repliées : jamais `hidden` pour sigma (opacité 0,012) car **sigma masque toute arête dont une extrémité
  est cachée** ; les arêtes du squelette partent de feuilles repliées posées sur leur clé.
- En mode squelette, un double-clic déclenche aussi l'action du moteur (ouverture/fermeture de catégorie locale) :
  on l'annule aussitôt avec `reinitialiserLocales()`.
- `[` `]` interceptés en phase de capture sur `window` en mode squelette (sinon le moteur change la granularité).

## Vérifications

- `npx tsc --noEmit -p .` : aucune erreur dans `variantes/v3-constellation/`.
- Navigateur (onglet dédié, fermé ensuite) : page chargée sans erreur console ; fiche de survol en verre ;
  lignée de « Théorème de la limite monotone » (4 ancêtres, 28 descendants, 34 arêtes pulsées) ; pixels des
  impulsions comptés sur le calque dessus à 4 instants ; traînées comptées pendant une transition g 2 → 3
  (1 200 unités actives) puis vues à l'écran pendant une transition lente g 1 → 2 ; squelette : 180 clés
  visibles sur 1 200, 675 arêtes retenues, ouverture locale d'une clé (30 nœuds sortis), `]` → seuil 0,76 (288 clés).
- La fenêtre Chrome était souvent masquée : images calculées à la main (`v3.image(t)`, `camera.mettreAJour`,
  `animateur.mettreAJour`) et mesures faites dans un seul `javascript_tool` (la page était régulièrement rechargée
  par Vite quand d'autres agents modifiaient des fichiers).

### Captures (décrites)

1. Clair, iso, g = 2 : agrégats en nébuleuses pastel (bleu analyse, turquoise apprentissage, gris statistiques),
   libellés nets, arêtes agrégées fines.
2. Clair, dessus, g = 3 : amas de sous-thèmes nimbés de halos verts / ambre ; couronnes discrètes.
3. Survol de « Convergence d'une suite » : fiche verre (statut, validation, type, barre de confiance lumineuse
   0,99 [0,97 – 1], 557 descendants, top 1 %), reste estompé.
4. Sombre + lignée : ancêtres orange, descendants violets sur ciel profond, poussière d'étoiles ; le reste presque éteint.
5. Squelette (dessus) : clés seulement, arêtes clé → clé.

## Limites

- En vue isométrique à g = 3, la scène reste dense ; les halos peuvent former des « nappes » dans les amas :
  baisser `intensité` ou `rayon`, ou passer en squelette.
- Les arêtes du squelette sont nombreuses (une par paire de clés) : pas encore de seuil sur le nombre d'arêtes.
- Changement de clé d'un nœud déjà replié : il glisse de l'ancienne clé vers la nouvelle, mais un nœud qui devient
  clé apparaît simplement en sortant de son ancienne clé (pas d'effet spécial).
- Les traînées reprojettent l'historique avec `camera.projeterPoint` (allocation par point) : acceptable pendant
  une transition, à optimiser si on allonge les traînées.
- Moteur : avertissement `[atlas] correspondance écran ↔ sigma inattendue` au premier chargement quand la
  fenêtre est masquée (dimensions nulles au moment de la vérification) — vient de `rendu.ts`, pas de la variante.

## Idées suivantes

- Seuil d'arêtes du squelette (garder les k plus fortes par clé) et arêtes courbes lumineuses (`@sigma/edge-curve`).
- Halos en WebGL (programme sigma) pour du vrai flou de profondeur sur le nœud lui-même.
- Zoom sémantique : le seuil d'importance suit la distance caméra.
- Mode « exposition longue » : accumuler les traînées pendant une orbite pour révéler la structure 3D.

## Itération 2

Vérifié avec le script Playwright du coordinateur (`node capture.mjs v3-constellation` : 61 images/s en orbite,
aucune erreur) et une copie adaptée `capture-v3.mjs` (dans le scratchpad) pour les états propres à la variante :
squelette, squelette + lignée, sortie du squelette à mi-transition, lignée au niveau feuilles en iso, clair et sombre.
`npx tsc --noEmit -p .` : aucune erreur dans le dossier.

**Moteur** : l'enveloppe de `granularite.calculerPositions` est retirée au profit de l'option `apresPositions`.
La trajectoire du squelette reçoit maintenant `unite`, `parent` et `sens` (−1 quand une feuille rentre dans sa clé).
Le réducteur qui rallume les voisins en mode squelette compense `opaciteContexte` (atténuation unique du moteur).
`etenduesParDefaut: false` : nos traînées de période remplacent la capsule.

1. **Halos plus présents en thème clair.** Sprites à cœur saturé : la teinte est resaturée et légèrement assombrie en HSL
   au centre, puis se fond vers la teinte pastel (réglage `cœur saturé`). Le dégradé est plus long : traîne en
   1/(1 + k r²). Nébuleuses d'agrégats ×1,35, plus nettes. Le flou de profondeur coûte moins d'opacité.
   Défauts : intensité 0,8, rayon 3,6. En iso au niveau sous-thèmes, chaque agrégat a maintenant une vraie lueur colorée.
2. **Plus de nappes.** Deux mécanismes :
   - *Plafond de densité* : les halos s'accumulent dans un tampon hors écran. En `source-over`, l'alpha cumulé sature à 1 au
     lieu de s'additionner. Le tampon est ensuite posé avec l'opacité `plafond de densité` (0,85), en additif pour le
     thème sombre.
   - *Halo plein réservé* : seuls les agrégats, les 20 % de nœuds les plus importants, le survol et ses voisins, la lignée
     et les clés du squelette ont un halo plein. Les autres ont un halo minimal serré (`halo minimal`, 1,8 × nœud).
     La couronne IA + humain ne s'affiche que sur les halos pleins.
3. **Lignée au niveau feuilles.** Le contexte garde ses halos (`halos du contexte`, 0,5) sur l'atténuation unique du moteur.
   Des **noms de territoires** apparaissent dès que les feuilles dominent (g > 2,5 ou squelette ; réglage `auto / toujours /
   jamais`, opacité 0,72) : nom de chaque thème en capitales espacées, au barycentre écran de ses feuilles visibles,
   couleur du domaine, contour couleur de fond, placement glouton sans chevauchement.
4. **Arêtes du squelette.** Réglage `arêtes` :
   - *toutes (regroupées)* : 675 paires ;
   - *les plus fortes par clé* (défaut) : une paire reste si elle compte parmi les k plus fortes de l'une de ses
     extrémités ; avec k = 2, 265 arêtes pour 180 clés ;
   - *clé → clé directes* : seules les arêtes d'origine entre deux clés.
   La carte Agrégation affiche le nombre d'arêtes.
5. **Vues face (1) et droite (3).**
   - En vue de face, chaque agrégat laisse une **traînée lumineuse le long de sa période** : un fil min–max, un chapelet
     de lueurs étirées le long de l'axe, une par semaine, dont l'éclat et l'épaisseur suivent l'effectif, et un trait vif
     q25–q75. Les semaines actives se lisent comme des nœuds plus brillants sur la traînée.
   - En vue de droite, une lueur étirée par couloir de type, de longueur proportionnelle à l'effectif.
   - Données : `vue.etendues` (tranches, types, quantiles), `pointSurAxe` et `poidsAxes` : le rendu apparaît en fondu près
     de la face concernée et suit la granularité. Réglages `traînées de période` et `intensité`.

Captures (décrites) :
- `01-initial` (iso, sous-thèmes) : nébuleuses bleues, turquoise, violettes et grises nettement visibles.
- `03-face` : traînées de période lumineuses.
- `08-granularite-max` : amas sans nappe, avec les noms de territoires.
- `10-lignee` : le contexte pastel reste lisible, avec ses territoires.
- `s3-sortie-squelette` : étincelles courbes avec traînées.
- `s5-sombre-lignee` : ancêtres orange, descendants violets, territoires colorés sur ciel profond.

Limites restantes :
- Dans le squelette, les libellés de sigma et les noms de territoires peuvent se chevaucher (deux systèmes de placement).
- Le tampon des halos coûte un `drawImage` plein écran par image : négligeable ici, 61 images/s mesurées.
- Vue de droite : la lueur par couloir reste dense quand beaucoup d'agrégats sont affichés. On pourrait n'afficher
  que les couloirs des agrégats survolés.
