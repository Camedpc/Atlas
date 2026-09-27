// Fiche de survol hiérarchisée (structure de V5, typographie de V1) :
//   1. titre (surtitre en petites capitales : type · origine, ou niveau de l'agrégat) ;
//   2. trois informations clés ;
//   3. détail qui se déplie avec Espace (la fiche ne capte pas la souris).
// Agrégat : effectif, barre empilée des statuts, période avec histogramme temporel empilé, trois
// nœuds principaux ; le détail donne validations, origines, types et confiance moyenne.

import {
  el, formaterDate, formaterDateCourte, formaterNombre, statistiquesCategorie,
  LIBELLES_ORIGINE, LIBELLES_STATUT, LIBELLES_TYPE, LIBELLES_VALIDATION, NOMS_NIVEAUX, STATUTS, TYPES_NOEUD,
  type Validation, type VueGraphe,
} from '../../src/core'
import { lire } from './reglages'

const SVG = 'http://www.w3.org/2000/svg'

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, ...enfants: SVGElement[]): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  e.append(...enfants)
  return e
}

/** Glyphe de validation : filet fin (aucune), simple (IA), double (humain), plein (IA + humain). */
export function glypheValidation(v: Validation, couleur: string, taille = 14): SVGSVGElement {
  const c = taille / 2
  const s = svg('svg', { width: taille, height: taille, viewBox: `0 0 ${taille} ${taille}`, class: 'v7-glyphe', 'aria-hidden': 'true' })
  const cercle = (r: number, w: number, dash = '') => svg('circle', { cx: c, cy: c, r, fill: 'none', stroke: couleur, 'stroke-width': w, ...(dash ? { 'stroke-dasharray': dash } : {}) })
  if (v === 'aucune') s.append(cercle(c - 1.5, 1, '1.5 1.8'))
  else if (v === 'ia') s.append(cercle(c - 1.2, 1.3))
  else if (v === 'humain') s.append(cercle(c - 0.8, 1), cercle(c - 3.6, 1))
  else s.append(cercle(c - 2, 3.2))
  return s
}

/** Échelle de confiance 0–1 : piste graduée, intervalle ombré à moustaches, losange de l'estimation. */
export function echelleConfiance(bas: number, est: number, haut: number, couleur: string, largeur = 150): SVGSVGElement {
  const W = largeur, H = 16, m = 3
  const x = (v: number) => m + v * (W - 2 * m)
  const s = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'v7-echelle' })
  s.append(svg('line', { x1: x(0), x2: x(1), y1: 8, y2: 8, class: 'v7-piste' }))
  for (let k = 0; k <= 4; k++) s.append(svg('line', { x1: x(k / 4), x2: x(k / 4), y1: k % 2 ? 6 : 5, y2: k % 2 ? 10 : 11, class: 'v7-graduation' }))
  s.append(
    svg('rect', { x: x(bas), y: 5, width: Math.max(1.5, x(haut) - x(bas)), height: 6, fill: couleur, opacity: 0.38, rx: 1 }),
    svg('line', { x1: x(bas), x2: x(haut), y1: 8, y2: 8, stroke: couleur, 'stroke-width': 1.4 }),
    svg('line', { x1: x(bas), x2: x(bas), y1: 5, y2: 11, stroke: couleur, 'stroke-width': 1.2 }),
    svg('line', { x1: x(haut), x2: x(haut), y1: 5, y2: 11, stroke: couleur, 'stroke-width': 1.2 }),
    svg('path', { d: `M${x(est)} 3.2 L${x(est) + 4.2} 8 L${x(est)} 12.8 L${x(est) - 4.2} 8 Z`, class: 'v7-losange', fill: couleur }),
  )
  return s
}

/** Barre empilée des statuts avec les effectifs. */
export function barreStatuts(vue: VueGraphe, statuts: Record<string, number>, largeur = 240): HTMLElement {
  const total = STATUTS.reduce((s, k) => s + (statuts[k] ?? 0), 0) || 1
  return el('div', { class: 'v7-statuts' },
    el('div', { class: 'v7-statuts-barre', style: `width:${largeur}px` }, STATUTS.map((k) =>
      (statuts[k] ?? 0) > 0 ? el('span', { style: `flex:${statuts[k]};background:${vue.palette.statut[k]}`, title: `${LIBELLES_STATUT[k]} : ${statuts[k]}` }) : null)),
    el('div', { class: 'v7-statuts-legende' }, STATUTS.map((k) =>
      el('span', {}, el('i', { style: `background:${vue.palette.statut[k]}` }), `${LIBELLES_STATUT[k]} `, el('b', {}, String(statuts[k] ?? 0)), el('small', {}, ` ${Math.round(((statuts[k] ?? 0) / total) * 100)} %`)))),
  )
}

/** Histogramme temporel empilé par statut sur toute la période (la position dit « quand »). */
function histogrammeDates(vue: VueGraphe, feuilles: number[], bins: number): HTMLElement {
  const { h } = vue
  const W = 240, H = 30, pas = W / bins, ecart = pas > 5 ? 1.5 : 0.8
  const comptes = STATUTS.map(() => new Int32Array(bins))
  const duree = h.dateMax - h.dateMin
  for (const f of feuilles) {
    if (!vue.filtres.actives[f]) continue
    const i = Math.min(bins - 1, Math.floor(((h.dates[f]! - h.dateMin) / duree) * bins))
    comptes[STATUTS.indexOf(h.noeuds[f]!.statut)]![i]!++
  }
  let max = 1
  for (let i = 0; i < bins; i++) max = Math.max(max, comptes[0]![i]! + comptes[1]![i]! + comptes[2]![i]!)
  const s = svg('svg', { width: W, height: H + 1, viewBox: `0 0 ${W} ${H + 1}`, class: 'v7-histo' })
  s.append(svg('line', { x1: 0, x2: W, y1: H + 0.5, y2: H + 0.5, class: 'v7-axe' }))
  for (let i = 0; i < bins; i++) {
    let y = H
    STATUTS.forEach((st, k) => {
      const n = comptes[k]![i]!
      if (!n) return
      const hh = (n / max) * (H - 2)
      s.append(svg('rect', { x: i * pas + ecart / 2, y: y - hh, width: pas - ecart, height: Math.max(0.8, hh - 0.6), fill: vue.palette.statut[st] }))
      y -= hh
    })
  }
  return el('div', { class: 'v7-histo-boite' }, s,
    el('div', { class: 'v7-histo-axe' }, el('span', {}, formaterDateCourte(h.dateMin)), el('span', {}, formaterDateCourte(h.dateMax))))
}

export function rendreFiche(vue: VueGraphe, u: number): HTMLElement {
  const detaille = lire<boolean>(vue, 'ficheDetaillee')
  const { h } = vue
  const n = h.noeudDe(u)
  const aide = (texte: string) => el('div', { class: 'v7-fiche-aide' }, texte)
  const detail = (...enfants: (HTMLElement | null)[]) => (detaille ? el('div', { class: 'v7-fiche-detail' }, ...enfants) : null)
  if (n) {
    const coul = vue.palette.statut[n.statut]
    const c = n.confiance
    return el('div', { class: 'v7-fiche' },
      el('div', { class: 'v7-fiche-surtitre' }, `${LIBELLES_TYPE[n.type]} · ${LIBELLES_ORIGINE[n.origine]}`),
      el('div', { class: 'v7-fiche-titre' }, n.nom),
      el('div', { class: 'v7-cles' },
        el('div', { class: 'v7-cle' },
          el('span', { class: 'v7-statut', style: `color:${coul}` }, el('i', { style: `background:${coul}` }), LIBELLES_STATUT[n.statut]),
          echelleConfiance(c.bas, c.estimation, c.haut, coul, 118),
          el('span', { class: 'v7-num' }, formaterNombre(c.estimation), el('small', {}, ` [${formaterNombre(c.bas)} – ${formaterNombre(c.haut)}]`))),
        el('div', { class: 'v7-cle' },
          glypheValidation(n.validation, vue.palette.texte),
          el('span', {}, `Validé par : `, el('b', {}, LIBELLES_VALIDATION[n.validation]))),
        el('div', { class: 'v7-cle v7-doux' }, `${formaterDate(h.dates[u]!)} · session ${n.session} · ${h.premisses[u]!.length} prémisse(s), ${h.importance[u]} descendant(s)`),
      ),
      detail(
        el('div', { class: 'v7-fiche-chemin' }, n.categorie.join(' › ')),
        el('p', { class: 'v7-fiche-enonce' }, n.enonce.length > 240 ? `${n.enonce.slice(0, 237)}…` : n.enonce),
        el('dl', { class: 'v7-grille' },
          el('dt', {}, 'Preuves'), el('dd', {}, n.demonstrations.length ? `${n.demonstrations.length} démonstration(s)` : n.admis ? 'admis' : 'aucune'),
          el('dt', {}, 'Identifiant'), el('dd', { class: 'v7-mono' }, n.id),
        ),
      ),
      aide(detaille ? 'Espace : replier · clic : lignée' : 'Espace : détails · clic : lignée'),
    )
  }
  const cat = h.categorieDe(u)!
  const s = statistiquesCategorie(h, cat.index, vue.filtres.actives)
  const niveau = NOMS_NIVEAUX[cat.niveau].replace(/s$/, '')
  const sousUnites = cat.niveau < 2 ? `${cat.enfants.length} ${NOMS_NIVEAUX[cat.niveau + 1].toLowerCase()}` : null
  const typesTries = TYPES_NOEUD.filter((t) => s.types[t] > 0).sort((a, b) => s.types[b] - s.types[a])
  return el('div', { class: 'v7-fiche' },
    el('div', { class: 'v7-fiche-surtitre' },
      el('i', { class: 'v7-disque', style: `background:${vue.palette.domaines[cat.domaine % vue.palette.domaines.length]}` }),
      `${niveau}${cat.niveau > 0 ? ` · ${cat.chemin[0]}` : ''}`),
    el('div', { class: 'v7-fiche-titre' }, cat.nom),
    el('div', { class: 'v7-cles' },
      el('div', { class: 'v7-cle' },
        el('span', {}, el('b', { class: 'v7-grand' }, String(s.nbActives)), ` nœud(s)${s.nbActives !== s.nb ? ` sur ${s.nb}` : ''}`),
        sousUnites ? el('span', { class: 'v7-doux' }, `· ${sousUnites}`) : null),
      s.nbActives ? barreStatuts(vue, s.statuts) : null,
      s.nbActives
        ? el('div', { class: 'v7-cle v7-colonne' },
            el('span', { class: 'v7-doux' }, `Période : ${formaterDateCourte(s.dateMin)} → ${formaterDate(s.dateMax)}`),
            histogrammeDates(vue, cat.feuilles, lire<number>(vue, 'binsHistogramme')))
        : null,
      s.principales.length
        ? el('div', { class: 'v7-principaux' }, el('span', { class: 'v7-doux' }, 'Principaux nœuds'),
            el('ol', {}, s.principales.slice(0, 3).map((f) => el('li', {}, h.noeuds[f]!.nom, el('small', {}, ` · ${h.importance[f]} desc.`)))))
        : null,
    ),
    detail(
      el('div', { class: 'v7-fiche-chemin' }, cat.chemin.join(' › ')),
      el('dl', { class: 'v7-grille' },
        el('dt', {}, 'Confiance'), el('dd', {}, `moyenne ${formaterNombre(s.confianceMoyenne)}`),
        el('dt', {}, 'Validation'), el('dd', {}, `IA+H ${s.validations.ia_humain} · H ${s.validations.humain} · IA ${s.validations.ia} · aucune ${s.validations.aucune}`),
        el('dt', {}, 'Origine'), el('dd', {}, `humain ${s.origines.humain} · IA ${s.origines.ia} · ordinateur ${s.origines.ordinateur}`),
        el('dt', {}, 'Types'), el('dd', {}, typesTries.slice(0, 4).map((t) => `${LIBELLES_TYPE[t]} ${s.types[t]}`).join(' · ')),
      ),
    ),
    aide(`${detaille ? 'Espace : replier' : 'Espace : détails'} · double-clic : ouvrir · Alt + double-clic : replier`),
  )
}
