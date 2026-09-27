// Cartes d'énoncés (blocs réels du graphe, rendus en haute définition) pour l'ouverture en 3D.
import { chromium } from 'playwright'
import fs from 'fs'

const LOTS = [
  ['67900866-5415-4cf4-9262-4cd1cd16e06c', ['prop_equation', 'prop_t0', 'prop_quadrature', 'prop_energie', 'prop_exacte', 'prop_croissance',
    'prop_serie', 'prop_borda', 'prop_separatrice', 'obs_concordance', 'hyp_contrainte', 'choix_modele_ideal', 'def_elliptique',
    'fait_agm', 'obs_convergence', 'prop_orbites', 'prop_rk4', 'obs_seuils']],
  ['cbe94d42-92e9-4a6b-a912-ac2254d101d3', ['prop_impact_vertical', 'prop_projectile', 'prop_quadratique_t', 'prop_deviation_est',
    'prop_orbite_circulaire', 'prop_estimateur_g', 'prop_lineaire', 'prop_champ_central', 'prop_tenseur_marees', 'prop_vitesse_radiale']],
]
fs.mkdirSync('capture/cartes', { recursive: true })
const Z = 2
const b = await chromium.launch()
const infos = []
for (const [projet, ids] of LOTS) {
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 })
  await ctx.addInitScript((p) => { localStorage.setItem('atlas.projet', p); localStorage.setItem('atlas.vue', 'raisonnement') }, projet)
  const pg = await ctx.newPage()
  await pg.goto('http://localhost:5173/')
  await pg.waitForFunction(() => window.atlasGraphe?.modele?.blocs?.size > 0, null, { timeout: 60000 })
  await pg.addStyleTag({ content: `
    .panneau-sessions, .panneau-conversation, .droit-tete, .gr-legende, .gr-zoom { display: none !important; }
    .panneau-droit { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; z-index: 50; background: #fff; }
    .vue-raisonnement, .graphe { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; }` })
  await pg.waitForTimeout(2500)
  for (const id of ids) {
    const r = await pg.evaluate(({ id, Z }) => {
      const g = window.atlasGraphe, bl = g.modele.blocs.get(id)
      if (!bl) return null
      g.fixerZoom(Z)
      g.cam.x = g.largeur / 2 - (bl.x + bl.w / 2) * Z
      g.cam.y = g.hauteur / 2 - (bl.y + bl.h / 2) * Z
      g.selection = new Set()
      let n = 0
      do { g.dessinerMaintenant(); n++ } while (g.contenu.enAttente && n < 80)
      return { x: g.cam.x + bl.x * Z, y: g.cam.y + bl.y * Z, w: bl.w * Z, h: bl.h * Z }
    }, { id, Z })
    if (!r) { console.log('absent', id); continue }
    await pg.waitForTimeout(400)
    await pg.evaluate(() => window.atlasGraphe.dessinerMaintenant())
    await pg.screenshot({ path: `capture/cartes/${id}.png`, clip: { x: r.x - 3, y: r.y - 3, width: r.w + 6, height: r.h + 6 } })
    infos.push({ id, w: r.w + 6, h: r.h + 6 })
  }
  await ctx.close()
}
fs.writeFileSync('capture/cartes/index.json', JSON.stringify(infos, null, 1))
console.log(infos.length, 'cartes')
await b.close()
