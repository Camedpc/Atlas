import type { JournalRow } from '@/lib/types'

const LIBELLES: Record<JournalRow['action'], string> = {
  creation_noeud: 'Création',
  modification_noeud: 'Modification',
  ajout_demonstration: 'Démonstration ajoutée',
  modification_demonstration: 'Démonstration modifiée',
  verdict: 'Verdict',
  import: 'Import',
}

const heure = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

function resumeVerdict(e: JournalRow): string | null {
  if (e.action !== 'verdict') return null
  const v = (e.apres as { validite?: string } | null)?.validite
  return v ? `→ ${v}` : null
}

export function ListeJournal({
  entrees,
  avecNoeud = false,
  onNoeud,
}: {
  entrees: JournalRow[]
  avecNoeud?: boolean
  onNoeud?: (id: string) => void
}) {
  if (entrees.length === 0) return <p className="text-sm text-muted-foreground">Aucune entrée.</p>
  return (
    <ol className="space-y-2">
      {entrees.map((e) => (
        <li key={e.id} className="rounded-md border px-2.5 py-1.5 text-xs">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium">
              {LIBELLES[e.action]} {resumeVerdict(e)}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{heure(e.cree_le)}</span>
          </div>
          <div className="text-muted-foreground">
            {avecNoeud && e.noeud_id && (
              <button
                type="button"
                className="mr-1 font-mono text-foreground underline-offset-2 hover:underline"
                onClick={() => onNoeud?.(e.noeud_id!)}
              >
                {e.noeud_id}
              </button>
            )}
            {e.nom_demonstration && <span className="mr-1">« {e.nom_demonstration} »</span>}
            <span>par {e.auteur}</span>
          </div>
          {e.raison && <p className="mt-1 whitespace-pre-wrap text-foreground/80">{e.raison}</p>}
        </li>
      ))}
    </ol>
  )
}
