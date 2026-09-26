// Caméra orbitale façon Blender : cible, orientation (quaternion), distance, projection
// orthographique ↔ perspective interpolée graduellement, vues animées et cadrage.
//
// Repère caméra (OpenGL) : x = droite, y = haut, la caméra regarde vers −z.
// L'œil est placé en cible + arrière × distance.

import { COURBES, type Courbe } from './anim'
import { clamp, quat, smoothstep, vec, type Quat, type Vec3 } from './maths'

/** Marges d'interface en pixels (zone sûre). */
export interface Marges {
  haut: number
  bas: number
  gauche: number
  droite: number
}

export const NOMS_VUES = ['dessus', 'dessous', 'face', 'arriere', 'droite', 'gauche', 'iso'] as const
export type NomVue = (typeof NOMS_VUES)[number]
export type ModeProjection = 'auto' | 'ortho' | 'persp'

const RX90 = quat.axeAngle([1, 0, 0], Math.PI / 2)
export const ORIENTATIONS: Record<NomVue, Quat> = {
  dessus: quat.identite(),
  dessous: quat.axeAngle([1, 0, 0], Math.PI),
  face: RX90,
  arriere: quat.multiplier(quat.axeAngle([0, 0, 1], Math.PI), RX90),
  droite: quat.multiplier(quat.axeAngle([0, 0, 1], Math.PI / 2), RX90),
  gauche: quat.multiplier(quat.axeAngle([0, 0, 1], -Math.PI / 2), RX90),
  iso: quat.regarderDepuis([1, -1, 0.9]),
}
export const LIBELLES_VUES: Record<NomVue, string> = {
  dessus: 'Dessus', dessous: 'Dessous', face: 'Face', arriere: 'Arrière', droite: 'Droite', gauche: 'Gauche', iso: 'Isométrique',
}
const OPPOSEES: Partial<Record<NomVue, NomVue>> = {
  dessus: 'dessous', dessous: 'dessus', face: 'arriere', arriere: 'face', droite: 'gauche', gauche: 'droite',
}

/** Résultat de projection, réutilisé d'une image à l'autre (tableaux typés). */
export class Projection {
  readonly x: Float32Array
  readonly y: Float32Array
  /** Distance à l'œil le long de la visée. */
  readonly profondeur: Float32Array
  /** Facteur d'échelle perspective (1 au plan de la cible). */
  readonly echelle: Float32Array
  readonly visible: Uint8Array
  profMin = 0
  profMax = 1
  constructor(readonly n: number) {
    this.x = new Float32Array(n)
    this.y = new Float32Array(n)
    this.profondeur = new Float32Array(n)
    this.echelle = new Float32Array(n)
    this.visible = new Uint8Array(n)
  }
  /** Profondeur normalisée dans [0, 1] (0 = le plus proche). */
  profondeurNormalisee(i: number): number {
    const e = this.profMax - this.profMin
    return e > 1e-9 ? (this.profondeur[i]! - this.profMin) / e : 0
  }
}

interface AnimCamera {
  q0: Quat; q1: Quat
  c0: Vec3; c1: Vec3
  d0: number; d1: number
  debut: number
  duree: number
  courbe: Courbe
}

export class Camera3D {
  cible: Vec3 = [0, 0, 0]
  orientation: Quat = quat.identite()
  distance = 3
  /** Champ de vision vertical en degrés. */
  champVision = 35
  mode: ModeProjection = 'auto'
  /** Mode 2D : pas d'orbite, projection orthographique. */
  verrou2D = false
  /** Facteur perspective affiché, 0 = ortho, 1 = perspective. */
  perspective = 0
  /** Constante de temps du lissage ortho ↔ persp (ms). */
  lissagePerspective = 140
  distanceMin = 0.02
  distanceMax = 60
  largeur = 1
  hauteur = 1
  /** Incrémentée à chaque changement : sert à savoir s'il faut reprojeter. */
  version = 0
  /** Courbe par défaut des animations de caméra (vues, cadrage, orbite par pas). */
  courbeAnimations: Courbe = COURBES.sortie

  droite: Vec3 = [1, 0, 0]
  haut: Vec3 = [0, 1, 0]
  arriere: Vec3 = [0, 0, 1]
  private anim: AnimCamera | null = null

  constructor() {
    this.majBase()
  }

  private majBase(): void {
    this.droite = quat.tourner(this.orientation, [1, 0, 0])
    this.haut = quat.tourner(this.orientation, [0, 1, 0])
    this.arriere = quat.tourner(this.orientation, [0, 0, 1])
    this.version++
  }

  /** Oriente immédiatement la caméra (sans animation). */
  definirOrientation(q: Quat): void {
    this.anim = null
    this.orientation = quat.normaliser(q)
    this.majBase()
  }

  /** Direction de visée (monde). */
  get avant(): Vec3 {
    return [-this.arriere[0], -this.arriere[1], -this.arriere[2]]
  }

  get enAnimation(): boolean {
    return this.anim !== null
  }

  /** Pixels par unité monde au plan de la cible. */
  pixelsParUnite(): number {
    return this.hauteur / 2 / (this.distance * Math.tan((this.champVision * Math.PI) / 360))
  }

  /** Angle entre la visée et l'axe le plus proche (radians). */
  angleAxe(): number {
    const a = this.avant
    return Math.acos(clamp(Math.max(Math.abs(a[0]), Math.abs(a[1]), Math.abs(a[2])), 0, 1))
  }

  /** Vue nommée courante si la caméra y est alignée (à 0,5° près). */
  vueCourante(tolerance = 0.5): NomVue | null {
    for (const nom of NOMS_VUES) if (quat.angle(this.orientation, ORIENTATIONS[nom]) < (tolerance * Math.PI) / 180) return nom
    return null
  }

  /** Facteur perspective visé : auto = graduel selon l'écart à l'axe (façon Blender). */
  perspectiveVisee(): number {
    if (this.verrou2D || this.mode === 'ortho') return 0
    if (this.mode === 'persp') return 1
    return smoothstep(0.01, 0.26, this.angleAxe())
  }

  redimensionner(largeur: number, hauteur: number): void {
    this.largeur = Math.max(1, largeur)
    this.hauteur = Math.max(1, hauteur)
    this.version++
  }

  /** Avance animation + lissage perspective. Renvoie vrai si la caméra bouge encore. */
  mettreAJour(maintenant: number, dt: number): boolean {
    let bouge = false
    if (this.anim) {
      const a = this.anim
      const brut = clamp((maintenant - a.debut) / a.duree, 0, 1)
      const t = a.courbe(brut)
      this.orientation = quat.slerp(a.q0, a.q1, t)
      this.cible = vec.lerp(a.c0, a.c1, t)
      // Distance interpolée en log pour un zoom perçu régulier.
      this.distance = Math.exp(Math.log(a.d0) + (Math.log(a.d1) - Math.log(a.d0)) * t)
      this.majBase()
      if (brut >= 1) this.anim = null
      bouge = true
    }
    const visee = this.perspectiveVisee()
    const ecart = visee - this.perspective
    if (Math.abs(ecart) > 0.0015) {
      this.perspective += ecart * (1 - Math.exp(-dt / this.lissagePerspective))
      this.version++
      bouge = true
    } else if (ecart !== 0) {
      this.perspective = visee
      this.version++
    }
    return bouge
  }

  // ─── Animations ────────────────────────────────────────────────────────────

  animerVers(cible: { orientation?: Quat; cible?: Vec3; distance?: number }, duree = 450, courbe: Courbe = this.courbeAnimations): void {
    const fin = this.anim
    this.anim = {
      q0: this.orientation,
      q1: cible.orientation ?? fin?.q1 ?? this.orientation,
      c0: this.cible,
      c1: cible.cible ?? fin?.c1 ?? this.cible,
      d0: this.distance,
      d1: clamp(cible.distance ?? fin?.d1 ?? this.distance, this.distanceMin, this.distanceMax),
      debut: performance.now(),
      duree: Math.max(1, duree),
      courbe,
    }
    this.version++
  }

  /** Orientation visée (celle de fin d'animation si une animation est en cours). */
  get orientationVisee(): Quat {
    return this.anim?.q1 ?? this.orientation
  }

  allerVue(nom: NomVue, duree = 450): void {
    if (this.mode !== 'auto' && nom !== 'iso') this.mode = 'auto'
    this.animerVers({ orientation: ORIENTATIONS[nom] }, duree)
  }

  /** Vue opposée (pavé 9). */
  opposee(duree = 450): void {
    const courante = this.vueDe(this.orientationVisee)
    const opp = courante && OPPOSEES[courante]
    if (opp) return this.allerVue(opp, duree)
    const q = this.orientationVisee
    const haut = quat.tourner(q, [0, 1, 0])
    this.animerVers({ orientation: quat.normaliser(quat.multiplier(quat.axeAngle(haut, Math.PI), q)) }, duree)
  }

  private vueDe(q: Quat): NomVue | null {
    for (const nom of NOMS_VUES) if (quat.angle(q, ORIENTATIONS[nom]) < 0.01) return nom
    return null
  }

  /** Orbite par pas (pavé 2/4/6/8) : autour de Z monde ('z') ou de l'axe droite de la vue ('x'). */
  orbiterPas(axe: 'z' | 'x', angle: number, duree = 220): void {
    if (this.verrou2D) return
    const q = this.orientationVisee
    const ax: Vec3 = axe === 'z' ? [0, 0, 1] : quat.tourner(q, [1, 0, 0])
    this.animerVers({ orientation: quat.normaliser(quat.multiplier(quat.axeAngle(ax, angle), q)) }, duree)
  }

  /** Bascule ortho / perspective (pavé 5). */
  basculerProjection(): void {
    this.mode = this.perspective >= 0.5 ? 'ortho' : 'persp'
    this.version++
  }

  // ─── Gestes immédiats (contrôles) ─────────────────────────────────────────

  /** Un geste de l'utilisateur interrompt l'animation en cours (l'état courant est conservé). */
  private interrompre(): void {
    this.anim = null
  }

  /** Orbite type « turntable » : azimut autour de Z monde, élévation autour de la droite de vue. */
  orbiter(dAzimut: number, dElevation: number): void {
    if (this.verrou2D) return
    this.interrompre()
    const qz = quat.axeAngle([0, 0, 1], dAzimut)
    const qx = quat.axeAngle(this.droite, dElevation)
    this.orientation = quat.normaliser(quat.multiplier(qz, quat.multiplier(qx, this.orientation)))
    this.majBase()
  }

  /** Rotation autour de Z monde (rotation à deux doigts). */
  tournerZ(angle: number): void {
    if (this.verrou2D) return
    this.interrompre()
    this.orientation = quat.normaliser(quat.multiplier(quat.axeAngle([0, 0, 1], angle), this.orientation))
    this.majBase()
  }

  /** Déplace la vue de (dx, dy) pixels écran. */
  deplacerPixels(dx: number, dy: number): void {
    this.interrompre()
    const k = this.pixelsParUnite()
    const r = this.droite, u = this.haut
    this.cible = [
      this.cible[0] - (r[0] * dx) / k + (u[0] * dy) / k,
      this.cible[1] - (r[1] * dx) / k + (u[1] * dy) / k,
      this.cible[2] - (r[2] * dx) / k + (u[2] * dy) / k,
    ]
    this.version++
  }

  /** Zoom d'un facteur (>1 = rapproche) vers le point écran (sx, sy). */
  zoomer(facteur: number, sx = this.largeur / 2, sy = this.hauteur / 2): void {
    this.interrompre()
    const nouvelle = clamp(this.distance / facteur, this.distanceMin, this.distanceMax)
    const f = nouvelle / this.distance
    const k = this.pixelsParUnite()
    const dx = (sx - this.largeur / 2) / k
    const dy = -(sy - this.hauteur / 2) / k
    // Le point sous le curseur (plan de la cible) reste fixe.
    const r = this.droite, u = this.haut
    const px = this.cible[0] + r[0] * dx + u[0] * dy
    const py = this.cible[1] + r[1] * dx + u[1] * dy
    const pz = this.cible[2] + r[2] * dx + u[2] * dy
    this.cible = [px + (this.cible[0] - px) * f, py + (this.cible[1] - py) * f, pz + (this.cible[2] - pz) * f]
    this.distance = nouvelle
    this.version++
  }

  /**
   * Cadre un ensemble de points (positions 3 × n ; indices facultatifs).
   * `zone` : marges d'interface en pixels ; le contenu est centré dans la zone restante.
   */
  cadrer(positions: Float32Array, indices?: Iterable<number> | null, duree = 450, marge = 1.3, zone?: Partial<Marges>): void {
    const q = this.orientationVisee
    const r = quat.tourner(q, [1, 0, 0]), u = quat.tourner(q, [0, 1, 0]), b = quat.tourner(q, [0, 0, 1])
    let minR = Infinity, maxR = -Infinity, minU = Infinity, maxU = -Infinity, sommeB = 0, n = 0
    const prendre = (i: number) => {
      const x = positions[i * 3]!, y = positions[i * 3 + 1]!, z = positions[i * 3 + 2]!
      const pr = x * r[0] + y * r[1] + z * r[2]
      const pu = x * u[0] + y * u[1] + z * u[2]
      if (pr < minR) minR = pr
      if (pr > maxR) maxR = pr
      if (pu < minU) minU = pu
      if (pu > maxU) maxU = pu
      sommeB += x * b[0] + y * b[1] + z * b[2]
      n++
    }
    if (indices) for (const i of indices) prendre(i)
    else for (let i = 0; i < positions.length / 3; i++) prendre(i)
    if (n === 0) return
    const W = this.largeur, H = this.hauteur
    const g = zone?.gauche ?? 0, d = zone?.droite ?? 0, h = zone?.haut ?? 0, ba = zone?.bas ?? 0
    const Wz = Math.max(W * 0.25, W - g - d), Hz = Math.max(H * 0.25, H - h - ba)
    const cr = (minR + maxR) / 2, cu = (minU + maxU) / 2, cb = sommeB / n
    const demiL = Math.max(0.04, (maxR - minR) / 2), demiH = Math.max(0.04, (maxU - minU) / 2)
    // Demi-hauteur visible (plan de la cible) nécessaire pour que le contenu tienne dans la zone.
    const demi = Math.max((demiH * H) / Hz, (demiL * H) / Wz) * marge
    const tan = Math.tan((this.champVision * Math.PI) / 360)
    const distance = demi / tan
    // Décalage pour centrer le contenu dans la zone (pixels → unités monde au plan de la cible).
    const k = H / 2 / demi
    const ox = (g - d) / 2 / k, oy = (h - ba) / 2 / k
    const cx = cr - ox, cy = cu + oy
    const cible: Vec3 = [r[0] * cx + u[0] * cy + b[0] * cb, r[1] * cx + u[1] * cy + b[1] * cb, r[2] * cx + u[2] * cy + b[2] * cb]
    this.animerVers({ cible, distance }, duree)
  }

  // ─── Projection ───────────────────────────────────────────────────────────

  /** Projette n points (3 × n) vers l'écran (pixels CSS, origine en haut à gauche). */
  projeter(positions: Float32Array, sortie: Projection): void {
    const k = this.pixelsParUnite()
    const W2 = this.largeur / 2, H2 = this.hauteur / 2
    const [rx, ry, rz] = this.droite
    const [ux, uy, uz] = this.haut
    const [bx, by, bz] = this.arriere
    const [cx, cy, cz] = this.cible
    const d = this.distance
    const p = this.perspective
    const proche = d * 0.04
    let pMin = Infinity, pMax = -Infinity
    for (let i = 0; i < sortie.n; i++) {
      const qx = positions[i * 3]! - cx, qy = positions[i * 3 + 1]! - cy, qz = positions[i * 3 + 2]! - cz
      const xc = qx * rx + qy * ry + qz * rz
      const yc = qx * ux + qy * uy + qz * uz
      const zc = d - (qx * bx + qy * by + qz * bz)
      let s = 1
      let visible = 1
      if (p > 0) {
        if (zc <= proche) {
          visible = 0
          s = 0
        } else s = 1 + p * (d / zc - 1)
      }
      sortie.x[i] = W2 + xc * s * k
      sortie.y[i] = H2 - yc * s * k
      sortie.profondeur[i] = zc
      sortie.echelle[i] = s
      sortie.visible[i] = visible
      if (zc < pMin) pMin = zc
      if (zc > pMax) pMax = zc
    }
    sortie.profMin = pMin
    sortie.profMax = pMax
  }

  /** Projette un point isolé. */
  projeterPoint(p: Vec3): { x: number; y: number; echelle: number; visible: boolean; profondeur: number } {
    const k = this.pixelsParUnite()
    const q = vec.soustraire(p, this.cible)
    const xc = vec.scalaire(q, this.droite), yc = vec.scalaire(q, this.haut)
    const zc = this.distance - vec.scalaire(q, this.arriere)
    const visible = this.perspective === 0 || zc > this.distance * 0.04
    const s = visible ? 1 + this.perspective * (this.distance / zc - 1) : 0
    return { x: this.largeur / 2 + xc * s * k, y: this.hauteur / 2 - yc * s * k, echelle: s, visible, profondeur: zc }
  }

  /** État sérialisable (pour mémoriser ou partager une vue). */
  etat() {
    return { cible: [...this.cible], orientation: [...this.orientation], distance: this.distance, mode: this.mode }
  }
}
