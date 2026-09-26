// R14 · Rendu « schéma technique » sur les calques canvas de la vue.
//
// - Dessous : feuille (cadre double, repères de grille A B C… à gauche, règle des rangs logiques en
//   haut, trame fine), limites de zones en pointillé, liaisons orthogonales au trait fin, jonctions en
//   point plein, sous-systèmes dépliés (cadre mixte), liens sémantiques en crochets.
// - Dessus : blocs rectangulaires à angles vifs (en-tête : repère + type ; titre ; jauge graduée de
//   confiance), ports d'entrée / de sortie, bornes de contexte, connecteurs de renvoi, décisions en
//   losange avec l'alternative rejetée « non connectée » (×), blocs de spécification « Hyp. : … ».
// - Statut par le code de trait : continu = validé, tireté = à vérifier, barré = réfuté. Noir, gris,
//   un seul bleu (accent) pour le survol, la sélection, les descendants et les hypothèses actives.
// Sigma ne dessine plus que les liens complets (L) ; le survol passe par `cibleSous`.

import { rgba, type ContexteDessinR, type ValeurReglage, type VueRaisonnement } from '../../src/raisonnement'
import { MONO, type Boite, type MiseEnPage } from './mise-en-page'
import { etatSquelette } from './squelette'

export interface PaletteR14 {
  encre: string
  gris: string
  trait: string
  surface: string
  surface2: string
  accent: string
}

export function lirePaletteR14(el: HTMLElement): PaletteR14 {
  const s = getComputedStyle(el)
  const v = (n: string, d: string) => s.getPropertyValue(n).trim() || d
  return {
    encre: v('--texte', '#16181c'),
    gris: v('--texte-doux', '#62676f'),
    trait: v('--arete', '#3a3e45'),
    surface: v('--surface', '#ffffff'),
    surface2: v('--surface-2', '#f3f4f5'),
    accent: v('--accent', '#1a5fd0'),
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
  palette: PaletteR14
  cibles: Cible[]
  /** Élément survolé (déterminé par cibleSous). */
  survol: Cible | null
  /** Hypothèses épinglées (points) : leurs repères restent affichés sur les blocs dépendants. */
  epingles: Set<number>
  /** Hypothèses de modélisation présentes (point → repère « H1 »). */
  hypotheses: Map<number, string>
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

/** Pointe pleine, fine (port d'entrée). */
function pointe(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, t: number): void {
  const l = Math.hypot(dx, dy) || 1
  const ux = dx / l, uy = dy / l
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x - ux * t * 1.9 - uy * t * 0.62, y - uy * t * 1.9 + ux * t * 0.62)
  ctx.lineTo(x - ux * t * 1.9 + uy * t * 0.62, y - uy * t * 1.9 - ux * t * 0.62)
  ctx.closePath()
  ctx.fill()
}

/** Motif de trait selon le statut : continu (validé), tireté (à vérifier), continu + barre (réfuté). */
function motifStatut(statut: string): number[] {
  return statut === 'incertain' ? [4, 2.5] : []
}

// ─── Calque « dessous » : feuille, liaisons, jonctions ────────────────────────

export function dessinerDessous(c: ContexteDessinR, etat: EtatRendu): void {
  const { ctx, vue } = c
  const page = etat.page
  if (!page || !page.boites.length) return
  const e = vue.extrusion
  const cam = vue.camera
  const E = page.echelle
  const monde = (x: number, y: number, yw = 0): [number, number, number] => [(x - page.cx) * E, yw, -(y - page.cy) * E]
  const s0 = cam.pixelsParUnite() * E

  // Feuille : trame, cadre, repères, règle des rangs (s'estompent en 3D).
  const alpha = Math.max(0, 1 - e * 1.6)
  if (alpha > 0.01) dessinerFeuille(ctx, vue, etat, monde, s0, alpha)

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
  const epaisseur = Math.max(0.8, Math.min(1.25, 1.1 * s0))
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
      couleur = P.accent
      alphaR = 1
      largeur = epaisseur + 0.6
    }
    if (vue.ligneeActive) {
      const ls = vue.lignee[r.source]!, lc = vue.lignee[r.cible]!
      const dans = ls > 0 && lc > 0 && !(ls === 2 && lc === 1) && !(ls === 1 && lc === 2) && !(ls === 3 && lc === 1) && !(ls === 2 && lc === 3)
      if (dans) {
        // Amont : encre, trait renforcé ; aval : accent.
        couleur = ls === 1 || lc === 1 ? P.encre : P.accent
        alphaR = 1
        largeur = epaisseur + 0.9
      } else alphaR *= 0.4
    }
    if (actifs && !(actifs.has(r.source) && actifs.has(r.cible))) alphaR *= 0.3
    if (r.abandon) {
      couleur = P.gris
      ctx.setLineDash([1.5, 2.5])
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
      // 3D : route projetée, profondeur interpolée le long du chemin.
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
  // Jonctions : point plein là où une sortie se divise.
  if (!transition && e < 0.02) {
    ctx.fillStyle = rgba(P.trait, actifs || vue.ligneeActive ? 0.45 : 0.95)
    const rj = Math.max(1.6, Math.min(2.8, 2.4 * s0))
    for (const [x, y] of page.jonctions) {
      const q = cam.projeterPoint(monde(x, y))
      ctx.beginPath()
      ctx.arc(q.x, q.y, rj, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()

  // Décision → hypothèse dans la marge : trait vertical vers le bloc de spécification.
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
    ctx.fillStyle = rgba(P.trait, 0.9 * op)
    ctx.lineWidth = epaisseur
    ctx.beginPath()
    polyligne(ctx, [{ x: xa, y: ya }, { x: xm, y: ya }, { x: xm, y: yb }])
    ctx.stroke()
    pointe(ctx, xm, yb, 0, 1, 3)
  }
  ctx.restore()

  if (lire<boolean>(vue, 'liensSemantiques')) dessinerLiensSemantiques(c, etat)
}

/** Feuille de plan : trame, cadre double, repères de lignes (A, B…), règle des rangs, zones. */
function dessinerFeuille(
  ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu,
  monde: (x: number, y: number) => [number, number, number], s0: number, alpha: number,
): void {
  const page = etat.page!
  const P = etat.palette
  const cam = vue.camera
  const b = page.bornes
  const W = page.largeurCarte
  const fx0 = b.x0 - 46, fx1 = b.x1 + 34, fy0 = b.y0 - 92, fy1 = b.y1 + 34
  const hg = cam.projeterPoint(monde(fx0, fy0)), bd = cam.projeterPoint(monde(fx1, fy1))
  if (!hg.visible || !bd.visible) return
  const X = (x: number) => hg.x + (x - fx0) * s0
  const Y = (y: number) => hg.y + (y - fy0) * s0
  const grille = lire<boolean>(vue, 'grille')
  const feuille = lire<boolean>(vue, 'enTetes')
  const bande = 16 // largeur de la bande des repères (px de mise en page)
  ctx.save()
  // Trame : mineure tous les 20 px (si assez espacée à l'écran), majeure tous les 100 px.
  if (grille) {
    const ix0 = fx0 + bande, iy0 = fy0 + 58
    for (const [pas, a] of [[20, 0.055], [100, 0.1]] as const) {
      if (pas * s0 < 7) continue
      ctx.strokeStyle = rgba(P.gris, a * alpha)
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = Math.ceil(ix0 / pas) * pas; x < fx1; x += pas) {
        const sx = Math.round(X(x)) + 0.5
        ctx.moveTo(sx, Y(iy0))
        ctx.lineTo(sx, Y(fy1))
      }
      for (let y = Math.ceil(iy0 / pas) * pas; y < fy1; y += pas) {
        const sy = Math.round(Y(y)) + 0.5
        ctx.moveTo(X(ix0), sy)
        ctx.lineTo(X(fx1), sy)
      }
      ctx.stroke()
    }
  }
  if (!feuille) {
    ctx.restore()
    return
  }
  // Cadre double : trait extérieur fort, intérieur fin.
  ctx.strokeStyle = rgba(P.encre, 0.85 * alpha)
  ctx.lineWidth = 1.6
  ctx.strokeRect(X(fx0), Y(fy0), (fx1 - fx0) * s0, (fy1 - fy0) * s0)
  ctx.lineWidth = 0.8
  ctx.strokeStyle = rgba(P.encre, 0.6 * alpha)
  ctx.strokeRect(X(fx0 + bande), Y(fy0 + 58), (fx1 - fx0 - bande) * s0, (fy1 - fy0 - 58) * s0)
  const taille = Math.max(8.5, Math.min(11, 9.5 * s0))
  ctx.font = `500 ${taille}px ${MONO}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Repères de lignes : A, B, C… tous les 160 px.
  const pasL = 160
  ctx.strokeStyle = rgba(P.encre, 0.5 * alpha)
  ctx.lineWidth = 0.8
  let k = 0
  for (let y = fy0 + 58; y < fy1 - 1; y += pasL, k++) {
    const y1 = Math.min(fy1, y + pasL)
    ctx.beginPath()
    ctx.moveTo(X(fx0), Y(y1))
    ctx.lineTo(X(fx0 + bande), Y(y1))
    ctx.stroke()
    if ((y1 - y) * s0 > taille * 1.4) {
      ctx.fillStyle = rgba(P.gris, alpha)
      ctx.fillText(String.fromCharCode(65 + (k % 26)), X(fx0 + bande / 2), Y((y + y1) / 2))
    }
  }
  // Règle des rangs logiques : ligne de base, graduations fines, repère « R n » par rang.
  const yR = fy0 + 30
  ctx.strokeStyle = rgba(P.encre, 0.75 * alpha)
  ctx.lineWidth = 0.9
  ctx.beginPath()
  ctx.moveTo(X(fx0 + bande), Y(yR))
  ctx.lineTo(X(fx1), Y(yR))
  ctx.stroke()
  const pasRang = page.xRangs.length > 1 ? page.xRangs[1]! - page.xRangs[0]! : W + 40
  ctx.beginPath()
  ctx.lineWidth = 0.7
  // Graduations mineures (quart de rang), sur toute la largeur utile.
  const debut = page.xRangs.length ? page.xRangs[0]! - pasRang : page.xMarge
  for (let x = debut; x <= fx1; x += pasRang / 4) {
    if (x < fx0 + bande) continue
    ctx.moveTo(X(x), Y(yR))
    ctx.lineTo(X(x), Y(yR) - 3 * Math.min(1.2, s0))
  }
  ctx.stroke()
  ctx.lineWidth = 1
  ctx.beginPath()
  const reperes: [number, string][] = page.xRangs.map((x, r) => [x, `R${r}`] as [number, string])
  if (page.zones[0]?.nom === 'Spécifications') reperes.unshift([page.xMarge, 'SPEC.'])
  for (const [x] of reperes) {
    ctx.moveTo(X(x), Y(yR) + 4 * Math.min(1.2, s0))
    ctx.lineTo(X(x), Y(yR) - 8 * Math.min(1.2, s0))
  }
  ctx.stroke()
  ctx.fillStyle = rgba(P.encre, 0.9 * alpha)
  ctx.textBaseline = 'bottom'
  for (const [x, t] of reperes) ctx.fillText(t, X(x), Y(yR) - 9 * Math.min(1.2, s0))
  ctx.textBaseline = 'middle'
  // Zones : cotes entre limites (┤ NOM ├) sous la règle, limites en pointillé sur la hauteur.
  const yZ = fy0 + 46
  ctx.font = `600 ${taille * 0.92}px ${MONO}`
  ctx.textAlign = 'center'
  page.zones.forEach((z, i) => {
    const xa = X(z.x0 + 3), xb = X(z.x1 - 3), ym = Y(yZ)
    ctx.strokeStyle = rgba(P.gris, 0.75 * alpha)
    ctx.lineWidth = 0.8
    const nom = z.nom.toUpperCase()
    const wt = ctx.measureText(nom).width
    const tient = wt < xb - xa - 14
    ctx.beginPath()
    ctx.moveTo(xa, ym - 4)
    ctx.lineTo(xa, ym + 4)
    ctx.moveTo(xb, ym - 4)
    ctx.lineTo(xb, ym + 4)
    const xm = (xa + xb) / 2
    if (tient) {
      ctx.moveTo(xa, ym)
      ctx.lineTo(xm - wt / 2 - 5, ym)
      ctx.moveTo(xm + wt / 2 + 5, ym)
      ctx.lineTo(xb, ym)
    } else {
      ctx.moveTo(xa, ym)
      ctx.lineTo(xb, ym)
    }
    ctx.stroke()
    if (tient) {
      ctx.fillStyle = rgba(P.encre, 0.85 * alpha)
      ctx.fillText(nom, xm, ym + 0.5)
    }
    // Limite de zone (entre deux zones) : pointillé fin sur toute la hauteur utile.
    if (i + 1 < page.zones.length) {
      const xl = X((z.x1 + page.zones[i + 1]!.x0) / 2)
      ctx.strokeStyle = rgba(P.gris, 0.35 * alpha)
      ctx.setLineDash([2, 4])
      ctx.beginPath()
      ctx.moveTo(xl, Y(fy0 + 58))
      ctx.lineTo(xl, Y(fy1))
      ctx.stroke()
      ctx.setLineDash([])
    }
  })
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
      ctx.setLineDash([9, 3, 2, 3])
      ctx.lineWidth = 0.9
      ctx.strokeRect(x - (l + 6) * s, y - (b.haut + 6) * s, (2 * l + 12) * s, (b.haut + b.bas + 10) * s)
      ctx.setLineDash([])
      if (j.noeuds[g.unites[p]!.conclusion]!.id === tete) {
        ctx.font = `500 ${Math.max(8, 9 * s)}px ${MONO}`
        ctx.textAlign = 'right'
        ctx.textBaseline = 'bottom'
        ctx.fillStyle = rgba(P.accent, op)
        ctx.fillText(`SOUS-SYST. OUVERT (${pts.length}) · double-clic : refermer`, x + (l + 6) * s, y - (b.haut + 8) * s)
      }
    }
  }
  ctx.restore()
}

/** Contradictions, résolutions, abandons : crochets orthogonaux au-dessus des blocs. */
function dessinerLiensSemantiques({ ctx, vue }: ContexteDessinR, etat: EtatRendu): void {
  const j = vue.justification
  const P = etat.palette
  const page = etat.page!
  ctx.save()
  ctx.font = `500 9px ${MONO}`
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
      ctx.lineWidth = 0.9
      ctx.setLineDash(l.genre === 'contredit' ? [6, 3] : l.genre === 'resout' ? [] : [1.5, 2.5])
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x1, my)
      ctx.lineTo(x2, my)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      ctx.setLineDash([])
      const texte = l.genre === 'contredit' ? 'CONTREDIT' : l.genre === 'resout' ? 'RÉSOUT' : l.genre === 'abandonne' ? 'ABANDONNE' : 'REMPLACE'
      const tx = (x1 + x2) / 2
      const w = ctx.measureText(texte).width + 8
      ctx.fillStyle = rgba(P.surface, op)
      ctx.fillRect(tx - w / 2, my - 6, w, 12)
      ctx.strokeStyle = rgba(couleur, 0.7 * op)
      ctx.strokeRect(tx - w / 2 + 0.5, my - 5.5, w - 1, 11)
      ctx.fillStyle = rgba(couleur, op)
      ctx.fillText(texte, tx, my + 0.5)
    }
  }
  ctx.restore()
}

// ─── Calque « dessus » : blocs, décisions, spécifications ─────────────────────

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
    const r = 3.2 * Math.min(1.4, s)
    ctx.fillStyle = rgba(P.surface, pres)
    ctx.strokeStyle = rgba(P.gris, pres)
    ctx.lineWidth = 1
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r)
    ctx.strokeRect(x - r + 0.5, y - r + 0.5, 2 * r - 1, 2 * r - 1)
    if (s > 0.55) {
      ctx.font = `400 ${10 * Math.min(1.3, s)}px ${MONO}`
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
    // Repères des hypothèses actives dont ce bloc dépend (graphe complet).
    const tags: string[] = []
    for (const [q, ref] of etat.hypotheses) {
      if (q === p) continue
      if ((toujours || actifs.includes(q)) && page.portees.get(q)?.includes(p)) tags.push(ref)
    }
    if (b.genre === 'drapeau') dessinerSpec(ctx, vue, etat, p, b)
    else if (b.genre === 'decision') dessinerDecision(ctx, vue, etat, p, b, tags)
    else dessinerBloc(ctx, vue, etat, p, b, tags)
    ctx.restore()
    // Cibles (écran).
    const x = pr.x[p]!, y = pr.y[p]!
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
    if (l === 3) return { couleur: P.accent, largeur: 2.2 }
    if (l === 1) return { couleur: P.encre, largeur: 1.9 }
    if (l === 2) return { couleur: P.accent, largeur: 1.6 }
  }
  if (vue.survol === p) return { couleur: P.accent, largeur: 1.8 }
  return null
}

/** Rangée sous le bloc : connecteurs de renvoi puis bornes de contexte (abscisses relatives). */
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
  // Connecteurs de renvoi (hors feuille) : pentagone pointé vers le bloc, repère du bloc cité.
  ctx.font = `600 8.5px ${MONO}`
  ctx.lineWidth = 0.9
  for (const it of items) {
    if (it.renvoi < 0) continue
    const ref = etat.page?.boites[it.renvoi]?.ref ?? '?'
    const allume = sv?.genre === 'renvoi' && sv.point === it.renvoi
    const x = it.x
    ctx.beginPath()
    ctx.moveTo(x - 13, y - 6)
    ctx.lineTo(x + 9, y - 6)
    ctx.lineTo(x + 13, y)
    ctx.lineTo(x + 9, y + 6)
    ctx.lineTo(x - 13, y + 6)
    ctx.closePath()
    ctx.fillStyle = allume ? P.accent : P.surface
    ctx.fill()
    ctx.strokeStyle = allume ? P.accent : P.encre
    ctx.stroke()
    ctx.fillStyle = allume ? P.surface : P.encre
    ctx.fillText(ref, x - 1.5, y + 0.5)
  }
  // Bornes de contexte : petites cases à angles vifs, lettre en chasse fixe.
  ctx.font = `600 8px ${MONO}`
  const bornes = items.filter((it) => it.renvoi < 0)
  bornes.forEach((it, k) => {
    const pa = b.pastilles[k]!
    const allume = sv?.genre === 'pastille' && sv.noeud === pa.noeud
    const x = it.x
    ctx.fillStyle = allume ? P.accent : pa.lettre === '+' ? P.surface : P.surface2
    ctx.fillRect(x - 5.5, y - 5.5, 11, 11)
    ctx.strokeStyle = allume ? P.accent : rgba(P.gris, 0.9)
    ctx.lineWidth = 0.8
    ctx.strokeRect(x - 5.5, y - 5.5, 11, 11)
    ctx.fillStyle = allume ? P.surface : P.encre
    ctx.fillText(pa.lettre, x, y + 0.5)
  })
  if (b.plus) {
    ctx.fillStyle = P.gris
    ctx.font = `500 8.5px ${MONO}`
    ctx.textAlign = 'left'
    const dernier = items[items.length - 1]!
    ctx.fillText(`+${b.plus}`, dernier.x + 8, y + 0.5)
  }
}

/** Repères d'hypothèses actives au-dessus du coin haut droit (« ⊢ H1 H3 »). */
function dessinerTags(ctx: CanvasRenderingContext2D, etat: EtatRendu, tags: string[], xDroite: number, yHaut: number): void {
  if (!tags.length) return
  ctx.font = `600 8.5px ${MONO}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = etat.palette.accent
  ctx.fillText(`⊢ ${tags.join(' ')}`, xDroite, yHaut - 2)
}

function dessinerBloc(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, tags: string[]): void {
  const P = etat.palette
  const n = vue.noeud(p)
  const w = b.w, h = b.h
  const x0 = -w / 2, y0 = -h / 2
  const taille = lire<number>(vue, 'taillePolice')
  const majeur = b.genre === 'majeur'
  const sousSysteme = b.genre === 'etape' || (vue.lecture.unites[p]?.membres.length ?? 1) > 1
  const tl = traitLignee(vue, etat, p)
  const couleurTrait = tl ? tl.couleur : b.abandon ? P.gris : tags.length ? P.accent : P.encre
  const largeurTrait = tl ? tl.largeur : majeur ? 1.5 : 1
  const motif = b.abandon ? [1.5, 2.5] : motifStatut(n.statut)
  // Sous-système : second contour décalé (bloc hiérarchique).
  if (sousSysteme) {
    ctx.fillStyle = P.surface
    ctx.fillRect(x0 + 3.5, y0 - 3.5, w, h)
    ctx.strokeStyle = rgba(b.abandon ? P.gris : P.encre, 0.55)
    ctx.lineWidth = 0.8
    ctx.setLineDash(motif)
    ctx.strokeRect(x0 + 3.5, y0 - 3.5, w, h)
    ctx.setLineDash([])
  }
  ctx.fillStyle = b.abandon ? P.surface2 : P.surface
  ctx.fillRect(x0, y0, w, h)
  // En-tête : repère + type ; bandeau plein (encre) pour les résultats.
  const hEnTete = 16
  if (majeur && !b.abandon) {
    ctx.fillStyle = tl?.couleur === P.accent || tags.length ? P.accent : P.encre
    ctx.fillRect(x0, y0, w, hEnTete)
  }
  ctx.strokeStyle = rgba(couleurTrait, majeur ? 1 : 0.45)
  ctx.lineWidth = 0.7
  ctx.beginPath()
  ctx.moveTo(x0, y0 + hEnTete)
  ctx.lineTo(x0 + w, y0 + hEnTete)
  ctx.stroke()
  // Contour : code de trait du statut.
  ctx.strokeStyle = couleurTrait
  ctx.lineWidth = largeurTrait
  ctx.setLineDash(motif)
  ctx.strokeRect(x0, y0, w, h)
  ctx.setLineDash([])
  // Réfuté : barré (diagonale du bloc).
  if (n.statut === 'refute' && !b.abandon) {
    ctx.strokeStyle = rgba(couleurTrait, 0.8)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x0, y0 + h)
    ctx.lineTo(x0 + w, y0)
    ctx.stroke()
  }
  // Ports : entrées (petits traits sur le flanc gauche), sortie (carré plein à droite).
  ctx.fillStyle = couleurTrait
  const sorties = (vue.lecture.sortantes[p]?.length ?? 0) > 0 || !!etat.page?.usagesRenvoi.has(p)
  if (sorties) ctx.fillRect(x0 + w - 1.5, -2, 3.5, 4)
  for (const yp of b.ports) if (yp !== 0 || b.ports.length > 1) ctx.fillRect(x0 - 2, yp - 0.5, 2, 1)
  // Texte d'en-tête.
  const inverse = majeur && !b.abandon
  const gauche = x0 + 6
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.font = `700 9px ${MONO}`
  const citeParRenvoi = etat.survol?.genre === 'renvoi' && etat.survol.point === p
  ctx.fillStyle = inverse ? P.surface : citeParRenvoi ? P.accent : P.encre
  ctx.fillText(b.ref, gauche, y0 + hEnTete / 2 + 0.5)
  const wRef = ctx.measureText(b.ref).width
  ctx.font = `500 8px ${MONO}`
  ctx.fillStyle = inverse ? rgba(P.surface, 0.8) : P.gris
  const val = n.validation === 'aucune' ? '—' : n.validation === 'ia_humain' ? 'IA+H' : n.validation === 'humain' ? 'H' : 'IA'
  ctx.textAlign = 'right'
  ctx.fillText(val, x0 + w - 6, y0 + hEnTete / 2 + 0.5)
  const wVal = ctx.measureText(val).width
  ctx.textAlign = 'left'
  let etiquette = b.etiquette
  const place = w - 12 - wRef - 6 - wVal - 6
  while (etiquette.length > 3 && ctx.measureText(etiquette).width > place) etiquette = etiquette.slice(0, -1)
  if (etiquette !== b.etiquette) etiquette = etiquette.trimEnd() + '…'
  ctx.fillText(etiquette, gauche + wRef + 6, y0 + hEnTete / 2 + 0.5)
  // Titre.
  ctx.textBaseline = 'alphabetic'
  ctx.font = `${majeur ? 620 : 450} ${taille}px ${vue.palette.police}`
  ctx.fillStyle = b.abandon ? P.gris : P.encre
  b.lignes.forEach((l, k) => ctx.fillText(l, gauche, y0 + hEnTete + 4 + taille + k * (taille + 3) - 1))
  // Jauge de confiance : échelle 0–1 graduée, intervalle (barre), estimation (index) et valeur.
  const cf = n.confiance
  ctx.font = `500 7.5px ${MONO}`
  const txt = cf.estimation.toFixed(2).replace('.', ',')
  const wTxt = ctx.measureText(txt).width
  const xa = gauche, xb = x0 + w - 10 - wTxt, yb = y0 + h - 5
  ctx.strokeStyle = rgba(P.gris, 0.8)
  ctx.lineWidth = 0.6
  ctx.beginPath()
  ctx.moveTo(xa, yb)
  ctx.lineTo(xb, yb)
  for (let k = 0; k <= 4; k++) {
    const xt = xa + ((xb - xa) * k) / 4
    ctx.moveTo(xt, yb)
    ctx.lineTo(xt, yb - (k % 2 === 0 ? 3 : 1.8))
  }
  ctx.stroke()
  ctx.fillStyle = rgba(P.encre, 0.45)
  ctx.fillRect(xa + (xb - xa) * cf.bas, yb - 1.2, Math.max(1.2, (xb - xa) * (cf.haut - cf.bas)), 2.4)
  ctx.fillStyle = P.encre
  ctx.fillRect(xa + (xb - xa) * cf.estimation - 0.6, yb - 4, 1.2, 6)
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = P.gris
  ctx.fillText(txt, x0 + w - 5, yb - 0.5)
  dessinerRangee(ctx, vue, etat, b)
  dessinerTags(ctx, etat, tags, x0 + w, y0 - (sousSysteme ? 3.5 : 0))
}

function dessinerDecision(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, tags: string[]): void {
  const P = etat.palette
  const taille = lire<number>(vue, 'taillePolice')
  const tl = traitLignee(vue, etat, p)
  // Libellé au-dessus du losange.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `600 ${taille}px ${vue.palette.police}`
  ctx.fillStyle = P.encre
  const n0 = b.lignes.length
  b.lignes.forEach((l, k) => ctx.fillText(l, 0, -19 - 6 - (n0 - 1 - k) * (taille + 3)))
  dessinerTags(ctx, etat, tags, b.w / 2, -19 - 4 - n0 * (taille + 3))
  // Alternative rejetée : sortie non connectée (×), libellé en gris.
  if (b.impasse && lire<boolean>(vue, 'impasses')) {
    ctx.strokeStyle = P.gris
    ctx.lineWidth = 0.9
    ctx.beginPath()
    ctx.moveTo(0, 19)
    ctx.lineTo(0, 29)
    ctx.moveTo(-3.5, 25.5)
    ctx.lineTo(3.5, 32.5)
    ctx.moveTo(3.5, 25.5)
    ctx.lineTo(-3.5, 32.5)
    ctx.stroke()
    ctx.font = `400 ${Math.max(8.5, taille - 3)}px ${MONO}`
    const suffixe = b.impasse.autres ? ` +${b.impasse.autres}` : ''
    const texte = b.impasse.texte
    let t = texte
    const max = b.w - 8
    while (t.length > 3 && ctx.measureText(`NC : ${t}…${suffixe}`).width > max) t = t.slice(0, -1)
    ctx.fillStyle = P.gris
    ctx.textBaseline = 'middle'
    ctx.fillText(`NC : ${t === texte ? t : t.trimEnd() + '…'}${suffixe}`, 0, 41)
    ctx.textBaseline = 'alphabetic'
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
  ctx.lineWidth = tl ? tl.largeur : 1.2
  ctx.stroke()
  ctx.fillStyle = tl ? tl.couleur : P.encre
  ctx.font = `700 9px ${MONO}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(b.ref, 0, 0.5)
  dessinerRangee(ctx, vue, etat, b)
}

/** Bloc de spécification (choix de modélisation) : repère, nom, « Hyp. : … », portée. */
function dessinerSpec(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite): void {
  const P = etat.palette
  const epingle = etat.epingles.has(p)
  const actif = epingle || (etat.survol?.genre === 'drapeau' && etat.survol.point === p)
  const taille = lire<number>(vue, 'taillePolice') - 0.5
  const tSpec = lire<number>(vue, 'taillePolice') - 2
  const w = b.w, h = b.h
  const x0 = -w / 2, y0 = -h / 2
  const tl = traitLignee(vue, etat, p)
  const couleur = tl ? tl.couleur : actif ? P.accent : P.encre
  ctx.fillStyle = P.surface
  ctx.fillRect(x0, y0, w, h)
  // Coin replié (note de spécification).
  ctx.strokeStyle = couleur
  ctx.lineWidth = tl ? tl.largeur : actif ? 1.5 : 1
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x0 + w - 8, y0)
  ctx.lineTo(x0 + w, y0 + 8)
  ctx.lineTo(x0 + w, y0 + h)
  ctx.lineTo(x0, y0 + h)
  ctx.closePath()
  ctx.stroke()
  ctx.lineWidth = 0.7
  ctx.beginPath()
  ctx.moveTo(x0 + w - 8, y0)
  ctx.lineTo(x0 + w - 8, y0 + 8)
  ctx.lineTo(x0 + w, y0 + 8)
  ctx.stroke()
  // En-tête : repère, nature, portée.
  const portee = etat.page?.portees.get(p)?.filter((q) => q < vue.nU).length ?? 0
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.font = `700 9px ${MONO}`
  ctx.fillStyle = actif ? P.accent : P.encre
  ctx.fillText(b.ref, x0 + 6, y0 + 9)
  const wRef = ctx.measureText(b.ref).width
  ctx.font = `500 8px ${MONO}`
  ctx.fillStyle = P.gris
  ctx.fillText(`MODÉLISATION${epingle ? ' · ÉPINGLÉE' : ''}`, x0 + 6 + wRef + 6, y0 + 9)
  ctx.textAlign = 'right'
  ctx.fillText(`→${portee}`, x0 + w - 11, y0 + 9)
  // Nom.
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `600 ${taille}px ${vue.palette.police}`
  ctx.fillStyle = P.encre
  b.lignes.forEach((l, i) => ctx.fillText(l, x0 + 6, y0 + 18 + taille + i * (taille + 3) - 1))
  // Spécification.
  if (b.specs.length) {
    const ys = y0 + 18 + b.lignes.length * (taille + 3.5) + 5
    ctx.strokeStyle = rgba(P.gris, 0.4)
    ctx.lineWidth = 0.6
    ctx.beginPath()
    ctx.moveTo(x0 + 6, ys - 2)
    ctx.lineTo(x0 + w - 6, ys - 2)
    ctx.stroke()
    ctx.font = `400 ${tSpec}px ${MONO}`
    ctx.fillStyle = P.gris
    b.specs.forEach((l, i) => ctx.fillText(l, x0 + 6, ys + tSpec + i * (tSpec + 3)))
  }
}

// ─── Survol ──────────────────────────────────────────────────────────────────

/** Élément sous le pointeur (écran), d'après la dernière image. */
export function cibleSous(etat: EtatRendu, x: number, y: number): Cible | null {
  // Bornes, connecteurs et alternatives d'abord (petits, au-dessus des blocs voisins).
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
