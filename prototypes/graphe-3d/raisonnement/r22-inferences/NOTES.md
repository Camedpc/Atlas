# R22 · Énoncés et inférences

Direction **D2** de `RECHERCHE-REPRESENTATION.md` : un graphe **biparti** où chaque démonstration
est un objet dessiné (une barre d'inférence à la Gentzen) entre ses prémisses et sa conclusion, sur
une mise en page en couches de gauche à droite, avec des couloirs par sous-problème.

Question à laquelle la vue répond : *quelle inférence est faible, et sur quoi repose-t-elle ?*

## Ce qu'on voit

- **Énoncés** (boîtes de 184 px) : type en petites capitales et code en mono en tête, titre sur au plus
  trois lignes, pied avec sigle de validation (H, IA, IA+H), glyphe de statut s'il n'est pas validé,
  marques de contrôle (✓ Lean, ✓ symbolique) ou sparkline.
  - Forme = famille : rectangle droit (déductif), coins arrondis (définition centrale), bords très
    arrondis (observation, entité PROV), en-tête gris (expérience ou calcul, activité PROV, avec l'agent),
    double filet (résultat), losange étiré (décision).
  - **Contour = statut** (encre validé, ocre incertain, brique réfuté ; tirets si aucune démonstration
    valide), **remplissage = validation** (blanc, puis gris 5 / 10 / 15 %) : deux canaux séparés.
- **Inférences** (une barre de 24 px par démonstration, posée 58 px devant la conclusion) :
  épaisseur ∝ confiance (1 à 4 px), glyphe ✓ ? ✕ de la validité, valeur chiffrée dessous, nom de la
  démonstration dessus ; le trait sortant vers la conclusion passe en tirets quand l'intervalle de
  confiance est large (> 0,15 tirets longs, > 0,30 tirets courts). Plusieurs démonstrations = barres
  empilées, la principale en encre, les autres en gris avec leurs prémisses en tirets.
- **Prémisses** : principale = trait plein encre, auxiliaire = trait gris fin. Technique et contexte ne
  sont jamais des traits : **étiquette latérale** sous la barre, groupée par rôle
  (« par Prop 2 · tech. Grönwall discret, BDG · ctx. H5, Déf 17 »), plafonnée à 3 éléments + « +n ».
- **Renvois** : une prémisse principale ou auxiliaire à plus de 4 rangs (réglable : 2, 3, 4, 6, jamais)
  n'est pas une longue flèche ; l'inférence la cite par son code dans l'étiquette (« par Lem 22 »),
  comme une équation numérotée. La lignée et le chemin le plus faible suivent les renvois.
- **Bande « Hypothèses et modèle »** en tête : hypothèses (carré, H1…H7) et choix de modélisation
  (hexagone plat, M1…M6), contour ocre si incertain (H6 régularité, H7 trace infinie). Leurs liens en
  tirets vers les inférences qui les citent sont masqués par défaut (case « Contexte » ou survol).
  Le lien « instaure » (Déc 1 → M6 Euler–Maruyama) est toujours tracé.
- **Couloirs** : Cadre, SP1, SP2, SP3, puis la piste abandonnée (compacité) en bas, grisée ; libellés
  collés au bord gauche de l'écran ; repères « rang k » en tête (profondeur logique).
- **Décisions** : alternatives rejetées sous la boîte, losanges creux gris reliés en tirets, libellé
  barré ✕ ; la fiche donne le tableau QOC (retenue, rejetées et leurs raisons).
- **Séries** : les expériences, calculs et observations numérotés (≥ 3 membres) sont repliés en une
  activité « × n » (« MLMC, h = 1/{32 … 512} (corrigé) ») et son observation « × n » avec un sparkline
  64 × 18 px (log–log quand le paramètre couvre une décade) ; ✕ en haut pour une valeur non mesurable
  (explosion de l'énergie). « a produit » sur le trait activité → observation.
- **Liens sémantiques** hors disposition : « contredit » brique en tirets ⊣ (Obs 13 → Conj 2),
  « résout » encre ⊢ avec pointe (Déc 7 → Conj 2), « abandonne » gris.

Chiffres (jeu synthétique) : 224 nœuds / 618 arêtes → **99 énoncés** (dont 11 séries), **100 inférences**,
23 rangs logiques au niveau « Vers les résultats » ; 117 énoncés et 118 inférences au niveau « Tout ».
13 hypothèses et choix en bande, 40 nœuds de contexte en étiquettes, 12 contrôles rattachés, 53 nœuds
repliés en 11 séries.

## Interactions

- **Survol** d'une barre : fiche de l'inférence (validité, intervalle de confiance sur échelle 0–1,
  auteur, date, prémisses par rôle, ce qui est tracé / renvoyé / en étiquette, verdict). Survol d'un
  énoncé : fiche (énoncé en serif, statut, validation, origine, démonstrations avec leurs intervalles,
  valeurs d'une série, tableau QOC d'une décision, contrôles, liens sémantiques). Survol d'une
  hypothèse ou d'un choix : **portée** (tout ce qui en dépend transitivement dans le graphe complet
  reste net, le reste passe à 22 %) et liens en tirets.
- **Clic** : énoncé = lignée (antécédents à gauche, dépendants à droite, reste à 22 %) ; barre = ses
  prémisses et sa conclusion ; hypothèse / choix = portée épinglée, listée par rang dans le panneau.
  Les codes du panneau sont cliquables (sélection + centrage). `Échap` efface, `0` / `Origine` cadre
  tout, `.` recentre la sélection.
- **Chemin le plus faible** (énoncé sélectionné) : chaîne des démonstrations principales, par les
  prémisses principales et auxiliaires (renvois compris), qui minimise le **produit** des confiances
  (ou le **minimum**, au choix : la règle est un choix épistémique, exposé et réglable). Tracé en violet
  sombre 2 px, tableau dans le panneau avec la confiance et le cumul de chaque maillon, le plus faible
  souligné.
- **Filtre** « à vérifier ou invalides » : seules ces inférences, leurs prémisses et conclusions restent
  nettes.
- **Niveau** : « Vers les résultats » (ce qui mène, par prémisses principales ou auxiliaires, à un
  résultat, un théorème, une décision, une conjecture ou un énoncé porteur d'un lien sémantique) ou
  « Tout ». Sélectionner un énoncé masqué bascule sur « Tout ».
- Zoom sémantique : sous 0,42 les boîtes ne portent que leur code ; titres à partir de 0,42 ; noms
  des démonstrations, valeurs de confiance et étiquettes latérales à partir de 0,7. Vue d'ensemble en
  bas à droite (clic ou glisser pour naviguer). Réglages mémorisés dans `localStorage`
  (`atlas-raisonnement:r22-inferences`).

## Choix

- **Page autonome en Canvas 2D**, sans sigma ni la vue partagée : D2 dessine du texte, des rectangles,
  des barres et des étiquettes, pas des points ; la 3D par couches n'apporte rien à cette lecture.
  On n'importe que `src/raisonnement/donnees.ts` (types, jeu, graphe de justification).
- **Dérivation maison** (`modele.ts`), déterministe :
  - *nature* de chaque nœud : énoncé (boîte) ; bande (hypothèses, choix) ; contexte (axiomes,
    définitions admises sauf les objets centraux, lemmes outils et littérature admis) ; contrôle
    (calcul sans dépendant dont l'unique prémisse principale est un énoncé déductif).
    Objet central (repris de R1) : définition construite par une décision ou prémisse principale ≥ 6
    fois — ici le schéma et le schéma corrigé.
  - *séries* : identifiants `préfixe_nombre` de même type, ≥ 3 membres ; titre = préfixe et suffixe
    communs des noms avec la partie variable en `{a … b}` ; valeurs lues dans les énoncés (premier nombre
    après « = », sinon dans le nom hors paramètre). Données absentes du modèle, dérivées ici.
  - *codes* : par type et dans l'ordre du jeu (H3, M2, Déf 7, Lem 12, Obs 8–12 pour une série) ; les
    outils admis gardent un nom court dérivé de leur nom (« Grönwall discret », « BDG », « Kuznetsov »).
  - *confiance d'une inférence* : une seule fonction, `confianceInference` ; la principale (et toute
    démonstration valide) reprend la confiance du nœud, une variante « à vérifier » est ramenée à
    70 % (bornes 50 % / 90 %), une invalide à 0,10 [0,03 – 0,20]. En base, `confiance` vit sur la
    démonstration : il suffira de la lire là.
  - *série* : une inférence agrégée, validité = la pire, confiance = le minimum des membres.
- **Mise en page maison** (`mise-en-page.ts`) : rangs = plus long chemin ; couloirs par sous-problème ;
  dans chaque colonne d'un couloir, ordre par barycentre puis placement par régression isotone (trois
  passes avant / arrière / avant), qui aligne les chaînes ; barres dans le rang de leur conclusion.
  Les arêtes inter-couloirs ne tirent pas le placement (sinon tout se colle aux frontières).
- **Hypothèses dans la bande, pas dans le flux** : une hypothèse est une portée (ASSUME de Lamport),
  pas une étape ; elle est citée par son code dans l'étiquette de chaque inférence, quel que soit son
  rôle, et sa portée se lit au survol. C'est ce qui supprime les éventails de H5 (CFL) vers vingt
  inférences.
- Charte : fond blanc, encre gris-noir, vert sombre / ocre / brique pour les seules sémantiques de
  validité, filets 1 px, aucune ombre, aucune animation ; mono (Cascadia Mono / Consolas) pour les codes,
  serif (Cambria) pour les énoncés dans les fiches.

## Sources de la recherche utilisées

- Physics Derivation Graph (§2.3) : graphe biparti, l'étape d'inférence comme nœud nommé et vérifiable.
- Barre d'inférence de Gentzen (§2.5) : la barre, son nom à côté.
- GSN, SupportedBy / InContextOf (§2.6) : trait plein pour l'inférence, contexte latéral sans trait.
- Lean blueprint (§2.1) : contour et remplissage comme deux canaux indépendants, tirets pour « non
  démontré ».
- W3C PROV (§2.13) : activité (en-tête, agent) → « a produit » → entité (observation).
- Boukhelifa et al. 2012, Guo et al. 2015 (§2.19) : incertitude d'un lien en tirets, jamais en flou.
- Lamport (§2.4) et liste-clé de Wigmore (§2.9) : codes stables et citables, renvois par numéro.
- QOC / IBIS (§2.11) : alternatives rejetées visibles, avec leur raison.
- Assurance Claim Points (§2.7) : la confiance de chaque inférence consultable à la demande (fiche).
- Principes transverses 1 à 7 et 9 ; le 8 (vue dense + vue locale) seulement par la vue d'ensemble.

## Limites

- **Largeur** : 23 rangs × 316 px ≈ 7 500 px. Le cadrage initial (zoom 0,75, en haut à gauche) montre
  les premiers rangs ; « Cadrer » montre tout mais seulement les codes. La vue d'ensemble compense.
- Les arêtes sont des courbes de Bézier qui peuvent traverser une boîte d'une colonne intermédiaire
  (renvois au-delà de 4 rangs limitent le cas, pas de routage autour des boîtes).
- Les étiquettes latérales de deux barres empilées (une seule occurrence : Prop 1) peuvent se toucher.
- Les séries sont reconnues par une convention d'identifiants (`_32`, `_0`…) et leurs valeurs par
  lecture de texte : en base, un champ `serie` / `valeur` annoté par l'agent serait plus sûr.
- Pas de verdict détaillé du vérificateur (justification, modèle juge / recours) : absent du jeu
  synthétique ; la fiche le dit au lieu de l'inventer.
- Le chemin le plus faible ne suit que les démonstrations principales.
- Thème clair uniquement ; pas de 3D ; vérifié par `tsc` et par un rendu sur contexte factice (pas de
  capture navigateur).
