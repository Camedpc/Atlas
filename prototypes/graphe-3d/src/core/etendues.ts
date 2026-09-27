// Étendue des agrégats : quantiles de leurs feuilles par axe et par disposition, histogramme
// temporel et répartition par type, plus le rendu par défaut en vues temps / type.
//
// Problème résolu : en vue de face (X = temps) un agrégat placé au centre de ses feuilles
// perd l'information temporelle (tous les agrégats se tassent au milieu). On dessine donc,
// sous le disque placé à la médiane, sa distribution le long de l'axe :
//   · « capsule » : boîte à moustaches horizontale (min–max, q10–q90, q25–q75) ;
//   · « tranches » : l'agrégat découpé en périodes (catégorie × semaine), un disque par tranche ;
// et en vue de droite (couloirs) un segment par type proportionnel à l'effectif.

import { TYPES_NOEUD } from './donnees'
import type { Dispositions, NomDisposition } from './dispositions'
import { centreCouloir, quantile } from './dispositions'
import type { Hierarchie } from './hierarchie'
import { rgba } from './apparence'
import type { Vec3 } from './maths'
import type { ContexteDessin, VueGraphe } from './index'

export interface Quantiles {
  min: number
  q10: number
  q25: number
  mediane: number
  q75: number
  q90: number
  max: number
}
export interface EtendueAgregat {
  x: Quantiles
  y: Quantiles
  z: Quantiles
  nombre: number
}

const Q = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1] as const
const versQuantiles = (a: ArrayLike<number>, o = 0): Quantiles => ({
  min: a[o]!, q10: a[o + 1]!, q25: a[o + 2]!, mediane: a[o + 3]!, q75: a[o + 4]!, q90: a[o + 5]!, max: a[o + 6]!,
})

export class Etendues {
  /** Nombre de tranches temporelles (semaines). */
  readonly nbTranches: number
  /** Effectif par (catégorie, tranche). */
  readonly tranches: Int32Array
  /** Quantiles de la coordonnée temps (X de la disposition « face », dans [-1, 1]). */
  readonly temps: Float32Array
  /** Effectif par (catégorie, type de nœud). */
  readonly types: Int32Array
  version = 0
  private cache = new Map<string, EtendueAgregat>()

  constructor(readonly h: Hierarchie, private d: Dispositions) {
    this.nbTranches = Math.max(8, Math.ceil((h.dateMax - h.dateMin) / (7 * 86_400_000)))
    this.tranches = new Int32Array(h.nC * this.nbTranches)
    this.temps = new Float32Array(h.nC * 7)
    this.types = new Int32Array(h.nC * TYPES_NOEUD.length)
  }

  /** Recalcule (au changement de filtres ; `actives` absent = toutes les feuilles). */
  calculer(actives?: Uint8Array): void {
    const { h } = this
    const nT = this.nbTranches, nY = TYPES_NOEUD.length
    this.tranches.fill(0)
    this.types.fill(0)
    const valeurs: number[] = []
    for (const c of h.categories) {
      valeurs.length = 0
      for (const f of c.feuilles) {
        if (actives && !actives[f]) continue
        const x = this.d.face[f * 3]!
        valeurs.push(x)
        const k = Math.min(nT - 1, Math.floor(((x + 1) / 2) * nT))
        this.tranches[c.index * nT + k]!++
        this.types[c.index * nY + TYPES_NOEUD.indexOf(h.noeuds[f]!.type)]!++
      }
      valeurs.sort((a, b) => a - b)
      Q.forEach((q, i) => (this.temps[c.index * 7 + i] = quantile(valeurs, q)))
    }
    this.cache.clear()
    this.actives = actives
    this.version++
  }
  private actives: Uint8Array | undefined

  /** Quantiles par axe (monde) des feuilles de l'agrégat u dans une disposition. */
  etendue(u: number, nom: NomDisposition = 'face'): EtendueAgregat | null {
    const c = this.h.categorieDe(u)
    if (!c) return null
    const cle = `${u}|${nom}`
    const deja = this.cache.get(cle)
    if (deja) return deja
    const p = this.d[nom]
    const axes: number[][] = [[], [], []]
    for (const f of c.feuilles) {
      if (this.actives && !this.actives[f]) continue
      for (let k = 0; k < 3; k++) axes[k]!.push(p[f * 3 + k]!)
    }
    const qs = axes.map((a) => {
      a.sort((x, y) => x - y)
      return versQuantiles(Q.map((q) => quantile(a, q)))
    })
    const r: EtendueAgregat = { x: qs[0]!, y: qs[1]!, z: qs[2]!, nombre: axes[0]!.length }
    this.cache.set(cle, r)
    return r
  }

  quantilesTemps(c: number): Quantiles {
    return versQuantiles(this.temps, c * 7)
  }
}

// ─── Géométrie écran ─────────────────────────────────────────────────────────

/** Poids d'affichage de l'axe temps et de l'axe des couloirs dans la vue courante (0…1). */
export function poidsAxes(vue: VueGraphe): { temps: number; couloirs: number } {
  const cube = vue.reglages.valeurs.mode3D === 'cube'
  const av = vue.camera.avant
  // Le rendu n'apparaît franchement que près de la face concernée (évite les traînées en vue libre).
  const net = (w: number) => w * w * (3 - 2 * w)
  return {
    temps: net((cube ? 1 : vue.poidsFaces[1]!) * (1 - Math.abs(av[0]))),
    couloirs: net((cube ? 1 : vue.poidsFaces[2]!) * (1 - Math.abs(av[1]))),
  }
}

/**
 * Point monde de l'agrégat u décalé le long d'un axe : 'temps' (X, valeur dans [-1,1]) ou
 * 'couloirs' (Y). Le décalage suit le poids de la face concernée et la présence de l'agrégat
 * (il rentre avec lui dans son parent).
 */
export function pointSurAxe(vue: VueGraphe, u: number, axe: 'temps' | 'couloirs', valeur: number): Vec3 {
  const cube = vue.reglages.valeurs.mode3D === 'cube'
  const k = vue.granularite.presence[u]!
  const p = vue.positions
  if (axe === 'temps') {
    const w = cube ? 1 : vue.poidsFaces[1]!
    const med = (cube ? vue.dispositions.cube : vue.dispositions.face)[u * 3]!
    return [p[u * 3]! + (valeur - med) * w * k, p[u * 3 + 1]!, p[u * 3 + 2]!]
  }
  const w = cube ? 1 : vue.poidsFaces[2]!
  const med = (cube ? vue.dispositions.cube : vue.dispositions.droite)[u * 3 + 1]!
  return [p[u * 3]!, p[u * 3 + 1]! + (valeur - med) * w * k, p[u * 3 + 2]!]
}

/** Étendue temporelle projetée à l'écran (pixels CSS), ou null pour une feuille. */
export function etendueTempsEcran(vue: VueGraphe, u: number): Record<keyof Quantiles, { x: number; y: number }> | null {
  const c = vue.h.categorieDe(u)
  if (!c) return null
  const q = vue.etendues.quantilesTemps(c.index)
  const r = {} as Record<keyof Quantiles, { x: number; y: number }>
  for (const cle of Object.keys(q) as (keyof Quantiles)[]) {
    const pp = vue.camera.projeterPoint(pointSurAxe(vue, u, 'temps', q[cle]))
    r[cle] = { x: pp.x, y: pp.y }
  }
  return r
}

// ─── Rendu par défaut (calque dessous) ──────────────────────────────────────

const ECART_TYPES = centreCouloir(1, 1) - centreCouloir(0, 1)

export function dessinerEtendues({ ctx, vue }: ContexteDessin): void {
  const R = vue.reglages.valeurs
  const style = R.etendues
  if (style === 'aucune') return
  const w = poidsAxes(vue)
  const temps = w.temps > 0.04, couloirs = R.etenduesCouloirs && w.couloirs > 0.04
  if (!temps && !couloirs) return
  const { h, palette, camera: cam } = vue
  const nT = vue.etendues.nbTranches, nY = TYPES_NOEUD.length
  const proj = (p: Vec3) => cam.projeterPoint(p)
  ctx.save()
  ctx.lineCap = 'round'
  for (const c of h.categories) {
    const u = c.unite
    const op = vue.opaciteAffichee[u]!
    if (op < 0.04) continue
    const coul = palette.domaines[c.domaine % palette.domaines.length]!
    const epais = Math.max(3, Math.min(14, vue.tailleAffichee[u]! * 0.9))
    const segment = (a: Vec3, b: Vec3, largeur: number, alpha: number) => {
      const pa = proj(a), pb = proj(b)
      if (!pa.visible || !pb.visible) return
      ctx.strokeStyle = rgba(coul, alpha)
      ctx.lineWidth = largeur
      ctx.beginPath()
      ctx.moveTo(pa.x, pa.y)
      ctx.lineTo(pb.x, pb.y)
      ctx.stroke()
    }
    if (temps) {
      const a = op * Math.min(1, w.temps * 1.2)
      const q = vue.etendues.quantilesTemps(c.index)
      const pt = (v: number) => pointSurAxe(vue, u, 'temps', v)
      segment(pt(q.min), pt(q.max), 1, 0.35 * a)
      if (style === 'tranches') {
        let max = 1
        for (let k = 0; k < nT; k++) max = Math.max(max, vue.etendues.tranches[c.index * nT + k]!)
        const p0 = proj(pt(-1)), p1 = proj(pt(1))
        const pas = Math.hypot(p1.x - p0.x, p1.y - p0.y) / nT
        const rMax = Math.max(1.5, Math.min(epais, pas * 0.48))
        ctx.fillStyle = rgba(coul, 0.6 * a)
        for (let k = 0; k < nT; k++) {
          const n = vue.etendues.tranches[c.index * nT + k]!
          if (!n) continue
          const p = proj(pt(-1 + (2 * (k + 0.5)) / nT))
          if (!p.visible) continue
          ctx.beginPath()
          ctx.arc(p.x, p.y, Math.max(1.2, rMax * Math.sqrt(n / max)), 0, Math.PI * 2)
          ctx.fill()
        }
      } else {
        segment(pt(q.q10), pt(q.q90), epais, 0.16 * a)
        segment(pt(q.q25), pt(q.q75), Math.max(2, epais * 0.42), 0.42 * a)
      }
    }
    if (couloirs) {
      const a = op * Math.min(1, w.couloirs * 1.2)
      let max = 1, premier = -1, dernier = -1
      for (let t = 0; t < nY; t++) {
        const n = vue.etendues.types[c.index * nY + t]!
        if (!n) continue
        max = Math.max(max, n)
        if (premier < 0) premier = t
        dernier = t
      }
      if (premier < 0) continue
      const pt = (v: number) => pointSurAxe(vue, u, 'couloirs', v)
      segment(pt(centreCouloir(premier, 1)), pt(centreCouloir(dernier, 1)), 1, 0.3 * a)
      for (let t = premier; t <= dernier; t++) {
        const n = vue.etendues.types[c.index * nY + t]!
        if (!n) continue
        const y = centreCouloir(t, 1), demi = ECART_TYPES * 0.42 * (n / max)
        segment(pt(y - demi), pt(y + demi), Math.max(2, epais * 0.45), 0.38 * a)
      }
    }
  }
  ctx.restore()
}
