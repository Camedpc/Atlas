// Barres d'erreur : l'intervalle de confiance [bas, haut] dessiné autour de chaque symbole comme sur
// un graphique de mesures. Le centre du symbole = l'estimation ; la barre s'étend de
// (haut − estimation) d'un côté et (estimation − bas) de l'autre, avec des butées.
// Agrégats : intervalle moyen de leurs feuilles, trait plus épais, couleur du groupe.

import { rgba, STATUTS, type ContexteDessin, type Statut, type VueGraphe } from '../../src/core'

interface IntervalleMoyen {
  est: number
  bas: number
  haut: number
}

let cacheAgregats: { vue: VueGraphe; valeurs: IntervalleMoyen[] } | null = null

function intervallesAgregats(vue: VueGraphe): IntervalleMoyen[] {
  if (cacheAgregats?.vue === vue) return cacheAgregats.valeurs
  const valeurs = vue.h.categories.map((c) => {
    let est = 0, bas = 0, haut = 0
    for (const f of c.feuilles) {
      const k = vue.h.noeuds[f]!.confiance
      est += k.estimation
      bas += k.bas
      haut += k.haut
    }
    const n = c.feuilles.length || 1
    return { est: est / n, bas: bas / n, haut: haut / n }
  })
  cacheAgregats = { vue, valeurs }
  return valeurs
}

export function dessinerBarresErreur({ ctx, vue, projection }: ContexteDessin): void {
  const R = vue.reglages
  const orientation = R.lire<string>('barresErreur')
  if (orientation === 'aucune') return
  const L = R.lire<number>('longueurBarres')
  const butee = R.lire<number>('buteeBarres')
  const opac = R.lire<number>('opaciteBarres')
  const verticale = orientation === 'verticales'
  const croix = orientation === 'croix'
  const { h, palette } = vue
  // Un chemin par (statut, palier d'opacité) : peu d'appels stroke().
  const chemins = new Map<string, Path2D>()
  const tracer = (p: Path2D, x: number, y: number, plus: number, moins: number, b: number, vert: boolean) => {
    if (vert) {
      p.moveTo(x, y - plus)
      p.lineTo(x, y + moins)
      p.moveTo(x - b, y - plus)
      p.lineTo(x + b, y - plus)
      p.moveTo(x - b, y + moins)
      p.lineTo(x + b, y + moins)
    } else {
      p.moveTo(x - moins, y)
      p.lineTo(x + plus, y)
      p.moveTo(x - moins, y - b)
      p.lineTo(x - moins, y + b)
      p.moveTo(x + plus, y - b)
      p.lineTo(x + plus, y + b)
    }
  }
  for (let f = 0; f < h.nF; f++) {
    const op = vue.opaciteAffichee[f]!
    if (op < 0.06) continue
    const k = h.noeuds[f]!.confiance
    const s = projection.echelle[f]! || 1
    const plus = (k.haut - k.estimation) * L * s, moins = (k.estimation - k.bas) * L * s
    const r = vue.tailleAffichee[f]!
    if (plus + moins < r * 0.6) continue
    const cle = `${h.noeuds[f]!.statut}|${Math.ceil(op * 5)}`
    let p = chemins.get(cle)
    if (!p) chemins.set(cle, (p = new Path2D()))
    const x = projection.x[f]!, y = projection.y[f]!
    tracer(p, x, y, plus, moins, butee, verticale || croix)
    if (croix) tracer(p, x, y, plus, moins, butee, false)
  }
  ctx.save()
  ctx.lineWidth = R.lire<number>('epaisseurBarres')
  ctx.lineCap = 'butt'
  for (const statut of STATUTS) {
    for (let palier = 1; palier <= 5; palier++) {
      const p = chemins.get(`${statut}|${palier}`)
      if (!p) continue
      ctx.strokeStyle = rgba(palette.statut[statut as Statut], opac * (palier / 5))
      ctx.stroke(p)
    }
  }
  // Agrégats : intervalle moyen.
  if (R.lire<boolean>('barresAgregats')) {
    const moyens = intervallesAgregats(vue)
    ctx.lineWidth = R.lire<number>('epaisseurBarres') * 1.8
    for (const c of h.categories) {
      const u = c.unite
      const op = vue.opaciteAffichee[u]!
      if (op < 0.1) continue
      const m = moyens[c.index]!
      const s = projection.echelle[u]! || 1
      const plus = (m.haut - m.est) * L * 1.4 * s, moins = (m.est - m.bas) * L * 1.4 * s
      const r = vue.tailleAffichee[u]!
      const p = new Path2D()
      const x = projection.x[u]!, y = projection.y[u]!
      // Les barres d'agrégat partent du bord du symbole (lisibles même sur un gros disque).
      tracer(p, x, y, plus + r, moins + r, butee * 1.5, verticale || croix)
      if (croix) tracer(p, x, y, plus + r, moins + r, butee * 1.5, false)
      ctx.strokeStyle = rgba(palette.texte, 0.55 * opac * op)
      ctx.stroke(p)
    }
  }
  ctx.restore()
}
