// Numérotation de la vue : le même jeu que tests/test_navigation.py (atlas/navigation.py recopie ces règles pour
// que la voix et le navigateur parlent de « Lemme 7 » comme l'écran).

import { describe, expect, it } from 'vitest'
import type { FigureVue, GroupeVue, Noeud, PlacementVue, TypeNoeud } from './api'
import { construireModele, PREFIXE_FIGURE } from './graphe-modele'
import donnees from '../../tests/donnees/reperes.json'

interface NoeudJeu { id: string; nom: string; type: string | null; admis: boolean; parents: string[]; enfants: string[] }

const noeuds: Noeud[] = (donnees.graphe.noeuds as NoeudJeu[]).map((n) => ({
  ...n,
  type: n.type as TypeNoeud | null,
  projet_id: 'defaut',
  enonce: '',
  details: null,
  conversation_id: null,
  statut: 'ouvert',
  demonstrations: [],
}))
const groupes = (donnees.vue.groupes as Omit<GroupeVue, 'rectangle'>[]).map((g) => ({ ...g, rectangle: null }))

describe('numérotation de la vue', () => {
  const m = construireModele(
    { noeuds, aretes: [] },
    {
      groupes,
      placements: donnees.vue.placements as PlacementVue[],
      etiquettes: [],
      marques: [],
      figures: donnees.vue.figures as FigureVue[],
    },
  )

  it('donne les mêmes repères que atlas/navigation.py', () => {
    for (const [id, attendu] of Object.entries(donnees.attendu.noeuds)) {
      const b = m.blocs.get(id)!
      expect(`${b.libelle} ${b.numero}`, id).toBe(attendu)
    }
    for (const [id, attendu] of Object.entries(donnees.attendu.figures)) {
      const b = m.blocs.get(PREFIXE_FIGURE + id)!
      expect(`${b.libelle} ${b.numero}`, id).toBe(attendu)
    }
    for (const [id, attendu] of Object.entries(donnees.attendu.cadres)) expect(m.cadres.get(id)!.numero, id).toBe(attendu)
  })
})
