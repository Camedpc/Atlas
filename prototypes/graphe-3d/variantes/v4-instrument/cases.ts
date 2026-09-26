// Regroupement « par cases » : au lieu de la hiérarchie thématique (domaine › thème › sous-thème),
// les agrégats deviennent des cases période × type (× origine), comme les cellules d'un
// histogramme 2D lu sur les faces avant (temps) et droite (couloirs de type).
//
// Mise en œuvre sans toucher au moteur : on reconstruit la vue avec des données dont le champ
// `categorie` décrit la case, puis on réinjecte les dispositions thématiques d'origine
// (`remplacerDisposition`) pour que les feuilles gardent leurs positions : seuls les agrégats changent.

import { LIBELLES_ORIGINE, LIBELLES_TYPE, type JeuDonnees, type Noeud } from '../../src/core'

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
