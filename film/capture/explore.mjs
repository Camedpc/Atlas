import { chromium } from 'playwright'
const P = process.argv[2]
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
await ctx.addInitScript((p) => { localStorage.setItem('atlas.projet', p) }, P)
const pg = await ctx.newPage()
await pg.goto('http://localhost:5173/')
await pg.waitForTimeout(6000)
await pg.screenshot({ path: `capture/explore/${P.slice(0,4)}-raison.png` })
for (const v of ['agents', 'documents']) {
  await pg.click(`.onglets [data-vue=${v}]`); await pg.waitForTimeout(2500)
  await pg.screenshot({ path: `capture/explore/${P.slice(0,4)}-${v}.png` })
}
await b.close()
