// Curseur de granularité : glisser fait défiler la transition en continu ; − / + animent.

import type { VueGraphe } from '../index'
import { NOMS_NIVEAUX } from '../hierarchie'
import { el } from './dom'

export class CurseurGranularite {
  readonly element: HTMLElement
  private curseur: HTMLInputElement
  private valeur: HTMLElement
  private annuler: HTMLButtonElement
  private glisse = false

  constructor(parent: HTMLElement, private vue: VueGraphe) {
    this.curseur = el('input', { type: 'range', min: 0, max: 3, step: 0.001, value: vue.granularite.globale, 'aria-label': 'Granularité' })
    this.valeur = el('span', { class: 'atlas-gran-valeur' })
    this.annuler = el('button', { class: 'atlas-lien', type: 'button', title: 'Revenir à la granularité globale partout' }, 'annuler les ouvertures locales')
    this.annuler.addEventListener('click', () => {
      vue.granularite.reinitialiserLocales()
      vue.demanderRendu()
    })
    const pas = (d: 1 | -1) => el('button', { class: 'atlas-gran-pas', type: 'button', title: d > 0 ? 'Affiner ( ] )' : 'Agréger ( [ )', onclick: () => vue.pasGranularite(d) }, d > 0 ? '+' : '−')
    this.element = el(
      'div',
      { class: 'atlas-gran' },
      el('div', { class: 'atlas-gran-entete' }, el('span', {}, 'Granularité'), this.valeur),
      el('div', { class: 'atlas-gran-ligne' }, pas(-1), this.curseur, pas(1)),
      el('div', { class: 'atlas-gran-graduations' }, NOMS_NIVEAUX.map((n) => el('span', {}, n))),
      this.annuler,
    )
    parent.appendChild(this.element)
    this.curseur.addEventListener('input', () => {
      this.glisse = true
      vue.definirGranularite(Number(this.curseur.value), false)
    })
    this.curseur.addEventListener('change', () => {
      this.glisse = false
      // Aimantation douce vers le niveau entier le plus proche.
      const v = Number(this.curseur.value)
      const r = Math.round(v)
      if (Math.abs(v - r) < 0.06) vue.definirGranularite(r, true)
    })
    vue.on('granularite', () => this.maj())
    this.maj()
  }

  private maj(): void {
    const g = this.vue.granularite.globale
    if (!this.glisse) this.curseur.value = String(g)
    const n = Math.min(3, Math.round(g))
    this.valeur.textContent = Math.abs(g - n) < 0.01 ? NOMS_NIVEAUX[n] : `${NOMS_NIVEAUX[Math.floor(g)]} → ${NOMS_NIVEAUX[Math.min(3, Math.floor(g) + 1)]} (${Math.round((g % 1) * 100)} %)`
    this.annuler.style.visibility = this.vue.granularite.aDesSurcharges ? 'visible' : 'hidden'
  }
}
