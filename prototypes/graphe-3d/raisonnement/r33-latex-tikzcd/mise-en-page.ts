// R33 · Mise en page « tikz-cd » : une matrice de rangs (colonnes) et de lignes, sans boîtes.
//
// Reprise de R14 pour les rangs (plus long chemin, bornés par zone : outils < étapes < résultats), l'ordre
// dans un rang (barycentres avec nœuds fictifs pour les arêtes longues) et les hauteurs (régression isotone
// vers la moyenne des voisins). Ce qui change :
//   - les dimensions viennent de la typographie mesurée (formule KaTeX ou nom en romain), pas d'une carte ;
//   - chaque colonne a la largeur de sa plus large entrée, l'écart entre deux colonnes s'élargit pour
//     loger l'étiquette de flèche la plus large qui le traverse (comme `column sep` + étiquettes) ;
//   - les hauteurs sont arrondies à une grille de lignes (pas `ecartLignes`) : les nœuds tombent sur des
//     lignes entières, les nœuds fictifs sur des demi-lignes ;
//   - les choix de modélisation sans prémisse de lecture et les prémisses citées en étiquette forment
//     la liste « où : » à gauche de la matrice (légende numérotée M1, H1, D1…).
//
// Coordonnées de mise en page en px (y vers le bas), converties en monde (× 0,01) pour la vue.

import { coucheDe, type Disposition, type GrapheLecture, type NoeudR } from '../../src/raisonnement'

export type GenreEntree = 'noeud' | 'decision' | 'majeur' | 'legende'

export interface Taille {
  w: number
  h: number
}

export interface Entree {
  genre: GenreEntree
  /** Centre (px de mise en page). */
  x: number
  y: number
  w: number
  h: number
  /** Réserve sous l'entrée (alternatives rejetées d'une décision). */
  bas: number
  rang: number
  /** Ligne de la matrice (entier) et colonne (rang), pour l'export tikz-cd ; −1 dans la légende. */
  ligne: number
  abandon: boolean
}

export interface Route {
  /** Index d'arête de lecture. */
  arete: number
  source: number
  cible: number
  /** Centres traversés : source, nœuds fictifs, cible (px de mise en page). */
  points: [number, number][]
  abandon: boolean
}

export interface ElementLegende {
  /** Clé : 'titre' ou index de nœud de justification. */
  cle: 'titre' | number
  x: number
  y: number
  w: number
  h: number
}

export interface MiseEnPage {
  entrees: Entree[]
  routes: Route[]
  legende: ElementLegende[]
  /** Légende de figure (bas du diagramme, centre et largeur). */
  figure: { x: number; y: number; w: number }
  /** Abscisses des colonnes (rangs). */
  xColonnes: number[]
  pasLigne: number
  echelle: number
  cx: number
  cy: number
  bornes: { x0: number; y0: number; x1: number; y1: number }
}

export interface OptionsMiseEnPage {
  ecartColonnes: number
  ecartLignes: number
  /** Taille mesurée de chaque unité (formule ou nom). */
  tailleUnite: (p: number) => Taille
  /** Hauteur réservée sous une unité (alternatives rejetées), 0 sinon. */
  reserveSous: (p: number) => number
  /** Largeur de l'étiquette la plus large portée par une arête de lecture (0 si aucune). */
  largeurEtiquette: (a: number) => number
  /** Largeur du talon d'entrée d'une racine (prémisses citées en source), 0 si aucun. */
  largeurTalon: (p: number) => number
  /** Unités rangées dans la légende (choix de modélisation sans prémisse de lecture). */
  dansLegende: (p: number) => boolean
  /** Éléments de la légende « où : », dans l'ordre (titre, puis nœuds cités). */
  legende: { cle: 'titre' | number; w: number; h: number }[]
  /** Hauteur de la légende de figure (px) et largeur voulue. */
  figure: Taille
  /** Positions précédentes (id de nœud conclusion → y) : ordre stable d'une dérivation à l'autre. */
  precedent?: Map<string, number>
}

const ECHELLE = 0.01

export function estMajeur(n: NoeudR): boolean {
  return (n.type === 'theoreme' || n.type === 'resultat') && !n.admis
}

export function mettreEnPage(g: GrapheLecture, o: OptionsMiseEnPage): { disposition: Disposition; page: MiseEnPage } {
  const j = g.justification
  const nU = g.unites.length
  const masques = g.masques
  const nP = nU + masques.length
  const noeudDe = (p: number): NoeudR => j.noeuds[p < nU ? g.unites[p]!.conclusion : masques[p - nU]!]!
  const parents: number[][] = g.unites.map((_, u) => g.entrantes[u]!.map((e) => g.aretes[e]!.source))
  const enfants: number[][] = g.unites.map((_, u) => g.sortantes[u]!.map((e) => g.aretes[e]!.cible))

  // 1. Légende : unités sans aucune arête de lecture que la vision y range (choix de modélisation).
  const marge = new Uint8Array(nU)
  for (let u = 0; u < nU; u++) if (!parents[u]!.length && !enfants[u]!.length && o.dansLegende(u)) marge[u] = 1

  // 2. Ordre topologique du reste (les cycles éventuels passent en fin).
  const principaux: number[] = []
  for (let u = 0; u < nU; u++) if (!marge[u]) principaux.push(u)
  const degre = new Int32Array(nU)
  for (const u of principaux) for (const s of parents[u]!) if (!marge[s]) degre[u]!++
  const topo: number[] = []
  const file = principaux.filter((u) => degre[u] === 0)
  while (file.length) {
    const u = file.shift()!
    topo.push(u)
    for (const v of enfants[u]!) if (!marge[v] && --degre[v]! === 0) file.push(v)
  }
  const vus = new Set(topo)
  for (const u of principaux) if (!vus.has(u)) topo.push(u)

  // 3. Zones (outils, étapes, résultats) et rangs : plus long chemin borné par zone.
  const zone = new Int8Array(nU).fill(-1)
  const majeur = (u: number) => estMajeur(noeudDe(u))
  const racine = new Uint8Array(nU)
  for (const u of principaux) if (parents[u]!.length === 0 && noeudDe(u).type !== 'decision' && !majeur(u)) racine[u] = 1
  const toutMajeur = new Uint8Array(nU)
  for (let k = topo.length - 1; k >= 0; k--) {
    const u = topo[k]!
    toutMajeur[u] = majeur(u) && enfants[u]!.every((v) => marge[v] || toutMajeur[v]) ? 1 : 0
  }
  for (const u of topo) {
    if (toutMajeur[u]) zone[u] = 3
    else if (racine[u]) zone[u] = 1
    else {
      const ps = parents[u]!
      const outil = ps.length > 0 && ps.every((s) => racine[s]) && enfants[u]!.length >= 2 && noeudDe(u).type !== 'decision' && noeudDe(u).piste === 'active'
      zone[u] = outil ? 1 : 2
    }
  }
  const rang = new Int32Array(nP).fill(-1)
  const calculerRangs = (z: number, borne: number) => {
    for (const u of topo) {
      if (zone[u] !== z) continue
      let r = borne
      for (const s of parents[u]!) if (rang[s]! >= 0) r = Math.max(r, rang[s]! + 1)
      rang[u] = r
    }
    let max = borne - 1
    for (const u of topo) if (zone[u] === z) max = Math.max(max, rang[u]!)
    return max
  }
  const finOutils = calculerRangs(1, 0)
  const finEtapes = calculerRangs(2, finOutils + 1)
  const finResultats = calculerRangs(3, finEtapes + 1)
  // Rangs vides (zone sans entrée) retirés : la matrice n'a pas de colonne vide.
  {
    const utilises = [...new Set(topo.map((u) => rang[u]!))].sort((a, b) => a - b)
    const nouveau = new Map(utilises.map((r, k) => [r, k]))
    for (const u of topo) rang[u] = nouveau.get(rang[u]!)!
  }
  const nbRangs = Math.max(0, ...topo.map((u) => rang[u]! + 1))
  void finResultats

  // 4. Couches avec nœuds fictifs pour les arêtes longues.
  interface Element { id: number; point: number; haut: number; bas: number; y: number }
  const couches: Element[][] = Array.from({ length: nbRangs }, () => [])
  const elements: Element[] = []
  const taille: Taille[] = Array.from({ length: nP }, () => ({ w: 0, h: 0 }))
  for (let p = 0; p < nU; p++) taille[p] = o.tailleUnite(p)
  const nouvel = (point: number, r: number) => {
    const t = point >= 0 ? taille[point]! : { w: 0, h: 0 }
    const e: Element = { id: elements.length, point, haut: t.h / 2, bas: t.h / 2 + (point >= 0 ? o.reserveSous(point) : 0), y: 0 }
    elements.push(e)
    couches[r]!.push(e)
    return e
  }
  const elementDe = new Int32Array(nU).fill(-1)
  for (const u of topo) elementDe[u] = nouvel(u, rang[u]!).id
  const pred: number[][] = [], succ: number[][] = []
  const chaines = new Map<number, number[]>()
  const lier = (a: number, b: number) => {
    pred[b] ??= []
    succ[a] ??= []
    pred[b]!.push(a)
    succ[a]!.push(b)
  }
  for (const a of g.aretes) {
    if (marge[a.source] || marge[a.cible]) continue
    const r0 = rang[a.source]!, r1 = rang[a.cible]!
    if (r1 <= r0) continue
    let prec = elementDe[a.source]!
    const chaine = [prec]
    for (let r = r0 + 1; r < r1; r++) {
      const d = nouvel(-1, r)
      lier(prec, d.id)
      chaine.push(d.id)
      prec = d.id
    }
    lier(prec, elementDe[a.cible]!)
    chaine.push(elementDe[a.cible]!)
    chaines.set(a.index, chaine)
  }
  for (let i = 0; i < elements.length; i++) {
    pred[i] ??= []
    succ[i] ??= []
  }

  // Ordre initial : position précédente (stabilité au dépliage) sinon ordre d'apparition.
  for (const c of couches) {
    if (o.precedent) {
      const cles = c.map((e) => (e.point >= 0 ? o.precedent!.get(noeudDe(e.point).id) ?? NaN : NaN))
      if (cles.some((v) => !Number.isNaN(v))) {
        c.forEach((e, k) => (e.y = Number.isNaN(cles[k]!) ? k * 1e-3 : cles[k]!))
        c.sort((a, b) => a.y - b.y)
      }
    }
    c.forEach((e, k) => (e.y = k))
  }
  // Barycentres (descente / remontée) en gardant le meilleur ordre.
  const position = new Float64Array(elements.length)
  const majPositions = () => couches.forEach((c) => c.forEach((e, k) => (position[e.id] = k)))
  majPositions()
  const croisements = (): number => {
    let n = 0
    for (let r = 0; r + 1 < nbRangs; r++) {
      const seg: [number, number][] = []
      for (const e of couches[r]!) for (const s of succ[e.id]!) seg.push([position[e.id]!, position[s]!])
      for (let a = 0; a < seg.length; a++) for (let b = a + 1; b < seg.length; b++) {
        const [a0, a1] = seg[a]!, [b0, b1] = seg[b]!
        if ((a0 - b0) * (a1 - b1) < 0) n++
      }
    }
    return n
  }
  let meilleur = couches.map((c) => [...c])
  let meilleurScore = croisements()
  for (let passe = 0; passe < 16; passe++) {
    const descente = passe % 2 === 0
    const ordreRangs = descente ? [...couches.keys()].slice(1) : [...couches.keys()].reverse().slice(1)
    for (const r of ordreRangs) {
      const c = couches[r]!
      const cle = new Map<number, number>()
      for (const e of c) {
        const voisins = descente ? pred[e.id]! : succ[e.id]!
        cle.set(e.id, voisins.length ? voisins.reduce((s, v) => s + position[v]!, 0) / voisins.length : position[e.id]!)
      }
      c.sort((a, b) => cle.get(a.id)! - cle.get(b.id)! || position[a.id]! - position[b.id]!)
      c.forEach((e, k) => (position[e.id] = k))
    }
    const score = croisements()
    if (score < meilleurScore) {
      meilleurScore = score
      meilleur = couches.map((c) => [...c])
    }
  }
  couches.forEach((c, r) => {
    c.length = 0
    c.push(...meilleur[r]!)
  })

  // 5. Hauteurs : régression isotone vers la moyenne des voisins (chaînes horizontales)…
  const P = o.ecartLignes
  const separation = (a: Element, b: Element) => a.bas + b.haut + (a.point < 0 || b.point < 0 ? P * 0.3 : P * 0.45)
  for (const c of couches) {
    let y = 0
    c.forEach((e, k) => {
      if (k) y += separation(c[k - 1]!, e)
      e.y = y
    })
  }
  const placer = (c: Element[], voulu: number[]) => {
    const off: number[] = [0]
    for (let k = 1; k < c.length; k++) off.push(off[k - 1]! + separation(c[k - 1]!, c[k]!))
    const blocs: { somme: number; n: number; debut: number }[] = []
    for (let k = 0; k < c.length; k++) {
      blocs.push({ somme: voulu[k]! - off[k]!, n: 1, debut: k })
      while (blocs.length > 1) {
        const b = blocs[blocs.length - 1]!, a = blocs[blocs.length - 2]!
        if (a.somme / a.n <= b.somme / b.n) break
        a.somme += b.somme
        a.n += b.n
        blocs.pop()
      }
    }
    for (let bi = 0; bi < blocs.length; bi++) {
      const b = blocs[bi]!
      const fin = bi + 1 < blocs.length ? blocs[bi + 1]!.debut : c.length
      for (let k = b.debut; k < fin; k++) c[k]!.y = b.somme / b.n + off[k]!
    }
  }
  for (let it = 0; it < 60; it++) {
    const ordre = it % 2 === 0 ? [...couches.keys()] : [...couches.keys()].reverse()
    for (const r of ordre) {
      const c = couches[r]!
      if (!c.length) continue
      const voulu = c.map((e) => {
        const v = [...pred[e.id]!, ...succ[e.id]!]
        return v.length ? v.reduce((s, x) => s + elements[x]!.y, 0) / v.length : e.y
      })
      placer(c, voulu)
    }
  }
  // … puis arrondies à la grille : lignes entières pour les nœuds, demi-lignes pour les fictifs.
  let yMinGlobal = Infinity
  for (const e of elements) yMinGlobal = Math.min(yMinGlobal, e.y)
  if (!Number.isFinite(yMinGlobal)) yMinGlobal = 0
  const demi = P / 2
  for (const c of couches) {
    let prec: Element | null = null
    let precDemi = -Infinity
    for (const e of c) {
      let d = Math.round((e.y - yMinGlobal) / demi)
      if (e.point >= 0 && d % 2) d = Math.round((e.y - yMinGlobal) / P) * 2
      if (prec) {
        const besoin = Math.ceil((prec.bas + e.haut + (prec.point < 0 || e.point < 0 ? 8 : 12)) / demi)
        d = Math.max(d, precDemi + Math.max(1, besoin))
      }
      if (e.point >= 0 && d % 2) d++
      e.y = d * demi
      prec = e
      precDemi = d
    }
  }

  // 6. Abscisses : largeur de colonne = entrée la plus large ; écart élargi par les étiquettes.
  const largeurCol: number[] = Array.from({ length: nbRangs }, () => 0)
  for (const u of topo) largeurCol[rang[u]!] = Math.max(largeurCol[rang[u]!]!, taille[u]!.w)
  const ecartApres: number[] = Array.from({ length: nbRangs }, () => o.ecartColonnes)
  for (const a of g.aretes) {
    if (marge[a.source] || marge[a.cible]) continue
    const l = o.largeurEtiquette(a.index)
    if (l > 0) ecartApres[rang[a.source]!] = Math.max(ecartApres[rang[a.source]!]!, l + 34)
  }
  // Talons d'entrée des racines : place à gauche de leur colonne.
  const ecartAvant: number[] = Array.from({ length: nbRangs }, () => 0)
  for (const u of topo) {
    const t = o.largeurTalon(u)
    if (t > 0) ecartAvant[rang[u]!] = Math.max(ecartAvant[rang[u]!]!, t + 40 + (largeurCol[rang[u]!]! - taille[u]!.w) / 2)
  }
  const xCol: number[] = []
  let x = 0
  for (let r = 0; r < nbRangs; r++) {
    if (r > 0) x += largeurCol[r - 1]! / 2 + Math.max(ecartApres[r - 1]!, ecartAvant[r]!) + largeurCol[r]! / 2
    else x = ecartAvant[0]! + largeurCol[0]! / 2
    xCol.push(x)
  }
  const xs = new Float64Array(nP), ys = new Float64Array(nP)
  const entrees: Entree[] = []
  for (let p = 0; p < nP; p++) {
    const n = noeudDe(p)
    const genre: GenreEntree = p >= nU || marge[p] ? 'legende' : n.type === 'decision' ? 'decision' : majeur(p) ? 'majeur' : 'noeud'
    entrees.push({ genre, x: 0, y: 0, w: p < nU ? taille[p]!.w : 0, h: p < nU ? taille[p]!.h : 0, bas: p < nU ? o.reserveSous(p) : 0, rang: p < nU ? rang[p]! : -1, ligne: -1, abandon: n.piste === 'abandonnee' })
  }
  for (const e of elements) if (e.point >= 0) {
    xs[e.point] = xCol[rang[e.point]!]!
    ys[e.point] = e.y
    entrees[e.point]!.ligne = Math.round(e.y / P)
  }

  // 7. Légende « où : » à gauche de la matrice : titre, puis une entrée par prémisse citée.
  let ymin = Infinity, ymax = -Infinity
  for (const u of topo) {
    ymin = Math.min(ymin, ys[u]! - taille[u]!.h / 2)
    ymax = Math.max(ymax, ys[u]! + taille[u]!.h / 2 + o.reserveSous(u))
  }
  if (!Number.isFinite(ymin)) ymin = ymax = 0
  const legende: ElementLegende[] = []
  const largeurLegende = Math.max(0, ...o.legende.map((l) => l.w))
  const x0Matrice = topo.length ? Math.min(...topo.map((u) => xs[u]! - taille[u]!.w / 2 - o.largeurTalon(u) - 30)) : 0
  const xLegende = x0Matrice - 56 - largeurLegende
  {
    let y = ymin
    for (const l of o.legende) {
      legende.push({ cle: l.cle, x: xLegende + l.w / 2, y: y + l.h / 2, w: l.w, h: l.h })
      y += l.h + (l.cle === 'titre' ? 6 : 5)
    }
    if (legende.length) ymax = Math.max(ymax, y)
  }
  // Points rangés en légende (choix, contexte masqué) : à la place de leur entrée, sinon sous la liste.
  const ligneLegende = new Map<number, ElementLegende>()
  for (const l of legende) if (l.cle !== 'titre') ligneLegende.set(l.cle, l)
  let yReste = ymax + 20
  for (let p = 0; p < nP; p++) {
    if (p < nU && !marge[p]) continue
    const i = p < nU ? g.unites[p]!.conclusion : masques[p - nU]!
    const l = ligneLegende.get(i)
    if (l) {
      xs[p] = l.x
      ys[p] = l.y
      entrees[p]!.w = l.w
      entrees[p]!.h = l.h
    } else {
      xs[p] = xLegende + 6
      ys[p] = yReste
      yReste += 14
    }
    entrees[p]!.x = xs[p]!
    entrees[p]!.y = ys[p]!
  }

  // 8. Routes : centres des extrémités et des nœuds fictifs (les flèches sont raccourcies au rendu).
  const routes: Route[] = []
  for (const a of g.aretes) {
    if (marge[a.source] || marge[a.cible]) continue
    const pts: [number, number][] = [[xs[a.source]!, ys[a.source]!]]
    const chaine = chaines.get(a.index)
    if (chaine) for (const id of chaine.slice(1, -1)) {
      const e = elements[id]!
      const r = couches.findIndex((c) => c.includes(e))
      pts.push([xCol[r]!, e.y])
    }
    pts.push([xs[a.cible]!, ys[a.cible]!])
    const abandon = noeudDe(a.source).piste === 'abandonnee' || noeudDe(a.cible).piste === 'abandonnee'
    routes.push({ arete: a.index, source: a.source, cible: a.cible, points: pts, abandon })
  }
  for (let p = 0; p < nU; p++) if (!marge[p]) {
    entrees[p]!.x = xs[p]!
    entrees[p]!.y = ys[p]!
  }

  // 9. Bornes, légende de figure, monde.
  let bx0 = legende.length ? xLegende : Infinity, bx1 = -Infinity
  for (const u of topo) {
    bx0 = Math.min(bx0, xs[u]! - taille[u]!.w / 2 - o.largeurTalon(u) - 20)
    bx1 = Math.max(bx1, xs[u]! + taille[u]!.w / 2)
  }
  if (!Number.isFinite(bx0)) bx0 = bx1 = 0
  const wFig = Math.min(Math.max(320, bx1 - bx0), o.figure.w)
  const figure = { x: (bx0 + bx1) / 2, y: ymax + 34 + o.figure.h / 2, w: wFig }
  const y1 = figure.y + o.figure.h / 2
  const cx = (bx0 + bx1) / 2, cy = (ymin + y1) / 2
  const xw = new Float32Array(nP), z = new Float32Array(nP), yCouche = new Float32Array(nP)
  const couche = new Int8Array(nP)
  for (let p = 0; p < nP; p++) {
    xw[p] = (xs[p]! - cx) * ECHELLE
    z[p] = -(ys[p]! - cy) * ECHELLE
    couche[p] = coucheDe(noeudDe(p).type)
    yCouche[p] = (couche[p]! - 3) * 0.9
  }
  let wx0 = Infinity, wx1 = -Infinity, wz0 = Infinity, wz1 = -Infinity
  for (let p = 0; p < nU; p++) {
    wx0 = Math.min(wx0, xw[p]!); wx1 = Math.max(wx1, xw[p]!)
    wz0 = Math.min(wz0, z[p]!); wz1 = Math.max(wz1, z[p]!)
  }
  const disposition: Disposition = {
    moteur: 'dagre', nU, masques, x: xw, z, yCouche, couche, rang,
    xRangs: xCol.map((xc) => (xc - cx) * ECHELLE),
    xContexte: masques.length ? (xLegende - cx) * ECHELLE : NaN,
    bornes: { xmin: wx0, xmax: wx1, zmin: wz0, zmax: wz1 },
  }
  const page: MiseEnPage = {
    entrees, routes, legende, figure, xColonnes: xCol, pasLigne: P, echelle: ECHELLE, cx, cy,
    bornes: { x0: bx0, y0: ymin, x1: bx1, y1 },
  }
  return { disposition, page }
}
