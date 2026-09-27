// R34 · Rendu : calques canvas de la vue + calque HTML des boîtes (boites.ts).
//
// - Dessous (canvas) : en-tête des rangs façon booktabs (\toprule, noms de zones en petites capitales avec
//   \cmidrule, rangs, \midrule), cadres englobants des sous-problèmes (tcolorbox « enhanced, attach boxed
//   title », gris neutre, fond black!2 ; piste abandonnée : cadre tireté), sous-arguments dépliés,
//   liaisons orthogonales fines de R14, jonctions en point plein, liens sémantiques.
// - Dessus (canvas) : nœuds masqués (contexte pur, touche L) ; puis le calque HTML des boîtes est posé.
// Pas de couleur d'accent : survol et lignée par l'épaisseur du trait et l'atténuation du reste ; les
// liaisons du bloc survolé prennent la couleur de sa famille.

import { rgba, type ContexteDessinR, type ValeurReglage, type VueRaisonnement } from '../../src/raisonnement'
import type { CalqueBoites } from './boites'
import { FAMILLES, familleDe } from './familles'
import type { Boite, MiseEnPage } from './mise-en-page'
import { etatSquelette } from './squelette'

/** Police des textes composés sur canvas (chargée par style.css). */
export const LM = `'LM Roman 10', 'Latin Modern Roman', 'CMU Serif', 'Computer Modern', Georgia, serif`

export interface PaletteR34 {
  encre: string
  gris: string
  trait: string
  surface: string
  surface2: string
  cadre: string
}

export function lirePaletteR34(el: HTMLElement): PaletteR34 {
  const s = getComputedStyle(el)
  const v = (n: string, d: string) => s.getPropertyValue(n).trim() || d
  return {
    encre: v('--texte', '#1a1a1a'),
    gris: v('--texte-doux', '#666666'),
    trait: v('--arete', '#4d4d4d'),
    surface: v('--surface', '#ffffff'),
    surface2: v('--surface-2', '#f5f5f5'),
    cadre: v('--r34-cadre', '#737373'),
  }
}

/** Élément interactif de la dernière image (pour le survol). */
export interface Cible {
  genre: 'carte' | 'pastille' | 'renvoi' | 'drapeau' | 'masque'
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
  palette: PaletteR34
  calque: CalqueBoites | null
  cibles: Cible[]
  survol: Cible | null
  /** Hypothèses épinglées (points). */
  epingles: Set<number>
  /** Hypothèses de modélisation présentes (point → « (H1) »). */
  hypotheses: Map<number, string>
}

const lire = <T extends ValeurReglage>(vue: VueRaisonnement, cle: string) => vue.reglages.lire<T>(cle)

/** Écran : px par px de mise en page au point p. */
function echelle(vue: VueRaisonnement, page: MiseEnPage, p: number): number {
  return vue.camera.pixelsParUnite() * (vue.projection.echelle[p] || 1) * page.echelle
}

/** Hypothèses (points) actives : survolée + épinglées. */
export function choixActifs(etat: EtatRendu): number[] {
  const r = [...etat.epingles]
  const s = etat.survol
  if (s && s.genre === 'drapeau' && !etat.epingles.has(s.point)) r.push(s.point)
  return r
}

/** Points qui dépendent d'au moins une hypothèse active (pour atténuer le reste). */
export function dependantsActifs(etat: EtatRendu): Set<number> | null {
  const page = etat.page
  if (!page) return null
  const actifs = choixActifs(etat)
  if (!actifs.length) return null
  const s = new Set<number>(actifs)
  for (const c of actifs) for (const q of page.portees.get(c) ?? []) s.add(q)
  return s
}

// ─── Primitives ──────────────────────────────────────────────────────────────

function polyligne(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]): void {
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k]!.x, pts[k]!.y)
}

/** Pointe « latex » de TikZ : triangle plein, légèrement effilé. */
function pointe(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, t: number): void {
  const l = Math.hypot(dx, dy) || 1
  const ux = dx / l, uy = dy / l
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.quadraticCurveTo(x - ux * t * 1.2 - uy * t * 0.2, y - uy * t * 1.2 + ux * t * 0.2, x - ux * t * 2.1 - uy * t * 0.7, y - uy * t * 2.1 + ux * t * 0.7)
  ctx.lineTo(x - ux * t * 2.1 + uy * t * 0.7, y - uy * t * 2.1 - ux * t * 0.7)
  ctx.quadraticCurveTo(x - ux * t * 1.2 + uy * t * 0.2, y - uy * t * 1.2 - ux * t * 0.2, x, y)
  ctx.closePath()
  ctx.fill()
}

/** Rectangle à coins arrondis (arc de tcolorbox). */
function rectArrondi(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const q = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + q, y)
  ctx.arcTo(x + w, y, x + w, y + h, q)
  ctx.arcTo(x + w, y + h, x, y + h, q)
  ctx.arcTo(x, y + h, x, y, q)
  ctx.arcTo(x, y, x + w, y, q)
  ctx.closePath()
}

// ─── Calque « dessous » ──────────────────────────────────────────────────────

export function dessinerDessous(c: ContexteDessinR, etat: EtatRendu): void {
  const { ctx, vue } = c
  const page = etat.page
  if (!page || !page.boites.length) return
  const e = vue.extrusion
  const cam = vue.camera
  const E = page.echelle
  const monde = (x: number, y: number, yw = 0): [number, number, number] => [(x - page.cx) * E, yw, -(y - page.cy) * E]
  const s0 = cam.pixelsParUnite() * E

  // Page : en-tête des rangs et cadres (s'estompent en 3D).
  const alpha = Math.max(0, 1 - e * 1.6)
  if (alpha > 0.01) {
    if (lire<boolean>(vue, 'enTetes')) dessinerEnTete(ctx, vue, etat, monde, s0, alpha)
    if (lire<boolean>(vue, 'cadres')) dessinerCadres(ctx, vue, etat, monde, s0, alpha)
  }
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
  const actifs = dependantsActifs(etat)
  const survol = vue.survol
  const g = vue.lecture
  const epaisseur = Math.max(0.7, Math.min(1.15, 1 * s0))
  ctx.save()
  ctx.lineJoin = 'miter'
  ctx.lineCap = 'butt'
  for (const r of page.routes) {
    const a = g.aretes[r.arete]
    if (!a) continue
    const os = vue.opaciteAffichee[r.source]!, oc = vue.opaciteAffichee[r.cible]!
    let alphaR = Math.min(1, Math.max(0.12, Math.min(os, oc)) * 1.1) * 0.9
    let couleur = P.trait
    let largeur = epaisseur
    if (survol !== null && (r.source === survol || r.cible === survol)) {
      couleur = FAMILLES[familleDe(vue.noeud(survol))].cadre
      alphaR = 1
      largeur = epaisseur + 0.7
    }
    if (vue.ligneeActive) {
      const ls = vue.lignee[r.source]!, lc = vue.lignee[r.cible]!
      const dans = ls > 0 && lc > 0 && !(ls === 2 && lc === 1) && !(ls === 1 && lc === 2) && !(ls === 3 && lc === 1) && !(ls === 2 && lc === 3)
      if (dans) {
        couleur = P.encre
        alphaR = 1
        largeur = epaisseur + 0.9
      } else alphaR *= 0.35
    }
    if (actifs && !(actifs.has(r.source) && actifs.has(r.cible))) alphaR *= 0.3
    if (r.abandon) {
      couleur = P.gris
      ctx.setLineDash([1.5, 2.5])
    } else ctx.setLineDash([])
    const bs = page.boites[r.source]!, bc = page.boites[r.cible]!
    let pts: { x: number; y: number }[]
    if (transition) {
      const pr = vue.projection
      const ss = echelle(vue, page, r.source), sc = echelle(vue, page, r.cible)
      const xa = pr.x[r.source]! + (bs.w / 2) * ss, ya = pr.y[r.source]!
      const xb = pr.x[r.cible]! - (bc.w / 2) * sc, yb = pr.y[r.cible]!
      const xm = (xa + xb) / 2
      pts = [{ x: xa, y: ya }, { x: xm, y: ya }, { x: xm, y: yb }, { x: xb, y: yb }]
    } else if (e > 0.02) {
      const y0 = pos[r.source * 3 + 1]!, y1 = pos[r.cible * 3 + 1]!
      const n = r.points.length
      pts = r.points.map(([x, y], k) => cam.projeterPoint(monde(x, y, y0 + (y1 - y0) * (n > 1 ? k / (n - 1) : 0))))
    } else pts = r.points.map(([x, y]) => cam.projeterPoint(monde(x, y)))
    ctx.strokeStyle = rgba(couleur, alphaR)
    ctx.lineWidth = largeur
    ctx.beginPath()
    polyligne(ctx, pts)
    ctx.stroke()
    ctx.setLineDash([])
    const z = pts[pts.length - 1]!, y = pts[pts.length - 2] ?? pts[0]!
    ctx.fillStyle = rgba(couleur, alphaR)
    pointe(ctx, z.x, z.y, z.x - y.x, z.y - y.y, Math.max(2.2, Math.min(3.4, 3 * s0)))
  }
  if (!transition && e < 0.02) {
    ctx.fillStyle = rgba(P.trait, actifs || vue.ligneeActive ? 0.45 : 0.95)
    const rj = Math.max(1.5, Math.min(2.6, 2.2 * s0))
    for (const [x, y] of page.jonctions) {
      const q = cam.projeterPoint(monde(x, y))
      ctx.beginPath()
      ctx.arc(q.x, q.y, rj, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()

  // Décision → hypothèse dans la marge : trait vertical vers la boîte de l'hypothèse.
  ctx.save()
  for (const l of page.liensMarge) {
    const pr = vue.projection
    const s = echelle(vue, page, l.cible)
    const bs = page.boites[l.source]!, bc = page.boites[l.cible]!
    const xm = pr.x[l.cible]! - (bc.w / 2 - 18) * s
    const ya = pr.y[l.source]! + bs.bas * s, yb = pr.y[l.cible]! - bc.haut * s
    const op = Math.min(vue.opaciteAffichee[l.source]!, vue.opaciteAffichee[l.cible]!)
    ctx.strokeStyle = rgba(P.trait, 0.9 * op)
    ctx.fillStyle = rgba(P.trait, 0.9 * op)
    ctx.lineWidth = epaisseur
    ctx.beginPath()
    ctx.moveTo(xm, ya)
    ctx.lineTo(xm, yb)
    ctx.stroke()
    pointe(ctx, xm, yb, 0, 1, 3)
  }
  ctx.restore()

  if (lire<boolean>(vue, 'liensSemantiques')) dessinerLiensSemantiques(c, etat)
}

/**
 * En-tête des rangs, comme un tableau booktabs : \toprule, noms de zones en petites capitales avec un
 * \cmidrule sous chacun, repères de rangs, \midrule.
 */
function dessinerEnTete(
  ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu,
  monde: (x: number, y: number) => [number, number, number], s0: number, alpha: number,
): void {
  const page = etat.page!
  const P = etat.palette
  const b = page.bornes
  const cam = vue.camera
  const hg = cam.projeterPoint(monde(b.x0, b.y0)), bd = cam.projeterPoint(monde(b.x1, b.y1))
  if (!hg.visible || !bd.visible) return
  const X = (x: number) => hg.x + (x - b.x0) * s0
  const Y = (y: number) => hg.y + (y - b.y0) * s0
  const t = Math.max(9, Math.min(15, 12.5 * s0))
  ctx.save()
  const regle = (y: number, x0: number, x1: number, l: number) => {
    ctx.lineWidth = l
    ctx.beginPath()
    ctx.moveTo(X(x0), Math.round(Y(y)) + 0.5)
    ctx.lineTo(X(x1), Math.round(Y(y)) + 0.5)
    ctx.stroke()
  }
  ctx.strokeStyle = rgba(P.encre, 0.9 * alpha)
  regle(b.y0 - 70, b.x0, b.x1, 1.1)
  regle(b.y0 - 20, b.x0, b.x1, 0.6)
  // Zones.
  ctx.fillStyle = rgba(P.encre, alpha)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `${t}px ${LM}`
  ctx.fontVariantCaps = 'small-caps'
  for (const z of page.zones) {
    const xm = X((z.x0 + z.x1) / 2)
    if ((z.x1 - z.x0) * s0 > ctx.measureText(z.nom).width + 8) ctx.fillText(z.nom, xm, Y(b.y0 - 52))
    ctx.strokeStyle = rgba(P.encre, 0.75 * alpha)
    regle(b.y0 - 46, z.x0 + 8, z.x1 - 8, 0.5)
  }
  // Rangs.
  ctx.font = `italic ${t * 0.88}px ${LM}`
  ctx.fontVariantCaps = 'normal'
  ctx.fillStyle = rgba(P.gris, alpha)
  const reperes: [number, string][] = page.xRangs.map((x, r) => [x, `rang ${r}`])
  if (page.zones[0]?.nom === 'Hypothèses') reperes.unshift([page.xMarge, 'marge'])
  for (const [x, texte] of reperes) ctx.fillText(texte, X(x), Y(b.y0 - 29))
  ctx.restore()
}

/** Cadres englobants (tcolorbox « Comment ») : titre en surimpression sur le filet du haut. */
function dessinerCadres(
  ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu,
  monde: (x: number, y: number) => [number, number, number], s0: number, alpha: number,
): void {
  const page = etat.page!
  const P = etat.palette
  const cam = vue.camera
  const t = Math.max(8.5, Math.min(14, 11.5 * s0))
  ctx.save()
  for (const c of page.cadres) {
    const a = cam.projeterPoint(monde(c.x0, c.y0)), b = cam.projeterPoint(monde(c.x1, c.y1))
    if (!a.visible || !b.visible) continue
    const w = b.x - a.x, h = b.y - a.y
    // colframe = black!55, colback = black!2 ; piste abandonnée : black!50 tireté.
    const couleur = c.abandon ? P.gris : P.cadre
    rectArrondi(ctx, a.x, a.y, w, h, 4 * s0)
    ctx.fillStyle = rgba(c.abandon ? '#fcfcfc' : '#fafafa', alpha)
    ctx.fill()
    ctx.strokeStyle = rgba(couleur, 0.95 * alpha)
    ctx.lineWidth = Math.max(0.7, Math.min(1.2, 1 * s0))
    ctx.setLineDash(c.abandon ? [5, 3] : [])
    ctx.stroke()
    ctx.setLineDash([])
    // Titre attaché (boxed title) : boîte blanche au trait du cadre, centrée sur le filet supérieur.
    ctx.font = `${t}px ${LM}`
    const texte = c.nom
    const tw = ctx.measureText(texte).width
    const hb = t * 1.55, xb = a.x + 12 * s0, yb = a.y - hb / 2
    const wb = Math.min(tw + t * 1.1, Math.max(0, w - 24 * s0))
    if (wb < t * 2) continue
    rectArrondi(ctx, xb, yb, wb, hb, 2.5 * s0)
    ctx.fillStyle = rgba(P.surface, alpha)
    ctx.fill()
    ctx.strokeStyle = rgba(couleur, 0.95 * alpha)
    ctx.stroke()
    ctx.fillStyle = rgba(c.abandon ? P.gris : P.encre, alpha)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    let affiche = texte
    while (affiche.length > 3 && ctx.measureText(affiche).width > wb - t * 1.1) affiche = affiche.slice(0, -1)
    if (affiche !== texte) affiche = affiche.trimEnd() + '…'
    ctx.fillText(affiche, xb + t * 0.55, yb + hb / 2 + 0.5)
  }
  ctx.restore()
}

/** Sous-arguments dépliés : cadre trait-point autour de chaque boîte issue du dépliage. */
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
      ctx.strokeStyle = rgba(P.gris, 0.9 * op)
      ctx.setLineDash([9, 3, 2, 3])
      ctx.lineWidth = 0.9
      rectArrondi(ctx, x - (b.w / 2 + 6) * s, y - (b.haut + 6) * s, (b.w + 12) * s, (b.haut + b.bas + 12) * s, 5 * s)
      ctx.stroke()
      ctx.setLineDash([])
      if (j.noeuds[g.unites[p]!.conclusion]!.id === tete) {
        ctx.font = `italic ${Math.max(9, 10.5 * s)}px ${LM}`
        ctx.textAlign = 'right'
        ctx.textBaseline = 'bottom'
        ctx.fillStyle = rgba(P.gris, op)
        ctx.fillText(`démonstration dépliée (${pts.length}) — double-clic : replier`, x + (b.w / 2 + 6) * s, y - (b.haut + 8) * s)
      }
    }
  }
  ctx.restore()
}

/** Contradictions, résolutions, abandons : crochets orthogonaux au-dessus des boîtes. */
function dessinerLiensSemantiques({ ctx, vue }: ContexteDessinR, etat: EtatRendu): void {
  const j = vue.justification
  const P = etat.palette
  const page = etat.page!
  ctx.save()
  ctx.font = `italic 10.5px ${LM}`
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
      const couleur = l.genre === 'contredit' ? FAMILLES.resultat.cadre : l.genre === 'resout' ? FAMILLES.observation.cadre : P.gris
      const pr = vue.projection
      const sa = echelle(vue, page, a), sb = echelle(vue, page, b)
      const x1 = pr.x[a]! + 18 * sa, y1 = pr.y[a]! - page.boites[a]!.haut * sa
      const x2 = pr.x[b]! - 18 * sb, y2 = pr.y[b]! - page.boites[b]!.haut * sb
      const my = Math.min(y1, y2) - Math.max(12, 16 * Math.min(sa, sb))
      ctx.strokeStyle = rgba(couleur, 0.85 * op)
      ctx.lineWidth = 0.9
      ctx.setLineDash(l.genre === 'contredit' ? [6, 3] : l.genre === 'resout' ? [] : [1.5, 2.5])
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x1, my)
      ctx.lineTo(x2, my)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      ctx.setLineDash([])
      const texte = l.genre === 'contredit' ? 'contredit' : l.genre === 'resout' ? 'résout' : l.genre === 'abandonne' ? 'abandonne' : 'remplace'
      const tx = (x1 + x2) / 2
      const w = ctx.measureText(texte).width + 8
      ctx.fillStyle = rgba(P.surface, op)
      ctx.fillRect(tx - w / 2, my - 7, w, 14)
      ctx.fillStyle = rgba(couleur, op)
      ctx.fillText(texte, tx, my + 0.5)
    }
  }
  ctx.restore()
}

// ─── Calque « dessus » : masqués, puis boîtes HTML et cibles ──────────────────

export function dessinerDessus(c: ContexteDessinR, etat: EtatRendu): void {
  const { ctx, vue } = c
  const page = etat.page
  etat.cibles = []
  if (!page) return
  const P = etat.palette
  const pr = vue.projection
  // Masqués (contexte pur) : petits carrés, visibles avec les liens complets.
  ctx.save()
  for (let p = vue.nU; p < vue.nP; p++) {
    const pres = vue.presence[p]!
    if (pres < 0.05 || !pr.visible[p]) continue
    const s = echelle(vue, page, p)
    const x = pr.x[p]!, y = pr.y[p]!
    const r = 3.2 * Math.min(1.4, s)
    ctx.fillStyle = rgba(P.surface, pres)
    ctx.strokeStyle = rgba(P.gris, pres)
    ctx.lineWidth = 1
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r)
    ctx.strokeRect(x - r + 0.5, y - r + 0.5, 2 * r - 1, 2 * r - 1)
    if (s > 0.55) {
      ctx.font = `${11 * Math.min(1.3, s)}px ${LM}`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = rgba(P.gris, pres)
      ctx.fillText(page.boites[p]!.lignes[0] ?? vue.noeud(p).nom, x - 8 * s, y)
    }
    etat.cibles.push({ genre: 'masque', point: p, noeud: vue.indexNoeud(p), x0: x - 6, y0: y - 6, x1: x + 6, y1: y + 6 })
  }
  ctx.restore()

  const calque = etat.calque
  if (!calque) return
  const actifs = choixActifs(etat)
  const toujours = lire<string>(vue, 'bandesChoix') === 'toujours'
  const sv = etat.survol
  calque.positionner(vue, page, (p) => {
    let classes = ''
    if (vue.survol === p) classes += ' r34-survol'
    const l = vue.ligneeActive ? vue.lignee[p]! : 0
    if (l === 3) classes += ' r34-selection'
    else if (l === 1) classes += ' r34-amont'
    else if (l === 2) classes += ' r34-aval'
    if (sv?.genre === 'renvoi' && sv.point === p) classes += ' r34-cite'
    if (actifs.includes(p)) classes += ' r34-actif'
    if (etat.epingles.has(p)) classes += ' r34-epingle'
    const tags: string[] = []
    for (const [q, ref] of etat.hypotheses) {
      if (q !== p && (toujours || actifs.includes(q)) && page.portees.get(q)?.includes(p)) tags.push(ref)
    }
    return { classes, tags: tags.length ? `⊢ ${tags.join(' ')}` : '', z: vue.survol === p ? 5 : l > 0 ? 3 : 1 }
  })
  // Cibles (écran) : boîtes, puis renvois et bornes de la partie basse.
  for (let p = 0; p < vue.nU; p++) {
    const b: Boite = page.boites[p]!
    if (!pr.visible[p] || vue.opaciteAffichee[p]! < 0.02) continue
    const s = echelle(vue, page, p)
    const x0 = pr.x[p]! - (b.w / 2) * s, y0 = pr.y[p]! - (b.h / 2) * s
    etat.cibles.push({ genre: b.genre === 'drapeau' ? 'drapeau' : 'carte', point: p, noeud: -1, x0, y0, x1: x0 + b.w * s, y1: y0 + b.h * s })
    for (const pu of calque.puces[p] ?? []) {
      const c = { x0: x0 + pu.x * s, y0: y0 + pu.y * s, x1: x0 + (pu.x + pu.w) * s, y1: y0 + (pu.y + pu.h) * s }
      if (pu.genre === 'renvoi') {
        const q = b.renvois[pu.k]
        if (q !== undefined) etat.cibles.push({ genre: 'renvoi', point: q, noeud: -1, ...c })
      } else {
        const pa = b.pastilles[pu.k]
        if (pa) etat.cibles.push({ genre: 'pastille', point: p, noeud: pa.noeud, ...c })
      }
    }
  }
}

// ─── Survol ──────────────────────────────────────────────────────────────────

/** Élément sous le pointeur (écran), d'après la dernière image. */
export function cibleSous(etat: EtatRendu, x: number, y: number): Cible | null {
  // Renvois et bornes d'abord (petits, dans les boîtes).
  for (let k = etat.cibles.length - 1; k >= 0; k--) {
    const c = etat.cibles[k]!
    if ((c.genre === 'pastille' || c.genre === 'renvoi') && x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) return c
  }
  // Boîtes : la plus en avant (survol, lignée) d'abord.
  let meilleure: Cible | null = null
  for (let k = etat.cibles.length - 1; k >= 0; k--) {
    const c = etat.cibles[k]!
    if (x >= c.x0 - 2 && x <= c.x1 + 2 && y >= c.y0 - 2 && y <= c.y1 + 2) {
      meilleure ??= c
    }
  }
  return meilleure
}
