import { bundle } from '@remotion/bundler'
import { renderStill, selectComposition } from '@remotion/renderer'
import path from 'path'
import fs from 'fs'
const temps = process.argv.slice(2).map(Number)
const serve = await bundle({ entryPoint: path.resolve('src/index.ts') })
const PROPS = { media: 'http://localhost:9123' }
const comp = await selectComposition({ serveUrl: serve, id: 'Atlas', inputProps: PROPS })
fs.mkdirSync('stills', { recursive: true })
for (const t of temps) {
  const f = Math.round(t * 60)
  await renderStill({ composition: comp, serveUrl: serve, frame: f, inputProps: PROPS, output: `stills/t${t.toFixed(2)}.jpg`, imageFormat: 'jpeg', jpegQuality: 85, scale: 0.5 })
  console.log('ok', t)
}
