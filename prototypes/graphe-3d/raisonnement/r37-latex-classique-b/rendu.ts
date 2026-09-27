// R37 (essai B) · Rendu « figure LaTeX » sur les calques canvas de la vue ; le texte des blocs est
// composé en HTML (composition.ts) et posé par-dessus.
//
// - Dessous : en-têtes de colonnes en petites capitales avec filets \cmidrule et numéros de rang,
//   séparations de zones en tireté gris, liaisons orthogonales au trait fin avec pointe « latex »,
//   jonctions en point plein, liens sémantiques étiquetés en italique.
// - Dessus : cadres des énoncés (TikZ : draw, thin ; dashed = à vérifier ; strike out = réfuté ;
//   double = résultat ; copy shadow = sous-argument replié ; dotted gris = piste abandonnée), losanges
//   des décisions et alternative rejetée (×), cadres des hypothèses de modélisation, ligne de citations
//   « cf. (3) [1, 4] » sous chaque bloc. Noir sur blanc ; un seul bleu pour le survol et la lignée.

import { rgba, type ContexteDessinR, type ValeurReglage, type VueRaisonnement } from '../../src/raisonnement'
import type { Composition } from './composition'
import { SERIF, type Boite, type MiseEnPage } from './mise-en-page'
import { etatSquelette } from './squelette'

export interface PaletteR37 {
  encre: string
  gris: string
  trait: string
  surface: string
  surface2: string
  accent: string
}

export function lirePaletteR37(el: HTMLElement): PaletteR37 {
  const s = getComputedStyle(el)
  const v = (n: string, d: string) => s.getPropertyValue(n).trim() || d
  return {
    encre: v('--texte', '#000000'),
    gris: v('--texte-doux', '#5f5f5f'),
    trait: v('--arete', '#000000'),
    surface: v('--surface', '#ffffff'),
    surface2: v('--surface-2', '#f4f4f4'),
    accent: v('--accent', '#1f4bb4'),
  }
}

/** Élément interactif dessiné à la dernière image (pour le survol). */
export interface Cible {
  genre: 'carte' | 'pastille' | 'renvoi' | 'drapeau' | 'impasse' | 'masque'
  point: number
  /** Nœud de justification (citation de contexte). */
  noeud: number
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface EtatRendu {
  page: MiseEnPage | null
  palette: PaletteR37
  cibles: Cible[]
  /** Élément survolé (déterminé par cibleSous). */
  survol: Cible | null
  /** Hypothèses épinglées (points) : leurs repères restent affichés sur les blocs dépendants. */
  epingles: Set<number>
  /** Hypothèses de modélisation présentes (point → repère « (ii) »). */
  hypotheses: Map<number, string>
  /** Composition HTML (texte des blocs, légende). */
  compo: Composition | null
  /** Légende : abscisse gauche et largeur (px de mise en page), hauteur mesurée. */
  legende: { x0: number; largeur: number; h: number }
}

const lire = <T extends ValeurReglage>(vue: VueRaisonnement, cle: string) => vue.reglages.lire<T>(cle)

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

// ─── Primitives ──────────────────────────────────────────────────────────────

function polyligne(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]): void {
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k]!.x, pts[k]!.y)
}

/** Pointe « latex » de TikZ : triangle effilé plein, flancs et dos légèrement creusés. */
function pointeLatex(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, k: number): void {
  const l = Math.hypot(dx, dy) || 1
  const ux = dx / l, uy = dy / l
  const L = 5.6 * k, H = 1.9 * k
  const P = (a: number, b: number): [number, number] => [x + ux * a - uy * b, y + uy * a + ux * b]
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.quadraticCurveTo(...P(-L * 0.5, H * 0.38), ...P(-L, H))
  ctx.quadraticCurveTo(...P(-L * 0.82, 0), ...P(-L, -H))
  ctx.quadraticCurveTo(...P(-L * 0.5, -H * 0.38), x, y)
  ctx.closePath()
  ctx.fill()
}

/** Motif de trait selon le statut : continu (validé), tireté (à vérifier). */
function motifStatut(statut: string): number[] {
  return statut === 'incertain' ? [3.6, 2.4] : []
}

const MOTIF_POINTILLE = [0.9, 2.1]

// ─── Calque « dessous » : en-têtes, liaisons, jonctions ──────────────────────

export function dessinerDessous(c: ContexteDessinR, etat: EtatRendu): void {
  const { ctx, vue } = c
  const page = etat.page
  if (!page || !page.boites.length) return
  const e = vue.extrusion
  const cam = vue.camera
  const E = page.echelle
  const monde = (x: number, y: number, yw = 0): [number, number, number] => [(x - page.cx) * E, yw, -(y - page.cy) * E]
  const s0 = cam.pixelsParUnite() * E

  // En-têtes de colonnes (s'estompent en 3D).
  const alpha = Math.max(0, 1 - e * 1.6)
  if (alpha > 0.01 && lire<boolean>(vue, 'enTetes')) dessinerEnTetes(ctx, vue, etat, monde, s0, alpha)

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
  const kPointe = Math.max(0.75, Math.min(1.25, s0))
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
      ctx.lineCap = 'round'
      ctx.setLineDash(MOTIF_POINTILLE)
    } else {
      ctx.lineCap = 'butt'
      ctx.setLineDash([])
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
    pointeLatex(ctx, z.x, z.y, z.x - y.x, z.y - y.y, kPointe)
  }
  // Jonctions : point plein là où une sortie se divise (\fill circle).
  if (!transition && e < 0.02) {
    ctx.fillStyle = rgba(P.trait, actifs || vue.ligneeActive ? 0.4 : 1)
    const rj = Math.max(1.4, Math.min(2.4, 2 * s0))
    for (const [x, y] of page.jonctions) {
      const q = cam.projeterPoint(monde(x, y))
      ctx.beginPath()
      ctx.arc(q.x, q.y, rj, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()

  // Décision → hypothèse dans la marge : trait vers le cadre de l'hypothèse.
  ctx.save()
  for (const l of page.liensMarge) {
    const pr = vue.projection
    const s = echelle(vue, page, l.source)
    const bc = page.boites[l.cible]!
    const xm = pr.x[l.cible]! - (bc.w / 2 - 12) * s
    const ya = pr.y[l.source]!, yb = pr.y[l.cible]! - (bc.h / 2) * s
    const xa = pr.x[l.source]! - 19 * s
    const op = Math.min(vue.opaciteAffichee[l.source]!, vue.opaciteAffichee[l.cible]!)
    ctx.strokeStyle = rgba(P.trait, op)
    ctx.fillStyle = rgba(P.trait, op)
    ctx.lineWidth = epaisseur
    ctx.beginPath()
    polyligne(ctx, [{ x: xa, y: ya }, { x: xm, y: ya }, { x: xm, y: yb }])
    ctx.stroke()
    pointeLatex(ctx, xm, yb, 0, 1, kPointe)
  }
  ctx.restore()

  if (lire<boolean>(vue, 'liensSemantiques')) dessinerLiensSemantiques(c, etat)
}

/** Ordonnées (px de mise en page, relatives au haut de la figure) des en-têtes. */
export const EN_TETE = { titre: -48, filet: -39, rang: -28, haut: -62 }

/** En-têtes de colonnes : nom de zone en petites capitales, filet \cmidrule, numéros de rang. */
function dessinerEnTetes(
  ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu,
  monde: (x: number, y: number) => [number, number, number], s0: number, alpha: number,
): void {
  const page = etat.page!
  const P = etat.palette
  const cam = vue.camera
  const b = page.bornes
  const o = cam.projeterPoint(monde(0, b.y0))
  if (!o.visible) return
  const X = (x: number) => o.x + x * s0
  const Y = (y: number) => o.y + (y - b.y0) * s0
  const taille = 11.5 * s0
  if (taille < 4) return
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  // Petites capitales : capitales réduites (comme \textsc sans fonte dédiée).
  ctx.fillStyle = rgba(P.encre, alpha)
  ctx.strokeStyle = rgba(P.encre, 0.85 * alpha)
  ctx.lineWidth = Math.max(0.5, 0.6 * Math.min(1.4, s0))
  const pc = (texte: string, x: number, y: number, t: number) => petitesCapitales(ctx, texte, x, y, t)
  page.zones.forEach((z, i) => {
    const xa = X(z.x0 + 8), xb = X(z.x1 - 8)
    pc(z.nom, (xa + xb) / 2, Y(b.y0 + EN_TETE.titre), taille)
    // \cmidrule(lr) sous l'en-tête.
    ctx.beginPath()
    ctx.moveTo(xa, Y(b.y0 + EN_TETE.filet))
    ctx.lineTo(xb, Y(b.y0 + EN_TETE.filet))
    ctx.stroke()
    // Séparation de zones : tireté gris fin sur la hauteur de la figure.
    if (i + 1 < page.zones.length) {
      const xl = X((z.x1 + page.zones[i + 1]!.x0) / 2)
      ctx.save()
      ctx.strokeStyle = rgba(P.gris, 0.4 * alpha)
      ctx.lineWidth = 0.6
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(xl, Y(b.y0 + EN_TETE.filet + 6))
      ctx.lineTo(xl, Y(b.y1 + 8))
      ctx.stroke()
      ctx.restore()
    }
  })
  // Numéros de rang logique, sous les filets.
  ctx.font = `400 ${9.5 * s0}px ${SERIF}`
  ctx.fillStyle = rgba(P.gris, alpha)
  page.xRangs.forEach((x, r) => ctx.fillText(String(r), X(x), Y(b.y0 + EN_TETE.rang)))
  ctx.restore()
}

/** Petites capitales synthétiques : initiales en capitales, le reste en capitales réduites à 80 %. */
function petitesCapitales(ctx: CanvasRenderingContext2D, texte: string, x: number, y: number, t: number): void {
  const mots = texte.split('')
  const morceaux: { s: string; grand: boolean }[] = []
  for (const ch of mots) {
    const grand = ch !== ch.toLowerCase() || !/\p{L}/u.test(ch)
    const d = morceaux[morceaux.length - 1]
    if (d && d.grand === grand) d.s += ch
    else morceaux.push({ s: ch, grand })
  }
  const police = (grand: boolean) => `400 ${grand ? t : t * 0.8}px ${SERIF}`
  let largeur = 0
  for (const m of morceaux) {
    ctx.font = police(m.grand)
    largeur += ctx.measureText(m.grand ? m.s : m.s.toUpperCase()).width
  }
  const align = ctx.textAlign
  ctx.textAlign = 'left'
  let cx = align === 'center' ? x - largeur / 2 : align === 'right' ? x - largeur : x
  for (const m of morceaux) {
    ctx.font = police(m.grand)
    const s = m.grand ? m.s : m.s.toUpperCase()
    ctx.fillText(s, cx, y)
    cx += ctx.measureText(s).width
  }
  ctx.textAlign = align
}

/** Sous-arguments dépliés : cadre en trait mixte autour de chaque bloc issu du dépliage. */
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
      ctx.setLineDash([6, 2.5, 1, 2.5])
      ctx.lineWidth = 0.8
      ctx.strokeRect(x - (l + 6) * s, y - (b.haut + 6) * s, (2 * l + 12) * s, (b.haut + b.bas + 10) * s)
      ctx.setLineDash([])
      if (j.noeuds[g.unites[p]!.conclusion]!.id === tete) {
        ctx.font = `italic 400 ${Math.max(8, 10 * s)}px ${SERIF}`
        ctx.textAlign = 'right'
        ctx.textBaseline = 'bottom'
        ctx.fillStyle = rgba(P.accent, op)
        ctx.fillText(`sous-argument ouvert (${pts.length})`, x + (l + 6) * s, y - (b.haut + 8) * s)
      }
    }
  }
  ctx.restore()
}

/** Contradictions, résolutions, abandons : crochets orthogonaux étiquetés en italique. */
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
      ctx.lineCap = l.genre === 'contredit' || l.genre === 'resout' ? 'butt' : 'round'
      ctx.setLineDash(l.genre === 'contredit' ? [3.6, 2.4] : l.genre === 'resout' ? [] : MOTIF_POINTILLE)
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x1, my)
      ctx.lineTo(x2, my)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      ctx.setLineDash([])
      const texte = l.genre === 'contredit' ? 'contredit' : l.genre === 'resout' ? 'résout' : l.genre === 'abandonne' ? 'abandonne' : 'remplace'
      const s = Math.min(sa, sb)
      ctx.font = `italic 400 ${Math.max(8, 10.5 * s)}px ${SERIF}`
      const tx = (x1 + x2) / 2
      const w = ctx.measureText(texte).width + 6
      ctx.fillStyle = rgba(P.surface, op)
      ctx.fillRect(tx - w / 2, my - 6, w, 12)
      ctx.fillStyle = rgba(couleur, op)
      ctx.fillText(texte, tx, my + 0.5)
    }
  }
  ctx.restore()
}

// ─── Calque « dessus » : cadres, décisions, hypothèses, citations ────────────

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
      const k = page.citations.get(vue.indexNoeud(p))
      ctx.font = `400 ${10.5 * Math.min(1.3, s)}px ${SERIF}`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = rgba(P.gris, pres)
      ctx.fillText(`${k ? `[${k}] ` : ''}${page.boites[p]!.lignes[0] ?? n.nom}`, x - 8 * s, y)
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
    if (b.genre === 'drapeau') dessinerHypothese(ctx, vue, etat, p, b)
    else if (b.genre === 'decision') dessinerDecision(ctx, vue, etat, p, b, tags)
    else dessinerBloc(ctx, vue, etat, p, b, tags)
    const items = b.genre === 'drapeau' ? [] : dessinerCitations(ctx, vue, etat, b)
    ctx.restore()
    // Cibles (écran).
    const x = pr.x[p]!, y = pr.y[p]!
    if (b.genre === 'decision') {
      const l = Math.max(19, b.w / 2)
      etat.cibles.push({ genre: 'carte', point: p, noeud: -1, x0: x - l * s, y0: y - b.haut * s, x1: x + l * s, y1: y + 22 * s })
      if (b.impasse && lire<boolean>(vue, 'impasses')) etat.cibles.push({ genre: 'impasse', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y + 22 * s, x1: x + (b.w / 2) * s, y1: y + 48 * s })
    } else if (b.genre === 'drapeau') etat.cibles.push({ genre: 'drapeau', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y - (b.h / 2) * s, x1: x + (b.w / 2) * s, y1: y + (b.h / 2) * s })
    else etat.cibles.push({ genre: 'carte', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y - (b.h / 2) * s, x1: x + (b.w / 2) * s, y1: y + (b.h / 2) * s })
    const yc = yCitations(b)
    for (const it of items) {
      const c0 = { x0: x + it.x0 * s, y0: y + (yc - 6) * s, x1: x + it.x1 * s, y1: y + (yc + 6) * s }
      if (it.renvoi >= 0) etat.cibles.push({ genre: 'renvoi', point: it.renvoi, noeud: -1, ...c0 })
      else if (it.noeud >= 0) etat.cibles.push({ genre: 'pastille', point: p, noeud: it.noeud, ...c0 })
    }
  }

  // Texte composé (HTML) : suit la projection ; légende sous la figure (2D seulement).
  const compo = etat.compo
  if (!compo) return
  const sv = etat.survol
  compo.placer(vue, page, (p) => echelle(vue, page, p), (p) => {
    const b = page.boites[p]!
    let k = ''
    if (sv?.genre === 'renvoi' && sv.point === p) k += ' r37-cite'
    if (sv?.genre === 'pastille' && page.contexteAffiche.get(sv.noeud) === p) k += ' r37-cite'
    if (b.genre === 'drapeau' && (etat.epingles.has(p) || (sv?.genre === 'drapeau' && sv.point === p))) k += ' r37-actif'
    if (vue.selection === p) k += ' r37-selection'
    return k.trim()
  }, lire<boolean>(vue, 'impasses'))
  const L = etat.legende
  const montrer = lire<boolean>(vue, 'legendeFigure') && vue.extrusion < 0.02 && L.largeur > 0
  if (!montrer) return compo.placerLegende(0, 0, 1, false)
  const E = page.echelle
  const q = vue.camera.projeterPoint([(L.x0 - page.cx) * E, 0, -(page.bornes.y1 + ECART_LEGENDE - page.cy) * E])
  compo.placerLegende(q.x, q.y, vue.camera.pixelsParUnite() * E, q.visible)
}

/** Écart (px de mise en page) entre le bas de la figure et la légende. */
export const ECART_LEGENDE = 34

/** Ordonnée (relative au point d'ancrage) de la ligne de citations. */
function yCitations(b: Boite): number {
  if (b.genre === 'decision') return 19 + (b.impasse ? 30 : 4) + 8
  return b.h / 2 + 9
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

interface Citation {
  x0: number
  x1: number
  renvoi: number
  noeud: number
}

/**
 * Ligne de citations sous le bloc, comme dans un texte : « cf. (3), (5) [1, 4, 7] ». Renvois vers des
 * énoncés affichés par leur numéro d'équation, contexte par son numéro de bibliographie.
 */
function dessinerCitations(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, b: Boite): Citation[] {
  const page = etat.page!
  const P = etat.palette
  const refs: { texte: string; renvoi: number; noeud: number }[] = []
  for (const q of b.renvois) refs.push({ texte: page.boites[q]?.ref ?? '?', renvoi: q, noeud: -1 })
  const numeros: { k: number; noeud: number }[] = []
  if (lire<boolean>(vue, 'pastillesContexte')) for (const pa of b.pastilles) {
    const q = page.contexteAffiche.get(pa.noeud)
    if (q !== undefined) refs.push({ texte: page.boites[q]!.ref, renvoi: -1, noeud: pa.noeud })
    else {
      const k = page.citations.get(pa.noeud)
      if (k) numeros.push({ k, noeud: pa.noeud })
    }
  }
  numeros.sort((a, c) => a.k - c.k)
  if (!refs.length && !numeros.length) return []
  // Morceaux : texte neutre ou citation (cible de survol).
  const morceaux: { texte: string; renvoi: number; noeud: number }[] = []
  const neutre = (texte: string) => morceaux.push({ texte, renvoi: -1, noeud: -1 })
  if (refs.length) {
    neutre('cf. ')
    refs.forEach((r, k) => {
      if (k) neutre(', ')
      morceaux.push(r)
    })
  }
  if (numeros.length) {
    neutre(refs.length ? ' [' : '[')
    numeros.forEach((n, k) => {
      if (k) neutre(', ')
      morceaux.push({ texte: String(n.k), renvoi: -1, noeud: n.noeud })
    })
    neutre(']')
  }
  const sv = etat.survol
  const y = yCitations(b)
  const taille = 10
  ctx.font = `400 ${taille}px ${SERIF}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const gauche = b.genre === 'decision' ? -b.w / 2 + 4 : -b.w / 2 + 1
  const droite = b.w / 2 - 12
  let x = gauche
  const items: Citation[] = []
  let coupe = 0
  for (let i = 0; i < morceaux.length; i++) {
    const m = morceaux[i]!
    const w = ctx.measureText(m.texte).width
    if (x + w > droite && (m.renvoi >= 0 || m.noeud >= 0)) {
      coupe = morceaux.slice(i).filter((z) => z.renvoi >= 0 || z.noeud >= 0).length
      break
    }
    const allume = (m.renvoi >= 0 && sv?.genre === 'renvoi' && sv.point === m.renvoi) || (m.noeud >= 0 && sv?.genre === 'pastille' && sv.noeud === m.noeud)
    ctx.fillStyle = allume ? P.accent : m.renvoi >= 0 || m.noeud >= 0 ? P.encre : P.gris
    ctx.fillText(m.texte, x, y)
    if (m.renvoi >= 0 || m.noeud >= 0) items.push({ x0: x - 1, x1: x + w + 1, renvoi: m.renvoi, noeud: m.noeud })
    x += w
  }
  if (coupe || b.plus) {
    ctx.fillStyle = P.gris
    ctx.fillText(` … +${coupe + b.plus}`, x, y)
  }
  return items
}

/** Repères d'hypothèses actives au-dessus du coin haut droit (« sous (i), (iii) »). */
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
  const sousArgument = b.genre === 'etape' || (vue.lecture.unites[p]?.membres.length ?? 1) > 1
  const tl = traitLignee(vue, etat, p)
  const couleurTrait = tl ? tl.couleur : b.abandon ? P.gris : tags.length ? P.accent : P.encre
  const largeurTrait = tl ? tl.largeur : 0.8
  const motif = b.abandon ? MOTIF_POINTILLE : motifStatut(n.statut)
  ctx.lineCap = b.abandon ? 'round' : 'butt'
  // Sous-argument replié : copy shadow (un second cadre décalé derrière).
  if (sousArgument) {
    ctx.fillStyle = P.surface
    ctx.fillRect(x0 + 3, y0 - 3, w, h)
    ctx.strokeStyle = rgba(b.abandon ? P.gris : P.encre, 0.7)
    ctx.lineWidth = 0.7
    ctx.setLineDash(motif)
    ctx.strokeRect(x0 + 3, y0 - 3, w, h)
    ctx.setLineDash([])
  }
  ctx.fillStyle = P.surface
  ctx.fillRect(x0, y0, w, h)
  // Cadre : code de trait du statut ; résultat : double trait.
  ctx.strokeStyle = couleurTrait
  ctx.lineWidth = largeurTrait
  ctx.setLineDash(motif)
  ctx.strokeRect(x0, y0, w, h)
  if (majeur) {
    ctx.lineWidth = Math.min(largeurTrait, 0.8)
    ctx.strokeRect(x0 + 2.2, y0 + 2.2, w - 4.4, h - 4.4)
  }
  ctx.setLineDash([])
  // Réfuté : strike out (diagonale du cadre).
  if (n.statut === 'refute' && !b.abandon) {
    ctx.strokeStyle = rgba(couleurTrait, 0.75)
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(x0, y0 + h)
    ctx.lineTo(x0 + w, y0)
    ctx.stroke()
  }
  ctx.lineCap = 'butt'
  dessinerTags(ctx, etat, tags, x0 + w, y0 - (sousArgument ? 3 : 0))
}

function dessinerDecision(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, tags: string[]): void {
  const P = etat.palette
  const tl = traitLignee(vue, etat, p)
  dessinerTags(ctx, etat, tags, b.w / 2, -b.haut)
  // Alternative rejetée : sortie non raccordée, marquée d'une croix ; libellé composé en HTML.
  if (b.impasse && lire<boolean>(vue, 'impasses')) {
    ctx.strokeStyle = P.gris
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(0, 19)
    ctx.lineTo(0, 28)
    ctx.moveTo(-3, 25)
    ctx.lineTo(3, 31)
    ctx.moveTo(3, 25)
    ctx.lineTo(-3, 31)
    ctx.stroke()
  }
  // Losange (TikZ : diamond, draw).
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
}

/** Cadre d'une hypothèse de modélisation (le texte, façon \newtheorem, est composé en HTML). */
function dessinerHypothese(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite): void {
  const P = etat.palette
  const actif = etat.epingles.has(p) || (etat.survol?.genre === 'drapeau' && etat.survol.point === p)
  const tl = traitLignee(vue, etat, p)
  const w = b.w, h = b.h
  ctx.fillStyle = P.surface
  ctx.fillRect(-w / 2, -h / 2, w, h)
  ctx.strokeStyle = tl ? tl.couleur : actif ? P.accent : P.encre
  ctx.lineWidth = tl ? tl.largeur : actif ? 1.3 : 0.8
  ctx.strokeRect(-w / 2, -h / 2, w, h)
}

// ─── Survol ──────────────────────────────────────────────────────────────────

/** Élément sous le pointeur (écran), d'après la dernière image. */
export function cibleSous(etat: EtatRendu, x: number, y: number): Cible | null {
  // Citations et alternatives d'abord (petites, au-dessus des blocs voisins).
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
