# R18 · Blueprint · équations

Variante de R14 (schéma technique) demandée par Camille : des couleurs, et des rectangles qui englobent
plusieurs nœuds comme les boîtes « Comment » d'un Blueprint Unreal Engine. Point de vue de R18 : pour un
raisonnement de physique, **le contenu compte**, donc chaque bloc montre son équation. Jeu par défaut :
fontaine de chaîne (`?jeu=edp` pour le jeu synthétique ; sélecteur en haut à gauche).

## Ce qui change par rapport à R14

- **Formule dans le corps du bloc** (`formules.ts`), composée pour l'œil : variables latines et grecques
  minuscules en italique (police mathématique Cambria Math / STIX / Latin Modern), chiffres, fonctions et
  lettres grasses droits, espaces fines autour des opérateurs, plus larges autour des relations, indices
  `_x` / `_{…}` et exposants `^…` abaissés / relevés. Unicode seulement : KaTeX n'est pas dans ce projet.
  Sans formule : l'énoncé court (première phrase) en italique gris. Deux formules au plus par bloc (réglage).
- **Blocs à la taille de leur formule** : largeur = max(largeur de base, formule) bornée à 2,2 ×, puis
  coupure aux relations ; chaque rang prend la largeur de son bloc le plus large (règle des rangs ajustée).
  Ancrage des liaisons au milieu du **corps** : les chaînes restent horizontales malgré des en-têtes inégaux.
- **Boîtes de commentaire** = sous-problèmes : rectangle teinté translucide, barre de titre colorée (nom,
  nombre de blocs), contour fin ; piste abandonnée en gris hachuré et tireté. **Boîtes imbriquées** pour
  les sous-problèmes « parent.enfant » (fontaine : `bords.extremites` = prise, sol, sommet ; `pred.mesures`
  = films et mesures). Les choix de modélisation ont leur propre boîte « Spécifications ».
- **En-têtes colorés par famille** (principes, hypothèses / modélisation, lemmes / propositions,
  théorèmes / résultats, expériences / observations, calculs, décisions), texte blanc : repère, type,
  validation, titre. Le **statut reste codé par le trait** (continu / tireté / barré / pointillé gris).
- **Broches colorées par grandeur physique transmise** (tension, vitesse, hauteur, coefficient…), avec le
  symbole transmis écrit à côté de la broche (`T′`, `h₁`, `α`) ; liaisons de la même couleur, sans pointe
  (le sens est toujours gauche → droite, comme dans un Blueprint). Sinon, couleur du rôle de la prémisse.
- **Placement boîte par boîte** (`mise-en-page.ts`, étape 6) : chaque sous-problème est mis en page seul
  (barycentres, régression isotone sur ses liaisons internes), puis posé comme une pièce rigide au plus
  près de la hauteur médiane de ses voisins déjà posés, sans chevauchement. Rangs « au plus tard » (une
  racine se place juste avant son premier usage), plus de zone « Outils ». Liaisons longues : un point de
  passage par colonne, dans un intervalle libre (jamais sur un bloc).
- **Cartouche corrigé** : il n'est plus un élément HTML fixé à l'écran (qui recouvrait le bas droit du
  schéma) mais un dessin dans le coin bas droit de la **feuille**, sous le schéma ; la feuille s'agrandit
  pour le loger et « cadrer tout » cadre la feuille entière d'après ses bornes exactes.
- Dérivation : celle de R14, sauf que **le repli ne franchit pas un sous-problème** (un bloc replié doit
  tenir dans une seule boîte). Défaut : niveau « + auxiliaires » (25 blocs sur la fontaine).
- Fiche de survol : formule extraite (texte exact), chaque entrée (symbole · grandeur ← repère source),
  boîtes du bloc. Panneau ☰ : boîtes, familles, grandeurs présentes, nomenclature (blocs avec formule).

## Règle d'extraction des formules (générique, documentée en tête de `formules.ts`)

0. **Annotation** : tout segment `$…$` de l'énoncé est une formule (prioritaire sur le reste).
1. **Jetons** : on isole les relations `= ≈ ≃ ≠ < > ≤ ≥ → ∝ ≡ ⇒ += :=` (hors accolades d'indice). Un jeton est
   mathématique s'il n'a pas trois lettres latines consécutives une fois ses indices retirés (sauf
   fonctions : sin, max, div…) et n'est pas un petit mot français (de, la, en, au, à…) — sauf s'il précède
   un opérateur (« du + … »).
2. **Extension** autour de chaque relation, à gauche puis à droite, tant que les jetons sont mathématiques ;
   `, ; . :` arrête (sauf une virgule dans une parenthèse ouverte : « W(t, x) »). À droite : un mot seul
   avant une fin de proposition est gardé (« = constante ; ») ; « en, donne, pour, si, avec, où » sont
   gardés s'ils mènent à une autre relation (« T′ ≈ 0 en y = h₁ », « α → 0 donne h₁ → 0 »).
3. **Nettoyage** : parenthèses déséquilibrées retirées aux bords, coupure avant une parenthèse jamais
   refermée, opérateur final → « … » (« d𝐩/dt = Σ𝐅_ext + … ») ; deux membres non vides, une lettre au moins.
4. « X est constant(e) / nul(le) / conservé(e) » → « X = cte » / « X = 0 ».
5. Les formules trouvées dans une parenthèse (« (β = 0 pour …) ») ne servent que s'il n'y en a pas d'autre ;
   au plus N, dans l'ordre du texte ; un choix de modélisation cherche aussi dans `choix.hypothese`.

Résultat sur la fontaine : 27 énoncés sur 39 ont une formule, sans erreur visible (liste vérifiée en Node) ;
sur le jeu synthétique EDP : 23 blocs sur 40 au niveau squelette (`W(t, x) = Σ_{k≤K} σ_k(x) β_k(t)`,
`u^{n+1} += c_h(u^n)`…).

**Grandeur d'une liaison** : table de notation de la mécanique (`NOTATION` : T, F → tension / force ; v →
vitesse ; h, y, z, L → hauteur / longueur ; α, β, γ → coefficient ; p → quantité de mouvement ; g, λ, m, ρ →
constantes). Grandeur transmise = symbole commun aux formules de la source et de la cible (hors constantes),
le plus prioritaire ; sinon grandeur du membre de gauche de la source ; sinon rôle de la prémisse.

## Limites

- **Non vérifié visuellement** : pas de navigateur sur cette machine. Contrôlés : `tsc`, service par Vite
  (HTTP 200), et la dérivation + la mise en page exécutées en Node avec une mesure de texte factice (pas
  d'exception, aucune boîte de premier niveau ne se chevauche ; fontaine « + auxiliaires » ≈ 1 730 × 1 160 px
  de mise en page, EDP squelette ≈ 3 100 × 1 600). À regarder en priorité : rendu réel des formules
  (police Cambria Math sous Windows, crénage des indices Unicode), lisibilité des titres de boîtes, densité
  des liaisons colorées qui traversent les boîtes.
- La composition n'est pas du TeX : pas de fraction empilée, pas de racine, pas d'accent ; `a / b` reste en
  ligne. KaTeX donnerait un vrai rendu mais n'est pas une dépendance de ce prototype.
- La table des grandeurs est celle de la mécanique : en EDP, `u`, `E`, `h` reçoivent peu ou pas de couleur
  (repli sur le rôle), et `h` (pas du maillage) serait lue comme une longueur. En production, l'agent qui
  écrit la démonstration devrait nommer la grandeur transmise, ou déclarer ses symboles.
- Les boîtes imbriquées reposent sur la convention d'identifiant `parent.enfant` du sous-problème (le jeu
  R18 l'ajoute à deux endroits) : aucune détection automatique des « groupes serrés ».
- Liaisons entre boîtes : elles peuvent traverser une autre boîte (jamais un bloc). Les renvois
  (pentagones) de R14 restent pour une prémisse très partagée citée loin en aval.
- La piste abandonnée et la décision qui l'abandonne restent dans des boîtes différentes ; la marge des
  spécifications reste à gauche, loin des blocs qui en dépendent (repères `⊢ H1` au survol).
- En 3D, feuille, boîtes et cartouche s'effacent ; les blocs restent projetés à plat.
