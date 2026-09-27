// Captures de l'interface réelle (DPR 2) pour le film.
import { chromium } from 'playwright'
import fs from 'fs'

const PEND = '67900866-5415-4cf4-9262-4cd1cd16e06c'
const CONV = '14029774-3a45-495a-b83d-4fb6e6d2c2c5'
const QUESTION = "Comment la période d'un pendule simple dépend-elle de l'amplitude ?"
const O = 'capture/ui'
fs.mkdirSync(`${O}/frappe`, { recursive: true })
const meta = {}

const b = await chromium.launch()
async function page(vue = 'raisonnement', projet = PEND) {
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 })
  await ctx.addInitScript(([p, v]) => { localStorage.setItem('atlas.projet', p); localStorage.setItem('atlas.vue', v) }, [projet, vue])
  const pg = await ctx.newPage()
  await pg.goto('http://localhost:5173/')
  await pg.waitForFunction(() => window.atlasGraphe?.modele?.blocs?.size > 0, null, { timeout: 60000 })
  await pg.waitForTimeout(2500)
  return pg
}
const boite = async (pg, sel) => (await pg.locator(sel).first().boundingBox())

// 1-2. Accueil de l'espace, puis la question tapée lettre à lettre.
{
  const pg = await page()
  await pg.mouse.move(1900, 700)
  await pg.screenshot({ path: `${O}/accueil.png` })
  const ta = pg.locator('.panneau-conversation textarea').first()
  meta.saisie = await ta.boundingBox()
  meta.envoyer = await boite(pg, '.panneau-conversation button[type=submit], .panneau-conversation .envoyer')
  meta.nouvelle = await boite(pg, 'text=Nouvelle recherche')
  await ta.click()
  for (let i = 0; i <= QUESTION.length; i++) {
    await ta.fill(QUESTION.slice(0, i))
    await pg.screenshot({ path: `${O}/frappe/${String(i).padStart(3, '0')}.jpg`, type: 'jpeg', quality: 94 })
  }
  meta.nbFrappe = QUESTION.length + 1
  await pg.context().close()
}

// 3. Session du pendule : agent graph, conversation, documents.
{
  const pg = await page('agents')
  await pg.click(`.sessions-liste a[data-id="${CONV}"]`)
  await pg.waitForTimeout(7000)
  await pg.mouse.move(1900, 1000)
  await pg.screenshot({ path: `${O}/session-agents.png` })
  // Conversation entière, déroulée (défilement lisse dans le montage).
  const dims = await pg.evaluate(() => {
    const els = [...document.querySelectorAll('.panneau-conversation *')].filter((e) => e.scrollHeight > e.clientHeight + 50 && getComputedStyle(e).overflowY !== 'visible')
    const e = els.sort((a, b) => b.scrollHeight - a.scrollHeight)[0]
    e.classList.add('film-defile')
    return { h: e.scrollHeight, ch: e.clientHeight, cls: e.className }
  })
  meta.defile = dims
  const el = pg.locator('.film-defile')
  const bb = await el.boundingBox()
  meta.defileBoite = bb
  // On capture le fil par fenêtres successives puis on recolle (le panneau garde sa hauteur).
  const pas = Math.floor(dims.ch)
  let k = 0
  for (let y = 0; y < dims.h; y += pas) {
    await pg.evaluate((y) => { document.querySelector('.film-defile').scrollTop = y }, y)
    await pg.waitForTimeout(250)
    const reel = await pg.evaluate(() => document.querySelector('.film-defile').scrollTop)
    await pg.screenshot({ path: `${O}/fil-${String(k).padStart(2, '0')}_${reel}.png`, clip: bb })
    k++
  }
  meta.filMorceaux = k
  await pg.evaluate(() => { const e = document.querySelector('.film-defile'); e.scrollTop = e.scrollHeight })
  await pg.click('.onglets [data-vue=raisonnement]')
  await pg.waitForTimeout(1500)
  await pg.screenshot({ path: `${O}/session-graphe.png` })
  // Fiche d'un résultat.
  await pg.evaluate(() => window.atlasGraphe.montrer('prop_exacte'))
  await pg.waitForTimeout(2500)
  await pg.evaluate(() => { for (let i = 0; i < 40; i++) window.atlasGraphe.dessinerMaintenant() })
  await pg.waitForTimeout(500)
  await pg.screenshot({ path: `${O}/session-fiche.png` })
  await pg.evaluate(() => window.atlasGraphe.montrer(null))
  // Figure ouverte en grand.
  await pg.evaluate(() => window.atlasGraphe.ouvrirFigure('periode_amplitude'))
  await pg.waitForTimeout(3000)
  await pg.screenshot({ path: `${O}/session-figure.png` })
  await pg.keyboard.press('Escape')
  await pg.context().close()
}

// 4. Appel vocal : conversation « Essai Atlas voix » et pastille au repos.
{
  const pg = await page('agents', 'f4703f1e-b47a-42c8-baf3-801a9ab68ccf')
  await pg.click('.sessions-liste a[data-id="a6ed2030-dcb9-4c0f-8416-bd82971a9713"]')
  await pg.waitForTimeout(6000)
  await pg.screenshot({ path: `${O}/voix-session.png` })
  meta.micro = await boite(pg, '.panneau-conversation [class*=micro], .panneau-conversation button[aria-label*="ppel"]')
  await pg.context().close()
}
fs.writeFileSync(`${O}/meta.json`, JSON.stringify(meta, null, 1))
console.log(JSON.stringify(meta))
await b.close()
