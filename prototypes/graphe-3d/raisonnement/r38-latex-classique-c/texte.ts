// R38 · Couche de texte typographié : le contenu des blocs (intitulé d'énoncé, formule numérotée,
// confiance), des décisions et des hypothèses est du HTML composé en Computer Modern avec KaTeX,
// posé au-dessus du canevas et déplacé à chaque image (transform) avec la caméra. Les cadres, liaisons
// et repères restent dessinés sur le canevas (rendu.ts).
//
// Les hauteurs de boîte de la mise en page viennent de `mesurer` : le même HTML est composé dans un
// conteneur hors écran, à la largeur du bloc, et mesuré (mise en cache).

import { LIBELLES_TYPE, type NoeudR, type VueRaisonnement } from '../../src/raisonnement'
import { echapper, htmlFormuleBloc, htmlMath, htmlTexte, katexPret } from './latex'
import type { GenreBoite, MesureBoite, MiseEnPage } from './mise-en-page'

/** Nombre décimal à la française en mode mathématique : 0{,}82. */
export const texDecimal = (x: number, n = 2) => x.toFixed(n).replace('.', '{,}')

const VALIDATION: Record<string, string> = { aucune: '—', ia: 'IA', humain: 'H', ia_humain: 'IA+H' }

interface Parametres {
  titre: string
  eq: number
  portee: number
  /** Réduction de la formule (1 = taille normale), calculée à la mesure. */
  echelleFormule: number
}

/** Corps d'un bloc d'énoncé (carte, sous-argument, résultat) ou d'une hypothèse de modélisation. */
function htmlCorps(n: NoeudR, genre: GenreBoite, membres: number, q: Parametres): string {
  if (genre === 'drapeau') {
    const hyp = n.choix?.hypothese ?? n.enonce
    return `<div class="r38-tete"><span class="r38-env">${echapper(q.titre)}</span> ${htmlTexte(n.nom)}.</div>` +
      `<div class="r38-spec-texte">${htmlTexte(hyp)}</div>` +
      `<div class="r38-pied"><span>portée : ${q.portee} énoncé${q.portee > 1 ? 's' : ''}</span></div>`
  }
  const notes: string[] = []
  if (n.piste === 'abandonnee') notes.push('piste abandonnée')
  if (membres > 1) notes.push(`${membres} énoncés`)
  const note = notes.length ? ` <span class="r38-note">[${notes.join(', ')}]</span>` : ''
  let h = `<div class="r38-tete"><span class="r38-env">${echapper(q.titre)}</span> (${htmlTexte(n.nom)}).${note}</div>`
  const f = htmlFormuleBloc(n.enonce)
  if (f) {
    const taille = q.echelleFormule < 1 ? ` style="font-size:${q.echelleFormule.toFixed(3)}em"` : ''
    h += `<div class="r38-eq"><span class="r38-eq-f"${taille}>${f}</span>${q.eq ? `<span class="r38-eq-n">(${q.eq})</span>` : ''}</div>`
  }
  const c = n.confiance
  const conf = htmlMath(`\\hat c = ${texDecimal(c.estimation)}\\;[${texDecimal(c.bas)}\\,;\\,${texDecimal(c.haut)}]`, false,
    `ĉ = ${c.estimation.toFixed(2)} [${c.bas.toFixed(2)} ; ${c.haut.toFixed(2)}]`)
  h += `<div class="r38-pied"><span>${conf}</span><span class="r38-val">${VALIDATION[n.validation] ?? ''}</span></div>`
  return h
}

function htmlLibelleDecision(n: NoeudR): string {
  return `<span class="r38-dec-nom">${htmlTexte(n.nom)}</span>`
}

function htmlRejet(n: NoeudR): string {
  const alt = n.decision?.alternatives.filter((a) => !a.retenue) ?? []
  if (!alt.length) return ''
  const plus = alt.length > 1 ? ` <span class="r38-note">(+${alt.length - 1})</span>` : ''
  return `<i>non retenu :</i> ${htmlTexte(alt[0]!.libelle)}${plus}`
}

interface Element {
  racine: HTMLElement
  base: string
  transform: string
  opacite: string
  classes: string
}

export class CoucheTexte {
  readonly element: HTMLElement
  private readonly mesure: HTMLElement
  private readonly cache = new Map<string, MesureBoite & { echelleFormule: number }>()
  private elements: (Element | null)[] = []
  private legende: HTMLElement
  private legendeTransform = ''
  taille = 12

  constructor(scene: HTMLElement) {
    this.element = document.createElement('div')
    this.element.className = 'r38-couche'
    scene.append(this.element)
    this.mesure = document.createElement('div')
    this.mesure.className = 'r38-couche r38-mesure'
    this.mesure.setAttribute('aria-hidden', 'true')
    document.body.append(this.mesure)
    this.legende = document.createElement('div')
    this.legende.className = 'r38-legende-figure'
  }

  /** Oublie les mesures (polices ou KaTeX chargés, taille changée). */
  oublier(): void {
    this.cache.clear()
  }

  /** Hauteurs du contenu d'une boîte, mesurées sur le HTML composé à la largeur `w`. */
  mesurer(n: NoeudR, genre: GenreBoite, membres: number, w: number): MesureBoite {
    const cle = `${n.id}|${genre}|${membres}|${w}|${this.taille}|${katexPret() ? 1 : 0}`
    const c = this.cache.get(cle)
    if (c) return c
    this.mesure.style.fontSize = `${this.taille}px`
    let r: MesureBoite & { echelleFormule: number }
    if (genre === 'decision') {
      // Lire chaque hauteur avant la mesure suivante (qui remplace l'élément mesuré).
      const hLibelle = Math.ceil(this.boiteMesure('r38-dec-libelle', htmlLibelleDecision(n), w).offsetHeight)
      const hRejet = Math.ceil(this.boiteMesure('r38-dec-rejet', htmlRejet(n), w).offsetHeight)
      r = { h: 0, hLibelle, hRejet, echelleFormule: 1 }
    } else {
      const q: Parametres = { titre: genre === 'drapeau' ? '(H8)' : `${LIBELLES_TYPE[n.type]} 88`, eq: 88, portee: 88, echelleFormule: 1 }
      let corps = this.boiteMesure(`r38-corps${genre === 'drapeau' ? ' r38-spec' : ''}`, htmlCorps(n, genre, membres, q), w)
      // Formule plus large que le bloc : réduite (au plus à 62 %), comme un \resizebox borné.
      const f = corps.querySelector<HTMLElement>('.r38-eq-f')
      if (f) {
        // Largeur utile : ligne moins les deux retraits symétriques (1,9 em) qui réservent la place du numéro.
        const dispo = corps.querySelector<HTMLElement>('.r38-eq')!.clientWidth - 2 * 1.9 * this.taille - 2
        const naturelle = f.getBoundingClientRect().width
        if (naturelle > dispo && naturelle > 0) {
          q.echelleFormule = Math.max(0.62, dispo / naturelle)
          corps = this.boiteMesure(`r38-corps${genre === 'drapeau' ? ' r38-spec' : ''}`, htmlCorps(n, genre, membres, q), w)
        }
      }
      r = { h: Math.ceil(corps.offsetHeight), echelleFormule: q.echelleFormule }
    }
    this.mesure.replaceChildren()
    this.cache.set(cle, r)
    return r
  }

  private boiteMesure(classe: string, html: string, w: number): HTMLElement {
    const e = document.createElement('div')
    e.className = classe
    e.style.width = `${w}px`
    e.style.position = 'static'
    e.innerHTML = html
    this.mesure.replaceChildren(e)
    return e
  }

  /** (Re)compose les éléments de la page : un par unité de lecture, avec les repères définitifs. */
  construire(vue: VueRaisonnement, page: MiseEnPage): void {
    this.element.replaceChildren()
    this.element.style.fontSize = `${this.taille}px`
    this.elements = []
    for (let p = 0; p < vue.nU; p++) {
      const b = page.boites[p]!
      const n = vue.noeud(p)
      const membres = vue.lecture.unites[p]?.membres.length ?? 1
      const racine = document.createElement('div')
      racine.className = 'r38-point'
      if (b.genre === 'decision') {
        const lib = document.createElement('div')
        lib.className = 'r38-dec-libelle'
        lib.style.width = `${b.w}px`
        lib.style.left = `${-b.w / 2}px`
        lib.style.bottom = `${19 + 6}px`
        lib.innerHTML = htmlLibelleDecision(n)
        racine.append(lib)
        if (b.impasse) {
          const rej = document.createElement('div')
          rej.className = 'r38-dec-rejet'
          rej.style.width = `${b.w}px`
          rej.style.left = `${-b.w / 2}px`
          rej.style.top = `${19 + 14}px`
          rej.innerHTML = htmlRejet(n)
          racine.append(rej)
        }
      } else {
        const m = this.mesurer(n, b.genre, membres, b.w) as MesureBoite & { echelleFormule: number }
        const corps = document.createElement('div')
        corps.className = `r38-corps${b.genre === 'drapeau' ? ' r38-spec' : ''}`
        corps.style.width = `${b.w}px`
        corps.style.height = `${b.h}px`
        corps.style.left = `${-b.w / 2}px`
        corps.style.top = `${-b.h / 2}px`
        const portee = page.portees.get(p)?.filter((q) => q < vue.nU).length ?? 0
        corps.innerHTML = htmlCorps(n, b.genre, membres, { titre: b.titre, eq: b.eq, portee, echelleFormule: m.echelleFormule })
        racine.append(corps)
      }
      const base = `r38-point r38-${b.genre}${b.abandon ? ' r38-abandon' : ''}`
      racine.className = base
      this.element.append(racine)
      this.elements.push({ racine, base, transform: '', opacite: '', classes: '' })
    }
    this.element.append(this.legende)
    this.legendeTransform = ''
  }

  /** Légende de la figure (HTML), sous le schéma. */
  definirLegende(html: string): void {
    this.legende.innerHTML = html
  }

  /** Place les éléments à l'image courante (appelé depuis le calque « dessus »). */
  placer(vue: VueRaisonnement, page: MiseEnPage, classes: (p: number) => string, legende: { x: number; y: number; s: number; w: number; alpha: number } | null): void {
    const pr = vue.projection
    const E = page.echelle
    const k = vue.camera.pixelsParUnite() * E
    for (let p = 0; p < this.elements.length; p++) {
      const e = this.elements[p]
      if (!e) continue
      const op = vue.opaciteAffichee[p] ?? 0
      const visible = pr.visible[p] && op >= 0.02
      const opacite = visible ? op.toFixed(3) : '0'
      if (opacite !== e.opacite) {
        e.opacite = opacite
        e.racine.style.opacity = opacite
        e.racine.style.visibility = visible ? '' : 'hidden'
      }
      if (!visible) continue
      const s = k * (pr.echelle[p] || 1)
      const t = `translate(${pr.x[p]!.toFixed(2)}px,${pr.y[p]!.toFixed(2)}px) scale(${s.toFixed(4)})`
      if (t !== e.transform) {
        e.transform = t
        e.racine.style.transform = t
      }
      const c = classes(p)
      if (c !== e.classes) {
        e.classes = c
        e.racine.className = c ? `${e.base} ${c}` : e.base
      }
    }
    if (legende && legende.alpha > 0.02) {
      const t = `translate(${legende.x.toFixed(2)}px,${legende.y.toFixed(2)}px) scale(${legende.s.toFixed(4)}) translateX(-50%)`
      if (t !== this.legendeTransform) {
        this.legendeTransform = t
        this.legende.style.transform = t
        this.legende.style.width = `${legende.w}px`
      }
      this.legende.style.opacity = legende.alpha.toFixed(3)
      this.legende.hidden = false
    } else this.legende.hidden = true
  }
}
