// Filme le vrai graphe de raisonnement image par image : caméra interpolée (van Wijk), graphe en plein écran.
// node capture/sequence.mjs <plan.json>
import { chromium } from 'playwright'
import { interpolateZoom } from 'd3-interpolate'
import * as ease from 'd3-ease'
import fs from 'fs'
import path from 'path'

const plan = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const W = plan.largeur ?? 1920, H = plan.hauteur ?? 1080, FPS = plan.fps ?? 60, DPR = plan.dpr ?? 2
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR })
await ctx.addInitScript((p) => { localStorage.setItem('atlas.projet', p); localStorage.setItem('atlas.vue', 'raisonnement') }, plan.projet)
const pg = await ctx.newPage()
await pg.goto('http://localhost:5173/')
await pg.waitForFunction(() => window.atlasGraphe?.modele?.blocs?.size > 0, null, { timeout: 60000 })
await pg.addStyleTag({ content: `
  .panneau-sessions, .panneau-conversation, .droit-tete, .gr-legende, .gr-zoom, .poignee, [class*=poignee], .pastille-voix { display: none !important; }
  .panneau-droit { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; z-index: 50; background: #fff; }
  .vue-raisonnement, .graphe { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; }
  ${plan.css ?? ''}` })
await pg.waitForTimeout(2500)
await pg.evaluate(() => document.fonts.ready)

async function poser(cx, cy, z, etat = {}) {
  await pg.evaluate(({ cx, cy, z, etat }) => {
    const g = window.atlasGraphe
    g.fixerZoom(z)
    g.cam.x = g.largeur / 2 - cx * g.cam.z
    g.cam.y = g.hauteur / 2 - cy * g.cam.z
    g.selection = new Set(etat.selection ?? [])
    g.survol = etat.survol ?? null
    let n = 0
    do { g.dessinerMaintenant(); n++ } while (g.contenu.enAttente && n < 60)
  }, { cx, cy, z, etat })
}

for (const plan_ of plan.plans) {
  const dir = path.join('capture/seq', plan_.nom)
  fs.mkdirSync(dir, { recursive: true })
  const cles = plan_.cles
  const frames = []
  for (let i = 0; i < cles.length - 1; i++) {
    const a = cles[i], c = cles[i + 1]
    const n = Math.round((c.t - a.t) * FPS)
    const interp = interpolateZoom([a.cx, a.cy, W / a.z], [c.cx, c.cy, W / c.z])
    const e = ease[c.ease ?? 'easeCubicInOut']
    for (let k = 0; k < n; k++) {
      const [x, y, w] = interp(e(k / n))
      frames.push({ x, y, z: W / w, etat: c.etat ?? a.etat ?? {} })
    }
  }
  const der = cles[cles.length - 1]
  frames.push({ x: der.cx, y: der.cy, z: der.z, etat: der.etat ?? {} })
  // Prépare les contenus (KaTeX) sur tout le trajet avant de filmer.
  for (let k = 0; k < frames.length; k += 30) await poser(frames[k].x, frames[k].y, frames[k].z, frames[k].etat)
  await pg.waitForTimeout(800)
  const t0 = Date.now()
  for (let k = 0; k < frames.length; k++) {
    const f = frames[k]
    await poser(f.x, f.y, f.z, f.etat)
    if (k === 0) await pg.waitForTimeout(600)
    await pg.screenshot({ path: path.join(dir, `${String(k).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 93 })
  }
  console.log(plan_.nom, frames.length, 'images', ((Date.now() - t0) / 1000).toFixed(0) + 's')
}
await b.close()
