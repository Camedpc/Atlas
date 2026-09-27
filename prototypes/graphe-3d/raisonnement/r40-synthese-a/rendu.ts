// R40 · Rendu sur les calques canvas de la vue (le texte complet des blocs est dans composition.ts).
//
// - Dessous : figure (axe des rangs logiques et accolades des zones, R36), boîtes des sous-problèmes
//   (rectangle teinté translucide, barre de titre colorée, boîtes imbriquées, R18) dont la barre réduit /
//   déploie la boîte (R19), liaisons orthogonales au trait fin avec pointe « to » de TikZ, jonctions,
//   sous-systèmes dépliés, liens sémantiques ; place la légende « Figure 1 – … ».
// - Dessus : blocs (R36 : cadre simple, double cadre pour un résultat, copie décalée pour un
//   sous-système, coins arrondis pour une hypothèse, losange de décision), nœuds-fonctions (R19, en noir
//   et blanc), graphiques (R35) sous le bloc qui énonce la loi ; pose le HTML des blocs.
// - Statut par le trait : plein = validé, tireté = à vérifier, barré = réfuté, pointillé gris = piste
//   abandonnée. Noir sur blanc, un seul bleu (interaction) ; la couleur ne sert qu'aux boîtes.
//
// Niveaux de détail selon le zoom (s = pixels écran par px de mise en page, réglages « seuil points » et
// « seuil contenu ») :
//   s < seuil points     → chaque bloc est un petit carré de la couleur de sa boîte ; pas de texte, pas de
//                          HTML ; seuls les titres des boîtes restent lisibles (corps minimal) ;
//   s < seuil contenu    → cadre et titre seul (texte canvas, coupé au cadre) ; graphiques en cadre vide ;
//   sinon                → contenu complet : HTML (formule KaTeX, confiance), bornes, renvois, graphiques.
// Seuls les blocs dont le cadre coupe l'écran sont dessinés et reçoivent leur HTML.

import { LIBELLES_TYPE, rgba, type ContexteDessinR, type ValeurReglage, type VueRaisonnement } from '../../src/raisonnement'
import type { Composition } from './composition'
import { dessinerFigure, type Figure } from './graphiques'
import { agreger, resultatDe } from './groupes'
import { BOITE, ECART_FIGURE, SERIF, SERIF_MATH, type Boite, type Commentaire, type MiseEnPage } from './mise-en-page'
import { etatSquelette } from './squelette'

export interface PaletteR40 {
  encre: string
  gris: string
  trait: string
  surface: string
  surface2: string
  accent: string
}

export function lirePaletteR40(el: HTMLElement): PaletteR40 {
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
  legende: string
  numero: number
}

/** Rectangles des blocs d'une boîte qu'on vient de réduire, qui se resserrent vers le nœud-fonction (R19). */
export interface Fantomes {
  debut: number
  duree: number
  groupe: string
  couleur: string
  boites: { x: number; z: number; w: number; h: number }[]
}

export type NiveauDetail = 'point' | 'titre' | 'complet'

export interface EtatRendu {
  page: MiseEnPage | null
  palette: PaletteR40
  cibles: Cible[]
  ciblesGroupes: Cible[]
  /** Élément survolé (déterminé par cibleSous). */
  survol: Cible | null
  /** Hypothèses épinglées (points) : leurs renvois restent affichés sur les blocs dépendants. */
  epingles: Set<number>
  /** Hypothèses de modélisation présentes (point → numéro « (ii) »). */
  hypotheses: Map<number, string>
  /** Couche HTML des blocs (titres, formules), créée à la demande. */
  composition: Composition | null
  /** Graphiques affichés sous les blocs (point → figures, dans l'ordre de numérotation). */
  figures: Map<number, FigurePlacee[]>
  fantomes: Fantomes | null
  /** Blocs dessinés à la dernière image, par niveau de détail (panneau). */
  compte: Record<NiveauDetail, number>
}

const lire = <T extends ValeurReglage>(vue: VueRaisonnement, cle: string) => vue.reglages.lire<T>(cle)

/** Écran : px par px de mise en page au point p. */
function echelle(vue: VueRaisonnement, page: MiseEnPage, p: number): number {
  return vue.camera.pixelsParUnite() * (vue.projection.echelle[p] || 1) * page.echelle
}

/** Niveau de détail à l'échelle s (px écran par px de mise en page). */
export function niveauDetail(vue: VueRaisonnement, s: number): NiveauDetail {
  if (s < lire<number>(vue, 'seuilPoints')) return 'point'
  if (s < lire<number>(vue, 'seuilContenu')) return 'titre'
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

/** Tronque un texte (police courante) à une largeur, avec « … ». */
function tronquer(ctx: CanvasRenderingContext2D, t: string, max: number): string {
  if (ctx.measureText(t).width <= max) return t
  let x = t
  while (x.length > 1 && ctx.measureText(x + '…').width > max) x = x.slice(0, -1)
  return x.trimEnd() + '…'
}

/** Coupe un texte en lignes (police courante), au plus `max`, la dernière terminée par « … » si besoin. */
function couper(ctx: CanvasRenderingContext2D, texte: string, largeur: number, max: number): string[] {
  const lignes: string[] = []
  let courante = ''
  for (const m of texte.split(/\s+/)) {
    if (!m) continue
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
    lignes[max - 1] = tronquer(ctx, lignes[max - 1]! + ' …', largeur)
  }
  return lignes.map((l) => tronquer(ctx, l, largeur))
}

/** Vrai si le rectangle écran coupe la zone visible (marge en px). */
function visibleEcran(vue: VueRaisonnement, x0: number, y0: number, x1: number, y1: number, marge = 40): boolean {
  const cam = vue.camera
  return x1 > -marge && x0 < cam.largeur + marge && y1 > -marge && y0 < cam.hauteur + marge
}

// ─── Calque « dessous » : figure, boîtes, liaisons, jonctions ────────────────

export function dessinerDessous(c: ContexteDessinR, etat: EtatRendu): void {
  const { ctx, vue } = c
  const page = etat.page
  etat.ciblesGroupes = []
  if (!page || !page.boites.length) return
  const e = vue.extrusion
  const cam = vue.camera
  const E = page.echelle
  const monde = (x: number, y: number, yw = 0): [number, number, number] => [(x - page.cx) * E, yw, -(y - page.cy) * E]
  const s0 = cam.pixelsParUnite() * E
  const niveau = niveauDetail(vue, s0)

  // Figure (axe, accolades, légende) et boîtes : s'estompent en 3D.
  const alpha = Math.max(0, 1 - e * 1.6)
  if (alpha > 0.01) {
    dessinerCadreFigure(ctx, vue, etat, monde, s0, alpha, niveau)
    dessinerBoites(ctx, vue, etat, s0, alpha, niveau)
  } else etat.composition?.masquerLegende()

  if (niveau !== 'point') dessinerDeplies(c, etat)

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
  const epaisseur = niveau === 'point' ? 0.6 : Math.max(0.7, Math.min(1, 0.85 * s0))
  const tPointe = Math.max(2.2, Math.min(3.4, 2.9 * s0))
  ctx.save()
  ctx.lineJoin = 'miter'
  ctx.lineCap = 'butt'
  for (const r of page.routes) {
    const a = g.aretes[r.arete]
    if (!a) continue
    const os = vue.opaciteAffichee[r.source]!, oc = vue.opaciteAffichee[r.cible]!
    let alphaR = Math.min(1, Math.max(0.12, Math.min(os, oc)) * 1.1) * (niveau === 'point' ? 0.55 : 1)
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
      const xa = pr.x[r.source]! + demi(bs) * ss, ya = pr.y[r.source]! + (page.portsSortie.get(r.arete) ?? 0) * ss
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
    if (niveau !== 'point') {
      const z = pts[pts.length - 1]!, y = pts[pts.length - 2] ?? pts[0]!
      pointe(ctx, z.x, z.y, z.x - y.x, z.y - y.y, tPointe)
    }
  }
  // Jonctions : point plein là où une sortie se divise (comme en schéma de circuit).
  if (!transition && e < 0.02 && niveau !== 'point') {
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
    if (niveau !== 'point') pointe(ctx, xm, yb, 0, 1, tPointe)
  }
  ctx.restore()

  if (niveau !== 'point' && lire<boolean>(vue, 'liensSemantiques')) dessinerLiensSemantiques(c, etat)
}

/**
 * Cadre de figure (R36) : axe des rangs logiques (graduations 0, 1, 2…, pointe LaTeX, « rang logique r »),
 * accolades des zones avec leur nom en italique, et légende « Figure 1 – … » sous la figure.
 */
function dessinerCadreFigure(
  ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu,
  monde: (x: number, y: number) => [number, number, number], s0: number, alpha: number, niveau: NiveauDetail,
): void {
  const page = etat.page!
  const P = etat.palette
  const cam = vue.camera
  const b = page.bornes
  const hg = cam.projeterPoint(monde(b.x0, b.y0))
  if (!hg.visible) return
  const X = (x: number) => hg.x + (x - b.x0) * s0
  const Y = (y: number) => hg.y + (y - b.y0) * s0
  const k = Math.min(1.25, s0)

  // Légende sous la figure : suit le zoom ; masquée quand elle serait illisible (niveau « points »).
  const comp = etat.composition
  if (comp) {
    if (lire<boolean>(vue, 'legende') && niveau !== 'point') {
      const larg = Math.min(900, Math.max(460, b.x1 - b.x0))
      const cx = (b.x0 + b.x1) / 2
      comp.placerLegende(X(cx - larg / 2), Y(b.y1 + 22), s0, larg, alpha)
    } else comp.masquerLegende()
  }
  if (!lire<boolean>(vue, 'axe')) return

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.lineCap = 'butt'
  const yA = b.y0 - 60
  const dernier = page.xRangs.length - 1
  const xDebut = (page.zones[0]?.x0 ?? b.x0) + 4
  const xFin = (dernier >= 0 ? page.xRangs[dernier]! + page.largeursRangs[dernier]! / 2 : b.x1) + 26
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
    if (ctx.measureText(z.nom).width < xb - xa) ctx.fillText(z.nom, (xa + xb) / 2, Y(yB) - 3 * k)
  }
  ctx.restore()
}

/**
 * Boîtes des sous-problèmes (R18) : rectangle calculé à chaque image depuis les blocs membres (suit les
 * transitions) ; fond teinté translucide, barre de titre plus soutenue, contour fin ; piste abandonnée
 * hachurée et tiretée. La barre d'une boîte réductible est cliquable (R19) : ▾ déployée / ▸ réduite,
 * « ouvrir ↗ » ouvre la boîte dans un onglet.
 */
function dessinerBoites(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, s0: number, alpha: number, niveau: NiveauDetail): void {
  const page = etat.page!
  if (!page.commentaires.length) return
  const pr = vue.projection
  const P = etat.palette
  const rects = new Map<string, { x0: number; y0: number; x1: number; y1: number; op: number }>()
  const rectMembres = (c: Commentaire) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, op = 0
    for (const p of c.membres) {
      if (!pr.visible[p] || vue.presence[p]! < 0.05) continue
      const b = page.boites[p]!
      const s = echelle(vue, page, p)
      const l = b.genre === 'decision' ? Math.max(24, b.w / 2) : b.w / 2
      x0 = Math.min(x0, pr.x[p]! - l * s)
      x1 = Math.max(x1, pr.x[p]! + l * s)
      y0 = Math.min(y0, pr.y[p]! - b.haut * s)
      y1 = Math.max(y1, pr.y[p]! + b.bas * s)
      op = Math.max(op, vue.opaciteAffichee[p]!)
    }
    return Number.isFinite(x0) ? { x0, y0, x1, y1, op } : null
  }
  // Imbriquées d'abord (leur rectangle agrandit celui du parent).
  for (const c of page.commentaires) if (c.niveau === 1) {
    const r = rectMembres(c)
    if (r) rects.set(c.id, { x0: r.x0 - BOITE.padS * s0, y0: r.y0 - (BOITE.padS + BOITE.titreS) * s0, x1: r.x1 + BOITE.padS * s0, y1: r.y1 + BOITE.padS * s0, op: r.op })
  }
  for (const c of page.commentaires) if (c.niveau === 0) {
    const r0 = rectMembres(c)
    if (!r0) continue
    let r = r0
    for (const d of page.commentaires) {
      const ri = d.niveau === 1 ? rects.get(d.id) : undefined
      if (!ri || !d.membres.every((p) => c.membres.includes(p))) continue
      r = { x0: Math.min(r.x0, ri.x0), y0: Math.min(r.y0, ri.y0), x1: Math.max(r.x1, ri.x1), y1: Math.max(r.y1, ri.y1), op: Math.max(r.op, ri.op) }
    }
    rects.set(c.id, { x0: r.x0 - BOITE.pad * s0, y0: r.y0 - (BOITE.pad + BOITE.titre) * s0, x1: r.x1 + BOITE.pad * s0, y1: r.y1 + BOITE.pad * s0, op: r.op })
  }
  const refus = resultatDe(vue.lecture).refus
  ctx.save()
  for (const c of page.commentaires) {
    const r = rects.get(c.id)
    if (!r || r.op < 0.02) continue
    if (!visibleEcran(vue, r.x0, r.y0, r.x1, r.y1, 4)) continue
    const n1 = c.niveau === 1
    const a = alpha * Math.max(0.35, r.op)
    // Titre lisible à tous les niveaux : à mi-distance, le corps grandit dans la place libre au-dessus des
    // blocs (barre + marge haute) ; loin, la barre grandit elle-même (la boîte ne contient plus que des
    // points, qu'elle peut recouvrir).
    const tailleBase = (n1 ? 10.5 : 12) * s0
    const libre = ((n1 ? BOITE.titreS + BOITE.padS : BOITE.titre + BOITE.pad) - 2) * s0
    const tailleMin = niveau === 'point' ? (n1 ? 10 : 11.5) : niveau === 'titre' ? Math.min(n1 ? 10 : 11, libre - 4) : 0
    const taille = Math.max(tailleBase, tailleMin)
    const hTitre = Math.max((n1 ? BOITE.titreS : BOITE.titre) * s0, niveau === 'point' ? taille + 6 : niveau === 'titre' ? Math.min(libre, taille + 4) : 0)
    const w = r.x1 - r.x0, h = r.y1 - r.y0
    const survole = etat.survol?.groupe === c.id && (etat.survol.genre === 'titre' || etat.survol.genre === 'ouvrir')
    ctx.fillStyle = rgba(c.couleur, (n1 ? 0.075 : 0.055) * a)
    ctx.fillRect(r.x0, r.y0, w, h)
    if (c.abandon) {
      // Hachures fines : piste gardée pour mémoire.
      ctx.save()
      ctx.beginPath()
      ctx.rect(r.x0, r.y0 + hTitre, w, Math.max(0, h - hTitre))
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
    ctx.fillRect(r.x0, r.y0, w, Math.min(h, hTitre))
    ctx.strokeStyle = rgba(c.couleur, (survole ? 0.85 : n1 ? 0.55 : 0.5) * a)
    ctx.lineWidth = survole ? 1.3 : 1
    if (c.abandon) ctx.setLineDash([4, 3])
    ctx.strokeRect(Math.round(r.x0) + 0.5, Math.round(r.y0) + 0.5, Math.round(w) - 1, Math.round(h) - 1)
    ctx.setLineDash([])
    if (c.reductible) etat.ciblesGroupes.push({ genre: 'titre', groupe: c.id, point: -1, noeud: -1, x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y0 + hTitre })
    if (taille < 6.5) continue
    // Titre : ▾ / ▸, nom de la boîte (couleur de la boîte) ; à droite, compte ou action, puis « ouvrir ↗ ».
    const ym = r.y0 + hTitre / 2 + 0.5
    ctx.textBaseline = 'middle'
    let xd = r.x1 - 7 * Math.min(1, s0 + 0.3)
    if (c.reductible) {
      ctx.font = `italic 400 ${taille * 0.86}px ${SERIF}`
      ctx.textAlign = 'right'
      const ouvrir = 'ouvrir ↗'
      const wO = ctx.measureText(ouvrir).width
      if (wO + 60 < w) {
        const sur = etat.survol?.genre === 'ouvrir' && etat.survol.groupe === c.id
        if (sur) {
          ctx.fillStyle = rgba(c.couleur, 0.28 * a)
          ctx.fillRect(xd - wO - 4, r.y0 + 2, wO + 8, hTitre - 4)
        }
        ctx.fillStyle = rgba(P.encre, 0.85 * a)
        ctx.fillText(ouvrir, xd, ym)
        etat.ciblesGroupes.push({ genre: 'ouvrir', groupe: c.id, point: -1, noeud: -1, x0: xd - wO - 5, y0: r.y0, x1: xd + 3, y1: r.y0 + hTitre })
        xd -= wO + 12
      }
    }
    const nEnonces = c.membres.reduce((t, p) => t + (vue.lecture.unites[p]?.membres.length ?? 1), 0)
    const droite = survole && etat.survol?.genre === 'titre'
      ? (refus.has(c.id) ? 'réduction impossible (cycle)' : c.reduit ? 'clic : déployer' : 'clic : réduire')
      : `${nEnonces} énoncé${nEnonces > 1 ? 's' : ''}`
    ctx.font = `400 ${taille * 0.84}px ${SERIF}`
    ctx.textAlign = 'right'
    const wD = ctx.measureText(droite).width
    ctx.textAlign = 'left'
    ctx.font = `700 ${taille}px ${SERIF}`
    const marque = c.reductible ? (c.reduit ? '▸ ' : '▾ ') : ''
    const titre = `${marque}${c.abandon && !/abandon/i.test(c.nom) ? `Piste abandonnée · ${c.nom}` : c.nom}${c.reduit ? ' — réduite' : ''}`
    const xg = r.x0 + 7 * Math.min(1, s0 + 0.3)
    const place = xd - xg - (wD + 12 < xd - xg - 40 ? wD + 12 : 0)
    ctx.fillStyle = rgba(melanger(c.couleur, 0.35), a)
    const t = tronquer(ctx, titre, place)
    ctx.fillText(t, xg, ym)
    if (wD + 12 < xd - xg - 40 && ctx.measureText(t).width + wD + 16 < xd - xg) {
      ctx.font = `400 ${taille * 0.84}px ${SERIF}`
      ctx.textAlign = 'right'
      ctx.fillStyle = rgba(P.gris, a)
      ctx.fillText(droite, xd, ym)
    }
  }
  ctx.restore()
}

/** Assombrit une teinte (vers le noir) : titres des boîtes lisibles sur fond clair. */
function melanger(hex: string, t: number): string {
  const v = hex.replace('#', '')
  const c = [0, 2, 4].map((k) => parseInt(v.slice(k, k + 2), 16) * (1 - t))
  return `#${c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`
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
      ctx.strokeRect(x - (l + 5) * s, y - (b.h / 2 + 5) * s, (2 * l + 10) * s, (b.h + 10) * s)
      ctx.setLineDash([])
      if (j.noeuds[g.unites[p]!.conclusion]!.id === tete) {
        ctx.font = `italic 400 ${Math.max(8.5, 10 * s)}px ${SERIF}`
        ctx.textAlign = 'right'
        ctx.textBaseline = 'bottom'
        ctx.fillStyle = rgba(P.accent, op)
        ctx.fillText(tronquer(ctx, `sous-système ouvert (${pts.length} blocs) — double-clic : refermer`, (2 * l + 10) * s), x + (l + 5) * s, y - (b.h / 2 + 7) * s)
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
      const x1 = pr.x[a]! + 14 * sa, y1 = pr.y[a]! - (page.boites[a]!.h / 2) * sa
      const x2 = pr.x[b]! - 14 * sb, y2 = pr.y[b]! - (page.boites[b]!.h / 2) * sb
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

// ─── Calque « dessus » : blocs, décisions, hypothèses, fonctions, graphiques ──

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
      ctx.fillText(tronquer(ctx, n.nom, 160), x - 8 * s, y)
    }
    etat.cibles.push({ genre: 'masque', point: p, noeud: vue.indexNoeud(p), x0: x - 6, y0: y - 6, x1: x + 6, y1: y + 6 })
  }
  ctx.restore()

  dessinerFantomes(ctx, vue, etat)

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
    const l = b.genre === 'decision' ? Math.max(19, b.w / 2) : b.w / 2
    // Hors écran : ni dessin, ni HTML.
    if (!visibleEcran(vue, x - l * s, y - b.haut * s, x + l * s, y + b.bas * s)) continue
    const niveau = niveauDetail(vue, s)
    etat.compte[niveau]++
    // Cibles (écran) : le bloc entier, à tous les niveaux.
    if (b.genre === 'decision') {
      etat.cibles.push({ genre: 'carte', point: p, noeud: -1, x0: x - l * s, y0: y - b.haut * s, x1: x + l * s, y1: y + 22 * s })
      if (niveau === 'complet' && b.impasse && lire<boolean>(vue, 'impasses')) etat.cibles.push({ genre: 'impasse', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y + 22 * s, x1: x + (b.w / 2) * s, y1: y + 48 * s })
    } else etat.cibles.push({ genre: b.genre === 'drapeau' ? 'drapeau' : 'carte', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y - (b.h / 2) * s, x1: x + (b.w / 2) * s, y1: y + (b.h / 2) * s })

    if (niveau === 'point') {
      dessinerPoint(ctx, vue, etat, p, b, x, y, s, op)
      continue
    }
    // Renvois « sous (i), (iii) » : hypothèses actives dont ce bloc dépend (graphe complet).
    const tags: string[] = []
    for (const [q, ref] of etat.hypotheses) {
      if (q === p) continue
      if ((toujours || actifs.includes(q)) && page.portees.get(q)?.includes(p)) tags.push(ref)
    }
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s, s)
    ctx.globalAlpha = op
    const complet = niveau === 'complet'
    if (b.genre === 'drapeau') dessinerHypothese(ctx, vue, etat, p, b)
    else if (b.genre === 'decision') dessinerDecision(ctx, vue, etat, p, b, tags, complet)
    else if (b.genre === 'fonction') dessinerFonction(ctx, vue, etat, p, b, tags, complet)
    else dessinerBloc(ctx, vue, etat, p, b, tags, complet)
    if (b.figures) dessinerFigures(ctx, etat, p, b, complet, s)
    ctx.restore()
    if (complet) {
      if (b.genre !== 'fonction') {
        const cadre = b.genre === 'decision' ? b.hLibelle : b.h
        const haut = b.genre === 'decision' ? b.haut : b.h / 2
        const portee = b.genre === 'drapeau' ? page.portees.get(p)?.filter((q) => q < vue.nU).length ?? 0 : 0
        comp?.placer(p, x, y, s, op, b.w, haut, cadre, b.ref, portee)
      }
      const y0 = yPastilles(b)
      for (const it of rangee(vue, b)) {
        const cx = x + it.x * s, cy = y + y0 * s
        if (it.renvoi >= 0) etat.cibles.push({ genre: 'renvoi', point: it.renvoi, noeud: -1, x0: cx - 14 * s, y0: cy - 7 * s, x1: cx + 14 * s, y1: cy + 7 * s })
        else etat.cibles.push({ genre: 'pastille', point: p, noeud: it.noeud, x0: cx - 7 * s, y0: cy - 7 * s, x1: cx + 7 * s, y1: cy + 7 * s })
      }
    } else dessinerTitre(ctx, vue, etat, p, b, x, y, s, op)
  }
  comp?.finImage()
}

/** Niveau « points » : petit carré plein de la couleur de sa boîte (encre pour la marge). */
function dessinerPoint(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, x: number, y: number, s: number, op: number): void {
  const tl = traitLignee(vue, etat, p)
  const couleur = tl ? tl.couleur : b.couleur
  const c = Math.max(4, Math.min(9, b.w * s * 0.12))
  ctx.fillStyle = rgba(couleur, op)
  if (b.genre === 'decision') {
    ctx.beginPath()
    ctx.moveTo(x, y - c * 0.7)
    ctx.lineTo(x + c * 0.7, y)
    ctx.lineTo(x, y + c * 0.7)
    ctx.lineTo(x - c * 0.7, y)
    ctx.closePath()
    ctx.fill()
  } else ctx.fillRect(x - c / 2, y - c / 2, c, c)
  if (b.genre === 'majeur' || b.genre === 'fonction') {
    // Résultat principal ou boîte réduite : carré cerné (reste repérable de loin).
    ctx.strokeStyle = rgba(couleur, op)
    ctx.lineWidth = 0.8
    ctx.strokeRect(x - c / 2 - 2, y - c / 2 - 2, c + 4, c + 4)
  }
}

/** Niveau « titre » : titre seul, en texte canvas net (corps lisible), coupé à la largeur et à la hauteur du cadre. */
function dessinerTitre(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, x: number, y: number, s: number, op: number): void {
  const n = vue.noeud(p)
  const P = etat.palette
  let texte: string
  let x0: number, y0: number, w: number, h: number
  if (b.genre === 'decision') {
    texte = n.nom
    w = b.w * s
    h = b.hLibelle * s
    x0 = x - w / 2
    y0 = y - b.haut * s
  } else {
    texte = b.genre === 'drapeau' ? `Hypothèse ${b.ref} (${n.nom}).`
      : b.genre === 'fonction' ? `Boîte réduite ${b.ref} (${b.lignes.join(' ')}).`
        : `${LIBELLES_TYPE[n.type]} ${b.ref} (${n.nom}).`
    w = b.w * s
    h = b.h * s
    x0 = x - w / 2
    y0 = y - h / 2
  }
  const pad = Math.max(2, 6 * s)
  const tl = traitLignee(vue, etat, p)
  // Corps : agrandi par rapport à l'échelle (lisible), borné par le cadre.
  let taille = Math.min(12.5, Math.max(9, lire<number>(vue, 'taillePolice') * s * 1.45))
  let lignes: string[] = []
  for (let essai = 0; essai < 4; essai++) {
    ctx.font = `400 ${taille}px ${SERIF}`
    const max = Math.max(1, Math.floor((h - 2 * pad) / (taille * 1.22)))
    lignes = couper(ctx, texte, w - 2 * pad, max)
    if ((h - 2 * pad) >= taille * 1.1 || taille <= 7) break
    taille = Math.max(7, taille - 1.5)
  }
  if ((h - 2 * pad) < taille * 1.05) return
  ctx.save()
  ctx.globalAlpha = op
  ctx.beginPath()
  ctx.rect(x0, y0, w, h)
  ctx.clip()
  ctx.fillStyle = tl ? tl.couleur : b.abandon ? P.gris : P.encre
  ctx.textBaseline = 'middle'
  ctx.textAlign = b.genre === 'decision' ? 'center' : 'left'
  const hTexte = lignes.length * taille * 1.22
  const yDebut = b.genre === 'decision' ? y0 + h - hTexte : y0 + Math.max(pad, (h - hTexte) / 2)
  // Tête en gras (« Lemme 7 », « Hypothèse (ii) ») sur la première ligne, le reste en romain.
  const tete = b.genre === 'drapeau' ? `Hypothèse ${b.ref}` : b.genre === 'decision' ? '' : b.genre === 'fonction' ? `Boîte réduite ${b.ref}` : `${LIBELLES_TYPE[n.type]} ${b.ref}`
  lignes.forEach((l, k) => {
    const yl = yDebut + (k + 0.5) * taille * 1.22
    const xl = b.genre === 'decision' ? x0 + w / 2 : x0 + pad
    if (k === 0 && tete && l.startsWith(tete)) {
      ctx.font = `700 ${taille}px ${SERIF}`
      ctx.fillText(tete, xl, yl)
      const wt = ctx.measureText(tete).width
      ctx.font = `400 ${taille}px ${SERIF}`
      ctx.fillText(l.slice(tete.length), xl + wt, yl)
    } else {
      ctx.font = `400 ${taille}px ${SERIF}`
      ctx.fillText(l, xl, yl)
    }
  })
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

/** Hypothèses actives dont dépend le bloc, au-dessus du coin haut droit : « sous (i), (iii) » (R37). */
function dessinerTags(ctx: CanvasRenderingContext2D, etat: EtatRendu, tags: string[], xDroite: number, yHaut: number): void {
  if (!tags.length) return
  ctx.font = `italic 400 10px ${SERIF}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = etat.palette.accent
  ctx.fillText(`sous ${tags.join(', ')}`, xDroite, yHaut - 2)
}

function dessinerBloc(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, tags: string[], complet: boolean): void {
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
  // Résultat : double cadre (style `double` de TikZ), écart 2,5 px.
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
  if (complet) dessinerRangee(ctx, vue, etat, b)
  dessinerTags(ctx, etat, tags, x0 + w, y0 - (sousSysteme ? 3 : 0))
}

function dessinerDecision(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, tags: string[], complet: boolean): void {
  const P = etat.palette
  const tl = traitLignee(vue, etat, p)
  dessinerTags(ctx, etat, tags, b.w / 2, -b.haut)
  // Alternative non retenue : sortie non connectée (×) ; le libellé est dans la composition.
  if (complet && b.impasse && lire<boolean>(vue, 'impasses')) {
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
  if (complet) dessinerRangee(ctx, vue, etat, b)
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
 * Nœud-fonction (R19, composé en noir et blanc) : copie décalée (plusieurs énoncés derrière), trait du
 * statut le plus faible ; en-tête « Boîte réduite F1 », nom de la boîte ; broches d'entrée ▶ (numéro et
 * titre de la source), broches de sortie ● (énoncés utilisés dehors) ; pied : effectifs par statut et
 * maillon le plus faible c_min.
 */
function dessinerFonction(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, tags: string[], complet: boolean): void {
  const P = etat.palette
  const u = vue.lecture.unites[p]!
  const noeuds = vue.justification.noeuds
  const ag = agreger(noeuds, u.membres)
  const w = b.w, h = b.h
  const x0 = -w / 2, y0 = -h / 2
  const T = lire<number>(vue, 'taillePolice')
  const tl = traitLignee(vue, etat, p)
  const couleurTrait = tl ? tl.couleur : tags.length ? P.accent : P.encre
  const motif = motifStatut(ag.statut)
  ctx.fillStyle = P.surface
  ctx.fillRect(x0 + 3, y0 - 3, w, h)
  ctx.strokeStyle = rgba(P.encre, 0.6)
  ctx.lineWidth = 0.7
  ctx.setLineDash(motif)
  ctx.strokeRect(x0 + 3, y0 - 3, w, h)
  ctx.fillStyle = P.surface
  ctx.fillRect(x0, y0, w, h)
  ctx.strokeStyle = couleurTrait
  ctx.lineWidth = tl ? tl.largeur : 0.8
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
  dessinerTags(ctx, etat, tags, x0 + w, y0 - 3)
  // Niveau « titre » : le cadre seul (le titre est posé en texte net par dessinerTitre).
  if (!complet) return
  // En-tête : « Boîte réduite F1 » (gras), effectif à droite ; puis le nom de la boîte.
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = P.encre
  const yT = y0 + 6 + T
  ctx.font = `700 ${T}px ${SERIF}`
  const tete = `Boîte réduite ${b.ref}`
  ctx.fillText(tete, x0 + 8, yT)
  ctx.font = `italic 400 ${T - 1}px ${SERIF}`
  ctx.textAlign = 'right'
  ctx.fillStyle = P.gris
  ctx.fillText(`${ag.n} énoncés`, x0 + w - 8, yT)
  ctx.textAlign = 'left'
  ctx.fillStyle = P.encre
  ctx.font = `400 ${T}px ${SERIF}`
  b.lignes.forEach((l, k) => ctx.fillText(l, x0 + 8, yT + 4 + (k + 1) * (T + 3)))
  const br = b.broches
  const page = etat.page!
  if (br) {
    ctx.textBaseline = 'middle'
    const tB = T - 2
    for (const e of br.entrees) {
      const allume = vue.survol === e.source
      ctx.fillStyle = allume ? P.accent : P.encre
      ctx.beginPath()
      ctx.moveTo(x0 + 1, e.y - 3.2)
      ctx.lineTo(x0 + 6, e.y)
      ctx.lineTo(x0 + 1, e.y + 3.2)
      ctx.closePath()
      ctx.fill()
      ctx.textAlign = 'left'
      ctx.font = `700 ${tB}px ${SERIF}`
      const ref = page.boites[e.source]?.ref ?? '?'
      ctx.fillText(ref, x0 + 10, e.y + 0.5)
      const wr = ctx.measureText(ref).width
      ctx.font = `400 ${tB}px ${SERIF}`
      ctx.fillStyle = allume ? P.accent : P.gris
      ctx.fillText(tronquer(ctx, vue.noeud(e.source).nom, w - 20 - wr - 6), x0 + 14 + wr, e.y + 0.5)
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
    for (const sb of br.sorties) {
      ctx.fillStyle = P.encre
      ctx.beginPath()
      ctx.arc(x0 + w - 4.5, sb.y, 2.6, 0, Math.PI * 2)
      ctx.fill()
      ctx.textAlign = 'right'
      ctx.font = `italic 400 ${tB}px ${SERIF}`
      ctx.fillText(tronquer(ctx, noeuds[sb.noeud]!.nom, w - 22), x0 + w - 11, sb.y + 0.5)
    }
  }
  // Pied : effectifs par statut, puis maillon le plus faible (confiance minimale).
  const yPied = y0 + h - T * 1.25 - 5
  ctx.strokeStyle = rgba(P.gris, 0.5)
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(x0 + 6, yPied)
  ctx.lineTo(x0 + w - 6, yPied)
  ctx.stroke()
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = P.gris
  ctx.font = `400 ${T - 2}px ${SERIF}`
  const ps = ag.parStatut
  const detail = [ps.valide ? `${ps.valide} validé${ps.valide > 1 ? 's' : ''}` : '', ps.incertain ? `${ps.incertain} à vérifier` : '', ps.refute ? `${ps.refute} réfuté${ps.refute > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ')
  const cf = ag.confiance.estimation.toFixed(2).replace('.', ',')
  ctx.textAlign = 'right'
  ctx.fillStyle = P.encre
  ctx.font = `italic 400 ${T - 1}px ${SERIF_MATH}`
  const wc = ctx.measureText('c').width
  ctx.font = `400 ${T - 1}px ${SERIF}`
  const suite = ` = ${cf}`
  const wS = ctx.measureText(suite).width
  const yp = yPied + (T * 1.25 + 5) / 2
  ctx.fillText(suite, x0 + w - 8, yp)
  ctx.font = `400 ${(T - 1) * 0.7}px ${SERIF}`
  const wMin = ctx.measureText('min').width
  ctx.fillText('min', x0 + w - 8 - wS, yp + T * 0.22)
  ctx.font = `italic 400 ${T - 1}px ${SERIF_MATH}`
  ctx.fillText('c', x0 + w - 8 - wS - wMin, yp)
  ctx.textAlign = 'left'
  ctx.fillStyle = P.gris
  ctx.font = `400 ${T - 2}px ${SERIF}`
  ctx.fillText(tronquer(ctx, detail, w - 22 - wS - wMin - wc), x0 + 8, yp)
  dessinerRangee(ctx, vue, etat, b)
}

/** Graphiques sous le bloc (repère local du bloc, déjà mis à l'échelle). */
function dessinerFigures(ctx: CanvasRenderingContext2D, etat: EtatRendu, p: number, b: Boite, complet: boolean, s: number): void {
  const figs = etat.figures.get(p)
  if (!figs) return
  const P = etat.palette
  const hF = (b.bas - b.yFigures) / b.figures - ECART_FIGURE
  figs.slice(0, b.figures).forEach((f, k) => {
    const y0 = b.yFigures + k * (hF + ECART_FIGURE)
    if (complet) {
      dessinerFigure(ctx, f.fig, f.legende, -b.w / 2, y0, b.w, { encre: P.encre, gris: P.gris, surface: P.surface, prediction: P.accent })
      return
    }
    // Niveau « titre » : cadre de l'axe et numéro de la figure, sans tracé (corps ≈ 10 px à l'écran).
    const hAxe = hF * 0.55
    ctx.strokeStyle = rgba(P.encre, 0.5)
    ctx.lineWidth = 0.6 / Math.max(0.3, s)
    ctx.strokeRect(-b.w / 2 + 38, y0 + 4, b.w - 44, hAxe)
    ctx.fillStyle = P.gris
    ctx.font = `italic 400 ${Math.min(hAxe * 0.5, 10 / Math.max(0.2, s))}px ${SERIF}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(tronquer(ctx, `Figure ${f.numero}`, b.w - 50), 19, y0 + 4 + hAxe / 2)
  })
}

/** Rectangles des blocs d'une boîte qu'on vient de réduire, qui se resserrent vers le nœud-fonction (R19). */
function dessinerFantomes(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu): void {
  const f = etat.fantomes
  const page = etat.page
  if (!f || !page) return
  const t = Math.min(1, (performance.now() - f.debut) / Math.max(1, f.duree))
  if (t >= 1) {
    etat.fantomes = null
    return
  }
  let cible = -1
  for (let p = 0; p < vue.nU; p++) if (page.boites[p]!.genre === 'fonction' && page.boites[p]!.sousProbleme === f.groupe) cible = p
  if (cible < 0) return
  const e = 1 - Math.pow(1 - t, 3)
  const s0 = vue.camera.pixelsParUnite() * page.echelle
  const sc = echelle(vue, page, cible)
  const bc = page.boites[cible]!
  const xc = vue.projection.x[cible]!, yc = vue.projection.y[cible]!
  ctx.save()
  ctx.lineWidth = 0.8
  for (const b of f.boites) {
    const q = vue.camera.projeterPoint([b.x, 0, b.z])
    const x = q.x + (xc - q.x) * e, y = q.y + (yc - q.y) * e
    const w = b.w * s0 + (bc.w * sc - b.w * s0) * e
    const h = b.h * s0 + (bc.h * sc - b.h * s0) * e
    ctx.fillStyle = rgba(f.couleur, 0.08 * (1 - e))
    ctx.fillRect(x - w / 2, y - h / 2, w, h)
    ctx.strokeStyle = rgba(f.couleur, 0.8 * (1 - e))
    ctx.strokeRect(x - w / 2, y - h / 2, w, h)
  }
  ctx.restore()
  vue.demanderRendu()
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
  // Barres de titre des boîtes : « ouvrir ↗ » avant la barre entière ; imbriquées avant leur parent.
  for (const genre of ['ouvrir', 'titre'] as const) {
    for (let k = etat.ciblesGroupes.length - 1; k >= 0; k--) {
      const c = etat.ciblesGroupes[k]!
      if (c.genre === genre && x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) return c
    }
  }
  return null
}
