// R3 · Textes : coupe des libellés, mesure (disposition) et polices (dessin), au même endroit pour
// que la place réservée par la disposition corresponde exactement à ce qui est dessiné.

export interface Polices {
  famille: string
  taille: number
}

export const police = {
  nom: (p: Polices, fort = true) => `${fort ? 600 : 500} ${fort ? p.taille : p.taille - 1}px ${p.famille}`,
  etiquette: (p: Polices) => `700 ${Math.max(8.5, p.taille - 3)}px ${p.famille}`,
  alternative: (p: Polices) => `${p.taille - 1}px ${p.famille}`,
  raison: (p: Polices) => `italic ${p.taille - 2}px ${p.famille}`,
  carte: (p: Polices, fort = false) => `${fort ? 500 : 400} ${p.taille - 1.5}px ${p.famille}`,
  titreCarte: (p: Polices, italique = false) => `${italique ? 'italic ' : ''}600 ${p.taille}px ${p.famille}`,
}

/** Hauteurs de ligne (px) associées. */
export const interligne = {
  nom: (p: Polices) => p.taille + 2.5,
  etiquette: (p: Polices) => Math.max(8.5, p.taille - 3) + 3,
  alternative: (p: Polices) => p.taille + 1.5,
  raison: (p: Polices) => p.taille,
}

let ctxMesure: CanvasRenderingContext2D | null = null
export function contexteMesure(): CanvasRenderingContext2D {
  if (!ctxMesure) ctxMesure = document.createElement('canvas').getContext('2d')!
  return ctxMesure
}

export function couperTexte(ctx: CanvasRenderingContext2D, t: string, max: number): string {
  if (ctx.measureText(t).width <= max) return t
  let a = 0, b = t.length
  while (a < b) {
    const m = (a + b + 1) >> 1
    if (ctx.measureText(t.slice(0, m).trimEnd() + '…').width <= max) a = m
    else b = m - 1
  }
  return a > 0 ? t.slice(0, a).trimEnd() + '…' : ''
}

/** Coupe un texte en au plus `maxLignes` lignes de largeur `max` (la dernière est tronquée). */
export function lignesTexte(ctx: CanvasRenderingContext2D, t: string, max: number, maxLignes: number): string[] {
  const mots = t.split(/\s+/).filter(Boolean)
  const res: string[] = []
  let courant = ''
  let k = 0
  while (k < mots.length) {
    const essai = courant ? `${courant} ${mots[k]}` : mots[k]!
    if (!courant || ctx.measureText(essai).width <= max) {
      courant = essai
      k++
      continue
    }
    if (res.length === maxLignes - 1) {
      // Dernière ligne autorisée : elle reçoit le reste, tronqué.
      courant = `${courant} ${mots.slice(k).join(' ')}`
      break
    }
    res.push(courant)
    courant = ''
  }
  if (courant) res.push(courant)
  return res.map((l, i) => (i === res.length - 1 ? couperTexte(ctx, l, max) : l))
}

export function largeurMax(ctx: CanvasRenderingContext2D, lignes: string[]): number {
  let m = 0
  for (const l of lignes) m = Math.max(m, ctx.measureText(l).width)
  return m
}
