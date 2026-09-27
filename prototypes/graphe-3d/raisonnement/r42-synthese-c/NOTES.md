# R42 · Synthèse (essai C)

Cahier des charges de synthèse de Camille : la figure LaTeX classique de R36, avec les hypothèses de R37,
les graphiques de R35 (seulement les graphiques clés), les boîtes de R18, la réduction de R19 et des
niveaux de détail selon le zoom. Thème clair seulement. Jeu par défaut : fontaine de chaîne (sélecteur en
haut à gauche ; `?jeu=edp` pour le jeu synthétique). URL : `/raisonnement/r42-synthese-c/`.

## Ce qui vient de chaque vision

| Vision | Repris | Où |
|---|---|---|
| **R36** (base) | Computer Modern (fontes KaTeX), en-têtes amsthm « **Lemme 7** (nom). », formule display KaTeX centrée (règle d'extraction inchangée), confiance `c = 0,82` avec bornes en exposant / indice et validation en pied, statut par le trait (plein, tireté, barré, pointillé gris), double cadre des résultats, copie décalée des sous-systèmes, losange des décisions et alternative ×, bornes de contexte encadrées, renvois « cf. 7 », axe « rang logique *r* », accolades des zones, légende « Figure 1 – … » sous la figure, fiche et panneau booktabs, noir sur blanc et un seul bleu (#1c4fa0) pour l'interaction | `formules.ts` (copie), `composition.ts`, `rendu.ts`, `style.css` |
| **R37** | Hypothèses de modélisation composées comme un `\newtheorem` : « **Hypothèse (ii)** (nom). *énoncé en italique* », portée « portée : n énoncés » à droite, numérotation (i), (ii)… ; repères « *sous (i), (iii)* » en bleu sur les blocs qui en dépendent | `composition.ts` (`construire`), `mise-en-page.ts` (numérotation), `formules.ts` (`romain`) |
| **R35** | Construction générique des figures (loi extraite d'un énoncé × séries `mesures` ou pente déclarée, paramètres lus dans des énoncés indépendants des mesures, bande ±1σ), style pgfplots, légendes avec renvois ; champ `mesures` | `graphiques.ts`, `lois.ts` (copie de `formules.ts` de R35), `mesures.ts` |
| **R18** | Boîtes des sous-problèmes **telles quelles** : rectangle teinté translucide, barre de titre colorée plus soutenue, contour fin, piste abandonnée hachurée et tiretée, teintes `TEINTES_COMMENTAIRES`, boîtes imbriquées « parent.enfant » ; mise en page **par boîte** (chaque boîte composée seule puis posée comme une pièce rigide, sans chevauchement), rangs « au plus tard », points de passage des liaisons longues ; repli qui ne franchit pas une frontière de sous-problème ; jeu fontaine à sous-problèmes imbriqués | `mise-en-page.ts`, `rendu.ts` (`dessinerCommentaires`), `squelette.ts`, `jeu-fontaine.ts` |
| **R19** | Réduction d'une boîte en nœud-fonction par une étape de dérivation (correspondance exacte, refus si cycle) : clic sur la barre de titre (▾) → nœud-fonction à broches d'entrée ▸ / de sortie •, statut agrégé (le plus faible) par le trait, maillon le plus faible en pied ; nouveau clic (▸) → redéploiement. « ouvrir ↗ » (ou double-clic sur un nœud-fonction) → onglet : la boîte seule avec ses Entrées et ses Sorties, fil d'Ariane sous la barre d'outils (× ou clic sur la racine pour revenir) | `groupes.ts`, `main.ts`, `rendu.ts` (`dessinerFonction`) |

Adaptations : le nœud-fonction de R19 perd son en-tête framboise (noir sur blanc, « **Sous-graphe G1** (nom). »,
« cf. 7 » sur les broches, `c` en italique mathématique) ; la réduction et l'onglet acceptent les boîtes
imbriquées (appartenance par préfixe « parent. », parents traités avant leurs boîtes imbriquées) ; les
graphiques sont étiquetés (a), (b) comme des sous-figures de la Figure 1 (la légende les cite).

## Défauts corrigés

- **Texte des hypothèses écrasé (R36)** : la classe `.r36-hyp` servait à la fois au bloc d'hypothèse dans la
  figure et aux lignes de la liste du panneau (`display: flex`) ; le bloc devenait une rangée flexible et
  son en-tête, son corps et son pied s'écrasaient côte à côte. Classes distinctes (`.r42-hyp` pour le bloc,
  `.r42-liste-hyp-item` pour le panneau). La marge des hypothèses est en plus empilée strictement (plus de
  régression isotone suivie d'un plancher qui pouvait faire se recouvrir deux blocs).
- **Cartouche qui recouvre le schéma** : pas de cartouche ; légende de figure sous la figure, dans le monde.
- **Cadrage initial minuscule** : `cadrerTout` cadre les bornes exactes de la figure (axe au-dessus, boîtes,
  graphiques, légende mesurée dessous), sans la réserve de 150 px à droite de la vue ni les marges
  fantômes de R36. Sur la fontaine (squelette), la figure fait ≈ 1 830 × 990 px de mise en page : sur un
  écran de 1 600 × 900, l'échelle initiale est ≈ 0,7 (niveau complet).
- **Texte qui déborde de son cadre** : le bloc HTML a la hauteur de son cadre ; s'il est plus grand, la
  formule puis le corps sont réduits (jusqu'à 60 % et 70 %), puis coupé (`overflow: hidden`). Au niveau
  « titre », le texte est coupé au canevas et découpé (clip) au cadre.

## Graphiques clés (règle générique, en tête de `graphiques.ts`)

1. Admissible : la figure confronte la loi à des **mesures** (une série d'au moins 3 points).
2. Score : +4 si la loi est énoncée par un résultat majeur (théorème ou résultat non admis), +2 si un
   résultat majeur en dépend, +1 si une pente déclarée recoupe les mesures, + points / 100.
3. On garde les `max` meilleures (réglage « graphiques clés », **2** par défaut, 3 au plus), une par couple
   (X, Y). Les autres sont listées dans le panneau ☰ (« à la demande », case à cocher : la mise en page leur
   réserve alors la place sous leur bloc). Jamais de graphique sous un nœud-fonction.

Fontaine : deux figures construites, toutes deux clés — (a) *v²* contre *h₂* (score 3,07 : « Vitesse de la
chaîne » mène au théorème, pente déclarée) et (b) *h₁* contre *h₂* (5,07 : loi de la fontaine, un théorème).
Le cas « à la demande » ne se présente donc pas sur ce jeu (il se présenterait avec `graphiques clés` = 1).
Jeu EDP : aucune loi confrontée à des mesures, aucun graphique.

## Niveaux de détail (zoom)

Échelle *s* = pixels d'écran par pixel de mise en page (1 = corps 13 px à l'écran). Seuils réglables
(dossier « Niveaux de détail (zoom) ») :

| Échelle | Niveau | Dessin |
|---|---|---|
| *s* < **0,28** | point | un carré plein (3 à 10 px) de la couleur de la boîte du bloc (losange pour une décision), liaisons prolongées jusqu'au centre, sans pointes ni jonctions ; boîtes et titres de boîtes (si ≥ 6,5 px) ; ni texte de bloc, ni KaTeX, ni légende, ni liens sémantiques |
| 0,28 ≤ *s* < **0,5** | titre | cadres complets (statut par le trait, double cadre, pile), numéro en gras et titre au canevas en corps × 1,5, coupés et découpés au cadre ; graphiques réduits à leur cadre et leur étiquette ; pas de KaTeX |
| *s* ≥ 0,5 | complet | composition HTML (en-tête, formule KaTeX, confiance, validation), bornes, renvois, repères « sous (i) », graphiques pgfplots |

- **Paresse** : l'élément HTML d'un bloc (et son KaTeX) n'est construit que quand le bloc est à l'écran
  (marge de 40 px) **et** au niveau complet ; il est ensuite gardé en cache (clé : contenu, numéro, largeur,
  corps, présence de KaTeX) et seulement masqué quand il n'est plus nécessaire. Un bloc hors écran n'est
  ni dessiné ni composé. Le panneau ☰ affiche le nombre de blocs à chaque niveau et le nombre d'éléments
  HTML en cache et construits.
- **Hauteurs** : la mise en page a besoin des hauteurs avant tout rendu ; elle prend la hauteur **mesurée**
  si le contenu a déjà été composé, sinon une **estimation** (en-tête coupé au canevas avec KaTeX_Main,
  formule comptée d'après son LaTeX : 1,35 em par ligne, 2,6 em avec une fraction). L'écart éventuel est
  absorbé par l'ajustement au cadre ; la hauteur mesurée sert à la mise en page suivante.
- Transitions : changement de niveau instantané ; seules restent les transitions de la vue (dépliage,
  réduction). Aucune animation en boucle.

## Vérifié

- `npx tsc --noEmit` : aucune erreur (projet entier).
- Vite sert `index.html`, `main.ts`, tous les modules et `meta.json?import` (HTTP 200) ; `meta.json` valide.
- Hors navigateur (Node, bundle rolldown dans le scratchpad, canevas simulé) : dérivation + mise en page
  sur la fontaine aux trois niveaux, sans réduction / une boîte réduite / une boîte imbriquée réduite /
  tout réduit / onglets `bords` et `pred.mesures`, et sur le jeu EDP (squelette, tout, tout réduit) :
  correspondance exacte partout, **aucun chevauchement** entre boîtes de premier niveau ni entre blocs,
  aucun bloc dans la boîte d'un autre sous-problème. Réductions refusées pour cycle sur EDP (`conv`, `num`,
  parfois `stab`) : le panneau désactive le bouton et la barre le dit au survol.

## Non vérifié / limites

- **Rien n'a été vu dans un navigateur** (consigne : pas de navigateur sur cette machine). À regarder en
  priorité : alignement de la couche HTML sur les cadres, justesse des hauteurs estimées au premier
  affichage (espace vide sous la formule si l'estimation est trop haute), lisibilité du niveau « titre »
  près des seuils, titres des boîtes à petite échelle, fil d'Ariane sous la barre d'outils.
- Au premier affichage, KaTeX et les fontes arrivent du CDN : tout est recomposé à leur arrivée (cache vidé).
- Une boîte imbriquée ouverte en onglet se présente comme une boîte de premier niveau ; une boîte réduite
  en onglet n'est pas reproduite (l'onglet montre toujours les énoncés).
- La réduction ne relance pas la réduction transitive (une broche peut doubler un chemin), comme R19.
- Liaisons entre boîtes : elles peuvent traverser une autre boîte (jamais un bloc), comme R18.
- En 3D, figure, boîtes et légende s'effacent ; les blocs restent projetés à plat.
