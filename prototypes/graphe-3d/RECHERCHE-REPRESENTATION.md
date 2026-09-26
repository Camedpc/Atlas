# Représenter un raisonnement scientifique — recherche et directions

Recherche en ligne (septembre 2026) pour la série `raisonnement/`. Données de référence :
`src/raisonnement/donnees.ts` (NoeudR, DemonstrationR, Premisse + rôle, InfoDecision, InfoChoix,
LienSemantique). Vision de référence : `raisonnement/r1-squelette/NOTES.md`.

## 1. Synthèse

1. Les outils « sérieux » (blueprints Lean, GSN des dossiers de sûreté, Physics Derivation Graph,
   PROV) ont tous un point commun : **l'inférence est un objet à part entière**, pas un simple trait.
   Atlas le permet déjà : `validite` vit sur la démonstration ; il faut la dessiner comme un objet.
2. Ils distinguent systématiquement **deux sortes de dépendances** : ce dont l'énoncé a besoin pour
   *avoir un sens* (définitions, contexte) et ce dont la preuve a besoin pour *être vraie*.
3. L'état d'un énoncé est **multi-dimensionnel** (énoncé formulé / preuve vérifiée / confiance) et
   se code par canaux séparés (contour vs remplissage chez Lean blueprint), pas par une seule couleur.
4. Les hypothèses et choix de modélisation doivent avoir une **portée calculable et affichable**
   (preuves structurées de Lamport, DSM, cube de Bronstein) : c'est ce qui rend l'outil scientifique.
5. Les décisions relèvent du *design rationale* (IBIS, QOC) : question → options → critères, les
   options rejetées restent visibles avec leur raison.
6. La démarche (expérience, calcul, observation) relève de la **provenance** (PROV, VisTrails) :
   entités, activités, agents, et un historique qui bifurque.
7. La confiance se lit mieux en **intervalles alignés** (forest plot) et en « maillon le plus faible »
   qu'en teintes ; l'incertitude sur un trait se code par tirets/esquisse, testés en visualisation.
8. Les matrices (DSM, ACH) passent à l'échelle là où les graphes nœud-lien saturent.
9. Cinq directions proposées : preuve structurée numérotée (D1), graphe biparti énoncés/inférences
   (D2), matrice de dépendance (D3), registre des décisions en lignes de temps (D4), audit des
   hypothèses et de la confiance (D5).
10. Toutes restent sobres : la précision vient de la notation (numéros, portées, intervalles), pas
    de l'effet visuel.

## 2. Panorama

### 2.1 Lean blueprint (Massot) — graphes de dépendance de formalisation

- **Encode** : définitions, lemmes, théorèmes d'un projet de formalisation (PFR, FLT, PNT+) et leurs
  `\uses`, avec l'état de formalisation.
- **Grammaire** : rectangles = définitions, ellipses = théorèmes/lemmes ; **contour** vert = énoncé
  formalisé, **remplissage** vert = preuve formalisée, bleu = prêt à être formalisé (tous les
  prérequis faits), vert foncé = entièrement prouvé y compris les dépendances, orange = pas prêt.
  **Flèche en tirets** = dépendance de l'énoncé ; **flèche pleine** = dépendance de la preuve.
  Mise en page Graphviz (couches).
- **Forces** : deux canaux indépendants (contour/remplissage) pour deux états indépendants ; la
  distinction énoncé/preuve est exactement la distinction contexte/principale d'Atlas ; « prêt à
  être attaqué » est un statut dérivé utile pour piloter des agents.
- **Limites** : illisible au-delà de ~150 nœuds ; aucune notion de décision ni de confiance graduée.
- **Sources** : https://github.com/PatrickMassot/leanblueprint ·
  https://github.com/PatrickMassot/plastexdepgraph · https://terrytao.wordpress.com/2023/11/18/formalizing-the-proof-of-pfr-in-lean4-using-blueprint-a-short-tour/ ·
  exemple : https://alexkontorovich.github.io/PrimeNumberTheoremAnd/web/dep_graph_document.html ·
  KnowTeX (dépendances extraites du TeX) : https://arxiv.org/pdf/2601.15294

### 2.2 Equational Theories Project (Tao) — graphe d'implications à grande échelle

- **Encode** : 22 millions d'implications entre 4 694 lois, prouvées ou réfutées (humain + automates,
  vérifiées en Lean).
- **Grammaire** : matrice pixel (bleu = implique, rouge = n'implique pas) pour la vue d'ensemble ;
  diagramme de Hasse local (outil Graphiti) pour explorer un voisinage.
- **Forces** : combinaison **vue matricielle globale + diagramme local** ; réfutation aussi visible
  que la preuve.
- **Limites** : relation binaire homogène, pas de raisonnement hétérogène.
- **Sources** : https://terrytao.wordpress.com/2024/10/12/the-equational-theories-project-a-brief-tour/ ·
  https://teorth.github.io/equational_theories/dashboard/

### 2.3 Physics Derivation Graph (Ben Payne)

- **Encode** : dérivations de physique mathématique ; expressions, **règles d'inférence** (« diviser
  les deux membres par… »), symboles ; chaque pas est vérifiable par calcul formel (SymPy).
- **Grammaire** : graphe **biparti** : aucune expression n'est reliée directement à une autre, il y a
  toujours un nœud « règle d'inférence » entre les deux ; les « feeds » (arguments de la règle)
  entrent latéralement.
- **Forces** : l'étape de raisonnement est un objet nommé, typé et vérifiable ; c'est le modèle
  exact de `DemonstrationR` (nom + prémisses + validité).
- **Limites** : granularité très fine (une opération algébrique par pas) ; pas d'expériences.
- **Sources** : https://derivationmap.net/ · https://derivationmap.net/user_documentation ·
  https://allofphysicsgraph.github.io/proofofconcept/

### 2.4 Preuves structurées de Lamport (TLA+)

- **Encode** : une preuve comme hiérarchie d'étapes numérotées ⟨niveau⟩numéro, chacune avec sa
  justification (« BY ⟨1⟩2, ⟨2⟩3 DEF … »), et des blocs ASSUME/PROVE qui ouvrent une portée.
- **Grammaire** : texte indenté, numérotation hiérarchique ; la numérotation empêche de citer une
  sous-étape hors de la portée de ses hypothèses.
- **Forces** : précision maximale ; lecture à profondeur réglable (déplier une étape) ; **portée des
  hypothèses rendue par la structure**. Lamport le présente comme ce qui rend difficile de « prouver »
  une chose fausse.
- **Limites** : arbre, pas DAG (les réutilisations passent par des renvois) ; linéaire.
- **Sources** : https://lamport.azurewebsites.net/pubs/proof.pdf ·
  https://blog.acolyer.org/2015/01/12/how-to-write-a-21st-century-proof/

### 2.5 Arbres de Gentzen, déduction naturelle, style Fitch

- **Encode** : dérivations formelles ; racine = conclusion, feuilles = hypothèses, **barre
  horizontale** = application d'une règle (nom de la règle à droite de la barre) ; Fitch : boîtes
  d'hypothèses imbriquées (portée).
- **Forces** : la **barre d'inférence** est une grammaire compacte et universellement lue par les
  scientifiques ; les boîtes de Fitch montrent la décharge d'hypothèses.
- **Limites** : arbre (duplication des sous-preuves partagées) ; très vertical.
- **Sources** : https://arxiv.org/html/2607.04321v1 · https://arxiv.org/pdf/1404.0082 (proof-graphs,
  version DAG des preuves)

### 2.6 Goal Structuring Notation (GSN) et dossiers d'assurance

- **Encode** : argument de sûreté : but (affirmation), stratégie (nature de l'inférence),
  solution (preuve matérielle), contexte, hypothèse, justification.
- **Grammaire** : rectangle = but, **parallélogramme = stratégie**, cercle = solution/évidence,
  rectangle arrondi = contexte, ovale « A » = hypothèse, ovale « J » = justification. Deux liens :
  **SupportedBy** (flèche pleine, inférence) et **InContextOf** (flèche creuse, latérale, contexte).
  Losange creux sous un élément = **non développé**.
- **Forces** : séparation formelle inférence / contexte (= rôles `principale` vs `contexte`) ; le
  « non développé » est un statut de première classe ; standard industriel.
- **Limites** : arborescent, descendant (but en haut) ; lourd au-delà de quelques dizaines d'éléments.
- **Sources** : https://www.faa.gov/about/office_org/headquarters_offices/ang/redac/redac-sas-201503-gsn-community-standard-v1.pdf ·
  https://arxiv.org/pdf/2511.02203 (LLM juges d'arguments GSN)

### 2.7 Arguments de confiance et « Assurance Claim Points » (Hawkins, Kelly)

- **Encode** : on sépare l'**argument principal** (pourquoi c'est vrai) de l'**argument de
  confiance** (pourquoi on croit chaque pas), relié par des points d'ancrage (ACP) posés sur les
  inférences et les preuves matérielles.
- **Forces** : exactement le partage Atlas entre graphe de lecture et verdicts du vérificateur ;
  l'argument principal reste lisible, la confiance est consultable à la demande à chaque ACP.
- **Limites** : pas de notation quantitative standard (des travaux proposent des probabilités
  baconiennes).
- **Sources** : https://www-users.york.ac.uk/~rdh2/papers/HawkinsSSS11.pdf ·
  https://www.sei.cmu.edu/documents/1424/2013_021_001_88002.pdf

### 2.8 Toulmin et schémas d'argumentation (Walton)

- **Encode** : données → affirmation, via une **garantie** (warrant), elle-même adossée (backing),
  modulée par un **qualificatif** (« probablement ») et une **réfutation** (« sauf si »). Walton :
  schémas typés (avis d'expert, analogie…) avec leurs **questions critiques**.
- **Forces** : le qualificatif et le « sauf si » sont exactement la confiance et les conditions de
  validité ; les questions critiques par type de démonstration fournissent une grille au
  vérificateur (et à l'affichage de son verdict).
- **Limites** : un argument à la fois ; connotation pédagogique si on l'affiche tel quel.
- **Sources** : https://pressbooks.calstate.edu/writingargumentsinstem/chapter/toulmin-argument-model/ ·
  https://www.researchgate.net/publication/228653011_The_nature_and_status_of_critical_questions_in_argumentation_schemes

### 2.9 Wigmore charts (preuve judiciaire)

- **Encode** : masse d'indices, inférences, corroborations, explications alternatives, objections.
- **Grammaire** : forme du nœud = nature de l'indice (carré = témoignage, cercle = indice
  circonstanciel, triangle = corroboration, chevron = explication) ; symboles **sur la flèche** =
  degré de soutien ; traits distincts pour l'objection. Liste-clé numérotée à côté du schéma.
- **Forces** : force du soutien **portée par le lien** ; chart + liste-clé numérotée (schéma
  compact, texte complet à côté).
- **Limites** : symbolique ésotérique.
- **Sources** : https://en.wikipedia.org/wiki/Wigmore_chart ·
  https://informallogic.ca/index.php/informal_logic/article/view/2278/1722

### 2.10 Cartes d'arguments (Argdown, Rationale, Kialo)

- **Encode** : thèses, arguments pour/contre ; Argdown distingue la carte (arguments comme boîtes,
  prémisses masquées dedans) de l'« inference tree » (reconstruction prémisses-conclusion).
- **Forces** : Argdown **cache les prémisses dans l'argument** pour réduire la complexité (même idée
  que les pastilles de R1) ; source texte = carte (reproductible).
- **Limites** : Kialo est un arbre pro/contre, trop discursif pour un outil de preuve.
- **Sources** : https://argdown.org/guide/elements-of-an-argument-map.html ·
  https://argdown.org/guide/creating-oldschool-argument-maps-and-inference-trees.html ·
  https://comma2014.arg-tech.org/res/pdfs/62-voigt.pdf

### 2.11 IBIS / dialogue mapping (Rittel, Compendium) et QOC (MacLean)

- **Encode** : IBIS : question → positions → arguments pour/contre. QOC : **Questions, Options,
  Critères** ; un trait plein relie une option à un critère qu'elle satisfait, un trait en tirets à
  un critère qu'elle dessert.
- **Forces** : c'est le modèle exact d'`InfoDecision` (question, alternatives, retenue, raison) ;
  QOC ajoute les **critères** comme axe de comparaison explicite, et représente l'espace de
  conception, pas l'historique.
- **Limites** : vite touffu si on met tous les arguments en nœuds.
- **Sources** : https://en.wikipedia.org/wiki/Issue-based_information_system ·
  https://en.wikipedia.org/wiki/Compendium_(software) ·
  https://www.researchgate.net/publication/233367028_Questions_Options_and_Criteria_Elements_of_Design_Space_Analysis

### 2.12 Analyse des hypothèses concurrentes (ACH, Heuer)

- **Encode** : matrice hypothèses (colonnes) × indices (lignes) ; cellule = cohérent / incohérent /
  non pertinent ; on classe les hypothèses par nombre d'incohérences ; **diagnosticité** : un indice
  cohérent avec toutes les hypothèses ne vaut rien.
- **Forces** : pour une décision, montre *quelles observations ont réellement tranché* ; logique de
  réfutation (poppérienne) native.
- **Limites** : plate, sans chaînes d'inférence.
- **Sources** : https://en.wikipedia.org/wiki/Analysis_of_competing_hypotheses ·
  https://link.springer.com/article/10.1007/s40070-013-0001-x

### 2.13 Provenance : W3C PROV, VisTrails, Evidence Graphs

- **Encode** : PROV : entités (ovales), activités (rectangles), agents (pentagones) ; relations
  `used`, `wasGeneratedBy`, `wasDerivedFrom`, `wasAssociatedWith`. VisTrails : **arbre de
  versions** d'une exploration (chaque branche = une variante essayée). Evidence Graphs (Clark et
  al., ontologie EVI) : les résultats calculés sont des arguments *réfutables* (supports /
  challenges) sur données, méthodes, logiciels.
- **Forces** : grammaire standard pour expérience → calcul → observation, et pour l'origine
  (humain / IA / ordinateur) ; l'arbre de versions rend les pistes abandonnées naturelles.
- **Limites** : ne dit rien de la logique de l'inférence.
- **Sources** : https://www.w3.org/TR/prov-dm/ · https://arxiv.org/pdf/1309.1784 ·
  https://www.biorxiv.org/content/10.1101/2021.03.29.437561.full.pdf

### 2.14 Nanopublications, micropublications, ORKG

- **Encode** : nanopublication = assertion atomique + provenance + infos de publication ;
  micropublication (Clark) = affirmation + soutiens/contradictions + données + attribution ; ORKG =
  contributions (problème, méthode, résultat) comparables en **tableaux**.
- **Forces** : unité « assertion + provenance » = fiche de nœud Atlas ; les **tableaux comparatifs
  ORKG** donnent une vue alternative au graphe (résultats en lignes, propriétés en colonnes).
- **Limites** : modèles de publication, pas de visualisation du raisonnement.
- **Sources** : https://arxiv.org/pdf/1809.06532 · https://link.springer.com/article/10.1186/2041-1480-5-28 ·
  https://ar5iv.labs.arxiv.org/html/2206.01439

### 2.15 Matrices de structure de dépendance (DSM)

- **Encode** : matrice carrée éléments × éléments ; marque = dépendance. Après **séquençage**, la
  matrice est triangulaire : les marques de l'autre côté de la diagonale sont des **boucles**
  (retours, reprises) ; le **partitionnement** fait apparaître des blocs diagonaux (modules
  fortement couplés) ; le « tearing » casse une boucle par une hypothèse provisoire.
- **Forces** : dense, sans croisements, passe à des centaines d'éléments ; la boucle
  (« conjecture → mesure → contradiction → correction ») devient visible au lieu d'être cachée.
- **Limites** : peu intuitive pour un chemin ; demande un tri soigné.
- **Sources** : https://en.wikipedia.org/wiki/Design_structure_matrix · https://dsmweb.org/sequencing-a-dsm/

### 2.16 DAG causaux (DAGitty) et réseaux bayésiens

- **Encode** : variables et hypothèses structurelles ; d-séparation → indépendances testables ;
  dans un réseau bayésien, propagation de l'évidence.
- **Forces** : le graphe **est** un ensemble d'hypothèses dont on dérive des conséquences
  testables ; travaux de visualisation sur la comparaison de postérieurs selon les évidences et
  sur l'extraction d'arguments depuis un réseau bayésien.
- **Limites** : sémantique causale, pas déductive ; confiance calculée suppose un modèle
  probabiliste qu'Atlas n'a pas (encore).
- **Sources** : https://www.dagitty.net/ · https://arxiv.org/pdf/1707.00791 ·
  https://link.springer.com/chapter/10.1007/978-3-319-20807-7_8

### 2.17 Hiérarchies de modèles et régimes de validité (cube de Bronstein, diagrammes de régimes)

- **Encode** : cube cGh : chaque théorie est un sommet d'un espace de limites (G → 0, 1/c → 0,
  ħ → 0) ; diagrammes de régimes : plan de nombres sans dimension, zones grisées = domaine de
  validité d'un modèle, frontières là où un nombre sans dimension est d'ordre 1.
- **Forces** : un **choix de modélisation est une position dans un espace de paramètres** ; montre
  ce qu'on perd en changeant de choix (les alternatives d'`InfoChoix` deviennent des sommets
  voisins).
- **Limites** : suppose des axes quantitatifs, rarement annotés par les agents.
- **Sources** : https://www.motionmountain.net/physicscube.html · https://en.wikipedia.org/wiki/CGh_physics ·
  https://arxiv.org/pdf/2307.04598 (diagrammes τ–ℓ de régimes)

### 2.18 Mise en page : Sugiyama, storylines, lignes de métro

- **Encode** : Sugiyama (couches, nœuds fictifs, minimisation des croisements) pour les DAG ;
  storylines (Tanahashi & Ma) : une ligne x-monotone par entité, qui converge/diverge dans le
  temps ; « metro maps of science » (Shahaf, Guestrin) : lignes = fils d'une histoire scientifique,
  stations partagées = jonctions.
- **Forces** : Sugiyama = base de R1 ; storyline/métro = représentation naturelle de sous-problèmes
  (lignes) qui se rejoignent sur des résultats (stations).
- **Limites** : les storylines coûtent cher à optimiser (algorithmes génétiques, minutes).
- **Sources** : https://cs.brown.edu/people/rtamassi/gdhandbook/chapters/hierarchical.pdf ·
  https://arxiv.org/pdf/1709.01055 · https://cacm.acm.org/research/information-cartography/

### 2.19 Incertitude sur les liens (IEEE TVCG)

- **Encode** : une valeur d'incertitude par arête.
- **Résultats** : Boukhelifa et al. (2012) : l'esquisse (« sketchiness ») est aussi intuitive que le
  flou, les tirets sont préférés subjectivement ; Guo, Huang & Laidlaw (2015) comparent des paires
  de variables visuelles pour arêtes bivariées (valeur + incertitude). NetHOPs : animer des
  réalisations d'un graphe probabiliste.
- **Forces** : base empirique pour coder `validite` + `confiance` sur un trait sans couleur criarde.
- **Sources** : https://dl.acm.org/doi/10.1109/TVCG.2012.220 ·
  https://www.semanticscholar.org/paper/Representing-Uncertainty-in-Graph-Edges:-An-of-Guo-Huang/4acb043a87313f716fab1c0595cdc8ac334c324b ·
  https://pubmed.ncbi.nlm.nih.gov/34587012/

## 3. Principes transverses retenus

Ce qui distingue un outil scientifique précis d'un support pédagogique :

1. **L'inférence est un objet.** Elle a un nom, un type, une validité, une confiance, un auteur, un
   verdict (PDG, GSN stratégie, barre de Gentzen, ACP). Un trait nu entre deux énoncés est une
   perte d'information.
2. **Deux dépendances, deux tracés.** « L'énoncé a besoin de » (définitions, notations, contexte)
   ≠ « la preuve a besoin de » (Lean blueprint : tirets vs plein ; GSN : InContextOf vs
   SupportedBy). Les rôles `principale / auxiliaire / technique / contexte` doivent être lisibles
   sans survol.
3. **États orthogonaux, canaux orthogonaux.** Statut logique, validation (IA/humain), confiance et
   origine ne partagent pas le même canal (contour, remplissage, glyphe, trait d'intervalle).
4. **Portée explicite.** Toute hypothèse ou tout choix de modélisation a une portée calculée
   (`dependantsDe`) consultable comme un ensemble, pas seulement en surbrillance éphémère
   (Lamport, DSM, ACH).
5. **Numérotation stable et citable.** Chaque énoncé porte un identifiant court (⟨2⟩3, Lem 4, Obs 12)
   utilisé dans les justifications, comme une équation numérotée ; c'est la liste-clé de Wigmore.
6. **Quantités, pas impressions.** La confiance est un intervalle `[bas, haut]` dessiné sur une
   échelle commune (forest plot), jamais seulement une teinte ; la propagation (maillon le plus
   faible) est calculée et affichée.
7. **Ce qui a été rejeté reste.** Alternatives de décision, pistes abandonnées, conjectures réfutées :
   visibles, grisées, avec leur raison (QOC, VisTrails, ETP qui montre les non-implications).
8. **Deux vues du même objet.** Vue d'ensemble dense (matrice, métro) + vue précise locale
   (texte structuré, sous-graphe) — comme ETP (matrice + Hasse) ou Wigmore (schéma + liste-clé).
9. **Le texte prime.** Les énoncés sont lisibles en entier (LaTeX/Unicode) ; la forme n'est qu'un
   index. Densité typographique d'article, pas de cartes décoratives.
10. **Provenance à chaque nœud.** Qui (humain / IA / ordinateur), quand, par quelle démonstration,
    vérifié par qui : grammaire PROV, pas d'icônes fantaisie.

Charte commune aux cinq directions : fond blanc ou gris très clair, encre gris-noir, une couleur
d'accent sourde par sémantique (validé = vert sombre, incertain = ocre, réfuté = brique), traits de
1 px, typographie serif ou sans-serif d'article + mono pour les identifiants, aucune ombre portée,
aucun glow, aucune animation en boucle, aucune barre colorée à gauche des cartes. Les transitions
sont brèves (≤ 200 ms) et seulement en réponse à une action.

## 4. Cinq directions de prototypes

Rappel du modèle (`donnees.ts`) : `NoeudR` (type, statut, validation, confiance `{estimation, bas,
haut}`, origine, sousProbleme, piste, admis, demonstrations, decision?, choix?, liens?),
`DemonstrationR` (nom, premisses `{id, role}`, validite, auteur, cree_le, texte?), `InfoDecision`
(question, alternatives `{libelle, retenue, raison}`, raison, date, auteur), `InfoChoix` (hypothese,
portee, alternatives?), `LienSemantique` (contredit, resout, remplace, abandonne). Outils :
`construireJustification`, `demonstrationPrincipale`, `dependantsDe`, `antecedentsDe`.
Remarque : en base, `validite` et `confiance` vivent sur la démonstration ; le prototype porte la
confiance sur le nœud. Chaque direction lit la confiance « de la démonstration principale »
via une seule fonction d'accès, pour basculer facilement.

---

### D1 · Preuve structurée

**Idée** : afficher le raisonnement comme une preuve hiérarchique numérotée à la Lamport, en texte,
avec une marge de vérification, et un mini-graphe seulement en appoint.

- **Inspirations** : Lamport (§2.4), liste-clé de Wigmore (§2.9), barre d'inférence de Gentzen
  (§2.5), boîtes de portée de Fitch.
- **Disposition** : page unique en colonne (largeur de lecture ~72 caractères) + deux marges.
  - En tête : **ASSUME** — liste numérotée des hypothèses (`H1…`), choix de modélisation (`M1…`)
    et définitions utilisées (`D1…`), en petites capitales.
  - Corps : une entrée par résultat majeur (théorème, résultat), de la conclusion vers les
    étapes : `⟨1⟩` = prémisses principales de la démonstration principale, `⟨2⟩` = leurs propres
    prémisses principales, etc. (arborescence dérivée du graphe de lecture de R1 ; un énoncé partagé
    n'est développé qu'une fois, ailleurs il est cité par son numéro).
  - Chaque étape : numéro mono, type en petites capitales, titre, énoncé ; ligne **PAR** avec les
    prémisses non principales citées par numéro, groupées par rôle : `par ⟨2⟩1, ⟨2⟩4 ; aux. Prop 3 ;
    tech. Grönwall, BDG ; ctx. H2, M1`.
  - Marge gauche : filets verticaux fins (1 px gris) indiquant la **portée** de chaque choix de
    modélisation actif sur le bloc, étiquetés `M1`, `M3` en tête de filet (boîtes de Fitch
    simplifiées) — des filets, pas des barres colorées.
  - Marge droite (alignée ligne à ligne) : validité de la démonstration principale (✓ / ? / ✕ en
    glyphes texte), validation (H, IA, IA+H), et un **mini intervalle de confiance** (trait de 40 px
    sur échelle 0–1 commune, point = estimation). Nombre de démonstrations alternatives (`2 dém.`).
- **Décisions** : bloc encadré d'un filet fin, « DÉCISION ⟨k⟩ — question », tableau des alternatives
  (retenue en romain gras, rejetées en gris avec raison), date, auteur. Placées à l'endroit où elles
  conditionnent une étape.
- **Expériences et calculs** : sous la forme d'étapes « OBSERVATION » dont la ligne PAR cite le calcul
  (`calc. MLMC h=1/512 · Grappe de calcul`) ; les séries (5 pas de maillage) sont regroupées en un
  petit tableau inline (h, Ê^{1/2}, ±).
- **Contradictions** : ligne en italique « contredit ⟨3⟩2 (Conj. ordre 1/2) — résolu par Décision ⟨5⟩ ».
- **Interactions** : cliquer un numéro = défiler vers l'étape et la surligner (fond gris très clair,
  2 s max, non répété) ; replier/déplier chaque niveau (triangle) ; curseur de profondeur « niveaux
  1…n » ; bascule « montrer les démonstrations alternatives » ; survol d'un `M1` = fond gris clair
  sur les étapes de sa portée ; volet graphe optionnel (mini-carte R1) synchronisé au défilement.
- **Correspondance** : arborescence = `demonstrationPrincipale` + rôles ; numérotation = ordre de la
  profondeur ; filets = `dependantsDe(choix)` ∩ étapes affichées ; PAR = `premisses` groupées par
  `role`.
- **Risques** : un DAG très partagé devient une avalanche de renvois ; la lecture globale se perd
  (d'où la mini-carte) ; LaTeX long dans les énoncés à gérer (repli sur 2 lignes).

---

### D2 · Graphe biparti énoncés / inférences

**Idée** : chaque démonstration devient un petit nœud « inférence » (barre de Gentzen) entre ses
prémisses et sa conclusion, porteur de la validité et de la confiance, sur une mise en page en
couches gauche → droite.

- **Inspirations** : Physics Derivation Graph (§2.3), stratégie GSN et InContextOf (§2.6), barre
  d'inférence de Gentzen (§2.5), PROV pour la démarche (§2.13), tirets/plein de Lean blueprint (§2.1).
- **Grammaire** :
  - **Énoncé** : rectangle blanc, filet 1 px, titre 12–13 px, type en petites capitales au-dessus.
    Forme par famille : rectangle droit = énoncé déductif (lemme, proposition, théorème, assertion,
    conjecture) ; rectangle aux coins arrondis = définition / axiome (admis) ; ovale = observation
    (entité PROV) ; rectangle à double filet = résultat.
    Statut par **contour** (encre = valide, ocre = incertain, brique = réfuté, trait en tirets =
    non démontré / « ouvert ») ; validation par **remplissage** très léger (blanc = aucune, gris 5 % =
    IA, gris 10 % = humain, gris 15 % = IA+humain) + glyphe texte dans le coin.
  - **Inférence** (= `DemonstrationR`) : barre horizontale courte (24 × 2 px) posée juste avant la
    conclusion, nom de la démonstration en 10 px au-dessus ; à droite de la barre, glyphe de validité
    (✓ ? ✕). Épaisseur de la barre ∝ confiance ; incertitude (haut − bas) codée par l'**esquisse**
    ou des tirets du trait sortant (Boukhelifa 2012), jamais par un flou.
    Plusieurs démonstrations d'un même nœud = plusieurs barres empilées ; la principale en encre,
    les autres en gris.
  - **Prémisses** : trait plein prémisse → barre pour `principale`, plein fin gris pour `auxiliaire` ;
    `technique` et `contexte` ne sont pas des traits : ce sont des **étiquettes latérales**
    (InContextOf GSN) accrochées sous la barre (« Grönwall, BDG · H2, M1 »), dépliables en traits
    en tirets à la demande.
  - **Choix de modélisation** : hexagone plat (forme propre, sans couleur) dans une bande « Modèle »
    en haut de la page ; lien en tirets vers les inférences qui les citent, masqué par défaut.
  - **Décision** : losange ; ses alternatives rejetées en petits losanges creux gris reliés en
    tirets, libellé barré d'un ✕ texte.
  - **Expérience / calcul** : rectangle PROV (activité) à coins droits et en-tête gris 5 %
    mentionnant l'agent (« Grappe de calcul », « IA · Claude ») ; flèche `a produit` vers
    l'observation (ovale). Les séries paramétriques (5 pas h) sont repliées en une activité
    « × 5 » avec un sparkline log-log de 60 × 20 px.
  - **Liens sémantiques** : `contredit` = trait brique en tirets à tête plate ⊣ ; `resout` = trait
    encre avec ⊢ ; ils ne participent pas à la disposition.
- **Disposition** : Sugiyama gauche → droite sur le graphe biparti (les barres sont des nœuds de
  largeur quasi nulle, placées dans la couche de leur conclusion) ; couloirs horizontaux par
  sous-problème (étiquette en marge gauche, filet de séparation 1 px) ; la piste abandonnée en
  couloir du bas, grisée.
- **Interactions** : survol d'une barre = fiche de la démonstration (prémisses par rôle, auteur,
  verdict et justification du vérificateur) ; clic sur un énoncé = lignée (antécédents à gauche,
  dépendants à droite, reste à 25 % d'opacité) ; bouton « montrer le contexte » ; filtre « seulement
  les inférences à vérifier / invalides » ; bouton « chemin le plus faible » : met en évidence la
  chaîne d'inférences de plus faible confiance vers le nœud sélectionné.
- **Correspondance** : barre = `DemonstrationR` (1 par démonstration, via `construireJustification(jeu,
  'toutes')` puis regroupement par `demonstrations`) ; rôles → trait/étiquette ; `validite` → glyphe ;
  confiance du nœud (en attendant celle de la démonstration) → épaisseur ; `origine: 'ordinateur'`
  → activité PROV.
- **Risques** : double le nombre de nœuds (barres) ; les étiquettes latérales se chevauchent si une
  inférence a beaucoup de contexte (plafonner à 3 + « … ») ; exige la réduction de R1 pour rester
  lisible.

---

### D3 · Matrice de dépendance (DSM)

**Idée** : représenter tout le graphe de justification par une matrice triangulaire ordonnée, dont
les blocs sont les sous-problèmes, les cellules les prémisses typées par rôle, et les marques
hors triangle les boucles de la démarche.

- **Inspirations** : DSM séquencée et partitionnée (§2.15), matrice de l'Equational Theories
  Project (§2.2), ACH pour la lecture par colonnes (§2.12).
- **Grammaire** :
  - Lignes et colonnes = nœuds, dans le même ordre ; en-tête de ligne : identifiant mono (Lem 4),
    type en petites capitales, titre tronqué ; en-tête de colonne : identifiant seul (vertical).
  - Cellule (ligne = conclusion, colonne = prémisse) : glyphe selon le rôle — ■ principale, ▪ auxiliaire,
    · technique, ○ contexte ; en gris si la démonstration n'est pas la principale.
    Pas de couleur de fond sauf pour la validité de la **démonstration** : liseré de cellule brique
    si `invalide`, ocre si `a_verifier`.
  - Diagonale : case du nœud lui-même = statut (✓ ? ✕) et mini-barre de confiance horizontale.
  - Ordre : tri topologique par sous-problème (blocs diagonaux délimités par un filet 1 px et
    titrés dans la marge : Cadre, SP1, SP2, SP3, Piste abandonnée) ; fondations en premier.
  - **Marques au-dessus de la diagonale** = rétroactions : dessinées dans une teinte distincte, elles
    matérialisent les liens sémantiques temporels (`contredit`, `resout`) et toute dépendance vers
    un nœud créé plus tard (ordre par `cree_le`) : c'est la boucle conjecture → mesure →
    contradiction → correction.
  - Colonnes des **choix de modélisation** et **hypothèses** regroupées à gauche ; bascule
    « transitif » : la colonne se remplit de `dependantsDe(choix)` (hachures légères pour les
    dépendances indirectes) → portée lisible d'un coup d'œil.
  - Décisions : ligne avec en-tête en losange ; sous la ligne, sous-lignes grises pour chaque
    alternative rejetée (vides : rien n'en dépend, c'est l'information).
- **Disposition** : matrice plein écran, en-têtes figés (lignes à gauche, colonnes en haut),
  défilement dans les deux axes ; zoom sémantique : en dessous de 6 px par cellule, les glyphes
  deviennent des pixels (vue d'ensemble façon ETP), au-dessus les identifiants apparaissent.
- **Interactions** : survol d'une cellule = fiche « Lem 4 utilise H2 (contexte) dans la démonstration
  “Par identité d'énergie” » ; clic sur un en-tête de ligne = surligne sa ligne et sa colonne,
  et dessine en surimpression le chemin des antécédents ; boutons de tri : topologique / par date
  / par confiance ; replier un bloc (sous-problème) en une seule ligne agrégée ; brosser un
  rectangle = sous-graphe envoyé dans la vue D2 ou R1.
- **Correspondance** : cellules = `AreteJustification` (`source`, `cible`, `role`, `demonstrations`,
  `principale`) ; blocs = `sousProbleme` ; transitif = `dependantsDe` ; marques de rétroaction =
  `liens` + comparaison `cree_le`.
- **Risques** : 224 nœuds = 50 000 cellules : rendu canvas obligatoire ; la matrice est peu parlante
  aux non-initiés (mais Camille vise un outil d'expert) ; libellés de colonnes longs à gérer.

---

### D4 · Registre de la démarche

**Idée** : lire la recherche comme une suite de décisions dans le temps : chaque sous-problème est
une ligne de métro horizontale, chaque décision est une bifurcation QOC, chaque expérience une
station, et les options rejetées restent des embranchements courts.

- **Inspirations** : QOC et IBIS (§2.11), arbre de versions VisTrails (§2.13), storylines et metro
  maps of science (§2.18), ACH pour la justification des choix (§2.12).
- **Grammaire** :
  - **Axe horizontal = temps** (`cree_le`, `decision.date`), graduations hebdomadaires discrètes en
    haut ; c'est la seule vue où l'axe x est le temps, par contraste avec R1 (profondeur logique).
  - **Lignes** : une ligne horizontale de 2 px gris foncé par sous-problème (Cadre, SP1, SP2, SP3) ;
    la piste abandonnée est une ligne en tirets qui se termine par une butée ⊣ à la date de
    `dec_abandon`. Les lignes convergent quand un résultat utilise des éléments de plusieurs
    sous-problèmes (station partagée).
  - **Stations** : jalons sur la ligne — cercle creux = énoncé démontré, cercle plein = résultat /
    théorème, carré = expérience ou calcul, ovale = observation ; seuls les jalons « majeurs »
    (squelette R1) sont montrés, les autres sont regroupés en un tiret de densité sous la ligne.
  - **Décisions** : losange sur la ligne ; à droite, la ligne continue sur l'option **retenue** ; les
    options rejetées partent en courts embranchements obliques gris (20–40 px) terminés par ✕ et
    leur libellé ; la question est écrite au-dessus du losange en italique.
  - **Choix de modélisation** : petite bannière textuelle au départ de la ligne (« M3 Stratonovich »),
    reliée par un filet vertical fin aux décisions qu'ils ont contraint.
  - **Contradictions** : arc brique en tirets d'une observation vers la conjecture qu'elle contredit
    (plus tôt dans le temps), puis arc encre vers la décision qui résout : la boucle
    obs_quart → conj_ordre → dec_correction devient un motif lisible.
  - **Confiance** : sous chaque station majeure, trait d'intervalle 30 px ; aucune autre couleur.
- **Panneau de décision** (au clic sur un losange) : tableau QOC — alternatives en colonnes,
  critères en lignes (critères extraits des `raison`, par défaut « coût », « ordre obtenu »,
  « compatibilité ») avec ✓ / ✕ / — ; en dessous, style ACH : les observations et énoncés qui ont
  motivé la décision (prémisses de la démonstration de la décision) marqués cohérent / incohérent
  avec chaque option ; puis la portée : nombre de nœuds dépendant de la décision (`dependantsDe`)
  avec lien « montrer dans D2 ».
- **Disposition** : ordonnée des lignes fixe (ordre de `SOUS_PROBLEMES`), abscisse = date ; les
  jalons d'un même jour se décalent horizontalement ; hauteur totale limitée à ~5 lignes → toute la
  démarche tient sur un écran large.
- **Interactions** : glisser une fenêtre temporelle (brosse sur l'axe) pour filtrer les autres vues ;
  survol d'une station = fiche ; clic sur un embranchement rejeté = sa raison ; mode « rejouer » :
  curseur temporel manuel (pas d'animation automatique) qui montre l'état du graphe à une date.
- **Correspondance** : lignes = `SousProbleme` (+ `abandonne`) ; x = `cree_le` / `InfoDecision.date` ;
  losanges et embranchements = `InfoDecision.alternatives` (`retenue`, `raison`) ; arcs = `liens`
  (`contredit`, `resout`, `abandonne`) ; stations = nœuds du squelette R1.
- **Risques** : les dates synthétiques sont régulières, les vraies seront en rafales (un tour d'agent)
  → prévoir une échelle compressée par tour ; critères QOC absents du modèle (à ajouter comme
  `criteres?: string[]` dans `InfoDecision`, ou à extraire du texte).

---

### D5 · Audit des hypothèses et de la confiance

**Idée** : un tableau de bord d'expert qui répond à « de quoi dépend chaque résultat, avec quelle
confiance, et que se passe-t-il si j'enlève cette hypothèse ? », en combinant une matrice
hypothèses × résultats et un forest plot de confiance.

- **Inspirations** : Assurance Claim Points et argument de confiance séparé (§2.7), qualificatif et
  « sauf si » de Toulmin (§2.8), matrice ACH (§2.12), DSM transitive (§2.15), diagrammes de
  régimes / cube de Bronstein pour les alternatives de modélisation (§2.17), incertitude sur les
  liens (§2.19).
- **Disposition** : trois zones alignées sur les mêmes lignes (une ligne par résultat majeur :
  théorèmes, propositions non admises, résultats, conjectures ; ~15–25 lignes).
  1. **Gauche — identité** : identifiant, type, titre, statut (✓ ? ✕), validation (H / IA / IA+H).
  2. **Centre — matrice des hypothèses** : colonnes = hypothèses (`H…`), choix de modélisation (`M…`)
     et décisions (`Déc…`), groupées sous trois en-têtes ; cellule = ● dépendance directe, ○
     dépendance transitive, vide = indépendant (`antecedentsDe(résultat)`). En tête de colonne :
     statut de l'hypothèse (ex. `h_regul` incertain → en-tête ocre) et nombre de résultats touchés.
  3. **Droite — forest plot** : sur une échelle 0–1 commune, pour chaque résultat, l'intervalle
     `[bas, haut]` et l'estimation (point) ; en dessous, en gris, un second intervalle **propagé** =
     confiance du maillon le plus faible parmi les inférences de sa chaîne principale (min des
     confiances) ; l'écart entre les deux intervalles signale une confiance surévaluée. À droite,
     en mono : le nœud qui est le maillon le plus faible (« ← Lem 12, IA, à vérifier »).
- **Contrefactuel (« tearing »)** : cliquer un en-tête de colonne = « retirer cette hypothèse » :
  toutes les lignes qui en dépendent passent en statut « suspendu » (texte gris, intervalle
  remplacé par un trait vide), un compteur indique « 7 résultats sur 19 tombent ». Pour un choix de
  modélisation, un menu propose ses `alternatives` (« Bruit d'Itô au lieu de Stratonovich ») et
  liste ce qui devrait être refait. Plusieurs colonnes peuvent être retirées ensemble.
- **Argument de confiance (ACP)** : clic sur un résultat = panneau latéral qui liste, pour chaque
  inférence de sa chaîne principale, le verdict du vérificateur (validité, confiance, justification,
  modèle juge / recours) ; une ligne par inférence, triée par confiance croissante ; les questions
  critiques non traitées (à la Walton : « la CFL est-elle vérifiée dans le régime simulé ? »)
  apparaissent si le vérificateur les a produites.
- **Expériences et calculs** : colonne supplémentaire « Évidence empirique » : nombre d'observations
  qui soutiennent le résultat (chemin depuis une `experience` ou un `calcul`), et nombre qui le
  contredisent (`liens.contredit`) ; `res_principal` doit afficher « 3 soutiens, 0 contradiction
  active (1 résolue) ».
- **Interactions** : tri par confiance, par nombre de dépendances, par écart confiance déclarée /
  propagée ; filtre « dépend de ≥ 1 hypothèse incertaine » ; export CSV du tableau.
- **Correspondance** : lignes = nœuds de type `theoreme | proposition | resultat | conjecture` non
  admis ; colonnes = `type ∈ {hypothese, choix_modelisation, decision}` ; cellules =
  `antecedentsDe` ; forest plot = `confiance` (puis confiance de la démonstration en base) ;
  propagation = parcours de `demonstrationPrincipale` ; contrefactuel = `dependantsDe` ; panneau
  ACP = `DemonstrationR.validite` + entrées de journal `verdict`.
- **Risques** : la règle de propagation (min, produit, autre) est un choix épistémique à exposer et
  rendre réglable, sinon l'outil affiche une fausse précision ; la matrice s'élargit si les agents
  créent beaucoup d'hypothèses (regrouper par sous-problème, colonnes repliables) ; les critiques
  « à la Walton » supposent une évolution du prompt du vérificateur.

---

## 5. Récapitulatif

| Direction | Question à laquelle elle répond | Vue | Échelle confortable |
|---|---|---|---|
| D1 Preuve structurée | Comment ce résultat est-il démontré, pas à pas ? | Texte hiérarchique numéroté | 1 résultat, 20–80 étapes |
| D2 Biparti énoncés / inférences | Quelle inférence est faible, et sur quoi repose-t-elle ? | Graphe en couches | 50–150 énoncés |
| D3 Matrice de dépendance | Quelle est la structure complète, où sont les boucles ? | DSM | 200–2 000 nœuds |
| D4 Registre de la démarche | Qu'a-t-on décidé, quand, et contre quelles options ? | Lignes de métro temporelles | 5–10 sous-problèmes, 10–40 décisions |
| D5 Audit des hypothèses | De quoi dépend chaque résultat, avec quelle confiance ? | Matrice + forest plot | 15–40 résultats, 10–40 hypothèses |
