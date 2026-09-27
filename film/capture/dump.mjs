import { chromium } from 'playwright'
import fs from 'fs'
const [P, tag] = process.argv.slice(2)
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } })
await ctx.addInitScript((p) => { localStorage.setItem('atlas.projet', p); localStorage.setItem('atlas.vue','raisonnement') }, P)
const pg = await ctx.newPage()
await pg.goto('http://localhost:5173/')
await pg.waitForTimeout(6000)
const d = await pg.evaluate(() => {
  const g = window.atlasGraphe, m = g.modele
  const blocs = [...m.blocs.entries()].map(([id, b]) => ({ id, x: b.x, y: b.y, w: b.w, h: b.h, groupe: b.groupe, lib: b.libelle + " " + b.numero, fig: b.figure ? (b.figure.id ?? true) : null, val: b.validite, conf: b.confiance, nom: b.noeud?.nom }))
  const cadres = [...m.cadres.entries()].map(([id, c]) => ({ id, keys: Object.keys(c).join(','), r: c.rect ?? c.r ?? null, nom: c.nom ?? c.titre, x: c.x, y: c.y, w: c.w, h: c.h }))
  return { bornes: m.bornes, blocs, cadres, mkeys: Object.keys(m) }
})
fs.writeFileSync(`capture/${tag}-modele.json`, JSON.stringify(d, null, 1))
console.log(d.mkeys, d.blocs[0], d.cadres[0], d.blocs.length, d.cadres.length)
await b.close()
