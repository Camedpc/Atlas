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

export function rendre(texte: string): string {
  // Les formules sont rendues à part : marked abîmerait leurs `_` et `*`.
  const formules: string[] = []
  // $$…$$ et \[…\] en bloc, $…$ et \(…\) en ligne.
  const motif = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)/g
  const protege = texte.replace(motif, (_, bloc?: string, bloc2?: string, enLigne?: string, enLigne2?: string) => {
    const enBloc = bloc ?? bloc2
    const source = enBloc ?? enLigne ?? enLigne2 ?? ''
    formules.push(katex.renderToString(source, { displayMode: enBloc !== undefined, throwOnError: false }))
    return `@@FORMULE${formules.length - 1}@@`
  })
  const html = (marked.parse(protege, { async: false }) as string).replace(/@@FORMULE(\d+)@@/g, (_, i) => formules[Number(i)])
  return DOMPurify.sanitize(html)
}

export function echapper(texte: string): string {
  const div = document.createElement('div')
  div.textContent = texte
  return div.innerHTML
}
