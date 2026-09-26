// Critères QOC et motifs ACH d'une décision, dérivés de façon déterministe du texte existant.
//
// Le modèle `InfoDecision` n'a pas de critères explicites. En attendant `criteres` et `motifs` en base
// (voir NOTES.md), on les extrait des raisons par un lexique fixe : chaque critère est reconnu par un
// motif, et sa polarité par des indices explicites (« prohibitif », « peu coûteux »…). Quand la raison
// mentionne le critère sans indice de polarité, la polarité est déduite du statut de l'option (retenue →
// favorable, écartée → défavorable) et la cellule le signale.

import type { Alternative, InfoDecision, NoeudR, RolePremisse } from '../../src/raisonnement/donnees'
import { FORCE_ROLE } from '../../src/raisonnement/donnees'

export interface Critere {
  id: string
  libelle: string
  motif: RegExp
  defavorable: RegExp[]
  favorable: RegExp[]
}

/** Critères formulés positivement : ✓ = l'option satisfait le critère. */
export const CRITERES: Critere[] = [
  { id: 'cout', libelle: 'Coût de calcul', motif: /co[uû]t|prohibitif|budget|heures-c/i, defavorable: [/prohibitif/i], favorable: [/peu co[uû]teux/i] },
  {
    id: 'ordre', libelle: 'Ordre, précision', motif: /ordre|vitesse|n[ée]gligeable|biais|mesure d.erreur/i,
    defavorable: [/sans ordre/i, /aucune vitesse/i, /sans le corriger/i, /masque/i], favorable: [/ordre explicite/i, /n[ée]gligeable/i],
  },
  { id: 'compat', libelle: 'Compatibilité avec l’acquis', motif: /compatible|exploite|r[ée]utilis|consistan|cadre classique|litt[ée]rature/i, defavorable: [/incompatible/i], favorable: [] },
  { id: 'conditions', libelle: 'Sans condition supplémentaire', motif: /exige|n[ée]cessite|suppose|non garanti|non d[ée]montr|trop grande pour/i, defavorable: [/./], favorable: [] },
  { id: 'simplicite', libelle: 'Simplicité, lisibilité', motif: /\bsimple|simplicit|\blocal\b|lourd|lisibilit|notations|relecture|minimal|m[ée]canique/i, defavorable: [/lourd/i, /difficile/i], favorable: [] },
  { id: 'portee', libelle: 'Généralité, portée', motif: /restrictif|pertinent seulement|ne d[ée]pend(ent)? pas|applications/i, defavorable: [/restrictif/i, /seulement/i], favorable: [/ne d[ée]pend/i] },
  { id: 'fiabilite', libelle: 'Faisabilité, fiabilité', motif: /fragile|inconnue/i, defavorable: [/./], favorable: [] },
]

export type Polarite = 'favorable' | 'defavorable'
export interface Cellule {
  polarite: Polarite
  /** 'explicite' : indice textuel ; 'statut' : déduite de retenue / écartée. */
  source: 'explicite' | 'statut'
  /** Proposition de la raison où le critère est reconnu. */
  extrait: string
}

export interface LigneQOC {
  critere: Critere
  /** Le critère figure dans la raison globale de la décision. */
  determinant: boolean
  cellules: (Cellule | null)[]
}

export interface AnalyseQOC {
  lignes: LigneQOC[]
  /** Solde (favorables − défavorables) par option, sur tous les critères. */
  soldes: number[]
  /** L'option retenue est-elle au moins aussi bien placée que chaque autre sur les critères déterminants ? */
  retenueDominante: boolean | null
}

const propositionContenant = (texte: string, re: RegExp): string => {
  const morceaux = texte.split(/(?<=[,;.])\s+/)
  return (morceaux.find((m) => re.test(m)) ?? texte).trim()
}

function evaluer(c: Critere, alt: Alternative): Cellule | null {
  const raison = alt.raison ?? ''
  if (!c.motif.test(raison)) return null
  const extrait = propositionContenant(raison, c.motif)
  if (c.defavorable.some((re) => re.test(extrait))) return { polarite: 'defavorable', source: 'explicite', extrait }
  if (c.favorable.some((re) => re.test(extrait))) return { polarite: 'favorable', source: 'explicite', extrait }
  return { polarite: alt.retenue ? 'favorable' : 'defavorable', source: 'statut', extrait }
}

export function analyserQOC(d: InfoDecision): AnalyseQOC {
  const lignes: LigneQOC[] = []
  for (const c of CRITERES) {
    const cellules = d.alternatives.map((a) => evaluer(c, a))
    const determinant = c.motif.test(d.raison)
    if (cellules.some(Boolean) || determinant) lignes.push({ critere: c, determinant, cellules })
  }
  const valeur = (x: Cellule | null) => (x ? (x.polarite === 'favorable' ? 1 : -1) : 0)
  const soldes = d.alternatives.map((_, k) => lignes.reduce((s, l) => s + valeur(l.cellules[k]!), 0))
  const iRetenue = d.alternatives.findIndex((a) => a.retenue)
  const dets = lignes.filter((l) => l.determinant)
  let retenueDominante: boolean | null = null
  if (iRetenue >= 0 && dets.length && dets.some((l) => l.cellules.some(Boolean))) {
    const score = (k: number) => dets.reduce((s, l) => s + valeur(l.cellules[k]!), 0)
    retenueDominante = d.alternatives.every((_, k) => score(iRetenue) >= score(k))
  }
  return { lignes, soldes, retenueDominante }
}

// ─── ACH : motifs de la décision × options ──────────────────────────────────

export type MarqueACH = '+' | '−' | '·'
export interface LigneACH {
  noeud: number
  role: RolePremisse
  marques: MarqueACH[]
  /** Mots partagés avec chaque option (justification de la marque). */
  communs: string[][]
  /** Une prémisse qui marque toutes les options de la même façon ne départage rien. */
  diagnostique: boolean
}

const VIDES = new Set([
  'avec', 'dans', 'pour', 'sans', 'plus', 'entre', 'toute', 'toutes', 'tous', 'leurs', 'cette', 'celle', 'donne', 'reste',
  'schema', 'equation', 'terme', 'termes', 'champs', 'seulement', 'chaque', 'aussi', 'selon', 'apres', 'avant', 'depuis',
])

export function motsDe(texte: string): Set<string> {
  const s = texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return new Set(s.split(/[^a-z]+/).filter((m) => m.length >= 5 && !VIDES.has(m)))
}

/**
 * Pour chaque prémisse principale ou auxiliaire de la décision et chaque option :
 * − si la prémisse partage du vocabulaire avec une option écartée (libellé + raison) : elle motive le rejet ;
 * + si l'option est retenue (la décision repose sur cette prémisse) ;
 * · sinon (non pertinente pour cette option). Les prémisses de contexte et techniques sont toutes « · ».
 */
export function analyserACH(decision: NoeudR, noeuds: NoeudR[], index: Map<string, number>): LigneACH[] {
  const d = decision.decision
  if (!d) return []
  const roles = new Map<number, RolePremisse>()
  for (const dem of decision.demonstrations) for (const p of dem.premisses) {
    const i = index.get(p.id)
    if (i === undefined) continue
    const r = roles.get(i)
    if (!r || FORCE_ROLE[p.role] > FORCE_ROLE[r]) roles.set(i, p.role)
  }
  const motsOptions = d.alternatives.map((a) => motsDe(`${a.libelle} ${a.raison ?? ''}`))
  const lignes: LigneACH[] = []
  for (const [i, role] of roles) {
    const mots = motsDe(`${noeuds[i]!.nom} ${noeuds[i]!.enonce}`)
    const communs = motsOptions.map((mo) => [...mots].filter((m) => mo.has(m)))
    // Une prémisse de contexte ou technique donne son sens à la décision, elle ne départage pas les options.
    const porteuse = role === 'principale' || role === 'auxiliaire'
    const marques: MarqueACH[] = d.alternatives.map((a, k) => {
      if (!porteuse) return '·'
      if (!a.retenue) return communs[k]!.length ? '−' : '·'
      return role === 'principale' || role === 'auxiliaire' || communs[k]!.length ? '+' : '·'
    })
    lignes.push({ noeud: i, role, marques, communs, diagnostique: new Set(marques).size > 1 })
  }
  lignes.sort((a, b) => FORCE_ROLE[b.role] - FORCE_ROLE[a.role] || Number(b.diagnostique) - Number(a.diagnostique))
  return lignes
}
