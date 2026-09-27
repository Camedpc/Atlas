// Coloration syntaxique (highlight.js, cœur seul et quelques langages) : aperçus de la vue Documents, blocs de code
// du Markdown (messages, rapports), extraits des documents du graphe. Palette sobre dans coloration.css.
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import cpp from 'highlight.js/lib/languages/cpp'
import ini from 'highlight.js/lib/languages/ini'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import julia from 'highlight.js/lib/languages/julia'
import latex from 'highlight.js/lib/languages/latex'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import r from 'highlight.js/lib/languages/r'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import './coloration.css'

const LANGAGES = { bash, cpp, ini, javascript, json, julia, latex, markdown, python, r, typescript, xml, yaml }
for (const [nom, langage] of Object.entries(LANGAGES)) hljs.registerLanguage(nom, langage)
hljs.registerAliases(['py', 'python3'], { languageName: 'python' })
hljs.registerAliases(['sh', 'shell', 'console'], { languageName: 'bash' })
hljs.registerAliases(['md'], { languageName: 'markdown' })
hljs.registerAliases(['tex'], { languageName: 'latex' })
hljs.registerAliases(['toml'], { languageName: 'ini' })
hljs.registerAliases(['c', 'h', 'hpp'], { languageName: 'cpp' })
hljs.registerAliases(['js'], { languageName: 'javascript' })
hljs.registerAliases(['ts'], { languageName: 'typescript' })
hljs.registerAliases(['jl'], { languageName: 'julia' })
hljs.registerAliases(['html', 'svg'], { languageName: 'xml' })
hljs.registerAliases(['yml'], { languageName: 'yaml' })

/** Langage d'un fichier d'après son extension (un notebook .ipynb est du JSON), ou null s'il n'en a pas. */
export function langageDe(nom: string): string | null {
  const ext = nom.includes('.') ? nom.slice(nom.lastIndexOf('.') + 1).toLowerCase() : ''
  if (ext === 'ipynb') return 'json'
  return hljs.getLanguage(ext) ? ext : null
}

/** Au-delà, pas de coloration (le texte reste affiché) : un très gros fichier gèlerait la page. */
const COLORATION_MAX = 200_000

/** HTML coloré (échappé) du code ; sans langage connu, le texte échappé tel quel. */
export function colorer(code: string, langage: string | null): string {
  if (langage && hljs.getLanguage(langage) && code.length <= COLORATION_MAX) {
    try {
      return hljs.highlight(code, { language: langage, ignoreIllegals: true }).value
    } catch {
      // texte brut ci-dessous
    }
  }
  const div = document.createElement('div')
  div.textContent = code
  return div.innerHTML
}
