# Prototypes de visualisation du graphe Atlas

Huit pages à tester dans le navigateur, sur un moteur commun (sigma.js + graphology, projection 3D
maison façon Blender). Données synthétiques déterministes : ~1 200 nœuds, 4 domaines, 14 thèmes,
~40 sous-thèmes, 6 mois de recherche. Cahier des charges : `CONCEPTION.md`.

## Lancer

```bash
cd prototypes/graphe-3d
npm install          # une seule fois
npm run dev          # http://localhost:5180  (catalogue avec aperçus)
```

`--host` est actif : depuis une tablette sur le même wifi, ouvrir `http://<IP-du-PC>:5180`.
Version statique : `npm run build` puis `npm run preview`.

## Les variantes

| Variante | Idée | À regarder en priorité |
|---|---|---|
| **v7 Synthèse** ⭐ | Le meilleur des six dans un seul langage ; panneau gauche pensé comme l'application | Vue de face (1), survol, panneau (☰ ou `N`), onglet Activité |
| v1 Atlas scientifique | Figure de revue : noms sur les agrégats, anneau de confiance, bordure de validation | Vue de face en *forest plot* |
| v2 Cartographie | Zoom sémantique, territoires, rivières temporelles, mini-carte | Zoomer / dézoomer, vue de face |
| v3 Constellation | Halos, profondeur de champ, lignée en impulsions, squelette par importance | Vue iso, clic sur un nœud |
| v4 Instrument | Viewport Blender : faces quadrillées, règles graduées, réticule, barres d'erreur | Vues 1 / 3 / iso, survol |
| v5 Lentille | Focus + contexte sous la souris, loupe au niveau nœuds, palette `Ctrl+K` | Promener la souris, `L`, `Ctrl+K` |
| v6 Corolles | Agrégats en anneaux de statuts, éclosion en corolle, communautés Louvain | Double-clic sur un thème |
| v0 Référence | Toutes les fonctions du moteur, sans recherche esthétique | Base de comparaison |

Chaque variante a ses `NOTES.md` (choix, limites, idées) et tous ses réglages visuels dans le panneau
**Réglages** (Tweakpane, en haut à droite), mémorisés dans le navigateur.

## Raccourcis (identiques à Blender)

| Action | Souris / clavier | Tablette |
|---|---|---|
| Orbiter | bouton du milieu, ou clic droit glissé, ou Alt + clic gauche | 1 doigt (3D) |
| Déplacer | Maj + bouton du milieu | 2 doigts |
| Zoom | molette (vers le curseur) | pincer |
| Vues dessus / face / droite | `7` / `1` / `3` (Ctrl = face opposée), `9` vue opposée | barre de vues |
| Orbiter par 15° | `2` `4` `6` `8` | — |
| Ortho ↔ perspective | `5` | bouton Ortho./Persp. |
| Tout cadrer / cadrer la sélection | `Home` / `.` | double tape |
| Menu radial des vues | `` ` `` | — |
| Granularité | `[` `]` ou curseur (le glisser fait défiler la transition) | curseur |
| Ouvrir / refermer un agrégat | double-clic / Alt + double-clic | double tape |
| Lignée | clic ; `Échap` pour effacer | tape |

Les chiffres du haut du clavier marchent comme le pavé numérique.

## Faces du cube

- **Dessus (7)** : carte thématique (proximité = même catégorie, sessions voisines).
- **Face (1)** : temps en abscisse ; chaque agrégat devient une barre qui couvre sa période (médiane, quartiles).
- **Droite (3)** : couloirs par type et origine (humain, IA, ordinateur).
- Mode **faces sémantiques** (par défaut) : chaque face a sa propre organisation, les points glissent
  pendant la rotation. Mode **cube strict** : vraies coordonnées 3D (X = temps, Y = type, Z = thème).

## Et ensuite

- Recommandation : partir de **v7** comme base d'interface, reprendre les meilleures options des autres.
- Brancher l'adaptateur `depuisApiAtlas()` (`src/core/donnees.ts`) sur `GET /api/graphe` : il faudra
  ajouter en base les champs de catégorie, type, origine, validation et intervalle de confiance.
- Études liées (hors dépôt) : `../../../Recherche-workflow-byo/RAPPORT.md` (brancher Atlas sur le
  Claude Code ou Codex de l'utilisateur) et `../../../Recherche-conflits/RAPPORT.md` (plusieurs sessions
  sur la même base).
