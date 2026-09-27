// Markdown + LaTeX ($…$, $$…$$, \(…\) et \[…\]) vers HTML assaini.
import DOMPurify from 'dompurify'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { marked } from 'marked'
import { colorer } from './coloration'

marked.use({
  renderer: {
    code({ text, lang }) {
      const langage = (lang ?? '').trim().split(/\s+/)[0]?.toLowerCase() || null
      return `<pre><code class="hl${langage ? ` language-${langage}` : ''}">${colorer(text, langage)}</code></pre>\n`
    },
  },
})

/** Relation d'une formule en ligne (=, \le…) : candidate à l'affichage centré si elle est longue. */
const RELATION_TEX = /[=<>]|\\(?:leq?|geq?|neq|approx|sim|simeq|equiv|propto|to|in|Rightarrow|iff|ll|gg)(?![A-Za-z])/
/** Longueur (source LaTeX) à partir de laquelle une relation en ligne passe en formule centrée (mode aéré). */
const LONGUEUR_CENTREE = 28

/**
 * Markdown + LaTeX en HTML. `aere` (fiche d'un nœud) compose comme un article : une phrase par paragraphe, et les
 * longues relations en ligne passent en formules centrées, avec leur ponctuation.
 */
export function rendre(texte: string, aere = false): string {
  // Les formules sont rendues à part : marked abîmerait leurs `_` et `*`.
  const formules: string[] = []
  // $$…$$ et \[…\] en bloc, $…$ et \(…\) en ligne ; la ponctuation qui suit rejoint une formule centrée.
  const motif = /(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\))(\s?[.,;:](?!\d))?/g
  let protege = texte.replace(motif, (_, bloc?: string, bloc2?: string, enLigne?: string, enLigne2?: string, ponct?: string) => {
    const enLigneSource = (enLigne ?? enLigne2)?.trim()
    const centree = aere && enLigneSource !== undefined && enLigneSource.length >= LONGUEUR_CENTREE && RELATION_TEX.test(enLigneSource)
    const display = bloc !== undefined || bloc2 !== undefined || centree
    let source = (bloc ?? bloc2 ?? enLigneSource ?? '').trim()
    // Formule centrée : sa ponctuation passe dedans (« …\le g. »), comme dans un article.
    let suite = ponct ?? ''
    if (display && aere && suite) {
      source += `\\,${suite.trim()}`
      suite = ''
    }
    formules.push(katex.renderToString(source, { displayMode: display, throwOnError: false }))
    // Une formule centrée est un bloc à part : le texte qui suit repart à la ligne.
    return `@@FORMULE${formules.length - 1}@@${suite}`
  })
  if (aere) protege = aerer(protege)
  const html = (marked.parse(protege, { async: false }) as string).replace(/@@FORMULE(\d+)@@/g, (_, i) => formules[Number(i)])
  return DOMPurify.sanitize(html)
}

/**
 * Une phrase par paragraphe : coupe après « . », « ! » ou « ? » suivi d'une majuscule ou d'une formule. Les lignes
 * de liste, de titre, de tableau, de citation et les blocs de code restent intacts.
 */
function aerer(texte: string): string {
  let code = false
  return texte.split('\n').map((ligne) => {
    if (/^\s*(```|~~~)/.test(ligne)) code = !code
    if (code || /^\s*([-*+>#|]|\d+[.)]\s|```|~~~)|^\s{4}/.test(ligne)) return ligne
    return ligne.replace(/(?<!\b[A-Za-z]|\d)([.!?])\s+(?=[A-ZÀ-ÖØ-Þ«(]|@@FORMULE)/g, '$1\n\n')
  }).join('\n')
}

export function echapper(texte: string): string {
  const div = document.createElement('div')
  div.textContent = texte
  return div.innerHTML
}
