import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { JournalRow } from '@/lib/types'

/**
 * Entrées du journal, les plus récentes d'abord, tenues à jour en Realtime.
 * Avec `noeudId`, seulement l'historique de ce nœud ; sinon l'activité globale.
 */
export function useJournal(noeudId: string | null, limite = 50) {
  const [entrees, setEntrees] = useState<JournalRow[]>([])

  useEffect(() => {
    let actif = true
    setEntrees([])

    const charger = async () => {
      let q = supabase.from('journal').select('*').order('id', { ascending: false }).limit(limite)
      if (noeudId) q = q.eq('noeud_id', noeudId)
      const { data } = await q
      if (!actif || !data) return
      setEntrees((courantes) => fusionner(courantes, data as JournalRow[], limite))
    }

    const canal = supabase
      .channel(`journal:${noeudId ?? '*'}:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'journal',
          ...(noeudId ? { filter: `noeud_id=eq.${noeudId}` } : {}),
        },
        (p) => setEntrees((courantes) => fusionner(courantes, [p.new as JournalRow], limite)),
      )
      .subscribe((statut) => {
        if (statut === 'SUBSCRIBED') void charger()
      })

    return () => {
      actif = false
      void supabase.removeChannel(canal)
    }
  }, [noeudId, limite])

  return entrees
}

function fusionner(a: JournalRow[], b: JournalRow[], limite: number): JournalRow[] {
  const parId = new Map(a.map((e) => [e.id, e]))
  for (const e of b) parId.set(e.id, e)
  return [...parId.values()].sort((x, y) => y.id - x.id).slice(0, limite)
}
