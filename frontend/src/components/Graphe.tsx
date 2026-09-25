import dagre from '@dagrejs/dagre'
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useMemo } from 'react'
import { STATUTS, couleurDemo } from '@/lib/statuts'
import type { Noeud, Statut } from '@/lib/types'
import { HAUTEUR_CARTE, LARGEUR_CARTE, NoeudCarte, type NoeudCarteNode } from './NoeudCarte'

const typesNoeuds = { noeud: NoeudCarte }

interface Props {
  noeuds: Noeud[]
  statuts: Map<string, Statut>
  recents: Set<string>
  selection: string | null
  onSelection: (id: string | null) => void
}

/** Arêtes : de chaque prémisse vers le nœud qu'elle justifie, une couleur par démonstration. */
function construireAretes(noeuds: Noeud[]): Edge[] {
  const ids = new Set(noeuds.map((n) => n.id))
  const aretes: Edge[] = []
  for (const n of noeuds) {
    n.demonstrations.forEach((d, rang) => {
      const couleur = couleurDemo(rang)
      for (const p of d.justifie_par) {
        if (!ids.has(p)) continue
        aretes.push({
          id: `${p}->${n.id}#${d.nom_demonstration}`,
          source: p,
          target: n.id,
          animated: d.validite === 'a_verifier',
          style: {
            stroke: couleur,
            strokeWidth: 2,
            strokeDasharray: d.validite === 'invalide' ? '2 5' : undefined,
            opacity: d.validite === 'invalide' ? 0.4 : 1,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color: couleur },
          data: { demonstration: d.nom_demonstration },
        })
      }
    })
  }
  return aretes
}

/** Disposition dagre de haut (prémisses) en bas (conséquences). */
function disposer(noeuds: Noeud[], aretes: Edge[]): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 70 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const n of noeuds) g.setNode(n.id, { width: LARGEUR_CARTE, height: HAUTEUR_CARTE })
  for (const a of aretes) g.setEdge(a.source, a.target)
  dagre.layout(g)
  return new Map(
    noeuds.map((n) => {
      const { x, y } = g.node(n.id)
      return [n.id, { x: x - LARGEUR_CARTE / 2, y: y - HAUTEUR_CARTE / 2 }]
    }),
  )
}

function GrapheInterne({ noeuds, statuts, recents, selection, onSelection }: Props) {
  const aretes = useMemo(() => construireAretes(noeuds), [noeuds])

  // On ne recalcule la disposition que si la structure change (pas à chaque verdict).
  const cleStructure = useMemo(
    () => noeuds.map((n) => n.id).join('|') + '§' + aretes.map((a) => a.id).join('|'),
    [noeuds, aretes],
  )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const positions = useMemo(() => disposer(noeuds, aretes), [cleStructure])

  const nodes = useMemo<NoeudCarteNode[]>(
    () =>
      noeuds.map((n) => ({
        id: n.id,
        type: 'noeud',
        position: positions.get(n.id) ?? { x: 0, y: 0 },
        // Dimensions fixes : nœuds contrôlés sans onNodesChange, la minimap en a besoin.
        width: LARGEUR_CARTE,
        height: HAUTEUR_CARTE,
        selected: n.id === selection,
        data: { noeud: n, statut: statuts.get(n.id) ?? 'ouvert', recent: recents.has(n.id) },
      })),
    [noeuds, positions, selection, statuts, recents],
  )

  // Recadrage quand des nœuds apparaissent, une fois leurs dimensions mesurées.
  const { fitView } = useReactFlow()
  const mesures = useNodesInitialized()
  useEffect(() => {
    if (mesures) void fitView({ padding: 0.2, duration: 400 })
  }, [mesures, noeuds.length, fitView])

  return (
    <ReactFlow
      nodes={nodes}
      edges={aretes}
      nodeTypes={typesNoeuds}
      onNodeClick={(_, n) => onSelection(n.id)}
      onPaneClick={() => onSelection(null)}
      nodesDraggable={false}
      nodesConnectable={false}
      edgesFocusable={false}
      minZoom={0.1}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) => STATUTS[(n.data as NoeudCarteNode['data']).statut].trait}
      />
    </ReactFlow>
  )
}

export function Graphe(props: Props) {
  return (
    <ReactFlowProvider>
      <GrapheInterne {...props} />
    </ReactFlowProvider>
  )
}
