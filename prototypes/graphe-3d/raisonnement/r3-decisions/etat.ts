// R3 · État d'interaction partagé entre les réducteurs, les calques et le panneau.

export interface RectEcran {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface EtatR3 {
  /** Opacité logique de chaque point (avant l'effacement des blocs dans sigma). */
  alpha: Float32Array
  /** Cartes de blocs projetées à la dernière image (test de survol). */
  cartes: Map<number, RectEcran>
  /** En-têtes des blocs dépliés (clic = replier). */
  entetes: { id: string; rect: RectEcran }[]
  /** Survol d'un pivot : portée (point → part des membres qui en dépendent). */
  portee: { point: number; noeud: number; parts: Map<number, number>; nb: number } | null
  /** Mode « et si ? » : ce qui tomberait sans ce pivot. */
  etSi: {
    point: number
    noeud: number
    tombes: Uint8Array
    nbTombes: number
    survivants: number[]
    /** Point → [membres tombés, membres]. */
    parts: Map<number, [number, number]>
  } | null
  /** Mise en évidence passagère (journal) : point et instant de départ. */
  focus: { noeud: number; t0: number } | null
}

export const etat: EtatR3 = {
  alpha: new Float32Array(0),
  cartes: new Map(),
  entetes: [],
  portee: null,
  etSi: null,
  focus: null,
}
