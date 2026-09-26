// V1 · fiche de survol au style « légende de figure » : titre en romain, méta en petites
// capitales, échelle de confiance graduée 0–1, mini-diagramme des prémisses (nœud) ou
// composition + distribution de confiance (agrégat).

import {
  el, formaterDate, formaterDateCourte, formaterNombre, statistiquesCategorie,
  LIBELLES_ORIGINE, LIBELLES_STATUT, LIBELLES_TYPE, LIBELLES_VALIDATION, NOMS_NIVEAUX, STATUTS,
  type Palette, type Statut, type Validation, type VueGraphe,
} from '../../src/core'

const NS = 'http://www.w3.org/2000/svg'

/** Petit constructeur SVG (attributs + enfants). */
export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...enfants: (SVGElement | string | null)[]): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  for (const c of enfants) if (c !== null) e.append(c)
  return e
}

const nombre = (x: number) => formaterNombre(Math.round(x * 100) / 100)
const tronquer = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t)

/** Pastille d'un nœud avec le motif de bordure de sa validation (glyphe de légende). */
export function glypheValidation(p: Palette, v: Validation, remplissage: string, taille = 16): SVGSVGElement {
  const c = taille / 2
  const r = taille / 2 - 1
  const g = s('svg', { width: taille, height: taille, viewBox: `0 0 ${taille} ${taille}`, 'aria-hidden': 'true' })
  g.append(s('circle', { cx: c, cy: c, r, fill: remplissage }))
  const encre = p.texte
  if (v === 'aucune') g.append(s('circle', { cx: c, cy: c, r: r - 0.3, fill: 'none', stroke: p.texteDoux, 'stroke-width': 0.6 }))
  else if (v === 'ia') g.append(s('circle', { cx: c, cy: c, r: r - 0.6, fill: 'none', stroke: encre, 'stroke-width': 1.2 }))
  else if (v === 'humain') {
    g.append(s('circle', { cx: c, cy: c, r: r - 0.6, fill: 'none', stroke: encre, 'stroke-width': 1.1 }))
    g.append(s('circle', { cx: c, cy: c, r: r - 2.9, fill: 'none', stroke: encre, 'stroke-width': 1.1 }))
  } else g.append(s('circle', { cx: c, cy: c, r: r - 1.4, fill: 'none', stroke: encre, 'stroke-width': 2.8 }))
  return g
}

/** Échelle graduée 0–1 : intervalle [bas, haut] ombré avec moustaches, estimation marquée. */
export function echelleConfiance(p: Palette, bas: number, est: number, haut: number, couleur: string, largeur = 286): SVGSVGElement {
  const x0 = 10, x1 = largeur - 12
  const X = (v: number) => x0 + (x1 - x0) * v
  const yAxe = 30
  const g = s('svg', { width: largeur, height: 48, viewBox: `0 0 ${largeur} 48`, role: 'img', 'aria-label': `Confiance ${nombre(est)}, intervalle ${nombre(bas)} à ${nombre(haut)}` })
  // Graduations mineures (0,05) et majeures (0,25).
  for (let i = 0; i <= 20; i++) {
    const v = i / 20
    const majeure = i % 5 === 0
    g.append(s('line', { x1: X(v), x2: X(v), y1: yAxe, y2: yAxe + (majeure ? 5 : 2.5), stroke: p.texteDoux, 'stroke-width': majeure ? 0.9 : 0.5 }))
    if (majeure) g.append(s('text', { x: X(v), y: yAxe + 15, 'text-anchor': 'middle', 'font-size': 9.5, fill: p.texteDoux }, formaterNombre(v)))
  }
  g.append(s('line', { x1: x0, x2: x1, y1: yAxe, y2: yAxe, stroke: p.texteDoux, 'stroke-width': 0.9 }))
  // Intervalle + moustaches.
  const yb = 20
  g.append(s('rect', { x: X(bas), y: yb - 5, width: Math.max(1, X(haut) - X(bas)), height: 10, fill: couleur, 'fill-opacity': 0.28, rx: 1 }))
  g.append(s('line', { x1: X(bas), x2: X(haut), y1: yb, y2: yb, stroke: couleur, 'stroke-width': 1.2 }))
  for (const v of [bas, haut]) g.append(s('line', { x1: X(v), x2: X(v), y1: yb - 5, y2: yb + 5, stroke: couleur, 'stroke-width': 1.2 }))
  // Estimation : losange encre + valeur.
  const xe = X(est)
  g.append(s('path', { d: `M${xe} ${yb - 5} L${xe + 4.5} ${yb} L${xe} ${yb + 5} L${xe - 4.5} ${yb} Z`, fill: p.texte, stroke: p.fond, 'stroke-width': 0.8 }))
  const ancre = est < 0.12 ? 'start' : est > 0.88 ? 'end' : 'middle'
  g.append(s('text', { x: xe, y: 9, 'text-anchor': ancre, 'font-size': 10.5, 'font-weight': 600, fill: p.texte }, nombre(est)))
  const texteIntervalle = `[${nombre(bas)} ; ${nombre(haut)}]`
  const aDroite = est < 0.55
  g.append(s('text', { x: aDroite ? x1 : x0, y: 9, 'text-anchor': aDroite ? 'end' : 'start', 'font-size': 9.5, fill: p.texteDoux }, texteIntervalle))
  return g
}

/** Mini-diagramme : prémisses (à gauche) → nœud (à droite) → descendants. */
function diagrammePremisses(vue: VueGraphe, f: number): SVGSVGElement | HTMLElement {
  const { h, palette: p } = vue
  const prem = [...h.premisses[f]!].sort((a, b) => h.importance[b]! - h.importance[a]!)
  const n = h.noeuds[f]!
  if (!prem.length) return el('div', { class: 'v1-fiche-pied' }, n.admis ? 'Aucune prémisse : énoncé admis.' : 'Aucune prémisse : point de départ du raisonnement.')
  const max = 5
  const vus = prem.slice(0, max)
  const reste = prem.length - vus.length
  const ligne = 17
  const lignes = vus.length + (reste > 0 ? 1 : 0)
  const H = Math.max(34, lignes * ligne + 6)
  const L = 286
  const xc = 236, yc = H / 2
  const g = s('svg', { width: L, height: H, viewBox: `0 0 ${L} ${H}`, role: 'img', 'aria-label': `${prem.length} prémisse(s)` })
  vus.forEach((q, i) => {
    const y = 3 + ligne * i + ligne / 2
    const nq = h.noeuds[q]!
    g.append(s('path', { d: `M178 ${y} C ${206} ${y}, ${210} ${yc}, ${xc - 9} ${yc}`, fill: 'none', stroke: p.arete, 'stroke-width': 0.9 }))
    g.append(s('circle', { cx: 8, cy: y, r: 3.6, fill: p.statut[nq.statut] }))
    g.append(s('text', { x: 16, y: y + 3.5, 'font-size': 10.5, fill: p.texte }, tronquer(nq.nom, 29)))
  })
  if (reste > 0) g.append(s('text', { x: 16, y: 3 + ligne * vus.length + ligne / 2 + 3.5, 'font-size': 10, 'font-style': 'italic', fill: p.texteDoux }, `+ ${reste} autre(s)`))
  // Pointe de flèche vers le nœud.
  g.append(s('path', { d: `M${xc - 9} ${yc} l-5 -3 l0 6 Z`, fill: p.arete }))
  g.append(s('circle', { cx: xc, cy: yc, r: 7, fill: p.statut[n.statut], stroke: p.texte, 'stroke-width': 1 }))
  const nbDesc = h.importance[f]!
  g.append(s('line', { x1: xc + 8, x2: L - 18, y1: yc, y2: yc, stroke: p.arete, 'stroke-width': 0.9, 'stroke-dasharray': nbDesc ? '0' : '2 2' }))
  g.append(s('path', { d: `M${L - 12} ${yc} l-6 -3 l0 6 Z`, fill: p.arete }))
  g.append(s('text', { x: L - 4, y: yc - 7, 'text-anchor': 'end', 'font-size': 9.5, fill: p.texteDoux }, `${nbDesc} desc.`))
  return g
}

/** Barre empilée des statuts avec effectifs. */
function barreComposition(p: Palette, statuts: Record<Statut, number>): SVGSVGElement {
  const L = 286
  const total = STATUTS.reduce((t, k) => t + statuts[k], 0) || 1
  const g = s('svg', { width: L, height: 30, viewBox: `0 0 ${L} 30`, role: 'img', 'aria-label': 'Répartition des statuts' })
  let x = 0
  for (const k of STATUTS) {
    const w = (statuts[k] / total) * L
    if (w <= 0) continue
    g.append(s('rect', { x, y: 0, width: Math.max(0, w - 1), height: 9, fill: p.statut[k] }))
    if (w > 42) g.append(s('text', { x: x + 1, y: 22, 'font-size': 10, fill: p.texteDoux }, `${LIBELLES_STATUT[k]} ${statuts[k]}`))
    x += w
  }
  return g
}

/** Histogramme de la confiance estimée des nœuds de l'agrégat (10 classes, axe gradué 0–1). */
function distributionConfiance(vue: VueGraphe, feuilles: number[], couleur: string): SVGSVGElement {
  const p = vue.palette
  const L = 286, H = 58
  const x0 = 10, x1 = L - 12, yBas = 38
  const X = (v: number) => x0 + (x1 - x0) * v
  const classes = new Array<number>(10).fill(0)
  let somme = 0
  for (const f of feuilles) {
    const e = vue.h.noeuds[f]!.confiance.estimation
    classes[Math.min(9, Math.floor(e * 10))]!++
    somme += e
  }
  const max = Math.max(1, ...classes)
  const g = s('svg', { width: L, height: H, viewBox: `0 0 ${L} ${H}`, role: 'img', 'aria-label': 'Distribution de la confiance' })
  classes.forEach((n, i) => {
    const hauteur = (n / max) * 28
    g.append(s('rect', { x: X(i / 10) + 0.5, y: yBas - hauteur, width: (x1 - x0) / 10 - 1, height: hauteur, fill: couleur, 'fill-opacity': 0.55 }))
  })
  g.append(s('line', { x1: x0, x2: x1, y1: yBas, y2: yBas, stroke: p.texteDoux, 'stroke-width': 0.9 }))
  for (let i = 0; i <= 4; i++) {
    const v = i / 4
    g.append(s('line', { x1: X(v), x2: X(v), y1: yBas, y2: yBas + 4, stroke: p.texteDoux, 'stroke-width': 0.8 }))
    g.append(s('text', { x: X(v), y: yBas + 14, 'text-anchor': 'middle', 'font-size': 9.5, fill: p.texteDoux }, formaterNombre(v)))
  }
  if (feuilles.length) {
    const m = somme / feuilles.length
    g.append(s('line', { x1: X(m), x2: X(m), y1: 4, y2: yBas, stroke: p.texte, 'stroke-width': 1, 'stroke-dasharray': '3 2' }))
    g.append(s('text', { x: X(m) + (m > 0.75 ? -4 : 4), y: 9, 'text-anchor': m > 0.75 ? 'end' : 'start', 'font-size': 10, 'font-weight': 600, fill: p.texte }, `moy. ${nombre(m)}`))
  }
  return g
}

export function ficheFigure(u: number, vue: VueGraphe): HTMLElement {
  const { h, palette: p } = vue
  const n = h.noeudDe(u)
  if (n) {
    const coul = p.statut[n.statut]
    return el(
      'div',
      { class: 'v1-fiche' },
      el('div', { class: 'v1-fiche-surtitre' }, glypheValidation(p, n.validation, coul, 14), `${LIBELLES_TYPE[n.type]} · ${LIBELLES_ORIGINE[n.origine]}`),
      el('div', { class: 'v1-fiche-titre' }, n.nom),
      el('div', { class: 'v1-fiche-chemin' }, n.categorie.join(' › ')),
      el('div', { class: 'v1-fiche-statut' },
        el('strong', { style: `color:${coul}` }, LIBELLES_STATUT[n.statut]),
        el('span', {}, `— validé par : ${LIBELLES_VALIDATION[n.validation].toLowerCase()}`),
      ),
      el('div', { class: 'v1-fiche-section' }, 'Confiance · estimation et intervalle'),
      echelleConfiance(p, n.confiance.bas, n.confiance.estimation, n.confiance.haut, coul),
      el('div', { class: 'v1-fiche-section' }, `Prémisses (${h.premisses[u]!.length})`),
      diagrammePremisses(vue, u),
      el('div', { class: 'v1-fiche-meta' },
        el('span', {}, 'créé le ', el('b', {}, formaterDate(h.dates[u]!))),
        el('span', {}, 'session ', el('b', {}, n.session)),
        el('span', {}, el('b', {}, String(n.demonstrations.length)), ' démonstration(s)'),
      ),
    )
  }
  const c = h.categorieDe(u)!
  const st = statistiquesCategorie(h, c.index, vue.filtres.actives)
  const feuilles = c.feuilles.filter((f) => vue.filtres.actives[f])
  const couleur = p.domaines[c.domaine % p.domaines.length]!
  return el(
    'div',
    { class: 'v1-fiche' },
    el('div', { class: 'v1-fiche-surtitre' },
      el('i', { style: `display:inline-block;width:10px;height:10px;border-radius:50%;background:${couleur}` }),
      `${NOMS_NIVEAUX[c.niveau].replace(/s$/, '')}${c.chemin.length > 1 ? ` · ${c.chemin.slice(0, -1).join(' › ')}` : ''}`,
    ),
    el('div', { class: 'v1-fiche-titre' }, c.nom),
    el('div', { class: 'v1-fiche-n' },
      el('i', {}, 'n'), ` = ${st.nbActives} nœud(s)${st.nbActives !== st.nb ? ` sur ${st.nb}` : ''}`,
      st.nbActives ? el('span', { class: 'v1-fiche-chemin' }, ` · ${formaterDateCourte(st.dateMin)} → ${formaterDate(st.dateMax)}`) : null,
    ),
    el('div', { class: 'v1-fiche-section' }, 'Composition par statut'),
    barreComposition(p, st.statuts),
    st.nbActives ? el('div', { class: 'v1-fiche-section' }, 'Distribution de la confiance estimée') : null,
    st.nbActives ? distributionConfiance(vue, feuilles, couleur) : null,
    st.principales.length ? el('div', { class: 'v1-fiche-section' }, 'Nœuds principaux') : null,
    st.principales.length ? el('ol', { class: 'v1-fiche-principaux' }, st.principales.slice(0, 3).map((f) => el('li', {}, h.noeuds[f]!.nom))) : null,
    el('div', { class: 'v1-fiche-pied' }, 'Double-clic : ouvrir · Alt + double-clic : replier dans le parent'),
  )
}
