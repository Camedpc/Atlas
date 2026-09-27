# R16 · Blueprint · sous-problèmes

Variante en couleurs de R14 (schéma technique), dans le langage du Blueprint d'Unreal Engine : chaque
sous-problème est entouré d'une **boîte « Comment »**, les blocs prennent un **en-tête plein à la couleur
de leur famille**. Demande de Camille : garder la précision du plan d'ingénieur, ajouter des couleurs et
des rectangles qui englobent plusieurs nœuds. Outil scientifique, pas assistant pédagogique.

Jeu par défaut : **fontaine de chaîne** (`jeu-fontaine.ts`) ; `?jeu=edp` (ou le sélecteur JEU) pour le jeu
synthétique. Réglages mémorisés séparément par jeu.

## Ce qui change par rapport à R14

- **Mise en page en bandes** (`mise-en-page.ts`) : chaque sous-problème occupe sa propre bande
  horizontale, donc les boîtes ne peuvent pas se chevaucher (vérifié hors navigateur sur les deux jeux,
  les trois niveaux et les trois ordres : aucune boîte ne recoupe une autre, chaque bloc est dans sa
  boîte et dans aucune autre). Les **rangs logiques restent globaux** : la colonne R3 est la même dans
  toutes les bandes, la progression gauche → droite traverse les sous-problèmes.
  - Ordre dans un rang : bande d'abord, puis barycentres (inchangés). Nœuds fictifs des liaisons longues
    rangés dans la bande de la **source** : la liaison court dans sa bande, puis descend (ou monte) dans
    celle de la cible au dernier canal.
  - Hauteurs : PAV par (rang, bande), attiré seulement par les voisins de la même bande ; puis
    empilement des bandes (barre de titre 24 px, marges 14 px, écart réglable).
  - Marge (spécifications, décisions sans prémisse) découpée de même : chaque spécification se range
    dans la bande de son sous-problème (« Estimer α » tombe dans SP2).
  - **Ordre des bandes** (réglage) : ordre du jeu ; *jeu, pistes abandonnées au plus court* (défaut :
    SP1 → SP2 → SP3 gardent leur ordre, la piste abandonnée s'insère là où ses liaisons sont les plus
    courtes, ici entre le cadre et SP1, juste sous la décision qu'elle motive) ; *liaisons les plus
    courtes* (permutation libre, ≤ 7 bandes).
- **Boîtes « Comment »** (`rendu.ts`, calque dessous, sous les liaisons) : rectangle teinté à ≈ 5 %,
  barre de titre à ≈ 15 % avec le nom en haut à gauche et, à droite, le nombre d'éléments en chasse fixe,
  contour fin de la même teinte à ≈ 60 %. Piste abandonnée : gris, hachures fines, contour pointillé
  (même code que ses blocs). Une boîte sans rapport avec la lignée ou l'hypothèse active s'efface à 55 %.
  Double-clic sur une barre de titre : cadrer le sous-problème (aussi depuis le panneau ☰).
- **Familles** (7 teintes sourdes, texte blanc sur l'aplat, contraste ≥ 4,5) : hypothèses et choix de
  modélisation (violet), définitions et axiomes (ardoise), lemmes / propositions / conjectures (bleu),
  observations et expériences (bronze), calculs (sarcelle), décisions (bordeaux), théorèmes et résultats
  (vert). En-tête plein des blocs, des spécifications (sous le coin replié) et losange plein des
  décisions ; carré de sortie à la couleur de la famille ; bornes de contexte teintées par la famille du
  contexte (comme des broches typées). Les couches de type de la vue (`--couche-*`, fiche et 3D) prennent
  les mêmes teintes.
- **Liaisons teintées par la famille de leur source** (réglage : ou encre), jonctions de la même
  couleur. Survol, sélection et aval de la lignée en **orange** (la sélection d'Unreal) au lieu du bleu,
  pour ne pas se confondre avec la famille des énoncés ; amont de la lignée en encre renforcée.
  Dépendances d'une hypothèse (« ⊢ H1 », contour) dans la teinte des hypothèses.
- **Statut toujours par le code de trait** (continu, tireté, barré, pointillé gris) : la couleur ne code
  jamais le statut. Résultats : contour 1,6 px au lieu du bandeau noir.
- **Choix de modélisation issu d'une décision** (lecture entrante) : il reste dans le flux, au rang
  suivant, au lieu de partir dans la marge. Sur la fontaine, observation → décision « Origine de la
  fontaine » → hypothèse « Force de prise anormale » n'est plus coupé (défaut relevé dans R14). Les
  portées (« →n », épingles) sont calculées pour tous les choix, dans la marge ou dans le flux.
- **Cartouche** : il ne recouvre plus le bas à droite du schéma. Sa hauteur est réservée dans les
  marges de cadrage, et s'il recouvre un bloc après un déplacement de la vue, il se réduit à sa ligne de
  titre (« SCHÉMA DE RAISONNEMENT · RÉV. B »). Nouveau champ : sous-problèmes (actifs + abandonnés).
- Feuille : plus de limite de zone en pointillé sur toute la hauteur (elle traversait les boîtes) ; les
  cotes ├ OUTILS ┤ restent sous la règle.
- Panneau ☰ : liste des sous-problèmes (pastille de teinte, nombre d'éléments, clic = cadrer), familles,
  légende mise à jour. Fiche : ligne du sous-problème sous le bandeau du bloc.
- Dérivation (`squelette.ts`) inchangée (stratégies renommées `r16-…`).

## Limites

- **Non vérifié visuellement** (pas de navigateur sur cette machine) : `tsc`, la transformation Vite et
  un essai hors navigateur de la mise en page (chevauchements, appartenance aux boîtes) ont été
  contrôlés, pas le rendu. À regarder : lisibilité des titres de boîtes à petite échelle (masqués sous
  6,5 px), densité des couleurs de liaisons, contraste du bronze et de l'orange de sélection.
- Les bandes allongent le schéma verticalement (fontaine, squelette : ≈ 1 400 px de haut pour ≈ 1 370 px
  de large) ; une boîte presque vide sur sa largeur (le cadre : trois spécifications à gauche,
  l'observation en R0, la décision en R3) laisse du blanc. Un empilement compact (deux bandes côte à côte
  quand leurs étendues horizontales ne se recoupent pas) est possible mais casse l'ordre vertical.
- Les liaisons entre bandes traversent les boîtes intermédiaires (comme les fils d'un Blueprint) ; les
  crochets des liens sémantiques peuvent passer sur une barre de titre.
- Le cartouche réduit (une ligne) peut encore recouvrir un bloc ; on peut le masquer (réglage
  « cartouche »). Il disparaît sous 900 px.
- Sur le jeu synthétique, l'ordre « pistes abandonnées au plus court » place la compacité en tête
  (ses liaisons y sont plus courtes) ; « ordre du jeu » la remet en bas.
- En 3D, la feuille et les boîtes s'effacent ; les blocs restent projetés à plat.
- Mêmes limites de dérivation que R14 (une décision dont la seule prémisse est un choix reste sans
  liaison, les énoncés ne sont visibles qu'au survol).

## Idées

- Boîtes imbriquées : sous-sous-problèmes, ou étapes dépliées dessinées comme boîtes filles.
- Replier une boîte entière en un seul bloc (« SP2 · 4 éléments ») au double-clic sur son titre, comme
  un graphe réduit (*collapsed graph*) d'Unreal.
- Commentaire libre de la boîte (résumé du sous-problème) affiché sous le titre quand la place le permet.
- Empilement compact optionnel, avec contrainte d'ordre partiel entre bandes liées.
