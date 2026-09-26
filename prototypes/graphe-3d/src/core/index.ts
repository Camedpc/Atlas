// Point d'entrée du moteur : `creerVue(conteneur, options)` assemble données, hiérarchie,
// dispositions, caméra, contrôles, rendu sigma et interface, puis expose état, événements
// et points d'extension. Voir src/core/README.md.

import './ui/style.css'
import type { Attributes } from 'graphology-types'
import type { EdgeDisplayData, NodeDisplayData } from 'sigma/types'
import type { EdgeProgramType, NodeProgramType } from 'sigma/rendering'
import type { Settings } from 'sigma/settings'

import { Animateur, COURBES, Emetteur, TRAJECTOIRES, type Courbe, type Trajectoire } from './anim'
import {
  creerDessinLibelle, creerDessinSurvol, lirePalette, rgbaGL,
  type AffichageArete, type AffichageNoeud, type InfoArete, type InfoUnite, type Palette,
} from './apparence'
import { Camera3D, ORIENTATIONS, Projection, type Marges, type NomVue } from './camera3d'
import { Controles, type ActionsControles } from './controles'
import { Etendues, dessinerEtendues } from './etendues'
import { genererJeuSynthetique, type JeuDonnees } from './donnees'
import {
  calculerBarycentres, calculerDispositions, melangerDispositions, poidsFaces,
  type Dispositions, type NomDisposition,
} from './dispositions'
import { Filtres, type EtatFiltres } from './filtres'
import { Gizmo } from './gizmo'
import { AretesAgregees, Granularite, Hierarchie, type Paire } from './hierarchie'
import { Lignee } from './lignee'
import { DEFINITIONS_MOTEUR, Reglages, type DefinitionReglage, type ReglagesMoteur, type ValeurReglage } from './reglages'
import { Rendu } from './rendu'
import { BarreVues, MenuRadial } from './ui/barre'
import { Fiche, ficheParDefaut, type RenduFiche } from './ui/fiche'
import { CurseurGranularite } from './ui/granularite'
import { Histogramme } from './ui/histogramme'
import { PanneauGauche } from './ui/panneau'

// ─── Types publics ───────────────────────────────────────────────────────────

export interface ContexteDessin {
  ctx: CanvasRenderingContext2D
  vue: VueGraphe
  largeur: number
  hauteur: number
  projection: Projection
  /** Positions 3D affichées (3 × nU). */
  positions: Float32Array
  temps: number
}
export type HookDessin = (c: ContexteDessin) => void
export type ReducteurNoeud = (info: InfoUnite, a: AffichageNoeud, vue: VueGraphe) => void
export type ReducteurArete = (info: InfoArete, a: AffichageArete, vue: VueGraphe) => void

export interface OptionsUI {
  panneau: boolean
  panneauOuvert: boolean
  /**
   * Montage du panneau gauche : 'surimpression' (défaut, au-dessus de la scène), 'pousse' (la scène
   * rétrécit quand il s'ouvre) ou 'externe' (monté dans `conteneurPanneau`, sans bouton ☰).
   */
  panneauMode: 'surimpression' | 'pousse' | 'externe'
  /** Conteneur du panneau en mode 'externe'. */
  conteneurPanneau?: HTMLElement
  histogramme: boolean
  granularite: boolean
  gizmo: boolean
  reglages: boolean
  barreVues: boolean
  fiche: boolean
}

export interface OptionsVue {
  /** Données (défaut : jeu synthétique déterministe). */
  donnees?: JeuDonnees
  /** Identifiant (clé de mémorisation des réglages). */
  id?: string
  mode?: '2d' | '3d'
  vueInitiale?: NomVue
  /** Granularité initiale g ∈ [0, 3] (défaut 2 : sous-thèmes). */
  granularite?: number
  /** Valeurs initiales de réglages (écrasées par les valeurs mémorisées). */
  reglages?: Partial<ReglagesMoteur> & Record<string, ValeurReglage>
  /** Réglages propres à la variante (apparaissent dans le panneau Tweakpane). */
  reglagesSupplementaires?: DefinitionReglage[]
  reducteursNoeud?: ReducteurNoeud[]
  reducteursArete?: ReducteurArete[]
  dessinerDessous?: HookDessin
  dessinerDessus?: HookDessin
  rendreFiche?: RenduFiche
  /** Trajectoire de transition personnalisée (sinon réglage « trajectoire »). */
  trajectoire?: Trajectoire
  /** Courbe d'accélération personnalisée (sinon réglage « courbe »). */
  courbe?: Courbe
  ui?: Partial<OptionsUI>
  /** Personnalisation du panneau gauche (ajout de sections…). */
  panneau?: (p: PanneauGauche, vue: VueGraphe) => void
  programmesNoeud?: Record<string, NodeProgramType>
  programmesArete?: Record<string, EdgeProgramType>
  reglagesSigma?: Partial<Settings>
  // ─── Itération 2 ───
  /** Marges d'interface propres à la variante (px), ajoutées à la zone sûre mesurée. */
  margesSures?: Partial<Marges> | (() => Partial<Marges>)
  /** Modifie les positions 3D affichées après la granularité (voir `ContextePositions`). */
  apresPositions?: CrochetPositions
  /** Modifie la projection écran avant qu'elle soit transmise à sigma (fisheye, lentilles…). */
  apresProjection?: CrochetProjection
  /** Dessine les étendues d'agrégats du moteur (réglage « etendues ») : défaut vrai. */
  etenduesParDefaut?: boolean
}

/** Contexte du crochet de positions : ouverture et sens par catégorie pour adapter la transition. */
export interface ContextePositions {
  vue: VueGraphe
  /** Positions affichées (3 × nU), modifiables en place. */
  positions: Float32Array
  /** Positions cibles (mélange des faces, avant granularité). */
  base: Float32Array
  /** Par catégorie : ouverture 0…1 et sens (1 sortie, -1 rentrée, 0 immobile). */
  ouverture: Float32Array
  sens: Int8Array
}
export type CrochetPositions = (c: ContextePositions) => void
export type CrochetProjection = (p: Projection, vue: VueGraphe) => void

export interface EvenementsVue {
  survol: { unite: number | null }
  clic: { unite: number | null; original?: MouseEvent | TouchEvent }
  selection: { unite: number | null }
  vue: { nom: NomVue | null; mode: '2d' | '3d' }
  granularite: { globale: number }
  filtres: { etat: EtatFiltres; nbActives: number }
  reglage: { cle: string; valeur: ValeurReglage }
  theme: { theme: string }
  image: { temps: number; dt: number }
}

/** Tolérance de pointage (px) au-delà du rayon affiché. */
const TOLERANCE_POINTAGE = 4

const UI_DEFAUT: OptionsUI = {
  panneau: true, panneauOuvert: false, panneauMode: 'surimpression', histogramme: true, granularite: true, gizmo: true, reglages: true, barreVues: true, fiche: true,
}

// ─── Vue ─────────────────────────────────────────────────────────────────────

export class VueGraphe {
  readonly id: string
  /** Élément racine (.atlas-vue) : porte le thème et les variables CSS. */
  readonly racine: HTMLElement
  /** Conteneur de sigma et des calques. */
  readonly scene: HTMLElement
  /** Calque d'interface (au-dessus de la scène). */
  readonly interface: HTMLElement
  readonly donnees: JeuDonnees
  readonly h: Hierarchie
  readonly dispositions: Dispositions
  readonly camera = new Camera3D()
  readonly animateur = new Animateur()
  readonly granularite: Granularite
  readonly aretes: AretesAgregees
  readonly filtres: Filtres
  readonly lignee: Lignee
  readonly reglages: Reglages<ReglagesMoteur>
  readonly rendu: Rendu
  readonly controles: Controles
  readonly projection: Projection
  /** Positions 3D mélangées (avant granularité), 3 × nU. */
  readonly positionsBase: Float32Array
  /** Positions 3D affichées (après granularité), 3 × nU. */
  readonly positions: Float32Array
  /** Poids des faces [dessus, face, droite]. */
  readonly poidsFaces = new Float32Array([1, 0, 0])
  /** Opacité et rayon finaux par unité (après réducteurs) : utiles aux calques et au pointage. */
  readonly opaciteAffichee: Float32Array
  readonly tailleAffichee: Float32Array
  palette: Palette
  mode: '2d' | '3d'
  survol: number | null = null
  voisinsSurvol = new Set<number>()

  readonly reducteursNoeud: ReducteurNoeud[] = []
  readonly reducteursArete: ReducteurArete[] = []
  readonly dessinsDessous: HookDessin[] = []
  readonly dessinsDessus: HookDessin[] = []
  readonly crochetsPositions: CrochetPositions[] = []
  readonly crochetsProjection: CrochetProjection[] = []
  /** Quantiles, tranches et répartition par type des agrégats (voir etendues.ts). */
  readonly etendues: Etendues
  /** Marges propres à la variante (px), ajoutées à la zone sûre mesurée. */
  margesSures: Partial<Marges> | (() => Partial<Marges>) = {}
  rendreFiche: RenduFiche | null
  trajectoirePerso: Trajectoire | null
  courbePerso: Courbe | null

  readonly ui: {
    panneau?: PanneauGauche
    histogramme?: Histogramme
    granularite?: CurseurGranularite
    barre?: BarreVues
    gizmo?: Gizmo
    fiche?: Fiche
    menu?: MenuRadial
    reglages?: HTMLElement
  } = {}

  private evenements = new Emetteur<EvenementsVue>()
  private raf = 0
  private dernierT = 0
  private continu = 0
  private imagesRapides = 0
  private versions = { gran: -1, granEmise: -1, cam: -1, base: 0, baseCalculee: -1, lignee: -1 }
  private versionCameraInitiale = -1
  private libellesFiges: Set<string> | null = null
  private info: InfoUnite
  private infoArete: InfoArete

  constructor(conteneur: HTMLElement, options: OptionsVue = {}) {
    this.id = options.id ?? 'vue'
    this.racine = document.createElement('div')
    this.racine.className = 'atlas-vue'
    this.scene = document.createElement('div')
    this.scene.className = 'atlas-scene'
    this.interface = document.createElement('div')
    this.interface.className = 'atlas-interface'
    this.racine.append(this.scene, this.interface)
    conteneur.appendChild(this.racine)

    this.reglages = new Reglages<ReglagesMoteur>(`atlas-graphe3d:${this.id}`, [...DEFINITIONS_MOTEUR, ...(options.reglagesSupplementaires ?? [])], options.reglages ?? {})
    const R = this.reglages.valeurs
    this.racine.dataset.theme = R.theme
    this.palette = lirePalette(this.racine)

    this.donnees = options.donnees ?? genererJeuSynthetique()
    const h = (this.h = new Hierarchie(this.donnees))
    this.granularite = new Granularite(h, this.animateur, () => this.reglages.valeurs.dureeTransition)
    this.granularite.globale = options.granularite ?? 2
    this.aretes = new AretesAgregees(h)
    this.filtres = new Filtres(h, () => this.surFiltres())
    this.lignee = new Lignee(h)
    this.lignee.inclureDescendants = R.descendants
    this.dispositions = calculerDispositions(h, { placement: R.placementAgregats, bonusImportance: R.tailleImportance })
    this.etendues = new Etendues(h, this.dispositions)
    this.etendues.calculer()
    this.positionsBase = new Float32Array(h.nU * 3)
    this.positions = new Float32Array(h.nU * 3)
    this.projection = new Projection(h.nU)
    this.opaciteAffichee = new Float32Array(h.nU)
    this.tailleAffichee = new Float32Array(h.nU)
    this.info = {
      unite: 0, estAgregat: false, niveau: 3, noeud: undefined, categorie: undefined, domaine: 0, alpha: 1, ouverture: 1, actif: true,
      nbFeuilles: 1, x: 0, y: 0, profondeur: 0, echelle: 1, visible: true, survol: 'aucun', lignee: 'aucune', importance: 0,
    }
    this.infoArete = {
      paire: null as unknown as Paire, source: 0, cible: 0, feuille: true, poids: 0, nombre: 0, opaciteSource: 1, opaciteCible: 1, survol: 'aucun', lignee: false,
    }

    this.reducteursNoeud.push(...(options.reducteursNoeud ?? []))
    this.reducteursArete.push(...(options.reducteursArete ?? []))
    if (options.etenduesParDefaut !== false) this.dessinsDessous.push(dessinerEtendues)
    if (options.dessinerDessous) this.dessinsDessous.push(options.dessinerDessous)
    if (options.apresPositions) this.crochetsPositions.push(options.apresPositions)
    if (options.apresProjection) this.crochetsProjection.push(options.apresProjection)
    if (options.margesSures) this.margesSures = options.margesSures
    if (options.dessinerDessus) this.dessinsDessus.push(options.dessinerDessus)
    this.rendreFiche = options.rendreFiche ?? null
    this.trajectoirePerso = options.trajectoire ?? null
    this.courbePerso = options.courbe ?? null

    // Caméra
    this.mode = options.mode ?? '2d'
    this.camera.verrou2D = this.mode === '2d'
    this.camera.champVision = R.champVision
    this.camera.courbeAnimations = COURBES[R.courbeVues] ?? COURBES.sortie
    this.camera.definirOrientation(ORIENTATIONS[options.vueInitiale ?? 'dessus'])

    // Rendu sigma
    const palette = () => this.palette
    const tailleLibelle = () => this.reglages.valeurs.tailleLibelle
    this.rendu = new Rendu(this.scene, h, {
      nodeReducer: (_cle, attrs) => this.reduireNoeud(attrs),
      edgeReducer: (_cle, attrs) => this.reduireArete(attrs),
      dessinerLibelle: creerDessinLibelle(palette, tailleLibelle) as never,
      dessinerSurvol: creerDessinSurvol(palette, tailleLibelle) as never,
      programmesNoeud: options.programmesNoeud,
      programmesArete: options.programmesArete,
      reglagesSigma: {
        labelDensity: R.densiteLibelles,
        labelRenderedSizeThreshold: R.seuilLibelle,
        ...(options.reglagesSigma ?? {}),
      },
    })
    this.camera.redimensionner(this.rendu.largeur, this.rendu.hauteur)
    this.rendu.quandRedimensionne(() => {
      this.camera.redimensionner(this.rendu.largeur, this.rendu.hauteur)
      this.demanderRendu()
    })

    this.controles = new Controles(this.scene, this.camera, this.actionsClavier(), () => {
      const v = this.reglages.valeurs
      return { sensibiliteOrbite: v.sensibiliteOrbite, vitesseZoom: v.vitesseZoom, inertie: v.inertie, emulerPave: v.emulerPave, glisserGauche: v.glisserGauche }
    }, () => this.demanderRendu())

    this.brancherSigma()
    this.construireInterface({ ...UI_DEFAUT, ...(options.ui ?? {}) }, options)
    this.reglages.on((cle, valeur) => this.appliquerReglage(cle, valeur))

    // Premier calcul puis cadrage immédiat.
    this.calculer()
    this.camera.cadrer(this.positions, this.unitesVisibles(), 1, 1.3, this.zoneSure())
    this.versionCameraInitiale = this.camera.version
    this.demanderRendu()
  }

  // ─── API publique ────────────────────────────────────────────────────────

  on<K extends keyof EvenementsVue>(type: K, f: (v: EvenementsVue[K]) => void): () => void {
    return this.evenements.on(type, f)
  }

  emettre<K extends keyof EvenementsVue>(type: K, v: EvenementsVue[K]): void {
    this.evenements.emettre(type, v)
  }

  /** Demande une image (la boucle ne tourne que si quelque chose bouge). */
  demanderRendu(): void {
    if (!this.raf) this.raf = requestAnimationFrame(this.image)
  }

  /** Force la boucle à tourner en continu (effets animés d'une variante). Renvoie la fonction d'arrêt. */
  animerEnContinu(): () => void {
    this.continu++
    this.demanderRendu()
    let actif = true
    return () => {
      if (actif) this.continu--
      actif = false
    }
  }

  allerVue(nom: NomVue): void {
    if (this.mode === '2d' && nom === 'iso') this.definirMode('3d')
    this.camera.allerVue(nom, this.reglages.valeurs.dureeVues)
    this.emettre('vue', { nom, mode: this.mode })
    this.demanderRendu()
  }

  definirMode(mode: '2d' | '3d'): void {
    this.mode = mode
    this.camera.verrou2D = mode === '2d'
    if (mode === '2d') {
      // Se caler sur la face la plus proche.
      const a = this.camera.avant
      const ax = [Math.abs(a[0]), Math.abs(a[1]), Math.abs(a[2])]
      const i = ax.indexOf(Math.max(...ax))
      const nom: NomVue = i === 2 ? (a[2] < 0 ? 'dessus' : 'dessous') : i === 1 ? (a[1] > 0 ? 'face' : 'arriere') : a[0] < 0 ? 'droite' : 'gauche'
      this.camera.allerVue(nom, this.reglages.valeurs.dureeVues)
    } else if (this.camera.mode === 'ortho') this.camera.mode = 'auto'
    this.emettre('vue', { nom: this.camera.vueCourante(), mode })
    this.demanderRendu()
  }

  /** Granularité globale : anime (défaut) ou applique immédiatement. */
  definirGranularite(g: number, anime = true): void {
    if (anime) this.granularite.allerA(g)
    else this.granularite.definirGlobale(g)
    this.demanderRendu()
  }

  /** Passe au niveau entier suivant / précédent. */
  pasGranularite(pas: 1 | -1): void {
    const g = this.granularite.globale
    const cible = pas > 0 ? Math.min(3, Math.floor(g + 1e-3) + 1) : Math.max(0, Math.ceil(g - 1e-3) - 1)
    this.definirGranularite(cible)
  }

  /** Ouvre un agrégat (unité) : ses enfants en sortent. */
  ouvrir(u: number): void {
    const c = this.h.categorieDe(u)
    if (c) this.granularite.ouvrir(c.index)
    this.demanderRendu()
  }

  /** Replie l'unité dans son parent. */
  replier(u: number): void {
    const p = this.h.parent(u)
    if (p >= 0) this.granularite.replier(p - this.h.nF)
    this.demanderRendu()
  }

  selectionner(u: number | null): void {
    if (u === this.lignee.selection) return
    this.lignee.selectionner(u)
    this.emettre('selection', { unite: u })
    this.demanderRendu()
  }

  cadrer(unites: Iterable<number>): void {
    this.camera.cadrer(this.positions, unites, this.reglages.valeurs.dureeVues, 1.3, this.zoneSure())
    this.demanderRendu()
  }

  /**
   * Zone sûre : marges (px, relatives à la scène) occupées par l'interface visible. Mesure les
   * éléments larges collés à un bord (barre, bas, panneau ouvert), tout élément marqué
   * `data-zone-sure`, puis ajoute `margesSures` de la variante.
   */
  zoneSure(): Marges {
    const m: Marges = { haut: 0, bas: 0, gauche: 0, droite: 0 }
    const sc = this.scene.getBoundingClientRect()
    if (sc.width < 10 || sc.height < 10) return m
    const W = sc.width, H = sc.height
    const mesurer = (el: Element, force = false) => {
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) return
      const st = getComputedStyle(el)
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return
      const x0 = r.left - sc.left, x1 = r.right - sc.left, y0 = r.top - sc.top, y1 = r.bottom - sc.top
      if (x1 <= 0 || y1 <= 0 || x0 >= W || y0 >= H) return
      const large = force || r.width > W * 0.25, grand = force || r.height > H * 0.4
      if (large && y0 < H * 0.2 && y1 < H * 0.5) m.haut = Math.max(m.haut, y1 + 8)
      else if (large && y1 > H * 0.8 && y0 > H * 0.5) m.bas = Math.max(m.bas, H - y0 + 8)
      else if (grand && x0 < W * 0.2 && x1 < W * 0.5) m.gauche = Math.max(m.gauche, x1 + 8)
      else if (grand && x1 > W * 0.8 && x0 > W * 0.5) m.droite = Math.max(m.droite, W - x0 + 8)
    }
    for (const el of this.interface.querySelectorAll('.atlas-barre, .atlas-bas > *, .atlas-panneau.ouvert')) mesurer(el)
    for (const el of document.querySelectorAll('[data-zone-sure]')) mesurer(el, true)
    const sup = typeof this.margesSures === 'function' ? this.margesSures() : this.margesSures
    m.haut += sup.haut ?? 0
    m.bas += sup.bas ?? 0
    m.gauche += sup.gauche ?? 0
    m.droite += sup.droite ?? 0
    return m
  }

  /** Force le survol d'une unité (tests, pilotage externe). */
  definirSurvol(u: number | null): void {
    this.changerSurvol(u)
  }

  /** Calcule immédiatement `ms` millisecondes d'animation (tests, onglet masqué). */
  avancer(ms = 0, pas = 16): void {
    const t0 = performance.now()
    for (let t = 0; t <= ms; t += pas) this.image(t0 + t)
  }

  /** Ajoute un crochet de positions 3D (après granularité). Renvoie la fonction de retrait. */
  ajouterCrochetPositions(f: CrochetPositions): () => void {
    this.crochetsPositions.push(f)
    this.versions.base++
    this.demanderRendu()
    return () => this.retirer(this.crochetsPositions, f)
  }

  /** Ajoute un crochet après projection (positions écran). Renvoie la fonction de retrait. */
  ajouterApresProjection(f: CrochetProjection): () => void {
    this.crochetsProjection.push(f)
    this.demanderRendu()
    return () => this.retirer(this.crochetsProjection, f)
  }

  cadrerTout(): void {
    this.cadrer(this.unitesVisibles())
  }

  /** Cadre la lignée active (ou tout). */
  cadrerSelection(): void {
    if (this.lignee.selection === null) return this.cadrerTout()
    const l = this.lignee
    const unites = new Set<number>([l.selection!])
    for (let f = 0; f < this.h.nF; f++) {
      if (l.graines[f] || l.ancetres[f] || l.descendants[f]) unites.add(this.granularite.representant(f))
    }
    this.cadrer(unites)
  }

  definirTheme(theme: 'clair' | 'sombre'): void {
    if (this.reglages.valeurs.theme !== theme) return this.reglages.definir('theme', theme)
    this.racine.dataset.theme = theme
    this.palette = lirePalette(this.racine)
    this.emettre('theme', { theme })
    this.ui.gizmo?.dessiner(true)
    this.demanderRendu()
  }

  ajouterReducteurNoeud(f: ReducteurNoeud): () => void {
    this.reducteursNoeud.push(f)
    this.demanderRendu()
    return () => this.retirer(this.reducteursNoeud, f)
  }

  ajouterReducteurArete(f: ReducteurArete): () => void {
    this.reducteursArete.push(f)
    this.demanderRendu()
    return () => this.retirer(this.reducteursArete, f)
  }

  /** Ajoute un dessin sur le calque 'dessous' (sous les arêtes) ou 'dessus' (au-dessus des nœuds). */
  ajouterDessin(calque: 'dessous' | 'dessus', f: HookDessin): () => void {
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

  /** Remplace une disposition par des positions de feuilles (3 × nF) ; les agrégats sont recalculés. */
  remplacerDisposition(nom: NomDisposition, feuilles: Float32Array): void {
    this.dispositions[nom].set(feuilles.subarray(0, this.h.nF * 3))
    calculerBarycentres(this.h, this.dispositions, this.filtres.etat.mode === 'masquer' ? this.filtres.actives : undefined, this.reglages.valeurs.placementAgregats)
    this.etendues.calculer(this.filtres.restrictif ? this.filtres.actives : undefined)
    this.versions.base++
    this.demanderRendu()
  }

  /** Unité sous un point écran (pixels du conteneur), ou null. */
  uniteSous(x: number, y: number, marge = 4): number | null {
    const p = this.projection
    let meilleure: number | null = null, dMin = Infinity
    for (let u = 0; u < this.h.nU; u++) {
      if (this.opaciteAffichee[u]! < 0.05) continue
      const d = Math.hypot(p.x[u]! - x, p.y[u]! - y)
      if (d <= this.tailleAffichee[u]! + marge && d < dMin) {
        dMin = d
        meilleure = u
      }
    }
    return meilleure
  }

  /** Unités actuellement visibles (alpha > 0 et actives). */
  unitesVisibles(): number[] {
    const r: number[] = []
    for (let u = 0; u < this.h.nU; u++) if (this.granularite.alpha[u]! > 0.01) r.push(u)
    return r
  }

  detruire(): void {
    cancelAnimationFrame(this.raf)
    this.controles.detruire()
    this.rendu.detruire()
    this.racine.remove()
  }

  // ─── Boucle ──────────────────────────────────────────────────────────────

  /** Calcule et dessine une image au temps t (appelée par requestAnimationFrame ; publique pour les tests). */
  image = (t: number): void => {
    this.raf = 0
    // Premier cadrage refait à la première image : l'interface de la variante existe alors.
    if (this.versionCameraInitiale >= 0) {
      if (this.camera.version === this.versionCameraInitiale && !this.camera.enAnimation) {
        this.camera.cadrer(this.positions, this.unitesVisibles(), 1, 1.3, this.zoneSure())
      }
      this.versionCameraInitiale = -1
    }
    const dt = this.dernierT ? Math.min(64, t - this.dernierT) : 16
    this.dernierT = t
    let bouge = this.animateur.mettreAJour(t)
    bouge = this.controles.mettreAJour(dt) || bouge
    bouge = this.camera.mettreAJour(t, dt) || bouge
    const encore = bouge || this.continu > 0 || this.animateur.enCours || this.camera.enAnimation
    // Libellés stables : pendant un mouvement, on garde ceux affichés au départ.
    if (encore && this.reglages.valeurs.libellesStables) {
      this.libellesFiges ??= new Set(this.rendu.sigma.getNodeDisplayedLabels())
    } else this.libellesFiges = null
    this.calculer()
    if (!encore) this.rendu.purgerAretes(this.aretes.paires.values())
    // Passe complète sigma (tri de profondeur, grille de libellés) à la dernière image d'un
    // mouvement et régulièrement pendant celui-ci ; sinon chemin rapide.
    this.imagesRapides = encore && this.imagesRapides < 8 ? this.imagesRapides + 1 : 0
    this.dessiner(t, this.imagesRapides === 0)
    this.emettre('image', { temps: t, dt })
    if (encore) this.demanderRendu()
    else {
      this.dernierT = 0
      // Fin de mouvement : le nœud sous un pointeur immobile a pu changer.
      const m = this.controles.souris
      if (m.dedans && !this.controles.enGeste && this.ui.fiche !== undefined) this.changerSurvol(this.uniteSous(m.x, m.y, TOLERANCE_POINTAGE))
    }
  }

  /** Granularité → arêtes, orientation → mélange des faces, puis positions et projection. */
  private calculer(): void {
    const g = this.granularite
    const R = this.reglages.valeurs
    let granChange = false
    if (g.version !== this.versions.gran) {
      this.versions.gran = g.version
      g.calculer()
      const diff = this.aretes.calculer(g)
      if (diff && (diff.ajoutees.length || diff.retirees.length)) this.rendu.synchroniserAretes(diff.ajoutees, diff.retirees)
      if (this.survol !== null) this.voisinsSurvol = this.aretes.voisins(this.survol)
      granChange = true
    }
    if (granChange || this.lignee.version !== this.versions.lignee) {
      this.versions.lignee = this.lignee.version
      this.aretes.calculerLignee(g, this.lignee)
    }
    let baseChange = false
    if (this.camera.version !== this.versions.cam || this.versions.base !== this.versions.baseCalculee) {
      this.versions.cam = this.camera.version
      this.versions.baseCalculee = this.versions.base
      poidsFaces(this.camera.avant, R.nettete, this.poidsFaces)
      melangerDispositions(this.dispositions, this.poidsFaces, R.mode3D, this.positionsBase)
      baseChange = true
    }
    if (granChange || baseChange) {
      const courbe = this.courbePerso ?? COURBES[R.courbe] ?? COURBES.douce
      const traj = this.trajectoirePerso ?? TRAJECTOIRES[R.trajectoire] ?? TRAJECTOIRES.droite
      g.calculerPositions(this.positionsBase, this.positions, courbe, traj)
      if (this.crochetsPositions.length) {
        const c: ContextePositions = { vue: this, positions: this.positions, base: this.positionsBase, ouverture: g.ouverture, sens: g.sens }
        for (const f of this.crochetsPositions) f(c)
      }
    }
    this.camera.projeter(this.positions, this.projection)
    for (const f of this.crochetsProjection) f(this.projection, this)
    if (g.version !== this.versions.granEmise) {
      this.versions.granEmise = g.version
      this.emettre('granularite', { globale: g.globale })
    }
  }

  private dessiner(t: number, complet = true): void {
    this.rendu.positionner(this.projection)
    this.rendu.rafraichir(complet)
    this.rendu.preparerCalques()
    const base = { vue: this, largeur: this.rendu.largeur, hauteur: this.rendu.hauteur, projection: this.projection, positions: this.positions, temps: t }
    for (const f of this.dessinsDessous) f({ ...base, ctx: this.rendu.ctxDessous })
    for (const f of this.dessinsDessus) f({ ...base, ctx: this.rendu.ctxDessus })
    this.ui.gizmo?.dessiner()
    const fiche = this.ui.fiche
    if (fiche && fiche.uniteAffichee !== null && this.controles.souris.dedans) {
      fiche.positionner(this.controles.souris.x + this.scene.offsetLeft, this.controles.souris.y + this.scene.offsetTop, this.racine.clientWidth, this.racine.clientHeight)
    }
  }

  // ─── Réducteurs ──────────────────────────────────────────────────────────

  /** Remplit l'objet InfoUnite réutilisé pour l'unité u. */
  decrire(u: number): InfoUnite {
    const { h, granularite: g, projection: p } = this
    const i = this.info
    const agr = u >= h.nF
    const c = agr ? h.categories[u - h.nF]! : undefined
    i.unite = u
    i.estAgregat = agr
    i.niveau = c ? c.niveau : 3
    i.noeud = agr ? undefined : h.noeuds[u]
    i.categorie = c
    i.domaine = h.domaine(u)
    i.alpha = g.alpha[u]!
    i.ouverture = c ? g.ouverture[c.index]! : g.facteur(u)
    i.actif = c ? g.nbActives[c.index]! > 0 : this.filtres.actives[u] === 1
    i.nbFeuilles = c ? g.nbActives[c.index]! : 1
    i.x = p.x[u]!
    i.y = p.y[u]!
    i.profondeur = p.profondeurNormalisee(u)
    i.echelle = p.echelle[u]!
    i.visible = p.visible[u] === 1
    i.survol = this.survol === null ? 'aucun' : u === this.survol ? 'survole' : this.voisinsSurvol.has(u) ? 'voisin' : 'autre'
    i.lignee = this.lignee.role(u)
    i.importance = agr ? 0 : Math.sqrt(h.importance[u]! / h.importanceMax)
    return i
  }

  /** Apparence par défaut (avant les réducteurs de la variante). */
  apparenceParDefaut(info: InfoUnite): AffichageNoeud {
    const R = this.reglages.valeurs
    const pal = this.palette
    const agr = info.estAgregat
    let opacite = info.alpha
    let taille = agr
      ? R.tailleNoeud * (1 + R.tailleAgregat * Math.sqrt(Math.max(1, info.nbFeuilles))) * (1 - 0.5 * info.ouverture)
      : R.tailleNoeud * (1 + R.tailleImportance * info.importance) * (0.4 + 0.6 * info.alpha)
    if (R.taillePerspective) taille *= Math.max(0.15, info.echelle)
    const estompe = R.opaciteEstompe
    if (!info.actif && this.filtres.restrictif) opacite *= estompe
    // Survol et lignée atténuent le contexte une seule fois (pas de cumul) : il reste lisible.
    const contexte = R.opaciteContexte ?? 0.3
    let attenuation = info.survol === 'autre' ? contexte : 1
    let couleurBordure = pal.bordureNoeud
    let tailleBordure = R.bordure
    let surligne = false
    if (info.lignee === 'hors') attenuation = Math.min(attenuation, contexte)
    else if (info.lignee !== 'aucune') {
      surligne = true
      couleurBordure = info.lignee === 'selection' ? pal.accent : info.lignee === 'ancetre' ? pal.ancetre : pal.descendant
      tailleBordure = Math.max(0.32, R.bordure * 2)
    }
    opacite *= attenuation
    if (R.brouillard && this.camera.perspective > 0) opacite *= 1 - R.intensiteBrouillard * this.camera.perspective * info.profondeur
    const nom = agr ? info.categorie!.nom : info.noeud!.nom
    let libelle: string | null = R.libelles === 'aucun' || (R.libelles === 'agregats' && !agr) ? null : nom
    // Les agrégats (plus gros) gagnent naturellement la grille de libellés de sigma.
    let force = false
    if (info.survol === 'survole' || info.lignee === 'selection') {
      libelle = nom
      force = true
    }
    const devant = info.survol === 'survole' || info.survol === 'voisin'
    return {
      couleur: agr ? pal.domaines[info.domaine % pal.domaines.length]! : pal.statut[info.noeud!.statut],
      opacite,
      taille,
      couleurBordure,
      tailleBordure,
      libelle,
      forceLibelle: force,
      opaciteLibelle: agr ? Math.min(1, Math.max(0, (info.alpha - 0.35) / 0.45)) : 1,
      cache: !info.visible || info.alpha < 0.01,
      zIndex: Math.round((1 - info.profondeur) * 1000) + (agr ? 1000 : 0) + (surligne ? 2000 : 0) + (devant ? 4000 : 0),
      surligne,
    }
  }

  private reduireNoeud(attrs: Attributes): Partial<NodeDisplayData> {
    const u = attrs.u as number
    const info = this.decrire(u)
    const a = this.apparenceParDefaut(info)
    for (const r of this.reducteursNoeud) r(info, a, this)
    const cache = a.cache || a.opacite < 0.01
    if (this.libellesFiges && a.libelle && !cache && a.opacite > 0.2 && this.libellesFiges.has(this.h.cles[u]!)) a.forceLibelle = true
    this.opaciteAffichee[u] = cache ? 0 : a.opacite
    this.tailleAffichee[u] = a.taille
    const res: Record<string, unknown> = {
      x: attrs.x as number,
      y: attrs.y as number,
      size: a.taille,
      color: rgbaGL(a.couleur, a.opacite),
      couleurBordure: rgbaGL(a.couleurBordure, a.opacite),
      tailleBordure: a.tailleBordure,
      label: a.libelle,
      forceLabel: a.forceLibelle,
      hidden: cache,
      zIndex: a.zIndex,
      estAgregat: info.estAgregat,
      opaciteLibelle: a.opaciteLibelle * Math.min(1, a.opacite * 1.6),
      u,
    }
    if (a.type) res.type = a.type
    if (a.extra) Object.assign(res, a.extra)
    return res as Partial<NodeDisplayData>
  }

  private reduireArete(attrs: Attributes): Partial<EdgeDisplayData> {
    const p = attrs.p as Paire
    const R = this.reglages.valeurs
    const pal = this.palette
    const i = this.infoArete
    const os = this.opaciteAffichee[p.source]!, ot = this.opaciteAffichee[p.cible]!
    i.paire = p
    i.source = p.source
    i.cible = p.cible
    i.feuille = p.feuille
    i.poids = p.poids
    i.nombre = p.nombre
    i.opaciteSource = os
    i.opaciteCible = ot
    i.survol = this.survol === null ? 'aucun' : p.source === this.survol || p.cible === this.survol ? 'incidente' : 'autre'
    const l = this.lignee
    const rs = l.role(p.source), rc = l.role(p.cible)
    i.lignee = l.active && p.poidsLignee > 0.01
    const moyen = p.nombre ? p.poids / p.nombre : 0
    const a: AffichageArete = {
      couleur: pal.arete,
      opacite: R.opaciteAretes * moyen * Math.min(os, ot),
      taille: p.feuille ? R.epaisseurArete : R.epaisseurArete * (0.7 + R.epaisseurAgregee * 0.5 * Math.sqrt(p.poids)),
      cache: p.poids < 0.005 || os < 0.01 || ot < 0.01,
      zIndex: 0,
    }
    if (i.survol === 'incidente') {
      a.couleur = pal.accent
      a.opacite = Math.min(1, Math.max(a.opacite * 2.5, 0.65 * moyen))
      a.zIndex = 2
    }
    if (i.lignee) {
      const versAncetre = rs === 'ancetre' || rc === 'ancetre'
      a.couleur = versAncetre ? pal.ancetre : pal.descendant
      a.opacite = Math.max(a.opacite, 0.85 * moyen * (0.4 + 0.6 * Math.min(1, p.poidsLignee / Math.max(1e-6, p.poids))))
      a.taille *= 1.5
      a.zIndex = 1
    } else if (l.active) a.opacite *= Math.min(1, (R.opaciteContexte ?? 0.3) * 1.6)
    for (const r of this.reducteursArete) r(i, a, this)
    const res: Record<string, unknown> = { size: a.taille, color: rgbaGL(a.couleur, a.opacite), hidden: a.cache || a.opacite < 0.004, zIndex: a.zIndex }
    if (a.type) res.type = a.type
    if (a.extra) Object.assign(res, a.extra)
    return res as Partial<EdgeDisplayData>
  }

  // ─── Événements ──────────────────────────────────────────────────────────

  private changerSurvol(u: number | null): void {
    if (u === this.survol) return
    this.survol = u
    this.voisinsSurvol = u === null ? new Set() : this.aretes.voisins(u)
    const fiche = this.ui.fiche
    if (fiche) {
      if (u === null) fiche.masquer()
      else {
        const defaut = () => ficheParDefaut(this, u)
        fiche.afficher(u, this.rendreFiche ? this.rendreFiche(u, this, defaut) : defaut())
        fiche.positionner(this.controles.souris.x + this.scene.offsetLeft, this.controles.souris.y + this.scene.offsetTop, this.racine.clientWidth, this.racine.clientHeight)
      }
    }
    this.emettre('survol', { unite: u })
    this.demanderRendu()
  }

  /** Vrai si le clic qui arrive termine un glisser ou vient d'un geste tactile (déjà traité). */
  private clicAIgnorer(): boolean {
    const t = performance.now()
    return t - this.controles.dernierGlisser < 80 || t - this.controles.dernierTactile < 600
  }

  private actionDouble(u: number | null, alt: boolean): void {
    if (u === null) return this.cadrerTout()
    if (alt) return this.replier(u)
    if (this.h.estAgregat(u) && this.granularite.ouverture[u - this.h.nF]! < 0.5) return this.ouvrir(u)
    const voisins = new Set<number>([u])
    if (!this.h.estAgregat(u)) {
      for (const p of this.h.premisses[u]!) voisins.add(this.granularite.representant(p))
      for (const p of this.h.utilisePar[u]!) voisins.add(this.granularite.representant(p))
    } else for (const f of this.h.categories[u - this.h.nF]!.feuilles) voisins.add(this.granularite.representant(f))
    this.cadrer(voisins)
  }

  private brancherSigma(): void {
    const s = this.rendu.sigma
    const unite = (cle: string) => this.h.uniteParCle.get(cle) ?? null
    // Survol et clics : pointage maison avec tolérance (TOLERANCE_POINTAGE px autour du disque),
    // plus indulgent que le pointage exact de sigma sur les petits nœuds.
    const local = (e: MouseEvent | PointerEvent) => {
      const r = this.scene.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    s.on('clickNode', ({ node, event }) => {
      if (this.clicAIgnorer()) return
      const u = unite(node)
      this.emettre('clic', { unite: u, original: event.original })
      this.selectionner(u)
    })
    s.on('clickStage', ({ event }) => {
      if (this.clicAIgnorer()) return
      const u = this.uniteSous(event.x, event.y, TOLERANCE_POINTAGE)
      this.emettre('clic', { unite: u, original: event.original })
      this.selectionner(u)
    })
    s.on('doubleClickNode', ({ node, event, preventSigmaDefault }) => {
      preventSigmaDefault()
      event.preventSigmaDefault()
      this.actionDouble(unite(node), (event.original as MouseEvent).altKey)
    })
    s.on('doubleClickStage', ({ event, preventSigmaDefault }) => {
      preventSigmaDefault()
      event.preventSigmaDefault()
      const u = this.uniteSous(event.x, event.y, TOLERANCE_POINTAGE)
      if (u !== null) this.actionDouble(u, (event.original as MouseEvent).altKey)
    })
    this.scene.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return
      const p = local(e)
      if (!this.controles.enGeste) this.changerSurvol(this.uniteSous(p.x, p.y, TOLERANCE_POINTAGE))
      // La fiche suit le pointeur même quand aucune image n'est calculée.
      const f = this.ui.fiche
      if (f && f.uniteAffichee !== null) f.positionner(p.x + this.scene.offsetLeft, p.y + this.scene.offsetTop, this.racine.clientWidth, this.racine.clientHeight)
    })
    this.scene.addEventListener('pointerleave', () => this.changerSurvol(null))
  }

  private actionsClavier(): ActionsControles {
    return {
      vue: (nom) => this.allerVue(nom),
      opposee: () => {
        this.camera.opposee(this.reglages.valeurs.dureeVues)
        this.demanderRendu()
      },
      orbiterPas: (axe, angle) => {
        // En 2D, orbiter (2/4/6/8) fait passer en 3D, comme quitter une vue d'axe dans Blender.
        if (this.mode === '2d') this.definirMode('3d')
        this.camera.orbiterPas(axe, angle, this.reglages.valeurs.dureeVues * 0.5)
      },
      basculerProjection: () => {
        if (this.mode === '2d') this.definirMode('3d')
        this.camera.basculerProjection()
      },
      cadrerSelection: () => this.cadrerSelection(),
      cadrerTout: () => this.cadrerTout(),
      granularite: (pas) => this.pasGranularite(pas),
      echap: () => {
        if (this.ui.menu?.ouvert) return this.ui.menu.fermer()
        this.selectionner(null)
      },
      menuRadial: (x, y) => this.ui.menu?.ouvrir(x, y),
      tape: (x, y) => {
        const u = this.uniteSous(x, y, 10)
        this.emettre('clic', { unite: u })
        this.selectionner(u)
        const fiche = this.ui.fiche
        if (fiche && u !== null) {
          const defaut = () => ficheParDefaut(this, u)
          fiche.afficher(u, this.rendreFiche ? this.rendreFiche(u, this, defaut) : defaut())
          fiche.positionner(x + this.scene.offsetLeft, y + this.scene.offsetTop, this.racine.clientWidth, this.racine.clientHeight)
        } else fiche?.masquer()
      },
      tapeDouble: (x, y) => this.actionDouble(this.uniteSous(x, y, 10), false),
    }
  }

  private surFiltres(): void {
    const masquer = this.filtres.etat.mode === 'masquer'
    this.granularite.definirActives(this.filtres.actives, masquer)
    calculerBarycentres(this.h, this.dispositions, masquer ? this.filtres.actives : undefined, this.reglages.valeurs.placementAgregats)
    this.etendues.calculer(this.filtres.restrictif ? this.filtres.actives : undefined)
    this.versions.base++
    this.emettre('filtres', { etat: this.filtres.etat, nbActives: this.filtres.nbActives })
    this.demanderRendu()
  }

  private appliquerReglage(cle: string, valeur: ValeurReglage): void {
    const s = this.rendu.sigma
    switch (cle) {
      case 'theme': this.definirTheme(valeur as 'clair' | 'sombre'); break
      case 'champVision': this.camera.champVision = valeur as number; this.camera.version++; break
      case 'densiteLibelles': s.setSetting('labelDensity', valeur as number); break
      case 'seuilLibelle': s.setSetting('labelRenderedSizeThreshold', valeur as number); break
      case 'descendants': this.lignee.definirDescendants(valeur as boolean); this.emettre('selection', { unite: this.lignee.selection }); break
      case 'mode3D': case 'nettete': case 'courbe': case 'trajectoire': this.versions.base++; this.granularite.version++; break
      case 'courbeVues': this.camera.courbeAnimations = COURBES[valeur as keyof typeof COURBES] ?? COURBES.sortie; break
      case 'placementAgregats':
        calculerBarycentres(this.h, this.dispositions, this.filtres.etat.mode === 'masquer' ? this.filtres.actives : undefined, valeur as 'mediane' | 'moyenne')
        this.versions.base++
        break
    }
    this.emettre('reglage', { cle, valeur })
    this.demanderRendu()
  }

  private construireInterface(ui: OptionsUI, options: OptionsVue): void {
    const i = this.interface
    if (ui.fiche) this.ui.fiche = new Fiche(i)
    if (ui.gizmo) {
      this.ui.gizmo = new Gizmo(i, this.camera, {
        vue: (nom) => this.allerVue(nom),
        demanderRendu: () => this.demanderRendu(),
        sensibilite: () => this.reglages.valeurs.sensibiliteOrbite,
      })
    }
    if (ui.reglages) {
      const c = document.createElement('div')
      c.className = 'atlas-reglages'
      i.appendChild(c)
      this.reglages.monterPanneau(c)
      this.ui.reglages = c
    }
    if (ui.barreVues) this.ui.barre = new BarreVues(i, this)
    const bas = document.createElement('div')
    bas.className = 'atlas-bas'
    i.appendChild(bas)
    if (ui.granularite) this.ui.granularite = new CurseurGranularite(bas, this)
    if (ui.histogramme) this.ui.histogramme = new Histogramme(bas, this)
    if (ui.panneau) {
      const externe = ui.panneauMode === 'externe' && ui.conteneurPanneau
      this.ui.panneau = new PanneauGauche(externe ? ui.conteneurPanneau! : i, this, ui.panneauOuvert, { mode: externe ? 'externe' : ui.panneauMode })
      options.panneau?.(this.ui.panneau, this)
    }
    this.ui.menu = new MenuRadial(i, this)
  }
}

/** Crée une vue complète dans `conteneur`. */
export function creerVue(conteneur: HTMLElement, options: OptionsVue = {}): VueGraphe {
  return new VueGraphe(conteneur, options)
}

// Réexports utiles aux variantes.
export * from './donnees'
export * from './anim'
export * from './apparence'
export * from './maths'
export { Camera3D, Projection, ORIENTATIONS, NOMS_VUES, LIBELLES_VUES, type NomVue, type ModeProjection, type Marges } from './camera3d'
export { Hierarchie, Granularite, AretesAgregees, NOMS_NIVEAUX, statistiquesCategorie, type Categorie, type Paire, type StatsCategorie } from './hierarchie'
export { calculerDispositions, calculerBarycentres, carteThematique, relaxerCollisions, quantile, couloirs, centreCouloir, poidsFaces, Z_MAX, NOMS_DISPOSITIONS, type Dispositions, type NomDisposition, type PlacementAgregats, type OptionsDispositions } from './dispositions'
export { Etendues, dessinerEtendues, pointSurAxe, poidsAxes, etendueTempsEcran, type Quantiles, type EtendueAgregat } from './etendues'
export { Filtres, etatFiltresVide, normaliserTexte, type EtatFiltres, type ModeFiltre } from './filtres'
export { Lignee, ancetres, descendants, type RoleLignee } from './lignee'
export { Reglages, DEFINITIONS_MOTEUR, type DefinitionReglage, type ReglagesMoteur, type ValeurReglage } from './reglages'
export { PanneauGauche } from './ui/panneau'
export { Fiche, ficheParDefaut, barreConfiance, barreStatuts, type RenduFiche } from './ui/fiche'
export { el, formaterDate, formaterDateCourte, formaterNombre } from './ui/dom'
