# R14 · Schéma technique

Le squelette déductif de R1 (même dérivation, même structure en colonnes) dessiné comme un schéma
d'ingénieur (schéma-bloc, Simulink, plan) : précis, froid, lisible. Point de départ : R1 était
jugée très claire mais « trop scolaire » ; R14 garde la structure et change le langage visuel.

## Choix

- **Dérivation inchangée** (`squelette.ts`, copie de R1, stratégies renommées `r14-squelette`,
  `r14-auxiliaires`, `r14-tout`) : contexte en bornes, élagage vers les résultats majeurs, réduction
  transitive, repli des sous-arguments exclusifs.
- **Feuille de plan** (`rendu.ts`, calque dessous) : trame fine (20 / 100 px de mise en page, masquée
  quand trop serrée), cadre double (extérieur fort, intérieur fin), repères de lignes A B C… dans la
  bande gauche (tous les 160 px), **règle graduée des rangs logiques** en haut (`SPEC.`, `R0`, `R1`…,
  graduations au quart de rang), cotes de zones `├ OUTILS ┤` sous la règle, limites de zones en
  pointillé fin sur toute la hauteur. Plus de bandes de fond alternées.
- **Cartouche** (HTML, bas droit, à gauche des réglages) : titre du jeu, éléments visibles / nœuds,
  liaisons / arêtes, blocs B · D · H, niveau, révision (lettre incrémentée à chaque recalcul de la mise
  en page), échelle (mise à jour au zoom), date, source.
- **Blocs** à angles vifs : en-tête de 16 px séparé par un filet (repère `B7` en chasse fixe grasse,
  type en petites capitales, validation `H` / `IA` / `IA+H` à droite) ; titre en sans-serif ; en pied,
  **jauge de confiance graduée** 0–1 (barre = intervalle, index = estimation, valeur « 0,82 »).
  Résultats : bandeau d'en-tête plein (encre, texte blanc) et contour plus épais. Sous-système (étape
  repliée) : second contour décalé, étiquette `SOUS-SYST. × n`.
- **Statut par le code de trait**, jamais par la couleur : continu = validé, tireté = à vérifier,
  continu + diagonale = réfuté ; pointillé gris = piste abandonnée.
- **Ports et liaisons** (`mise-en-page.ts`) : une liaison entrante = un port, répartis sur le flanc
  gauche dans l'ordre des ordonnées d'arrivée (pas de croisement à l'entrée), chacun avec sa propre
  piste verticale ; sortie = carré plein au milieu du flanc droit. Liaisons orthogonales à angles vifs,
  trait fin (≈ 1 px), pointe fine. **Jonctions en point plein** là où une sortie se divise (calculées :
  toute bifurcation d'un tronçon commun qui n'est pas la dernière).
- **Repères de schéma** B (blocs), D (décisions), H (hypothèses), numérotés de gauche à droite puis de
  haut en bas. Les renvois de R1 « (k) » deviennent des **connecteurs pentagonaux** portant le repère
  du bloc cité (le bloc cité passe en bleu au survol du connecteur).
- **Choix de modélisation** → blocs de **spécification** dans la marge (coin replié) : `H1 ·
  MODÉLISATION · →14`, nom, puis l'hypothèse écrite comme une spécification (`Hyp. : Le domaine est le
  tore…`, chasse fixe). Au survol ou à l'épingle (clic, ou cases du panneau), les blocs dépendants
  portent `⊢ H1 H3` en bleu au-dessus de leur coin et leur contour passe en bleu (motif de statut
  conservé) ; le reste s'atténue. Remplace les bandes de couleur de R1 (une seule teinte suffit, les
  repères distinguent les hypothèses).
- **Décisions** : losange à trait fin avec son repère `D2` au centre ; l'alternative rejetée devient
  une **sortie non connectée** (× au bout d'un court trait) avec `NC : <alternative>` en gris.
- **Couleurs** : noir, gris, un seul bleu (accent) pour le survol, la sélection, l'aval de la lignée
  et les hypothèses actives ; l'amont de la lignée est en encre renforcée. Palette de la vue redéfinie
  en gris (couches, statuts, validations, rôles) pour que la fiche, le compteur et les liens complets
  (L) restent dans le même registre. Angles vifs aussi sur la fiche, la barre et les boutons.
- Panneau ☰ : niveaux, **nomenclature** (tableau éléments / liaisons / blocs / décisions / hypothèses /
  bornes / jonctions), hypothèses à épingler, légende du code de trait.

## Limites

- Non vérifié visuellement (pas de navigateur sur cette machine) : seuls `tsc` et la transformation
  Vite ont été contrôlés. À regarder en priorité : chevauchements de la règle avec la barre du haut,
  lisibilité de la jauge à ≈ 0,8 d'échelle, densité des pistes dans les canaux (44 px par défaut).
- Les ports décalés du centre introduisent un petit décrochement sur des chaînes qui étaient
  parfaitement horizontales dans R1 (dès qu'un bloc a deux entrées).
- Le cartouche est fixé à l'écran (pas sur la feuille) : il peut recouvrir un bloc en bas à droite
  si on déplace la vue ; on peut le masquer (réglage « cartouche »). Il disparaît sous 900 px.
- Le tireté « à vérifier » et le trait-point des sous-systèmes ouverts sont proches à petite échelle.
- En 3D, la feuille (trame, cadre, règle) s'efface ; les blocs restent projetés à plat.
- Mêmes limites de dérivation que R1 (heuristique « objet central », renvois qui cachent des flèches).

## Idées

- Cartouche dessiné sur la feuille (coin bas droit du cadre) avec cadrage qui l'inclut.
- Numéroter les liaisons (`L12 : B3.2 → B7.1`, port de sortie / d'entrée) et les lister dans une
  nomenclature exportable.
- Repères de grille cliquables (« aller en C4 ») et coordonnées du curseur dans le cartouche.
- Hachures pour les zones de piste abandonnée, comme une partie supprimée sur un plan.

## Second jeu : fontaine de chaîne (`?jeu=fontaine`)

`jeu-fontaine.ts` : raisonnement de mécanique sur l'effet Mould (modèle de Biggins & Warner, 2014), 39 énoncés,
5 sous-problèmes dont une piste abandonnée (« l'élan suffit », contredite par l'observation). Mesures illustratives.
Aucune ligne de la dérivation, de la mise en page ni du rendu n'a changé : 39 nœuds → 20 blocs, 20 liaisons.

Ce que l'essai montre sur la généralisation :
- **Tient** : la dérivation ne lit que les types, les rôles des prémisses, `admis` et `piste` ; aucun identifiant
  du jeu synthétique n'est codé en dur. Chaîne invariant → vitesse / hauteur → loi → résultats lisible d'emblée.
- **Casse** : un choix de modélisation issu d'une décision (« Force de prise anormale », conséquence de
  « Origine de la fontaine ») part dans la marge sans liaison : le cœur du récit physique (observation →
  contradiction → décision → hypothèse → prédiction) est coupé. Une décision dont la seule prémisse est un choix
  (« Estimer α ») se retrouve isolée en marge. Les énoncés (équations) ne sont visibles qu'au survol.
- **Dépend des données** : sans rôles annotés ni types, l'adaptateur `depuisApiAtlas` devine le type d'après
  le préfixe de l'identifiant et le rôle d'après le type de la prémisse. En production, il faut que les agents
  écrivent le type du nœud, le rôle de chaque prémisse, et les décisions / choix structurés.
