// Vue « Graphe de raisonnement » : rendu R41 (graphe-dessin.ts) des positions de /api/vue, édité à la souris, au clavier
// ou au doigt avec des commandes courantes (fond glissé comme une carte, molette et pincement pour zoomer). Toute
// modification passe par POST /api/projets/{id}/vue (tout ou rien) ; un refus (422) ramène la vue à son état et affiche
// le message du serveur.
//
// Règle de dépôt d'un nœud glissé : il prend la case (colonne, ligne) sous lui, magnétisée sur la grille, et le cadre
// sous le point de dépôt (le plus profond, hors cadres réduits) ; déposé hors de tout cadre, il garde son cadre
// d'origine (le cadre s'agrandit). Pour sortir un nœud de son cadre : clic droit → « Sortir du cadre ».

import './graphe.css'
import { api, RefusVue, type Graphe, type Noeud, type OperationVue, type PlacementVue, type Vue } from './api'
import { animer, type Animation } from './graphe-animation'
import { instantane, operationsVers, type Entree, type Instantane } from './graphe-annuler'
import { Contenu } from './graphe-contenu'
import { dansCadre, dessiner, niveauDe, oublierMesures, PALETTE, positionsRenvois, referenceDe, rgba, type Camera, type EtatDessin } from './graphe-dessin'
import { ImagesFigures, ouvrirFenetre } from './graphe-figures'
import { CADRE, CLE_FONCTION, construireModele, dansRect, FORMATS_FIGURE, GRILLE, PREFIXE_FIGURE, rectBloc, TEINTES, union, type Bloc, type Modele, type Rect, type Surcharge } from './graphe-modele'
import { echapper } from './rendu'

/** Paliers de zoom de l'éditeur Blueprint d'UE5 (−12 à +7), plus trois paliers lointains ; le pincement
 * zoome en continu entre les extrêmes. */
const ZOOMS: [number, string][] = [
  [0.04, '−15'], [0.06, '−14'], [0.08, '−13'],
  [0.1, '−12'], [0.125, '−11'], [0.15, '−10'], [0.175, '−9'], [0.2, '−8'], [0.225, '−7'], [0.25, '−6'],
  [0.375, '−5'], [0.5, '−4'], [0.675, '−3'], [0.75, '−2'], [0.875, '−1'], [1, '1:1'],
  [1.25, '+1'], [1.375, '+2'], [1.5, '+3'], [1.675, '+4'], [1.75, '+5'], [1.875, '+6'], [2, '+7'],
]
const INDEX_1_1 = ZOOMS.findIndex(([z]) => z === 1)
/** Déplacement (px d'écran) au-delà duquel un clic devient un glisser. */
const SEUIL_GLISSER = 4
/** Au-delà, une relecture qui change beaucoup de cases (réorganisation) n'est pas animée. */
const DEPLACES_ANIMES_MAX = 60
/** Délai qui distingue un clic sur une barre de titre (réduire) d'un double-clic (renommer). */
const DELAI_DOUBLE_CLIC = 260
/** Au doigt : seuil de glisser plus large (le doigt tremble), appui long et double toucher. */
const SEUIL_GLISSER_DOIGT = 10
const DELAI_APPUI_LONG = 450
const DELAI_DOUBLE_TOUCHER = 350

export const AIDE_COMMANDES: [string, string][] = [
  ['Glisser sur le fond', 'Déplacer la vue (aussi : Espace + glisser, clic droit ou molette enfoncée + glisser)'],
  ['Molette', 'Zoom sur le curseur, par paliers'],
  ['Pincer (pavé tactile ou écran)', 'Zoom continu'],
  ['+ / −', 'Zoomer / dézoomer au centre'],
  ['Flèches', 'Déplacer la vue (Maj : plus loin)'],
  ['0 ou Origine (Home)', 'Cadrer tout le graphe'],
  ['F', 'Cadrer la sélection'],
  ['Clic', 'Sélectionner un nœud ; sur le fond : tout désélectionner'],
  ['Ctrl + clic', 'Ajouter ou retirer de la sélection'],
  ['Maj + clic', 'Ajouter à la sélection'],
  ['Maj ou Ctrl + glisser sur le fond', 'Sélection rectangulaire (ajoute à la sélection)'],
  ['Ctrl + A', 'Tout sélectionner'],
  ['Glisser un nœud', 'Déplacer la sélection, case par case ; déposée dans un cadre, elle y entre'],
  ['Glisser une barre de titre', 'Déplacer le cadre et tout son contenu'],
  ['Clic sur une barre de titre, ou ▾', 'Réduire le cadre en nœud-fonction, ou le déployer'],
  ['Double-clic sur une barre de titre', 'Renommer le cadre'],
  ['Double-clic sur un nœud, ou Entrée', 'Ouvrir sa fiche'],
  ['Double-clic sur une figure, ou Entrée', 'L’ouvrir en grand (Échap ou clic hors pour fermer)'],
  ['Clic droit', 'Menu contextuel (nœud, cadre ou fond)'],
  ['F2', 'Renommer le nœud ou la figure sélectionnés'],
  ['C', 'Créer un cadre autour de la sélection'],
  ['Échap', 'Désélectionner'],
  ['Ctrl + Z / Ctrl + Y', 'Annuler / rétablir les changements de vue de la session'],
  ['Suppr', 'Sans effet : la vue ne supprime aucun nœud'],
]

/** Gestes sur écran tactile (tablette), affichés sous les commandes. */
export const AIDE_TACTILE: [string, string][] = [
  ['Glisser un doigt', 'Déplacer la vue'],
  ['Pincer à deux doigts', 'Zoomer (et déplacer)'],
  ['Toucher', 'Sélectionner ; sur le fond : désélectionner'],
  ['Toucher deux fois', 'Ouvrir la fiche, la figure, ou renommer un cadre'],
  ['Appui long', 'Saisir le nœud ou le cadre pour le glisser ; relâché sans bouger : menu contextuel'],
]

type Cible =
  | { genre: 'bloc'; id: string }
  | { genre: 'fonction'; cadre: string }
  | { genre: 'titre'; cadre: string; glyphe: boolean }
  | { genre: 'renvoi'; id: string }
  | { genre: 'cadre'; cadre: string }
  | { genre: 'fond' }

interface Origine {
  colonne: number
  ligne: number
  groupe: string | null
}

type Geste =
  // `cible` : au doigt, ce qui était sous le doigt (un toucher sans bouger y agit comme un clic).
  | { genre: 'vue'; x0: number; y0: number; camX: number; camY: number; bouge: boolean; bouton: number; cible?: Cible }
  // `saisi` : saisi au doigt par un appui long (relâché sans bouger : menu contextuel).
  | { genre: 'noeuds'; x0: number; y0: number; origines: Map<string, Origine>; dc: number; dl: number; bouge: boolean; seul: string | null; saisi?: boolean }
  | { genre: 'cadre'; x0: number; y0: number; cadre: string; origines: Map<string, Origine>; dc: number; dl: number; bouge: boolean; titre: boolean; saisi?: boolean }
  | { genre: 'rectangle'; x0: number; y0: number; ajout: boolean; avant: Set<string>; bouge: boolean }
  | { genre: 'renvoi'; x0: number; y0: number; id: string; bouge: boolean }
  | { genre: 'repli'; x0: number; y0: number; cadre: string; bouge: boolean }

export interface OptionsVueGraphe {
  /** Double-clic sur un nœud (null : fermer la fiche). */
  surOuvrir: (noeud: Noeud | null) => void
  /** Relit le graphe et la vue de l'espace (puis appelle `afficher`). */
  recharger: () => Promise<void>
  /** Après chaque image : le pilotage compare l'écran à son dernier état exporté (P4). */
  surChangement?: () => void
}

/** Un nœud à l'écran, en pixels de la scène (pilotage, P4 `visibles`). */
export interface NoeudVisible {
  id: string
  nom: string
  x: number
  y: number
}

export class VueGraphe {
  private scene: HTMLElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private contenu: Contenu
  private options: OptionsVueGraphe
  private graphe: Graphe = { noeuds: [], aretes: [] }
  private vue: Vue = { groupes: [], placements: [], etiquettes: [], marques: [] }
  private base: Modele
  private modele: Modele
  private estompes: Set<string> | null = null
  /** Conversation du filtre « Cette conversation » (null : pas de filtre). */
  private conversationFiltre: string | null = null
  /** Filtre du pilotage (voix) : un nœud qui ne passe pas est estompé. */
  private filtrePilotage: ((n: Noeud) => boolean) | null = null
  private surlignes: Set<string> | null = null
  private animCamera: Animation | null = null
  /** Largeur (px) couverte à droite par la fiche : les cadrages et le centre de l'écran l'évitent. */
  margeDroite = 0
  private projetId: string | null = null
  private lectureSeule: string | null = null
  private cam: Camera = { x: 40, y: 40, z: 1 }
  private iZoom = INDEX_1_1
  private largeur = 0
  private hauteur = 0
  private selection = new Set<string>()
  private survol: string | null = null
  private renvoiSurvole: string | null = null
  private titreSurvole: string | null = null
  private hypothese: Bloc | null = null
  private surcharges: Map<string, Surcharge> | null = null
  /** Nœuds déplacés en base par quelqu'un d'autre (voix, agent), animés de leur ancienne case à la nouvelle. */
  private transition: Map<string, Surcharge> | null = null
  private animTransition: Animation | null = null
  /** Espace des données affichées : un changement d'espace n'est jamais animé. */
  private projetAffiche: string | null = null
  private conflits: Set<string> | null = null
  private cadreCible: string | null = null
  private geste: Geste | null = null
  private image = 0
  private aCadrer = true
  private pile: Entree[] = []
  private refaire: Entree[] = []
  private enCours = false
  private minuterieTitre = 0
  private molette = 0
  /** Doigts posés sur la scène (position écran), pincement en cours, appui long, dernier toucher. */
  private doigts = new Map<number, { sx: number; sy: number }>()
  private pince: { d0: number; z0: number; mx: number; my: number } | null = null
  private minuterieAppuiLong = 0
  private dernierToucher = { t: 0, sx: 0, sy: 0 }
  private dernierDoigt = 0
  /** Espace maintenue : glisser déplace la vue, même sur un nœud. */
  private espace = false
  private menu: HTMLElement
  private saisie: HTMLInputElement
  private aide: HTMLElement
  private avisEl: HTMLElement
  private minuterieAvis = 0
  private zoomEl: HTMLElement
  private rectangle: HTMLElement
  private renommage: ((valider: boolean) => void) | null = null
  private images: ImagesFigures
  /** Fenêtre d'une figure ouverte en grand : sa fermeture. */
  private fermerFenetre: (() => void) | null = null

  constructor(scene: HTMLElement, options: OptionsVueGraphe) {
    this.scene = scene
    this.options = options
    this.images = new ImagesFigures(
      (f) => (this.projetId && f.image ? api.imageFigure(this.projetId, f.id, f.modifie_le) : null),
      () => this.demander(),
    )
    scene.classList.add('gr-scene')
    scene.tabIndex = 0
    scene.setAttribute('aria-label', 'Graphe de raisonnement (aide : bouton ?)')
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'gr-canevas'
    scene.append(this.canvas)
    this.ctx = this.canvas.getContext('2d')!
    this.contenu = new Contenu(scene)
    this.rectangle = element(scene, 'div', 'gr-rectangle')
    this.rectangle.hidden = true
    this.menu = element(scene, 'div', 'gr-menu')
    this.menu.hidden = true
    this.menu.setAttribute('role', 'menu')
    this.saisie = element(scene, 'input', 'gr-saisie') as HTMLInputElement
    this.saisie.hidden = true
    this.aide = element(scene, 'div', 'gr-aide')
    this.aide.hidden = true
    const table = (lignes: [string, string][]) => `<table>${lignes
      .map(([t, d]) => `<tr><th>${echapper(t)}</th><td>${echapper(d)}</td></tr>`).join('')}</table>`
    this.aide.innerHTML = `<h3>Commandes</h3>${table(AIDE_COMMANDES)}<h3>Sur tablette</h3>${table(AIDE_TACTILE)}`
      + '<p>Un nœud déposé hors de tout cadre garde son cadre d’origine ; pour l’en sortir : clic droit → « Sortir du cadre ». '
      + 'Seules les prémisses principales et auxiliaires sont des flèches ; les autres sont des renvois « cf. ». '
      + 'Un losange est une décision : il pointe vers les nœuds ou les cadres de l’option retenue (tireté et × : '
      + 'option écartée) ; sa fiche donne la question, les options et leurs raisons.</p>'
    this.avisEl = element(scene, 'div', 'gr-avis')
    this.avisEl.hidden = true
    this.avisEl.setAttribute('role', 'status')
    const legende = element(scene, 'div', 'gr-legende')
    legende.innerHTML = [
      ['', 'établi'], ['4 3', 'à vérifier'], ['4 3|g', 'suspendu'], ['x', 'invalide'], ['1 2.2|g', 'ouvert'],
    ].map(([m, t]) => `<span>${iconeStatut(m!)}${t}</span>`).join('')
    this.zoomEl = element(scene, 'div', 'gr-zoom')
    this.base = construireModele(this.graphe, this.vue)
    this.modele = this.base

    scene.addEventListener('pointerdown', (e) => this.appui(e))
    scene.addEventListener('pointermove', (e) => this.mouvement(e))
    scene.addEventListener('pointerup', (e) => this.relache(e))
    scene.addEventListener('pointercancel', (e) => {
      this.doigts.delete(e.pointerId)
      this.pince = null
      clearTimeout(this.minuterieAppuiLong)
      this.annulerGeste()
    })
    scene.addEventListener('dblclick', (e) => this.doubleClic(e))
    scene.addEventListener('wheel', (e) => this.roulette(e), { passive: false })
    scene.addEventListener('contextmenu', (e) => e.preventDefault())
    // Safari (iPad) : empêche le zoom de la page entière au pincement sur le graphe.
    scene.addEventListener('gesturestart', (e) => e.preventDefault())
    scene.addEventListener('keydown', (e) => this.touche(e))
    scene.addEventListener('keyup', (e) => {
      if (e.key === ' ') this.relacherEspace()
    })
    scene.addEventListener('blur', () => this.relacherEspace())
    scene.addEventListener('pointerleave', () => {
      if (!this.geste && (this.survol || this.titreSurvole || this.renvoiSurvole)) {
        this.survol = this.titreSurvole = this.renvoiSurvole = null
        this.hypothese = null
        this.demander()
      }
    })
    this.saisie.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') this.renommage?.(true)
      if (e.key === 'Escape') this.renommage?.(false)
    })
    this.saisie.addEventListener('blur', () => this.renommage?.(true))
    document.addEventListener('pointerdown', (e) => {
      if (!this.aide.hidden && !this.aide.contains(e.target as Node) && !(e.target as HTMLElement).closest('.aide-graphe')) {
        this.aide.hidden = true
      }
    })
    new ResizeObserver(() => this.redimensionner()).observe(scene)
    // Computer Modern (CMU Serif et fontes de KaTeX) : les titres du canevas sont mesurés dans cette fonte ; à son arrivée, on
    // remesure tout (lignes du canevas, ajustements des blocs HTML).
    const fontes = ['400 12px "CMU Serif Atlas"', '700 12px "CMU Serif Atlas"', 'italic 400 12px "CMU Serif Atlas"', '400 12px KaTeX_Main', '400 12px KaTeX_Math']
    void Promise.all(fontes.map((f) => document.fonts.load(f))).then(() => {
      oublierMesures()
      this.contenu.vider()
      this.demander()
    })
  }

  // ─── Données ───────────────────────────────────────────────────────────────

  /** Espace ouvert (null : pas d'écriture possible) ; `lectureSeule` explique pourquoi la vue ne s'écrit pas. */
  definirProjet(projetId: string | null, lectureSeule: string | null = null): void {
    if (projetId !== this.projetId) {
      this.projetId = projetId
      this.selection.clear()
      this.pile = []
      this.refaire = []
      this.aCadrer = true
      this.options.surOuvrir(null)
      this.fermerFenetre?.()
      this.images.vider()
    }
    this.lectureSeule = lectureSeule
  }

  /** Nouvelles données (lecture périodique pendant qu'un agent travaille, ou après une opération). */
  afficher(graphe: Graphe, vue: Vue, conversationId: string | null): number {
    const avant = this.projetAffiche === this.projetId ? this.vue.placements : []
    this.projetAffiche = this.projetId
    this.graphe = graphe
    this.vue = vue
    this.conversationFiltre = conversationId
    this.calculerEstompes()
    this.reconstruire()
    this.animerDeplaces(avant)
    for (const id of [...this.selection]) if (!this.base.blocs.has(id)) this.selection.delete(id)
    if (this.aCadrer && graphe.noeuds.length && this.largeur) {
      this.aCadrer = false
      this.cadrerTout()
    }
    return conversationId
      ? graphe.noeuds.filter((n) => n.conversation_id === conversationId).length
      : graphe.noeuds.length
  }

  /** Nœuds estompés : hors de la conversation filtrée, ou refusés par le filtre du pilotage. */
  private calculerEstompes(): void {
    const c = this.conversationFiltre, f = this.filtrePilotage
    this.estompes = c || f
      ? new Set(this.graphe.noeuds.filter((n) => (c && n.conversation_id !== c) || (f && !f(n))).map((n) => n.id))
      : null
    // Une figure s'estompe avec le nœud qu'elle illustre.
    if (this.estompes) {
      for (const fig of this.vue.figures ?? []) if (this.estompes.has(fig.noeud_id)) this.estompes.add(PREFIXE_FIGURE + fig.id)
    }
  }

  /** Numérotation d'un nœud dans la vue (« Lemme », « 7 »). */
  reference(id: string): { libelle: string; numero: string } | null {
    const b = this.base.blocs.get(id)
    return b ? { libelle: b.libelle, numero: b.numero } : null
  }

  /** Numéro et nom d'un cadre (« §2 »), pour la fiche d'une décision qui le vise. */
  cadre(id: string): { numero: string; nom: string } | null {
    const c = this.base.cadres.get(id)
    return c ? { numero: c.numero, nom: c.nom } : null
  }

  get nonPlaces(): number {
    return this.base.nonPlaces
  }

  /** Sélectionne un nœud, le centre et ouvre sa fiche (null : tout désélectionner, fiche fermée). */
  montrer(id: string | null): void {
    this.selection.clear()
    if (!id || !this.base.blocs.has(id)) {
      this.options.surOuvrir(null)
      this.demander()
      return
    }
    this.selection.add(id)
    const r = this.rectRepresentant(this.modele.representant.get(id) ?? id)
    if (r) this.centrerSur((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)
    const b = this.base.blocs.get(id)!
    this.options.surOuvrir(b.figure ? null : b.noeud)
    this.demander()
  }

  recentrer(): void {
    this.cadrerTout()
  }

  basculerAide(): void {
    this.aide.hidden = !this.aide.hidden
  }

  // ─── Pilotage (voix, pilotage/adaptateurVue.ts) ─────────────────────────
  // Tout passe par les ids de nœud ; la vue (cases, cadres) n'est jamais modifiée.

  get noeuds(): readonly Noeud[] {
    return this.graphe.noeuds
  }

  get projet(): string | null {
    return this.projetId
  }

  /** Ids des figures de la vue (sans « fig: »). */
  get figures(): string[] {
    return (this.vue.figures ?? []).map((f) => f.id)
  }

  /** Nœud sélectionné (le premier, s'il y en a plusieurs). */
  get noeudSelectionne(): string | null {
    for (const id of this.selection) if (this.base.blocs.get(id)?.noeud && !this.base.blocs.get(id)?.figure) return id
    return null
  }

  /** Nœud survolé (null : rien, ou un cadre, une figure). */
  get noeudSurvole(): string | null {
    const b = this.survol ? this.base.blocs.get(this.survol) : undefined
    return b && !b.figure ? b.id : null
  }

  /** Sélectionne un nœud (sa lignée est mise en évidence), sans déplacer la caméra ni ouvrir sa fiche. */
  selectionner(id: string | null): void {
    this.selection.clear()
    if (id && this.base.blocs.has(id)) this.selection.add(id)
    this.demander()
  }

  surligner(ids: readonly string[]): void {
    this.surlignes = ids.length ? new Set(ids) : null
    this.demander()
  }

  definirFiltre(passe: ((n: Noeud) => boolean) | null): void {
    this.filtrePilotage = passe
    this.calculerEstompes()
    this.demander()
  }

  /** Centre de la partie visible de l'écran (coordonnées du monde, fiche exclue) et zoom. */
  get camera(): { x: number; y: number; z: number } {
    const { x, y } = this.versMonde(this.largeurUtile / 2, this.hauteur / 2)
    return { x, y, z: this.cam.z }
  }

  /** Les mouvements du pilotage sont animés ; chaque promesse se résout à la fin du mouvement. */
  placerCamera(x: number, y: number, z: number): Promise<void> {
    return this.animerCamera(x, y, z)
  }

  zoomerDe(facteur: number): Promise<void> {
    const c = this.camera
    return this.animerCamera(c.x, c.y, this.borneZoom(this.cam.z * facteur))
  }

  /** Cadre des nœuds (ceux d'un cadre réduit : le cadre) ; false si aucun n'est dans la vue. Des figures seules
   * sont cadrées au-delà de 1:1, jusqu'à remplir l'écran. */
  async cadrerNoeuds(ids: readonly string[]): Promise<boolean> {
    let r: Rect | null = null
    for (const id of ids) {
      const x = this.rectRepresentant(this.modele.representant.get(id) ?? id)
      if (x) r = r ? union(r, x) : x
    }
    if (!r) return false
    const figures = ids.length > 0 && ids.every((id) => id.startsWith(PREFIXE_FIGURE))
    await this.animerCadrage(r, figures ? ZOOMS[ZOOMS.length - 1]![0] : 1)
    return true
  }

  cadrerGraphe(): Promise<void> {
    return this.animerCadrage(this.modele.bornes)
  }

  /** Caméra vers le centre (cx, cy) au zoom z, animée (graphe-animation.ts) : zoom interpolé en échelle
   * logarithmique, centre en ligne droite. Immédiat si la vue n'est pas affichée. */
  private animerCamera(cx: number, cy: number, z: number): Promise<void> {
    this.animCamera?.fin()
    const depart = this.camera
    const placer = (x: number, y: number, zz: number) => {
      this.fixerZoom(zz)
      this.centrerSur(x, y)
    }
    if (document.hidden || !this.largeur) {
      placer(cx, cy, z)
      return Promise.resolve()
    }
    const a = animer(
      (u) => placer(depart.x + (cx - depart.x) * u, depart.y + (cy - depart.y) * u, depart.z * (z / depart.z) ** u),
      () => placer(cx, cy, z),
    )
    this.animCamera = a
    return a.promesse.then(() => {
      if (this.animCamera === a) this.animCamera = null
    })
  }

  private animerCadrage(r: Rect, zoomMax = 1): Promise<void> {
    if (!this.largeur) return Promise.resolve()
    return this.animerCamera((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, this.zoomPour(r, zoomMax))
  }

  /** L'utilisateur reprend la main (souris, doigts, molette) : les mouvements du pilotage s'arrêtent là. */
  private reprendreLaMain(): void {
    this.animCamera?.arreter()
  }

  private get largeurUtile(): number {
    return Math.max(80, this.largeur - this.margeDroite)
  }

  private borneZoom(z: number): number {
    return Math.max(ZOOMS[0]![0], Math.min(ZOOMS[ZOOMS.length - 1]![0], z))
  }

  /** Nœuds (hors figures) dont le centre est à l'écran, les plus proches du centre d'abord. */
  visibles(max: number): NoeudVisible[] {
    const r: (NoeudVisible & { d: number })[] = []
    for (const b of this.modele.blocs.values()) {
      if (b.cache || b.figure || !b.noeud) continue
      const x = (b.x + b.w / 2) * this.cam.z + this.cam.x, y = (b.y + b.h / 2) * this.cam.z + this.cam.y
      if (x < 0 || y < 0 || x > this.largeurUtile || y > this.hauteur) continue
      r.push({ id: b.id, nom: b.noeud.nom, x, y, d: Math.hypot(x - this.largeurUtile / 2, y - this.hauteur / 2) })
    }
    r.sort((a, b) => a.d - b.d || a.id.localeCompare(b.id))
    return r.slice(0, max).map(({ id, nom, x, y }) => ({ id, nom, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }))
  }

  private reconstruire(): void {
    this.base = construireModele(this.graphe, this.vue)
    const surcharges = this.surcharges ?? this.transition
    this.modele = surcharges ? construireModele(this.graphe, this.vue, surcharges) : this.base
    this.demander()
  }

  /** Les nœuds que la relecture a changés de case glissent de l'ancienne à la nouvelle (pas après une opération
   * faite ici : le nœud lâché est déjà à sa place). */
  private animerDeplaces(avant: readonly PlacementVue[]): void {
    this.animTransition?.fin()
    if (this.enCours || this.surcharges || document.hidden || !this.largeur) return
    const anciens = new Map(avant.map((p) => [p.noeud_id, p]))
    const deplaces: [string, PlacementVue, PlacementVue][] = []
    for (const p of this.vue.placements) {
      const a = anciens.get(p.noeud_id)
      if (a && (a.colonne !== p.colonne || a.ligne !== p.ligne)) deplaces.push([p.noeud_id, a, p])
    }
    if (!deplaces.length || deplaces.length > DEPLACES_ANIMES_MAX) return
    const poser = (u: number) => {
      this.transition = new Map(deplaces.map(([id, a, p]) => [id, {
        colonne: a.colonne + (p.colonne - a.colonne) * u, ligne: a.ligne + (p.ligne - a.ligne) * u, groupe: p.groupe_id,
      }]))
      this.reconstruire()
    }
    poser(0)
    const anim = animer(poser, () => {
      this.transition = null
      this.reconstruire()
    })
    this.animTransition = anim
    void anim.promesse.then(() => {
      if (this.animTransition === anim) this.animTransition = null
    })
  }

  // ─── Caméra ────────────────────────────────────────────────────────────────

  private redimensionner(): void {
    const r = this.scene.getBoundingClientRect()
    if (!r.width || !r.height) return
    const dpr = window.devicePixelRatio || 1
    this.largeur = r.width
    this.hauteur = r.height
    this.canvas.width = Math.round(r.width * dpr)
    this.canvas.height = Math.round(r.height * dpr)
    this.canvas.style.width = `${r.width}px`
    this.canvas.style.height = `${r.height}px`
    if (this.aCadrer && this.graphe.noeuds.length) {
      this.aCadrer = false
      this.cadrerTout()
    }
    this.dessinerMaintenant()
  }

  private cadrer(r: Rect): void {
    if (!this.largeur) return
    this.fixerZoom(this.zoomPour(r))
    this.centrerSur((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)
  }

  /** Comme UE : le plus grand palier qui fait tout tenir, sans dépasser `zoomMax` (1:1, sauf une figure seule). */
  private zoomPour(r: Rect, zoomMax = 1): number {
    const w = Math.max(1, r.x1 - r.x0), h = Math.max(1, r.y1 - r.y0)
    const z = Math.min((this.largeurUtile - 80) / w, (this.hauteur - 80) / h)
    let i = 0
    for (let k = 0; k < ZOOMS.length; k++) if (ZOOMS[k]![0] <= z && ZOOMS[k]![0] <= zoomMax) i = k
    return ZOOMS[i]![0]
  }

  /** Centre (x, y) au milieu de la partie visible de l'écran (la fiche, à droite, en est exclue). */
  private centrerSur(x: number, y: number): void {
    this.cam.x = this.largeurUtile / 2 - x * this.cam.z
    this.cam.y = this.hauteur / 2 - y * this.cam.z
    this.demander()
  }

  private cadrerTout(): void {
    this.cadrer(this.modele.bornes)
  }

  private cadrerSelection(): void {
    let r: Rect | null = null
    for (const id of this.selection) {
      const x = this.rectRepresentant(this.modele.representant.get(id) ?? id)
      if (x) r = r ? union(r, x) : x
    }
    if (r) this.cadrer(r)
    else this.avis('Rien n’est sélectionné : F cadre la sélection, Origine cadre tout.')
  }

  private rectRepresentant(rep: string): Rect | null {
    if (rep.startsWith(CLE_FONCTION)) {
      const f = this.modele.cadres.get(rep.slice(CLE_FONCTION.length))?.fonction
      return f ? { x0: f.x, y0: f.y, x1: f.x + f.w, y1: f.y + f.h } : null
    }
    const b = this.modele.blocs.get(rep)
    return b ? rectBloc(b) : null
  }

  private versMonde(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.cam.x) / this.cam.z, y: (sy - this.cam.y) / this.cam.z }
  }

  private pointeur(e: MouseEvent): { sx: number; sy: number } {
    const r = this.scene.getBoundingClientRect()
    return { sx: e.clientX - r.left, sy: e.clientY - r.top }
  }

  /** Palier suivant (molette, + / −) ; après un zoom continu, le premier palier au-delà du zoom courant. */
  private zoomer(sens: 1 | -1, sx: number, sy: number): void {
    const z = this.cam.z
    const i = sens > 0 ? ZOOMS.findIndex(([p]) => p > z * 1.001) : ZOOMS.findLastIndex(([p]) => p < z * 0.999)
    if (i < 0) return
    this.zoomVers(ZOOMS[i]![0], sx, sy)
  }

  /** Zoom continu (pincement) ou sur un palier, en gardant fixe le point (sx, sy) de l'écran. */
  private zoomVers(z: number, sx: number, sy: number): void {
    const m = this.versMonde(sx, sy)
    this.fixerZoom(z)
    this.cam.x = sx - m.x * this.cam.z
    this.cam.y = sy - m.y * this.cam.z
    this.demander()
  }

  /** Règle le zoom (borné aux paliers extrêmes) ; le palier affiché est le plus proche. */
  private fixerZoom(z: number): void {
    z = Math.max(ZOOMS[0]![0], Math.min(ZOOMS[ZOOMS.length - 1]![0], z))
    this.cam.z = z
    let meilleur = 0
    ZOOMS.forEach(([p], k) => {
      if (Math.abs(Math.log(p / z)) < Math.abs(Math.log(ZOOMS[meilleur]![0] / z))) meilleur = k
    })
    this.iZoom = meilleur
  }

  // ─── Dessin ────────────────────────────────────────────────────────────────

  private demander(): void {
    if (!this.image) this.image = requestAnimationFrame(() => this.dessinerMaintenant())
  }

  private dessinerMaintenant(): void {
    if (this.image) cancelAnimationFrame(this.image)
    this.image = 0
    if (!this.largeur) return
    const dpr = window.devicePixelRatio || 1
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const etat: EtatDessin = {
      modele: this.modele,
      cam: this.cam,
      largeur: this.largeur,
      hauteur: this.hauteur,
      selection: this.selection,
      survol: this.survol,
      renvoiSurvole: this.renvoiSurvole,
      titreSurvole: this.titreSurvole,
      estompes: this.estompes,
      surlignes: this.surlignes,
      conflits: this.conflits,
      cadreCible: this.cadreCible,
      hypothese: this.hypothese,
      images: this.images,
    }
    dessiner(this.ctx, etat, this.contenu)
    const [, nom] = ZOOMS[this.iZoom]!
    const texte = `Zoom ${nom}`
    if (this.zoomEl.textContent !== texte) this.zoomEl.textContent = texte
    // Budget de composition épuisé : le reste à l'image suivante (rien ne tourne en boucle une fois tout composé).
    if (this.contenu.enAttente) this.demander()
    this.options.surChangement?.()
  }

  // ─── Cibles ────────────────────────────────────────────────────────────────

  private cibleEn(sx: number, sy: number, modele = this.modele): Cible {
    const { x, y } = this.versMonde(sx, sy)
    if (niveauDe(this.cam.z) === 'contenu') {
      for (const b of modele.blocs.values()) {
        if (b.cache || !b.renvois.length || x < b.x || x > b.x + b.w || y < b.y + b.h || y > b.y + b.h + 20) continue
        for (const r of positionsRenvois(b)) if (x >= r.x - 2 && x <= r.x + 34 && y >= r.y0 && y <= r.y1) return { genre: 'renvoi', id: r.id }
      }
    }
    for (const b of modele.blocs.values()) {
      if (!b.cache && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return { genre: 'bloc', id: b.id }
    }
    for (const c of modele.cadres.values()) {
      const f = c.fonction
      if (f && x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) return { genre: 'fonction', cadre: c.id }
    }
    const cadres = [...modele.cadresOrdonnes].reverse()
    for (const c of cadres) {
      const r = c.rect
      if (r && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y0 + CADRE.titre) {
        return { genre: 'titre', cadre: c.id, glyphe: x <= r.x0 + 7 + 14 }
      }
    }
    for (const c of cadres) if (c.rect && dansRect(c.rect, x, y)) return { genre: 'cadre', cadre: c.id }
    return { genre: 'fond' }
  }

  /** Cadre sous un point (px de mise en page) : le plus profond, hors cadres réduits. */
  private cadreSous(x: number, y: number): string | null {
    const cadres = [...this.base.cadresOrdonnes].reverse()
    for (const c of cadres) if (c.rect && !c.replie && dansRect(c.rect, x, y)) return c.id
    return null
  }

  // ─── Souris ────────────────────────────────────────────────────────────────

  private appui(e: PointerEvent): void {
    this.reprendreLaMain()
    if (e.target === this.saisie || this.menu.contains(e.target as Node) || this.aide.contains(e.target as Node)) return
    this.fermerMenu()
    this.scene.focus({ preventScroll: true })
    const { sx, sy } = this.pointeur(e)
    if (e.pointerType === 'touch') return this.appuiDoigt(e, sx, sy)
    if (e.button === 1 || e.button === 2 || (e.button === 0 && this.espace)) {
      e.preventDefault()
      this.geste = { genre: 'vue', x0: sx, y0: sy, camX: this.cam.x, camY: this.cam.y, bouge: false, bouton: e.button }
      this.capturer(e.pointerId)
      return
    }
    if (e.button !== 0) return
    this.commencer(this.cibleEn(sx, sy), sx, sy, { ctrl: e.ctrlKey || e.metaKey, maj: e.shiftKey })
    this.capturer(e.pointerId)
  }

  /** Geste du bouton principal sur une cible : clic souris, ou toucher / appui long au doigt. */
  private commencer(c: Cible, sx: number, sy: number, mod: { ctrl: boolean; maj: boolean }): void {
    if (c.genre === 'renvoi') this.geste = { genre: 'renvoi', x0: sx, y0: sy, id: c.id, bouge: false }
    else if (c.genre === 'titre' && c.glyphe) this.geste = { genre: 'repli', x0: sx, y0: sy, cadre: c.cadre, bouge: false }
    else if (c.genre === 'titre' || c.genre === 'fonction') {
      this.geste = { genre: 'cadre', x0: sx, y0: sy, cadre: c.cadre, origines: this.originesCadre(c.cadre), dc: 0, dl: 0, bouge: false, titre: c.genre === 'titre' }
    } else if (c.genre === 'bloc') {
      let seul: string | null = null
      if (mod.ctrl) {
        if (this.selection.has(c.id)) this.selection.delete(c.id)
        else this.selection.add(c.id)
      } else if (mod.maj) this.selection.add(c.id)
      else if (!this.selection.has(c.id)) {
        this.selection.clear()
        this.selection.add(c.id)
      } else seul = c.id
      const origines = new Map<string, Origine>()
      if (this.selection.has(c.id)) {
        for (const id of this.selection) {
          const b = this.base.blocs.get(id)
          if (b && !b.cache) origines.set(id, { colonne: b.colonne, ligne: b.ligne, groupe: b.groupe })
        }
      }
      this.geste = { genre: 'noeuds', x0: sx, y0: sy, origines, dc: 0, dl: 0, bouge: false, seul }
      this.demander()
    } else if (mod.ctrl || mod.maj) {
      this.geste = { genre: 'rectangle', x0: sx, y0: sy, ajout: true, avant: new Set(this.selection), bouge: false }
    } else {
      // Glisser le fond déplace la vue (comme une carte) ; un clic sans bouger désélectionne.
      this.geste = { genre: 'vue', x0: sx, y0: sy, camX: this.cam.x, camY: this.cam.y, bouge: false, bouton: 0 }
    }
  }

  // ─── Doigts (tablette) ─────────────────────────────────────────────────────

  /**
   * Un doigt déplace la vue (même posé sur un nœud) ; un toucher agit comme un clic ; un appui long saisit le nœud ou
   * le cadre (à glisser ensuite) ou, ailleurs, ouvre le menu ; deux doigts pincent (zoom continu) et déplacent.
   */
  private appuiDoigt(e: PointerEvent, sx: number, sy: number): void {
    this.dernierDoigt = Date.now()
    this.doigts.set(e.pointerId, { sx, sy })
    this.capturer(e.pointerId)
    clearTimeout(this.minuterieAppuiLong)
    if (this.doigts.size === 2) {
      // Le deuxième doigt remplace le geste en cours par un pincement (un glisser de nœud est abandonné).
      const g = this.geste
      this.geste = null
      this.rectangle.hidden = true
      this.scene.classList.remove('gr-deplace')
      if (g && g.genre !== 'vue') this.finirGlisser()
      const [a, b] = [...this.doigts.values()] as [{ sx: number; sy: number }, { sx: number; sy: number }]
      const m = this.versMonde((a.sx + b.sx) / 2, (a.sy + b.sy) / 2)
      this.pince = { d0: Math.max(1, Math.hypot(a.sx - b.sx, a.sy - b.sy)), z0: this.cam.z, mx: m.x, my: m.y }
      return
    }
    if (this.doigts.size > 2) return
    const c = this.cibleEn(sx, sy)
    const g: Geste = { genre: 'vue', x0: sx, y0: sy, camX: this.cam.x, camY: this.cam.y, bouge: false, bouton: 0, cible: c }
    this.geste = g
    this.minuterieAppuiLong = window.setTimeout(() => {
      if (this.geste !== g || g.bouge) return
      if (c.genre === 'bloc' || c.genre === 'titre' || c.genre === 'fonction') {
        this.commencer(c.genre === 'titre' ? { ...c, glyphe: false } : c, sx, sy, { ctrl: false, maj: false })
        const n = this.geste as Geste | null
        if (n && (n.genre === 'noeuds' || n.genre === 'cadre')) n.saisi = true
        navigator.vibrate?.(15)
        this.demander()
      } else {
        this.geste = null
        this.ouvrirMenu(c, sx, sy)
      }
    }, DELAI_APPUI_LONG)
  }

  private pincer(): void {
    const p = this.pince
    const [a, b] = [...this.doigts.values()]
    if (!p || !a || !b) return
    const d = Math.max(1, Math.hypot(a.sx - b.sx, a.sy - b.sy))
    this.fixerZoom(p.z0 * d / p.d0)
    this.cam.x = (a.sx + b.sx) / 2 - p.mx * this.cam.z
    this.cam.y = (a.sy + b.sy) / 2 - p.my * this.cam.z
    this.demander()
  }

  /** Toucher sans bouger : un clic, ou un double-clic s'il suit de près un autre toucher au même endroit. */
  private toucher(c: Cible, sx: number, sy: number): void {
    const d = this.dernierToucher
    const double = Date.now() - d.t < DELAI_DOUBLE_TOUCHER && Math.hypot(sx - d.sx, sy - d.sy) < 30
    this.dernierToucher = { t: double ? 0 : Date.now(), sx, sy }
    if (double) return this.doubleClicEn(sx, sy)
    if (c.genre === 'fond' || c.genre === 'cadre') {
      this.selection.clear()
      return
    }
    this.commencer(c, sx, sy, { ctrl: false, maj: false })
    const g = this.geste
    this.geste = null
    if (g) this.terminer(g, sx, sy)
  }

  private mouvement(e: PointerEvent): void {
    const { sx, sy } = this.pointeur(e)
    if (e.pointerType === 'touch') {
      if (!this.doigts.has(e.pointerId)) return
      this.doigts.set(e.pointerId, { sx, sy })
      if (this.pince) return this.pincer()
      if (this.doigts.size > 1) return
    }
    const g = this.geste
    if (!g) return this.survoler(sx, sy)
    const seuil = e.pointerType === 'touch' ? SEUIL_GLISSER_DOIGT : SEUIL_GLISSER
    if (!g.bouge && Math.hypot(sx - g.x0, sy - g.y0) < seuil) return
    if (!g.bouge) clearTimeout(this.minuterieAppuiLong)
    g.bouge = true
    if (g.genre === 'vue') {
      this.scene.classList.add('gr-deplace')
      this.cam.x = g.camX + sx - g.x0
      this.cam.y = g.camY + sy - g.y0
      this.demander()
    } else if (g.genre === 'noeuds' || g.genre === 'cadre') {
      if (!g.origines.size) return
      let dc = Math.round((sx - g.x0) / this.cam.z / GRILLE.pasX)
      let dl = Math.round((sy - g.y0) / this.cam.z / GRILLE.pasY)
      const minC = Math.min(...[...g.origines.values()].map((o) => o.colonne))
      const minL = Math.min(...[...g.origines.values()].map((o) => o.ligne))
      dc = Math.max(dc, -minC)
      dl = Math.max(dl, -minL)
      const cible = g.genre === 'noeuds' ? this.cadreSous(this.versMonde(sx, sy).x, this.versMonde(sx, sy).y) : null
      if (dc === g.dc && dl === g.dl && cible === this.cadreCible) return
      g.dc = dc
      g.dl = dl
      this.cadreCible = cible
      this.surcharges = new Map([...g.origines].map(([id, o]) => [id, { colonne: o.colonne + dc, ligne: o.ligne + dl, groupe: o.groupe }]))
      this.conflits = this.casesOccupees(this.surcharges)
      this.modele = construireModele(this.graphe, this.vue, this.surcharges)
      this.demander()
    } else if (g.genre === 'rectangle') {
      const x0 = Math.min(g.x0, sx), y0 = Math.min(g.y0, sy)
      const w = Math.abs(sx - g.x0), h = Math.abs(sy - g.y0)
      Object.assign(this.rectangle.style, { left: `${x0}px`, top: `${y0}px`, width: `${w}px`, height: `${h}px` })
      this.rectangle.hidden = false
      const a = this.versMonde(x0, y0), b = this.versMonde(x0 + w, y0 + h)
      this.selection = new Set(g.ajout ? g.avant : [])
      for (const bl of this.modele.blocs.values()) {
        if (!bl.cache && bl.x < b.x && bl.x + bl.w > a.x && bl.y < b.y && bl.y + bl.h > a.y) this.selection.add(bl.id)
      }
      this.demander()
    }
  }

  private relache(e: PointerEvent): void {
    if (e.pointerType === 'touch') {
      this.dernierDoigt = Date.now()
      this.doigts.delete(e.pointerId)
      clearTimeout(this.minuterieAppuiLong)
      if (this.pince) {
        // Fin du pincement : le doigt restant continue de déplacer la vue.
        this.pince = null
        const reste = [...this.doigts.values()][0]
        if (reste) this.geste = { genre: 'vue', x0: reste.sx, y0: reste.sy, camX: this.cam.x, camY: this.cam.y, bouge: true, bouton: 0 }
        return
      }
      if (this.doigts.size) return
    }
    const g = this.geste
    if (!g) return
    this.geste = null
    this.scene.classList.remove('gr-deplace')
    if (this.scene.hasPointerCapture(e.pointerId)) this.scene.releasePointerCapture(e.pointerId)
    const { sx, sy } = this.pointeur(e)
    this.terminer(g, sx, sy)
  }

  private terminer(g: Geste, sx: number, sy: number): void {
    if (g.genre === 'vue') {
      if (!g.bouge && g.bouton === 2) this.ouvrirMenu(this.cibleEn(g.x0, g.y0), g.x0, g.y0)
      else if (!g.bouge && g.cible) this.toucher(g.cible, sx, sy)
      else if (!g.bouge && g.bouton === 0 && !this.espace) this.selection.clear()
    } else if (g.genre === 'noeuds') {
      if (g.bouge && g.origines.size) void this.deposer(g, sx, sy)
      else if (!g.bouge && g.saisi) this.ouvrirMenu(this.cibleEn(g.x0, g.y0), g.x0, g.y0)
      else if (!g.bouge && g.seul) {
        this.selection.clear()
        this.selection.add(g.seul)
      }
    } else if (g.genre === 'cadre') {
      if (g.bouge && (g.dc || g.dl)) {
        void this.executer([{ op: 'deplacer_groupe', id: g.cadre, colonnes: g.dc, lignes: g.dl }], 'Déplacer le cadre')
      } else if (g.bouge) this.finirGlisser()
      else if (g.saisi) this.ouvrirMenu(this.cibleEn(g.x0, g.y0), g.x0, g.y0)
      else if (g.titre) {
        clearTimeout(this.minuterieTitre)
        this.minuterieTitre = window.setTimeout(() => void this.basculerRepli(g.cadre), DELAI_DOUBLE_CLIC)
      }
    } else if (g.genre === 'rectangle') {
      this.rectangle.hidden = true
      if (!g.bouge && !g.ajout) this.selection.clear()
    } else if (g.genre === 'renvoi') {
      if (!g.bouge) this.montrer(g.id)
    } else if (g.genre === 'repli') {
      if (!g.bouge) void this.basculerRepli(g.cadre)
    }
    this.demander()
  }

  /** Garde le pointeur pendant un geste (sans effet si le navigateur ne connaît pas ce pointeur). */
  private capturer(id: number): void {
    try {
      this.scene.setPointerCapture(id)
    } catch {
      // pointeur déjà relâché ou simulé
    }
  }

  private annulerGeste(): void {
    this.geste = null
    this.rectangle.hidden = true
    this.scene.classList.remove('gr-deplace')
    this.finirGlisser()
  }

  private finirGlisser(): void {
    this.surcharges = null
    this.conflits = null
    this.cadreCible = null
    this.modele = this.base
    this.demander()
  }

  private survoler(sx: number, sy: number): void {
    const c = this.cibleEn(sx, sy)
    const survol = c.genre === 'bloc' ? c.id : c.genre === 'fonction' ? CLE_FONCTION + c.cadre : null
    const titre = c.genre === 'titre' ? c.cadre : null
    const renvoi = c.genre === 'renvoi' ? c.id : null
    if (survol === this.survol && titre === this.titreSurvole && renvoi === this.renvoiSurvole) return
    this.survol = survol
    this.titreSurvole = titre
    this.renvoiSurvole = renvoi
    const b = survol ? this.modele.blocs.get(survol) : undefined
    this.hypothese = b?.hypothese ? b : null
    this.scene.classList.toggle('gr-main', !!renvoi || (c.genre === 'titre' && c.glyphe))
    this.demander()
  }

  private doubleClic(e: MouseEvent): void {
    if (e.target === this.saisie || this.menu.contains(e.target as Node)) return
    // Au doigt, le double toucher est déjà traité (`toucher`) : on ignore le dblclick que le navigateur en tire.
    if (Date.now() - this.dernierDoigt < 800) return
    const { sx, sy } = this.pointeur(e)
    this.doubleClicEn(sx, sy)
  }

  private doubleClicEn(sx: number, sy: number): void {
    this.fermerMenu()
    const c = this.cibleEn(sx, sy)
    if (c.genre === 'titre') {
      clearTimeout(this.minuterieTitre)
      this.renommerCadre(c.cadre)
    } else if (c.genre === 'bloc') {
      const b = this.base.blocs.get(c.id)
      if (b?.figure) this.ouvrirFigure(b.id)
      else this.options.surOuvrir(b?.noeud ?? null)
    } else if (c.genre === 'fonction') void this.basculerRepli(c.cadre)
  }

  /** Ouvre une figure en grand (tracé agrandi ou image, légende complète, nœud illustré). */
  ouvrirFigure(id: string): void {
    const b = this.base.blocs.get(id)
    if (!b?.figure) return
    this.fermerFenetre?.()
    const f = b.figure
    const cible = this.base.blocs.get(f.noeud_id)
    const reference = referenceDe(this.base, f.noeud_id)
    this.fermerFenetre = ouvrirFenetre({
      figure: f,
      numero: b.numero,
      noeud: cible && reference ? { reference, nom: cible.noeud.nom } : null,
      images: this.images,
      surNoeud: () => this.montrer(f.noeud_id),
      surFermer: () => {
        this.fermerFenetre = null
        this.scene.focus({ preventScroll: true })
      },
    })
  }

  private roulette(e: WheelEvent): void {
    e.preventDefault()
    this.reprendreLaMain()
    const { sx, sy } = this.pointeur(e)
    // Pincement sur un pavé tactile (le navigateur l'envoie en Ctrl + molette, à petits pas) : zoom continu.
    if (e.ctrlKey && e.deltaMode === 0 && Math.abs(e.deltaY) < 50) {
      this.zoomVers(this.cam.z * Math.exp(-e.deltaY * 0.01), sx, sy)
      return
    }
    this.molette += e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1)
    if (Math.abs(this.molette) < 30) return
    const sens = this.molette < 0 ? 1 : -1
    this.molette = 0
    this.zoomer(sens, sx, sy)
  }

  private relacherEspace(): void {
    this.espace = false
    this.scene.classList.remove('gr-espace')
  }

  /** Entrée : ouvre la fiche du nœud sélectionné, ou la figure en grand. */
  private ouvrirSelection(): void {
    const b = this.selection.size === 1 ? this.base.blocs.get([...this.selection][0]!) : undefined
    if (!b) this.avis('Sélectionnez un seul nœud pour ouvrir sa fiche.')
    else if (b.figure) this.ouvrirFigure(b.id)
    else this.options.surOuvrir(b.noeud)
  }

  // ─── Clavier ───────────────────────────────────────────────────────────────

  private touche(e: KeyboardEvent): void {
    if (e.target === this.saisie) return
    const ctrl = e.ctrlKey || e.metaKey
    const k = e.key
    let traitee = true
    if (k === 'Escape') {
      if (!this.menu.hidden || !this.aide.hidden) {
        this.fermerMenu()
        this.aide.hidden = true
      } else {
        this.selection.clear()
        this.options.surOuvrir(null)
      }
    } else if (k === ' ') {
      this.espace = true
      this.scene.classList.add('gr-espace')
    } else if (k === 'Home' || (k === '0' && !e.altKey)) this.cadrerTout()
    else if (k === '+' || k === '=') this.zoomer(1, this.largeur / 2, this.hauteur / 2)
    else if (k === '-' || k === '_') this.zoomer(-1, this.largeur / 2, this.hauteur / 2)
    else if (k.startsWith('Arrow') && !ctrl && !e.altKey) {
      const pas = e.shiftKey ? 400 : 80
      if (k === 'ArrowLeft') this.cam.x += pas
      else if (k === 'ArrowRight') this.cam.x -= pas
      else if (k === 'ArrowUp') this.cam.y += pas
      else if (k === 'ArrowDown') this.cam.y -= pas
    } else if (k === 'Enter') this.ouvrirSelection()
    else if (ctrl && (k === 'a' || k === 'A')) {
      for (const b of this.modele.blocs.values()) if (!b.cache) this.selection.add(b.id)
    }
    else if ((k === 'f' || k === 'F') && !ctrl && !e.altKey) this.cadrerSelection()
    else if ((k === 'c' || k === 'C') && !ctrl && !e.altKey) void this.creerCadre()
    else if (k === 'F2') this.renommerNoeud()
    else if (ctrl && (k === 'z' || k === 'Z') && !e.shiftKey) void this.annuler()
    else if (ctrl && (k === 'y' || k === 'Y' || ((k === 'z' || k === 'Z') && e.shiftKey))) void this.retablir()
    else if (k === 'Delete' || k === 'Backspace') this.avis('Suppr est sans effet ici : la vue ne supprime aucun nœud du graphe.')
    else traitee = false
    if (traitee) {
      e.preventDefault()
      this.demander()
    }
  }

  // ─── Opérations ────────────────────────────────────────────────────────────

  private instantane(): Instantane {
    const noms: [string, string][] = this.graphe.noeuds.map((n) => [n.id, n.nom])
    for (const f of this.vue.figures ?? []) noms.push([PREFIXE_FIGURE + f.id, f.titre])
    return instantane(this.vue, noms)
  }

  private peutEcrire(): boolean {
    if (this.lectureSeule || !this.projetId) {
      this.avis(this.lectureSeule ?? 'Aucun espace ouvert : la vue est en lecture seule.')
      return false
    }
    if (this.enCours) {
      this.avis('Une modification de la vue est déjà en cours.')
      return false
    }
    return true
  }

  /** Envoie des opérations (tout ou rien) ; en cas de refus, la vue revient et le message du serveur s'affiche. */
  private async executer(ops: OperationVue[], libelle: string): Promise<boolean> {
    if (!ops.length) return true
    if (!this.peutEcrire()) {
      this.finirGlisser()
      return false
    }
    this.enCours = true
    const avant = this.instantane()
    try {
      await api.organiserVue(this.projetId!, ops)
      await this.options.recharger()
      this.pile.push({ libelle, avant, apres: this.instantane() })
      if (this.pile.length > 100) this.pile.shift()
      this.refaire = []
      return true
    } catch (e) {
      this.avis(e instanceof RefusVue ? `Refusé : ${e.message}` : `Échec : ${e instanceof Error ? e.message : String(e)}`)
      return false
    } finally {
      this.enCours = false
      this.finirGlisser()
    }
  }

  private async rejouer(entree: Entree, sens: 'annuler' | 'retablir'): Promise<boolean> {
    const ops = sens === 'annuler' ? operationsVers(entree.apres, entree.avant) : operationsVers(entree.avant, entree.apres)
    if (!ops.length) return true
    if (!this.peutEcrire()) return false
    this.enCours = true
    try {
      await api.organiserVue(this.projetId!, ops)
      await this.options.recharger()
      this.avis(`${sens === 'annuler' ? 'Annulé' : 'Rétabli'} : ${entree.libelle.toLowerCase()}.`)
      return true
    } catch (e) {
      this.avis(`${sens === 'annuler' ? 'Annulation' : 'Rétablissement'} refusé : ${e instanceof Error ? e.message : String(e)}`)
      return false
    } finally {
      this.enCours = false
      this.demander()
    }
  }

  private async annuler(): Promise<void> {
    const entree = this.pile[this.pile.length - 1]
    if (!entree) return this.avis('Rien à annuler dans cette session.')
    if (await this.rejouer(entree, 'annuler')) this.refaire.push(this.pile.pop()!)
  }

  private async retablir(): Promise<void> {
    const entree = this.refaire[this.refaire.length - 1]
    if (!entree) return this.avis('Rien à rétablir.')
    if (await this.rejouer(entree, 'retablir')) this.pile.push(this.refaire.pop()!)
  }

  private originesCadre(cadre: string): Map<string, Origine> {
    const origines = new Map<string, Origine>()
    for (const b of this.base.blocs.values()) {
      if (b.groupe && dansCadre(this.base, b.groupe, cadre)) origines.set(b.id, { colonne: b.colonne, ligne: b.ligne, groupe: b.groupe })
    }
    return origines
  }

  /** Cases déjà prises par un nœud non déplacé : les nœuds déplacés qui y tombent sont en conflit. */
  private casesOccupees(surcharges: Map<string, Surcharge>): Set<string> | null {
    const prises = new Set<string>()
    for (const b of this.base.blocs.values()) {
      if (surcharges.has(b.id) || !b.place) continue
      for (let c = b.colonne; c < b.colonne + b.largeur; c++) for (let l = b.ligne; l < b.ligne + b.hauteur; l++) prises.add(`${c},${l}`)
    }
    const conflits = new Set<string>()
    for (const [id, s] of surcharges) {
      const b = this.base.blocs.get(id)!
      for (let c = s.colonne; c < s.colonne + b.largeur; c++) for (let l = s.ligne; l < s.ligne + b.hauteur; l++) if (prises.has(`${c},${l}`)) conflits.add(id)
    }
    return conflits.size ? conflits : null
  }

  private async deposer(g: Extract<Geste, { genre: 'noeuds' }>, sx: number, sy: number): Promise<void> {
    const m = this.versMonde(sx, sy)
    const cible = this.cadreSous(m.x, m.y)
    const ops: OperationVue[] = []
    for (const [id, o] of g.origines) {
      const groupe = cible ?? o.groupe
      if (!g.dc && !g.dl && groupe === o.groupe && this.base.blocs.get(id)!.place) continue
      ops.push({ op: 'placer', noeud: id, colonne: o.colonne + g.dc, ligne: o.ligne + g.dl, groupe: groupe ?? '' })
    }
    if (!ops.length) return this.finirGlisser()
    // Pendant l'envoi, les nœuds restent où on les a posés.
    this.surcharges = new Map([...g.origines].map(([id, o]) => [id, { colonne: o.colonne + g.dc, ligne: o.ligne + g.dl, groupe: cible ?? o.groupe }]))
    this.modele = construireModele(this.graphe, this.vue, this.surcharges)
    this.cadreCible = null
    const seul = ops.length === 1 && String(ops[0]!.noeud).startsWith(PREFIXE_FIGURE) ? 'Déplacer la figure' : 'Déplacer le nœud'
    await this.executer(ops, ops.length > 1 ? `Déplacer ${ops.length} blocs` : seul)
  }

  private async basculerRepli(cadre: string): Promise<void> {
    const c = this.base.cadres.get(cadre)
    if (!c) return
    await this.executer([{ op: 'modifier_groupe', id: cadre, replie: !c.replie }], c.replie ? 'Déployer le cadre' : 'Réduire le cadre')
  }

  private async creerCadre(): Promise<void> {
    const ids = [...this.selection].filter((id) => this.base.blocs.get(id) && !this.base.blocs.get(id)!.cache)
    if (!ids.length) return this.avis('Sélectionne d’abord des nœuds : C crée un cadre autour de la sélection.')
    // Parent : le cadre commun le plus profond des nœuds sélectionnés.
    const chaine = (g: string | null) => {
      const r: string[] = []
      for (let x = g, d = 0; x && d < 50; x = this.base.cadres.get(x)?.parent ?? null, d++) r.unshift(x)
      return r
    }
    const chaines = ids.map((id) => chaine(this.base.blocs.get(id)!.groupe))
    let parent: string | null = null
    for (let k = 0; chaines.every((c) => c[k] !== undefined && c[k] === chaines[0]![k]); k++) parent = chaines[0]![k]!
    const id = `cadre_${Date.now().toString(36)}`
    const ops: OperationVue[] = [{ op: 'creer_groupe', id, nom: 'Nouveau cadre', parent: parent ?? '', genre: 'libre' }]
    for (const n of ids) {
      const b = this.base.blocs.get(n)!
      ops.push({ op: 'placer', noeud: n, colonne: b.colonne, ligne: b.ligne, groupe: id, fixe: b.place ? b.fixe : true })
    }
    if (await this.executer(ops, 'Créer un cadre')) this.renommerCadre(id)
  }

  // ─── Renommer sur place ────────────────────────────────────────────────────

  private renommerCadre(cadre: string): void {
    const c = this.modele.cadres.get(cadre)
    if (!c) return
    const r = c.rect ?? (c.fonction ? { x0: c.fonction.x, y0: c.fonction.y, x1: c.fonction.x + c.fonction.w, y1: c.fonction.y + CADRE.titre } : null)
    if (!r) return
    this.ouvrirSaisie(r.x0, r.y0, r.x1, r.y0 + CADRE.titre, c.nom, (nom) => {
      if (nom !== c.nom) void this.executer([{ op: 'modifier_groupe', id: cadre, nom }], 'Renommer le cadre')
    })
  }

  private renommerNoeud(id?: string): void {
    const cible = id ?? (this.selection.size === 1 ? [...this.selection][0]! : null)
    const b = cible ? this.modele.blocs.get(cible) : undefined
    if (!b || b.cache) return this.avis('Sélectionne un seul nœud visible pour le renommer (F2).')
    // Une figure se renomme par la même opération : son titre.
    this.ouvrirSaisie(b.x, b.y, b.x + b.w, b.y + 26, b.noeud.nom, (nom) => {
      if (nom !== b.noeud.nom) void this.executer([{ op: 'renommer_noeud', id: b.id, nom }], b.figure ? 'Renommer la figure' : 'Renommer le nœud')
    })
  }

  private ouvrirSaisie(x0: number, y0: number, x1: number, y1: number, valeur: string, valider: (nom: string) => void): void {
    const z = this.cam.z
    const hauteur = Math.max(24, (y1 - y0) * z)
    Object.assign(this.saisie.style, {
      left: `${Math.max(4, x0 * z + this.cam.x)}px`,
      top: `${Math.max(4, y0 * z + this.cam.y)}px`,
      width: `${Math.max(180, (x1 - x0) * z)}px`,
      height: `${hauteur}px`,
    })
    this.saisie.value = valeur
    this.saisie.hidden = false
    this.saisie.focus()
    this.saisie.select()
    this.renommage = (ok) => {
      this.renommage = null
      this.saisie.hidden = true
      const nom = this.saisie.value.trim()
      this.scene.focus({ preventScroll: true })
      if (ok && nom) valider(nom)
    }
  }

  // ─── Menu contextuel ───────────────────────────────────────────────────────

  private ouvrirMenu(c: Cible, sx: number, sy: number): void {
    type Article = { libelle: string; raccourci?: string; action?: () => void; inactif?: string } | 'sep' | { couleurs: string }
      | { format: string }
    const articles: Article[] = []
    let titre = ''
    if (c.genre === 'bloc' || c.genre === 'renvoi') {
      const id = c.id
      const b = this.base.blocs.get(id)!
      if (!this.selection.has(id)) {
        this.selection.clear()
        this.selection.add(id)
      }
      titre = `${b.libelle} ${b.numero}`
      articles.push({ libelle: 'Renommer', raccourci: 'F2', action: () => this.renommerNoeud(id) })
      if (b.place && b.fixe) {
        articles.push({ libelle: 'Libérer (la réorganisation pourra le déplacer)', action: () => void this.executer([{ op: 'placer', noeud: id, colonne: b.colonne, ligne: b.ligne, groupe: b.groupe ?? '', fixe: false }], 'Libérer le nœud') })
      } else {
        articles.push({ libelle: 'Fixer à sa case', action: () => void this.executer([{ op: 'placer', noeud: id, colonne: b.colonne, ligne: b.ligne, groupe: b.groupe ?? '' }], 'Fixer le nœud') })
      }
      const parent = b.groupe ? this.base.cadres.get(b.groupe)?.parent ?? null : null
      articles.push(b.groupe
        ? { libelle: 'Sortir du cadre', action: () => void this.executer([{ op: 'placer', noeud: id, groupe: parent ?? '' }], 'Sortir du cadre') }
        : { libelle: 'Sortir du cadre', inactif: 'hors cadre' })
      articles.push('sep')
      if (this.selection.size > 1) articles.push({ libelle: 'Cadre autour de la sélection', raccourci: 'C', action: () => void this.creerCadre() })
      if (b.figure) {
        const illustre = b.figure.noeud_id
        articles.push({ libelle: 'Ouvrir en grand', raccourci: 'double-clic', action: () => this.ouvrirFigure(id) })
        articles.push({ format: id })
        articles.push(this.base.blocs.has(illustre)
          ? { libelle: `Montrer le nœud illustré (${referenceDe(this.base, illustre)})`, action: () => this.montrer(illustre) }
          : { libelle: 'Montrer le nœud illustré', inactif: 'absent du graphe' })
      } else articles.push({ libelle: 'Ouvrir la fiche', raccourci: 'double-clic', action: () => this.options.surOuvrir(b.noeud) })
      articles.push({ libelle: 'Cadrer la sélection', raccourci: 'F', action: () => this.cadrerSelection() })
    } else if (c.genre === 'titre' || c.genre === 'cadre' || c.genre === 'fonction') {
      const g = this.base.cadres.get(c.cadre)!
      titre = `${g.numero} ${g.nom}`
      articles.push({ libelle: 'Renommer', raccourci: 'double-clic', action: () => this.renommerCadre(g.id) })
      articles.push({ couleurs: g.id })
      articles.push({ libelle: g.replie ? 'Déployer' : 'Réduire en nœud-fonction', raccourci: 'clic sur le titre', action: () => void this.basculerRepli(g.id) })
      articles.push({ libelle: 'Réorganiser le cadre', action: () => void this.executer([{ op: 'reorganiser', groupe: g.id }], 'Réorganiser le cadre') })
      articles.push('sep')
      articles.push({ libelle: 'Supprimer le cadre (les nœuds restent)', action: () => void this.executer([{ op: 'supprimer_groupe', id: g.id }], 'Supprimer le cadre') })
    } else {
      titre = 'Graphe'
      articles.push(this.selection.size
        ? { libelle: 'Nouveau cadre autour de la sélection', raccourci: 'C', action: () => void this.creerCadre() }
        : { libelle: 'Nouveau cadre ici', inactif: 'sélectionne d’abord des nœuds : un cadre vide n’a pas de place' })
      articles.push({ libelle: 'Réorganiser tout', action: () => void this.executer([{ op: 'reorganiser' }], 'Réorganiser tout') })
      articles.push('sep')
      articles.push({ libelle: 'Cadrer tout', raccourci: 'Origine', action: () => this.cadrerTout() })
    }
    this.menu.innerHTML = `<div class="gr-menu-titre">${echapper(titre)}</div>`
    for (const a of articles) {
      if (a === 'sep') {
        this.menu.append(element(null, 'hr', 'gr-menu-sep'))
      } else if ('couleurs' in a) {
        const ligne = element(this.menu, 'div', 'gr-menu-couleurs')
        ligne.innerHTML = '<span>Couleur</span>'
        const actuelle = this.vue.groupes.find((x) => x.id === a.couleurs)?.couleur ?? null
        for (const t of [null, ...TEINTES]) {
          const b = element(ligne, 'button', 'gr-teinte') as HTMLButtonElement
          b.type = 'button'
          b.title = t ?? 'Par défaut (palette par ordre)'
          b.style.background = t ? rgba(t, 0.35) : 'transparent'
          b.style.borderColor = t ?? PALETTE.gris
          if (!t) b.textContent = '∅'
          if (t === actuelle) b.classList.add('actif')
          b.addEventListener('click', () => {
            this.fermerMenu()
            void this.executer([{ op: 'modifier_groupe', id: a.couleurs, couleur: t ?? '' }], 'Changer la couleur du cadre')
          })
        }
      } else if ('format' in a) {
        // Format d'une figure (largeur × hauteur en cases) ; elle garde sa case, et la vue refuse un chevauchement.
        const ligne = element(this.menu, 'div', 'gr-menu-couleurs')
        ligne.innerHTML = '<span>Format</span>'
        const f = this.base.blocs.get(a.format)!
        for (const [largeur, hauteur] of FORMATS_FIGURE) {
          const b = element(ligne, 'button', 'gr-format') as HTMLButtonElement
          b.type = 'button'
          b.title = `${largeur} × ${hauteur} case${largeur * hauteur > 1 ? 's' : ''} (largeur × hauteur)`
          b.innerHTML = `<i style="width:${largeur * 7}px;height:${hauteur * 7}px"></i>`
          if (f.largeur === largeur && f.hauteur === hauteur) b.classList.add('actif')
          b.addEventListener('click', () => {
            this.fermerMenu()
            const ou = f.place ? { colonne: f.colonne, ligne: f.ligne, groupe: f.groupe ?? '', fixe: f.fixe } : {}
            void this.executer([{ op: 'placer', noeud: a.format, ...ou, largeur, hauteur }], 'Changer le format de la figure')
          })
        }
      } else {
        const b = element(this.menu, 'button', 'gr-menu-article') as HTMLButtonElement
        b.type = 'button'
        b.setAttribute('role', 'menuitem')
        b.innerHTML = `<span>${echapper(a.libelle)}</span>${a.raccourci ? `<kbd>${echapper(a.raccourci)}</kbd>` : ''}`
        if (a.inactif) {
          b.disabled = true
          b.title = a.inactif
          b.innerHTML += `<small>${echapper(a.inactif)}</small>`
        }
        b.addEventListener('click', () => {
          this.fermerMenu()
          a.action?.()
        })
      }
    }
    this.menu.hidden = false
    const w = this.menu.offsetWidth, h = this.menu.offsetHeight
    this.menu.style.left = `${Math.min(sx, this.largeur - w - 6)}px`
    this.menu.style.top = `${Math.min(sy, this.hauteur - h - 6)}px`
    this.demander()
  }

  private fermerMenu(): void {
    this.menu.hidden = true
  }

  private avis(texte: string): void {
    this.avisEl.textContent = texte
    this.avisEl.hidden = false
    clearTimeout(this.minuterieAvis)
    this.minuterieAvis = window.setTimeout(() => (this.avisEl.hidden = true), Math.min(9000, 3000 + texte.length * 40))
  }
}

function element(parent: HTMLElement | null, balise: string, classe: string): HTMLElement {
  const el = document.createElement(balise)
  el.className = classe
  parent?.append(el)
  return el
}

/** Petit cadre de légende : le statut se lit au trait. */
function iconeStatut(motif: string): string {
  const [dash, gris] = motif.split('|')
  const couleur = gris ? '#8a8a8a' : '#000'
  const barre = dash === 'x' ? '<line x1="1" y1="11" x2="21" y2="1" stroke="#000" stroke-opacity=".55" stroke-width=".8"/>' : ''
  const tirets = dash && dash !== 'x' ? ` stroke-dasharray="${dash}"` : ''
  return `<svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true"><rect x=".5" y=".5" width="21" height="11" fill="#fff" stroke="${couleur}"${tirets}/>${barre}</svg>`
}
