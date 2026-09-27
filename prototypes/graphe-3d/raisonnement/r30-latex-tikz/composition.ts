// R30 · Composition du texte des nœuds (HTML + KaTeX) et calque DOM qui le pose sur la figure.
//
// Le canvas trace les nœuds TikZ (contours, flèches, accolades) ; tout ce qui est typographié (titres
// façon amsthm, formules centrées, légende « Figure 1 ») est du HTML posé au-dessus, un élément par
// pièce, transformé à chaque image (translate + scale) pour suivre la caméra.
//
// Les dimensions sont mesurées dans le DOM (police et formules réelles) avant la mise en page ; le
// cache est vidé quand une police finit de charger.

import { LIBELLES_TYPE, type NoeudR } from '../../src/raisonnement'
import { echapper, formulesDe, htmlMath, htmlTexte, segmenter } from './formules'

/** Morceau de texte composé, relatif au point d'ancrage d'une boîte (px de mise en page). */
export interface PieceTeX {
  classe: string
  html: string
  x: number
  y: number
  w: number
  h: number
}

/** Ce que montre un nœud sous son titre. */
export type Corps = 'formules' | 'enonce' | 'titre'

/** Numéro du nœud, remplacé après la numérotation (la mise en page mesure avec « 00 »). */
export const JETON_NUMERO = '§N§'
/** Portée d'une hypothèse (nombre de nœuds dépendants), idem. */
export const JETON_PORTEE = '§P§'

// ─── Mesure ──────────────────────────────────────────────────────────────────

let boiteMesure: HTMLDivElement | null = null
const cacheMesure = new Map<string, { html: string; h: number; w: number }>()

export function viderCacheMesure(): void {
  cacheMesure.clear()
}

/**
 * Compose une pièce à la largeur donnée : hauteur réelle, et formules trop larges réduites (jusqu'à
 * 55 %) pour tenir dans le nœud. Renvoie le HTML ajusté.
 */
export function composer(classe: string, html: string, largeur: number): { html: string; h: number; w: number } {
  const cle = `${classe}|${largeur}|${html}`
  const c = cacheMesure.get(cle)
  if (c) return c
  if (!boiteMesure) {
    boiteMesure = document.createElement('div')
    boiteMesure.className = 'r30-tex r30-mesure'
    document.body.append(boiteMesure)
  }
  const el = document.createElement('div')
  el.className = `r30-piece r30-${classe}`
  el.style.width = `${largeur}px`
  el.innerHTML = html.split(JETON_NUMERO).join('00').split(JETON_PORTEE).join('00')
  boiteMesure.append(el)
  for (const eq of el.querySelectorAll<HTMLElement>('.r30-eq')) {
    const k = eq.firstElementChild as HTMLElement | null
    if (!k) continue
    const dispo = eq.clientWidth
    const naturel = k.getBoundingClientRect().width
    if (naturel > dispo + 0.5) eq.style.fontSize = `${Math.max(0.55, dispo / naturel).toFixed(3)}em`
  }
  const h = Math.ceil(el.getBoundingClientRect().height)
  let w = 0
  for (const e of el.children) w = Math.max(w, (e as HTMLElement).getBoundingClientRect().width)
  // HTML ajusté (tailles de formules), avec les jetons d'origine.
  const r = { html: ajusterTailles(html, el), h, w: Math.ceil(w) }
  el.remove()
  cacheMesure.set(cle, r)
  return r
}

/** Reporte les réductions de formules (dans l'ordre) sur le HTML d'origine. */
function ajusterTailles(html: string, mesure: HTMLElement): string {
  const tailles = [...mesure.querySelectorAll<HTMLElement>('.r30-eq')].map((e) => e.style.fontSize)
  let k = 0
  return html.replace(/<div class="r30-eq">/g, (t) => {
    const f = tailles[k++]
    return f ? `<div class="r30-eq" style="font-size:${f}">` : t
  })
}

// ─── Contenus ────────────────────────────────────────────────────────────────

const validationCourte = (n: NoeudR) =>
  n.validation === 'aucune' ? '' : n.validation === 'ia_humain' ? 'ia+h' : n.validation === 'humain' ? 'h' : 'ia'

const virgule = (x: number) => x.toFixed(2).replace('.', ',')

/** Formules centrées d'un énoncé (au plus `max`). */
function htmlFormules(n: NoeudR, max: number): string {
  return formulesDe(n.enonce).slice(0, max).map((f) => `<div class="r30-eq">${htmlMath(f, true)}</div>`).join('')
}

/**
 * Nœud d'énoncé, façon amsthm : « Lemme 7 (Invariant…). » en tête, puis les formules de l'énoncé
 * centrées (ou l'énoncé en italique s'il n'en a pas et qu'il est court), puis la validation et la
 * confiance en pied.
 */
export function htmlBloc(n: NoeudR, o: { membres: number; sousArgument: boolean; abandon: boolean; corps: Corps; maxFormules: number }): string {
  const type = LIBELLES_TYPE[n.type]
  const tete = `<div class="r30-tete"><b>${echapper(type)}&nbsp;${JETON_NUMERO}</b> <span class="r30-nom">(${htmlTexte(n.nom)})</span>${o.sousArgument ? ` <span class="r30-note">[${o.membres} énoncés]</span>` : ''}</div>`
  let corps = ''
  if (o.corps === 'enonce') corps = `<div class="r30-corps">${htmlTexte(n.enonce)}</div>`
  else if (o.corps === 'formules') {
    corps = htmlFormules(n, o.maxFormules)
    if (!corps && n.enonce.length <= 110 && segmenter(n.enonce).some((s) => s.genre === 'math')) corps = `<div class="r30-corps">${htmlTexte(n.enonce)}</div>`
  }
  const cf = n.confiance
  const val = validationCourte(n)
  const pied = `<div class="r30-pied"><span class="r30-sc">${o.abandon ? 'abandonnée' : val}</span><span><i>c</i>&#8201;=&#8201;${virgule(cf.estimation)}&#8194;[${virgule(cf.bas)}&#8201;;&#8201;${virgule(cf.haut)}]</span></div>`
  return tete + corps + pied
}

/** Libellé d'une décision, au-dessus du losange (qui porte « D1 »). */
export function htmlDecision(n: NoeudR): string {
  return `<div class="r30-nom-decision">${htmlTexte(n.nom)}</div>`
}

/** Alternative rejetée d'une décision (sortie non connectée). */
export function htmlImpasse(texte: string, autres: number): string {
  return `<div class="r30-impasse"><span class="r30-sc">non retenu</span> : ${htmlTexte(texte)}${autres ? ` <span class="r30-note">(+${autres})</span>` : ''}</div>`
}

/** Hypothèse de modélisation, écrite comme dans un article : « (H1) Nom. — énoncé en italique. » */
export function htmlSpec(n: NoeudR): string {
  const hyp = n.choix?.hypothese ?? n.enonce
  return `<div class="r30-tete"><b>(H${JETON_NUMERO})</b> <span class="r30-nom-spec">${htmlTexte(n.nom)}</span><span class="r30-portee">&#8594;&#8201;${JETON_PORTEE}</span></div><div class="r30-corps">${htmlTexte(hyp)}</div>`
}

/** Légende de la figure, sous le schéma. */
export function htmlLegende(o: { titre: string; noeuds: number; visibles: number; aretes: number; liaisons: number; niveau: string; resume?: string }): string {
  return `<p><span class="r30-fig">Figure&nbsp;1</span>&nbsp;: ${htmlTexte(o.titre)}. Graphe de lecture au niveau « ${echapper(o.niveau)} » : ${o.visibles} éléments pour ${o.noeuds} énoncés, ${o.liaisons} liaisons pour ${o.aretes} arêtes de justification. `
    + `Trait plein : validé ; tireté : à vérifier ; barré : réfuté ; pointillé gris : piste abandonnée. Double trait : résultat ; contour dédoublé : sous-argument replié. `
    + `(H<i>k</i>) : hypothèse de modélisation ; losange (D<i>k</i>) : décision ; cercles sous un nœud : contexte (H hypothèse, D définition, O outil, A axiome, L littérature). `
    + `<i>c</i> : confiance estimée et intervalle.</p>`
}

/** Remplace les jetons de numéro et de portée. */
export function finaliser(html: string, numero: number, portee: number): string {
  return html.split(JETON_NUMERO).join(String(numero)).split(JETON_PORTEE).join(String(portee))
}

// ─── Calque DOM ──────────────────────────────────────────────────────────────

interface Element {
  el: HTMLDivElement
  html: string
  classe: string
  vu: boolean
}

/** Calque de texte composé, au-dessus des canvas de la vue (sans capter la souris). */
export class CalqueTeX {
  readonly racine: HTMLDivElement
  private elements = new Map<string, Element>()
  private largeur = 0
  private hauteur = 0

  constructor(parent: HTMLElement) {
    this.racine = document.createElement('div')
    this.racine.className = 'r30-tex r30-calque'
    parent.append(this.racine)
  }

  debut(largeur: number, hauteur: number): void {
    this.largeur = largeur
    this.hauteur = hauteur
    for (const e of this.elements.values()) e.vu = false
  }

  /** Pose une pièce : (x, y) = coin haut gauche à l'écran, s = échelle. */
  placer(cle: string, piece: PieceTeX, x: number, y: number, s: number, opacite: number, etat = ''): void {
    // Hors écran ou illisible : rien.
    if (opacite < 0.02 || s < 0.12 || x > this.largeur + 10 || y > this.hauteur + 10 || x + piece.w * s < -10 || y + piece.h * s < -10) return
    let e = this.elements.get(cle)
    if (!e) {
      const el = document.createElement('div')
      this.racine.append(el)
      e = { el, html: '', classe: '', vu: false }
      this.elements.set(cle, e)
    }
    if (e.html !== piece.html) {
      e.el.innerHTML = piece.html
      e.html = piece.html
    }
    const classe = `r30-piece r30-${piece.classe}${etat ? ` ${etat}` : ''}`
    if (e.classe !== classe) {
      e.el.className = classe
      e.classe = classe
    }
    const st = e.el.style
    st.width = `${piece.w}px`
    st.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${s.toFixed(4)})`
    st.opacity = opacite >= 0.99 ? '' : opacite.toFixed(3)
    st.display = ''
    e.vu = true
  }

  fin(): void {
    for (const e of this.elements.values()) if (!e.vu) e.el.style.display = 'none'
  }

  /** Oublie tous les éléments (nouvelle mise en page). */
  vider(): void {
    for (const e of this.elements.values()) e.el.remove()
    this.elements.clear()
  }
}
