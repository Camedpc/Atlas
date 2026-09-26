import { describe, expect, it } from 'vitest'
import type { Graphe, Noeud } from '../api'
import { deduireType, depuisGrapheAtlas, versionDonnees } from './donneesAtlas'
import { construireJustification } from './raisonnement/donnees'
import { filtresVides } from '../pilotage/etat'
import { noeudPasse, normaliser } from '../pilotage/filtres'

const CONV = '3f2b8c1e-6a4d-4e2f-9b7a-1c2d3e4f5a6b'

function noeud(id: string, o: Partial<Noeud> = {}): Noeud {
  return {
    id, nom: id, enonce: `Énoncé de ${id}`, admis: false, parents: [], enfants: [], conversation_id: null,
    cree_le: '2026-09-20T10:00:00Z', modifie_le: '2026-09-20T10:00:00Z', statut: 'ouvert', demonstrations: [], ...o,
  }
}

const GRAPHE: Graphe = {
  noeuds: [
    noeud('def_pair', { admis: true, statut: 'etabli', enfants: ['lemme_somme'] }),
    noeud('borne', { admis: true, statut: 'etabli', enfants: ['lemme_somme'] }),
    noeud('lemme_somme', {
      statut: 'a_verifier', parents: ['def_pair', 'borne'], enfants: ['conclusion'], conversation_id: CONV,
      demonstrations: [{
        noeud_id: 'lemme_somme', nom_demonstration: 'directe', justifie_par: ['def_pair', 'borne'], demonstration: '…',
        validite: 'a_verifier', auteur: 'orchestrateur', cree_le: '2026-09-21T08:00:00Z', modifie_le: '2026-09-22T09:30:00Z',
      }],
    }),
    noeud('conclusion', {
      statut: 'suspendu', parents: ['lemme_somme'], cree_le: '2026-09-25T12:00:00Z', conversation_id: CONV,
      demonstrations: [{
        noeud_id: 'conclusion', nom_demonstration: 'd', justifie_par: ['lemme_somme'], demonstration: '…',
        validite: 'valide', auteur: 'orchestrateur', cree_le: '2026-09-25T12:00:00Z', modifie_le: '2026-09-25T12:00:00Z',
      }],
    }),
  ],
  aretes: [],
}

describe('adaptateur Atlas', () => {
  const jeu = depuisGrapheAtlas(GRAPHE)
  const parId = new Map(jeu.noeuds.map((n) => [n.id, n]))

  it('garde les cinq statuts Atlas et la conversation', () => {
    expect(jeu.noeuds.map((n) => n.statut)).toEqual(['etabli', 'etabli', 'a_verifier', 'suspendu'])
    expect(parId.get('lemme_somme')!.conversation).toBe(CONV)
  })

  it('déduit le type et le marque comme déduit', () => {
    expect(parId.get('def_pair')!.type).toBe('definition')
    expect(parId.get('borne')!.type).toBe('definition')
    expect(parId.get('lemme_somme')!.type).toBe('lemme')
    expect(parId.get('conclusion')!.type).toBe('resultat')
    expect(jeu.noeuds.every((n) => n.typeDeduit)).toBe(true)
    expect(deduireType(noeud('x', { enfants: ['y'] }))).toBe('assertion')
  })

  it('laisse validité et confiance sur la démonstration, confiance non renseignée', () => {
    const d = parId.get('conclusion')!.demonstrations[0]!
    expect(d.validite).toBe('valide')
    expect(d.confiance).toBeNull()
    expect(parId.get('conclusion')!.confiance).toBeNull()
  })

  it('reproduit toutes les arêtes comme prémisses principales', () => {
    const j = construireJustification(jeu)
    expect(j.aretes.length).toBe(3)
    expect(j.aretes.every((a) => a.role === 'principale')).toBe(true)
  })

  it('calcule une empreinte qui suit les modifications', () => {
    expect(versionDonnees(GRAPHE)).toBe('2026-09-25T12:00:00Z#4')
    const modifie = structuredClone(GRAPHE)
    modifie.noeuds[2]!.demonstrations[0]!.modifie_le = '2026-09-26T00:00:00Z'
    expect(versionDonnees(modifie)).not.toBe(versionDonnees(GRAPHE))
  })
})

describe('filtres', () => {
  const [pair, , lemme, conclusion] = depuisGrapheAtlas(GRAPHE).noeuds

  it('laisse tout passer sans filtre', () => {
    expect([pair, lemme, conclusion].every((n) => noeudPasse(n!, filtresVides()))).toBe(true)
  })

  it('filtre par conversation, statut et type', () => {
    expect(noeudPasse(lemme!, { ...filtresVides(), conversation: CONV })).toBe(true)
    expect(noeudPasse(pair!, { ...filtresVides(), conversation: CONV })).toBe(false)
    expect(noeudPasse(conclusion!, { ...filtresVides(), statuts: ['suspendu', 'invalide'] })).toBe(true)
    expect(noeudPasse(lemme!, { ...filtresVides(), statuts: ['suspendu'] })).toBe(false)
    expect(noeudPasse(lemme!, { ...filtresVides(), types: ['lemme'] })).toBe(true)
  })

  it('garde seulement une liste explicite de nœuds', () => {
    const f = { ...filtresVides(), noeuds: ['lemme_somme', 'conclusion'] }
    expect([pair, lemme, conclusion].map((n) => noeudPasse(n!, f))).toEqual([false, true, true])
    // Combinée aux autres critères : il faut passer les deux.
    expect(noeudPasse(conclusion!, { ...f, statuts: ['etabli'] })).toBe(false)
  })

  it('filtre par période, une date seule couvrant la journée', () => {
    const f = { ...filtresVides(), periode: { debut: '2026-09-25', fin: '2026-09-25' } }
    expect(noeudPasse(conclusion!, f)).toBe(true)
    expect(noeudPasse(pair!, f)).toBe(false)
  })

  it('cherche le texte sans accents ni casse', () => {
    expect(normaliser('  Énoncé   DE ')).toBe('enonce de')
    expect(noeudPasse(lemme!, { ...filtresVides(), texte: 'ENONCE de lemme' })).toBe(true)
    expect(noeudPasse(lemme!, { ...filtresVides(), texte: 'absent' })).toBe(false)
  })
})
