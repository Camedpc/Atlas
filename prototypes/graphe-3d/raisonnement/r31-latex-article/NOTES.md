# R31 · LaTeX · article amsmath

Le schéma technique de R14 tel qu'il serait publié : la **figure 1** d'un article composé avec `amsart`,
`amsmath` et `amsthm`, et le raisonnement lui-même posé **en regard**, en environnements numérotés. Jeu par
défaut : fontaine de chaîne (`?jeu=edp` pour le jeu synthétique). Point de départ : copie de
`r14-schema-technique/` (dérivation, mise en page et rendu inchangés dans leur principe).

## Page

- Deux panneaux : figure à gauche (47 %), article à droite (53 %), chacun avec son défilement ; sous 1100 px la
  figure passe au-dessus (56 vh) et la légende dit « ci-dessus » au lieu de « ci-contre ». Sous 760 px les notes
  marginales rentrent dans le texte.
- Latin Modern (fontes woff2 de `latex.css@1.14.0` sur jsDelivr), 16 px, interlignage 1,36, texte justifié et
  césuré (`lang="fr"`), colonne de 33 em avec marge droite pour les `\marginpar`. Noir sur blanc ; liens hyperref
  bleu sombre `#1f3a93`, qui est aussi l'unique accent de la figure.
- Mise en forme amsart : en-tête courant, titre en capitales grasses centré, auteurs en capitales, date en
  italique, résumé en corps réduit avec « Résumé. » en petites capitales, sections centrées en petites capitales
  « 1. Cadre et modélisation ».

## Article (`article.ts`)

- **Sections** = sous-problèmes, préfixe « SPn · » retiré, pistes abandonnées en dernier avec la mention
  « Piste abandonnée, conservée pour mémoire ». Résumé du sous-problème en premier paragraphe.
- **Ordre** : topologique sur toutes les démonstrations (prémisses d'abord, ordre du jeu à égalité), puis réparti
  par section. **Numérotation** : compteur partagé par section (`\newtheorem{lemme}[theoreme]`,
  `\numberwithin{theoreme}{section}`), équations `(s.k)` par section.
- **Environnements** par type : `plain` (tête grasse, corps italique, formules et note droites) pour axiome,
  lemme, proposition, théorème, résultat, conjecture, assertion ; `definition` (corps droit) pour hypothèse,
  définition, choix de modélisation, décision, expérience, calcul, observation. Note entre parenthèses = nom de
  l'énoncé, « ; admis(e) », « ; réfuté(e) ». Choix : l'hypothèse de travail en corps, puis *Portée* et
  *Alternatives écartées*. Décision : la question, les alternatives en liste (i), (ii)… « — retenue » /
  « — écartée : raison », puis *Raison.*
- **Démonstrations** générées depuis les prémisses et leur rôle (ou `DemonstrationR.texte` s'il existe, suivi
  de la phrase) : « D'après (3.2), (3.4) et le lemme 2.3, avec le choix de modélisation 1.14, à l'aide du lemme
  1.3, dans le cadre de l'hypothèse 1.6 et de la définition 1.8. » Principales → « D'après », auxiliaires →
  « avec », techniques → « à l'aide de », contexte → « dans le cadre de ». Renvois groupés par type comme
  cleveref (« les lemmes 2.3 et 3.3 », articles et contractions du / de la / de l' / des). Une prémisse
  principale qui a sa propre équation hors texte est citée par sa **dernière** équation (celle qui conclut
  l'énoncé), façon `\eqref`. Titre de la démonstration = nom de la démonstration (*Démonstration*, *Protocole*,
  *Script*, *Mesure*, *Délibération*…). Fin : **∎** validée, **□** à vérifier, **✗** invalidée ; énoncé admis :
  « *Admis.* Dans le cadre de… », sans signe de fin.
- **Remarques** : les liens sémantiques deviennent « *Remarque.* Contredit l'observation 1.15 : … ».
- **Notes marginales** : statut et validation (« à vérifier · IA »), confiance « c = 0,60 [0,45 ; 0,74] »,
  piste abandonnée, et place dans la figure au niveau courant : « fig. 1 : Lem. 2.3 », « fig. 1 : dans l'étape
  Prop. 4.1 », « fig. 1 : borne de Lem. 2.1 (+2) » ou « hors figure à ce niveau » (mis à jour à chaque dérivation).
- **Légende de la figure 1** dans l'article (code de trait, bornes, losange, signes de fin), comme une vraie
  `\caption` : elle remplace le cartouche de R14.

## Formules (`formules.ts`) : règle générique

Aucune donnée de jeu codée en dur ; la règle est documentée en tête du fichier. En bref :

0. `$…$` / `$$…$$` dans un énoncé : pris tels quels (LaTeX), rien d'autre n'est deviné.
1. Jetons aux espaces, relations isolées (= ≈ ≃ ≠ < > ≤ ≥ → ∝ ≡ ⇒ ∈ ∼ ⊂) sauf entre accolades. Jeton
   mathématique : pas trois lettres latines consécutives hors indices (sauf fonctions), pas d'apostrophe, pas
   d'accent, pas un petit mot, pas un sigle (« SP1 », « IA »).
2. Autour d'une relation : extension gauche / droite sur les jetons mathématiques, arrêt à la ponctuation de fin
   de proposition, sauf à l'intérieur d'une parenthèse ouverte ; une parenthèse qui contient une relation est
   une remarque et arrête l'extension ; un opérateur de bord est rendu au texte ; « = constante » → « = cte ».
3. Hors texte (numérotée) si les deux membres portent un symbole (ou second membre nul) et ≥ 4 jetons ; sinon
   en ligne. La ponctuation qui suit entre dans l'équation.
4. Symboles isolés restants → formules en ligne (« où $s$ est… », « $50\,\mathrm{m}$ ») ; nombres seuls = texte.
5. Unicode → LaTeX : grec, lettres mathématiques (gras, ronde, ajourée, gothique…), ℝ ℙ…, indices et exposants,
   primes, opérateurs, virgule décimale `{,}`, unité après un nombre `\,\mathrm{…}`, `div` → `\operatorname`.

Une formule identique à une équation déjà numérotée **reprend son numéro** (lien vers l'original, comme un
`\tag{\ref{…}}`) au lieu d'en recevoir un nouveau : « T₀ = (1 − α) λ v² » est (1.2) dans la définition 1.10, le
choix 1.17 et le lemme 3.1. Fontaine : 10 équations numérotées ; EDP : 59 formules hors texte extraites.
KaTeX 0.16.11 est chargé à la demande depuis jsDelivr ; tant qu'il n'est pas là (ou sans réseau), les formules
restent en Unicode italique.

## Figure (rendu de R14, adapté)

- Repères de blocs = **numéros de l'article** : « Lem. 2.3 », « Prop. 4.1 », « Thm 4.3 », « Choix 1.12 » ; décision :
  « 3.4 » dans le losange ; renvois (pentagones) et « ⊢ 1.12 » par numéro seul. Étiquette d'en-tête : vide, ou
  « + 2 énoncés » pour une étape repliée, « abandonnée ».
- Tout en Latin Modern (plus de chasse fixe : la constante `MONO` pointe vers la pile serif), cotes de zones et
  alternatives écartées en italique, rangs « r0, r1… ».
- Feuille réduite à un **cadre simple** et à la règle des rangs (trame désactivée par défaut, plus de repères de
  lignes A B C ni de cartouche : l'article est la référence). Fiche de survol désactivée : le texte en regard la
  remplace.
- Même dérivation (stratégies renommées `r31-*`), même code de trait, mêmes jonctions, étapes dépliables au
  double-clic, choix épinglables.

## Liens croisés

- Texte → figure (survol) : renvoi, numéro d'équation, équation, énoncé, démonstration, note marginale → le bloc
  concerné passe en bleu (trait 1,8) et le reste s'atténue (0,28) ; un énoncé de contexte allume ses bornes.
- Figure → texte (survol) : tous les énoncés du bloc (membres d'une étape repliée compris) et leurs équations /
  démonstrations sont surlignés d'une teinte très légère (`#e9edf7`), sans halo.
- Clic sur un renvoi : défilement du texte vers l'énoncé ou l'équation (marqué comme `:target`), et la figure se
  recadre seulement si le bloc est hors champ. Clic sur un bloc : défilement vers son énoncé. Clic sur
  « fig. 1 : … » dans la marge : la figure se cadre sur le bloc et ses voisins. « figure 1 » dans le résumé :
  cadrer tout.

## Limites

- Non vérifié visuellement (pas de navigateur sur cette machine) : `tsc` sur le dossier, transformation Vite
  (HTTP 200) et rendu de l'article dans un mini-DOM sous Node (textes des deux jeux relus). À regarder en
  priorité : largeur des en-têtes « Prop. 4.12 » dans un bloc de 120 px, place des notes marginales entre
  1100 et 1300 px, collision de la barre de la vue avec le lien « catalogue » dans un panneau étroit.
- Le numéro d'un énoncé dépend de l'ordre topologique global : ajouter un nœud renumérote la suite (comme en
  LaTeX). Les numéros ne sont pas stables d'une version du graphe à l'autre.
- La phrase de démonstration est un squelette de renvois, pas une preuve rédigée : elle dit *de quoi* l'énoncé
  découle, pas *comment*. `DemonstrationR.texte` est utilisé s'il existe.
- Heuristiques de formules : « du » (article) ou une lettre isolée peuvent passer en mathématiques ; un nom
  accentué dans une formule (« Ê_M ») reste du texte. L'annotation `$…$` par l'agent rédacteur règle tout.
- Le jeu EDP (224 énoncés) donne un article long (≈ 50 pages) : pas de table des matières ni de repli.
- Petites capitales synthétisées par le navigateur (les fontes web Latin Modern n'en ont pas).

## Idées

- Export `.tex` réel (mêmes environnements, `\label` / `\cref`) et compilation côté serveur pour un PDF.
- Table des matières et index des énoncés cliquables ; bibliographie quand les agents citeront des sources.
- Lire l'article comme vue principale et ouvrir la figure en flottant (`figure*`) près du paragraphe courant.
