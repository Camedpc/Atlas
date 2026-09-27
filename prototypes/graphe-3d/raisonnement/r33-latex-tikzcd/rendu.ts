// R33 · Rendu « tikz-cd » : pas de boîtes. Les nœuds sont des formules KaTeX (ou des noms en romain)
// posées sur un calque HTML qui suit la caméra ; les flèches sont tracées sur le calque canvas « dessous »,
// raccourcies au bord de leurs extrémités comme dans tikz-cd.
//
//   →  simple, pointe « to » à deux traits courbes       ⇒  double (Rightarrow), implication forte
//   ⇢  pointillée (dashed), à vérifier                    ↛  barrée d'un trait oblique, réfutation
//
// Survol : la flèche et ses extrémités passent en gras (et les prémisses qu'elle cite dans la légende).
// Clic : lignée (le reste s'estompe en gris) et fiche détaillée (fiche.ts).

import { type ContexteDessinR, type VueRaisonnement } from '../../src/raisonnement'
import type { Contenu, StyleFleche } from './contenu'
import type { MiseEnPage } from './mise-en-page'

export interface PaletteR33 {
  encre: string
  gris: string
  surface: string
}

/** Éléments HTML du calque typographique. */
export interface Typo {
  calque: HTMLElement
  unites: (HTMLElement | null)[]
  legende: Map<'titre' | number, HTMLElement>
  dessus: Map<number, HTMLElement>
  dessous: Map<number, HTMLElement>
  talons: Map<number, { reperes: HTMLElement; dessus: HTMLElement | null }>
  rejetees: Map<number, HTMLElement>
  figure: HTMLElement | null
  liens: HTMLElement[]
  /** Tailles mesurées à l'échelle 1 (px). */
  tailles: Map<HTMLElement, { w: number; h: number }>
}

export type Cible =
  | { genre: 'noeud'; point: number }
  | { genre: 'legende'; noeud: number }
  | { genre: 'arete'; arete: number }
  | { genre: 'talon'; unite: number }

export interface EtatRendu {
  page: MiseEnPage | null
  contenu: Contenu | null
  typo: Typo | null
  palette: PaletteR33
  survol: Cible | null
  /** Géométrie écran de la dernière image (survol). */
  boites: { cible: Cible; x0: number; y0: number; x1: number; y1: number }[]
  fleches: { cible: Cible; pts: { x: number; y: number }[] }[]
}

export function lirePalette(el: HTMLElement): PaletteR33 {
  const s = getComputedStyle(el)
  const v = (n: string, d: string) => s.getPropertyValue(n).trim() || d
  return { encre: v('--texte', '#111111'), gris: v('--texte-doux', '#6b6f76'), surface: v('--surface', '#ffffff') }
}

const rgbaHex = (hex: string, a: number): string => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1]!, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`
}

// ─── Mise en évidence ────────────────────────────────────────────────────────

interface Evidence {
  points: Set<number>
  aretes: Set<number>
  talons: Set<number>
  legende: Set<number>
}

/** Ce qui passe en gras : la cible survolée, ses flèches et leurs extrémités. */
function evidence(vue: VueRaisonnement, etat: EtatRendu): Evidence {
  const e: Evidence = { points: new Set(), aretes: new Set(), talons: new Set(), legende: new Set() }
  const s = etat.survol
  const c = etat.contenu
  if (!s || !c) return e
  const g = vue.lecture
  const citesPar = (cle: number) => {
    const d = cle >= 0 ? c.aretes[cle]?.dessous ?? [] : c.talons.get(-1 - cle)?.dessous ?? []
    for (const i of d) e.legende.add(i)
  }
  if (s.genre === 'arete') {
    const a = g.aretes[s.arete]
    if (a) {
      e.aretes.add(s.arete)
      e.points.add(a.source).add(a.cible)
      citesPar(s.arete)
    }
  } else if (s.genre === 'talon') {
    e.talons.add(s.unite)
    e.points.add(s.unite)
    citesPar(-1 - s.unite)
  } else if (s.genre === 'noeud') {
    e.points.add(s.point)
    for (const k of g.entrantes[s.point] ?? []) e.aretes.add(k)
    for (const k of g.sortantes[s.point] ?? []) e.aretes.add(k)
    if (c.talons.has(s.point)) e.talons.add(s.point)
  } else {
    e.legende.add(s.noeud)
    for (const cle of c.citations.get(s.noeud) ?? []) {
      if (cle >= 0) {
        e.aretes.add(cle)
        const a = g.aretes[cle]
        if (a) e.points.add(a.cible)
      } else {
        e.talons.add(-1 - cle)
        e.points.add(-1 - cle)
      }
    }
    const p = vue.pointDeNoeud(s.noeud)
    if (p !== null && p < vue.nU) e.points.add(p)
  }
  return e
}

/** Opacité de lignée (clic) : ce qui n'en fait pas partie s'estompe. */
function opaciteLignee(vue: VueRaisonnement, p: number): number {
  if (!vue.ligneeActive) return 1
  return vue.lignee[p]! > 0 ? 1 : 0.22
}

// ─── Géométrie ───────────────────────────────────────────────────────────────

type Pt = { x: number; y: number }

/** Point du bord de la boîte (demi-tailles hw, hh) de centre c, dans la direction de t. */
function bord(c: Pt, hw: number, hh: number, t: Pt): Pt {
  const dx = t.x - c.x, dy = t.y - c.y
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return c
  const k = Math.min(Math.abs(dx) > 1e-6 ? hw / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? hh / Math.abs(dy) : Infinity)
  return { x: c.x + dx * Math.min(1, k), y: c.y + dy * Math.min(1, k) }
}

function tracerChemin(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  ctx.beginPath()
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  if (pts.length === 2) {
    ctx.lineTo(pts[1]!.x, pts[1]!.y)
    return
  }
  // Coins arrondis aux nœuds fictifs (comme `rounded corners`).
  for (let i = 1; i < pts.length - 1; i++) {
    const m = { x: (pts[i]!.x + pts[i + 1]!.x) / 2, y: (pts[i]!.y + pts[i + 1]!.y) / 2 }
    if (i === pts.length - 2) ctx.quadraticCurveTo(pts[i]!.x, pts[i]!.y, pts[i + 1]!.x, pts[i + 1]!.y)
    else ctx.quadraticCurveTo(pts[i]!.x, pts[i]!.y, m.x, m.y)
  }
}

/** Direction d'arrivée (unitaire) au dernier point. */
function directionFin(pts: Pt[]): Pt {
  const a = pts[pts.length - 2]!, b = pts[pts.length - 1]!
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
  return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
}

/** Pointe « to » de tikz-cd : deux traits courbes. `double` : pointe plus ouverte (Rightarrow). */
function pointe(ctx: CanvasRenderingContext2D, bout: Pt, d: Pt, l: number, double: boolean): void {
  const n = { x: -d.y, y: d.x }
  const ouverture = double ? 0.72 : 0.56
  ctx.beginPath()
  for (const sgn of [1, -1]) {
    const q = { x: bout.x - d.x * l + n.x * l * ouverture * sgn, y: bout.y - d.y * l + n.y * l * ouverture * sgn }
    const c = { x: bout.x - d.x * l * 0.35 + n.x * l * 0.12 * sgn, y: bout.y - d.y * l * 0.35 + n.y * l * 0.12 * sgn }
    ctx.moveTo(q.x, q.y)
    ctx.quadraticCurveTo(c.x, c.y, bout.x, bout.y)
  }
  ctx.stroke()
}

/** Raccourcit la fin d'un chemin de `l` px (la ligne s'arrête derrière la pointe). */
function raccourcir(pts: Pt[], l: number): Pt[] {
  const r = pts.slice()
  const d = directionFin(r)
  const b = r[r.length - 1]!
  r[r.length - 1] = { x: b.x - d.x * l, y: b.y - d.y * l }
  return r
}

/** Milieu et tangente du premier segment (les étiquettes se posent là : l'écart de colonne les loge). */
function milieu(pts: Pt[]): { m: Pt; t: Pt } {
  const a = pts[0]!, b = pts[1]!
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
  return { m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, t: { x: (b.x - a.x) / l, y: (b.y - a.y) / l } }
}

function flecheStylee(
  ctx: CanvasRenderingContext2D, pts: Pt[], style: StyleFleche, couleur: string, fond: string, largeur: number, taillePointe: number,
): void {
  const d = directionFin(pts)
  const bout = pts[pts.length - 1]!
  ctx.strokeStyle = couleur
  ctx.lineWidth = largeur
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (style === 'double') {
    // Double trait : trait large à l'encre, évidé au fond ; il s'arrête avant la pointe.
    const corps = raccourcir(pts, taillePointe * 0.55)
    ctx.lineCap = 'butt'
    ctx.lineWidth = largeur * 2 + 2.2
    tracerChemin(ctx, corps)
    ctx.stroke()
    ctx.strokeStyle = fond
    ctx.lineWidth = 2.2
    tracerChemin(ctx, corps)
    ctx.stroke()
    ctx.strokeStyle = couleur
    ctx.lineWidth = largeur
    ctx.lineCap = 'round'
    pointe(ctx, bout, d, taillePointe * 1.05, true)
    return
  }
  ctx.setLineDash(style === 'pointillee' ? [3.2, 2.8] : [])
  tracerChemin(ctx, raccourcir(pts, largeur * 0.5))
  ctx.stroke()
  ctx.setLineDash([])
  pointe(ctx, bout, d, taillePointe, false)
  if (style === 'barree') {
    // Trait oblique au milieu (↛).
    const { m, t } = milieu(pts)
    const k = taillePointe * 1.05
    const u = { x: t.x * 0.5 - t.y * 0.87, y: t.y * 0.5 + t.x * 0.87 }
    ctx.beginPath()
    ctx.moveTo(m.x - u.x * k, m.y - u.y * k)
    ctx.lineTo(m.x + u.x * k, m.y + u.y * k)
    ctx.stroke()
  }
}

/** Place un élément HTML (taille mesurée à l'échelle 1) centré en (x, y) à l'échelle s. */
function placer(typo: Typo, el: HTMLElement | null | undefined, x: number, y: number, s: number, op: number, gras: boolean): void {
  if (!el) return
  const t = typo.tailles.get(el)
  if (!t || op < 0.02) {
    if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden'
    return
  }
  el.style.visibility = 'visible'
  el.style.transform = `translate(${(x - (t.w * s) / 2).toFixed(1)}px, ${(y - (t.h * s) / 2).toFixed(1)}px) scale(${s.toFixed(4)})`
  el.style.opacity = op >= 0.999 ? '' : op.toFixed(3)
  el.classList.toggle('gras', gras)
}

/** Centre d'étiquette à côté d'un segment : dessus (côté haut) ou dessous. */
function cote(m: Pt, t: Pt, w: number, h: number, dessus: boolean, ecart: number): Pt {
  let n = { x: t.y, y: -t.x }
  if (n.y > 0 || (Math.abs(n.y) < 1e-6 && n.x > 0)) n = { x: -n.x, y: -n.y }
  if (!dessus) n = { x: -n.x, y: -n.y }
  const d = (Math.abs(n.x) * w + Math.abs(n.y) * h) / 2 + ecart
  return { x: m.x + n.x * d, y: m.y + n.y * d }
}

// ─── Dessin d'une image ──────────────────────────────────────────────────────

export function dessiner(c: ContexteDessinR, etat: EtatRendu): void {
  const { ctx, vue } = c
  const page = etat.page, contenu = etat.contenu, typo = etat.typo
  etat.boites = []
  etat.fleches = []
  if (!page || !contenu || !typo) return
  const P = etat.palette
  const cam = vue.camera
  const pr = vue.projection
  const E = page.echelle
  const e3 = vue.extrusion
  const monde = (x: number, y: number, yw = 0): [number, number, number] => [(x - page.cx) * E, yw, -(y - page.cy) * E]
  const s0 = cam.pixelsParUnite() * E
  const echelle = (p: number) => s0 * (pr.echelle[p] || 1)
  const ev = evidence(vue, etat)
  const pos = vue.positions, d = vue.disposition
  let transition = false
  for (let p = 0; p < vue.nU; p++) {
    if (Math.abs(pos[p * 3]! - d.x[p]!) + Math.abs(pos[p * 3 + 2]! - d.z[p]!) > 1e-4) {
      transition = true
      break
    }
  }
  const g = vue.lecture
  const largeur = Math.max(0.75, Math.min(1.15, 1.0 * s0))
  const pointeL = Math.max(4.5, Math.min(8, 6.5 * s0))
  const centre = (p: number): Pt => ({ x: pr.x[p]!, y: pr.y[p]! })
  const demiBoite = (p: number): [number, number] => {
    const en = page.entrees[p]!
    const s = echelle(p)
    return [(en.w / 2 + 5) * s, (en.h / 2 + 4) * s]
  }
  const opUnite = (p: number) => Math.min(1, vue.opaciteAffichee[p]! * 1.0) * opaciteLignee(vue, p)

  // Flèches de lecture.
  for (const r of page.routes) {
    const et = contenu.aretes[r.arete]
    if (!et || !g.aretes[r.arete]) continue
    const op = Math.min(opUnite(r.source), opUnite(r.cible))
    if (op < 0.02) continue
    let pts: Pt[]
    if (transition || r.points.length === 2) pts = [centre(r.source), centre(r.cible)]
    else if (e3 > 0.02) {
      const y0 = pos[r.source * 3 + 1]!, y1 = pos[r.cible * 3 + 1]!
      const n = r.points.length
      pts = [centre(r.source), ...r.points.slice(1, -1).map(([x, y], k) => {
        const q = cam.projeterPoint(monde(x, y, y0 + ((y1 - y0) * (k + 1)) / (n - 1)))
        return { x: q.x, y: q.y }
      }), centre(r.cible)]
    } else pts = [centre(r.source), ...r.points.slice(1, -1).map(([x, y]) => {
      const q = cam.projeterPoint(monde(x, y))
      return { x: q.x, y: q.y }
    }), centre(r.cible)]
    const [hws, hhs] = demiBoite(r.source), [hwc, hhc] = demiBoite(r.cible)
    pts[0] = bord(pts[0]!, hws, hhs, pts[1]!)
    pts[pts.length - 1] = bord(pts[pts.length - 1]!, hwc, hhc, pts[pts.length - 2]!)
    const gras = ev.aretes.has(r.arete)
    const couleur = rgbaHex(r.abandon ? P.gris : P.encre, op)
    flecheStylee(ctx, pts, et.style, couleur, P.surface, gras ? largeur + 0.9 : largeur, pointeL)
    etat.fleches.push({ cible: { genre: 'arete', arete: r.arete }, pts })
    // Étiquettes (au milieu du premier segment).
    const { m, t } = milieu(pts)
    const s = echelle(r.cible)
    for (const [el, dessus] of [[typo.dessus.get(r.arete), true], [typo.dessous.get(r.arete), false]] as const) {
      if (!el) continue
      const tl = typo.tailles.get(el)
      if (!tl) continue
      const q = cote(m, t, tl.w * s, tl.h * s, dessus, 2.5 * s)
      placer(typo, el, q.x, q.y, s, op, gras)
      etat.boites.push({ cible: { genre: 'arete', arete: r.arete }, x0: q.x - (tl.w * s) / 2, y0: q.y - (tl.h * s) / 2, x1: q.x + (tl.w * s) / 2, y1: q.y + (tl.h * s) / 2 })
    }
  }

  // Talons d'entrée des racines : « H1, D2 → nœud ».
  for (const [u, tl] of typo.talons) {
    const op = opUnite(u)
    const s = echelle(u)
    const c0 = centre(u)
    const [hw] = demiBoite(u)
    const xb = c0.x - hw, xa = xb - 26 * s
    const gras = ev.talons.has(u)
    if (op >= 0.02) {
      flecheStylee(ctx, [{ x: xa, y: c0.y }, { x: xb, y: c0.y }], 'simple', rgbaHex(page.entrees[u]!.abandon ? P.gris : P.encre, op), P.surface, gras ? largeur + 0.9 : largeur, pointeL)
      etat.fleches.push({ cible: { genre: 'talon', unite: u }, pts: [{ x: xa, y: c0.y }, { x: xb, y: c0.y }] })
    }
    const tr = typo.tailles.get(tl.reperes)
    if (tr) {
      const x = xa - 4 * s - (tr.w * s) / 2
      placer(typo, tl.reperes, x, c0.y, s, op, gras)
      etat.boites.push({ cible: { genre: 'talon', unite: u }, x0: x - (tr.w * s) / 2, y0: c0.y - (tr.h * s) / 2, x1: x + (tr.w * s) / 2, y1: c0.y + (tr.h * s) / 2 })
    }
    if (tl.dessus) {
      const td = typo.tailles.get(tl.dessus)
      if (td) placer(typo, tl.dessus, (xa + xb) / 2 - ((tr?.w ?? 0) * s) / 2, c0.y - (Math.max(tr?.h ?? 0, 8) * s) / 2 - (td.h * s) / 2 - 1 * s, s, op, gras)
    }
  }

  // Décisions : alternatives rejetées sous une courte flèche barrée vers le bas.
  for (const [u, el] of typo.rejetees) {
    const op = opUnite(u) * 0.95
    const s = echelle(u)
    const c0 = centre(u)
    const en = page.entrees[u]!
    const y0 = c0.y + (en.h / 2 + 4) * s, y1 = y0 + 18 * s
    if (op >= 0.02) flecheStylee(ctx, [{ x: c0.x, y: y0 }, { x: c0.x, y: y1 }], 'barree', rgbaHex(P.gris, op), P.surface, largeur, pointeL * 0.9)
    const t = typo.tailles.get(el)
    if (t) placer(typo, el, c0.x, y1 + 3 * s + (t.h * s) / 2, s, op, false)
  }

  // Liens sémantiques (contredit, abandonne…) : flèches courbées au-dessus, étiquette en italique.
  dessinerLiens(c, etat, largeur, pointeL, echelle, demiBoite, opUnite)

  // Nœuds.
  for (let p = 0; p < vue.nU; p++) {
    const el = typo.unites[p]
    if (!el) continue
    const op = opUnite(p)
    const s = echelle(p)
    placer(typo, el, pr.x[p]!, pr.y[p]!, s, pr.visible[p] ? op : 0, ev.points.has(p))
    const en = page.entrees[p]!
    if (op >= 0.05) etat.boites.push({ cible: { genre: 'noeud', point: p }, x0: pr.x[p]! - (en.w / 2) * s, y0: pr.y[p]! - (en.h / 2) * s, x1: pr.x[p]! + (en.w / 2) * s, y1: pr.y[p]! + (en.h / 2) * s })
  }

  // Légende « où : » et légende de figure : suivent la feuille (monde), s'effacent en 3D.
  const opFeuille = Math.max(0, 1 - e3 * 1.6)
  for (const l of page.legende) {
    const el = typo.legende.get(l.cle)
    const q = cam.projeterPoint(monde(l.x, l.y))
    let op = opFeuille
    if (typeof l.cle === 'number' && vue.ligneeActive) {
      const p = vue.pointDeNoeud(l.cle)
      op *= p !== null && vue.lignee[p]! > 0 ? 1 : 0.35
    }
    placer(typo, el, q.x, q.y, s0, op, typeof l.cle === 'number' && ev.legende.has(l.cle))
    if (typeof l.cle === 'number' && op > 0.05) etat.boites.push({ cible: { genre: 'legende', noeud: l.cle }, x0: q.x - (l.w / 2) * s0, y0: q.y - (l.h / 2) * s0, x1: q.x + (l.w / 2) * s0, y1: q.y + (l.h / 2) * s0 })
  }
  if (typo.figure) {
    const q = cam.projeterPoint(monde(page.figure.x, page.figure.y))
    placer(typo, typo.figure, q.x, q.y, s0, opFeuille, false)
  }
}

function dessinerLiens(
  { ctx, vue }: ContexteDessinR, etat: EtatRendu, largeur: number, pointeL: number,
  echelle: (p: number) => number, demiBoite: (p: number) => [number, number], opUnite: (p: number) => number,
): void {
  const typo = etat.typo!
  const P = etat.palette
  let k = 0
  for (const { a, b, genre } of liensSemantiques(vue)) {
    const el = typo.liens[k++]
    const op = Math.min(opUnite(a), opUnite(b)) * 0.9
    if (op < 0.02) {
      placer(typo, el, 0, 0, 1, 0, false)
      continue
    }
    const pa = { x: vue.projection.x[a]!, y: vue.projection.y[a]! }, pb = { x: vue.projection.x[b]!, y: vue.projection.y[b]! }
    const [, hha] = demiBoite(a), [, hhb] = demiBoite(b)
    // Départ et arrivée par le haut ; courbe « bend left » au-dessus des deux extrémités.
    const da = { x: pa.x, y: pa.y - hha }, db = { x: pb.x, y: pb.y - hhb }
    const haut = Math.min(da.y, db.y) - Math.max(22, 0.18 * Math.abs(db.x - da.x))
    const c1 = { x: da.x + (db.x - da.x) * 0.2, y: haut }, c2 = { x: da.x + (db.x - da.x) * 0.8, y: haut }
    ctx.strokeStyle = rgbaHex(genre === 'contredit' ? P.encre : P.gris, op)
    ctx.lineWidth = largeur
    ctx.setLineDash(genre === 'contredit' ? [] : [1.2, 2.6])
    ctx.beginPath()
    ctx.moveTo(da.x, da.y)
    ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, db.x, db.y)
    ctx.stroke()
    ctx.setLineDash([])
    const dir = { x: db.x - c2.x, y: db.y - c2.y }
    const ld = Math.hypot(dir.x, dir.y) || 1
    pointe(ctx, db, { x: dir.x / ld, y: dir.y / ld }, pointeL, false)
    // Sommet de la courbe (t = 0,5) : barre oblique pour « contredit », étiquette au-dessus.
    const sx = 0.125 * da.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * db.x
    const sy = 0.125 * da.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * db.y
    if (genre === 'contredit') {
      ctx.beginPath()
      ctx.moveTo(sx - pointeL * 0.5, sy + pointeL * 0.9)
      ctx.lineTo(sx + pointeL * 0.5, sy - pointeL * 0.9)
      ctx.stroke()
    }
    const s = echelle(b)
    const t = el ? typo.tailles.get(el) : undefined
    if (el && t) placer(typo, el, sx, sy - (t.h * s) / 2 - 3 * s, s, op, false)
  }
  for (; k < typo.liens.length; k++) placer(typo, typo.liens[k], 0, 0, 1, 0, false)
}

/** Liens sémantiques entre unités visibles distinctes, dans un ordre stable (un élément HTML chacun). */
export function liensSemantiques(vue: VueRaisonnement): { a: number; b: number; genre: string; note?: string }[] {
  const j = vue.justification
  const r: { a: number; b: number; genre: string; note?: string }[] = []
  const faits = new Set<string>()
  for (let i = 0; i < j.noeuds.length; i++) {
    for (const l of j.noeuds[i]!.liens ?? []) {
      const ci = j.index.get(l.cible)
      if (ci === undefined) continue
      const a = vue.pointDeNoeud(i), b = vue.pointDeNoeud(ci)
      if (a === null || b === null || a === b || a >= vue.nU || b >= vue.nU) continue
      const cle = `${a}>${b}:${l.genre}`
      if (faits.has(cle)) continue
      faits.add(cle)
      r.push({ a, b, genre: l.genre, note: l.note })
    }
  }
  return r
}

// ─── Survol ──────────────────────────────────────────────────────────────────

function distanceSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const l2 = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}

/** Élément sous le pointeur, d'après la dernière image : texte d'abord, puis flèches (5 px). */
export function cibleSous(etat: EtatRendu, x: number, y: number): Cible | null {
  for (let k = etat.boites.length - 1; k >= 0; k--) {
    const b = etat.boites[k]!
    if (x >= b.x0 - 2 && x <= b.x1 + 2 && y >= b.y0 - 2 && y <= b.y1 + 2) return b.cible
  }
  let meilleur: Cible | null = null
  let dMin = 5
  for (const f of etat.fleches) {
    for (let i = 0; i + 1 < f.pts.length; i++) {
      const dd = distanceSegment({ x, y }, f.pts[i]!, f.pts[i + 1]!)
      if (dd < dMin) {
        dMin = dd
        meilleur = f.cible
      }
    }
  }
  return meilleur
}

export function memeCible(a: Cible | null, b: Cible | null): boolean {
  if (!a || !b) return a === b
  return JSON.stringify(a) === JSON.stringify(b)
}
