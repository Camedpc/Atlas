// Colle avec sigma : graphe graphology (feuilles + agrégats + arêtes affichées), caméra native figée,
// bbox fixe, positions écrites directement dans les attributs puis `refresh()` une fois par image,
// et deux calques canvas 2D (sous et sur sigma) synchronisés avec la projection.
//
// Correspondance écran ↔ graphe : avec la bbox fixe [-1,1]², la caméra sigma par défaut et
// stagePadding = 0, sigma place (x, y) en (W/2 + S·x/2, H/2 − S·y/2) avec S = min(W, H).

import Sigma from 'sigma'
import Graph from 'graphology'
import type { Attributes } from 'graphology-types'
import { createNodeBorderProgram } from '@sigma/node-border'
import type { EdgeProgramType, NodeProgramType, NodeLabelDrawingFunction, NodeHoverDrawingFunction } from 'sigma/rendering'
import type { Settings } from 'sigma/settings'
import type { NodeDisplayData, EdgeDisplayData } from 'sigma/types'
import type { Hierarchie, Paire } from './hierarchie'
import type { Projection } from './camera3d'

export interface OptionsRendu {
  nodeReducer: (cle: string, attrs: Attributes) => Partial<NodeDisplayData>
  edgeReducer: (cle: string, attrs: Attributes) => Partial<EdgeDisplayData>
  dessinerLibelle: NodeLabelDrawingFunction
  dessinerSurvol: NodeHoverDrawingFunction
  programmesNoeud?: Record<string, NodeProgramType>
  programmesArete?: Record<string, EdgeProgramType>
  reglagesSigma?: Partial<Settings>
}

export class Rendu {
  readonly graphe: Graph
  readonly sigma: Sigma
  readonly calqueDessous: HTMLCanvasElement
  readonly calqueDessus: HTMLCanvasElement
  readonly ctxDessous: CanvasRenderingContext2D
  readonly ctxDessus: CanvasRenderingContext2D
  largeur = 1
  hauteur = 1
  ratioPixel = 1
  /** Attributs graphology de chaque unité (références : on les modifie sans événement). */
  private attributs: Attributes[] = []
  private observateur: ResizeObserver
  private surRedimension: () => void = () => {}
  private verifie = false

  constructor(
    readonly conteneur: HTMLElement,
    readonly h: Hierarchie,
    options: OptionsRendu,
  ) {
    const g = (this.graphe = new Graph({ type: 'directed', multi: false, allowSelfLoops: false }))
    for (let u = 0; u < h.nU; u++) {
      g.addNode(h.cles[u]!, { x: 0, y: 0, u, label: h.nom(u) })
      this.attributs.push(g.getNodeAttributes(h.cles[u]!))
    }
    this.mesurer()

    const bordure = createNodeBorderProgram({
      borders: [
        { size: { attribute: 'tailleBordure', defaultValue: 0.15, mode: 'relative' }, color: { attribute: 'couleurBordure' } },
        { size: { fill: true }, color: { attribute: 'color' } },
      ],
      drawLabel: options.dessinerLibelle,
      drawHover: options.dessinerSurvol,
    })

    this.sigma = new Sigma(g, conteneur, {
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
      labelGridCellSize: 140,
      defaultNodeType: 'bordure',
      defaultEdgeType: 'line',
      nodeProgramClasses: { bordure, ...(options.programmesNoeud ?? {}) },
      edgeProgramClasses: options.programmesArete ?? {},
      defaultDrawNodeLabel: options.dessinerLibelle,
      defaultDrawNodeHover: options.dessinerSurvol,
      nodeReducer: options.nodeReducer,
      edgeReducer: options.edgeReducer,
      ...(options.reglagesSigma ?? {}),
    })
    // Bbox fixe : sigma ne recadre plus le graphe à chaque image.
    this.sigma.setCustomBBox({ x: [-1, 1], y: [-1, 1] })

    const style = { pointerEvents: 'none' } as Partial<CSSStyleDeclaration>
    this.calqueDessous = this.sigma.createCanvas('atlasDessous', { beforeLayer: 'edges', style })
    this.calqueDessus = this.sigma.createCanvas('atlasDessus', { afterLayer: 'hoverNodes', style })
    this.ctxDessous = this.calqueDessous.getContext('2d')!
    this.ctxDessus = this.calqueDessus.getContext('2d')!
    this.dimensionnerCalques()

    this.observateur = new ResizeObserver(() => {
      this.mesurer()
      this.dimensionnerCalques()
      this.surRedimension()
    })
    this.observateur.observe(conteneur)
  }

  quandRedimensionne(f: () => void): void {
    this.surRedimension = f
  }

  private mesurer(): void {
    this.largeur = Math.max(1, this.conteneur.offsetWidth)
    this.hauteur = Math.max(1, this.conteneur.offsetHeight)
    this.ratioPixel = window.devicePixelRatio || 1
  }

  private dimensionnerCalques(): void {
    if (!this.calqueDessous) return
    for (const c of [this.calqueDessous, this.calqueDessus]) {
      c.width = Math.round(this.largeur * this.ratioPixel)
      c.height = Math.round(this.hauteur * this.ratioPixel)
      c.style.width = `${this.largeur}px`
      c.style.height = `${this.hauteur}px`
    }
  }

  /** Écrit les positions écran (converties en coordonnées graphe) dans les attributs. */
  positionner(p: Projection): void {
    const W2 = this.largeur / 2, H2 = this.hauteur / 2
    const k = 2 / Math.min(this.largeur, this.hauteur)
    const a = this.attributs
    for (let u = 0; u < a.length; u++) {
      const at = a[u]!
      at.x = (p.x[u]! - W2) * k
      at.y = -(p.y[u]! - H2) * k
    }
  }

  /** Arêtes devenues vides mais encore présentes dans le graphe sigma (masquées). */
  aretesMortes = 0

  /**
   * Synchronise les arêtes sigma avec les paires ajoutées / retirées.
   * Piège sigma : chaque `dropEdge` déclenche une réindexation complète (tous les réducteurs).
   * On ne retire donc rien pendant une animation : les paires vides restent masquées
   * (poids 0) et `purgerAretes` fait le ménage en une fois quand tout s'arrête.
   */
  synchroniserAretes(ajoutees: Paire[], retirees: Paire[]): void {
    const g = this.graphe
    this.aretesMortes += retirees.length
    for (const p of ajoutees) {
      if (g.hasEdge(p.cleSigma)) {
        // Paire réapparue : on rebranche l'objet sans événement.
        g.getEdgeAttributes(p.cleSigma).p = p
        this.aretesMortes--
        continue
      }
      this.indexAJour = false
      g.addDirectedEdgeWithKey(p.cleSigma, this.h.cles[p.source]!, this.h.cles[p.cible]!, { p })
    }
  }

  /** Retire d'un coup les arêtes mortes (une seule réindexation). */
  purgerAretes(paires: Iterable<Paire>): void {
    if (this.aretesMortes <= 0) return
    const g = this.graphe
    g.clearEdges()
    for (const p of paires) g.addDirectedEdgeWithKey(p.cleSigma, this.h.cles[p.source]!, this.h.cles[p.cible]!, { p })
    this.aretesMortes = 0
    this.indexAJour = false
  }

  private clesNoeuds: string[] = []
  private clesAretes: string[] = []
  private indexAJour = false

  /**
   * Recalcule les données d'affichage (réducteurs) et dessine.
   * `complet` : passe complète de sigma (grille de libellés, tri zIndex, réindexation).
   * Sinon, chemin rapide : réducteurs + tampons WebGL seulement (ordre et libellés de l'image
   * précédente). Le chemin rapide exige qu'aucune arête n'ait été ajoutée depuis la dernière
   * passe complète : c'est géré ici.
   */
  rafraichir(complet = true): void {
    if (complet || !this.indexAJour) {
      this.sigma.refresh()
      this.clesNoeuds = this.graphe.nodes()
      this.clesAretes = this.graphe.edges()
      this.indexAJour = true
    } else {
      this.sigma.refresh({ partialGraph: { nodes: this.clesNoeuds, edges: this.clesAretes }, skipIndexation: true })
    }
    if (!this.verifie) this.verifierCorrespondance()
  }

  /** Vérifie une fois que la formule écran ↔ graphe correspond bien à sigma. */
  private verifierCorrespondance(): void {
    // Conteneur pas encore dimensionné (onglet masqué…) : on vérifiera plus tard.
    if (this.largeur < 10 || this.hauteur < 10) return
    this.verifie = true
    const v = this.sigma.graphToViewport({ x: 0.5, y: 0.5 })
    const S = Math.min(this.largeur, this.hauteur)
    const ex = this.largeur / 2 + S / 4, ey = this.hauteur / 2 - S / 4
    if (Math.abs(v.x - ex) > 1 || Math.abs(v.y - ey) > 1) {
      console.warn('[atlas] correspondance écran ↔ sigma inattendue', v, { ex, ey })
    }
  }

  /** Efface les calques et applique l'échelle du ratio de pixels. */
  preparerCalques(): void {
    for (const ctx of [this.ctxDessous, this.ctxDessus]) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
      ctx.setTransform(this.ratioPixel, 0, 0, this.ratioPixel, 0, 0)
    }
  }

  detruire(): void {
    this.observateur.disconnect()
    this.sigma.kill()
  }
}
