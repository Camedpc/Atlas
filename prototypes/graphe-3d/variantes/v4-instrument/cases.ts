// Regroupement « par cases » : au lieu de la hiérarchie thématique (domaine › thème › sous-thème),
// les agrégats deviennent des cases période × type (× origine), comme les cellules d'un
// histogramme 2D lu sur les faces avant (temps) et droite (couloirs de type).
//
// Mise en œuvre sans toucher au moteur : on reconstruit la vue avec des données dont le champ
// `categorie` décrit la case, puis on réinjecte les dispositions thématiques d'origine
// (`remplacerDisposition`) pour que les feuilles gardent leurs positions : seuls les agrégats changent.

import {
  LIBELLES_ORIGINE, LIBELLES_TYPE, ORIGINES, TYPES_NOEUD, centreCouloir,
  type Dispositions, type Hierarchie, type JeuDonnees, type Noeud,
} from '../../src/core'

export type PasCases = 'mois' | 'quinzaine' | 'semaine'
export type OrdreCases = 'periode' | 'type'

/** Clé de période triable (AAAA-MM, AAAA-MM Q1/Q2, AAAA-Sww). */
export function clePeriode(t: number, pas: PasCases): string {
  const d = new Date(t)
  const a = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  if (pas === 'mois') return `${a}-${m}`
  if (pas === 'quinzaine') return `${a}-${m} ${d.getUTCDate() <= 15 ? 'Q1' : 'Q2'}`
  // Semaine ISO 8601.
  const j = new Date(Date.UTC(a, d.getUTCMonth(), d.getUTCDate()))
  const jour = j.getUTCDay() || 7
  j.setUTCDate(j.getUTCDate() + 4 - jour)
  const debutAnnee = new Date(Date.UTC(j.getUTCFullYear(), 0, 1))
  const semaine = Math.ceil(((j.getTime() - debutAnnee.getTime()) / 86_400_000 + 1) / 7)
  return `${j.getUTCFullYear()}-S${String(semaine).padStart(2, '0')}`
}

export function donneesParCases(jeu: JeuDonnees, pas: PasCases, ordre: OrdreCases): JeuDonnees {
  const noeuds: Noeud[] = jeu.noeuds.map((n) => {
    const p = clePeriode(Date.parse(n.cree_le), pas)
    const t = LIBELLES_TYPE[n.type]
    const o = LIBELLES_ORIGINE[n.origine]
    const categorie: [string, string, string] = ordre === 'periode'
      ? [p, `${p} · ${t}`, `${p} · ${t} · ${o}`]
      : [t, `${t} · ${p}`, `${t} · ${p} · ${o}`]
    return { ...n, categorie }
  })
  return { noeuds, source: jeu.source }
}

/** Bornes [début, fin[ (ms) de la période qui contient t. */
export function bornesPeriode(t: number, pas: PasCases): [number, number] {
  const d = new Date(t)
  const a = d.getUTCFullYear(), m = d.getUTCMonth()
  if (pas === 'mois') return [Date.UTC(a, m, 1), Date.UTC(a, m + 1, 1)]
  if (pas === 'quinzaine') return d.getUTCDate() <= 15 ? [Date.UTC(a, m, 1), Date.UTC(a, m, 16)] : [Date.UTC(a, m, 16), Date.UTC(a, m + 1, 1)]
  const j = Date.UTC(a, m, d.getUTCDate())
  const lundi = j - (((d.getUTCDay() || 7) - 1) * 86_400_000)
  return [lundi, lundi + 7 * 86_400_000]
}

/**
 * Place chaque case à la coordonnée de son intervalle : centre de la période en X (dispositions
 * « face » et « cube »), centre du couloir de type (et d'origine au niveau 2) en Y (« droite »
 * et « cube »). Les autres coordonnées restent celles du moteur (médiane des feuilles).
 * À rappeler après chaque recalcul des barycentres par le moteur (filtres).
 */
export function placerCases(h: Hierarchie, d: Dispositions, pas: PasCases, ordre: OrdreCases, dateVersX: (t: number) => number): void {
  for (const c of h.categories) {
    const f = c.feuilles[0]
    if (f === undefined) continue
    const n = h.noeuds[f]!
    const aPeriode = ordre === 'periode' || c.niveau >= 1
    const aType = ordre === 'type' || c.niveau >= 1
    const u = c.unite * 3
    if (aPeriode) {
      const [t0, t1] = bornesPeriode(h.dates[f]!, pas)
      const x = Math.max(-1, Math.min(1, dateVersX((t0 + t1) / 2)))
      d.face[u] = x
      d.cube[u] = x
    }
    if (aType) {
      const y = centreCouloir(TYPES_NOEUD.indexOf(n.type), c.niveau === 2 ? ORIGINES.indexOf(n.origine) : 1)
      d.droite[u + 1] = y
      d.cube[u + 1] = y
    }
  }
}
