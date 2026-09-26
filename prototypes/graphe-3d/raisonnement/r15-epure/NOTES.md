# R15 · Épure

La structure de R1 (squelette déductif : colonnes de gauche à droite, sous-arguments repliés en
étapes dépliables, contexte hors des flèches, décisions, choix de modélisation), mais un autre
langage visuel. R1 était jugé clair mais trop scolaire. R15 part d'Edward Tufte : le plus d'encre
utile possible, aucune décoration. Le résultat doit ressembler à une page de raisonnement bien
composée, pas à une interface.

## Ce qui change par rapport à R1

| R1 | R15 |
|---|---|
| Cartes blanches bordées, étiquette en capitales, ombres au survol | Texte posé sur la page, sans cadre. Rubrique en italique bas de casse (« lemme · IA ») |
| Statut ✓ ? ✕ coloré en haut à droite de la carte | Un seul caractère, à l'encre, suspendu dans la gouttière gauche de la première ligne |
| Trait d'intervalle de confiance au bas de la carte | Micro-graphique de 40 px dans la rubrique : échelle 0–1 à taquets, barre d'erreur, point d'estimation, valeur « 0,82 » |
| Pastilles colorées H D O A L + sous la carte | Appels de notes en exposant (« ³,⁷,¹² ») à la suite du texte. Le contexte est dans une colonne de **notes de marge** numérotées dans l'ordre de lecture, à droite des résultats |
| Renvois « (k) » dans des pastilles encadrées | Renvois « (k) » en corps réduit, comme des numéros d'équation. Le numéro de l'énoncé cité ouvre sa rubrique |
| Losange coloré de 38 px, alternative rejetée dans une pastille pointillée | Petit losange au trait où **le filet bifurque**. La branche abandonnée descend en pointillé gris léger jusqu'à l'alternative, écrite en italique gris et barrée |
| Drapeaux à queue d'aronde, 6 couleurs, bandes de couleur à gauche des cartes dépendantes | Choix en italique dans la marge gauche, avec un sigle suspendu **C1, C2…**. Au survol ou à l'épingle, le sigle s'inscrit dans la rubrique des énoncés qui en dépendent, et le reste s'estompe. Aucune couleur par choix |
| Accent bleu, ancêtres orange, descendants violets | **Une seule couleur d'accent** (rouge brique `#a3312a`) : survol, sélection (texte et filet souligné), lignée (ancêtres en trait plein, descendants un ton plus léger) |
| Arêtes de 1,35 px avec pointes pleines | Filets de 0,8 px, lissés par défaut, sans pointe (la lecture va toujours de gauche à droite ; les pointes restent disponibles en option) |
| Colonnes nommées en capitales, bandes de fond alternées, flèches « → » | Titres de colonnes en italique bas de casse, soulignés d'un filet pâle. Pas de fond |
| Police de l'interface (Inter) | Serif de livre (Palatino Linotype, sinon Palatino, Book Antiqua, Georgia) sur papier crème `#fffff8` |

La hiérarchie vient de la graisse et du corps (résultats majeurs en demi-gras, corps × 1,12), de
l'italique (choix, décisions, rubriques) et de l'espacement (gouttière de 18 px, colonnes).

## Fichiers

- `squelette.ts` : dérivation de R1 reprise telle quelle. Seuls les identifiants de stratégie
  changent (`r15-squelette`, `r15-auxiliaires`, `r15-tout`).
- `mise-en-page.ts` : mise en page de R1 (rangs par zone, barycentres, régression isotone, renvois,
  couloirs). Les boîtes deviennent des blocs de texte : le point d'ancrage est au milieu des lignes,
  le port droit au bout de la plus longue ligne (ou des appels) et le port gauche avant la gouttière.
  Les notes sont numérotées après placement (marge, rangs, hauteur). Les appels vont à la suite de
  la dernière ligne s'ils tiennent, sinon sur une ligne à eux ; leur largeur est réservée d'avance.
  La colonne des notes se prolonge sur une deuxième colonne si elle dépasse la hauteur de la page.
- `rendu.ts` : tout le dessin (calques dessous et dessus), et les cibles de survol (énoncés, appels,
  notes, branches abandonnées, choix).
- `main.ts` : réglages (dossier **Épure R15**), numéros de choix stables par id, marges de cadrage
  qui réservent la colonne des notes, fiche, panneau ☰ (niveaux, choix à épingler, légende).

## Réglages (Tweakpane, dossier « Épure R15 »)

Niveau de détail, mesure (largeur du texte, 118 px), écart des colonnes, interligne des énoncés,
corps (13 px), appels de notes max., notes de marge (oui / non), largeur des notes, filets lissés
ou orthogonaux, rayon des coins, épaisseur des filets, pointes de flèche, portée des choix (au
survol / toujours), branches abandonnées, titres de colonnes.

## Limites

- **Rien n'a été vu à l'écran.** Machine à court de mémoire : ni navigateur ni Playwright. Seuls
  `tsc --noEmit` et la transformation Vite (HTTP 200) ont été vérifiés. Les coordonnées fines
  (gouttière, décalage des exposants, position du micro-graphique) sont calculées, pas ajustées à
  l'œil. C'est le premier point à contrôler en capture.
- La colonne des notes élargit la page : au cadrage initial, le corps à l'écran est un peu plus
  petit que dans R1. On peut masquer les notes (réglage) ou réduire leur largeur.
- Mesure étroite (118 px) : la rubrique partage sa ligne avec le micro-graphique. La validation
  (IA, H) n'y figure que si elle tient ; un type long est tronqué. La fiche donne toujours tout.
- Les notes ne sont pas alignées sur leur appel (Tufte les aligne) : dans une page qui se déplace et
  se zoome, avec des appels répartis sur toute la largeur, on les empile dans l'ordre des numéros.
- La police dépend du système : Palatino Linotype sous Windows, sinon Georgia (moins « livre »).
- En 3D, les notes et les titres de colonnes s'effacent. Le texte reste projeté à plat.

## Idées

- Aligner chaque note sur la hauteur de son premier appel (régression isotone, comme la marge
  gauche) pour se rapprocher des notes de marge de Tufte.
- Petits multiples : une ligne de sparklines par sous-problème (évolution de la confiance dans le
  temps) sous la page.
- Numéroter les résultats (Théorème 1, Proposition 2…) dans la rubrique.
