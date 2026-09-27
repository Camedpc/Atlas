// R36 · Composition HTML des blocs : le texte est composé comme dans un article (Computer Modern, en-tête
// façon amsthm « Lemme 7 (titre). », formule en mode display par KaTeX, confiance en notation d'incertitude),
// dans une couche HTML posée au-dessus des calques de la vue. Le canevas ne dessine que les cadres, les
// liaisons et la figure (axe, accolades) ; cette couche suit la caméra (translate + scale par bloc).
//
// Les hauteurs sont mesurées ici, avant la mise en page, et transmises à `mettreEnPage` : un bloc a
// exactement la hauteur de son texte composé.

import { LIBELLES_TYPE, type NoeudR, type VueRaisonnement } from '../../src/raisonnement'
import { echapper, enLigne, formulesHtml, rendreTex, texConfiance } from './formules'
import type { MiseEnPage } from './mise-en-page'

export type GenreComposition = 'drapeau' | 'decision' | 'carte' | 'etape' | 'majeur'

/** Même règle que `mettreEnPage` (le genre doit être connu avant la mise en page). */
export function genreDe(vue: VueRaisonnement, p: number): GenreComposition {
  const u = vue.lecture.unites[p]!
  const n = vue.justification.noeuds[u.conclusion]!
  if (n.type === 'choix_modelisation') return 'drapeau'
  if (n.type === 'decision') return 'decision'
  if ((n.type === 'theoreme' || n.type === 'resultat') && !n.admis) return 'majeur'
  return u.genre === 'etape' ? 'etape' : 'carte'
}

const VALIDATION: Record<string, string> = { aucune: '—', ia: 'IA', humain: 'H', ia_humain: 'IA+H' }

export interface OptionsComposition {
  largeur: number
  taille: number
}

interface Place {
  cle: string
  visible: boolean
}

export class Composition {
  readonly couche: HTMLElement
  readonly legende: HTMLElement
  private elements: (HTMLElement | null)[] = []
  private places: Place[] = []
  private marques = new Uint8Array(0)
  private cite: number | null = null
  private cleLegende = ''

  constructor(scene: HTMLElement) {
    this.couche = document.createElement('div')
    this.couche.className = 'r36-couche'
    this.legende = document.createElement('div')
    this.legende.className = 'r36-legende'
    this.couche.append(this.legende)
    scene.append(this.couche)
  }

  /** Compose chaque unité et renvoie les hauteurs mesurées (bloc entier ; libellé pour une décision). */
  composer(vue: VueRaisonnement, o: OptionsComposition, page: MiseEnPage | null): Map<number, number> {
    for (const e of this.elements) e?.remove()
    this.elements = []
    this.places = []
    this.cite = null
    const nouveaux: HTMLElement[] = []
    for (let p = 0; p < vue.nU; p++) {
      const e = this.composerUnite(vue, p, o, page)
      this.elements.push(e)
      this.places.push({ cle: '', visible: false })
      e.style.visibility = 'hidden'
      nouveaux.push(e)
    }
    this.couche.append(...nouveaux)
    // Formules trop larges : réduites (jusqu'à 60 %), comme un \resizebox discret.
    const dispo = o.largeur - 16
    for (const e of nouveaux) {
      const f = e.querySelector<HTMLElement>('.r36-f')
      if (!f) continue
      const w = f.offsetWidth
      if (w > dispo) f.style.fontSize = `${Math.max(0.6, dispo / w).toFixed(3)}em`
    }
    this.marques = new Uint8Array(vue.nU)
    return this.mesurer()
  }

  /** Hauteurs actuelles (px de mise en page) : bloc entier ; libellé pour une décision. */
  mesurer(): Map<number, number> {
    const hauteurs = new Map<number, number>()
    this.elements.forEach((e, p) => {
      if (!e) return
      const titre = e.querySelector<HTMLElement>('.r36-dec-titre')
      hauteurs.set(p, titre ? titre.offsetHeight : e.offsetHeight)
    })
    return hauteurs
  }

  private composerUnite(vue: VueRaisonnement, p: number, o: OptionsComposition, page: MiseEnPage | null): HTMLElement {
    const u = vue.lecture.unites[p]!
    const n = vue.justification.noeuds[u.conclusion]!
    const genre = genreDe(vue, p)
    const b = page?.boites[p]
    const e = document.createElement('div')
    e.style.width = `${o.largeur}px`
    e.style.fontSize = `${o.taille}px`
    if (genre === 'decision') {
      e.className = 'r36-dec'
      const alt = n.decision?.alternatives.filter((a) => !a.retenue) ?? []
      e.innerHTML = `<div class="r36-dec-titre">${enLigne(n.nom)}</div><div class="r36-dec-vide"></div>`
        + (alt.length ? `<div class="r36-dec-nc"><i>non retenu :</i> ${enLigne(alt[0]!.libelle)}${alt.length > 1 ? ` <span class="r36-doux">(+${alt.length - 1})</span>` : ''}</div>` : '')
      return e
    }
    const num = b ? b.ref : genre === 'drapeau' ? 'H0' : '00'
    if (genre === 'drapeau') {
      e.className = 'r36-bloc r36-hyp'
      const portee = page?.portees.get(p)?.filter((q) => q < vue.nU).length
      e.innerHTML = `<div class="r36-tete"><span class="r36-type">Hypothèse <span class="r36-num">${echapper(num)}</span></span> (${enLigne(n.nom)}).</div>`
        + (n.choix?.hypothese ? `<div class="r36-corps">${enLigne(n.choix.hypothese)}</div>` : '')
        + `<div class="r36-pied"><span class="r36-doux">portée : ${portee ?? '00'} élément${portee === 1 ? '' : 's'}</span></div>`
      return e
    }
    const abandon = n.piste === 'abandonnee'
    e.className = `r36-bloc${genre === 'majeur' ? ' r36-majeur' : ''}${abandon ? ' r36-abandon' : ''}`
    const k = u.membres.length
    const complement = [
      k > 1 ? `${k} énoncés` : '',
      abandon ? 'piste abandonnée' : '',
    ].filter(Boolean).join(', ')
    const formule = formulesHtml(n.enonce)
    e.innerHTML = `<div class="r36-tete"><span class="r36-type">${LIBELLES_TYPE[n.type]} <span class="r36-num">${echapper(num)}</span></span> (${enLigne(n.nom)})${complement ? ` <span class="r36-doux">— ${complement}</span>` : ''}.</div>`
      + (formule ? `<div class="r36-formule"><span class="r36-f">${formule}</span></div>` : '')
      + `<div class="r36-pied"><span class="r36-conf">${rendreTex(texConfiance(n.confiance), `c = ${n.confiance.estimation.toFixed(2)}`)}</span>`
      + `<span class="r36-valid" title="${echapper(validationLongue(n))}">${VALIDATION[n.validation] ?? ''}</span></div>`
    return e
  }

  /** Après la mise en page : numéros définitifs et portées (sans changer les hauteurs). */
  numeroter(vue: VueRaisonnement, page: MiseEnPage): void {
    this.elements.forEach((e, p) => {
      if (!e) return
      const num = e.querySelector('.r36-num')
      if (num) num.textContent = page.boites[p]!.ref
      if (e.classList.contains('r36-hyp')) {
        const k = page.portees.get(p)?.filter((q) => q < vue.nU).length ?? 0
        const d = e.querySelector('.r36-pied .r36-doux')
        if (d) d.textContent = `portée : ${k} élément${k === 1 ? '' : 's'}`
      }
    })
  }

  /** À chaque image, avant les placements. */
  debutImage(): void {
    this.marques.fill(0)
  }

  /** Pose l'élément du point p : ancrage (x, y) à l'écran, échelle s ; w et haut en px de mise en page. */
  placer(p: number, x: number, y: number, s: number, op: number, w: number, haut: number): void {
    const e = this.elements[p]
    if (!e) return
    this.marques[p] = 1
    const pl = this.places[p]!
    const cle = `translate(${(x - (w / 2) * s).toFixed(2)}px,${(y - haut * s).toFixed(2)}px) scale(${s.toFixed(4)})|${op.toFixed(3)}`
    if (!pl.visible) {
      e.style.visibility = 'visible'
      pl.visible = true
    }
    if (cle === pl.cle) return
    pl.cle = cle
    const [t, o] = cle.split('|')
    e.style.transform = t!
    e.style.opacity = o!
  }

  /** Masque les éléments non placés à cette image. */
  finImage(): void {
    this.elements.forEach((e, p) => {
      if (!e || this.marques[p]) return
      const pl = this.places[p]!
      if (pl.visible) {
        e.style.visibility = 'hidden'
        pl.visible = false
      }
    })
  }

  /** Numéro mis en évidence (bloc cité par un renvoi survolé). */
  definirCite(p: number | null): void {
    if (p === this.cite) return
    if (this.cite !== null) this.elements[this.cite]?.classList.remove('r36-cite')
    this.cite = p
    if (p !== null) this.elements[p]?.classList.add('r36-cite')
  }

  /** Légende de figure : coin haut gauche (écran), largeur en px de mise en page. */
  placerLegende(x: number, y: number, s: number, largeur: number, op: number): void {
    const cle = `${x.toFixed(1)}|${y.toFixed(1)}|${s.toFixed(4)}|${largeur.toFixed(0)}|${op.toFixed(2)}`
    if (cle === this.cleLegende) return
    this.cleLegende = cle
    this.legende.style.display = op < 0.02 ? 'none' : ''
    this.legende.style.width = `${largeur}px`
    this.legende.style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) scale(${s.toFixed(4)})`
    this.legende.style.opacity = op.toFixed(2)
  }

  masquerLegende(): void {
    if (this.cleLegende === 'masquee') return
    this.cleLegende = 'masquee'
    this.legende.style.display = 'none'
  }

  /** Hauteur de la légende (px de mise en page). */
  hauteurLegende(): number {
    return this.legende.offsetHeight
  }
}

function validationLongue(n: NoeudR): string {
  return n.validation === 'ia_humain' ? 'Validé par l’IA et un humain' : n.validation === 'humain' ? 'Validé par un humain' : n.validation === 'ia' ? 'Validé par l’IA' : 'Non validé'
}
