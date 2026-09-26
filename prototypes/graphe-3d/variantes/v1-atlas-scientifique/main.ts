// V1 · Atlas scientifique : le graphe comme une figure de revue (Nature, Science).
// Papier blanc cassé, encre, palette désaturée, noms de catégories écrits sur les agrégats,
// anneau de confiance, bordure de validation, enfants qui jaillissent du parent avec un ressort,
// vues temps / type en rangées façon forest plot (barres d'intervalle, disque à la médiane).

import { creerVue, el, TRAJECTOIRES, type DefinitionReglage, type NomTrajectoire, type PointTrajectoire, type VueGraphe } from '../../src/core'
import meta from './meta.json'
import {
  creerCrochetRangees, creerEtat, creerReducteurArete, creerReducteurNoeud, dessinerAnneaux, dessinerBarresErreur,
  dessinerLibelles, dessinerReperes, dessinerTerritoires, majCouleurs, majStatuts, programmesArete, programmesNoeud,
  type EtatFigure,
} from './figure'
import { ficheFigure } from './fiche'
import { monterCote, monterLegendeFigure } from './cote'

// ─── Réglages propres à la variante (Tweakpane) ─────────────────────────────

const N = 'Figure · nœuds', A = 'Figure · arêtes', T = 'Figure · transitions', L = 'Figure · libellés', F = 'Figure · fond', V = 'Figure · vues temps / type'
const REGLAGES: DefinitionReglage[] = [
  { cle: 'police', defaut: 'serif', dossier: F, libelle: 'police', options: { 'Source Serif + Inter': 'serif', 'Inter seule': 'inter', 'IBM Plex Serif + Sans': 'plex' } },
  { cle: 'territoires', defaut: true, dossier: F, libelle: 'territoires domaines' },
  { cle: 'margeTerritoire', defaut: 18, dossier: F, libelle: 'marge territoire', min: 0, max: 60, pas: 1 },
  { cle: 'teinteTerritoire', defaut: 0.06, dossier: F, libelle: 'teinte territoire', min: 0, max: 0.3, pas: 0.005 },
  { cle: 'contourTerritoire', defaut: 0.3, dossier: F, libelle: 'contour territoire', min: 0, max: 1, pas: 0.01 },
  { cle: 'grain', defaut: 1, dossier: F, libelle: 'grain du papier', min: 0, max: 2, pas: 0.05 },
  { cle: 'reperes', defaut: true, dossier: F, libelle: "repères d'axes" },
  { cle: 'legendeFigure', defaut: true, dossier: F, libelle: 'légende de figure' },

  { cle: 'anneau', defaut: true, dossier: N, libelle: 'anneau de confiance' },
  { cle: 'rayonDetail', defaut: 6.5, dossier: N, libelle: 'rayon min. du détail (px)', min: 0, max: 14, pas: 0.5 },
  { cle: 'tailleSuitZoom', defaut: 0.55, dossier: N, libelle: 'taille ∝ zoom (exposant)', min: 0, max: 1, pas: 0.05 },
  { cle: 'epaisseurAnneau', defaut: 1.6, dossier: N, libelle: 'épaisseur anneau', min: 0.4, max: 6, pas: 0.1 },
  { cle: 'ecartAnneau', defaut: 1.4, dossier: N, libelle: 'écart anneau', min: 0, max: 8, pas: 0.1 },
  { cle: 'anneauRayonMin', defaut: 2.5, dossier: N, libelle: 'rayon min. anneau', min: 0, max: 12, pas: 0.5 },
  { cle: 'opaciteIntervalle', defaut: 0.38, dossier: N, libelle: 'opacité intervalle', min: 0, max: 1, pas: 0.01 },
  { cle: 'styleBordure', defaut: 'motif', dossier: N, libelle: 'style bordure', options: { 'simple / double / pleine': 'motif', 'épaisseur graduée': 'epaisseur', aucune: 'aucune' } },
  { cle: 'epaisseurBordure', defaut: 1, dossier: N, libelle: 'épaisseur bordure', min: 0.3, max: 3, pas: 0.05 },
  { cle: 'estompeSurvol', defaut: 0.16, dossier: N, libelle: 'estompage au survol', min: 0, max: 0.8, pas: 0.01 },

  { cle: 'courbureAretes', defaut: 0.22, dossier: A, libelle: 'courbure', min: 0, max: 1, pas: 0.01 },
  { cle: 'flechesAretes', defaut: true, dossier: A, libelle: 'pointes de flèche' },

  { cle: 'rangees', defaut: true, dossier: V, libelle: 'rangées (forest plot)' },
  { cle: 'libellesRangeesMax', defaut: 24, dossier: V, libelle: 'noms de rangées (max)', min: 0, max: 80, pas: 1 },

  { cle: 'jaillissement', defaut: true, dossier: T, libelle: 'jaillir / fondre' },
  { cle: 'raideurRessort', defaut: 11, dossier: T, libelle: 'raideur ressort', min: 3, max: 30, pas: 0.5 },
  { cle: 'amortissement', defaut: 5, dossier: T, libelle: 'amortissement', min: 1, max: 14, pas: 0.1 },
  { cle: 'resserrement', defaut: 2.2, dossier: T, libelle: 'resserrement (fermeture)', min: 1, max: 5, pas: 0.1 },
  { cle: 'gonflement', defaut: 0.35, dossier: T, libelle: 'gonflement du parent', min: 0, max: 1.2, pas: 0.01 },

  { cle: 'libellesAgregats', defaut: true, dossier: L, libelle: 'noms sur agrégats' },
  { cle: 'tailleLibellesAgregats', defaut: 12, dossier: L, libelle: 'taille noms agrégats', min: 7, max: 26, pas: 0.5 },
  { cle: 'echellePoids', defaut: 1, dossier: L, libelle: 'corps ∝ poids', min: 0, max: 2.5, pas: 0.05 },
  { cle: 'libellesFeuilles', defaut: 14, dossier: L, libelle: 'libellés de nœuds (max)', min: 0, max: 120, pas: 1 },
  { cle: 'hysteresisLibelles', defaut: 0.6, dossier: L, libelle: 'hystérésis (bonus affiché)', min: 0, max: 3, pas: 0.05 },
  { cle: 'haloLibelles', defaut: 3.5, dossier: L, libelle: 'halo papier', min: 0, max: 8, pas: 0.5 },
]

// ─── Transitions : jaillir avec ressort, se resserrer puis fondre ──────────

let vueCourante: VueGraphe | null = null

/**
 * Trajectoire (API du moteur : `p.o` ouverture brute du parent, `p.sens`). Ouverture : les
 * enfants jaillissent du parent avec un dépassement amorti, k(o) = 1 − e^(−a·o)·cos(b·o)·(1 − o).
 * Fermeture : ils se resserrent d'abord, k(o) = o^γ ; le réducteur retarde leur fondu et fait
 * gonfler le parent.
 */
function trajectoireFigure(p: PointTrajectoire): void {
  const v = vueCourante
  if (!v || !v.reglages.lire<boolean>('jaillissement')) {
    const nom = (v?.reglages.valeurs.trajectoire ?? 'droite') as NomTrajectoire
    return (TRAJECTOIRES[nom] ?? TRAJECTOIRES.droite)(p)
  }
  const o = p.o ?? p.t
  const sens = p.sens ?? 0
  let k: number
  if (o <= 0) k = 0
  else if (o >= 1) k = 1
  else if (sens > 0) {
    const a = v.reglages.lire<number>('amortissement'), b = v.reglages.lire<number>('raideurRessort')
    k = 1 - Math.exp(-a * o) * Math.cos(b * o) * (1 - o)
  } else if (sens < 0) k = Math.pow(o, v.reglages.lire<number>('resserrement'))
  else k = p.t
  p.x = p.dx + (p.ax - p.dx) * k
  p.y = p.dy + (p.ay - p.dy) * k
  p.z = p.dz + (p.az - p.dz) * k
}

// ─── Montage ────────────────────────────────────────────────────────────────

let etat: EtatFigure | null = null
const appliquer = <T>(f: (e: EtatFigure) => T) => (etat ? f(etat) : undefined)

// Le panneau du moteur est monté en mode « externe » dans notre colonne, qui pousse #app.
const cote = document.getElementById('cote')!
const interieur = el('div', { class: 'v1-cote-interieur' })
cote.appendChild(interieur)

const vue = creerVue(document.getElementById('app')!, {
  id: meta.id,
  mode: '2d',
  vueInitiale: 'dessus',
  granularite: 1,
  reglages: {
    tailleNoeud: 4.4,
    tailleAgregat: 0.62,
    tailleImportance: 1.1,
    opaciteAretes: 0.26,
    epaisseurArete: 0.6,
    epaisseurAgregee: 1,
    dureeTransition: 800,
    opaciteEstompe: 0.1,
    seuilLibelle: 4,
    tailleLibelle: 12,
  },
  reglagesSupplementaires: REGLAGES,
  ui: { panneauMode: 'externe', conteneurPanneau: interieur },
  programmesNoeud,
  programmesArete,
  trajectoire: trajectoireFigure,
  etenduesParDefaut: false,
  reducteursArete: [creerReducteurArete()],
  apresPositions: (c) => appliquer((e) => rangees(e)(c)),
  dessinerDessous: (c) => appliquer((e) => {
    dessinerTerritoires(e, c)
    dessinerBarresErreur(e, c)
    dessinerAnneaux(e, c)
  }),
  dessinerDessus: (c) => appliquer((e) => {
    dessinerReperes(e, c)
    dessinerLibelles(e, c)
  }),
  rendreFiche: (u, v) => ficheFigure(u, v),
})
vueCourante = vue

let crochetRangees: ReturnType<typeof creerCrochetRangees> | null = null
const rangees = (e: EtatFigure) => (crochetRangees ??= creerCrochetRangees(e))

const racine = vue.racine
racine.classList.add('v1')
const appliquerPolice = () => {
  const police = vue.reglages.lire<string>('police')
  document.body.dataset.police = police
  racine.dataset.police = police
}
const appliquerGrain = () => racine.style.setProperty('--grain', String(vue.reglages.lire<number>('grain')))
appliquerPolice()
appliquerGrain()
document.body.dataset.theme = vue.reglages.valeurs.theme
// Relit la palette maintenant que les variables de la variante s'appliquent.
vue.definirTheme(vue.reglages.valeurs.theme)

etat = creerEtat(vue)
vue.ajouterReducteurNoeud(creerReducteurNoeud(etat))

vue.on('theme', ({ theme }) => {
  document.body.dataset.theme = theme
  appliquer(majCouleurs)
})
vue.on('filtres', () => appliquer(majStatuts))
vue.on('reglage', ({ cle }) => {
  if (cle === 'police') {
    appliquerPolice()
    vue.definirTheme(vue.reglages.valeurs.theme)
  } else if (cle === 'grain') appliquerGrain()
})

monterCote(vue, cote, document.getElementById('bouton-cote') as HTMLButtonElement)
monterLegendeFigure(vue)

// Les polices web arrivent après le premier rendu : on remesure les libellés.
document.fonts?.ready.then(() => {
  appliquer(majCouleurs)
  vue.demanderRendu()
})

// Pratique pour déboguer depuis la console et pour les captures.
;(window as unknown as { atlasVue: VueGraphe }).atlasVue = vue
