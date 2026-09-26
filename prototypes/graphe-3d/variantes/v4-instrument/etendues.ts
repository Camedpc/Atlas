// Étendue des agrégats dans le langage de l'instrument : en vue de face (temps) ou de droite
// (couloirs), la distribution des feuilles d'un agrégat devient une barre d'erreur horizontale
// graduée posée sur sa ligne :
//   ├──────═══════●═══════──────┤   min … max (butées), q25 … q75 (trait épais), q10 / q90 (tirets),
//                                   médiane = le symbole (placement « médiane » du moteur),
//   graduations fines aux semaines (temps) ou aux couloirs (types) le long de la barre.
// Données : `vue.etendues` et `pointSurAxe` du moteur (la capsule par défaut est désactivée).

import { poidsAxes, pointSurAxe, rgba, type ContexteDessin, type Quantiles, type VueGraphe } from '../../src/core'
import type { Echelles } from './echelles'

const JOUR = 86_400_000

export function dessinerEtenduesInstrument({ ctx, vue }: ContexteDessin, ech: Echelles, couleur: (u: number) => string): void {
  const R = vue.reglages
  if (!R.lire<boolean>('etenduesPeriode')) return
  const poids = poidsAxes(vue)
  const cam = vue.camera
  const { h } = vue
  const epaisseur = R.lire<number>('epaisseurBarres')
  ctx.save()
  ctx.lineCap = 'butt'
  for (const axe of ['temps', 'couloirs'] as const) {
    const w = axe === 'temps' ? poids.temps : poids.couloirs
    if (w < 0.03) continue
    // Pas des graduations le long de la barre : une semaine (temps) ou un couloir (types).
    const pasMonde = axe === 'temps' ? ech.uniteJour * 7 : 2 / 31
    for (const c of h.categories) {
      const u = c.unite
      const op = vue.opaciteAffichee[u]!
      if (op < 0.08 || vue.granularite.alpha[u]! < 0.3) continue
      const e = vue.etendues.etendue(u, axe === 'temps' ? 'face' : 'droite')
      if (!e || e.nombre < 2) continue
      const q: Quantiles = axe === 'temps' ? e.x : e.y
      const P = (v: number) => cam.projeterPoint(pointSurAxe(vue, u, axe, v))
      const a = P(q.min), b = P(q.max)
      if (!a.visible || !b.visible) continue
      const dx = b.x - a.x, dy = b.y - a.y
      const l = Math.hypot(dx, dy)
      if (l < 6) continue
      const nx = -dy / l, ny = dx / l
      const alpha = op * w
      const col = couleur(u)
      const trait = (p: { x: number; y: number }, demi: number) => {
        ctx.moveTo(p.x - nx * demi, p.y - ny * demi)
        ctx.lineTo(p.x + nx * demi, p.y + ny * demi)
      }
      // Moustaches min–max + butées.
      ctx.strokeStyle = rgba(col, 0.75 * alpha)
      ctx.lineWidth = epaisseur
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      trait(a, 4)
      trait(b, 4)
      const p10 = P(q.q10), p90 = P(q.q90)
      trait(p10, 2.5)
      trait(p90, 2.5)
      ctx.stroke()
      // Graduations fines (semaines / couloirs) entre min et max.
      const pxPas = (l / Math.max(1e-6, q.max - q.min)) * pasMonde
      if (pxPas > 5) {
        ctx.strokeStyle = rgba(col, 0.45 * alpha)
        ctx.lineWidth = 1
        ctx.beginPath()
        const debut = axe === 'temps' ? ech.dateVersX(Math.ceil(ech.xVersDate(q.min) / (7 * JOUR)) * 7 * JOUR) : Math.ceil((q.min + 1) / pasMonde) * pasMonde - 1
        for (let v = debut; v < q.max; v += pasMonde) trait(P(v), 1.6)
        ctx.stroke()
      }
      // Interquartile : trait épais.
      const p25 = P(q.q25), p75 = P(q.q75)
      ctx.strokeStyle = rgba(col, 0.9 * alpha)
      ctx.lineWidth = epaisseur * 3.2
      ctx.beginPath()
      ctx.moveTo(p25.x, p25.y)
      ctx.lineTo(p75.x, p75.y)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/** Quantiles d'un agrégat sur un axe du monde (0 X temps, 1 Y couloirs, 2 Z bandes). */
export function quantilesAxe(vue: VueGraphe, u: number, axe: number): Quantiles | null {
  const e = vue.etendues.etendue(u, axe === 1 ? 'droite' : 'face')
  if (!e || !e.nombre) return null
  return axe === 0 ? e.x : axe === 1 ? e.y : e.z
}
