# R3 · Arbre des décisions et de la modélisation

Les décisions et les choix de modélisation structurent la lecture : on voit d'abord **quels choix
ont été faits** (bande haute), puis **ce qu'ils ont permis** (bande basse), de gauche à droite.

## Chiffres (jeu synthétique, 1600 × 1000)

| | Graphe complet | Référence R0 | R3 à l'ouverture |
|---|---|---|---|
| Éléments visibles | 224 nœuds | 160 | **36** : 14 décisions et choix, 10 nœuds clés, 12 blocs |
| Arêtes | 618 | 233 | **49** flux |

- Libellés à 12 px, sans chevauchement (échelle d'affichage ≈ 1 à 1600 × 1000, ≈ 0,8 à 1280 × 800).
- Aucune erreur ni aucun avertissement dans la console. Débit : environ 45 images/s en déplacement 2D et en orbite 3D.

## Ce qu'on voit

- **Colonne vertébrale** (bande haute) : les 6 choix de modélisation (hexagones) et les 8 décisions
  (losanges), rangés dans l'ordre logique. Chacun porte une étiquette de genre.
  - **Bifurcation** : sous le glyphe, les alternatives écartées apparaissent pâles, avec ✗ et leur raison en une ligne. Pour un choix de modélisation, il n'y a pas de raison ; les autres modélisations tiennent sur une ligne.
  - La branche retenue est le flux plein qui part du glyphe.
- **Blocs « ce que ce choix a permis »** (bande basse) : une carte par groupe de résultats. Elle montre :
  - le nombre de résultats et la part validée ;
  - le résultat vedette (★) ;
  - la répartition des statuts, en bas de la carte ;
  - le statut dominant, sur le bord gauche.
  La hauteur de la carte est proportionnelle au nombre de résultats. Le flux d'ancrage (choix → bloc) a une épaisseur proportionnelle, dans l'esprit d'un Sankey sobre. Les flux sont empilés le long des bords des cartes.
- **Nœuds clés** restés individuels :
  - théorèmes et résultats ;
  - énoncés réfutés ;
  - extrémités d'une contradiction ;
  - motif d'une décision corrective (diagnostic) ;
  - impasse de la piste abandonnée.
- **Contradiction résolue**, racontée par des pastilles numérotées ① à ⑤ et deux arcs, « contredit » (tirets rouges) et « résout » (vert) :
  - ① la conjecture est barrée et marquée réfutée ;
  - ② la mesure « Pente 0,26 » la contredit ;
  - ③ le diagnostic ;
  - ④ la décision « Ajouter la correction d'Itô » ;
  - ⑤ le résultat confirmé « Ordre 1/2 observé ».
- **Piste abandonnée** : une carte hachurée, en pointillés, mène à l'impasse (⊣ « Bilan : aucune vitesse »), qui motive la décision d'abandon.

## Interactions

- **Survol d'un choix ou d'une décision** : sa portée (tout ce qui en dépend dans le graphe complet) reste nette et le reste s'estompe. Les flux concernés passent en accent et chaque carte indique « k / n en dépendent ».
- **Clic sur un choix ou une décision** : mode **« et si ? »**. Il montre ce qui tomberait si l'on retirait ce choix. Un nœud tombe quand chacune de ses démonstrations cite une prémisse tombée ; un énoncé admis construit sur le choix tombe aussi.
  - Les nœuds suspendus reçoivent un anneau pointillé rouge et l'étiquette « suspendu » ; les cartes, des hachures « k / n suspendus ».
  - Un bandeau donne le total. Il indique aussi combien de dépendants tiennent grâce à une autre démonstration : pour « Bruit au sens de Stratonovich », 90 nœuds sont suspendus.
  - Échap quitte ce mode.
- **Clic sur un bloc** : il se déplie. Ses membres sont disposés à part (dagre compact) dans un cadre à la place du bloc, et la caméra les cadre. La pastille « replier » en tête du cadre le replie.
- **Clic sur un autre nœud** : lignée dans le graphe de lecture, comme dans la référence.
- **Fiches** :
  - pivot : fiche par défaut, avec portée et chiffres du « et si ? » ;
  - bloc : contenu par type, statuts, confiance moyenne et étendue, cinq principaux résultats ;
  - nœud de l'histoire : son étape.
- **Panneau ☰ → Journal des décisions** : entrées datées, genre, auteur, badge Humain / IA, question, raison, alternative retenue et nombre d'alternatives écartées. Cliquer une entrée centre la décision (dans la zone libre à droite du panneau) avec un anneau de repérage. La section « Lire l'arbre des décisions » sert de légende.
- **3D (T)** : vue de côté, profondeur = type (les couches de la vue partagée). Les cartes restent sur leur couche. Les embranchements et le texte intérieur des cartes sont masqués pour alléger.
- **Tweakpane → « Vision R3 »** :
  - alternatives, raisons, histoire, motifs ;
  - tailles des textes, des glyphes et des libellés ;
  - hauteur par résultat, hauteur minimale et largeur des blocs ;
  - épaisseur et opacité des flux ;
  - estompage hors portée.
  Les écarts de rangs et de nœuds de la vue partagée restent actifs.

## Choix de modélisation (code)

- `modele.ts` : stratégie `r3-decisions` (`enregistrerStrategie`), générique sur les données de l'API.
  - **Pivots** : types `decision` et `choix_modelisation`, ordonnés par tri topologique, départagé par la date.
  - **Contexte** : définitions, axiomes et admis. Rattaché, visible avec les liens complets.
  - **Blocs** : chaque autre nœud rejoint le bloc de sa dernière « ancre » (pivot ou nœud clé) au sens de l'ordre topologique. Cela exclut tout cycle entre blocs, avec une vérification de Tarjan en plus.
  - Les blocs de moins de 3 nœuds rejoignent le bloc qui les suit.
  - Arêtes : un pivot garde toutes ses sorties, car un choix agit souvent comme contexte. Ailleurs, seuls les rôles principal et auxiliaire comptent, puis vient la réduction transitive. Un bloc est toujours relié à son ancre : quand le lien passe par une définition, l'arête a un résumé vide et l'invariant de correspondance est respecté.
- `disposition.ts` : dagre donne les rangs et l'ordre, puis mon placement :
  - colonnes espacées pour remplir l'écran, avec l'écart choisi parmi 9 essais pour maximiser l'échelle ;
  - bande des pivots en haut, résultats au barycentre de leurs prédécesseurs ;
  - boîtes mesurées (libellé, embranchements, titre de carte) qui ne se chevauchent jamais ;
  - disposition imbriquée pour un bloc déplié.
  Branchée en remplaçant `redisposer` et `cadrer` de l'instance. Le cadrage 2D porte sur l'emprise des boîtes, pas seulement sur les centres.
- `dessin.ts` : sigma ne dessine que les glyphes. Les calques canvas dessinent les flux, les cartes, les libellés, les embranchements, l'histoire, le « et si ? » et les cadres dépliés. Ils partent des positions projetées, donc fonctionnent aussi en 3D.
- `textes.ts` : les mêmes polices et les mêmes coupures servent à la mesure (disposition) et au dessin.
- Les autres stratégies (sélecteur du compteur) retrouvent le rendu par défaut.

## Limites

- Déplier le gros bloc « Stabilité du schéma » (49 nœuds) donne un cadre dense. Il reste lisible, mais la vue globale se réduit ; « Cadrer » revient à l'ensemble.
- Plusieurs cartes portent le même titre de sous-problème (« Convergence forte » ×4). C'est exact, car le sous-problème traverse plusieurs choix ; la vedette ★ et le flux d'ancrage les distinguent.
- Les flux qui descendent de la bande des décisions vers leurs blocs sont longs et se croisent un peu à gauche, où 9 choix se concentrent.
- En 3D, les libellés des pivots de la même couche se superposent en vue de côté.
- Le « et si ? » suppose que toute prémisse citée est nécessaire à sa démonstration.

## Idées

- Proposer « et si ? » sur plusieurs choix à la fois, et comparer deux modélisations (bruit Itô / Stratonovich).
- Afficher les dates en abscisse secondaire (frise du journal alignée sous la colonne vertébrale).
- Déplier un bloc en « sous-arbre de décisions » quand il contient lui-même des choix locaux.
