import { describe, expect, it } from 'vitest'
import { Generations } from './generations'

describe('générations audio de l’appel vocal', () => {
  it('ignore l’audio d’une réponse coupée, accepte la suivante', () => {
    const g = new Generations()
    expect(g.recevoir(1)).toBe('nouvelle')
    expect(g.recevoir(1)).toBe('courante')
    g.couper(2)
    expect(g.recevoir(1)).toBe('ignorer')
    expect(g.recevoir(3)).toBe('nouvelle')
  })

  it('un nouvel appel repart de zéro : sa première réponse est jouée (bug : Atlas muet au 2e appel)', () => {
    const g = new Generations()
    for (const gen of [1, 2, 3]) g.recevoir(gen) // premier appel, trois réponses
    g.couper(4) // raccroché pendant qu'il parlait
    expect(g.recevoir(1)).toBe('ignorer') // sans remise à zéro, le 2e appel serait muet
    g.nouvelAppel()
    expect(g.recevoir(1)).toBe('nouvelle')
  })
})
