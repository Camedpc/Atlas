# R17 · Blueprint · blocs de raisonnement

Le schéma technique de R14 (feuille, règle des rangs, cartouche, repères B / D / H, code de trait) passé en
couleurs, dans le langage du Blueprint d'Unreal : boîtes « Comment » qui englobent plusieurs nœuds, fils
typés, broches, en-têtes de nœuds colorés. Jeu par défaut : **fontaine de chaîne** (niveau « Tout ») ;
`?jeu=edp` pour le jeu synthétique (niveau « Squelette »).

## Ce qui change par rapport à R14

- **Blocs de raisonnement** (`etapes.ts`) : les cadres ne suivent pas les sous-problèmes déclarés, ils sont
  calculés depuis le graphe de lecture (règle ci-dessous). Fond teinté à ≈ 5 %, barre de titre teintée à ≈ 13 %
  (`É3  CONDITIONS` en chasse fixe, puis le nom de la tête du bloc), contour fin, coins à 5 px ; piste
  abandonnée en tireté gris. Survol de la barre de titre ou de la ligne du panneau : le bloc passe devant, le
  reste s'atténue ; clic : cadrer le bloc. Réglage « blocs de raisonnement » pour les masquer.
- **Fils colorés par rôle de prémisse**, comme les fils typés d'Unreal : principale graphite (plus épais),
  auxiliaire ocre, technique brun, contexte gris tireté. Orthogonaux à coins arrondis, sans pointe : l'entrée
  est portée par la broche.
- **Broches** : une par liaison entrante sur le flanc gauche, colorée par la **famille de la source** (le
  « type de donnée » reçu : modèle, décision, lemme, énoncé, mesure, calcul, résultat) ; broche de sortie de
  la couleur de la carte, pleine si connectée, creuse sinon.
- **En-têtes pleins colorés par famille**, texte blanc (repère, type, validation) ; carte blanche à coins de
  3 px ; statut toujours par le trait (continu, tireté, barré), jamais par la couleur. Sélection et survol en
  orange (contour), amont de la lignée en encre.
- **Décisions en cartes** (plus de losange) : une ligne par alternative ; la retenue porte la broche de sortie
  (pleine), les rejetées une broche creuse, non connectée (`× Élan de la chaîne seule`).
- **Correction du défaut noté dans R14** : un choix de modélisation issu d'une décision (« Force de prise
  anormale ») reste dans le flux. Règle (`squelette.ts`, `estChoixDerive`) : un choix qui a au moins une
  prémisse principale ou auxiliaire « de travail » (décision, énoncé non admis) est de nature travail, et ses
  liaisons sortantes principales **et auxiliaires** sont gardées à tous les niveaux. On lit désormais sans
  rupture : observation → (piste abandonnée) → décision D1 → H « Force de prise anormale » → tension au point
  de prise → vitesse / hauteur → loi. « Estimer α » n'est plus isolée en marge : elle suit le choix et mène à
  la simulation. Seuls les choix sans prémisse restent dans la marge (bloc « Modèle »).
- **Rangs équilibrés** (`mise-en-page.ts`) : plus long chemin, puis chaque unité qui a des conséquences se place
  au plus tard, juste avant la plus proche (un puits garde son rang au plus tôt). Sans cela, les trois
  conditions aux bords tombaient aux rangs 0, 2 et 6 et leur cadre traversait tout le schéma. Les zones
  Outils / Étapes / Résultats de R14 disparaissent (les blocs les remplacent) ; la règle des rangs reste.
- **Cadres sans chevauchement** : dans chaque rang, les membres d'un bloc sont contigus (tri par bloc, puis
  barycentres) ; puis un balayage traite blocs et nœuds fictifs comme des objets rigides, dans l'ordre
  vertical : chacun se place sous ceux qui partagent ses colonnes, au plus près de l'alignement avec ses
  voisins (passes descendantes et montantes alternées, la dernière sans alignement garantit la légalité).
  Vérifié hors navigateur : 0 chevauchement cadre / cadre ou carte / cadre étranger, sur les deux jeux et les
  trois niveaux.
- Panneau ☰ : liste des blocs (pastille de couleur, repère, genre, tête, effectif), hypothèses à épingler,
  légende des familles (broches), des rôles (fils) et du code de trait. Palette claire et sombre en variables
  CSS (`--r17-f-*` familles, `--r17-r-*` rôles, `--r17-e-*` genres de blocs), reprise par la vue 3D (couches).

## Règle de regroupement (générique)

Elle ne lit que le type des nœuds, la piste (active / abandonnée), les liaisons de lecture et les rangs.

1. **Phase** de chaque unité : *modèle* (choix, hypothèse, définition, décision qui fixe un choix, marge des
   spécifications), *décision* (autre décision), *lemme* (lemme, assertion), *énoncé* (proposition,
   théorème, conjecture), *mesure* (expérience, observation, calcul, décision qui ne mène qu'à des mesures),
   *résultat*, *abandon* (toute la piste abandonnée, prime sur le type).
2. **Union** de deux unités de même phase si (a) une liaison les relie avec un écart de rang ≤ 1 (chaîne
   contiguë), (b) elles sont au même rang avec un enfant commun (prémisses parallèles d'une même conclusion),
   ou (c) au même rang avec un parent commun. La marge forme un seul bloc « Modèle ».
3. **Rattachements** : un bloc fait uniquement de résultats rejoint le bloc qui lui fournit le plus de
   prémisses (il conclut cette étape) ; une unité isolée rejoint le voisin avec lequel elle partage le plus de
   liaisons d'écart ≤ 2 (à égalité : celui d'où elle découle). Décisions et choix isolés restent hors cadre :
   ce sont des embranchements entre blocs. Les isolés restants ne sont pas encadrés.
4. **Genre et titre** par la phase dominante : modèle → Décision / Modélisation ; mesure → Confrontation (s'il
   y a une expérience ou une observation) / Calcul ; énoncé → Prédictions (si un énoncé du bloc est ensuite
   confronté à des mesures) / Conséquences ; lemme → Dérivation (lemmes enchaînés) / Conditions (lemmes
   parallèles) ; résultat → Conclusion. Sous-titre : la **tête** du bloc (membre majeur, puis le plus de
   liaisons sortantes, puis le plus de liaisons internes entrantes, puis le rang le plus élevé) ; pour une
   décision, son nom ; pour des conditions, ce qu'elles alimentent.

### Fontaine (niveau « Tout », 28 cartes, 30 liaisons)

| Bloc | Membres |
|---|---|
| É1 Modèle · 3 hypothèses de travail | souplesse, air négligé, arrivée au sol β (marge) |
| É2 Dérivation · Invariant le long de la chaîne | équation du mouvement, réduction statique, invariant, forme |
| É3 Piste abandonnée · Avec α = 0, pas de fontaine | l'élan suffit, pas de fontaine |
| É4 Décision · Origine de la fontaine | observation de Mould, décision, force de prise anormale |
| É5 Conditions · → Vitesse de la chaîne · Hauteur… | tension au point de prise, au sol, au sommet (même rang) |
| É6 Confrontation · Estimation de α | Estimer α, simulation, sol dur / mousse, β, films, h₁ ∝ h₂, v² ∝ h₂, α, explication |
| É7 Prédictions · Loi de la fontaine | vitesse, hauteur, loi h₁/h₂, contrôles de cohérence |

C'est exactement la lecture physique attendue (modèle, équation et invariant, conditions aux bords,
prédictions, confrontation, piste abandonnée), sans rien de codé pour ce jeu. Aux niveaux plus repliés, les
sous-systèmes de R14 absorbent des conditions (« + auxiliaires » : la condition au sommet est repliée dans la
hauteur ; « Squelette » : « Tension au point de prise », seule, rejoint les Prédictions et « Estimer α » reste
hors cadre).

### Jeu synthétique (EDP stochastique)

**Tient, en plus hétérogène.** Au squelette (39 cartes) : 11 blocs, dont « Dérivation · Schéma volumes finis
stochastique », « Décision · Ajouter la correction d'Itô », « Prédictions · Théorème de stabilité »,
« Piste abandonnée · Bilan : aucune vitesse de convergence », « Décision · Abandon de l'approche par
compacité », « Conclusion · Plan de l'article ». À « + auxiliaires » (87 cartes) : 18 blocs lisibles
(« Dérivation · Dissipation numérique dominante », « Confrontation · Ordre 1/2 observé »…). Défauts :
certains blocs mélangent lemmes et conjectures (« Prédictions · Estimation BV discrète »), la confrontation
numérique finale est un gros bloc de 15 cartes, et quelques axiomes restés visibles forment des isolés
« Modélisation » non encadrés. La règle suppose des types fiables : sur des données Atlas où le type est
deviné d'après l'identifiant, les phases seront plus bruitées.

## Limites

- **Non vérifié visuellement** (pas de navigateur sur cette machine) : `tsc` sans erreur dans ce dossier,
  modules servis par Vite (200), et la dérivation + mise en page exécutées hors navigateur sur les deux jeux
  (blocs ci-dessus, 0 chevauchement). À regarder en priorité : lisibilité de la barre de titre des blocs à
  l'échelle « tout voir » (≈ 0,5 : une seule ligne en 7,5 px), contraste de l'ocre auxiliaire à côté de
  l'orange de sélection, densité des broches quand une carte a 4 entrées ou plus.
- Le balayage pousse un bloc entier sous les blocs qui partagent ses colonnes : sur le synthétique, la feuille
  est haute (≈ 3 500 px à « + auxiliaires » contre ≈ 1 900 px avant balayage).
- Les longs fils entre blocs sont gardés (plus de renvoi en pentagone sauf pour les énoncés cités ≥ 4 fois) :
  ils peuvent longer plusieurs cadres.
- En 3D, feuille et cadres s'effacent ; cartes et fils restent.
- Le genre d'un bloc dépend de conventions de type (lemme vs proposition) : un agent qui écrit tout en
  « assertion » n'aura que des Dérivations et des Conditions.

## Idées

- Replier un bloc entier en une seule carte (comme un « collapsed graph » d'Unreal), broches d'entrée et de
  sortie du bloc sur ses bords.
- Laisser l'agent (ou Camille) renommer un bloc : le titre calculé devient une suggestion, le nom saisi est
  stocké comme un commentaire.
- Fils de réroutage (« reroute nodes ») aux traversées de cadres.
