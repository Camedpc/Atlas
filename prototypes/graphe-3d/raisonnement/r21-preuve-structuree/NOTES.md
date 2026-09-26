# R21 · Preuve structurée (direction D1)

Le raisonnement est écrit, pas dessiné : une preuve hiérarchique numérotée à la Lamport, en colonne de
lecture, avec une marge de vérification alignée ligne à ligne et une mini-carte en appoint. Page DOM
pure (pas de sigma). Spécification : `RECHERCHE-REPRESENTATION.md`, § 4 D1.

## Ce que montre la page (jeu synthétique)

| Élément | Chiffres |
|---|---|
| Fondations « Supposons » | 54 : H1–H7, M1–M6, D1–D20, A1–A6, T1–T10, L1–L5 |
| Entrées | 24 : 6 résultats (Th 1–2, Rés 1–4), 4 conjectures, 14 compléments (repliés) |
| Étapes numérotées ⟨k⟩n | 126, profondeur 11 |
| Décisions encadrées | 8 (Déc 1 dans « Supposons », sous M6 Euler–Maruyama) |
| Séries en tableau | 6 (29 mesures) : ordre non corrigé / corrigé, balayage CFL, amplitude du bruit, ordre faible, temps de calcul |
| Contrôles | 12 (vérifications symboliques, formalisations Lean) |
| Renvois croisés | 127 prémisses principales citées par numéro au lieu d'être redéveloppées |
| Rangées d'énoncés visibles à l'ouverture (profondeur 3) | 147 sur 200 |

## Choix

- **Dérivation** (`preuve.ts`, fonctions pures) :
  1. *Fondations* : hypothèses (H), choix de modélisation (M), définitions admises construites sur des
     fondations (D, point fixe), axiomes (A), lemmes admis (T, « outils »), théorèmes admis (L).
     Le schéma corrigé, construit par une décision, n'est pas une fondation : il devient une étape.
  2. *Entrées* : une par théorème / résultat non admis, dans l'ordre du graphe (ce qui est prouvé
     d'abord vient d'abord, comme un article), puis conjectures, piste abandonnée, compléments
     (énoncés que plus rien n'utilise comme prémisse principale).
  3. *Développement* : enfants = prémisses **principales** de la démonstration principale, ni
     fondations, ni résultats majeurs, ni déjà développées. Les enfants sont réservés niveau par
     niveau avant de descendre, pour qu'un énoncé partagé reste au niveau le moins profond ; ailleurs
     il est cité par son numéro.
  4. *Numérotation* : ⟨niveau⟩numéro, le compteur d'un niveau court sur toute l'entrée. **Écart à
     Lamport**, voulu : chez lui ⟨2⟩3 ne se comprend que dans la portée de son ⟨1⟩ ; dans un DAG on
     cite d'une branche à l'autre, il faut des numéros uniques dans l'entrée. Hors de son entrée, une
     étape se cite « Th 2 ⟨3⟩1 ». Décisions : Déc k, contrôles : Ctl k, dans l'ordre de lecture.
  5. *Décisions* : bloc encadré sous l'étape qu'elles conditionnent (premier usage), avant ses autres
     étapes ; leurs prémisses sont développées dessous. C'est ainsi que la piste de compacité
     apparaît, grisée, sous « Déc 3 · abandon », elle-même sous « Déc 2 · norme L² » de Th 2 : la
     raison d'une décision est visible à l'endroit où elle compte.
  6. *Séries* : ≥ 3 mesures sœurs de même type, produites chacune par une seule activité et sans
     autre usage, deviennent un tableau. Colonnes dérivées du texte : paramètre (`h = 1/32`,
     `θ = 0,5` extrait du nom), mesure `Ê^{1/2} = 0,0247 ± 2 %` découpée en valeur / ± quand toutes
     les lignes ont la même forme, activité. Les prémisses communes des activités sont développées
     sous le tableau (référence couplée, décision MLMC).
  7. *Contrôles* : calcul sans usage, une seule prémisse principale, le reste en contexte. Ils sont
     sortis de l'arbre et signalés sous l'énoncé contrôlé (« contrôlé par Ctl 6 ✓ »).
- **Ligne PAR** : toutes les prémisses de la démonstration principale, groupées par rôle
  (`par`, `aux.`, `tech.`, `ctx.`) et citées par numéro ; outils et littérature ajoutent leur nom
  court (« T1 Grönwall », « L1 Kuznetsov »). Le nom de la démonstration n'est ajouté que s'il n'est
  pas générique. Chaque renvoi est un lien : clic = défilement + fond gris 1,8 s (une fois),
  en dépliant ce qu'il faut ; survol = aperçu (numéro, type, titre, énoncé, statut, confiance).
- **Canaux séparés** : validité de la démonstration principale en glyphe dans la marge (✓ ? ✕,
  « adm. »), validation en texte (H, IA, IA+H), statut du nœud en petites capitales après le titre
  (incertain, réfuté), piste abandonnée en gris, confiance en trait d'intervalle 44 px sur une
  échelle 0–1 commune (repère à 0,5), nombre de démonstrations. Confiance lue par une seule fonction
  `confianceDe` (aujourd'hui sur le nœud, en base sur la démonstration).
- **Filets de portée** (boîtes de Fitch simplifiées) : une colonne de 16 px par choix M, filet gris
  de 1 px sur toute rangée qui dépend du choix dans le graphe complet (`dependantsDe`), étiquette
  « M3 » à chaque reprise du filet. Survol d'un M (en-tête, filet, renvoi) : portée surlignée ;
  clic : épinglée (Échap pour relâcher). Chaque M indique aussi sa portée calculée en nombre
  d'énoncés à côté de la portée déclarée.
- **Contradictions** en italique sous l'énoncé : « contredit Conj 1 (Ordre 1/2 sans correction) —
  résolu par Déc 4 », et l'inverse sous la conjecture (« contredit par Th 2 ⟨6⟩4 », « résolu par »).
- **Mini-carte** (à droite, masquée sous 1260 px) : pas la carte R1, mais le plan de la preuve
  elle-même : un point par rangée visible, x = niveau, arbre en traits fins, renvois croisés en
  arcs à droite (diagramme en arcs), losange = décision, couleur = validité (ocre à vérifier,
  brique invalide, gris piste abandonnée). Cadre de la fenêtre synchronisé au défilement, clic =
  aller. Choix : la carte sert à voir où l'on est et combien la preuve se cite elle-même, ce qu'une
  carte R1 (autre dérivation, autre moteur) ne dirait pas sans correspondance explicite.
- **Réglages** (barre) : profondeur ⟨1⟩…⟨11⟩ (défaut 3 ; remet les replis à zéro), démonstrations
  alternatives, provenance (auteur, origine, date, validation), mini-carte, tout déplier,
  réinitialiser. Mémorisés dans `localStorage` (`atlas-raisonnement:r21-preuve-structuree`).
  Fil d'Ariane de l'entrée courante dans l'en-tête figé.
- **Énoncés** : rendu semi-LaTeX maison (`x^{…}`, `x_{…}`, `x^2`, `u_K`) en `<sup>` / `<sub>`,
  sans `innerHTML`.

## Sources de la recherche utilisées

Preuves structurées de Lamport (§ 2.4 : numérotation, lecture à profondeur réglable) ; liste-clé de
Wigmore (§ 2.9 : fondations et contrôles numérotés à part) ; boîtes de Fitch (§ 2.5 : filets de
portée) ; Lean blueprint et GSN (§ 2.1, § 2.6 : dépendances d'énoncé vs de preuve, ici rôles `ctx.`
vs `par`) ; QOC / IBIS (§ 2.11 : alternatives rejetées gardées avec leur raison) ; PROV (§ 2.13 :
activités des séries, provenance) ; forest plot (principe 6 : intervalles sur échelle commune) ;
Equational Theories Project (§ 2.2 : vue d'ensemble + vue locale, ici mini-carte + texte).

## Données dérivées (absentes du modèle)

Tout est calculé de façon déterministe dans `preuve.ts` : familles de fondations, entrées,
numérotation, séries (paramètre et mesure extraits par expressions régulières du nom et de
l'énoncé), contrôles. Rien n'est ajouté au modèle. En base, un drapeau « contrôle » et des champs
`parametre` / `valeur` / `incertitude` sur les observations rendraient les tableaux robustes.

## Vérifications

- `npx tsc --noEmit` : aucune erreur dans ce dossier ; modules servis par Vite (200).
- Test de fumée hors navigateur (bundle esbuild + DOM `linkedom` dans le scratchpad) : les 224 nœuds
  sont placés exactement une fois, 521 renvois, « aller à » déplie les ancêtres. La mise en page
  réelle (hauteurs, mini-carte, en-tête figé) n'a **pas** été vue dans un navigateur.

## Limites

- Le DAG reste un DAG : 127 renvois croisés. Le premier usage en profondeur d'abord décide où un
  énoncé partagé est développé ; certaines places sont discutables (l'optimalité de l'ordre 1/2,
  auxiliaire de Rés 2, est développée dans le complément C 13 qui l'utilise comme prémisse
  principale ; la campagne non corrigée descend jusqu'au niveau 10 de Th 2, sous la décision de
  correction). Un placement au plus petit ancêtre commun serait plus juste mais moins prévisible.
- Seules les prémisses principales font l'arbre : une prémisse auxiliaire importante n'est pas
  développée sous son résultat.
- Les séries reposent sur des conventions de texte (« h = 1/32 », « X = v ± e ») ; sinon le tableau
  retombe sur une colonne « mesure » en texte libre.
- Profondeur 11 : l'indentation (22 px par niveau) mange la ligne au-delà du niveau 8 ; le curseur
  de profondeur et les replis sont la réponse, pas une mise en page plus compacte.
- Largeur fixe (~1060 px sans carte) ; pas de thème sombre (charte claire imposée).
