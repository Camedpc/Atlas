// R41 · Rendu sur les calques canvas de la vue (le texte rapproché est dans composition.ts).
//
// - Dessous : boîtes englobantes de R18 (rectangle teinté translucide, barre de titre colorée, contour fin ;
//   boîtes imbriquées ; piste abandonnée hachurée et tiretée), axe des rangs et accolades de R36, liaisons
//   orthogonales au trait fin avec pointe « to » de TikZ, jonctions en point plein.
// - Dessus : cadres des blocs de R36 (statut par le trait, double cadre pour un résultat, copie décalée pour
//   un sous-système, losange de décision), nœuds-fonctions de R19 (broches ▷ et ●, statut le plus faible),
//   figures pgfplots de R35, bornes de contexte, renvois « cf. 7 », repères « sous (ii) ».
// - Niveaux de détail selon le zoom (s = px d'écran par px de mise en page, réglages « seuil point » et
//   « seuil contenu ») : s < seuil point → un petit carré de la couleur de la boîte par bloc (ni texte, ni
//   cadre) ; entre les deux → cadres et titre seul, écrit sur le canevas (tronqué à la largeur du bloc) ;
//   s ≥ seuil contenu → composition HTML complète (formule KaTeX, confiance), figures, bornes et renvois.
//   Passage fonctionnel par un court fondu sur 12 à 15 % du seuil, sans animation en boucle.
//   Seuls les blocs dont le rectangle touche l'écran sont dessinés et composés.

import { LIBELLES_TYPE, rgba, type ContexteDessinR, type ValeurReglage, type VueRaisonnement } from '../../src/raisonnement'
import { SERIF, SERIF_MATH, type Composition } from './composition'
import { agreger } from './groupes'
import { dessinerFigure, geometrieFigure, type CouleursFigure, type Figure } from './graphiques'
import { BOITE, ECART_FIGURE, type Boite, type Commentaire, type MiseEnPage } from './mise-en-page'
import { etatSquelette } from './squelette'

export interface PaletteR41 {
  encre: string
  gris: string
  trait: string
  surface: string
  surface2: string
  accent: string
}

export function lirePaletteR41(el: HTMLElement): PaletteR41 {
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
  genre: 'carte' | 'pastille' | 'renvoi' | 'drapeau' | 'impasse' | 'masque' | 'titre' | 'ouvrir' | 'appel'
  point: number
  /** Nœud de justification (pastille). */
  noeud: number
  /** Boîte (barre de titre) ou figure (appel). */
  groupe?: string
  cle?: string
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

export interface EtatRendu {
  page: MiseEnPage | null
  palette: PaletteR41
  cibles: Cible[]
  survol: Cible | null
  /** Hypothèses épinglées (points). */
  epingles: Set<number>
  /** Hypothèses de modélisation présentes (point → repère « (ii) »). */
  hypotheses: Map<number, string>
  composition: Composition | null
  /** Figures affichées sous un bloc, et figures à la demande (renvois « fig. n »). */
  figures: Map<number, FigurePlacee[]>
  appels: Map<number, { cle: string; numero: number }[]>
  /** Niveau de détail de la dernière image (panneau). */
  niveau: 'point' | 'titre' | 'contenu'
}

const lire = <T extends ValeurReglage>(vue: VueRaisonnement, cle: string) => vue.reglages.lire<T>(cle)
const borne = (x: number) => Math.max(0, Math.min(1, x))

/** Écran : px par px de mise en page au point p. */
function echelle(vue: VueRaisonnement, page: MiseEnPage, p: number): number {
  return vue.camera.pixelsParUnite() * (vue.projection.echelle[p] || 1) * page.echelle
}

/** Niveau de détail pour l'échelle s0 : fondus des cadres (vs points) et du contenu (vs titres). */
export function niveauDetail(vue: VueRaisonnement, s0: number): { cadres: number; contenu: number; niveau: EtatRendu['niveau'] } {
  const sp = lire<number>(vue, 'seuilPoint')
  const sc = Math.max(sp * 1.2, lire<number>(vue, 'seuilContenu'))
  const cadres = borne((s0 - sp) / (0.15 * sp))
  const contenu = borne((s0 - sc) / (0.12 * sc))
  return { cadres, contenu, niveau: s0 < sp ? 'point' : s0 < sc ? 'titre' : 'contenu' }
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

/** Couleur de la boîte d'un bloc (niveau « point ») : teinte de sa boîte, sinon l'encre. */
const couleursBoites = new WeakMap<MiseEnPage, Map<string, string>>()
function couleurBoite(page: MiseEnPage, b: Boite, encre: string): string {
  let m = couleursBoites.get(page)
  if (!m) {
    m = new Map()
    for (const c of page.commentaires) m.set(c.id, c.couleur)
    couleursBoites.set(page, m)
  }
  if (b.zone === 0) return m.get('§modelisation') ?? encre
  return (b.groupe && m.get(b.groupe)) || encre
}

// ─── Primitives ──────────────────────────────────────────────────────────────

function polyligne(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]): void {
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k]!.x, pts[k]!.y)
}

/** Pointe « to » de TikZ : deux barbes incurvées, tracées au trait. */
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

function motifStatut(statut: string): number[] {
  return statut === 'incertain' ? [4, 3] : []
}

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

/** Coupe un texte en au plus `max` lignes de largeur `largeur` (dernière ligne tronquée). */
function couper(ctx: CanvasRenderingContext2D, texte: string, largeur: number, max: number): string[] {
  if (max <= 0) return []
  const lignes: string[] = []
  let courante = ''
  const mots = texte.split(/\s+/).filter(Boolean)
  for (let i = 0; i < mots.length; i++) {
    const essai = courante ? `${courante} ${mots[i]}` : mots[i]!
    if (ctx.measureText(essai).width <= largeur || !courante) courante = essai
    else {
      lignes.push(courante)
      courante = mots[i]!
      if (lignes.length === max) {
        lignes[max - 1] = tronquer(ctx, `${lignes[max - 1]} ${mots.slice(i).join(' ')}`, largeur)
        return lignes
      }
    }
  }
  if (courante) lignes.push(courante)
  return lignes.map((l) => tronquer(ctx, l, largeur))
}

// ─── Calque « dessous » ──────────────────────────────────────────────────────

export function dessinerDessous(c: ContexteDessinR, etat: EtatRendu): void {
  const { ctx, vue } = c
  const page = etat.page
  // Les cibles de l'image sont reconstruites : barres de titre ici, blocs et bornes sur le calque « dessus ».
  etat.cibles = []
  if (!page || !page.boites.length) return
  const e = vue.extrusion
  const cam = vue.camera
  const E = page.echelle
  const monde = (x: number, y: number, yw = 0): [number, number, number] => [(x - page.cx) * E, yw, -(y - page.cy) * E]
  const s0 = cam.pixelsParUnite() * E
  const nd = niveauDetail(vue, s0)

  const alpha = Math.max(0, 1 - e * 1.6)
  if (alpha > 0.01) {
    dessinerCommentaires(ctx, vue, etat, s0, alpha)
    dessinerFigure1(ctx, vue, etat, monde, s0, alpha, nd.cadres)
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
        couleur = ls === 1 || lc === 1 ? P.encre : P.accent
        alphaR = 1
        largeur = epaisseur + 0.7
      } else alphaR *= 0.35
    }
    if (actifs && !(actifs.has(r.source) && actifs.has(r.cible))) alphaR *= 0.3
    // Vue lointaine : liaisons plus discrètes (les blocs ne sont que des points).
    alphaR *= 0.45 + 0.55 * nd.cadres
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
    if (nd.cadres > 0.05) {
      const z = pts[pts.length - 1]!, y = pts[pts.length - 2] ?? pts[0]!
      pointe(ctx, z.x, z.y, z.x - y.x, z.y - y.y, tPointe)
    }
  }
  if (!transition && e < 0.02 && nd.cadres > 0.05) {
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

  // Décision → hypothèse dans la marge.
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
    if (nd.cadres > 0.05) pointe(ctx, xm, yb, 0, 1, tPointe)
  }
  ctx.restore()

  if (lire<boolean>(vue, 'liensSemantiques') && nd.cadres > 0.05) dessinerLiensSemantiques(c, etat)
}

/**
 * Boîtes englobantes (R18) : rectangle recalculé à chaque image depuis les blocs membres (il suit les
 * transitions) ; fond teinté translucide, barre de titre plus soutenue, contour fin. R41 : la barre de titre
 * est une cible (clic : réduire / redéployer) et porte « ouvrir ↗ » (onglet) à droite.
 */
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
  const W = vue.camera.largeur, H = vue.camera.hauteur
  const sv = etat.survol
  ctx.save()
  for (const c of page.commentaires) {
    const r = rects.get(c.id)
    if (!r || r.x1 < 0 || r.y1 < 0 || r.x0 > W || r.y0 > H) continue
    const n1 = c.niveau === 1
    const hTitre = (n1 ? BOITE.titreS : BOITE.titre) * s0
    const w = r.x1 - r.x0, h = r.y1 - r.y0
    const survolee = (sv?.genre === 'titre' || sv?.genre === 'ouvrir') && sv.groupe === c.id
    ctx.fillStyle = rgba(c.couleur, (n1 ? 0.075 : 0.055) * alpha)
    ctx.fillRect(r.x0, r.y0, w, h)
    if (c.abandon) {
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
    ctx.fillStyle = rgba(c.couleur, ((n1 ? 0.16 : 0.2) + (survolee ? 0.08 : 0)) * alpha)
    ctx.fillRect(r.x0, r.y0, w, hTitre)
    ctx.strokeStyle = rgba(c.couleur, (n1 ? 0.55 : 0.5) * alpha)
    ctx.lineWidth = 1
    if (c.abandon) ctx.setLineDash([4, 3])
    ctx.strokeRect(Math.round(r.x0) + 0.5, Math.round(r.y0) + 0.5, Math.round(w) - 1, Math.round(h) - 1)
    ctx.setLineDash([])
    // Cibles : la barre de titre (réduire / redéployer) et « ouvrir ↗ » (onglet).
    const wOuvrir = c.reductible ? 52 * s0 : 0
    if (c.reductible) {
      etat.cibles.push({ genre: 'ouvrir', point: -1, noeud: -1, groupe: c.id, x0: r.x1 - wOuvrir, y0: r.y0, x1: r.x1, y1: r.y0 + hTitre })
      etat.cibles.push({ genre: 'titre', point: -1, noeud: -1, groupe: c.id, x0: r.x0, y0: r.y0, x1: r.x1 - wOuvrir, y1: r.y0 + hTitre })
    }
    const taille = (n1 ? 10.5 : 12) * s0
    if (taille >= 6.5) {
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      const ym = r.y0 + hTitre / 2 + 0.5
      const glyphe = c.reductible ? (c.reduit ? '▸ ' : '▾ ') : ''
      const titre = `${glyphe}${c.abandon && !/abandon/i.test(c.nom) ? `Piste abandonnée · ${c.nom}` : c.nom}`
      const compte = `${c.enonces} énoncé${c.enonces > 1 ? 's' : ''}${c.reduit ? ', réduit' : ''}`
      ctx.font = `italic 400 ${taille * 0.85}px ${SERIF}`
      const wCompte = ctx.measureText(compte).width
      ctx.font = `700 ${taille}px ${SERIF}`
      const t = tronquer(ctx, titre, w - 14 * s0 - wOuvrir - wCompte - 10 * s0)
      ctx.fillStyle = rgba(c.couleur, alpha)
      ctx.fillText(t, r.x0 + 7 * s0, ym)
      const xFin = r.x1 - 7 * s0 - wOuvrir
      ctx.textAlign = 'right'
      if (ctx.measureText(t).width + wCompte + 30 * s0 < w - wOuvrir) {
        ctx.font = `italic 400 ${taille * 0.85}px ${SERIF}`
        ctx.fillStyle = rgba(P.gris, alpha)
        ctx.fillText(compte, xFin, ym)
      }
      if (c.reductible) {
        ctx.font = `400 ${taille * 0.85}px ${SERIF}`
        const survolO = sv?.genre === 'ouvrir' && sv.groupe === c.id
        ctx.fillStyle = rgba(survolO ? P.accent : c.couleur, alpha)
        ctx.fillText('ouvrir ↗', r.x1 - 7 * s0, ym)
      }
    }
  }
  ctx.restore()
}

/**
 * Figure (R36) : axe des rangs logiques (graduations, pointe LaTeX, « rang logique r »), accolades des
 * zones, et légende « Figure 1 – … » sous la figure.
 */
function dessinerFigure1(
  ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu,
  monde: (x: number, y: number) => [number, number, number], s0: number, alpha: number, cadres: number,
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
    if (lire<boolean>(vue, 'legende') && cadres > 0.02) {
      const larg = Math.min(900, Math.max(460, b.x1 - b.x0))
      const cx = (b.x0 + b.x1) / 2
      comp.placerLegende(X(cx - larg / 2), Y(b.y1 + 26), s0, larg, alpha * cadres)
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

// ─── Calque « dessus » : blocs ───────────────────────────────────────────────

export function dessinerDessus(c: ContexteDessinR, etat: EtatRendu): void {
  const { ctx, vue } = c
  const page = etat.page
  // Les cibles des barres de titre ont été posées par le calque « dessous » de la même image.
  if (!page) return
  const P = etat.palette
  const pr = vue.projection
  const comp = etat.composition
  const s0 = vue.camera.pixelsParUnite() * page.echelle
  const nd = niveauDetail(vue, s0)
  etat.niveau = nd.niveau
  const W = vue.camera.largeur, H = vue.camera.hauteur
  const actifs = choixActifs(vue, etat)
  comp?.debutImage()
  comp?.definirEtat(etat.survol?.genre === 'renvoi' ? etat.survol.point : null, actifs)

  // Masqués (contexte pur) : petits carrés, visibles seulement avec les liens complets.
  ctx.save()
  for (let p = vue.nU; p < vue.nP; p++) {
    const pres = vue.presence[p]!
    if (pres < 0.05 || !pr.visible[p]) continue
    const s = echelle(vue, page, p)
    const x = pr.x[p]!, y = pr.y[p]!
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
      ctx.fillText(tronquer(ctx, vue.noeud(p).nom, 160 * Math.min(1.3, s)), x - 8 * s, y)
    }
    etat.cibles.push({ genre: 'masque', point: p, noeud: vue.indexNoeud(p), x0: x - 6, y0: y - 6, x1: x + 6, y1: y + 6 })
  }
  ctx.restore()

  const ordre: number[] = []
  for (let p = 0; p < vue.nU; p++) ordre.push(p)
  const devant = (p: number) => (p === vue.survol ? 3 : vue.lignee[p]! > 0 ? 2 : 0)
  ordre.sort((a, b) => devant(a) - devant(b) || pr.profondeur[b]! - pr.profondeur[a]!)
  const toujours = lire<string>(vue, 'bandesChoix') === 'toujours'
  const couleursFig: CouleursFigure = { encre: P.encre, gris: P.gris, surface: P.surface, prediction: P.encre }
  for (const p of ordre) {
    if (!pr.visible[p]) continue
    const op = vue.opaciteAffichee[p]!
    if (op < 0.02) continue
    const b = page.boites[p]!
    const s = echelle(vue, page, p)
    const x = pr.x[p]!, y = pr.y[p]!
    const l = b.genre === 'decision' ? Math.max(24, b.w / 2) : b.w / 2
    // Hors écran : ni dessin, ni composition (la cible reste utile au survol d'un bord).
    if (x + l * s < -4 || x - l * s > W + 4 || y + b.bas * s < -4 || y - b.haut * s > H + 4) continue

    // Vue lointaine : un petit carré de la couleur de la boîte.
    if (nd.cadres < 1) {
      const cote = Math.max(3, Math.min(7, b.w * s * 0.18))
      const lignee = vue.lignee[p]! > 0 || vue.survol === p
      ctx.fillStyle = rgba(lignee ? P.accent : couleurBoite(page, b, P.encre), op * (1 - nd.cadres))
      ctx.fillRect(x - cote / 2, y - cote / 2, cote, cote)
    }
    if (nd.cadres > 0) {
      const tags: string[] = []
      for (const [q, ref] of etat.hypotheses) {
        if (q === p) continue
        if ((toujours || actifs.includes(q)) && page.portees.get(q)?.includes(p)) tags.push(ref)
      }
      ctx.save()
      ctx.translate(x, y)
      ctx.scale(s, s)
      ctx.globalAlpha = op * nd.cadres
      if (b.genre === 'drapeau') dessinerHypothese(ctx, vue, etat, p, b, actifs)
      else if (b.genre === 'decision') dessinerDecision(ctx, vue, etat, p, b, tags, nd.contenu)
      else if (b.genre === 'fonction') dessinerFonction(ctx, vue, etat, p, b)
      else dessinerBloc(ctx, vue, etat, p, b, tags, nd.contenu)
      // Figures : complètes en vue rapprochée, cadre et numéro au niveau « titre ».
      const figs = etat.figures.get(p) ?? []
      figs.forEach((f, k) => {
        const yf = b.yFigures + k * (page.hauteurFigure + ECART_FIGURE)
        if (nd.contenu > 0) {
          ctx.globalAlpha = op * nd.cadres
          dessinerFigure(ctx, f.fig, f.legende, -b.w / 2, yf, b.w, couleursFig)
        } else {
          const gf = geometrieFigure(b.w)
          ctx.strokeStyle = rgba(P.gris, 0.8)
          ctx.lineWidth = 0.6
          ctx.strokeRect(-b.w / 2 + gf.bx, yf + 3, gf.bw, gf.bh)
        }
      })
      if (nd.contenu > 0) dessinerAppels(ctx, etat, p, b)
      ctx.restore()
      // Titre seul (canevas) entre les deux seuils.
      if (nd.contenu < 1) dessinerTitre(ctx, vue, etat, p, b, x, y, s, op * nd.cadres * (1 - nd.contenu))
      if (nd.contenu > 0) {
        comp?.placer(p, x, y, s, op * nd.contenu, b.w, b.haut)
        // Figures au niveau « titre » : numéro au centre du cadre.
      } else if (figs.length && s * 11 >= 7) {
        ctx.save()
        ctx.font = `italic 400 ${Math.max(8, 11 * s)}px ${SERIF}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = rgba(P.gris, op * nd.cadres)
        figs.forEach((f, k) => {
          const gf = geometrieFigure(b.w)
          const yf = b.yFigures + k * (page.hauteurFigure + ECART_FIGURE)
          ctx.fillText(`Figure ${f.numero}`, x + (-b.w / 2 + gf.bx + gf.bw / 2) * s, y + (yf + 3 + gf.bh / 2) * s)
        })
        ctx.restore()
      }
    }
    // Cibles (écran).
    if (b.genre === 'decision') {
      etat.cibles.push({ genre: 'carte', point: p, noeud: -1, x0: x - l * s, y0: y - b.haut * s, x1: x + l * s, y1: y + 22 * s })
      if (b.impasse && lire<boolean>(vue, 'impasses')) etat.cibles.push({ genre: 'impasse', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y + 22 * s, x1: x + (b.w / 2) * s, y1: y + 48 * s })
    } else if (b.genre === 'drapeau') etat.cibles.push({ genre: 'drapeau', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y - (b.h / 2) * s, x1: x + (b.w / 2) * s, y1: y + (b.h / 2) * s })
    else etat.cibles.push({ genre: 'carte', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y - (b.h / 2) * s, x1: x + (b.w / 2) * s, y1: y + (b.h / 2) * s })
    if (nd.contenu > 0) {
      const y0 = yPastilles(b)
      for (const it of rangee(vue, b)) {
        const cx = x + it.x * s, cy = y + y0 * s
        if (it.renvoi >= 0) etat.cibles.push({ genre: 'renvoi', point: it.renvoi, noeud: -1, x0: cx - 14 * s, y0: cy - 7 * s, x1: cx + 14 * s, y1: cy + 7 * s })
        else etat.cibles.push({ genre: 'pastille', point: p, noeud: it.noeud, x0: cx - 7 * s, y0: cy - 7 * s, x1: cx + 7 * s, y1: cy + 7 * s })
      }
      ;(etat.appels.get(p) ?? []).forEach((a, k) => {
        const ax = x + (-b.w / 2 + 6 + k * 44) * s, ay = y + b.yAppels * s
        etat.cibles.push({ genre: 'appel', point: p, noeud: -1, cle: a.cle, x0: ax - 2 * s, y0: ay - 7 * s, x1: ax + 40 * s, y1: ay + 7 * s })
      })
    }
  }
  comp?.finImage()
}

/** Titre seul (niveau intermédiaire) : numéro en gras puis le nom, coupés et tronqués à la largeur du bloc. */
function dessinerTitre(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, x: number, y: number, s: number, alpha: number): void {
  if (alpha < 0.02) return
  const n = vue.noeud(p)
  const T = lire<number>(vue, 'taillePolice')
  const fs = Math.max(8.5, T * s)
  const P = etat.palette
  const larg = (b.w - 14) * s
  if (larg < fs * 2.5) return
  const u = vue.lecture.unites[p]
  let tete: string, haut: number, hDispo: number
  if (b.genre === 'decision') {
    tete = ''
    haut = y - b.haut * s
    hDispo = (b.haut - 4 - 19) * s
  } else if (b.genre === 'fonction') {
    tete = `Sous-problème ${b.ref}`
    haut = y - (b.h / 2) * s + 4 * s
    hDispo = (b.broches ? b.broches.y0 + b.h / 2 : b.h) * s - 6 * s
  } else {
    tete = b.genre === 'drapeau' ? `Hypothèse ${b.ref}` : `${LIBELLES_TYPE[n.type]} ${b.ref}`
    haut = y - (b.h / 2) * s + 4 * s
    hDispo = b.h * s - 8 * s
  }
  const interligne = fs * 1.2
  const max = Math.floor(hDispo / interligne)
  if (max < 1) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.textBaseline = 'top'
  ctx.fillStyle = b.abandon ? P.gris : P.encre
  let ligne = 0
  const x0 = x - (b.w / 2 - 7) * s
  if (tete) {
    ctx.font = `700 ${fs}px ${SERIF}`
    ctx.textAlign = 'left'
    ctx.fillText(tronquer(ctx, tete, larg), x0, haut)
    ligne = 1
  }
  const nom = b.genre === 'fonction' ? (etat.page?.commentaires.find((c) => c.reduit && c.membres.includes(p))?.nom ?? n.nom) : n.nom
  ctx.font = `400 ${fs}px ${SERIF}`
  const suite = `${nom}${u && u.membres.length > 1 && b.genre !== 'fonction' ? ` (${u.membres.length} énoncés)` : ''}`
  const lignes = couper(ctx, suite, larg, max - ligne)
  ctx.textAlign = b.genre === 'decision' ? 'center' : 'left'
  lignes.forEach((l, k) => ctx.fillText(l, b.genre === 'decision' ? x : x0, haut + (ligne + k) * interligne))
  ctx.restore()
}

/** Ordonnée (relative au point d'ancrage) de la rangée de bornes. */
function yPastilles(b: Boite): number {
  if (b.genre === 'decision') return 19 + (b.impasse ? 30 : 4) + 8
  return b.h / 2 + 11
}

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

function rangee(vue: VueRaisonnement, b: Boite): { x: number; renvoi: number; noeud: number }[] {
  const r: { x: number; renvoi: number; noeud: number }[] = []
  if (b.genre === 'fonction' || b.genre === 'drapeau') return r
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

/** Figures disponibles à la demande : « fig. 3 » sous le bloc (clic : l'afficher). */
function dessinerAppels(ctx: CanvasRenderingContext2D, etat: EtatRendu, p: number, b: Boite): void {
  const appels = etat.appels.get(p)
  if (!appels?.length) return
  const P = etat.palette
  const sv = etat.survol
  ctx.font = `italic 400 10px ${SERIF}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  appels.forEach((a, k) => {
    const allume = sv?.genre === 'appel' && sv.cle === a.cle
    const t = `voir fig. ${a.numero}`
    const x = -b.w / 2 + 6 + k * 44
    ctx.fillStyle = allume ? P.accent : P.gris
    ctx.fillText(t, x, b.yAppels + 0.5)
    if (allume) ctx.fillRect(x, b.yAppels + 6, ctx.measureText(t).width, 0.8)
  })
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

function dessinerBloc(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, tags: string[], contenu: number): void {
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
  if (contenu > 0) {
    dessinerRangee(ctx, vue, etat, b)
    dessinerTags(ctx, etat, tags, x0 + w, y0 - (sousSysteme ? 3 : 0))
  }
  if (b.externe) {
    // Onglet : unité extérieure au sous-graphe, cadre gris.
    ctx.strokeStyle = rgba(P.gris, 0.9)
    ctx.lineWidth = 0.6
    ctx.setLineDash([2, 2])
    ctx.strokeRect(x0 - 3, y0 - 3, w + 6, h + 6)
    ctx.setLineDash([])
  }
}

/** Nœud-fonction (R19) : statut le plus faible par le trait, broches ▷ (entrées) et ● (sorties). */
function dessinerFonction(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite): void {
  const P = etat.palette
  const u = vue.lecture.unites[p]!
  const ag = agreger(vue.justification.noeuds, u.membres)
  const w = b.w, h = b.h
  const x0 = -w / 2, y0 = -h / 2
  const tl = traitLignee(vue, etat, p)
  const couleur = tl ? tl.couleur : P.encre
  const motif = motifStatut(ag.statut)
  // Plusieurs énoncés derrière : copie décalée (comme un sous-système).
  ctx.fillStyle = P.surface
  ctx.fillRect(x0 + 3, y0 - 3, w, h)
  ctx.strokeStyle = rgba(P.encre, 0.6)
  ctx.lineWidth = 0.7
  ctx.setLineDash(motif)
  ctx.strokeRect(x0 + 3, y0 - 3, w, h)
  ctx.fillStyle = P.surface
  ctx.fillRect(x0, y0, w, h)
  ctx.strokeStyle = couleur
  ctx.lineWidth = tl ? tl.largeur : 0.8
  ctx.strokeRect(x0, y0, w, h)
  ctx.setLineDash([])
  if (ag.statut === 'refute') {
    ctx.strokeStyle = rgba(couleur, 0.55)
    ctx.beginPath()
    ctx.moveTo(x0, y0 + h)
    ctx.lineTo(x0 + w, y0)
    ctx.stroke()
  }
  const br = b.broches
  if (!br) return
  // Filets : sous l'en-tête et au-dessus du pied.
  ctx.strokeStyle = rgba(P.encre, 0.5)
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(x0 + 6, br.y0)
  ctx.lineTo(x0 + w - 6, br.y0)
  const yPied = br.y0 + (br.entrees.length + br.sorties.length) * br.pas + (br.entrees.length && br.sorties.length ? 6 : 0) + 2
  ctx.moveTo(x0 + 6, yPied)
  ctx.lineTo(x0 + w - 6, yPied)
  ctx.stroke()
  // Broches : triangle ouvert à gauche (entrée), point plein à droite (sortie).
  ctx.strokeStyle = couleur
  ctx.fillStyle = couleur
  ctx.lineWidth = 0.8
  for (const e of br.entrees) {
    ctx.beginPath()
    ctx.moveTo(x0 + 1, e.y - 3.2)
    ctx.lineTo(x0 + 6, e.y)
    ctx.lineTo(x0 + 1, e.y + 3.2)
    ctx.closePath()
    ctx.stroke()
  }
  for (const s of br.sorties) {
    ctx.beginPath()
    ctx.arc(x0 + w - 3.5, s.y, 2.2, 0, Math.PI * 2)
    ctx.fill()
  }
}

function dessinerDecision(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, tags: string[], contenu: number): void {
  const P = etat.palette
  const tl = traitLignee(vue, etat, p)
  if (contenu > 0) dessinerTags(ctx, etat, tags, b.w / 2, -b.haut)
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
  if (contenu > 0) dessinerRangee(ctx, vue, etat, b)
}

/** Hypothèse de modélisation : cadre simple comme dans R37 ; renforcé et bleu quand elle est active. */
function dessinerHypothese(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, actifs: number[]): void {
  const P = etat.palette
  const actif = actifs.includes(p)
  const w = b.w, h = b.h
  const tl = traitLignee(vue, etat, p)
  ctx.fillStyle = P.surface
  ctx.fillRect(-w / 2, -h / 2, w, h)
  ctx.strokeStyle = tl ? tl.couleur : actif ? P.accent : P.encre
  ctx.lineWidth = tl ? tl.largeur : actif ? 1.3 : 0.8
  ctx.strokeRect(-w / 2, -h / 2, w, h)
  if (etat.epingles.has(p)) {
    ctx.font = `italic 400 10px ${SERIF}`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = P.accent
    ctx.fillText('épinglée', w / 2, -h / 2 - 2)
  }
}

// ─── Survol ──────────────────────────────────────────────────────────────────

/** Élément sous le pointeur (écran), d'après la dernière image. */
export function cibleSous(etat: EtatRendu, x: number, y: number): Cible | null {
  const dans = (c: Cible, m = 0) => x >= c.x0 - m && x <= c.x1 + m && y >= c.y0 - m && y <= c.y1 + m
  // Petits éléments d'abord (bornes, renvois, alternatives, appels de figure), puis « ouvrir ↗ ».
  for (let k = etat.cibles.length - 1; k >= 0; k--) {
    const c = etat.cibles[k]!
    if ((c.genre === 'pastille' || c.genre === 'impasse' || c.genre === 'renvoi' || c.genre === 'appel' || c.genre === 'ouvrir') && dans(c)) return c
  }
  for (let k = etat.cibles.length - 1; k >= 0; k--) {
    const c = etat.cibles[k]!
    if (c.genre !== 'titre' && dans(c, 2)) return c
  }
  // Barres de titre : la plus imbriquée d'abord (posée après sa boîte parente).
  for (let k = etat.cibles.length - 1; k >= 0; k--) {
    const c = etat.cibles[k]!
    if (c.genre === 'titre' && dans(c)) return c
  }
  return null
}
