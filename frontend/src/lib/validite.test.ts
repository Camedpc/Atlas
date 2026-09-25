import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Noeud, Statut } from './types'
import { calculerStatuts } from './validite'

interface Cas {
  description: string
  noeuds: Noeud[]
  attendu: Record<string, Statut>
}

const cas: Cas[] = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../shared/fixtures/validite/cas.json'), 'utf8'),
)

describe('validité effective', () => {
  it.each(cas.map((c) => [c.description, c] as const))('%s', (_, c) => {
    expect(Object.fromEntries(calculerStatuts(c.noeuds))).toEqual(c.attendu)
  })
})
