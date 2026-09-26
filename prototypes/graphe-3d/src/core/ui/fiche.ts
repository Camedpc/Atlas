// Fiche de survol (nœud et agrégat). Le contenu par défaut est remplaçable via `rendreFiche`.

import type { VueGraphe } from '../index'
import { LIBELLES_ORIGINE, LIBELLES_STATUT, LIBELLES_TYPE, LIBELLES_VALIDATION, STATUTS } from '../donnees'
import { NOMS_NIVEAUX, statistiquesCategorie } from '../hierarchie'
import { el, formaterDate, formaterDateCourte, formaterNombre } from './dom'

/** Rendu personnalisé : renvoyer un élément, du HTML, ou null pour ne rien afficher. */
export type RenduFiche = (unite: number, vue: VueGraphe, defaut: () => HTMLElement) => HTMLElement | string | null

export class Fiche {
  readonly element: HTMLDivElement
  private unite: number | null = null

  constructor(parent: HTMLElement) {
    this.element = el('div', { class: 'atlas-fiche', role: 'tooltip' })
    parent.appendChild(this.element)
  }

  get uniteAffichee(): number | null {
    return this.unite
  }

  afficher(unite: number, contenu: HTMLElement | string | null): void {
    this.unite = unite
    if (contenu === null) return this.masquer()
    this.element.replaceChildren()
    if (typeof contenu === 'string') this.element.innerHTML = contenu
    else this.element.appendChild(contenu)
    this.element.classList.add('visible')
  }

  /** Place la fiche près du point (x, y), en restant dans le conteneur. */
  positionner(x: number, y: number, largeur: number, hauteur: number): void {
    const r = this.element.getBoundingClientRect()
    let px = x + 16, py = y + 16
    if (px + r.width > largeur - 8) px = x - r.width - 16
    if (py + r.height > hauteur - 8) py = Math.max(8, hauteur - r.height - 8)
    this.element.style.transform = `translate(${Math.max(8, px)}px, ${py}px)`
  }

  masquer(): void {
    this.unite = null
    this.element.classList.remove('visible')
  }
}

/** Barre d'intervalle de confiance : [bas, haut] avec l'estimation marquée. */
export function barreConfiance(bas: number, estimation: number, haut: number, couleur: string): HTMLElement {
  return el(
    'div',
    { class: 'atlas-confiance' },
    el(
      'div',
      { class: 'atlas-confiance-piste' },
      el('div', { class: 'atlas-confiance-intervalle', style: `left:${bas * 100}%;width:${Math.max(1, (haut - bas) * 100)}%;background:${couleur}` }),
      el('div', { class: 'atlas-confiance-estimation', style: `left:${estimation * 100}%` }),
    ),
    el('span', { class: 'atlas-confiance-texte' }, `${formaterNombre(estimation)} [${formaterNombre(bas)} – ${formaterNombre(haut)}]`),
  )
}

/** Barre empilée de répartition des statuts. */
export function barreStatuts(vue: VueGraphe, statuts: Record<string, number>): HTMLElement {
  const total = STATUTS.reduce((s, k) => s + (statuts[k] ?? 0), 0) || 1
  return el(
    'div',
    { class: 'atlas-empile' },
    el('div', { class: 'atlas-empile-barre' }, STATUTS.map((k) =>
      el('span', { style: `width:${((statuts[k] ?? 0) / total) * 100}%;background:${vue.palette.statut[k]}`, title: `${LIBELLES_STATUT[k]} : ${statuts[k]}` }),
    )),
    el('div', { class: 'atlas-empile-legende' }, STATUTS.map((k) =>
      el('span', {}, el('i', { style: `background:${vue.palette.statut[k]}` }), `${LIBELLES_STATUT[k]} ${statuts[k] ?? 0}`),
    )),
  )
}

export function ficheParDefaut(vue: VueGraphe, u: number): HTMLElement {
  const { h } = vue
  const n = h.noeudDe(u)
  if (n) {
    const f = u
    const coul = vue.palette.statut[n.statut]
    return el(
      'div',
      { class: 'atlas-fiche-contenu' },
      el('div', { class: 'atlas-fiche-titre' }, el('i', { class: 'atlas-pastille', style: `background:${coul}` }), n.nom),
      el('div', { class: 'atlas-fiche-chemin' }, n.categorie.join(' › ')),
      el(
        'dl',
        { class: 'atlas-fiche-grille' },
        el('dt', {}, 'Type'), el('dd', {}, `${LIBELLES_TYPE[n.type]} · ${LIBELLES_ORIGINE[n.origine]}`),
        el('dt', {}, 'Créé le'), el('dd', {}, `${formaterDate(h.dates[f]!)} · session ${n.session}`),
        el('dt', {}, 'Statut'), el('dd', {}, `${LIBELLES_STATUT[n.statut]} · validé par : ${LIBELLES_VALIDATION[n.validation]}`),
        el('dt', {}, 'Liens'), el('dd', {}, `${h.premisses[f]!.length} prémisse(s) · ${h.importance[f]} descendant(s)`),
      ),
      barreConfiance(n.confiance.bas, n.confiance.estimation, n.confiance.haut, coul),
    )
  }
  const c = h.categorieDe(u)!
  const s = statistiquesCategorie(h, c.index, vue.filtres.actives)
  return el(
    'div',
    { class: 'atlas-fiche-contenu' },
    el('div', { class: 'atlas-fiche-titre' }, el('i', { class: 'atlas-pastille grande', style: `background:${vue.palette.domaines[c.domaine % vue.palette.domaines.length]}` }), c.nom),
    el('div', { class: 'atlas-fiche-chemin' }, `${NOMS_NIVEAUX[c.niveau].replace(/s$/, '')} · ${c.chemin.slice(0, -1).join(' › ') || 'racine'}`),
    el('div', { class: 'atlas-fiche-compte' }, el('strong', {}, String(s.nbActives)), ` nœud(s)${s.nbActives !== s.nb ? ` sur ${s.nb}` : ''}`),
    barreStatuts(vue, s.statuts),
    s.nbActives
      ? el('dl', { class: 'atlas-fiche-grille' },
          el('dt', {}, 'Période'), el('dd', {}, `${formaterDateCourte(s.dateMin)} → ${formaterDate(s.dateMax)}`),
          el('dt', {}, 'Confiance'), el('dd', {}, `moyenne ${formaterNombre(s.confianceMoyenne)}`),
        )
      : null,
    s.principales.length
      ? el('div', { class: 'atlas-fiche-principaux' }, el('span', {}, 'Principaux'), el('ol', {}, s.principales.slice(0, 3).map((f) => el('li', {}, h.noeuds[f]!.nom))))
      : null,
    el('div', { class: 'atlas-fiche-aide' }, 'Double-clic : ouvrir · Alt + double-clic : replier'),
  )
}
