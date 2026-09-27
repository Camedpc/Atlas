// R37 (essai B) · Composition typographique : le texte des blocs est du HTML (Computer Modern + KaTeX)
// posé sur une couche DOM au-dessus des calques canvas, qui gardent la géométrie (cadres, liaisons).
//
// - Chaque bloc a son élément, construit une fois (cache par nœud, genre, largeur, taille) et mesuré
//   à l'échelle 1 (offsetHeight ignore les transformations) : la mise en page reçoit les hauteurs.
// - À chaque image, l'élément suit la projection du bloc : translate + scale depuis le coin haut gauche.
// - La légende de la figure (« Figure 1 – … ») est posée de même sous la figure.

import { LIBELLES_TYPE, type NoeudR, type VueRaisonnement } from '../../src/raisonnement'
import { formulePrincipale, katexHtml, nombreTex, texteHtml } from './formules'
import type { Boite, GenreBoite, MiseEnPage } from './mise-en-page'

/** Marge intérieure des blocs (px de mise en page). */
export const PAD = 5

export interface OptionsComposition {
  largeur: number
  taille: number
  formules: boolean
}

interface Element {
  racine: HTMLElement
  num: HTMLElement | null
  portee: HTMLElement | null
  nc: HTMLElement | null
  /** Dernier état écrit (évite les écritures DOM inutiles). */
  transform: string
  opacite: string
  affiche: boolean
  classes: string
}

const html = (tag: string, classe: string, contenu = ''): HTMLElement => {
  const e = document.createElement(tag)
  e.className = classe
  if (contenu) e.innerHTML = contenu
  return e
}

const echapper = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Validation en petites capitales (comme \textsc{ia+h}). */
export function texteValidation(n: NoeudR): string {
  return n.validation === 'aucune' ? '—' : n.validation === 'ia_humain' ? 'ia+h' : n.validation === 'humain' ? 'h' : 'ia'
}

/** Étiquette de type (bas de casse, affichée en petites capitales). */
export function etiquetteType(n: NoeudR, membres: number, genre: GenreBoite): string {
  if (n.piste === 'abandonnee' && genre !== 'decision') return membres > 1 ? `piste abandonnée, ${membres} énoncés` : 'piste abandonnée'
  const t = LIBELLES_TYPE[n.type].toLowerCase()
  if (genre === 'etape') return `sous-argument, ${membres} énoncés`
  if (membres > 1) return `${t} (+${membres - 1})`
  return t
}

export class Composition {
  readonly couche: HTMLElement
  readonly legende: HTMLElement
  private cache = new Map<string, Element>()
  private courants: (Element | null)[] = []
  private visibles = new Set<Element>()
  private etatLegende = { transform: '', affiche: false, opacite: '' }

  constructor(scene: HTMLElement) {
    this.couche = html('div', 'r37-couche')
    this.couche.setAttribute('aria-hidden', 'true')
    this.legende = html('div', 'r37-legende')
    this.couche.append(this.legende)
    scene.append(this.couche)
  }

  /** Oublie le cache (polices chargées, réglage de taille) : tout sera reconstruit et remesuré. */
  vider(): void {
    for (const e of this.cache.values()) {
      e.racine.remove()
      e.nc?.remove()
    }
    this.cache.clear()
    this.courants = []
    this.visibles.clear()
  }

  /** Hauteur (px de mise en page) du contenu d'un point ; construit l'élément au besoin. */
  mesurer(vue: VueRaisonnement, p: number, genre: GenreBoite, membres: number, o: OptionsComposition): number {
    const n = vue.lecture.justification.noeuds[p < vue.nU ? vue.lecture.unites[p]!.conclusion : vue.lecture.masques[p - vue.nU]!]!
    const cle = `${n.id}|${genre}|${membres}|${o.largeur}|${o.taille}|${o.formules ? 1 : 0}`
    let e = this.cache.get(cle)
    if (!e) {
      e = this.construire(n, genre, membres, o)
      this.cache.set(cle, e)
      this.couche.append(e.racine)
    }
    this.courants[p] = e
    if (!e.affiche) {
      e.racine.style.display = ''
      e.affiche = true
    }
    if (e.transform) {
      e.racine.style.transform = ''
      e.transform = ''
    }
    // Formule trop large : réduite pour tenir dans le bloc (comme \resizebox), au plus de 40 %.
    const eq = e.racine.querySelector<HTMLElement>('.r37-eq')
    if (eq) {
      eq.style.fontSize = ''
      const k = eq.clientWidth / Math.max(1, eq.scrollWidth)
      if (k < 1) eq.style.fontSize = `${Math.max(0.6, k * 0.98)}em`
    }
    return e.racine.offsetHeight
  }

  private construire(n: NoeudR, genre: GenreBoite, membres: number, o: OptionsComposition): Element {
    const abandon = n.piste === 'abandonnee'
    let racine: HTMLElement
    let num: HTMLElement | null = null
    let portee: HTMLElement | null = null
    let nc: HTMLElement | null = null
    if (genre === 'decision') {
      // Libellé au-dessus du losange ; alternative rejetée dessous (élément séparé).
      racine = html('div', 'r37-c r37-decision', texteHtml(n.nom))
      racine.style.width = `${o.largeur}px`
      const rejetees = n.decision?.alternatives.filter((a) => !a.retenue) ?? []
      if (rejetees.length) {
        nc = html('div', 'r37-c r37-nc', `${texteHtml(rejetees[0]!.libelle)}${rejetees.length > 1 ? ` <span class="r37-plus">(+${rejetees.length - 1})</span>` : ''}`)
        nc.style.width = `${o.largeur}px`
        this.couche.append(nc)
      }
    } else if (genre === 'drapeau') {
      // Hypothèse de modélisation, à la manière d'un énoncé \newtheorem : tête grasse, corps italique.
      racine = html('div', 'r37-c r37-hyp')
      racine.style.width = `${o.largeur - 2 * PAD}px`
      num = html('span', 'r37-num')
      const tete = html('span', 'r37-hyp-tete')
      tete.append('Hypothèse ', num)
      const corps = html('p', 'r37-hyp-corps')
      corps.append(tete, ' ', html('span', 'r37-hyp-nom', `(${texteHtml(n.nom)}).`), ' ', html('span', 'r37-hyp-texte', texteHtml(n.choix?.hypothese ?? n.enonce)))
      portee = html('span', 'r37-portee-n')
      const pied = html('div', 'r37-hyp-pied')
      pied.append('portée : ', portee)
      racine.append(corps, pied)
    } else {
      racine = html('div', `r37-c r37-bloc${genre === 'majeur' ? ' r37-majeur' : ''}${abandon ? ' r37-abandon' : ''}`)
      racine.style.width = `${o.largeur - 2 * PAD}px`
      num = html('span', 'r37-num')
      const tete = html('div', 'r37-tete')
      tete.append(html('span', 'r37-type', echapper(etiquetteType(n, membres, genre))), num)
      racine.append(tete, html('div', 'r37-titre', texteHtml(n.nom)))
      const f = o.formules ? formulePrincipale(n.enonce) : null
      if (f) racine.append(html('div', 'r37-eq', katexHtml(f, true)))
      const c = n.confiance
      const conf = `\\hat c = ${nombreTex(c.estimation)}\\;\\;[${nombreTex(c.bas)}\\,;\\,${nombreTex(c.haut)}]`
      const pied = html('div', 'r37-pied')
      pied.append(html('span', 'r37-conf', katexHtml(conf)), html('span', 'r37-valid', texteValidation(n)))
      racine.append(pied)
    }
    racine.style.fontSize = `${o.taille}px`
    if (nc) nc.style.fontSize = `${o.taille}px`
    return { racine, num, portee, nc, transform: '', opacite: '', affiche: true, classes: '' }
  }

  /** Après la mise en page : repères, portées ; les éléments hors page sont masqués. */
  attacher(vue: VueRaisonnement, page: MiseEnPage): void {
    this.courants.length = vue.nU
    const garder = new Set<Element>()
    for (let p = 0; p < vue.nU; p++) {
      const e = this.courants[p]
      if (!e) continue
      garder.add(e)
      const b = page.boites[p]!
      if (e.num) e.num.textContent = b.ref
      // Hors écran jusqu'au premier placement (pas d'éclair en haut à gauche).
      e.transform = 'translate(-99999px,0)'
      e.racine.style.transform = e.transform
      if (e.nc) e.nc.style.transform = e.transform
      if (e.portee) {
        const k = page.portees.get(p)?.filter((q) => q < vue.nU).length ?? 0
        e.portee.textContent = `${k} énoncé${k > 1 ? 's' : ''}`
      }
    }
    for (const e of this.cache.values()) if (!garder.has(e)) this.masquer(e)
    this.visibles = garder
  }

  private masquer(e: Element): void {
    if (e.affiche) {
      e.racine.style.display = 'none'
      if (e.nc) e.nc.style.display = 'none'
      e.affiche = false
    }
  }

  /** Suit la projection (appelé à chaque image, après le dessin des cadres). */
  placer(vue: VueRaisonnement, page: MiseEnPage, echelle: (p: number) => number, classes: (p: number) => string, nc: boolean): void {
    const pr = vue.projection
    for (let p = 0; p < vue.nU; p++) {
      const e = this.courants[p]
      if (!e) continue
      const op = vue.opaciteAffichee[p]!
      const b = page.boites[p]!
      if (!pr.visible[p] || op < 0.02) {
        this.masquer(e)
        continue
      }
      const s = echelle(p)
      const [dx, dy] = decalage(b)
      const t = `translate(${(pr.x[p]! + dx * s).toFixed(2)}px,${(pr.y[p]! + dy * s).toFixed(2)}px) scale(${s.toFixed(4)})`
      const o = op.toFixed(3)
      if (!e.affiche) {
        e.racine.style.display = ''
        e.affiche = true
      }
      if (t !== e.transform) {
        e.racine.style.transform = t
        e.transform = t
        if (e.nc) e.nc.style.transform = `translate(${(pr.x[p]! - (b.w / 2) * s).toFixed(2)}px,${(pr.y[p]! + 35 * s).toFixed(2)}px) scale(${s.toFixed(4)})`
      }
      if (o !== e.opacite) {
        e.racine.style.opacity = o
        if (e.nc) e.nc.style.opacity = o
        e.opacite = o
      }
      if (e.nc) e.nc.style.display = nc ? '' : 'none'
      const c = classes(p)
      if (c !== e.classes) {
        for (const x of e.classes.split(' ')) if (x) e.racine.classList.remove(x)
        for (const x of c.split(' ')) if (x) e.racine.classList.add(x)
        e.classes = c
      }
    }
  }

  /** Légende sous la figure : x, y (écran) du coin haut gauche, échelle, largeur (px de mise en page). */
  placerLegende(x: number, y: number, s: number, affiche: boolean, opacite = 1): void {
    const L = this.etatLegende
    if (affiche !== L.affiche) {
      this.legende.style.display = affiche ? '' : 'none'
      L.affiche = affiche
    }
    if (!affiche) return
    const t = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) scale(${s.toFixed(4)})`
    if (t !== L.transform) {
      this.legende.style.transform = t
      L.transform = t
    }
    const o = opacite.toFixed(3)
    if (o !== L.opacite) {
      this.legende.style.opacity = o
      L.opacite = o
    }
  }

  /** Remplit la légende ; renvoie sa hauteur (px de mise en page). */
  remplirLegende(contenu: string, largeur: number, taille: number): number {
    this.legende.innerHTML = contenu
    this.legende.style.width = `${largeur}px`
    this.legende.style.fontSize = `${taille}px`
    const t = this.legende.style.transform
    this.legende.style.transform = ''
    const affiche = this.legende.style.display
    this.legende.style.display = ''
    const h = this.legende.offsetHeight
    this.legende.style.transform = t
    this.legende.style.display = affiche
    return h
  }
}

/** Coin haut gauche du contenu, relatif au point d'ancrage du bloc (px de mise en page). */
export function decalage(b: Boite): [number, number] {
  if (b.genre === 'decision') return [-b.w / 2, -b.haut]
  return [-b.w / 2 + PAD, -b.h / 2 + PAD]
}
