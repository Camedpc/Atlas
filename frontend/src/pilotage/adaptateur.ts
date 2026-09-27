// Adaptateur entre l'état d'affichage (P3/P4) et l'écran : `synchroniser(etat)` amène le moteur et
// l'application dans un état visé, `jouer(effet)` exécute un effet de caméra ou de données, `exporter()`
// lit l'état réel de l'écran. Seul fichier qui traduit id de nœud ↔ point du moteur : les points changent
// à chaque dérivation, les ids jamais.

import type { VueGrapheAtlas } from '../graphe/vueAtlas'
import type { ParametresLecture as ParametresMoteur } from '../graphe/raisonnement/lecture'
import type { ReducteurPoint } from '../graphe/raisonnement/vue'
import { construireIndex, type Effet, type IndexDonnees } from './etat'
import type { EtatAffichage, IdNoeud, NomVue, ParametresLecture, RefNoeud } from './protocole'

/** Ce que l'application (hors moteur) expose au pilotage. */
export interface InterfaceApp {
  fiche(): IdNoeud | null
  definirFiche(id: IdNoeud | null): void
  panneauOuvert(): boolean
  definirPanneau(ouvert: boolean): void
  conversationAffichee(): string | null
  recharger(): Promise<void>
}

const NB_VISIBLES = 50
const DECIMALES = 1e6

// Paramètres de lecture : protocole (snake_case) ↔ moteur (camelCase).
const VERS_MOTEUR = {
  demonstrations: 'demonstrations',
  roles_retenus: 'rolesRetenus',
  masquer_contexte: 'masquerContexte',
  types_toujours_visibles: 'typesToujoursVisibles',
  types_insecables: 'typesInsecables',
  longueur_min_chaine: 'longueurMinChaine',
  longueur_max_chaine: 'longueurMaxChaine',
  meme_sous_probleme: 'memeSousProbleme',
} as const satisfies Record<keyof ParametresLecture, keyof ParametresMoteur>

export function parametresVersMoteur(p: ParametresLecture): Partial<ParametresMoteur> {
  const r: Record<string, unknown> = {}
  for (const [cle, valeur] of Object.entries(p)) if (valeur !== undefined) r[VERS_MOTEUR[cle as keyof ParametresLecture]] = valeur
  return r as Partial<ParametresMoteur>
}

export function parametresDepuisMoteur(p: Partial<ParametresMoteur>): ParametresLecture {
  const r: Record<string, unknown> = {}
  for (const [cle, nom] of Object.entries(VERS_MOTEUR)) {
    const valeur = p[nom]
    if (valeur !== undefined) r[cle] = Array.isArray(valeur) ? [...valeur] : valeur
  }
  return r as ParametresLecture
}

/** Égalité de deux valeurs JSON (clés d'objet dans n'importe quel ordre). */
function egaux(a: unknown, b: unknown): boolean {
  const canon = (x: unknown): unknown =>
    Array.isArray(x) ? x.map(canon)
      : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).sort(([k], [l]) => k.localeCompare(l)).map(([k, v]) => [k, canon(v)]))
        : x
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b))
}

const arrondi = (x: number) => Math.round(x * DECIMALES) / DECIMALES

export class AdaptateurAffichage {
  readonly ecran: string
  utilisateurId: string
  private vue: VueGrapheAtlas
  private app: InterfaceApp
  private surlignes: IdNoeud[] = []
  private cacheSurlignes: Uint8Array | null = null
  /** Id demandé pour la sélection : un nœud fusionné dans une étape reste désigné par son propre id. */
  private idSelection: IdNoeud | null = null

  constructor(vue: VueGrapheAtlas, app: InterfaceApp, ecran: string, utilisateurId: string) {
    this.vue = vue
    this.app = app
    this.ecran = ecran
    this.utilisateurId = utilisateurId
    const m = vue.moteur
    m.ajouterReducteurNoeud(this.surligner)
    m.on('disposition', () => (this.cacheSurlignes = null))
  }

  index(): IndexDonnees {
    return construireIndex(this.vue.moteur.justification.noeuds)
  }

  /** Point qui représente un nœud (son unité, son étape ou son point de contexte). */
  point(id: IdNoeud): number | null {
    const m = this.vue.moteur
    const i = m.justification.index.get(id)
    return i === undefined ? null : m.pointDeNoeud(i)
  }

  /** Amène l'écran dans l'état visé (seules les différences sont appliquées). */
  async synchroniser(e: EtatAffichage): Promise<void> {
    const m = this.vue.moteur
    this.vue.silencieux = true
    try {
      if (m.reglages.valeurs.theme !== e.theme) m.definirTheme(e.theme)
      const parametres = parametresVersMoteur(e.parametres_lecture)
      if (m.strategie.id !== e.strategie || !egaux(m.parametres, parametres)) await m.appliquerLecture(e.strategie, parametres)
      if (m.reglages.valeurs.liensComplets !== e.liens_complets) m.montrerLiensComplets(e.liens_complets)
      if (m.mode !== e.camera.mode) m.definirMode(e.camera.mode)
      if (!egaux(this.vue.filtres.etat, e.filtres)) this.vue.filtres.definir(structuredClone(e.filtres))
      this.synchroniserSelection(e.selection, e.portee)
      if (!egaux(this.surlignes, e.surlignes)) {
        this.surlignes = [...e.surlignes]
        this.cacheSurlignes = null
        m.demanderRendu()
      }
      if (this.app.fiche() !== (e.fiche?.noeud ?? null)) this.app.definirFiche(e.fiche?.noeud ?? null)
      if (this.app.panneauOuvert() !== e.panneau_ouvert) this.app.definirPanneau(e.panneau_ouvert)
    } finally {
      this.vue.silencieux = false
    }
  }

  private synchroniserSelection(selection: RefNoeud | null, portee: RefNoeud | null): void {
    const m = this.vue.moteur
    const cible = portee ?? selection
    this.idSelection = cible?.noeud ?? null
    if (!cible) {
      if (m.selection !== null) m.selectionner(null)
      return
    }
    const p = this.point(cible.noeud)
    if (p === null) return
    if (portee) {
      if (m.selection !== p || !m.porteeActive) m.montrerPortee(p)
    } else if (m.selection !== p || m.porteeActive) m.selectionner(p)
  }

  async jouer(effet: Effet): Promise<void> {
    const m = this.vue.moteur
    const duree = m.reglages.valeurs.dureeTransition
    switch (effet.genre) {
      case 'cadrer':
        if ('tout' in effet) this.vue.cadrer()
        else if ('selection' in effet) m.cadrerSelection()
        else {
          const points = [...new Set(effet.noeuds.map((id) => this.point(id)).filter((p): p is number => p !== null))]
          if (points.length) m.cadrer(points)
        }
        break
      case 'zoomer':
        m.camera.zoomerVers(effet.facteur, duree * 0.6)
        break
      case 'orbiter':
        m.camera.orbiterVers((effet.d_azimut_deg * Math.PI) / 180, (effet.d_elevation_deg * Math.PI) / 180, duree * 0.6)
        break
      case 'vue':
        m.allerVue(effet.nom)
        break
      case 'camera': {
        const c = effet.camera
        m.camera.animerVers({ orientation: [...c.orientation], cible: [...c.cible], distance: c.distance }, duree)
        break
      }
      case 'recharger':
        await this.app.recharger()
        break
      case 'attendre':
        await new Promise((r) => setTimeout(r, effet.ms))
        break
    }
    m.demanderRendu()
  }

  /** État réel de l'écran (P4). Caméra : valeurs visées, donc exactes dès la fin d'une commande. */
  exporter(): EtatAffichage {
    const m = this.vue.moteur
    const cam = m.camera
    const idDe = (p: number): IdNoeud => (this.idSelection !== null && this.point(this.idSelection) === p ? this.idSelection : m.noeud(p).id)
    const selection = m.selection === null ? null : { noeud: idDe(m.selection) }
    const connus = m.justification.index
    return {
      version: 1,
      ecran: this.ecran,
      utilisateur_id: this.utilisateurId,
      version_donnees: this.vue.version,
      strategie: m.strategie.id as EtatAffichage['strategie'],
      parametres_lecture: parametresDepuisMoteur(m.parametres),
      liens_complets: m.reglages.valeurs.liensComplets,
      camera: {
        mode: m.mode,
        vue: cam.vueVisee() as NomVue | null,
        orientation: cam.orientationVisee.map(arrondi) as [number, number, number, number],
        cible: cam.cibleVisee.map(arrondi) as [number, number, number],
        distance: arrondi(cam.distanceVisee),
      },
      selection,
      portee: m.porteeActive && selection ? { ...selection } : null,
      surlignes: this.surlignes.filter((id) => connus.has(id)),
      filtres: structuredClone(this.vue.filtres.etat),
      fiche: this.app.fiche() === null ? null : { noeud: this.app.fiche()! },
      panneau_ouvert: this.app.panneauOuvert(),
      theme: m.reglages.valeurs.theme,
      visibles: this.visibles(),
      survol: m.survol === null ? null : { noeud: m.noeud(m.survol).id },
      conversation_affichee: this.app.conversationAffichee(),
    }
  }

  /** Les points à l'écran les plus importants (descendants dans le graphe de lecture), puis par id. */
  private visibles(): EtatAffichage['visibles'] {
    const m = this.vue.moteur
    const pr = m.projection
    const largeur = m.scene.clientWidth, hauteur = m.scene.clientHeight
    const r: { p: number; id: string; importance: number }[] = []
    for (let p = 0; p < m.nP; p++) {
      if (m.opaciteAffichee[p]! < 0.05 || !pr.visible[p]) continue
      const x = pr.x[p]!, y = pr.y[p]!
      if (x < 0 || y < 0 || x > largeur || y > hauteur) continue
      r.push({ p, id: m.noeud(p).id, importance: p < m.nU ? m.importance[p]! : 0 })
    }
    r.sort((a, b) => b.importance - a.importance || a.id.localeCompare(b.id))
    return r.slice(0, NB_VISIBLES).map(({ p, id }) => ({
      noeud: id, libelle: m.noeud(p).nom, x: Math.round(pr.x[p]! * 10) / 10, y: Math.round(pr.y[p]! * 10) / 10,
    }))
  }

  /** Surlignage : bordure d'accent et libellé forcé pour les points qui contiennent un nœud surligné. */
  private surligner: ReducteurPoint = (info, a, vue) => {
    if (!this.surlignes.length) return
    if (!this.cacheSurlignes || this.cacheSurlignes.length !== vue.nP) {
      const ids = new Set(this.surlignes)
      const noeuds = vue.justification.noeuds
      this.cacheSurlignes = new Uint8Array(vue.nP)
      for (let q = 0; q < vue.nP; q++) {
        const membres = q < vue.nU ? vue.lecture.unites[q]!.membres : [vue.indexNoeud(q)]
        this.cacheSurlignes[q] = membres.some((i) => ids.has(noeuds[i]!.id)) ? 1 : 0
      }
    }
    if (!this.cacheSurlignes[info.point]) return
    a.surligne = true
    a.couleurBordure = vue.palette.accent
    a.epaisseurBordure = Math.max(a.epaisseurBordure, 0.45)
    a.forceLibelle = a.libelle !== null
    a.zIndex += 4000
  }
}
