import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { STATUTS } from '@/lib/statuts'
import type { Noeud, Statut } from '@/lib/types'
import { cn } from '@/lib/utils'

export const LARGEUR_CARTE = 240
export const HAUTEUR_CARTE = 76

export type NoeudCarteData = {
  noeud: Noeud
  statut: Statut
  recent: boolean
}
export type NoeudCarteNode = Node<NoeudCarteData, 'noeud'>

function NoeudCarteImpl({ data, selected }: NodeProps<NoeudCarteNode>) {
  const { noeud, statut, recent } = data
  const s = STATUTS[statut]
  return (
    <div
      style={{ width: LARGEUR_CARTE, height: HAUTEUR_CARTE }}
      className={cn(
        'flex flex-col justify-between rounded-lg border-2 px-3 py-2 shadow-sm transition-all duration-500',
        s.carte,
        selected && 'ring-2 ring-foreground ring-offset-2',
        recent && !selected && 'shadow-lg ring-4 ring-violet-400/70',
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />
      <div className="line-clamp-2 text-sm font-medium leading-tight text-foreground">{noeud.nom}</div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate font-mono">{noeud.id}</span>
        <span className="flex shrink-0 items-center gap-1">
          {noeud.admis ? (
            'admis'
          ) : (
            <>
              {noeud.demonstrations.length} dém.
            </>
          )}
          <span className={cn('size-2 rounded-full', s.pastille)} title={s.label} />
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
    </div>
  )
}

export const NoeudCarte = memo(NoeudCarteImpl)
