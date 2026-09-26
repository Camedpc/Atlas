// Test de contrat : les mêmes exemples que `AtlasVoice/backend/tests/test_protocoles.py`.

import { describe, expect, it } from 'vitest'
import { VALIDATEURS } from './protocole'

const EXEMPLES = import.meta.glob('../../../protocoles/exemples/*/*/*.json', { eager: true, import: 'default' })

const cas = Object.entries(EXEMPLES).map(([chemin, message]) => {
  const [schema, groupe, fichier] = chemin.split('/').slice(-3)
  return { schema, groupe, fichier, message }
})

describe('protocoles', () => {
  it('trouve des exemples valides et invalides pour chaque schéma', () => {
    const schemas = Object.keys(VALIDATEURS).filter((s) => s !== 'p4-etat-resume')
    for (const s of schemas) {
      expect(cas.some((c) => c.schema === s && c.groupe === 'valides'), s).toBe(true)
      expect(cas.some((c) => c.schema === s && c.groupe === 'invalides'), s).toBe(true)
    }
    for (const c of cas) expect(schemas).toContain(c.schema)
  })

  it.each(cas)('$schema/$groupe/$fichier', ({ schema, groupe, message }) => {
    const valider = VALIDATEURS[schema as keyof typeof VALIDATEURS]
    expect(valider(message), JSON.stringify(valider.errors?.slice(0, 3))).toBe(groupe === 'valides')
  })

  it('valide le résumé d\'écran de P1 à part', () => {
    const tache = cas.find((c) => c.fichier === 'navigation_avec_ecran.json')?.message as { contexte: { affichage: unknown } }
    expect(VALIDATEURS['p4-etat-resume'](tache.contexte.affichage)).toBe(true)
  })
})
