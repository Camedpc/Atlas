// Gizmo de navigation (haut à droite) : axes X rouge / Y vert / Z bleu, bulles cliquables
// (vue depuis cet axe ; re-cliquer donne la vue opposée), glisser pour orbiter.

import type { Camera3D, NomVue } from './camera3d'
import type { Vec3 } from './maths'

interface Bulle {
  axe: 0 | 1 | 2
  signe: 1 | -1
  x: number
  y: number
  profondeur: number
}

const VUE_DEPUIS: Record<string, NomVue> = {
  '0,1': 'droite', '0,-1': 'gauche', '1,1': 'arriere', '1,-1': 'face', '2,1': 'dessus', '2,-1': 'dessous',
}
const LETTRES = ['X', 'Y', 'Z']

export class Gizmo {
  readonly element: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private taille = 92
  private bulles: Bulle[] = []
  private survol: Bulle | null = null
  private survolFond = false
  private glisse: { x: number; y: number; bouge: boolean } | null = null
  private versionDessinee = -1

  private camera: Camera3D
  private actions: { vue(nom: NomVue): void; demanderRendu(): void; sensibilite(): number }

  constructor(
    parent: HTMLElement,
    camera: Camera3D,
    actions: { vue(nom: NomVue): void; demanderRendu(): void; sensibilite(): number },
  ) {
    this.camera = camera
    this.actions = actions
    const c = (this.element = document.createElement('canvas'))
    c.className = 'atlas-gizmo'
    c.title = 'Cliquer un axe : vue depuis cet axe · glisser : orbiter'
    parent.appendChild(c)
    this.ctx = c.getContext('2d')!
    this.dimensionner()
    c.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      try {
        c.setPointerCapture(e.pointerId)
      } catch {
        // pointeur synthétique : sans capture
      }
      this.glisse = { x: e.clientX, y: e.clientY, bouge: false }
    })
    c.addEventListener('pointermove', (e) => {
      const p = this.local(e)
      if (this.glisse) {
        const dx = e.clientX - this.glisse.x, dy = e.clientY - this.glisse.y
        if (this.glisse.bouge || Math.hypot(dx, dy) > 2) {
          this.glisse.bouge = true
          const s = this.actions.sensibilite() * 1.4
          this.camera.orbiter(-dx * s, -dy * s)
          this.glisse.x = e.clientX
          this.glisse.y = e.clientY
          this.actions.demanderRendu()
        }
        return
      }
      this.survol = this.bulleSous(p.x, p.y)
      this.survolFond = Math.hypot(p.x - this.taille / 2, p.y - this.taille / 2) < this.taille / 2
      this.dessiner(true)
    })
    c.addEventListener('pointerup', (e) => {
      const g = this.glisse
      this.glisse = null
      if (!g || g.bouge) return
      const p = this.local(e)
      const b = this.bulleSous(p.x, p.y)
      if (!b) return
      let vue = VUE_DEPUIS[`${b.axe},${b.signe}`]!
      // Déjà dans cette vue : on passe à l'opposée (comme Blender).
      if (this.camera.vueCourante(2) === vue) vue = VUE_DEPUIS[`${b.axe},${-b.signe}`]!
      this.actions.vue(vue)
    })
    c.addEventListener('pointerleave', () => {
      this.survol = null
      this.survolFond = false
      this.dessiner(true)
    })
    c.addEventListener('wheel', (e) => e.stopPropagation())
  }

  private dimensionner(): void {
    const r = window.devicePixelRatio || 1
    this.element.width = this.taille * r
    this.element.height = this.taille * r
    this.element.style.width = `${this.taille}px`
    this.element.style.height = `${this.taille}px`
    this.ctx.setTransform(r, 0, 0, r, 0, 0)
  }

  private local(e: PointerEvent) {
    const r = this.element.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  private bulleSous(x: number, y: number): Bulle | null {
    // Les bulles de devant d'abord.
    for (let i = this.bulles.length - 1; i >= 0; i--) {
      const b = this.bulles[i]!
      if (Math.hypot(x - b.x, y - b.y) <= 10) return b
    }
    return null
  }

  /** Redessine si l'orientation a changé (ou si `force`). */
  dessiner(force = false): void {
    if (!force && this.versionDessinee === this.camera.version) return
    this.versionDessinee = this.camera.version
    const { ctx, taille } = this
    const style = getComputedStyle(this.element)
    const couleurs = [style.getPropertyValue('--axe-x') || '#e5484d', style.getPropertyValue('--axe-y') || '#30a46c', style.getPropertyValue('--axe-z') || '#3e63dd']
    const fond = style.getPropertyValue('--gizmo-fond') || 'rgba(0,0,0,0.06)'
    const texte = style.getPropertyValue('--gizmo-texte') || '#fff'
    ctx.clearRect(0, 0, taille, taille)
    const c = taille / 2, R = taille / 2 - 13
    if (this.survolFond || this.glisse) {
      ctx.fillStyle = fond
      ctx.beginPath()
      ctx.arc(c, c, taille / 2 - 1, 0, Math.PI * 2)
      ctx.fill()
    }
    const { droite: r, haut: u, arriere: b } = this.camera
    this.bulles = []
    for (const axe of [0, 1, 2] as const) {
      for (const signe of [1, -1] as const) {
        const e: Vec3 = [0, 0, 0]
        e[axe] = signe
        this.bulles.push({ axe, signe, x: c + (e[0] * r[0] + e[1] * r[1] + e[2] * r[2]) * R, y: c - (e[0] * u[0] + e[1] * u[1] + e[2] * u[2]) * R, profondeur: e[0] * b[0] + e[1] * b[1] + e[2] * b[2] })
      }
    }
    this.bulles.sort((a, b2) => a.profondeur - b2.profondeur)
    for (const bl of this.bulles) {
      const coul = couleurs[bl.axe]!.trim()
      const actif = this.survol === bl
      if (bl.signe > 0) {
        ctx.strokeStyle = coul
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(c, c)
        ctx.lineTo(bl.x, bl.y)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(bl.x, bl.y, bl.signe > 0 ? 8 : 6.5, 0, Math.PI * 2)
      if (bl.signe > 0) {
        ctx.fillStyle = coul
        ctx.fill()
      } else {
        ctx.globalAlpha = 0.35
        ctx.fillStyle = coul
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.strokeStyle = coul
        ctx.lineWidth = 1.2
        ctx.stroke()
      }
      if (actif) {
        ctx.strokeStyle = texte
        ctx.lineWidth = 2
        ctx.stroke()
      }
      if (bl.signe > 0 || actif) {
        ctx.fillStyle = bl.signe > 0 ? texte : coul
        ctx.font = '600 10px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText((bl.signe < 0 ? '−' : '') + LETTRES[bl.axe]!, bl.x, bl.y + 0.5)
      }
    }
  }
}
