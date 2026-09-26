// Fiche de survol hiérarchisée : une ligne de titre, trois informations clés, puis un détail
// repliable (touche Espace, puisque la fiche ne capte pas la souris). Pour un agrégat : histogramme
// des statuts et histogramme temporel empilé par statut.

import {
  el, formaterDate, formaterDateCourte, formaterNombre, statistiquesCategorie,
  LIBELLES_ORIGINE, LIBELLES_STATUT, LIBELLES_TYPE, LIBELLES_VALIDATION, NOMS_NIVEAUX, STATUTS, TYPES_NOEUD,
  type VueGraphe,
} from '../../src/core'

const SVG = 'http://www.w3.org/2000/svg'

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  return e
}

/** Barre d'intervalle compacte : piste, intervalle coloré, trait d'estimation. */
function miniIntervalle(bas: number, est: number, haut: number, couleur: string): SVGSVGElement {
  const W = 84, H = 10
  const s = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'v5-intervalle' })
  s.append(
    svg('rect', { x: 0, y: 4, width: W, height: 2, rx: 1, class: 'v5-piste' }),
    svg('rect', { x: bas * W, y: 2, width: Math.max(2, (haut - bas) * W), height: 6, rx: 3, fill: couleur }),
    svg('rect', { x: Math.min(W - 2, est * W - 1), y: 0, width: 2, height: H, rx: 1, class: 'v5-estimation' }),
  )
  return s
}

/** Histogramme temporel empilé par statut sur toute la période du graphe (la position dit « quand »). */
function histogrammeDates(vue: VueGraphe, feuilles: number[], bins: number): HTMLElement {
  const { h } = vue
  const W = 252, H = 34, pas = W / bins, ecart = pas > 5 ? 2 : 1
  const comptes = STATUTS.map(() => new Int32Array(bins))
  const duree = h.dateMax - h.dateMin
  for (const f of feuilles) {
    if (!vue.filtres.actives[f]) continue
    const i = Math.min(bins - 1, Math.floor(((h.dates[f]! - h.dateMin) / duree) * bins))
    comptes[STATUTS.indexOf(h.noeuds[f]!.statut)]![i]!++
  }
  let max = 1
  for (let i = 0; i < bins; i++) max = Math.max(max, comptes[0]![i]! + comptes[1]![i]! + comptes[2]![i]!)
  const s = svg('svg', { width: W, height: H + 1, viewBox: `0 0 ${W} ${H + 1}`, class: 'v5-histo-dates' })
  s.append(svg('line', { x1: 0, x2: W, y1: H + 0.5, y2: H + 0.5, class: 'v5-axe' }))
  for (let i = 0; i < bins; i++) {
    let y = H
    STATUTS.forEach((st, k) => {
      const n = comptes[k]![i]!
      if (!n) return
      const hh = (n / max) * (H - 2)
      const r = svg('rect', { x: i * pas + ecart / 2, y: y - hh, width: pas - ecart, height: Math.max(1, hh - 1), fill: vue.palette.statut[st] })
      r.append(svg('title', {}))
      r.firstChild!.textContent = `${LIBELLES_STATUT[st]} : ${n}`
      s.append(r)
      y -= hh
    })
  }
  return el('div', { class: 'v5-histo' }, s,
    el('div', { class: 'v5-histo-axe' }, el('span', {}, formaterDateCourte(h.dateMin)), el('span', {}, formaterDateCourte(h.dateMax))))
}

/** Histogramme des statuts : une barre horizontale par statut, compte et part en texte. */
function histogrammeStatuts(vue: VueGraphe, statuts: Record<string, number>): HTMLElement {
  const total = STATUTS.reduce((s, k) => s + statuts[k]!, 0) || 1
  const max = Math.max(1, ...STATUTS.map((k) => statuts[k]!))
  return el('div', { class: 'v5-statuts' }, STATUTS.map((k) =>
    el('div', { class: 'v5-statut-ligne' },
      el('span', { class: 'v5-statut-nom' }, LIBELLES_STATUT[k]),
      el('span', { class: 'v5-statut-piste' }, el('i', { style: `width:${(statuts[k]! / max) * 100}%;background:${vue.palette.statut[k]}` })),
      el('span', { class: 'v5-statut-val' }, `${statuts[k]}`, el('small', {}, ` ${Math.round((statuts[k]! / total) * 100)} %`)),
    )))
}

const BADGE: Record<string, string> = { aucune: '—', ia: 'IA', humain: 'H', ia_humain: 'IA+H' }

export function rendreFiche(vue: VueGraphe, u: number, detaille: boolean): HTMLElement {
  const { h } = vue
  const n = h.noeudDe(u)
  const aide = (texte: string) => el('div', { class: 'v5-fiche-aide' }, texte)
  const detail = (...enfants: (HTMLElement | null)[]) =>
    detaille ? el('div', { class: 'v5-fiche-detail' }, ...enfants) : null
  if (n) {
    const coul = vue.palette.statut[n.statut]
    const c = n.confiance
    return el('div', { class: 'v5-fiche' },
      el('div', { class: 'v5-fiche-titre' },
        el('i', { class: 'v5-anneau', style: `border-color:${coul}` }),
        el('span', {}, n.nom)),
      el('div', { class: 'v5-cles' },
        el('div', { class: 'v5-cle' },
          el('span', { class: 'v5-statut', style: `color:${coul}` }, LIBELLES_STATUT[n.statut]),
          miniIntervalle(c.bas, c.estimation, c.haut, coul),
          el('span', { class: 'v5-num' }, `${formaterNombre(c.estimation)} `, el('small', {}, `[${formaterNombre(c.bas)}–${formaterNombre(c.haut)}]`))),
        el('div', { class: 'v5-cle' },
          el('span', {}, `${LIBELLES_TYPE[n.type]} · ${LIBELLES_ORIGINE[n.origine]}`),
          el('span', { class: `v5-badge v-${n.validation}`, title: `Validé par : ${LIBELLES_VALIDATION[n.validation]}` }, BADGE[n.validation]!)),
        el('div', { class: 'v5-cle v5-doux' }, `${formaterDate(h.dates[u]!)} · session ${n.session}`),
      ),
      detail(
        el('div', { class: 'v5-chemin' }, n.categorie.join(' › ')),
        el('dl', { class: 'v5-grille' },
          el('dt', {}, 'Validation'), el('dd', {}, LIBELLES_VALIDATION[n.validation]),
          el('dt', {}, 'Liens'), el('dd', {}, `${h.premisses[u]!.length} prémisse(s) · ${h.importance[u]} descendant(s)`),
          el('dt', {}, 'Preuves'), el('dd', {}, n.demonstrations.length ? `${n.demonstrations.length} démonstration(s)` : n.admis ? 'admis' : 'aucune'),
        ),
        el('p', { class: 'v5-enonce' }, n.enonce.length > 220 ? n.enonce.slice(0, 217) + '…' : n.enonce),
      ),
      aide(detaille ? 'Espace : replier · clic : lignée' : 'Espace : détails · clic : lignée'),
    )
  }
  const cat = h.categorieDe(u)!
  const s = statistiquesCategorie(h, cat.index, vue.filtres.actives)
  const bins = vue.reglages.lire<number>('binsHistogramme')
  const niveau = NOMS_NIVEAUX[cat.niveau].replace(/s$/, '')
  const sousUnites = cat.niveau < 2 ? `${cat.enfants.length} ${NOMS_NIVEAUX[cat.niveau + 1].toLowerCase()}` : null
  const typesTries = TYPES_NOEUD.filter((t) => s.types[t] > 0).sort((a, b) => s.types[b] - s.types[a])
  return el('div', { class: 'v5-fiche' },
    el('div', { class: 'v5-fiche-titre' },
      el('i', { class: 'v5-disque', style: `background:${vue.palette.domaines[cat.domaine % vue.palette.domaines.length]}` }),
      el('span', {}, cat.nom),
      el('span', { class: 'v5-niveau' }, niveau)),
    el('div', { class: 'v5-cles' },
      el('div', { class: 'v5-cle' },
        el('span', {}, el('b', {}, String(s.nbActives)), ` nœud(s)${s.nbActives !== s.nb ? ` sur ${s.nb}` : ''}`),
        sousUnites ? el('span', { class: 'v5-doux' }, `· ${sousUnites}`) : null),
      s.nbActives ? histogrammeStatuts(vue, s.statuts) : null,
      s.nbActives
        ? el('div', { class: 'v5-cle v5-colonne' },
            el('span', { class: 'v5-doux' }, `${formaterDateCourte(s.dateMin)} → ${formaterDate(s.dateMax)}`),
            histogrammeDates(vue, cat.feuilles, bins))
        : null,
    ),
    detail(
      el('div', { class: 'v5-chemin' }, cat.chemin.join(' › ')),
      el('dl', { class: 'v5-grille' },
        el('dt', {}, 'Confiance'), el('dd', {}, `moyenne ${formaterNombre(s.confianceMoyenne)}`),
        el('dt', {}, 'Validation'), el('dd', {}, `IA+H ${s.validations.ia_humain} · H ${s.validations.humain} · IA ${s.validations.ia} · aucune ${s.validations.aucune}`),
        el('dt', {}, 'Origine'), el('dd', {}, `humain ${s.origines.humain} · IA ${s.origines.ia} · ordinateur ${s.origines.ordinateur}`),
        el('dt', {}, 'Types'), el('dd', {}, typesTries.slice(0, 4).map((t) => `${LIBELLES_TYPE[t]} ${s.types[t]}`).join(' · ')),
      ),
      s.principales.length
        ? el('div', { class: 'v5-principaux' }, el('span', { class: 'v5-doux' }, 'Principaux'),
            el('ol', {}, s.principales.slice(0, 3).map((f) => el('li', {}, h.noeuds[f]!.nom))))
        : null,
    ),
    aide(`${detaille ? 'Espace : replier' : 'Espace : détails'} · double-clic : ouvrir`),
  )
}
