// R2 · Plan de métro des arguments.
//
// Chaque fil d'argument (sous-problème) est une ligne colorée ; les résultats clés sont des stations,
// les décisions des aiguillages, les hypothèses des terminus de départ, les choix de modélisation des
// zones tarifaires. Les étapes intermédiaires sont rangées dans les tronçons et s'ouvrent au clic.
// Modèle et mise en page : plan.ts ; dessin : rendu.ts ; légende, panneau, fiche : interface.ts.

import {
  clamp, COUCHES, coucheDe, creerVueRaisonnement, enregistrerStrategie, FicheRaisonnement, ficheParDefaut, texteCompteur,
  type Disposition, type ReducteurAreteR, type ReducteurPoint, type VueRaisonnement,
} from '../../src/raisonnement'
import meta from './meta.json'
import { construirePlan, ID_STRATEGIE, pointSur, STRATEGIE_METRO, type PlanM } from './plan'
import { contenuBulle, enrichirFiche, LegendeMetro, SectionMetro } from './interface'
import {
  dessinerDessousMetro, dessinerDessusMetro, fondStation, fractionsDe, lireCouleurs, opaciteStation, traceSous, type EtatMetro,
} from './rendu'

enregistrerStrategie(STRATEGIE_METRO)

const etat: EtatMetro = {
  plan: null,
  deplies: new Set(),
  survolTroncon: null,
  survolLigne: null,
  survolZone: null,
  ligneEpinglee: null,
  lignesMasquees: new Set(),
  couleurs: lireCouleurs(document.body),
  ecran: [],
  fractions: new Map(),
}

/** Le plan n'est actif qu'avec la stratégie R2 (les autres stratégies gardent le rendu de base). */
const actif = (v: VueRaisonnement) => etat.plan !== null && v.lecture?.strategie.id === ID_STRATEGIE

// ─── Réducteurs : sigma ne dessine que les disques des stations (cibles du survol) ──

const reducteurPoint: ReducteurPoint = (info, a, v) => {
  if (!actif(v)) return
  a.libelle = null
  a.forceLibelle = false
  a.surligne = false
  const p = info.point
  if (p >= v.nU) return
  const plan = etat.plan!
  const r = clamp(v.reglages.lire<number>('tailleStation') * v.camera.pixelsParUnite(), 4, 13)
  a.forme = 'cercle'
  a.epaisseurBordure = 0
  const si = plan.stationDe[p]!
  if (si >= 0) {
    const s = plan.stations[si]!
    if (s.horsPlan) {
      // Choix de modélisation et aiguillage de cadre : dans la légende (survol déclenché par elle).
      a.cache = true
      a.opacite = 0
      return
    }
    const o = opaciteStation(v, etat, s)
    a.couleur = fondStation(v, etat, p)
    a.couleurBordure = a.couleur
    a.opacite = o
    a.taille = r * (info.noeud.type === 'resultat' || info.noeud.type === 'theoreme' ? 1.3 : 1) * (s.genre === 'aiguillage' ? 1.2 : 1)
    a.cache = o < 0.02 || info.presence < 0.01
    return
  }
  // Étape : visible seulement si son tronçon est déplié (ou son annexe ouverte par la sélection).
  const ti = plan.tronconDe[p]!, ai = plan.annexeDe[p]!
  const visible = (ti >= 0 && etat.deplies.has(ti)) || (ai >= 0 && v.selection === plan.annexes[ai]!.station)
  if (!visible) {
    a.cache = true
    a.opacite = 0
    return
  }
  a.couleur = etat.couleurs.stationFond
  a.couleurBordure = a.couleur
  a.opacite = 0.95
  a.taille = Math.max(4, r * 0.55)
  a.cache = false
}

const reducteurArete: ReducteurAreteR = (info, a, v) => {
  // Les arêtes de lecture sont remplacées par les tracés des lignes.
  if (actif(v) && info.genre === 'lecture') a.cache = true
}

// ─── Disposition : le plan devient une Disposition de la vue ─────────────────

function dispositionDuPlan(plan: PlanM, v: VueRaisonnement): Disposition {
  const g = plan.lecture
  const nU = g.unites.length
  const masques = g.masques
  const n = nU + masques.length
  const x = new Float32Array(n), z = new Float32Array(n), yCouche = new Float32Array(n)
  const couche = new Int8Array(n), rang = new Int32Array(n).fill(-1)
  const noeuds = g.justification.noeuds
  const W = plan.largeurColonne
  const { x0, y0, y1 } = plan.bornes
  const place = (p: number, px: number, py: number) => { x[p] = px; z[p] = -py }
  for (let p = 0; p < nU; p++) {
    const si = plan.stationDe[p]!
    if (si >= 0) {
      const s = plan.stations[si]!
      place(p, s.x, s.y)
      if (s.genre !== 'zone') rang[p] = s.colonne
      continue
    }
    const ti = plan.tronconDe[p]!
    if (ti >= 0) {
      const t = plan.troncons[ti]!
      const k = t.etapes.indexOf(p)
      const q = pointSur(t.traces[0]!, (k + 1) / (t.etapes.length + 1))
      place(p, q[0], q[1])
      continue
    }
    const ai = plan.annexeDe[p]!
    if (ai >= 0) {
      // Impasse : voie de service en diagonale descendante depuis la station.
      const a = plan.annexes[ai]!
      const s = plan.stations[plan.stationDe[a.station]!]!
      const k = a.etapes.indexOf(p) + 1
      place(p, s.x + k * 0.42, s.y + 0.35 + k * 0.42)
      continue
    }
    place(p, x0, y1)
  }
  // Contexte pur : colonne(s) à gauche du plan (visibles avec les liens complets, touche L).
  const pas = 0.5
  const hauteur = Math.max(1, y1 - y0)
  const parColonne = Math.floor(hauteur / pas) + 1
  const ordre = masques.map((m, k) => ({ m, k })).sort((a, b) => coucheDe(noeuds[a.m]!.type) - coucheDe(noeuds[b.m]!.type))
  const xContexte = masques.length ? x0 - W * 1.4 : NaN
  ordre.forEach(({ k }, i) => {
    const col = Math.floor(i / parColonne)
    place(nU + k, xContexte - col * W * 0.9, y0 + (i % parColonne) * pas)
  })
  const milieu = (COUCHES.length - 1) / 2
  const ecart = v.reglages.valeurs.ecartCouches
  for (let p = 0; p < n; p++) {
    const noeud = p < nU ? noeuds[g.unites[p]!.conclusion]! : noeuds[masques[p - nU]!]!
    couche[p] = coucheDe(noeud.type)
    yCouche[p] = (couche[p]! - milieu) * ecart
  }
  return {
    moteur: 'dagre', nU, masques, x, z, yCouche, couche, rang,
    xRangs: Array.from({ length: plan.colonnes }, (_, c) => c * W),
    xContexte,
    bornes: { xmin: plan.bornes.x0, xmax: plan.bornes.x1, zmin: -plan.bornes.y1, zmax: -plan.bornes.y0 },
  }
}

// ─── Vue ─────────────────────────────────────────────────────────────────────

const dossier = 'Plan de métro'
let section: SectionMetro | undefined
const vue = creerVueRaisonnement(document.getElementById('app')!, {
  id: meta.id,
  strategie: ID_STRATEGIE,
  mode: '2d',
  reglages: { liensSemantiques: true, pastillesContexte: false, ecartCouches: 1.6 },
  reglagesSupplementaires: [
    { cle: 'epaisseurLigne', defaut: 0.1, dossier, libelle: 'épaisseur des lignes', min: 0.03, max: 0.25, pas: 0.005 },
    { cle: 'tailleStation', defaut: 0.13, dossier, libelle: 'taille des stations', min: 0.06, max: 0.3, pas: 0.005 },
    { cle: 'policeStations', defaut: 12, dossier, libelle: 'police des libellés', min: 9, max: 18, pas: 0.5 },
    { cle: 'largeurLibelles', defaut: 132, dossier, libelle: 'largeur des libellés (px)', min: 80, max: 280, pas: 5 },
    { cle: 'estompe', defaut: 0.14, dossier, libelle: 'opacité hors focus', min: 0, max: 1, pas: 0.01 },
    { cle: 'zones', defaut: true, dossier, libelle: 'zones tarifaires' },
    { cle: 'opaciteZones', defaut: 0.75, dossier, libelle: 'opacité des zones', min: 0, max: 1, pas: 0.01 },
    { cle: 'rayonZone', defaut: 0.62, dossier, libelle: 'largeur des zones', min: 0.2, max: 1.5, pas: 0.01 },
    { cle: 'teinteZones', defaut: true, dossier, libelle: 'stations teintées par zone' },
    { cle: 'voiesRejetees', defaut: true, dossier, libelle: 'voies rejetées (aiguillages)' },
    { cle: 'perles', defaut: true, dossier, libelle: 'points des étapes masquées' },
    { cle: 'pastillesValidation', defaut: true, dossier, libelle: 'pastilles de validation' },
    { cle: 'largeurColonne', defaut: 2.4, dossier: 'Plan · mise en page', libelle: 'largeur des colonnes', min: 1.4, max: 4, pas: 0.05 },
    { cle: 'ecartParallele', defaut: 0.17, dossier: 'Plan · mise en page', libelle: 'écart des parallèles', min: 0.08, max: 0.4, pas: 0.01 },
    { cle: 'attractionBande', defaut: 0.25, dossier: 'Plan · mise en page', libelle: 'lignes en bandes', min: 0, max: 2, pas: 0.05 },
  ],
  reducteursNoeud: [reducteurPoint],
  reducteursArete: [reducteurArete],
  dessinerDessous: (c) => { if (actif(c.vue)) dessinerDessousMetro(c, etat) },
  dessinerDessus: (c) => { if (actif(c.vue)) dessinerDessusMetro(c, etat) },
  rendreFiche: (p, v, defaut) => (actif(v) ? enrichirFiche(v, etat, p, defaut) : defaut()),
  panneau: (p, v) => { section = new SectionMetro(p, v, etat, surChangement) },
})
etat.couleurs = lireCouleurs(vue.racine)

// Calques par défaut remplacés par ceux du plan : pastilles de contexte et liens sémantiques.
for (const i of [0, 1]) {
  const f = vue.dessinsDessus[i]
  if (f) vue.dessinsDessus[i] = (c) => { if (!actif(c.vue)) f(c) }
}

const bulle = new FicheRaisonnement(vue.interface)
bulle.element.classList.add('r2-bulle')
const ficheLegende = new FicheRaisonnement(vue.interface)
const legende = new LegendeMetro(vue.interface, vue, etat, surChangement, {
  montrer: (u, ancre) => {
    ficheLegende.afficher(u, enrichirFiche(vue, etat, u, () => ficheParDefaut(vue, u)))
    const rv = vue.racine.getBoundingClientRect()
    const h = ficheLegende.element.getBoundingClientRect().height
    // Au-dessus de la puce (positionner décale de +18 / +14).
    ficheLegende.positionner(ancre.left - rv.left - 18, ancre.top - rv.top - h - 22, vue.racine.clientWidth, vue.racine.clientHeight)
  },
  cacher: () => ficheLegende.masquer(),
})
function surChangement(): void {
  legende.maj()
  section?.maj()
  majCompteur()
  // Place réservée : libellés des terminus à gauche, bandeau de légende en bas.
  vue.margesSures = { gauche: 150, bas: legende.hauteur + 6, droite: -20 }
  vue.demanderRendu()
}

function majCompteur(): void {
  const c = vue.ui.compteur
  const texte = c?.element.querySelector('.rsn-compteur-texte')
  if (!texte) return
  const plan = etat.plan
  if (!actif(vue) || !plan) {
    texte.textContent = texteCompteur(vue.lecture)
    return
  }
  const s = vue.lecture.stats
  const arrets = plan.stations.filter((x) => !x.horsPlan).length
  texte.textContent = `${arrets} arrêts affichés sur ${s.noeudsComplet} nœuds · ${plan.lignes.length} lignes · ${plan.troncons.length} tronçons · ${s.aretesComplet} arêtes de justification`
}

/** Construit le plan pour la lecture courante et l'installe comme disposition. */
function appliquerPlan(anime: boolean): void {
  const R = vue.reglages
  const plan = construirePlan(vue.lecture, {
    largeurColonne: R.lire<number>('largeurColonne'),
    ecartParallele: R.lire<number>('ecartParallele'),
    attractionBande: R.lire<number>('attractionBande'),
  })
  etat.plan = plan
  etat.fractions = new Map()
  for (const t of plan.troncons) t.traces.forEach((tr, k) => etat.fractions.set(`${t.index}:${k}`, fractionsDe(tr)))
  etat.ecran = []
  ;(vue as unknown as { appliquerDisposition(d: Disposition, anime: boolean): void }).appliquerDisposition(dispositionDuPlan(plan, vue), anime)
  surChangement()
  vue.cadrerTout(anime ? undefined : 1)
}

// La disposition de base (dagre / ELK) est remplacée par le plan quand la stratégie R2 est active.
const redisposerBase = vue.redisposer.bind(vue)
vue.redisposer = async (options) => {
  if (vue.lecture.strategie.id !== ID_STRATEGIE) {
    etat.plan = null
    await redisposerBase(options)
    surChangement()
    return
  }
  appliquerPlan(true)
}
// Cadrage : seulement ce qui est visible (stations, pastilles, étapes dépliées, contexte avec L).
const pointsBase = vue.pointsVisibles.bind(vue)
vue.pointsVisibles = () => {
  const plan = etat.plan
  if (!actif(vue) || !plan) return pointsBase()
  const r: number[] = plan.stations.filter((s) => !s.horsPlan).map((s) => s.u)
  for (const i of etat.deplies) r.push(...(plan.troncons[i]?.etapes ?? []))
  if (vue.reglages.valeurs.liensComplets) for (let p = vue.nU; p < vue.nP; p++) r.push(p)
  return r
}

vue.on('lecture', () => {
  etat.deplies.clear()
  etat.survolTroncon = null
  etat.survolLigne = null
})
vue.on('theme', () => {
  etat.couleurs = lireCouleurs(vue.racine)
  surChangement()
})
vue.on('disposition', () => majCompteur())
vue.on('reglage', ({ cle }) => {
  if ((cle === 'largeurColonne' || cle === 'ecartParallele' || cle === 'attractionBande') && actif(vue)) appliquerPlan(true)
})
vue.on('selection', () => vue.demanderRendu())
// En 3D, la légende se replie pour laisser voir les couches ; elle revient en 2D.
vue.on('mode', ({ mode }) => {
  legende.replier(mode === '3d')
  surChangement()
  // La vue a cadré avant ce changement de marges : on recadre pour l'état final (plat ou extrudé).
  if (actif(vue)) vue.cadrer(null, undefined, mode === '3d' ? 1 : 0)
})

// ─── Survol et clic des tronçons ─────────────────────────────────────────────

function majBulle(x: number, y: number): void {
  const plan = etat.plan
  if (!plan || etat.survolTroncon === null || etat.survolLigne === null) return bulle.masquer()
  bulle.afficher(-1, contenuBulle(vue, etat, plan.troncons[etat.survolTroncon]!, etat.survolLigne))
  bulle.positionner(x + vue.scene.offsetLeft, y + vue.scene.offsetTop, vue.racine.clientWidth, vue.racine.clientHeight)
}

vue.scene.addEventListener('pointermove', (e) => {
  if (!actif(vue) || e.pointerType === 'touch') return
  const r = vue.scene.getBoundingClientRect()
  const x = e.clientX - r.left, y = e.clientY - r.top
  const tr = vue.survol === null && !vue.controles.enGeste ? traceSous(etat, vue, x, y) : null
  const t = tr ? tr.troncon : null, l = tr ? tr.ligne : null
  if (t !== etat.survolTroncon || l !== etat.survolLigne) {
    etat.survolTroncon = t
    etat.survolLigne = l
    vue.scene.style.cursor = t !== null ? 'pointer' : ''
    vue.demanderRendu()
  }
  majBulle(x, y)
})
vue.scene.addEventListener('pointerleave', () => {
  etat.survolTroncon = null
  etat.survolLigne = null
  bulle.masquer()
  vue.demanderRendu()
})
vue.scene.addEventListener('click', () => {
  if (!actif(vue) || vue.survol !== null || etat.survolTroncon === null) return
  if (performance.now() - vue.controles.dernierGlisser < 80) return
  basculerTroncon(etat.survolTroncon)
})

function basculerTroncon(i: number): void {
  const plan = etat.plan!
  const t = plan.troncons[i]!
  if (!t.etapes.length) return
  if (etat.deplies.has(i)) etat.deplies.delete(i)
  else {
    etat.deplies.add(i)
    // Tronçon trop court à l'écran pour ses étapes : on cadre dessus.
    const pr = vue.projection
    const long = Math.hypot(pr.x[t.vers]! - pr.x[t.de]!, pr.y[t.vers]! - pr.y[t.de]!)
    if (long / (t.etapes.length + 1) < 26) vue.cadrer([t.de, t.vers, ...t.etapes])
  }
  majBulle(vue.controles.souris.x, vue.controles.souris.y)
  surChangement()
}

// ─── Démarrage ───────────────────────────────────────────────────────────────

appliquerPlan(false)

// Convention : le script de capture lit window.rsnVue.
;(window as unknown as { rsnVue: typeof vue; rsnMetro: EtatMetro }).rsnVue = vue
;(window as unknown as { rsnMetro: EtatMetro }).rsnMetro = etat
