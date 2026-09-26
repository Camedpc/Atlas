// R11 · Typographie de publication : polices, numérotation « article », marques de validation.
//
// Les énoncés sont numérotés d'un seul compteur, dans l'ordre de lecture (colonne puis hauteur),
// comme dans un article où lemmes, propositions et théorèmes partagent la numérotation :
// Hypothèse 1, Définition 2, Lemme 3, Proposition 4, Théorème 5, (6) pour une assertion (comme une
// équation). Les hypothèses de travail (choix de modélisation) ont leur propre série : (M1), (M2)…

import type { Confiance, NoeudR, TypeRaisonnement, Validation } from '../../src/raisonnement'

/** Police des énoncés (canvas et fiche) : STIX Two Text, chargée par index.html. */
export const SERIF = '"STIX Two Text", "STIX Two Math", "Times New Roman", Times, serif'

export const TETES: Record<TypeRaisonnement, { long: string; court: string }> = {
  hypothese: { long: 'Hypothèse', court: 'Hyp.' },
  definition: { long: 'Définition', court: 'Déf.' },
  axiome: { long: 'Axiome', court: 'Ax.' },
  choix_modelisation: { long: 'Choix', court: 'M' },
  decision: { long: 'Décision', court: 'Déc.' },
  lemme: { long: 'Lemme', court: 'Lem.' },
  proposition: { long: 'Proposition', court: 'Prop.' },
  theoreme: { long: 'Théorème', court: 'Thm' },
  assertion: { long: '', court: '' },
  experience: { long: 'Expérience', court: 'Exp.' },
  calcul: { long: 'Calcul', court: 'Calc.' },
  observation: { long: 'Observation', court: 'Obs.' },
  resultat: { long: 'Résultat', court: 'Rés.' },
  conjecture: { long: 'Conjecture', court: 'Conj.' },
}

/** En-tête d'un énoncé numéroté : « Lemme 3 », « (6) » pour une assertion. */
export function enTete(n: NoeudR, numero: number): string {
  const t = TETES[n.type].long
  return t ? `${t} ${numero}` : `(${numero})`
}

/** Renvoi court, tel qu'on le cite dans le texte : « Lem. 3 », « Thm 5 », « (6) ». */
export function refCourte(n: NoeudR, numero: number): string {
  const t = TETES[n.type].court
  return t ? `${t} ${numero}` : `(${numero})`
}

/** Énoncés « à la amsthm » (corps en italique) : ceux qu'on démontre ou qu'on suppose. */
export function enItalique(n: NoeudR): boolean {
  return ['lemme', 'proposition', 'theoreme', 'conjecture', 'hypothese', 'choix_modelisation'].includes(n.type)
}

/** Police du titre d'un énoncé (mesure et dessin doivent utiliser la même). */
export function policeTitre(n: NoeudR, taille: number, majeur: boolean): string {
  return `${enItalique(n) ? 'italic ' : ''}${majeur ? 600 : 400} ${taille}px ${SERIF}`
}

/** Marque de validation en exposant : † humain, * IA, ‡ IA et humain, rien sinon. */
export function marqueValidation(v: Validation): string {
  return v === 'humain' ? '†' : v === 'ia' ? '*' : v === 'ia_humain' ? '‡' : ''
}

/** Nombre décimal à la française, deux chiffres. */
export function nombre(x: number): string {
  return x.toFixed(2).replace('.', ',')
}

/** « 0,82 [0,74 ; 0,89] » */
export function texteConfiance(c: Confiance): string {
  return `${nombre(c.estimation)} [${nombre(c.bas)} ; ${nombre(c.haut)}]`
}

/** Étiquette d'un élément de contexte (numérotée par nature) : H1, D2, L3, Ax1, [4], a5. */
export function etiquetteContexte(lettre: string, k: number): string {
  if (lettre === 'H') return `H${k}`
  if (lettre === 'D') return `D${k}`
  if (lettre === 'O') return `L${k}`
  if (lettre === 'A') return `Ax${k}`
  if (lettre === 'L') return `[${k}]`
  return `a${k}`
}
