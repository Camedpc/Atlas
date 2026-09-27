// V2 · Cartographie : le graphe comme une carte topographique qu'on explore.
//   - zoom sémantique (la granularité suit le zoom, avec hystérésis) ;
//   - territoires par catégorie (champ de densité → isolignes lissées) qui se fendent quand on zoome,
//     courbes de niveau, toponymes en capitales espacées ;
//   - halo de confiance (rayon = largeur de l'intervalle, couleur = statut) ;
//   - rail d'icônes (Filtres, Couches, Recherche, Sélection), fiche compacte, mini-carte.

import { creerVue, el, type DefinitionReglage, type ReducteurNoeud } from '../../src/core'
import meta from './meta.json'
import { Carte } from './carte'
import { ZoomSemantique, type ModeZoom } from './zoom'
import { MiniCarte } from './minicarte'
import { Rail, creerRenduFiche, legendeCarte, sectionCouches, sectionRecherche } from './interface'

const Z = 'Carte · zoom sémantique'
const TE = 'Carte · territoires'
const TO = 'Carte · toponymes'
const CO = 'Carte · confiance'
const FO = 'Carte · fond et interface'

const REGLAGES: DefinitionReglage[] = [
  { cle: 'zoomSemantique', defaut: 'paliers', dossier: Z, libelle: 'granularité', options: { 'automatique (paliers)': 'paliers', 'automatique (continu)': 'continu', manuel: 'manuel' } },
  { cle: 'seuilThemes', defaut: 0.62, dossier: Z, libelle: 'seuil thèmes (×)', min: 0.2, max: 4, pas: 0.01 },
  { cle: 'seuilSousThemes', defaut: 1.45, dossier: Z, libelle: 'seuil sous-thèmes (×)', min: 0.3, max: 8, pas: 0.01 },
  { cle: 'seuilNoeuds', defaut: 3.1, dossier: Z, libelle: 'seuil nœuds (×)', min: 0.5, max: 16, pas: 0.05 },
  { cle: 'hysteresis', defaut: 0.12, dossier: Z, libelle: 'hystérésis', min: 0, max: 0.5, pas: 0.01 },
  { cle: 'largeurContinu', defaut: 0.28, dossier: Z, libelle: 'largeur (continu)', min: 0.05, max: 1, pas: 0.01 },

  { cle: 'territoires', defaut: true, dossier: TE, libelle: 'territoires' },
  { cle: 'opaciteTerritoires', defaut: 0.17, dossier: TE, libelle: 'opacité', min: 0, max: 0.6, pas: 0.01 },
  { cle: 'douceur', defaut: 0.055, dossier: TE, libelle: 'douceur (rayon)', min: 0.01, max: 0.2, pas: 0.001 },
  { cle: 'resserrement', defaut: 0.74, dossier: TE, libelle: 'resserrement par niveau', min: 0.4, max: 1, pas: 0.01 },
  { cle: 'seuilTerritoire', defaut: 0.42, dossier: TE, libelle: 'seuil du contour', min: 0.05, max: 2, pas: 0.01 },
  { cle: 'finesse', defaut: 3, dossier: TE, libelle: 'finesse de grille', min: 1.5, max: 8, pas: 0.1 },
  { cle: 'budgetCarte', defaut: 7, dossier: TE, libelle: 'budget carte (ms/image)', min: 2, max: 30, pas: 0.5 },
  { cle: 'resolutionMouvement', defaut: 0.65, dossier: TE, libelle: 'résolution en mouvement', min: 0.25, max: 1, pas: 0.05 },
  { cle: 'epaisseurCote', defaut: 1, dossier: TE, libelle: 'épaisseur des côtes', min: 0, max: 3, pas: 0.05 },
  { cle: 'territoiresHorsDessus', defaut: 0, dossier: TE, libelle: 'opacité hors vue 7', min: 0, max: 1, pas: 0.01 },
  { cle: 'rivieres', defaut: true, dossier: TE, libelle: 'rivières (vue temps)' },
  { cle: 'largeurRivieres', defaut: 2.4, dossier: TE, libelle: 'largeur des rivières', min: 0.5, max: 8, pas: 0.1 },
  { cle: 'courbes', defaut: true, dossier: TE, libelle: 'courbes de niveau' },
  { cle: 'nbCourbes', defaut: 4, dossier: TE, libelle: 'nb de courbes', min: 1, max: 10, pas: 1 },
  { cle: 'rapportCourbes', defaut: 1.7, dossier: TE, libelle: 'rapport entre courbes', min: 1.15, max: 4, pas: 0.05 },
  { cle: 'opaciteCourbes', defaut: 0.26, dossier: TE, libelle: 'opacité courbes', min: 0, max: 1, pas: 0.01 },

  { cle: 'toponymes', defaut: true, dossier: TO, libelle: 'toponymes' },
  { cle: 'tailleToponymes', defaut: 12, dossier: TO, libelle: 'taille', min: 7, max: 24, pas: 0.5 },
  { cle: 'espacementToponymes', defaut: 0.2, dossier: TO, libelle: 'espacement lettres (em)', min: 0, max: 0.6, pas: 0.01 },
  { cle: 'opaciteToponymes', defaut: 0.95, dossier: TO, libelle: 'opacité', min: 0, max: 1, pas: 0.01 },
  { cle: 'lisibiliteToponymes', defaut: 0.55, dossier: TO, libelle: 'place exigée', min: 0.1, max: 2, pas: 0.05 },

  { cle: 'halo', defaut: true, dossier: CO, libelle: 'halo de confiance' },
  { cle: 'intensiteHalo', defaut: 0.5, dossier: CO, libelle: 'intensité', min: 0, max: 1.5, pas: 0.01 },
  { cle: 'rayonHalo', defaut: 34, dossier: CO, libelle: 'rayon / largeur intervalle', min: 0, max: 120, pas: 1 },
  { cle: 'haloAgregats', defaut: true, dossier: CO, libelle: 'halo des agrégats' },
  { cle: 'anneauAgregat', defaut: 0.24, dossier: CO, libelle: 'anneau des agrégats', min: 0, max: 0.6, pas: 0.01 },

  { cle: 'graticule', defaut: true, dossier: FO, libelle: 'quadrillage' },
  { cle: 'opaciteGraticule', defaut: 0.06, dossier: FO, libelle: 'opacité quadrillage', min: 0, max: 0.4, pas: 0.005 },
  { cle: 'cadre', defaut: false, dossier: FO, libelle: 'liseré de feuille' },
  { cle: 'miniCarte', defaut: true, dossier: FO, libelle: 'mini-carte' },
]

let carte: Carte | undefined

// Agrégats dessinés comme des « villes » : pastille claire cerclée de la teinte du territoire.
// Leur nom est porté par le toponyme (sauf au survol et à la sélection).
const reducteurCarte: ReducteurNoeud = (info, a, vue) => {
  if (!info.estAgregat || !carte) return
  const c = info.categorie!
  if (vue.reglages.lire<boolean>('toponymes') && info.survol !== 'survole' && info.lignee !== 'selection') a.libelle = null
  if (info.lignee === 'aucune' || info.lignee === 'hors') {
    a.couleur = vue.palette.fond
    a.couleurBordure = carte.teintesTrait[c.index]!
    a.tailleBordure = vue.reglages.lire<number>('anneauAgregat')
  }
}

const vue = creerVue(document.getElementById('app')!, {
  id: meta.id,
  mode: '2d',
  vueInitiale: 'dessus',
  granularite: 1,
  // Les rivières remplacent les capsules d'étendue du moteur (les segments par couloir restent).
  reglages: { tailleAgregat: 0.38, opaciteAretes: 0.16, densiteLibelles: 0.4, etendues: 'aucune' },
  reglagesSupplementaires: REGLAGES,
  reducteursNoeud: [reducteurCarte],
  dessinerDessous: (c) => carte?.dessinerDessous(c),
  dessinerDessus: (c) => carte?.dessinerToponymes(c),
  rendreFiche: creerRenduFiche(() => carte),
})
vue.racine.classList.add('v2-carte')
carte = new Carte(vue)
const zoom = new ZoomSemantique(vue)

// ─── Mise en avant des territoires (survol, lignée) ──────────────────────────

const relies = new Uint8Array(vue.h.nC)
function marquer(u: number): void {
  const { h } = vue
  if (u < h.nF) {
    for (let k = 0; k < 3; k++) relies[h.chaine[u * 3 + k]!] = 1
    return
  }
  const c = h.categorieDe(u)!
  for (let x = c.index; x >= 0; x = h.categories[x]!.parent) relies[x] = 1
  const pile = [...c.enfants]
  while (pile.length) {
    const e = pile.pop()!
    relies[e] = 1
    pile.push(...h.categories[e]!.enfants)
  }
}
function majRelies(): void {
  if (!carte) return
  relies.fill(0)
  if (vue.survol !== null) {
    marquer(vue.survol)
    for (const v of vue.voisinsSurvol) marquer(v)
    carte.definirRelies(relies)
  } else if (vue.lignee.active) {
    const l = vue.lignee
    for (let f = 0; f < vue.h.nF; f++) if (l.graines[f] || l.ancetres[f] || l.descendants[f]) marquer(f)
    carte.definirRelies(relies)
  } else carte.definirRelies(null)
  vue.demanderRendu()
}
vue.on('survol', majRelies)
vue.on('selection', majRelies)
// Tout réglage ou filtre invalide le cache de la carte.
vue.on('reglage', () => carte?.invalider())
vue.on('filtres', () => carte?.invalider())

// ─── Panneau : rail d'icônes et onglets ──────────────────────────────────────

function allerA(u: number): void {
  const { h } = vue
  vue.selectionner(u)
  let unites: number[]
  if (u < h.nF) {
    const st = h.chaine[u * 3 + 2]
    unites = [u, ...h.premisses[u]!, ...h.utilisePar[u]!].filter((f) => h.chaine[f * 3 + 2] === st).slice(0, 24)
    if (zoom.mode === 'manuel') vue.ouvrir(h.parent(u))
  } else unites = [u, ...h.categorieDe(u)!.feuilles]
  vue.camera.cadrer(vue.positionsBase, unites, vue.reglages.valeurs.dureeVues * 1.8, 1.35, vue.zoneSure())
  vue.demanderRendu()
}

const panneau = vue.ui.panneau!
panneau.ajouterSection('couches', 'Couches', sectionCouches(vue, zoom), { position: 'legende' })
panneau.ajouterSection('legende-carte', 'Légende de la carte', legendeCarte(vue), { position: 'legende' })
vue.on('theme', () => panneau.remplacer('legende-carte', legendeCarte(vue)))
const recherche = sectionRecherche(vue, () => carte, allerA)
panneau.ajouterSection('recherche', 'Rechercher', recherche.corps)
const rail = new Rail(vue, panneau, (o) => {
  if (o === 'recherche') window.setTimeout(recherche.focus, 60)
})
window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement | null
  if (e.key === 'Escape' && panneau.ouvert && !(t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) rail.fermer()
})

// ─── Mini-carte ──────────────────────────────────────────────────────────────

const mini = new MiniCarte(vue.interface, vue, carte, zoom)
mini.afficher(vue.reglages.lire<boolean>('miniCarte'))
vue.on('reglage', ({ cle, valeur }) => cle === 'miniCarte' && mini.afficher(valeur as boolean))

// ─── Granularité : le curseur manuel reprend la main ─────────────────────────

const gran = vue.ui.granularite?.element
if (gran) {
  const caseAuto = el('input', { type: 'checkbox' })
  const majCase = () => (caseAuto.checked = zoom.mode !== 'manuel')
  caseAuto.addEventListener('change', () => zoom.definirMode(caseAuto.checked ? 'paliers' : 'manuel'))
  gran.appendChild(el('label', { class: 'v2-gran-auto', title: 'La granularité suit le zoom (zoom sémantique)' }, caseAuto, ' suit le zoom'))
  vue.on('reglage', ({ cle }) => cle === 'zoomSemantique' && majCase())
  majCase()
  // Toucher au curseur ou aux boutons − / + : passage en manuel.
  gran.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('.v2-gran-auto, .atlas-lien')) return
    if (zoom.mode !== 'manuel') zoom.definirMode('manuel' as ModeZoom)
  })
}
window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement | null
  if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
  if ((e.key === '[' || e.key === ']') && zoom.mode !== 'manuel') zoom.definirMode('manuel')
})

// Pratique pour déboguer depuis la console.
;(window as unknown as { atlasVue: typeof vue; atlasCarte: Carte }).atlasVue = vue
;(window as unknown as { atlasCarte: Carte }).atlasCarte = carte
