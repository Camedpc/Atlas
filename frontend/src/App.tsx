import { useMemo, useState } from 'react'
import { BarreActions } from '@/components/BarreActions'
import { Graphe } from '@/components/Graphe'
import { ListeJournal } from '@/components/Journal'
import { PanneauNoeud } from '@/components/PanneauNoeud'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Toaster } from '@/components/ui/sonner'
import { useJournal } from '@/hooks/useJournal'
import { useNoeudsDB } from '@/hooks/useNoeudsDB'
import { STATUTS } from '@/lib/statuts'
import type { Statut } from '@/lib/types'
import { cn } from '@/lib/utils'
import { calculerStatuts } from '@/lib/validite'

function Legende({ comptes }: { comptes: Map<Statut, number> }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      {(Object.keys(STATUTS) as Statut[]).map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className={cn('size-2.5 rounded-full', STATUTS[s].pastille)} />
          {STATUTS[s].label}
          <span className="tabular-nums">({comptes.get(s) ?? 0})</span>
        </span>
      ))}
    </div>
  )
}

function Activite({ onSelection }: { onSelection: (id: string) => void }) {
  const entrees = useJournal(null, 40)
  return (
    <div className="p-4">
      <h2 className="mb-3 text-sm font-semibold">Activité récente</h2>
      <ListeJournal entrees={entrees} avecNoeud onNoeud={onSelection} />
    </div>
  )
}

export default function App() {
  const { noeuds, charge, erreur, recents } = useNoeudsDB()
  const [selection, setSelection] = useState<string | null>(null)

  const statuts = useMemo(() => calculerStatuts(noeuds), [noeuds])
  const noms = useMemo(() => new Map(noeuds.map((n) => [n.id, n.nom])), [noeuds])
  const comptes = useMemo(() => {
    const c = new Map<Statut, number>()
    for (const s of statuts.values()) c.set(s, (c.get(s) ?? 0) + 1)
    return c
  }, [statuts])
  const noeudSelectionne = noeuds.find((n) => n.id === selection) ?? null

  return (
    <div className="flex h-dvh flex-col">
      <header className="space-y-2 border-b px-4 py-3">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-lg font-semibold">Atlas</h1>
          <Legende comptes={comptes} />
        </div>
        <BarreActions />
      </header>

      <main className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {erreur && (
            <div className="absolute inset-x-0 top-0 z-10 bg-red-600 px-4 py-1 text-sm text-white">{erreur}</div>
          )}
          {!charge && !erreur && (
            <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Chargement…</div>
          )}
          {charge && noeuds.length === 0 && (
            <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
              Graphe vide — lance le chercheur avec un objectif.
            </div>
          )}
          <Graphe
            noeuds={noeuds}
            statuts={statuts}
            recents={recents}
            selection={selection}
            onSelection={setSelection}
          />
        </div>

        <aside className="w-80 shrink-0 border-l xl:w-[420px]">
          <ScrollArea className="h-full">
            {noeudSelectionne ? (
              <PanneauNoeud noeud={noeudSelectionne} statuts={statuts} noms={noms} onSelection={setSelection} />
            ) : (
              <Activite onSelection={setSelection} />
            )}
          </ScrollArea>
        </aside>
      </main>
      <Toaster richColors position="bottom-left" />
    </div>
  )
}
