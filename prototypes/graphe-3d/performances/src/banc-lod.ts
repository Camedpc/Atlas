// Mesure du prototype `lod.ts` sur un grand jeu (Node, sans navigateur) :
//
//   node .cache/banc-lod.mjs [N=20000] [strategie=r36-tout]
//
// 1. Grand jeu → graphe de lecture → disposition en couches bon marché (rang = plus long chemin,
//    ordre = ordre d'apparition ; blocs 184 × 90 px, écarts 46 × 20 px comme R36), O(n + m).
// 2. Parcours de caméra de 360 images : vue d'ensemble → zoom exponentiel jusqu'à s = 1,2 → panoramique
//    à s = 0,8 → dézoom. À chaque image : requête sur la grille, niveau de détail, dessin en lots sur un
//    contexte compteur, pool HTML (contenu KaTeX réel, rendu à la demande et mis en cache).
// 3. Référence « naïve » : même image en parcourant toutes les unités (un tracé par bloc, comme
//    aujourd'hui dans les visions).

import { katex } from './environnement'
import { genererGrandJeu } from './generateur'
import { construireJustification, deriverLecture, type GrapheLecture } from './shim-raisonnement'
import '../../raisonnement/r36-latex-classique-a/squelette'
import { formulesAffichees } from '../../raisonnement/r36-latex-classique-a/formules'
import { dessinerPoints, dessinerTitres, fenetre, GrilleSpatiale, niveauDe, PoolHtml, SEUILS_DEFAUT, type Boites, type Camera2D, type Ctx2D } from './lod'

const N = Number(process.argv[2] ?? 20000)
const strat = process.argv[3] ?? 'r36-tout'
const W = 184, H = 90, EX = 46, EY = 20

function disposer(g: GrapheLecture): Boites {
  const n = g.unites.length
  const rang = new Int32Array(n)
  const degre = new Int32Array(n)
  for (const a of g.aretes) degre[a.cible]!++
  const file: number[] = []
  for (let u = 0; u < n; u++) if (!degre[u]) file.push(u)
  for (let t = 0; t < file.length; t++) {
    const u = file[t]!
    for (const e of g.sortantes[u]!) {
      const v = g.aretes[e]!.cible
      rang[v] = Math.max(rang[v]!, rang[u]! + 1)
      if (--degre[v]! === 0) file.push(v)
    }
  }
  const ligne = new Map<number, number>()
  const b: Boites = { n, x: new Float32Array(n), y: new Float32Array(n), dx: new Float32Array(n).fill(W / 2), dy: new Float32Array(n).fill(H / 2), couleur: new Uint8Array(n) }
  const types = new Map<string, number>()
  for (let u = 0; u < n; u++) {
    const r = rang[u]!
    const k = ligne.get(r) ?? 0
    ligne.set(r, k + 1)
    b.x[u] = r * (W + EX)
    b.y[u] = k * (H + EY)
    const t = g.justification.noeuds[g.unites[u]!.conclusion]!.type
    if (!types.has(t)) types.set(t, types.size)
    b.couleur[u] = types.get(t)!
  }
  return b
}

/** Contexte compteur léger (sans Proxy) : compte tracés et appels. */
function ctxCompteur() {
  const c = { chemins: 0, rect: 0, fill: 0, stroke: 0, fillText: 0 }
  const ctx: Ctx2D = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '',
    beginPath: () => void c.chemins++,
    rect: () => void c.rect++,
    fill: () => void c.fill++,
    stroke: () => void c.stroke++,
    fillText: () => void c.fillText++,
  }
  return { ctx, c }
}

const t0 = performance.now()
const jeu = genererGrandJeu(N)
const j = construireJustification(jeu)
const g = deriverLecture(j, strat)
const b = disposer(g)
const tDisposition = performance.now() - t0
const tg0 = performance.now()
const grille = new GrilleSpatiale(b, 512)
const tGrille = performance.now() - tg0

// Bornes de la figure.
let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
for (let i = 0; i < b.n; i++) {
  x0 = Math.min(x0, b.x[i]! - W / 2); x1 = Math.max(x1, b.x[i]! + W / 2)
  y0 = Math.min(y0, b.y[i]! - H / 2); y1 = Math.max(y1, b.y[i]! + H / 2)
}
const cam: Camera2D = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, s: 1, largeur: 1600, hauteur: 1000 }
const sTout = Math.min(cam.largeur / (x1 - x0), cam.hauteur / (y1 - y0))
// Point d'intérêt : l'unité la plus proche du quart haut gauche (zone dense).
const cible = { x: x0 + (x1 - x0) * 0.25, y: y0 + Math.min(4000, (y1 - y0) * 0.1) }

const palette = Array.from({ length: 16 }, (_, k) => `hsl(${k * 22},50%,45%)`)
const titres = g.unites.map((u) => j.noeuds[u.conclusion]!.nom)
const enonces = g.unites.map((u) => j.noeuds[u.conclusion]!.enonce)
const texDe = new Map<number, string>()
const tex = (i: number) => {
  let t = texDe.get(i)
  if (t === undefined) texDe.set(i, (t = formulesAffichees(enonces[i]!)))
  return t
}
const pool = new PoolHtml(
  () => ({ html: '', transform: '', visible: false }),
  (i) => {
    const t = tex(i)
    return t && katex ? katex.renderToString(`\\displaystyle ${t}`, { throwOnError: false, strict: false, output: 'html' }) : titres[i]!
  },
  (i) => tex(i) || `#${titres[i]}`,
)

const visibles = new Int32Array(b.n)
const images: { s: number; niveau: string; visibles: number; ms: number; traces: number; html: number; rendus: number }[] = []
const FRAMES = 360
for (let f = 0; f < FRAMES; f++) {
  if (f < 120) {
    const t = f / 119
    cam.s = sTout * Math.pow(1.2 / sTout, t)
    cam.cx = (x0 + x1) / 2 + (cible.x - (x0 + x1) / 2) * Math.min(1, t * 1.5)
    cam.cy = (y0 + y1) / 2 + (cible.y - (y0 + y1) / 2) * Math.min(1, t * 1.5)
  } else if (f < 240) {
    cam.s = 0.8
    cam.cx = cible.x + (f - 120) * 25
    cam.cy = cible.y + (f - 120) * 6
  } else {
    const t = (f - 240) / 119
    cam.s = 0.8 * Math.pow(sTout / 0.8, t)
  }
  const { ctx, c } = ctxCompteur()
  const rendusAvant = pool.compteur.rendus
  const d0 = performance.now()
  const [fx0, fy0, fx1, fy1] = fenetre(cam)
  const n = grille.requete(fx0, fy0, fx1, fy1, visibles)
  const niveau = niveauDe(cam.s)
  let traces = 0
  if (niveau === 'points') traces = dessinerPoints(ctx, b, visibles, n, cam, palette)
  else {
    traces = dessinerTitres(ctx, b, visibles, n, cam, titres, 'serif')
    if (niveau === 'contenu') pool.image(b, visibles, n, cam)
  }
  if (niveau !== 'contenu') pool.image(b, visibles, 0, cam)
  const dt = performance.now() - d0
  images.push({ s: +cam.s.toFixed(4), niveau, visibles: n, ms: +dt.toFixed(3), traces: c.fill + c.stroke + c.fillText, html: niveau === 'contenu' ? n : 0, rendus: pool.compteur.rendus - rendusAvant })
  void traces
}

// Référence naïve : toutes les unités, un chemin + un tracé par bloc (comme les visions actuelles).
const naif: number[] = []
for (let f = 0; f < 20; f++) {
  const { ctx } = ctxCompteur()
  const d0 = performance.now()
  for (let i = 0; i < b.n; i++) {
    const x = cam.largeur / 2 + (b.x[i]! - cam.cx) * cam.s, y = cam.hauteur / 2 + (b.y[i]! - cam.cy) * cam.s
    ctx.fillStyle = palette[b.couleur[i]!]!
    ctx.beginPath()
    ctx.rect(x - 2, y - 2, 4, 4)
    ctx.fill()
  }
  naif.push(performance.now() - d0)
}

const quantile = (l: number[], q: number) => {
  const t = [...l].sort((a, b) => a - b)
  return +t[Math.min(t.length - 1, Math.floor(q * t.length))]!.toFixed(3)
}
const parNiveau: Record<string, unknown> = {}
for (const niv of ['points', 'titres', 'contenu']) {
  const l = images.filter((i) => i.niveau === niv)
  if (!l.length) continue
  parNiveau[niv] = {
    images: l.length,
    visiblesMax: Math.max(...l.map((i) => i.visibles)),
    tracesMax: Math.max(...l.map((i) => i.traces)),
    msMediane: quantile(l.map((i) => i.ms), 0.5), msP95: quantile(l.map((i) => i.ms), 0.95), msMax: quantile(l.map((i) => i.ms), 1),
    rendusKatexMaxParImage: Math.max(...l.map((i) => i.rendus)),
  }
}
const sortie = {
  tache: 'lod', N, strategie: strat, unites: b.n,
  figurePx: { largeur: Math.round(x1 - x0), hauteur: Math.round(y1 - y0) },
  sTout: +sTout.toFixed(5), seuils: SEUILS_DEFAUT,
  dispositionMs: +tDisposition.toFixed(1), grilleMs: +tGrille.toFixed(1),
  parNiveau,
  pool: { elementsVivantsMax: pool.vivants, ...pool.compteur, chainesEnCache: pool.cache.size },
  naifMsParImage: quantile(naif, 0.5), naifTracesParImage: b.n,
  images: images.filter((_, k) => k % 10 === 0),
}
process.stdout.write(JSON.stringify(sortie) + '\n')
