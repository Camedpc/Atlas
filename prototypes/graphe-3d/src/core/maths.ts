// Petite boîte à outils vectorielle : vecteurs 3D, quaternions, aléa déterministe.

export type Vec3 = [number, number, number]
/** Quaternion unitaire [x, y, z, w]. */
export type Quat = [number, number, number, number]

export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v)
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

export const vec = {
  ajouter: (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  soustraire: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  echelle: (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k],
  scalaire: (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  vectoriel: (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norme: (a: Vec3): number => Math.hypot(a[0], a[1], a[2]),
  normaliser: (a: Vec3): Vec3 => {
    const n = Math.hypot(a[0], a[1], a[2]) || 1
    return [a[0] / n, a[1] / n, a[2] / n]
  },
  lerp: (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)],
}

export const quat = {
  identite: (): Quat => [0, 0, 0, 1],

  axeAngle(axe: Vec3, angle: number): Quat {
    const [x, y, z] = vec.normaliser(axe)
    const s = Math.sin(angle / 2)
    return [x * s, y * s, z * s, Math.cos(angle / 2)]
  },

  /** a * b : applique b puis a. */
  multiplier(a: Quat, b: Quat): Quat {
    const [ax, ay, az, aw] = a
    const [bx, by, bz, bw] = b
    return [
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
      aw * bw - ax * bx - ay * by - az * bz,
    ]
  },

  normaliser(q: Quat): Quat {
    const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1
    return [q[0] / n, q[1] / n, q[2] / n, q[3] / n]
  },

  /** Fait tourner le vecteur v par q. */
  tourner(q: Quat, v: Vec3): Vec3 {
    const [x, y, z, w] = q
    // t = 2 * (q.xyz × v)
    const tx = 2 * (y * v[2] - z * v[1])
    const ty = 2 * (z * v[0] - x * v[2])
    const tz = 2 * (x * v[1] - y * v[0])
    return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)]
  },

  /** Interpolation sphérique par le plus court chemin. */
  slerp(a: Quat, b: Quat, t: number): Quat {
    let [bx, by, bz, bw] = b
    let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw
    if (cos < 0) {
      cos = -cos
      bx = -bx
      by = -by
      bz = -bz
      bw = -bw
    }
    if (cos > 0.9995) {
      return quat.normaliser([lerp(a[0], bx, t), lerp(a[1], by, t), lerp(a[2], bz, t), lerp(a[3], bw, t)])
    }
    const theta = Math.acos(cos)
    const sin = Math.sin(theta)
    const ka = Math.sin((1 - t) * theta) / sin
    const kb = Math.sin(t * theta) / sin
    return [a[0] * ka + bx * kb, a[1] * ka + by * kb, a[2] * ka + bz * kb, a[3] * ka + bw * kb]
  },

  /** Angle (radians) entre deux orientations. */
  angle(a: Quat, b: Quat): number {
    const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])
    return 2 * Math.acos(Math.min(1, d))
  },

  /** Quaternion d'une base orthonormée (colonnes : droite, haut, arrière). */
  depuisBase(r: Vec3, u: Vec3, b: Vec3): Quat {
    const m00 = r[0], m01 = u[0], m02 = b[0]
    const m10 = r[1], m11 = u[1], m12 = b[1]
    const m20 = r[2], m21 = u[2], m22 = b[2]
    const trace = m00 + m11 + m22
    let q: Quat
    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1)
      q = [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s]
    } else if (m00 > m11 && m00 > m22) {
      const s = 2 * Math.sqrt(1 + m00 - m11 - m22)
      q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]
    } else if (m11 > m22) {
      const s = 2 * Math.sqrt(1 + m11 - m00 - m22)
      q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]
    } else {
      const s = 2 * Math.sqrt(1 + m22 - m00 - m11)
      q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s]
    }
    return quat.normaliser(q)
  },

  /** Orientation d'une caméra placée dans la direction `depuis` (vecteur cible → œil), Z en haut. */
  regarderDepuis(depuis: Vec3, haut: Vec3 = [0, 0, 1]): Quat {
    const b = vec.normaliser(depuis)
    let r = vec.vectoriel(haut, b)
    if (vec.norme(r) < 1e-6) r = [1, 0, 0]
    r = vec.normaliser(r)
    const u = vec.vectoriel(b, r)
    return quat.depuisBase(r, u, b)
  },
}

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
export function creerAlea(graine: number) {
  let etat = graine >>> 0
  const suivant = (): number => {
    etat = (etat + 0x6d2b79f5) >>> 0
    let t = etat
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    suivant,
    entre: (a: number, b: number) => a + (b - a) * suivant(),
    entier: (a: number, b: number) => Math.floor(a + (b - a + 1) * suivant()),
    choix: <T>(liste: readonly T[]): T => liste[Math.floor(suivant() * liste.length)]!,
    pondere: <T>(liste: readonly T[], poids: readonly number[]): T => {
      const total = poids.reduce((s, p) => s + p, 0)
      let r = suivant() * total
      for (let i = 0; i < liste.length; i++) {
        r -= poids[i]!
        if (r <= 0) return liste[i]!
      }
      return liste[liste.length - 1]!
    },
    normal: () => {
      const u = Math.max(1e-9, suivant())
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * suivant())
    },
  }
}
export type Alea = ReturnType<typeof creerAlea>

/** Hachage d'une chaîne vers [0, 1) — pour des décalages stables par nœud. */
export function hacher(texte: string, sel = 0): number {
  let h = 2166136261 ^ sel
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h ^= h >>> 13
  h = Math.imul(h, 0x5bd1e995)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}
