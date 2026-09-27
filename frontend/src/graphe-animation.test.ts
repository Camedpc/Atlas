import { afterEach, describe, expect, it, vi } from 'vitest'
import { adoucir, animer } from './graphe-animation'

afterEach(() => vi.useRealTimers())

describe('mouvements du pilotage', () => {
  it('passe par des positions intermédiaires croissantes, puis pose l\'état final', async () => {
    vi.useFakeTimers()
    const vus: number[] = []
    const final = vi.fn()
    const a = animer((u) => vus.push(u), final, 400)
    await vi.advanceTimersByTimeAsync(500)
    await a.promesse
    expect(vus.length).toBeGreaterThan(5)
    expect(vus.every((u, i) => u > 0 && u < 1 && (i === 0 || u >= vus[i - 1]!))).toBe(true)
    expect(final).toHaveBeenCalledTimes(1)
  })

  it('arrêter : pas d\'état final ; fin : l\'état final tout de suite', async () => {
    vi.useFakeTimers()
    const final = vi.fn()
    const a = animer(() => {}, final, 400)
    await vi.advanceTimersByTimeAsync(100)
    a.arreter()
    await a.promesse
    expect(final).not.toHaveBeenCalled()
    const b = animer(() => {}, final, 400)
    b.fin()
    await b.promesse
    expect(final).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(final).toHaveBeenCalledTimes(1) // le filet ne rejoue pas l'état final
  })

  it('adoucir va de 0 à 1 en passant par 1/2 au milieu', () => {
    expect([adoucir(0), adoucir(0.5), adoucir(1)]).toEqual([0, 0.5, 1])
  })
})
