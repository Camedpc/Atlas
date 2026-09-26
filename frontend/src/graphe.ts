// Vue sigma.js du graphe de raisonnement. Tout ce qui se règle (couleurs, tailles, disposition) est en haut.
import Graph from 'graphology'
import Sigma from 'sigma'
import type { Graphe, Noeud, Statut, Validite } from './api'

export const COULEURS_STATUT: Record<Statut, string> = {
  etabli: '#2e9e5b',
  suspendu: '#d69a1f',
  a_verifier: '#4a7fd4',
  invalide: '#d64545',
  ouvert: '#8a8f98',
}

export const LIBELLES_STATUT: Record<Statut, string> = {
  etabli: 'Établi',
  suspendu: 'Suspendu',
  a_verifier: 'À vérifier',
  invalide: 'Invalide',
  ouvert: 'Ouvert',
}

const COULEURS_VALIDITE: Record<Validite, string> = {
  valide: '#2e9e5b',
  a_verifier: '#9aa3b2',
  invalide: '#d64545',
}

// Thème clair uniquement. Couleurs opaques : sigma gère mal la transparence des nœuds.
const COULEUR_ESTOMPEE = '#e4e4e0'
const COULEUR_ETIQUETTE = '#18181b'
const TAILLE_NOEUD = 9
const ECART_X = 3
const ECART_Y = 2.5

/** Disposition en couches : les prémisses en haut, chaque nœud une couche sous sa prémisse la plus profonde. */
function disposer(noeuds: Noeud[]): Map<string, { x: number; y: number }> {
  const parId = new Map(noeuds.map((n) => [n.id, n]))
  const profondeurs = new Map<string, number>()
  const profondeur = (id: string, pile: Set<string>): number => {
    const connue = profondeurs.get(id)
    if (connue !== undefined) return connue
    if (pile.has(id)) return 0 // cycle : on coupe
    pile.add(id)
    const parents = (parId.get(id)?.parents ?? []).filter((p) => parId.has(p))
    const p = parents.length ? 1 + Math.max(...parents.map((q) => profondeur(q, pile))) : 0
    pile.delete(id)
    profondeurs.set(id, p)
    return p
  }
  const couches = new Map<number, string[]>()
  for (const n of noeuds) {
    const p = profondeur(n.id, new Set())
    couches.set(p, [...(couches.get(p) ?? []), n.id])
  }
  const positions = new Map<string, { x: number; y: number }>()
  for (const [p, ids] of couches) {
    ids.forEach((id, i) => positions.set(id, { x: (i - (ids.length - 1) / 2) * ECART_X, y: -p * ECART_Y }))
  }
  return positions
}

export class VueGraphe {
  private graphe = new Graph({ type: 'directed', multi: true })
  private sigma: Sigma
  private selection: string | null = null
  // Ids affichés au dernier dessin : s'ils changent (filtre, conversation, nouveaux nœuds), on recadre.
  private affiches = ''
  private surSelection: (noeud: Noeud | null) => void

  constructor(conteneur: HTMLElement, surSelection: (noeud: Noeud | null) => void) {
    this.surSelection = surSelection
    this.sigma = new Sigma(this.graphe, conteneur, {
      defaultEdgeType: 'arrow',
      // Le conteneur est masqué quand l'agent graph est affiché : sigma se redimensionne au retour.
      allowInvalidContainer: true,
      labelColor: { color: COULEUR_ETIQUETTE },
      stagePadding: 90,
      labelRenderedSizeThreshold: 0,
      labelSize: 12,
      zIndex: true,
      nodeReducer: (id, attributs) => {
        if (!this.selection || id === this.selection || this.graphe.areNeighbors(id, this.selection)) {
          return { ...attributs, highlighted: id === this.selection, zIndex: 1 }
        }
        return { ...attributs, color: COULEUR_ESTOMPEE, label: '', zIndex: 0 }
      },
      edgeReducer: (arete, attributs) => {
        if (!this.selection || this.graphe.extremities(arete).includes(this.selection)) return attributs
        return { ...attributs, hidden: true }
      },
    })
    this.sigma.on('clickNode', ({ node }) => this.selectionner(node))
    this.sigma.on('clickStage', () => this.selectionner(null))
  }

  afficher(donnees: Graphe, conversationId: string | null) {
    const noeuds = conversationId ? donnees.noeuds.filter((n) => n.conversation_id === conversationId) : donnees.noeuds
    const gardes = new Set(noeuds.map((n) => n.id))
    const positions = disposer(noeuds)

    this.graphe.clear()
    for (const n of noeuds) {
      this.graphe.addNode(n.id, {
        ...positions.get(n.id),
        label: n.nom,
        size: TAILLE_NOEUD,
        color: COULEURS_STATUT[n.statut],
        noeud: n,
      })
    }
    for (const a of donnees.aretes) {
      if (gardes.has(a.source) && gardes.has(a.cible)) {
        this.graphe.addEdge(a.source, a.cible, { color: COULEURS_VALIDITE[a.validite], size: 2 })
      }
    }
    if (this.selection && !gardes.has(this.selection)) this.selectionner(null)
    this.sigma.refresh()
    const affiches = [...gardes].sort().join(' ')
    if (affiches !== this.affiches) {
      this.affiches = affiches
      this.sigma.getCamera().animatedReset()
    }
    return noeuds.length
  }

  selectionner(id: string | null) {
    this.selection = id
    this.surSelection(id ? (this.graphe.getNodeAttribute(id, 'noeud') as Noeud) : null)
    this.sigma.refresh()
  }

  recentrer() {
    this.sigma.resize()
    this.sigma.refresh()
    this.sigma.getCamera().animatedReset()
  }
}
