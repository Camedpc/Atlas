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

- **Enveloppe de `granularite.calculerPositions`** (instance, pas le code du moteur) : après le moteur, les feuilles
  repliées sont tirées vers leur clé. Pendant l'animation du squelette, un écouteur `image` incrémente
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
