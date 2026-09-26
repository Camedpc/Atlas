# R12 · Console d'instrument

Le squelette déductif de R1 (même dérivation, même mise en page gauche → droite), avec le langage
visuel d'un outil de laboratoire : logiciel d'acquisition, outil de conception de circuits,
profileur. R1 était clair mais trop scolaire. Ici, pas de cartes arrondies ni de pastilles colorées :
des blocs à champs, des valeurs chiffrées et une grille.

## Choix

- **Fondations reprises de R1 sans changement de logique** : `squelette.ts` (stratégies renommées
  `r12-squelette`, `r12-auxiliaires`, `r12-tout`), `mise-en-page.ts` (colonnes, rangées, barycentres,
  régression isotone, renvois, routes orthogonales).
- **Repères de composant** : chaque unité reçoit un repère `CODE-nn` (THM, LEM, PRP, DEF, HYP, DEC,
  CHX, EXP, CAL, OBS, RES, CNJ, ASR, AXM ; ETP pour une étape repliée), numéroté dans l'ordre de
  lecture (marge, puis rangs de gauche à droite, puis de haut en bas), comme les repères d'un schéma.
  Les nœuds hors lecture (membres d'étapes, contexte) sont numérotés à la suite : l'inspecteur et la
  fiche peuvent toujours les nommer.
- **Bloc à champs** (hauteur multiple du pas de grille de 4 px, ordonnées calées sur la grille) :
  - en-tête : repère, `×n` pour une étape, puis à droite statut (carré plein + `VAL` / `INC` / `RÉF`)
    et validation (`IA`, `H`, `IA+H`, `—`), séparés par des filets ; les résultats majeurs ont un
    en-tête en inversé (fond foncé), c'est leur seule mise en avant ;
  - énoncé en sans-empattement (Inter), 3 lignes au plus ;
  - pied en chasse fixe (JetBrains Mono) : `0.82 [.74,.90]`, barre d'erreur sur l'axe [0, 1]
    (graduations 0 / 0,5 / 1, moustaches bas–haut, carré = estimation), puis `←2 →3 D4` (prémisses et
    dépendants dans la lecture, profondeur logique).
- **Renvois** : les prémisses lointaines ne sont plus des « (k) » mais des étiquettes de réseau
  `◁ LEM-03` sous le bloc qui les cite. Le repère est déjà dans l'en-tête du bloc cité, l'onglet
  numéroté de R1 a donc disparu.
- **Contexte** : cellules carrées à trait fin, lettre en chasse fixe (H D O A L +), sans couleur ;
  survol = cellule en accent, et les blocs qui utilisent ce contexte restent nets.
- **Décisions** : losange à trait fin avec un carré de statut au centre ; au-dessus, `DEC-02 · VAL · H`
  puis le titre ; l'alternative rejetée est un cadre pointillé `REJ …`.
- **Choix de modélisation** : drapeaux à queue d'aronde, angles vifs, en-tête `CHX-01 portée 14`.
  La bande colorée à gauche des cartes de R1 est supprimée : les blocs de la portée d'un choix actif
  (survolé ou épinglé) portent son repère en couleur au-dessus d'eux, et le reste s'atténue.
- **Fond** : grille d'alignement (pas fin 16 px, traits majeurs tous les 64 px, masquée quand elle
  devient trop serrée), règle de profondeur `D0 … Dn` en haut, zones `ENTRÉES · CHOIX`, `OUTILS`,
  `ÉTAPES`, `RÉSULTATS` séparées par des traits pointillés verticaux (plus de bandes alternées).
- **Arêtes** : orthogonales à angles vifs (rayon 0 par défaut, réglable), 1,1 px, calées au pixel,
  petite flèche pleine, broche carrée à la sortie du bloc source.
- **Inspecteur** (droite, 312 px, touche `I` ou `×` pour le masquer) : sélection, sinon survol.
  Tableau propriété-valeur : repère, type, unité, statut, validation, confiance, largeur d'IC, barre
  d'erreur graduée, profondeur `D4 / D10`, prémisses et dépendants de lecture (repères cliquables),
  renvois, prémisses complètes, dépendants transitifs, contexte par rôle, choix amont, origine, date,
  sous-problème, piste, identifiant. Puis des grilles : démonstrations (nom, validité, nombre de
  prémisses), décision (RET / REJ + raison), choix (hypothèse, portée déclarée et calculée), membres
  d'une étape (repère, nom, statut), liens sémantiques.
- **Barre d'état** (bas, pleine largeur) : niveau (Squelette / + auxiliaires / Tout), `NŒUDS 39/224`,
  `ARÊTES`, `ETP`, `DEC`, `CHX`, `PROF. MAX`, `RÉSULTATS`, `CONF. MOY.` des résultats établis avec
  bornes moyennes, `MIN` (résultat le plus faible), répartition des statuts, mode, repère sélectionné
  ou survolé. Elle remplace le compteur des fondations (`ui.compteur = false`) ; la stratégie reste
  réglable dans le panneau ☰.
- **Fiche de survol** réduite à une ligne de mesures (`LEM-03 · LEMME · VAL · IA · c 0.82`), le nom et
  l'action possible : l'inspecteur porte le détail.
- **Palette** : couleurs fonctionnelles désaturées (validé vert-gris, incertain ocre, réfuté brique),
  accent bleu acier, aucune ombre, angles vifs partout (barre, boutons, fiche). Thème sombre fourni.
  Tweakpane, dossier **Console R12** : largeur de bloc, écarts, taille de l'énoncé, cellules max.,
  arêtes, rayon, portée des choix, alternatives rejetées, règle et zones, grille.

## Limites

- **Pas vérifié visuellement** : la machine manquait de mémoire, donc pas de navigateur ni de
  Playwright. Seuls `tsc` et la transformation Vite ont été vérifiés. Il reste à regarder les champs
  qui pourraient déborder dans un bloc de 184 px (en-tête d'une étape abandonnée, pied avec de grands
  compteurs) et la densité de la grille aux différents zooms.
- Les polices sont chargées depuis Google Fonts ; tant qu'elles n'ont pas fini de charger, les
  énoncés sont mesurés avec la police de secours, puis remesurés quand `document.fonts.ready` se
  résout (un seul recalcul, sans animation).
- Les blocs sont plus larges que les cartes de R1 (184 px contre 122 px) : au niveau « Tout »,
  il faut zoomer, et avec l'inspecteur ouvert l'espace horizontal est plus réduit.
- Les repères changent quand on change de niveau ou qu'on déplie une étape (ils suivent l'ordre de
  lecture). Des repères stables d'une vue à l'autre demanderaient une numérotation stockée en base.
- La confiance moyenne des résultats est une simple moyenne des estimations, pas une propagation le
  long des démonstrations.
- En 3D, les blocs restent projetés à plat ; la grille et les séparateurs de zones s'effacent.

## Idées

- Colonnes triables dans une vue tableau synchronisée avec le graphe (comme la liste des nets d'un
  outil de conception de circuits).
- Mesure de propagation : confiance minimale le long du chemin critique vers chaque résultat, affichée
  dans la barre d'état et l'inspecteur.
- Curseurs de mesure : sélectionner deux blocs et afficher distance logique, chemins, prémisses
  communes.
