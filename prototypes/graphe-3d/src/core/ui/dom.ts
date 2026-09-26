// Petits utilitaires DOM et de formatage partagés par l'interface.

type Enfant = Node | string | number | null | undefined | false

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | ((e: Event) => void) | undefined> = {},
  ...enfants: (Enfant | Enfant[])[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue
    if (typeof v === 'function') e.addEventListener(k.replace(/^on/, ''), v)
    else if (k === 'class') e.className = String(v)
    else if (k === 'style') e.setAttribute('style', String(v))
    else if (k in e && typeof v !== 'string') (e as unknown as Record<string, unknown>)[k] = v
    else e.setAttribute(k, v === true ? '' : String(v))
  }
  for (const c of enfants.flat()) {
    if (c === null || c === undefined || c === false) continue
    e.append(c instanceof Node ? c : String(c))
  }
  return e
}

const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtDateCourte = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const fmtNombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

export const formaterDate = (ms: number) => fmtDate.format(new Date(ms))
export const formaterDateCourte = (ms: number) => fmtDateCourte.format(new Date(ms))
export const formaterNombre = (n: number) => fmtNombre.format(n)
export const pourcent = (n: number) => `${Math.round(n * 100)} %`
