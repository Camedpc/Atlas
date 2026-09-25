import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useJournal } from '@/hooks/useJournal'
import { STATUTS, VALIDITES, couleurDemo } from '@/lib/statuts'
import type { Noeud, Statut } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ListeJournal } from './Journal'
import { Markdown } from './Markdown'

interface Props {
  noeud: Noeud
  statuts: Map<string, Statut>
  noms: Map<string, string>
  onSelection: (id: string | null) => void
}

export function PastilleStatut({ statut }: { statut: Statut }) {
  const s = STATUTS[statut]
  return (
    <Badge variant="outline" className="gap-1.5">
      <span className={cn('size-2 rounded-full', s.pastille)} />
      {s.label}
    </Badge>
  )
}

export function PanneauNoeud({ noeud, statuts, noms, onSelection }: Props) {
  const journal = useJournal(noeud.id)
  const statut = statuts.get(noeud.id) ?? 'ouvert'

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight">{noeud.nom}</h2>
          <p className="truncate font-mono text-xs text-muted-foreground">{noeud.id}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => onSelection(null)} aria-label="Fermer">
          <X />
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <PastilleStatut statut={statut} />
        {noeud.admis && <Badge variant="secondary">Admis</Badge>}
      </div>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Énoncé</h3>
        <Markdown>{noeud.enonce}</Markdown>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Démonstrations ({noeud.demonstrations.length})
        </h3>
        {noeud.demonstrations.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {noeud.admis ? 'Résultat admis, pas de démonstration requise.' : 'Aucune démonstration pour l’instant.'}
          </p>
        )}
        {noeud.demonstrations.map((d, rang) => {
          const manquantes = d.justifie_par.filter((p) => statuts.get(p) !== 'etabli')
          return (
            <article
              key={d.nom_demonstration}
              className="rounded-lg border border-l-4 p-3"
              style={{ borderLeftColor: couleurDemo(rang) }}
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-medium">{d.nom_demonstration}</h4>
                <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', VALIDITES[d.validite].classe)}>
                  {VALIDITES[d.validite].label}
                </span>
              </div>

              {d.justifie_par.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {d.justifie_par.map((p) => {
                    const sp = statuts.get(p) ?? 'ouvert'
                    return (
                      <button
                        key={p}
                        type="button"
                        title={noms.get(p) ?? p}
                        onClick={() => onSelection(p)}
                        className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted"
                      >
                        <span className={cn('size-1.5 rounded-full', STATUTS[sp].pastille)} />
                        {p}
                      </button>
                    )
                  })}
                </div>
              )}

              {d.validite === 'valide' && manquantes.length > 0 && (
                <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                  Suspendue : prémisse(s) non établie(s) — {manquantes.join(', ')}
                </p>
              )}

              <Markdown>{d.demonstration || '_(vide)_'}</Markdown>
              <p className="mt-2 text-[11px] text-muted-foreground">Auteur : {d.auteur}</p>
            </article>
          )
        })}
      </section>

      <Separator />

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Historique</h3>
        <ListeJournal entrees={journal} />
      </section>
    </div>
  )
}
