# Moteur `src/core` — guide pour écrire une variante

Le moteur affiche le graphe de recherche Atlas avec sigma v3 (WebGL 2D) en projetant nous-mêmes
des positions 3D. Il gère données, hiérarchie et granularité continue, trois dispositions (faces),
caméra façon Blender, contrôles souris / clavier / tactile, lignée, filtres, réglages Tweakpane et
une interface par défaut. **Une variante ne modifie pas `src/core`** : elle utilise les points
d'extension ci-dessous, ou copie/étend dans son dossier (et le signale dans ses `NOTES.md`).

Référence complète : `variantes/v0-reference/main.ts`.

## Une variante en 30 lignes

```
variantes/v7-ma-variante/
├── index.html   (copier celui de v0 : <div id="app"> + <script type="module" src="./main.ts">)
├── main.ts
├── style.css
├── meta.json    { "id": "v7-ma-variante", "titre": "…", "resume": "…", "idees": ["…"], "ordre": 7 }
└── NOTES.md
```

```ts
import { creerVue, rgba, type ReducteurNoeud } from '../../src/core'
import meta from './meta.json'

// Taille ∝ confiance, couleur des feuilles selon l'origine.
const monReducteur: ReducteurNoeud = (info, a, vue) => {
  if (!info.noeud) return
  a.couleur = vue.palette.origine[info.noeud.origine]
  a.taille *= 0.6 + info.noeud.confiance.estimation
}

const vue = creerVue(document.getElementById('app')!, {
  id: meta.id,                     // clé de mémorisation des réglages
  mode: '3d', vueInitiale: 'iso', granularite: 1,
  reglagesSupplementaires: [
    { cle: 'lueur', defaut: 0.5, min: 0, max: 1, pas: 0.01, dossier: 'Ma variante' },
  ],
  reducteursNoeud: [monReducteur],
  dessinerDessous: ({ ctx, vue, projection }) => {
    const k = vue.reglages.lire<number>('lueur')
    for (let u = 0; u < vue.h.nU; u++) {
      if (vue.opaciteAffichee[u]! < 0.05) continue
      ctx.fillStyle = rgba(vue.palette.accent, 0.08 * k)
      ctx.beginPath()
      ctx.arc(projection.x[u]!, projection.y[u]!, vue.tailleAffichee[u]! * 3, 0, Math.PI * 2)
      ctx.fill()
    }
  },
})
vue.on('selection', ({ unite }) => console.log('sélection', unite && vue.h.nom(unite)))
```

La page est servie directement sur `http://localhost:5180/variantes/<id>/` et apparaît dans le
catalogue (`/`) grâce à son `meta.json`. `npm run build` la découvre automatiquement.

## Concepts

- **Unité** : un index entier. `0 … nF-1` = feuilles (nœuds), `nF … nU-1` = agrégats (catégories,
  triées domaines → thèmes → sous-thèmes). `vue.h` (`Hierarchie`) donne `noeudDe(u)`,
  `categorieDe(u)`, `parent(u)`, `nom(u)`, `niveau(u)`, `domaine(u)`, `premisses[f]`,
  `utilisePar[f]`, `importance[f]` (nb de descendants), `dates[f]`, `chaine[f*3+k]`.
- **Granularité** (`vue.granularite`) : g ∈ [0,3] continu + ouvertures locales animées.
  `ouverture[c]` (0 fermé → 1 enfants sortis), `presence[u]`, `alpha[u]` : part visible ; pour une
  feuille, les alphas de sa chaîne (domaine, thème, sous-thème, feuille) somment à 1. Les enfants
  partent de la position affichée du parent (trajectoire + courbe). `representant(f)`, `facteur(f)`.
  API : `vue.definirGranularite(g, anime)`, `vue.pasGranularite(±1)`, `vue.ouvrir(u)`,
  `vue.replier(u)`, `vue.granularite.reinitialiserLocales()`.
- **Arêtes affichées** (`vue.aretes.paires`) : `Paire { source, cible, poids, nombre, poidsLignee,
  feuille }`. `poids / nombre` = part visible moyenne ; à granularité entière `poids = nombre`.
- **Dispositions** (`vue.dispositions`) : `dessus` (carte thématique, cercles imbriqués d3-pack
  domaine > thème > sous-thème > session), `face` (X = temps), `droite` (Y = couloirs type × origine),
  `cube` (X temps, Y couloirs, Z bande thématique). Z = bande thématique partout
  (`Z_MAX = 0.75`). En mode « faces », `vue.poidsFaces` = [dessus, face, droite] ∝ |visée·normale|^netteté.
  `vue.remplacerDisposition('dessus', positionsFeuilles)` pour la vôtre (Louvain, FA2…).
- **Positions** : `vue.positionsBase` (mélange des faces), `vue.positions` (après granularité),
  `vue.projection` (`x`, `y` écran en px CSS, `profondeur`, `echelle` perspective, `visible`,
  `profondeurNormalisee(u)`). Après les réducteurs : `vue.opaciteAffichee[u]`, `vue.tailleAffichee[u]`.
- **Caméra** (`vue.camera`) : `cible`, `orientation` (quaternion), `distance`, `perspective` (0…1
  affiché), `mode` 'auto' | 'ortho' | 'persp', `verrou2D`, `avant`/`droite`/`haut`,
  `projeterPoint([x,y,z])`, `allerVue(nom)`, `orbiter`, `zoomer`, `cadrer`. Vues : `dessus`,
  `dessous`, `face`, `arriere`, `droite`, `gauche`, `iso`. Côté vue : `vue.allerVue(nom)`,
  `vue.definirMode('2d' | '3d')`, `vue.cadrer(unites)`, `vue.cadrerTout()`.
- **Lignée** (`vue.lignee`) : `selection`, `graines`/`ancetres`/`descendants` (Uint8Array par
  feuille), `role(u)` → 'aucune' | 'selection' | 'ancetre' | 'descendant' | 'hors', `part(u)`.
  `vue.selectionner(u | null)`.
- **Filtres** (`vue.filtres`) : `etat` (période, exclusions, confiance min., catégories, texte,
  mode 'masquer' | 'estomper'), `actives[f]`, `modifier({...})`, `basculer(ensemble, valeur)`.
  En « masquer », les feuilles sortent aussi de l'agrégation (tailles, arêtes, barycentres).

## Points d'extension

| Besoin | Moyen |
|---|---|
| Couleur, taille, bordure, libellé, estompage d'un nœud | `reducteursNoeud` / `vue.ajouterReducteurNoeud((info, a, vue) => …)` — modifier `a` (`AffichageNoeud`) |
| Idem pour les arêtes | `reducteursArete` / `vue.ajouterReducteurArete((info, a, vue) => …)` |
| Dessin sous les arêtes (halos, enveloppes, grilles) | `dessinerDessous` / `vue.ajouterDessin('dessous', f)` |
| Dessin au-dessus des nœuds (libellés d'agrégats, axes, annotations) | `dessinerDessus` / `vue.ajouterDessin('dessus', f)` |
| Fiche de survol | `rendreFiche: (u, vue, defaut) => HTMLElement \| string \| null` (appeler `defaut()` pour enrichir) |
| Trajectoire des transitions | réglage `trajectoire` (`droite`, `ressort`, `spirale`) ou `trajectoire: (p: PointTrajectoire) => void` |
| Courbe d'accélération | réglage `courbe` (`lineaire`, `douce`, `sortie`, `entree`, `rebond`, `elastique`) ou `courbe: (t) => t'` |
| Stratégie de libellés | réglage `libelles` ('auto', 'agregats', 'aucun'), `densiteLibelles`, `seuilLibelle` ; ou un réducteur qui règle `a.libelle`, `a.forceLibelle`, `a.opaciteLibelle` ; ou dessiner ses libellés sur le calque dessus |
| Programmes sigma (formes, anneaux, arêtes courbes) | `programmesNoeud` / `programmesArete` puis `a.type = 'monProgramme'` et `a.extra = { … }` |
| Réglages propres | `reglagesSupplementaires: DefinitionReglage[]` (ou `vue.reglages.ajouter([...])`), lecture `vue.reglages.lire<T>('cle')` |
| Thème | variables CSS sur `.atlas-vue[data-theme="clair" \| "sombre"]` (voir `ui/style.css`) ; `vue.definirTheme('sombre')` ; `vue.palette` est relue au changement |
| Panneau gauche | `panneau: (p, vue) => p.ajouterSection(id, titre, element, { position, ouverte })`, `p.remplacer(id, el)` |
| Interface | `ui: { panneau, panneauOuvert, histogramme, granularite, gizmo, reglages, barreVues, fiche }` (booléens) |
| Animation continue (pulsations…) | `const stop = vue.animerEnContinu()` ; sinon la boucle ne tourne que si quelque chose bouge |
| Données réelles | `donnees: await chargerDonnees()` (GET /api/graphe, repli synthétique) ou `depuisApiAtlas(json)` |

**Événements** (`vue.on(type, f)` renvoie la fonction de désabonnement) : `survol`, `clic`,
`selection`, `vue`, `granularite`, `filtres`, `reglage`, `theme`, `image` (chaque image calculée).

Ordre dans une image : animations → inertie → caméra → granularité/arêtes → mélange des faces →
positions → projection → réducteurs (via `sigma.refresh`) → calques dessous/dessus → gizmo.

## Pièges connus

- **Couleurs translucides dans sigma** : sigma mélange en `blendFunc(ONE, ONE_MINUS_SRC_ALPHA)`
  sans prémultiplier. Une couleur `rgba(…, 0.3)` classique sort délavée, presque blanche sur fond
  clair. Le moteur convertit `a.couleur` + `a.opacite` avec `rgbaGL` (alpha prémultiplié). Si vous
  passez des couleurs dans `a.extra` pour un programme perso, utilisez `rgbaGL`. Pour les calques
  canvas 2D, utilisez `rgba` (non prémultiplié).
- **Cache de couleurs sigma** : sigma garde en mémoire chaque chaîne de couleur vue. Ne générez pas
  des couleurs continûment différentes (dégradés calculés par image) : quantifiez (`rgbaGL`
  quantifie déjà l'alpha au 1/60) ou utilisez `melangerCouleurs` avec un pas discret.
- **Positions** : sigma lit x/y dans les **attributs du graphe** au moment de `process()`, pas dans
  la sortie du réducteur. Le moteur écrit directement dans les objets d'attributs (sans événement)
  puis appelle `refresh`. Ne changez pas x/y depuis un réducteur.
- **bbox fixe** : `setCustomBBox({x:[-1,1], y:[-1,1]})`, caméra sigma figée (zoom/déplacement/rotation
  désactivés), `stagePadding: 0`. Écran ↔ graphe : `x = W/2 + S·gx/2`, `y = H/2 − S·gy/2`, S = min(W, H).
  N'utilisez pas la caméra sigma.
- **Chemin rapide** : pendant un mouvement, 7 images sur 8 font `refresh({ partialGraph, skipIndexation })`
  (réducteurs + tampons WebGL, sans tri zIndex ni grille de libellés). Tri de profondeur et choix
  des libellés sont refaits à la passe complète (toutes les 8 images et à la dernière).
- **zIndex** : entier, plus grand = dessiné devant. Le défaut vaut `(1 − profondeur)·1000`, +1000 pour
  un agrégat, +2000 surligné, +4000 survol. Gardez cet ordre de grandeur si vous le modifiez.
- **Ajout / retrait d'arêtes** : chaque `dropEdge` déclenche chez sigma une réindexation complète.
  Le moteur ne retire rien pendant une animation (paires vides masquées) et purge en une fois à
  l'arrêt. N'ajoutez/retirez pas d'arêtes vous-même : passez par les réducteurs (`a.cache`).
- **Réducteurs** : appelés pour chaque unité / arête à chaque image en mouvement. Pas d'allocation
  lourde, pas de DOM. `info` est un objet **réutilisé** : copiez ce que vous voulez garder.
- **Événements souris** : le moteur écoute `pointerdown` sur la scène et sigma écoute la souris sur
  son calque `mouse`. Un clic qui termine un glisser est ignoré (`controles.dernierGlisser`) ; les
  tapes tactiles passent par `vue.uniteSous(x, y)` (pointage maison) et non par sigma.
- **Calques** : `ctx` est déjà à l'échelle du ratio de pixels et effacé ; dessinez en px CSS avec
  `projection.x/y`. Les calques ne reçoivent pas d'événements (`pointer-events: none`).
- **Onglet masqué** : `requestAnimationFrame` ne tourne pas ; la vue ne se met à jour qu'au retour.
- **localStorage** : les réglages sont mémorisés par `id` (try/catch partout). Un réglage dont le type
  change est réinitialisé. Bouton « Réinitialiser » dans le dossier Configuration.
- **Ctrl + 1/3/7** peut être intercepté par le navigateur (changement d'onglet) : Alt + chiffre fait
  la même chose.
