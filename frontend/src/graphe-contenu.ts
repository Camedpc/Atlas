// Couche HTML du graphe : contenu composé (en-tête « Lemme 7 (nom). », formule KaTeX, pied) des seuls blocs visibles au
// niveau « contenu ». Repris de la composition paresseuse de R41, avec les recommandations de PERFORMANCES.md :
// - HTML (et KaTeX) fabriqué à la première demande puis gardé en cache (clé = contenu) ;
// - éléments DOM recyclés (pool) : un élément ne reçoit un nouvel innerHTML que si son contenu change ;
// - budget par image (rendus KaTeX et innerHTML) : le reste attend l'image suivante (titre canevas en attendant) ;
// - mesures groupées : toutes les écritures d'abord, puis une seule passe de lectures, puis les écritures d'ajustement
//   (formule réduite jusqu'à 55 %, sinon tout le contenu) ; l'ajustement est mémorisé par clé ;
// - en mouvement, seul `transform` est écrit, et seulement s'il change.

const MAX_HTML = 3000
const BUDGET_RENDUS = 6
const BUDGET_INSERTIONS = 40

interface Element {
  el: HTMLElement
  cle: string
  transform: string
  visible: boolean
  estompe: boolean
}

interface Ajustement {
  formule: number
  tout: number
}

export class Contenu {
  readonly couche: HTMLElement
  private html = new Map<string, string>()
  private ajustements = new Map<string, Ajustement>()
  private pool: Element[] = []
  /** Élément utilisé à l'image précédente, par représentant. */
  private parId = new Map<string, Element>()
  private places = new Set<Element>()
  private aMesurer: Element[] = []
  private rendus = 0
  private insertions = 0
  /** Des blocs n'ont pas pu être composés à cette image (budget) : en redemander une. */
  enAttente = false
  /** Diagnostic : éléments composés depuis le début. */
  composes = 0

  constructor(parent: HTMLElement) {
    this.couche = document.createElement('div')
    this.couche.className = 'gr-couche'
    parent.append(this.couche)
  }

  debutImage(): void {
    this.places.clear()
    this.aMesurer = []
    this.rendus = 0
    this.insertions = 0
    this.enAttente = false
  }

  /**
   * Pose le contenu du représentant `id` (coin haut gauche x, y à l'écran, échelle s ; w × h en px de mise en page).
   * Faux si le budget de l'image est épuisé : l'appelant dessine le titre sur le canevas en attendant.
   */
  placer(id: string, cle: string, fabriquer: () => string, x: number, y: number, s: number, w: number, h: number, estompe: boolean): boolean {
    let e = this.parId.get(id)
    if (!e || e.cle !== cle || this.places.has(e)) {
      let html = this.html.get(cle)
      if (html === undefined) {
        if (this.rendus >= BUDGET_RENDUS) return this.attendre()
        this.rendus++
        html = fabriquer()
        this.html.set(cle, html)
        if (this.html.size > MAX_HTML) this.html.delete(this.html.keys().next().value!)
      }
      if (this.insertions >= BUDGET_INSERTIONS) return this.attendre()
      this.insertions++
      e = this.libre()
      e.cle = cle
      e.el.style.width = `${w}px`
      e.el.style.height = `${h}px`
      e.el.innerHTML = html
      e.transform = ''
      const aj = this.ajustements.get(cle)
      if (aj) appliquer(e.el, aj)
      else this.aMesurer.push(e)
      this.composes++
    }
    this.parId.set(id, e)
    this.places.add(e)
    const t = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${s.toFixed(4)})`
    if (t !== e.transform) {
      e.transform = t
      e.el.style.transform = t
    }
    if (!e.visible) {
      e.el.style.visibility = 'visible'
      e.visible = true
    }
    if (e.estompe !== estompe) {
      e.estompe = estompe
      e.el.classList.toggle('gr-estompe', estompe)
    }
    return true
  }

  /** Masque ce qui n'a pas été posé ; mesure en une passe les éléments neufs, puis les ajuste. */
  finImage(): void {
    for (const e of this.pool) {
      if (this.places.has(e) || !e.visible) continue
      e.el.style.visibility = 'hidden'
      e.visible = false
    }
    for (const [id, e] of this.parId) if (!this.places.has(e)) this.parId.delete(id)
    if (!this.aMesurer.length) return
    // Lectures groupées (une seule mise en page forcée), puis écritures.
    const mesures = this.aMesurer.map((e) => {
      const f = e.el.querySelector<HTMLElement>('.gr-f')
      const zone = e.el.querySelector<HTMLElement>('.gr-formule')
      const corps = e.el.querySelector<HTMLElement>('.gr-corps')
      return {
        e,
        largeurF: f?.scrollWidth ?? 0,
        dispoF: zone?.clientWidth ?? 0,
        hauteur: corps?.scrollHeight ?? 0,
        dispo: corps?.clientHeight ?? 0,
        hauteurF: f?.offsetHeight ?? 0,
      }
    })
    for (const m of mesures) {
      let formule = 1
      if (m.largeurF > m.dispoF + 0.5 && m.dispoF > 0) formule = Math.max(0.55, m.dispoF / m.largeurF)
      // Hauteur : la formule réduite gagne (1 − formule) × sa hauteur ; au-delà, tout le contenu est réduit.
      const hauteur = m.hauteur - m.hauteurF * (1 - formule)
      let tout = 1
      if (hauteur > m.dispo + 0.5 && m.dispo > 0) {
        const f2 = Math.max(0.55, formule * Math.max(0.6, 1 - (hauteur - m.dispo) / Math.max(20, m.hauteurF)))
        const reste = hauteur - m.hauteurF * (formule - f2)
        formule = m.hauteurF ? f2 : formule
        if (reste > m.dispo + 0.5) tout = Math.max(0.6, m.dispo / reste)
      }
      const aj = { formule, tout }
      this.ajustements.set(m.e.cle, aj)
      appliquer(m.e.el, aj)
    }
  }

  /** Oublie tout (fontes arrivées, changement d'espace) : les blocs seront recomposés à la demande. */
  vider(): void {
    for (const e of this.pool) e.el.remove()
    this.pool = []
    this.parId.clear()
    this.html.clear()
    this.ajustements.clear()
  }

  private attendre(): false {
    this.enAttente = true
    return false
  }

  /** Un élément masqué, sinon un nouveau (le pool ne dépasse pas ≈ deux fois le nombre de blocs à l'écran). */
  private libre(): Element {
    for (const e of this.pool) if (!e.visible && !this.places.has(e)) return e
    const el = document.createElement('div')
    el.className = 'gr-bloc'
    el.style.visibility = 'hidden'
    this.couche.append(el)
    const e: Element = { el, cle: '', transform: '', visible: false, estompe: false }
    this.pool.push(e)
    return e
  }
}

function appliquer(el: HTMLElement, aj: Ajustement): void {
  const f = el.querySelector<HTMLElement>('.gr-f')
  if (f) f.style.fontSize = aj.formule < 1 ? `${aj.formule.toFixed(3)}em` : ''
  const corps = el.querySelector<HTMLElement>('.gr-corps-int')
  if (corps) corps.style.transform = aj.tout < 1 ? `scale(${aj.tout.toFixed(4)})` : ''
}
