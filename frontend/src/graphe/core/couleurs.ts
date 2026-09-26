// Couleurs : conversion, rgba quantifié pour les calques canvas, rgbaGL (alpha prémultiplié) pour sigma.
// Extrait de prototypes/graphe-3d/src/core/apparence.ts (seules ces fonctions servent au moteur).

const cacheRgb = new Map<string, [number, number, number]>()
let ctxConversion: CanvasRenderingContext2D | null = null

/** Composantes RVB d'une couleur CSS quelconque (mise en cache). */
export function rgb(couleur: string): [number, number, number] {
  let r = cacheRgb.get(couleur)
  if (r) return r
  let hex = couleur.trim()
  if (!/^#[0-9a-f]{3,8}$/i.test(hex)) {
    ctxConversion ??= document.createElement('canvas').getContext('2d')
    if (ctxConversion) {
      ctxConversion.fillStyle = '#000000'
      ctxConversion.fillStyle = hex
      hex = String(ctxConversion.fillStyle)
    }
  }
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(hex)
  if (m) r = [Number(m[1]), Number(m[2]), Number(m[3])]
  else {
    let h = hex.replace('#', '')
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('')
    r = [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0]
  }
  cacheRgb.set(couleur, r)
  return r
}

/**
 * Couleur rgba avec alpha quantifié (1/60). Important : sigma met en cache chaque chaîne de
 * couleur rencontrée, sans limite ; quantifier évite une fuite mémoire quand l'opacité varie
 * continûment.
 */
export function rgba(couleur: string, alpha: number): string {
  const [r, g, b] = rgb(couleur)
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 60) / 60
  return `rgba(${r},${g},${b},${a})`
}

/**
 * Couleur pour sigma (WebGL) : alpha prémultiplié. Sigma mélange avec
 * blendFunc(ONE, ONE_MINUS_SRC_ALPHA) sans prémultiplier : une couleur rgba « normale »
 * translucide apparaît délavée (presque blanche sur fond clair). Toujours passer par ici
 * pour les couleurs de nœuds / arêtes translucides.
 */
export function rgbaGL(couleur: string, alpha: number): string {
  let serie = cacheGL.get(couleur)
  if (!serie) {
    const [r, g, b] = rgb(couleur)
    serie = Array.from({ length: 61 }, (_, i) => {
      const a = i / 60
      return `rgba(${Math.round(r * a)},${Math.round(g * a)},${Math.round(b * a)},${a})`
    })
    cacheGL.set(couleur, serie)
  }
  return serie[Math.round(Math.max(0, Math.min(1, alpha)) * 60)]!
}
const cacheGL = new Map<string, string[]>()

/** Mélange deux couleurs (t = 0 → a, 1 → b), résultat hexadécimal. */
export function melangerCouleurs(a: string, b: string, t: number): string {
  const ca = rgb(a), cb = rgb(b)
  const h = (i: number) => Math.round(ca[i]! + (cb[i]! - ca[i]!) * t).toString(16).padStart(2, '0')
  return `#${h(0)}${h(1)}${h(2)}`
}

