# R23 · Matrice de dépendance — notes

Direction **D3** de `RECHERCHE-REPRESENTATION.md` : tout le graphe de justification (224 nœuds,
618 dépendances du jeu synthétique) en matrice de structure de dépendance séquencée et partitionnée.
Question traitée : *quelle est la structure complète, et où sont les boucles ?*

## Fichiers

| Fichier | Rôle |
|---|---|
| `modele.ts` | Pur (aucun DOM) : identifiants, ordre canonique, dépendances détaillées, fermeture transitive, grille affichée, statistiques |
| `rendu.ts` | Canvas : en-têtes figés, zoom sémantique, glyphes, surimpressions, hit-test |
| `panneau.ts` | Panneau d'inspection et fiches de survol (HTML), légende |
| `main.ts` | État, barre de commandes, souris / clavier |

Aucune fondation de `src/` n'est modifiée ni recopiée : seul `src/raisonnement/donnees.ts` est importé
(pas sigma : une matrice n'est pas un graphe nœud-lien).

## Grammaire

- **Ligne = conclusion, colonne = prémisse**, même ordre. En-tête de ligne : identifiant mono, type en
  petites capitales, titre tronqué, intervalle de confiance sur une échelle 0–1 commune (36 px). En-tête
  de colonne : identifiant seul, vertical.
- **Cellule** : glyphe du rôle dans la démonstration représentée — ■ principale, ▪ auxiliaire,
  · technique, ○ contexte. Encre si la prémisse est citée par la démonstration principale, gris sinon.
  **Liseré** ocre (démonstration à vérifier) ou brique (invalide) : c'est la validité de la
  *démonstration* (modèle Atlas), pas du nœud.
- **Diagonale** : statut ✓ ? ✕ (vert sombre / ocre / brique) et, à partir de 14 px, mini-barre
  `[bas, haut]` de confiance.
- **Blocs** : sous-problèmes (Cadre, SP1, SP2, SP3, piste abandonnée en dernier), filets 1 px,
  titrés dans la marge gauche (vertical) et la bande du haut. Clic dans la marge : replier le bloc en
  une ligne et une colonne agrégées (cellules = nombre de dépendances).
- **Rétroactions** (teinte bleu sourd, seule couleur hors statuts) : prémisse située dans un bloc
  ultérieur (9 dans le jeu : la boucle Obs 13 « pente 0,26 » → As 16 « diagnostic » → Déc 5
  « correction d'Itô », l'abandon de la compacité Déc 2 qui cite la piste abandonnée, etc.) ou créée
  après la conclusion (2 : démonstrations révisées). Liens hors justification en glyphes : ⊣ contredit
  (brique), ⊢ résout, × abandonne.
- **Décisions** : en-tête en losange ; une sous-ligne grise par option rejetée (libellé ✕ + raison),
  vide par construction : « rien n'en dépend » est l'information.
- **Transitif** (Non / H · M · Déc / Tout) : les colonnes se remplissent de la portée calculée, en
  hachures pour les dépendances indirectes ; le survol donne le plus court chemin (« M3 → Calc 10 →
  Lem 38 → Lem 40 → Thm 7 »).
- **Zoom sémantique** : sous 6 px les glyphes deviennent des pixels (intensité = rôle, façon matrice
  ETP), à partir de 10 px les en-têtes de lignes, de 11 px les identifiants de colonnes, quadrillage
  discret à partir de 9 px. Démarrage sur la matrice entière (~3,4 px).

## Interactions

Survol d'une cellule = fiche (« As 16 utilise Obs 13 (principale) dans la démonstration … », table
des démonstrations citantes avec rôle et validité, raison de la rétroaction). Clic sur un en-tête (ou
la diagonale) = sélection : bandes ligne + colonne, contour encre des cellules du sous-graphe des
antécédents (ou des dépendants, bascule « Surimpression »), en-têtes hors lignée atténués, fiche
complète dans le panneau (démonstrations avec prémisses groupées par rôle, portée déclarée vs
calculée d'un choix, tableau des options d'une décision, liens, H · M · Déc dont le nœud dépend).
Tous les identifiants du panneau sont cliquables et recentrent la matrice. Maj + glisser = brosse :
sous-matrice résumée (dépendances internes, rétroactions, confiances les plus basses), identifiants
copiables. Tri topologique / date / confiance, blocs activables, démonstrations toutes / principale.
Clavier : Échap, `+`, `-`, `0`. `?source=api` charge `/api/graphe` (repli synthétique).

## Données dérivées (déterministes, dans `modele.ts`)

- **Identifiants citables** (`Lem 4`, `H2`, `Déc 3`) : numérotation par sigle de type dans l'ordre
  canonique, indépendante du tri affiché, donc stable.
- **Ordre canonique** : blocs dans l'ordre des sous-problèmes (piste abandonnée en dernier), puis
  tri topologique de Kahn à priorité dans chaque bloc : hypothèses, choix, décisions, axiomes,
  définitions, admis, travail ; à égalité, date. Hypothèses et choix se regroupent donc en tête (H1–H4,
  M1 avant les axiomes dont ils ne dépendent pas), sans jamais violer la topologie.
- **Rétroaction** : propriété intrinsèque de la dépendance (ordre canonique ou `cree_le`), donc sa
  teinte ne change pas avec le tri. La barre d'état compte en plus les marques au-dessus de la
  diagonale dans l'ordre affiché.
- **Démonstration représentée** : la principale si elle cite la prémisse, sinon la citante de rôle le
  plus fort ; son rôle et sa validité font le glyphe et le liseré. Toutes les citations restent dans
  la fiche.
- Confiance lue par une seule fonction `confianceDe(n)` (aujourd'hui sur le nœud, à basculer sur la
  démonstration principale quand la base la portera).

## Sources de la recherche utilisées

DSM séquencée / partitionnée et tearing (§2.15, dsmweb.org), matrice pixel + vue locale de l'Equational
Theories Project (§2.2 : pixels au dézoom, fiche locale), lecture par colonnes de l'ACH (§2.12 : colonnes
H · M · Déc et portée), tirets/plein de Lean blueprint et InContextOf de GSN (§2.1, §2.6 : rôle
contexte distinct), QOC (§2.11 : options rejetées visibles), liste-clé numérotée de Wigmore (§2.9 :
identifiants citables), forest plot (principe 6 : intervalles sur échelle commune).

## Vérifié / non vérifié

- Vérifié : `npx tsc --noEmit` sans erreur dans le dossier ; modules servis en 200 par Vite ;
  `modele.ts`, `rendu.ts` (faux contexte canvas qui rejette les NaN) et `panneau.ts` (DOM minimal)
  exécutés sous Node sur les 36 combinaisons tri × blocs × transitif × démonstrations, à 4 niveaux de
  zoom, toutes cellules et tous nœuds ; 618 dépendances = 618 arêtes de `construireJustification`.
- **Non vérifié visuellement** : aucun navigateur lancé (contrainte mémoire). Les réglages fins (taille
  des glyphes, lisibilité des étiquettes de blocs verticales, position des bulles) restent à regarder.

## Limites

- « Envoyer la brosse vers D2 ou R1 » n'est pas branché (ces vues ne lisent pas de sélection en
  paramètre) : on copie les identifiants en JSON.
- Une cellule ne montre qu'une démonstration (la représentée) ; le détail multi-démonstrations est dans
  la fiche. Un lien sémantique qui tombe sur une cellule occupée passe en petit glyphe de coin.
- Tri par confiance : beaucoup de marques passent au-dessus de la diagonale sans être des rétroactions
  (non teintées) ; c'est voulu mais peut surprendre.
- Pas de thème sombre (le thème clair est la priorité de la série), pas d'accessibilité clavier cellule
  par cellule.
