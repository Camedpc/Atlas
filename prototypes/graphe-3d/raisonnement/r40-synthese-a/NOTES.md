# R40 · Synthèse (essai A)

Synthèse du cahier des charges de Camille : la figure LaTeX de R36, organisée en boîtes comme R18,
réductible comme R19, avec les hypothèses de R37, les graphiques clés de R35 et des niveaux de détail
selon le zoom. Thème clair. Jeu par défaut : fontaine de chaîne (`?jeu=edp` ou le sélecteur pour le jeu
synthétique). URL : `/raisonnement/r40-synthese-a/`.

## Ce qui vient de chaque vision

| Vision | Repris | Laissé |
|---|---|---|
| **R36** (base) | Computer Modern (fontes KaTeX), en-têtes « **Lemme 7** (nom). », formule display KaTeX extraite par la règle générique de R36 (`formules.ts`, inchangé), confiance `c = 0,91` avec bornes en exposant / indice et validation en pied, statut par le trait (plein, tireté, barré, pointillé gris), double cadre des résultats, copie décalée des sous-systèmes, losange des décisions et « × non retenu », bornes de contexte encadrées, renvois « cf. 7 », axe « rang logique *r* », accolades des zones, légende « Figure 1 – … » sous la figure, fiche et panneau booktabs, un seul bleu d'interaction | la mise en page par rangées de R14 (remplacée par celle de R18) |
| **R37** | Hypothèses de modélisation : un paragraphe `\newtheorem` — « **Hypothèse (ii)** (nom). » puis l'énoncé en *italique*, justifié — et « portée : n énoncés » en pied ; numérotation (i), (ii)… ; renvois « *sous (i), (iii)* » en bleu sur les blocs dépendants | le reste de R37 |
| **R35** | `graphiques.ts` (construction des figures, style pgfplots), `mesures.ts`, extraction des lois (`lois.ts` = `formules.ts` de R35) ; place réservée sous le bloc qui énonce la loi ; prédiction dans le bleu de la vision | l'affichage de toutes les figures, la barre d'erreur de confiance, le cartouche |
| **R18** | Boîtes des sous-problèmes **telles quelles** : rectangle teinté translucide, barre de titre colorée, contour fin, boîtes imbriquées « parent.enfant », boîte « Spécifications · modélisation », piste abandonnée hachurée ; teintes de R18 ; **placement boîte par boîte** sans chevauchement (mise en page seule, puis posée comme une pièce rigide), rangs « au plus tard » ; jeu fontaine avec les deux sous-problèmes imbriqués ; repli qui ne franchit pas une boîte | en-têtes colorés par famille, broches colorées par grandeur, formules Unicode (KaTeX à la place), feuille / cartouche |
| **R19** | Réduction = étape de dérivation (`groupes.ts`) : clic sur la barre de titre → nœud-fonction (broches ▶ d'entrée, ● de sortie, statut agrégé = le plus faible par le trait, maillon le plus faible $c_{\min}$), nouveau clic → redéploiement ; refus si la fusion créerait un cycle ; transition « fantômes » qui se resserrent ; « ouvrir ↗ » / double-clic sur un nœud-fonction → onglet (boîte seule + Entrée / Sortie) avec barre d'onglets et fil d'Ariane | couleur framboise des fonctions (le nœud-fonction est composé en noir et blanc, sa boîte garde sa teinte) |

Adaptations propres à R40 : une boîte imbriquée se réduit seule (avant son parent) ; déployer un parent
déploie ses imbriquées ; le fil d'Ariane passe par les boîtes parentes ; numéros F1… pour les boîtes réduites.

## Graphiques clés (règle générique, `graphiques.ts`)

Un graphique est **clé** s'il confronte aux mesures la loi d'un résultat principal :

1. Niveau de la loi : 0 si l'énoncé qui la porte est un résultat principal (théorème ou résultat non admis) ;
   1 s'il en est une prémisse principale directe ; 2 sinon.
2. Sont clés les figures du meilleur niveau présent (0, sinon 1, sinon une seule figure de niveau 2).
3. À niveau égal : points mesurés avant pente déclarée seule, puis le plus de points ; au plus N
   (réglage « graphiques clés max. », 2 par défaut, 1 à 3).

Les autres figures ne sont pas dessinées : le panneau ☰ les liste (case « afficher », mention « clé » ou
« à la demande »), la fiche du bloc les signale, et le réglage « graphiques » propose clés / tous / aucun.
Fontaine (vérifié en Node) : deux figures construites ; clé = *h₁ en fonction de h₂* sous « Loi de la
fontaine » (théorème, niveau 0) ; *v² en fonction de h₂* (« Vitesse de la chaîne », niveau 1) à la demande.
Jeu EDP : aucune loi confrontée à des mesures, donc aucun graphique.

## Niveaux de détail (rendu.ts, composition.ts)

`s` = pixels écran par px de mise en page (1 = taille nominale). Seuils réglables (dossier « Niveaux de
détail ») :

| Échelle | Affichage |
|---|---|
| `s < 0,34` (« seuil points ») | chaque bloc = petit carré plein de la couleur de sa boîte (losange pour une décision, carré cerné pour un résultat ou une boîte réduite) ; aucun texte ni HTML ; liaisons fines sans pointe ; titres des boîtes gardés lisibles (barre agrandie) ; légende masquée |
| `0,34 ≤ s < 0,66` (« seuil contenu ») | cadre du bloc (statut par le trait) et **titre seul** en texte canvas net (corps 9 à 12,5 px écran, coupé à la largeur et à la hauteur du cadre, « … » sinon) ; graphiques en cadre vide numéroté |
| `s ≥ 0,66` | contenu complet : HTML (formule KaTeX, confiance, validation), bornes, renvois, graphiques tracés |

- **Paresse** : aucun HTML n'est créé à la mise en page. Un bloc reçoit son HTML au premier affichage au
  niveau complet **et** visible à l'écran ; l'élément est mis en cache (clé : genre, membres, largeur, corps),
  détaché du DOM quand le bloc sort de l'écran ou repasse sous le seuil, réattaché ensuite. Le panneau
  affiche l'échelle, le nombre de blocs par niveau et le nombre de HTML créés / attachés.
- **Hauteurs** : estimées sans DOM (mesure canvas du titre en Computer Modern, formule display = 1,45 corps
  par ligne, 2,35 avec une fraction) ; la hauteur mesurée d'un bloc composé remplace l'estimation aux mises
  en page suivantes. Si le HTML dépasse son cadre, son corps est réduit (jusqu'à 70 %) : jamais de texte
  hors du cadre ; s'il est plus court, la formule est centrée et le pied reste en bas.
- Transitions : seulement celles de la vue (déplacement des blocs) et les fantômes de réduction de R19 ;
  le changement de niveau est immédiat, sans animation.

## Défauts corrigés

- **Hypothèses écrasées dans R36** : la classe `.r36-hyp` servait à la fois au bloc d'hypothèse et aux
  lignes du panneau (`display: flex`), ce qui mettait tête, corps et pied côte à côte. R40 utilise des
  classes distinctes (`.r40-hypothese`, `.r40-liste-hyp-ligne`) et la présentation de R37.
- **Cartouche sur le schéma** : pas de cartouche ; la légende est sous la figure, dans le monde.
- **Cadrage initial minuscule** : `cadrerTout` cadre les bornes exactes de la figure (axe et légende
  compris) ; si elle ne tient qu'à une échelle où les blocs seraient des points, il cadre le début du
  raisonnement (en haut à gauche) à l'échelle des titres. Fontaine « + auxiliaires » (niveau par défaut,
  comme R18) : ≈ 1 830 × 1 330 px de mise en page, donc cadrée entière au niveau « titres ».
- **Texte hors cadre** : HTML ajusté au cadre, titres canvas coupés et tronqués, titres de boîtes tronqués.

## Vérifié

- `npx tsc --noEmit` : aucune erreur dans le dossier.
- Vite (serveur existant, port 5180) : `index.html`, `main.ts`, `meta.json?import` et tous les modules en 200.
- Banc Node hors navigateur (bundle rolldown dans le scratchpad, canvas simulé) : fontaine et EDP, trois
  niveaux, déployé / chaque boîte réduite (dont les imbriquées) / tout réduit / onglets : aucune erreur de
  correspondance, boîtes de premier niveau disjointes, boîtes imbriquées dans leur parent, blocs disjoints,
  aucun bloc dans la boîte d'un autre sous-problème, numéros uniques. Réductions refusées pour cycle sur le
  jeu EDP (conv, num ; stab à certains niveaux), comme attendu.

## Non vérifié (pas de navigateur sur cette machine)

- Rendu réel : alignement HTML / cadres, qualité des estimations de hauteur (hypothèses longues, fractions),
  lisibilité des titres de boîtes à mi-distance, place de la barre d'onglets au-dessus de l'axe, taille des
  graphiques (corps 8,6 à 9,6 px de mise en page), fluidité du passage d'un niveau à l'autre.
- Au premier affichage complet, un bloc dont la hauteur estimée est trop faible voit son corps réduit ; il
  reprend son corps normal à la mise en page suivante (réduction, niveau, réglage), qui utilise la mesure.

## Limites

- Les seuils ne dépendent que de l'échelle, pas du corps choisi : avec un corps de 18 px, le niveau
  « complet » pourrait descendre plus bas (régler les seuils).
- Les estimations de hauteur ignorent la largeur des formules (réduites après coup, jusqu'à 60 %).
- Mêmes limites de dérivation que R14 / R18 (renvois qui cachent des flèches, liaisons entre boîtes qui
  peuvent traverser une autre boîte) ; en onglet, les réductions des autres boîtes sont ignorées.
- En 3D, boîtes, axe et légende s'effacent ; les blocs restent projetés à plat.
