// Générations audio d'un appel vocal. Le serveur numérote chaque réponse d'Atlas voix (et chaque coupure) à
// partir de 1, et recommence à chaque appel : le navigateur doit donc repartir de zéro à chaque appel, sinon toute
// la voix d'un nouvel appel passe pour l'audio d'une réponse coupée et n'est jamais jouée.

export type Trame = 'ignorer' | 'nouvelle' | 'courante'

export class Generations {
  courante = 0

  /** Nouvel appel : les numéros du serveur repartent de 1. */
  nouvelAppel() {
    this.courante = 0
  }

  /** Trame audio de la génération `gen` : d'une réponse coupée (à ignorer), d'une nouvelle réponse, ou de celle en cours. */
  recevoir(gen: number): Trame {
    if (gen < this.courante) return 'ignorer'
    if (gen > this.courante) {
      this.courante = gen
      return 'nouvelle'
    }
    return 'courante'
  }

  /** Le serveur a coupé la voix : tout ce qui précède `gen` est à ignorer. */
  couper(gen: number) {
    this.courante = Math.max(this.courante, gen)
  }
}
