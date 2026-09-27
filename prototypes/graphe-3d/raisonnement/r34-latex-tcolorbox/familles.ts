// R34 · Familles de boîtes (couleurs xcolor) et environnements (compteurs façon amsthm).
//
// Chaque famille est une couleur xcolor écrite comme dans un préambule LaTeX, convertie en hex :
// X!p!black = p % de X et le reste de noir ; X!5 = 5 % de X et 95 % de blanc (fond de la boîte).

import type { NoeudR, TypeRaisonnement } from '../../src/raisonnement'

export type Famille = 'hypothese' | 'lemme' | 'resultat' | 'observation' | 'decision' | 'abandon'

export interface DefinitionFamille {
  /** Spécification xcolor du cadre et du bandeau de titre. */
  xcolor: string
  /** Spécification xcolor du fond. */
  xfond: string
  cadre: string
  fond: string
  nom: string
}

export const FAMILLES: Record<Famille, DefinitionFamille> = {
  hypothese: { xcolor: 'orange!70!black', xfond: 'orange!5', cadre: '#b35900', fond: '#fff9f2', nom: 'hypothèses, choix de modélisation' },
  lemme: { xcolor: 'blue!50!black', xfond: 'blue!5', cadre: '#000080', fond: '#f2f2ff', nom: 'lemmes, propositions, définitions' },
  resultat: { xcolor: 'red!50!black', xfond: 'red!5', cadre: '#800000', fond: '#fff2f2', nom: 'théorèmes et résultats' },
  observation: { xcolor: 'green!40!black', xfond: 'green!5', cadre: '#006600', fond: '#f2fff2', nom: 'observations, expériences, calculs' },
  decision: { xcolor: 'violet!60!black', xfond: 'violet!5', cadre: '#4d004d', fond: '#f9f2f9', nom: 'décisions' },
  abandon: { xcolor: 'black!50', xfond: 'black!3', cadre: '#808080', fond: '#f7f7f7', nom: 'piste abandonnée' },
}

export function familleDe(n: NoeudR): Famille {
  if (n.piste === 'abandonnee') return 'abandon'
  switch (n.type) {
    case 'choix_modelisation':
    case 'hypothese':
      return 'hypothese'
    case 'theoreme':
    case 'resultat':
      return n.admis ? 'lemme' : 'resultat'
    case 'observation':
    case 'experience':
    case 'calcul':
      return 'observation'
    case 'decision':
      return 'decision'
    default:
      return 'lemme'
  }
}

/** Environnement LaTeX : nom long (titre), abrégé (renvois), compteur partagé. */
interface Environnement {
  nom: string
  court: string
  compteur: string
}

const ENVIRONNEMENTS: Record<TypeRaisonnement, Environnement> = {
  hypothese: { nom: 'Hypothèse', court: 'H', compteur: 'H' },
  choix_modelisation: { nom: 'Hypothèse', court: 'H', compteur: 'H' },
  definition: { nom: 'Définition', court: 'Déf.', compteur: 'definition' },
  axiome: { nom: 'Axiome', court: 'Ax.', compteur: 'axiome' },
  decision: { nom: 'Décision', court: 'Déc.', compteur: 'decision' },
  lemme: { nom: 'Lemme', court: 'Lem.', compteur: 'lemme' },
  proposition: { nom: 'Proposition', court: 'Prop.', compteur: 'proposition' },
  theoreme: { nom: 'Théorème', court: 'Thm', compteur: 'theoreme' },
  assertion: { nom: 'Assertion', court: 'Ass.', compteur: 'assertion' },
  experience: { nom: 'Expérience', court: 'Exp.', compteur: 'experience' },
  calcul: { nom: 'Calcul', court: 'Calc.', compteur: 'calcul' },
  observation: { nom: 'Observation', court: 'Obs.', compteur: 'observation' },
  resultat: { nom: 'Résultat', court: 'Rés.', compteur: 'resultat' },
  conjecture: { nom: 'Conjecture', court: 'Conj.', compteur: 'conjecture' },
}

export function environnementDe(n: NoeudR): Environnement {
  return ENVIRONNEMENTS[n.type]
}

/** Référence numérotée : « Lemme 3 » / « Lem. 3 » ; les hypothèses sont étiquetées (H2). */
export function reference(n: NoeudR, numero: number | string): { longue: string; courte: string } {
  const e = environnementDe(n)
  if (e.compteur === 'H') return { longue: `Hypothèse (H${numero})`, courte: `(H${numero})` }
  return { longue: `${e.nom} ${numero}`, courte: `${e.court} ${numero}` }
}
