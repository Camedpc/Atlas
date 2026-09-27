// Démo navigateur du prototype `lod.ts` (non vérifiée ici : pas de navigateur sur la machine de mesure).
// Servie par le serveur Vite du prototype : http://localhost:5181/performances/points/?n=20000
// Molette = zoom, glisser = déplacer. Un seul canevas 2D + un pool d'éléments HTML (KaTeX du CDN).

import { genererGrandJeu } from '../src/generateur'
import { construireJustification, deriverLecture } from '../../src/raisonnement'
import '../../raisonnement/r36-latex-classique-a/squelette'
import { formulesAffichees } from '../../raisonnement/r36-latex-classique-a/formules'
import { dessinerPoints, dessinerTitres, fenetre, GrilleSpatiale, niveauDe, PoolHtml, type Boites, type Camera2D, type ElementPool } from '../src/lod'

const params = new URLSearchParams(location.search)
const N = Number(params.get('n') ?? 20000)
const W = 184, H = 90, EX = 46, EY = 20

const jeu = genererGrandJeu(N)
const j = construireJustification(jeu)
const g = deriverLecture(j, params.get('strategie') ?? 'r36-tout')
const n = g.unites.length
const b: Boites = { n, x: new Float32Array(n), y: new Float32Array(n), dx: new Float32Array(n).fill(W / 2), dy: new Float32Array(n).fill(H / 2), couleur: new Uint8Array(n) }
{
  const rang = new Int32Array(n), degre = new Int32Array(n)
  for (const a of g.aretes) degre[a.cible]!++
  const file: number[] = []
  for (let u = 0; u < n; u++) if (!degre[u]) file.push(u)
  for (let t = 0; t < file.length; t++) for (const e of g.sortantes[file[t]!]!) {
    const v = g.aretes[e]!.cible
    rang[v] = Math.max(rang[v]!, rang[file[t]!]! + 1)
    if (--degre[v]! === 0) file.push(v)
  }
  const ligne = new Map<number, number>(), types = new Map<string, number>()
  for (let u = 0; u < n; u++) {
    const k = ligne.get(rang[u]!) ?? 0
    ligne.set(rang[u]!, k + 1)
    b.x[u] = rang[u]! * (W + EX)
    b.y[u] = k * (H + EY)
    const t = j.noeuds[g.unites[u]!.conclusion]!.type
    if (!types.has(t)) types.set(t, types.size)
    b.couleur[u] = types.get(t)!
  }
}
const grille = new GrilleSpatiale(b, 512)
const titres = g.unites.map((u) => j.noeuds[u.conclusion]!.nom)
const enonces = g.unites.map((u) => j.noeuds[u.conclusion]!.enonce)
const palette = Array.from({ length: 16 }, (_, k) => `hsl(${k * 22},45%,48%)`)

const canvas = document.createElement('canvas')
const couche = document.createElement('div')
const info = document.createElement('div')
Object.assign(canvas.style, { position: 'fixed', inset: '0' })
Object.assign(couche.style, { position: 'fixed', inset: '0', overflow: 'hidden', pointerEvents: 'none' })
Object.assign(info.style, { position: 'fixed', left: '8px', bottom: '8px', font: '12px system-ui', background: '#fff', padding: '4px 8px', border: '1px solid #ccc' })
document.body.append(canvas, couche, info)
const ctx = canvas.getContext('2d')!

type El = ElementPool & { el: HTMLDivElement }
const katex = () => (window as unknown as { katex?: { renderToString: (t: string, o: object) => string } }).katex
const pool = new PoolHtml<El>(
  () => {
    const el = document.createElement('div')
    Object.assign(el.style, { position: 'absolute', left: '0', top: '0', width: `${W}px`, padding: '28px 8px 0', transformOrigin: '0 0', font: '13px serif', willChange: 'transform' })
    couche.append(el)
    return { el, html: '', transform: '', visible: false }
  },
  (i) => {
    const t = formulesAffichees(enonces[i]!)
    const k = katex()
    return t && k ? k.renderToString(`\\displaystyle ${t}`, { throwOnError: false, strict: false, output: 'html' }) : ''
  },
  (i) => formulesAffichees(enonces[i]!),
  (e, h) => {
    e.html = h
    e.el.innerHTML = h
  },
  (e, t, v) => {
    e.transform = t
    e.visible = v
    e.el.style.transform = t
    e.el.style.visibility = v ? 'visible' : 'hidden'
  },
)

const cam: Camera2D = { cx: 0, cy: 0, s: 0.05, largeur: innerWidth, hauteur: innerHeight }
{
  let x1 = 0, y1 = 0
  for (let i = 0; i < n; i++) {
    x1 = Math.max(x1, b.x[i]!)
    y1 = Math.max(y1, b.y[i]!)
  }
  cam.cx = x1 / 2
  cam.cy = y1 / 2
  cam.s = Math.min(innerWidth / (x1 + W), innerHeight / (y1 + H))
}
const visibles = new Int32Array(n)
let demande = 0
const durees: number[] = []
function image(): void {
  demande = 0
  const t0 = performance.now()
  const r = devicePixelRatio || 1
  cam.largeur = innerWidth
  cam.hauteur = innerHeight
  if (canvas.width !== Math.round(innerWidth * r)) {
    canvas.width = Math.round(innerWidth * r)
    canvas.height = Math.round(innerHeight * r)
    canvas.style.width = `${innerWidth}px`
    canvas.style.height = `${innerHeight}px`
  }
  ctx.setTransform(r, 0, 0, r, 0, 0)
  ctx.clearRect(0, 0, innerWidth, innerHeight)
  const [x0, y0, x1, y1] = fenetre(cam)
  const k = grille.requete(x0, y0, x1, y1, visibles)
  const niveau = niveauDe(cam.s)
  ctx.strokeStyle = '#333'
  ctx.fillStyle = '#111'
  ctx.lineWidth = 1
  if (niveau === 'points') dessinerPoints(ctx, b, visibles, k, cam, palette)
  else dessinerTitres(ctx, b, visibles, k, cam, titres, 'serif')
  pool.image(b, visibles, niveau === 'contenu' ? k : 0, cam)
  durees.push(performance.now() - t0)
  if (durees.length > 60) durees.shift()
  const moy = durees.reduce((s, d) => s + d, 0) / durees.length
  info.textContent = `${n} unités · niveau ${niveau} · s = ${cam.s.toFixed(3)} · ${k} visibles · pool ${pool.vivants} · image ${moy.toFixed(1)} ms (JS)`
}
const redessiner = () => (demande ||= requestAnimationFrame(image))
addEventListener('wheel', (e) => {
  e.preventDefault()
  const f = Math.exp(-e.deltaY * 0.0015)
  const mx = cam.cx + (e.clientX - innerWidth / 2) / cam.s, my = cam.cy + (e.clientY - innerHeight / 2) / cam.s
  cam.s = Math.min(3, Math.max(0.002, cam.s * f))
  cam.cx = mx - (e.clientX - innerWidth / 2) / cam.s
  cam.cy = my - (e.clientY - innerHeight / 2) / cam.s
  redessiner()
}, { passive: false })
let glisse: { x: number; y: number } | null = null
addEventListener('pointerdown', (e) => (glisse = { x: e.clientX, y: e.clientY }))
addEventListener('pointerup', () => (glisse = null))
addEventListener('pointermove', (e) => {
  if (!glisse) return
  cam.cx -= (e.clientX - glisse.x) / cam.s
  cam.cy -= (e.clientY - glisse.y) / cam.s
  glisse = { x: e.clientX, y: e.clientY }
  redessiner()
})
addEventListener('resize', redessiner)
redessiner()
