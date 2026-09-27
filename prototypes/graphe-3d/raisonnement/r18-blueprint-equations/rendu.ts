// R18 · Rendu « Blueprint · équations » sur les calques canvas de la vue.
//
// - Dessous : feuille de plan (trame, cadre double, repères de lignes, règle des rangs, cotes de zones,
//   CARTOUCHE dessiné dans le coin bas droit de la feuille, sous le schéma : il ne recouvre jamais un bloc),
//   boîtes de commentaire (sous-problèmes : rectangle teinté translucide, barre de titre colorée ; boîtes
//   imbriquées plus petites), liaisons orthogonales colorées par la grandeur transmise, jonctions.
// - Dessus : blocs à angles vifs, en-tête coloré par famille (repère, type, validation, titre), corps =
//   formules composées (variables en italique, opérateurs espacés) ou énoncé court, broches d'entrée
//   colorées avec le symbole transmis, broche de sortie, jauge de confiance ; décisions en losange ;
//   spécifications de modélisation.
// - Statut par le code de trait (jamais par la couleur) : continu = validé, tireté = à vérifier,
//   barré = réfuté, pointillé gris = piste abandonnée.

import { rgba, type ContexteDessinR, type ValeurReglage, type VueRaisonnement } from '../../src/raisonnement'
import { composer, dessinerFormule } from './formules'
import {
  BOITE, FAMILLES, interligneFormule, MONO, PIED, TAILLE_SYMBOLE, tailleCourt, tailleFormule,
  type Boite, type Commentaire, type MiseEnPage,
} from './mise-en-page'
import { etatSquelette } from './squelette'

export interface PaletteR18 {
  encre: string
  gris: string
  trait: string
  surface: string
  surface2: string
  accent: string
  sombre: boolean
}

export function lirePaletteR18(el: HTMLElement): PaletteR18 {
  const s = getComputedStyle(el)
  const v = (n: string, d: string) => s.getPropertyValue(n).trim() || d
  return {
    encre: v('--texte', '#16181c'),
    gris: v('--texte-doux', '#62676f'),
    trait: v('--arete', '#3a3e45'),
    surface: v('--surface', '#ffffff'),
    surface2: v('--surface-2', '#f3f4f5'),
    accent: v('--accent', '#1a5fd0'),
    sombre: el.dataset.theme === 'sombre',
  }
}

/** Élément interactif dessiné à la dernière image (pour le survol). */
export interface Cible {
  genre: 'carte' | 'pastille' | 'renvoi' | 'drapeau' | 'impasse' | 'masque'
  point: number
  noeud: number
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface DonneesCartouche {
  titre: string
  champs: [string, string][]
}

export interface EtatRendu {
  page: MiseEnPage | null
  palette: PaletteR18
  cibles: Cible[]
  survol: Cible | null
  epingles: Set<number>
  hypotheses: Map<number, string>
  /** Cartouche dessiné sur la feuille (null : masqué). */
  cartouche: DonneesCartouche | null
}

const lire = <T extends ValeurReglage>(vue: VueRaisonnement, cle: string) => vue.reglages.lire<T>(cle)

function echelle(vue: VueRaisonnement, page: MiseEnPage, p: number): number {
  return vue.camera.pixelsParUnite() * (vue.projection.echelle[p] || 1) * page.echelle
}

export function choixActifs(_vue: VueRaisonnement, etat: EtatRendu): number[] {
  const r = [...etat.epingles]
  const s = etat.survol
  if (s && s.genre === 'drapeau' && !etat.epingles.has(s.point)) r.push(s.point)
  return r
}

export function dependantsActifs(vue: VueRaisonnement, etat: EtatRendu): Set<number> | null {
  const page = etat.page
  if (!page) return null
  const actifs = choixActifs(vue, etat)
  if (!actifs.length) return null
  const s = new Set<number>(actifs)
  for (const c of actifs) for (const q of page.portees.get(c) ?? []) s.add(q)
  return s
}

/** Couleur d'en-tête d'une famille selon le thème. */
function couleurFamille(b: Boite, P: PaletteR18): string {
  if (b.abandon) return P.sombre ? '#5d626a' : '#9aa0a8'
  const f = FAMILLES[b.famille]
  return P.sombre ? f.couleurSombre : f.couleur
}

/** Couleur d'une liaison / broche : grandeur transmise, sinon rôle de la prémisse. */
export function couleurLiaison(grandeur: { couleur: string } | null, role: string, P: PaletteR18): string {
  if (grandeur) return grandeur.couleur
  return role === 'principale' ? (P.sombre ? '#c9ccd1' : '#3f434a') : (P.sombre ? '#7b8089' : '#9aa0a8')
}

// ─── Feuille : dimensions (partagées avec le cadrage) ─────────────────────────

export const CARTOUCHE = { l: 312, h: 104 }

/** Feuille de plan (px de mise en page) : contenu + règle en haut + cartouche en bas à droite. */
export function feuilleDe(page: MiseEnPage, avecCartouche: boolean): { x0: number; y0: number; x1: number; y1: number; cartouche: { x0: number; y0: number; x1: number; y1: number } | null } {
  const b = page.bornes
  const x0 = b.x0 - 46
  let x1 = b.x1 + 34
  const y0 = b.y0 - 92
  let y1 = b.y1 + 34
  let cartouche = null
  if (avecCartouche) {
    // Sous le schéma, calé à droite dans le cadre intérieur : jamais sur un bloc.
    x1 = Math.max(x1, x0 + 16 + CARTOUCHE.l + 40)
    y1 = b.y1 + 22 + CARTOUCHE.h
    cartouche = { x0: x1 - CARTOUCHE.l, y0: y1 - CARTOUCHE.h, x1, y1 }
  }
  return { x0, y0, x1, y1, cartouche }
}

// ─── Primitives ──────────────────────────────────────────────────────────────

function polyligne(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]): void {
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k]!.x, pts[k]!.y)
}

function motifStatut(statut: string): number[] {
  return statut === 'incertain' ? [4, 2.5] : []
}

function tronquer(ctx: CanvasRenderingContext2D, t: string, max: number): string {
  if (ctx.measureText(t).width <= max) return t
  let x = t
  while (x.length > 1 && ctx.measureText(x + '…').width > max) x = x.slice(0, -1)
  return x.trimEnd() + '…'
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

  const alpha = Math.max(0, 1 - e * 1.6)
  if (alpha > 0.01) dessinerFeuille(ctx, vue, etat, monde, s0, alpha)
  if (alpha > 0.01) dessinerCommentaires(ctx, vue, etat, s0, alpha)

  dessinerDeplies(c, etat)

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
  const epaisseur = Math.max(1, Math.min(1.8, 1.5 * s0))
  ctx.save()
  ctx.lineJoin = 'miter'
  ctx.lineCap = 'butt'
  for (const r of page.routes) {
    const a = g.aretes[r.arete]
    if (!a) continue
    const os = vue.opaciteAffichee[r.source]!, oc = vue.opaciteAffichee[r.cible]!
    let alphaR = Math.min(1, Math.max(0.12, Math.min(os, oc)) * 1.1) * 0.95
    let couleur = couleurLiaison(r.grandeur, r.role, P)
    let largeur = epaisseur
    if (survol !== null && (r.source === survol || r.cible === survol)) {
      alphaR = 1
      largeur = epaisseur + 1
    }
    if (vue.ligneeActive) {
      const ls = vue.lignee[r.source]!, lc = vue.lignee[r.cible]!
      const dans = ls > 0 && lc > 0 && !(ls === 2 && lc === 1) && !(ls === 1 && lc === 2) && !(ls === 3 && lc === 1) && !(ls === 2 && lc === 3)
      if (dans) {
        alphaR = 1
        largeur = epaisseur + 1
      } else alphaR *= 0.28
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
  }
  // Jonctions : point plein, couleur de la sortie.
  if (!transition && e < 0.02) {
    const rj = Math.max(1.8, Math.min(3, 2.6 * s0))
    const vues = new Set<string>()
    for (const r of page.routes) {
      for (const [x, y] of page.jonctions) {
        const cle = `${x}:${y}`
        if (vues.has(cle)) continue
        if (!r.points.some(([px, py]) => Math.abs(px - x) < 0.5 && Math.abs(py - y) < 0.5)) continue
        vues.add(cle)
        const q = cam.projeterPoint(monde(x, y))
        ctx.fillStyle = rgba(couleurLiaison(r.grandeur, r.role, P), actifs || vue.ligneeActive ? 0.45 : 1)
        ctx.beginPath()
        ctx.arc(q.x, q.y, rj, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  ctx.restore()

  // Décision → hypothèse dans la marge.
  ctx.save()
  for (const l of page.liensMarge) {
    const pr = vue.projection
    const s = echelle(vue, page, l.source)
    const bc = page.boites[l.cible]!
    const xm = pr.x[l.cible]! - (bc.w / 2 - 12) * s
    const ya = pr.y[l.source]!, yb = pr.y[l.cible]! - (bc.h / 2) * s
    const xa = pr.x[l.source]! - 19 * s
    const op = Math.min(vue.opaciteAffichee[l.source]!, vue.opaciteAffichee[l.cible]!)
    ctx.strokeStyle = rgba(P.trait, 0.9 * op)
    ctx.lineWidth = epaisseur * 0.8
    ctx.beginPath()
    polyligne(ctx, [{ x: xa, y: ya }, { x: xm, y: ya }, { x: xm, y: yb }])
    ctx.stroke()
  }
  ctx.restore()

  if (lire<boolean>(vue, 'liensSemantiques')) dessinerLiensSemantiques(c, etat)
}

/** Boîtes de commentaire : rectangle calculé à chaque image depuis les blocs membres (suit les transitions). */
function dessinerCommentaires(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, s0: number, alpha: number): void {
  const page = etat.page!
  if (!page.commentaires.length) return
  const pr = vue.projection
  const P = etat.palette
  const rects = new Map<string, { x0: number; y0: number; x1: number; y1: number }>()
  const rectMembres = (c: Commentaire) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const p of c.membres) {
      if (!pr.visible[p] || vue.presence[p]! < 0.05) continue
      const b = page.boites[p]!
      const s = echelle(vue, page, p)
      const l = b.genre === 'decision' ? Math.max(24, b.w / 2) : b.w / 2
      x0 = Math.min(x0, pr.x[p]! - l * s)
      x1 = Math.max(x1, pr.x[p]! + l * s)
      y0 = Math.min(y0, pr.y[p]! - b.haut * s)
      y1 = Math.max(y1, pr.y[p]! + b.bas * s)
    }
    return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null
  }
  // Imbriquées d'abord (leur rectangle agrandit celui du parent).
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
    if (!r) continue
    const n1 = c.niveau === 1
    const hTitre = (n1 ? BOITE.titreS : BOITE.titre) * s0
    const w = r.x1 - r.x0, h = r.y1 - r.y0
    // Fond translucide teinté, barre de titre plus soutenue, contour fin.
    ctx.fillStyle = rgba(c.couleur, (n1 ? 0.075 : 0.055) * alpha * (P.sombre ? 1.6 : 1))
    ctx.fillRect(r.x0, r.y0, w, h)
    if (c.abandon) {
      // Hachures fines : piste gardée pour mémoire.
      ctx.save()
      ctx.beginPath()
      ctx.rect(r.x0, r.y0 + hTitre, w, h - hTitre)
      ctx.clip()
      ctx.strokeStyle = rgba(c.couleur, 0.14 * alpha)
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
    ctx.fillStyle = rgba(c.couleur, (n1 ? 0.16 : 0.2) * alpha * (P.sombre ? 1.4 : 1))
    ctx.fillRect(r.x0, r.y0, w, hTitre)
    ctx.strokeStyle = rgba(c.couleur, (n1 ? 0.55 : 0.5) * alpha)
    ctx.lineWidth = 1
    if (c.abandon) ctx.setLineDash([4, 3])
    ctx.strokeRect(Math.round(r.x0) + 0.5, Math.round(r.y0) + 0.5, Math.round(w) - 1, Math.round(h) - 1)
    ctx.setLineDash([])
    // Titre.
    const taille = (n1 ? 10.5 : 12) * s0
    if (taille >= 6.5) {
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      ctx.font = `600 ${taille}px ${vue.palette.police}`
      ctx.fillStyle = rgba(P.sombre ? '#e4e6ea' : c.couleur, alpha)
      const compte = `${c.membres.length} bloc${c.membres.length > 1 ? 's' : ''}`
      const titre = c.abandon && !/abandon/i.test(c.nom) ? `Piste abandonnée · ${c.nom}` : c.nom
      ctx.font = `500 ${taille * 0.78}px ${MONO}`
      const wCompte = ctx.measureText(compte).width
      ctx.font = `600 ${taille}px ${vue.palette.police}`
      const t = tronquer(ctx, titre, w - 14 * s0 - wCompte - 10 * s0)
      ctx.fillText(t, r.x0 + 7 * s0, r.y0 + hTitre / 2 + 0.5)
      ctx.font = `500 ${taille * 0.78}px ${MONO}`
      ctx.textAlign = 'right'
      ctx.fillStyle = rgba(P.gris, alpha)
      if (ctx.measureText(t).width + wCompte + 30 * s0 < w) ctx.fillText(compte, r.x1 - 7 * s0, r.y0 + hTitre / 2 + 0.5)
    }
  }
  ctx.restore()
}

/** Feuille de plan : trame, cadre double, repères de lignes, règle des rangs, cotes, cartouche. */
function dessinerFeuille(
  ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu,
  monde: (x: number, y: number) => [number, number, number], s0: number, alpha: number,
): void {
  const page = etat.page!
  const P = etat.palette
  const cam = vue.camera
  const f = feuilleDe(page, !!etat.cartouche)
  const fx0 = f.x0, fx1 = f.x1, fy0 = f.y0, fy1 = f.y1
  const hg = cam.projeterPoint(monde(fx0, fy0)), bd = cam.projeterPoint(monde(fx1, fy1))
  if (!hg.visible || !bd.visible) return
  const X = (x: number) => hg.x + (x - fx0) * s0
  const Y = (y: number) => hg.y + (y - fy0) * s0
  const grille = lire<boolean>(vue, 'grille')
  const feuille = lire<boolean>(vue, 'enTetes')
  const bande = 16
  ctx.save()
  if (grille) {
    const ix0 = fx0 + bande, iy0 = fy0 + 58
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
    if (f.cartouche) dessinerCartouche(ctx, vue, etat, X, Y, s0, f.cartouche, alpha)
    ctx.restore()
    return
  }
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
  // Règle des rangs logiques (colonnes de largeur variable : un repère au centre de chaque rang).
  const yR = fy0 + 30
  ctx.strokeStyle = rgba(P.encre, 0.75 * alpha)
  ctx.lineWidth = 0.9
  ctx.beginPath()
  ctx.moveTo(X(fx0 + bande), Y(yR))
  ctx.lineTo(X(fx1), Y(yR))
  ctx.stroke()
  ctx.beginPath()
  ctx.lineWidth = 0.7
  // Graduations mineures : bords de chaque colonne.
  page.xRangs.forEach((x, r) => {
    const l = page.largeursRangs[r]! / 2
    for (const xt of [x - l, x + l]) {
      ctx.moveTo(X(xt), Y(yR))
      ctx.lineTo(X(xt), Y(yR) - 3 * Math.min(1.2, s0))
    }
  })
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
  // Cotes de zones sous la règle (les limites verticales couperaient les boîtes : pas de pointillé).
  const yZ = fy0 + 46
  ctx.font = `600 ${taille * 0.92}px ${MONO}`
  for (const z of page.zones) {
    const xa = X(z.x0 + 3), xb = X(z.x1 - 3), ym = Y(yZ)
    ctx.strokeStyle = rgba(P.gris, 0.75 * alpha)
    ctx.lineWidth = 0.8
    const nom = z.nom.toUpperCase()
    const wt = ctx.measureText(nom).width
    const tient = wt < xb - xa - 14
    const xm = (xa + xb) / 2
    ctx.beginPath()
    ctx.moveTo(xa, ym - 4)
    ctx.lineTo(xa, ym + 4)
    ctx.moveTo(xb, ym - 4)
    ctx.lineTo(xb, ym + 4)
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
  }
  if (f.cartouche) dessinerCartouche(ctx, vue, etat, X, Y, s0, f.cartouche, alpha)
  ctx.restore()
}

/** Cartouche du plan, dessiné sur la feuille (suit le zoom, jamais sur un bloc). */
function dessinerCartouche(
  ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, X: (x: number) => number, Y: (y: number) => number,
  s0: number, r: { x0: number; y0: number; x1: number; y1: number }, alpha: number,
): void {
  const d = etat.cartouche
  if (!d) return
  const P = etat.palette
  const x0 = X(r.x0), y0 = Y(r.y0), w = (r.x1 - r.x0) * s0, h = (r.y1 - r.y0) * s0
  ctx.save()
  ctx.fillStyle = rgba(P.surface, alpha)
  ctx.fillRect(x0, y0, w, h)
  ctx.strokeStyle = rgba(P.encre, 0.9 * alpha)
  ctx.lineWidth = 1.4
  ctx.strokeRect(x0, y0, w, h)
  if (8 * s0 < 4.5) {
    ctx.restore()
    return
  }
  const hTitre = 30 * s0
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.moveTo(x0, y0 + hTitre)
  ctx.lineTo(x0 + w, y0 + hTitre)
  ctx.stroke()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = rgba(P.gris, alpha)
  ctx.font = `500 ${7.5 * s0}px ${MONO}`
  ctx.fillText('SCHÉMA DE RAISONNEMENT', x0 + 7 * s0, y0 + 11 * s0)
  ctx.fillStyle = rgba(P.encre, alpha)
  ctx.font = `600 ${11 * s0}px ${vue.palette.police}`
  ctx.fillText(tronquer(ctx, d.titre, w - 14 * s0), x0 + 7 * s0, y0 + 25 * s0)
  // Grille 2 colonnes × 4 lignes ; l'échelle est recalculée à chaque image.
  const champs = d.champs.map(([n, v]) => (n === 'ÉCHELLE' ? [n, texteEchelle(vue, etat)] : [n, v]) as [string, string])
  const lignes = Math.ceil(champs.length / 2)
  const hL = (h - hTitre) / lignes
  ctx.strokeStyle = rgba(P.gris, 0.45 * alpha)
  ctx.beginPath()
  ctx.moveTo(x0 + w / 2, y0 + hTitre)
  ctx.lineTo(x0 + w / 2, y0 + h)
  for (let k = 1; k < lignes; k++) {
    ctx.moveTo(x0, y0 + hTitre + k * hL)
    ctx.lineTo(x0 + w, y0 + hTitre + k * hL)
  }
  ctx.stroke()
  champs.forEach(([nom, val], i) => {
    const cx = x0 + (i % 2) * (w / 2) + 7 * s0
    const cy = y0 + hTitre + Math.floor(i / 2) * hL
    ctx.fillStyle = rgba(P.gris, alpha)
    ctx.font = `500 ${6.8 * s0}px ${MONO}`
    ctx.fillText(nom, cx, cy + 8.5 * s0)
    ctx.fillStyle = rgba(P.encre, alpha)
    ctx.font = `500 ${8.6 * s0}px ${MONO}`
    ctx.fillText(tronquer(ctx, val, w / 2 - 14 * s0), cx, cy + hL - 4 * s0)
  })
  ctx.restore()
}

export function texteEchelle(vue: VueRaisonnement, etat: EtatRendu): string {
  const s = vue.camera.pixelsParUnite() * (etat.page?.echelle ?? 0.01)
  return `1 : ${(1 / Math.max(1e-6, s)).toFixed(2).replace('.', ',')}`
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
    if (b.genre === 'drapeau') dessinerSpec(ctx, vue, etat, p, b)
    else if (b.genre === 'decision') dessinerDecision(ctx, vue, etat, p, b, tags)
    else dessinerBloc(ctx, vue, etat, p, b, tags)
    ctx.restore()
    const x = pr.x[p]!, y = pr.y[p]!
    if (b.genre === 'decision') {
      const l = Math.max(19, b.w / 2)
      etat.cibles.push({ genre: 'carte', point: p, noeud: -1, x0: x - l * s, y0: y - b.haut * s, x1: x + l * s, y1: y + 22 * s })
      if (b.impasse && lire<boolean>(vue, 'impasses')) etat.cibles.push({ genre: 'impasse', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y + 22 * s, x1: x + (b.w / 2) * s, y1: y + 48 * s })
    } else if (b.genre === 'drapeau') etat.cibles.push({ genre: 'drapeau', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y - (b.h / 2) * s, x1: x + (b.w / 2) * s, y1: y + (b.h / 2) * s })
    else etat.cibles.push({ genre: 'carte', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y - b.haut * s, x1: x + (b.w / 2) * s, y1: y + (b.h - b.haut) * s })
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
  return b.h - b.haut + 11
}

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

function dessinerTags(ctx: CanvasRenderingContext2D, etat: EtatRendu, tags: string[], xDroite: number, yHaut: number): void {
  if (!tags.length) return
  ctx.font = `600 8.5px ${MONO}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = etat.palette.accent
  ctx.fillText(`⊢ ${tags.join(' ')}`, xDroite, yHaut - 2)
}

/** En-tête coloré : repère, type, validation, puis titre (texte clair sur la couleur de famille). */
function dessinerEnTete(
  ctx: CanvasRenderingContext2D, vue: VueRaisonnement, b: Boite, x0: number, y0: number, fond: string,
  droite: string, gras: boolean,
): void {
  const w = b.w
  const T = lire<number>(vue, 'taillePolice')
  ctx.fillStyle = fond
  ctx.fillRect(x0, y0, w, b.hEnTete)
  const clair = '#ffffff'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.font = `700 9px ${MONO}`
  ctx.fillStyle = clair
  ctx.fillText(b.ref, x0 + 6, y0 + 8.5)
  const wRef = ctx.measureText(b.ref).width
  ctx.font = `500 8px ${MONO}`
  ctx.fillStyle = rgba(clair, 0.82)
  ctx.textAlign = 'right'
  ctx.fillText(droite, x0 + w - 6, y0 + 8.5)
  const wVal = ctx.measureText(droite).width
  ctx.textAlign = 'left'
  ctx.fillText(tronquer(ctx, b.etiquette, w - 12 - wRef - 6 - wVal - 6), x0 + 6 + wRef + 6, y0 + 8.5)
  ctx.textBaseline = 'alphabetic'
  ctx.font = `${gras ? 650 : 600} ${T}px ${vue.palette.police}`
  ctx.fillStyle = clair
  b.lignes.forEach((l, k) => ctx.fillText(l, x0 + 6, y0 + 16 + T + k * (T + 2) - 1))
}

/** Broches d'entrée (flanc gauche) : cercle plein coloré, symbole transmis à côté. */
function dessinerBroches(ctx: CanvasRenderingContext2D, etat: EtatRendu, b: Boite, x0: number): void {
  const P = etat.palette
  for (const br of b.broches) {
    const c = couleurLiaison(br.grandeur, br.role, P)
    ctx.beginPath()
    ctx.arc(x0, br.y, 3.4, 0, Math.PI * 2)
    ctx.fillStyle = c
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = P.surface
    ctx.stroke()
    if (br.symbole && b.retrait > 12) dessinerFormule(ctx, composer(br.symbole), x0 + 7, br.y + 3.4, TAILLE_SYMBOLE, c, c)
  }
}

function dessinerBloc(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, tags: string[]): void {
  const P = etat.palette
  const n = vue.noeud(p)
  const w = b.w, h = b.h
  const x0 = -w / 2, y0 = -b.haut
  const T = lire<number>(vue, 'taillePolice')
  const majeur = b.genre === 'majeur'
  const sousSysteme = b.genre === 'etape' || (vue.lecture.unites[p]?.membres.length ?? 1) > 1
  const tl = traitLignee(vue, etat, p)
  const couleurTrait = tl ? tl.couleur : b.abandon ? P.gris : tags.length ? P.accent : P.encre
  const largeurTrait = tl ? tl.largeur : majeur ? 1.6 : 1
  const motif = b.abandon ? [1.5, 2.5] : motifStatut(n.statut)
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
  const val = n.validation === 'aucune' ? '—' : n.validation === 'ia_humain' ? 'IA+H' : n.validation === 'humain' ? 'H' : 'IA'
  dessinerEnTete(ctx, vue, b, x0, y0, couleurFamille(b, P), val, majeur)
  // Corps : formules (ou énoncé court).
  const yCorps = y0 + b.hEnTete
  const xTexte = x0 + b.retrait
  // Contenu centré verticalement dans le corps (qui peut être plus haut, pour loger les broches).
  if (b.formules.length) {
    const tF = tailleFormule(T), lh = interligneFormule(T)
    const y1 = yCorps + (b.hCorps - (b.formules.length * lh + 6)) / 2 + 3
    b.formules.forEach((l, k) => dessinerFormule(ctx, l, xTexte, y1 + lh * k + lh / 2 + tF * 0.32, tF, b.abandon ? P.gris : P.encre, P.gris))
  } else if (b.court.length) {
    const tc = tailleCourt(T)
    const y1 = yCorps + (b.hCorps - (b.court.length * (tc + 3.5) + 9)) / 2
    ctx.font = `italic 400 ${tc}px ${vue.palette.police}`
    ctx.fillStyle = P.gris
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    b.court.forEach((l, k) => ctx.fillText(l, xTexte, y1 + 5 + tc + k * (tc + 3.5)))
  }
  // Filet au-dessus du pied, jauge de confiance.
  const yPied = yCorps + b.hCorps
  ctx.strokeStyle = rgba(P.gris, 0.3)
  ctx.lineWidth = 0.6
  ctx.beginPath()
  ctx.moveTo(x0, yPied)
  ctx.lineTo(x0 + w, yPied)
  ctx.stroke()
  const cf = n.confiance
  ctx.font = `500 7.5px ${MONO}`
  const txt = cf.estimation.toFixed(2).replace('.', ',')
  const wTxt = ctx.measureText(txt).width
  const xa = x0 + 6, xb = x0 + w - 10 - wTxt, yb = yPied + PIED - 4
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
  // Contour : code de trait du statut.
  ctx.strokeStyle = couleurTrait
  ctx.lineWidth = largeurTrait
  ctx.setLineDash(motif)
  ctx.strokeRect(x0, y0, w, h)
  ctx.setLineDash([])
  if (n.statut === 'refute' && !b.abandon) {
    ctx.strokeStyle = rgba(couleurTrait, 0.8)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x0, y0 + h)
    ctx.lineTo(x0 + w, y0)
    ctx.stroke()
  }
  // Broches.
  dessinerBroches(ctx, etat, b, x0)
  const sorties = (vue.lecture.sortantes[p]?.length ?? 0) > 0 || !!etat.page?.usagesRenvoi.has(p)
  const cSortie = b.sortie ? b.sortie.couleur : P.sombre ? '#c9ccd1' : '#3f434a'
  ctx.beginPath()
  ctx.arc(x0 + w, 0, 3.4, 0, Math.PI * 2)
  ctx.fillStyle = sorties ? cSortie : P.surface
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = sorties ? P.surface : cSortie
  ctx.stroke()
  dessinerRangee(ctx, vue, etat, b)
  dessinerTags(ctx, etat, tags, x0 + w, y0 - (sousSysteme ? 3.5 : 0))
}

function dessinerDecision(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, tags: string[]): void {
  const P = etat.palette
  const taille = lire<number>(vue, 'taillePolice')
  const tl = traitLignee(vue, etat, p)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `600 ${taille}px ${vue.palette.police}`
  ctx.fillStyle = P.encre
  const n0 = b.lignes.length
  b.lignes.forEach((l, k) => ctx.fillText(l, 0, -19 - 6 - (n0 - 1 - k) * (taille + 3)))
  dessinerTags(ctx, etat, tags, b.w / 2, -19 - 4 - n0 * (taille + 3))
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
  // Losange : moitié haute teintée de la famille « décision ».
  ctx.beginPath()
  ctx.moveTo(0, -19)
  ctx.lineTo(19, 0)
  ctx.lineTo(0, 19)
  ctx.lineTo(-19, 0)
  ctx.closePath()
  ctx.fillStyle = P.surface
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.fillStyle = couleurFamille(b, P)
  ctx.fillRect(-19, -19, 38, 19)
  ctx.restore()
  ctx.strokeStyle = tl ? tl.couleur : tags.length ? P.accent : P.encre
  ctx.lineWidth = tl ? tl.largeur : 1.2
  ctx.stroke()
  ctx.font = `700 9px ${MONO}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'
  ctx.fillText(b.ref, 0, -7)
  // Broches : entrée à gauche, sortie à droite.
  const entree = b.broches[0]
  if (entree) {
    ctx.beginPath()
    ctx.arc(-19, 0, 3.2, 0, Math.PI * 2)
    ctx.fillStyle = couleurLiaison(entree.grandeur, entree.role, P)
    ctx.fill()
  }
  dessinerRangee(ctx, vue, etat, b)
}

/** Spécification (choix de modélisation) : en-tête coloré, formule(s), « Hyp. : … ». */
function dessinerSpec(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite): void {
  const P = etat.palette
  const epingle = etat.epingles.has(p)
  const actif = epingle || (etat.survol?.genre === 'drapeau' && etat.survol.point === p)
  const T = lire<number>(vue, 'taillePolice')
  const tSpec = T - 2
  const w = b.w, h = b.h
  const x0 = -w / 2, y0 = -h / 2
  const tl = traitLignee(vue, etat, p)
  const couleur = tl ? tl.couleur : actif ? P.accent : P.encre
  ctx.fillStyle = P.surface
  ctx.fillRect(x0, y0, w, h)
  const portee = etat.page?.portees.get(p)?.filter((q) => q < vue.nU).length ?? 0
  const b2 = { ...b, etiquette: `MODÉLISATION${epingle ? ' · ÉPINGLÉE' : ''}` }
  dessinerEnTete(ctx, vue, b2, x0, y0, actif ? P.accent : couleurFamille(b, P), `→${portee}`, false)
  let y = y0 + b.hEnTete + 6
  if (b.formules.length) {
    const tF = tailleFormule(T), lh = interligneFormule(T)
    b.formules.forEach((l, k) => dessinerFormule(ctx, l, x0 + 8, y + lh * k + lh / 2 + tF * 0.32 - 3, tF, P.encre, P.gris))
    y += b.formules.length * lh
  }
  if (b.specs.length) {
    ctx.font = `400 ${tSpec}px ${MONO}`
    ctx.fillStyle = P.gris
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    b.specs.forEach((l, i) => ctx.fillText(l, x0 + 8, y + 2 + tSpec + i * (tSpec + 3)))
  }
  ctx.strokeStyle = couleur
  ctx.lineWidth = tl ? tl.largeur : actif ? 1.6 : 1
  ctx.strokeRect(x0, y0, w, h)
}

// ─── Survol ──────────────────────────────────────────────────────────────────

export function cibleSous(etat: EtatRendu, x: number, y: number): Cible | null {
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

