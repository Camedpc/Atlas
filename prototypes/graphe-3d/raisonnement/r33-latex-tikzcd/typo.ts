// R33 · Typographie : KaTeX et Latin Modern chargés depuis cdn.jsdelivr.net (aucun paquet npm).
// Tant que KaTeX n'est pas là, les formules s'affichent en source (italique) ; la vision recalcule la mise
// en page quand KaTeX et les polices sont prêts (les tailles mesurées changent).

interface Katex {
  renderToString(tex: string, options: Record<string, unknown>): string
}

const KATEX = 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist'

let chargement: Promise<boolean> | null = null

function katex(): Katex | undefined {
  return (window as unknown as { katex?: Katex }).katex
}

/** Charge KaTeX (script + feuille de style) une seule fois ; vrai si disponible. */
export function chargerKatex(): Promise<boolean> {
  if (katex()) return Promise.resolve(true)
  chargement ??= new Promise<boolean>((resolve) => {
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = `${KATEX}/katex.min.css`
    document.head.append(css)
    const s = document.createElement('script')
    s.src = `${KATEX}/katex.min.js`
    s.async = true
    s.onload = () => resolve(!!katex())
    s.onerror = () => resolve(false)
    document.head.append(s)
  })
  return chargement
}

/** Attend KaTeX et les polices (Latin Modern, polices KaTeX) ; ne rejette jamais. */
export async function typographiePrete(): Promise<boolean> {
  const ok = await chargerKatex()
  try {
    await Promise.all([
      document.fonts.load('16px "Latin Modern Roman"'),
      document.fonts.load('italic 16px "Latin Modern Roman"'),
      document.fonts.load('bold 16px "Latin Modern Roman"'),
      document.fonts.load('16px KaTeX_Main'),
      document.fonts.load('italic 16px KaTeX_Math'),
    ])
    await document.fonts.ready
  } catch {
    // Polices indisponibles : repli sur les polices serif du système.
  }
  return ok
}

/** Rend une formule dans l'élément ; faux (et source en italique) si KaTeX échoue ou manque. */
export function rendreTex(el: HTMLElement, tex: string, display = false): boolean {
  const k = katex()
  if (k) {
    try {
      el.innerHTML = k.renderToString(tex, { displayMode: display, throwOnError: true, strict: 'ignore', output: 'html' })
      return true
    } catch {
      // Formule mal formée : on retombe sur la source.
    }
  }
  el.textContent = tex
  el.classList.add('r33-source')
  return false
}

/** Formule valide pour KaTeX (sans l'afficher). */
export function texValide(tex: string): boolean {
  const k = katex()
  if (!k) return true
  try {
    k.renderToString(tex, { throwOnError: true, strict: 'ignore' })
    return true
  } catch {
    return false
  }
}
