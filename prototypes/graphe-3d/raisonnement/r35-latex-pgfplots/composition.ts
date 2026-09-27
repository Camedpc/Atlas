// R35 · Composition « LaTeX » : polices Latin Modern, petites mathématiques sur canvas (indices, exposants,
// italique des variables), texte riche « mot $formule$ » pour les légendes, et calque KaTeX qui pose les
// formules des blocs au-dessus du canvas (HTML suivant la caméra).
//
// Polices chargées par index.html depuis cdn.jsdelivr.net : Latin Modern Roman (droit, italique, gras) et
// Latin Modern Mono ; KaTeX (0.16) pour les formules. Sans réseau : repli sur une police à empattements et
// sur un rendu unicode des formules (dessinerMath).

import { EXPOSANTS, INDICES, lettreGrasse } from './formules'

export const ROMAN = `'Latin Modern Roman', 'CMU Serif', 'Computer Modern Serif', 'Times New Roman', serif`
export const MONO_LM = `'Latin Modern Mono', 'CMU Typewriter Text', 'Courier New', monospace`

interface Katex {
  render(tex: string, el: HTMLElement, options?: Record<string, unknown>): void
}
const katex = (): Katex | undefined => (window as unknown as { katex?: Katex }).katex

// ─── Mathématiques sur canvas ────────────────────────────────────────────────

const LETTRE_ITALIQUE = /^[A-Za-zα-ωϑϕϵ]$/u
const OPERATEUR = /^[=≈≃≠<>≤≥→∝≡⇒+−±∓×·]$/u

/**
 * Dessine (ou mesure) une petite formule unicode en ligne : variables en italique, chiffres et opérateurs
 * droits, indices (₀…, _x) et exposants (²…) réduits. Ligne de base en `y`, aligné à gauche en `x`.
 * Renvoie la largeur.
 */
export function dessinerMath(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, taille: number, dessiner = true): number {
  const c = [...s]
  let w = 0
  const poser = (t: string, style: 'italic' | 'normal' | 'bold', k: number, dy: number) => {
    ctx.font = `${style === 'italic' ? 'italic 400' : style === 'bold' ? '700' : '400'} ${taille * k}px ${ROMAN}`
    if (dessiner) ctx.fillText(t, x + w, y + dy)
    w += ctx.measureText(t).width
  }
  for (let i = 0; i < c.length; i++) {
    const ch = c[i]!
    if (INDICES[ch] !== undefined) {
      const t = INDICES[ch]!
      poser(/[a-z]/.test(t) ? t : t.replace('-', '−'), /[a-z]/.test(t) ? 'italic' : 'normal', 0.7, taille * 0.22)
    } else if (EXPOSANTS[ch] !== undefined) {
      poser(EXPOSANTS[ch]!.replace('-', '−'), 'normal', 0.7, -taille * 0.38)
    } else if (ch === '_' && c[i + 1]) {
      poser(c[++i]!, LETTRE_ITALIQUE.test(c[i]!) ? 'italic' : 'normal', 0.7, taille * 0.22)
    } else if (lettreGrasse(ch)) poser(lettreGrasse(ch)!, 'bold', 1, 0)
    else if (LETTRE_ITALIQUE.test(ch)) poser(ch, 'italic', 1, 0)
    else if (OPERATEUR.test(ch)) poser(ch, 'normal', 1, 0)
    else if (ch === ' ') w += taille * 0.24
    else poser(ch, 'normal', 1, 0)
  }
  return w
}

// ─── Texte riche (légendes) ──────────────────────────────────────────────────

/** Mot d'une légende : morceaux de texte romain et de mathématiques ($…$), sans espace entre eux. */
type MotRiche = { math: boolean; t: string }[]

function motsRiches(texte: string): MotRiche[] {
  const mots: MotRiche[] = []
  let mot: MotRiche = []
  let courant = ''
  let math = false
  const pousser = () => {
    if (courant) mot.push({ math, t: courant })
    courant = ''
  }
  for (const ch of texte) {
    if (ch === '$') {
      pousser()
      math = !math
    } else if (ch === ' ' && !math) {
      pousser()
      if (mot.length) mots.push(mot)
      mot = []
    } else courant += ch
  }
  pousser()
  if (mot.length) mots.push(mot)
  return mots
}

function largeurMot(ctx: CanvasRenderingContext2D, m: MotRiche, taille: number): number {
  let w = 0
  for (const p of m) {
    if (p.math) w += dessinerMath(ctx, p.t, 0, 0, taille, false)
    else {
      ctx.font = `400 ${taille}px ${ROMAN}`
      w += ctx.measureText(p.t).width
    }
  }
  return w
}

/** Coupe une légende en lignes (au plus `max`, la dernière terminée par « … » si le texte déborde). */
export function couperRiche(ctx: CanvasRenderingContext2D, texte: string, largeur: number, taille: number, max: number): MotRiche[][] {
  ctx.font = `400 ${taille}px ${ROMAN}`
  const espace = ctx.measureText(' ').width
  const lignes: MotRiche[][] = []
  let ligne: MotRiche[] = []
  let w = 0
  for (const m of motsRiches(texte)) {
    const lm = largeurMot(ctx, m, taille)
    if (ligne.length && w + espace + lm > largeur) {
      lignes.push(ligne)
      ligne = []
      w = 0
    }
    w += (ligne.length ? espace : 0) + lm
    ligne.push(m)
  }
  if (ligne.length) lignes.push(ligne)
  if (lignes.length > max) {
    lignes.length = max
    lignes[max - 1]!.push([{ math: false, t: '…' }])
  }
  return lignes
}

/** Dessine une ligne de texte riche, alignée à gauche (ligne de base en y). */
export function dessinerRiche(ctx: CanvasRenderingContext2D, ligne: MotRiche[], x: number, y: number, taille: number): void {
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `400 ${taille}px ${ROMAN}`
  const espace = ctx.measureText(' ').width
  let cx = x
  for (const m of ligne) {
    for (const p of m) {
      if (p.math) cx += dessinerMath(ctx, p.t, cx, y, taille)
      else {
        ctx.font = `400 ${taille}px ${ROMAN}`
        ctx.fillText(p.t, cx, y)
        cx += ctx.measureText(p.t).width
      }
    }
    cx += espace
  }
}

/** Petites capitales (\textsc) : première lettre en capitale, le reste en capitales réduites. */
export function dessinerPetitesCapitales(ctx: CanvasRenderingContext2D, texte: string, x: number, y: number, taille: number, poids = 400, dessiner = true): number {
  let w = 0
  for (const mot of texte.split(/(\s+)/)) {
    for (const ch of mot) {
      const petite = ch !== ch.toUpperCase()
      ctx.font = `${poids} ${petite ? taille * 0.78 : taille}px ${ROMAN}`
      const t = ch.toUpperCase()
      if (dessiner) ctx.fillText(t, x + w, y)
      w += ctx.measureText(t).width + (petite ? taille * 0.03 : 0)
    }
  }
  return w
}

// ─── Calque KaTeX ────────────────────────────────────────────────────────────

interface ElementFormule {
  el: HTMLDivElement
  latex: string
  largeur: number
  hauteur: number
  mesure: boolean
  vu: boolean
}

/** Taille de base des formules (px de mise en page, à l'échelle 1). */
export const TAILLE_FORMULE = 11

/**
 * Formules KaTeX posées au-dessus du canvas : un élément HTML par bloc, déplacé et mis à l'échelle à chaque
 * image (transform), opacité suivant celle du bloc. Les éléments ne captent pas la souris.
 */
export class CalqueFormules {
  readonly racine: HTMLDivElement
  private readonly elements = new Map<number, ElementFormule>()

  constructor(parent: HTMLElement) {
    this.racine = document.createElement('div')
    this.racine.className = 'r35-calque-formules'
    parent.append(this.racine)
    // Les polices KaTeX arrivent après le premier rendu : les largeurs mesurées changent.
    document.fonts?.addEventListener?.('loadingdone', () => {
      for (const e of this.elements.values()) e.mesure = false
    })
  }

  get disponible(): boolean {
    return !!katex()
  }

  debut(): void {
    for (const e of this.elements.values()) e.vu = false
  }

  /** Pose la formule `latex` centrée en (x, y) écran, à l'échelle `echelle`, dans une largeur `largeurMax` (px de mise en page). */
  placer(cle: number, latex: string, x: number, y: number, echelle: number, largeurMax: number, opacite: number): void {
    const k = katex()
    if (!k) return
    let e = this.elements.get(cle)
    if (!e) {
      const el = document.createElement('div')
      el.className = 'r35-formule'
      this.racine.append(el)
      e = { el, latex: '', largeur: 0, hauteur: 0, mesure: false, vu: false }
      this.elements.set(cle, e)
    }
    if (e.latex !== latex) {
      try {
        k.render(latex, e.el, { throwOnError: false, displayMode: false, strict: 'ignore' })
      } catch {
        e.el.textContent = latex
      }
      e.latex = latex
      e.mesure = false
    }
    if (!e.mesure) {
      e.el.style.transform = 'none'
      e.largeur = e.el.offsetWidth || 1
      e.hauteur = e.el.offsetHeight || 1
      e.mesure = true
    }
    const ajuste = Math.min(1, largeurMax / e.largeur)
    const f = echelle * ajuste
    if (f * TAILLE_FORMULE < 3.2 || opacite < 0.03) return
    e.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${f.toFixed(4)}) translate(-50%, -50%)`
    e.el.style.opacity = opacite >= 0.99 ? '' : opacite.toFixed(3)
    e.el.style.visibility = ''
    e.vu = true
  }

  fin(): void {
    for (const e of this.elements.values()) if (!e.vu) e.el.style.visibility = 'hidden'
  }

  vider(): void {
    for (const e of this.elements.values()) e.el.remove()
    this.elements.clear()
  }
}
