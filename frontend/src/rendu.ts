// Markdown + LaTeX ($…$ et $$…$$) vers HTML assaini.
import DOMPurify from 'dompurify'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { marked } from 'marked'

export function rendre(texte: string): string {
  // Les formules sont rendues à part : marked abîmerait leurs `_` et `*`.
  const formules: string[] = []
  const protege = texte.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (_, bloc?: string, enLigne?: string) => {
    formules.push(katex.renderToString(bloc ?? enLigne ?? '', { displayMode: bloc !== undefined, throwOnError: false }))
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
