// Barre de vues (haut) : faces, 2D / 3D, ortho / persp, cadrage, aide ; et menu radial des vues.

import type { VueGraphe } from '../index'
import { LIBELLES_VUES, type NomVue } from '../camera3d'
import { el } from './dom'

export class BarreVues {
  readonly element: HTMLElement
  private boutonsVue = new Map<NomVue, HTMLButtonElement>()
  private boutonMode: HTMLButtonElement
  private boutonProj: HTMLButtonElement
  private aide: HTMLElement

  constructor(parent: HTMLElement, private vue: VueGraphe) {
    const vues: [NomVue, string][] = [['dessus', '7'], ['face', '1'], ['droite', '3'], ['iso', '']]
    const boutons = vues.map(([nom, touche]) => {
      const b = el('button', { type: 'button', title: touche ? `${LIBELLES_VUES[nom]} (${touche})` : LIBELLES_VUES[nom] }, LIBELLES_VUES[nom], touche ? el('kbd', {}, touche) : null)
      b.addEventListener('click', () => vue.allerVue(nom))
      this.boutonsVue.set(nom, b)
      return b
    })
    this.boutonMode = el('button', { type: 'button', class: 'atlas-bascule', title: '2D : verrouillé sur une face · 3D : orbite libre' })
    this.boutonMode.addEventListener('click', () => vue.definirMode(vue.mode === '3d' ? '2d' : '3d'))
    this.boutonProj = el('button', { type: 'button', title: 'Orthographique / perspective (5)' })
    this.boutonProj.addEventListener('click', () => {
      vue.camera.basculerProjection()
      vue.demanderRendu()
    })
    const cadrer = el('button', { type: 'button', title: 'Tout cadrer (Origine / Home)' }, 'Cadrer', el('kbd', {}, '⌂'))
    cadrer.addEventListener('click', () => vue.cadrerTout())
    this.aide = el('div', { class: 'atlas-aide' },
      el('h4', {}, 'Navigation (façon Blender)'),
      el('ul', {},
        el('li', {}, el('b', {}, 'Milieu'), ' ou ', el('b', {}, 'clic droit'), ' glissé : orbiter · ', el('b', {}, 'Maj'), ' + milieu : déplacer'),
        el('li', {}, el('b', {}, 'Molette'), ' / ', el('b', {}, 'Ctrl + milieu'), ' : zoom vers le curseur · ', el('b', {}, 'Alt + clic gauche'), ' = milieu'),
        el('li', {}, el('b', {}, 'Clic gauche'), ' glissé sur le fond : déplacer · clic : lignée · ', el('b', {}, 'Échap'), ' : effacer'),
        el('li', {}, el('b', {}, 'Double-clic'), ' agrégat : ouvrir · ', el('b', {}, 'Alt + double-clic'), ' : replier dans le parent'),
        el('li', {}, el('b', {}, '7 1 3'), ' dessus / face / droite · ', el('b', {}, 'Ctrl/Alt +'), ' opposée · ', el('b', {}, '9'), ' opposée'),
        el('li', {}, el('b', {}, '2 4 6 8'), ' orbite par 15° · ', el('b', {}, '5'), ' ortho/persp · ', el('b', {}, '.'), ' cadrer la sélection · ', el('b', {}, 'Home'), ' tout'),
        el('li', {}, el('b', {}, '[ ]'), ' granularité · ', el('b', {}, '²/`'), ' menu radial des vues'),
        el('li', {}, el('b', {}, 'Tactile'), ' : 1 doigt orbite (3D) / déplace (2D), pincer = zoom, rotation à 2 doigts, double tape = ouvrir'),
      ),
    )
    const boutonAide = el('button', { type: 'button', title: 'Raccourcis' }, '?')
    boutonAide.addEventListener('click', () => this.aide.classList.toggle('visible'))
    this.element = el('div', { class: 'atlas-barre' }, el('div', { class: 'atlas-barre-groupe' }, boutons), el('div', { class: 'atlas-barre-groupe' }, this.boutonMode, this.boutonProj), el('div', { class: 'atlas-barre-groupe' }, cadrer, boutonAide))
    parent.append(this.element, this.aide)
    vue.on('image', () => this.maj())
    vue.on('vue', () => this.maj())
    this.maj()
  }

  private etat = ''
  private maj(): void {
    const v = this.vue
    const courante = v.camera.vueCourante(1)
    const p = v.camera.perspective
    const etat = `${courante}|${v.mode}|${p > 0.5}`
    if (etat === this.etat) return
    this.etat = etat
    this.boutonsVue.forEach((b, nom) => b.classList.toggle('actif', courante === nom))
    this.boutonMode.textContent = v.mode === '3d' ? '3D' : '2D'
    this.boutonMode.classList.toggle('actif', v.mode === '3d')
    this.boutonProj.textContent = p > 0.5 ? 'Persp.' : 'Ortho.'
    this.boutonProj.disabled = v.mode === '2d'
  }
}

/** Menu radial des vues (touche ` ou ²). */
export class MenuRadial {
  readonly element: HTMLElement

  constructor(parent: HTMLElement, private vue: VueGraphe) {
    this.element = el('div', { class: 'atlas-radial' })
    parent.appendChild(this.element)
    this.element.addEventListener('pointerdown', (e) => {
      if (e.target === this.element) this.fermer()
    })
  }

  ouvrir(x: number, y: number): void {
    const choix: [string, () => void][] = [
      ['Dessus', () => this.vue.allerVue('dessus')],
      ['Droite', () => this.vue.allerVue('droite')],
      ['Isométrique', () => this.vue.allerVue('iso')],
      ['Face', () => this.vue.allerVue('face')],
      ['Dessous', () => this.vue.allerVue('dessous')],
      ['Gauche', () => this.vue.allerVue('gauche')],
      ['Cadrer', () => this.vue.cadrerTout()],
      ['Arrière', () => this.vue.allerVue('arriere')],
    ]
    const R = 92
    this.element.replaceChildren(
      ...choix.map(([nom, f], i) => {
        const a = -Math.PI / 2 + (i / choix.length) * Math.PI * 2
        const b = el('button', { type: 'button', style: `left:${x + Math.cos(a) * R}px;top:${y + Math.sin(a) * R}px` }, nom)
        b.addEventListener('click', () => {
          f()
          this.fermer()
        })
        return b
      }),
      el('div', { class: 'atlas-radial-centre', style: `left:${x}px;top:${y}px` }),
    )
    this.element.classList.add('visible')
  }

  fermer(): void {
    this.element.classList.remove('visible')
  }

  get ouvert(): boolean {
    return this.element.classList.contains('visible')
  }
}
