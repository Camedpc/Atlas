# R24 · Registre de la démarche

Direction **D4** de `RECHERCHE-REPRESENTATION.md` : la recherche lue comme une suite de décisions
datées. C'est la seule vision de la série où l'axe horizontal est le **temps** (création des nœuds),
et non la profondeur logique. Elle répond à la question : *qu'a-t-on décidé, quand, contre quelles
options, et avec quelles conséquences ?*

Page autonome, rendue en SVG, sans sigma : la frise est un diagramme de lignes, pas un graphe
nœud-lien, et le texte (identifiants, questions, options) doit rester net et mesurable.

## Ce qu'on voit

- **Lignes** : une ligne de 2 px par sous-problème, dans l'ordre de `SOUS_PROBLEMES` (Cadre, SP1,
  SP2, SP3, piste abandonnée). La ligne va de la première à la dernière date de ses nœuds. La piste
  abandonnée est en tirets, avec une butée ⊣ à la date de la décision qui la clôt (« close par D2 »).
  La gouttière donne le nom, le résumé et le compte « jalons · mineurs ».
- **Jalons** : 51 jalons, qui couvrent 107 des 224 nœuds (une campagne en regroupe jusqu'à 12). Les formes suivent D4 : losange = décision, cercle plein =
  théorème ou résultat, cercle creux = proposition (en tirets pour une conjecture), ovale =
  observation, carré = expérience ou calcul, double carré = **campagne**. Le contour code le statut :
  encre = validé, ocre = incertain, brique barrée = réfuté. Une piste abandonnée est grise en tirets.
  Sous chaque énoncé, le **mini-intervalle de confiance** (24 px, échelle 0–1 commune) est la seule
  autre marque.
- **Nœuds mineurs** : les 117 autres nœuds sont des **tirets de densité** sous la ligne, à leur date
  exacte, survolables et cliquables. Rien n'est caché.
- **Décisions** : la question est en italique au-dessus du losange (si la place le permet), et
  l'identifiant avec le nom de la décision (qui formule l'option retenue) sur la ligne. La ligne
  continue sur l'option retenue. Les options **écartées** partent en embranchements obliques gris
  terminés par ✕ et leur libellé ; au survol, leur raison.
- **Choix de modélisation** : des bannières « M3 Volumes finis décentrés amont » plantées à leur
  date sur la ligne Cadre, empilées sans chevauchement. Un **filet vertical pointillé** relie chaque
  décision aux choix qui la contraignent, étiqueté par leurs identifiants (D7 ← M4 Stratonovich,
  D8 ← M1, M5).
- **Contradiction** : un arc brique en tirets va de O14 « Pente 0,26 » vers C2 « Ordre 1/2 sans
  correction », plus tôt dans le temps (⊣ à l'arrivée), puis un arc encre de D7 « Ajouter la
  correction d'Itô » vers C2 (⊢ au départ). La boucle obs → conjecture → décision se lit comme un
  motif. L'arc « abandonne » D2 → C1 est gris.
- **Correspondances** : une courbe grise fine relie un jalon au jalon amont le plus proche d'une
  **autre** ligne (22 courbes). Elle est **en tirets** quand la prémisse est plus récente que la
  conclusion : une démonstration révisée après coup (par exemple S3 « Balayage CFL » → T6
  « Théorème de stabilité »).
- **Numérotation citable** : chaque nœud reçoit un identifiant par type, dans l'ordre chronologique
  (D1…D8, M1…M6, T6, P3, O14, S1…S9 pour les campagnes). Ces identifiants sont utilisés partout :
  frise, panneau, registre, liste-clé (le principe de la liste-clé de Wigmore).

### Panneau de décision (clic sur un losange ou une ligne du registre)

1. **Options × critères** (QOC) : les options en colonnes (la retenue en gras), les critères en
   lignes, avec ✓ ✕ —. Les critères **déterminants** (ceux que cite la raison globale) sont marqués.
   Viennent ensuite le solde ✓ − ✕ par option, la raison de chaque option et une **vérification de
   cohérence** : l'option retenue est-elle au moins aussi bien placée que les autres sur les critères
   déterminants ? Survoler une cellule montre la proposition de la raison dont elle est tirée.
2. **Motifs × options** (ACH) : les prémisses de la décision en lignes (avec leur rôle), les options
   en colonnes, marquées + / − / ·. Une colonne indique la **diagnosticité** : une prémisse qui marque
   toutes les options de la même façon ne départage rien. Survoler une cellule montre les mots
   partagés.
3. **Portée** : le nombre de nœuds qui dépendent de la décision (`dependantsDe`, transitif), leur
   répartition par statut et par ligne, les jalons et les résultats touchés, et un bouton « Montrer
   la portée sur la frise ». Exemples : D1 porte sur 150 nœuds ; D7 sur les 63 nœuds de toute la fin
   du projet.

Un clic sur un autre jalon ouvre sa fiche : énoncé, auteur et origine, statut et validation,
intervalle de confiance gradué, démonstrations (prémisses groupées par rôle, cliquables), liens, et
les jalons d'autres lignes en amont ou en aval. Pour une campagne, la fiche donne le tableau
réglage × observation (par exemple h, Ê^{1/2} ± % pour S4 et S7). Sans sélection, le panneau montre
la légende et la **liste-clé** des jalons, par ligne.

### Interactions

- **Survol** : fiche courte ; la lignée complète (amont + aval, graphe de justification) reste
  pleine, le reste passe à 20 % ; les tirets concernés foncent.
- **Clic** : sélection épinglée, panneau. `Échap` défait, dans l'ordre : portée, sélection,
  fenêtre, curseur.
- **Rejouer** : le curseur « État au » (ou un clic sur l'axe) voile tout ce qui est postérieur à la
  date. L'en-tête résume l'état à cette date : nœuds, décisions, **contradictions ouvertes** (O14
  contredit C2 le 26 juin : 1 ouverte jusqu'à D7 le 28 juin), pistes closes. Le curseur est manuel,
  sans animation.
- **Fenêtre** : glisser sur l'axe délimite une période, qui filtre le registre sous la frise.
- **Échelle** :
  - *Par activité* (défaut) : une déformation monotone du temps, commune à toutes les lignes. Les
    périodes sans aucun nœud créé au-delà de 3 jours sont repliées (marque `//` et durée réelle :
    6 j, 11 j, 5 j). Deux jalons d'une même ligne restent espacés d'au moins 22 px. Environ 55 % de
    la largeur reste proportionnelle au temps. Les graduations (jours, lundis) sont posées aux
    **vraies** dates : l'axe est non uniforme, pas faux.
  - *Calendaire* : l'axe est linéaire. Les jalons trop proches sont décalés, et leur vraie date est
    marquée sur la ligne par un petit repère relié au glyphe.
- **Registre** sous la frise : une ligne par décision, avec le numéro, la date et le jour, la ligne,
  la question, l'option retenue, les options écartées, les critères déterminants (et un signal
  « incohérent » si la retenue ne domine pas), les choix contraignants, la portée et l'auteur. Un
  second tableau liste les contradictions, résolutions et abandons, avec leur délai (« 15 j après »).
  Les lignes postérieures au curseur sont grisées.
- Les préférences (échelle, cases à cocher) sont mémorisées localement ; la page fonctionne sans.

## Comment c'est dérivé (déterministe, sans annotation ajoutée)

`modele.ts` :

- **Campagnes** : on regroupe au moins 3 expériences ou calculs non admis de même ligne, de même type
  et de même **souche de nom** (« MLMC, h = 1/64 (corrigé) » donne « MLMC, h (corrigé) » ; la
  souche s'arrête au premier chiffre, au « = » ou au « : »). Une observation dont toutes les
  prémisses principales sont dans la campagne y est absorbée. On obtient 9 campagnes : balayage CFL
  ×6, MLMC non corrigé ×5, MLMC corrigé ×5, sensibilité au bruit ×4, erreur faible ×4, temps de
  calcul ×5, vérifications symboliques ×4 (deux fois), formalisation Lean ×3.
- **Jalons individuels** :
  - les décisions et les choix ;
  - les théorèmes et résultats non admis ;
  - les propositions et conjectures ;
  - les observations prémisses principales d'un énoncé ou d'une décision ;
  - les expériences et calculs prémisses principales d'une conclusion (décision, théorème,
    résultat, proposition, conjecture) ;
  - tout énoncé qui motive une décision ;
  - tout nœud porteur ou cible d'un lien sémantique.
- **Correspondances** : on remonte les prémisses principales et auxiliaires de la démonstration
  principale à travers les nœuds mineurs, jusqu'au premier jalon rencontré. On garde le lien s'il
  est sur une autre ligne. Les choix sont exclus : ils passent par les contraintes.
- **Contraintes** : ce sont les choix de modélisation parmi les prémisses (tous rôles) à distance
  au plus 2 d'une décision.
- **Confiance** : lue par une seule fonction, `confianceDe(n)`, pour basculer sur la confiance de la
  démonstration principale quand elle existera.

`criteres.ts` : `InfoDecision` n'a pas de critères. On les **extrait des raisons** par un lexique
fixe de 7 critères formulés positivement :

- coût de calcul ;
- ordre et précision ;
- compatibilité avec l'acquis ;
- sans condition supplémentaire ;
- simplicité et lisibilité ;
- généralité et portée ;
- faisabilité et fiabilité.

Chaque critère a un motif de reconnaissance et des indices de polarité (« prohibitif » → ✕, « peu
coûteux » → ✓, « sans ordre » → ✕…). Quand la raison cite le critère sans le qualifier, la polarité
est déduite du statut de l'option (retenue → ✓, écartée → ✕). La cellule le signale par un astérisque,
pour ne pas faire passer une déduction pour une évaluation. Un critère est **déterminant** s'il est
reconnu dans la raison globale de la décision.
Sur le jeu synthétique, les 8 décisions ont entre 2 et 5 critères reconnus ; toutes sont cohérentes.

**ACH** : on ne retient que les prémisses **principales et auxiliaires**. Le contexte et la technique
donnent son sens à la décision, ils ne départagent pas les options (principe « deux dépendances »).
Une marque − signifie que la prémisse partage du vocabulaire (mots d'au moins 5 lettres, sans
accents, liste de mots vides) avec l'option écartée, donc qu'elle motive son rejet. Une marque +
signifie que la décision repose sur la prémisse pour l'option retenue. Exemple, D2 : « O2 Bilan :
aucune vitesse de convergence » est − pour la compacité (mots partagés : convergence, compacité,
ordre), + pour l'estimation directe et · pour Kružkov.

## Sources de la recherche utilisées

- **QOC** (MacLean) et **IBIS** (§2.11) : question → options → critères ; la table options × critères
  et la trace des options rejetées.
- **ACH** (Heuer, §2.12) : la matrice motifs × options et la diagnosticité.
- **VisTrails** et **PROV** (§2.13) : la bifurcation comme événement de l'historique ; les
  expériences et calculs comme activités, groupés en campagnes.
- **Storylines**, **metro maps of science** (Shahaf, Guestrin) et **Sugiyama** (§2.18) : une ligne
  par fil, qui converge sur des jalons partagés (ici par les correspondances).
- **Wigmore** (§2.9) : identifiants courts et liste-clé à côté du schéma.
- **Lean blueprint** et **GSN** (§2.1, §2.6) : le contour en tirets pour le non démontré (conjecture)
  et le contexte qui n'est pas un trait (les tirets de densité ne sont pas des arêtes).
- **Forest plot** (§3, principe 6) et Boukhelifa 2012 (§2.19) : l'intervalle sur une échelle commune
  plutôt qu'une teinte, et les tirets pour l'incertain.
- **DSM** (§2.15) : les liens qui remontent le temps sont des révisions, marquées en tirets.

## Écarts assumés par rapport à D4

- **Échelle par activité** : D4 demande un axe temporel à graduations hebdomadaires et prévoit une
  « échelle compressée ». Je l'ai faite par défaut, car les données synthétiques ont trois trous
  (dont un de 11 jours) et des rafales (9 jalons en 6 jours sur SP2). Elle garde les vraies dates
  sur l'axe. Le mode calendaire reste disponible.
- Les **options écartées** ne portent leur libellé que si la place le permet ; sinon, seulement la
  lettre de l'option (a, b, c), et le texte complet au survol, dans le panneau et dans le registre.
  Même règle pour la question et les titres des jalons : l'identifiant est toujours affiché, le titre
  est tronqué à la place disponible jusqu'au jalon suivant.
- Le bouton « montrer dans D2 » de la spécification devient « Montrer la portée sur la frise »
  (il n'y a pas de vue D2 liée). La fenêtre temporelle filtre le registre, pas d'autres vues.
- Les stations sont les jalons définis ci-dessus, et non le squelette de R1 (dépendance entre visions
  évitée) ; les règles sont proches.

## Limites

- **Critères et motifs sont heuristiques.** Le lexique est calé sur le vocabulaire du jeu
  synthétique (coût, ordre, compatible, exige…). Sur de vraies raisons rédigées par des agents, il
  manquera des critères et il y aura des faux positifs. C'est pourquoi chaque cellule montre son
  extrait et chaque déduction son astérisque. L'ACH lexical est plus fragile encore : un mot partagé
  n'est pas une implication logique.
- **Rejouer ne montre que l'existence**, pas l'état passé : le statut, la validation et la confiance
  affichés sont ceux d'aujourd'hui (le modèle ne les historise pas). Seules les contradictions
  ouvertes ou résolues sont vraiment recalculées à la date.
- **Dates en rafales** : en base, un tour d'agent crée des dizaines de nœuds à la même minute.
  L'échelle par activité écarte les jalons, mais l'ordre intra-rafale n'a pas de sens temporel ; il
  faudrait un axe par **tour** (voir ci-dessous).
- **Lignes = sous-problèmes déclarés.** Sans `sous_probleme` (données réelles actuelles), tout tombe
  dans une ligne « Autres » : la vision perd son intérêt.
- Les **correspondances** partent en courbes fines : au-delà d'une trentaine, elles forment un
  voile. Une case permet de les masquer.
- Pas de 3D, pas de sigma : la vision ne réutilise ni `creerVueRaisonnement`, ni ses raccourcis `T`
  et `L`, ni `window.rsnVue`. Le script de capture commun ne s'applique pas tel quel ;
  `window.r24` expose le registre et l'état.
- La mise en page est dimensionnée pour un écran large (frise de 960 px au minimum, panneau de
  420 px) ; sous 1 100 px, le panneau passe sous la frise, qui défile horizontalement.

## Ajouts de modèle nécessaires

Dans `InfoDecision` (et le JSON `decision` en base) :

```ts
interface InfoDecision {
  // … existant
  criteres?: { id: string; libelle: string; determinant?: boolean }[]
  /** Évaluation explicite option × critère, écrite par l'agent qui décide. */
  evaluations?: { option: string; critere: string; valeur: 'favorable' | 'defavorable' | 'neutre'; justification?: string }[]
  /** Motifs ACH : ce que chaque prémisse dit de chaque option. */
  motifs?: { premisse: string; option: string; relation: 'coherent' | 'incoherent' | 'non_pertinent' }[]
  /** Choix de modélisation qui contraignent la décision (au lieu de la distance ≤ 2). */
  contraintes?: string[]
}
```

Ailleurs :

- `noeuds.tour_id` (ou `execution_id`) : l'échelle « par tour d'agent », indispensable pour les
  vraies données.
- L'historique des statuts et des verdicts (le journal les contient déjà, action `verdict`) : c'est
  lui qui rendrait « Rejouer » exact sur la validité et la confiance.
- `noeuds.sous_probleme` (déjà listé dans `donnees.ts`), et une **campagne explicite**
  (`campagne_id` ou un protocole partagé) : cela remplacerait l'heuristique de souche de nom.
- La confiance sur la démonstration (déjà en base) : il suffit de changer `confianceDe`.

## Vérifications

- `npx tsc --noEmit` : aucune erreur dans le projet entier.
- Vite (5180) répond 200 sur `index.html`, `main.ts` et chaque module du dossier (transformés sans
  erreur).
- Exécution sans navigateur (bundle rolldown + faux DOM, dans le scratchpad) :
  - construction du registre ;
  - mise en page dans les deux échelles à 1 180 px ;
  - dessin complet de la frise, avec curseur, fenêtre, focus et sélection (environ 900 éléments) ;
  - panneau de chaque jalon et de chaque nœud mineur, infobulles, registre.

  Aucune exception. Les tables QOC et ACH des 8 décisions ont été relues à la main.
- **Non vérifié** : le rendu réel dans un navigateur (pas de navigateur ni de Playwright, faute de
  mémoire). Chevauchements résiduels de libellés, lisibilité des bannières empilées, comportement
  exact du glisser sur l'axe et de l'infobulle : à regarder à la première ouverture.
