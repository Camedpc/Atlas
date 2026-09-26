// Disposition gauche → droite du graphe de lecture, en couches.
//
// x = rang logique (profondeur de raisonnement : hypothèses et prémisses à gauche, résultats à
// droite), y écran = ordre dans le rang (croisements minimisés par dagre ou ELK layered).
// Coordonnées monde (convention Blender, Z vertical) :
//   X = rang, Z = position verticale, Y = couche de type (profondeur en 3D, 0 en 2D).
//
// Points : 0 … nU−1 = unités de lecture, nU … nU+nM−1 = nœuds masqués (contexte pur), rangés
// dans une colonne à gauche, visibles seulement quand on montre les liens complets.

import dagre from '@dagrejs/dagre'
import type { TypeRaisonnement } from './donnees'
import type { GrapheLecture } from './lecture'

// ─── Couches de type (profondeur 3D) ─────────────────────────────────────────

export interface CoucheType {
  id: string
  nom: string
  types: TypeRaisonnement[]
}

export const COUCHES: CoucheType[] = [
  { id: 'hypotheses', nom: 'Hypothèses', types: ['hypothese', 'axiome'] },
  { id: 'definitions', nom: 'Définitions', types: ['definition'] },
  { id: 'choix', nom: 'Choix et décisions', types: ['choix_modelisation', 'decision'] },
  { id: 'assertions', nom: 'Assertions et lemmes', types: ['lemme', 'proposition', 'assertion', 'conjecture'] },
  { id: 'experiences', nom: 'Expériences', types: ['experience', 'observation'] },
  { id: 'calculs', nom: 'Calculs', types: ['calcul'] },
  { id: 'resultats', nom: 'Résultats', types: ['theoreme', 'resultat'] },
]
const COUCHE_DE_TYPE = new Map<TypeRaisonnement, number>()
COUCHES.forEach((c, i) => c.types.forEach((t) => COUCHE_DE_TYPE.set(t, i)))

export function coucheDe(type: TypeRaisonnement): number {
  return COUCHE_DE_TYPE.get(type) ?? 3
}

// ─── Options et résultat ─────────────────────────────────────────────────────

export interface OptionsDisposition {
  moteur: 'dagre' | 'elk'
  /** Distance entre deux rangs (px de mise en page). */
  ecartRangs: number
  /** Distance entre deux nœuds d'un même rang (px de mise en page). */
  ecartNoeuds: number
  /**
   * Classement des rangs (dagre) :
   *  - 'ancre' (défaut) : network-simplex + une racine virtuelle reliée (poids fort) à toutes les
   *    prémisses fondatrices sans parent (hypothèses, axiomes, définitions, choix) et un puits
   *    virtuel relié aux résultats terminaux : fondations alignées à gauche, résultats à droite,
   *    le reste compact ;
   *  - 'sources' : toutes les sources sur le premier rang (x = plus long chemin depuis une source) ;
   *  - un classeur dagre natif.
   */
  classement: 'ancre' | 'sources' | 'network-simplex' | 'longest-path' | 'tight-tree'
  /** ELK : place les résultats et théorèmes terminaux sur le dernier rang. */
  resultatsADroite: boolean
  /** Unités monde par px de mise en page. */
  echelle: number
  /** Distance monde entre deux couches de type (3D). */
  ecartCouches: number
  /**
   * Rapport largeur / hauteur visé (ex. celui de l'écran) : si la mise en page est plus haute,
   * l'axe des rangs est étiré pour occuper la largeur. 0 = pas d'étirement.
   */
  aspectCible: number
}

export const OPTIONS_DISPOSITION: OptionsDisposition = {
  moteur: 'dagre',
  ecartRangs: 120,
  ecartNoeuds: 20,
  classement: 'ancre',
  resultatsADroite: true,
  echelle: 0.01,
  ecartCouches: 3,
  aspectCible: 0,
}

export interface Disposition {
  moteur: 'dagre' | 'elk'
  /** Nombre d'unités de lecture (les points suivants sont les masqués). */
  nU: number
  /** Nœuds de justification des points masqués (point nU + k). */
  masques: number[]
  /** Monde : X (rang), Z (vertical), Y (couche × écart) par point. */
  x: Float32Array
  z: Float32Array
  yCouche: Float32Array
  couche: Int8Array
  /** Rang de lecture (−1 pour les isolés et masqués). */
  rang: Int32Array
  /** X monde de chaque rang. */
  xRangs: number[]
  /** Colonne des masqués (X monde), NaN s'il n'y en a pas. */
  xContexte: number
  bornes: { xmin: number; xmax: number; zmin: number; zmax: number }
}

// ─── Calcul ──────────────────────────────────────────────────────────────────

/** Prémisses fondatrices (ancrées au premier rang) et conclusions (ancrées au dernier). */
const FONDATIONS = new Set<TypeRaisonnement>(['hypothese', 'axiome', 'definition', 'choix_modelisation'])
const FINS = new Set<TypeRaisonnement>(['resultat', 'theoreme'])

/** Disposition synchrone (dagre). */
export function disposer(g: GrapheLecture, options: Partial<OptionsDisposition> = {}): Disposition {
  const o = { ...OPTIONS_DISPOSITION, ...options }
  if (o.moteur === 'elk') console.info('[raisonnement] ELK est asynchrone : utiliser disposerAsync ; repli sur dagre.')
  const { lies } = composantes(g)
  const gr = new dagre.graphlib.Graph()
  const inverse = o.classement === 'sources'
  const ancre = o.classement === 'ancre'
  gr.setGraph({
    rankdir: inverse ? 'RL' : 'LR',
    nodesep: o.ecartNoeuds,
    ranksep: o.ecartRangs,
    ranker: inverse ? 'longest-path' : ancre ? 'network-simplex' : o.classement,
    marginx: 0,
    marginy: 0,
  })
  gr.setDefaultEdgeLabel(() => ({}))
  for (const u of lies) gr.setNode(String(u), { width: taille(g, u), height: 10 })
  for (const a of g.aretes) {
    // Astuce « sources » : dagre (plus long chemin) aligne les puits ; on inverse les arêtes et le
    // sens (RL) pour aligner au contraire toutes les sources à gauche.
    if (inverse) gr.setEdge(String(a.cible), String(a.source))
    else gr.setEdge(String(a.source), String(a.cible), { weight: 1, minlen: 1 })
  }
  if (ancre) {
    // Racine et puits virtuels : le poids fort tire les fondations au premier rang et les
    // résultats terminaux au dernier ; ils sont ignorés à l'assemblage.
    gr.setNode('racine', { width: 1, height: 1 })
    gr.setNode('puits', { width: 1, height: 1 })
    const typeDe = (u: number) => g.justification.noeuds[g.unites[u]!.conclusion]!.type
    for (const u of lies) {
      if (g.entrantes[u]!.length === 0 && FONDATIONS.has(typeDe(u))) gr.setEdge('racine', String(u), { weight: 8, minlen: 1 })
      if (o.resultatsADroite && g.sortantes[u]!.length === 0 && FINS.has(typeDe(u))) gr.setEdge(String(u), 'puits', { weight: 8, minlen: 1 })
    }
  }
  dagre.layout(gr)
  const pos = new Map<number, { x: number; y: number }>()
  for (const u of lies) {
    const n = gr.node(String(u))
    pos.set(u, { x: n.x ?? 0, y: n.y ?? 0 })
  }
  return assembler(g, o, pos, 'dagre')
}

/** Disposition asynchrone : ELK layered (chargé à la demande) ou dagre. */
export async function disposerAsync(g: GrapheLecture, options: Partial<OptionsDisposition> = {}): Promise<Disposition> {
  const o = { ...OPTIONS_DISPOSITION, ...options }
  if (o.moteur !== 'elk') return disposer(g, o)
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js')
  const elk = new ELK()
  const { lies } = composantes(g)
  const typeDe = (u: number) => g.justification.noeuds[g.unites[u]!.conclusion]!.type
  const racine = {
    id: 'racine',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.layered.spacing.nodeNodeBetweenLayers': String(o.ecartRangs),
      'elk.spacing.nodeNode': String(o.ecartNoeuds),
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.layering.strategy': 'NETWORK_SIMPLEX',
      'elk.separateConnectedComponents': 'false',
    },
    children: lies.map((u) => {
      const contrainte =
        g.entrantes[u]!.length === 0 && FONDATIONS.has(typeDe(u)) ? 'FIRST'
          : o.resultatsADroite && g.sortantes[u]!.length === 0 && FINS.has(typeDe(u)) ? 'LAST' : undefined
      return {
        // Largeur commune : ELK aligne les nœuds d'une couche par leur bord, pas leur centre.
        id: String(u),
        width: 10,
        height: 10,
        layoutOptions: contrainte ? { 'elk.layered.layering.layerConstraint': contrainte } : undefined,
      }
    }),
    edges: g.aretes.map((a) => ({ id: `e${a.index}`, sources: [String(a.source)], targets: [String(a.cible)] })),
  }
  const res = await elk.layout(racine)
  const pos = new Map<number, { x: number; y: number }>()
  for (const c of res.children ?? []) pos.set(Number(c.id), { x: (c.x ?? 0) + (c.width ?? 0) / 2, y: (c.y ?? 0) + (c.height ?? 0) / 2 })
  return assembler(g, o, pos, 'elk')
}

function taille(g: GrapheLecture, u: number): number {
  return g.unites[u]!.genre === 'etape' ? 18 : 10
}

/** Unités reliées (placées par le moteur) et isolées (placées à part, à gauche). */
function composantes(g: GrapheLecture): { lies: number[]; isoles: number[] } {
  const lies: number[] = [], isoles: number[] = []
  for (let u = 0; u < g.unites.length; u++) (g.entrantes[u]!.length || g.sortantes[u]!.length ? lies : isoles).push(u)
  return { lies, isoles }
}

function assembler(g: GrapheLecture, o: OptionsDisposition, pos: Map<number, { x: number; y: number }>, moteur: 'dagre' | 'elk'): Disposition {
  const nU = g.unites.length
  const masques = g.masques
  const n = nU + masques.length
  const x = new Float32Array(n), z = new Float32Array(n), yCouche = new Float32Array(n)
  const couche = new Int8Array(n), rang = new Int32Array(n).fill(-1)
  const noeuds = g.justification.noeuds

  // Rangs : abscisses distinctes (arrondies) triées.
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity
  for (const p of pos.values()) {
    xmin = Math.min(xmin, p.x); xmax = Math.max(xmax, p.x)
    ymin = Math.min(ymin, p.y); ymax = Math.max(ymax, p.y)
  }
  if (!pos.size) xmin = xmax = ymin = ymax = 0
  const cles = [...new Set([...pos.values()].map((p) => Math.round(p.x)))].sort((a, b) => a - b)
  const rangDe = new Map(cles.map((c, i) => [c, i]))
  const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2
  const e = o.echelle
  // Étirement horizontal : on vise le rapport largeur / hauteur demandé (colonnes de gauche comprises).
  const largeurBrute = xmax - xmin + o.ecartRangs * 2, hauteurBrute = Math.max(1, ymax - ymin)
  const f = o.aspectCible > 0 && largeurBrute / hauteurBrute < o.aspectCible ? Math.min(4, (o.aspectCible * hauteurBrute) / largeurBrute) : 1
  const ex = e * f
  for (const [u, p] of pos) {
    x[u] = (p.x - cx) * ex
    z[u] = -(p.y - cy) * e
    rang[u] = rangDe.get(Math.round(p.x)) ?? -1
  }
  const xRangs = cles.map((c) => (c - cx) * ex)
  const gauche = (xmin - cx) * ex
  const hauteur = Math.max(1, (ymax - ymin) * e)

  // Colonne(s) empilée(s) à gauche : renvoie la position du k-ième élément.
  const empiler = (liste: number[], xDepart: number, pas: number, place: (i: number, px: number, pz: number) => void) => {
    const parColonne = Math.max(1, Math.floor(hauteur / pas) + 1)
    const nbCol = Math.ceil(liste.length / parColonne)
    liste.forEach((i, k) => {
      const col = Math.floor(k / parColonne)
      const dansCol = Math.min(parColonne, liste.length - col * parColonne)
      const ligne = k - col * parColonne
      place(i, xDepart - (nbCol - 1 - col) * o.ecartRangs * ex * 0.9, ((dansCol - 1) / 2 - ligne) * pas)
    })
    return nbCol
  }
  // Unités isolées (aucune arête de lecture) : juste à gauche du premier rang.
  const isoles: number[] = []
  for (let u = 0; u < nU; u++) if (!pos.has(u)) isoles.push(u)
  isoles.sort((a, b) => coucheDe(noeuds[g.unites[a]!.conclusion]!.type) - coucheDe(noeuds[g.unites[b]!.conclusion]!.type))
  const pasIsoles = o.ecartNoeuds * 2 * e
  const nbColIsoles = isoles.length ? empiler(isoles, gauche - o.ecartRangs * ex, pasIsoles, (u, px, pz) => { x[u] = px; z[u] = pz }) : 0

  // Masqués (contexte pur) : colonne plus à gauche, triée par couche puis par nombre d'usages.
  const usages = (i: number) => g.justification.sortantes[i]!.length
  const ordreMasques = masques.map((m, k) => ({ m, k })).sort((a, b) =>
    coucheDe(noeuds[a.m]!.type) - coucheDe(noeuds[b.m]!.type) || usages(b.m) - usages(a.m))
  const xContexte = masques.length ? gauche - o.ecartRangs * ex * (1.2 + nbColIsoles * 0.9) : NaN
  empiler(ordreMasques.map((v) => v.k), xContexte, o.ecartNoeuds * 1.1 * e, (k, px, pz) => { x[nU + k] = px; z[nU + k] = pz })

  // Couches de type.
  const milieu = (COUCHES.length - 1) / 2
  for (let p = 0; p < n; p++) {
    const noeud = p < nU ? noeuds[g.unites[p]!.conclusion]! : noeuds[masques[p - nU]!]!
    couche[p] = coucheDe(noeud.type)
    yCouche[p] = (couche[p]! - milieu) * o.ecartCouches
  }
  let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity
  for (let p = 0; p < n; p++) {
    bx0 = Math.min(bx0, x[p]!); bx1 = Math.max(bx1, x[p]!)
    bz0 = Math.min(bz0, z[p]!); bz1 = Math.max(bz1, z[p]!)
  }
  return { moteur, nU, masques, x, z, yCouche, couche, rang, xRangs, xContexte, bornes: { xmin: bx0, xmax: bx1, zmin: bz0, zmax: bz1 } }
}
