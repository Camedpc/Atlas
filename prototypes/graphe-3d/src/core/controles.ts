// Contrôles façon Blender : souris (milieu = orbite, Maj+milieu = déplacer, molette / Ctrl+milieu = zoom),
// émulations portable (Alt+clic gauche = milieu, clic droit glissé = orbite, chiffres du haut = pavé),
// clavier, tactile (1 doigt, pincer, rotation à 2 doigts, double tape) et inertie au relâchement.

import type { Camera3D, NomVue } from './camera3d'

export interface ActionsControles {
  vue(nom: NomVue): void
  opposee(): void
  orbiterPas(axe: 'z' | 'x', angle: number): void
  basculerProjection(): void
  cadrerSelection(): void
  cadrerTout(): void
  granularite(pas: 1 | -1): void
  echap(): void
  menuRadial(x: number, y: number): void
  /** Tape tactile (x, y en pixels du conteneur). */
  tape(x: number, y: number): void
  tapeDouble(x: number, y: number): void
}

export interface ParametresControles {
  /** Radians par pixel. */
  sensibiliteOrbite: number
  /** Facteur de zoom par cran de molette (≈ 100 px de deltaY). */
  vitesseZoom: number
  /** Constante de temps de l'inertie (ms) ; 0 = pas d'inertie. */
  inertie: number
  /** Chiffres du haut du clavier = pavé numérique. */
  emulerPave: boolean
  /** Glisser au clic gauche sur le fond. */
  glisserGauche: 'deplacer' | 'orbiter' | 'rien'
}

type Geste = 'orbiter' | 'deplacer' | 'zoom'
interface Inertie {
  geste: Geste | 'rotation'
  vx: number
  vy: number
}

const PAS_ORBITE = (15 * Math.PI) / 180

export class Controles {
  /** Dernière position connue du pointeur (pixels du conteneur). */
  readonly souris = { x: 0, y: 0, dedans: false }
  /** Vrai pendant un geste (glisser, pincer). */
  enGeste = false
  /** Instant du dernier glisser effectif : sert à ignorer le « clic » qui le termine. */
  dernierGlisser = 0
  dernierTactile = 0

  private geste: Geste | null = null
  private depart = { x: 0, y: 0 }
  private precedent = { x: 0, y: 0, t: 0 }
  private vitesse = { x: 0, y: 0 }
  private deplace = false
  private inertie: Inertie | null = null
  private doigts = new Map<number, { x: number; y: number }>()
  private pince = { cx: 0, cy: 0, dist: 0, angle: 0 }
  private tapeDebut = { x: 0, y: 0, t: 0 }
  private derniereTape = { x: 0, y: 0, t: 0 }
  private nettoyages: (() => void)[] = []

  constructor(
    private element: HTMLElement,
    private camera: Camera3D,
    private actions: ActionsControles,
    private params: () => ParametresControles,
    private demanderRendu: () => void,
  ) {
    element.style.touchAction = 'none'
    this.ecouter(element, 'pointerdown', (e) => this.surAppui(e as PointerEvent))
    this.ecouter(window, 'pointermove', (e) => this.surMouvement(e as PointerEvent))
    this.ecouter(window, 'pointerup', (e) => this.surRelache(e as PointerEvent))
    this.ecouter(window, 'pointercancel', (e) => this.surRelache(e as PointerEvent))
    this.ecouter(element, 'wheel', (e) => this.surMolette(e as WheelEvent), { passive: false })
    this.ecouter(element, 'contextmenu', (e) => e.preventDefault())
    this.ecouter(element, 'auxclick', (e) => e.preventDefault())
    this.ecouter(element, 'pointerleave', () => (this.souris.dedans = false))
    this.ecouter(window, 'keydown', (e) => this.surTouche(e as KeyboardEvent))
  }

  private ecouter(cible: EventTarget, type: string, f: (e: Event) => void, options?: AddEventListenerOptions): void {
    cible.addEventListener(type, f, options)
    this.nettoyages.push(() => cible.removeEventListener(type, f, options))
  }

  detruire(): void {
    this.nettoyages.forEach((f) => f())
  }

  private local(e: { clientX: number; clientY: number }) {
    const r = this.element.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  // ─── Souris / stylet ──────────────────────────────────────────────────────

  private surAppui(e: PointerEvent): void {
    this.inertie = null
    if (e.pointerType === 'touch') return this.appuiTactile(e)
    const p = this.local(e)
    const milieu = e.button === 1 || (e.button === 0 && e.altKey)
    let geste: Geste | null = null
    const troisD = !this.camera.verrou2D
    if (milieu) geste = e.ctrlKey ? 'zoom' : e.shiftKey ? 'deplacer' : troisD ? 'orbiter' : 'deplacer'
    else if (e.button === 2) geste = e.shiftKey ? 'deplacer' : troisD ? 'orbiter' : 'deplacer'
    else if (e.button === 0) {
      const g = this.params().glisserGauche
      geste = g === 'rien' ? null : g === 'orbiter' && troisD ? 'orbiter' : 'deplacer'
    }
    if (!geste) return
    if (e.button === 1) e.preventDefault()
    this.geste = geste
    this.enGeste = true
    this.deplace = false
    this.depart = p
    this.precedent = { ...p, t: e.timeStamp }
    this.vitesse = { x: 0, y: 0 }
  }

  private surMouvement(e: PointerEvent): void {
    if (e.pointerType === 'touch') return this.mouvementTactile(e)
    const p = this.local(e)
    this.souris.x = p.x
    this.souris.y = p.y
    this.souris.dedans = true
    if (!this.geste) return
    const dx = p.x - this.precedent.x, dy = p.y - this.precedent.y
    if (!this.deplace && Math.hypot(p.x - this.depart.x, p.y - this.depart.y) < 3) return
    this.deplace = true
    this.appliquer(this.geste, dx, dy)
    this.suivreVitesse(dx, dy, e.timeStamp)
    this.precedent = { ...p, t: e.timeStamp }
  }

  private surRelache(e: PointerEvent): void {
    if (e.pointerType === 'touch') return this.relacheTactile(e)
    if (!this.geste) return
    if (this.deplace) {
      this.dernierGlisser = performance.now()
      this.lancerInertie(this.geste, e.timeStamp)
    }
    this.geste = null
    this.enGeste = false
  }

  private appliquer(geste: Geste | 'rotation', dx: number, dy: number): void {
    const s = this.params().sensibiliteOrbite
    if (geste === 'orbiter') this.camera.orbiter(-dx * s, -dy * s)
    else if (geste === 'deplacer') this.camera.deplacerPixels(dx, dy)
    else if (geste === 'zoom') this.camera.zoomer(Math.exp(-dy * 0.006), this.depart.x, this.depart.y)
    else this.camera.tournerZ(dx)
    this.demanderRendu()
  }

  private suivreVitesse(dx: number, dy: number, t: number): void {
    const dt = Math.max(1, t - this.precedent.t)
    this.vitesse.x = this.vitesse.x * 0.6 + (dx / dt) * 0.4
    this.vitesse.y = this.vitesse.y * 0.6 + (dy / dt) * 0.4
  }

  private lancerInertie(geste: Geste | 'rotation', t: number): void {
    if (this.params().inertie <= 0 || t - this.precedent.t > 80) return
    if (Math.hypot(this.vitesse.x, this.vitesse.y) < 0.02) return
    this.inertie = { geste, vx: this.vitesse.x, vy: this.vitesse.y }
    this.demanderRendu()
  }

  /** Avance l'inertie ; renvoie vrai tant qu'elle bouge. */
  mettreAJour(dt: number): boolean {
    const i = this.inertie
    if (!i) return false
    const tau = this.params().inertie
    this.appliquer(i.geste, i.vx * dt, i.vy * dt)
    const k = Math.exp(-dt / Math.max(1, tau))
    i.vx *= k
    i.vy *= k
    if (Math.hypot(i.vx, i.vy) < 0.004) this.inertie = null
    return this.inertie !== null
  }

  arreterInertie(): void {
    this.inertie = null
  }

  private surMolette(e: WheelEvent): void {
    e.preventDefault()
    this.inertie = null
    const p = this.local(e)
    const unite = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1
    const delta = e.deltaY * unite
    this.camera.zoomer(Math.pow(this.params().vitesseZoom, -delta / 100), p.x, p.y)
    this.demanderRendu()
  }

  // ─── Tactile ──────────────────────────────────────────────────────────────

  private appuiTactile(e: PointerEvent): void {
    const p = this.local(e)
    this.doigts.set(e.pointerId, p)
    this.dernierTactile = performance.now()
    this.enGeste = true
    this.deplace = false
    this.precedent = { ...p, t: e.timeStamp }
    this.vitesse = { x: 0, y: 0 }
    if (this.doigts.size === 1) this.tapeDebut = { ...p, t: e.timeStamp }
    if (this.doigts.size === 2) this.initPince()
  }

  private initPince(): void {
    const [a, b] = [...this.doigts.values()] as [{ x: number; y: number }, { x: number; y: number }]
    this.pince = { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, dist: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) }
    this.deplace = true
  }

  private mouvementTactile(e: PointerEvent): void {
    if (!this.doigts.has(e.pointerId)) return
    const p = this.local(e)
    this.doigts.set(e.pointerId, p)
    if (this.doigts.size === 1) {
      const dx = p.x - this.precedent.x, dy = p.y - this.precedent.y
      if (!this.deplace && Math.hypot(p.x - this.tapeDebut.x, p.y - this.tapeDebut.y) < 8) return
      this.deplace = true
      this.appliquer(this.camera.verrou2D ? 'deplacer' : 'orbiter', dx, dy)
      this.suivreVitesse(dx, dy, e.timeStamp)
      this.precedent = { ...p, t: e.timeStamp }
    } else if (this.doigts.size >= 2) {
      const [a, b] = [...this.doigts.values()] as [{ x: number; y: number }, { x: number; y: number }]
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2
      const dist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))
      const angle = Math.atan2(b.y - a.y, b.x - a.x)
      this.camera.deplacerPixels(cx - this.pince.cx, cy - this.pince.cy)
      this.camera.zoomer(dist / this.pince.dist, cx, cy)
      let da = angle - this.pince.angle
      if (da > Math.PI) da -= 2 * Math.PI
      if (da < -Math.PI) da += 2 * Math.PI
      if (!this.camera.verrou2D) this.camera.tournerZ(-da)
      this.pince = { cx, cy, dist, angle }
      this.demanderRendu()
    }
  }

  private relacheTactile(e: PointerEvent): void {
    if (!this.doigts.has(e.pointerId)) return
    const nb = this.doigts.size
    this.doigts.delete(e.pointerId)
    this.dernierTactile = performance.now()
    const p = this.local(e)
    if (nb === 1) {
      this.enGeste = false
      if (!this.deplace && e.timeStamp - this.tapeDebut.t < 350) {
        const d = this.derniereTape
        if (e.timeStamp - d.t < 320 && Math.hypot(p.x - d.x, p.y - d.y) < 30) {
          this.actions.tapeDouble(p.x, p.y)
          this.derniereTape = { x: 0, y: 0, t: 0 }
        } else {
          this.actions.tape(p.x, p.y)
          this.derniereTape = { ...p, t: e.timeStamp }
        }
      } else if (this.deplace) {
        this.dernierGlisser = performance.now()
        this.lancerInertie(this.camera.verrou2D ? 'deplacer' : 'orbiter', e.timeStamp)
      }
    } else if (this.doigts.size === 1) {
      // On repasse à un doigt : repartir de sa position actuelle.
      const [reste] = [...this.doigts.values()] as [{ x: number; y: number }]
      this.precedent = { ...reste, t: e.timeStamp }
      this.vitesse = { x: 0, y: 0 }
    } else if (this.doigts.size >= 2) this.initPince()
  }

  // ─── Clavier ──────────────────────────────────────────────────────────────

  private surTouche(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) {
      if (e.key === 'Escape') t.blur()
      return
    }
    const a = this.actions
    let chiffre: number | null = null
    const m = /^(Numpad|Digit)(\d)$/.exec(e.code)
    if (m && (m[1] === 'Numpad' || this.params().emulerPave)) chiffre = Number(m[2])
    const inverse = e.ctrlKey || e.altKey
    let traite = true
    if (chiffre !== null) {
      switch (chiffre) {
        case 1: a.vue(inverse ? 'arriere' : 'face'); break
        case 3: a.vue(inverse ? 'gauche' : 'droite'); break
        case 7: a.vue(inverse ? 'dessous' : 'dessus'); break
        case 9: a.opposee(); break
        case 5: a.basculerProjection(); break
        case 4: a.orbiterPas('z', -PAS_ORBITE); break
        case 6: a.orbiterPas('z', PAS_ORBITE); break
        case 8: a.orbiterPas('x', -PAS_ORBITE); break
        case 2: a.orbiterPas('x', PAS_ORBITE); break
        default: traite = false
      }
    } else if (e.code === 'NumpadDecimal' || e.key === '.') a.cadrerSelection()
    else if (e.code === 'Home') a.cadrerTout()
    else if (e.key === '[' || e.code === 'BracketLeft') a.granularite(-1)
    else if (e.key === ']' || e.code === 'BracketRight') a.granularite(1)
    else if (e.key === 'Escape') a.echap()
    else if (e.code === 'Backquote') a.menuRadial(this.souris.dedans ? this.souris.x : this.element.clientWidth / 2, this.souris.dedans ? this.souris.y : this.element.clientHeight / 2)
    else traite = false
    if (traite) {
      e.preventDefault()
      this.demanderRendu()
    }
  }
}
