// Figures du graphe (graphiques et images rattachés à un nœud), dessinées dans leurs cases de la grille.
//
// Style pgfplots par défaut, repris du prototype R35 : axe encadré, graduations vers l'intérieur sur les quatre côtés,
// pas de grille, Computer Modern, virgule décimale, légende en haut à gauche. Mesures en marqueurs noirs ou gris avec
// barres d'erreur, courbes en gris, lois en blue!60!black avec leur bande ±1σ en aplat bleu très clair (couleurs
// opaques uniquement). Échelles linéaire et logarithmique (décades 10^k, graduations secondaires 2…9).
//
// Le tracé est dessiné sur le canevas en px de mise en page (le contexte est déjà mis à l'échelle) ; les textes riches
// (titre, légende en Markdown + LaTeX, titres d'axes) sont du HTML (KaTeX) posé par la couche de contenu, aux positions
// données par `geometrie`. Les images sont chargées à la demande (figure visible et zoom de contenu), puis gardées.

import type { Axe, FigureVue, Serie, Trace } from './api'
import { echapper, enLigne, texteBrut } from './formules'
import { rendre } from './rendu'

const SERIF = `'CMU Serif Atlas', KaTeX_Main, 'Latin Modern Roman', 'CMU Serif', 'Computer Modern', 'Times New Roman', serif`

export const COULEURS_FIGURE = {
  encre: '#000000',
  gris: '#5c5c5c',
  courbe: '#707070',
  /** blue!60!black. */
  loi: '#3d3d99',
  /** blue!60!black à 15 % sur blanc, opaque. */
  bande: '#e2e2f0',
  fond: '#ffffff',
  attente: '#ececec',
  cadre: '#8c8c8c',
}

/** Corps des textes du tracé (px de mise en page). */
const CORPS_GRADUATION = 10.5
const CORPS_LEGENDE = 10.5

// ─── Géométrie ───────────────────────────────────────────────────────────────

export interface Geometrie {
  /** Bandeau du titre et zone de la légende (\caption) sous le tracé. */
  tete: number
  pied: number
  /** Boîte de l'axe (px de mise en page, relatifs au coin haut gauche de la figure). */
  bx: number
  by: number
  bw: number
  bh: number
  /** Zone d'une image (sans axe). */
  ix: number
  iy: number
  iw: number
  ih: number
}

/** Hauteur du bandeau de titre d'une figure dans la grille. */
export const TETE_FIGURE = 24

/** Géométrie d'une figure de w × h ; `tete` et `pied` sont réservés au titre et à la légende. */
export function geometrie(w: number, h: number, tete: number, pied: number): Geometrie {
  const gauche = 58, droite = 16, haut = 10, bas = 40
  const bx = gauche, by = tete + haut
  const bw = Math.max(20, w - gauche - droite)
  const bh = Math.max(20, h - pied - bas - by)
  return { tete, pied, bx, by, bw, bh, ix: 8, iy: tete + 4, iw: Math.max(10, w - 16), ih: Math.max(10, h - tete - pied - 8) }
}

/** Géométrie d'une figure de la grille : légende sous le tracé si la place le permet. */
export function geometrieBloc(f: FigureVue, w: number, h: number): Geometrie {
  const pied = f.legende && h >= 200 ? 38 : 6
  return geometrie(w, h, TETE_FIGURE, pied)
}

// ─── Échelles et graduations ─────────────────────────────────────────────────

/** Étiquette de graduation : « 0,5 », ou « 10 » avec exposant « −3 ». */
interface Etiquette {
  base: string
  exposant?: string
}

interface Echelle {
  log: boolean
  min: number
  max: number
  /** Valeur → fraction de l'axe (0 à 1) ; NaN hors domaine (log de 0). */
  vers: (v: number) => number
  majeures: { v: number; e: Etiquette }[]
  mineures: number[]
  /** Puissance de dix sortie des étiquettes (« ·10³ » au bout de l'axe), 0 si aucune. */
  facteur: number
}

function pasGraduation(etendue: number, cible: number): number {
  const brut = etendue / Math.max(1, cible - 1)
  const p = 10 ** Math.floor(Math.log10(brut))
  const m = brut / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p
}

function decimalesDe(pas: number): number {
  for (let d = 0; d < 6; d++) if (Math.abs(Math.round(pas * 10 ** d) - pas * 10 ** d) < 1e-6) return d
  return 6
}

/** Nombre au format français : virgule décimale, vrai signe moins. */
export function fr(v: number, dec: number): string {
  const t = (Math.abs(v) < 1e-12 ? 0 : v).toFixed(dec)
  return t.replace('-', '−').replace('.', ',')
}

function exposant(k: number): string {
  return String(k).replace('-', '−')
}

/** Étendue d'un axe : bornes données, sinon celle des données avec 5 % de marge (en log : en décades). */
function etendue(valeurs: number[], axe: Axe): [number, number] {
  const log = axe.echelle === 'log'
  let a = Infinity, b = -Infinity
  for (const v of valeurs) {
    if (!Number.isFinite(v) || (log && v <= 0)) continue
    if (v < a) a = v
    if (v > b) b = v
  }
  if (a > b) [a, b] = log ? [1, 10] : [0, 1]
  if (log) {
    let la = Math.log10(a), lb = Math.log10(b)
    if (lb - la < 1e-9) {
      la -= 0.5
      lb += 0.5
    }
    const m = (lb - la) * 0.05
    a = 10 ** (la - m)
    b = 10 ** (lb + m)
  } else {
    if (b - a < 1e-12) {
      const d = Math.abs(a) * 0.1 || 1
      a -= d
      b += d
    }
    const m = (b - a) * 0.05
    a -= m
    b += m
  }
  if (axe.min !== undefined && Number.isFinite(axe.min) && (!log || axe.min > 0)) a = axe.min
  if (axe.max !== undefined && Number.isFinite(axe.max) && (!log || axe.max > 0)) b = axe.max
  if (b <= a) b = log ? a * 10 : a + 1
  return [a, b]
}

/** Échelle d'un axe de `longueur` px de mise en page (`vertical` : graduations plus serrées). */
function echelle(valeurs: number[], axe: Axe, longueur: number, vertical: boolean): Echelle {
  const [min, max] = etendue(valeurs, axe)
  if (axe.echelle === 'log') {
    const la = Math.log10(min), lb = Math.log10(max)
    const vers = (v: number) => (v > 0 ? (Math.log10(v) - la) / (lb - la) : NaN)
    const dedans = (v: number) => v >= min * (1 - 1e-9) && v <= max * (1 + 1e-9)
    const majeures: { v: number; e: Etiquette }[] = []
    const mineures: number[] = []
    const decades: number[] = []
    for (let k = Math.floor(la); k <= Math.ceil(lb); k++) if (dedans(10 ** k)) decades.push(k)
    if (decades.length >= 2) {
      // Une décade sur `saut` étiquetée si elles sont trop serrées.
      const saut = Math.max(1, Math.ceil(decades.length / Math.max(2, Math.floor(longueur / 45))))
      for (const k of decades) if (k % saut === 0) majeures.push({ v: 10 ** k, e: { base: '10', exposant: exposant(k) } })
      for (let k = Math.floor(la); k <= Math.ceil(lb); k++) {
        if (saut > 1 && k % saut !== 0 && dedans(10 ** k)) mineures.push(10 ** k)
        if (saut === 1) for (let m = 2; m <= 9; m++) if (dedans(m * 10 ** k)) mineures.push(m * 10 ** k)
      }
    } else {
      // Moins de deux décades : graduations 1, 2, 5 × 10^k en décimal, les autres chiffres en secondaires.
      for (let k = Math.floor(la); k <= Math.ceil(lb); k++) {
        for (let m = 1; m <= 9; m++) {
          const v = m * 10 ** k
          if (!dedans(v)) continue
          if (m === 1 || m === 2 || m === 5) majeures.push({ v, e: { base: fr(v, Math.max(0, -k)) } })
          else mineures.push(v)
        }
      }
    }
    return { log: true, min, max, vers, majeures, mineures, facteur: 0 }
  }
  const cible = Math.max(3, Math.min(8, Math.round(longueur / (vertical ? 45 : 75))))
  const pas = pasGraduation(max - min, cible)
  const grand = Math.max(Math.abs(min), Math.abs(max))
  const facteur = grand >= 1e4 || grand < 1e-2 ? Math.floor(Math.log10(grand)) : 0
  const dec = decimalesDe(pas / 10 ** facteur)
  const majeures: { v: number; e: Etiquette }[] = []
  for (let v = Math.ceil(min / pas - 1e-9) * pas; v <= max + pas * 1e-9; v += pas) {
    const r = Math.round(v / pas) * pas
    majeures.push({ v: r, e: { base: fr(r / 10 ** facteur, dec) } })
  }
  return { log: false, min, max, vers: (v) => (v - min) / (max - min), majeures, mineures: [], facteur }
}

// ─── Primitives de texte ─────────────────────────────────────────────────────

function largeurEtiquette(ctx: CanvasRenderingContext2D, e: Etiquette, taille: number): number {
  ctx.font = `400 ${taille}px ${SERIF}`
  let w = ctx.measureText(e.base).width
  if (e.exposant) {
    ctx.font = `400 ${taille * 0.7}px ${SERIF}`
    w += ctx.measureText(e.exposant).width + taille * 0.05
  }
  return w
}

/** Écrit une étiquette ; `x` est son bord gauche, `y` sa ligne de base. */
function ecrireEtiquette(ctx: CanvasRenderingContext2D, e: Etiquette, x: number, y: number, taille: number): void {
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `400 ${taille}px ${SERIF}`
  ctx.fillText(e.base, x, y)
  if (e.exposant) {
    const w = ctx.measureText(e.base).width
    ctx.font = `400 ${taille * 0.7}px ${SERIF}`
    ctx.fillText(e.exposant, x + w + taille * 0.05, y - taille * 0.42)
  }
}

function tronquer(ctx: CanvasRenderingContext2D, t: string, max: number): string {
  if (ctx.measureText(t).width <= max) return t
  let x = t
  while (x.length > 1 && ctx.measureText(x + '…').width > max) x = x.slice(0, -1)
  return x.trimEnd() + '…'
}

// ─── Séries ──────────────────────────────────────────────────────────────────

type Marque = 'rond' | 'carre' | 'triangle' | 'losange' | 'rond-vide' | 'carre-vide'
const MARQUES: Marque[] = ['rond', 'carre-vide', 'triangle', 'rond-vide', 'losange', 'carre']
/** Tirets des courbes et des lois successives (la première en trait plein). */
const TIRETS: number[][] = [[], [5, 3], [1.5, 2], [6, 2.5, 1.5, 2.5]]

interface Style {
  couleur: string
  marque: Marque
  tirets: number[]
}

/** Style de chaque série : variantes par genre, sans couleurs criardes. */
function styles(series: Serie[]): Style[] {
  const rang = { mesures: 0, courbe: 0, loi: 0 }
  return series.map((s) => {
    const k = rang[s.genre]++
    if (s.genre === 'mesures') return { couleur: k % 2 ? COULEURS_FIGURE.gris : COULEURS_FIGURE.encre, marque: MARQUES[k % MARQUES.length]!, tirets: [] }
    if (s.genre === 'courbe') return { couleur: COULEURS_FIGURE.courbe, marque: 'rond', tirets: TIRETS[k % TIRETS.length]! }
    return { couleur: COULEURS_FIGURE.loi, marque: 'rond', tirets: TIRETS[k % TIRETS.length]! }
  })
}

function marque(ctx: CanvasRenderingContext2D, m: Marque, x: number, y: number, r: number, couleur: string, trait: number): void {
  ctx.fillStyle = couleur
  ctx.strokeStyle = couleur
  ctx.lineWidth = trait
  ctx.setLineDash([])
  ctx.beginPath()
  switch (m) {
    case 'rond':
    case 'rond-vide':
      ctx.arc(x, y, r, 0, Math.PI * 2)
      break
    case 'carre':
    case 'carre-vide':
      ctx.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8)
      break
    case 'triangle':
      ctx.moveTo(x, y - r * 1.15)
      ctx.lineTo(x + r * 1.05, y + r * 0.7)
      ctx.lineTo(x - r * 1.05, y + r * 0.7)
      ctx.closePath()
      break
    case 'losange':
      ctx.moveTo(x, y - r * 1.2)
      ctx.lineTo(x + r * 0.95, y)
      ctx.lineTo(x, y + r * 1.2)
      ctx.lineTo(x - r * 0.95, y)
      ctx.closePath()
      break
  }
  if (m.endsWith('-vide')) {
    ctx.fillStyle = COULEURS_FIGURE.fond
    ctx.fill()
    ctx.stroke()
  } else ctx.fill()
}

/** Valeurs portées par chaque axe (barres d'erreur et bandes comprises). */
function valeursAxes(trace: Trace): { xs: number[]; ys: number[] } {
  const xs: number[] = [], ys: number[] = []
  for (const s of trace.series) {
    if (s.genre === 'mesures') {
      for (const p of s.points) {
        const [x, y, sy = 0, sx = 0] = p
        if (x === undefined || y === undefined) continue
        xs.push(x - sx, x + sx)
        ys.push(y - sy, y + sy)
        if (trace.y.echelle === 'log' && y - sy <= 0) ys.push(y)
        if (trace.x.echelle === 'log' && x - sx <= 0) xs.push(x)
      }
    } else {
      for (const p of s.points ?? []) {
        if (p[0] === undefined || p[1] === undefined) continue
        xs.push(p[0])
        ys.push(p[1])
      }
      if (s.genre === 'loi') {
        for (const p of s.bande ?? []) {
          if (p[0] === undefined) continue
          xs.push(p[0])
          if (p[1] !== undefined) ys.push(p[1])
          if (p[2] !== undefined) ys.push(p[2])
        }
        if (s.de !== undefined) xs.push(s.de)
        if (s.a !== undefined) xs.push(s.a)
      }
    }
  }
  return { xs, ys }
}

// ─── Tracé ───────────────────────────────────────────────────────────────────

const echellesEnCache = new WeakMap<Trace, { cle: string; ex: Echelle; ey: Echelle }>()

function echelles(trace: Trace, g: Geometrie): { ex: Echelle; ey: Echelle } {
  const cle = `${Math.round(g.bw)}|${Math.round(g.bh)}`
  const connu = echellesEnCache.get(trace)
  if (connu && connu.cle === cle) return connu
  const { xs, ys } = valeursAxes(trace)
  const r = { cle, ex: echelle(xs, trace.x, g.bw, false), ey: echelle(ys, trace.y, g.bh, true) }
  echellesEnCache.set(trace, r)
  return r
}

/**
 * Dessine le tracé dans la boîte de `g` (contexte déjà translaté au coin de la figure et mis à l'échelle ; `z` = px
 * d'écran par px de mise en page, pour garder des traits visibles de loin).
 */
export function dessinerTrace(ctx: CanvasRenderingContext2D, trace: Trace, g: Geometrie, z: number): void {
  const { ex, ey } = echelles(trace, g)
  const { bx, by, bw, bh } = g
  const trait = (l: number) => Math.max(l, 0.55 / z)
  const X = (v: number) => bx + ex.vers(v) * bw
  const Y = (v: number) => by + bh - ey.vers(v) * bh
  const st = styles(trace.series)
  ctx.save()
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'round'

  // Séries, découpées au cadre de l'axe : bandes, puis courbes et lois, puis mesures par-dessus.
  ctx.save()
  ctx.beginPath()
  ctx.rect(bx, by, bw, bh)
  ctx.clip()
  for (const s of trace.series) {
    if (s.genre !== 'loi' || !s.bande?.length) continue
    ctx.fillStyle = COULEURS_FIGURE.bande
    ctx.beginPath()
    let n = 0
    for (const p of s.bande) {
      const x = X(p[0]!), y = Y(p[2]!)
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      if (n++) ctx.lineTo(x, y)
      else ctx.moveTo(x, y)
    }
    for (let i = s.bande.length - 1; i >= 0; i--) {
      const p = s.bande[i]!
      const x = X(p[0]!), y = Y(p[1]!)
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fill()
  }
  trace.series.forEach((s, k) => {
    if (s.genre === 'mesures' || !s.points?.length) return
    ctx.strokeStyle = st[k]!.couleur
    ctx.lineWidth = trait(s.genre === 'loi' ? 1.5 : 1.15)
    ctx.setLineDash(st[k]!.tirets)
    ctx.beginPath()
    let debut = true
    for (const p of s.points) {
      const x = X(p[0]!), y = Y(p[1]!)
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        debut = true
        continue
      }
      if (debut) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
      debut = false
    }
    ctx.stroke()
  })
  ctx.setLineDash([])
  const r = 2.7
  trace.series.forEach((s, k) => {
    if (s.genre !== 'mesures') return
    const couleur = st[k]!.couleur
    // Barres d'erreur (avec taquets), puis marques.
    ctx.strokeStyle = couleur
    ctx.lineWidth = trait(0.8)
    ctx.beginPath()
    const taquet = 2.2
    for (const p of s.points) {
      const [xv, yv, sy, sx] = p
      if (xv === undefined || yv === undefined) continue
      const px = X(xv), py = Y(yv)
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue
      if (sy) {
        const y0 = Y(yv - sy), y1 = Y(yv + sy)
        const bas = Number.isFinite(y0) ? y0 : by + bh
        ctx.moveTo(px, bas)
        ctx.lineTo(px, y1)
        if (Number.isFinite(y0)) {
          ctx.moveTo(px - taquet, y0)
          ctx.lineTo(px + taquet, y0)
        }
        ctx.moveTo(px - taquet, y1)
        ctx.lineTo(px + taquet, y1)
      }
      if (sx) {
        const x0 = X(xv - sx), x1 = X(xv + sx)
        const gauche = Number.isFinite(x0) ? x0 : bx
        ctx.moveTo(gauche, py)
        ctx.lineTo(x1, py)
        if (Number.isFinite(x0)) {
          ctx.moveTo(x0, py - taquet)
          ctx.lineTo(x0, py + taquet)
        }
        ctx.moveTo(x1, py - taquet)
        ctx.lineTo(x1, py + taquet)
      }
    }
    ctx.stroke()
    for (const p of s.points) {
      if (p[0] === undefined || p[1] === undefined) continue
      const px = X(p[0]), py = Y(p[1])
      if (Number.isFinite(px) && Number.isFinite(py)) marque(ctx, st[k]!.marque, px, py, r, couleur, trait(0.8))
    }
  })
  ctx.restore()

  // Cadre et graduations vers l'intérieur, sur les quatre côtés.
  ctx.strokeStyle = COULEURS_FIGURE.encre
  ctx.lineWidth = trait(0.8)
  ctx.setLineDash([])
  ctx.strokeRect(bx, by, bw, bh)
  ctx.beginPath()
  const graduer = (e: Echelle, horizontal: boolean, v: number, long: number) => {
    const f = e.vers(v)
    if (!(f >= -1e-6 && f <= 1 + 1e-6)) return
    if (horizontal) {
      const px = bx + f * bw
      ctx.moveTo(px, by + bh)
      ctx.lineTo(px, by + bh - long)
      ctx.moveTo(px, by)
      ctx.lineTo(px, by + long)
    } else {
      const py = by + bh - f * bh
      ctx.moveTo(bx, py)
      ctx.lineTo(bx + long, py)
      ctx.moveTo(bx + bw, py)
      ctx.lineTo(bx + bw - long, py)
    }
  }
  for (const m of ex.majeures) graduer(ex, true, m.v, 4.5)
  for (const v of ex.mineures) graduer(ex, true, v, 2.5)
  for (const m of ey.majeures) graduer(ey, false, m.v, 4.5)
  for (const v of ey.mineures) graduer(ey, false, v, 2.5)
  ctx.stroke()

  // Étiquettes des graduations (chiffres droits, virgule décimale).
  ctx.fillStyle = COULEURS_FIGURE.encre
  const tg = CORPS_GRADUATION
  for (const m of ex.majeures) {
    const f = ex.vers(m.v)
    if (!(f >= -1e-6 && f <= 1 + 1e-6)) continue
    const w = largeurEtiquette(ctx, m.e, tg)
    ecrireEtiquette(ctx, m.e, bx + f * bw - w / 2, by + bh + 4 + tg, tg)
  }
  for (const m of ey.majeures) {
    const f = ey.vers(m.v)
    if (!(f >= -1e-6 && f <= 1 + 1e-6)) continue
    const w = largeurEtiquette(ctx, m.e, tg)
    ecrireEtiquette(ctx, m.e, bx - 4 - w, by + bh - f * bh + tg * 0.35, tg)
  }
  // Facteur commun (« ·10³ ») : au bout de l'axe, comme pgfplots.
  if (ex.facteur) {
    const e = { base: '·10', exposant: exposant(ex.facteur) }
    ecrireEtiquette(ctx, e, bx + bw - largeurEtiquette(ctx, e, tg), by + bh + 6 + 2 * tg, tg)
  }
  if (ey.facteur) ecrireEtiquette(ctx, { base: '·10', exposant: exposant(ey.facteur) }, bx, by - 3, tg)

  dessinerLegende(ctx, trace, st, g, trait)
  ctx.restore()
}

/** Légende en haut à gauche (north west) : cadre fin, fond blanc, échantillon puis nom. */
function dessinerLegende(ctx: CanvasRenderingContext2D, trace: Trace, st: Style[], g: Geometrie, trait: (l: number) => number): void {
  const tl = CORPS_LEGENDE, hl = tl * 1.3
  const max = Math.floor((g.bh * 0.75 - 4) / hl)
  if (max < 1 || g.bw < 90) return
  const entrees = trace.series.map((s, k) => ({ s, k })).filter(({ s }) => s.nom)
  if (!entrees.length) return
  const visibles = entrees.slice(0, max)
  ctx.font = `400 ${tl}px ${SERIF}`
  const largeurMax = g.bw * 0.5
  const textes = visibles.map(({ s }) => tronquer(ctx, texteCanevas(s.nom), largeurMax))
  if (entrees.length > visibles.length) textes[textes.length - 1] = `${textes[textes.length - 1]} (+${entrees.length - visibles.length})`
  const ech = 18
  let wl = 0
  for (const t of textes) wl = Math.max(wl, ctx.measureText(t).width)
  const lx = g.bx + 5, ly = g.by + 5, lw = 4 + ech + 5 + wl + 5, lh = visibles.length * hl + 4
  ctx.fillStyle = COULEURS_FIGURE.fond
  ctx.fillRect(lx, ly, lw, lh)
  ctx.strokeStyle = COULEURS_FIGURE.encre
  ctx.lineWidth = trait(0.6)
  ctx.strokeRect(lx, ly, lw, lh)
  visibles.forEach(({ s, k }, i) => {
    const y = ly + 2 + hl * (i + 0.5)
    const x = lx + 4
    const style = st[k]!
    if (s.genre === 'mesures') {
      ctx.strokeStyle = style.couleur
      ctx.lineWidth = trait(0.8)
      ctx.beginPath()
      ctx.moveTo(x + ech / 2, y - 4)
      ctx.lineTo(x + ech / 2, y + 4)
      ctx.stroke()
      marque(ctx, style.marque, x + ech / 2, y, 2.7, style.couleur, trait(0.8))
    } else {
      if (s.genre === 'loi' && s.bande?.length) {
        ctx.fillStyle = COULEURS_FIGURE.bande
        ctx.fillRect(x, y - 3.5, ech, 7)
      }
      ctx.strokeStyle = style.couleur
      ctx.lineWidth = trait(s.genre === 'loi' ? 1.5 : 1.15)
      ctx.setLineDash(style.tirets)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + ech, y)
      ctx.stroke()
      ctx.setLineDash([])
    }
    ctx.fillStyle = COULEURS_FIGURE.encre
    ctx.font = `400 ${tl}px ${SERIF}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(textes[i]!, x + ech + 5, y + 0.5)
  })
}

const table = (de: string, vers: string): Record<string, string> => {
  const v = [...vers]
  return Object.fromEntries([...de].map((c, i) => [c, v[i]!]))
}
const EXPOSANTS = table('0123456789+-−=()ni', '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻⁼⁽⁾ⁿⁱ')
const INDICES = table('0123456789+-−=()aeoxijklmnprst', '₀₁₂₃₄₅₆₇₈₉₊₋₋₌₍₎ₐₑₒₓᵢⱼₖₗₘₙₚᵣₛₜ')

/** Nom de série pour le canevas (sans KaTeX) : LaTeX simple en Unicode, exposants et indices compris. */
export function texteCanevas(t: string): string {
  const decaler = (t: Record<string, string>, signe: string) => (_: string, a?: string, b?: string) => {
    const x = a ?? b ?? ''
    return [...x].every((c) => t[c]) ? [...x].map((c) => t[c]).join('') : `${signe}(${x})`
  }
  const simple = t
    .replace(/\\[,;:]|\\quad|\\ /g, ' ')
    .replace(/\\!/g, '')
    .replace(/\\ell(?![A-Za-z])/g, 'ℓ')
    .replace(/\^\{([^{}]*)\}|\^(\w)/g, decaler(EXPOSANTS, '^'))
    .replace(/_\{([^{}]*)\}|_(\w)/g, decaler(INDICES, '_'))
  return texteBrut(simple)
}

// ─── Image ───────────────────────────────────────────────────────────────────

/** Dessine l'image dans la zone de `g` en gardant ses proportions ; un aplat gris clair tant qu'elle n'est pas là. */
export function dessinerImage(ctx: CanvasRenderingContext2D, f: FigureVue, g: Geometrie, img: CanvasImageSource | null): void {
  const lw = f.image_largeur || 4
  const lh = f.image_hauteur || 3
  const s = Math.min(g.iw / lw, g.ih / lh)
  const w = lw * s, h = lh * s
  const x = g.ix + (g.iw - w) / 2, y = g.iy + (g.ih - h) / 2
  if (img) ctx.drawImage(img, x, y, w, h)
  else {
    ctx.fillStyle = COULEURS_FIGURE.attente
    ctx.fillRect(x, y, w, h)
  }
}

/** Petite icône de courbe (vue lointaine) : deux axes et une courbe montante, centrés en (cx, cy). */
export function dessinerIcone(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number, image: boolean): void {
  ctx.save()
  ctx.strokeStyle = COULEURS_FIGURE.cadre
  ctx.lineWidth = Math.max(0.8, t * 0.035)
  ctx.lineJoin = 'round'
  ctx.beginPath()
  const x0 = cx - t / 2, y0 = cy - t / 2
  if (image) {
    ctx.rect(x0, y0 + t * 0.12, t, t * 0.76)
    ctx.moveTo(x0 + t * 0.08, y0 + t * 0.8)
    ctx.lineTo(x0 + t * 0.38, y0 + t * 0.45)
    ctx.lineTo(x0 + t * 0.58, y0 + t * 0.66)
    ctx.lineTo(x0 + t * 0.72, y0 + t * 0.52)
    ctx.lineTo(x0 + t * 0.92, y0 + t * 0.8)
  } else {
    ctx.moveTo(x0, y0)
    ctx.lineTo(x0, y0 + t)
    ctx.lineTo(x0 + t, y0 + t)
    ctx.moveTo(x0 + t * 0.08, y0 + t * 0.9)
    ctx.bezierCurveTo(x0 + t * 0.45, y0 + t * 0.85, x0 + t * 0.6, y0 + t * 0.3, x0 + t * 0.95, y0 + t * 0.12)
  }
  ctx.stroke()
  ctx.restore()
}

/** Petite icône de scène 3D : un cube en perspective cavalière, centré en (cx, cy), de côté `t`. */
export function dessinerIcone3D(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number): void {
  const c = t * 0.62, d = t * 0.3
  const x0 = cx - (c + d) / 2, y0 = cy - (c - d) / 2
  ctx.save()
  ctx.strokeStyle = COULEURS_FIGURE.cadre
  ctx.lineWidth = Math.max(0.8, t * 0.035)
  ctx.lineJoin = 'round'
  ctx.beginPath()
  // Face avant, face arrière décalée de (d, −d), et les quatre arêtes qui les relient.
  ctx.rect(x0, y0, c, c)
  ctx.rect(x0 + d, y0 - d, c, c)
  for (const [x, y] of [[0, 0], [c, 0], [0, c], [c, c]] as const) {
    ctx.moveTo(x0 + x, y0 + y)
    ctx.lineTo(x0 + x + d, y0 + y - d)
  }
  ctx.stroke()
  // « 3D » sur la face avant, dès que le cube est assez grand pour être lu.
  if (t >= 28) {
    ctx.fillStyle = COULEURS_FIGURE.gris
    ctx.font = `600 ${Math.round(c * 0.38)}px ${SERIF}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('3D', x0 + c / 2, y0 + c / 2 + c * 0.03)
  }
  ctx.restore()
}

/** Case d'une scène 3D dans la grille (sans vignette) : le cube « 3D », puis ce que montre la scène (la légende, si
 * la case est trop petite pour qu'elle soit écrite dessous) ou l'invitation à l'ouvrir. */
export function dessinerCaseScene(ctx: CanvasRenderingContext2D, f: FigureVue, g: Geometrie): void {
  const t = Math.min(g.iw * 0.45, g.ih * 0.55, 110)
  const lignes = f.legende && g.pied <= 10 ? 2 : 1
  const cy = g.iy + g.ih / 2 - (lignes * CORPS_LEGENDE * 1.25) / 2 - 4
  dessinerIcone3D(ctx, g.ix + g.iw / 2, cy, t)
  ctx.fillStyle = COULEURS_FIGURE.gris
  ctx.font = `italic 400 ${CORPS_LEGENDE}px ${SERIF}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const y = cy + t / 2 + 8
  if (lignes === 1) {
    ctx.fillText('Scène 3D animée — double-clic pour l’ouvrir', g.ix + g.iw / 2, y, g.iw - 8)
    return
  }
  // Légende sur deux lignes au plus, coupée aux mots.
  const mots = texteCanevas(f.legende!).split(/\s+/)
  const ecrites: string[] = ['']
  for (const mot of mots) {
    const essai = ecrites[ecrites.length - 1] ? `${ecrites[ecrites.length - 1]} ${mot}` : mot
    if (ctx.measureText(essai).width <= g.iw - 12 || !ecrites[ecrites.length - 1]) ecrites[ecrites.length - 1] = essai
    else if (ecrites.length < 2) ecrites.push(mot)
    else {
      ecrites[1] = tronquer(ctx, `${ecrites[1]} ${mot}`, g.iw - 12)
      break
    }
  }
  ecrites.forEach((l, k) => ctx.fillText(l, g.ix + g.iw / 2, y + k * CORPS_LEGENDE * 1.25, g.iw - 8))
}

/** GIF ou WebP animé, décodé une image à la fois (ImageDecoder) : seule l'image courante est gardée en mémoire. */
interface Animation {
  decodeur: ImageDecoder
  nombre: number
  indice: number
  courante: VideoFrame | null
  /** Instant (performance.now) où passer à l'image suivante. */
  echeance: number
  enCours: boolean
}

/** L'animation d'une image, ou null (image fixe, format non animable, navigateur sans ImageDecoder). */
async function ouvrirAnimation(blob: Blob): Promise<Animation | null> {
  if (typeof ImageDecoder === 'undefined' || !/^image\/(gif|webp)$/.test(blob.type)) return null
  const decodeur = new ImageDecoder({ data: await blob.arrayBuffer(), type: blob.type })
  try {
    // Sans tracks.ready, selectedTrack peut être encore vide même une fois les données lues.
    await decodeur.tracks.ready
    await decodeur.completed
    const piste = decodeur.tracks.selectedTrack
    if (!piste?.animated || piste.frameCount < 2) {
      decodeur.close()
      return null
    }
    return { decodeur, nombre: piste.frameCount, indice: -1, courante: null, echeance: 0, enCours: false }
  } catch {
    decodeur.close()
    return null
  }
}

/** Durée d'affichage d'une image d'animation en ms ; un délai nul ou minuscule vaut 100 ms, comme dans les navigateurs. */
function dureeImage(image: VideoFrame): number {
  const ms = (image.duration ?? 0) / 1000
  return ms < 20 ? 100 : ms
}

/** Cache des images de figures : chargées à la demande, gardées (les plus anciennes oubliées au-delà de 40). Une image
 * animée avance seulement quand elle est dessinée : hors écran, elle ne coûte ni décodage ni dessin. */
export class ImagesFigures {
  private cache = new Map<string, { etat: 'chargement' | 'pret' | 'erreur'; img: HTMLImageElement | null; url: string | null; anim: Animation | null }>()
  private charger: (f: FigureVue) => Promise<Blob> | null
  private rappel: () => void

  /** `charger` : null si l'image ne peut pas être lue (pas d'espace) ; `rappel` : redessiner quand une image arrive. */
  constructor(charger: (f: FigureVue) => Promise<Blob> | null, rappel: () => void) {
    this.charger = charger
    this.rappel = rappel
  }

  /** L'image à dessiner (l'image courante si elle est animée) si elle est prête ; sinon lance son chargement (une
   * fois) et renvoie null. */
  obtenir(f: FigureVue): CanvasImageSource | null {
    const cle = `${f.id}|${f.modifie_le}`
    const e = this.cache.get(cle)
    if (e) {
      if (e.anim) this.avancer(e.anim)
      return e.anim?.courante ?? e.img
    }
    const promesse = this.charger(f)
    if (!promesse) return null
    const entree = { etat: 'chargement' as 'chargement' | 'pret' | 'erreur', img: null as HTMLImageElement | null, url: null as string | null, anim: null as Animation | null }
    this.cache.set(cle, entree)
    if (this.cache.size > 40) {
      const [ancienne, v] = this.cache.entries().next().value!
      liberer(v)
      this.cache.delete(ancienne)
    }
    void promesse
      .then(async (blob) => {
        const url = URL.createObjectURL(blob)
        const img = new Image()
        img.src = url
        await img.decode()
        entree.url = url
        entree.img = img
        entree.etat = 'pret'
        entree.anim = await ouvrirAnimation(blob).catch(() => null)
      })
      .catch(() => {
        entree.etat = 'erreur'
      })
      .finally(() => this.rappel())
    return null
  }

  /** URL (blob) de l'image, après chargement si besoin ; null si elle est illisible. */
  async url(f: FigureVue): Promise<string | null> {
    const cle = `${f.id}|${f.modifie_le}`
    for (let essai = 0; essai < 200; essai++) {
      this.obtenir(f)
      const e = this.cache.get(cle)
      if (!e || e.etat === 'erreur') return null
      if (e.etat === 'pret') return e.url
      await new Promise((r) => setTimeout(r, 50))
    }
    return null
  }

  /** Passe à l'image suivante si son heure est venue, puis redemande un dessin à l'échéance de la nouvelle. */
  private avancer(a: Animation): void {
    if (a.enCours || performance.now() < a.echeance) return
    a.enCours = true
    const indice = (a.indice + 1) % a.nombre
    void a.decodeur
      .decode({ frameIndex: indice })
      .then(({ image }) => {
        a.courante?.close()
        a.courante = image
        a.indice = indice
        const duree = dureeImage(image)
        a.echeance = performance.now() + duree
        setTimeout(() => this.rappel(), duree)
      })
      .catch(() => {
        a.echeance = Infinity
      })
      .finally(() => {
        a.enCours = false
        this.rappel()
      })
  }

  vider(): void {
    for (const e of this.cache.values()) liberer(e)
    this.cache.clear()
  }
}

function liberer(e: { url: string | null; anim: Animation | null }): void {
  if (e.url) URL.revokeObjectURL(e.url)
  if (e.anim) {
    e.anim.courante?.close()
    e.anim.decodeur.close()
    e.anim.echeance = Infinity
  }
}

// ─── HTML (titre, légende, titres d'axes) ────────────────────────────────────

/** Titre d'axe : « $t$ (s) », l'unité en romain (LaTeX si elle en contient). */
function titreAxe(axe: Axe): string {
  const unite = axe.unite ? ` (${axe.unite.includes('$') ? enLigne(axe.unite) : echapper(axe.unite)})` : ''
  return `${enLigne(axe.titre)}${unite}`
}

/** Titres d'axes posés sur le tracé (px de mise en page relatifs à la figure). */
export function htmlAxes(trace: Trace, g: Geometrie): string {
  const hy = 18
  const cy = g.by + g.bh / 2
  return `<div class="gr-fig-axe" style="left:${g.bx}px;width:${g.bw}px;top:${g.by + g.bh + 20}px">${titreAxe(trace.x)}</div>`
    + `<div class="gr-fig-axe gr-fig-axe-y" style="left:${14 - g.bh / 2}px;width:${g.bh}px;top:${cy - hy / 2}px;height:${hy}px">${titreAxe(trace.y)}</div>`
}

/** « Figure 2 — titre » : le mot en petites capitales. */
export function htmlTitreFigure(numero: string, titre: string): string {
  return `<span class="gr-fig-mot">Figure ${echapper(numero)}</span> — ${enLigne(titre)}`
}

/** Contenu HTML d'une figure de la grille ; `illustre` : « Lemme 7 » (nœud illustré). */
export function htmlFigure(f: FigureVue, numero: string, illustre: string | null, w: number, h: number): string {
  const g = geometrieBloc(f, w, h)
  const joint = f.scene ? '<span class="gr-fig-joint">3D animée</span>'
    : f.trace && f.image ? '<span class="gr-fig-joint">image jointe</span>' : ''
  const ref = illustre ? `<span class="gr-fig-ref">illustre ${echapper(illustre)}</span>` : ''
  const tete = `<div class="gr-fig-tete" style="height:${g.tete}px"><span class="gr-fig-titre">${htmlTitreFigure(numero, f.titre)}</span>${joint}${ref}</div>`
  const axes = f.trace ? htmlAxes(f.trace, g) : ''
  const legende = f.legende && g.pied > 10
    ? `<div class="gr-fig-legende" style="height:${g.pied - 6}px">${rendre(f.legende)}</div>`
    : ''
  return `<div class="gr-fig">${tete}${axes}${legende}</div>`
}

// ─── Fenêtre agrandie ────────────────────────────────────────────────────────

export interface OptionsFenetre {
  figure: FigureVue
  numero: string
  /** Nœud illustré : « Lemme 7 » et son nom, ou null s'il n'est pas dans le graphe. */
  noeud: { reference: string; nom: string } | null
  images: ImagesFigures
  surNoeud: () => void
  surFermer: () => void
}

/** Ouvre la figure en grand (tracé agrandi ou image en taille réelle, légende complète) ; Échap ou clic hors la ferment. */
export function ouvrirFenetre(o: OptionsFenetre): () => void {
  const f = o.figure
  const fond = document.createElement('div')
  fond.className = 'gr-fig-fond'
  fond.setAttribute('role', 'dialog')
  fond.setAttribute('aria-modal', 'true')
  fond.setAttribute('aria-label', `Figure ${o.numero}`)
  const fenetre = document.createElement('div')
  fenetre.className = 'gr-fig-fenetre'
  fond.append(fenetre)
  const meta: string[] = []
  if (o.noeud) meta.push(`Illustre <button type="button" class="gr-fig-lien">${echapper(o.noeud.reference)}</button> (${enLigne(o.noeud.nom)})`)
  else meta.push(`Illustre <code>${echapper(f.noeud_id)}</code> (absent du graphe)`)
  if (f.source) meta.push(`Source : <code>${echapper(f.source)}</code>`)
  for (const s of f.trace?.series ?? []) if (s.genre !== 'loi' && s.source) meta.push(`${echapper(texteBrut(s.nom))} : <code>${echapper(s.source)}</code>`)
  if (f.image && f.image_largeur && f.image_hauteur) meta.push(`image ${f.image_largeur} × ${f.image_hauteur} px`)
  fenetre.innerHTML = `
    <header class="gr-fig-fenetre-tete">
      <h2>${htmlTitreFigure(o.numero, f.titre)}</h2>
      <button type="button" class="gr-fig-fermer" aria-label="Fermer">×</button>
    </header>
    <div class="gr-fig-corps"></div>
    ${f.legende ? `<div class="gr-fig-legende-complete">${rendre(f.legende)}</div>` : ''}
    ${lois(f)}
    <p class="gr-fig-meta">${meta.join(' · ')}</p>`
  const corps = fenetre.querySelector<HTMLElement>('.gr-fig-corps')!
  document.body.append(fond)

  if (f.trace) {
    const largeur = Math.max(320, Math.min(900, window.innerWidth * 0.9 - 48))
    const hauteur = Math.round(Math.min(largeur * 0.58, window.innerHeight * 0.55))
    const zone = document.createElement('div')
    zone.className = 'gr-fig-trace'
    zone.style.width = `${largeur}px`
    zone.style.height = `${hauteur}px`
    const canvas = document.createElement('canvas')
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(largeur * dpr)
    canvas.height = Math.round(hauteur * dpr)
    canvas.style.width = `${largeur}px`
    canvas.style.height = `${hauteur}px`
    zone.append(canvas)
    const g = geometrie(largeur, hauteur, 0, 0)
    zone.insertAdjacentHTML('beforeend', htmlAxes(f.trace, g))
    corps.append(zone)
    const ctx = canvas.getContext('2d')!
    const dessinerFenetre = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, largeur, hauteur)
      dessinerTrace(ctx, f.trace!, g, 1)
    }
    dessinerFenetre()
    // Les fontes Computer Modern peuvent arriver après le premier dessin.
    void document.fonts.ready.then(dessinerFenetre)
  }
  if (f.image) {
    const bloc = document.createElement(f.trace ? 'details' : 'div')
    bloc.className = 'gr-fig-image'
    if (f.trace) bloc.innerHTML = '<summary>Image jointe</summary>'
    const attente = document.createElement('div')
    attente.className = 'gr-fig-attente'
    attente.textContent = 'Chargement de l’image…'
    bloc.append(attente)
    corps.append(bloc)
    void o.images.url(f).then((url) => {
      if (!url) {
        attente.textContent = 'Image indisponible.'
        return
      }
      const img = document.createElement('img')
      img.src = url
      img.alt = texteBrut(f.titre)
      attente.replaceWith(img)
    })
  }

  let ouverte = true
  const fermer = () => {
    if (!ouverte) return
    ouverte = false
    document.removeEventListener('keydown', clavier, true)
    fond.remove()
    o.surFermer()
  }
  const clavier = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    e.stopPropagation()
    fermer()
  }
  document.addEventListener('keydown', clavier, true)
  fond.addEventListener('pointerdown', (e) => {
    if (e.target === fond) fermer()
  })
  fenetre.querySelector('.gr-fig-fermer')!.addEventListener('click', fermer)
  fenetre.querySelector('.gr-fig-lien')?.addEventListener('click', () => {
    fermer()
    o.surNoeud()
  })
  fenetre.querySelector<HTMLElement>('.gr-fig-fermer')!.focus()
  return fermer
}

const GRECS = new Set(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'kappa', 'lambda', 'mu', 'nu', 'xi',
  'pi', 'rho', 'sigma', 'tau', 'phi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Sigma', 'Phi', 'Psi', 'Omega'])

/** Nom de paramètre d'une expression en LaTeX : « tau » → \tau, « A0 » → A_{0}, « v_l » → v_{l}. */
function texNom(nom: string): string {
  const m = nom.match(/^([A-Za-z]+)_(\w+)$/) ?? nom.match(/^([A-Za-z]+?)(\d+)$/) ?? nom.match(/^([A-Za-z]+)()$/)
  if (!m) return nom
  const tex = (x: string) => (GRECS.has(x) ? `\\${x}` : x.length > 1 ? `\\mathit{${x}}` : x)
  return m[2] ? `${tex(m[1]!)}_{${tex(m[2])}}` : tex(m[1]!)
}

/** Lois du tracé : expression et paramètres (valeur ± incertitude), en LaTeX simple. */
function lois(f: FigureVue): string {
  const items = (f.trace?.series ?? []).flatMap((s) => {
    if (s.genre !== 'loi') return []
    const params = Object.entries(s.parametres ?? {}).map(([nom, p]) => {
      const d = p.incertitude ? Math.max(0, Math.min(6, -Math.floor(Math.log10(p.incertitude)) + 1)) : 3
      const valeur = p.incertitude ? `${fr(p.valeur, d)} \\pm ${fr(p.incertitude, d)}` : `${fr(p.valeur, d).replace(/,?0+$/, '')}`
      return `${enLigne(`$${texNom(nom)} =${valeur.replace(/,/g, '{,}')}$`)}${p.noeud ? ` <span class="gr-fig-doux">(${echapper(p.noeud)})</span>` : ''}`
    })
    return [`<li><b>${enLigne(s.nom)}</b> : <code>${echapper(s.expression)}</code>${params.length ? ` ; ${params.join(', ')}` : ''}</li>`]
  })
  return items.length ? `<ul class="gr-fig-lois">${items.join('')}</ul>` : ''
}
