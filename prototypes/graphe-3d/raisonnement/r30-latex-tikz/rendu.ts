// R30 · Rendu « figure TikZ » sur les calques canvas de la vue, texte composé sur le calque DOM.
//
// - Dessous : axe des rangs logiques (fin, gris) et accolades des zones (decorations.pathreplacing),
//   liaisons orthogonales à coins arrondis et pointe Stealth, jonctions en point plein, liens
//   sémantiques en crochets étiquetés en italique, sous-arguments ouverts (cadre trait-point).
// - Dessus : nœuds `draw, rounded corners=1pt` au trait fin (résultats : `double`, sous-arguments
//   repliés : `copy shadow`), décisions en losange, hypothèses de modélisation en note à coin replié,
//   cercles de contexte et renvois (`signal`) sous les nœuds ; puis le texte composé (HTML + KaTeX) et
//   la légende « Figure 1 » posés sur le calque DOM.
// - Statut par le motif du trait (TikZ) : plein = validé, `dashed` = à vérifier, barré = réfuté,
//   `dotted` gris = piste abandonnée. Noir sur blanc, une seule couleur : blue!60!black.

import { rgba, type ContexteDessinR, type ValeurReglage, type VueRaisonnement } from '../../src/raisonnement'
import type { CalqueTeX, PieceTeX } from './composition'
import { SERIF, type Boite, type MiseEnPage } from './mise-en-page'
import { etatSquelette } from './squelette'

export interface PaletteR30 {
  encre: string
  gris: string
  grisClair: string
  surface: string
  accent: string
}

export function lirePaletteR30(el: HTMLElement): PaletteR30 {
  const s = getComputedStyle(el)
  const v = (n: string, d: string) => s.getPropertyValue(n).trim() || d
  return {
    encre: v('--texte', '#000000'),
    gris: v('--texte-doux', '#808080'),
    grisClair: v('--r30-gris-clair', '#bfbfbf'),
    surface: v('--surface', '#ffffff'),
    accent: v('--accent', '#000099'),
  }
}

/** Élément interactif dessiné à la dernière image (pour le survol). */
export interface Cible {
  genre: 'carte' | 'pastille' | 'renvoi' | 'drapeau' | 'impasse' | 'masque'
  point: number
  /** Nœud de justification (pastille). */
  noeud: number
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface EtatRendu {
  page: MiseEnPage | null
  palette: PaletteR30
  cibles: Cible[]
  /** Élément survolé (déterminé par cibleSous). */
  survol: Cible | null
  /** Hypothèses épinglées (points) : leurs repères restent affichés sur les nœuds dépendants. */
  epingles: Set<number>
  /** Hypothèses de modélisation présentes (point → repère « H1 »). */
  hypotheses: Map<number, string>
  /** Calque du texte composé. */
  calque: CalqueTeX | null
  /** Légende de la figure (coordonnées de mise en page). */
  legende: PieceTeX | null
}

const lire = <T extends ValeurReglage>(vue: VueRaisonnement, cle: string) => vue.reglages.lire<T>(cle)

/** Écran : px par px de mise en page au point p. */
function echelle(vue: VueRaisonnement, page: MiseEnPage, p: number): number {
  return vue.camera.pixelsParUnite() * (vue.projection.echelle[p] || 1) * page.echelle
}

/** Hypothèses (points) actives : survolée + épinglées. */
export function choixActifs(_vue: VueRaisonnement, etat: EtatRendu): number[] {
  const r = [...etat.epingles]
  const s = etat.survol
  if (s && s.genre === 'drapeau' && !etat.epingles.has(s.point)) r.push(s.point)
  return r
}

/** Points qui dépendent d'au moins une hypothèse active (pour atténuer le reste). */
export function dependantsActifs(vue: VueRaisonnement, etat: EtatRendu): Set<number> | null {
  const page = etat.page
  if (!page) return null
  const actifs = choixActifs(vue, etat)
  if (!actifs.length) return null
  const s = new Set<number>(actifs)
  for (const c of actifs) for (const q of page.portees.get(c) ?? []) s.add(q)
  return s
}

// ─── Primitives TikZ ─────────────────────────────────────────────────────────

/** Ligne brisée à coins arrondis (`rounded corners=2pt`). */
function polyligneArrondie(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], r: number): void {
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  for (let k = 1; k < pts.length - 1; k++) {
    const a = pts[k - 1]!, b = pts[k]!, c = pts[k + 1]!
    const rr = Math.min(r, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2)
    if (rr < 0.3) ctx.lineTo(b.x, b.y)
    else ctx.arcTo(b.x, b.y, c.x, c.y, rr)
  }
  const z = pts[pts.length - 1]!
  ctx.lineTo(z.x, z.y)
}

/** Pointe `Stealth` (fléchette à dos creux) de longueur l, pointe en (x, y), direction (dx, dy). */
function stealth(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, l: number): void {
  const n = Math.hypot(dx, dy) || 1
  const ux = dx / n, uy = dy / n
  const demi = l * 0.38, creux = l * 0.3
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x - ux * l - uy * demi, y - uy * l + ux * demi)
  ctx.lineTo(x - ux * (l - creux), y - uy * (l - creux))
  ctx.lineTo(x - ux * l + uy * demi, y - uy * l - ux * demi)
  ctx.closePath()
  ctx.fill()
}

/** Rectangle à coins arrondis (`rounded corners=1pt`). */
function rectArrondi(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Motif TikZ du statut : plein (validé), `dashed` (à vérifier) ; `dotted` pour une piste abandonnée. */
function motifStatut(statut: string, abandon: boolean): number[] {
  if (abandon) return [0.5, 2]
  return statut === 'incertain' ? [3, 2.5] : []
}

// ─── Calque « dessous » : axe, accolades, liaisons ───────────────────────────

export function dessinerDessous(c: ContexteDessinR, etat: EtatRendu): void {
  const { ctx, vue } = c
  const page = etat.page
  if (!page || !page.boites.length) return
  const e = vue.extrusion
  const cam = vue.camera
  const E = page.echelle
  const monde = (x: number, y: number, yw = 0): [number, number, number] => [(x - page.cx) * E, yw, -(y - page.cy) * E]
  const s0 = cam.pixelsParUnite() * E

  // Axe des rangs et accolades des zones (s'estompent en 3D).
  const alpha = Math.max(0, 1 - e * 1.6)
  if (alpha > 0.01 && lire<boolean>(vue, 'enTetes')) dessinerCadre(ctx, vue, etat, monde, s0, alpha)

  dessinerDeplies(c, etat)

  // Liaisons.
  const pos = vue.positions
  const d = vue.disposition
  let transition = false
  for (let p = 0; p < vue.nU; p++) {
    if (Math.abs(pos[p * 3]! - d.x[p]!) + Math.abs(pos[p * 3 + 2]! - d.z[p]!) > 1e-4) {
      transition = true
      break
    }
  }
  const P = etat.palette
  const actifs = dependantsActifs(vue, etat)
  const survol = vue.survol
  const g = vue.lecture
  // Trait fin (≈ 0,4 pt imprimé), jamais sous 0,7 px à l'écran.
  const epaisseur = Math.max(0.7, Math.min(1.1, 0.9 * s0))
  const lPointe = Math.max(5, Math.min(8, 6.5 * s0))
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'butt'
  for (const r of page.routes) {
    const a = g.aretes[r.arete]
    if (!a) continue
    const os = vue.opaciteAffichee[r.source]!, oc = vue.opaciteAffichee[r.cible]!
    let alphaR = Math.min(1, Math.max(0.12, Math.min(os, oc)) * 1.1)
    let couleur = P.encre
    let largeur = epaisseur
    if (survol !== null && (r.source === survol || r.cible === survol)) {
      couleur = P.accent
      alphaR = 1
      largeur = epaisseur + 0.5
    }
    if (vue.ligneeActive) {
      const ls = vue.lignee[r.source]!, lc = vue.lignee[r.cible]!
      const dans = ls > 0 && lc > 0 && !(ls === 2 && lc === 1) && !(ls === 1 && lc === 2) && !(ls === 3 && lc === 1) && !(ls === 2 && lc === 3)
      if (dans) {
        // Amont : encre, trait renforcé (`thick`) ; aval : accent.
        couleur = ls === 1 || lc === 1 ? P.encre : P.accent
        alphaR = 1
        largeur = epaisseur + 0.7
      } else alphaR *= 0.35
    }
    if (actifs && !(actifs.has(r.source) && actifs.has(r.cible))) alphaR *= 0.3
    if (r.abandon) {
      couleur = P.gris
      ctx.setLineDash([0.8, 2.4])
      ctx.lineCap = 'round'
    } else {
      ctx.setLineDash([])
      ctx.lineCap = 'butt'
    }
    const bs = page.boites[r.source]!, bc = page.boites[r.cible]!
    const demi = (b: Boite) => (b.genre === 'decision' ? 19 : b.w / 2)
    let pts: { x: number; y: number }[]
    if (transition) {
      const pr = vue.projection
      const ss = echelle(vue, page, r.source), sc = echelle(vue, page, r.cible)
      const xa = pr.x[r.source]! + demi(bs) * ss, ya = pr.y[r.source]!
      const xb = pr.x[r.cible]! - demi(bc) * sc, yb = pr.y[r.cible]!
      const xm = (xa + xb) / 2
      pts = [{ x: xa, y: ya }, { x: xm, y: ya }, { x: xm, y: yb }, { x: xb, y: yb }]
    } else if (e > 0.02) {
      const y0 = pos[r.source * 3 + 1]!, y1 = pos[r.cible * 3 + 1]!
      const n = r.points.length
      pts = r.points.map(([x, y], k) => cam.projeterPoint(monde(x, y, y0 + (y1 - y0) * (n > 1 ? k / (n - 1) : 0))))
    } else pts = r.points.map(([x, y]) => cam.projeterPoint(monde(x, y)))
    // Le trait s'arrête dans le creux de la pointe.
    const z = pts[pts.length - 1]!, y = pts[pts.length - 2] ?? pts[0]!
    const lz = Math.hypot(z.x - y.x, z.y - y.y) || 1
    const recul = Math.min(lPointe * 0.72, lz * 0.9)
    const trace = pts.slice(0, -1)
    trace.push({ x: z.x - ((z.x - y.x) / lz) * recul, y: z.y - ((z.y - y.y) / lz) * recul })
    ctx.strokeStyle = rgba(couleur, alphaR)
    ctx.lineWidth = largeur
    ctx.beginPath()
    polyligneArrondie(ctx, trace, Math.max(1.5, Math.min(4, 3 * s0)))
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = rgba(couleur, alphaR)
    stealth(ctx, z.x, z.y, z.x - y.x, z.y - y.y, lPointe)
  }
  // Jonctions : `circle, fill, inner sep=1pt` là où une sortie se divise.
  if (!transition && e < 0.02) {
    ctx.fillStyle = rgba(P.encre, actifs || vue.ligneeActive ? 0.45 : 1)
    const rj = Math.max(1.4, Math.min(2.4, 2 * s0))
    for (const [x, y] of page.jonctions) {
      const q = cam.projeterPoint(monde(x, y))
      ctx.beginPath()
      ctx.arc(q.x, q.y, rj, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()

  // Décision → hypothèse dans la marge : trait coudé vers la note.
  ctx.save()
  for (const l of page.liensMarge) {
    const pr = vue.projection
    const s = echelle(vue, page, l.source)
    const bc = page.boites[l.cible]!
    const xm = pr.x[l.cible]! - (bc.w / 2 - 10) * s
    const ya = pr.y[l.source]!, yb = pr.y[l.cible]! - (bc.h / 2) * s
    const xa = pr.x[l.source]! - 19 * s
    const op = Math.min(vue.opaciteAffichee[l.source]!, vue.opaciteAffichee[l.cible]!)
    ctx.strokeStyle = rgba(P.encre, op)
    ctx.fillStyle = rgba(P.encre, op)
    ctx.lineWidth = epaisseur
    ctx.beginPath()
    polyligneArrondie(ctx, [{ x: xa, y: ya }, { x: xm, y: ya }, { x: xm, y: yb - lPointe * 0.7 }], 3)
    ctx.stroke()
    stealth(ctx, xm, yb, 0, 1, lPointe)
  }
  ctx.restore()

  if (lire<boolean>(vue, 'liensSemantiques')) dessinerLiensSemantiques(c, etat)
}

/** Accolade TikZ (`decorate, decoration={brace, amplitude=a}`), pointe vers le haut. */
function accolade(ctx: CanvasRenderingContext2D, xa: number, xb: number, y: number, a: number): void {
  const xm = (xa + xb) / 2
  const q = Math.min(a, (xb - xa) / 4)
  ctx.beginPath()
  ctx.moveTo(xa, y + q)
  ctx.quadraticCurveTo(xa, y, xa + q, y)
  ctx.lineTo(xm - q, y)
  ctx.quadraticCurveTo(xm, y, xm, y - q)
  ctx.quadraticCurveTo(xm, y, xm + q, y)
  ctx.lineTo(xb - q, y)
  ctx.quadraticCurveTo(xb, y, xb, y + q)
  ctx.stroke()
}

/** Axe gradué des rangs logiques (en haut) et accolades nommées des zones (au-dessus des nœuds). */
function dessinerCadre(
  ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu,
  monde: (x: number, y: number) => [number, number, number], s0: number, alpha: number,
): void {
  const page = etat.page!
  const P = etat.palette
  const cam = vue.camera
  const b = page.bornes
  const hg = cam.projeterPoint(monde(b.x0, b.y0))
  if (!hg.visible) return
  const X = (x: number) => hg.x + (x - b.x0) * s0
  const Y = (y: number) => hg.y + (y - b.y0) * s0
  const taille = Math.max(9, Math.min(14, 11.5 * s0))
  ctx.save()
  // Accolades des zones, 16 px au-dessus du nœud le plus haut ; nom en petites capitales au-dessus.
  const yA = b.y0 - 16
  ctx.strokeStyle = rgba(P.encre, 0.85 * alpha)
  ctx.lineWidth = Math.max(0.6, Math.min(1, 0.8 * s0))
  ctx.fillStyle = rgba(P.encre, alpha)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.font = `400 ${taille}px ${SERIF}`
  const cc = ctx as CanvasRenderingContext2D & { fontVariantCaps?: string }
  if ('fontVariantCaps' in cc) cc.fontVariantCaps = 'small-caps'
  for (const z of page.zones) {
    const xa = X(z.x0 + 8), xb = X(z.x1 - 8)
    if (xb - xa < 12) continue
    accolade(ctx, xa, xb, Y(yA), 5 * Math.min(1.3, s0))
    const nom = z.nom.toLowerCase()
    if (ctx.measureText(nom).width < xb - xa) ctx.fillText(nom, (xa + xb) / 2, Y(yA) - 5 * Math.min(1.3, s0) - 2)
  }
  if ('fontVariantCaps' in cc) cc.fontVariantCaps = 'normal'
  // Axe des rangs : trait fin gris, graduations aux rangs, numéros au-dessus ; « r » en italique.
  const yR = b.y0 - 50
  if (page.xRangs.length) {
    const pas = page.xRangs.length > 1 ? page.xRangs[1]! - page.xRangs[0]! : page.largeurCarte
    const xa = page.xRangs[0]! - pas / 2, xb = page.xRangs[page.xRangs.length - 1]! + pas / 2
    ctx.strokeStyle = rgba(P.gris, 0.9 * alpha)
    ctx.fillStyle = rgba(P.gris, alpha)
    ctx.lineWidth = Math.max(0.6, Math.min(0.9, 0.7 * s0))
    ctx.beginPath()
    ctx.moveTo(X(xa), Y(yR))
    ctx.lineTo(X(xb), Y(yR))
    for (const x of page.xRangs) {
      ctx.moveTo(X(x), Y(yR) - 3 * Math.min(1.2, s0))
      ctx.lineTo(X(x), Y(yR) + 3 * Math.min(1.2, s0))
    }
    ctx.stroke()
    stealth(ctx, X(xb) + 6 * Math.min(1.2, s0), Y(yR), 1, 0, 5 * Math.min(1.2, s0))
    ctx.font = `400 ${taille * 0.9}px ${SERIF}`
    ctx.textBaseline = 'bottom'
    page.xRangs.forEach((x, r) => ctx.fillText(String(r), X(x), Y(yR) - 4 * Math.min(1.2, s0)))
    ctx.font = `italic 400 ${taille}px ${SERIF}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('r', X(xb) + 9 * Math.min(1.2, s0), Y(yR))
    ctx.font = `400 ${taille * 0.85}px ${SERIF}`
    ctx.textAlign = 'right'
    ctx.fillText('rang logique', X(xa) - 6 * Math.min(1.2, s0), Y(yR))
  }
  ctx.restore()
}

/** Sous-arguments ouverts : cadre trait-point autour de chaque nœud issu du dépliage. */
function dessinerDeplies({ ctx, vue }: ContexteDessinR, etat: EtatRendu): void {
  const page = etat.page!
  if (!etatSquelette.deplies.size) return
  const g = vue.lecture
  const j = g.justification
  const P = etat.palette
  ctx.save()
  for (const [tete, ids] of etatSquelette.deplies) {
    const ensemble = new Set([tete, ...ids])
    const pts: number[] = []
    for (let p = 0; p < vue.nU; p++) if (g.unites[p]!.membres.some((m) => ensemble.has(j.noeuds[m]!.id))) pts.push(p)
    if (pts.length < 2) continue
    for (const p of pts) {
      const b = page.boites[p]!, s = echelle(vue, page, p)
      const op = vue.opaciteAffichee[p]!
      const x = vue.projection.x[p]!, y = vue.projection.y[p]!
      const l = b.genre === 'decision' ? Math.max(24, b.w / 2) : b.w / 2
      ctx.strokeStyle = rgba(P.accent, 0.8 * op)
      ctx.setLineDash([6, 2, 1, 2])
      ctx.lineWidth = 0.8
      rectArrondi(ctx, x - (l + 6) * s, y - (b.haut + 6) * s, (2 * l + 12) * s, (b.haut + b.bas + 10) * s, 3 * s)
      ctx.stroke()
      ctx.setLineDash([])
      if (j.noeuds[g.unites[p]!.conclusion]!.id === tete) {
        ctx.font = `italic 400 ${Math.max(9, 10.5 * s)}px ${SERIF}`
        ctx.textAlign = 'right'
        ctx.textBaseline = 'bottom'
        ctx.fillStyle = rgba(P.accent, op)
        ctx.fillText(`sous-argument ouvert (${pts.length}) — double-clic : refermer`, x + (l + 6) * s, y - (b.haut + 8) * s)
      }
    }
  }
  ctx.restore()
}

/** Contradictions, résolutions, abandons : crochets au-dessus des nœuds, étiquette en italique. */
function dessinerLiensSemantiques({ ctx, vue }: ContexteDessinR, etat: EtatRendu): void {
  const j = vue.justification
  const P = etat.palette
  const page = etat.page!
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const faits = new Set<string>()
  for (let i = 0; i < j.noeuds.length; i++) {
    const liens = j.noeuds[i]!.liens
    if (!liens) continue
    for (const l of liens) {
      const ci = j.index.get(l.cible)
      if (ci === undefined) continue
      const a = vue.pointDeNoeud(i), b = vue.pointDeNoeud(ci)
      if (a === null || b === null || a === b || a >= vue.nU || b >= vue.nU) continue
      const cle = `${a}>${b}:${l.genre}`
      if (faits.has(cle)) continue
      faits.add(cle)
      const op = Math.min(vue.opaciteAffichee[a]!, vue.opaciteAffichee[b]!)
      if (op < 0.05) continue
      const couleur = l.genre === 'resout' ? P.accent : l.genre === 'contredit' ? P.encre : P.gris
      const pr = vue.projection
      const sa = echelle(vue, page, a), sb = echelle(vue, page, b)
      const x1 = pr.x[a]! + 14 * sa, y1 = pr.y[a]! - page.boites[a]!.haut * sa
      const x2 = pr.x[b]! - 14 * sb, y2 = pr.y[b]! - page.boites[b]!.haut * sb
      const my = Math.min(y1, y2) - Math.max(14, 18 * Math.min(sa, sb))
      ctx.strokeStyle = rgba(couleur, 0.9 * op)
      ctx.lineWidth = 0.8
      ctx.setLineDash(l.genre === 'contredit' ? [4, 2.5] : l.genre === 'resout' ? [] : [0.8, 2.2])
      ctx.lineCap = l.genre === 'contredit' || l.genre === 'resout' ? 'butt' : 'round'
      ctx.beginPath()
      polyligneArrondie(ctx, [{ x: x1, y: y1 }, { x: x1, y: my }, { x: x2, y: my }, { x: x2, y: y2 }], 3)
      ctx.stroke()
      ctx.setLineDash([])
      const texte = l.genre === 'contredit' ? 'contredit' : l.genre === 'resout' ? 'résout' : l.genre === 'abandonne' ? 'abandonne' : 'remplace'
      const tx = (x1 + x2) / 2
      ctx.font = `italic 400 ${Math.max(9.5, Math.min(13, 11 * Math.min(sa, sb)))}px ${SERIF}`
      const w = ctx.measureText(texte).width + 8
      ctx.fillStyle = rgba(P.surface, op)
      ctx.fillRect(tx - w / 2, my - 7, w, 14)
      ctx.fillStyle = rgba(couleur, op)
      ctx.fillText(texte, tx, my + 0.5)
    }
  }
  ctx.restore()
}

// ─── Calque « dessus » : nœuds, puis texte composé ───────────────────────────

export function dessinerDessus(c: ContexteDessinR, etat: EtatRendu): void {
  const { ctx, vue } = c
  const page = etat.page
  etat.cibles = []
  const calque = etat.calque
  calque?.debut(c.largeur, c.hauteur)
  if (!page) {
    calque?.fin()
    return
  }
  const P = etat.palette
  const pr = vue.projection
  // Masqués (contexte pur) : petits carrés, visibles seulement avec les liens complets.
  ctx.save()
  for (let p = vue.nU; p < vue.nP; p++) {
    const pres = vue.presence[p]!
    if (pres < 0.05 || !pr.visible[p]) continue
    const s = echelle(vue, page, p)
    const x = pr.x[p]!, y = pr.y[p]!
    const n = vue.noeud(p)
    const r = 3 * Math.min(1.4, s)
    ctx.fillStyle = rgba(P.surface, pres)
    ctx.strokeStyle = rgba(P.gris, pres)
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    if (s > 0.55) {
      ctx.font = `400 ${11 * Math.min(1.3, s)}px ${SERIF}`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = rgba(P.gris, pres)
      ctx.fillText(page.boites[p]!.lignes[0] ?? n.nom, x - 8 * s, y)
    }
    etat.cibles.push({ genre: 'masque', point: p, noeud: vue.indexNoeud(p), x0: x - 6, y0: y - 6, x1: x + 6, y1: y + 6 })
  }
  ctx.restore()

  // Unités : les plus en avant en dernier (survol, lignée), et de l'arrière vers l'avant en 3D.
  const ordre: number[] = []
  for (let p = 0; p < vue.nU; p++) ordre.push(p)
  const devant = (p: number) => (p === vue.survol ? 3 : vue.lignee[p]! > 0 ? 2 : 0)
  ordre.sort((a, b) => devant(a) - devant(b) || pr.profondeur[b]! - pr.profondeur[a]!)
  const actifs = choixActifs(vue, etat)
  const toujours = lire<string>(vue, 'bandesChoix') === 'toujours'
  for (const p of ordre) {
    if (!pr.visible[p]) continue
    const op = vue.opaciteAffichee[p]!
    if (op < 0.02) continue
    const b = page.boites[p]!
    const s = echelle(vue, page, p)
    ctx.save()
    ctx.translate(pr.x[p]!, pr.y[p]!)
    ctx.scale(s, s)
    ctx.globalAlpha = op
    // Hypothèses actives dont ce nœud dépend (graphe complet).
    const tags: string[] = []
    for (const [q, ref] of etat.hypotheses) {
      if (q === p) continue
      if ((toujours || actifs.includes(q)) && page.portees.get(q)?.includes(p)) tags.push(ref)
    }
    if (b.genre === 'drapeau') dessinerSpec(ctx, vue, etat, p, b)
    else if (b.genre === 'decision') dessinerDecision(ctx, vue, etat, p, b, tags)
    else dessinerBloc(ctx, vue, etat, p, b, tags)
    ctx.restore()
    // Texte composé.
    const x = pr.x[p]!, y = pr.y[p]!
    if (calque) {
      const citeParRenvoi = etat.survol?.genre === 'renvoi' && etat.survol.point === p
      const classe = b.abandon ? 'r30-gris' : citeParRenvoi ? 'r30-cite' : ''
      b.pieces.forEach((pc, k) => {
        if (pc.classe === 'impasse' && !lire<boolean>(vue, 'impasses')) return
        calque.placer(`${p}:${k}`, pc, x + pc.x * s, y + pc.y * s, s, op, classe)
      })
    }
    // Cibles (écran).
    if (b.genre === 'decision') {
      const l = Math.max(19, b.w / 2)
      etat.cibles.push({ genre: 'carte', point: p, noeud: -1, x0: x - l * s, y0: y - b.haut * s, x1: x + l * s, y1: y + 22 * s })
      if (b.impasse && lire<boolean>(vue, 'impasses')) etat.cibles.push({ genre: 'impasse', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y + 22 * s, x1: x + (b.w / 2) * s, y1: y + (32 + b.hImpasse) * s })
    } else if (b.genre === 'drapeau') etat.cibles.push({ genre: 'drapeau', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y - (b.h / 2) * s, x1: x + (b.w / 2) * s, y1: y + (b.h / 2) * s })
    else etat.cibles.push({ genre: 'carte', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y - (b.h / 2) * s, x1: x + (b.w / 2) * s, y1: y + (b.h / 2) * s })
    const y0 = yPastilles(b)
    for (const it of rangee(vue, b)) {
      const cx = x + it.x * s, cy = y + y0 * s
      if (it.renvoi >= 0) etat.cibles.push({ genre: 'renvoi', point: it.renvoi, noeud: -1, x0: cx - 14 * s, y0: cy - 7 * s, x1: cx + 14 * s, y1: cy + 7 * s })
      else etat.cibles.push({ genre: 'pastille', point: p, noeud: it.noeud, x0: cx - 7 * s, y0: cy - 7 * s, x1: cx + 7 * s, y1: cy + 7 * s })
    }
  }

  // Légende « Figure 1 » sous la figure (plan 2D seulement).
  const lg = etat.legende
  if (calque && lg && lire<boolean>(vue, 'legende') && vue.extrusion < 0.3) {
    const E = page.echelle
    const q = vue.camera.projeterPoint([(lg.x - page.cx) * E, 0, -(lg.y - page.cy) * E])
    const s0 = vue.camera.pixelsParUnite() * E
    if (q.visible) calque.placer('legende', lg, q.x, q.y, s0, Math.max(0, 1 - vue.extrusion * 3.3))
  }
  calque?.fin()
}

/** Ordonnée (relative au point d'ancrage) de la rangée de contexte. */
function yPastilles(b: Boite): number {
  if (b.genre === 'decision') return 19 + (b.impasse ? 15 + b.hImpasse : 4) + 8
  return b.h / 2 + 11
}

/** Trait selon la lignée ou le survol ; null sinon. */
function traitLignee(vue: VueRaisonnement, etat: EtatRendu, p: number): { couleur: string; largeur: number } | null {
  const P = etat.palette
  if (vue.ligneeActive) {
    const l = vue.lignee[p]!
    if (l === 3) return { couleur: P.accent, largeur: 1.8 }
    if (l === 1) return { couleur: P.encre, largeur: 1.6 }
    if (l === 2) return { couleur: P.accent, largeur: 1.3 }
  }
  if (vue.survol === p) return { couleur: P.accent, largeur: 1.5 }
  return null
}

/** Rangée sous le nœud : renvois puis cercles de contexte (abscisses relatives). */
function rangee(vue: VueRaisonnement, b: Boite): { x: number; renvoi: number; noeud: number }[] {
  const r: { x: number; renvoi: number; noeud: number }[] = []
  let x = -b.w / 2 + 6
  for (const q of b.renvois) {
    r.push({ x: x + 13, renvoi: q, noeud: -1 })
    x += 32
  }
  x += 1
  if (lire<boolean>(vue, 'pastillesContexte')) for (const pa of b.pastilles) {
    r.push({ x, renvoi: -1, noeud: pa.noeud })
    x += 15
  }
  return r
}

function dessinerRangee(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, b: Boite): void {
  const items = rangee(vue, b)
  if (!items.length) return
  const P = etat.palette
  const y = yPastilles(b)
  const sv = etat.survol
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Renvois : forme `signal` pointée vers le nœud, numéro du nœud cité (comme un \ref).
  ctx.font = `400 10px ${SERIF}`
  ctx.lineWidth = 0.7
  for (const it of items) {
    if (it.renvoi < 0) continue
    const cite = etat.page?.boites[it.renvoi]
    const ref = cite ? String(cite.numero) : '?'
    const allume = sv?.genre === 'renvoi' && sv.point === it.renvoi
    const x = it.x
    ctx.beginPath()
    ctx.moveTo(x - 13, y - 6)
    ctx.lineTo(x + 8, y - 6)
    ctx.lineTo(x + 13, y)
    ctx.lineTo(x + 8, y + 6)
    ctx.lineTo(x - 13, y + 6)
    ctx.closePath()
    ctx.fillStyle = P.surface
    ctx.fill()
    ctx.strokeStyle = allume ? P.accent : P.encre
    ctx.lineWidth = allume ? 1.2 : 0.7
    ctx.stroke()
    ctx.fillStyle = allume ? P.accent : P.encre
    ctx.fillText(ref, x - 2, y + 0.5)
  }
  // Contexte : `circle, draw, inner sep=1pt`, lettre en \scriptsize.
  ctx.font = `400 8.5px ${SERIF}`
  const bornes = items.filter((it) => it.renvoi < 0)
  bornes.forEach((it, k) => {
    const pa = b.pastilles[k]!
    const allume = sv?.genre === 'pastille' && sv.noeud === pa.noeud
    const x = it.x
    ctx.beginPath()
    ctx.arc(x, y, 5.5, 0, Math.PI * 2)
    ctx.fillStyle = P.surface
    ctx.fill()
    ctx.strokeStyle = allume ? P.accent : pa.lettre === '+' ? P.grisClair : P.gris
    ctx.lineWidth = allume ? 1.1 : 0.6
    ctx.stroke()
    ctx.fillStyle = allume ? P.accent : P.encre
    ctx.fillText(pa.lettre, x, y + 0.5)
  })
  if (b.plus) {
    ctx.fillStyle = P.gris
    ctx.font = `400 9.5px ${SERIF}`
    ctx.textAlign = 'left'
    const dernier = items[items.length - 1]!
    ctx.fillText(`+${b.plus}`, dernier.x + 8, y + 0.5)
  }
}

/** Hypothèses actives dont dépend le nœud, au-dessus du coin haut droit (« ⊢ (H1), (H3) »). */
function dessinerTags(ctx: CanvasRenderingContext2D, etat: EtatRendu, tags: string[], xDroite: number, yHaut: number): void {
  if (!tags.length) return
  ctx.font = `400 10.5px ${SERIF}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = etat.palette.accent
  ctx.fillText(`⊢ ${tags.map((t) => `(${t})`).join(', ')}`, xDroite, yHaut - 2)
}

function dessinerBloc(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, tags: string[]): void {
  const P = etat.palette
  const n = vue.noeud(p)
  const w = b.w, h = b.h
  const x0 = -w / 2, y0 = -h / 2
  const majeur = b.genre === 'majeur'
  const sousArgument = b.genre === 'etape' || (vue.lecture.unites[p]?.membres.length ?? 1) > 1
  const tl = traitLignee(vue, etat, p)
  const couleur = tl ? tl.couleur : b.abandon ? P.gris : tags.length ? P.accent : P.encre
  const largeur = tl ? tl.largeur : 0.8
  const motif = motifStatut(n.statut, b.abandon)
  const r = 1.4
  ctx.lineCap = b.abandon ? 'round' : 'butt'
  // Sous-argument replié : `copy shadow` (copie décalée du contour, derrière).
  if (sousArgument) {
    rectArrondi(ctx, x0 + 3, y0 + 3, w, h, r)
    ctx.fillStyle = P.surface
    ctx.fill()
    ctx.strokeStyle = couleur
    ctx.lineWidth = 0.7
    ctx.setLineDash(motif)
    ctx.stroke()
    ctx.setLineDash([])
  }
  rectArrondi(ctx, x0, y0, w, h, r)
  ctx.fillStyle = P.surface
  ctx.fill()
  ctx.setLineDash(motif)
  if (majeur && !b.abandon) {
    // Résultat : `double` (deux traits fins séparés d'un blanc).
    ctx.strokeStyle = couleur
    ctx.lineWidth = largeur + 2.2
    ctx.stroke()
    ctx.strokeStyle = P.surface
    ctx.lineWidth = 1.4
    ctx.stroke()
  } else {
    ctx.strokeStyle = couleur
    ctx.lineWidth = largeur
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.lineCap = 'butt'
  // Réfuté : barré (diagonale du nœud).
  if (n.statut === 'refute' && !b.abandon) {
    ctx.strokeStyle = rgba(couleur, 0.7)
    ctx.lineWidth = 0.7
    ctx.beginPath()
    ctx.moveTo(x0, y0 + h)
    ctx.lineTo(x0 + w, y0)
    ctx.stroke()
  }
  dessinerRangee(ctx, vue, etat, b)
  dessinerTags(ctx, etat, tags, x0 + w, y0)
}

function dessinerDecision(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, tags: string[]): void {
  const P = etat.palette
  const tl = traitLignee(vue, etat, p)
  dessinerTags(ctx, etat, tags, b.w / 2, (b.pieces[0]?.y ?? -19) - 1)
  // Alternative rejetée : sortie non connectée (×), texte composé en dessous.
  if (b.impasse && lire<boolean>(vue, 'impasses')) {
    ctx.strokeStyle = P.gris
    ctx.lineWidth = 0.7
    ctx.setLineDash([2, 1.5])
    ctx.beginPath()
    ctx.moveTo(0, 19)
    ctx.lineTo(0, 25)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(-3, 25)
    ctx.lineTo(3, 31)
    ctx.moveTo(3, 25)
    ctx.lineTo(-3, 31)
    ctx.stroke()
  }
  // `diamond, draw, aspect=1`.
  ctx.beginPath()
  ctx.moveTo(0, -19)
  ctx.lineTo(19, 0)
  ctx.lineTo(0, 19)
  ctx.lineTo(-19, 0)
  ctx.closePath()
  ctx.fillStyle = P.surface
  ctx.fill()
  ctx.strokeStyle = tl ? tl.couleur : tags.length ? P.accent : P.encre
  ctx.lineWidth = tl ? tl.largeur : 0.8
  ctx.lineJoin = 'round'
  ctx.stroke()
  ctx.fillStyle = tl ? tl.couleur : P.encre
  ctx.font = `700 10px ${SERIF}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(b.ref, 0, 0.5)
  dessinerRangee(ctx, vue, etat, b)
}

/** Hypothèse de modélisation : note à coin replié. */
function dessinerSpec(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite): void {
  const P = etat.palette
  const epingle = etat.epingles.has(p)
  const actif = epingle || (etat.survol?.genre === 'drapeau' && etat.survol.point === p)
  const w = b.w, h = b.h
  const x0 = -w / 2, y0 = -h / 2
  const tl = traitLignee(vue, etat, p)
  const couleur = tl ? tl.couleur : actif ? P.accent : P.encre
  const pli = 7
  ctx.fillStyle = P.surface
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x0 + w - pli, y0)
  ctx.lineTo(x0 + w, y0 + pli)
  ctx.lineTo(x0 + w, y0 + h)
  ctx.lineTo(x0, y0 + h)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = couleur
  ctx.lineWidth = tl ? tl.largeur : actif ? 1.3 : 0.8
  ctx.lineJoin = 'round'
  ctx.stroke()
  ctx.lineWidth = 0.6
  ctx.beginPath()
  ctx.moveTo(x0 + w - pli, y0)
  ctx.lineTo(x0 + w - pli, y0 + pli)
  ctx.lineTo(x0 + w, y0 + pli)
  ctx.stroke()
  if (epingle) {
    ctx.font = `italic 400 9.5px ${SERIF}`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = P.accent
    ctx.fillText('épinglée', x0 + w, y0 - 2)
  }
}

// ─── Survol ──────────────────────────────────────────────────────────────────

/** Élément sous le pointeur (écran), d'après la dernière image. */
export function cibleSous(etat: EtatRendu, x: number, y: number): Cible | null {
  // Contexte, renvois et alternatives d'abord (petits, au-dessus des nœuds voisins).
  for (let k = etat.cibles.length - 1; k >= 0; k--) {
    const c = etat.cibles[k]!
    if ((c.genre === 'pastille' || c.genre === 'impasse' || c.genre === 'renvoi') && x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) return c
  }
  for (let k = etat.cibles.length - 1; k >= 0; k--) {
    const c = etat.cibles[k]!
    if (x >= c.x0 - 2 && x <= c.x1 + 2 && y >= c.y0 - 2 && y <= c.y1 + 2) return c
  }
  return null
}
