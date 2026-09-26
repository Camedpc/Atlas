// Fiche de survol « verre dépoli » : nœud (confiance lumineuse, validation, importance) et agrégat.

import {
  el, formaterDate, formaterDateCourte, formaterNombre, statistiquesCategorie,
  LIBELLES_ORIGINE, LIBELLES_STATUT, LIBELLES_TYPE, LIBELLES_VALIDATION, NOMS_NIVEAUX, STATUTS,
  type Validation, type VueGraphe,
} from '../../src/core'
import type { Squelette } from './squelette'

const ICONES_VALIDATION: Record<Validation, string> = { aucune: '◌', ia: '◇', humain: '○', ia_humain: '✦' }

/** Barre d'intervalle de confiance lumineuse : bande floutée = intervalle, trait = estimation. */
export function confianceLumineuse(bas: number, est: number, haut: number, couleur: string): HTMLElement {
  return el(
    'div',
    { class: 'v3-conf' },
    el(
      'div',
      { class: 'v3-conf-piste' },
      el('div', { class: 'v3-conf-lueur', style: `left:${bas * 100}%;width:${Math.max(1.5, (haut - bas) * 100)}%;--c:${couleur}` }),
      el('div', { class: 'v3-conf-est', style: `left:${est * 100}%;--c:${couleur}` }),
    ),
    el('div', { class: 'v3-conf-texte' },
      el('strong', {}, formaterNombre(est)),
      el('span', {}, ` [${formaterNombre(bas)} – ${formaterNombre(haut)}] · ±${formaterNombre((haut - bas) / 2)}`),
    ),
  )
}

export function barreStatutsLumineuse(vue: VueGraphe, statuts: Record<string, number>): HTMLElement {
  const total = STATUTS.reduce((s, k) => s + (statuts[k] ?? 0), 0) || 1
  return el(
    'div',
    { class: 'v3-empile' },
    el('div', { class: 'v3-empile-barre' }, STATUTS.map((k) =>
      el('span', { style: `width:${((statuts[k] ?? 0) / total) * 100}%;--c:${vue.palette.statut[k]}` }),
    )),
    el('div', { class: 'v3-empile-legende' }, STATUTS.map((k) =>
      el('span', {}, el('i', { style: `--c:${vue.palette.statut[k]}` }), `${LIBELLES_STATUT[k]} ${statuts[k] ?? 0}`),
    )),
  )
}

export function creerRenduFiche(squelette: () => Squelette | null) {
  return (u: number, vue: VueGraphe): HTMLElement => {
    const { h, palette: pal } = vue
    const n = h.noeudDe(u)
    const S = squelette()
    if (n) {
      const coul = pal.statut[n.statut]
      const c = n.confiance
      const rangPct = S ? Math.max(1, Math.round((1 - S.rang[u]!) * 100)) : null
      let ligneSquelette: HTMLElement | null = null
      if (S && S.actif) {
        ligneSquelette = S.cle[u]
          ? el('div', { class: 'v3-fiche-squelette' }, el('b', {}, '✦ Nœud clé'), S.nbAbsorbes[u]! ? ` · rassemble ${S.nbAbsorbes[u]} nœud(s) replié(s)` : '', S.nbAbsorbes[u]! ? el('em', {}, ' — double-clic pour les faire sortir') : '')
          : el('div', { class: 'v3-fiche-squelette' }, `Rattaché à « ${h.noeuds[S.cible[u]!]!.nom} »`)
      }
      return el(
        'div',
        { class: 'v3-fiche' },
        el('div', { class: 'v3-fiche-titre' }, el('i', { class: 'v3-astre', style: `--c:${coul}` }), el('span', {}, n.nom)),
        el('div', { class: 'v3-fiche-chemin' }, n.categorie.join(' › ')),
        el('div', { class: 'v3-puces' },
          el('span', { class: 'v3-puce', style: `--c:${coul}` }, LIBELLES_STATUT[n.statut]),
          el('span', { class: `v3-puce validation-${n.validation}`, style: `--c:${pal.validation[n.validation]}` }, `${ICONES_VALIDATION[n.validation]} ${n.validation === 'aucune' ? 'non validé' : `validé ${LIBELLES_VALIDATION[n.validation]}`}`),
          el('span', { class: 'v3-puce neutre' }, `${LIBELLES_TYPE[n.type]} · ${LIBELLES_ORIGINE[n.origine]}`),
        ),
        el('div', { class: 'v3-fiche-sous' }, 'Confiance'),
        confianceLumineuse(c.bas, c.estimation, c.haut, coul),
        el('dl', { class: 'v3-fiche-grille' },
          el('dt', {}, 'Créé'), el('dd', {}, `${formaterDate(h.dates[u]!)} · session ${n.session}`),
          el('dt', {}, 'Liens'), el('dd', {}, `${h.premisses[u]!.length} prémisse(s) · ${h.utilisePar[u]!.length} usage(s) direct(s)`),
          el('dt', {}, 'Portée'), el('dd', {}, `${h.importance[u]} descendant(s)${rangPct !== null ? ` · top ${rangPct} %` : ''}`),
        ),
        ligneSquelette,
        el('div', { class: 'v3-fiche-aide' }, 'Clic : lignée animée · Échap : effacer'),
      )
    }
    const cat = h.categorieDe(u)!
    const s = statistiquesCategorie(h, cat.index, vue.filtres.actives)
    const coul = pal.domaines[cat.domaine % pal.domaines.length]!
    return el(
      'div',
      { class: 'v3-fiche' },
      el('div', { class: 'v3-fiche-titre' }, el('i', { class: 'v3-astre grand', style: `--c:${coul}` }), el('span', {}, cat.nom)),
      el('div', { class: 'v3-fiche-chemin' }, `${NOMS_NIVEAUX[cat.niveau].replace(/s$/, '')}${cat.chemin.length > 1 ? ` · ${cat.chemin.slice(0, -1).join(' › ')}` : ''}`),
      el('div', { class: 'v3-fiche-compte' }, el('strong', {}, String(s.nbActives)), ` nœud(s)${s.nbActives !== s.nb ? ` sur ${s.nb}` : ''}`),
      barreStatutsLumineuse(vue, s.statuts),
      s.nbActives
        ? el('dl', { class: 'v3-fiche-grille' },
            el('dt', {}, 'Période'), el('dd', {}, `${formaterDateCourte(s.dateMin)} → ${formaterDate(s.dateMax)}`),
            el('dt', {}, 'Confiance'), el('dd', {}, el('span', { class: 'v3-mini-conf' }, el('i', { style: `width:${s.confianceMoyenne * 100}%;--c:${coul}` })), ` ${formaterNombre(s.confianceMoyenne)} en moyenne`),
            el('dt', {}, 'IA + humain'), el('dd', {}, `${s.validations.ia_humain} validé(s) ✦`),
          )
        : null,
      s.principales.length
        ? el('div', { class: 'v3-fiche-principaux' }, el('div', { class: 'v3-fiche-sous' }, 'Astres principaux'),
            el('ol', {}, s.principales.slice(0, 3).map((f) => el('li', {}, el('i', { class: 'v3-astre petit', style: `--c:${pal.statut[h.noeuds[f]!.statut]}` }), h.noeuds[f]!.nom))))
        : null,
      el('div', { class: 'v3-fiche-aide' }, 'Double-clic : ouvrir (les nœuds en jaillissent) · Alt + double-clic : replier'),
    )
  }
}
