// Réglages propres à la synthèse (Tweakpane). Tout ce qui est visuel est paramétrable ; les
// réglages du moteur (tailles, arêtes, transitions, caméra…) restent disponibles à côté.
//
// Dossiers préfixés « V7 · » pour les distinguer de ceux du moteur.

import type { DefinitionReglage, ReglagesMoteur, ValeurReglage } from '../../src/core'

const F = 'V7 · figure'
const N = 'V7 · nœuds'
const G = 'V7 · agrégats'
const A = 'V7 · arêtes'
const T = 'V7 · transitions'
const L = 'V7 · libellés'
const X = 'V7 · axes (face, droite)'
const I = 'V7 · lignée'
const S = 'V7 · fiche'
const Z = 'V7 · zoom sémantique'
const O = 'V7 · lentille'
const P = 'V7 · interface'

export const REGLAGES_V7: DefinitionReglage[] = [
  // Figure (fond)
  { cle: 'territoires', defaut: true, dossier: F, libelle: 'territoires des domaines' },
  { cle: 'margeTerritoire', defaut: 16, dossier: F, libelle: 'marge territoire', min: 0, max: 60, pas: 1 },
  { cle: 'teinteTerritoire', defaut: 0.05, dossier: F, libelle: 'teinte territoire', min: 0, max: 0.3, pas: 0.005 },
  { cle: 'contourTerritoire', defaut: 0.22, dossier: F, libelle: 'contour territoire', min: 0, max: 1, pas: 0.01 },
  { cle: 'grain', defaut: 0.7, dossier: F, libelle: 'grain du papier', min: 0, max: 2, pas: 0.05 },
  { cle: 'legendeFigure', defaut: true, dossier: F, libelle: 'légende de figure' },

  // Nœuds (feuilles)
  { cle: 'anneauConfiance', defaut: true, dossier: N, libelle: 'anneau de confiance' },
  { cle: 'epaisseurAnneau', defaut: 1.3, dossier: N, libelle: 'épaisseur anneau', min: 0.4, max: 5, pas: 0.1 },
  { cle: 'ecartAnneau', defaut: 1.4, dossier: N, libelle: 'écart anneau', min: 0, max: 8, pas: 0.1 },
  { cle: 'anneauRayonMin', defaut: 3.5, dossier: N, libelle: 'rayon min. anneau (px)', min: 0, max: 14, pas: 0.5 },
  { cle: 'opaciteIntervalle', defaut: 0.34, dossier: N, libelle: 'opacité intervalle', min: 0, max: 1, pas: 0.01 },
  { cle: 'styleBordure', defaut: 'motif', dossier: N, libelle: 'bordure = validation', options: { 'simple / double / pleine': 'motif', 'épaisseur graduée': 'epaisseur', aucune: 'aucune' } },
  { cle: 'epaisseurBordure', defaut: 1, dossier: N, libelle: 'épaisseur bordure', min: 0.3, max: 3, pas: 0.05 },
  { cle: 'estompeSurvol', defaut: 0.14, dossier: N, libelle: 'estompage au survol', min: 0, max: 0.8, pas: 0.01 },

  // Agrégats
  { cle: 'anneauStatuts', defaut: true, dossier: G, libelle: 'anneau des statuts' },
  { cle: 'epaisseurStatuts', defaut: 2.2, dossier: G, libelle: 'épaisseur anneau', min: 0.5, max: 8, pas: 0.1 },
  { cle: 'ecartStatuts', defaut: 2.2, dossier: G, libelle: 'écart au disque', min: 0, max: 10, pas: 0.1 },
  { cle: 'jeuSegments', defaut: 2, dossier: G, libelle: 'jeu entre segments (px)', min: 0, max: 6, pas: 0.1 },
  { cle: 'teinteAgregat', defaut: 0.68, dossier: G, libelle: 'pâleur du disque', min: 0, max: 0.95, pas: 0.01 },
  { cle: 'filetAgregat', defaut: 1.1, dossier: G, libelle: 'filet du disque', min: 0, max: 4, pas: 0.05 },
  { cle: 'jaugeLignee', defaut: true, dossier: G, libelle: 'jauge de lignée' },
  { cle: 'reductionAxes', defaut: 0.45, dossier: G, libelle: 'réduction en vues temps / type', min: 0, max: 0.8, pas: 0.01 },

  // Arêtes
  { cle: 'courbureAretes', defaut: 0.2, dossier: A, libelle: 'courbure', min: 0, max: 1, pas: 0.01 },
  { cle: 'flechesAretes', defaut: true, dossier: A, libelle: 'pointes de flèche' },

  // Transitions (en plus de durée / courbe du moteur)
  { cle: 'jaillissement', defaut: true, dossier: T, libelle: 'jaillir / se resserrer' },
  { cle: 'raideurRessort', defaut: 10, dossier: T, libelle: 'raideur ressort', min: 3, max: 30, pas: 0.5 },
  { cle: 'amortissement', defaut: 5.5, dossier: T, libelle: 'amortissement', min: 1, max: 14, pas: 0.1 },
  { cle: 'resserrement', defaut: 2.2, dossier: T, libelle: 'resserrement (rentrée)', min: 1, max: 5, pas: 0.1 },
  { cle: 'gonflement', defaut: 0.28, dossier: T, libelle: 'gonflement du parent', min: 0, max: 1.2, pas: 0.01 },

  // Libellés
  { cle: 'libellesAgregats', defaut: true, dossier: L, libelle: 'noms sur les agrégats' },
  { cle: 'tailleNomsAgregats', defaut: 12.5, dossier: L, libelle: 'taille des noms', min: 7, max: 26, pas: 0.5 },
  { cle: 'echellePoids', defaut: 0.9, dossier: L, libelle: 'corps ∝ poids', min: 0, max: 2.5, pas: 0.05 },
  { cle: 'libellesFeuilles', defaut: 14, dossier: L, libelle: 'libellés de nœuds (max)', min: 0, max: 120, pas: 1 },
  { cle: 'haloLibelles', defaut: 3.5, dossier: L, libelle: 'halo papier', min: 0, max: 8, pas: 0.5 },

  // Axes des vues de face et de droite
  { cle: 'axes', defaut: true, dossier: X, libelle: 'règles graduées' },
  { cle: 'grille', defaut: true, dossier: X, libelle: 'grille de fond' },
  { cle: 'opaciteGrille', defaut: 0.8, dossier: X, libelle: 'opacité grille', min: 0, max: 2, pas: 0.05 },
  { cle: 'couloirsTeintes', defaut: true, dossier: X, libelle: 'couloirs de types teintés' },
  { cle: 'policeGraduations', defaut: 11, dossier: X, libelle: 'taille graduations', min: 8, max: 16, pas: 0.5 },
  { cle: 'longueurGraduations', defaut: 5, dossier: X, libelle: 'longueur des traits', min: 2, max: 14, pas: 0.5 },
  { cle: 'regleEcran', defaut: true, dossier: X, libelle: "règles collées au bord" },
  { cle: 'reticule', defaut: true, dossier: X, libelle: 'réticule au survol' },
  { cle: 'barresErreur', defaut: true, dossier: X, libelle: 'étendues en barres d’erreur' },
  { cle: 'repartitionTypes', defaut: true, dossier: X, libelle: 'répartition par type (droite)' },

  // Lignée
  { cle: 'impulsions', defaut: true, dossier: I, libelle: 'impulsions animées' },
  { cle: 'vitesseImpulsions', defaut: 1.1, dossier: I, libelle: 'vitesse (arêtes / s)', min: 0.1, max: 5, pas: 0.05 },
  { cle: 'espacementVagues', defaut: 4, dossier: I, libelle: 'espacement des vagues', min: 1.5, max: 14, pas: 0.5 },
  { cle: 'queueImpulsion', defaut: 0.4, dossier: I, libelle: 'longueur de traîne', min: 0.05, max: 1, pas: 0.01 },
  { cle: 'tailleImpulsion', defaut: 3.4, dossier: I, libelle: 'taille des impulsions', min: 0.5, max: 8, pas: 0.1 },
  { cle: 'anneauSelection', defaut: true, dossier: I, libelle: 'anneau de la sélection' },
  { cle: 'contexteLignee', defaut: 0.55, dossier: I, libelle: 'estompage hors lignée', min: 0.05, max: 1, pas: 0.01 },

  // Fiche
  { cle: 'ficheDetaillee', defaut: false, dossier: S, libelle: 'détail déplié (Espace)' },
  { cle: 'binsHistogramme', defaut: 26, dossier: S, libelle: 'barres de l’histogramme', min: 8, max: 60, pas: 1 },

  // Zoom sémantique (V2)
  { cle: 'zoomSemantique', defaut: 'manuel', dossier: Z, libelle: 'mode', options: { manuel: 'manuel', 'automatique (paliers)': 'paliers', 'automatique (continu)': 'continu' } },
  { cle: 'seuilThemes', defaut: 0.72, dossier: Z, libelle: 'seuil thèmes', min: 0.2, max: 3, pas: 0.01 },
  { cle: 'seuilSousThemes', defaut: 1.5, dossier: Z, libelle: 'seuil sous-thèmes', min: 0.5, max: 6, pas: 0.01 },
  { cle: 'seuilNoeuds', defaut: 3.1, dossier: Z, libelle: 'seuil nœuds', min: 1, max: 12, pas: 0.05 },
  { cle: 'hysteresis', defaut: 0.12, dossier: Z, libelle: 'hystérésis', min: 0, max: 0.4, pas: 0.01 },
  { cle: 'largeurContinu', defaut: 0.25, dossier: Z, libelle: 'largeur (continu)', min: 0.05, max: 0.8, pas: 0.01 },

  // Lentille (V5)
  { cle: 'lentille', defaut: false, dossier: O, libelle: 'lentille active' },
  { cle: 'rayonLentille', defaut: 150, dossier: O, libelle: 'rayon (px)', min: 50, max: 420, pas: 5 },
  { cle: 'profondeurLentille', defaut: 1, dossier: O, libelle: 'profondeur d’ouverture', min: 1, max: 3, pas: 1 },
  { cle: 'delaiOuverture', defaut: 160, dossier: O, libelle: 'délai d’ouverture (ms)', min: 0, max: 1200, pas: 10 },
  { cle: 'delaiFermeture', defaut: 450, dossier: O, libelle: 'délai de fermeture (ms)', min: 0, max: 3000, pas: 10 },
  { cle: 'hysteresisLentille', defaut: 1.25, dossier: O, libelle: 'hystérésis (× rayon)', min: 1, max: 2, pas: 0.01 },
  { cle: 'fisheye', defaut: 1.2, dossier: O, libelle: 'fisheye', min: 0, max: 5, pas: 0.05 },
  { cle: 'grossissement', defaut: 0.5, dossier: O, libelle: 'grossissement', min: 0, max: 2, pas: 0.05 },
  { cle: 'estompeHors', defaut: 0.35, dossier: O, libelle: 'estompe hors lentille', min: 0, max: 1, pas: 0.01 },
  { cle: 'libellesLentille', defaut: 10, dossier: O, libelle: 'libellés dans la lentille (max)', min: 0, max: 40, pas: 1 },
  { cle: 'opaciteCercle', defaut: 0.55, dossier: O, libelle: 'opacité du cercle', min: 0, max: 1, pas: 0.01 },
  { cle: 'lissageLentille', defaut: 120, dossier: O, libelle: 'apparition (ms)', min: 0, max: 600, pas: 10 },

  // Interface
  { cle: 'modePanneau', defaut: 'pousse', dossier: P, libelle: 'panneau gauche', options: { 'pousse le graphe': 'pousse', surimpression: 'surimpression' } },
  { cle: 'palette', defaut: true, dossier: P, libelle: 'palette Ctrl + K' },
  { cle: 'marqueursActivite', defaut: 'onglet', dossier: P, libelle: 'présence des agents', options: { 'onglet Activité ouvert': 'onglet', toujours: 'toujours', jamais: 'jamais' } },
]

/** Valeurs par défaut du moteur surchargées pour la synthèse (papier, figure sobre). */
export const SURCHARGES_MOTEUR: Partial<ReglagesMoteur> & Record<string, ValeurReglage> = {
  tailleNoeud: 4.2,
  tailleAgregat: 0.6,
  tailleImportance: 1.1,
  opaciteAretes: 0.24,
  epaisseurArete: 0.6,
  epaisseurAgregee: 1,
  dureeTransition: 900,
  opaciteEstompe: 0.1,
  seuilLibelle: 4,
  tailleLibelle: 12,
  etendues: 'aucune',
  etenduesCouloirs: false,
  opaciteContexte: 0.3,
}

/** Raccourci de lecture typée. */
export const lire = <T extends ValeurReglage>(v: { reglages: { lire<V extends ValeurReglage>(cle: string): V } }, cle: string): T => v.reglages.lire<T>(cle)
