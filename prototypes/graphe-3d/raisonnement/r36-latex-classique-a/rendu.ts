// R36 · Rendu « figure LaTeX » sur les calques canvas de la vue (le texte est dans composition.ts).
//
// - Dessous : figure (axe des rangs logiques avec pointe LaTeX et graduations, accolades des zones à la
//   TikZ `decorations.pathreplacing`), liaisons orthogonales au trait fin avec pointe « to » de TikZ,
//   jonctions en point plein, sous-systèmes dépliés (cadre mixte), liens sémantiques ; place la légende.
// - Dessus : cadres des blocs (rectangle simple ; double cadre pour un résultat ; copie décalée pour un
//   sous-système ; coins arrondis pour une hypothèse de modélisation), losanges de décision avec la sortie
//   non retenue (×), bornes de contexte, renvois « cf. 7 », repères d'hypothèses actives ; pose la
//   composition HTML de chaque bloc au même endroit.
// - Statut par le trait, comme dans R14 : plein = validé, tireté = à vérifier, barré = réfuté,
//   pointillé gris = piste abandonnée. Noir sur blanc, un seul bleu pour l'interaction.

import { rgba, type ContexteDessinR, type ValeurReglage, type VueRaisonnement } from '../../src/raisonnement'
import type { Composition } from './composition'
import { SERIF, SERIF_MATH, type Boite, type MiseEnPage } from './mise-en-page'
import { etatSquelette } from './squelette'

export interface PaletteR36 {
  encre: string
  gris: string
  trait: string
  surface: string
  surface2: string
  accent: string
}

export function lirePaletteR36(el: HTMLElement): PaletteR36 {
  const s = getComputedStyle(el)
  const v = (n: string, d: string) => s.getPropertyValue(n).trim() || d
  return {
    encre: v('--texte', '#000000'),
    gris: v('--texte-doux', '#666666'),
    trait: v('--arete', '#000000'),
    surface: v('--surface', '#ffffff'),
    surface2: v('--surface-2', '#f2f2f2'),
    accent: v('--accent', '#1c4fa0'),
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
  palette: PaletteR36
  cibles: Cible[]
  /** Élément survolé (déterminé par cibleSous). */
  survol: Cible | null
  /** Hypothèses épinglées (points) : leurs repères restent affichés sur les blocs dépendants. */
  epingles: Set<number>
  /** Hypothèses de modélisation présentes (point → repère « H1 »). */
  hypotheses: Map<number, string>
  /** Couche HTML des blocs (titres, formules). */
  composition: Composition | null
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

// ─── Primitives ──────────────────────────────────────────────────────────────

function polyligne(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]): void {
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k]!.x, pts[k]!.y)
}

/** Pointe « to » de TikZ (flèche par défaut de LaTeX) : deux barbes incurvées, tracées au trait. */
function pointe(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, t: number): void {
  const l = Math.hypot(dx, dy) || 1
  const ux = dx / l, uy = dy / l
  const px = -uy, py = ux
  const L = t * 2.1, H = t * 1.35
  ctx.beginPath()
  for (const sg of [1, -1]) {
    ctx.moveTo(x - ux * L + px * H * sg, y - uy * L + py * H * sg)
    ctx.quadraticCurveTo(x - ux * L * 0.3 + px * H * 0.15 * sg, y - uy * L * 0.3 + py * H * 0.15 * sg, x, y)
  }
  ctx.stroke()
}

/** Motif de trait selon le statut : plein (validé), tireté (à vérifier) ; réfuté = plein + barre. */
function motifStatut(statut: string): number[] {
  return statut === 'incertain' ? [4, 3] : []
}

/** Accolade horizontale (pointe vers le bas) de xa à xb, sous l'ordonnée y, profondeur h. */
function accolade(ctx: CanvasRenderingContext2D, xa: number, xb: number, y: number, h: number): void {
  const xm = (xa + xb) / 2
  const r = Math.min(h, (xb - xa) / 4)
  const ym = y + h / 2
  ctx.beginPath()
  ctx.moveTo(xa, y)
  ctx.quadraticCurveTo(xa, ym, xa + r, ym)
  ctx.lineTo(xm - r, ym)
  ctx.quadraticCurveTo(xm, ym, xm, y + h)
  ctx.quadraticCurveTo(xm, ym, xm + r, ym)
  ctx.lineTo(xb - r, ym)
  ctx.quadraticCurveTo(xb, ym, xb, y)
  ctx.stroke()
}

// ─── Calque « dessous » : figure, liaisons, jonctions ─────────────────────────

export function dessinerDessous(c: ContexteDessinR, etat: EtatRendu): void {
  const { ctx, vue } = c
  const page = etat.page
  if (!page || !page.boites.length) return
  const e = vue.extrusion
  const cam = vue.camera
  const E = page.echelle
  const monde = (x: number, y: number, yw = 0): [number, number, number] => [(x - page.cx) * E, yw, -(y - page.cy) * E]
  const s0 = cam.pixelsParUnite() * E

  // Figure : axe, accolades, légende (s'estompent en 3D).
  const alpha = Math.max(0, 1 - e * 1.6)
  if (alpha > 0.01) dessinerFigure(ctx, vue, etat, monde, s0, alpha)
  else etat.composition?.masquerLegende()

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
  const epaisseur = Math.max(0.7, Math.min(1, 0.85 * s0))
  const tPointe = Math.max(2.2, Math.min(3.4, 2.9 * s0))
  ctx.save()
  ctx.lineJoin = 'miter'
  ctx.lineCap = 'butt'
  for (const r of page.routes) {
    const a = g.aretes[r.arete]
    if (!a) continue
    const os = vue.opaciteAffichee[r.source]!, oc = vue.opaciteAffichee[r.cible]!
    let alphaR = Math.min(1, Math.max(0.12, Math.min(os, oc)) * 1.1)
    let couleur = P.trait
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
        // Amont : encre, trait renforcé ; aval : accent.
        couleur = ls === 1 || lc === 1 ? P.encre : P.accent
        alphaR = 1
        largeur = epaisseur + 0.7
      } else alphaR *= 0.35
    }
    if (actifs && !(actifs.has(r.source) && actifs.has(r.cible))) alphaR *= 0.3
    if (r.abandon) {
      couleur = P.gris
      ctx.setLineDash([1, 2.2])
    } else ctx.setLineDash([])
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
    ctx.strokeStyle = rgba(couleur, alphaR)
    ctx.lineWidth = largeur
    ctx.beginPath()
    polyligne(ctx, pts)
    ctx.stroke()
    ctx.setLineDash([])
    const z = pts[pts.length - 1]!, y = pts[pts.length - 2] ?? pts[0]!
    pointe(ctx, z.x, z.y, z.x - y.x, z.y - y.y, tPointe)
  }
  // Jonctions : point plein là où une sortie se divise (comme en schéma de circuit).
  if (!transition && e < 0.02) {
    ctx.fillStyle = rgba(P.trait, actifs || vue.ligneeActive ? 0.45 : 1)
    const rj = Math.max(1.4, Math.min(2.4, 2 * s0))
    for (const [x, y] of page.jonctions) {
      const q = cam.projeterPoint(monde(x, y))
      ctx.beginPath()
      ctx.arc(q.x, q.y, rj, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()

  // Décision → hypothèse dans la marge : trait vertical vers le bloc d'hypothèse.
  ctx.save()
  for (const l of page.liensMarge) {
    const pr = vue.projection
    const s = echelle(vue, page, l.source)
    const bc = page.boites[l.cible]!
    const xm = pr.x[l.cible]! - (bc.w / 2 - 10) * s
    const ya = pr.y[l.source]!, yb = pr.y[l.cible]! - (bc.h / 2) * s
    const xa = pr.x[l.source]! - 19 * s
    const op = Math.min(vue.opaciteAffichee[l.source]!, vue.opaciteAffichee[l.cible]!)
    ctx.strokeStyle = rgba(P.trait, 0.9 * op)
    ctx.lineWidth = epaisseur
    ctx.beginPath()
    polyligne(ctx, [{ x: xa, y: ya }, { x: xm, y: ya }, { x: xm, y: yb }])
    ctx.stroke()
    pointe(ctx, xm, yb, 0, 1, tPointe)
  }
  ctx.restore()

  if (lire<boolean>(vue, 'liensSemantiques')) dessinerLiensSemantiques(c, etat)
}

/**
 * Figure : axe des rangs logiques (graduations 0, 1, 2…, pointe LaTeX, « rang logique r »), accolades
 * des zones avec leur nom en italique, et légende « Figure 1 – … » sous la figure.
 */
function dessinerFigure(
  ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu,
  monde: (x: number, y: number) => [number, number, number], s0: number, alpha: number,
): void {
  const page = etat.page!
  const P = etat.palette
  const cam = vue.camera
  const b = page.bornes
  const W = page.largeurCarte
  const hg = cam.projeterPoint(monde(b.x0, b.y0))
  if (!hg.visible) return
  const X = (x: number) => hg.x + (x - b.x0) * s0
  const Y = (y: number) => hg.y + (y - b.y0) * s0
  const k = Math.min(1.25, s0)

  // Légende sous la figure : centrée, largeur d'un « \linewidth » raisonnable.
  const comp = etat.composition
  if (comp) {
    if (lire<boolean>(vue, 'legende')) {
      const larg = Math.min(900, Math.max(460, b.x1 - b.x0))
      const cx = (b.x0 + b.x1) / 2
      comp.placerLegende(X(cx - larg / 2), Y(b.y1 + 26), s0, larg, alpha)
    } else comp.masquerLegende()
  }
  if (!lire<boolean>(vue, 'axe')) return

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.lineCap = 'butt'
  // Axe : de la première colonne à la dernière, pointe à droite.
  const yA = b.y0 - 60
  const xDebut = (page.zones[0]?.x0 ?? b.x0) + 4
  const xFin = (page.xRangs.length ? page.xRangs[page.xRangs.length - 1]! + W / 2 : b.x1) + 26
  ctx.strokeStyle = P.encre
  ctx.fillStyle = P.encre
  ctx.lineWidth = Math.max(0.7, 0.8 * k)
  ctx.beginPath()
  ctx.moveTo(X(xDebut), Y(yA))
  ctx.lineTo(X(xFin), Y(yA))
  ctx.stroke()
  pointe(ctx, X(xFin), Y(yA), 1, 0, Math.max(2.4, 3 * k))
  // Graduations : une par rang (traversantes), repère 0, 1, 2… au-dessus.
  const taille = Math.max(8.5, 10.5 * k)
  ctx.font = `400 ${taille}px ${SERIF}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.beginPath()
  page.xRangs.forEach((x) => {
    ctx.moveTo(X(x), Y(yA) - 3 * k)
    ctx.lineTo(X(x), Y(yA) + 3 * k)
  })
  ctx.stroke()
  const pas = page.xRangs.length > 1 ? (page.xRangs[1]! - page.xRangs[0]!) * s0 : 100
  const saut = pas < taille * 2 ? Math.ceil((taille * 2) / pas) : 1
  page.xRangs.forEach((x, r) => {
    if (r % saut === 0) ctx.fillText(String(r), X(x), Y(yA) - 5 * k)
  })
  // Nom de l'axe : « rang logique r » (r en italique mathématique).
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const xt = X(xFin) + 6 * k
  ctx.font = `400 ${taille}px ${SERIF}`
  ctx.fillText('rang logique ', xt, Y(yA))
  const wt = ctx.measureText('rang logique ').width
  ctx.font = `italic 400 ${taille}px ${SERIF_MATH}`
  ctx.fillText('r', xt + wt, Y(yA))
  // Accolades des zones : nom en italique au-dessus, pointe vers les blocs.
  const yB = b.y0 - 34
  ctx.lineWidth = Math.max(0.6, 0.75 * k)
  ctx.font = `italic 400 ${taille}px ${SERIF}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  for (const z of page.zones) {
    const xa = X(z.x0 + 8), xb = X(z.x1 - 8)
    if (xb - xa < 12) continue
    accolade(ctx, xa, xb, Y(yB), 8 * k)
    const nom = z.nom
    if (ctx.measureText(nom).width < xb - xa) ctx.fillText(nom, (xa + xb) / 2, Y(yB) - 3 * k)
  }
  ctx.restore()
}

/** Sous-systèmes dépliés : cadre mixte (trait-point) autour de chaque bloc issu du dépliage. */
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
      ctx.setLineDash([7, 2.5, 1.5, 2.5])
      ctx.lineWidth = 0.8
      ctx.strokeRect(x - (l + 6) * s, y - (b.haut + 6) * s, (2 * l + 12) * s, (b.haut + b.bas + 10) * s)
      ctx.setLineDash([])
      if (j.noeuds[g.unites[p]!.conclusion]!.id === tete) {
        ctx.font = `italic 400 ${Math.max(8.5, 10 * s)}px ${SERIF}`
        ctx.textAlign = 'right'
        ctx.textBaseline = 'bottom'
        ctx.fillStyle = rgba(P.accent, op)
        ctx.fillText(`sous-système ouvert (${pts.length} blocs) — double-clic : refermer`, x + (l + 6) * s, y - (b.haut + 8) * s)
      }
    }
  }
  ctx.restore()
}

/** Contradictions, résolutions, abandons : crochets orthogonaux au-dessus des blocs, mot en italique. */
function dessinerLiensSemantiques({ ctx, vue }: ContexteDessinR, etat: EtatRendu): void {
  const j = vue.justification
  const P = etat.palette
  const page = etat.page!
  ctx.save()
  ctx.font = `italic 400 10px ${SERIF}`
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
      const my = Math.min(y1, y2) - Math.max(12, 16 * Math.min(sa, sb))
      ctx.strokeStyle = rgba(couleur, 0.85 * op)
      ctx.lineWidth = 0.8
      ctx.setLineDash(l.genre === 'contredit' ? [4, 3] : l.genre === 'resout' ? [] : [1, 2.2])
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
      ctx.fillRect(tx - w / 2, my - 6, w, 12)
      ctx.fillStyle = rgba(couleur, op)
      ctx.fillText(texte, tx, my + 0.5)
    }
  }
  ctx.restore()
}

// ─── Calque « dessus » : cadres, décisions, hypothèses ────────────────────────

export function dessinerDessus(c: ContexteDessinR, etat: EtatRendu): void {
  const { ctx, vue } = c
  const page = etat.page
  etat.cibles = []
  if (!page) return
  const P = etat.palette
  const pr = vue.projection
  const comp = etat.composition
  comp?.debutImage()
  comp?.definirCite(etat.survol?.genre === 'renvoi' ? etat.survol.point : null)
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
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r)
    ctx.strokeRect(x - r + 0.5, y - r + 0.5, 2 * r - 1, 2 * r - 1)
    if (s > 0.55) {
      ctx.font = `400 ${10.5 * Math.min(1.3, s)}px ${SERIF}`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = rgba(P.gris, pres)
      ctx.fillText(page.boites[p]!.lignes[0] ?? n.nom, x - 8 * s, y)
    }
    etat.cibles.push({ genre: 'masque', point: p, noeud: vue.indexNoeud(p), x0: x - 6, y0: y - 6, x1: x + 6, y1: y + 6 })
  }
  ctx.restore()

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
    const x = pr.x[p]!, y = pr.y[p]!
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s, s)
    ctx.globalAlpha = op
    // Repères des hypothèses actives dont ce bloc dépend (graphe complet).
    const tags: string[] = []
    for (const [q, ref] of etat.hypotheses) {
      if (q === p) continue
      if ((toujours || actifs.includes(q)) && page.portees.get(q)?.includes(p)) tags.push(ref)
    }
    if (b.genre === 'drapeau') dessinerHypothese(ctx, vue, etat, p, b)
    else if (b.genre === 'decision') dessinerDecision(ctx, vue, etat, p, b, tags)
    else dessinerBloc(ctx, vue, etat, p, b, tags)
    ctx.restore()
    comp?.placer(p, x, y, s, op, b.w, b.haut)
    // Cibles (écran).
    if (b.genre === 'decision') {
      const l = Math.max(19, b.w / 2)
      etat.cibles.push({ genre: 'carte', point: p, noeud: -1, x0: x - l * s, y0: y - b.haut * s, x1: x + l * s, y1: y + 22 * s })
      if (b.impasse && lire<boolean>(vue, 'impasses')) etat.cibles.push({ genre: 'impasse', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y + 22 * s, x1: x + (b.w / 2) * s, y1: y + 48 * s })
    } else if (b.genre === 'drapeau') etat.cibles.push({ genre: 'drapeau', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y - (b.h / 2) * s, x1: x + (b.w / 2) * s, y1: y + (b.h / 2) * s })
    else etat.cibles.push({ genre: 'carte', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y - (b.h / 2) * s, x1: x + (b.w / 2) * s, y1: y + (b.h / 2) * s })
    const y0 = yPastilles(b)
    for (const it of rangee(vue, b)) {
      const cx = x + it.x * s, cy = y + y0 * s
      if (it.renvoi >= 0) etat.cibles.push({ genre: 'renvoi', point: it.renvoi, noeud: -1, x0: cx - 14 * s, y0: cy - 7 * s, x1: cx + 14 * s, y1: cy + 7 * s })
      else etat.cibles.push({ genre: 'pastille', point: p, noeud: it.noeud, x0: cx - 7 * s, y0: cy - 7 * s, x1: cx + 7 * s, y1: cy + 7 * s })
    }
  }
  comp?.finImage()
}

/** Ordonnée (relative au point d'ancrage) de la rangée de bornes. */
function yPastilles(b: Boite): number {
  if (b.genre === 'decision') return 19 + (b.impasse ? 30 : 4) + 8
  return b.h / 2 + 11
}

/** Trait selon la lignée ou le survol ; null sinon. */
function traitLignee(vue: VueRaisonnement, etat: EtatRendu, p: number): { couleur: string; largeur: number } | null {
  const P = etat.palette
  if (vue.ligneeActive) {
    const l = vue.lignee[p]!
    if (l === 3) return { couleur: P.accent, largeur: 1.9 }
    if (l === 1) return { couleur: P.encre, largeur: 1.6 }
    if (l === 2) return { couleur: P.accent, largeur: 1.4 }
  }
  if (vue.survol === p) return { couleur: P.accent, largeur: 1.5 }
  return null
}

/** Rangée sous le bloc : renvois puis bornes de contexte (abscisses relatives). */
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
  ctx.textBaseline = 'middle'
  // Renvois : « cf. 7 », comme une référence croisée (\ref) ; souligné au survol.
  ctx.font = `400 10px ${SERIF}`
  ctx.textAlign = 'center'
  for (const it of items) {
    if (it.renvoi < 0) continue
    const ref = etat.page?.boites[it.renvoi]?.ref ?? '?'
    const allume = sv?.genre === 'renvoi' && sv.point === it.renvoi
    const t = `cf. ${ref}`
    ctx.fillStyle = allume ? P.accent : P.encre
    ctx.fillText(t, it.x, y + 0.5)
    if (allume) {
      const w = ctx.measureText(t).width
      ctx.fillRect(it.x - w / 2, y + 6, w, 0.8)
    }
  }
  // Bornes de contexte : lettre encadrée (\fbox), comme une note marginale.
  ctx.font = `400 8.5px ${SERIF}`
  const bornes = items.filter((it) => it.renvoi < 0)
  bornes.forEach((it, k) => {
    const pa = b.pastilles[k]!
    const allume = sv?.genre === 'pastille' && sv.noeud === pa.noeud
    const x = it.x
    ctx.fillStyle = allume ? P.accent : P.surface
    ctx.fillRect(x - 5, y - 5, 10, 10)
    ctx.strokeStyle = allume ? P.accent : rgba(P.encre, 0.7)
    ctx.lineWidth = 0.6
    ctx.strokeRect(x - 5, y - 5, 10, 10)
    ctx.fillStyle = allume ? P.surface : P.encre
    ctx.fillText(pa.lettre, x, y + 0.5)
  })
  if (b.plus) {
    ctx.fillStyle = P.gris
    ctx.font = `400 9px ${SERIF}`
    ctx.textAlign = 'left'
    const dernier = items[items.length - 1]!
    ctx.fillText(`+${b.plus}`, dernier.x + 8, y + 0.5)
  }
}

/** Hypothèses actives dont dépend le bloc, au-dessus du coin haut droit : « sous H1, H3 ». */
function dessinerTags(ctx: CanvasRenderingContext2D, etat: EtatRendu, tags: string[], xDroite: number, yHaut: number): void {
  if (!tags.length) return
  ctx.font = `italic 400 10px ${SERIF}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = etat.palette.accent
  ctx.fillText(`sous ${tags.join(', ')}`, xDroite, yHaut - 2)
}

function dessinerBloc(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, tags: string[]): void {
  const P = etat.palette
  const n = vue.noeud(p)
  const w = b.w, h = b.h
  const x0 = -w / 2, y0 = -h / 2
  const majeur = b.genre === 'majeur'
  const sousSysteme = b.genre === 'etape' || (vue.lecture.unites[p]?.membres.length ?? 1) > 1
  const tl = traitLignee(vue, etat, p)
  const couleurTrait = tl ? tl.couleur : b.abandon ? P.gris : tags.length ? P.accent : P.encre
  const largeurTrait = tl ? tl.largeur : 0.8
  const motif = b.abandon ? [1, 2] : motifStatut(n.statut)
  // Sous-système : copie décalée derrière (copy shadow de TikZ).
  if (sousSysteme) {
    ctx.fillStyle = P.surface
    ctx.fillRect(x0 + 3, y0 - 3, w, h)
    ctx.strokeStyle = rgba(b.abandon ? P.gris : P.encre, 0.6)
    ctx.lineWidth = 0.7
    ctx.setLineDash(motif)
    ctx.strokeRect(x0 + 3, y0 - 3, w, h)
    ctx.setLineDash([])
  }
  ctx.fillStyle = P.surface
  ctx.fillRect(x0, y0, w, h)
  ctx.strokeStyle = couleurTrait
  ctx.lineWidth = largeurTrait
  ctx.setLineDash(motif)
  ctx.strokeRect(x0, y0, w, h)
  // Résultat : double cadre (style `double` de TikZ), écart 2 px.
  if (majeur) {
    ctx.lineWidth = tl ? Math.max(0.8, tl.largeur - 0.6) : 0.8
    ctx.strokeRect(x0 + 2.5, y0 + 2.5, w - 5, h - 5)
  }
  ctx.setLineDash([])
  // Réfuté : barré d'une diagonale.
  if (n.statut === 'refute' && !b.abandon) {
    ctx.strokeStyle = rgba(couleurTrait, 0.55)
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(x0, y0 + h)
    ctx.lineTo(x0 + w, y0)
    ctx.stroke()
  }
  dessinerRangee(ctx, vue, etat, b)
  dessinerTags(ctx, etat, tags, x0 + w, y0 - (sousSysteme ? 3 : 0))
}

function dessinerDecision(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, tags: string[]): void {
  const P = etat.palette
  const tl = traitLignee(vue, etat, p)
  dessinerTags(ctx, etat, tags, b.w / 2, -b.haut)
  // Alternative non retenue : sortie non connectée (×) ; le libellé est dans la composition.
  if (b.impasse && lire<boolean>(vue, 'impasses')) {
    ctx.strokeStyle = P.gris
    ctx.lineWidth = 0.8
    ctx.setLineDash([2, 2])
    ctx.beginPath()
    ctx.moveTo(0, 19)
    ctx.lineTo(0, 27)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(-3, 26)
    ctx.lineTo(3, 32)
    ctx.moveTo(3, 26)
    ctx.lineTo(-3, 32)
    ctx.stroke()
  }
  // Losange (forme `diamond` de TikZ), numéro D1 au centre.
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
  ctx.stroke()
  ctx.fillStyle = tl ? tl.couleur : P.encre
  ctx.font = `400 11px ${SERIF}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(b.ref, 0, 0.5)
  dessinerRangee(ctx, vue, etat, b)
}

/** Hypothèse de modélisation : cadre à coins arrondis ; « épinglée » en italique au-dessus. */
function dessinerHypothese(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite): void {
  const P = etat.palette
  const epingle = etat.epingles.has(p)
  const actif = epingle || (etat.survol?.genre === 'drapeau' && etat.survol.point === p)
  const w = b.w, h = b.h
  const x0 = -w / 2, y0 = -h / 2
  const tl = traitLignee(vue, etat, p)
  ctx.beginPath()
  ctx.roundRect(x0, y0, w, h, 5)
  ctx.fillStyle = P.surface
  ctx.fill()
  ctx.strokeStyle = tl ? tl.couleur : actif ? P.accent : P.encre
  ctx.lineWidth = tl ? tl.largeur : actif ? 1.3 : 0.8
  ctx.stroke()
  if (epingle) {
    ctx.font = `italic 400 10px ${SERIF}`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = P.accent
    ctx.fillText('épinglée', x0 + w, y0 - 2)
  }
}

// ─── Survol ──────────────────────────────────────────────────────────────────

/** Élément sous le pointeur (écran), d'après la dernière image. */
export function cibleSous(etat: EtatRendu, x: number, y: number): Cible | null {
  // Bornes, renvois et alternatives d'abord (petits, au-dessus des blocs voisins).
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
