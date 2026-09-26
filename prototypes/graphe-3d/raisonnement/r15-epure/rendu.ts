// R15 · Épure — rendu sur les calques de la vue. Principe (Tufte) : maximum d'encre utile, aucune
// décoration. Pas de cartes ni de boîtes : du texte posé sur la page, des filets fins, la hiérarchie
// par la graisse, la taille et l'espacement. Une seule couleur d'accent, réservée à la sélection
// (survol, lignée, choix épinglé). Sigma ne dessine plus que les liens complets (L).

import { rgba, type ContexteDessinR, type ValeurReglage, type VueRaisonnement } from '../../src/raisonnement'
import type { Boite, MiseEnPage, Note } from './mise-en-page'
import { etatSquelette } from './squelette'

export interface PaletteR15 {
  /** Police de la page (serif de livre). */
  serif: string
  encre: string
  encreDouce: string
  /** Filets des déductions. */
  filet: string
  /** Gris léger : pistes abandonnées, branches rejetées, échelles. */
  pale: string
  accent: string
  fond: string
}

export function lirePalette(el: HTMLElement): PaletteR15 {
  const s = getComputedStyle(el)
  const v = (n: string, d: string) => s.getPropertyValue(n).trim() || d
  return {
    serif: v('--r15-serif', "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif"),
    encre: v('--r15-encre', '#111111'),
    encreDouce: v('--r15-encre-douce', '#6b6b6b'),
    filet: v('--r15-filet', '#8c8c8c'),
    pale: v('--r15-pale', '#bdbdbd'),
    accent: v('--r15-accent', '#a3312a'),
    fond: v('--fond', '#fffff8'),
  }
}

/** Élément interactif dessiné à la dernière image (pour le survol). */
export interface Cible {
  genre: 'carte' | 'pastille' | 'renvoi' | 'drapeau' | 'impasse' | 'masque'
  point: number
  /** Nœud de justification (note de contexte). */
  noeud: number
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface EtatRendu {
  page: MiseEnPage | null
  palette: PaletteR15
  cibles: Cible[]
  /** Élément survolé (déterminé par cibleSous). */
  survol: Cible | null
  /** Choix épinglés (points) : leur portée reste marquée. */
  epingles: Set<number>
  /** Numéro de chaque choix (point → k, affiché « Ck »). */
  numeroChoix: Map<number, number>
}

const lire = <T extends ValeurReglage>(vue: VueRaisonnement, cle: string) => vue.reglages.lire<T>(cle)
const police = (etat: EtatRendu, poids: number, taille: number, italique = false) =>
  `${italique ? 'italic ' : ''}${poids} ${taille}px ${etat.palette.serif}`
/** Nombre à la française : 0,82. */
const decimal = (x: number) => x.toFixed(2).replace('.', ',')

/** Écran : px par px de mise en page au point p. */
function echelle(vue: VueRaisonnement, page: MiseEnPage, p: number): number {
  return vue.camera.pixelsParUnite() * (vue.projection.echelle[p] || 1) * page.echelle
}

/** Choix (points) actifs : survolé + épinglés. */
export function choixActifs(_vue: VueRaisonnement, etat: EtatRendu): number[] {
  const r = [...etat.epingles]
  const s = etat.survol
  if (s && s.genre === 'drapeau' && !etat.epingles.has(s.point)) r.push(s.point)
  return r
}

/** Points qui dépendent d'au moins un choix actif (pour atténuer le reste). */
export function dependantsActifs(vue: VueRaisonnement, etat: EtatRendu): Set<number> | null {
  const page = etat.page
  if (!page) return null
  const actifs = choixActifs(vue, etat)
  if (!actifs.length) return null
  const s = new Set<number>(actifs)
  for (const c of actifs) for (const q of page.portees.get(c) ?? []) s.add(q)
  return s
}

/** Notes « allumées » : note ou appel survolé, ou notes de l'énoncé survolé. */
function notesAllumees(vue: VueRaisonnement, etat: EtatRendu): Set<number> | null {
  const sv = etat.survol
  if (sv?.genre === 'pastille') return new Set([sv.noeud])
  const p = vue.survol
  if (p !== null && p < vue.nU && etat.page) {
    const b = etat.page.boites[p]
    if (b) return new Set(b.pastilles.map((pa) => pa.noeud))
  }
  return null
}

// ─── Chemins ─────────────────────────────────────────────────────────────────

/** Ligne brisée à coins arrondis (écran). */
function tracerArrondi(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], rayon: number): void {
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  for (let k = 1; k < pts.length - 1; k++) {
    const a = pts[k - 1]!, b = pts[k]!, c = pts[k + 1]!
    const r = Math.min(rayon, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2)
    ctx.arcTo(b.x, b.y, c.x, c.y, Math.max(0.01, r))
  }
  const z = pts[pts.length - 1]!
  ctx.lineTo(z.x, z.y)
}

/** Courbe lissée passant par les stations (tangentes horizontales). */
function tracerLisse(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]): void {
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1]!, b = pts[k]!
    const dx = (b.x - a.x) * 0.5
    ctx.bezierCurveTo(a.x + dx, a.y, b.x - dx, b.y, b.x, b.y)
  }
}

/** Pointe ouverte, deux traits fins (optionnelle : la lecture va toujours de gauche à droite). */
function pointe(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, t: number): void {
  const l = Math.hypot(dx, dy) || 1
  const ux = dx / l, uy = dy / l
  ctx.beginPath()
  ctx.moveTo(x - ux * t - uy * t * 0.55, y - uy * t + ux * t * 0.55)
  ctx.lineTo(x, y)
  ctx.lineTo(x - ux * t + uy * t * 0.55, y - uy * t - ux * t * 0.55)
  ctx.stroke()
}

// ─── Calque « dessous » : titres de colonnes, filets ──────────────────────────

export function dessinerDessous(c: ContexteDessinR, etat: EtatRendu): void {
  const { ctx, vue } = c
  const page = etat.page
  if (!page || !page.boites.length) return
  const pal = etat.palette
  const e = vue.extrusion
  const cam = vue.camera
  const E = page.echelle
  const monde = (x: number, y: number, yw = 0): [number, number, number] => [(x - page.cx) * E, yw, -(y - page.cy) * E]
  const s0 = cam.pixelsParUnite() * E

  // Titres de colonnes : italique bas de casse, un filet dessous ; ni bandes, ni flèches.
  if (lire<boolean>(vue, 'enTetes') && page.zones.length) {
    const alpha = Math.max(0, 1 - e * 1.6)
    const yH = page.bornes.y0 - 38
    ctx.save()
    for (const z of page.zones) {
      if (z.nom === 'notes' && !lire<boolean>(vue, 'notesMarge')) continue
      const a = cam.projeterPoint(monde(z.x0, yH)), b = cam.projeterPoint(monde(z.x1, yH))
      if (!a.visible || !b.visible || alpha < 0.01) continue
      const taille = Math.max(9, Math.min(17, 13 * s0))
      ctx.font = police(etat, 400, taille, true)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = rgba(pal.encreDouce, alpha)
      const g = cam.projeterPoint(monde(z.x0 + 12, yH))
      if (ctx.measureText(z.nom).width < Math.abs(b.x - a.x) - 12) ctx.fillText(z.nom, g.x, g.y)
      const f0 = cam.projeterPoint(monde(z.x0 + 12, yH + 7)), f1 = cam.projeterPoint(monde(z.x1 - 12, yH + 7))
      ctx.strokeStyle = rgba(pal.pale, 0.9 * alpha)
      ctx.lineWidth = 0.6
      ctx.beginPath()
      ctx.moveTo(f0.x, f0.y)
      ctx.lineTo(f1.x, f1.y)
      ctx.stroke()
    }
    ctx.restore()
  }

  // Filets de lecture.
  const pos = vue.positions
  const d = vue.disposition
  let transition = false
  for (let p = 0; p < vue.nU; p++) {
    if (Math.abs(pos[p * 3]! - d.x[p]!) + Math.abs(pos[p * 3 + 2]! - d.z[p]!) > 1e-4) {
      transition = true
      break
    }
  }
  const lisse = lire<string>(vue, 'aretes') === 'lissees'
  const rayon = lire<number>(vue, 'rayonCoins')
  const pointes = lire<boolean>(vue, 'pointes')
  const epaisseur = lire<number>(vue, 'epaisseurFilet')
  const actifs = dependantsActifs(vue, etat)
  const survol = vue.survol
  const g = vue.lecture
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  for (const r of page.routes) {
    if (!g.aretes[r.arete]) continue
    const os = vue.opaciteAffichee[r.source]!, oc = vue.opaciteAffichee[r.cible]!
    let alpha = Math.min(1, Math.max(0.12, Math.min(os, oc)) * 1.1) * 0.85
    let couleur = pal.filet
    let largeur = epaisseur
    if (survol !== null && (r.source === survol || r.cible === survol)) {
      couleur = pal.accent
      alpha = 0.95
      largeur = epaisseur * 1.5
    }
    if (vue.ligneeActive) {
      const ls = vue.lignee[r.source]!, lc = vue.lignee[r.cible]!
      const dans = ls > 0 && lc > 0 && !(ls === 2 && lc === 1) && !(ls === 1 && lc === 2) && !(ls === 3 && lc === 1) && !(ls === 2 && lc === 3)
      if (dans) {
        // Une seule couleur d'accent : ancêtres en trait plein, descendants un ton plus léger.
        couleur = pal.accent
        alpha = ls === 2 || lc === 2 ? 0.55 : 0.95
        largeur = epaisseur * 1.5
      } else alpha *= 0.4
    }
    if (actifs && !(actifs.has(r.source) && actifs.has(r.cible))) alpha *= 0.3
    if (r.abandon) {
      couleur = pal.pale
      ctx.setLineDash([2.5, 3])
    } else ctx.setLineDash([])
    let pts: { x: number; y: number }[]
    const ss = echelle(vue, page, r.source), sc = echelle(vue, page, r.cible)
    const bs = page.boites[r.source]!, bc = page.boites[r.cible]!
    const pr = vue.projection
    ctx.strokeStyle = rgba(couleur, alpha)
    ctx.lineWidth = largeur
    if (transition) {
      // Pendant une transition : une courbe directe entre les ports courants.
      pts = [{ x: pr.x[r.source]! + bs.portD * ss, y: pr.y[r.source]! }, { x: pr.x[r.cible]! + bc.portG * sc, y: pr.y[r.cible]! }]
      ctx.beginPath()
      tracerLisse(ctx, pts)
      ctx.stroke()
      continue
    }
    if (e > 0.02) {
      // 3D : route projetée, profondeur interpolée le long du chemin.
      const y0 = pos[r.source * 3 + 1]!, y1 = pos[r.cible * 3 + 1]!
      const n = r.points.length
      pts = r.points.map(([x, y], k) => cam.projeterPoint(monde(x, y, y0 + (y1 - y0) * (n > 1 ? k / (n - 1) : 0))))
    } else pts = r.points.map(([x, y]) => cam.projeterPoint(monde(x, y)))
    ctx.beginPath()
    if (lisse) {
      const stations = pts.filter((_, k) => k === 0 || k === pts.length - 1 || (k < pts.length - 1 && Math.abs(pts[k]!.y - pts[k + 1]!.y) < 0.5 && Math.abs(pts[k]!.x - pts[k + 1]!.x) > 20))
      tracerLisse(ctx, stations)
    } else tracerArrondi(ctx, pts, rayon * Math.min(1.5, s0))
    ctx.stroke()
    if (pointes) {
      const z = pts[pts.length - 1]!, y = pts[pts.length - 2] ?? pts[0]!
      ctx.setLineDash([])
      pointe(ctx, z.x, z.y, lisse ? 1 : z.x - y.x, lisse ? 0 : z.y - y.y, 3.5 * Math.min(1.3, s0) + 1)
    }
  }
  ctx.setLineDash([])
  ctx.restore()

  // Décision → choix de la marge : un filet coudé vers le choix qu'elle fixe.
  ctx.save()
  for (const l of page.liensMarge) {
    const pr = vue.projection
    const s = echelle(vue, page, l.source)
    const bc = page.boites[l.cible]!
    const xm = pr.x[l.cible]! - (bc.w / 2 + 8) * s
    const ya = pr.y[l.source]!, yb = pr.y[l.cible]! + bc.yLignes[0]! * s - bc.taille * 0.3 * s
    const xa = pr.x[l.source]! - 5 * s
    const op = Math.min(vue.opaciteAffichee[l.source]!, vue.opaciteAffichee[l.cible]!)
    ctx.strokeStyle = rgba(pal.filet, 0.85 * op)
    ctx.lineWidth = epaisseur
    ctx.beginPath()
    tracerArrondi(ctx, [{ x: xa, y: ya }, { x: xm, y: ya }, { x: xm, y: yb }, { x: xm + 4 * s, y: yb }], 5 * s)
    ctx.stroke()
  }
  ctx.restore()

  if (lire<boolean>(vue, 'liensSemantiques')) dessinerLiensSemantiques(c, etat)
}

/** Contradictions, résolutions, abandons : arcs fins au-dessus du texte, légendés en italique. */
function dessinerLiensSemantiques({ ctx, vue }: ContexteDessinR, etat: EtatRendu): void {
  const j = vue.justification
  const pal = etat.palette
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
      const pr = vue.projection
      const sa = echelle(vue, page, a), sb = echelle(vue, page, b)
      const x1 = pr.x[a]!, y1 = pr.y[a]! - page.boites[a]!.haut * sa - 2
      const x2 = pr.x[b]!, y2 = pr.y[b]! - page.boites[b]!.haut * sb - 2
      const my = Math.min(y1, y2) - Math.max(22, Math.abs(x2 - x1) * 0.16)
      ctx.strokeStyle = rgba(l.genre === 'resout' ? pal.filet : pal.pale, 0.9 * op)
      ctx.lineWidth = 0.7
      ctx.setLineDash(l.genre === 'resout' ? [] : [2.5, 3])
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.bezierCurveTo(x1, my, x2, my, x2, y2)
      ctx.stroke()
      ctx.setLineDash([])
      const tx = (x1 + x2) / 2, ty = my + (Math.min(y1, y2) - my) * 0.25
      const texte = l.genre === 'contredit' ? 'contredit' : l.genre === 'resout' ? 'résout' : l.genre === 'abandonne' ? 'abandonne' : 'remplace'
      ctx.font = police(etat, 400, Math.max(9, 10.5 * Math.min(1.2, sa)), true)
      const w = ctx.measureText(texte).width + 8
      ctx.fillStyle = rgba(pal.fond, 0.92 * op)
      ctx.fillRect(tx - w / 2, ty - 6, w, 12)
      ctx.fillStyle = rgba(pal.encreDouce, op)
      ctx.fillText(texte, tx, ty)
    }
  }
  ctx.restore()
}

// ─── Calque « dessus » : énoncés, bifurcations, choix, notes de marge ─────────

export function dessinerDessus(c: ContexteDessinR, etat: EtatRendu): void {
  const { ctx, vue } = c
  const page = etat.page
  etat.cibles = []
  if (!page) return
  const pal = etat.palette
  const pr = vue.projection
  // Masqués (contexte pur) : visibles seulement avec les liens complets.
  ctx.save()
  for (let p = vue.nU; p < vue.nP; p++) {
    const pres = vue.presence[p]!
    if (pres < 0.05 || !pr.visible[p]) continue
    const s = echelle(vue, page, p)
    const x = pr.x[p]!, y = pr.y[p]!
    ctx.fillStyle = rgba(pal.encreDouce, 0.8 * pres)
    ctx.beginPath()
    ctx.arc(x, y, 1.8 * Math.min(1.4, s), 0, Math.PI * 2)
    ctx.fill()
    if (s > 0.55) {
      ctx.font = police(etat, 400, 10.5 * Math.min(1.3, s), true)
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = rgba(pal.encreDouce, pres)
      ctx.fillText(page.boites[p]!.lignes[0] ?? vue.noeud(p).nom, x - 6 * s, y)
    }
    etat.cibles.push({ genre: 'masque', point: p, noeud: vue.indexNoeud(p), x0: x - 6, y0: y - 6, x1: x + 6, y1: y + 6 })
  }
  ctx.restore()

  if (lire<boolean>(vue, 'notesMarge')) dessinerNotes(c, etat)

  const ordre: number[] = []
  for (let p = 0; p < vue.nU; p++) ordre.push(p)
  ordre.sort((a, b) => pr.profondeur[b]! - pr.profondeur[a]!)
  const actifs = choixActifs(vue, etat)
  const toujours = lire<string>(vue, 'marquesChoix') === 'toujours'
  const allumees = notesAllumees(vue, etat)
  for (const p of ordre) {
    if (!pr.visible[p]) continue
    const op = vue.opaciteAffichee[p]!
    if (op < 0.02) continue
    const b = page.boites[p]!
    const s = echelle(vue, page, p)
    // Choix actifs dont ce point dépend : leurs sigles « Ck » s'inscrivent dans la rubrique.
    const sigles: number[] = []
    for (const [q, k] of etat.numeroChoix) {
      if (q === p) continue
      if ((toujours || actifs.includes(q)) && page.portees.get(q)?.includes(p)) sigles.push(k)
    }
    ctx.save()
    ctx.translate(pr.x[p]!, pr.y[p]!)
    ctx.scale(s, s)
    ctx.globalAlpha = op
    if (b.genre === 'decision') dessinerDecision(ctx, vue, etat, p, b, allumees)
    else dessinerEnonce(ctx, vue, etat, p, b, sigles.sort((a, c) => a - c), allumees)
    ctx.restore()
    // Cibles (écran).
    const x = pr.x[p]!, y = pr.y[p]!
    if (b.genre === 'decision') {
      const l = Math.max(12, b.wTexte / 2)
      etat.cibles.push({ genre: 'carte', point: p, noeud: -1, x0: x - l * s, y0: y - b.haut * s, x1: x + l * s, y1: y + 8 * s })
      if (b.impasse && lire<boolean>(vue, 'impasses')) etat.cibles.push({ genre: 'impasse', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y + 8 * s, x1: x + (b.w / 2) * s, y1: y + 38 * s })
    } else {
      const genre = b.genre === 'drapeau' ? 'drapeau' : 'carte'
      etat.cibles.push({ genre, point: p, noeud: -1, x0: x - (b.w / 2 + 14) * s, y0: y - b.haut * s, x1: x + (b.w / 2) * s, y1: y + b.bas * s })
    }
    if (lire<boolean>(vue, 'pastillesContexte')) for (const r of b.refs) {
      if (r.genre === 'plus') continue
      const h = b.taille * (r.genre === 'renvoi' ? 0.8 : 0.66)
      const c0 = { x0: x + (r.x - 1.5) * s, y0: y + (r.y - h - 1.5) * s, x1: x + (r.x + r.w + 1.5) * s, y1: y + (r.y + 3) * s }
      if (r.genre === 'renvoi') etat.cibles.push({ genre: 'renvoi', point: r.cible, noeud: -1, ...c0 })
      else etat.cibles.push({ genre: 'pastille', point: p, noeud: r.cible, ...c0 })
    }
  }
}

/** Couleur du texte d'un énoncé : accent pour la sélection et le survol, sinon l'encre. */
function encreDe(vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite): string {
  const pal = etat.palette
  if (vue.selection === p || vue.survol === p || (vue.ligneeActive && vue.lignee[p] === 3)) return pal.accent
  return b.abandon ? pal.pale : pal.encre
}

/** Appels (renvois, notes en exposant) à leur place. */
function dessinerAppels(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, b: Boite, allumees: Set<number> | null): void {
  if (!lire<boolean>(vue, 'pastillesContexte') || !b.refs.length) return
  const pal = etat.palette
  const sv = etat.survol
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  for (const r of b.refs) {
    const allume = r.genre === 'renvoi' ? sv?.genre === 'renvoi' && sv.point === r.cible : r.genre === 'note' && (allumees?.has(r.cible) ?? false) && sv?.genre === 'pastille'
    ctx.font = police(etat, 400, b.taille * (r.genre === 'renvoi' ? 0.8 : 0.66))
    ctx.fillStyle = allume ? pal.accent : b.abandon ? pal.pale : pal.encreDouce
    ctx.fillText(r.texte, r.x, r.y)
  }
}

/** Micro-graphique de confiance (40 px) : échelle 0–1, intervalle, estimation ; valeur à gauche. */
function dessinerConfiance(ctx: CanvasRenderingContext2D, etat: EtatRendu, xDroite: number, y: number, c: { estimation: number; bas: number; haut: number }, taille: number, pale: boolean): number {
  const pal = etat.palette
  const L = 40
  const xa = xDroite - L
  // Échelle : filet très pâle et deux taquets.
  ctx.strokeStyle = pal.pale
  ctx.lineWidth = 0.6
  ctx.beginPath()
  ctx.moveTo(xa, y)
  ctx.lineTo(xDroite, y)
  ctx.moveTo(xa, y - 2)
  ctx.lineTo(xa, y + 2)
  ctx.moveTo(xDroite, y - 2)
  ctx.lineTo(xDroite, y + 2)
  ctx.stroke()
  // Intervalle (barre d'erreur) puis estimation.
  ctx.strokeStyle = pale ? pal.pale : pal.encreDouce
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(xa + L * c.bas, y)
  ctx.lineTo(xa + L * Math.max(c.haut, c.bas + 0.02), y)
  ctx.stroke()
  ctx.fillStyle = pale ? pal.pale : pal.encre
  ctx.beginPath()
  ctx.arc(xa + L * c.estimation, y, 1.9, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = police(etat, 400, taille)
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = pale ? pal.pale : pal.encreDouce
  const t = decimal(c.estimation)
  ctx.fillText(t, xa - 3, y + 0.5)
  return L + 3 + ctx.measureText(t).width
}

/** Caractère de statut, suspendu dans la gouttière gauche. */
function caractereStatut(statut: string): string {
  return statut === 'valide' ? '✓' : statut === 'incertain' ? '?' : '✕'
}

function dessinerEnonce(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, sigles: number[], allumees: Set<number> | null): void {
  const pal = etat.palette
  const n = vue.noeud(p)
  const x0 = -b.w / 2
  const t = lire<number>(vue, 'taillePolice')
  const petite = t * 0.78
  const encre = encreDe(vue, etat, p, b)
  const drapeau = b.genre === 'drapeau'
  const kChoix = etat.numeroChoix.get(p)
  const choixActif = drapeau && (etat.epingles.has(p) || (etat.survol?.genre === 'drapeau' && etat.survol.point === p))
  const y1 = b.yLignes[0] ?? 0

  // Gouttière : statut (énoncé) ou sigle « Ck » (choix).
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'right'
  if (drapeau) {
    ctx.font = police(etat, 600, petite)
    ctx.fillStyle = choixActif ? pal.accent : pal.encreDouce
    ctx.fillText(`C${kChoix ?? '?'}`, x0 - 5, y1)
  } else {
    ctx.font = police(etat, n.statut === 'refute' ? 700 : 400, t * 0.92)
    ctx.fillStyle = b.abandon ? pal.pale : n.statut === 'valide' ? pal.encreDouce : pal.encre
    ctx.fillText(caractereStatut(n.statut), x0 - 4, y1)
  }

  // Rubrique : à gauche le type (et validation), à droite la confiance.
  let reserve = 0
  if (!drapeau) reserve = dessinerConfiance(ctx, etat, x0 + b.w, b.yRubrique - petite * 0.3, n.confiance, petite * 0.92, b.abandon) + 6
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  let rub = b.etiquette
  if (b.numero) rub = `(${b.numero})  ${rub}`
  if (drapeau) {
    const portee = etat.page?.portees.get(p)?.filter((q) => q < vue.nU).length ?? 0
    rub = `choix · ${portee} énoncé${portee > 1 ? 's' : ''}${etat.epingles.has(p) ? ' · épinglé' : ''}`
  }
  ctx.font = police(etat, 400, petite, true)
  const libre = b.w - reserve
  // Validation (IA, H, IA+H) seulement si elle tient : la fiche la donne toujours.
  if (!drapeau && n.validation !== 'aucune') {
    const suffixe = n.validation === 'ia' ? ' · IA' : n.validation === 'humain' ? ' · H' : ' · IA+H'
    if (ctx.measureText(rub + suffixe).width <= libre) rub += suffixe
  }
  if (ctx.measureText(rub).width > libre) {
    while (rub.length > 2 && ctx.measureText(rub + '…').width > libre) rub = rub.slice(0, -1)
    rub = rub.trimEnd() + '…'
  }
  ctx.fillStyle = choixActif ? pal.accent : b.abandon ? pal.pale : pal.encreDouce
  ctx.fillText(rub, x0, b.yRubrique)
  // Sigles des choix actifs dont l'énoncé dépend : seule marque de portée, en accent.
  if (sigles.length) {
    const w = ctx.measureText(rub).width
    ctx.font = police(etat, 600, petite)
    ctx.fillStyle = pal.accent
    const txt = sigles.map((k) => `C${k}`).join(' ')
    if (w + 6 + ctx.measureText(txt).width <= libre) ctx.fillText(txt, x0 + w + 6, b.yRubrique)
    else {
      ctx.textAlign = 'right'
      ctx.fillText(txt, x0 - 4, b.yRubrique)
    }
  }

  // Texte.
  ctx.textAlign = 'left'
  ctx.font = police(etat, b.poids, b.taille, b.italique)
  ctx.fillStyle = choixActif ? pal.accent : encre
  b.lignes.forEach((l, k) => ctx.fillText(l, x0, b.yLignes[k]!))
  // Sélection : un filet d'accent sous la dernière ligne (souligné typographique, pas de cadre).
  if (vue.selection === p) {
    const yl = b.yLignes[b.lignes.length - 1]! + b.taille * 0.28
    ctx.strokeStyle = pal.accent
    ctx.lineWidth = 0.9
    ctx.beginPath()
    ctx.moveTo(x0, yl)
    ctx.lineTo(x0 + b.wTexte, yl)
    ctx.stroke()
  }
  dessinerAppels(ctx, vue, etat, b, allumees)

  // Sous-argument déplié : mention discrète au-dessus de la tête.
  const tete = etatSquelette.deplies.get(n.id)
  if (tete) {
    ctx.font = police(etat, 400, petite, true)
    ctx.fillStyle = pal.encreDouce
    ctx.textAlign = 'left'
    ctx.fillText(`déplié (${tete.length + 1}) · double-clic : replier`, x0, b.yRubrique - petite * 1.35)
  }
}

function dessinerDecision(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, allumees: Set<number> | null): void {
  const pal = etat.palette
  const t = lire<number>(vue, 'taillePolice')
  const encre = encreDe(vue, etat, p, b)
  // Libellé en italique, centré au-dessus du point de bifurcation.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = police(etat, 400, t, true)
  ctx.fillStyle = encre
  b.lignes.forEach((l, k) => ctx.fillText(l, 0, b.yLignes[k]!))
  // Branche abandonnée : le trait bifurque vers le bas, en gris léger, jusqu'à l'alternative rejetée.
  if (b.impasse && lire<boolean>(vue, 'impasses')) {
    ctx.strokeStyle = pal.pale
    ctx.lineWidth = lire<number>(vue, 'epaisseurFilet')
    ctx.setLineDash([2.5, 3])
    ctx.beginPath()
    ctx.moveTo(3, 3)
    ctx.bezierCurveTo(9, 9, 0, 14, 0, 22)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.font = police(etat, 400, t * 0.82, true)
    const suffixe = b.impasse.autres ? ` (+${b.impasse.autres})` : ''
    let texte = b.impasse.texte
    const max = b.w
    while (texte.length > 3 && ctx.measureText(`${texte}…${suffixe}`).width > max) texte = texte.slice(0, -1)
    const affiche = `${texte === b.impasse.texte ? texte : texte.trimEnd() + '…'}${suffixe}`
    ctx.fillStyle = pal.pale
    ctx.textAlign = 'center'
    ctx.fillText(affiche, 0, 33)
    // Barré d'un trait fin : l'alternative n'a pas été retenue.
    const w = ctx.measureText(affiche).width
    ctx.strokeStyle = pal.pale
    ctx.lineWidth = 0.6
    ctx.beginPath()
    ctx.moveTo(-w / 2, 33 - t * 0.26)
    ctx.lineTo(w / 2, 33 - t * 0.26)
    ctx.stroke()
  }
  // Point de bifurcation : petit losange au trait.
  const r = 4.2
  ctx.beginPath()
  ctx.moveTo(0, -r)
  ctx.lineTo(r, 0)
  ctx.lineTo(0, r)
  ctx.lineTo(-r, 0)
  ctx.closePath()
  ctx.fillStyle = pal.fond
  ctx.fill()
  ctx.strokeStyle = encre
  ctx.lineWidth = 1
  ctx.stroke()
  dessinerAppels(ctx, vue, etat, b, allumees)
}

/** Notes de marge : numéro suspendu, mot en italique, texte en corps réduit. */
function dessinerNotes({ ctx, vue, largeur, hauteur }: ContexteDessinR, etat: EtatRendu): void {
  const page = etat.page!
  if (!page.notes.length) return
  const pal = etat.palette
  const cam = vue.camera
  const E = page.echelle
  const alpha = Math.max(0, 1 - vue.extrusion * 1.4)
  if (alpha < 0.02) return
  const s = cam.pixelsParUnite() * E
  if (s * page.notes[0]!.taille < 3) return
  const allumees = notesAllumees(vue, etat)
  ctx.save()
  for (const nt of page.notes as Note[]) {
    const a = cam.projeterPoint([(nt.x - page.cx) * E, 0, -(nt.y - page.cy) * E])
    if (!a.visible) continue
    const W = vue.reglages.lire<number>('largeurNotes')
    // Hors écran : rien à dessiner (ni à survoler).
    if (a.x > largeur + 20 || a.x + W * s < -20 || a.y > hauteur + 20 || a.y + nt.h * s < -20) continue
    const allume = allumees?.has(nt.noeud) ?? false
    const eteinte = allumees !== null && !allume
    ctx.save()
    ctx.translate(a.x, a.y)
    ctx.scale(s, s)
    ctx.globalAlpha = alpha * (eteinte ? 0.3 : 1)
    const T = nt.taille
    const yb = T * 0.95
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'right'
    ctx.font = police(etat, allume ? 600 : 400, T * 0.9)
    ctx.fillStyle = allume ? pal.accent : pal.encreDouce
    ctx.fillText(String(nt.numero), -5, yb)
    ctx.textAlign = 'left'
    ctx.font = police(etat, 400, T * 0.92, true)
    ctx.fillStyle = allume ? pal.accent : pal.encreDouce
    ctx.fillText(nt.etiquette, 0, yb)
    ctx.font = police(etat, 400, T)
    ctx.fillStyle = pal.encre
    nt.lignes.forEach((l, k) => ctx.fillText(l, 0, yb + (k + 1) * T * 1.3))
    ctx.restore()
    etat.cibles.push({ genre: 'pastille', point: -1, noeud: nt.noeud, x0: a.x - 16 * s, y0: a.y, x1: a.x + W * s, y1: a.y + nt.h * s })
  }
  ctx.restore()
}

// ─── Survol ──────────────────────────────────────────────────────────────────

/** Élément sous le pointeur (écran), d'après la dernière image. */
export function cibleSous(etat: EtatRendu, x: number, y: number): Cible | null {
  // Les appels et branches rejetées d'abord (petits, posés sur les énoncés), puis l'ordre inverse du dessin.
  for (let k = etat.cibles.length - 1; k >= 0; k--) {
    const c = etat.cibles[k]!
    if ((c.genre === 'renvoi' || c.genre === 'impasse' || (c.genre === 'pastille' && c.point >= 0)) && x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) return c
  }
  for (let k = etat.cibles.length - 1; k >= 0; k--) {
    const c = etat.cibles[k]!
    if (x >= c.x0 - 2 && x <= c.x1 + 2 && y >= c.y0 - 2 && y <= c.y1 + 2) return c
  }
  return null
}
