// Fondations partagées du graphe de raisonnement : point d'entrée unique pour les visions.

export * from './donnees'
export * from './lecture'
export * from './disposition'
export * from './apparence'
export { FORMES, CODE_FORME, ProgrammeFormes, type Forme } from './formes'
export * from './vue'
export { PanneauRaisonnement, FicheRaisonnement, BarreRaisonnement, Compteur, ficheParDefaut, barreConfiance } from './ui'
// Outils du moteur réutilisables par les visions.
export { el, formaterDate, formaterDateCourte } from '../core/ui/dom'
export { rgba, rgbaGL, melangerCouleurs } from '../core/apparence'
export { COURBES, type Courbe } from '../core/anim'
export { ORIENTATIONS, type NomVue } from '../core/camera3d'
export { quat, vec, clamp, lerp, type Vec3 } from '../core/maths'
export type { DefinitionReglage, ValeurReglage } from '../core/reglages'
