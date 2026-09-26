// En-tête de viewport (façon Blender) : panneau, menus Vue / Sélection / Granularité, nom de la vue
// courante, curseur de granularité compact, bascules 2D/3D, faces sémantiques / cube strict,
// ortho / persp, thème. Plus la surimpression d'état en haut à gauche et le menu radial des vues.

import { el, LIBELLES_VUES, NOMS_NIVEAUX, formaterNombre, type NomVue, type VueGraphe } from '../../src/core'
import { MenuRadial } from '../../src/core/ui/barre'
import { etat } from './axes'
import type { Echelles } from './echelles'

export interface Pilote {
  vue: VueGraphe
  ech: Echelles
  regroupement: 'categories' | 'cases'
  nomsNiveaux: readonly string[]
  basculerPanneau: (onglet?: string) => void
  panneauOuvert: () => boolean
  changerRegroupement: (mode: 'categories' | 'cases') => void
}

interface ItemMenu {
  libelle: string
  touche?: string
  action?: () => void
  coche?: boolean
  inactif?: boolean
  titre?: boolean
}
const SEP: ItemMenu = { libelle: '—' }

// ─── Nom de la vue (façon Blender) ───────────────────────────────────────────

export function nomVue(vue: VueGraphe): string {
  const c = vue.camera.vueCourante(1)
  const proj = vue.camera.perspective > 0.5 ? 'perspective' : 'orthographique'
  if (!c || c === 'iso') return `Utilisateur ${proj}`
  return `${LIBELLES_VUES[c]} ${proj}`
}

// ─── Menus déroulants ───────────────────────────────────────────────────────

let menuOuvert: { fermer: () => void } | null = null

function menu(titre: string, items: () => ItemMenu[]): HTMLElement {
  const bouton = el('button', { type: 'button', class: 'v4-menu-bouton' }, titre)
  const liste = el('div', { class: 'v4-menu-liste', role: 'menu' })
  const racine = el('div', { class: 'v4-menu' }, bouton, liste)
  const fermer = () => {
    racine.classList.remove('ouvert')
    if (menuOuvert?.fermer === fermer) menuOuvert = null
  }
  const ouvrir = () => {
    menuOuvert?.fermer()
    liste.replaceChildren(
      ...items().map((it) => {
        if (it === SEP) return el('div', { class: 'v4-menu-sep' })
        if (it.titre) return el('div', { class: 'v4-menu-titre' }, it.libelle)
        const b = el('button', { type: 'button', class: `v4-menu-item${it.coche ? ' coche' : ''}`, disabled: it.inactif === true, role: 'menuitem' },
          el('span', { class: 'v4-coche' }, it.coche ? '✓' : ''),
          el('span', { class: 'v4-menu-libelle' }, it.libelle),
          it.touche ? el('kbd', {}, it.touche) : null,
        )
        b.addEventListener('click', () => {
          fermer()
          it.action?.()
        })
        return b
      }),
    )
    racine.classList.add('ouvert')
    menuOuvert = { fermer }
  }
  bouton.addEventListener('click', (e) => {
    e.stopPropagation()
    if (racine.classList.contains('ouvert')) fermer()
    else ouvrir()
  })
  // Survoler un autre menu pendant qu'un menu est ouvert l'ouvre (comme une barre de menus).
  bouton.addEventListener('pointerenter', () => {
    if (menuOuvert && !racine.classList.contains('ouvert')) ouvrir()
  })
  return racine
}

function fermerMenus(): void {
  menuOuvert?.fermer()
}

// ─── En-tête ─────────────────────────────────────────────────────────────────

export function construireEntete(p: Pilote): { element: HTMLElement; detruire: () => void } {
  const { vue } = p
  const R = vue.reglages
  const vues = (nom: NomVue, touche: string): ItemMenu => ({
    libelle: LIBELLES_VUES[nom], touche, coche: vue.camera.vueCourante(1) === nom, action: () => vue.allerVue(nom),
  })
  const menuVue = menu('Vue', () => [
    { libelle: 'Faces', titre: true },
    vues('dessus', '7'), vues('face', '1'), vues('droite', '3'), vues('iso', ''),
    vues('dessous', 'Ctrl 7'), vues('arriere', 'Ctrl 1'), vues('gauche', 'Ctrl 3'),
    { libelle: 'Vue opposée', touche: '9', action: () => { vue.camera.opposee(R.valeurs.dureeVues); vue.demanderRendu() } },
    SEP,
    { libelle: 'Perspective', touche: '5', coche: vue.camera.perspective > 0.5, inactif: vue.mode === '2d', action: () => { vue.camera.basculerProjection(); vue.demanderRendu() } },
    { libelle: 'Navigation 3D (orbite libre)', coche: vue.mode === '3d', action: () => vue.definirMode(vue.mode === '3d' ? '2d' : '3d') },
    { libelle: 'Cube strict (axes fixes)', coche: R.valeurs.mode3D === 'cube', action: () => R.definir('mode3D', R.valeurs.mode3D === 'cube' ? 'faces' : 'cube') },
    SEP,
    { libelle: 'Tout cadrer', touche: '⌂', action: () => vue.cadrerTout() },
    { libelle: 'Cadrer la sélection', touche: '.', action: () => vue.cadrerSelection() },
    { libelle: 'Menu circulaire des vues', touche: '`', action: () => vue.ui.menu?.ouvrir(vue.rendu.largeur / 2, vue.rendu.hauteur / 2) },
  ])
  const menuSelection = menu('Sélection', () => {
    const sel = vue.lignee.selection
    const agr = sel !== null && vue.h.estAgregat(sel)
    return [
      { libelle: sel === null ? 'Aucune sélection' : vue.h.nom(sel), titre: true },
      { libelle: 'Effacer la sélection', touche: 'Échap', inactif: sel === null, action: () => vue.selectionner(null) },
      { libelle: 'Cadrer la lignée', touche: '.', inactif: sel === null, action: () => vue.cadrerSelection() },
      { libelle: 'Inclure les descendants', coche: R.valeurs.descendants, action: () => R.definir('descendants', !R.valeurs.descendants) },
      SEP,
      { libelle: "Ouvrir l'agrégat", touche: 'double-clic', inactif: !agr, action: () => sel !== null && vue.ouvrir(sel) },
      { libelle: 'Replier dans le parent', touche: 'Alt double-clic', inactif: sel === null, action: () => sel !== null && vue.replier(sel) },
      { libelle: 'Annuler les ouvertures locales', inactif: !vue.granularite.aDesSurcharges, action: () => { vue.granularite.reinitialiserLocales(); vue.demanderRendu() } },
      SEP,
      { libelle: 'Détail dans le panneau', action: () => p.basculerPanneau('element') },
    ]
  })
  const menuGranularite = menu('Granularité', () => {
    const g = vue.granularite.globale
    return [
      { libelle: 'Niveau global', titre: true },
      ...p.nomsNiveaux.map((n, i) => ({ libelle: n, coche: Math.abs(g - i) < 0.01, action: () => vue.definirGranularite(i) })),
      { libelle: 'Agréger', touche: '[', inactif: g <= 0, action: () => vue.pasGranularite(-1) },
      { libelle: 'Affiner', touche: ']', inactif: g >= 3, action: () => vue.pasGranularite(1) },
      SEP,
      { libelle: 'Regroupement', titre: true },
      { libelle: 'Catégories thématiques', coche: p.regroupement === 'categories', action: () => p.changerRegroupement('categories') },
      { libelle: 'Cases période × type', coche: p.regroupement === 'cases', action: () => p.changerRegroupement('cases') },
      { libelle: 'Réglages des cases…', action: () => p.basculerPanneau('outils') },
      SEP,
      { libelle: 'Annuler les ouvertures locales', inactif: !vue.granularite.aDesSurcharges, action: () => { vue.granularite.reinitialiserLocales(); vue.demanderRendu() } },
    ]
  })

  // Bascules segmentées.
  const segment = (options: [string, string, string][], actif: () => string, choisir: (v: string) => void) => {
    const boutons = options.map(([v, texte, titre]) => {
      const b = el('button', { type: 'button', title: titre }, texte)
      b.addEventListener('click', () => choisir(v))
      return { b, v }
    })
    return {
      element: el('div', { class: 'v4-segment' }, boutons.map((x) => x.b)),
      maj: () => boutons.forEach(({ b, v }) => b.classList.toggle('actif', actif() === v)),
    }
  }
  const segMode = segment([['2d', '2D', 'Verrouillé sur une face (orthographique)'], ['3d', '3D', 'Orbite libre, perspective automatique']], () => vue.mode, (v) => vue.definirMode(v as '2d' | '3d'))
  const segPlacement = segment([['faces', 'Faces sémantiques', 'Chaque face a sa disposition ; les points glissent en tournant'], ['cube', 'Cube strict', 'X = temps, Y = type, Z = thème, fixes']], () => R.valeurs.mode3D, (v) => R.definir('mode3D', v))
  const segProj = segment([['ortho', 'Ortho', 'Orthographique (5)'], ['persp', 'Persp', 'Perspective (5)']], () => (vue.camera.perspective > 0.5 ? 'persp' : 'ortho'), (v) => {
    if (vue.mode === '2d' && v === 'persp') vue.definirMode('3d')
    vue.camera.mode = v === 'persp' ? 'persp' : 'ortho'
    vue.camera.version++
    vue.demanderRendu()
  })

  const nom = el('div', { class: 'v4-nom-vue' })
  const boutonPanneau = el('button', { type: 'button', class: 'v4-bouton-panneau', title: 'Panneau latéral (Élément, Vue, Filtres, Outils)', 'aria-label': 'Panneau latéral' }, el('span', {}), el('span', {}), el('span', {}))
  boutonPanneau.addEventListener('click', () => p.basculerPanneau())

  // Curseur de granularité compact : glisser fait défiler la transition.
  const curseur = el('input', { type: 'range', min: 0, max: 3, step: 0.001, value: vue.granularite.globale, 'aria-label': 'Granularité', class: 'v4-curseur' })
  const valeurGran = el('span', { class: 'v4-gran-valeur' })
  let glisse = false
  curseur.addEventListener('input', () => {
    glisse = true
    vue.definirGranularite(Number(curseur.value), false)
  })
  curseur.addEventListener('change', () => {
    glisse = false
    const v = Number(curseur.value), r = Math.round(v)
    if (Math.abs(v - r) < 0.06) vue.definirGranularite(r, true)
  })
  const majGran = () => {
    const g = vue.granularite.globale
    if (!glisse) curseur.value = String(g)
    const n = Math.min(3, Math.round(g))
    valeurGran.textContent = Math.abs(g - n) < 0.01 ? p.nomsNiveaux[n]! : `${g.toFixed(2)}`
  }

  const theme = el('button', { type: 'button', class: 'v4-icone', title: 'Thème clair / sombre' })
  theme.addEventListener('click', () => vue.definirTheme(R.valeurs.theme === 'clair' ? 'sombre' : 'clair'))
  const aide = el('button', { type: 'button', class: 'v4-icone', title: 'Raccourcis' }, '?')
  const panneauAide = construireAide()
  aide.addEventListener('click', (e) => {
    e.stopPropagation()
    panneauAide.classList.toggle('visible')
  })

  const element = el('header', { class: 'v4-entete' },
    el('div', { class: 'v4-groupe' }, boutonPanneau, el('a', { class: 'v4-marque', href: '../../index.html', title: 'Retour au catalogue des variantes' }, el('b', {}, 'Atlas'), el('span', {}, 'instrument'))),
    el('div', { class: 'v4-groupe v4-menus' }, menuVue, menuSelection, menuGranularite),
    nom,
    el('div', { class: 'v4-espace' }),
    el('div', { class: 'v4-groupe v4-gran', title: 'Granularité globale ( [ et ] )' }, el('span', { class: 'v4-etiquette' }, 'Granularité'), curseur, valeurGran),
    el('div', { class: 'v4-groupe' }, segMode.element, segProj.element),
    el('div', { class: 'v4-groupe v4-placement' }, segPlacement.element),
    el('div', { class: 'v4-groupe' }, theme, aide),
  )
  vue.interface.append(element, panneauAide)

  let signature = ''
  const maj = () => {
    const n = nomVue(vue)
    const s = `${n}|${vue.mode}|${R.valeurs.mode3D}|${vue.camera.perspective > 0.5}|${R.valeurs.theme}|${p.panneauOuvert()}`
    if (s === signature) return
    signature = s
    nom.textContent = n
    segMode.maj()
    segPlacement.maj()
    segProj.maj()
    theme.textContent = R.valeurs.theme === 'clair' ? '☾' : '☀'
    boutonPanneau.classList.toggle('actif', p.panneauOuvert())
  }
  const desabonnements = [
    vue.on('image', maj), vue.on('vue', maj), vue.on('reglage', maj), vue.on('theme', maj),
    vue.on('granularite', majGran),
  ]
  const clicDehors = (e: PointerEvent) => {
    if (!(e.target as HTMLElement).closest?.('.v4-menu')) fermerMenus()
    if (!(e.target as HTMLElement).closest?.('.v4-aide')) panneauAide.classList.remove('visible')
  }
  const echap = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      fermerMenus()
      panneauAide.classList.remove('visible')
    }
  }
  window.addEventListener('pointerdown', clicDehors, true)
  window.addEventListener('keydown', echap)
  maj()
  majGran()
  return {
    element,
    detruire: () => {
      desabonnements.forEach((f) => f())
      window.removeEventListener('pointerdown', clicDehors, true)
      window.removeEventListener('keydown', echap)
    },
  }
}

function construireAide(): HTMLElement {
  const l = (t: string, d: string) => el('div', { class: 'v4-aide-ligne' }, el('kbd', {}, t), el('span', {}, d))
  return el('div', { class: 'v4-aide' },
    el('div', { class: 'v4-aide-titre' }, 'Raccourcis (façon Blender)'),
    el('div', { class: 'v4-aide-grille' },
      l('7 · 1 · 3', 'dessus · face · droite'),
      l('Ctrl/Alt + chiffre', 'face opposée'),
      l('9', 'vue opposée'),
      l('2 4 6 8', 'orbite par pas de 15°'),
      l('5', 'ortho / perspective'),
      l('` ou ²', 'menu circulaire des vues'),
      l('Home · .', 'tout cadrer · cadrer la sélection'),
      l('[ · ]', 'agréger · affiner'),
      l('Milieu / clic droit', 'orbiter'),
      l('Maj + milieu', 'déplacer'),
      l('Molette', 'zoom vers le curseur'),
      l('Alt + clic gauche', '= bouton du milieu'),
      l('Clic', 'lignée · Échap : effacer'),
      l('Double-clic', 'ouvrir un agrégat · Alt : replier'),
    ),
  )
}

// ─── Surimpression d'état (coin haut gauche du viewport) ────────────────────

export function construireSurimpression(p: Pilote): { element: HTMLElement; detruire: () => void } {
  const { vue } = p
  const ligne1 = el('div', { class: 'v4-surimp-titre' })
  const ligne2 = el('div', { class: 'v4-surimp-ligne' })
  const ligne3 = el('div', { class: 'v4-surimp-ligne v4-mono' })
  const element = el('div', { class: 'v4-surimp' }, ligne1, ligne2, ligne3)
  vue.interface.appendChild(element)
  let signature = ''
  const maj = () => {
    const g = vue.granularite.globale
    const n = Math.min(3, Math.round(g))
    const niveau = Math.abs(g - n) < 0.01 ? `(${n}) ${p.nomsNiveaux[n]}` : `(${g.toFixed(2)}) transition`
    const placement = vue.reglages.valeurs.mode3D === 'cube' ? 'cube strict' : 'faces sémantiques'
    const actifs = vue.filtres.nbActives
    // Échelle lue sur l'axe du temps (ou en unités monde).
    let echelle: string
    const k = vue.camera.pixelsParUnite()
    if (etat.sem.temps > 0.5 && Math.abs(vue.camera.avant[0]) < 0.9) {
      const pxJour = k * p.ech.uniteJour * Math.sqrt(1 - vue.camera.avant[0] ** 2)
      echelle = pxJour * 7 >= 30 ? `1 semaine ≈ ${Math.round(pxJour * 7)} px` : `1 mois ≈ ${Math.round(pxJour * 30.4)} px`
    } else echelle = `1 unité ≈ ${Math.round(k)} px`
    const s = `${nomVue(vue)}|${niveau}|${placement}|${actifs}|${echelle}|${p.regroupement}`
    if (s === signature) return
    signature = s
    ligne1.textContent = nomVue(vue)
    ligne2.textContent = `${niveau} · ${formaterNombre(actifs)} / ${formaterNombre(vue.h.nF)} nœuds · ${placement}${p.regroupement === 'cases' ? ' · cases' : ''}`
    ligne3.textContent = `échelle : ${echelle}`
  }
  const des = [vue.on('image', maj), vue.on('filtres', maj), vue.on('granularite', maj)]
  maj()
  return { element, detruire: () => des.forEach((f) => f()) }
}

// ─── Menu radial des vues ───────────────────────────────────────────────────

interface Part {
  nom: string
  touche: string
  angle: number
  action: () => void
}

/** Menu circulaire (touche `) : 8 directions, la direction du pointeur présélectionne une part. */
export class MenuRadialInstrument extends MenuRadial {
  private parts: Part[] = []
  private boutons: HTMLButtonElement[] = []
  private centre = { x: 0, y: 0 }
  private choisie = -1
  private aiguille: SVGLineElement | null = null

  constructor(parent: HTMLElement, private vueI: VueGraphe) {
    super(parent, vueI)
    this.element.classList.add('v4-pie')
    this.element.addEventListener('pointermove', (e) => this.suivre(e))
    this.element.addEventListener('pointerdown', (e) => {
      if (e.target !== this.element && !(e.target as Element).closest('.v4-pie-centre')) return
      const i = this.choisie
      if (i >= 0) this.parts[i]!.action()
      this.fermer()
    })
  }

  override ouvrir(x: number, y: number): void {
    const v = this.vueI
    const W = v.rendu.largeur, H = v.rendu.hauteur
    const cx = Math.min(Math.max(x, 170), W - 170), cy = Math.min(Math.max(y, 150), H - 150)
    this.centre = { x: cx, y: cy }
    const aller = (n: NomVue) => () => v.allerVue(n)
    // Angles écran (0 = est, sens horaire car y descend).
    this.parts = [
      { nom: 'Droite', touche: '3', angle: 0, action: aller('droite') },
      { nom: 'Isométrique', touche: '', angle: 45, action: aller('iso') },
      { nom: 'Dessous', touche: 'Ctrl 7', angle: 90, action: aller('dessous') },
      { nom: 'Tout cadrer', touche: '⌂', angle: 135, action: () => v.cadrerTout() },
      { nom: 'Gauche', touche: 'Ctrl 3', angle: 180, action: aller('gauche') },
      { nom: 'Face', touche: '1', angle: 225, action: aller('face') },
      { nom: 'Dessus', touche: '7', angle: 270, action: aller('dessus') },
      { nom: 'Arrière', touche: 'Ctrl 1', angle: 315, action: aller('arriere') },
    ]
    const R = 118
    const courante = v.camera.vueCourante(1)
    const nomsVues: Record<string, NomVue> = { Droite: 'droite', Isométrique: 'iso', Dessous: 'dessous', Gauche: 'gauche', Face: 'face', Dessus: 'dessus', Arrière: 'arriere' }
    this.boutons = this.parts.map((p, i) => {
      const a = (p.angle * Math.PI) / 180
      const dx = Math.cos(a) * R, dy = Math.sin(a) * R
      const b = el('button', { type: 'button', class: `v4-pie-part${nomsVues[p.nom] === courante ? ' courante' : ''}`, style: `left:${cx + dx}px;top:${cy + dy}px;--dx:${-dx}px;--dy:${-dy}px;transition-delay:${i * 12}ms` },
        el('span', {}, p.nom), p.touche ? el('kbd', {}, p.touche) : null)
      b.addEventListener('pointerenter', () => this.marquer(i))
      b.addEventListener('click', () => {
        p.action()
        this.fermer()
      })
      return b
    })
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('class', 'v4-pie-centre')
    svg.setAttribute('width', '64')
    svg.setAttribute('height', '64')
    svg.setAttribute('viewBox', '-32 -32 64 64')
    svg.style.left = `${cx}px`
    svg.style.top = `${cy}px`
    const cercle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    cercle.setAttribute('r', '22')
    const point = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    point.setAttribute('r', '2.5')
    point.setAttribute('class', 'point')
    const aiguille = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    aiguille.setAttribute('x1', '0')
    aiguille.setAttribute('y1', '0')
    aiguille.setAttribute('x2', '0')
    aiguille.setAttribute('y2', '0')
    svg.append(cercle, aiguille, point)
    this.aiguille = aiguille
    this.choisie = -1
    this.element.replaceChildren(svg, ...this.boutons, el('div', { class: 'v4-pie-legende', style: `left:${cx}px;top:${cy + R + 40}px` }, 'Vues · clic ou direction + clic · Échap'))
    this.element.classList.add('visible')
    // Laisse le navigateur poser l'état initial avant d'animer la sortie des parts.
    requestAnimationFrame(() => this.element.classList.add('deploye'))
  }

  override fermer(): void {
    this.element.classList.remove('deploye')
    super.fermer()
  }

  private suivre(e: PointerEvent): void {
    if (!this.ouvert) return
    const r = this.element.getBoundingClientRect()
    const dx = e.clientX - r.left - this.centre.x, dy = e.clientY - r.top - this.centre.y
    const d = Math.hypot(dx, dy)
    if (this.aiguille) {
      const k = Math.min(1, d / 22)
      this.aiguille.setAttribute('x2', String((dx / (d || 1)) * 22 * k))
      this.aiguille.setAttribute('y2', String((dy / (d || 1)) * 22 * k))
    }
    if (d < 20) return this.marquer(-1)
    let a = (Math.atan2(dy, dx) * 180) / Math.PI
    if (a < 0) a += 360
    this.marquer(Math.round(a / 45) % 8)
  }

  private marquer(i: number): void {
    this.choisie = i
    this.boutons.forEach((b, k) => b.classList.toggle('choisie', k === i))
  }
}

export const NIVEAUX_CATEGORIES = NOMS_NIVEAUX
