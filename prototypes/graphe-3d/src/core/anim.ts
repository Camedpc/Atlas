// Courbes d'accélération, trajectoires de transition et petit animateur à base de temps.

export type Courbe = (t: number) => number

export const COURBES = {
  lineaire: (t: number) => t,
  douce: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  sortie: (t: number) => 1 - Math.pow(1 - t, 3),
  entree: (t: number) => t * t * t,
  rebond: (t: number) => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  },
  elastique: (t: number) =>
    t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
} satisfies Record<string, Courbe>
export type NomCourbe = keyof typeof COURBES

/**
 * Point de trajectoire réutilisé (aucune allocation par image) : le moteur remplit
 * départ (d*), arrivée (a*), t ∈ [0,1] déjà passé par la courbe, et une graine stable ;
 * la trajectoire écrit x, y, z.
 */
export interface PointTrajectoire {
  dx: number; dy: number; dz: number
  ax: number; ay: number; az: number
  t: number
  graine: number
  x: number; y: number; z: number
  // Champs facultatifs (itération 2), toujours remplis par le moteur :
  /** Unité placée et unité parente (dont elle sort / où elle rentre). */
  unite?: number
  parent?: number
  /** Ouverture brute du parent (avant courbe), 0 = rentrée, 1 = sortie. */
  o?: number
  /** Sens de la transition du parent : 1 = sortie (on affine), -1 = rentrée (on agrège), 0 = immobile. */
  sens?: -1 | 0 | 1
}
export type Trajectoire = (p: PointTrajectoire) => void

export const TRAJECTOIRES = {
  droite: (p: PointTrajectoire) => {
    p.x = p.dx + (p.ax - p.dx) * p.t
    p.y = p.dy + (p.ay - p.dy) * p.t
    p.z = p.dz + (p.az - p.dz) * p.t
  },
  /** Dépasse légèrement la cible puis revient (ressort amorti). */
  ressort: (p: PointTrajectoire) => {
    const t = p.t
    const k = t >= 1 ? 1 : 1 - Math.exp(-6 * t) * Math.cos(9 * t) * (1 - t)
    p.x = p.dx + (p.ax - p.dx) * k
    p.y = p.dy + (p.ay - p.dy) * k
    p.z = p.dz + (p.az - p.dz) * k
  },
  /** Les enfants tournent autour du parent (axe Z) en s'éloignant. */
  spirale: (p: PointTrajectoire) => {
    const sens = p.graine < 0.5 ? -1 : 1
    const ang = (1 - p.t) * Math.PI * 0.9 * sens
    const c = Math.cos(ang), s = Math.sin(ang)
    const vx = p.ax - p.dx, vy = p.ay - p.dy
    p.x = p.dx + (vx * c - vy * s) * p.t
    p.y = p.dy + (vx * s + vy * c) * p.t
    p.z = p.dz + (p.az - p.dz) * p.t
  },
} satisfies Record<string, Trajectoire>
export type NomTrajectoire = keyof typeof TRAJECTOIRES

export interface Animation {
  annuler(): void
  readonly active: boolean
}

interface AnimInterne {
  debut: number
  duree: number
  courbe: Courbe
  etape: (t: number) => void
  fin?: () => void
  active: boolean
}

/** Animations pilotées par la boucle de rendu (pas de requestAnimationFrame propre). */
export class Animateur {
  private anims = new Set<AnimInterne>()

  animer(duree: number, etape: (t: number) => void, options: { courbe?: Courbe; fin?: () => void } = {}): Animation {
    const a: AnimInterne = {
      debut: performance.now(),
      duree: Math.max(1, duree),
      courbe: options.courbe ?? COURBES.douce,
      etape,
      fin: options.fin,
      active: true,
    }
    this.anims.add(a)
    return {
      annuler: () => {
        a.active = false
        this.anims.delete(a)
      },
      get active() {
        return a.active
      },
    }
  }

  get enCours(): boolean {
    return this.anims.size > 0
  }

  /** Avance toutes les animations ; renvoie vrai s'il en reste. */
  mettreAJour(maintenant: number): boolean {
    for (const a of [...this.anims]) {
      // L'horodatage d'image peut précéder le lancement de l'animation : pas de temps négatif.
      const brut = Math.max(0, Math.min(1, (maintenant - a.debut) / a.duree))
      a.etape(a.courbe(brut))
      if (brut >= 1) {
        a.active = false
        this.anims.delete(a)
        a.fin?.()
      }
    }
    return this.anims.size > 0
  }
}

/** Bus d'événements typé minimal. */
export class Emetteur<E extends { [K in keyof E]: unknown }> {
  private ecouteurs = new Map<keyof E, Set<(v: never) => void>>()

  on<K extends keyof E>(type: K, f: (v: E[K]) => void): () => void {
    let s = this.ecouteurs.get(type)
    if (!s) this.ecouteurs.set(type, (s = new Set()))
    s.add(f as (v: never) => void)
    return () => s.delete(f as (v: never) => void)
  }

  emettre<K extends keyof E>(type: K, valeur: E[K]): void {
    const s = this.ecouteurs.get(type)
    if (!s) return
    for (const f of s) {
      try {
        ;(f as (v: E[K]) => void)(valeur)
      } catch (e) {
        console.error(`[atlas] écouteur « ${String(type)} » en erreur`, e)
      }
    }
  }
}
