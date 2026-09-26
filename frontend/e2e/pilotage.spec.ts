// Bout en bout du pilotage : un lot envoyé à window.atlasAffichage produit l'écran attendu (capture),
// et rejouer les mêmes lots depuis le même état redonne exactement le même état.

import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const GRAPHE = readFileSync(new URL('./graphe.json', import.meta.url), 'utf-8')

async function ouvrir(page: Page) {
  await page.addInitScript(() => localStorage.clear())
  // L'API peut être sur une autre origine (VITE_API_URL de .env.local) : réponses avec en-tête CORS.
  const repondre = (body: string) => ({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body })
  await page.route('**/api/graphe', (r) => r.fulfill(repondre(GRAPHE)))
  await page.route('**/api/conversations', (r) => r.fulfill(repondre('[]')))
  await page.goto('/')
  await page.waitForFunction(() => {
    const a = (window as unknown as { atlasAffichage?: { etat(): { version_donnees: string } } }).atlasAffichage
    return !!a && a.etat().version_donnees !== ''
  })
}

/** Exécute des commandes et attend la fin des animations ; renvoie le compte rendu. */
async function commander(page: Page, commandes: unknown[]) {
  return page.evaluate(async (commandes) => {
    const w = window as unknown as {
      atlasAffichage: { executer(l: unknown): Promise<{ ok: boolean; etat: unknown }>; lot(c: unknown[], o?: object): unknown }
      atlasVue: { moteur: { avancer(ms: number): void } }
    }
    const cr = await w.atlasAffichage.executer(w.atlasAffichage.lot(commandes, { origine: 'test' }))
    w.atlasVue.moteur.avancer(2000)
    await new Promise((r) => setTimeout(r, 500))
    return cr
  }, commandes)
}

const LOT = [
  { op: 'selectionner', cible: { noeud: 'lemme_somme' } },
  { op: 'fiche', cible: { noeud: 'lemme_somme' } },
  { op: 'surligner', cibles: [{ noeud: 'prop_pair' }] },
  { op: 'filtres', patch: { statuts: ['etabli', 'a_verifier', 'suspendu'], mode: 'estomper' } },
  { op: 'cadrer', cibles: 'tout' },
]

test('un lot de commandes pilote l’écran', async ({ page }) => {
  await ouvrir(page)
  const cr = (await commander(page, LOT)) as { ok: boolean; etat: Record<string, unknown> }
  expect(cr.ok).toBe(true)
  expect(cr.etat).toMatchObject({
    selection: { noeud: 'lemme_somme' }, fiche: { noeud: 'lemme_somme' }, surlignes: ['prop_pair'],
    filtres: { statuts: ['etabli', 'a_verifier', 'suspendu'], mode: 'estomper' },
  })
  await expect(page.locator('.detail h2')).toHaveText('Somme de deux doubles')
  await expect(page.locator('.panneau-graphe')).toHaveScreenshot('lot-selection.png')
})

test('un lot refusé ne change rien', async ({ page }) => {
  await ouvrir(page)
  const avant = await page.evaluate(() => (window as unknown as { atlasAffichage: { etat(): unknown } }).atlasAffichage.etat())
  const cr = (await commander(page, [{ op: 'theme', theme: 'sombre' }, { op: 'portee', cible: { noeud: 'inconnu' } }])) as {
    ok: boolean; etat: unknown; resultats: { ok: boolean; erreur?: { code: string } }[]
  }
  expect(cr.ok).toBe(false)
  expect(cr.resultats[1]?.erreur?.code).toBe('introuvable')
  // Hors visibles et survol (positions à l'écran, qui dépendent de l'animation en cours).
  const sansEcran = (e: unknown) => ({ ...(e as Record<string, unknown>), visibles: undefined, survol: undefined })
  expect(sansEcran(cr.etat)).toEqual(sansEcran(avant))
})

test('mêmes lots depuis le même état : même écran, et restaurer redonne l’état', async ({ page }) => {
  await ouvrir(page)
  const etat = () => page.evaluate(() => {
    const e = (window as unknown as { atlasAffichage: { etat(): Record<string, unknown> } }).atlasAffichage.etat()
    delete e.visibles
    delete e.survol
    return e
  })
  const initial = await etat()
  const suite = [...LOT, { op: 'mode', mode: '3d' }, { op: 'orbiter', d_azimut_deg: 25, d_elevation_deg: -10 }, { op: 'zoomer', facteur: 1.4 }, { op: 'panneau', ouvert: false }]
  await commander(page, suite)
  const premier = await etat()
  await commander(page, [{ op: 'restaurer', etat: { ...initial, visibles: [], survol: null } }])
  expect(await etat()).toEqual(initial)
  await commander(page, suite)
  expect(await etat()).toEqual(premier)
})
