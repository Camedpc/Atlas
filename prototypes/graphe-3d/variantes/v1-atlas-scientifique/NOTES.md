# V1 · Atlas scientifique

Le graphe mis en page comme une figure de revue (Nature, Science) : fond papier blanc cassé avec un
grain léger, encre presque noire, palette désaturée, typographie Source Serif 4 (titres, noms de
catégories) + Inter (texte), légende de figure vivante « **a** Graphe de recherche Atlas. … ».

## Fichiers

- `main.ts` : réglages Tweakpane de la variante, montage de la vue, transitions à ressort, thème et police.
- `figure.ts` : programmes sigma, réducteurs, calques (territoires, anneaux, libellés, repères).
- `fiche.ts` : fiche de survol « légende de figure » (SVG : échelle de confiance, prémisses, distributions).
- `cote.ts` : panneau latéral à onglets qui pousse le graphe, légende, légende de figure.

## Choix de conception

- **Nœud** : remplissage = statut (vert sauge, ocre, brique). **Bordure = validation** via un programme
  `@sigma/node-border` à trois bordures en pixels (A, B, C) + remplissage : aucune = filet fin gris,
  IA = simple, humain = double (encre, papier, encre), IA + humain = pleine (épaisse). Les bordures ne
  dépassent jamais 60 % du rayon. Style au choix : motif / épaisseur graduée / aucune.
- **Anneau de confiance** (calque du dessous, donc correctement masqué par les nœuds devant) : piste
  très fine (référence 0–1), arc clair et large sur [bas ; haut], arc foncé et fin de midi jusqu'à
  l'estimation, sens horaire. Tracés groupés par (statut, genre, palier d'opacité) : ~40 `stroke()`.
- **Agrégat** : disque teinté (couleur du domaine mélangée au papier), filet de la couleur du domaine,
  couronne segmentée de la composition en statuts (recalculée aux filtres).
- **Noms sur les agrégats** : placement maison sur le calque du dessus. Priorités : survol > sélection
  > voisins du survol > lignée > agrégats (par poids) > nœuds importants à l'écran. Pour chaque
  libellé : dedans si le disque est assez grand, sinon dessous, dessus, droite, gauche ; rejeté s'il
  chevauche un libellé déjà posé (boîtes englobantes). Corps ∝ √(poids) ; domaines en capitales
  espacées (Inter 600), thèmes en romain gras (serif), sous-thèmes en italique. Halo papier.
  Largeurs mesurées mises en cache. Sigma ne dessine aucun libellé (`a.libelle = null`).
- **Arêtes** : `@sigma/edge-curve` (courbure réglable), pointe de flèche prémisse → conclusion pour
  les arêtes feuilles ; arêtes incidentes au survol en encre.
- **Territoires des domaines** : union de disques autour des unités visibles, dessinée dans un canevas
  hors écran (teinte à 6 %) + contour obtenu par `destination-out` (disques r+1,2 moins disques r).
  La marge suit le zoom (sinon, zoomé, chaque nœud avait son propre disque). S'atténue au survol.
- **Transitions** : `granularite.calculerPositions` est remplacée **sur l'instance** (le moteur n'est
  pas modifié) pour connaître le sens par catégorie. Ouverture : k(o) = 1 − e^(−a·o)·cos(b·o)·(1 − o)
  → les enfants jaillissent et dépassent légèrement (≈ 9 % avec a = 5, b = 11). Fermeture :
  k(o) = o^γ → ils se resserrent d'abord ; le réducteur retarde leur fondu (opacité × min(1, 2,2·α)/α)
  et le parent gonfle (taille × 1 + g·sin(π(1 − o))). Faire glisser le curseur fait défiler l'effet.
- **Survol** : estompage plus franc que le défaut (réglable), seuls les libellés du nœud, de ses
  voisins et les noms d'agrégats (en retrait) restent. Fiche : surtitre en petites capitales avec le
  glyphe de validation, titre serif, chemin en italique, statut, **échelle graduée 0–1** (graduations
  0,05 / 0,25, intervalle ombré à moustaches, losange de l'estimation), **mini-diagramme des
  prémisses** (jusqu'à 5, triées par importance, courbes convergentes vers le nœud, flèche vers le
  nombre de descendants). Agrégat : n, période, barre de composition, histogramme de la confiance
  (10 classes, moyenne pointillée), 3 nœuds principaux.
- **Panneau gauche qui pousse** : colonne `<aside>` hors de la vue ; à l'ouverture sa largeur passe de
  0 à 344 px, `#app` rétrécit, le `ResizeObserver` du moteur redimensionne la scène et la caméra garde
  sa cible au centre : le graphe se recentre. Le `PanneauGauche` du moteur y est monté tel quel
  (`ui.panneau: false` puis `new PanneauGauche(...)`) ; ses sections deviennent des onglets
  Filtres / Catégories / Sélection / Légende (CSS sur `data-onglet`). Un clic sur un nœud bascule sur
  « Sélection » (ou pose une pastille sur l'onglet si le panneau est fermé). État mémorisé (try/catch).
- **Légende** propre : glyphes SVG (statuts, 4 bordures, anneau annoté, agrégat à couronne, flèche,
  lignée, domaines, raccourcis).
- **Thème sombre** : ardoise #16171a, mêmes teintes éclaircies. Les variables sont posées sur `body`
  (colonne, bouton) et sur `.atlas-vue.v1` (spécificité > feuille du moteur, injectée après la nôtre).

## Réglages Tweakpane (dossiers « Figure · … »)

Nœuds : anneau oui/non, épaisseur, écart, rayon min., opacité de l'intervalle, style et épaisseur de
bordure, estompage au survol. Arêtes : courbure, pointes. Transitions : jaillir/fondre, raideur,
amortissement, resserrement, gonflement du parent (+ durée/courbe du moteur). Libellés : noms sur
agrégats, taille, corps ∝ poids, nombre max. de libellés de nœuds, halo. Fond : police (Source Serif +
Inter / Inter / IBM Plex), territoires (marge, teinte, contour), grain du papier, repères d'axes,
légende de figure. Les réglages du moteur restent disponibles.

## Vérifié

- `npx tsc --noEmit -p .` : aucune erreur dans ce dossier.
- Chrome (fenêtre masquée : boucle avancée à la main via `atlasVue.image(t)` puis calques composés
  dans une `<img>` posée sur la scène avant capture) : g = 1 (thèmes nommés sur/sous les disques, sans
  chevauchement), g = 2 en sombre avec panneau ouvert (graphe recentré dans 885 px), g = 3 zoomé
  (anneaux, bordures, libellés de nœuds), survol d'un lemme (fiche complète, voisins, reste estompé),
  ouverture locale d'un thème à 45 % (enfants sortant du parent qui s'efface), vue de face avec
  lignée. Aucune erreur console.

## Captures décrites

1. *Vue d'ensemble, g = 1* : 14 thèmes en disques pâles bleu ardoise / prune / sarcelle / terre,
   couronnes vert-ocre-brique, territoires de domaine cernés d'un filet, noms en serif gras sous les
   disques, fines arêtes grises courbes.
2. *Survol* : le lemme passe au premier plan cerclé d'encre, ses voisins et leurs noms restent nets,
   le reste passe à 12 % ; la fiche montre « LEMME · IA », le titre en serif, « Validé — validé par :
   ia + humain », l'échelle 0–1 avec l'intervalle [0,83 ; 0,91] et le losange à 0,9.
3. *Zoom g = 3* : grappes de points colorés par statut, chacun entouré de son arc de confiance ;
   les doubles bordures (humain) et pleines (IA + humain) se distinguent à ce niveau.

## Limites

- Performances : dans l'environnement de test (fenêtre masquée, 6 variantes ouvertes en parallèle)
  une image complète à g = 3 coûtait ~35–45 ms, surtout dans `sigma.refresh` (moteur) ; les calques
  de la variante ajoutent ~10 ms (territoires surtout : décocher « territoires » si besoin).
- Les bordures en pixels deviennent illisibles sous ~3 px de rayon (plafonnées à 60 % du rayon).
- Le placement de libellés est glouton image par image : pendant une animation, un libellé peut
  changer de côté (pas d'hystérésis).
- Le sens des transitions est déduit de la variation d'ouverture ; en glissant le curseur en
  va-et-vient rapide, le ressort peut basculer de régime au milieu.
- La vue de face / droite réutilise les dispositions du moteur ; les repères d'axes sont ceux de v0,
  restylés (italique, axe temporel continu).

## Moteur : remarques

- Pas de bug bloquant rencontré. Deux points d'extension manqueraient pour éviter les contournements :
  un crochet officiel sur `calculerPositions` recevant l'index de la catégorie et le sens de la
  transition (ici : remplacement sur l'instance), et une option pour monter le `PanneauGauche` dans un
  conteneur externe sans la classe `panneau-ouvert` (ici : construit à la main puis classe retirée).
- `definirTheme` relit la palette : utile pour forcer la relecture après ajout de variables CSS.
- Vite recharge souvent la page quand d'autres agents modifient des fichiers : pour tester, tout faire
  dans un seul appel `javascript_tool` puis capturer aussitôt.

## Idées suivantes

- Hystérésis du placement de libellés et lignes de rappel (leader lines) pour les petits agrégats.
- Anneau d'agrégat double : couronne des statuts + arc de la confiance moyenne à l'intérieur.
- Export SVG/PDF de la vue courante « prêt pour la revue » avec la légende de figure.
- Barre d'échelle temporelle en vue de face et panneaux b/c (mini-vues des autres faces) en vignettes.

## Itération 2

Moteur mis à jour ; captures réelles avec Playwright (requestAnimationFrame actif, 1600 × 1000) :
`scratchpad/shots/capture.mjs` et ma copie `capture-v1.mjs`, qui ajoute survol d'agrégat, faces à
g = 1 et g = 2, trois images d'une transition, g = 3 zoomé, panneau ouvert et mesure de la zone sûre.
Aucune erreur console. Environ 50 à 60 images/s en orbite.

### Contournements retirés (API officielles)

- **Transitions** : le remplacement de `granularite.calculerPositions` sur l'instance disparaît.
  L'option `trajectoire` reçoit maintenant `p.o` (ouverture brute du parent) et `p.sens` : ressort à
  l'ouverture, o^γ à la fermeture. Le réducteur lit `granularite.sens` pour retarder le fondu et
  faire gonfler le parent.
- **Panneau** : `ui: { panneauMode: 'externe', conteneurPanneau }` monte le panneau du moteur dans
  ma colonne `<aside>`, qui pousse `#app`. Je ne construis plus `PanneauGauche` à la main et ne
  retire plus de classe. À la fin de la transition de largeur, `cadrerTout()` recadre dans la zone
  sûre.
- `etenduesParDefaut: false`, remplacé par mon propre rendu (voir plus bas).

### Retours traités

1. **Vue de face, façon forest plot.** Le crochet `apresPositions` donne une **rangée** à chaque
   agrégat visible près des faces temps et type.
   - Ordre : arbre domaine → thème → sous-thème, frères triés par date médiane.
   - Hauteur de rangée ∝ alpha : la mise en page reste continue pendant les transitions. Les feuilles
     encore dans leur sous-thème suivent son décalage.
   - Barre d'intervalle façon barre d'erreur : moustaches min–max en pointillé, trait q10–q90 à
     embouts, barre q25–q75 teintée, et le disque (placement du moteur à la médiane) borné au pas de
     rangée.
   - Noms alignés à gauche des moustaches, comme les étiquettes de lignes d'un forest plot. Seuls
     les N plus gros sont nommés (réglage « noms de rangées (max) », 24) ; les autres au survol.
   - Vue de droite : même mise en rangées, un point par couloir (aire ∝ effectif) et le nom à gauche
     du premier couloir occupé.
   - Les territoires s'effacent dans ces vues.
2. **Feuilles à g = 3.** Sous le réglage « rayon min. du détail » (6,5 px), une feuille n'est qu'un
   point de couleur de statut, avec un fin liseré papier : ni anneau, ni motif de bordure. Le détail
   revient au survol (nœud et voisins), sur la lignée, et quand le zoom l'agrandit. La taille des
   feuilles suit le zoom avec un exposant réglable (0,55).
3. **Cadrage.** La zone sûre du moteur fonctionne avec la colonne qui pousse. Mesure avec le
   panneau ouvert : marge basse 104 px, bas du contenu à 825 px pour 896 px utiles. Plus rien sous
   l'histogramme.
4. **Fiche.** Vérifiée en capture sur une feuille à g = 3 (échelle 0–1, prémisses) et sur un
   agrégat à g = 1 et g = 2 (composition, distribution, principaux). Elle est lisible à
   1600 × 1000 et reste dans l'écran.
5. **Hystérésis des libellés.**
   - Visibilité : un libellé affiché à l'image précédente reçoit un bonus de priorité (× 1,6 par
     défaut, réglable) et apparaît en fondu. Le moteur est relancé tant qu'un fondu est en cours ;
     avant ce correctif, un libellé pouvait rester figé à moitié transparent quand la boucle
     s'arrêtait.
   - Côté : pendant un mouvement, l'emplacement précédent est essayé en premier. Au repos, et à
     chaque changement de mode (carte / temps / type), on revient à l'ordre canonique.

### Autres

- La légende de figure reçoit un fond papier translucide (des nœuds passaient dessous au zoom).
- Nouveaux réglages : rangées, noms de rangées (max), rayon min. du détail, taille ∝ zoom,
  hystérésis.

### Captures regardées (`out/v1-atlas-scientifique-it2/`, `out/v1-atlas-scientifique/`)

- `03-face-g1` : 14 rangées nettes, noms à gauche, barres d'erreur, disques à la médiane, plus
  aucun empilement.
- `04-face-g2` : 36 rangées de ~17 px, 24 noms.
- `05-droite-g2` : matrice de points par couloir.
- `06-transition-*` : enfants qui sortent, noms stables.
- `07-g3` : points de statut, seuls les nœuds importants en détail.
- `08-survol-feuille` et `02-survol-agregat`, plus `09-survol` du script commun : fiches complètes.
- `10-g3-zoom` : anneaux et doubles bordures lisibles.
- `11-panneau-ouvert` : graphe recentré, rien sous l'histogramme.
- `12-sombre-face`.

### Limites restantes

- En vue de droite, le disque d'un agrégat reste à sa médiane de couloir et chevauche parfois un
  point de couloir.
- Les libellés de feuilles n'évitent que les autres libellés, pas les disques : sur une grappe dense
  à g = 3, un nom peut passer sur des points (le halo papier le garde lisible).
