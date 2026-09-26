// Réglages propres à la variante Constellation (dossiers « ✦ … » du panneau Tweakpane).

import type { DefinitionReglage, ReglagesMoteur, VueGraphe } from '../../src/core'

export interface ReglagesV3 {
  // Halos
  halo: boolean
  haloCouleur: 'statut' | 'domaine' | 'origine' | 'unie'
  haloRayon: number
  haloIntensite: number
  haloFlou: number
  haloIncertitude: number
  haloAgregats: number
  fusion: 'auto' | 'normal' | 'additif'
  haloCoeur: number
  plafondHalos: number
  haloPleinPart: number
  haloMinimal: number
  haloContexte: number
  // Survol
  voisinsAllumes: number
  estompeHalos: number
  // Profondeur
  profondeurChamp: number
  miseAuPoint: number
  palirLointains: number
  reduireLointains: number
  // Confiance
  scintillement: boolean
  amplitudeScintillement: number
  frequenceScintillement: number
  couronne: boolean
  couronneEcart: number
  couronneOpacite: number
  couronneTailleMin: number
  bordureValidation: boolean
  // Transitions
  etincelles: boolean
  spirale: number
  trainee: number
  epaisseurTrainee: number
  dispersion: number
  // Lignée
  impulsions: boolean
  vitesseImpulsions: number
  espacementVagues: number
  tailleImpulsion: number
  queueImpulsion: number
  // Squelette
  agregation: 'categories' | 'importance'
  seuilImportance: number
  poidsDescendants: number
  poidsCentralite: number
  bonusResultats: number
  tailleCles: number
  garderLignee: boolean
  aretesSquelette: 'toutes' | 'fortes' | 'directes'
  aretesParCle: number
  // Territoires et vues temps / type
  territoires: 'auto' | 'toujours' | 'jamais'
  opaciteTerritoires: number
  traineesTemps: boolean
  intensiteTemps: number
  // Ambiance
  fondDegrade: boolean
  poussiere: number
}

export type Reglages3 = ReglagesV3 & ReglagesMoteur

/** Valeurs courantes (objet vivant : Tweakpane le modifie en place). */
export const R = (v: VueGraphe) => v.reglages.valeurs as unknown as Reglages3

const H = '✦ Halos', P = '✦ Profondeur de champ', C = '✦ Confiance', T = '✦ Étincelles', L = '✦ Lignée animée', S = '✦ Squelette', A = '✦ Ambiance'

export const DEFINITIONS_V3: DefinitionReglage[] = [
  { cle: 'halo', defaut: true, dossier: H, libelle: 'halos' },
  { cle: 'haloCouleur', defaut: 'statut', dossier: H, libelle: 'couleur', options: { statut: 'statut', domaine: 'domaine', origine: 'origine', unie: 'unie' } },
  { cle: 'haloRayon', defaut: 3.6, dossier: H, libelle: 'rayon (× nœud)', min: 1, max: 10, pas: 0.1 },
  { cle: 'haloIntensite', defaut: 0.8, dossier: H, libelle: 'intensité', min: 0, max: 1.5, pas: 0.01 },
  { cle: 'haloFlou', defaut: 0.3, dossier: H, libelle: 'flou', min: 0, max: 1, pas: 0.01 },
  { cle: 'haloIncertitude', defaut: 26, dossier: H, libelle: 'largeur ∝ incertitude (px)', min: 0, max: 80, pas: 1 },
  { cle: 'haloAgregats', defaut: 1.2, dossier: H, libelle: 'nébuleuses agrégats', min: 0, max: 2, pas: 0.01 },
  { cle: 'fusion', defaut: 'auto', dossier: H, libelle: 'mélange', options: { 'auto (clair : normal, sombre : additif)': 'auto', normal: 'normal', additif: 'additif' } },
  { cle: 'haloCoeur', defaut: 0.65, dossier: H, libelle: 'cœur saturé (clair)', min: 0, max: 1, pas: 0.01 },
  { cle: 'plafondHalos', defaut: 0.85, dossier: H, libelle: 'plafond de densité', min: 0.1, max: 1, pas: 0.01 },
  { cle: 'haloPleinPart', defaut: 0.2, dossier: H, libelle: 'part des nœuds à halo plein', min: 0, max: 1, pas: 0.01 },
  { cle: 'haloMinimal', defaut: 1.8, dossier: H, libelle: 'halo minimal (× nœud)', min: 0, max: 5, pas: 0.05 },
  { cle: 'haloContexte', defaut: 0.5, dossier: H, libelle: 'halos du contexte (lignée)', min: 0, max: 1, pas: 0.01 },
  { cle: 'voisinsAllumes', defaut: 1.2, dossier: H, libelle: 'survol : voisins allumés', min: 0, max: 3, pas: 0.05 },
  { cle: 'estompeHalos', defaut: 0.35, dossier: H, libelle: 'halos estompés', min: 0, max: 1, pas: 0.01 },

  { cle: 'profondeurChamp', defaut: 0.7, dossier: P, libelle: 'flou de profondeur', min: 0, max: 1, pas: 0.01 },
  { cle: 'miseAuPoint', defaut: 0.15, dossier: P, libelle: 'mise au point (0 = près)', min: 0, max: 1, pas: 0.01 },
  { cle: 'palirLointains', defaut: 0.55, dossier: P, libelle: 'pâlir les lointains', min: 0, max: 1, pas: 0.01 },
  { cle: 'reduireLointains', defaut: 0.35, dossier: P, libelle: 'rapetisser les lointains', min: 0, max: 0.9, pas: 0.01 },

  { cle: 'scintillement', defaut: true, dossier: C, libelle: 'scintillement « incertain »' },
  { cle: 'amplitudeScintillement', defaut: 0.35, dossier: C, libelle: 'amplitude', min: 0, max: 1, pas: 0.01 },
  { cle: 'frequenceScintillement', defaut: 0.7, dossier: C, libelle: 'fréquence (Hz)', min: 0.1, max: 4, pas: 0.05 },
  { cle: 'couronne', defaut: true, dossier: C, libelle: 'couronne IA + humain' },
  { cle: 'couronneEcart', defaut: 3, dossier: C, libelle: 'écart couronne (px)', min: 1, max: 10, pas: 0.5 },
  { cle: 'couronneOpacite', defaut: 0.5, dossier: C, libelle: 'opacité couronne', min: 0, max: 1, pas: 0.01 },
  { cle: 'couronneTailleMin', defaut: 3.2, dossier: C, libelle: 'couronne : taille min. (px)', min: 0, max: 12, pas: 0.1 },
  { cle: 'bordureValidation', defaut: true, dossier: C, libelle: 'bordure = validation' },

  { cle: 'etincelles', defaut: true, dossier: T, libelle: 'trajectoire étincelle' },
  { cle: 'spirale', defaut: 0.45, dossier: T, libelle: 'spirale (× π)', min: 0, max: 1.5, pas: 0.01 },
  { cle: 'trainee', defaut: 9, dossier: T, libelle: 'traînée (images)', min: 0, max: 24, pas: 1 },
  { cle: 'epaisseurTrainee', defaut: 1.6, dossier: T, libelle: 'épaisseur traînée', min: 0.3, max: 5, pas: 0.1 },
  { cle: 'dispersion', defaut: 0.35, dossier: T, libelle: 'dispersion des départs', min: 0, max: 0.9, pas: 0.01 },

  { cle: 'impulsions', defaut: true, dossier: L, libelle: 'impulsions' },
  { cle: 'vitesseImpulsions', defaut: 1.6, dossier: L, libelle: 'vitesse (arêtes / s)', min: 0.2, max: 6, pas: 0.05 },
  { cle: 'espacementVagues', defaut: 4, dossier: L, libelle: 'espacement des vagues', min: 1.5, max: 20, pas: 0.5 },
  { cle: 'tailleImpulsion', defaut: 6, dossier: L, libelle: 'taille impulsion (px)', min: 1, max: 16, pas: 0.5 },
  { cle: 'queueImpulsion', defaut: 0.35, dossier: L, libelle: 'queue (part d’arête)', min: 0, max: 1, pas: 0.01 },

  { cle: 'agregation', defaut: 'categories', dossier: S, libelle: 'agrégation', options: { catégories: 'categories', 'squelette par importance': 'importance' } },
  { cle: 'seuilImportance', defaut: 0.85, dossier: S, libelle: 'seuil d’importance', min: 0, max: 0.995, pas: 0.005 },
  { cle: 'poidsDescendants', defaut: 1, dossier: S, libelle: 'poids descendants', min: 0, max: 2, pas: 0.05 },
  { cle: 'poidsCentralite', defaut: 0.6, dossier: S, libelle: 'poids centralité', min: 0, max: 2, pas: 0.05 },
  { cle: 'bonusResultats', defaut: 0.5, dossier: S, libelle: 'bonus résultats majeurs', min: 0, max: 2, pas: 0.05 },
  { cle: 'tailleCles', defaut: 0.12, dossier: S, libelle: 'grossissement des clés', min: 0, max: 1, pas: 0.01 },
  { cle: 'garderLignee', defaut: true, dossier: S, libelle: 'la lignée sort du squelette' },

  { cle: 'aretesSquelette', defaut: 'fortes', dossier: S, libelle: 'arêtes', options: { 'toutes (regroupées)': 'toutes', 'les plus fortes par clé': 'fortes', 'clé → clé directes': 'directes' } },
  { cle: 'aretesParCle', defaut: 2, dossier: S, libelle: 'arêtes fortes par clé', min: 1, max: 12, pas: 1 },

  { cle: 'territoires', defaut: 'auto', dossier: A, libelle: 'noms des territoires', options: { 'auto (niveau nœuds)': 'auto', toujours: 'toujours', jamais: 'jamais' } },
  { cle: 'opaciteTerritoires', defaut: 0.72, dossier: A, libelle: 'opacité territoires', min: 0, max: 1, pas: 0.01 },
  { cle: 'traineesTemps', defaut: true, dossier: A, libelle: 'traînées de période (vues 1 / 3)' },
  { cle: 'intensiteTemps', defaut: 0.8, dossier: A, libelle: 'intensité traînées de période', min: 0, max: 2, pas: 0.01 },
  { cle: 'fondDegrade', defaut: true, dossier: A, libelle: 'fond dégradé' },
  { cle: 'poussiere', defaut: 0.6, dossier: A, libelle: 'poussière d’étoiles (sombre)', min: 0, max: 1, pas: 0.01 },
]

/** Surcharges des réglages du moteur pour cette variante. */
export const SURCHARGES_MOTEUR: Partial<ReglagesMoteur> = {
  tailleNoeud: 2.9,
  tailleImportance: 1.3,
  tailleAgregat: 0.5,
  bordure: 0.14,
  epaisseurArete: 0.6,
  opaciteAretes: 0.2,
  epaisseurAgregee: 0.8,
  opaciteEstompe: 0.08,
  dureeTransition: 950,
  courbe: 'sortie',
  intensiteBrouillard: 0.4,
  densiteLibelles: 0.45,
}
