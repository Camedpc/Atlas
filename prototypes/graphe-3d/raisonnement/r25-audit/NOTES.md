# R25 · Audit des hypothèses et de la confiance

Implémentation de la direction **D5** de `../../RECHERCHE-REPRESENTATION.md`. Page HTML/SVG autonome
(pas de sigma) : un tableau de bord d'expert qui répond à « de quoi dépend chaque résultat, avec quelle
confiance, et que se passe-t-il si l'on retire telle condition ? ».

| Fichier | Rôle |
|---|---|
| `modele.ts` | Calculs purs : sigles, matrice, chaîne principale, propagation, évidence, contrefactuel, tri, CSV |
| `questions.ts` | Questions critiques dérivées de façon déterministe (règles Q1…Q9, R1…R3), aiguillage juge / recours |
| `main.ts` | Rendu DOM + SVG et interactions |

## Ce que montre la page (jeu synthétique)

- **19 lignes** (théorèmes, propositions, résultats, conjectures non admis), groupées par sous-problème,
  la piste abandonnée en dernier et en italique ; **21 colonnes** : 7 hypothèses `H`, 6 choix `M`,
  8 décisions `Déc`.
- **Identité** : sigle stable (`Thm 2`, `Prop 6`, `Rés 2` ; numérotation par type dans l'ordre de
  création, outils admis `Out`, littérature `Réf`), type en petites capitales, titre, statut ✓ ? ✕,
  validation H / IA / IA+H.
- **Matrice** : ● prémisse directe principale ou auxiliaire (encre), ● directe de contexte ou technique
  (gris), ○ transitive (`antecedentsDe`). En-tête : sigle vertical, ocre si la condition est incertaine
  (`H6` régularité, `H7` trace infinie), puis le nombre de résultats touchés. Survol d'une cellule :
  rôle et démonstrations pour une dépendance directe, **plus court chemin** `H5 → Lem 2 → … → Thm 2`
  pour une dépendance transitive. Survol d'un en-tête : colonne surlignée, énoncé, portée déclarée,
  alternatives.
- **Évidence** : nombre d'observations qui soutiennent (dont incertaines), contradictions actives ⊣ et
  résolues. `Rés 2` (résultat principal) : 6 observations (dont 2 incertaines), 0 active, 1 résolue
  (`Obs 13` ⊣ `Conj 2`, résolue par `Déc 7`).
- **Forest plot** sur une échelle 0–1 commune : intervalle déclaré (encre, point plein) et, dessous,
  intervalle propagé (gris, point creux). Déclaré en ocre quand `bas déclaré > haut propagé`
  (confiance surévaluée). Colonne Δ = estimation déclarée − propagée. Puis le **maillon le plus faible**
  (`← Lem 3 · IA · valide · 0,45`).
- **Contrefactuel** : clic sur un en-tête (ou sur la liste-clé). Hypothèse : retrait direct. Choix :
  menu « retirer » ou « remplacer par » une alternative d'`InfoChoix`. Décision : « rouvrir » ou
  « retenir plutôt » une option rejetée (avec sa raison). Plusieurs retraits se cumulent. Bandeau :
  « 10 résultats sur 19 tombent · 25 nœuds du graphe à reprendre » (retrait de `H6`) ; lignes
  suspendues en gris, intervalle remplacé par un trait vide, cause (`suspendu : H6`). Section
  « À reprendre » : nœuds tombés par type, nœuds sauvés par une démonstration alternative.
- **Argument de confiance** (clic sur une ligne, panneau de droite, Échap pour fermer) : chiffres
  (déclarée, propagée, chaîne, maillon, évidence, conditions directes en gras), questions critiques du
  résultat, puis une ligne par inférence de la chaîne principale **triée par confiance croissante** :
  validité de la démonstration principale, sigle, titre, intervalle, schéma d'argument, nom de la
  démonstration, auteur, validation, aiguillage **juge seul / recours** (et motif), questions critiques.
- Barre d'outils : règle de propagation, profondeur de la chaîne, tri (sous-problème, confiance
  déclarée, propagée, dépendances, écart), filtres (dépend d'une condition fragile, piste abandonnée),
  **export CSV** (`;`, BOM UTF-8, une colonne D/T par condition). Réglages mémorisés dans
  `localStorage` (`atlas-raisonnement:r25-audit`), retraits non mémorisés.

## Choix

- **Propagation exposée et réglable** (risque signalé par D5) : `min` (borne haute de la conjonction,
  défaut), `produit` (indépendance) et **Fréchet** : `[max(0, 1 − Σ(1 − basᵢ)), min hautᵢ]`, seul
  intervalle valable sans hypothèse d'indépendance (point = produit, borné). L'infobulle de chaque
  bouton donne la formule. Sur une chaîne de 54 inférences, produit et Fréchet s'effondrent : c'est
  l'information, pas un défaut.
- **Chaîne principale** : démonstration principale de chaque nœud (`demonstrationPrincipale`), rôles
  suivis réglables (principales ; + auxiliaires ; + techniques), **arrêt aux conditions** (hypothèses,
  choix, décisions) : elles sont les colonnes, pas des maillons. Sans cet arrêt, `Thm 2` hériterait de
  la confiance de la piste abandonnée via `Déc 3 ← Déc 2 ← cp_bilan`. Les nœuds admis sont traversés
  mais pas comptés comme inférences.
- **Contrefactuel démonstration par démonstration**, plus fin que `dependantsDe` : un nœud tombe si
  **toutes** ses démonstrations utilisables (non invalides) citent un nœud tombé, quel que soit le rôle.
  Exemple : retirer `H5` (CFL) fait tomber `Thm 1` mais `Prop 1` (stabilité L²) est **sauvée** par
  « Par analyse de Fourier », démonstration encore à vérifier, ce que la page dit explicitement. La portée
  brute reste mentionnée (« n autres nœuds dans la portée brute sans tomber »).
- **Évidence** : observations les plus proches le long de la chaîne suivie (on s'arrête à la première
  observation et aux décisions : l'évidence derrière une décision justifie la décision, pas le
  résultat) ; les observations sources d'un lien `contredit` sont comptées comme contradictions. Une
  contradiction est rattachée si sa cible est la ligne ou un antécédent (active sauf lien `resout`), ou si
  son résolveur est un antécédent (résolue). D5 annonçait « 3 soutiens » pour `res_principal` en
  comptant des lignes d'évidence ; la page compte des observations (6).
- **Accès unique à la confiance** : `confianceDemonstration(n, d)` dans `modele.ts` renvoie aujourd'hui
  `n.confiance` ; c'est la seule fonction à changer quand la confiance vivra sur la démonstration.
- **Pas de couleur par condition** : la matrice est en encre / gris ; seules les sémantiques de la
  charte ont une teinte (validé vert sombre, incertain ocre, réfuté brique). Colonne survolée et
  colonne retirée : fond gris clair / hachures fines. Aucune animation.

## Questions critiques (dérivées ici, à produire par le vérificateur)

Chaque question porte le code de la règle qui l'a produite. « Traitée » = le graphe contient la réponse.

| Règle | Schéma | Question | Traitée si |
|---|---|---|---|
| Q1 | déduction | conditions d'application de chaque prémisse `technique` | jamais (à faire par le juge) |
| Q2 | tous | prémisse non contextuelle incertaine ou réfutée : nécessaire ? | — |
| Q3 | tous | démonstration alternative non valide : indépendante de la principale ? | — |
| Q4 | déduction | validité sous l'alternative d'un choix cité directement | — |
| Q5 | tous | rédigée par l'IA : relecture humaine ? | validation `humain` ou `ia_humain` |
| Q6 | lemme, prop., thm | contrôle indépendant des constantes | un `calcul` ordinateur `verif_*` / `lean_*` la cite |
| Q7 | mesure | hypothèse citée par un protocole : vérifiée dans le régime simulé ? (ex. CFL) | — |
| Q8 | mesure, généralisation | observation incertaine reproduite / nécessaire ; couverture du domaine | — |
| Q9 | heuristique | test de réfutation tenté ? | un lien `contredit` vise la conjecture |
| R1 | résultat | tient-il sans chaque condition fragile dont il dépend ? | — |
| R2 | résultat | la résolution couvre-t-elle la contradiction ? contradiction active sans résolution | — |
| R3 | résultat | écart déclarée − propagée > 0,15 : qu'est-ce qui le justifie ? | — |

## Ajouts nécessaires au vrai modèle

- **Confiance sur la démonstration** (déjà le cas en base : `demonstrations.confiance`) ; il manque
  l'intervalle : `confiance_bas`, `confiance_haut` (ou `confiance jsonb {estimation, bas, haut}`).
- **Rôles des prémisses** : `demonstrations.roles jsonb` (déjà listé dans `src/raisonnement/donnees.ts`).
- **Verdicts consultables par démonstration** : le journal a `action = 'verdict'` avec la justification ;
  il faut pouvoir le lire par démonstration (`GET /api/journal?noeud_id=` + filtre sur
  `nom_demonstration`) et y stocker `modele_juge`, `modele_recours` (null si pas de recours),
  `confiance_juge`, `confiance_recours`.
- **Questions critiques** : `questions_critiques jsonb` sur la démonstration (ou dans l'entrée `verdict`) :
  `[{ schema, question, statut: 'ouverte' | 'traitee' | 'sans_objet', reponse?, noeuds_cites? }]`.
- **Schéma d'argument** : `demonstrations.schema text` (`deduction`, `generalisation`, `mesure`,
  `heuristique`, `analogie`, `avis_expert`…), annoté par le graphiste, contrôlé par le vérificateur.
- **Alternatives de décision rejouables** : pour que « retenir plutôt une option rejetée » calcule autre
  chose qu'un retrait, il faudrait savoir quels nœuds seraient conservés sous l'autre option
  (`InfoDecision.alternatives[].compatibles?: string[]`). Idem `InfoChoix.alternatives` →
  `{ libelle, compatibles?: string[] }`. Aujourd'hui, remplacer = retirer, avec le libellé « à refaire
  sous … ».
- **Colonnes nombreuses** : si les agents créent 40+ hypothèses, regrouper par sous-problème avec en-têtes
  repliables (non fait : 21 colonnes tiennent).

### Prompt du vérificateur (`atlas/orchestrateur/prompts/`, à écrire par Camille)

Ajouter à la sortie structurée du juge, pour chaque démonstration :

1. `schema` : le schéma d'argument reconnu ;
2. `questions_critiques` : les questions critiques de ce schéma (liste de Walton adaptée aux preuves et
   aux mesures ; reprendre Q1–Q9 comme amorce), chacune avec `statut` et, si traitée, les nœuds du
   graphe qui y répondent ;
3. `confiance` sous forme d'intervalle `{estimation, bas, haut}` ; consigne : la largeur reflète
   l'incertitude du juge, pas la difficulté de l'énoncé ;
4. consigne explicite : une question non traitée n'invalide pas, elle plafonne la confiance.

## Sources de la recherche utilisées

§2.7 Assurance Claim Points (argument de confiance séparé, panneau ACP) · §2.8 Toulmin / Walton
(questions critiques par schéma) · §2.12 ACH (lecture par colonnes, diagnosticité) · §2.15 DSM
transitive et « tearing » (retrait de colonnes) · §2.17 régimes de validité (alternatives des choix) ·
§2.19 incertitude des liens (intervalles plutôt que teintes) · §2.9 liste-clé de Wigmore (liste-clé
numérotée sous la table) · principes transverses 4, 5, 6, 7, 8.

## Limites

- Jeu synthétique uniquement (`genererJeuRaisonnement()`), pas de `chargerJeu()` : le serveur de
  prototypes n'a pas de `/api`.
- Confiances du jeu synthétiques et parfois incohérentes avec la validité (ex. `Lem 3` démonstration
  principale valide mais confiance 0,45) : la page les affiche telles quelles.
- La justification textuelle du juge n'existe pas dans le jeu : le panneau n'affiche que l'aiguillage
  juge / recours (reconstitué depuis le seuil, 0,70 par défaut, non réglable dans l'interface).
- Les questions dérivées sont nombreuses (80 ouvertes pour `Rés 2` sur 54 inférences) : utiles comme
  inventaire, trop pour une lecture ; le vrai vérificateur devrait en retenir peu, ciblées.
- Le retrait d'une condition ne réévalue pas la confiance propagée des lignes survivantes (celles sauvées
  par une démonstration alternative gardent l'intervalle de leur démonstration principale).
- Vérifié : `tsc --noEmit` sans erreur sur ce dossier, modules servis en 200 par Vite, rendu et
  interactions exécutés sans navigateur (linkedom) ; **non vérifié visuellement** (pas de navigateur ni de
  capture sur cette machine).
