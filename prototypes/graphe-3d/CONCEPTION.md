# Prototypes de visualisation du graphe Atlas — cahier de conception

Branche `visu/graphe-3d`. Tout vit dans `prototypes/graphe-3d/`. **Ne jamais modifier le reste du dépôt**
(`frontend/`, `api/`, `atlas/`, `supabase/`, `tests/`).

## 1. Intention

Un chercheur doit **lire son graphe de recherche d'un coup d'œil**, surtout en passant la souris.
Le graphe complet (des centaines ou des milliers de nœuds) est illisible : on montre les **points
importants** en **agrégeant** les autres, avec une granularité que l'utilisateur règle lui-même, et des
transitions où les points **sortent** du gros point (on affine) ou **y rentrent** (on agrège).

Ton recherché : **scientifique, professionnel, avec un effet visuel intéressant**. Priorité au
**thème clair** ; le thème sombre existe mais est secondaire.

Stack imposée : **sigma.js v3 + graphology** (rendu WebGL fluide), Vite + TypeScript, Tweakpane pour
les réglages. sigma est un moteur 2D : la 3D est obtenue en **projetant nous-mêmes** des positions 3D
vers les coordonnées 2D que sigma dessine, à chaque image.

## 2. Données

Le schéma Atlas actuel (`supabase/migrations/…_init.sql`) : `noeuds` (id, nom, enonce, admis, dates),
`demonstrations` (noeud_id, nom_demonstration, justifie_par[], validite, auteur), `journal`. Une arête va
de chaque prémisse (`justifie_par`) vers le nœud justifié.

Pour les prototypes on **étend** ce modèle (champs à ajouter plus tard en base) et on génère un jeu
synthétique réaliste et déterministe (graine fixe), plus un adaptateur depuis `GET /api/graphe`.

```ts
type TypeNoeud = 'definition' | 'hypothese' | 'assertion' | 'lemme' | 'resultat'
               | 'experience' | 'calcul' | 'observation'
type Origine = 'humain' | 'ia' | 'ordinateur'           // qui a produit le nœud
type Statut = 'valide' | 'incertain' | 'refute'           // degré principal
type Validation = 'aucune' | 'ia' | 'humain' | 'ia_humain' // qui a validé
interface Noeud {
  id: string; nom: string; enonce: string
  type: TypeNoeud; origine: Origine
  categorie: [domaine: string, theme: string, sousTheme: string]  // hiérarchie
  cree_le: string            // ISO
  session: string            // session de recherche : nœuds « appelés ensemble »
  statut: Statut; validation: Validation
  confiance: { estimation: number; bas: number; haut: number }  // intervalle dans [0,1]
  justifie_par: string[]     // prémisses (union des démonstrations)
  demonstrations: { nom: string; justifie_par: string[]; validite: 'a_verifier'|'valide'|'invalide'; auteur: string }[]
}
```

Jeu synthétique : ~1 200 nœuds, 4 domaines → ~14 thèmes → ~40 sous-thèmes, ~6 mois de recherche en
sessions (rafales), DAG (prémisses toujours antérieures, surtout dans le même sous-thème, quelques
liens transverses), types et origines variés, statuts et intervalles de confiance cohérents
(ex. réfuté → intervalle bas ; validé ia+humain → intervalle étroit et haut). Noms lisibles en français
(« Lemme de compacité locale », « Simulation Monte-Carlo n°12 »…). Inclure les 5 nœuds du seed Atlas.

## 3. Agrégation (idée centrale)

Hiérarchie à 4 niveaux : `0 domaine → 1 thème → 2 sous-thème → 3 nœud`.
- **Granularité globale** continue `g ∈ [0, 3]` (curseur + raccourcis `[` `]`). Une valeur fractionnaire
  est un état intermédiaire de l'animation : **faire glisser le curseur fait défiler la transition**.
- **Granularité locale** : double-clic sur un agrégat = l'ouvrir (ses enfants en sortent) ;
  double-clic en maintenant Alt (ou bouton « replier ») = le refermer dans son parent.
- Un agrégat : position = barycentre de ses feuilles visibles, taille ∝ √(nb de feuilles), libellé = nom
  de la catégorie, composition (statuts, origines) et confiance agrégée disponibles pour le rendu.
- Arêtes agrégées entre agrégats, épaisseur ∝ nombre d'arêtes sous-jacentes.
- Transitions : un enfant **naît à la position de son parent** et glisse vers la sienne (et l'inverse).
  Durée, courbe d'accélération et trajectoire (droite, ressort, spirale) paramétrables.
- Autres idées d'agrégation à explorer dans les variantes : zoom sémantique (la granularité suit le
  zoom), squelette par importance (on garde les nœuds clés, les autres se replient vers leur ancêtre
  important), communautés automatiques (Louvain), lentille focus+contexte sous la souris.

## 4. Vues, axes et caméra (logique Blender)

Convention Blender : **Z vertical**. Trois faces :

| Vue | Raccourci | Ce qu'on lit |
|---|---|---|
| Dessus (regarde −Z) | pavé `7` | **Thématique** : nœuds proches = même logique / appelés ensemble (carte 2D issue de la hiérarchie + sessions) |
| Face (regarde +Y, axe X horizontal) | pavé `1` | **Temporelle** : X = date de création |
| Droite (regarde −X, axe Y horizontal) | pavé `3` | **Par type** : couloirs par type de nœud / origine (humain, IA, ordinateur) |

Deux modes de placement 3D, au choix (réglage) :
1. **Faces sémantiques** (par défaut) : chaque face a sa propre disposition 3D `P_dessus`, `P_face`,
   `P_droite` ; la position affichée est un mélange pondéré par l'orientation de la caméra
   (`w_i ∝ |dir·normale_i|^p`). Quand le plan tourne d'une face à l'autre, les points glissent vers la
   nouvelle organisation : c'est l'effet recherché.
2. **Cube strict** : coordonnées fixes (X = temps, Y = type, Z = thème ordonné). Cohérent en 3D libre,
   mais la vue de dessus devient temps × type.

Deux modes d'interaction :
- **2D** : verrouillé sur une face, orthographique, déplacement/zoom seulement. Changer de face anime
  quand même la rotation.
- **3D** : orbite libre. **Auto-perspective comme Blender** : sur une vue d'axe → orthographique ; dès
  qu'on orbite hors de l'axe → perspective, avec une transition **graduelle** (pas de saut).
  `5` bascule ortho/perspective.

Contrôles ordinateur (identiques à Blender) : bouton du milieu = orbiter ; Maj + milieu = déplacer ;
molette / Ctrl + milieu = zoom ; `1` `3` `7` (et Ctrl + ces touches pour la face opposée), `9` = vue
opposée, `2` `4` `6` `8` = orbite par pas de 15°, `5` ortho/persp, `.` = cadrer la sélection, `Home` =
tout cadrer, `` ` `` = menu radial des vues. Émulation pour portable : chiffres du haut du clavier =
pavé numérique, Alt + clic gauche = bouton du milieu, clic droit glissé = orbiter. **Gizmo de navigation**
en haut à droite (axes X rouge, Y vert, Z bleu cliquables, glisser pour orbiter).

Tablette : un doigt = orbiter (3D) ou déplacer (2D) ; deux doigts = pincer pour zoomer + déplacer ;
rotation à deux doigts = tourner autour de Z ; double tape = ouvrir l'agrégat / cadrer ; **inertie**
au relâchement pour un mouvement naturel.

## 5. Lecture au survol et au clic

- **Survol** d'un nœud : il est mis en avant avec ses voisins directs, le reste s'estompe ; une fiche
  claire : nom, type, origine, chemin de catégorie, date, statut, qui a validé, intervalle de confiance
  (barre), nb de prémisses / descendants.
- **Survol** d'un agrégat : nombre de nœuds, répartition des statuts (barre empilée), période couverte,
  nœuds les plus importants.
- **Clic** : **lignée** — tous les ancêtres (tout ce dont le nœud découle) et, au choix, les descendants
  (tout ce qui en sort), comme dans les graphes de citations. Le reste s'estompe. `Échap` efface.
  À granularité faible, les agrégats qui contiennent des ancêtres sont mis en avant.

## 6. Confiance

Trois dimensions à rendre lisibles d'un coup d'œil :
- **statut** : validé / incertain / réfuté ;
- **validation** : aucune / IA / humain / IA + humain ;
- **intervalle de confiance** `[bas, haut]` autour de l'estimation.

Encodages à explorer : couleur de statut, anneau dont l'arc = estimation, halo dont l'épaisseur =
largeur de l'intervalle (incertitude), style de bordure selon la validation (simple, double, pleine).

## 7. Filtres

Période (histogramme temporel avec brosse), type, origine, statut, validation, confiance minimale,
arbre des catégories, recherche texte. Deux comportements : masquer ou estomper.

## 8. Interface

- Panneau **à gauche** qui apparaît / disparaît via un bouton en haut à gauche (☰) : filtres, légende,
  arbre des catégories, détail du nœud sélectionné (énoncé, démonstrations, historique).
- **Réglages** dans un panneau Tweakpane repliable (halo, tailles, épaisseurs, opacités, distances,
  densité des libellés, libellés sur les agrégats oui/non, durée et courbe des transitions, champ de
  vision, brouillard de profondeur, thème…). Mémorisés dans `localStorage` (toujours dans un
  try/catch) avec un bouton « copier la configuration JSON ».
- Couleurs en variables CSS, thème clair par défaut, thème sombre en option.
- Viser **60 images/s** avec ~1 200 nœuds.

## 9. Organisation du code

```
prototypes/graphe-3d/
├── index.html                 catalogue des variantes (lit variantes/*/meta.json)
├── CONCEPTION.md              ce fichier
├── vite.config.ts             multi-pages : index.html + variantes/*/index.html
├── src/core/                  moteur partagé (ne pas modifier depuis une variante)
└── variantes/<id>/            une variante = index.html + main.ts + style.css + meta.json + NOTES.md
```

`meta.json` : `{ "id", "titre", "resume", "idees": [..], "ordre" }`.
Une variante qui a besoin d'un comportement absent du cœur l'implémente **dans son propre dossier**
(en étendant ou en copiant) et le signale dans ses `NOTES.md`.
