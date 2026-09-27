// R33 · Source tikz-cd du diagramme affiché : la matrice (lignes × rangs) et une commande \arrow par flèche.
// Collable dans un document avec \usepackage{tikz-cd} (et amssymb pour \nrightarrow si besoin).

import type { GrapheLecture } from '../../src/raisonnement'
import type { Contenu } from './contenu'
import { echapperTexte } from './formules'
import type { MiseEnPage } from './mise-en-page'

export function sourceTikzcd(g: GrapheLecture, page: MiseEnPage, contenu: Contenu): string {
  const j = g.justification
  const nU = g.unites.length
  const cellule = (p: number): string => {
    const n = j.noeuds[g.unites[p]!.conclusion]!
    const f = contenu.formules[p]
    if (page.entrees[p]!.genre === 'decision') return `\\text{\\scshape ${echapperTexte(n.nom)}}`
    if (f) return page.entrees[p]!.genre === 'majeur' ? `\\boldsymbol{${f}}` : f
    return `\\text{${echapperTexte(n.nom)}}`
  }
  const dansMatrice = (p: number) => p < nU && page.entrees[p]!.genre !== 'legende' && page.entrees[p]!.ligne >= 0
  // Lignes vides retirées (la matrice tikz-cd n'en a pas besoin) : lignes renumérotées.
  const utilisees = new Set<number>()
  let colonnes = 0
  for (let p = 0; p < nU; p++) if (dansMatrice(p)) {
    utilisees.add(page.entrees[p]!.ligne)
    colonnes = Math.max(colonnes, page.entrees[p]!.rang + 1)
  }
  const numero = new Map([...utilisees].sort((a, b) => a - b).map((l, k) => [l, k]))
  const ligne = (p: number) => numero.get(page.entrees[p]!.ligne)!
  const lignes = numero.size
  const grille: string[][] = Array.from({ length: lignes }, () => Array.from({ length: colonnes }, () => ''))
  const fleches = new Map<number, string[]>()
  for (let p = 0; p < nU; p++) if (dansMatrice(p)) grille[ligne(p)]![page.entrees[p]!.rang] = cellule(p)
  for (const r of page.routes) {
    const et = contenu.aretes[r.arete]
    if (!et || !dansMatrice(r.source) || !dansMatrice(r.cible)) continue
    const s = page.entrees[r.source]!, c = page.entrees[r.cible]!
    const ls = ligne(r.source), lc = ligne(r.cible)
    const dir = 'r'.repeat(Math.max(0, c.rang - s.rang)) + (lc > ls ? 'd'.repeat(lc - ls) : 'u'.repeat(ls - lc))
    const opts = [dir || 'r']
    if (et.style === 'double') opts.push('Rightarrow')
    else if (et.style === 'pointillee') opts.push('dashed')
    else if (et.style === 'barree') opts.push('"/" marking')
    if (et.dessus) opts.push(`"\\text{${echapperTexte(et.dessus)}}"`)
    if (et.dessous.length) opts.push(`"${et.dessous.map((i) => contenu.reperes.get(i) ?? '?').join(', ')}"'`)
    if (r.abandon) opts.push('gray')
    let l = fleches.get(r.source)
    if (!l) fleches.set(r.source, (l = []))
    l.push(`\\arrow[${opts.join(', ')}]`)
  }
  for (let p = 0; p < nU; p++) {
    const l = fleches.get(p)
    if (l && dansMatrice(p)) grille[ligne(p)]![page.entrees[p]!.rang] += ` ${l.join(' ')}`
  }
  const corps = grille.map((l) => '  ' + l.map((c) => c || ' ').join(' & ')).join(' \\\\\n')
  return `\\begin{tikzcd}[column sep=large, row sep=normal, cells={nodes={font=\\normalsize}}]\n${corps}\n\\end{tikzcd}`
}
