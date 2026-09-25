import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { DemonstrationRow, Noeud, NoeudRow } from '@/lib/types'

const cleDemo = (d: Pick<DemonstrationRow, 'noeud_id' | 'nom_demonstration'>) =>
  `${d.noeud_id}::${d.nom_demonstration}`

/** Garde la version la plus récente d'une ligne (un chargement lent ne doit pas écraser un événement Realtime). */
function fusionner<T extends { modifie_le: string }>(
  etat: Record<string, T>,
  lignes: T[],
  cle: (l: T) => string,
): Record<string, T> {
  const suivant = { ...etat }
  for (const l of lignes) {
    const k = cle(l)
    const actuel = suivant[k]
    if (!actuel || actuel.modifie_le <= l.modifie_le) suivant[k] = l
  }
  return suivant
}

const DUREE_SURBRILLANCE_MS = 2500

/**
 * Chargement initial des nœuds et démonstrations, puis abonnement Realtime
 * (INSERT/UPDATE) fusionné dans le state. Recharge tout à chaque (ré)abonnement.
 */
export function useNoeudsDB() {
  const [noeudsRows, setNoeudsRows] = useState<Record<string, NoeudRow>>({})
  const [demosRows, setDemosRows] = useState<Record<string, DemonstrationRow>>({})
  const [charge, setCharge] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  // Nœuds modifiés à l'instant, pour les mettre en surbrillance.
  const [recents, setRecents] = useState<Set<string>>(new Set())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    let actif = true
    const timersCourants = timers.current

    const signaler = (id: string) => {
      setRecents((s) => new Set(s).add(id))
      clearTimeout(timersCourants.get(id))
      timersCourants.set(
        id,
        setTimeout(() => {
          setRecents((s) => {
            const n = new Set(s)
            n.delete(id)
            return n
          })
        }, DUREE_SURBRILLANCE_MS),
      )
    }

    const charger = async () => {
      const [n, d] = await Promise.all([
        supabase.from('noeuds').select('*'),
        supabase.from('demonstrations').select('*'),
      ])
      if (!actif) return
      if (n.error || d.error) {
        setErreur((n.error ?? d.error)!.message)
        return
      }
      setErreur(null)
      setNoeudsRows((s) => fusionner(s, n.data as NoeudRow[], (l) => l.id))
      setDemosRows((s) => fusionner(s, d.data as DemonstrationRow[], cleDemo))
      setCharge(true)
    }

    const canal = supabase
      .channel(`graphe:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'noeuds' }, (p) => {
        if (p.eventType === 'DELETE') return
        const l = p.new as NoeudRow
        setNoeudsRows((s) => fusionner(s, [l], (x) => x.id))
        signaler(l.id)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'demonstrations' }, (p) => {
        if (p.eventType === 'DELETE') return
        const l = p.new as DemonstrationRow
        setDemosRows((s) => fusionner(s, [l], cleDemo))
        signaler(l.noeud_id)
      })
      .subscribe((statut) => {
        if (statut === 'SUBSCRIBED') void charger()
        if (statut === 'CHANNEL_ERROR') setErreur('Connexion Realtime perdue')
      })

    return () => {
      actif = false
      void supabase.removeChannel(canal)
      timersCourants.forEach(clearTimeout)
      timersCourants.clear()
    }
  }, [])

  const noeuds = useMemo<Noeud[]>(() => {
    const parNoeud = new Map<string, DemonstrationRow[]>()
    for (const d of Object.values(demosRows)) {
      const liste = parNoeud.get(d.noeud_id) ?? []
      liste.push(d)
      parNoeud.set(d.noeud_id, liste)
    }
    return Object.values(noeudsRows)
      .sort((a, b) => a.cree_le.localeCompare(b.cree_le))
      .map((n) => ({
        id: n.id,
        nom: n.nom,
        enonce: n.enonce,
        admis: n.admis,
        demonstrations: (parNoeud.get(n.id) ?? [])
          .sort((a, b) => a.cree_le.localeCompare(b.cree_le))
          .map((d) => ({
            nom_demonstration: d.nom_demonstration,
            justifie_par: d.justifie_par,
            demonstration: d.demonstration,
            validite: d.validite,
            auteur: d.auteur,
          })),
      }))
  }, [noeudsRows, demosRows])

  return { noeuds, charge, erreur, recents }
}
