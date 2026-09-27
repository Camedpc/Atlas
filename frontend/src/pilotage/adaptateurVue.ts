// Adaptateur entre l'état d'affichage (P3/P4) et la vue « Graphe de raisonnement » (graphe.ts, éditeur 2D à
// cases et cadres) : `synchroniser(etat)` amène la vue dans un état visé, `jouer(effet)` exécute un effet de
// caméra ou de données, `exporter()` lit l'état réel de l'écran.
//
// La vue n'a ni 3D ni niveaux de détail : ces commandes sont refusées (`refuser`), et l'état exporté garde
// leurs valeurs par défaut. Pas de positions provisoires : `deplacer` et `retablir_disposition` sont refusés
// (un déplacement s'enregistrera dans la vue de l'espace). `attendre` fait une pause dans le lot. Les filtres
// estompent (la disposition en cases ne bouge jamais : masquer un nœud laisserait un trou) ; `filtres.mode` est
// gardé tel que demandé. La portée d'un nœud (tout ce qui en dépend) est surlignée. Rien ici n'écrit la vue
// enregistrée (cases, cadres) : seulement ce qu'on regarde.

import type { Noeud } from '../api'
import type { VueGraphe } from '../graphe'
import { construireIndex, filtresVides, type Effet, type IndexDonnees } from './etat'
import type { Ecran } from './pilote'
import type { CommandeBas, EtatAffichage, EtatFiltres, ErreurProtocole, IdNoeud, RefNoeud } from './protocole'

/** Ce que l'application (hors vue) expose au pilotage. */
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
/** Les ids du protocole sont des slugs (commun.schema.json) : un autre id ne sort jamais de l'écran. */
const ID_NOEUD = /^[a-z0-9_]+$/
const arrondi = (x: number) => Math.round(x * DECIMALES) / DECIMALES

const nonPrisEnCharge = (message: string): ErreurProtocole => ({ code: 'etat_invalide', message: `Non pris en charge : ${message}` })
const SANS_3D = 'la vue du graphe est en 2D (ni 3D, ni orbite, ni autre vue que face).'
const SANS_NIVEAUX = 'la vue du graphe n’a pas de niveaux de détail (strategie, parametres_lecture, liens_complets).'
const SANS_DEPLACEMENT = 'pas de positions provisoires sur cet écran (déplacer, retablir_disposition).'

// ─── Filtres (fonctions pures) ───────────────────────────────────────────────

export function filtresActifs(f: EtatFiltres): boolean {
  return f.conversation !== null || f.noeuds.length > 0 || f.statuts.length > 0 || f.types.length > 0 || f.periode.debut !== null
    || f.periode.fin !== null || f.texte.trim() !== ''
}

/** Minuscules sans accents, espaces réduits. */
export function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Une date seule (AAAA-MM-JJ) couvre toute la journée pour la borne de fin. */
function borne(date: string, fin: boolean): number {
  return Date.parse(date.length === 10 ? `${date}T${fin ? '23:59:59.999' : '00:00:00'}Z` : date)
}

/** Le nœud passe-t-il tous les critères actifs ? (`cree_le` est servi par l'API sans être typé.) */
export function noeudPasse(n: Noeud & { cree_le?: string }, f: EtatFiltres): boolean {
  if (f.conversation !== null && n.conversation_id !== f.conversation) return false
  if (f.noeuds.length && !f.noeuds.includes(n.id)) return false
  if (f.statuts.length && !f.statuts.includes(n.statut)) return false
  if (f.types.length && !(n.type && f.types.includes(n.type))) return false
  if (f.periode.debut !== null || f.periode.fin !== null) {
    const t = n.cree_le ? Date.parse(n.cree_le) : NaN
    if (Number.isNaN(t)) return false
    if (f.periode.debut !== null && t < borne(f.periode.debut, false)) return false
    if (f.periode.fin !== null && t > borne(f.periode.fin, true)) return false
  }
  const texte = normaliser(f.texte)
  if (texte && !normaliser(`${n.id} ${n.nom} ${n.enonce}`).includes(texte)) return false
  return true
}

/** Tout ce qui dépend d'un nœud (conséquences, transitivement), le nœud compris. */
export function portee(noeuds: readonly Noeud[], id: IdNoeud): IdNoeud[] {
  const enfants = new Map(noeuds.map((n) => [n.id, n.enfants]))
  const vus = new Set<IdNoeud>([id])
  const pile = [id]
  while (pile.length) {
    for (const e of enfants.get(pile.pop()!) ?? []) {
      if (vus.has(e)) continue
      vus.add(e)
      pile.push(e)
    }
  }
  return [...vus].sort()
}

/** Commande que cette vue ne sait pas exécuter (refusée avant toute action), ou null. */
export function refuserCommande(c: CommandeBas): ErreurProtocole | null {
  switch (c.op) {
    case 'mode':
      return c.mode === '2d' ? null : nonPrisEnCharge(SANS_3D)
    case 'vue':
      return c.nom === 'face' ? null : nonPrisEnCharge(SANS_3D)
    case 'orbiter':
      return nonPrisEnCharge(SANS_3D)
    case 'strategie':
      return c.id === 'defaut' ? null : nonPrisEnCharge(SANS_NIVEAUX)
    case 'parametres_lecture':
      return Object.keys(c.patch).length ? nonPrisEnCharge(SANS_NIVEAUX) : null
    case 'liens_complets':
      return c.oui ? nonPrisEnCharge(SANS_NIVEAUX) : null
    case 'theme':
      return c.theme === 'clair' ? null : nonPrisEnCharge('la vue du graphe n’a pas de thème sombre.')
    case 'deplacer':
    case 'retablir_disposition':
      return nonPrisEnCharge(SANS_DEPLACEMENT)
    default:
      return null
  }
}

function egaux(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

// ─── Adaptateur ──────────────────────────────────────────────────────────────

export class AdaptateurVue implements Ecran {
  readonly ecran: string
  utilisateurId: string
  private vue: VueGraphe
  private app: InterfaceApp
  private filtres: EtatFiltres = filtresVides()
  private surlignes: IdNoeud[] = []
  private porteeDe: IdNoeud | null = null
  private ecouteurs: (() => void)[] = []
  private signature = ''

  constructor(vue: VueGraphe, app: InterfaceApp, ecran: string, utilisateurId: string) {
    this.vue = vue
    this.app = app
    this.ecran = ecran
    this.utilisateurId = utilisateurId
  }

  /** À appeler après chaque image de la vue : prévient le pilote si ce qu'on regarde a changé. */
  apresImage(): void {
    const c = this.vue.camera
    const signature = JSON.stringify([
      Math.round(c.x), Math.round(c.y), c.z, this.vue.noeudSelectionne, this.vue.noeudSurvole, this.app.fiche(),
      this.app.panneauOuvert(), this.app.conversationAffichee(), this.vue.projet, this.vue.noeuds.length,
    ])
    if (signature === this.signature) return
    this.signature = signature
    for (const f of this.ecouteurs) f()
  }

  surChangement(f: () => void): void {
    this.ecouteurs.push(f)
  }

  private get connus(): Noeud[] {
    return this.vue.noeuds.filter((n) => ID_NOEUD.test(n.id))
  }

  index(): IndexDonnees {
    return construireIndex(this.connus.map((n) => ({ id: n.id, conversation: n.conversation_id })), this.vue.figures)
  }

  refuser(c: CommandeBas): ErreurProtocole | null {
    return refuserCommande(c)
  }

  async synchroniser(e: EtatAffichage): Promise<void> {
    if (!egaux(this.filtres, e.filtres)) {
      this.filtres = structuredClone(e.filtres)
      const f = this.filtres
      this.vue.definirFiltre(filtresActifs(f) ? (n) => noeudPasse(n, f) : null)
    }
    const cible = e.portee ?? e.selection
    if (this.vue.noeudSelectionne !== (cible?.noeud ?? null)) this.vue.selectionner(cible?.noeud ?? null)
    this.porteeDe = e.portee?.noeud ?? null
    this.surlignes = [...e.surlignes]
    this.vue.surligner([...new Set([...this.surlignes, ...(this.porteeDe ? portee(this.vue.noeuds, this.porteeDe) : [])])])
    if (this.app.fiche() !== (e.fiche?.noeud ?? null)) this.app.definirFiche(e.fiche?.noeud ?? null)
    if (this.app.panneauOuvert() !== e.panneau_ouvert) this.app.definirPanneau(e.panneau_ouvert)
  }

  async jouer(effet: Effet): Promise<void> {
    switch (effet.genre) {
      case 'cadrer':
        if ('tout' in effet) {
          // Avec des filtres, « tout » est ce qui les passe.
          const f = this.filtres
          if (!filtresActifs(f) || !(await this.vue.cadrerNoeuds(this.vue.noeuds.filter((n) => noeudPasse(n, f)).map((n) => n.id)))) {
            await this.vue.cadrerGraphe()
          }
        } else if ('selection' in effet) {
          const s = this.vue.noeudSelectionne
          if (s) await this.vue.cadrerNoeuds([s])
        } else await this.vue.cadrerNoeuds(effet.noeuds)
        break
      case 'zoomer':
        await this.vue.zoomerDe(effet.facteur)
        break
      case 'camera':
        await this.vue.placerCamera(effet.camera.cible[0], effet.camera.cible[1], 1 / effet.camera.distance)
        break
      case 'recharger':
        await this.app.recharger()
        break
      case 'attendre':
        await new Promise((r) => setTimeout(r, effet.ms))
        break
      case 'vue': // face, seule vue acceptée : c'est déjà celle de l'écran
      case 'orbiter': // refusé avant (refuserCommande)
        break
    }
  }

  exporter(): EtatAffichage {
    const connus = new Set(this.connus.map((n) => n.id))
    const ref = (id: IdNoeud | null): RefNoeud | null => (id !== null && connus.has(id) ? { noeud: id } : null)
    const c = this.vue.camera
    const selection = ref(this.vue.noeudSelectionne)
    const noeuds = this.vue.noeuds
    const modifie = noeuds.reduce((m, n) => {
      const d = (n as Noeud & { modifie_le?: string }).modifie_le ?? ''
      return d > m ? d : m
    }, '')
    return {
      version: 1,
      ecran: this.ecran,
      utilisateur_id: this.utilisateurId,
      version_donnees: `${modifie}#${noeuds.length}`,
      strategie: 'defaut',
      parametres_lecture: {},
      liens_complets: false,
      camera: { mode: '2d', vue: 'face', orientation: [0, 0, 0, 1], cible: [arrondi(c.x), arrondi(c.y), 0], distance: arrondi(1 / c.z) },
      selection,
      portee: selection && this.porteeDe === selection.noeud ? { ...selection } : null,
      surlignes: this.surlignes.filter((id) => connus.has(id)),
      filtres: structuredClone(this.filtres),
      fiche: ref(this.app.fiche()),
      panneau_ouvert: this.app.panneauOuvert(),
      theme: 'clair',
      visibles: this.vue.visibles(NB_VISIBLES).filter((v) => connus.has(v.id)).map((v) => ({ noeud: v.id, libelle: v.nom, x: v.x, y: v.y })),
      survol: ref(this.vue.noeudSurvole),
      conversation_affichee: this.app.conversationAffichee(),
      projet: this.vue.projet,
    }
  }
}
