# R32 · LaTeX · arbre de preuve

Le schéma de R14, composé comme il le serait en LaTeX avec `bussproofs` (déduction naturelle de
Gentzen). Même dérivation du graphe de lecture que R14 (`squelette.ts`, stratégies `r32-squelette`,
`r32-auxiliaires`, `r32-tout`) ; seul le langage visuel change. Jeu par défaut : fontaine de chaîne
(`?jeu=edp` pour le jeu synthétique).

## Choix de l'orientation : arbre vertical classique, dérivations de gauche à droite

J'ai gardé l'arbre **vertical** (prémisses en haut, conclusion en bas) plutôt que de le coucher :

- une inférence couchée n'est plus une règle `bussproofs` (trait vertical, prémisses empilées) : on perd
  ce qui rend la notation lisible d'un coup d'œil pour qui a déjà lu une preuve ;
- les formules sont horizontales : empilées en colonne, elles gaspillent la largeur et le trait vertical
  doit faire la hauteur de toutes les prémisses ;
- sur la fontaine, les arbres ont 2 à 4 étages : la hauteur n'est pas le problème, la largeur si.

La progression gauche → droite de R14 est conservée **à l'échelle des dérivations** : le graphe (un DAG)
est découpé en dérivations numérotées (1), (2)… ordonnées topologiquement (un lemme avant ce qui le
cite, une décision avant les hypothèses qu'elle introduit), puis par profondeur logique. Elles se
suivent de gauche à droite et passent à la ligne au-delà de la largeur de page (réglage, 1 500 px),
lignes centrées comme des formules hors texte. Une seule rangée faisait 4 000 px de large pour une
hauteur de 200 : illisible une fois cadrée ; en lignes, la fontaine tient en ≈ 1 700 × 450 px.

## Composition

- **Règle d'inférence** par unité de lecture : prémisses côte à côte, alignées sur leur ligne de base,
  trait couvrant les conclusions des prémisses et la conclusion, conclusion centrée dessous.
- **Nom de la règle** à droite du trait, en petites capitales, dans cet ordre : nom d'une décision ;
  outil admis cité comme prémisse principale ou technique (axiome, lemme admis : « Bilan q.d.m. »,
  « Équilibre d'une chaîne… ») ; nom de démonstration non générique (« Mesure », « Protocole ») ; nom
  court du nœud si la conclusion est une formule ; sinon abréviation du type (la conclusion affiche
  déjà le nom). Nom court : parenthèse finale retirée, « tête de nom de nom » → sigle (« Bilan de
  quantité de mouvement » → « Bilan q.d.m. »), têtes usuelles abrégées (Théorème → Th.), sinon coupe
  au mot.
- **Exposant / indice** de l'étiquette : confiance (« 0,91 », suivie de « ? » à vérifier, « † » réfuté)
  et validation (H, IA, IA+H). Réglage pour les masquer.
- **Statut par le trait** (comme R14, dans le vocabulaire de `bussproofs`) : plein = validé, tireté =
  à vérifier (`\dashedLine`), double = étapes repliées (`\doubleLine`, « ×n » dans l'étiquette,
  double-clic pour déplier), barré de deux obliques = réfuté, pointillé gris = piste abandonnée.
- **Renvois** : une unité partagée par plusieurs enfants et d'au moins `seuilLemme` règles (2) devient
  une dérivation numérotée, citée ailleurs par une feuille « ⋮ (k) » suivie de sa conclusion. Plus
  petite, elle est recopiée dans chaque arbre (comme un vrai arbre de preuve) ; la position de
  référence du point est sa première occurrence, les copies réagissent au survol et à la lignée.
- **Hypothèses de modélisation déchargées** : chaque choix de modélisation cité par une règle devient
  une feuille [Hₖ]ᵏ au-dessus d'elle ; la liste « Hypothèses de modélisation » (à gauche) les énonce
  (nom en gras, hypothèse en italique, « Introduite par la décision (k) ») ; la racine d'un résultat
  majeur porte à gauche du trait les indices des hypothèses dont elle dépend (graphe complet), comme
  la règle ⇒I porte l'indice des hypothèses qu'elle décharge. Survol ou clic (épingle) sur une
  hypothèse : ce qui en dépend passe en bleu, le reste s'estompe.
- **Décisions** : règle dont la conclusion est l'alternative retenue ; dessous, en italique gris,
  « écarté : … » et « introduit [H₃]³ ». Sur la fontaine, le récit que R14 coupait (observation →
  contradiction → décision → hypothèse → prédiction) se lit : la décision (2) introduit H₃, et les
  dérivations qui utilisent H₃ sont placées après elle.
- **Légende de figure** (« Figure 1 – … ») sous les dérivations, à la place du cartouche : jeu, règles,
  dérivations, lemmes cités, règles recopiées, hypothèses, niveau de lecture.
- Noir sur blanc, Latin Modern (fontes de `latex.css` sur jsDelivr ; petites capitales synthétisées par
  le navigateur, faute de fonte « caps » dans ce paquet), formules KaTeX (police Computer Modern),
  un seul bleu pour survol, sélection, aval de la lignée et hypothèses actives ; l'amont de la lignée
  garde l'encre avec un trait renforcé.

## Extraction des formules (règle générique, `formules.ts`)

1. L'énoncé est découpé en mots. Un mot est mathématique s'il contient une lettre grecque, un indice
   ou exposant Unicode, un opérateur (= ≈ ≤ ≥ < > ≠ ∝ ± − + × · / ∂ ∇ ′ _ ‖ |), une lettre
   mathématique (𝐠, 𝓕, 𝔼…) ou un chiffre, ou s'il est une lettre latine isolée (sauf « a »). Un mot de
   deux lettres ou plus sans rien de cela n'est pas mathématique (« est », « soit », « Pente »).
2. Une ponctuation finale (, ; : .) ferme la suite en cours ; « : » ou « ; » isolés séparent.
3. Une formule est une suite maximale d'au moins trois mots mathématiques dont un mot intérieur est une
   relation (= ≈ ≤ ≥ < > ≠ ∝ ≡). Une parenthèse ouverte et jamais refermée coupe la suite avant elle ;
   un opérateur final orphelin est retiré.
4. Une formule entière entre parenthèses est une remarque incidente : ignorée.
5. Deux formules séparées par au plus deux mots sont composées ensemble, les mots de liaison en romain
   (`T₀ = (1 − α) λ v² \text{ soit } T′₀ = −α λ v²`) ; sinon seule la première compte.
6. Conversion Unicode → LaTeX : grec, indices et exposants groupés, `_ext` → `_{\mathrm{ext}}`, gras
   et calligraphiques, opérateurs, virgule décimale `{,}`, fonctions usuelles (`\sup`, `\max`…).
7. Sans formule, la conclusion affiche le nom du nœud ; dans tout texte (noms, alternatives,
   hypothèses), les mots contenant un caractère mathématique « fort » passent en KaTeX en ligne.

Testée hors navigateur sur les 39 énoncés de la fontaine et les 100 premiers du jeu EDP : les lois
(`h₁/h₂ = α/(1 − α − β)`, `v² = g h₂/(1 − α − β)`, `α v² = g h₁`), les conditions aux extrémités et
les mesures sortent correctement ; l'invariant « T′ − λ g y est constant » n'a pas de relation et
reste en toutes lettres.

## Mise en œuvre

- `arbre.ts` : DAG → dérivations (racines, recopies, renvois, feuilles d'hypothèse, décharges,
  ordre), puis mise en page en coordonnées de page (px) à partir des tailles mesurées.
- `rendu.ts` : feuille HTML (KaTeX + Latin Modern) posée dans la scène sigma et retransformée à chaque
  image (translation + échelle) pour suivre la caméra 2D ; mesure des éléments avant mise en page ;
  cibles de survol (conclusions, étiquettes, renvois, feuilles et entrées d'hypothèses) ; classes
  d'état (lignée, survol, hypothèses actives). Sigma ne dessine plus les unités en 2D.
- La mise en page est refaite quand les polices finissent de charger (les mesures changent).
- 3D (T) : la feuille s'efface, les points et liens de lecture de la vue commune prennent le relais.

## Limites

- **Non vérifié visuellement** (pas de navigateur sur cette machine) : seuls `tsc`, le service Vite
  et, hors navigateur, la construction des arbres, l'extraction des formules et la mise en page
  (avec des tailles fictives) ont été contrôlés. À regarder en priorité : alignement vertical de
  l'étiquette sur le trait, position du « (k) » des renvois, rendu du double trait et du barré,
  netteté du texte transformé pendant un zoom.
- KaTeX et les fontes viennent du CDN : sans réseau, les formules s'affichent en LaTeX brut (repli)
  et le texte en Georgia.
- Les unités (m·s⁻²) restent en italique : la règle ne distingue pas une unité d'une variable.
- Les recopies (unités partagées de moins de `seuilLemme` règles) allongent les arbres ; `seuilLemme`
  = 1 cite tout par renvoi (arbres minimaux, plus de dérivations).
- Pas de repères de lignes, de trame ni de cote de zones : la notation LaTeX n'en a pas ; la
  profondeur logique n'est plus lisible qu'à travers l'ordre et la hauteur des arbres.
- Thème sombre non travaillé.

## Idées

- Exporter la figure en source `bussproofs` (\AxiomC, \UnaryInfC, \RightLabel…) prête à coller.
- Numéroter les hypothèses dans l'ordre de la liste plutôt que de première citation, au choix.
- Replier une dérivation entière en « ⋮ (k) » au clic sur son numéro.
