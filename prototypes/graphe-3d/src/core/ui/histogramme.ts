// Histogramme temporel des créations avec brosse : glisser = choisir une période, clic = tout.

import type { VueGraphe } from '../index'
import { rgba } from '../apparence'
import { el, formaterDateCourte } from './dom'

export class Histogramme {
  readonly element: HTMLElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private etiquette: HTMLElement
  private nbCases = 0
  private total: Int32Array = new Int32Array(0)
  private actifs: Int32Array = new Int32Array(0)
  private brosse: { debut: number; fin: number } | null = null
  private largeur = 0
  private hauteur = 56

  constructor(parent: HTMLElement, private vue: VueGraphe) {
    this.canvas = el('canvas', { class: 'atlas-histo-canvas' })
    this.etiquette = el('div', { class: 'atlas-histo-etiquette' })
    this.element = el('div', { class: 'atlas-histo', title: 'Glisser pour filtrer une période · clic pour tout afficher' }, this.canvas, this.etiquette)
    parent.appendChild(this.element)
    this.ctx = this.canvas.getContext('2d')!
    new ResizeObserver(() => this.redimensionner()).observe(this.element)

    this.canvas.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      try {
        this.canvas.setPointerCapture(e.pointerId)
      } catch {
        // pointeur synthétique : sans capture
      }
      const t = this.temps(e)
      this.brosse = { debut: t, fin: t }
      this.dessiner()
    })
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.brosse) return this.survoler(e)
      this.brosse.fin = this.temps(e)
      this.dessiner()
    })
    this.canvas.addEventListener('pointerup', () => {
      const b = this.brosse
      this.brosse = null
      if (!b) return
      const [a, z] = [Math.min(b.debut, b.fin), Math.max(b.debut, b.fin)]
      const h = vue.h
      const assezLarge = (z - a) / (h.dateMax - h.dateMin) > 0.004
      vue.filtres.modifier({ periode: assezLarge ? [a, z] : null })
    })
    this.canvas.addEventListener('pointerleave', () => (this.etiquette.textContent = this.texteDefaut()))
    vue.on('filtres', () => this.compter())
    vue.on('theme', () => this.dessiner())
    this.compter()
  }

  private temps(e: PointerEvent): number {
    const r = this.canvas.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const h = this.vue.h
    return h.dateMin + x * (h.dateMax - h.dateMin)
  }

  private survoler(e: PointerEvent): void {
    const t = this.temps(e)
    const h = this.vue.h
    const i = Math.min(this.nbCases - 1, Math.floor(((t - h.dateMin) / (h.dateMax - h.dateMin)) * this.nbCases))
    this.etiquette.textContent = `${formaterDateCourte(t)} · ${this.actifs[i] ?? 0} nœud(s) créés cette semaine`
  }

  private texteDefaut(): string {
    const p = this.vue.filtres.etat.periode
    return p ? `${formaterDateCourte(p[0])} → ${formaterDateCourte(p[1])}` : 'Créations par semaine — glisser pour filtrer'
  }

  private compter(): void {
    const h = this.vue.h
    const semaines = Math.max(8, Math.ceil((h.dateMax - h.dateMin) / (7 * 86_400_000)))
    this.nbCases = semaines
    this.total = new Int32Array(semaines)
    this.actifs = new Int32Array(semaines)
    const f = this.vue.filtres
    // L'histogramme ignore le filtre de période lui-même, pour qu'on voie ce qu'on sélectionne.
    const e = f.etat
    for (let i = 0; i < h.nF; i++) {
      const k = Math.min(semaines - 1, Math.floor(((h.dates[i]! - h.dateMin) / (h.dateMax - h.dateMin)) * semaines))
      this.total[k]!++
      const d = h.dates[i]!
      const dansPeriode = !e.periode || (d >= e.periode[0] && d <= e.periode[1])
      if (f.actives[i] || (!dansPeriode && this.passeHorsPeriode(i))) this.actifs[k]!++
    }
    this.etiquette.textContent = this.texteDefaut()
    this.dessiner()
  }

  /** Vrai si le nœud passerait les filtres sans la contrainte de période. */
  private passeHorsPeriode(i: number): boolean {
    const n = this.vue.h.noeuds[i]!
    const e = this.vue.filtres.etat
    return !e.typesExclus.has(n.type) && !e.originesExclues.has(n.origine) && !e.statutsExclus.has(n.statut) &&
      !e.validationsExclues.has(n.validation) && n.confiance.estimation >= e.confianceMin && !e.texte && !e.categoriesExclues.size
  }

  private redimensionner(): void {
    const r = window.devicePixelRatio || 1
    this.largeur = this.canvas.clientWidth
    this.canvas.width = Math.round(this.largeur * r)
    this.canvas.height = Math.round(this.hauteur * r)
    this.ctx.setTransform(r, 0, 0, r, 0, 0)
    this.dessiner()
  }

  dessiner(): void {
    const { ctx, largeur: W, hauteur: H } = this
    if (!W) return
    const p = this.vue.palette
    ctx.clearRect(0, 0, W, H)
    const max = Math.max(1, ...this.total)
    const w = W / this.nbCases
    const h = this.vue.h
    const periode = this.brosse
      ? [Math.min(this.brosse.debut, this.brosse.fin), Math.max(this.brosse.debut, this.brosse.fin)]
      : this.vue.filtres.etat.periode
    const xDe = (t: number) => ((t - h.dateMin) / (h.dateMax - h.dateMin)) * W
    const basB = H - 14
    for (let i = 0; i < this.nbCases; i++) {
      const ht = (this.total[i]! / max) * (basB - 4)
      const ha = (this.actifs[i]! / max) * (basB - 4)
      ctx.fillStyle = rgba(p.texteDoux, 0.18)
      ctx.fillRect(i * w + 1, basB - ht, w - 2, ht)
      ctx.fillStyle = rgba(p.accent, 0.75)
      ctx.fillRect(i * w + 1, basB - ha, w - 2, ha)
    }
    if (periode) {
      const a = xDe(periode[0]!), z = xDe(periode[1]!)
      ctx.fillStyle = rgba(p.fond, 0.7)
      ctx.fillRect(0, 0, a, basB)
      ctx.fillRect(z, 0, W - z, basB)
      ctx.strokeStyle = p.accent
      ctx.lineWidth = 1.5
      ctx.strokeRect(a, 1, Math.max(1, z - a), basB - 1)
    }
    // Repères de mois.
    ctx.fillStyle = p.texteDoux
    ctx.font = `10px ${p.police}`
    ctx.textBaseline = 'bottom'
    const d = new Date(h.dateMin)
    d.setUTCDate(1)
    d.setUTCHours(0, 0, 0, 0)
    for (d.setUTCMonth(d.getUTCMonth() + 1); d.getTime() < h.dateMax; d.setUTCMonth(d.getUTCMonth() + 1)) {
      const x = xDe(d.getTime())
      ctx.fillRect(x, basB, 1, 3)
      ctx.fillText(d.toLocaleDateString('fr-FR', { month: 'short' }), x + 2, H)
    }
  }
}
