// R32 · Arbres de preuve : du graphe de lecture (un DAG) à des dérivations numérotées façon `bussproofs`.
//
// Construction (aucune donnée propre à un jeu) :
//   - chaque unité de lecture est une règle d'inférence : ses prémisses de lecture au-dessus du trait,
//     sa conclusion dessous ; les choix de modélisation qu'elle cite deviennent des feuilles [Hₖ]ᵏ ;
//   - une unité sans enfant, ou partagée par plusieurs enfants et assez grosse (≥ `seuilLemme` règles
//     en ligne), est la racine d'une dérivation numérotée (k) ; ailleurs elle est citée par une feuille
//     de renvoi « ⋮ (k) ». Une unité partagée plus petite est recopiée dans chaque arbre qui l'utilise ;
//   - les dérivations sont ordonnées topologiquement (un lemme avant ceux qui le citent), puis par
//     profondeur logique : la lecture va de gauche à droite comme dans R14 ;
//   - la racine d'un résultat majeur décharge les hypothèses de modélisation dont elle dépend
//     (indices en exposant de l'étiquette gauche, comme la règle ⇒I en déduction naturelle).
//
// Mise en page (px, y vers le bas) : prémisses côte à côte, alignées sur leur ligne de base ; trait
// couvrant les conclusions des prémisses et la conclusion ; conclusion centrée sous les prémisses ;
// étiquette à droite du trait, décharge à gauche. Dérivations de gauche à droite, à la ligne au-delà de
// la largeur de page (lignes centrées, dérivations d'une ligne alignées par le bas).

import { dependantsDe, type GrapheLecture, type NoeudR } from '../../src/raisonnement'
import { natureDe } from './squelette'

export type GenreElement = 'regle' | 'renvoi' | 'hypothese'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface ElementArbre {
  genre: GenreElement
  /** Point : conclusion de la règle, racine citée (renvoi), choix de modélisation (hypothèse). */
  point: number
  /** Règle recopiée (unité partagée dupliquée) : sa position de référence est ailleurs. */
  copie: boolean
  /** Renvoi : numéro de la dérivation citée ; hypothèse : indice. */
  numero: number
  premisses: ElementArbre[]
  /** Indices des hypothèses déchargées par cette règle. */
  dechargees: number[]
  /** Tailles mesurées : conclusion (ou feuille), étiquette droite (E), étiquette gauche (G). */
  wC: number
  hC: number
  wE: number
  hE: number
  wG: number
  hG: number
  /** Décalage de la boîte dans celle du parent, puis boîte absolue après `disposer`. */
  ox: number
  oy: number
  boite: Rect
  conclusion: Rect
  barre: { x0: number; x1: number; y: number }
  etiquette: Rect
  gauche: Rect
}

export interface Derivation {
  numero: number
  point: number
  racine: ElementArbre
  /** Taille mesurée du numéro « (k) ». */
  wN: number
  hN: number
  boite: Rect
  numeroPos: Rect
}

export interface Hypothese {
  point: number
  indice: number
  /** Décision (point) qui a introduit ce choix, sinon null. */
  introduitePar: number | null
  /** Points qui en dépendent dans le graphe complet. */
  portee: number[]
  /** Taille mesurée de l'entrée de la liste des hypothèses, puis position. */
  w: number
  h: number
  pos: Rect
}

export interface Arbres {
  derivations: Derivation[]
  hypotheses: Hypothese[]
  indiceDe: Map<number, number>
  numeroDe: Map<number, number>
  /** Règles par point (copies comprises) ; la première est la position de référence. */
  elementsDe: Map<number, ElementArbre[]>
  /** Feuilles de renvoi par point cité, feuilles d'hypothèse par point de choix. */
  renvois: Map<number, ElementArbre[]>
  feuillesHyp: Map<number, ElementArbre[]>
  marge: Uint8Array
  /** Choix introduits par une décision (point décision → indices). */
  introduits: Map<number, number[]>
  stats: { regles: number; copies: number; renvois: number; feuillesHyp: number; derivations: number; lemmes: number }
}

const majeur = (n: NoeudR) => (n.type === 'theoreme' || n.type === 'resultat') && !n.admis

function nouvelElement(genre: GenreElement, point: number, numero = 0, premisses: ElementArbre[] = []): ElementArbre {
  const r = () => ({ x: 0, y: 0, w: 0, h: 0 })
  return {
    genre, point, copie: false, numero, premisses, dechargees: [],
    wC: 0, hC: 0, wE: 0, hE: 0, wG: 0, hG: 0, ox: 0, oy: 0,
    boite: r(), conclusion: r(), barre: { x0: 0, x1: 0, y: 0 }, etiquette: r(), gauche: r(),
  }
}

export function construireArbres(g: GrapheLecture, seuilLemme: number): Arbres {
  const j = g.justification
  const nU = g.unites.length
  const noeudDe = (u: number) => j.noeuds[g.unites[u]!.conclusion]!
  const marge = new Uint8Array(nU)
  for (let u = 0; u < nU; u++) if (noeudDe(u).type === 'choix_modelisation') marge[u] = 1
  const parents: number[][] = g.unites.map(() => [])
  const enfants: number[][] = g.unites.map(() => [])
  const introduitePar = new Map<number, number>()
  for (const a of g.aretes) {
    if (marge[a.cible]) {
      if (!marge[a.source]) introduitePar.set(a.cible, a.source)
      continue
    }
    if (marge[a.source]) continue
    parents[a.cible]!.push(a.source)
    enfants[a.source]!.push(a.cible)
  }

  // Ordre topologique (Kahn) et profondeur logique.
  const degre = new Int32Array(nU)
  for (let u = 0; u < nU; u++) degre[u] = parents[u]!.length
  const topo: number[] = []
  const file: number[] = []
  for (let u = 0; u < nU; u++) if (!marge[u] && degre[u] === 0) file.push(u)
  while (file.length) {
    const u = file.shift()!
    topo.push(u)
    for (const v of enfants[u]!) if (--degre[v]! === 0) file.push(v)
  }
  const vus = new Set(topo)
  for (let u = 0; u < nU; u++) if (!marge[u] && !vus.has(u)) topo.push(u)
  const ordre = new Int32Array(nU)
  topo.forEach((u, k) => (ordre[u] = k))
  const rang = new Int32Array(nU)
  for (const u of topo) for (const p of parents[u]!) rang[u] = Math.max(rang[u]!, rang[p]! + 1)

  // Racines : sans enfant, ou partagées et assez grosses ; les autres sont en ligne (recopiées si partagées).
  const racine = new Uint8Array(nU)
  const taille = new Float64Array(nU)
  for (const u of topo) {
    taille[u] = 1 + parents[u]!.reduce((s, p) => s + (racine[p] ? 0 : taille[p]!), 0)
    const k = enfants[u]!.length
    racine[u] = k === 0 || (k >= 2 && taille[u]! >= seuilLemme) ? 1 : 0
  }

  // Hypothèses de modélisation : indices dans l'ordre de première citation.
  const hypsDe = (u: number): number[] => {
    const r = new Set<number>()
    for (const c of g.unites[u]!.contexte) {
      if (natureDe(j, c.noeud) !== 'choix') continue
      const q = g.uniteDe[c.noeud]!
      if (q >= 0 && marge[q]) r.add(q)
    }
    return [...r]
  }
  const indiceDe = new Map<number, number>()
  for (const u of topo) for (const q of hypsDe(u)) if (!indiceDe.has(q)) indiceDe.set(q, indiceDe.size + 1)
  for (let u = 0; u < nU; u++) if (marge[u] && !indiceDe.has(u)) indiceDe.set(u, indiceDe.size + 1)
  const hypotheses: Hypothese[] = [...indiceDe].map(([point, indice]) => {
    const pts = new Set<number>()
    for (const d of dependantsDe(j, g.unites[point]!.conclusion)) {
      const q = g.uniteDe[d]!
      if (q >= 0 && q !== point) pts.add(q)
    }
    return { point, indice, introduitePar: introduitePar.get(point) ?? null, portee: [...pts], w: 0, h: 0, pos: { x: 0, y: 0, w: 0, h: 0 } }
  })
  const introduits = new Map<number, number[]>()
  for (const h of hypotheses) if (h.introduitePar !== null) {
    let l = introduits.get(h.introduitePar)
    if (!l) introduits.set(h.introduitePar, (l = []))
    l.push(h.indice)
  }

  // Arbres.
  const construire = (u: number): ElementArbre => {
    const prem: ElementArbre[] = []
    for (const q of hypsDe(u).sort((a, b) => indiceDe.get(a)! - indiceDe.get(b)!)) prem.push(nouvelElement('hypothese', q, indiceDe.get(q)!))
    for (const p of [...parents[u]!].sort((a, b) => ordre[a]! - ordre[b]!)) prem.push(racine[p] ? nouvelElement('renvoi', p) : construire(p))
    return nouvelElement('regle', u, 0, prem)
  }
  const racines = topo.filter((u) => racine[u])
  const arbres = new Map(racines.map((r) => [r, construire(r)]))

  // Ordre des dérivations : un lemme avant ceux qui le citent, puis profondeur logique.
  const deps = new Map<number, Set<number>>()
  const citations = (e: ElementArbre, s: Set<number>) => {
    if (e.genre === 'renvoi') s.add(e.point)
    for (const p of e.premisses) citations(p, s)
    return s
  }
  // Une hypothèse introduite par une décision : les dérivations qui l'utilisent viennent après celle
  // qui contient la décision (observation → décision → hypothèse → prédiction se lit dans l'ordre).
  const racineContenant = new Map<number, number>()
  const marquer = (e: ElementArbre, r: number) => {
    if (e.genre === 'regle' && !racineContenant.has(e.point)) racineContenant.set(e.point, r)
    for (const p of e.premisses) marquer(p, r)
  }
  for (const [r, e] of arbres) marquer(e, r)
  const hypsUtilisees = (e: ElementArbre, s: Set<number>): Set<number> => {
    if (e.genre === 'hypothese') s.add(e.point)
    for (const p of e.premisses) hypsUtilisees(p, s)
    return s
  }
  for (const [r, e] of arbres) {
    const s = citations(e, new Set())
    for (const h of hypsUtilisees(e, new Set())) {
      const d = introduitePar.get(h)
      const rd = d === undefined ? undefined : racineContenant.get(d)
      if (rd !== undefined && rd !== r) s.add(rd)
    }
    deps.set(r, s)
  }
  const places: number[] = []
  const reste = new Set(racines)
  while (reste.size) {
    const prets = [...reste].filter((r) => [...deps.get(r)!].every((d) => !reste.has(d)))
    const candidats = prets.length ? prets : [...reste]
    candidats.sort((a, b) => rang[a]! - rang[b]! || ordre[a]! - ordre[b]!)
    places.push(candidats[0]!)
    reste.delete(candidats[0]!)
  }
  const numeroDe = new Map(places.map((r, k) => [r, k + 1]))

  // Numéros des renvois, références (première occurrence), décharges.
  const elementsDe = new Map<number, ElementArbre[]>()
  const renvois = new Map<number, ElementArbre[]>()
  const feuillesHyp = new Map<number, ElementArbre[]>()
  const pousser = (m: Map<number, ElementArbre[]>, k: number, e: ElementArbre) => {
    let l = m.get(k)
    if (!l) m.set(k, (l = []))
    l.push(e)
  }
  const stats = { regles: 0, copies: 0, renvois: 0, feuillesHyp: 0, derivations: places.length, lemmes: 0 }
  const parcourir = (e: ElementArbre) => {
    for (const p of e.premisses) parcourir(p)
    if (e.genre === 'renvoi') {
      e.numero = numeroDe.get(e.point) ?? 0
      pousser(renvois, e.point, e)
      stats.renvois++
    } else if (e.genre === 'hypothese') {
      pousser(feuillesHyp, e.point, e)
      stats.feuillesHyp++
    } else {
      e.copie = elementsDe.has(e.point)
      pousser(elementsDe, e.point, e)
      if (e.copie) stats.copies++
      else stats.regles++
    }
  }
  const derivations: Derivation[] = places.map((r, k) => {
    const e = arbres.get(r)!
    parcourir(e)
    if (majeur(noeudDe(r))) {
      e.dechargees = hypotheses.filter((h) => h.portee.includes(r)).map((h) => h.indice).sort((a, b) => a - b)
    }
    if (enfants[r]!.length) stats.lemmes++
    return { numero: k + 1, point: r, racine: e, wN: 0, hN: 0, boite: { x: 0, y: 0, w: 0, h: 0 }, numeroPos: { x: 0, y: 0, w: 0, h: 0 } }
  })
  // La position de référence d'une unité recopiée est sa première occurrence, de gauche à droite :
  // `parcourir` visite les prémisses avant la conclusion, dans l'ordre des dérivations.
  return { derivations, hypotheses, indiceDe, numeroDe, elementsDe, renvois, feuillesHyp, marge, introduits, stats }
}

// ─── Mise en page ────────────────────────────────────────────────────────────

export interface OptionsDisposition {
  /** Écart horizontal entre prémisses (px). */
  ecart: number
  /** Écart horizontal entre dérivations d'une même ligne (px). */
  ecartDerivations: number
  /** Largeur de page (px) : au-delà, la dérivation suivante passe à la ligne. */
  largeurPage: number
  /** Écart vertical entre lignes de dérivations (px). */
  ecartLignes: number
  /** Blanc au-dessus et au-dessous du trait (px). */
  blanc: number
  /** Taille mesurée du titre de la liste des hypothèses (0 si pas de liste). */
  titreHyp: { w: number; h: number }
  /** Taille mesurée de la légende (figure). */
  legende: { w: number; h: number }
}

export interface Page {
  /** Boîte de la liste des hypothèses, du bloc des dérivations, de la légende. */
  listeHyp: Rect
  rangee: Rect
  /** Lignes de dérivations (numéros), de haut en bas. */
  lignes: number[][]
  legende: Rect
  bornes: Rect
}

/** Mise en page locale d'un élément (coordonnées relatives à sa boîte). */
function placer(e: ElementArbre, o: OptionsDisposition): void {
  if (e.genre !== 'regle') {
    e.conclusion = { x: 0, y: 0, w: e.wC, h: e.hC }
    e.boite = { x: 0, y: 0, w: e.wC, h: e.hC }
    return
  }
  for (const p of e.premisses) placer(p, o)
  const hp = e.premisses.reduce((m, p) => Math.max(m, p.boite.h), 0)
  let x = 0
  let s0 = Infinity, s1 = -Infinity
  for (const p of e.premisses) {
    p.ox = x
    p.oy = hp - p.boite.h
    s0 = Math.min(s0, x + p.conclusion.x)
    s1 = Math.max(s1, x + p.conclusion.x + p.conclusion.w)
    x += p.boite.w + o.ecart
  }
  const largeurPremisses = e.premisses.length ? x - o.ecart : 0
  const yBarre = e.premisses.length ? hp + o.blanc : 0
  const m = e.premisses.length ? (s0 + s1) / 2 : e.wC / 2
  const c: Rect = { x: m - e.wC / 2, y: yBarre + o.blanc + 1, w: e.wC, h: e.hC }
  const deborde = e.premisses.length ? 0 : 4
  const x0 = Math.min(e.premisses.length ? s0 : Infinity, c.x) - deborde
  const x1 = Math.max(e.premisses.length ? s1 : -Infinity, c.x + c.w) + deborde
  const et: Rect = { x: x1 + 5, y: yBarre - e.hE / 2, w: e.wE, h: e.hE }
  const ga: Rect = { x: x0 - 5 - e.wG, y: yBarre - e.hG / 2, w: e.wG, h: e.hG }
  const minX = Math.min(0, c.x, e.wG ? ga.x : Infinity, x0)
  const maxX = Math.max(largeurPremisses, c.x + c.w, e.wE ? et.x + et.w : -Infinity, x1)
  const minY = Math.min(0, et.y, e.wG ? ga.y : Infinity)
  const maxY = c.y + c.h
  const dx = -minX, dy = -minY
  for (const p of e.premisses) {
    p.ox += dx
    p.oy += dy
  }
  e.conclusion = { x: c.x + dx, y: c.y + dy, w: c.w, h: c.h }
  e.barre = { x0: x0 + dx, x1: x1 + dx, y: yBarre + dy }
  e.etiquette = { x: et.x + dx, y: et.y + dy, w: et.w, h: et.h }
  e.gauche = { x: ga.x + dx, y: ga.y + dy, w: ga.w, h: ga.h }
  e.boite = { x: 0, y: 0, w: maxX - minX, h: maxY - minY }
}

/** Passe absolue : décale les rectangles locaux de (ax, ay). */
function absolu(e: ElementArbre, ax: number, ay: number): void {
  for (const p of e.premisses) absolu(p, ax + p.ox, ay + p.oy)
  const t = (r: Rect) => ({ x: r.x + ax, y: r.y + ay, w: r.w, h: r.h })
  e.boite = t(e.boite)
  e.conclusion = t(e.conclusion)
  e.etiquette = t(e.etiquette)
  e.gauche = t(e.gauche)
  e.barre = { x0: e.barre.x0 + ax, x1: e.barre.x1 + ax, y: e.barre.y + ay }
}

/**
 * Dispose hypothèses, dérivations et légende ; les tailles des éléments doivent être mesurées.
 * Les dérivations se suivent de gauche à droite et passent à la ligne au-delà de `largeurPage`, comme
 * des formules centrées dans une page ; dans une ligne, elles sont alignées par le bas (conclusions).
 */
export function disposer(a: Arbres, o: OptionsDisposition): Page {
  for (const d of a.derivations) placer(d.racine, o)
  const largeur = (d: Derivation) => d.racine.boite.w + 14 + d.wN
  // Lignes.
  const lignes: Derivation[][] = []
  let courante: Derivation[] = []
  let w = 0
  for (const d of a.derivations) {
    const dw = largeur(d)
    if (courante.length && w + o.ecartDerivations + dw > o.largeurPage) {
      lignes.push(courante)
      courante = []
      w = 0
    }
    w += (courante.length ? o.ecartDerivations : 0) + dw
    courante.push(d)
  }
  if (courante.length) lignes.push(courante)
  const largeurLigne = (l: Derivation[]) => l.reduce((s, d) => s + largeur(d), 0) + o.ecartDerivations * (l.length - 1)
  const largeurBloc = Math.max(...lignes.map(largeurLigne), 0)
  // Liste des hypothèses à gauche, en haut.
  let wListe = o.titreHyp.w
  for (const h of a.hypotheses) wListe = Math.max(wListe, h.w)
  let y = a.hypotheses.length ? o.titreHyp.h + 6 : 0
  for (const h of a.hypotheses) {
    h.pos = { x: 0, y, w: h.w, h: h.h }
    y += h.h + 7
  }
  const listeHyp: Rect = { x: 0, y: 0, w: a.hypotheses.length ? wListe : 0, h: a.hypotheses.length ? y - 7 : 0 }
  // Bloc des dérivations : lignes centrées, dérivations alignées par le bas.
  const x0 = a.hypotheses.length ? wListe + Math.max(56, o.ecartDerivations) : 0
  let yLigne = 0
  for (const l of lignes) {
    const hl = l.reduce((m, d) => Math.max(m, d.racine.boite.h), 0)
    let x = x0 + (largeurBloc - largeurLigne(l)) / 2
    for (const d of l) {
      const b = d.racine.boite
      const y0 = yLigne + hl - b.h
      absolu(d.racine, x, y0)
      d.boite = { x, y: y0, w: b.w, h: b.h }
      const c = d.racine.conclusion
      d.numeroPos = { x: x + b.w + 14, y: c.y + c.h / 2 - d.hN / 2, w: d.wN, h: d.hN }
      x += largeur(d) + o.ecartDerivations
    }
    yLigne += hl + o.ecartLignes
  }
  const hBloc = Math.max(0, yLigne - o.ecartLignes)
  const rangee: Rect = { x: x0, y: 0, w: largeurBloc, h: hBloc }
  const legende: Rect = { x: x0 + Math.max(0, (largeurBloc - o.legende.w) / 2), y: hBloc + 30, w: o.legende.w, h: o.legende.h }
  const by1 = Math.max(legende.y + legende.h, listeHyp.h)
  return { listeHyp, rangee, lignes: lignes.map((l) => l.map((d) => d.numero)), legende, bornes: { x: 0, y: 0, w: x0 + largeurBloc, h: by1 } }
}
