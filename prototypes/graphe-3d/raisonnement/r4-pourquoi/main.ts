// R4 · Lecture progressive : « pourquoi ? ».
//
// À l'ouverture, seulement les résultats principaux (à droite) et les fondations (hypothèses,
// choix de modélisation, décisions de départ, à gauche). Entre les deux, le raisonnement est replié
// en fils munis d'un compteur d'étapes. « pourquoi ? » déplie un niveau de prémisses, qui glissent
// depuis la gauche ; « comment ? » part d'une hypothèse et montre ce qu'elle a permis. Fil d'Ariane,
// lecture guidée (diaporama de la preuve), encarts de décision et ruban de vue d'ensemble.
//
// La vue partagée fournit le rendu (sigma), la 3D, la fiche, le panneau ☰ et Tweakpane ; la vision
// remplace la disposition (seules les unités visibles sont placées) et masque tout le reste.

import {
  creerVueRaisonnement, el, COURBES,
  type Disposition, type ReducteurAreteR, type ReducteurPoint, type VueRaisonnement, type DefinitionReglage,
} from '../../src/raisonnement'
import meta from './meta.json'
import { ModeleDepliage, type PasGuide } from './modele'
import { disposerR4, type ParametresDisposition, type PlacementR4 } from './disposition'
import { Habillage } from './etiquettes'
import { Ruban } from './ruban'
import { InterfaceR4 } from './interface'

const DOSSIER = 'Vision R4 · pourquoi ?'
const REGLAGES_R4: DefinitionReglage[] = [
  { cle: 'sensLecture', defaut: 'pourquoi', dossier: DOSSIER, libelle: 'sens', options: { 'pourquoi ? (vers les prémisses)': 'pourquoi', 'comment ? (vers les suites)': 'comment' } },
  { cle: 'cheminSeul', defaut: false, dossier: DOSSIER, libelle: 'un seul chemin déplié' },
  { cle: 'guideCumulatif', defaut: false, dossier: DOSSIER, libelle: 'lecture guidée cumulative' },
  { cle: 'encarts', defaut: true, dossier: DOSSIER, libelle: 'encarts de décision' },
  { cle: 'ruban', defaut: true, dossier: DOSSIER, libelle: 'ruban d’ensemble' },
  { cle: 'hauteurRuban', defaut: 74, dossier: DOSSIER, libelle: 'hauteur ruban (px)', min: 40, max: 180, pas: 1 },
  { cle: 'ecartColonnes', defaut: 4.2, dossier: DOSSIER, libelle: 'écart colonnes', min: 1.5, max: 10, pas: 0.05 },
  { cle: 'ecartLignes', defaut: 2, dossier: DOSSIER, libelle: 'écart lignes', min: 0.5, max: 3, pas: 0.05 },
  { cle: 'ecartFondations', defaut: 0.62, dossier: DOSSIER, libelle: 'écart fondations', min: 0.4, max: 2, pas: 0.05 },
  { cle: 'colonnesVides', defaut: 1, dossier: DOSSIER, libelle: 'colonnes vides (fils)', min: 0, max: 5, pas: 1 },
  { cle: 'colonnesMin', defaut: 5, dossier: DOSSIER, libelle: 'colonnes min.', min: 2, max: 10, pas: 1 },
  { cle: 'colonneLisible', defaut: 200, dossier: DOSSIER, libelle: 'colonne lisible min. (px)', min: 80, max: 400, pas: 5 },
  { cle: 'tailleEtiquette', defaut: 13, dossier: DOSSIER, libelle: 'taille étiquettes', min: 10, max: 18, pas: 0.5 },
  { cle: 'largeurEtiquette', defaut: 200, dossier: DOSSIER, libelle: 'largeur étiquettes', min: 120, max: 320, pas: 5 },
  { cle: 'opaciteFils', defaut: 0.8, dossier: DOSSIER, libelle: 'opacité des fils', min: 0.1, max: 1, pas: 0.01 },
  { cle: 'opaciteFondations', defaut: 0.45, dossier: DOSSIER, libelle: 'arêtes depuis fondations', min: 0.05, max: 1, pas: 0.01 },
]
const CLES_DISPOSITION = new Set(['ecartColonnes', 'ecartLignes', 'ecartFondations', 'colonnesVides', 'colonnesMin', 'ecartCouches'])

// État de la vision (créé après la vue).
let modele: ModeleDepliage
let habillage: Habillage
let ruban: Ruban
let iface: InterfaceR4
let placement: PlacementR4 | null = null
let dispositionR4: Disposition | null = null
let apparition = new Float32Array(0)
let versionApparition = 0
let arianeSet = new Set<number>()
let sens: 'pourquoi' | 'comment' = 'pourquoi'
let pret = false

// ─── Réducteurs ──────────────────────────────────────────────────────────────

const reducteurNoeud: ReducteurPoint = (info, a, vue) => {
  if (!pret) return
  const p = info.point
  const ap = p < apparition.length && p < modele.nU ? apparition[p]! : 0
  if (ap < 0.01) {
    a.cache = true
    return
  }
  a.opacite *= ap
  // Les étiquettes sont en HTML (lisibles, avec boutons) : pas de libellé sigma.
  a.libelle = null
  a.forceLibelle = false
  if (modele.focus === p && info.lignee === 'aucune') {
    a.couleurBordure = vue.palette.accent
    a.epaisseurBordure = 0.42
    a.surligne = true
  }
}

const reducteurArete: ReducteurAreteR = (info, a, vue) => {
  if (!pret) return
  const s = info.source, c = info.cible
  const as = s < apparition.length ? apparition[s]! : 0, ac = c < apparition.length ? apparition[c]! : 0
  if (as < 0.01 || ac < 0.01) {
    a.cache = true
    return
  }
  a.opacite *= Math.min(as, ac)
  if (info.genre !== 'lecture') return
  // Arête longue : dessinée en arc par l'habillage (2D).
  if (placement && vue.extrusion < 0.5 && !modele.estFondation(s) && placement.colonne[c]! - placement.colonne[s]! >= 2) {
    a.cache = true
    return
  }
  if (modele.estFondation(s) && !arianeSet.has(c)) a.opacite *= vue.reglages.lire<number>('opaciteFondations')
  if (arianeSet.has(s) && arianeSet.has(c) && !vue.ligneeActive) {
    a.couleur = vue.palette.accent
    a.opacite = Math.max(a.opacite, 0.85 * Math.min(as, ac))
    a.taille *= 1.7
    a.zIndex = 4
  }
}

// ─── Vue ─────────────────────────────────────────────────────────────────────

const vue = creerVueRaisonnement(document.getElementById('app')!, {
  id: meta.id,
  mode: '2d',
  reglages: {
    ajusterAspect: false,
    tailleNoeud: 7,
    tailleImportance: 0,
    libelles: 'aucun',
    pastillesContexte: false,
    opaciteAretes: 0.7,
    epaisseurArete: 1.3,
    dureeTransition: 850,
    opaciteContexte: 0.22,
  },
  reglagesSupplementaires: REGLAGES_R4,
  reducteursNoeud: [reducteurNoeud],
  reducteursArete: [reducteurArete],
  dessinerDessous: (c) => { if (pret) habillage.dessiner(c) },
  rendreFiche: (p, _v, defaut) => {
    const f = defaut()
    if (!pret || p >= modele.nU) return f
    const fp = modele.filPourquoi(p), fc = modele.filComment(p)
    const ph = modele.phrase(p)
    const bloc = el('div', { class: 'r4-fiche-lecture' },
      el('div', { class: 'r4-fiche-phrase' }, ph.texte),
      el('div', { class: 'r4-fiche-fils' },
        fp ? el('span', {}, el('b', {}, '‹ pourquoi ? '), `${fp.directs} prémisse(s) repliée(s), ${fp.etapes} étape(s) en amont`) : el('span', { class: 'r4-doux' }, modele.premisses(p).length ? 'Prémisses toutes affichées.' : 'Point de départ : aucune prémisse de lecture.'),
        fc ? el('span', {}, el('b', {}, 'comment ? › '), `${fc.directs} suite(s) repliée(s), ${fc.etapes} étape(s) en aval`) : null,
      ),
    )
    f.insertBefore(bloc, f.querySelector('.rsn-grille'))
    return f
  },
  ui: { compteur: false },
})
;(window as unknown as { rsnVue: VueRaisonnement }).rsnVue = vue

/** Accès à la méthode interne qui installe une disposition (avec transition). */
const interne = vue as unknown as { appliquerDisposition(d: Disposition, anime: boolean): void }

function R<T extends number | boolean | string>(cle: string): T {
  return vue.reglages.lire<T>(cle)
}

function parametres(): ParametresDisposition {
  return {
    ecartColonnes: R('ecartColonnes'), ecartLignes: R('ecartLignes'), ecartFondations: R('ecartFondations'),
    colonnesVides: R('colonnesVides'), colonnesMin: R('colonnesMin'), ecartCouches: vue.reglages.valeurs.ecartCouches,
  }
}

// Survol : l'étiquette HTML d'une unité compte comme l'unité (fiche, voisins en surbrillance).
const pointSousBase = vue.pointSous.bind(vue)
vue.pointSous = (x, y, marge) => pointSousBase(x, y, marge) ?? (pret ? habillage.uniteSous(x, y) : null)

// Seules les unités visibles comptent pour le cadrage (Origine, bouton « Cadrer », bascule 2D/3D).
vue.pointsVisibles = () => {
  const r: number[] = []
  if (!pret) return r
  for (let u = 0; u < modele.nU; u++) if (modele.visible[u]) r.push(u)
  return r
}

// ─── Mise à jour ─────────────────────────────────────────────────────────────

function appliquer(anime: boolean, cadrer = true): void {
  placement = disposerR4(modele, parametres(), vue.lecture.masques)
  habillage.placement = placement
  dispositionR4 = placement.disposition
  interne.appliquerDisposition(dispositionR4, anime)
  arianeSet = new Set(modele.ariane())
  habillage.ariane = arianeSet
  habillage.arcs = []
  for (const a of vue.lecture.aretes) {
    if (!modele.visible[a.source] || !modele.visible[a.cible] || modele.estFondation(a.source)) continue
    if (placement.colonne[a.cible]! - placement.colonne[a.source]! >= 2) habillage.arcs.push({ s: a.source, c: a.cible })
  }
  animerApparition(anime)
  habillage.maj()
  iface.majAriane()
  iface.majOutils(sens)
  ruban.dessiner()
  if (cadrer) cadrerVisible(anime)
}

/** Fondu : les unités qui apparaissent attendent un peu (elles glissent d'abord), celles qui partent s'effacent vite. */
function animerApparition(anime: boolean): void {
  const n = modele.nU
  if (apparition.length !== n) apparition = new Float32Array(n)
  habillage.apparition = apparition
  const depart = apparition.slice()
  const cible = Float32Array.from(modele.visible)
  const version = ++versionApparition
  const appliquerT = (t: number) => {
    if (version !== versionApparition) return
    for (let u = 0; u < n; u++) {
      const d = depart[u]!, c = cible[u]!
      if (c > d) apparition[u] = d + (c - d) * Math.min(1, Math.max(0, (t - 0.18) / 0.62))
      else if (c < d) apparition[u] = d + (c - d) * Math.min(1, t / 0.45)
    }
    vue.demanderRendu()
  }
  if (!anime) {
    appliquerT(1)
    return
  }
  vue.animateur.animer(vue.reglages.valeurs.dureeTransition, appliquerT, {
    courbe: COURBES.douce,
    fin: () => { if (version === versionApparition) habillage.maj() },
  })
}

/** Cadre les unités visibles en réservant la place des étiquettes, du fil d'Ariane, du guide et du ruban. */
function cadrerVisible(anime = true): void {
  const sc = vue.scene.getBoundingClientRect()
  vue.margesSures = {}
  const base = vue.zoneSure()
  const largeur = R<number>('largeurEtiquette')
  const ar = iface.ariane.getBoundingClientRect()
  const hautVoulu = (ar.height ? ar.bottom - sc.top : 90) + 44
  let basVoulu = 16
  const rub = ruban.element.getBoundingClientRect()
  if (rub.height) basVoulu = Math.max(basVoulu, sc.bottom - rub.top + 44)
  const gd = iface.guide.getBoundingClientRect()
  if (iface.enGuide && gd.height) basVoulu = Math.max(basVoulu, sc.bottom - gd.top + 24)
  const dk = habillage.dock.getBoundingClientRect()
  if (habillage.dockVisible && dk.height) basVoulu = Math.max(basVoulu, sc.bottom - dk.top + 30)
  vue.margesSures = {
    haut: Math.max(0, hautVoulu - base.haut),
    bas: Math.max(0, basVoulu - base.bas),
    gauche: largeur + 24,
    droite: Math.max(0, largeur + 36 - base.droite),
  }
  vue.cadrer(pointsACadrer(), anime ? vue.reglages.valeurs.dureeTransition : 1)
}

/**
 * Points du cadrage automatique : tout ce qui est visible si les colonnes restent lisibles
 * (écart ≥ « colonne lisible min. »), sinon une fenêtre de colonnes qui suit le focus (ses
 * prémisses et tout ce qui mène au résultat, dans la limite de la largeur). « Cadrer » montre tout.
 */
function pointsACadrer(): number[] {
  const tous = vue.pointsVisibles()
  if (!placement) return tous
  const sc = vue.scene.getBoundingClientRect()
  const z = vue.zoneSure()
  const disponible = sc.width - z.gauche - z.droite
  const k = Math.max(2, Math.floor(disponible / R<number>('colonneLisible')) + 1)
  const C = placement.C
  if (C + 1 <= k) return tous
  const col = placement.colonne
  const f = modele.focus !== null && modele.visible[modele.focus] ? modele.focus : null
  const cf = f !== null ? col[f]! : C
  // Colonne la plus à gauche utile : les prémisses du focus (ou ses suites en mode « comment »).
  let gauche = cf
  if (f !== null) for (const s of [...modele.premisses(f), ...modele.suites(f)]) if (modele.visible[s]) gauche = Math.min(gauche, col[s]!)
  if (f !== null && sens === 'comment') gauche = Math.max(0, cf - 1)
  const debut = Math.max(0, Math.min(C - k + 1, gauche))
  const fin = debut + k - 1
  return tous.filter((u) => col[u]! >= debut && col[u]! <= fin)
}

// ─── Construction de la vision ───────────────────────────────────────────────

modele = new ModeleDepliage(vue)
habillage = new Habillage(vue, modele, {
  pourquoi: (u) => actionPourquoi(u),
  comment: (u) => actionComment(u),
  replier: (u, s) => { quitterGuideSilencieux(); modele.replier(u, s); appliquer(true) },
  fermerEncart: (u) => { modele.encarts.delete(u); habillage.maj(); vue.demanderRendu(); cadrerVisible(true) },
  survolerUnite: (u) => vue.definirSurvol(u),
  cliquerUnite: (u) => {
    if (performance.now() - vue.controles.dernierGlisser < 120) return
    vue.selectionner(u)
  },
})
ruban = new Ruban(vue, modele, (u) => actionReveler(u))
iface = new InterfaceR4(vue, modele, {
  definirSens: (s) => vue.reglages.definir('sensLecture', s),
  toutReplier: () => { quitterGuideSilencieux(); modele.toutReplier(); vue.selectionner(null); appliquer(true) },
  deplierUnNiveau: () => { quitterGuideSilencieux(); modele.deplierUnNiveau(); appliquer(true) },
  focaliser: (u) => { modele.focus = u; vue.selectionner(u); arianeSet = new Set(modele.ariane()); habillage.ariane = arianeSet; habillage.maj(); iface.majAriane(); vue.cadrer([u], vue.reglages.valeurs.dureeTransition * 0.8) },
  reveler: (u) => actionReveler(u),
  pas: (liste, k) => actionPas(liste, k),
})
if (vue.ui.panneau) iface.sectionsPanneau(vue.ui.panneau)

function quitterGuideSilencieux(): void {
  if (iface.enGuide) iface.quitterGuide()
}

function actionPourquoi(u: number): void {
  quitterGuideSilencieux()
  vue.selectionner(null)
  modele.pourquoi(u, R<boolean>('cheminSeul'))
  appliquer(true)
}

function actionComment(u: number): void {
  quitterGuideSilencieux()
  vue.selectionner(null)
  // « comment ? » fait entrer dans le sens inverse : les suites portent à leur tour « comment ? ».
  if (sens !== 'comment') vue.reglages.definir('sensLecture', 'comment')
  modele.comment(u)
  appliquer(true)
}

function actionReveler(u: number): void {
  quitterGuideSilencieux()
  modele.reveler(u)
  appliquer(true)
  vue.selectionner(u)
}

function actionPas(liste: PasGuide[] | null, k: number): void {
  habillage.dockMasque = liste !== null
  if (!liste) {
    habillage.maj()
    iface.majOutils(sens)
    cadrerVisible(true)
    return
  }
  vue.selectionner(null)
  modele.appliquerPas(liste, k, R<boolean>('guideCumulatif'))
  // Le panneau du guide doit exister avant le cadrage (il réserve sa place en bas).
  requestAnimationFrame(() => cadrerVisible(true))
  appliquer(true, false)
}

function definirSens(s: 'pourquoi' | 'comment'): void {
  sens = s
  habillage.sens = s
  habillage.maj()
  iface.majOutils(s)
  vue.demanderRendu()
}

// Événements de la vue.
vue.on('image', () => { if (pret) habillage.positionner() })
vue.on('disposition', ({ disposition }) => {
  // Une redisposition de la vue (réglage de disposition, stratégie) : on réimpose la nôtre.
  if (pret && disposition !== dispositionR4) appliquer(true)
})
vue.on('lecture', () => {
  if (!pret) return
  const etat = modele.etatIds()
  quitterGuideSilencieux()
  modele.reconstruire(etat.deplies, etat.explicites, etat.comments)
  apparition = new Float32Array(modele.nU)
  habillage.vider()
  ruban.reconstruire()
  if (vue.ui.panneau) iface.majPanneau(vue.ui.panneau)
})
vue.on('selection', ({ point }) => {
  if (!pret) return
  if (point !== null && point < modele.nU && modele.visible[point]) {
    modele.focus = point
    arianeSet = new Set(modele.ariane())
    habillage.ariane = arianeSet
    iface.majAriane()
    habillage.maj()
    ruban.dessiner()
  }
})
vue.on('reglage', ({ cle, valeur }) => {
  if (!pret) return
  if (CLES_DISPOSITION.has(cle)) appliquer(true)
  else if (cle === 'sensLecture') definirSens(valeur as 'pourquoi' | 'comment')
  else if (cle === 'encarts' || cle === 'tailleEtiquette') habillage.maj()
  else if (cle === 'largeurEtiquette') cadrerVisible(true)
  else if (cle === 'ruban' || cle === 'hauteurRuban') majRuban()
  else if (cle === 'guideCumulatif') iface.rejouer()
  else if (cle === 'cheminSeul' && valeur && modele.focus !== null) actionPourquoi(modele.focus)
})
vue.on('theme', () => {
  if (!pret) return
  habillage.maj()
  ruban.dessiner()
  iface.majAriane()
})

function majRuban(): void {
  ruban.element.style.display = R<boolean>('ruban') ? '' : 'none'
  ruban.element.style.setProperty('--hauteur-ruban', `${R<number>('hauteurRuban')}px`)
  ruban.dessiner()
  cadrerVisible(true)
}

// Clavier : P = pourquoi ?, C = comment ? (sur la sélection ou le focus), R = tout replier.
window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement | null
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const cible = vue.selection ?? modele.focus
  if ((e.key === 'p' || e.key === 'P') && cible !== null && cible < modele.nU) actionPourquoi(cible)
  else if ((e.key === 'c' || e.key === 'C') && cible !== null && cible < modele.nU) actionComment(cible)
  else if (e.key === 'r' || e.key === 'R') { quitterGuideSilencieux(); modele.toutReplier(); vue.selectionner(null); appliquer(true) }
  else return
  e.preventDefault()
})

// Redimensionnement : recadrer (la disposition ne dépend pas du format).
let minuterie = 0
new ResizeObserver(() => {
  clearTimeout(minuterie)
  minuterie = window.setTimeout(() => { if (pret) cadrerVisible(false) }, 200)
}).observe(vue.scene)

// Démarrage.
pret = true
sens = R<'pourquoi' | 'comment'>('sensLecture')
habillage.sens = sens
ruban.reconstruire()
majRuban()
appliquer(false)
// Premier cadrage une fois l'interface mesurée.
requestAnimationFrame(() => cadrerVisible(false))
