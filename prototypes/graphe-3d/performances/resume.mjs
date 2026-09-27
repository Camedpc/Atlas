// Tableaux Markdown à partir de performances/resultats/brut.jsonl (sortie standard et resultats/resume.md).
//
//   node performances/resume.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ici = dirname(fileURLToPath(import.meta.url))
const lignes = readFileSync(join(ici, 'resultats', 'brut.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const tailles = [...new Set(lignes.map((l) => l.N))].sort((a, b) => a - b)
const cle = (l) => [l.tache, ...(l.args ?? [])].join(' ')
const trouver = (tache, N, ...args) => lignes.findLast((l) => l.tache === tache && l.N === N && args.every((a, k) => (l.args ?? [])[k] === a))
const val = (l, f) => (!l ? '–' : l.depasse ? `> ${l.delaiS ?? '?'} s` : l.erreur ? 'erreur' : f(l))
const out = []
const tableau = (titre, entetes, rangees) => {
  out.push(`\n### ${titre}\n`, `| ${entetes.join(' | ')} |`, `|${entetes.map(() => '---').join('|')}|`, ...rangees.map((r) => `| ${r.join(' | ')} |`))
}

tableau('Jeu et graphe de justification', ['N', 'arêtes', 'prém./nœud', 'génération (ms)', 'construireJustification (ms)', 'tas (Mo)'],
  tailles.map((N) => {
    const l = trouver('jeu', N)
    return [N, val(l, (x) => x.aretesJustification), val(l, (x) => x.jeu.premissesParNoeud), val(l, (x) => x.generationMs), val(l, (x) => x.justificationMs), val(l, (x) => x.tasJustificationMo)]
  }))

for (const s of ['defaut', 'r36-squelette', 'r36-tout', 'r19-squelette', 'r19-squelette-reduits']) {
  tableau(`Dérivation « ${s} »`, ['N', 'unités / arêtes', 'total (ms)', 'détail par étape (ms)'],
    tailles.map((N) => {
      const l = trouver('lecture', N, s)
      return [N, val(l, (x) => `${x.stats.unites} / ${x.stats.aretes}`), val(l, (x) => x.ms), val(l, (x) => x.etapes.map((e) => `${e.etape.replace(/\$\d+$/, '').replace('travail + finaliser + verifierCorrespondance', 'finaliser')} ${e.ms}`).join(' · '))]
    }))
}

const pages = [['r36', 'squelette'], ['r36', 'tout'], ['r18', 'auxiliaires'], ['r19', 'squelette'], ['r35', 'squelette']]
tableau('Mise en page (mettreEnPage, une passe)', ['vision', ...tailles.map((N) => `N = ${N}`)],
  pages.map(([v, n]) => [`${v} ${n}`, ...tailles.map((N) => val(trouver('page', N, v, n), (x) => `${x.miseEnPageMs} ms (${x.unites} u., ${x.routes} routes, ${x.maxParRang}/rang)`))]))
tableau('Taille de la figure (px de mise en page, largeur × hauteur)', ['vision', ...tailles.map((N) => `N = ${N}`)],
  pages.map(([v, n]) => [`${v} ${n}`, ...tailles.map((N) => val(trouver('page', N, v, n), (x) => `${x.figurePx.largeur} × ${x.figurePx.hauteur}`))]))

tableau('Composition KaTeX de R36 (tous les blocs, comme Composition.composer)', ['niveau', 'N', 'blocs', 'KaTeX (ms)', 'ms / bloc', 'éléments DOM / bloc (moy. / max)', 'éléments DOM total', 'HTML (Mo)', 'avec cache (ms)', 'TeX uniques / total'],
  ['squelette', 'tout'].flatMap((niv) => tailles.map((N) => {
    const l = trouver('katex', N, niv)
    return [niv, N, val(l, (x) => x.unites), val(l, (x) => x.compositionMs), val(l, (x) => x.compositionParBlocMs), val(l, (x) => `${x.elementsParBloc.moyenne} / ${x.elementsParBloc.max}`), val(l, (x) => x.elementsTotal), val(l, (x) => x.htmlMo), val(l, (x) => x.formulesAvecCacheMs), val(l, (x) => `${x.chainesTexUniques} / ${x.chainesTex}`)]
  })))

tableau('Une image (vue d\'ensemble) : tracés canvas, appels, écritures DOM, temps JS', ['vision', 'N', 'unités', 'tracés', 'appels canvas', 'placements / écritures style', 'JS (ms)', 'zoom lecture : unités à l\'écran / tracés'],
  pages.flatMap(([v, n]) => tailles.map((N) => {
    const l = trouver('rendu', N, v, n)
    const t = l?.tout, z = l?.lecture
    return [`${v} ${n}`, N, val(l, (x) => x.unites), val(l, () => t?.tracesCanvas ?? t?.erreur), val(l, () => t?.appelsCanvas ?? '–'),
      val(l, () => (t?.dom?.placements !== undefined ? `${t.dom.placements} / ${t.dom.ecrituresStyle}` : t?.dom?.placementsFormules !== undefined ? `${t.dom.placementsFormules} formules` : '–')),
      val(l, () => t?.jsImageMs ?? '–'), val(l, () => (z?.unitesDansEcran !== undefined ? `${z.unitesDansEcran} / ${z.tracesCanvas}` : z?.erreur ?? '–'))]
  })))

const texte = out.join('\n') + '\n'
writeFileSync(join(ici, 'resultats', 'resume.md'), `# Mesures brutes (générées par resume.mjs)\n${texte}`)
console.log(texte)
void cle
