// Rendu d'une plage d'images du film (muet) : node render.mjs DEBUT FIN SORTIE
import { renderMedia, selectComposition } from '@remotion/renderer'
const [a, b, sortie] = process.argv.slice(2)
const serveUrl = process.env.BUILD
const inputProps = { muet: true }
const conc = Number(process.env.CONC || 6)
const comp = await selectComposition({ serveUrl, id: 'Atlas', inputProps, timeoutInMilliseconds: 180000 })
let dernier = 0
await renderMedia({
  composition: comp, serveUrl, codec: 'h264', crf: 14, pixelFormat: 'yuv420p', frameRange: [Number(a), Number(b)],
  outputLocation: sortie, muted: true, inputProps, concurrency: conc, jpegQuality: 95, timeoutInMilliseconds: 180000,
  chromiumOptions: { gl: 'swangle' },
  onProgress: ({ progress }) => {
    const t = Date.now()
    if (t - dernier > 5000) { dernier = t; console.log(`SSHX_PROGRESS ${progress.toFixed(3)} images`) }
  },
})
console.log('SSHX_PROGRESS 1 fini')
