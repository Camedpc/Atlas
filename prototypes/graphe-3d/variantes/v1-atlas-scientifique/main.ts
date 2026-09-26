// V1 · Atlas scientifique : le graphe comme une figure de revue (Nature, Science).
// Papier blanc cassé, encre, palette désaturée, noms de catégories écrits sur les agrégats,
// anneau de confiance, bordure de validation, enfants qui jaillissent du parent avec un ressort.

import { creerVue, type DefinitionReglage, type VueGraphe } from '../../src/core'
import meta from './meta.json'
import {
  creerEtat, creerReducteurArete, creerReducteurNoeud, dessinerAnneaux, dessinerLibelles, dessinerReperes,
  dessinerTerritoires, majCouleurs, majStatuts, programmesArete, programmesNoeud, type EtatFigure,
} from './figure'
import { ficheFigure } from './fiche'
import { monterCote, monterLegendeFigure } from './cote'

// ─── Réglages propres à la variante (Tweakpane) ─────────────────────────────

const N = 'Figure · nœuds', A = 'Figure · arêtes', T = 'Figure · transitions', L = 'Figure · libellés', F = 'Figure · fond'
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
  { cle: 'epaisseurAnneau', defaut: 1.6, dossier: N, libelle: 'épaisseur anneau', min: 0.4, max: 6, pas: 0.1 },
  { cle: 'ecartAnneau', defaut: 1.4, dossier: N, libelle: 'écart anneau', min: 0, max: 8, pas: 0.1 },
  { cle: 'anneauRayonMin', defaut: 2.5, dossier: N, libelle: 'rayon min. anneau', min: 0, max: 12, pas: 0.5 },
  { cle: 'opaciteIntervalle', defaut: 0.38, dossier: N, libelle: 'opacité intervalle', min: 0, max: 1, pas: 0.01 },
  { cle: 'styleBordure', defaut: 'motif', dossier: N, libelle: 'style bordure', options: { 'simple / double / pleine': 'motif', 'épaisseur graduée': 'epaisseur', aucune: 'aucune' } },
  { cle: 'epaisseurBordure', defaut: 1, dossier: N, libelle: 'épaisseur bordure', min: 0.3, max: 3, pas: 0.05 },
  { cle: 'estompeSurvol', defaut: 0.12, dossier: N, libelle: 'estompage au survol', min: 0, max: 0.8, pas: 0.01 },

  { cle: 'courbureAretes', defaut: 0.22, dossier: A, libelle: 'courbure', min: 0, max: 1, pas: 0.01 },
  { cle: 'flechesAretes', defaut: true, dossier: A, libelle: 'pointes de flèche' },

  { cle: 'jaillissement', defaut: true, dossier: T, libelle: 'jaillir / fondre' },
  { cle: 'raideurRessort', defaut: 11, dossier: T, libelle: 'raideur ressort', min: 3, max: 30, pas: 0.5 },
  { cle: 'amortissement', defaut: 5, dossier: T, libelle: 'amortissement', min: 1, max: 14, pas: 0.1 },
  { cle: 'resserrement', defaut: 2.2, dossier: T, libelle: 'resserrement (fermeture)', min: 1, max: 5, pas: 0.1 },
  { cle: 'gonflement', defaut: 0.35, dossier: T, libelle: 'gonflement du parent', min: 0, max: 1.2, pas: 0.01 },

  { cle: 'libellesAgregats', defaut: true, dossier: L, libelle: 'noms sur agrégats' },
  { cle: 'tailleLibellesAgregats', defaut: 12, dossier: L, libelle: 'taille noms agrégats', min: 7, max: 26, pas: 0.5 },
  { cle: 'echellePoids', defaut: 1, dossier: L, libelle: 'corps ∝ poids', min: 0, max: 2.5, pas: 0.05 },
  { cle: 'libellesFeuilles', defaut: 14, dossier: L, libelle: 'libellés de nœuds (max)', min: 0, max: 120, pas: 1 },
  { cle: 'haloLibelles', defaut: 3.5, dossier: L, libelle: 'halo papier', min: 0, max: 8, pas: 0.5 },
]

// ─── Transitions : jaillir avec ressort, se resserrer puis fondre ──────────

/**
 * Remplace `granularite.calculerPositions` (sur l'instance, le moteur n'est pas modifié) pour
 * connaître le sens de chaque transition par catégorie : à l'ouverture, les enfants jaillissent
 * du parent avec un dépassement amorti ; à la fermeture ils se resserrent (courbe o^γ) puis
 * fondent dans le parent (voir le réducteur : fondu retardé, parent qui gonfle).
 */
function installerTransitions(vue: VueGraphe, etat: EtatFigure): void {
  const g = vue.granularite
  const { h } = vue
  const origine = g.calculerPositions.bind(g)
  const prec = Float32Array.from(g.ouverture)
  g.calculerPositions = (base, sortie, courbe, trajectoire) => {
    for (let c = 0; c < h.nC; c++) {
      const o = g.ouverture[c]!
      const d = o - prec[c]!
      if (Math.abs(d) > 1e-6) etat.sens[c] = d > 0 ? 1 : -1
      prec[c] = o
    }
    const R = vue.reglages
    if (!R.lire<boolean>('jaillissement')) return origine(base, sortie, courbe, trajectoire)
    const a = R.lire<number>('amortissement'), b = R.lire<number>('raideurRessort'), gamma = R.lire<number>('resserrement')
    const placer = (u: number, pu: number, c: number) => {
      const o = g.ouverture[c]!
      const k = o <= 0 ? 0 : o >= 1 ? 1 : etat.sens[c]! > 0 ? 1 - Math.exp(-a * o) * Math.cos(b * o) * (1 - o) : Math.pow(o, gamma)
      for (let i = 0; i < 3; i++) {
        const dep = sortie[pu * 3 + i]!
        sortie[u * 3 + i] = dep + (base[u * 3 + i]! - dep) * k
      }
    }
    for (const cat of h.categories) {
      const u = h.nF + cat.index
      if (cat.parent < 0) {
        sortie[u * 3] = base[u * 3]!
        sortie[u * 3 + 1] = base[u * 3 + 1]!
        sortie[u * 3 + 2] = base[u * 3 + 2]!
      } else placer(u, h.nF + cat.parent, cat.parent)
    }
    for (let f = 0; f < h.nF; f++) {
      const sc = h.chaine[f * 3 + 2]!
      placer(f, h.nF + sc, sc)
    }
  }
}

// ─── Montage ────────────────────────────────────────────────────────────────

let etat: EtatFigure | null = null
const appliquer = <T>(f: (e: EtatFigure) => T) => (etat ? f(etat) : undefined)

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
    dureeTransition: 950,
    opaciteEstompe: 0.1,
    seuilLibelle: 4,
    tailleLibelle: 12,
  },
  reglagesSupplementaires: REGLAGES,
  ui: { panneau: false },
  programmesNoeud,
  programmesArete,
  reducteursArete: [creerReducteurArete()],
  dessinerDessous: (c) => appliquer((e) => {
    dessinerTerritoires(e, c)
    dessinerAnneaux(e, c)
  }),
  dessinerDessus: (c) => appliquer((e) => {
    dessinerReperes(e, c)
    dessinerLibelles(e, c)
  }),
  rendreFiche: (u, v) => ficheFigure(u, v),
})

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
installerTransitions(vue, etat)

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

monterCote(vue, document.getElementById('cote')!, document.getElementById('bouton-cote') as HTMLButtonElement)
monterLegendeFigure(vue)
vue.cadrerTout()

// Les polices web arrivent après le premier rendu : on remesure les libellés.
document.fonts?.ready.then(() => {
  appliquer(majCouleurs)
  vue.demanderRendu()
})

// Pratique pour déboguer depuis la console.
;(window as unknown as { atlasVue: VueGraphe }).atlasVue = vue
