// R13 · Vocabulaire d'assistant de preuve : identifiants d'énoncés, états de vérification, indices.
//
// Un énoncé porte un identifiant de blueprint (`thm:conv`, `lem:energie`, `var:bruit`) et un état :
//
//   verifie     ✓   démonstration valide (statut validé)
//   a_verifier  ?   démonstration écrite, pas encore jugée sûre (statut incertain)
//   en_cours    …   étape repliée dont une partie seulement des énoncés est vérifiée
//   echec       ✗   réfuté, ou démonstration principale invalide
//   admis       admis / sorry : établi sans démonstration dans le projet (axiome, définition,
//                   littérature, hypothèse) ou laissé ouvert (conjecture : `sorry`)
//
// L'état est codé par la bordure (trait, épaisseur, pointillé) et un symbole, jamais par un aplat.

import { demonstrationPrincipale, type GrapheJustification, type NoeudR, type TypeRaisonnement } from '../../src/raisonnement'

export type EtatPreuve = 'verifie' | 'a_verifier' | 'en_cours' | 'echec' | 'admis'

export const ETATS: EtatPreuve[] = ['verifie', 'en_cours', 'a_verifier', 'admis', 'echec']

export const LIBELLE_ETAT: Record<EtatPreuve, string> = {
  verifie: 'vérifié',
  a_verifier: 'à vérifier',
  en_cours: 'en cours',
  echec: 'échec',
  admis: 'admis / sorry',
}

export const SYMBOLE_ETAT: Record<EtatPreuve, string> = {
  verifie: '✓',
  a_verifier: '?',
  en_cours: '…',
  echec: '✗',
  admis: '∅',
}

/** Préfixe d'identifiant par type (convention blueprint). */
export const PREFIXE_TYPE: Record<TypeRaisonnement, string> = {
  hypothese: 'hyp',
  definition: 'def',
  axiome: 'ax',
  choix_modelisation: 'var',
  decision: 'dec',
  lemme: 'lem',
  proposition: 'prop',
  theoreme: 'thm',
  assertion: 'aff',
  experience: 'exp',
  calcul: 'calc',
  observation: 'obs',
  resultat: 'res',
  conjecture: 'conj',
}

/** Préfixes d'ids du jeu synthétique qui redisent le type : on les retire (`h_cfl` → `hyp:cfl`). */
const PREFIXES_REDONDANTS: Partial<Record<TypeRaisonnement, string[]>> = {
  hypothese: ['h_', 'hyp_'],
  definition: ['def_'],
  axiome: ['ax_'],
  choix_modelisation: ['cm_', 'var_'],
  decision: ['dec_'],
  lemme: ['lem_'],
  proposition: ['prop_'],
  theoreme: ['thm_'],
  assertion: ['as_'],
  experience: ['exp_'],
  calcul: ['calc_'],
  observation: ['obs_'],
  resultat: ['res_'],
  conjecture: ['conj_'],
}

/** Identifiant d'énoncé : `thm:conv`. Les ids longs (uuid) sont abrégés. */
export function identifiant(n: NoeudR): string {
  let id = n.id
  for (const p of PREFIXES_REDONDANTS[n.type] ?? []) if (id.startsWith(p)) id = id.slice(p.length)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(id)) id = id.slice(0, 8)
  return `${PREFIXE_TYPE[n.type]}:${id}`
}

/** Conjecture ou énoncé de travail sans démonstration : laissé ouvert (`sorry`). */
export function estSorry(n: NoeudR): boolean {
  if (n.admis) return false
  return n.type === 'conjecture' || (n.demonstrations.length === 0 && !['hypothese', 'choix_modelisation', 'decision'].includes(n.type))
}

/** État d'un énoncé seul. */
export function etatNoeud(n: NoeudR): EtatPreuve {
  const d = demonstrationPrincipale(n)
  if (n.statut === 'refute' || d?.validite === 'invalide') return 'echec'
  if (n.admis || estSorry(n) || n.type === 'hypothese') return 'admis'
  if (n.type === 'choix_modelisation' || n.type === 'decision') return 'verifie'
  if (n.statut === 'valide') return 'verifie'
  return 'a_verifier'
}

/** Mot affiché pour l'état « admis » : `sorry` si laissé ouvert, `admis` sinon. */
export function motAdmis(n: NoeudR): string {
  return estSorry(n) ? 'sorry' : n.type === 'hypothese' ? 'hyp.' : 'admis'
}

export interface EtatUnite {
  etat: EtatPreuve
  /** Énoncés vérifiés / total (étape repliée : ses membres). */
  verifies: number
  total: number
}

/** État d'une unité de lecture : un énoncé, ou une étape repliée (agrégat de ses membres). */
export function etatUnite(j: GrapheJustification, membres: number[], conclusion: number): EtatUnite {
  const n = j.noeuds[conclusion]!
  if (membres.length <= 1) {
    const e = etatNoeud(n)
    return { etat: e, verifies: e === 'verifie' ? 1 : 0, total: 1 }
  }
  let verifies = 0, echecs = 0, ouverts = 0
  for (const m of membres) {
    const e = etatNoeud(j.noeuds[m]!)
    if (e === 'verifie') verifies++
    else if (e === 'echec') echecs++
    else if (e === 'admis' && estSorry(j.noeuds[m]!)) ouverts++
  }
  const total = membres.length
  let etat: EtatPreuve
  if (echecs) etat = 'echec'
  else if (verifies === total) etat = 'verifie'
  else if (ouverts === total) etat = 'admis'
  else if (verifies > 0) etat = 'en_cours'
  else etat = 'a_verifier'
  return { etat, verifies, total }
}

const INDICES = '₀₁₂₃₄₅₆₇₈₉'

/** Indice en chiffres souscrits : 12 → ₁₂. */
export function indice(k: number): string {
  return String(k).split('').map((c) => INDICES[Number(c)] ?? c).join('')
}

/** Énoncé qui appelle une démonstration dans le projet (ni admis, ni hypothèse, ni choix, ni décision). */
export function aProuver(n: NoeudR): boolean {
  return !n.admis && !['hypothese', 'choix_modelisation', 'decision'].includes(n.type)
}

export interface Progression {
  /** Énoncés à prouver, par état (« admis » = sorry). */
  etats: Record<EtatPreuve, number>
  total: number
  /** Énoncés admis hors preuve (axiomes, définitions, littérature, hypothèses). */
  importes: number
}

/** Progression globale sur le graphe de justification (tous les nœuds, pas seulement les visibles). */
export function progression(j: GrapheJustification): Progression {
  const etats: Record<EtatPreuve, number> = { verifie: 0, a_verifier: 0, en_cours: 0, echec: 0, admis: 0 }
  let total = 0, importes = 0
  for (const n of j.noeuds) {
    if (!aProuver(n)) {
      if (n.type !== 'choix_modelisation' && n.type !== 'decision') importes++
      continue
    }
    etats[etatNoeud(n)]++
    total++
  }
  return { etats, total, importes }
}
