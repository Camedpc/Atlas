# R33 · LaTeX · diagramme tikz-cd

Variante « LaTeX » de R14 (schéma technique) : le même squelette déductif, composé comme un diagramme
commutatif `tikz-cd`. Jeu par défaut : **fontaine de chaîne** (`?jeu=edp` pour le jeu synthétique).
URL : `http://localhost:5180/raisonnement/r33-latex-tikzcd/`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `squelette.ts` | Dérivation de R14 / R1, inchangée (stratégies renommées `r33-*`) |
| `jeu-fontaine.ts` | Jeu fontaine de chaîne, copie de R14 |
| `formules.ts` | Extraction de la formule d'un énoncé, conversion Unicode → LaTeX (fonctions pures) |
| `contenu.ts` | Style et étiquettes des flèches, talons, repères de la légende (fonctions pures) |
| `mise-en-page.ts` | Matrice rangs × lignes, tailles mesurées, légende « où : », légende de figure |
| `typo.ts` | Chargement de KaTeX (cdn.jsdelivr.net) et attente des polices |
| `rendu.ts` | Flèches sur le calque canvas, placement du calque HTML, survol |
| `fiche.ts` | Fiche détaillée au clic (nœud, flèche, talon) |
| `tikz.ts` | Source `tikzcd` du diagramme affiché (panneau ☰, bouton « Copier ») |

## Choix

- **Plus de boîtes.** Un nœud est sa formule rendue par KaTeX, ou à défaut son nom en romain (Latin Modern,
  au plus 11 em de large). Décisions en petites capitales, résultats majeurs en gras (`\boldsymbol`),
  énoncé réfuté barré, piste abandonnée en gris ; un argument replié porte un exposant `[n]`.
- **Formules : règle d'extraction générique** (`formules.ts`, documentée en tête) : LaTeX explicite
  `$…$` / `\(…\)` d'abord ; sinon les suites de mots « mathématiques » (sans mot latin de 2 lettres ou plus,
  hors indices et fonctions usuelles) qui contiennent une relation (`= ≈ < ≤ ∝ …`) avec un membre de chaque
  côté ; on écarte les incises entre parenthèses et les conditions (« en », « pour », « où », « si »…),
  et on garde la **dernière** relation (la conclusion). Puis table Unicode → LaTeX. Sur la fontaine :
  21 énoncés sur 39 ont une formule, dont toutes les lois (`v^2 = g h_2/(1-\alpha-\beta)`,
  `h_1/h_2 = \alpha/(1-\alpha-\beta)`, `T'_0 = -\alpha\lambda v^2`…) ; aucun faux positif relevé.
- **Matrice.** Rangs et ordre repris de R14 ; les hauteurs sont arrondies à une grille (`row sep`) :
  nœuds sur des lignes entières, nœuds fictifs des arêtes longues sur des demi-lignes. Chaque colonne a la
  largeur de sa plus large formule ; l'écart entre deux colonnes s'élargit pour loger l'étiquette la plus
  large qui le traverse (`column sep` réglable).
- **Flèche = démonstration** (celle de la cible qui cite la source). Code tikz-cd : `→` valide, `⇒`
  (double trait, pointe ouverte) valide vers un théorème / résultat / proposition, `⇢` (`dashed`) à
  vérifier, `↛` (trait oblique) invalide ou cible réfutée. Pointe « to » à deux traits courbes, flèche
  raccourcie au bord de ses extrémités, coins arrondis aux nœuds fictifs.
- **Étiquettes.** Une seule flèche entrante par cible les porte (celle de la prémisse la plus proche).
  Au-dessus, en `\scriptstyle` : le nom de la démonstration s'il est spécifique (« Mesure », « Script »,
  « Délibération »), sinon « par <outils> » (prémisses techniques). Au-dessous : les **repères** des
  prémisses non tracées (auxiliaires, contexte, et celles des membres d'un argument replié).
- **Légende « où : »** à gauche : chaque prémisse citée, avec son repère (M choix de modélisation,
  H hypothèse, A axiome, D définition, L lemme / résultat, E expérience / mesure / calcul, P autre),
  son nom et sa formule. Les choix de modélisation sans flèche y vivent (ils ne sont plus en marge).
- **Talons** : une racine dont toutes les prémisses sont non tracées reçoit une flèche d'entrée
  « D2, A1, H1 → nœud ».
- **Décisions en embranchements** : la flèche sortante porte l'alternative retenue ; les alternatives
  rejetées sont en italique gris sous une courte flèche barrée vers le bas.
- **Liens sémantiques** : courbes au-dessus (« bend left »), `contredit` en trait plein barré,
  `abandonne` en pointillé gris, étiquette en italique.
- **Interaction.** Survol : la flèche (ou le nœud, ou l'entrée de légende) et ses extrémités passent en
  gras (épaississement du trait des glyphes, formules comprises), avec les prémisses qu'elle cite.
  Clic : lignée (le reste s'estompe en gris) et **fiche détaillée** fixe (formule en display, énoncé,
  statut, confiance, démonstrations et prémisses par rôle avec repères ; pour une flèche :
  `(A) ⟶ (B)`, validité, prémisses). Double-clic : ouvrir / refermer un argument replié. Échap : fermer.
- **Légende de figure** sous le diagramme (« Figure 1. … », niveau, nombres, code des flèches).
- **Source tikz-cd** (panneau ☰) : la matrice et les `\arrow[rrd, Rightarrow, "…", "H1, D2"']`,
  prêtes à coller dans un document (`tikz-cd`, `amssymb`).
- Aucune couleur d'accent : noir, gris, fond blanc. Polices : Latin Modern (latex.css sur jsdelivr) et
  KaTeX 0.16.22 (jsdelivr), aucun paquet npm.

## Limites

- **Non vérifié visuellement** (pas de navigateur sur cette machine) : `tsc`, la transformation Vite et
  un test Node (dérivation → contenu → mise en page → source tikz-cd, sur les deux jeux et les trois
  niveaux) ont été contrôlés. À regarder en priorité : chevauchement d'étiquettes quand deux flèches
  partent du même nœud vers des lignes voisines, lisibilité à petite échelle, largeur de la légende
  « où : » sur le jeu synthétique (≈ 45 entrées).
- Les tailles viennent du DOM : avant l'arrivée de KaTeX et des polices, la page est composée avec la
  source des formules, puis recomposée (un saut au chargement).
- Le « gras » au survol est un épaississement du trait (`-webkit-text-stroke`), pas la graisse Bold.
- Une prémisse citée qui est aussi un nœud visible (décision citée en contexte) apparaît dans la légende
  et dans la matrice.
- Le repère d'une prémisse ne dit pas son rôle (auxiliaire ou contexte) : la fiche le donne.
- En 3D, la légende « où : » et la légende de figure s'effacent ; les formules restent à plat.
- Mêmes limites de dérivation que R14 (choix issu d'une décision relié à ses usages par repère seulement).

## Idées

- Numéroter les formules comme des équations (1), (2)… et citer une prémisse visible par son numéro.
- Exporter aussi un document LaTeX complet (préambule, figure, légende) et un PDF via un service.
- Étiquettes des flèches secondaires au survol seulement, comme `\arrow[…, "…" description]`.
