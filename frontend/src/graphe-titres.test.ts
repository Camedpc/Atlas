// Noms des cadres : la taille s'ajuste pour que le nom tienne, sans jamais couper un mot.

import { describe, expect, it } from 'vitest'
import { ajuster } from './graphe-dessin'

/** Contexte factice : chaque caractère fait la moitié du corps de la police (« 700 20px … » → 10 px). */
function contexte() {
  const ctx = {
    font: '',
    measureText(t: string) {
      const fs = Number(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] ?? 10)
      return { width: t.length * fs * 0.5 } as TextMetrics
    },
  }
  return ctx
}
const police = (fs: number) => `700 ${fs}px serif`

describe('ajuster', () => {
  it('garde la taille maximale quand le nom tient', () => {
    expect(ajuster(contexte(), 'Conclusion', 200, 20, 9, 3, police)).toEqual({ fs: 20, lignes: ['Conclusion'] })
  })

  it('passe à la ligne, et rétrécit plutôt que de couper un mot', () => {
    // « modélisation » (12 caractères) tient dans 80 px à 13 px au plus.
    const r = ajuster(contexte(), 'Hypothèses de modélisation', 80, 20, 9, 3, police)
    expect(r.fs).toBe(13)
    expect(r.lignes).toEqual(['Hypothèses', 'de', 'modélisation'])
    for (const l of r.lignes) expect(l.length * r.fs * 0.5).toBeLessThanOrEqual(80)
  })

  it('tronque seulement en dernier recours, à la taille minimale', () => {
    const r = ajuster(contexte(), 'Anticonstitutionnellement', 40, 20, 9, 2, police)
    expect(r.fs).toBe(9)
    expect(r.lignes).toHaveLength(1)
    expect(r.lignes[0]!.endsWith('…')).toBe(true)
    expect(r.lignes[0]!.length * 9 * 0.5).toBeLessThanOrEqual(40)
  })
})
