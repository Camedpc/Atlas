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

## Nouveautés itération 2

Tout est rétrocompatible : les variantes existantes compilent et tournent sans modification.

### Comportement par défaut

- **Pavé numérique émulé** : en mode 2D, 2 / 4 / 6 / 8 (et 5) font passer en 3D puis orbitent,
  que ce soit au pavé (`Numpad4`) ou avec les chiffres du haut (`Digit4`, réglage `emulerPave`).
- **Zone sûre** : `cadrer`, `cadrerTout` et le cadrage initial centrent le contenu dans la zone
  libre de l'interface. `vue.zoneSure()` mesure la barre, le bas (granularité, histogramme), le
  panneau ouvert, et **tout élément portant l'attribut `data-zone-sure`** (même hors de la vue) ;
  on ajoute `margesSures` (option ou propriété `vue.margesSures`, objet ou fonction, en px).
  `camera.cadrer(positions, indices, duree, marge, zone)` accepte ces marges. Le cadrage initial
  est refait à la première image si la variante n'a pas touché la caméra entre-temps.
- **Transitions réactives** : l'animation de g et des ouvertures locales est linéaire dans le
  temps ; seule la courbe du réglage `courbe` (défaut `sortie`, départ immédiat) s'applique aux
  positions. Durée par défaut 650 ms. Plus de double accélération, plus de temps négatif.
  Animations de caméra : réglage `courbeVues` (défaut `sortie`) et `dureeVues`, ou
  `camera.courbeAnimations`.
- **Carte thématique aérée** : chaque feuille reçoit une aire ∝ (1 + √importance)² dans
  l'empilement, puis une relaxation anti-collision (`relaxerCollisions`) casse le nid d'abeille.
- **Contexte lisible** : survol et lignée atténuent le reste une seule fois, à `opaciteContexte`
  (défaut 0,3, dossier Lignée).
- **Pointage tolérant** : survol, clic et double-clic utilisent `vue.uniteSous(x, y, 4)` (4 px
  autour du disque), plus fiable que le pointage exact de sigma sur les nœuds de 3 px. Le survol
  est recalculé en fin de mouvement sous un pointeur immobile.
- **Libellés stables** (réglage `libellesStables`) : pendant un mouvement, les libellés affichés
  au départ restent affichés ; la grille de sigma ne reprend la main qu'à l'arrêt.
- **Réglages mémorisés** : seules les valeurs modifiées sont écrites (un nouveau défaut du moteur
  s'applique aux réglages jamais touchés), écriture forcée à la fermeture ; `reglages.sauver()`
  écrit tout de suite (utile avant de recréer une vue).

### Agrégats dans les vues temps et type

Problème : un agrégat placé au centre de ses feuilles perd l'information de l'axe (en vue de
face, tous les agrégats se tassent au milieu de la période).

- **Placement à la médiane** (réglage `placementAgregats`, défaut `mediane`) ;
  `calculerBarycentres(h, d, actives, 'mediane' | 'moyenne')`.
- **Étendues** : `vue.etendues` (`Etendues`) calcule par agrégat les quantiles temporels
  (`quantilesTemps(c)` → min, q10, q25, médiane, q75, q90, max), l'effectif par semaine
  (`tranches`, `nbTranches`) et par type (`types`) ; `vue.etendues.etendue(u, 'face' | 'droite' |
  'dessus' | 'cube')` donne les quantiles de chaque axe dans une disposition (coordonnées monde).
  `pointSurAxe(vue, u, 'temps' | 'couloirs', valeur)` renvoie le point monde de l'agrégat décalé
  le long de l'axe (suit le poids de la face et la granularité) ; `etendueTempsEcran(vue, u)` les
  quantiles projetés à l'écran ; `poidsAxes(vue)` la visibilité de chaque axe.
- **Rendu par défaut** (`dessinerEtendues`, calque dessous, avant ceux de la variante), réglage
  `etendues` (dossier Agrégats) :
  - `capsule` : boîte à moustaches horizontale sur la ligne de l'agrégat (min–max, q10–q90,
    q25–q75), le disque restant à la médiane ;
  - `tranches` : **l'agrégat découpé en périodes** (catégorie × semaine), un disque par tranche,
    aire ∝ effectif : on lit quand le thème a été travaillé ;
  - `aucune`.
  En vue de droite (réglage `etenduesCouloirs`), un segment par couloir de type, longueur ∝
  effectif. Le rendu n'apparaît que près de la face concernée. `etenduesParDefaut: false` le
  retire (pour dessiner le sien avec les mêmes données).

### Nouveaux points d'extension

| Besoin | API |
|---|---|
| Trajectoire qui connaît l'unité, le parent, le sens | `PointTrajectoire` gagne `unite`, `parent`, `o` (ouverture brute du parent) et `sens` (1 sortie, −1 rentrée, 0 immobile) — facultatifs dans le type, toujours remplis par le moteur |
| Positions selon la catégorie et le sens | option `apresPositions` / `vue.ajouterCrochetPositions(({ positions, base, ouverture, sens, vue }) => …)`, appelé après `granularite.calculerPositions` ; `granularite.sens[c]` |
| Modifier les positions écran (fisheye, lentille) | option `apresProjection` / `vue.ajouterApresProjection((projection, vue) => …)` : avant sigma, le pointage et les calques voient la même projection |
| Revenir à la granularité globale pour une catégorie | `granularite.revenirAuGlobal(c)` (et `retirer(c)`, désormais public), `granularite.aDesSurcharges` |
| Panneau gauche hors de la vue ou qui pousse la scène | `ui: { panneauMode: 'pousse' }` (la scène rétrécit) ou `ui: { panneauMode: 'externe', conteneurPanneau }` ; `new PanneauGauche(parent, vue, ouvert, { mode })`. En mode externe, le conteneur doit hériter des variables CSS de `.atlas-vue` (le placer dedans ou redéfinir les variables) |
| Courbe / durée des animations de caméra | réglages `courbeVues`, `dureeVues` ; `camera.courbeAnimations` |
| Tests, pilotage | `vue.image(t)` et `vue.avancer(ms)` (publics), `vue.definirSurvol(u)`, `camera.projeterPoint(p).profondeur` |

Le premier cadrage, la fiche et le pointage tiennent compte du décalage de la scène
(`scene.offsetLeft/Top`) quand le panneau pousse la scène.
