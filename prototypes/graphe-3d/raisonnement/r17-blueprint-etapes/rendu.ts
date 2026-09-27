// R17 · Rendu « Blueprint » sur les calques canvas de la vue.
//
// - Dessous : feuille de R14 (cadre double, repères de lignes, règle des rangs, trame), puis les cadres des
//   blocs de raisonnement (boîtes « Comment » : fond teinté translucide, barre de titre teintée, contour
//   fin), puis les fils : orthogonaux à coins arrondis, COULEUR = rôle de la prémisse (principale,
//   auxiliaire, technique, contexte), comme les fils typés d'Unreal ; jonctions en point plein.
// - Dessus : cartes à en-tête plein coloré par FAMILLE (modèle, décision, lemme, énoncé, mesure, calcul,
//   résultat), broches d'entrée (une par liaison) colorées par la famille de la source (le « type de donnée »
//   reçu), broche de sortie pleine si connectée, creuse sinon ; décisions en cartes avec une ligne par
//   alternative (retenue : broche pleine ; rejetée : broche creuse, non connectée) ; spécifications
//   « Hyp. : … » ; jauge de confiance ; bornes de contexte et renvois.
// - Statut toujours par le code de trait : continu = validé, tireté = à vérifier, barré = réfuté.
// - Survol / sélection : contour orange (sélection Unreal). Pas de halo, pas d'animation décorative.

import {
  rgba, type ContexteDessinR, type RolePremisse, type ValeurReglage, type VueRaisonnement,
} from '../../src/raisonnement'
import type { Famille, GenreEtape } from './etapes'
import { CADRE, EN_TETE, LIGNE_ALT, MONO, type Boite, type MiseEnPage } from './mise-en-page'
import { etatSquelette } from './squelette'

const FAMILLES: Famille[] = ['modele', 'decision', 'deduction', 'enonce', 'empirique', 'calcul', 'resultat']
const ROLES: RolePremisse[] = ['principale', 'auxiliaire', 'technique', 'contexte']
const GENRES: GenreEtape[] = [
  'modele', 'modelisation', 'decision', 'derivation', 'conditions', 'prediction', 'consequence',
  'confrontation', 'calcul', 'conclusion', 'abandon',
]

export interface PaletteR17 {
  encre: string
  gris: string
  trait: string
  surface: string
  surface2: string
  accent: string
  texteEnTete: string
  familles: Record<Famille, string>
  roles: Record<RolePremisse, string>
  etapes: Record<GenreEtape, string>
}

const DEFAUT_FAMILLES: Record<Famille, string> = {
  modele: '#6b46c1', decision: '#b83280', deduction: '#2b6cb0', enonce: '#1e3a8a', empirique: '#0f7c82', calcul: '#3f7d20', resultat: '#1f2430',
}
const DEFAUT_ROLES: Record<RolePremisse, string> = { principale: '#2d3440', auxiliaire: '#c27c0e', technique: '#9c6b4e', contexte: '#a3aab4' }
const DEFAUT_ETAPES: Record<GenreEtape, string> = {
  modele: '#6b46c1', modelisation: '#6b46c1', decision: '#b83280', derivation: '#2b6cb0', conditions: '#4c51bf',
  prediction: '#0e7490', consequence: '#0e7490', confrontation: '#2f855a', calcul: '#3f7d20', conclusion: '#1f2430', abandon: '#8a9099',
}

export function lirePaletteR17(el: HTMLElement): PaletteR17 {
  const s = getComputedStyle(el)
  const v = (n: string, d: string) => s.getPropertyValue(n).trim() || d
  return {
    encre: v('--texte', '#16181c'),
    gris: v('--texte-doux', '#62676f'),
    trait: v('--arete', '#3a3e45'),
    surface: v('--surface', '#ffffff'),
    surface2: v('--surface-2', '#f3f4f5'),
    accent: v('--accent', '#e8590c'),
    texteEnTete: v('--r17-texte-en-tete', '#ffffff'),
    familles: Object.fromEntries(FAMILLES.map((f) => [f, v(`--r17-f-${f}`, DEFAUT_FAMILLES[f])])) as Record<Famille, string>,
    roles: Object.fromEntries(ROLES.map((r) => [r, v(`--r17-r-${r}`, DEFAUT_ROLES[r])])) as Record<RolePremisse, string>,
    etapes: Object.fromEntries(GENRES.map((g) => [g, v(`--r17-e-${g}`, DEFAUT_ETAPES[g])])) as Record<GenreEtape, string>,
  }
}

/** Élément interactif dessiné à la dernière image (pour le survol). */
export interface Cible {
  genre: 'carte' | 'pastille' | 'renvoi' | 'drapeau' | 'masque' | 'etape'
  /** Point ; pour une barre de titre de bloc : index d'étape. */
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
  palette: PaletteR17
  cibles: Cible[]
  /** Élément survolé (déterminé par cibleSous). */
  survol: Cible | null
  /** Bloc mis en avant depuis le panneau (index d'étape). */
  etapeActive: number | null
  /** Hypothèses épinglées (points) : leurs repères restent affichés sur les blocs dépendants. */
  epingles: Set<number>
  /** Hypothèses de modélisation présentes (point → repère « H1 »). */
  hypotheses: Map<number, string>
  /** Barres de titre des blocs à l'écran (calculées sous les fils, cibles ajoutées au-dessus). */
  titresEcran: Cible[]
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

/** Bloc mis en avant (survol de sa barre de titre ou du panneau). */
export function etapeMiseEnAvant(etat: EtatRendu): number | null {
  if (etat.survol?.genre === 'etape') return etat.survol.point
  return etat.etapeActive
}

// ─── Primitives ──────────────────────────────────────────────────────────────

/** Ligne brisée orthogonale à coins arrondis (rayon r px écran). */
function polyligneArrondie(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], r: number): void {
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  for (let k = 1; k + 1 < pts.length; k++) {
    const a = pts[k - 1]!, b = pts[k]!, c = pts[k + 1]!
    const l1 = Math.hypot(b.x - a.x, b.y - a.y), l2 = Math.hypot(c.x - b.x, c.y - b.y)
    const rr = Math.min(r, l1 / 2, l2 / 2)
    if (rr > 0.5) ctx.arcTo(b.x, b.y, c.x, c.y, rr)
    else ctx.lineTo(b.x, b.y)
  }
  const z = pts[pts.length - 1]!
  ctx.lineTo(z.x, z.y)
}

/** Rectangle à coins arrondis (chemin seulement). */
function rectArrondi(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Motif de trait selon le statut : continu (validé), tireté (à vérifier), continu + barre (réfuté). */
function motifStatut(statut: string): number[] {
  return statut === 'incertain' ? [4, 2.5] : []
}

function tronquer(ctx: CanvasRenderingContext2D, texte: string, max: number): string {
  if (ctx.measureText(texte).width <= max) return texte
  let t = texte
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1)
  return t.trimEnd() + '…'
}

// ─── Calque « dessous » : feuille, cadres des blocs, fils, jonctions ─────────

export function dessinerDessous(c: ContexteDessinR, etat: EtatRendu): void {
  const { ctx, vue } = c
  const page = etat.page
  etat.titresEcran = []
  if (!page || !page.boites.length) return
  const e = vue.extrusion
  const cam = vue.camera
  const E = page.echelle
  const monde = (x: number, y: number, yw = 0): [number, number, number] => [(x - page.cx) * E, yw, -(y - page.cy) * E]
  const s0 = cam.pixelsParUnite() * E

  // Feuille et cadres : s'estompent en 3D.
  const alpha = Math.max(0, 1 - e * 1.6)
  if (alpha > 0.01) dessinerFeuille(ctx, vue, etat, monde, s0, alpha)
  if (alpha > 0.01 && lire<boolean>(vue, 'blocs')) dessinerCadres(c, etat, alpha)

  dessinerDeplies(c, etat)

  // Fils.
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
  const avant = etapeMiseEnAvant(etat)
  const base = Math.max(0.75, Math.min(1.3, 1.1 * s0))
  const LARGEUR: Record<RolePremisse, number> = { principale: 1.55, auxiliaire: 1.2, technique: 1, contexte: 1 }
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'butt'
  for (const r of page.routes) {
    const a = g.aretes[r.arete]
    if (!a) continue
    const os = vue.opaciteAffichee[r.source]!, oc = vue.opaciteAffichee[r.cible]!
    let alphaR = Math.min(1, Math.max(0.12, Math.min(os, oc)) * 1.1)
    let couleur = P.roles[r.role]
    let largeur = base * LARGEUR[r.role]
    if (survol !== null && (r.source === survol || r.cible === survol)) {
      alphaR = 1
      largeur += 0.9
    }
    if (vue.ligneeActive) {
      const ls = vue.lignee[r.source]!, lc = vue.lignee[r.cible]!
      const dans = ls > 0 && lc > 0 && !(ls === 2 && lc === 1) && !(ls === 1 && lc === 2) && !(ls === 3 && lc === 1) && !(ls === 2 && lc === 3)
      if (dans) {
        alphaR = 1
        largeur += 1
      } else alphaR *= 0.3
    }
    if (actifs && !(actifs.has(r.source) && actifs.has(r.cible))) alphaR *= 0.3
    if (avant !== null) {
      const bs = page.boites[r.source]!.etape, bc = page.boites[r.cible]!.etape
      if (bs !== avant && bc !== avant) alphaR *= 0.35
    }
    if (r.abandon) {
      couleur = P.gris
      ctx.setLineDash([1.5, 2.5])
    } else if (r.role === 'contexte') ctx.setLineDash([4, 3])
    else ctx.setLineDash([])
    const bs = page.boites[r.source]!, bc = page.boites[r.cible]!
    let pts: { x: number; y: number }[]
    if (transition) {
      const pr = vue.projection
      const ss = echelle(vue, page, r.source), sc = echelle(vue, page, r.cible)
      const xa = pr.x[r.source]! + (bs.w / 2) * ss, ya = pr.y[r.source]! + bs.ySortie * ss
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
    polyligneArrondie(ctx, pts, Math.max(2, 6 * s0))
    ctx.stroke()
  }
  ctx.setLineDash([])
  // Jonctions : point plein là où une sortie se divise.
  if (!transition && e < 0.02) {
    ctx.fillStyle = rgba(P.roles.principale, actifs || vue.ligneeActive || avant !== null ? 0.45 : 0.95)
    const rj = Math.max(1.6, Math.min(2.8, 2.4 * s0))
    for (const [x, y] of page.jonctions) {
      const q = cam.projeterPoint(monde(x, y))
      ctx.beginPath()
      ctx.arc(q.x, q.y, rj, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()

  // Décision → hypothèse dans la marge : fil vertical vers la spécification.
  ctx.save()
  for (const l of page.liensMarge) {
    const pr = vue.projection
    const s = echelle(vue, page, l.source)
    const bs = page.boites[l.source]!, bc = page.boites[l.cible]!
    const xa = pr.x[l.source]! + (bs.w / 2) * s, ya = pr.y[l.source]! + bs.ySortie * s
    const xm = xa + 10 * s
    const yb = pr.y[l.cible]!, xb = pr.x[l.cible]! - (bc.w / 2) * s
    const op = Math.min(vue.opaciteAffichee[l.source]!, vue.opaciteAffichee[l.cible]!)
    ctx.strokeStyle = rgba(P.roles.principale, 0.9 * op)
    ctx.lineWidth = base * 1.55
    ctx.beginPath()
    polyligneArrondie(ctx, [{ x: xa, y: ya }, { x: xm, y: ya }, { x: xm, y: (ya + yb) / 2 }, { x: xb - 10 * s, y: (ya + yb) / 2 }, { x: xb - 10 * s, y: yb }, { x: xb, y: yb }], Math.max(2, 6 * s))
    ctx.stroke()
  }
  ctx.restore()

  if (lire<boolean>(vue, 'liensSemantiques')) dessinerLiensSemantiques(c, etat)
}

/** Cadres des blocs de raisonnement (boîtes « Comment ») d'après les positions projetées des membres. */
function dessinerCadres({ ctx, vue }: ContexteDessinR, etat: EtatRendu, alpha: number): void {
  const page = etat.page!
  const P = etat.palette
  const pr = vue.projection
  const avant = etapeMiseEnAvant(etat)
  ctx.save()
  for (const et of page.etapes) {
    if (!et.encadre) continue
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, s = 1, presence = 0, lignee = false
    for (const u of et.membres) {
      if (!pr.visible[u]) continue
      const b = page.boites[u]!
      s = echelle(vue, page, u)
      x0 = Math.min(x0, pr.x[u]! - (b.w / 2 + CADRE.padX) * s)
      x1 = Math.max(x1, pr.x[u]! + (b.w / 2 + CADRE.padX) * s)
      y0 = Math.min(y0, pr.y[u]! - (b.haut + CADRE.padY + CADRE.titre) * s)
      y1 = Math.max(y1, pr.y[u]! + (b.bas + CADRE.padY) * s)
      presence = Math.max(presence, vue.presence[u]!)
      if (vue.lignee[u]! > 0) lignee = true
    }
    if (!Number.isFinite(x0) || presence < 0.05) continue
    const c = P.etapes[et.genre]
    let a = alpha * presence
    if (avant !== null && avant !== et.index) a *= 0.4
    if (vue.ligneeActive && !lignee) a *= 0.55
    const enAvant = avant === et.index
    const hT = CADRE.titre * s
    const r = Math.min(5, 5 * s)
    // Fond et barre de titre teintés, contour fin.
    ctx.fillStyle = rgba(c, 0.055 * a)
    rectArrondi(ctx, x0, y0, x1 - x0, y1 - y0, r)
    ctx.fill()
    ctx.save()
    ctx.clip()
    ctx.fillStyle = rgba(c, 0.13 * a)
    ctx.fillRect(x0, y0, x1 - x0, hT)
    ctx.strokeStyle = rgba(c, 0.3 * a)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x0, y0 + hT + 0.5)
    ctx.lineTo(x1, y0 + hT + 0.5)
    ctx.stroke()
    ctx.restore()
    ctx.strokeStyle = rgba(c, (enAvant ? 0.9 : 0.5) * a)
    ctx.lineWidth = enAvant ? 1.8 : 1
    if (et.genre === 'abandon') ctx.setLineDash([5, 3])
    rectArrondi(ctx, x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1, r)
    ctx.stroke()
    ctx.setLineDash([])
    // Titre : repère et genre (chasse fixe, couleur du bloc), puis la tête du bloc.
    const pad = 8 * s
    const t1 = Math.max(7.5, Math.min(12, 10 * s))
    const t2 = Math.max(8, Math.min(14, 11.5 * s))
    if (hT >= 13) {
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      const deuxLignes = hT >= 24
      const yl1 = deuxLignes ? y0 + hT * 0.32 : y0 + hT / 2
      ctx.font = `700 ${t1}px ${MONO}`
      ctx.fillStyle = rgba(c, a)
      const tete = `${et.ref}  ${et.titre.toUpperCase()}`
      ctx.fillText(tronquer(ctx, tete, x1 - x0 - 2 * pad), x0 + pad, yl1)
      const w1 = ctx.measureText(tete).width
      if (!deuxLignes) {
        ctx.font = `500 ${t2}px ${vue.palette.police}`
        ctx.fillStyle = rgba(P.encre, 0.85 * a)
        const reste = x1 - x0 - 2 * pad - w1 - 10
        if (reste > 30) ctx.fillText(tronquer(ctx, et.sousTitre, reste), x0 + pad + w1 + 10, yl1)
      } else {
        const n = et.membres.length
        ctx.font = `500 ${t1 * 0.92}px ${MONO}`
        ctx.textAlign = 'right'
        ctx.fillStyle = rgba(c, 0.75 * a)
        if (x1 - x0 - 2 * pad - w1 > 50) ctx.fillText(`${n} élément${n > 1 ? 's' : ''}`, x1 - pad, yl1)
        ctx.textAlign = 'left'
        ctx.font = `560 ${t2}px ${vue.palette.police}`
        ctx.fillStyle = rgba(P.encre, 0.9 * a)
        ctx.fillText(tronquer(ctx, et.sousTitre, x1 - x0 - 2 * pad), x0 + pad, y0 + hT * 0.72)
      }
    }
    etat.titresEcran.push({ genre: 'etape', point: et.index, noeud: -1, x0, y0, x1, y1: y0 + hT })
  }
  ctx.restore()
}

/** Feuille de plan : trame, cadre double, repères de lignes (A, B…), règle des rangs. */
function dessinerFeuille(
  ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu,
  monde: (x: number, y: number) => [number, number, number], s0: number, alpha: number,
): void {
  const page = etat.page!
  const P = etat.palette
  const cam = vue.camera
  const b = page.bornes
  const W = page.largeurCarte
  const fx0 = b.x0 - 46, fx1 = b.x1 + 34, fy0 = b.y0 - 76, fy1 = b.y1 + 34
  const hg = cam.projeterPoint(monde(fx0, fy0)), bd = cam.projeterPoint(monde(fx1, fy1))
  if (!hg.visible || !bd.visible) return
  const X = (x: number) => hg.x + (x - fx0) * s0
  const Y = (y: number) => hg.y + (y - fy0) * s0
  const grille = lire<boolean>(vue, 'grille')
  const feuille = lire<boolean>(vue, 'enTetes')
  const bande = 16
  const haut = 42 // hauteur de la bande de la règle
  ctx.save()
  if (grille) {
    const ix0 = fx0 + bande, iy0 = fy0 + haut
    for (const [pas, a] of [[20, 0.05], [100, 0.09]] as const) {
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
  ctx.strokeStyle = rgba(P.encre, 0.85 * alpha)
  ctx.lineWidth = 1.6
  ctx.strokeRect(X(fx0), Y(fy0), (fx1 - fx0) * s0, (fy1 - fy0) * s0)
  ctx.lineWidth = 0.8
  ctx.strokeStyle = rgba(P.encre, 0.6 * alpha)
  ctx.strokeRect(X(fx0 + bande), Y(fy0 + haut), (fx1 - fx0 - bande) * s0, (fy1 - fy0 - haut) * s0)
  const taille = Math.max(8.5, Math.min(11, 9.5 * s0))
  ctx.font = `500 ${taille}px ${MONO}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const pasL = 160
  ctx.strokeStyle = rgba(P.encre, 0.5 * alpha)
  ctx.lineWidth = 0.8
  let k = 0
  for (let y = fy0 + haut; y < fy1 - 1; y += pasL, k++) {
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
  // Règle des rangs logiques.
  const yR = fy0 + 28
  ctx.strokeStyle = rgba(P.encre, 0.75 * alpha)
  ctx.lineWidth = 0.9
  ctx.beginPath()
  ctx.moveTo(X(fx0 + bande), Y(yR))
  ctx.lineTo(X(fx1), Y(yR))
  ctx.stroke()
  const pasRang = page.xRangs.length > 1 ? page.xRangs[1]! - page.xRangs[0]! : W + 40
  ctx.beginPath()
  ctx.lineWidth = 0.7
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
  if (page.aMarge) reperes.unshift([page.xMarge, 'SPEC.'])
  for (const [x] of reperes) {
    ctx.moveTo(X(x), Y(yR) + 4 * Math.min(1.2, s0))
    ctx.lineTo(X(x), Y(yR) - 8 * Math.min(1.2, s0))
  }
  ctx.stroke()
  ctx.fillStyle = rgba(P.encre, 0.9 * alpha)
  ctx.textBaseline = 'bottom'
  for (const [x, t] of reperes) ctx.fillText(t, X(x), Y(yR) - 9 * Math.min(1.2, s0))
  ctx.restore()
}

/** Sous-systèmes dépliés : cadre mixte (trait-point) autour de chaque carte issue du dépliage. */
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
      const l = b.w / 2
      ctx.strokeStyle = rgba(P.accent, 0.8 * op)
      ctx.setLineDash([9, 3, 2, 3])
      ctx.lineWidth = 0.9
      ctx.strokeRect(x - (l + 5) * s, y - (b.haut + 5) * s, (2 * l + 10) * s, (b.haut + b.bas + 8) * s)
      ctx.setLineDash([])
      if (j.noeuds[g.unites[p]!.conclusion]!.id === tete) {
        ctx.font = `500 ${Math.max(8, 9 * s)}px ${MONO}`
        ctx.textAlign = 'right'
        ctx.textBaseline = 'bottom'
        ctx.fillStyle = rgba(P.accent, op)
        ctx.fillText(`SOUS-SYST. OUVERT (${pts.length}) · double-clic : refermer`, x + (l + 5) * s, y - (b.haut + 7) * s)
      }
    }
  }
  ctx.restore()
}

/** Contradictions, résolutions, abandons : crochets orthogonaux au-dessus des cartes. */
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
      const couleur = l.genre === 'resout' ? P.familles.decision : l.genre === 'contredit' ? P.encre : P.gris
      const pr = vue.projection
      const sa = echelle(vue, page, a), sb = echelle(vue, page, b)
      const x1 = pr.x[a]! + 14 * sa, y1 = pr.y[a]! - page.boites[a]!.h / 2 * sa
      const x2 = pr.x[b]! - 14 * sb, y2 = pr.y[b]! - page.boites[b]!.h / 2 * sb
      const my = Math.min(y1, y2) - Math.max(12, 14 * Math.min(sa, sb))
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

// ─── Calque « dessus » : cartes ──────────────────────────────────────────────

export function dessinerDessus(c: ContexteDessinR, etat: EtatRendu): void {
  const { ctx, vue } = c
  const page = etat.page
  // Barres de titre des blocs d'abord : les cartes, ajoutées ensuite, ont priorité au survol.
  etat.cibles = [...etat.titresEcran]
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
    const tags: string[] = []
    for (const [q, ref] of etat.hypotheses) {
      if (q === p) continue
      if ((toujours || actifs.includes(q)) && page.portees.get(q)?.includes(p)) tags.push(ref)
    }
    dessinerCarte(ctx, vue, etat, p, b, tags)
    ctx.restore()
    const x = pr.x[p]!, y = pr.y[p]!
    etat.cibles.push({ genre: b.genre === 'drapeau' ? 'drapeau' : 'carte', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y - (b.h / 2) * s, x1: x + (b.w / 2) * s, y1: y + (b.h / 2) * s })
    const y0 = yPastilles(b)
    for (const it of rangee(vue, b)) {
      const cx = x + it.x * s, cy = y + y0 * s
      if (it.renvoi >= 0) etat.cibles.push({ genre: 'renvoi', point: it.renvoi, noeud: -1, x0: cx - 14 * s, y0: cy - 7 * s, x1: cx + 14 * s, y1: cy + 7 * s })
      else etat.cibles.push({ genre: 'pastille', point: p, noeud: it.noeud, x0: cx - 7 * s, y0: cy - 7 * s, x1: cx + 7 * s, y1: cy + 7 * s })
    }
  }
}

/** Ordonnée (relative au centre) de la rangée de bornes. */
function yPastilles(b: Boite): number {
  return b.h / 2 + 11
}

/** Trait selon la lignée ou le survol ; null sinon. */
function traitLignee(vue: VueRaisonnement, etat: EtatRendu, p: number): { couleur: string; largeur: number } | null {
  const P = etat.palette
  if (vue.ligneeActive) {
    const l = vue.lignee[p]!
    if (l === 3) return { couleur: P.accent, largeur: 2.4 }
    if (l === 1) return { couleur: P.encre, largeur: 1.9 }
    if (l === 2) return { couleur: P.accent, largeur: 1.6 }
  }
  if (vue.survol === p) return { couleur: P.accent, largeur: 2 }
  return null
}

/** Rangée sous la carte : connecteurs de renvoi puis bornes de contexte (abscisses relatives). */
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
  ctx.font = `600 8.5px ${MONO}`
  ctx.lineWidth = 0.9
  for (const it of items) {
    if (it.renvoi < 0) continue
    const cible = etat.page?.boites[it.renvoi]
    const ref = cible?.ref ?? '?'
    const allume = sv?.genre === 'renvoi' && sv.point === it.renvoi
    const couleur = cible ? P.familles[cible.famille] : P.encre
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
    ctx.strokeStyle = allume ? P.accent : couleur
    ctx.stroke()
    ctx.fillStyle = allume ? P.surface : couleur
    ctx.fillText(ref, x - 1.5, y + 0.5)
  }
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
  ctx.fillStyle = etat.palette.familles.modele
  ctx.fillText(`⊢ ${tags.join(' ')}`, xDroite, yHaut - 2)
}

/** Broche : cercle plein (connectée) ou creux (non connectée). */
function broche(ctx: CanvasRenderingContext2D, x: number, y: number, couleur: string, pleine: boolean, fond: string): void {
  ctx.beginPath()
  ctx.arc(x, y, 3.3, 0, Math.PI * 2)
  ctx.fillStyle = pleine ? couleur : fond
  ctx.fill()
  ctx.lineWidth = pleine ? 1 : 1.3
  ctx.strokeStyle = pleine ? fond : couleur
  ctx.stroke()
}

function dessinerCarte(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, tags: string[]): void {
  const P = etat.palette
  const n = vue.noeud(p)
  const w = b.w, h = b.h
  const x0 = -w / 2, y0 = -h / 2
  const taille = lire<number>(vue, 'taillePolice')
  const lh = taille + 3
  const majeur = b.genre === 'majeur'
  const spec = b.genre === 'drapeau'
  const decision = b.genre === 'decision'
  const sousSysteme = b.genre === 'etape' || (vue.lecture.unites[p]?.membres.length ?? 1) > 1
  const tl = traitLignee(vue, etat, p)
  const actifSpec = spec && (etat.epingles.has(p) || (etat.survol?.genre === 'drapeau' && etat.survol.point === p))
  const couleurFamille = b.abandon ? P.etapes.abandon : P.familles[b.famille]
  const couleurTrait = tl ? tl.couleur : actifSpec ? P.familles.modele : b.abandon ? P.gris : tags.length ? P.familles.modele : rgba(P.encre, 0.72)
  const largeurTrait = tl ? tl.largeur : actifSpec ? 1.8 : majeur ? 1.5 : 1
  const motif = b.abandon ? [1.5, 2.5] : motifStatut(n.statut)
  const r = 3
  // Sous-système : seconde carte décalée (bloc hiérarchique).
  if (sousSysteme) {
    ctx.fillStyle = P.surface
    rectArrondi(ctx, x0 + 3.5, y0 - 3.5, w, h, r)
    ctx.fill()
    ctx.strokeStyle = rgba(b.abandon ? P.gris : P.encre, 0.5)
    ctx.lineWidth = 0.8
    ctx.setLineDash(motif)
    ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.fillStyle = b.abandon ? P.surface2 : P.surface
  rectArrondi(ctx, x0, y0, w, h, r)
  ctx.fill()
  // En-tête plein, couleur de la famille.
  ctx.save()
  rectArrondi(ctx, x0, y0, w, h, r)
  ctx.clip()
  ctx.fillStyle = couleurFamille
  ctx.fillRect(x0, y0, w, EN_TETE)
  ctx.restore()
  // Contour : code de trait du statut.
  ctx.strokeStyle = couleurTrait
  ctx.lineWidth = largeurTrait
  ctx.setLineDash(motif)
  rectArrondi(ctx, x0, y0, w, h, r)
  ctx.stroke()
  ctx.setLineDash([])
  if (n.statut === 'refute' && !b.abandon) {
    ctx.strokeStyle = rgba(P.encre, 0.7)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x0, y0 + h)
    ctx.lineTo(x0 + w, y0 + EN_TETE)
    ctx.stroke()
  }
  // Texte d'en-tête : repère, type, validation (ou portée d'une spécification).
  const gauche = x0 + 6
  const yT = y0 + EN_TETE / 2 + 0.5
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.font = `700 9px ${MONO}`
  const citeParRenvoi = etat.survol?.genre === 'renvoi' && etat.survol.point === p
  ctx.fillStyle = P.texteEnTete
  ctx.fillText(b.ref, gauche, yT)
  if (citeParRenvoi) {
    ctx.strokeStyle = P.texteEnTete
    ctx.lineWidth = 0.8
    const wr = ctx.measureText(b.ref).width
    ctx.beginPath()
    ctx.moveTo(gauche, yT + 5.5)
    ctx.lineTo(gauche + wr, yT + 5.5)
    ctx.stroke()
  }
  const wRef = ctx.measureText(b.ref).width
  ctx.font = `500 8px ${MONO}`
  ctx.fillStyle = rgba(P.texteEnTete, 0.85)
  const droite = spec
    ? `→${etat.page?.portees.get(p)?.filter((q) => q < vue.nU).length ?? 0}`
    : n.validation === 'aucune' ? '—' : n.validation === 'ia_humain' ? 'IA+H' : n.validation === 'humain' ? 'H' : 'IA'
  ctx.textAlign = 'right'
  ctx.fillText(droite, x0 + w - 6, yT)
  const wD = ctx.measureText(droite).width
  ctx.textAlign = 'left'
  const etiquette = spec && etat.epingles.has(p) ? `${b.etiquette} · ÉPINGLÉE` : b.etiquette
  ctx.fillText(tronquer(ctx, etiquette, w - 12 - wRef - 6 - wD - 6), gauche + wRef + 6, yT)
  // Titre.
  ctx.textBaseline = 'alphabetic'
  ctx.font = `${majeur || decision || spec ? 620 : 470} ${taille}px ${vue.palette.police}`
  ctx.fillStyle = b.abandon ? P.gris : P.encre
  b.lignes.forEach((l, k) => ctx.fillText(l, gauche, y0 + EN_TETE + 4 + taille + k * lh - 1))
  let yCorps = y0 + EN_TETE + 4 + b.lignes.length * lh + 4
  if (spec && b.specs.length) {
    // Spécification « Hyp. : … ».
    const tSpec = taille - 2
    ctx.strokeStyle = rgba(P.familles.modele, 0.35)
    ctx.lineWidth = 0.6
    ctx.beginPath()
    ctx.moveTo(gauche, yCorps - 1)
    ctx.lineTo(x0 + w - 6, yCorps - 1)
    ctx.stroke()
    ctx.font = `400 ${tSpec}px ${MONO}`
    ctx.fillStyle = P.gris
    b.specs.forEach((l, i) => ctx.fillText(l, gauche, yCorps + 2 + tSpec + i * (tSpec + 3)))
  } else if (decision && b.alternatives.length) {
    // Alternatives : une ligne chacune, broche à droite (retenue pleine, rejetée creuse).
    ctx.strokeStyle = rgba(P.familles.decision, 0.3)
    ctx.lineWidth = 0.6
    ctx.beginPath()
    ctx.moveTo(gauche, yCorps)
    ctx.lineTo(x0 + w - 6, yCorps)
    ctx.stroke()
    yCorps += 2
    ctx.textBaseline = 'middle'
    ctx.font = `500 ${Math.max(8, taille - 3.5)}px ${MONO}`
    b.alternatives.forEach((a, k) => {
      const yl = yCorps + k * LIGNE_ALT + LIGNE_ALT / 2
      ctx.fillStyle = a.retenue ? P.encre : P.gris
      ctx.fillText(tronquer(ctx, `${a.retenue ? '✓' : '×'} ${a.texte}`, w - 22), gauche, yl)
      if (!a.retenue) broche(ctx, x0 + w, yl, P.gris, false, P.surface)
    })
    if (b.autresAlternatives && lire<boolean>(vue, 'impasses')) {
      ctx.fillStyle = P.gris
      ctx.fillText(`+${b.autresAlternatives} rejetée${b.autresAlternatives > 1 ? 's' : ''}`, gauche, yCorps + b.alternatives.length * LIGNE_ALT + 4)
    }
  } else if (!spec && !decision) {
    // Jauge de confiance : échelle 0–1 graduée, intervalle (barre), estimation (index) et valeur.
    const cf = n.confiance
    ctx.font = `500 7.5px ${MONO}`
    const txt = cf.estimation.toFixed(2).replace('.', ',')
    const wTxt = ctx.measureText(txt).width
    const xa = gauche, xb = x0 + w - 10 - wTxt, yb = y0 + h - 6
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
    ctx.fillStyle = rgba(P.encre, 0.4)
    ctx.fillRect(xa + (xb - xa) * cf.bas, yb - 1.2, Math.max(1.2, (xb - xa) * (cf.haut - cf.bas)), 2.4)
    ctx.fillStyle = P.encre
    ctx.fillRect(xa + (xb - xa) * cf.estimation - 0.6, yb - 4, 1.2, 6)
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = P.gris
    ctx.fillText(txt, x0 + w - 5, yb - 0.5)
  }
  // Broches d'entrée (couleur : famille de la source) et de sortie (famille de la carte).
  b.ports.forEach((yp, k) => {
    const f = b.portsFamille[k]
    broche(ctx, x0, yp, f ? P.familles[f] : P.gris, true, P.surface)
  })
  const sortie = (vue.lecture.sortantes[p]?.length ?? 0) > 0 || !!etat.page?.usagesRenvoi.has(p) || (etat.page?.liensMarge.some((l) => l.source === p) ?? false)
  broche(ctx, x0 + w, b.ySortie, couleurFamille, sortie, P.surface)
  dessinerRangee(ctx, vue, etat, b)
  dessinerTags(ctx, etat, tags, x0 + w, y0 - (sousSysteme ? 3.5 : 0))
}

// ─── Survol ──────────────────────────────────────────────────────────────────

/** Élément sous le pointeur (écran), d'après la dernière image. */
export function cibleSous(etat: EtatRendu, x: number, y: number): Cible | null {
  // Bornes et connecteurs d'abord (petits, au-dessus des cartes voisines).
  for (let k = etat.cibles.length - 1; k >= 0; k--) {
    const c = etat.cibles[k]!
    if ((c.genre === 'pastille' || c.genre === 'renvoi') && x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) return c
  }
  for (let k = etat.cibles.length - 1; k >= 0; k--) {
    const c = etat.cibles[k]!
    const m = c.genre === 'etape' ? 0 : 2
    if (x >= c.x0 - m && x <= c.x1 + m && y >= c.y0 - m && y <= c.y1 + m) return c
  }
  return null
}
