// R42 · Rendu sur les calques canvas de la vue (le texte complet des blocs est dans composition.ts).
//
// - Dessous : figure de R36 (axe des rangs logiques, accolades des zones, légende « Figure 1 – … »),
//   boîtes de sous-problèmes de R18 (rectangle teinté translucide, barre de titre colorée ; imbriquées ;
//   piste abandonnée hachurée et tiretée), barre de titre cliquable de R19 (▾ réduire / ▸ déployer,
//   « ouvrir ↗ »), liaisons orthogonales au trait fin avec pointe « to » de TikZ, jonctions.
// - Dessus : blocs (R36 : statut par le trait, double cadre pour un résultat, copie décalée pour un
//   sous-système, coins arrondis pour une hypothèse), losanges de décision, nœuds-fonctions (R19, en
//   noir sur blanc), graphiques clés (R35), bornes, renvois « cf. 7 », repères « sous (i) ».
//
// Niveaux de détail selon l'échelle s (px d'écran par px de mise en page), seuils réglables :
//   s < seuilPoint                 → POINT : chaque bloc est un petit carré de la couleur de sa boîte ;
//                                    ni texte, ni KaTeX, ni pointes, ni légende.
//   seuilPoint ≤ s < seuilComplet  → TITRE : cadres et statut, numéro et titre au canevas (sans KaTeX).
//   s ≥ seuilComplet               → COMPLET : composition HTML (formule KaTeX, confiance), graphiques.
// Un bloc hors de l'écran n'est ni dessiné ni composé. Passage d'un niveau à l'autre sans animation.

import { rgba, type ContexteDessinR, type ValeurReglage, type VueRaisonnement } from '../../src/raisonnement'
import type { Composition } from './composition'
import { SERIF, SERIF_MATH } from './formules'
import { dessinerFigure, geometrieFigure, type Figure } from './graphiques'
import { agreger, resultatDe } from './groupes'
import { BOITE, ECART_FIGURE, PIED_FONCTION, typeDe, type Boite, type Commentaire, type MiseEnPage } from './mise-en-page'
import { etatSquelette } from './squelette'

export interface PaletteR42 {
  encre: string
  gris: string
  trait: string
  surface: string
  surface2: string
  accent: string
}

export function lirePaletteR42(el: HTMLElement): PaletteR42 {
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

export type NiveauDetail = 'point' | 'titre' | 'complet'

/** Élément interactif dessiné à la dernière image (pour le survol). */
export interface Cible {
  genre: 'carte' | 'pastille' | 'renvoi' | 'drapeau' | 'impasse' | 'masque' | 'titre' | 'ouvrir'
  point: number
  /** Nœud de justification (pastille). */
  noeud: number
  /** Boîte (barre de titre). */
  groupe?: string
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface FigurePlacee {
  fig: Figure
  etiquette: string
  legende: string
}

export interface EtatRendu {
  page: MiseEnPage | null
  palette: PaletteR42
  cibles: Cible[]
  /** Barres de titre des boîtes (cliquables). */
  ciblesBoites: Cible[]
  survol: Cible | null
  /** Hypothèses épinglées (points) : leurs repères restent affichés sur les blocs dépendants. */
  epingles: Set<number>
  /** Hypothèses de modélisation présentes (point → repère « (i) »). */
  hypotheses: Map<number, string>
  composition: Composition | null
  /** Graphiques dessinés sous les blocs (point → graphiques clés ou demandés). */
  figures: Map<number, FigurePlacee[]>
  /** Titres coupés pour le niveau « titre » (cache par mise en page). */
  titres: Map<number, { gras: string; lignes: string[]; taille: number }>
  /** Blocs dessinés à chaque niveau à la dernière image (panneau). */
  compte: Record<NiveauDetail, number>
}

const lire = <T extends ValeurReglage>(vue: VueRaisonnement, cle: string) => vue.reglages.lire<T>(cle)

/** Écran : px par px de mise en page au point p. */
function echelle(vue: VueRaisonnement, page: MiseEnPage, p: number): number {
  return vue.camera.pixelsParUnite() * (vue.projection.echelle[p] || 1) * page.echelle
}

/** Niveau de détail pour une échelle donnée (seuils réglables). */
export function niveauDe(vue: VueRaisonnement, s: number): NiveauDetail {
  if (s < lire<number>(vue, 'seuilPoint')) return 'point'
  if (s < lire<number>(vue, 'seuilComplet')) return 'titre'
  return 'complet'
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

function tronquer(ctx: CanvasRenderingContext2D, t: string, max: number): string {
  if (ctx.measureText(t).width <= max) return t
  let x = t
  while (x.length > 1 && ctx.measureText(x + '…').width > max) x = x.slice(0, -1)
  return x.trimEnd() + '…'
}

/** Rectangle écran d'un bloc (point d'ancrage ± demi-largeur, haut / bas). */
function rectEcran(vue: VueRaisonnement, page: MiseEnPage, p: number): { x0: number; y0: number; x1: number; y1: number; s: number } {
  const b = page.boites[p]!
  const s = echelle(vue, page, p)
  const x = vue.projection.x[p]!, y = vue.projection.y[p]!
  const l = b.genre === 'decision' ? Math.max(24, b.w / 2) : b.w / 2
  return { x0: x - l * s, y0: y - b.haut * s, x1: x + l * s, y1: y + b.bas * s, s }
}

/** Vrai si le rectangle touche l'écran (marge de 40 px). */
function aLEcran(vue: VueRaisonnement, r: { x0: number; y0: number; x1: number; y1: number }): boolean {
  const W = vue.camera.largeur, H = vue.camera.hauteur
  return r.x1 > -40 && r.x0 < W + 40 && r.y1 > -40 && r.y0 < H + 40
}

// ─── Calque « dessous » : figure, boîtes, liaisons, jonctions ─────────────────

export function dessinerDessous(c: ContexteDessinR, etat: EtatRendu): void {
  const { ctx, vue } = c
  const page = etat.page
  etat.ciblesBoites = []
  if (!page || !page.boites.length) return
  const e = vue.extrusion
  const cam = vue.camera
  const E = page.echelle
  const monde = (x: number, y: number, yw = 0): [number, number, number] => [(x - page.cx) * E, yw, -(y - page.cy) * E]
  const s0 = cam.pixelsParUnite() * E
  const niveau0 = niveauDe(vue, s0)

  // Figure (axe, accolades, légende) et boîtes : s'estompent en 3D.
  const alpha = Math.max(0, 1 - e * 1.6)
  if (alpha > 0.01) {
    dessinerFigureR36(ctx, vue, etat, monde, s0, alpha, niveau0)
    dessinerCommentaires(ctx, vue, etat, s0, alpha)
  } else etat.composition?.masquerLegende()

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
  const epaisseur = Math.max(0.6, Math.min(1, 0.85 * s0))
  const tPointe = Math.max(2.2, Math.min(3.4, 2.9 * s0))
  const loin = niveau0 === 'point'
  ctx.save()
  ctx.lineJoin = 'miter'
  ctx.lineCap = 'butt'
  for (const r of page.routes) {
    const a = g.aretes[r.arete]
    if (!a) continue
    const os = vue.opaciteAffichee[r.source]!, oc = vue.opaciteAffichee[r.cible]!
    let alphaR = Math.min(1, Math.max(0.12, Math.min(os, oc)) * 1.1) * (loin ? 0.6 : 1)
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
    } else {
      let brut = r.points
      // Vue lointaine : les blocs sont des carrés centrés ; la liaison est prolongée jusqu'au centre.
      if (loin) {
        const xa = brut[0]![0] - demi(bs)
        const xb = brut[brut.length - 1]![0] + demi(bc)
        brut = [[xa, brut[0]![1]], ...brut, [xb, brut[brut.length - 1]![1]]]
      }
      pts = brut.map(([x, y]) => cam.projeterPoint(monde(x, y)))
    }
    ctx.strokeStyle = rgba(couleur, alphaR)
    ctx.lineWidth = largeur
    ctx.beginPath()
    polyligne(ctx, pts)
    ctx.stroke()
    ctx.setLineDash([])
    if (!loin) {
      const z = pts[pts.length - 1]!, y = pts[pts.length - 2] ?? pts[0]!
      pointe(ctx, z.x, z.y, z.x - y.x, z.y - y.y, tPointe)
    }
  }
  // Jonctions : point plein là où une sortie se divise (comme en schéma de circuit).
  if (!transition && e < 0.02 && !loin) {
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

  // Décision → hypothèse dans la marge : trait vers le bloc d'hypothèse.
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
    if (!loin) pointe(ctx, xm, yb, 0, 1, tPointe)
  }
  ctx.restore()

  if (lire<boolean>(vue, 'liensSemantiques') && !loin) dessinerLiensSemantiques(c, etat)
}

/**
 * Figure de R36 : axe des rangs logiques (graduations 0, 1, 2…, pointe LaTeX, « rang logique r »),
 * accolades des zones, légende « Figure 1 – … » sous la figure (pas en vue lointaine : illisible).
 */
function dessinerFigureR36(
  ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu,
  monde: (x: number, y: number) => [number, number, number], s0: number, alpha: number, niveau: NiveauDetail,
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

  const comp = etat.composition
  if (comp) {
    if (lire<boolean>(vue, 'legende') && niveau !== 'point') {
      const larg = largeurLegende(page)
      const cx = (b.x0 + b.x1) / 2
      comp.placerLegende(X(cx - larg / 2), Y(b.y1 + 26), s0, larg, alpha)
    } else comp.masquerLegende()
  }
  if (!lire<boolean>(vue, 'axe')) return

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.lineCap = 'butt'
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
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const xt = X(xFin) + 6 * k
  ctx.font = `400 ${taille}px ${SERIF}`
  ctx.fillText('rang logique ', xt, Y(yA))
  const wt = ctx.measureText('rang logique ').width
  ctx.font = `italic 400 ${taille}px ${SERIF_MATH}`
  ctx.fillText('r', xt + wt, Y(yA))
  const yB = b.y0 - 34
  ctx.lineWidth = Math.max(0.6, 0.75 * k)
  ctx.font = `italic 400 ${taille}px ${SERIF}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  for (const z of page.zones) {
    const xa = X(z.x0 + 8), xb = X(z.x1 - 8)
    if (xb - xa < 12) continue
    accolade(ctx, xa, xb, Y(yB), 8 * k)
    if (ctx.measureText(z.nom).width < xb - xa) ctx.fillText(z.nom, (xa + xb) / 2, Y(yB) - 3 * k)
  }
  ctx.restore()
}

/** Largeur de la légende de figure (px de mise en page) : un \linewidth raisonnable. */
export function largeurLegende(page: MiseEnPage): number {
  return Math.min(900, Math.max(460, page.bornes.x1 - page.bornes.x0))
}

/**
 * Boîtes de sous-problèmes (R18, telles quelles) : rectangle recalculé à chaque image depuis les blocs
 * membres (suit les transitions), fond teinté translucide, barre de titre plus soutenue, contour fin ;
 * piste abandonnée hachurée et tiretée. Barre de titre cliquable (R19) : ▾ réduire, ▸ déployer, ouvrir ↗.
 */
function dessinerCommentaires(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, s0: number, alpha: number): void {
  const page = etat.page!
  if (!page.commentaires.length) return
  const pr = vue.projection
  const P = etat.palette
  const refus = resultatDe(vue.lecture).refus
  const rects = new Map<string, { x0: number; y0: number; x1: number; y1: number }>()
  const opacites = new Map<string, number>()
  const rectMembres = (c: Commentaire) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, op = 0
    for (const p of c.membres) {
      if (!pr.visible[p] || vue.presence[p]! < 0.05) continue
      const r = rectEcran(vue, page, p)
      x0 = Math.min(x0, r.x0)
      x1 = Math.max(x1, r.x1)
      y0 = Math.min(y0, r.y0)
      y1 = Math.max(y1, r.y1)
      op = Math.max(op, vue.opaciteAffichee[p]!)
    }
    opacites.set(c.id, op)
    return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null
  }
  for (const c of page.commentaires) if (c.niveau === 1) {
    const r = rectMembres(c)
    if (r) rects.set(c.id, { x0: r.x0 - BOITE.padS * s0, y0: r.y0 - (BOITE.padS + BOITE.titreS) * s0, x1: r.x1 + BOITE.padS * s0, y1: r.y1 + BOITE.padS * s0 })
  }
  for (const c of page.commentaires) if (c.niveau === 0) {
    let r = rectMembres(c)
    if (!r) continue
    for (const d of page.commentaires) {
      const ri = d.niveau === 1 ? rects.get(d.id) : undefined
      if (!ri || !d.membres.every((p) => c.membres.includes(p))) continue
      r = { x0: Math.min(r.x0, ri.x0), y0: Math.min(r.y0, ri.y0), x1: Math.max(r.x1, ri.x1), y1: Math.max(r.y1, ri.y1) }
    }
    rects.set(c.id, { x0: r.x0 - BOITE.pad * s0, y0: r.y0 - (BOITE.pad + BOITE.titre) * s0, x1: r.x1 + BOITE.pad * s0, y1: r.y1 + BOITE.pad * s0 })
  }
  ctx.save()
  for (const c of page.commentaires) {
    const r = rects.get(c.id)
    if (!r || !aLEcran(vue, r)) continue
    const a = alpha * Math.max(0.35, opacites.get(c.id) ?? 1)
    const n1 = c.niveau === 1
    const hTitre = (n1 ? BOITE.titreS : BOITE.titre) * s0
    const w = r.x1 - r.x0, h = r.y1 - r.y0
    const survole = etat.survol?.groupe === c.id && (etat.survol.genre === 'titre' || etat.survol.genre === 'ouvrir')
    ctx.fillStyle = rgba(c.couleur, (n1 ? 0.075 : 0.055) * a)
    ctx.fillRect(r.x0, r.y0, w, h)
    if (c.abandon) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(r.x0, r.y0 + hTitre, w, h - hTitre)
      ctx.clip()
      ctx.strokeStyle = rgba(c.couleur, 0.14 * a)
      ctx.lineWidth = 1
      ctx.beginPath()
      const pas = Math.max(6, 9 * s0)
      for (let x = r.x0 - h; x < r.x1; x += pas) {
        ctx.moveTo(x, r.y1)
        ctx.lineTo(x + h, r.y0)
      }
      ctx.stroke()
      ctx.restore()
    }
    ctx.fillStyle = rgba(c.couleur, (n1 ? 0.16 : 0.2) * a * (survole ? 1.35 : 1))
    ctx.fillRect(r.x0, r.y0, w, hTitre)
    ctx.strokeStyle = rgba(c.couleur, (survole ? 0.85 : n1 ? 0.55 : 0.5) * a)
    ctx.lineWidth = 1
    if (c.abandon) ctx.setLineDash([4, 3])
    ctx.strokeRect(Math.round(r.x0) + 0.5, Math.round(r.y0) + 0.5, Math.round(w) - 1, Math.round(h) - 1)
    ctx.setLineDash([])
    if (c.reductible) etat.ciblesBoites.push({ genre: 'titre', groupe: c.id, point: -1, noeud: -1, x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y0 + hTitre })
    // Titre : ▾ / ▸ (boîte réductible), nom ; à droite, nombre d'énoncés (ou l'action au survol), « ouvrir ↗ ».
    const taille = (n1 ? 10.5 : 12) * s0
    if (taille < 6.5) continue
    const ym = r.y0 + hTitre / 2 + 0.5
    ctx.textBaseline = 'middle'
    let xd = r.x1 - 7 * s0
    if (c.reductible && c.niveau === 0) {
      ctx.font = `italic 400 ${taille * 0.85}px ${SERIF}`
      ctx.textAlign = 'right'
      const ouvrir = 'ouvrir ↗'
      const wO = ctx.measureText(ouvrir).width
      const surOuvrir = etat.survol?.genre === 'ouvrir' && etat.survol.groupe === c.id
      ctx.fillStyle = rgba(surOuvrir ? P.accent : c.couleur, a)
      ctx.fillText(ouvrir, xd, ym)
      if (surOuvrir) ctx.fillRect(xd - wO, ym + taille * 0.45, wO, 0.8)
      etat.ciblesBoites.push({ genre: 'ouvrir', groupe: c.id, point: -1, noeud: -1, x0: xd - wO - 4 * s0, y0: r.y0, x1: xd + 3 * s0, y1: r.y0 + hTitre })
      xd -= wO + 10 * s0
    }
    const nEnonces = c.membres.reduce((t, p) => t + (vue.lecture.unites[p]?.membres.length ?? 1), 0)
    const droite = survole && etat.survol?.genre === 'titre'
      ? (refus.has(c.id) ? 'réduction impossible (cycle)' : c.reduite ? 'clic : déployer' : 'clic : réduire')
      : `${nEnonces} énoncé${nEnonces > 1 ? 's' : ''}`
    ctx.font = `400 ${taille * 0.85}px ${SERIF}`
    ctx.textAlign = 'right'
    ctx.fillStyle = rgba(P.gris, a)
    const wD = ctx.measureText(droite).width
    ctx.textAlign = 'left'
    ctx.font = `700 ${taille}px ${SERIF}`
    ctx.fillStyle = rgba(c.couleur, a)
    let xg = r.x0 + 7 * s0
    if (c.reductible) {
      const marque = c.reduite ? '▸' : '▾'
      ctx.fillText(marque, xg, ym)
      xg += ctx.measureText(marque).width + 5 * s0
    }
    const titre = (c.abandon && !/abandon/i.test(c.nom) ? `Piste abandonnée · ${c.nom}` : c.nom) + (c.reduite ? ' · réduit' : '')
    const place = xd - wD - 10 * s0 - xg
    if (place > 20) {
      const t = tronquer(ctx, titre, place)
      ctx.fillText(t, xg, ym)
      ctx.font = `400 ${taille * 0.85}px ${SERIF}`
      ctx.textAlign = 'right'
      ctx.fillStyle = rgba(P.gris, a)
      ctx.fillText(droite, xd, ym)
    }
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
      ctx.strokeRect(x - (l + 5) * s, y - (b.haut + 5) * s, (2 * l + 10) * s, (b.haut + Math.min(b.bas, b.h / 2 + 20) + 10) * s)
      ctx.setLineDash([])
      if (j.noeuds[g.unites[p]!.conclusion]!.id === tete && s * 10 >= 7) {
        ctx.font = `italic 400 ${10 * s}px ${SERIF}`
        ctx.textAlign = 'right'
        ctx.textBaseline = 'bottom'
        ctx.fillStyle = rgba(P.accent, op)
        ctx.fillText(`sous-système ouvert (${pts.length} blocs) — double-clic : refermer`, x + (l + 5) * s, y - (b.haut + 7) * s)
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

// ─── Calque « dessus » : blocs selon le niveau de détail ──────────────────────

export function dessinerDessus(c: ContexteDessinR, etat: EtatRendu): void {
  const { ctx, vue } = c
  const page = etat.page
  etat.cibles = []
  etat.compte = { point: 0, titre: 0, complet: 0 }
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
    const re = rectEcran(vue, page, p)
    if (!aLEcran(vue, re)) continue
    const s = re.s
    const x = pr.x[p]!, y = pr.y[p]!
    const niveau = niveauDe(vue, s)
    etat.compte[niveau]++
    if (niveau === 'point') {
      dessinerPoint(ctx, vue, etat, p, b, x, y, s, op)
      const r = Math.max(6, carre(b, s) / 2 + 2)
      etat.cibles.push({ genre: b.genre === 'drapeau' ? 'drapeau' : 'carte', point: p, noeud: -1, x0: x - r, y0: y - r, x1: x + r, y1: y + r })
      continue
    }
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s, s)
    ctx.globalAlpha = op
    const tags: string[] = []
    if (niveau === 'complet') for (const [q, ref] of etat.hypotheses) {
      if (q === p) continue
      if ((toujours || actifs.includes(q)) && page.portees.get(q)?.includes(p)) tags.push(ref)
    }
    if (b.genre === 'drapeau') dessinerHypothese(ctx, vue, etat, p, b)
    else if (b.genre === 'decision') dessinerDecision(ctx, vue, etat, p, b, tags, niveau)
    else if (b.genre === 'fonction') dessinerFonction(ctx, vue, etat, p, b, tags, niveau)
    else dessinerBloc(ctx, vue, etat, p, b, tags, niveau)
    if (niveau === 'titre' && b.genre !== 'fonction') dessinerTitre(ctx, vue, etat, p, b)
    // Graphiques (même repère, même opacité).
    const figs = etat.figures.get(p)
    if (figs && b.figures) {
      const hF = geometrieFigure(b.w).h
      const couleurs = { encre: P.encre, gris: P.gris, surface: P.surface, prediction: P.accent }
      figs.slice(0, b.figures).forEach((f, k) => {
        const yf = b.yFigures + k * (hF + ECART_FIGURE)
        if (niveau === 'complet') dessinerFigure(ctx, f.fig, f.legende, -b.w / 2, yf, b.w, couleurs)
        else dessinerFigureReduite(ctx, etat, f, -b.w / 2, yf, b.w, hF)
      })
    }
    ctx.restore()
    if (niveau === 'complet' && b.genre !== 'fonction') comp?.placer(p, x, y, s, op, b.w, b.haut)
    // Cibles (écran).
    if (b.genre === 'decision') {
      const l = Math.max(19, b.w / 2)
      etat.cibles.push({ genre: 'carte', point: p, noeud: -1, x0: x - l * s, y0: y - b.haut * s, x1: x + l * s, y1: y + 22 * s })
      if (b.impasse && lire<boolean>(vue, 'impasses')) etat.cibles.push({ genre: 'impasse', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y + 22 * s, x1: x + (b.w / 2) * s, y1: y + 48 * s })
    } else if (b.genre === 'drapeau') etat.cibles.push({ genre: 'drapeau', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y - (b.h / 2) * s, x1: x + (b.w / 2) * s, y1: y + (b.h / 2) * s })
    else etat.cibles.push({ genre: 'carte', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y - (b.h / 2) * s, x1: x + (b.w / 2) * s, y1: y + (b.h / 2) * s })
    if (niveau === 'complet') {
      const y0 = yPastilles(b)
      for (const it of rangee(vue, b)) {
        const cx = x + it.x * s, cy = y + y0 * s
        if (it.renvoi >= 0) etat.cibles.push({ genre: 'renvoi', point: it.renvoi, noeud: -1, x0: cx - 14 * s, y0: cy - 7 * s, x1: cx + 14 * s, y1: cy + 7 * s })
        else etat.cibles.push({ genre: 'pastille', point: p, noeud: it.noeud, x0: cx - 7 * s, y0: cy - 7 * s, x1: cx + 7 * s, y1: cy + 7 * s })
      }
    }
  }
  comp?.finImage()
}

/** Côté (px d'écran) du carré d'un bloc en vue lointaine. */
function carre(b: Boite, s: number): number {
  return Math.max(3, Math.min(10, 0.5 * Math.min(b.w, b.h) * s))
}

/** Vue lointaine : petit carré plein de la couleur de la boîte du bloc (losange pour une décision). */
function dessinerPoint(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, x: number, y: number, s: number, op: number): void {
  const page = etat.page!
  const c = carre(b, s)
  const tl = traitLignee(vue, etat, p)
  ctx.save()
  ctx.globalAlpha = op
  ctx.fillStyle = b.abandon ? etat.palette.gris : page.teintes[p] ?? etat.palette.encre
  ctx.beginPath()
  if (b.genre === 'decision') {
    const r = c * 0.62
    ctx.moveTo(x, y - r)
    ctx.lineTo(x + r, y)
    ctx.lineTo(x, y + r)
    ctx.lineTo(x - r, y)
    ctx.closePath()
  } else ctx.rect(x - c / 2, y - c / 2, c, c)
  ctx.fill()
  if (tl) {
    ctx.strokeStyle = tl.couleur
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
  ctx.restore()
}

/** Niveau « titre » : numéro et titre au canevas, coupés dans le cadre (sans KaTeX). */
function dessinerTitre(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite): void {
  const n = vue.noeud(p)
  const taille = lire<number>(vue, 'taillePolice') * 1.5
  let t = etat.titres.get(p)
  if (!t || t.taille !== taille) {
    const gras = b.genre === 'drapeau' ? `Hypothèse ${b.ref}` : b.genre === 'decision' ? '' : `${typeDe(n)} ${b.ref}`
    const largeur = b.w - (b.genre === 'decision' ? 4 : 14)
    const maxL = b.genre === 'decision' ? Math.max(1, Math.floor((b.haut - 23) / (taille * 1.2)))
      : Math.max(1, Math.floor((b.h - 8) / (taille * 1.2)) - (gras ? 1 : 0))
    ctx.font = `400 ${taille}px ${SERIF}`
    const lignes = couperCanevas(ctx, n.nom, largeur, maxL)
    t = { gras, lignes, taille }
    etat.titres.set(p, t)
  }
  const P = etat.palette
  ctx.save()
  ctx.fillStyle = b.abandon ? P.gris : P.encre
  ctx.textBaseline = 'alphabetic'
  const lh = taille * 1.2
  if (b.genre === 'decision') {
    ctx.textAlign = 'center'
    ctx.font = `400 ${taille}px ${SERIF}`
    const y0 = -b.haut + taille
    t.lignes.forEach((l, k) => ctx.fillText(l, 0, y0 + k * lh))
    ctx.restore()
    return
  }
  ctx.beginPath()
  ctx.rect(-b.w / 2, -b.h / 2, b.w, b.h)
  ctx.clip()
  const nl = t.lignes.length + (t.gras ? 1 : 0)
  let y = -((nl - 1) * lh) / 2 + taille * 0.35
  ctx.textAlign = 'center'
  if (t.gras) {
    ctx.font = `700 ${taille}px ${SERIF}`
    ctx.fillText(t.gras, 0, y)
    y += lh
  }
  ctx.font = `400 ${taille}px ${SERIF}`
  for (const l of t.lignes) {
    ctx.fillText(l, 0, y)
    y += lh
  }
  ctx.restore()
}

/** Coupe un texte au canevas (police déjà réglée), au plus `max` lignes. */
function couperCanevas(ctx: CanvasRenderingContext2D, texte: string, largeur: number, max: number): string[] {
  const mots = texte.split(/\s+/).filter(Boolean)
  const lignes: string[] = []
  let courante = ''
  for (const m of mots) {
    const essai = courante ? `${courante} ${m}` : m
    if (ctx.measureText(essai).width <= largeur || !courante) courante = essai
    else {
      lignes.push(courante)
      courante = m
    }
  }
  if (courante) lignes.push(courante)
  if (lignes.length > max) {
    lignes.length = max
    lignes[max - 1] = tronquer(ctx, `${lignes[max - 1]!}…`, largeur)
  }
  return lignes.map((l) => tronquer(ctx, l, largeur))
}

/** Niveau « titre » : cadre du graphique et son étiquette seulement. */
function dessinerFigureReduite(ctx: CanvasRenderingContext2D, etat: EtatRendu, f: FigurePlacee, x0: number, y0: number, W: number, h: number): void {
  const P = etat.palette
  const g = geometrieFigure(W)
  ctx.save()
  ctx.fillStyle = P.surface
  ctx.fillRect(x0, y0, W, h)
  ctx.strokeStyle = rgba(P.encre, 0.6)
  ctx.lineWidth = 0.8
  ctx.strokeRect(x0 + g.bx, y0 + 3, g.bw, g.bh)
  ctx.fillStyle = P.encre
  ctx.font = `400 16px ${SERIF}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${f.etiquette} ${f.fig.y} (${f.fig.x})`, x0 + g.bx + g.bw / 2, y0 + 3 + g.bh / 2)
  ctx.restore()
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

/** Hypothèses actives dont dépend le bloc, au-dessus du coin haut droit : « sous (i), (iii) ». */
function dessinerTags(ctx: CanvasRenderingContext2D, etat: EtatRendu, tags: string[], xDroite: number, yHaut: number): void {
  if (!tags.length) return
  ctx.font = `italic 400 10px ${SERIF}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = etat.palette.accent
  ctx.fillText(`sous ${tags.join(', ')}`, xDroite, yHaut - 2)
}

function dessinerBloc(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, tags: string[], niveau: NiveauDetail): void {
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
  if (majeur) {
    ctx.lineWidth = tl ? Math.max(0.8, tl.largeur - 0.6) : 0.8
    ctx.strokeRect(x0 + 2.5, y0 + 2.5, w - 5, h - 5)
  }
  ctx.setLineDash([])
  if (n.statut === 'refute' && !b.abandon) {
    ctx.strokeStyle = rgba(couleurTrait, 0.55)
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(x0, y0 + h)
    ctx.lineTo(x0 + w, y0)
    ctx.stroke()
  }
  if (niveau === 'complet') {
    dessinerRangee(ctx, vue, etat, b)
    dessinerTags(ctx, etat, tags, x0 + w, y0 - (sousSysteme ? 3 : 0))
  }
}

function dessinerDecision(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, tags: string[], niveau: NiveauDetail): void {
  const P = etat.palette
  const tl = traitLignee(vue, etat, p)
  if (niveau === 'complet') dessinerTags(ctx, etat, tags, b.w / 2, -b.haut)
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
  if (niveau === 'complet') dessinerRangee(ctx, vue, etat, b)
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

/**
 * Nœud-fonction (R19, composé en noir sur blanc) : pile (copie décalée), trait = statut le plus faible,
 * titre « Sous-graphe G1 (nom). », broches d'entrée ▸ (renvoi « cf. 7 » et nom de la source), broches
 * de sortie • (énoncé utilisé dehors), pied : effectifs par statut et maillon le plus faible.
 */
function dessinerFonction(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, tags: string[], niveau: NiveauDetail): void {
  const P = etat.palette
  const u = vue.lecture.unites[p]!
  const noeuds = vue.justification.noeuds
  const ag = agreger(noeuds, u.membres)
  const w = b.w, h = b.h
  const x0 = -w / 2, y0 = -h / 2
  const taille = lire<number>(vue, 'taillePolice')
  const tl = traitLignee(vue, etat, p)
  const couleurTrait = tl ? tl.couleur : tags.length ? P.accent : P.encre
  const motif = motifStatut(ag.statut)
  ctx.fillStyle = P.surface
  ctx.fillRect(x0 + 3, y0 - 3, w, h)
  ctx.strokeStyle = rgba(P.encre, 0.6)
  ctx.lineWidth = 0.7
  ctx.setLineDash(motif)
  ctx.strokeRect(x0 + 3, y0 - 3, w, h)
  ctx.setLineDash([])
  ctx.fillStyle = P.surface
  ctx.fillRect(x0, y0, w, h)
  ctx.strokeStyle = couleurTrait
  ctx.lineWidth = tl ? tl.largeur : 0.8
  ctx.setLineDash(motif)
  ctx.strokeRect(x0, y0, w, h)
  ctx.setLineDash([])
  if (ag.statut === 'refute') {
    ctx.strokeStyle = rgba(couleurTrait, 0.55)
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(x0, y0 + h)
    ctx.lineTo(x0 + w, y0)
    ctx.stroke()
  }
  const br = b.broches
  // Titre : « Sous-graphe G1 » en gras (première ligne), puis le nom de la boîte.
  ctx.save()
  ctx.beginPath()
  ctx.rect(x0, y0, w, h)
  ctx.clip()
  ctx.fillStyle = P.encre
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const lh = taille * 1.25
  const pref = `Sous-graphe ${b.ref}`
  b.lignes.forEach((l, k) => {
    const y = y0 + 6 + taille + k * lh
    if (k === 0 && l.startsWith(pref)) {
      ctx.font = `700 ${taille}px ${SERIF}`
      ctx.fillText(pref, x0 + 8, y)
      const wp = ctx.measureText(pref).width
      ctx.font = `400 ${taille}px ${SERIF}`
      ctx.fillText(l.slice(pref.length), x0 + 8 + wp, y)
    } else {
      ctx.font = `400 ${taille}px ${SERIF}`
      ctx.fillText(l, x0 + 8, y)
    }
  })
  if (br) {
    const page = etat.page!
    const tb = taille - 2.5
    ctx.textBaseline = 'middle'
    for (const e of br.entrees) {
      const allume = vue.survol === e.source
      ctx.fillStyle = allume ? P.accent : P.encre
      ctx.beginPath()
      ctx.moveTo(x0 + 1, e.y - 3)
      ctx.lineTo(x0 + 6, e.y)
      ctx.lineTo(x0 + 1, e.y + 3)
      ctx.closePath()
      ctx.fill()
      if (niveau !== 'complet') continue
      ctx.textAlign = 'left'
      ctx.font = `400 ${tb}px ${SERIF}`
      const ref = `cf. ${page.boites[e.source]?.ref ?? '?'}`
      ctx.fillText(ref, x0 + 10, e.y + 0.5)
      const wr = ctx.measureText(ref).width
      ctx.font = `italic 400 ${tb}px ${SERIF}`
      ctx.fillStyle = P.gris
      ctx.fillText(tronquer(ctx, vue.noeud(e.source).nom, w - 24 - wr), x0 + 14 + wr, e.y + 0.5)
    }
    if (br.entrees.length && br.sorties.length) {
      const ys = (br.entrees[br.entrees.length - 1]!.y + br.sorties[0]!.y) / 2
      ctx.strokeStyle = rgba(P.gris, 0.5)
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(x0 + 8, ys)
      ctx.lineTo(x0 + w - 8, ys)
      ctx.stroke()
    }
    for (const s of br.sorties) {
      ctx.fillStyle = P.encre
      ctx.beginPath()
      ctx.arc(x0 + w - 4, s.y, 2.2, 0, Math.PI * 2)
      ctx.fill()
      if (niveau !== 'complet') continue
      ctx.textAlign = 'right'
      ctx.font = `400 ${tb}px ${SERIF}`
      ctx.fillText(tronquer(ctx, noeuds[s.noeud]!.nom, w - 22), x0 + w - 10, s.y + 0.5)
    }
  }
  // Pied : effectifs par statut, maillon le plus faible (c en italique mathématique).
  if (niveau === 'complet') {
    const yPied = y0 + h - PIED_FONCTION
    ctx.strokeStyle = rgba(P.encre, 0.6)
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(x0 + 8, yPied)
    ctx.lineTo(x0 + w - 8, yPied)
    ctx.stroke()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    const tp = taille - 2.5
    ctx.font = `400 ${tp}px ${SERIF}`
    ctx.fillStyle = P.gris
    const ps = ag.parStatut
    const detail = [`${ag.n} énoncés`, ps.incertain ? `${ps.incertain} à vérifier` : '', ps.refute ? `${ps.refute} réfuté${ps.refute > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ')
    ctx.fillText(tronquer(ctx, detail, w - 16), x0 + 8, yPied + tp + 2)
    const maillon = noeuds[ag.maillon]!
    const debut = 'maillon faible : '
    ctx.fillText(debut, x0 + 8, yPied + 2 * tp + 5)
    let x = x0 + 8 + ctx.measureText(debut).width
    ctx.font = `italic 400 ${tp}px ${SERIF_MATH}`
    ctx.fillStyle = P.encre
    ctx.fillText('c', x, yPied + 2 * tp + 5)
    x += ctx.measureText('c').width
    ctx.font = `400 ${tp}px ${SERIF}`
    const val = ` = ${ag.confiance.estimation.toFixed(2).replace('.', ',')} (${maillon.nom})`
    ctx.fillText(tronquer(ctx, val, x0 + w - 8 - x), x, yPied + 2 * tp + 5)
  }
  ctx.restore()
  if (niveau === 'complet') {
    dessinerRangee(ctx, vue, etat, b)
    dessinerTags(ctx, etat, tags, x0 + w, y0 - 3)
  }
}

// ─── Survol ──────────────────────────────────────────────────────────────────

/** Élément sous le pointeur (écran), d'après la dernière image. */
export function cibleSous(etat: EtatRendu, x: number, y: number): Cible | null {
  for (let k = etat.cibles.length - 1; k >= 0; k--) {
    const c = etat.cibles[k]!
    if ((c.genre === 'pastille' || c.genre === 'impasse' || c.genre === 'renvoi') && x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) return c
  }
  for (let k = etat.cibles.length - 1; k >= 0; k--) {
    const c = etat.cibles[k]!
    if (x >= c.x0 - 2 && x <= c.x1 + 2 && y >= c.y0 - 2 && y <= c.y1 + 2) return c
  }
  // Barres de titre des boîtes : « ouvrir ↗ » avant la barre entière ; imbriquées (dessinées après) d'abord.
  for (const genre of ['ouvrir', 'titre'] as const) {
    for (let k = etat.ciblesBoites.length - 1; k >= 0; k--) {
      const c = etat.ciblesBoites[k]!
      if (c.genre === genre && x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) return c
    }
  }
  return null
}
