import { describe, expect, it } from 'vitest'
import { imageA, largeurBase, melanger, oeil, plancher, PLANCHER_NEUTRE, sousLaBoite } from './graphe-3d'

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

describe('plancher du mode 3D', () => {
  it('part à plat et net, finit incliné à 60°, reculé et voilé', () => {
    const debut = plancher(oeil(0), 0)
    expect(debut.inclinaison).toBeCloseTo(4, 5)
    expect(debut.rotation).toBeCloseTo(0, 9)
    expect(debut.echelle).toBeCloseTo(1, 9)
    expect([debut.opacite, debut.voile]).toEqual([1, 0])
    const fin = plancher(oeil(1), 1)
    expect(fin.inclinaison).toBeCloseTo(60, 5)
    // La caméra a tourné de 45° en descendant, le plancher aussi.
    expect(fin.rotation).toBeCloseTo(45, 5)
    expect(fin.echelle).toBeCloseTo(0.85, 9)
    expect(fin.voile).toBe(1)
  })

  it('suit la caméra : rotation autour de la verticale et recul à la molette', () => {
    const { x, y, z } = oeil(1)
    const a = Math.PI / 6
    const tourne = plancher({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a), z }, 1)
    expect(tourne.rotation).toBeCloseTo(45 + 30, 5)
    expect(tourne.inclinaison).toBeCloseTo(60, 5)
    expect(plancher({ x: 2 * x, y: 2 * y, z: 2 * z }, 1).echelle).toBeCloseTo(0.425, 9)
  })

  it('revient à plat par mélange', () => {
    const fin = plancher(oeil(1), 1)
    expect(melanger(fin, PLANCHER_NEUTRE, 0)).toEqual(fin)
    expect(melanger(fin, PLANCHER_NEUTRE, 1)).toEqual(PLANCHER_NEUTRE)
  })
})

describe('plancher sous la boîte de Plotly', () => {
  const focale = 400 / Math.tan(Math.PI / 8)

  it('descend de la demi-hauteur projetée : pleine vue de côté, rien vue de dessus', () => {
    expect(sousLaBoite({ x: 3, y: 0, z: 0 }, 0.5, 800)).toBeCloseTo((focale * 0.5) / 3, 6)
    expect(sousLaBoite({ x: 0, y: 0, z: 3 }, 0.5, 800)).toBeCloseTo(0, 6)
  })

  it('vue plongeante à 30° : entre les deux, plus bas pour une boîte plus haute', () => {
    const e = oeil(1)
    const bas = sousLaBoite(e, 0.5, 800)
    expect(bas).toBeCloseTo((focale * 0.5 * Math.cos(Math.PI / 6)) / (3 + 0.5 * Math.sin(Math.PI / 6)), 6)
    expect(sousLaBoite(e, 1, 800)).toBeGreaterThan(bas)
  })
})

describe('case du plancher à la taille de la base de la boîte', () => {
  const focale = 400 / Math.tan(Math.PI / 8)

  it('la longueur de la base en x, à la distance du bas de la boîte (le plancher tourne avec la caméra)', () => {
    expect(largeurBase({ x: 0, y: -3, z: 0 }, 1, 0.5, 800)).toBeCloseTo(focale / 3, 6)
    const e = oeil(1)
    const d = Math.hypot(e.x, e.y, e.z)
    expect(largeurBase(e, 1, 0.5, 800)).toBeCloseTo(focale / (d + 0.5 * Math.sin(Math.PI / 6)), 6)
  })

  it('rétrécit quand on s’éloigne (molette)', () => {
    const { x, y, z } = oeil(1)
    expect(largeurBase({ x: 2 * x, y: 2 * y, z: 2 * z }, 1, 0.5, 800)).toBeLessThan(largeurBase(oeil(1), 1, 0.5, 800))
  })
})
