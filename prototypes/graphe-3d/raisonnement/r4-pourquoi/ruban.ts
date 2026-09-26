// R4 · Ruban de vue d'ensemble : tout le graphe de lecture en miniature (disposition dagre de la
// référence, écrasée dans un bandeau), ce qui est déplié en couleur, le reste en gris. Survol = nom,
// clic = révéler cette unité et le chemin qui la relie à ce qui est visible.

import { disposer, el, rgba, type VueRaisonnement } from '../../src/raisonnement'
import type { ModeleDepliage } from './modele'

export class Ruban {
  readonly element: HTMLElement
  private canvas: HTMLCanvasElement
  private texte: HTMLElement
  private bulle: HTMLElement
  private px = new Float32Array(0)
  private py = new Float32Array(0)
  private survol = -1

  constructor(private vue: VueRaisonnement, private m: ModeleDepliage, private reveler: (u: number) => void) {
    this.canvas = el('canvas', { class: 'r4-ruban-canvas' }) as HTMLCanvasElement
    this.texte = el('div', { class: 'r4-ruban-texte' })
    this.bulle = el('div', { class: 'r4-ruban-bulle' })
    this.element = el('div', { class: 'r4-ruban', title: '' }, this.texte, this.canvas, this.bulle)
    vue.interface.appendChild(this.element)
    this.canvas.addEventListener('pointermove', (e) => this.surMouvement(e))
    this.canvas.addEventListener('pointerleave', () => { this.survol = -1; this.bulle.classList.remove('visible'); this.dessiner() })
    this.canvas.addEventListener('click', () => { if (this.survol >= 0) this.reveler(this.survol) })
    new ResizeObserver(() => this.dessiner()).observe(this.element)
  }

  /** Nouvelle dérivation : disposition miniature. */
  reconstruire(): void {
    const g = this.vue.lecture
    const d = disposer(g, { moteur: 'dagre', classement: 'ancre', ecartRangs: 60, ecartNoeuds: 10 })
    const nU = g.unites.length
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (let u = 0; u < nU; u++) {
      x0 = Math.min(x0, d.x[u]!); x1 = Math.max(x1, d.x[u]!)
      z0 = Math.min(z0, d.z[u]!); z1 = Math.max(z1, d.z[u]!)
    }
    this.px = new Float32Array(nU)
    this.py = new Float32Array(nU)
    for (let u = 0; u < nU; u++) {
      this.px[u] = (d.x[u]! - x0) / Math.max(1e-6, x1 - x0)
      this.py[u] = 1 - (d.z[u]! - z0) / Math.max(1e-6, z1 - z0)
    }
    this.dessiner()
  }

  private zone(): { x: number; y: number; w: number; h: number } {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight
    return { x: 10, y: 6, w: Math.max(1, w - 20), h: Math.max(1, h - 12) }
  }

  private surMouvement(e: PointerEvent): void {
    const r = this.canvas.getBoundingClientRect()
    const mx = e.clientX - r.left, my = e.clientY - r.top
    const z = this.zone()
    let best = -1, dmin = 10
    for (let u = 0; u < this.px.length; u++) {
      const d = Math.hypot(z.x + this.px[u]! * z.w - mx, z.y + this.py[u]! * z.h - my)
      if (d < dmin) { dmin = d; best = u }
    }
    if (best !== this.survol) {
      this.survol = best
      this.dessiner()
    }
    if (best >= 0) {
      const n = this.m.noeud(best)
      this.bulle.textContent = `${n.nom}${this.m.visible[best] ? '' : ' · clic : révéler'}`
      this.bulle.style.transform = `translate(${Math.min(mx + 12, r.width - 260)}px, -26px)`
      this.bulle.classList.add('visible')
    } else this.bulle.classList.remove('visible')
    this.canvas.style.cursor = best >= 0 ? 'pointer' : 'default'
  }

  dessiner(): void {
    const c = this.canvas
    const ratio = window.devicePixelRatio || 1
    const W = c.clientWidth, H = c.clientHeight
    if (!W || !H) return
    if (c.width !== Math.round(W * ratio) || c.height !== Math.round(H * ratio)) {
      c.width = Math.round(W * ratio)
      c.height = Math.round(H * ratio)
    }
    const ctx = c.getContext('2d')!
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, W, H)
    const m = this.m, g = this.vue.lecture, pal = this.vue.palette
    if (this.px.length !== m.nU) return
    const z = this.zone()
    const X = (u: number) => z.x + this.px[u]! * z.w, Y = (u: number) => z.y + this.py[u]! * z.h
    // Arêtes : très discrètes ; celles du graphe visible en accent.
    ctx.lineWidth = 0.6
    for (const a of g.aretes) {
      const vis = m.visible[a.source] && m.visible[a.cible]
      ctx.strokeStyle = vis ? rgba(pal.accent, 0.55) : rgba(pal.texteDoux, 0.08)
      ctx.beginPath()
      ctx.moveTo(X(a.source), Y(a.source))
      ctx.lineTo(X(a.cible), Y(a.cible))
      ctx.stroke()
    }
    const ariane = new Set(m.ariane())
    for (let u = 0; u < m.nU; u++) {
      const vis = m.visible[u]
      const couche = this.vue.disposition.couche[u] ?? 3
      ctx.fillStyle = vis ? pal.couches[couche]! : rgba(pal.texteDoux, 0.28)
      const r = vis ? 2.6 : 1.5
      ctx.beginPath()
      ctx.arc(X(u), Y(u), r, 0, Math.PI * 2)
      ctx.fill()
      if (ariane.has(u) || u === this.survol) {
        ctx.strokeStyle = u === this.survol ? pal.texte : pal.accent
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.arc(X(u), Y(u), r + 2.5, 0, Math.PI * 2)
        ctx.stroke()
        ctx.lineWidth = 0.6
      }
    }
    const nv = m.nbVisibles()
    const s = g.stats
    this.texte.replaceChildren(
      el('b', {}, 'Vue d’ensemble'),
      ` · ${nv} / ${m.nU} unités de lecture affichées · ${m.masquees()} repliées · graphe complet ${s.noeudsComplet} nœuds / ${s.aretesComplet} arêtes`,
    )
  }
}
