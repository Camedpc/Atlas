// Vue de base réutilisable du graphe de raisonnement : `creerVueRaisonnement(conteneur, options)`.
//
// Rendu sigma (WebGL) en 2D : le graphe de lecture disposé de gauche à droite, pan / zoom, survol
// avec fiche, clic = lignée dans le graphe de lecture, option « liens complets ». Bascule 3D :
// le graphe est extrudé en profondeur (Y monde = couche de type) et la caméra façon Blender
// (reprise de src/core : camera3d, controles, gizmo) pivote en vue de côté.
//
// Comme dans src/core, sigma ne gère ni caméra ni disposition : on projette nous-mêmes les
// positions 3D et on écrit les coordonnées écran dans les attributs (bbox fixe [-1,1]²).

import Sigma from 'sigma'
import Graph from 'graphology'
import type { Attributes } from 'graphology-types'
import { EdgeRectangleProgram, createEdgeArrowProgram } from 'sigma/rendering'
import type { NodeDisplayData, EdgeDisplayData } from 'sigma/types'

import { Animateur, COURBES, Emetteur, type Courbe } from '../core/anim'
import { rgba, rgbaGL } from '../core/couleurs'
import { Camera3D, ORIENTATIONS, Projection, type Marges, type NomVue } from '../core/camera3d'
import { Controles, type ActionsControles } from '../core/controles'
import { Gizmo } from '../core/gizmo'
import { quat } from '../core/maths'
import { Reglages, type DefinitionReglage, type ValeurReglage } from '../core/reglages'

import { couper, FORME_TYPE, lirePaletteR, TAILLE_TYPE, type PaletteR } from './apparence'
import {
  dependantsDe, type GrapheJustification, type JeuRaisonnement, type NoeudR, type RolePremisse, type TypeRaisonnement,
} from './donnees'
import { COUCHES, disposer, disposerAsync, OPTIONS_DISPOSITION, type Disposition, type OptionsDisposition } from './disposition'
import { CODE_FORME, ProgrammeFormes, type Forme } from './formes'
import {
  deriverLecture, ligneeLecture, STRATEGIES, strategie as strategieParId,
  type AreteLecture, type GrapheLecture, type ParametresLecture, type StrategieLecture, type UniteLecture,
} from './lecture'
import { BarreRaisonnement, Compteur, FicheRaisonnement, ficheParDefaut, PanneauRaisonnement } from './ui'
import './style.css'

// ─── Types publics ───────────────────────────────────────────────────────────

export type RoleLigneeR = 'aucune' | 'selection' | 'ancetre' | 'descendant' | 'hors'

/** Contexte d'un point passé aux réducteurs (objet réutilisé : ne pas le conserver). */
export interface InfoPoint {
  point: number
  /** 'noeud' ou 'etape' (unité de lecture), 'masque' (contexte pur, colonne de gauche). */
  genre: 'noeud' | 'etape' | 'masque'
  unite: UniteLecture | undefined
  /** Nœud de justification représenté (la conclusion pour une étape). */
  indexNoeud: number
  noeud: NoeudR
  type: TypeRaisonnement
  couche: number
  rang: number
  /** Nombre de prémisses de contexte rattachées. */
  nbContexte: number
  /** Nombre de descendants dans le graphe de lecture, normalisé 0…1. */
  importance: number
  /** Présence (0…1) : les masqués n'apparaissent qu'avec les liens complets. */
  presence: number
  x: number
  y: number
  profondeur: number
  echelle: number
  visible: boolean
  survol: 'aucun' | 'survole' | 'voisin' | 'autre'
  lignee: RoleLigneeR
}

/** Apparence d'un point, modifiable par les réducteurs. */
export interface AffichagePoint {
  /** Couleur CSS opaque. */
  couleur: string
  opacite: number
  /** Rayon en pixels. */
  taille: number
  forme: Forme
  couleurBordure: string
  /** Épaisseur de bordure, part du rayon (0…1). */
  epaisseurBordure: number
  libelle: string | null
  forceLibelle: boolean
  cache: boolean
  zIndex: number
  /** Surligné : sigma dessine sa pastille de survol. */
  surligne: boolean
}

export interface InfoAreteR {
  /** 'lecture' : arête du graphe de lecture ; 'complete' : arête(s) du graphe de justification. */
  genre: 'lecture' | 'complete'
  source: number
  cible: number
  lecture: AreteLecture | undefined
  /** Arêtes complètes représentées. */
  completes: number[]
  /** Rôle le plus fort parmi les arêtes complètes. */
  role: RolePremisse
  survol: 'aucun' | 'incidente' | 'autre'
  lignee: boolean
  opaciteSource: number
  opaciteCible: number
}

export interface AffichageAreteR {
  couleur: string
  opacite: number
  taille: number
  cache: boolean
  zIndex: number
  /** 'fleche' (défaut pour la lecture) ou 'ligne'. */
  type: 'fleche' | 'ligne'
}

export type ReducteurPoint = (info: InfoPoint, a: AffichagePoint, vue: VueRaisonnement) => void
export type ReducteurAreteR = (info: InfoAreteR, a: AffichageAreteR, vue: VueRaisonnement) => void

export interface ContexteDessinR {
  ctx: CanvasRenderingContext2D
  vue: VueRaisonnement
  largeur: number
  hauteur: number
  projection: Projection
  temps: number
}
export type DessinR = (c: ContexteDessinR) => void
export type RenduFicheR = (point: number, vue: VueRaisonnement, defaut: () => HTMLElement) => HTMLElement | string | null

export interface OptionsUIR {
  panneau: boolean
  panneauOuvert: boolean
  reglages: boolean
  gizmo: boolean
  barre: boolean
  fiche: boolean
  compteur: boolean
}

export interface OptionsVueRaisonnement {
  /** Clé de mémorisation des réglages (localStorage). */
  id?: string
  jeu: JeuRaisonnement
  /** Stratégie de lecture initiale (id ou objet). */
  strategie?: string | StrategieLecture
  parametresLecture?: Partial<ParametresLecture>
  disposition?: Partial<OptionsDisposition>
  mode?: '2d' | '3d'
  /** Surcharges des valeurs par défaut des réglages (thème, tailles…). */
  reglages?: Partial<Record<string, ValeurReglage>>
  reglagesSupplementaires?: DefinitionReglage[]
  reducteursNoeud?: ReducteurPoint[]
  reducteursArete?: ReducteurAreteR[]
  dessinerDessous?: DessinR
  dessinerDessus?: DessinR
  rendreFiche?: RenduFicheR
  panneau?: (p: PanneauRaisonnement, vue: VueRaisonnement) => void
  ui?: Partial<OptionsUIR>
  /** Orientation 3D (vue de côté) : direction cible → œil. */
  directionCote?: [number, number, number]
}

export interface EvenementsVueR {
  survol: { point: number | null }
  selection: { point: number | null }
  lecture: { lecture: GrapheLecture }
  disposition: { disposition: Disposition }
  mode: { mode: '2d' | '3d' }
  theme: { theme: 'clair' | 'sombre' }
  reglage: { cle: string; valeur: ValeurReglage }
  image: { temps: number; dt: number }
}

// ─── Réglages ────────────────────────────────────────────────────────────────

export interface ReglagesRaisonnement {
  theme: 'clair' | 'sombre'
  couleur: 'couche' | 'statut' | 'sousProbleme' | 'origine'
  tailleNoeud: number
  tailleImportance: number
  epaisseurArete: number
  opaciteAretes: number
  fleches: boolean
  libelles: 'auto' | 'importants' | 'aucun'
  densiteLibelles: number
  tailleLibelle: number
  longueurLibelle: number
  pastillesContexte: boolean
  liensSemantiques: boolean
  strategie: string
  liensComplets: boolean
  opaciteLiensComplets: number
  moteur: 'dagre' | 'elk'
  classement: OptionsDisposition['classement']
  ecartRangs: number
  ecartNoeuds: number
  ecartCouches: number
  ajusterAspect: boolean
  champVision: number
  dureeTransition: number
  sensibiliteOrbite: number
  vitesseZoom: number
  inertie: number
  brouillard: number
  plansCouches: boolean
  descendants: boolean
  opaciteContexte: number
}

const optionsStrategies = () => Object.fromEntries(STRATEGIES.map((s) => [s.nom, s.id]))

export function definitionsRaisonnement(): DefinitionReglage[] {
  return [
    { cle: 'theme', defaut: 'clair', dossier: 'Apparence', libelle: 'thème', options: { clair: 'clair', sombre: 'sombre' } },
    { cle: 'couleur', defaut: 'couche', dossier: 'Apparence', libelle: 'couleur', options: { 'type (couche)': 'couche', statut: 'statut', 'sous-problème': 'sousProbleme', origine: 'origine' } },
    { cle: 'tailleNoeud', defaut: 5, dossier: 'Apparence', libelle: 'taille nœud', min: 2, max: 14, pas: 0.1 },
    { cle: 'tailleImportance', defaut: 0.5, dossier: 'Apparence', libelle: 'bonus importance', min: 0, max: 2, pas: 0.05 },
    { cle: 'epaisseurArete', defaut: 1, dossier: 'Apparence', libelle: 'épaisseur arêtes', min: 0.3, max: 4, pas: 0.05 },
    { cle: 'opaciteAretes', defaut: 0.5, dossier: 'Apparence', libelle: 'opacité arêtes', min: 0.05, max: 1, pas: 0.01 },
    { cle: 'fleches', defaut: true, dossier: 'Apparence', libelle: 'flèches' },
    { cle: 'pastillesContexte', defaut: true, dossier: 'Apparence', libelle: 'pastilles de contexte' },
    { cle: 'liensSemantiques', defaut: true, dossier: 'Apparence', libelle: 'contradictions / résolutions' },
    { cle: 'libelles', defaut: 'auto', dossier: 'Libellés', libelle: 'stratégie', options: { automatique: 'auto', 'importants seulement': 'importants', aucun: 'aucun' } },
    { cle: 'densiteLibelles', defaut: 1, dossier: 'Libellés', libelle: 'densité', min: 0, max: 4, pas: 0.05 },
    { cle: 'tailleLibelle', defaut: 12, dossier: 'Libellés', libelle: 'taille police', min: 8, max: 20, pas: 1 },
    { cle: 'longueurLibelle', defaut: 34, dossier: 'Libellés', libelle: 'longueur max.', min: 10, max: 80, pas: 1 },
    { cle: 'strategie', defaut: 'defaut', dossier: 'Lecture', libelle: 'stratégie', options: optionsStrategies() },
    { cle: 'liensComplets', defaut: false, dossier: 'Lecture', libelle: 'liens complets' },
    { cle: 'opaciteLiensComplets', defaut: 0.3, dossier: 'Lecture', libelle: 'opacité liens complets', min: 0.02, max: 1, pas: 0.01 },
    { cle: 'moteur', defaut: 'dagre', dossier: 'Disposition', libelle: 'moteur', options: { dagre: 'dagre', 'ELK layered': 'elk' } },
    { cle: 'classement', defaut: 'ancre', dossier: 'Disposition', libelle: 'rangs (dagre)', options: { 'ancré (fondations à gauche)': 'ancre', 'toutes les sources à gauche': 'sources', 'network-simplex': 'network-simplex', 'longest-path': 'longest-path', 'tight-tree': 'tight-tree' } },
    { cle: 'ecartRangs', defaut: OPTIONS_DISPOSITION.ecartRangs, dossier: 'Disposition', libelle: 'écart rangs', min: 40, max: 400, pas: 5 },
    { cle: 'ecartNoeuds', defaut: OPTIONS_DISPOSITION.ecartNoeuds, dossier: 'Disposition', libelle: 'écart nœuds', min: 6, max: 80, pas: 1 },
    { cle: 'ecartCouches', defaut: OPTIONS_DISPOSITION.ecartCouches, dossier: 'Disposition', libelle: 'écart couches 3D', min: 0.2, max: 4, pas: 0.05 },
    { cle: 'ajusterAspect', defaut: true, dossier: 'Disposition', libelle: "étirer à l'écran" },
    { cle: 'champVision', defaut: 35, dossier: '3D', libelle: 'champ de vision', min: 10, max: 90, pas: 1 },
    { cle: 'dureeTransition', defaut: 750, dossier: '3D', libelle: 'durée transitions (ms)', min: 0, max: 3000, pas: 10 },
    { cle: 'sensibiliteOrbite', defaut: 0.006, dossier: '3D', libelle: 'sensibilité orbite', min: 0.001, max: 0.02, pas: 0.0005 },
    { cle: 'vitesseZoom', defaut: 1.2, dossier: '3D', libelle: 'vitesse zoom', min: 1.02, max: 2, pas: 0.01 },
    { cle: 'inertie', defaut: 200, dossier: '3D', libelle: 'inertie (ms)', min: 0, max: 1200, pas: 10 },
    { cle: 'brouillard', defaut: 0.35, dossier: '3D', libelle: 'brouillard', min: 0, max: 1, pas: 0.01 },
    { cle: 'plansCouches', defaut: true, dossier: '3D', libelle: 'plans des couches' },
    { cle: 'descendants', defaut: true, dossier: 'Lignée', libelle: 'inclure descendants' },
    { cle: 'opaciteContexte', defaut: 0.16, dossier: 'Lignée', libelle: 'opacité du reste', min: 0, max: 1, pas: 0.01 },
  ]
}

const UI_DEFAUT: OptionsUIR = { panneau: true, panneauOuvert: false, reglages: true, gizmo: true, barre: true, fiche: true, compteur: true }
const TOLERANCE = 4

// ─── Vue ─────────────────────────────────────────────────────────────────────

export class VueRaisonnement {
  readonly id: string
  readonly racine: HTMLElement
  readonly scene: HTMLElement
  readonly interface: HTMLElement
  jeu: JeuRaisonnement
  readonly reglages: Reglages<ReglagesRaisonnement>
  readonly camera = new Camera3D()
  readonly animateur = new Animateur()
  readonly graphe: Graph
  readonly sigma: Sigma
  readonly controles: Controles
  readonly calqueDessous: HTMLCanvasElement
  readonly calqueDessus: HTMLCanvasElement
  palette: PaletteR
  lecture!: GrapheLecture
  disposition!: Disposition
  /** Nombre de points (unités + masqués) et d'unités. */
  nP = 0
  nU = 0
  /** Positions 3D affichées (3 × nP), projection écran, opacité et rayon finaux (après réducteurs). */
  positions = new Float32Array(0)
  projection = new Projection(0)
  opaciteAffichee = new Float32Array(0)
  tailleAffichee = new Float32Array(0)
  /** Présence des points (0…1) : animée (apparition des masqués, nouveaux points). */
  presence = new Float32Array(0)
  /** Extrusion 3D (0 = plat, 1 = couches écartées). */
  extrusion = 0
  mode: '2d' | '3d'
  survol: number | null = null
  voisinsSurvol = new Set<number>()
  selection: number | null = null
  /** Vrai si la mise en avant courante est une portée (montrerPortee) plutôt qu'une lignée. */
  porteeActive = false
  /** Rôle de lignée par point (Uint8Array : 0 aucun, 1 ancêtre, 2 descendant, 3 sélection). */
  lignee = new Uint8Array(0)
  ligneeActive = false
  /** Importance normalisée des unités (descendants dans le graphe de lecture). */
  importance = new Float32Array(0)
  margesSures: Partial<Marges> = {}
  rendreFiche: RenduFicheR | null
  readonly reducteursNoeud: ReducteurPoint[] = []
  readonly reducteursArete: ReducteurAreteR[] = []
  readonly dessinsDessous: DessinR[] = []
  readonly dessinsDessus: DessinR[] = []
  readonly ui: { panneau?: PanneauRaisonnement; fiche?: FicheRaisonnement; barre?: BarreRaisonnement; compteur?: Compteur; gizmo?: Gizmo; reglages?: HTMLElement } = {}

  private evenements = new Emetteur<EvenementsVueR>()
  private parametresLecture: Partial<ParametresLecture>
  private optionsDisposition: Partial<OptionsDisposition>
  private strategieCourante: StrategieLecture
  private depart = new Float32Array(0)
  private arrivee = new Float32Array(0)
  private presenceDepart = new Float32Array(0)
  private presenceArrivee = new Float32Array(0)
  private attributs: Attributes[] = []
  private raf = 0
  private dernierT = 0
  private continu = 0
  private orientationCote: [number, number, number, number]
  private versionDisposition = 0
  private info: InfoPoint
  private infoArete: InfoAreteR
  private observateur: ResizeObserver
  private largeur = 1
  private hauteur = 1
  private ratio = 1
  private premiereImage = true

  constructor(conteneur: HTMLElement, options: OptionsVueRaisonnement) {
    this.id = options.id ?? 'raisonnement'
    this.racine = document.createElement('div')
    this.racine.className = 'rsn-vue'
    this.scene = document.createElement('div')
    this.scene.className = 'rsn-scene'
    this.interface = document.createElement('div')
    this.interface.className = 'rsn-interface'
    this.racine.append(this.scene, this.interface)
    conteneur.appendChild(this.racine)

    this.reglages = new Reglages<ReglagesRaisonnement>(`atlas-raisonnement:${this.id}`, [...definitionsRaisonnement(), ...(options.reglagesSupplementaires ?? [])], options.reglages ?? {})
    const R = this.reglages.valeurs
    this.racine.dataset.theme = R.theme
    this.palette = lirePaletteR(this.racine)
    this.jeu = options.jeu
    this.parametresLecture = options.parametresLecture ?? {}
    this.optionsDisposition = options.disposition ?? {}
    this.rendreFiche = options.rendreFiche ?? null
    this.reducteursNoeud.push(...(options.reducteursNoeud ?? []))
    this.reducteursArete.push(...(options.reducteursArete ?? []))
    this.dessinsDessous.push(dessinerPlansCouches)
    if (options.dessinerDessous) this.dessinsDessous.push(options.dessinerDessous)
    this.dessinsDessus.push(dessinerPastillesContexte, dessinerLiensSemantiques, dessinerEnteteContexte)
    if (options.dessinerDessus) this.dessinsDessus.push(options.dessinerDessus)
    this.orientationCote = quat.regarderDepuis(options.directionCote ?? [1.0, -0.95, 0.55])
    if (options.strategie) {
      const s = typeof options.strategie === 'string' ? strategieParId(options.strategie) : options.strategie
      if (typeof options.strategie !== 'string' && !STRATEGIES.includes(s)) STRATEGIES.push(s)
      this.reglages.valeurs.strategie = s.id
    }
    this.strategieCourante = strategieParId(this.reglages.valeurs.strategie)

    this.info = {
      point: 0, genre: 'noeud', unite: undefined, indexNoeud: 0, noeud: this.jeu.noeuds[0]!, type: 'lemme', couche: 0, rang: 0, nbContexte: 0,
      importance: 0, presence: 1, x: 0, y: 0, profondeur: 0, echelle: 1, visible: true, survol: 'aucun', lignee: 'aucune',
    }
    this.infoArete = { genre: 'lecture', source: 0, cible: 0, lecture: undefined, completes: [], role: 'principale', survol: 'aucun', lignee: false, opaciteSource: 1, opaciteCible: 1 }

    // Caméra : vue de face (X à droite, Z en haut), Y = profondeur des couches.
    this.mode = options.mode ?? '2d'
    this.camera.verrou2D = this.mode === '2d'
    this.camera.champVision = R.champVision
    this.camera.distanceMax = 400
    this.camera.courbeAnimations = COURBES.douce
    this.camera.definirOrientation(this.mode === '2d' ? ORIENTATIONS.face : this.orientationCote)
    this.extrusion = this.mode === '3d' ? 1 : 0

    // sigma
    this.graphe = new Graph({ type: 'directed', multi: true, allowSelfLoops: false })
    this.mesurer()
    this.sigma = new Sigma(this.graphe, this.scene, {
      allowInvalidContainer: true,
      enableCameraZooming: false,
      enableCameraPanning: false,
      enableCameraRotation: false,
      stagePadding: 0,
      zIndex: true,
      itemSizesReference: 'screen',
      zoomToSizeRatioFunction: () => 1,
      renderEdgeLabels: false,
      enableEdgeEvents: false,
      hideEdgesOnMove: false,
      hideLabelsOnMove: false,
      labelGridCellSize: 160,
      labelDensity: R.densiteLibelles,
      labelRenderedSizeThreshold: 0,
      defaultNodeType: 'forme',
      defaultEdgeType: 'fleche',
      nodeProgramClasses: { forme: ProgrammeFormes },
      edgeProgramClasses: { ligne: EdgeRectangleProgram, fleche: createEdgeArrowProgram({ lengthToThicknessRatio: 4.5, widenessToThicknessRatio: 3.2 }) },
      defaultDrawNodeLabel: ((ctx: CanvasRenderingContext2D, d: DonneesLibelle) => this.dessinerLibelle(ctx, d)) as never,
      defaultDrawNodeHover: ((ctx: CanvasRenderingContext2D, d: DonneesLibelle) => this.dessinerSurvolLibelle(ctx, d)) as never,
      nodeReducer: (_k, attrs) => this.reduirePoint(attrs),
      edgeReducer: (_k, attrs) => this.reduireArete(attrs),
    })
    this.sigma.setCustomBBox({ x: [-1, 1], y: [-1, 1] })
    const style = { pointerEvents: 'none' } as Partial<CSSStyleDeclaration>
    this.calqueDessous = this.sigma.createCanvas('rsnDessous', { beforeLayer: 'edges', style })
    this.calqueDessus = this.sigma.createCanvas('rsnDessus', { afterLayer: 'hoverNodes', style })
    this.dimensionnerCalques()
    this.camera.redimensionner(this.largeur, this.hauteur)
    this.aspectDispose = this.largeur / this.hauteur
    this.observateur = new ResizeObserver(() => {
      this.prendreDimensions()
      // Format d'écran nettement changé : la disposition étirée est recalculée (après la rafale).
      clearTimeout(this.minuterieAspect)
      this.minuterieAspect = window.setTimeout(() => void this.redisposerSiAspect(), 350)
    })
    this.observateur.observe(this.scene)

    this.controles = new Controles(this.scene, this.camera, this.actionsControles(), () => {
      const v = this.reglages.valeurs
      return { sensibiliteOrbite: v.sensibiliteOrbite, vitesseZoom: v.vitesseZoom, inertie: v.inertie, emulerPave: true, glisserGauche: this.mode === '3d' ? 'orbiter' : 'deplacer' }
    }, () => this.demanderRendu())
    this.brancherEvenements()
    this.construireInterface({ ...UI_DEFAUT, ...(options.ui ?? {}) }, options)
    this.reglages.on((cle, valeur) => this.appliquerReglage(cle, valeur))

    // Lecture + disposition initiales (synchrones avec dagre), puis cadrage.
    this.lecture = deriverLecture(this.jeu, this.strategieCourante, this.parametresLecture)
    this.appliquerDisposition(disposer(this.lecture, this.optionsDispositionCourantes()), false)
    if (R.moteur === 'elk') void this.redisposer()
    this.cadrerTout(1)
    this.demanderRendu()
  }

  // ─── API publique ────────────────────────────────────────────────────────

  on<K extends keyof EvenementsVueR>(type: K, f: (v: EvenementsVueR[K]) => void): () => void {
    return this.evenements.on(type, f)
  }

  emettre<K extends keyof EvenementsVueR>(type: K, v: EvenementsVueR[K]): void {
    this.evenements.emettre(type, v)
  }

  get justification(): GrapheJustification {
    return this.lecture.justification
  }

  get strategie(): StrategieLecture {
    return this.strategieCourante
  }

  /** Change de stratégie de lecture (id ou objet), avec transition animée. */
  definirStrategie(s: string | StrategieLecture, surcharges?: Partial<ParametresLecture>): void {
    const strat = typeof s === 'string' ? strategieParId(s) : s
    if (typeof s !== 'string' && !STRATEGIES.includes(strat)) STRATEGIES.push(strat)
    if (surcharges) this.parametresLecture = { ...this.parametresLecture, ...surcharges }
    this.strategieCourante = strat
    if (this.reglages.valeurs.strategie !== strat.id) {
      ;(this.reglages.valeurs as Record<string, ValeurReglage>).strategie = strat.id
      this.reglages.pane?.refresh()
    }
    this.lecture = deriverLecture(this.jeu, strat, this.parametresLecture)
    this.selection = null
    this.survol = null
    this.emettre('lecture', { lecture: this.lecture })
    void this.redisposer()
  }

  /**
   * Remplace les données (nouvelle lecture de l'API) sans recréer la vue : mode, caméra, stratégie,
   * liens complets et sélection (retrouvée par id) sont conservés ; les points retrouvés glissent vers
   * leur nouvelle place, les nouveaux apparaissent. `cadrer` : recadrer sur le résultat.
   */
  async remplacerJeu(jeu: JeuRaisonnement, options: { cadrer?: boolean } = {}): Promise<void> {
    const idSelection = this.selection === null ? null : this.noeud(this.selection).id
    const portee = this.porteeActive
    this.jeu = jeu
    this.lecture = deriverLecture(jeu, this.strategieCourante, this.parametresLecture)
    this.emettre('lecture', { lecture: this.lecture })
    await this.redisposer(undefined, options.cadrer ?? false)
    if (this.jeu !== jeu || idSelection === null) return
    const i = this.justification.index.get(idSelection)
    const p = i === undefined ? null : this.pointDeNoeud(i)
    if (p === null) this.selectionner(null)
    else if (portee) this.montrerPortee(p)
    else this.selectionner(p)
  }

  /**
   * Stratégie et paramètres de lecture exacts (remplace les surcharges au lieu de les fusionner).
   * La promesse se résout quand la nouvelle disposition est en place (pilotage).
   */
  appliquerLecture(id: string, parametres: Partial<ParametresLecture>): Promise<void> {
    this.parametresLecture = { ...parametres }
    const strat = strategieParId(id)
    this.strategieCourante = strat
    if (this.reglages.valeurs.strategie !== strat.id) {
      ;(this.reglages.valeurs as Record<string, ValeurReglage>).strategie = strat.id
      this.reglages.pane?.refresh()
    }
    this.lecture = deriverLecture(this.jeu, strat, this.parametresLecture)
    this.selection = null
    this.porteeActive = false
    this.survol = null
    this.emettre('lecture', { lecture: this.lecture })
    return this.redisposer(undefined, false)
  }

  /** Modifie des paramètres de lecture et recalcule. */
  definirParametresLecture(p: Partial<ParametresLecture>): void {
    this.definirStrategie(this.strategieCourante, p)
  }

  get parametres(): Partial<ParametresLecture> {
    return this.parametresLecture
  }

  /** Recalcule la disposition (options fusionnées avec les réglages) et anime vers elle. */
  async redisposer(options?: Partial<OptionsDisposition>, cadrer = true): Promise<void> {
    if (options) this.optionsDisposition = { ...this.optionsDisposition, ...options }
    const version = ++this.versionDisposition
    const lecture = this.lecture
    const o = this.optionsDispositionCourantes()
    let d: Disposition
    try {
      d = await disposerAsync(lecture, o)
    } catch (e) {
      console.warn('[raisonnement] disposition ELK impossible, repli sur dagre', e)
      d = disposer(lecture, { ...o, moteur: 'dagre' })
    }
    if (version !== this.versionDisposition || lecture !== this.lecture) return
    this.appliquerDisposition(d, true)
    if (cadrer) this.cadrerTout()
  }

  /** 2D (vue de face, plat) ou 3D (extrudé par type, vue de côté). */
  definirMode(mode: '2d' | '3d', vue?: NomVue): void {
    const duree = this.reglages.valeurs.dureeTransition
    const e0 = this.extrusion
    const e1 = mode === '3d' ? 1 : 0
    this.mode = mode
    if (mode === '3d') {
      this.camera.verrou2D = false
      if (this.camera.mode === 'ortho') this.camera.mode = 'auto'
      this.camera.animerVers({ orientation: vue ? ORIENTATIONS[vue] : this.orientationCote }, duree)
    } else {
      this.camera.verrou2D = true
      this.camera.mode = 'auto'
      this.camera.animerVers({ orientation: ORIENTATIONS.face }, duree)
    }
    if (e0 !== e1) this.animateur.animer(duree, (t) => { this.extrusion = e0 + (e1 - e0) * t }, { courbe: COURBES.douce })
    this.cadrer(null, duree, e1)
    this.ui.barre?.maj()
    this.emettre('mode', { mode })
    this.demanderRendu()
  }

  /** Vue nommée ; toute vue autre que la face passe en 3D. */
  allerVue(nom: NomVue): void {
    if (nom === 'face' && this.mode === '2d') return this.cadrerTout()
    if (this.mode === '2d') return this.definirMode('3d', nom)
    this.camera.allerVue(nom, this.reglages.valeurs.dureeTransition * 0.7)
    this.demanderRendu()
  }

  montrerLiensComplets(oui: boolean): void {
    if (this.reglages.valeurs.liensComplets !== oui) return this.reglages.definir('liensComplets', oui)
    this.synchroniserAretes()
    this.animerPresence()
    this.ui.barre?.maj()
    this.demanderRendu()
  }

  selectionner(p: number | null): void {
    this.selection = p
    this.porteeActive = false
    this.calculerLignee()
    this.emettre('selection', { point: p })
    this.demanderRendu()
  }

  /** Met en avant tout ce qui dépend du point dans le graphe complet (portée d'un choix). */
  montrerPortee(p: number): void {
    const i = this.indexNoeud(p)
    const dep = dependantsDe(this.justification, i)
    this.selection = p
    this.lignee.fill(0)
    for (const d of dep) {
      const q = this.pointDeNoeud(d)
      if (q !== null) this.lignee[q] = 2
    }
    this.lignee[p] = 3
    this.ligneeActive = true
    this.porteeActive = true
    this.emettre('selection', { point: p })
    this.demanderRendu()
  }

  definirSurvol(p: number | null): void {
    if (p === this.survol) return
    this.survol = p
    this.voisinsSurvol = new Set()
    if (p !== null && p < this.nU) {
      for (const e of this.lecture.entrantes[p]!) this.voisinsSurvol.add(this.lecture.aretes[e]!.source)
      for (const e of this.lecture.sortantes[p]!) this.voisinsSurvol.add(this.lecture.aretes[e]!.cible)
    }
    const f = this.ui.fiche
    if (f) {
      if (p === null) f.masquer()
      else {
        const defaut = () => ficheParDefaut(this, p)
        f.afficher(p, this.rendreFiche ? this.rendreFiche(p, this, defaut) : defaut())
        f.positionner(this.controles.souris.x + this.scene.offsetLeft, this.controles.souris.y + this.scene.offsetTop, this.racine.clientWidth, this.racine.clientHeight)
      }
    }
    this.emettre('survol', { point: p })
    this.demanderRendu()
  }

  definirTheme(theme: 'clair' | 'sombre'): void {
    if (this.reglages.valeurs.theme !== theme) return this.reglages.definir('theme', theme)
    this.racine.dataset.theme = theme
    this.palette = lirePaletteR(this.racine)
    this.ui.gizmo?.dessiner(true)
    this.ui.barre?.maj()
    this.emettre('theme', { theme })
    this.demanderRendu()
  }

  /** Cadre des points (tous si null). `extrusion` : cadrer pour l'état final d'une transition. */
  cadrer(points: Iterable<number> | null = null, duree = this.reglages.valeurs.dureeTransition, extrusion = this.mode === '3d' ? 1 : 0): void {
    const pos = new Float32Array(this.nP * 3)
    const ec = extrusion
    for (let p = 0; p < this.nP; p++) {
      pos[p * 3] = this.arrivee[p * 3]!
      pos[p * 3 + 1] = this.disposition.yCouche[p]! * ec
      pos[p * 3 + 2] = this.arrivee[p * 3 + 2]!
    }
    const indices = points ? [...points] : this.pointsVisibles()
    if (!indices.length) return
    // En 3D la perspective agrandit l'avant : marge plus large.
    this.camera.cadrer(pos, indices, duree, extrusion > 0.5 ? 1.3 : 1.08, this.zoneSure())
    this.demanderRendu()
  }

  cadrerTout(duree?: number): void {
    this.cadrer(null, duree)
  }

  /** Cadre la sélection et sa lignée (ou tout). */
  cadrerSelection(): void {
    if (this.selection === null) return this.cadrerTout()
    const pts: number[] = []
    for (let p = 0; p < this.nP; p++) if (this.lignee[p]) pts.push(p)
    this.cadrer(pts)
  }

  /** Marges occupées par l'interface (px) : le cadrage centre le contenu dans la zone libre. */
  zoneSure(): Marges {
    const m: Marges = { haut: 0, bas: 0, gauche: 0, droite: 0 }
    const sc = this.scene.getBoundingClientRect()
    const barre = this.ui.barre?.element.getBoundingClientRect()
    if (barre && barre.height) m.haut = barre.bottom - sc.top + 10
    const gizmo = this.ui.gizmo?.element.getBoundingClientRect()
    if (gizmo && gizmo.height) m.haut = Math.max(m.haut, gizmo.bottom - sc.top + 4)
    for (const el of [this.ui.compteur?.element, this.ui.reglages]) {
      const r = el?.getBoundingClientRect()
      if (r && r.height && r.height < sc.height * 0.3) m.bas = Math.max(m.bas, sc.bottom - r.top + 10)
    }
    const pan = this.ui.panneau
    if (pan?.ouvert) m.gauche = pan.element.getBoundingClientRect().right - sc.left + 10
    // Les libellés sont à droite des nœuds : on réserve leur place.
    m.droite = 150
    for (const k of ['haut', 'bas', 'gauche', 'droite'] as const) m[k] = Math.max(0, m[k]) + (this.margesSures[k] ?? 0)
    return m
  }

  ajouterReducteurNoeud(f: ReducteurPoint): () => void {
    this.reducteursNoeud.push(f)
    this.demanderRendu()
    return () => this.retirer(this.reducteursNoeud, f)
  }

  ajouterReducteurArete(f: ReducteurAreteR): () => void {
    this.reducteursArete.push(f)
    this.demanderRendu()
    return () => this.retirer(this.reducteursArete, f)
  }

  ajouterDessin(calque: 'dessous' | 'dessus', f: DessinR): () => void {
    const l = calque === 'dessous' ? this.dessinsDessous : this.dessinsDessus
    l.push(f)
    this.demanderRendu()
    return () => this.retirer(l, f)
  }

  private retirer<T>(liste: T[], f: T): void {
    const i = liste.indexOf(f)
    if (i >= 0) liste.splice(i, 1)
    this.demanderRendu()
  }

  /** Nœud de justification représenté par un point (conclusion pour une étape). */
  indexNoeud(p: number): number {
    return p < this.nU ? this.lecture.unites[p]!.conclusion : this.disposition.masques[p - this.nU]!
  }

  noeud(p: number): NoeudR {
    return this.justification.noeuds[this.indexNoeud(p)]!
  }

  /** Point qui représente un nœud de justification (son unité, ou son point masqué). */
  pointDeNoeud(i: number): number | null {
    const u = this.lecture.uniteDe[i]!
    if (u >= 0) return u
    const k = this.indexMasque.get(i)
    return k === undefined ? null : this.nU + k
  }

  /** Point sous une position écran (px de la scène), ou null. */
  pointSous(x: number, y: number, marge = TOLERANCE): number | null {
    const pr = this.projection
    let meilleur: number | null = null, dMin = Infinity
    for (let p = 0; p < this.nP; p++) {
      if (this.opaciteAffichee[p]! < 0.05) continue
      const d = Math.hypot(pr.x[p]! - x, pr.y[p]! - y)
      if (d <= this.tailleAffichee[p]! + marge && d < dMin) {
        dMin = d
        meilleur = p
      }
    }
    return meilleur
  }

  pointsVisibles(): number[] {
    const r: number[] = []
    const complets = this.reglages.valeurs.liensComplets
    for (let p = 0; p < this.nP; p++) if (p < this.nU || complets) r.push(p)
    return r
  }

  demanderRendu(): void {
    if (!this.raf) this.raf = requestAnimationFrame(this.image)
  }

  /** Force la boucle en continu (effets animés). Renvoie la fonction d'arrêt. */
  animerEnContinu(): () => void {
    this.continu++
    this.demanderRendu()
    let actif = true
    return () => {
      if (actif) this.continu--
      actif = false
    }
  }

  /** Calcule `ms` millisecondes d'animation immédiatement (tests, onglet masqué). */
  avancer(ms = 0, pas = 16): void {
    const t0 = performance.now()
    for (let t = 0; t <= ms; t += pas) this.image(t0 + t)
  }

  /**
   * Relit tout de suite la taille de la scène (sans attendre le ResizeObserver) et, si le format a
   * nettement changé, recalcule la disposition et recadre. Le pilotage l'appelle après chaque commande
   * pour que les cadrages suivants soient déterministes.
   */
  async ajusterDimensions(): Promise<void> {
    const l = this.largeur, h = this.hauteur
    this.prendreDimensions()
    if (this.largeur === l && this.hauteur === h) return
    clearTimeout(this.minuterieAspect)
    await this.redisposerSiAspect()
  }

  private prendreDimensions(): void {
    this.mesurer()
    this.dimensionnerCalques()
    this.camera.redimensionner(this.largeur, this.hauteur)
    this.demanderRendu()
  }

  private async redisposerSiAspect(): Promise<void> {
    const a = this.largeur / this.hauteur
    if (!this.reglages.valeurs.ajusterAspect || !this.lecture || Math.abs(Math.log(a / this.aspectDispose)) <= 0.15) return
    this.aspectDispose = a
    await this.redisposer()
  }

  private aspectDispose = 1
  private minuterieAspect = 0

  detruire(): void {
    cancelAnimationFrame(this.raf)
    this.controles.detruire()
    this.observateur.disconnect()
    this.sigma.kill()
    this.racine.remove()
  }

  // ─── Disposition et graphe sigma ─────────────────────────────────────────

  private indexMasque = new Map<number, number>()

  private optionsDispositionCourantes(): Partial<OptionsDisposition> {
    const R = this.reglages.valeurs
    let aspectCible = 0
    if (R.ajusterAspect) {
      const m = this.zoneSure()
      aspectCible = Math.max(0.8, Math.min(3, (this.largeur - m.gauche - m.droite) / Math.max(1, this.hauteur - m.haut - m.bas)))
    }
    return {
      moteur: R.moteur, classement: R.classement, ecartRangs: R.ecartRangs, ecartNoeuds: R.ecartNoeuds, ecartCouches: R.ecartCouches, aspectCible,
      ...this.optionsDisposition,
    }
  }

  /** Installe une nouvelle disposition (et, si besoin, un nouveau graphe de lecture), avec transition. */
  private appliquerDisposition(d: Disposition, anime: boolean): void {
    const ancien = this.disposition
    const ancienneLecture = ancien ? this.lectureDisposee : null
    const anciennesPos = this.positions
    const anciennePresence = this.presence
    const g = this.lecture
    const memeGraphe = ancienneLecture === g && ancien?.nU === d.nU
    this.disposition = d
    this.lectureDisposee = g
    this.nU = d.nU
    this.nP = d.nU + d.masques.length
    this.indexMasque = new Map(d.masques.map((m, k) => [m, k]))
    const n = this.nP
    // Point de départ de chaque nouveau point : sa propre ancienne position, sinon celle de l'ancien
    // point qui contenait sa conclusion (une étape qui se défait « sort » de la capsule).
    const depart = new Float32Array(n * 3)
    const pDepart = new Float32Array(n)
    const arrivee = new Float32Array(n * 3)
    for (let p = 0; p < n; p++) {
      arrivee[p * 3] = d.x[p]!
      arrivee[p * 3 + 1] = d.yCouche[p]!
      arrivee[p * 3 + 2] = d.z[p]!
    }
    if (ancien && anime) {
      // Après remplacerJeu, les indices de nœuds changent : on retrouve l'ancien nœud par son id.
      const memeJeu = ancienneLecture?.justification.noeuds === g.justification.noeuds
      const ancienPoint = (j: number): number | null => {
        if (!ancienneLecture) return null
        const i = memeJeu ? j : ancienneLecture.justification.index.get(g.justification.noeuds[j]!.id)
        if (i === undefined) return null
        const u = ancienneLecture.uniteDe[i]!
        if (u >= 0) return u
        const k = ancien.masques.indexOf(i)
        return k >= 0 ? ancien.nU + k : null
      }
      for (let p = 0; p < n; p++) {
        const q = memeGraphe ? p : ancienPoint(p < d.nU ? g.unites[p]!.conclusion : d.masques[p - d.nU]!)
        if (q !== null && q * 3 + 2 < anciennesPos.length) {
          depart[p * 3] = anciennesPos[q * 3]!
          depart[p * 3 + 1] = anciennesPos[q * 3 + 1]!
          depart[p * 3 + 2] = anciennesPos[q * 3 + 2]!
          pDepart[p] = anciennePresence[q] ?? 1
        } else {
          depart.set(arrivee.subarray(p * 3, p * 3 + 3), p * 3)
          pDepart[p] = 0
        }
      }
    } else {
      depart.set(arrivee)
      for (let p = 0; p < n; p++) pDepart[p] = p < d.nU ? 1 : 0
    }
    this.depart = depart
    this.arrivee = arrivee
    this.positions = new Float32Array(depart)
    this.presence = new Float32Array(pDepart)
    this.presenceDepart = new Float32Array(pDepart)
    this.presenceArrivee = new Float32Array(n)
    this.projection = new Projection(n)
    this.opaciteAffichee = new Float32Array(n)
    this.tailleAffichee = new Float32Array(n)
    this.lignee = new Uint8Array(n)
    if (!memeGraphe) {
      this.selection = null
      this.ligneeActive = false
      this.porteeActive = false
      this.survol = null
      this.voisinsSurvol.clear()
      this.ui.fiche?.masquer()
    } else this.calculerLignee()
    this.calculerImportance()
    this.construireGraphe(!memeGraphe)
    this.animerPresence(false)
    if (anime) {
      this.transition = { t: 0 }
      this.animateur.animer(this.reglages.valeurs.dureeTransition, (t) => {
        this.transition = { t }
        this.demanderRendu()
      }, { courbe: COURBES.sortie as Courbe, fin: () => (this.transition = null) })
    } else this.transition = null
    this.ui.compteur?.maj()
    this.ui.panneau?.majLecture()
    this.emettre('disposition', { disposition: d })
    this.demanderRendu()
  }
  private lectureDisposee: GrapheLecture | null = null
  private transition: { t: number } | null = null

  /** Présence visée : unités 1, masqués 1 seulement avec les liens complets. */
  private animerPresence(anime = true): void {
    const complets = this.reglages.valeurs.liensComplets
    for (let p = 0; p < this.nP; p++) this.presenceArrivee[p] = p < this.nU || complets ? 1 : 0
    this.presenceDepart.set(this.presence)
    const duree = anime ? this.reglages.valeurs.dureeTransition * 0.6 : 0
    this.animateur.animer(Math.max(1, duree), (t) => {
      for (let p = 0; p < this.nP; p++) this.presence[p] = this.presenceDepart[p]! + (this.presenceArrivee[p]! - this.presenceDepart[p]!) * t
    }, { courbe: COURBES.douce })
  }

  private calculerImportance(): void {
    const g = this.lecture
    const n = g.unites.length
    this.importance = new Float32Array(n)
    // Nombre de descendants (graphe de lecture), en parcourant à rebours d'un ordre topologique.
    const desc: Set<number>[] = g.unites.map(() => new Set())
    const degre = new Int32Array(n)
    for (const a of g.aretes) degre[a.source]!++
    const file: number[] = []
    for (let u = 0; u < n; u++) if (degre[u] === 0) file.push(u)
    while (file.length) {
      const u = file.shift()!
      for (const e of g.entrantes[u]!) {
        const s = g.aretes[e]!.source
        desc[s]!.add(u)
        for (const x of desc[u]!) desc[s]!.add(x)
        if (--degre[s]! === 0) file.push(s)
      }
    }
    let max = 1
    for (let u = 0; u < n; u++) max = Math.max(max, desc[u]!.size)
    for (let u = 0; u < n; u++) this.importance[u] = Math.sqrt(desc[u]!.size / max)
  }

  private construireGraphe(nouveau: boolean): void {
    const gr = this.graphe
    if (nouveau || gr.order !== this.nP) {
      gr.clear()
      this.attributs = []
      for (let p = 0; p < this.nP; p++) {
        gr.addNode(`p${p}`, { x: 0, y: 0, p, label: this.noeud(p).nom })
        this.attributs.push(gr.getNodeAttributes(`p${p}`))
      }
    }
    this.synchroniserAretes()
  }

  /** Arêtes sigma : lecture (toujours) + complètes (si demandées). */
  private synchroniserAretes(): void {
    const gr = this.graphe
    gr.clearEdges()
    const g = this.lecture
    for (const a of g.aretes) gr.addDirectedEdgeWithKey(`l${a.index}`, `p${a.source}`, `p${a.cible}`, { genre: 'lecture', a, completes: a.resume })
    if (this.reglages.valeurs.liensComplets) {
      const paires = new Map<string, { s: number; c: number; aretes: number[] }>()
      for (const e of this.justification.aretes) {
        const s = this.pointDeNoeud(e.source), c = this.pointDeNoeud(e.cible)
        if (s === null || c === null || s === c) continue
        const k = `${s}>${c}`
        let x = paires.get(k)
        if (!x) paires.set(k, (x = { s, c, aretes: [] }))
        x.aretes.push(e.index)
      }
      for (const [k, x] of paires) gr.addDirectedEdgeWithKey(`c${k}`, `p${x.s}`, `p${x.c}`, { genre: 'complete', completes: x.aretes })
    }
  }

  // ─── Boucle ──────────────────────────────────────────────────────────────

  image = (t: number): void => {
    this.raf = 0
    const dt = this.dernierT ? Math.min(64, Math.max(0, t - this.dernierT)) : 16
    this.dernierT = t
    let bouge = this.animateur.mettreAJour(t)
    bouge = this.controles.mettreAJour(dt) || bouge
    bouge = this.camera.mettreAJour(t, dt) || bouge
    const encore = bouge || this.continu > 0 || this.animateur.enCours || this.camera.enAnimation
    this.calculerPositions()
    this.camera.projeter(this.positions, this.projection)
    this.dessiner(t)
    this.emettre('image', { temps: t, dt })
    if (this.premiereImage) {
      // Premier cadrage refait quand l'interface (barre, compteur) est en place.
      this.premiereImage = false
      this.cadrerTout(1)
    }
    if (encore) this.demanderRendu()
    else {
      this.dernierT = 0
      const m = this.controles.souris
      if (m.dedans && !this.controles.enGeste && this.ui.fiche) this.definirSurvol(this.pointSous(m.x, m.y))
    }
  }

  private calculerPositions(): void {
    const t = this.transition ? COURBES.sortie(Math.min(1, this.transition.t)) : 1
    const e = this.extrusion
    const pos = this.positions, a = this.arrivee, d = this.depart
    for (let p = 0; p < this.nP; p++) {
      const i = p * 3
      pos[i] = d[i]! + (a[i]! - d[i]!) * t
      pos[i + 1] = (d[i + 1]! + (a[i + 1]! - d[i + 1]!) * t) * e
      pos[i + 2] = d[i + 2]! + (a[i + 2]! - d[i + 2]!) * t
    }
  }

  private dessiner(t: number): void {
    const W2 = this.largeur / 2, H2 = this.hauteur / 2
    const k = 2 / Math.min(this.largeur, this.hauteur)
    const pr = this.projection
    for (let p = 0; p < this.attributs.length; p++) {
      const at = this.attributs[p]!
      at.x = (pr.x[p]! - W2) * k
      at.y = -(pr.y[p]! - H2) * k
    }
    this.sigma.refresh()
    for (const ctx of [this.calqueDessous.getContext('2d')!, this.calqueDessus.getContext('2d')!]) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
      ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0)
    }
    const base = { vue: this, largeur: this.largeur, hauteur: this.hauteur, projection: pr, temps: t }
    const cd = this.calqueDessous.getContext('2d')!, cu = this.calqueDessus.getContext('2d')!
    for (const f of this.dessinsDessous) f({ ...base, ctx: cd })
    for (const f of this.dessinsDessus) f({ ...base, ctx: cu })
    this.ui.gizmo?.dessiner()
    const fiche = this.ui.fiche
    if (fiche && fiche.pointAffiche !== null && this.controles.souris.dedans) {
      fiche.positionner(this.controles.souris.x + this.scene.offsetLeft, this.controles.souris.y + this.scene.offsetTop, this.racine.clientWidth, this.racine.clientHeight)
    }
  }

  private mesurer(): void {
    this.largeur = Math.max(1, this.scene.offsetWidth)
    this.hauteur = Math.max(1, this.scene.offsetHeight)
    this.ratio = window.devicePixelRatio || 1
  }

  private dimensionnerCalques(): void {
    if (!this.calqueDessous) return
    for (const c of [this.calqueDessous, this.calqueDessus]) {
      c.width = Math.round(this.largeur * this.ratio)
      c.height = Math.round(this.hauteur * this.ratio)
      c.style.width = `${this.largeur}px`
      c.style.height = `${this.hauteur}px`
    }
  }

  // ─── Réducteurs ──────────────────────────────────────────────────────────

  /** Remplit l'objet InfoPoint réutilisé. */
  decrire(p: number): InfoPoint {
    const i = this.info
    const g = this.lecture
    const estUnite = p < this.nU
    const unite = estUnite ? g.unites[p] : undefined
    const idx = this.indexNoeud(p)
    const n = g.justification.noeuds[idx]!
    const pr = this.projection
    i.point = p
    i.genre = !estUnite ? 'masque' : unite!.genre
    i.unite = unite
    i.indexNoeud = idx
    i.noeud = n
    i.type = n.type
    i.couche = this.disposition.couche[p]!
    i.rang = this.disposition.rang[p]!
    i.nbContexte = unite ? unite.contexte.length : 0
    i.importance = estUnite ? this.importance[p]! : 0
    i.presence = this.presence[p]!
    i.x = pr.x[p]!
    i.y = pr.y[p]!
    i.profondeur = pr.profondeurNormalisee(p)
    i.echelle = pr.echelle[p]!
    i.visible = pr.visible[p] === 1
    i.survol = this.survol === null ? 'aucun' : p === this.survol ? 'survole' : this.voisinsSurvol.has(p) ? 'voisin' : 'autre'
    const l = this.lignee[p]!
    i.lignee = !this.ligneeActive ? 'aucune' : l === 3 ? 'selection' : l === 1 ? 'ancetre' : l === 2 ? 'descendant' : 'hors'
    return i
  }

  /** Apparence par défaut (avant les réducteurs de la vision). */
  apparenceParDefaut(info: InfoPoint): AffichagePoint {
    const R = this.reglages.valeurs
    const pal = this.palette
    const n = info.noeud
    const etape = info.genre === 'etape'
    const couleur =
      R.couleur === 'statut' ? pal.statut[n.statut]
        : R.couleur === 'origine' ? (n.origine ? pal.origine[n.origine] : pal.areteComplete)
          : R.couleur === 'sousProbleme' ? pal.sousProblemes[Math.max(0, this.jeu.sousProblemes.findIndex((s) => s.id === n.sousProbleme)) % pal.sousProblemes.length]!
            : pal.couches[info.couche]!
    let taille = R.tailleNoeud * TAILLE_TYPE[n.type] * (1 + R.tailleImportance * info.importance)
    if (info.genre === 'masque') taille *= 0.75
    if (this.camera.perspective > 0) taille *= Math.max(0.25, info.echelle)
    let opacite = info.presence
    if (n.piste === 'abandonnee') opacite *= 0.55
    const contexte = R.opaciteContexte
    if (info.survol === 'autre') opacite *= Math.max(contexte, 0.35)
    if (info.lignee === 'hors') opacite *= contexte
    if (R.brouillard > 0 && this.camera.perspective > 0) opacite *= 1 - R.brouillard * this.camera.perspective * info.profondeur
    // Bordure : statut (établi discret, invalide épais), sauf si la couleur montre déjà le statut.
    let couleurBordure = R.couleur === 'statut' || n.statut === 'etabli' ? pal.surface : pal.statut[n.statut]
    let epaisseur = n.statut === 'invalide' ? 0.42 : n.statut === 'etabli' ? 0.2 : n.statut === 'ouvert' ? 0.28 : 0.34
    let surligne = false
    if (info.lignee === 'selection' || info.lignee === 'ancetre' || info.lignee === 'descendant') {
      surligne = info.lignee === 'selection'
      couleurBordure = info.lignee === 'selection' ? pal.accent : info.lignee === 'ancetre' ? pal.ancetre : pal.descendant
      epaisseur = 0.4
    }
    if (info.survol === 'survole') surligne = true
    const important = n.type === 'theoreme' || n.type === 'resultat' || n.type === 'decision' || n.type === 'choix_modelisation' || n.type === 'conjecture'
    // Libellé toujours affiché (hors grille de sigma) : seulement les conclusions et les décisions.
    const prioritaire = n.type === 'theoreme' || n.type === 'resultat' || n.type === 'decision'
    const nomBase = etape ? `${n.nom} · ${info.unite!.membres.length} étapes` : n.nom
    let libelle: string | null = R.libelles === 'aucun' || (R.libelles === 'importants' && !important) ? null : couper(nomBase, R.longueurLibelle)
    let force = R.libelles !== 'aucun' && prioritaire && info.genre !== 'masque' && !n.admis
    if (info.survol === 'survole' || info.lignee === 'selection') {
      libelle = couper(nomBase, 90)
      force = true
    }
    if (info.presence < 0.5) {
      libelle = null
      force = false
    }
    const devant = info.survol === 'survole' || info.survol === 'voisin' || (info.lignee !== 'aucune' && info.lignee !== 'hors')
    return {
      couleur: n.statut === 'invalide' && R.couleur !== 'statut' ? mix(couleur, pal.fond, 0.45) : couleur,
      opacite,
      taille,
      forme: etape ? 'capsule' : FORME_TYPE[n.type],
      couleurBordure,
      epaisseurBordure: epaisseur,
      libelle,
      forceLibelle: force,
      cache: !info.visible || info.presence < 0.01,
      zIndex: Math.round((1 - info.profondeur) * 1000) + (important ? 500 : 0) + (devant ? 3000 : 0) + (info.survol === 'survole' ? 3000 : 0),
      surligne,
    }
  }

  private reduirePoint(attrs: Attributes): Partial<NodeDisplayData> {
    const p = attrs.p as number
    if (p >= this.nP) return { hidden: true }
    const info = this.decrire(p)
    const a = this.apparenceParDefaut(info)
    for (const r of this.reducteursNoeud) r(info, a, this)
    const cache = a.cache || a.opacite < 0.01
    this.opaciteAffichee[p] = cache ? 0 : a.opacite
    this.tailleAffichee[p] = a.taille
    return {
      x: attrs.x as number,
      y: attrs.y as number,
      size: a.taille,
      color: rgbaGL(a.couleur, a.opacite),
      couleurBordure: rgbaGL(a.couleurBordure, a.opacite),
      epaisseur: a.epaisseurBordure,
      forme: CODE_FORME[a.forme],
      label: a.libelle,
      forceLabel: a.forceLibelle,
      highlighted: a.surligne,
      hidden: cache,
      zIndex: a.zIndex,
      opaciteLibelle: Math.min(1, a.opacite * 1.4),
      type: 'forme',
    } as Partial<NodeDisplayData>
  }

  private reduireArete(attrs: Attributes): Partial<EdgeDisplayData> {
    const R = this.reglages.valeurs
    const pal = this.palette
    const i = this.infoArete
    const g = this.lecture
    const lect = attrs.genre === 'lecture'
    const a = attrs.a as AreteLecture | undefined
    const completes = attrs.completes as number[]
    const s = lect ? a!.source : this.pointDeNoeudCache(completes[0]!, 'source')
    const c = lect ? a!.cible : this.pointDeNoeudCache(completes[0]!, 'cible')
    i.genre = lect ? 'lecture' : 'complete'
    i.source = s
    i.cible = c
    i.lecture = a
    i.completes = completes
    let role: RolePremisse = 'contexte'
    for (const e of completes) {
      const r = g.justification.aretes[e]!.role
      if (r === 'principale') { role = r; break }
      if (r === 'auxiliaire' || (r === 'technique' && role === 'contexte')) role = r
    }
    i.role = role
    i.survol = this.survol === null ? 'aucun' : s === this.survol || c === this.survol ? 'incidente' : 'autre'
    const ls = this.lignee[s]!, lc = this.lignee[c]!
    i.lignee = this.ligneeActive && ls > 0 && lc > 0 && !(ls === 2 && lc === 1) && !(ls === 1 && lc === 2) && !(ls === 3 && lc === 1) && !(ls === 2 && lc === 3)
    const os = this.opaciteAffichee[s]!, oc = this.opaciteAffichee[c]!
    i.opaciteSource = os
    i.opaciteCible = oc
    const pres = Math.min(this.presence[s] ?? 1, this.presence[c] ?? 1)
    const af: AffichageAreteR = lect
      ? {
          couleur: pal.arete,
          opacite: R.opaciteAretes * pres,
          taille: R.epaisseurArete * (1 + 0.25 * Math.sqrt(Math.max(0, a!.resume.length + a!.transitives.length - 1))),
          cache: false,
          zIndex: 1,
          type: R.fleches ? 'fleche' : 'ligne',
        }
      : {
          couleur: role === 'contexte' ? pal.areteComplete : pal.role[role],
          opacite: R.opaciteLiensComplets * pres * (role === 'principale' ? 1 : 0.8),
          taille: R.epaisseurArete * 0.6,
          cache: false,
          zIndex: 0,
          type: 'ligne',
        }
    if (i.survol === 'incidente') {
      af.couleur = lect ? pal.accent : af.couleur
      af.opacite = Math.min(1, Math.max(af.opacite * 1.8, lect ? 0.85 : 0.5))
      af.zIndex = 3
    } else if (i.survol === 'autre') af.opacite *= 0.45
    if (this.ligneeActive) {
      if (i.lignee) {
        const versAncetre = ls === 1 || lc === 1
        af.couleur = versAncetre ? pal.ancetre : pal.descendant
        af.opacite = lect ? 0.9 : Math.max(af.opacite, 0.45)
        af.taille *= lect ? 1.6 : 1.1
        af.zIndex = 2
      } else af.opacite *= R.opaciteContexte
    }
    af.opacite *= Math.min(1, Math.max(os, 0.15) * 1.2, Math.max(oc, 0.15) * 1.2)
    for (const r of this.reducteursArete) r(i, af, this)
    return {
      size: af.taille,
      color: rgbaGL(af.couleur, af.opacite),
      hidden: af.cache || af.opacite < 0.01 || os < 0.01 || oc < 0.01,
      zIndex: af.zIndex,
      type: af.type,
    } as Partial<EdgeDisplayData>
  }

  private pointDeNoeudCache(e: number, bout: 'source' | 'cible'): number {
    const a = this.justification.aretes[e]!
    return this.pointDeNoeud(bout === 'source' ? a.source : a.cible) ?? 0
  }

  // ─── Libellés sigma ──────────────────────────────────────────────────────

  private dessinerLibelle(ctx: CanvasRenderingContext2D, d: DonneesLibelle): void {
    if (!d.label) return
    const pal = this.palette
    const R = this.reglages.valeurs
    ctx.save()
    ctx.globalAlpha = d.opaciteLibelle ?? 1
    ctx.font = `${d.forceLabel ? 600 : 450} ${R.tailleLibelle}px ${pal.police}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3.5
    ctx.strokeStyle = pal.fond
    ctx.fillStyle = d.forceLabel ? pal.texte : pal.texteDoux
    const x = d.x + d.size * 1.35 + 4
    ctx.strokeText(d.label, x, d.y)
    ctx.fillText(d.label, x, d.y)
    ctx.restore()
  }

  private dessinerSurvolLibelle(ctx: CanvasRenderingContext2D, d: DonneesLibelle): void {
    if (!d.label) return
    const pal = this.palette
    const taille = this.reglages.valeurs.tailleLibelle + 1
    ctx.save()
    ctx.font = `600 ${taille}px ${pal.police}`
    const l = ctx.measureText(d.label).width
    const x = d.x + d.size * 1.35 + 6
    ctx.fillStyle = pal.surface
    ctx.strokeStyle = rgba(pal.texte, 0.14)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(x - 5, d.y - taille / 2 - 5, l + 10, taille + 10, 6)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = pal.texte
    ctx.textBaseline = 'middle'
    ctx.fillText(d.label, x, d.y + 0.5)
    ctx.restore()
  }

  // ─── Lignée ──────────────────────────────────────────────────────────────

  private calculerLignee(): void {
    this.lignee.fill(0)
    const p = this.selection
    this.ligneeActive = p !== null
    if (p === null) return
    if (p < this.nU) {
      const { ancetres, descendants } = ligneeLecture(this.lecture, p, this.reglages.valeurs.descendants)
      for (let u = 0; u < this.nU; u++) this.lignee[u] = ancetres[u] ? 1 : descendants[u] ? 2 : 0
    } else {
      // Nœud de contexte : les unités qui le rattachent comme contexte.
      const i = this.indexNoeud(p)
      this.lecture.unites.forEach((u, k) => {
        if (u.contexte.some((c) => c.noeud === i)) this.lignee[k] = 2
      })
    }
    this.lignee[p] = 3
  }

  // ─── Événements ──────────────────────────────────────────────────────────

  private clicAIgnorer(): boolean {
    const t = performance.now()
    return t - this.controles.dernierGlisser < 80 || t - this.controles.dernierTactile < 600
  }

  private brancherEvenements(): void {
    const s = this.sigma
    s.on('clickNode', ({ event }) => {
      if (this.clicAIgnorer()) return
      this.selectionner(this.pointSous(event.x, event.y))
    })
    s.on('clickStage', ({ event }) => {
      if (this.clicAIgnorer()) return
      this.selectionner(this.pointSous(event.x, event.y))
    })
    const double = ({ event, preventSigmaDefault }: { event: { x: number; y: number; preventSigmaDefault(): void }; preventSigmaDefault(): void }) => {
      preventSigmaDefault()
      event.preventSigmaDefault()
      const p = this.pointSous(event.x, event.y)
      if (p === null) return this.cadrerTout()
      this.selectionner(p)
      this.cadrerSelection()
    }
    s.on('doubleClickNode', double)
    s.on('doubleClickStage', double)
    this.scene.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return
      const r = this.scene.getBoundingClientRect()
      const x = e.clientX - r.left, y = e.clientY - r.top
      if (!this.controles.enGeste) this.definirSurvol(this.pointSous(x, y))
      const f = this.ui.fiche
      if (f && f.pointAffiche !== null) f.positionner(x + this.scene.offsetLeft, y + this.scene.offsetTop, this.racine.clientWidth, this.racine.clientHeight)
    })
    this.scene.addEventListener('pointerleave', () => this.definirSurvol(null))
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 't' || e.key === 'T') this.definirMode(this.mode === '2d' ? '3d' : '2d')
      else if (e.key === 'l' || e.key === 'L') this.montrerLiensComplets(!this.reglages.valeurs.liensComplets)
      else if (e.key === 'n' || e.key === 'N') this.ui.panneau?.basculer()
      else return
      e.preventDefault()
    })
  }

  private actionsControles(): ActionsControles {
    return {
      vue: (nom) => this.allerVue(nom),
      opposee: () => {
        if (this.mode === '2d') this.definirMode('3d')
        this.camera.opposee(this.reglages.valeurs.dureeTransition * 0.7)
      },
      orbiterPas: (axe, angle) => {
        if (this.mode === '2d') this.definirMode('3d', 'face')
        this.camera.orbiterPas(axe, angle, 220)
      },
      basculerProjection: () => {
        if (this.mode === '2d') this.definirMode('3d')
        this.camera.basculerProjection()
      },
      cadrerSelection: () => this.cadrerSelection(),
      cadrerTout: () => this.cadrerTout(),
      granularite: () => {},
      echap: () => this.selectionner(null),
      menuRadial: () => {},
      tape: (x, y) => {
        const p = this.pointSous(x, y, 10)
        this.selectionner(p)
        this.definirSurvol(p)
      },
      tapeDouble: (x, y) => {
        const p = this.pointSous(x, y, 10)
        if (p === null) return this.cadrerTout()
        this.selectionner(p)
        this.cadrerSelection()
      },
    }
  }

  private appliquerReglage(cle: string, valeur: ValeurReglage): void {
    switch (cle) {
      case 'theme': this.definirTheme(valeur as 'clair' | 'sombre'); break
      case 'strategie': if (valeur !== this.strategieCourante.id) this.definirStrategie(valeur as string); break
      case 'liensComplets': this.montrerLiensComplets(valeur as boolean); break
      case 'moteur': case 'classement': case 'ecartRangs': case 'ecartNoeuds': case 'ecartCouches': case 'ajusterAspect': void this.redisposer(); break
      case 'densiteLibelles': this.sigma.setSetting('labelDensity', valeur as number); break
      case 'champVision': this.camera.champVision = valeur as number; this.camera.version++; break
      case 'descendants': this.calculerLignee(); break
    }
    this.emettre('reglage', { cle, valeur })
    this.demanderRendu()
  }

  private construireInterface(ui: OptionsUIR, options: OptionsVueRaisonnement): void {
    const i = this.interface
    if (ui.fiche) this.ui.fiche = new FicheRaisonnement(i)
    if (ui.gizmo) {
      this.ui.gizmo = new Gizmo(i, this.camera, {
        vue: (nom) => this.allerVue(nom),
        demanderRendu: () => this.demanderRendu(),
        sensibilite: () => this.reglages.valeurs.sensibiliteOrbite,
      })
    }
    if (ui.reglages) {
      const c = document.createElement('div')
      c.className = 'rsn-reglages'
      i.appendChild(c)
      this.reglages.monterPanneau(c)
      this.ui.reglages = c
    }
    if (ui.barre) this.ui.barre = new BarreRaisonnement(i, this)
    if (ui.compteur) this.ui.compteur = new Compteur(i, this)
    if (ui.panneau) {
      this.ui.panneau = new PanneauRaisonnement(i, this, ui.panneauOuvert)
      options.panneau?.(this.ui.panneau, this)
    }
  }
}

interface DonneesLibelle {
  x: number
  y: number
  size: number
  label: string | null
  forceLabel?: boolean
  opaciteLibelle?: number
}

/** Mélange deux couleurs (hex) : t = 0 → a, 1 → b. */
function mix(a: string, b: string, t: number): string {
  const ca = hex(a), cb = hex(b)
  const h = (k: number) => Math.round(ca[k]! + (cb[k]! - ca[k]!) * t).toString(16).padStart(2, '0')
  return `#${h(0)}${h(1)}${h(2)}`
}
function hex(c: string): number[] {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim())
  if (!m) return [128, 128, 128]
  const n = parseInt(m[1]!, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// ─── Calques par défaut ──────────────────────────────────────────────────────

/** 3D : un plan translucide par couche de type, avec son nom. */
function dessinerPlansCouches({ ctx, vue }: ContexteDessinR): void {
  const e = vue.extrusion
  if (e < 0.02 || !vue.reglages.valeurs.plansCouches) return
  const d = vue.disposition
  const pal = vue.palette
  const cam = vue.camera
  const presentes = new Set<number>()
  for (let p = 0; p < vue.nP; p++) if (p < vue.nU || vue.presence[p]! > 0.1) presentes.add(d.couche[p]!)
  const m = 0.35
  const { xmin, xmax, zmin, zmax } = d.bornes
  const milieu = (COUCHES.length - 1) / 2
  const ecart = vue.reglages.valeurs.ecartCouches
  ctx.save()
  ctx.font = `600 12px ${pal.police}`
  ctx.textBaseline = 'bottom'
  for (let c = 0; c < COUCHES.length; c++) {
    if (!presentes.has(c)) continue
    const y = (c - milieu) * ecart * e
    const coins = [[xmin - m, y, zmin - m], [xmax + m, y, zmin - m], [xmax + m, y, zmax + m], [xmin - m, y, zmax + m]].map((q) => cam.projeterPoint(q as [number, number, number]))
    if (coins.some((q) => !q.visible)) continue
    ctx.beginPath()
    coins.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)))
    ctx.closePath()
    ctx.fillStyle = rgba(pal.couches[c]!, 0.035 * e)
    ctx.fill()
    ctx.strokeStyle = rgba(pal.couches[c]!, 0.35 * e)
    ctx.lineWidth = 1
    ctx.stroke()
    // Nom de la couche le long de son bord gauche (les bords sont bien séparés en vue de côté).
    const a = coins[0]!, b = coins[3]!
    ctx.save()
    ctx.translate(a.x + (b.x - a.x) * 0.04, a.y + (b.y - a.y) * 0.04)
    let angle = Math.atan2(b.y - a.y, b.x - a.x)
    if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI
    ctx.rotate(angle)
    ctx.textAlign = angle < 0 ? 'left' : 'right'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3
    ctx.strokeStyle = rgba(pal.fond, 0.9 * e)
    ctx.strokeText(COUCHES[c]!.nom, 0, -4)
    ctx.fillStyle = rgba(pal.couches[c]!, Math.min(1, e * 1.2))
    ctx.fillText(COUCHES[c]!.nom, 0, -4)
    ctx.restore()
  }
  ctx.restore()
}

/** En-tête de la colonne des nœuds de contexte pur (visible avec les liens complets). */
function dessinerEnteteContexte({ ctx, vue }: ContexteDessinR): void {
  const d = vue.disposition
  if (!d.masques.length || Number.isNaN(d.xContexte)) return
  const pres = vue.presence[vue.nU] ?? 0
  if (pres < 0.05) return
  let zmax = -Infinity
  for (let p = vue.nU; p < vue.nP; p++) zmax = Math.max(zmax, vue.positions[p * 3 + 2]!)
  const q = vue.camera.projeterPoint([vue.positions[vue.nU * 3]!, vue.positions[vue.nU * 3 + 1]!, zmax + 0.35])
  if (!q.visible) return
  ctx.save()
  ctx.font = `600 11px ${vue.palette.police}`
  ctx.textAlign = 'center'
  ctx.fillStyle = rgba(vue.palette.texteDoux, pres)
  ctx.fillText(`Contexte pur (${d.masques.length})`, q.x, q.y)
  ctx.restore()
}

/** Pastilles de contexte : un point par prémisse rattachée (couleur = rôle), à gauche du nœud. */
function dessinerPastillesContexte({ ctx, vue, projection }: ContexteDessinR): void {
  if (!vue.reglages.valeurs.pastillesContexte) return
  // Seulement si les rangs sont assez espacés à l'écran.
  const pxRang = vue.camera.pixelsParUnite() * vue.reglages.valeurs.ecartRangs * 0.01
  if (pxRang < 55) return
  const pal = vue.palette
  const alpha = Math.min(1, (pxRang - 55) / 40)
  ctx.save()
  for (let p = 0; p < vue.nU; p++) {
    const op = vue.opaciteAffichee[p]!
    if (op < 0.1) continue
    const u = vue.lecture.unites[p]!
    const n = u.contexte.length
    if (!n) continue
    const r = vue.tailleAffichee[p]!
    const x0 = projection.x[p]! - r * 1.4 - 4, y0 = projection.y[p]! + r * 0.9 + 3
    const max = Math.min(n, 6)
    for (let k = 0; k < max; k++) {
      ctx.fillStyle = rgba(pal.role[u.contexte[k]!.role], op * alpha * 0.9)
      ctx.beginPath()
      ctx.arc(x0 - k * 4.2, y0, 1.6, 0, Math.PI * 2)
      ctx.fill()
    }
    if (n > max) {
      ctx.fillStyle = rgba(pal.texteDoux, op * alpha)
      ctx.font = `9px ${pal.police}`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(`+${n - max}`, x0 - max * 4.2 - 1, y0)
    }
  }
  ctx.restore()
}

/** Liens hors justification : contradiction (rouge pointillé), résolution, abandon. */
function dessinerLiensSemantiques({ ctx, vue, projection }: ContexteDessinR): void {
  if (!vue.reglages.valeurs.liensSemantiques) return
  const pal = vue.palette
  const j = vue.justification
  ctx.save()
  ctx.font = `600 10px ${pal.police}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < j.noeuds.length; i++) {
    const liens = j.noeuds[i]!.liens
    if (!liens) continue
    for (const l of liens) {
      const ci = j.index.get(l.cible)
      if (ci === undefined) continue
      const a = vue.pointDeNoeud(i), b = vue.pointDeNoeud(ci)
      if (a === null || b === null || a === b) continue
      const op = Math.min(vue.opaciteAffichee[a]!, vue.opaciteAffichee[b]!)
      if (op < 0.05) continue
      const couleur = l.genre === 'contredit' ? pal.contredit : l.genre === 'resout' ? pal.statut.etabli : pal.texteDoux
      const x1 = projection.x[a]!, y1 = projection.y[a]!, x2 = projection.x[b]!, y2 = projection.y[b]!
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.max(30, Math.abs(x2 - x1) * 0.25)
      ctx.strokeStyle = rgba(couleur, 0.85 * op)
      ctx.lineWidth = 1.4
      ctx.setLineDash(l.genre === 'resout' ? [] : [5, 4])
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.quadraticCurveTo(mx, my, x2, y2)
      ctx.stroke()
      const tx = (x1 + 2 * mx + x2) / 4, ty = (y1 + 2 * my + y2) / 4
      const texte = l.genre === 'contredit' ? 'contredit' : l.genre === 'resout' ? 'résout' : l.genre === 'abandonne' ? 'abandonne' : 'remplace'
      const w = ctx.measureText(texte).width + 8
      ctx.setLineDash([])
      ctx.fillStyle = rgba(pal.surface, 0.92 * op)
      ctx.fillRect(tx - w / 2, ty - 7, w, 14)
      ctx.fillStyle = rgba(couleur, op)
      ctx.fillText(texte, tx, ty)
    }
  }
  ctx.restore()
}

/** Crée une vue complète dans `conteneur`. */
export function creerVueRaisonnement(conteneur: HTMLElement, options: OptionsVueRaisonnement): VueRaisonnement {
  return new VueRaisonnement(conteneur, options)
}
