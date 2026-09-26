// Mini-carte (en bas à gauche) : toute la carte vue sous l'orientation courante, rectangle de la
// vue, épingle de la sélection. Cliquer / glisser déplace la vue ; la molette zoome.
// Pied : niveau affiché, facteur de zoom et bascule automatique / manuel du zoom sémantique.

import { el, rgba, type VueGraphe } from '../../src/core'
import type { Carte } from './carte'
import type { ZoomSemantique } from './zoom'

const L = 208
const H = 132

export class MiniCarte {
  readonly element: HTMLElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private fond: HTMLCanvasElement
  private cle = ''
  /** Transformation monde (repère caméra droite/haut) → mini-carte. */
  private s = 1
  private ox = 0
  private oy = 0
  private texteNiveau: HTMLElement
  private texteZoom: HTMLElement
  private puceAuto: HTMLButtonElement
  private versionFiltres = 0
  private glisse = false

  constructor(parent: HTMLElement, private vue: VueGraphe, private carte: Carte, private zoom: ZoomSemantique) {
    this.canvas = el('canvas', { class: 'v2-mini-canvas', 'aria-label': 'Mini-carte : cliquer pour déplacer la vue' })
    const r = window.devicePixelRatio || 1
    this.canvas.width = L * r
    this.canvas.height = H * r
    this.canvas.style.width = `${L}px`
    this.canvas.style.height = `${H}px`
    this.ctx = this.canvas.getContext('2d')!
    this.fond = document.createElement('canvas')
    this.fond.width = L * r
    this.fond.height = H * r
    this.texteNiveau = el('span', { class: 'v2-mini-niveau' })
    this.texteZoom = el('span', { class: 'v2-mini-zoom' })
    this.puceAuto = el('button', { class: 'v2-mini-auto', type: 'button', title: 'Zoom sémantique : la granularité suit le zoom (cliquer pour basculer automatique / manuel)' })
    this.puceAuto.addEventListener('click', () => zoom.definirMode(zoom.mode === 'manuel' ? 'paliers' : 'manuel'))
    // data-zone-sure : le cadrage du moteur évite la mini-carte.
    this.element = el('div', { class: 'v2-mini', 'data-zone-sure': '' }, this.canvas, el('div', { class: 'v2-mini-pied' }, this.texteNiveau, this.texteZoom, this.puceAuto))
    parent.appendChild(this.element)

    this.canvas.addEventListener('pointerdown', (e) => {
      this.canvas.setPointerCapture(e.pointerId)
      this.glisse = false
      this.centrerSur(e, true)
    })
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.canvas.hasPointerCapture(e.pointerId)) return
      this.glisse = true
      this.centrerSur(e, false)
    })
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      const k = vue.reglages.valeurs.vitesseZoom
      vue.camera.zoomer(Math.pow(k, -e.deltaY / 100))
      vue.demanderRendu()
    }, { passive: false })

    vue.on('image', () => this.dessiner())
    vue.on('theme', () => { this.cle = ''; this.dessiner() })
    vue.on('filtres', () => { this.versionFiltres++; this.dessiner() })
    vue.on('reglage', ({ cle }) => cle === 'zoomSemantique' && this.dessiner())
    this.dessiner()
  }

  afficher(oui: boolean): void {
    this.element.style.display = oui ? '' : 'none'
  }

  private centrerSur(e: PointerEvent, anime: boolean): void {
    const b = this.canvas.getBoundingClientRect()
    const mx = e.clientX - b.left, my = e.clientY - b.top
    const cam = this.vue.camera
    const pr = (mx - this.ox) / this.s, pu = (this.oy - my) / this.s
    const c = cam.cible, d = cam.droite, h = cam.haut
    const cr = c[0] * d[0] + c[1] * d[1] + c[2] * d[2]
    const cu = c[0] * h[0] + c[1] * h[1] + c[2] * h[2]
    const cible: [number, number, number] = [
      c[0] + d[0] * (pr - cr) + h[0] * (pu - cu),
      c[1] + d[1] * (pr - cr) + h[1] * (pu - cu),
      c[2] + d[2] * (pr - cr) + h[2] * (pu - cu),
    ]
    if (anime && !this.glisse) cam.animerVers({ cible }, 260)
    else {
      cam.cible = cible
      cam.version++
    }
    this.vue.demanderRendu()
  }

  /** Fond (points colorés par domaine), recalculé seulement si l'orientation, le thème ou les filtres changent. */
  private preparerFond(): void {
    const v = this.vue
    const cam = v.camera
    const d = cam.droite, h = cam.haut
    const cle = `${d.map((x) => x.toFixed(3))}|${h.map((x) => x.toFixed(3))}|${v.reglages.valeurs.theme}|${v.reglages.valeurs.mode3D}|${this.versionFiltres}`
    if (cle === this.cle) return
    this.cle = cle
    const { h: hi, filtres } = v
    const base = v.positionsBase
    const n = hi.nF
    const pr = new Float32Array(n), pu = new Float32Array(n)
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (let f = 0; f < n; f++) {
      const x = base[f * 3]!, y = base[f * 3 + 1]!, z = base[f * 3 + 2]!
      pr[f] = x * d[0] + y * d[1] + z * d[2]
      pu[f] = x * h[0] + y * h[1] + z * h[2]
      if (pr[f]! < x0) x0 = pr[f]!
      if (pr[f]! > x1) x1 = pr[f]!
      if (pu[f]! < y0) y0 = pu[f]!
      if (pu[f]! > y1) y1 = pu[f]!
    }
    const marge = 10
    this.s = Math.min((L - 2 * marge) / Math.max(1e-6, x1 - x0), (H - 2 * marge) / Math.max(1e-6, y1 - y0))
    this.ox = L / 2 - (this.s * (x0 + x1)) / 2
    this.oy = H / 2 + (this.s * (y0 + y1)) / 2
    const r = window.devicePixelRatio || 1
    const c = this.fond.getContext('2d')!
    c.setTransform(r, 0, 0, r, 0, 0)
    c.clearRect(0, 0, L, H)
    // Terres : disques doux par domaine, puis points.
    const nD = hi.domaines.length
    const terres = Array.from({ length: nD }, () => new Path2D())
    const points = Array.from({ length: nD }, () => new Path2D())
    for (let f = 0; f < n; f++) {
      const actif = filtres.actives[f] === 1
      const k = hi.categories[hi.chaine[f * 3]!]!.domaine % nD
      const x = this.ox + pr[f]! * this.s, y = this.oy - pu[f]! * this.s
      terres[k]!.moveTo(x + 5, y)
      terres[k]!.arc(x, y, 5, 0, Math.PI * 2)
      if (actif) {
        points[k]!.moveTo(x + 1, y)
        points[k]!.arc(x, y, 1, 0, Math.PI * 2)
      }
    }
    hi.domaines.forEach((dom, k) => {
      c.fillStyle = rgba(this.carte.teintes[dom]!, 0.2)
      c.fill(terres[k]!)
    })
    hi.domaines.forEach((dom, k) => {
      c.fillStyle = rgba(this.carte.teintesTrait[dom]!, 0.75)
      c.fill(points[k]!)
    })
  }

  private etatPied = ''

  dessiner(): void {
    if (this.element.style.display === 'none') return
    this.preparerFond()
    const v = this.vue
    const { palette, camera: cam } = v
    const r = window.devicePixelRatio || 1
    const c = this.ctx
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, this.canvas.width, this.canvas.height)
    c.drawImage(this.fond, 0, 0)
    c.setTransform(r, 0, 0, r, 0, 0)
    // Rectangle de la vue (dans le plan de la cible).
    const k = cam.pixelsParUnite()
    const d = cam.droite, h = cam.haut, ci = cam.cible
    const cr = ci[0] * d[0] + ci[1] * d[1] + ci[2] * d[2]
    const cu = ci[0] * h[0] + ci[1] * h[1] + ci[2] * h[2]
    const hw = cam.largeur / 2 / k, hh = cam.hauteur / 2 / k
    const x = this.ox + (cr - hw) * this.s, y = this.oy - (cu + hh) * this.s
    const w = 2 * hw * this.s, hr = 2 * hh * this.s
    const voile = new Path2D()
    voile.rect(0, 0, L, H)
    voile.rect(x, y, w, hr)
    c.fillStyle = rgba(palette.fond, 0.5)
    c.fill(voile, 'evenodd')
    c.strokeStyle = palette.accent
    c.lineWidth = 1.5
    c.strokeRect(x, y, w, hr)
    if (w < 6 && hr < 6) {
      // Vue très zoomée : une croix de repérage.
      c.beginPath()
      c.moveTo(x + w / 2 - 7, y + hr / 2)
      c.lineTo(x + w / 2 + 7, y + hr / 2)
      c.moveTo(x + w / 2, y + hr / 2 - 7)
      c.lineTo(x + w / 2, y + hr / 2 + 7)
      c.stroke()
    }
    // Épingle de la sélection et point survolé.
    const pin = (u: number, couleur: string, rayon: number) => {
      const p = v.positions
      const px = p[u * 3]!, py = p[u * 3 + 1]!, pz = p[u * 3 + 2]!
      const mx = this.ox + (px * d[0] + py * d[1] + pz * d[2]) * this.s
      const my = this.oy - (px * h[0] + py * h[1] + pz * h[2]) * this.s
      c.beginPath()
      c.arc(mx, my, rayon, 0, Math.PI * 2)
      c.fillStyle = rgba(palette.fond, 0.9)
      c.fill()
      c.lineWidth = 2
      c.strokeStyle = couleur
      c.stroke()
    }
    if (v.lignee.selection !== null) pin(v.lignee.selection, palette.accent, 3.5)
    if (v.survol !== null && v.survol !== v.lignee.selection) pin(v.survol, palette.texte, 2.5)

    const mode = this.zoom.mode
    const etat = `${this.zoom.libelle()}|${this.zoom.facteur().toFixed(1)}|${mode}`
    if (etat !== this.etatPied) {
      this.etatPied = etat
      this.texteNiveau.textContent = this.zoom.libelle()
      this.texteZoom.textContent = `×${this.zoom.facteur().toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}`
      this.puceAuto.textContent = mode === 'manuel' ? 'manuel' : mode === 'continu' ? 'auto · continu' : 'auto'
      this.puceAuto.classList.toggle('actif', mode !== 'manuel')
    }
  }
}
