import { describe, expect, it } from 'vitest'
import { imageA, oeil } from './graphe-3d'

describe('boucle d’une scène 3D', () => {
  it('passe d’une image à la suivante au rythme de fps, puis recommence', () => {
    expect(imageA(0, 20, 40)).toBe(0)
    expect(imageA(0.049, 20, 40)).toBe(0)
    expect(imageA(0.05, 20, 40)).toBe(1)
    expect(imageA(1.99, 20, 40)).toBe(39)
    expect(imageA(2, 20, 40)).toBe(0)
    expect(imageA(5.1, 20, 40)).toBe(22)
  })

  it('ne joue rien sans images', () => {
    expect(imageA(3, 20, 0)).toBe(-1)
  })
})

describe('caméra du mode 3D', () => {
  const elevation = (u: number) => {
    const { x, y, z } = oeil(u)
    return (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI
  }

  it('descend de presque la verticale à une vue plongeante d’environ 30°, en se rapprochant', () => {
    expect(elevation(0)).toBeCloseTo(86, 5)
    expect(elevation(1)).toBeCloseTo(30, 5)
    const d = (u: number) => Math.hypot(...Object.values(oeil(u)))
    expect(d(1)).toBeLessThan(d(0))
  })

  it('part de face (œil vers −y) et finit à trois-quarts, tournée de 45°', () => {
    const depart = oeil(0)
    expect(depart.x).toBeCloseTo(0, 9)
    expect(depart.y).toBeLessThan(0)
    const { x, y } = oeil(1)
    expect(x).toBeGreaterThan(0)
    expect(y).toBeCloseTo(-x, 9)
  })
})
