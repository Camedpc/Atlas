// Lignée animée (reprise de V3, en version sobre pour le papier) : au clic, de courtes impulsions
// coulent le long des arêtes, des ancêtres les plus lointains vers le nœud, puis du nœud vers ses
// descendants. Le décalage de chaque arête = sa distance (en arêtes, BFS) à la sélection. Un fin
// anneau « respire » autour de la sélection et une onde s'élargit quand une vague l'atteint.
//
// Les impulsions suivent les représentants affichés (agrégats à granularité faible).
// Performance : tant qu'une lignée est active, une petite boucle rAF redessine seulement les deux
// calques canvas (sans relancer sigma) quand le moteur, immobile, ne calcule pas d'image.

import { rgba, type ContexteDessin, type VueGraphe } from '../../src/core'
import { lire } from './reglages'

const MAX = 6000
const P2: number[] = [0, 0]
const DEUX_PI = Math.PI * 2

export class ImpulsionsLignee {
  private impA = new Int32Array(MAX)
  private impB = new Int32Array(MAX)
  private impO = new Float32Array(MAX)
  private impT = new Uint8Array(MAX)
  private nb = 0
  private arrivee = 0
  private cle = ''
  private derniereImageMoteur = -1
  private raf = 0
  /** Impulsions dessinées à la dernière image (tests). */
  dessinees = 0

  constructor(private vue: VueGraphe) {
    vue.on('image', ({ temps }) => (this.derniereImageMoteur = temps))
    vue.on('selection', () => this.relancer())
    vue.on('reglage', ({ cle }) => cle === 'impulsions' && this.relancer())
  }

  /** Nombre d'arêtes parcourues (tests, panneau). */
  get nombre(): number {
    return this.nb
  }

  private get anime(): boolean {
    return this.vue.lignee.active && lire<boolean>(this.vue, 'impulsions')
  }

  private relancer(): void {
    if (this.anime && !this.raf) this.raf = requestAnimationFrame(this.boucle)
  }

  /** Redessine les calques quand le moteur n'a pas produit d'image à ce pas de temps. */
  private boucle = (t: number): void => {
    this.raf = 0
    if (!this.anime) return
    const v = this.vue
    if (t !== this.derniereImageMoteur && !document.hidden) {
      v.rendu.preparerCalques()
      const base = { vue: v, largeur: v.rendu.largeur, hauteur: v.rendu.hauteur, projection: v.projection, positions: v.positions, temps: t }
      for (const f of v.dessinsDessous) f({ ...base, ctx: v.rendu.ctxDessous })
      for (const f of v.dessinsDessus) f({ ...base, ctx: v.rendu.ctxDessus })
    }
    // Les calques redessinés ont pu relancer la boucle : une seule demande par image.
    if (!this.raf) this.raf = requestAnimationFrame(this.boucle)
  }

  /** Recalcule les arêtes parcourues (représentants affichés, décalage en arêtes). */
  private maj(): void {
    const { h, lignee: l, granularite: g } = this.vue
    const cle = `${l.version}|${g.version}`
    if (cle === this.cle) return
    this.cle = cle
    this.nb = 0
    if (!l.active) return
    const nF = h.nF
    const dA = new Int32Array(nF).fill(-1), dD = new Int32Array(nF).fill(-1)
    const bfs = (d: Int32Array, voisins: number[][], dans: Uint8Array) => {
      let front: number[] = []
      for (let f = 0; f < nF; f++) if (l.graines[f]) { d[f] = 0; front.push(f) }
      let max = 0
      while (front.length) {
        const suivant: number[] = []
        for (const x of front) for (const y of voisins[x]!) {
          if (d[y] !== -1 || !dans[y]) continue
          d[y] = d[x]! + 1
          if (d[y]! > max) max = d[y]!
          suivant.push(y)
        }
        front = suivant
      }
      return max
    }
    const maxA = bfs(dA, h.premisses, l.ancetres)
    bfs(dD, h.utilisePar, l.descendants)
    this.arrivee = maxA
    const vus = new Map<number, number>()
    const { aretesSource: SA, aretesCible: TA } = h
    for (let e = 0; e < SA.length; e++) {
      const s = SA[e]!, t = TA[e]!
      let type: number, o: number
      if (dA[s]! > 0 && dA[t]! >= 0) {
        type = 0
        o = maxA - dA[s]!
      } else if (dD[t]! > 0 && dD[s]! >= 0 && dD[t]! === dD[s]! + 1) {
        type = 1
        o = maxA + dD[s]!
      } else continue
      const a = g.representant(s), b = g.representant(t)
      if (a === b) continue
      const k = a * h.nU + b
      const i = vus.get(k)
      if (i !== undefined) {
        if (o < this.impO[i]!) this.impO[i] = o
        continue
      }
      if (this.nb >= MAX) break
      const j = this.nb++
      vus.set(k, j)
      this.impA[j] = a
      this.impB[j] = b
      this.impO[j] = o
      this.impT[j] = type
    }
  }

  /** Calque dessus : anneau de la sélection, onde de réception, impulsions. */
  dessiner = ({ ctx, vue, projection: P, temps: t }: ContexteDessin): void => {
    const { palette: pal, lignee } = vue
    if (!lignee.active) return
    this.relancer()
    const sel = lignee.selection!
    const vitesse = lire<number>(vue, 'vitesseImpulsions')
    const E = lire<number>(vue, 'espacementVagues')
    const tau = (t / 1000) * vitesse
    const mod = (x: number) => ((x % E) + E) % E
    const impulsions = lire<boolean>(vue, 'impulsions')
    ctx.save()
    if (lire<boolean>(vue, 'anneauSelection') && vue.opaciteAffichee[sel]! > 0.03 && P.visible[sel]) {
      const x = P.x[sel]!, y = P.y[sel]!, r0 = vue.tailleAffichee[sel]! + 7
      const respire = impulsions ? Math.sin(t / 480) : 0
      ctx.lineWidth = 1
      ctx.strokeStyle = rgba(pal.accent, 0.55 + 0.2 * respire)
      ctx.beginPath()
      ctx.arc(x, y, r0 + 1.2 * respire, 0, DEUX_PI)
      ctx.stroke()
      if (impulsions) {
        const ph = mod(tau - this.arrivee) / 1.2
        if (ph < 1) {
          ctx.lineWidth = 1.5 * (1 - ph)
          ctx.strokeStyle = rgba(pal.accent, 0.5 * (1 - ph))
          ctx.beginPath()
          ctx.arc(x, y, r0 + ph * 20, 0, DEUX_PI)
          ctx.stroke()
        }
      }
    }
    if (!impulsions) {
      ctx.restore()
      return
    }
    this.maj()
    const queue = lire<number>(vue, 'queueImpulsion')
    const tp = lire<number>(vue, 'tailleImpulsion')
    const courbure = lire<number>(vue, 'courbureAretes')
    const rTete = tp * 0.75
    const queues = [new Path2D(), new Path2D()]
    const tetes = [new Path2D(), new Path2D()]
    this.dessinees = 0
    for (let i = 0; i < this.nb; i++) {
      const a = this.impA[i]!, b = this.impB[i]!
      const op = Math.min(vue.opaciteAffichee[a]!, vue.opaciteAffichee[b]!)
      if (op < 0.02 || !P.visible[a] || !P.visible[b]) continue
      const f = mod(tau - this.impO[i]!)
      if (f >= 1) continue
      const ax = P.x[a]!, ay = P.y[a]!, bx = P.x[b]!, by = P.y[b]!
      const dx = bx - ax, dy = by - ay
      const l = Math.hypot(dx, dy)
      if (l < 2) continue
      // Même courbe que l'arête dessinée (@sigma/edge-curve : Bézier quadratique, point de contrôle
      // au milieu décalé de courbure × longueur sur la normale).
      const cx = (ax + bx) / 2 + dy * courbure, cy = (ay + by) / 2 - dx * courbure
      const pt = (t: number, sortie: number[]) => {
        const u = 1 - t
        sortie[0] = u * u * ax + 2 * u * t * cx + t * t * bx
        sortie[1] = u * u * ay + 2 * u * t * cy + t * t * by
      }
      // On part du bord des disques, pas de leur centre.
      const s0 = Math.min(0.45, vue.tailleAffichee[a]! / l), s1 = Math.max(0.55, 1 - vue.tailleAffichee[b]! / l)
      const k = s0 + (s1 - s0) * f
      const q = s0 + (s1 - s0) * Math.max(0, f - queue)
      const type = this.impT[i]!
      const chemin = queues[type]!
      pt(q, P2)
      chemin.moveTo(P2[0]!, P2[1]!)
      for (let j = 1; j <= 5; j++) {
        pt(q + ((k - q) * j) / 5, P2)
        chemin.lineTo(P2[0]!, P2[1]!)
      }
      this.dessinees++
      tetes[type]!.moveTo(P2[0]! + rTete, P2[1]!)
      tetes[type]!.arc(P2[0]!, P2[1]!, rTete, 0, DEUX_PI)
    }
    const couleurs = [pal.ancetre, pal.descendant]
    ctx.lineCap = 'round'
    for (let k = 0; k < 2; k++) {
      ctx.lineWidth = tp * 0.75
      ctx.strokeStyle = rgba(couleurs[k]!, 0.7)
      ctx.stroke(queues[k]!)
      ctx.fillStyle = rgba(couleurs[k]!, 1)
      ctx.strokeStyle = rgba(pal.fond, 0.9)
      ctx.lineWidth = 1.2
      ctx.stroke(tetes[k]!)
      ctx.fill(tetes[k]!)
    }
    ctx.restore()
  }
}
