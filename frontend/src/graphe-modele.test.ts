// Numérotation de la vue : le même jeu que tests/test_navigation.py (atlas/navigation.py recopie ces règles pour
// que la voix et le navigateur parlent de « Lemme 7 » comme l'écran).

import { describe, expect, it } from 'vitest'
import type { DocumentVue, FigureVue, GroupeVue, Noeud, PlacementVue, TypeNoeud } from './api'
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

describe('documents dans la vue', () => {
  const doc = (id: string, chemin: string, genre: 'fichier' | 'dossier', nature: string): DocumentVue => ({
    id, chemin, genre, titre: id, description: null, apercu: { nature: nature as DocumentVue['apercu']['nature'] }, present: true,
    modifie_le: '2026-09-28T00:00:00Z',
  })
  const m = construireModele(
    { noeuds, aretes: [] },
    {
      groupes,
      placements: [
        ...(donnees.vue.placements as PlacementVue[]),
        { noeud_id: 'doc:sim', groupe_id: null, colonne: 40, ligne: 0, largeur: 1, hauteur: 1, fixe: false },
        { noeud_id: 'doc:res', groupe_id: null, colonne: 41, ligne: 0, largeur: 1, hauteur: 1, fixe: false },
      ],
      etiquettes: [],
      marques: [],
      figures: donnees.vue.figures as FigureVue[],
      documents: [
        doc('sim', 'scripts_projet/p/simulation.py', 'fichier', 'script'),
        doc('res', 'scripts_projet/p/resultats', 'dossier', 'dossier'),
        doc('autre', 'scripts_projet/p/autre.py', 'fichier', 'script'),
      ],
      liens_documents: [{ de: 'doc:sim', vers: 'doc:res', relation: 'ecrit_dans' }],
    },
  )

  it('numérote par nature sans toucher aux nœuds', () => {
    // Ordre des cases, comme les figures : le non placé est rangé provisoirement en colonne 0, donc avant.
    expect(`${m.blocs.get('doc:autre')!.libelle} ${m.blocs.get('doc:autre')!.numero}`).toBe('Script 1')
    expect(m.blocs.get('doc:autre')!.place).toBe(false)
    expect(`${m.blocs.get('doc:sim')!.libelle} ${m.blocs.get('doc:sim')!.numero}`).toBe('Script 2')
    expect(`${m.blocs.get('doc:res')!.libelle} ${m.blocs.get('doc:res')!.numero}`).toBe('Dossier 1')
    for (const [id, attendu] of Object.entries(donnees.attendu.noeuds)) {
      const b = m.blocs.get(id)!
      expect(`${b.libelle} ${b.numero}`, id).toBe(attendu)
    }
  })

  it('route les liens de documents avec leur relation', () => {
    const l = m.liens.find((x) => x.de === 'doc:sim' && x.vers === 'doc:res')!
    expect(l.relation).toBe('ecrit_dans')
    expect(l.points.length).toBeGreaterThanOrEqual(4)
  })
})
