// R38 · Rendu « figure LaTeX » sur les calques canvas de la vue (le texte composé est dans texte.ts).
//
// - Dessous : axe des rangs logiques en haut (graduations, étiquettes 0 1 2…, titre « rang logique »,
//   comme un axe pgfplots), accolades TikZ (decorations.pathreplacing) nommant les zones, liaisons
//   orthogonales au trait fin avec pointe « to » de TikZ, jonctions en point plein (circuitikz),
//   sous-arguments dépliés (cadre trait-point), liens sémantiques étiquetés en italique.
// - Dessus : cadres des blocs (rectangle, trait fin) ; résultat en double trait (TikZ `double`) ;
//   sous-argument replié en ombre recopiée (`copy shadow`) ; hypothèses en boîte grisée (`fill=black!5`) ;
//   décisions en losange (`diamond`) avec la sortie non retenue terminée par une croix ; citations de
//   renvoi « (4) » et bornes de contexte encadrées (\fbox) sous le bloc ; « ⊢ (H1) » au survol.
// - Statut par le motif du trait : plein = validé, tireté = à vérifier, barré = réfuté, pointillé =
//   piste abandonnée. Noir sur blanc, un seul bleu pour le survol, la sélection et l'aval.

import { rgba, type ContexteDessinR, type ValeurReglage, type VueRaisonnement } from '../../src/raisonnement'
import { SERIF, type Boite, type MiseEnPage } from './mise-en-page'
import { etatSquelette } from './squelette'

export interface PaletteR38 {
  encre: string
  gris: string
  trait: string
  surface: string
  surface2: string
  accent: string
}

export function lirePaletteR38(el: HTMLElement): PaletteR38 {
  const s = getComputedStyle(el)
  const v = (n: string, d: string) => s.getPropertyValue(n).trim() || d
  return {
    encre: v('--texte', '#111111'),
    gris: v('--texte-doux', '#6b6b6b'),
    trait: v('--arete', '#1a1a1a'),
    surface: v('--surface', '#ffffff'),
    surface2: v('--surface-2', '#f2f2f2'),
    accent: v('--accent', '#1f4aa8'),
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
  palette: PaletteR38
  cibles: Cible[]
  /** Élément survolé (déterminé par cibleSous). */
  survol: Cible | null
  /** Hypothèses épinglées (points) : leurs repères restent affichés sur les blocs dépendants. */
  epingles: Set<number>
  /** Hypothèses de modélisation présentes (point → repère « H1 »). */
  hypotheses: Map<number, string>
}

const lire = <T extends ValeurReglage>(vue: VueRaisonnement, cle: string) => vue.reglages.lire<T>(cle)
const police = (taille: number, style = '') => `${style ? style + ' ' : ''}400 ${taille}px ${SERIF}`

/** Écran : px par px de mise en page au point p. */
export function echelle(vue: VueRaisonnement, page: MiseEnPage, p: number): number {
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

/** Repères des hypothèses actives dont le point dépend. */
export function tagsDe(vue: VueRaisonnement, etat: EtatRendu, p: number): string[] {
  const page = etat.page
  if (!page) return []
  const actifs = choixActifs(vue, etat)
  const toujours = lire<string>(vue, 'bandesChoix') === 'toujours'
  const tags: string[] = []
  for (const [q, ref] of etat.hypotheses) {
    if (q === p) continue
    if ((toujours || actifs.includes(q)) && page.portees.get(q)?.includes(p)) tags.push(ref)
  }
  return tags
}

// ─── Primitives ──────────────────────────────────────────────────────────────

function polyligne(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]): void {
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k]!.x, pts[k]!.y)
}

/** Pointe « to » de TikZ (celle de `->`) : deux barbes incurvées qui se rejoignent à la pointe. */
function pointeTo(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, t: number): void {
  const l = Math.hypot(dx, dy) || 1
  const ux = dx / l, uy = dy / l
  const nx = -uy, ny = ux
  const L = t * 1.9, W = t * 1.25
  ctx.beginPath()
  for (const sg of [1, -1]) {
    ctx.moveTo(x - ux * L + nx * W * sg, y - uy * L + ny * W * sg)
    ctx.quadraticCurveTo(x - ux * L * 0.25 + nx * W * 0.12 * sg, y - uy * L * 0.25 + ny * W * 0.12 * sg, x, y)
  }
  ctx.stroke()
}

/** Motifs TikZ (en px à l'échelle 1) : dashed = 3pt/3pt, dotted = 1pt/2pt. */
const TIRETE = [4, 3]
const POINTILLE = [1, 2.2]

function motifStatut(statut: string, abandon: boolean): number[] {
  if (abandon) return POINTILLE
  return statut === 'incertain' ? TIRETE : []
}

/** Accolade horizontale (pointe vers le haut), de x0 à x1, base en y, amplitude a. */
function accolade(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, a: number): void {
  const xm = (x0 + x1) / 2
  const r = Math.min(a, (x1 - x0) / 4)
  ctx.beginPath()
  ctx.moveTo(x0, y)
  ctx.quadraticCurveTo(x0, y - r, x0 + r, y - r)
  ctx.lineTo(xm - r, y - r)
  ctx.quadraticCurveTo(xm, y - r, xm, y - 2 * r)
  ctx.quadraticCurveTo(xm, y - r, xm + r, y - r)
  ctx.lineTo(x1 - r, y - r)
  ctx.quadraticCurveTo(x1, y - r, x1, y)
  ctx.stroke()
}

// ─── Calque « dessous » : axe, accolades, liaisons, jonctions ─────────────────

export function dessinerDessous(c: ContexteDessinR, etat: EtatRendu): void {
  const { ctx, vue } = c
  const page = etat.page
  if (!page || !page.boites.length) return
  const e = vue.extrusion
  const cam = vue.camera
  const E = page.echelle
  const monde = (x: number, y: number, yw = 0): [number, number, number] => [(x - page.cx) * E, yw, -(y - page.cy) * E]
  const s0 = cam.pixelsParUnite() * E

  // Axe et accolades (s'estompent en 3D).
  const alpha = Math.max(0, 1 - e * 1.6)
  if (alpha > 0.01 && lire<boolean>(vue, 'enTetes')) dessinerAxe(ctx, vue, etat, monde, s0, alpha)

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
  const epaisseur = Math.max(0.7, Math.min(1.1, 0.95 * s0))
  ctx.save()
  ctx.lineJoin = 'miter'
  ctx.lineCap = 'butt'
  for (const r of page.routes) {
    const a = g.aretes[r.arete]
    if (!a) continue
    const os = vue.opaciteAffichee[r.source]!, oc = vue.opaciteAffichee[r.cible]!
    let alphaR = Math.min(1, Math.max(0.12, Math.min(os, oc)) * 1.1) * 0.95
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
        largeur = epaisseur + 0.8
      } else alphaR *= 0.35
    }
    if (actifs && !(actifs.has(r.source) && actifs.has(r.cible))) alphaR *= 0.3
    if (r.abandon) {
      couleur = P.gris
      ctx.setLineDash(POINTILLE)
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
    ctx.lineCap = 'round'
    pointeTo(ctx, z.x, z.y, z.x - y.x, z.y - y.y, Math.max(2.2, Math.min(3.6, 3.1 * s0)))
    ctx.lineCap = 'butt'
  }
  // Jonctions : point plein là où une sortie se divise (convention des schémas de circuit).
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

  // Décision → hypothèse dans la marge : trait coudé vers la boîte d'hypothèse.
  ctx.save()
  ctx.lineCap = 'round'
  for (const l of page.liensMarge) {
    const pr = vue.projection
    const s = echelle(vue, page, l.source)
    const bc = page.boites[l.cible]!
    const xm = pr.x[l.cible]! - (bc.w / 2 - 12) * s
    const ya = pr.y[l.source]!, yb = pr.y[l.cible]! - (bc.h / 2) * s
    const xa = pr.x[l.source]! - 19 * s
    const op = Math.min(vue.opaciteAffichee[l.source]!, vue.opaciteAffichee[l.cible]!)
    ctx.strokeStyle = rgba(P.trait, 0.9 * op)
    ctx.lineWidth = epaisseur
    ctx.beginPath()
    polyligne(ctx, [{ x: xa, y: ya }, { x: xm, y: ya }, { x: xm, y: yb }])
    ctx.stroke()
    pointeTo(ctx, xm, yb, 0, 1, 3)
  }
  ctx.restore()

  if (lire<boolean>(vue, 'liensSemantiques')) dessinerLiensSemantiques(c, etat)
}

/**
 * Axe des rangs logiques (pgfplots, axe en haut) et accolades des zones au-dessus. Les coordonnées
 * sont celles de la mise en page ; l'échelle s0 convertit en px écran.
 */
function dessinerAxe(
  ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu,
  monde: (x: number, y: number) => [number, number, number], s0: number, alpha: number,
): void {
  const page = etat.page!
  const P = etat.palette
  const cam = vue.camera
  const b = page.bornes
  const o = cam.projeterPoint(monde(b.x0, b.y0))
  if (!o.visible) return
  const X = (x: number) => o.x + (x - b.x0) * s0
  const Y = (y: number) => o.y + (y - b.y0) * s0
  const t = Math.max(7.5, Math.min(13, 11 * s0))
  ctx.save()
  ctx.lineCap = 'butt'
  // Axe : ligne de base sur l'étendue des rangs (demi-pas de part et d'autre).
  if (page.xRangs.length) {
    const pas = page.xRangs.length > 1 ? page.xRangs[1]! - page.xRangs[0]! : page.largeurCarte + 40
    const xa = page.xRangs[0]! - pas / 2, xb = page.xRangs[page.xRangs.length - 1]! + pas / 2
    const yA = b.y0 - 26
    ctx.strokeStyle = rgba(P.encre, 0.9 * alpha)
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(X(xa), Y(yA))
    ctx.lineTo(X(xb), Y(yA))
    // Graduations principales (rangs) vers le bas, secondaires (demi-rangs) plus courtes.
    for (const x of page.xRangs) {
      ctx.moveTo(X(x), Y(yA))
      ctx.lineTo(X(x), Y(yA) + 4.5 * Math.min(1.3, s0))
    }
    for (let k = 0; k <= page.xRangs.length; k++) {
      const x = xa + k * pas
      ctx.moveTo(X(x), Y(yA))
      ctx.lineTo(X(x), Y(yA) + 2.2 * Math.min(1.3, s0))
    }
    ctx.stroke()
    ctx.fillStyle = rgba(P.encre, alpha)
    ctx.font = police(t)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    page.xRangs.forEach((x, r) => ctx.fillText(String(r), X(x), Y(yA) - 3 * Math.min(1.3, s0)))
    // Titre de l'axe, en italique, à droite (comme un xlabel placé au bout de l'axe).
    ctx.font = police(t, 'italic')
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('rang logique', X(xb) + 6 * s0, Y(yA))
  }
  // Accolades des zones, au-dessus de l'axe, étiquette en italique au-dessus de la pointe.
  const yB = b.y0 - 50
  ctx.strokeStyle = rgba(P.encre, 0.85 * alpha)
  ctx.lineWidth = 0.8
  ctx.font = police(t, 'italic')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  for (const z of page.zones) {
    const xa = X(z.x0 + 6), xb = X(z.x1 - 6)
    if (xb - xa < 12) continue
    accolade(ctx, xa, xb, Y(yB), 5 * Math.min(1.4, s0))
    const nom = z.nom.charAt(0).toLowerCase() + z.nom.slice(1)
    ctx.fillStyle = rgba(P.encre, alpha)
    if (ctx.measureText(nom).width < xb - xa + 30) ctx.fillText(nom, (xa + xb) / 2, Y(yB) - 12 * Math.min(1.4, s0))
  }
  ctx.restore()
}

/** Sous-arguments dépliés : cadre trait-point autour de chaque bloc issu du dépliage. */
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
      ctx.setLineDash([7, 2.5, 1.2, 2.5])
      ctx.lineWidth = 0.8
      ctx.strokeRect(x - (l + 7) * s, y - (b.haut + 7) * s, (2 * l + 14) * s, (b.haut + b.bas + 12) * s)
      ctx.setLineDash([])
      if (j.noeuds[g.unites[p]!.conclusion]!.id === tete) {
        ctx.font = police(Math.max(8, 10 * s), 'italic')
        ctx.textAlign = 'right'
        ctx.textBaseline = 'bottom'
        ctx.fillStyle = rgba(P.accent, op)
        ctx.fillText(`sous-argument ouvert (${pts.length}) — double-clic : refermer`, x + (l + 7) * s, y - (b.haut + 9) * s)
      }
    }
  }
  ctx.restore()
}

/** Contradictions, résolutions, abandons : crochets au-dessus des blocs, étiquette en italique. */
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
      ctx.strokeStyle = rgba(couleur, 0.85 * op)
      ctx.lineWidth = 0.8
      ctx.setLineDash(l.genre === 'contredit' ? TIRETE : l.genre === 'resout' ? [] : POINTILLE)
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x1, my)
      ctx.lineTo(x2, my)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      ctx.setLineDash([])
      const texte = l.genre === 'contredit' ? 'contredit' : l.genre === 'resout' ? 'résout' : l.genre === 'abandonne' ? 'abandonne' : 'remplace'
      ctx.font = police(Math.max(8.5, Math.min(12, 10.5 * Math.min(sa, sb))), 'italic')
      const tx = (x1 + x2) / 2
      const w = ctx.measureText(texte).width + 6
      ctx.fillStyle = rgba(P.surface, op)
      ctx.fillRect(tx - w / 2, my - 7, w, 14)
      ctx.fillStyle = rgba(couleur, op)
      ctx.fillText(texte, tx, my)
    }
  }
  ctx.restore()
}

// ─── Calque « dessus » : cadres, décisions, hypothèses ───────────────────────

export function dessinerDessus(c: ContexteDessinR, etat: EtatRendu): void {
  const { ctx, vue } = c
  const page = etat.page
  etat.cibles = []
  if (!page) return
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
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r)
    ctx.strokeRect(x - r + 0.5, y - r + 0.5, 2 * r - 1, 2 * r - 1)
    if (s > 0.55) {
      ctx.font = police(10.5 * Math.min(1.3, s), 'italic')
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
    const tags = tagsDe(vue, etat, p)
    if (b.genre === 'drapeau') dessinerHypothese(ctx, vue, etat, p, b)
    else if (b.genre === 'decision') dessinerDecision(ctx, vue, etat, p, b, tags)
    else dessinerBloc(ctx, vue, etat, p, b, tags)
    ctx.restore()
    // Cibles (écran).
    const x = pr.x[p]!, y = pr.y[p]!
    if (b.genre === 'decision') {
      const l = Math.max(19, b.w / 2)
      etat.cibles.push({ genre: 'carte', point: p, noeud: -1, x0: x - l * s, y0: y - b.haut * s, x1: x + l * s, y1: y + 22 * s })
      if (b.impasse && lire<boolean>(vue, 'impasses')) etat.cibles.push({ genre: 'impasse', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y + 22 * s, x1: x + (b.w / 2) * s, y1: y + (33 + b.hRejet) * s })
    } else if (b.genre === 'drapeau') etat.cibles.push({ genre: 'drapeau', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y - (b.h / 2) * s, x1: x + (b.w / 2) * s, y1: y + (b.h / 2) * s })
    else etat.cibles.push({ genre: 'carte', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y - (b.h / 2) * s, x1: x + (b.w / 2) * s, y1: y + (b.h / 2) * s })
    const y0 = yPastilles(b)
    for (const it of rangee(vue, b)) {
      const cx = x + it.x * s, cy = y + y0 * s
      if (it.renvoi >= 0) etat.cibles.push({ genre: 'renvoi', point: it.renvoi, noeud: -1, x0: cx - 16 * s, y0: cy - 7 * s, x1: cx + 16 * s, y1: cy + 7 * s })
      else etat.cibles.push({ genre: 'pastille', point: p, noeud: it.noeud, x0: cx - 7 * s, y0: cy - 7 * s, x1: cx + 7 * s, y1: cy + 7 * s })
    }
  }
}

/** Ordonnée (relative au point d'ancrage) de la rangée de citations et de bornes. */
function yPastilles(b: Boite): number {
  if (b.genre === 'decision') return 19 + (b.impasse ? 14 + b.hRejet : 4) + 9
  return b.h / 2 + 12
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

/** Rangée sous le bloc : citations de renvoi puis bornes de contexte (abscisses relatives). */
function rangee(vue: VueRaisonnement, b: Boite): { x: number; renvoi: number; noeud: number }[] {
  const r: { x: number; renvoi: number; noeud: number }[] = []
  let x = -b.w / 2 + 4
  for (const q of b.renvois) {
    r.push({ x: x + 16, renvoi: q, noeud: -1 })
    x += 36
  }
  x += 4
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
  // Citations de renvoi : « cf. (4) » en romain, comme une référence dans le texte.
  ctx.font = police(10)
  for (const it of items) {
    if (it.renvoi < 0) continue
    const cite = etat.page?.boites[it.renvoi]?.citation ?? '?'
    const allume = sv?.genre === 'renvoi' && sv.point === it.renvoi
    ctx.fillStyle = allume ? P.accent : P.encre
    ctx.fillText(cite, it.x, y + 0.5)
    if (allume) {
      const w = ctx.measureText(cite).width
      ctx.strokeStyle = P.accent
      ctx.lineWidth = 0.6
      ctx.beginPath()
      ctx.moveTo(it.x - w / 2, y + 6)
      ctx.lineTo(it.x + w / 2, y + 6)
      ctx.stroke()
    }
  }
  // Bornes de contexte : lettre encadrée (\fbox), trait fin.
  ctx.font = police(8.5)
  const bornes = items.filter((it) => it.renvoi < 0)
  bornes.forEach((it, k) => {
    const pa = b.pastilles[k]!
    const allume = sv?.genre === 'pastille' && sv.noeud === pa.noeud
    const x = it.x
    ctx.fillStyle = allume ? P.accent : P.surface
    ctx.fillRect(x - 5.5, y - 5.5, 11, 11)
    ctx.strokeStyle = allume ? P.accent : rgba(P.encre, 0.75)
    ctx.lineWidth = 0.6
    ctx.strokeRect(x - 5.5, y - 5.5, 11, 11)
    ctx.fillStyle = allume ? P.surface : P.encre
    ctx.fillText(pa.lettre, x, y + 0.5)
  })
  if (b.plus) {
    ctx.fillStyle = P.gris
    ctx.font = police(9)
    ctx.textAlign = 'left'
    const dernier = items[items.length - 1]!
    ctx.fillText(`+${b.plus}`, dernier.x + 8, y + 0.5)
  }
}

/** « ⊢ (H1), (H3) » au-dessus du coin haut droit : le bloc dépend de ces hypothèses. */
function dessinerTags(ctx: CanvasRenderingContext2D, etat: EtatRendu, tags: string[], xDroite: number, yHaut: number): void {
  if (!tags.length) return
  ctx.font = police(10)
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
  const couleurTrait = tl ? tl.couleur : b.abandon ? P.gris : tags.length ? P.accent : P.encre
  const largeurTrait = tl ? tl.largeur : 0.8
  const motif = motifStatut(n.statut, b.abandon)
  // Sous-argument replié : ombre recopiée (TikZ `copy shadow`), décalée vers le bas à droite.
  if (sousArgument) {
    ctx.fillStyle = P.surface
    ctx.fillRect(x0 + 3, y0 + 3, w, h)
    ctx.strokeStyle = rgba(b.abandon ? P.gris : P.encre, 0.7)
    ctx.lineWidth = 0.6
    ctx.setLineDash(motif)
    ctx.strokeRect(x0 + 3, y0 + 3, w, h)
    ctx.setLineDash([])
  }
  ctx.fillStyle = P.surface
  ctx.fillRect(x0, y0, w, h)
  // Contour : motif du statut ; résultat : double trait (TikZ `double`).
  ctx.strokeStyle = couleurTrait
  ctx.setLineDash(motif)
  if (majeur) {
    ctx.lineWidth = Math.max(0.7, largeurTrait * 0.85)
    ctx.strokeRect(x0, y0, w, h)
    ctx.strokeRect(x0 - 2.5, y0 - 2.5, w + 5, h + 5)
  } else {
    ctx.lineWidth = largeurTrait
    ctx.strokeRect(x0, y0, w, h)
  }
  ctx.setLineDash([])
  // Réfuté : barré (diagonale, comme la forme `cross out`).
  if (n.statut === 'refute') {
    ctx.strokeStyle = rgba(couleurTrait, 0.75)
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(x0, y0 + h)
    ctx.lineTo(x0 + w, y0)
    ctx.stroke()
  }
  dessinerRangee(ctx, vue, etat, b)
  dessinerTags(ctx, etat, tags, x0 + w + (majeur ? 2.5 : 0), y0 - (majeur ? 2.5 : 0))
}

function dessinerDecision(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, tags: string[]): void {
  const P = etat.palette
  const tl = traitLignee(vue, etat, p)
  dessinerTags(ctx, etat, tags, b.w / 2, -19 - 6 - b.hLibelle)
  // Alternative non retenue : sortie tiretée terminée par une croix ; le texte est dans la couche HTML.
  if (b.impasse && lire<boolean>(vue, 'impasses')) {
    ctx.strokeStyle = P.gris
    ctx.lineWidth = 0.8
    ctx.setLineDash([2.5, 2])
    ctx.beginPath()
    ctx.moveTo(0, 19)
    ctx.lineTo(0, 26)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(-3, 25)
    ctx.lineTo(3, 31)
    ctx.moveTo(3, 25)
    ctx.lineTo(-3, 31)
    ctx.stroke()
  }
  // Losange.
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
  ctx.font = police(10.5)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(b.ref, 0, 0.5)
  dessinerRangee(ctx, vue, etat, b)
}

/** Hypothèse de modélisation : boîte grisée (fill=black!5), trait fin ; bleue si active. */
function dessinerHypothese(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite): void {
  const P = etat.palette
  const epingle = etat.epingles.has(p)
  const actif = epingle || (etat.survol?.genre === 'drapeau' && etat.survol.point === p)
  const w = b.w, h = b.h
  const x0 = -w / 2, y0 = -h / 2
  const tl = traitLignee(vue, etat, p)
  ctx.fillStyle = P.surface2
  ctx.fillRect(x0, y0, w, h)
  ctx.strokeStyle = tl ? tl.couleur : actif ? P.accent : P.encre
  ctx.lineWidth = tl ? tl.largeur : actif ? 1.3 : 0.6
  ctx.strokeRect(x0, y0, w, h)
  if (epingle) {
    // Épinglée : petite marque en coin (onglet plein).
    ctx.fillStyle = P.accent
    ctx.beginPath()
    ctx.moveTo(x0 + w - 9, y0)
    ctx.lineTo(x0 + w, y0)
    ctx.lineTo(x0 + w, y0 + 9)
    ctx.closePath()
    ctx.fill()
  }
}

// ─── Survol ──────────────────────────────────────────────────────────────────

/** Élément sous le pointeur (écran), d'après la dernière image. */
export function cibleSous(etat: EtatRendu, x: number, y: number): Cible | null {
  // Bornes, citations et alternatives d'abord (petites, au-dessus des blocs voisins).
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
