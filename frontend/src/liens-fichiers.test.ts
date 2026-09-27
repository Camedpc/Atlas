import { describe, expect, it } from 'vitest'
import { cheminProjet, ressembleAUnChemin } from './liens-fichiers'

describe('liens vers les fichiers du projet', () => {
  it('ramène chaque forme de chemin au dossier du projet', () => {
    expect(cheminProjet('docs_session/directeurs/02-coherence/rapport.md', 'c1')).toBe('sessions/c1/docs_session/directeurs/02-coherence/rapport.md')
    expect(cheminProjet('../../doc_projet/sources/a.pdf', 'c1')).toBe('doc_projet/sources/a.pdf')
    expect(cheminProjet('scripts_projet/chute/simulation.py', null)).toBe('scripts_projet/chute/simulation.py')
    expect(cheminProjet('../c2/docs_session/r.md', 'c1')).toBe('sessions/c2/docs_session/r.md')
    expect(cheminProjet('/donnees/espace/utilisateurs/camille/test-1-solal/sessions/2de9/docs_session/rapport.md', 'c1'))
      .toBe('sessions/2de9/docs_session/rapport.md')
    expect(cheminProjet('doc_projet/chute/01-mission/rapport%20final.md#conclusions', 'c1')).toBe('doc_projet/chute/01-mission/rapport final.md')
  })

  it('laisse passer les vrais liens et refuse ce qui sort du projet', () => {
    expect(cheminProjet('https://arxiv.org/abs/1234', 'c1')).toBeNull()
    expect(cheminProjet('#section', 'c1')).toBeNull()
    expect(cheminProjet('/etc/passwd', 'c1')).toBeNull()
    expect(cheminProjet('../../../x', 'c1')).toBeNull()
    expect(cheminProjet('docs_session/.tmp/x', 'c1')).toBeNull()
    expect(cheminProjet('rapport.md', null)).toBeNull()
    expect(cheminProjet('../../doc_projet/sources/a.pdf', null)).toBe('doc_projet/sources/a.pdf')
  })

  it('reconnaît un chemin écrit en code', () => {
    expect(ressembleAUnChemin('scripts_projet/chute/simulation.py')).toBe(true)
    expect(ressembleAUnChemin('../../doc_projet/sources/')).toBe(true)
    expect(ressembleAUnChemin('np.exp(-k * t)')).toBe(false)
  })
})
