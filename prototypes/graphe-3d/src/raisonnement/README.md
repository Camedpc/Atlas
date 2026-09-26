# Fondations `src/raisonnement` — guide pour écrire une vision

Cahier des charges de la série : `../../RAISONNEMENT.md`. Référence complète : `raisonnement/r0-reference/main.ts`.

Deux graphes :

- **graphe de justification** : toutes les prémisses de toutes les démonstrations (comme en base) ;
- **graphe de lecture** : dérivé du premier par une **stratégie** ; c'est lui qu'on affiche, de gauche
  (hypothèses, prémisses) à droite (résultats). Le reste devient du **contexte rattaché** aux nœuds.

| Fichier | Rôle |
|---|---|
| `donnees.ts` | Types (`NoeudR`, `DemonstrationR`, `Premisse {id, role}`, `InfoDecision`, `InfoChoix`, `LienSemantique`), jeu synthétique `genererJeuRaisonnement()`, `construireJustification()`, `dependantsDe()`, adaptateur `depuisApiAtlas()` / `chargerJeu()` |
| `lecture.ts` | Dérivation : étapes `etapeRoles` (a), `etapeReductionTransitive` (b), `etapeFusionChaines` (c), stratégies `STRATEGIES`, `deriverLecture()`, `enregistrerStrategie()`, `ligneeLecture()` |
| `disposition.ts` | Couches de type `COUCHES`, `disposer()` (dagre, synchrone), `disposerAsync()` (ELK layered ou dagre) |
| `vue.ts` | `creerVueRaisonnement(conteneur, options)` : rendu sigma, 2D ↔ 3D, survol, lignée, liens complets |
| `formes.ts` | Programme WebGL sigma : cercle, losange, hexagone, carré, triangle, capsule, avec bordure |
| `ui.ts`, `style.css`, `apparence.ts` | Fiche, panneau ☰, barre, compteur ; palette en variables CSS |

Tout s'importe depuis `src/raisonnement` (`index.ts`).

## Une vision en 30 lignes

```
raisonnement/r3-ma-vision/
├── index.html   (copier celui de r0 : <div id="app"> + <script type="module" src="./main.ts">)
├── main.ts
├── style.css
├── meta.json    { "id": "r3-ma-vision", "titre": "R3 · …", "resume": "…", "idees": ["…"], "ordre": 3 }
└── NOTES.md
```

```ts
import { creerVueRaisonnement, enregistrerStrategie, etapeRoles, etapeFusionChaines, rgba, type ReducteurPoint } from '../../src/raisonnement'
import meta from './meta.json'

// Une stratégie maison : rôles principal + auxiliaire, puis chaînes (sans réduction transitive).
enregistrerStrategie({
  id: 'r3', nom: 'R3 · auxiliaires visibles', description: '…',
  etapes: [etapeRoles, etapeFusionChaines], parametres: { rolesRetenus: ['principale', 'auxiliaire'] },
})

// Taille ∝ confiance ; les nœuds IA en violet.
const reducteur: ReducteurPoint = (info, a, vue) => {
  a.taille *= 0.6 + info.noeud.confiance.estimation
  if (info.noeud.origine === 'ia') a.couleur = vue.palette.origine.ia
}

const vue = creerVueRaisonnement(document.getElementById('app')!, {
  id: meta.id,                         // clé de mémorisation des réglages
  strategie: 'r3', mode: '2d',
  reglagesSupplementaires: [{ cle: 'halo', defaut: 0.5, min: 0, max: 1, pas: 0.01, dossier: 'Vision R3' }],
  reducteursNoeud: [reducteur],
  dessinerDessous: ({ ctx, vue, projection }) => {
    for (let p = 0; p < vue.nU; p++) {
      if (vue.opaciteAffichee[p]! < 0.05) continue
      ctx.fillStyle = rgba(vue.palette.accent, 0.08 * vue.reglages.lire<number>('halo'))
      ctx.beginPath(); ctx.arc(projection.x[p]!, projection.y[p]!, vue.tailleAffichee[p]! * 3, 0, 7); ctx.fill()
    }
  },
})
;(window as any).rsnVue = vue          // convention : le script de capture lit window.rsnVue
```

La page est servie sur `http://localhost:5181/raisonnement/<id>/`, apparaît dans le catalogue (section
« Graphe de raisonnement ») grâce à `meta.json`, et `npm run build` la découvre automatiquement.

## Concepts

- **Point** : index entier. `0 … nU−1` = unités de lecture (`vue.lecture.unites[p]`), `nU … nP−1` =
  nœuds **masqués** (contexte pur : définitions, outils… sans arête de lecture), rangés dans une colonne à
  gauche et visibles seulement avec les liens complets. `vue.noeud(p)`, `vue.indexNoeud(p)` (nœud de
  justification, la conclusion pour une étape), `vue.pointDeNoeud(i)`.
- **Unité de lecture** (`UniteLecture`) : `genre` 'noeud' ou 'etape' (chaîne fusionnée), `membres`
  (ordre de la chaîne), `conclusion`, `contexte` (`{noeud, role, arete}` : prémisses écartées),
  `aretesInternes`.
- **Arête de lecture** (`AreteLecture`) : `source`, `cible` (unités), `resume` (arêtes complètes
  représentées), `transitives` (arêtes retirées par la réduction transitive et absorbées ici).
  Invariant vérifié à chaque dérivation (`verifierCorrespondance`) : chaque arête complète est dans
  exactement un `resume` / `transitives` / `aretesInternes` / `lecture.aretesContexte`.
- **Statistiques** : `vue.lecture.stats` (`noeudsComplet`, `aretesComplet`, `unites`, `aretes`,
  `masques`, `etapes`, `transitivesRetirees`, `roles`…), `texteCompteur(lecture)`, `lecture.journal`.
- **Paramètres de lecture** (`ParametresLecture`) : `demonstrations` ('toutes' | 'principale'),
  `rolesRetenus`, `masquerContexte`, `typesToujoursVisibles`, `typesInsecables`, `longueurMinChaine`,
  `longueurMaxChaine`, `memeSousProbleme`. `vue.definirStrategie(id | objet, surcharges)`,
  `vue.definirParametresLecture({...})`.
- **Disposition** (`vue.disposition`) : `x`, `z` (monde, plan 2D), `yCouche` (profondeur 3D), `couche`,
  `rang`, `xRangs`, `xContexte`, `bornes`. Monde façon Blender : X = rang logique, Z = vertical,
  Y = couche de type × `vue.extrusion` (0 en 2D → 1 en 3D, animé). `vue.redisposer({ ecartRangs, … })`.
- **Positions / projection** : `vue.positions` (3 × nP, après transition et extrusion), `vue.projection`
  (`x`, `y` en px CSS, `profondeur`, `echelle`, `visible`), puis après réducteurs
  `vue.opaciteAffichee[p]`, `vue.tailleAffichee[p]` (rayon px).
- **Caméra** : `vue.camera` (`Camera3D` du moteur). `vue.definirMode('2d' | '3d', vue?)`,
  `vue.allerVue('face' | 'droite' | 'dessus' | 'iso' …)`, `vue.cadrer(points)`, `vue.cadrerTout()`.
- **Survol / lignée** : `vue.survol`, `vue.selection`, `vue.lignee[p]` (0 hors, 1 ancêtre,
  2 descendant, 3 sélection), `vue.ligneeActive`, `vue.selectionner(p)`, `vue.montrerPortee(p)`
  (tout ce qui dépend du point dans le graphe complet : portée d'un choix).

## Points d'extension

| Besoin | Moyen |
|---|---|
| Couleur, taille, forme, bordure, libellé d'un point | `reducteursNoeud` / `vue.ajouterReducteurNoeud((info, a, vue) => …)` — modifier `a` (`AffichagePoint`, `a.forme` ∈ `FORMES`) |
| Idem pour les arêtes (lecture et complètes) | `reducteursArete` / `vue.ajouterReducteurArete` — `info.genre`, `info.role`, `info.completes`, `a.type` 'fleche' / 'ligne' |
| Dessin sous les arêtes / au-dessus des nœuds | `dessinerDessous`, `dessinerDessus` / `vue.ajouterDessin('dessous' \| 'dessus', f)` ; par défaut : plans des couches (dessous), pastilles de contexte, liens sémantiques, en-tête du contexte (dessus) |
| Fiche de survol | `rendreFiche: (p, vue, defaut) => HTMLElement \| string \| null` (appeler `defaut()` pour enrichir) |
| Stratégie de lecture | `enregistrerStrategie({ id, nom, description, etapes, parametres })` ; une étape est `(t: TravailLecture, p) => void` (voir `lecture.ts`) |
| Disposition | réglages `moteur` (dagre / ELK), `classement`, `ecartRangs`, `ecartNoeuds`, `ecartCouches`, `ajusterAspect` ; option `disposition: {...}` ; `disposerAsync` pour la vôtre |
| Réglages Tweakpane | `reglagesSupplementaires: DefinitionReglage[]`, lecture `vue.reglages.lire<T>('cle')` |
| Thème | clair par défaut ; `vue.definirTheme('sombre')` ; variables CSS sur `.rsn-vue[data-theme="clair" \| "sombre"]` (`--couche-0…6`, `--statut-*`, `--role-*`…) ; `vue.palette` est relue au changement |
| Panneau gauche ☰ | `panneau: (p, vue) => p.ajouterSection(id, titre, element, { position, ouverte })`, `p.remplacer(id, el)`, `p.basculer()` ; sections par défaut `lecture`, `selection`, `legende` |
| Interface | `ui: { panneau, panneauOuvert, reglages, gizmo, barre, fiche, compteur }` (booléens) ; `vue.margesSures` (px) pour le cadrage |
| Vue 3D | option `directionCote: [x, y, z]` (direction cible → œil de la vue de côté) |
| Données réelles | `jeu: await chargerJeu()` (GET /api/graphe, repli synthétique) ou `depuisApiAtlas(json)` |
| Animation continue | `const stop = vue.animerEnContinu()` ; sinon la boucle ne tourne que si quelque chose bouge |

**Événements** (`vue.on(type, f)` renvoie la fonction de désabonnement) : `survol`, `selection`,
`lecture` (nouvelle dérivation), `disposition`, `mode`, `theme`, `reglage`, `image`.

**Clavier** : `T` 2D ↔ 3D, `L` liens complets, `N` panneau, `Échap` efface la lignée, `Origine` cadre
tout, `.` cadre la lignée ; en 3D, comme Blender (`1` `3` `7`, `2` `4` `6` `8`, `5`, `9`, bouton du
milieu ou clic gauche glissé = orbiter, Maj + milieu = déplacer, molette = zoom). En 2D, glisser déplace.

## Pièges

- **Réutilisation du moteur** : `camera3d`, `controles`, `gizmo`, `reglages`, `anim`, `apparence`
  (couleurs) sont importés de `src/core` **sans modification**. Ne modifiez pas `src/core` ni `variantes/`.
- **Couleurs WebGL** : passez par `rgbaGL` (alpha prémultiplié) pour sigma ; `rgba` pour les calques canvas.
  La vue le fait pour `a.couleur` / `a.couleurBordure` / couleurs d'arêtes.
- **Positions** : la vue écrit x / y dans les attributs graphology puis appelle `sigma.refresh()`. Ne
  touchez pas x / y depuis un réducteur ; modifiez `vue.disposition` puis `vue.redisposer()`, ou dessinez
  sur un calque.
- **Changer de stratégie reconstruit le graphe sigma** (les points changent) : ne gardez pas d'indices de
  point d'une dérivation à l'autre ; utilisez les ids de nœuds (`vue.noeud(p).id`) et l'événement `lecture`.
- **Réducteurs** : appelés pour chaque point / arête à chaque image en mouvement ; pas d'allocation lourde,
  pas de DOM. `info` est réutilisé : copiez ce que vous gardez.
- **Libellés** : seuls théorèmes, résultats et décisions sont forcés ; les autres passent par la grille de
  sigma (`densiteLibelles`). Des libellés forcés voisins peuvent se chevaucher.
- **ELK** est chargé à la demande (`import()`), donc asynchrone : `vue.redisposer()` renvoie une promesse ;
  la stratégie « chaînes seules » ne fusionne presque rien sur le graphe complet (les prémisses de
  contexte cassent les chaînes) : c'est attendu, combinez-la avec (a).
- **Réglages mémorisés** dans `localStorage` sous `atlas-raisonnement:<id>` : pensez au bouton
  « Réinitialiser » (dossier Configuration) si un défaut ne semble pas s'appliquer.
- **Onglet masqué** : `requestAnimationFrame` ne tourne pas ; `vue.avancer(ms)` force le calcul (tests).

## Captures (Playwright)

Chrome est masqué : on capture avec Playwright (Chromium), depuis le dossier `shots` du scratchpad de
session (Playwright y est installé). Script réutilisable : `capture-raisonnement.mjs`.

```bash
cd <scratchpad>/shots
node capture-raisonnement.mjs r0-reference r3-ma-vision        # BASE=http://localhost:5181 par défaut
BASE=http://localhost:5181 LARGEUR=1600 HAUTEUR=1000 node capture-raisonnement.mjs r0-reference
```

Pour chaque vision : `out-raisonnement/<id>/01-demarrage-2d.png`, `02-survol.png` (un théorème visible),
`03-lignee.png` (clic), `04-liens-complets.png` (touche L), `05-3d-cote.png` (touche T),
`06-sombre.png`, `07-strategie-complet.png` ; et `out-raisonnement/rapport.json` : erreurs et
avertissements console, images/s (`ipsDeplacement2D`, `ipsOrbite3D`), statistiques de lecture
(stratégie initiale et « complet »). Le script efface les réglages mémorisés avant de charger la page.
Conditions : la vision expose `window.rsnVue` et garde les raccourcis `T` et `L`. Regardez les PNG
(outil Read) avant de conclure.
