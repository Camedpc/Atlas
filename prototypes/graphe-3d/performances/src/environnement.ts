// Environnement minimal pour exécuter les mises en page des visions dans Node.
//
// - `document.createElement('canvas').getContext('2d')` renvoie un contexte de mesure simulé :
//   largeur d'un texte = nombre de caractères × corps × 0,52 (moyenne d'un romain proportionnel ;
//   l'ordre de grandeur suffit, seules les coupures de lignes en dépendent).
// - `window.katex` pointe vers katex.min.js (0.16.11, téléchargé du CDN dans performances/.cache).
// - Un contexte « compteur » (`creerContexteCompteur`) enregistre chaque appel canvas d'une image.

import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

function corps(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font)
  return m ? Number(m[1]) : 13
}

export function creerContexteMesure(): unknown {
  const c = {
    font: '10px serif',
    fillStyle: '#000000',
    measureText(t: string) {
      return { width: [...t].length * corps(c.font) * 0.52, actualBoundingBoxAscent: corps(c.font) * 0.75, actualBoundingBoxDescent: corps(c.font) * 0.25 }
    },
  }
  return c
}

/** Contexte canvas qui compte les appels (par méthode) et les tracés (stroke / fill / fillText…). */
export function creerContexteCompteur(): { ctx: unknown; appels: Map<string, number>; remettre: () => void } {
  const appels = new Map<string, number>()
  const compter = (k: string) => appels.set(k, (appels.get(k) ?? 0) + 1)
  const mesure = creerContexteMesure() as { font: string; measureText: (t: string) => unknown }
  const cible: Record<string, unknown> = {
    canvas: { width: 1600, height: 1000 },
    measureText: (t: string) => {
      compter('measureText')
      mesure.font = String(cible.font ?? '10px serif')
      return mesure.measureText(t)
    },
    getLineDash: () => [],
    createLinearGradient: () => ({ addColorStop: () => undefined }),
  }
  const ctx = new Proxy(cible, {
    get(t, k: string) {
      if (k in t) return t[k]
      return (..._args: unknown[]) => {
        compter(k)
      }
    },
    set(t, k: string, v) {
      t[k] = v
      compter(`=${k}`)
      return true
    },
  })
  return { ctx, appels, remettre: () => appels.clear() }
}

const g = globalThis as Record<string, unknown>
g.document ??= {
  compatMode: 'CSS1Compat',
  createElement: () => ({ getContext: () => creerContexteMesure(), style: {} }),
  fonts: { load: async () => [] },
}

const ici = dirname(fileURLToPath(import.meta.url))
const cheminKatex = [join(ici, 'katex.min.cjs'), join(ici, '.cache', 'katex.min.cjs'), join(ici, '..', '.cache', 'katex.min.cjs')].find((p) => existsSync(p))
export const katex = cheminKatex ? (createRequire(import.meta.url)(cheminKatex) as { renderToString: (t: string, o?: object) => string; version: string }) : null
g.window ??= { katex, devicePixelRatio: 1 }
