// R34 · Boîtes tcolorbox composées en HTML (KaTeX pour les formules), sur un calque au-dessus des canvas.
//
// Une boîte = `\begin{tcolorbox}[enhanced, colframe=<famille>, colback=<famille>!5, title=…]` :
//   - bandeau de titre plein (couleur de la famille, texte blanc) : « Lemme 3 — Nom », validation à droite ;
//   - corps : formule(s) extraite(s) de l'énoncé en mode display, sinon l'énoncé en texte avec les
//     mathématiques inline ; décision : question + alternatives ✓ / ✗ ; hypothèse : son énoncé ;
//   - partie basse (`\tcblower`, filet tireté) : renvois « Lem. 2 », bornes de contexte, confiance.
// Statut par le trait du cadre (comme R14) : continu = validé, tireté = à vérifier, barré = réfuté ;
// pointillé gris = piste abandonnée. Sous-argument replié : une seconde feuille décalée derrière.
//
// Le calque (div, pointer-events: none) est ajouté à la scène de la vue : chaque boîte est posée par une
// transformation CSS (translate + scale) recalculée à chaque image depuis la projection de la vue.

import type { NoeudR, VueRaisonnement } from '../../src/raisonnement'
import { FAMILLES, familleDe } from './familles'
import { extraireFormules, texteAvecMaths } from './formules'
import type { Boite, GenreBoite, MiseEnPage, Pastille } from './mise-en-page'

// ─── KaTeX (chargé depuis cdn.jsdelivr.net) ──────────────────────────────────

interface Katex {
  renderToString(tex: string, o?: { displayMode?: boolean; throwOnError?: boolean; strict?: string; output?: string }): string
}

export const VERSION_KATEX = '0.16.11'
const URL_KATEX = `https://cdn.jsdelivr.net/npm/katex@${VERSION_KATEX}/dist/katex.mjs`
let katex: Katex | null = null

/** Charge KaTeX (module ES) ; faux si le réseau ou le CDN manque (repli : texte Unicode). */
export async function chargerKatex(): Promise<boolean> {
  try {
    const m = (await import(/* @vite-ignore */ URL_KATEX)) as { default: Katex }
    katex = m.default
    return true
  } catch {
    return false
  }
}
export const katexPret = (): boolean => katex !== null

const echapper = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** LaTeX → HTML KaTeX ; null si KaTeX manque ou refuse la formule. */
function rendre(tex: string, display: boolean): string | null {
  if (!katex) return null
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: 'ignore', output: 'html' })
  } catch {
    return null
  }
}

/** Énoncé en texte avec mathématiques inline (repli : source Unicode en italique). */
function texteCompose(enonce: string): string {
  return texteAvecMaths(enonce).map((m) => {
    if (!m.math) return echapper(m.texte)
    return rendre(m.texte, false) ?? `<i class="r34-brut">${echapper(m.source)}</i>`
  }).join('')
}

// ─── Contenu ─────────────────────────────────────────────────────────────────

export interface ContenuBoite {
  noeud: NoeudR
  genre: GenreBoite
  /** Référence longue (« Lemme 3 ») et abrégée des renvois. */
  ref: string
  renvois: string[]
  pastilles: Pastille[]
  plus: number
  /** Énoncés repliés dans ce bloc (1 = aucun). */
  membres: number
  /** Hypothèse : nombre de blocs qui en dépendent. */
  portee: number
  formules: boolean
}

const VALIDATION: Record<string, string> = { aucune: '—', ia: 'IA', humain: 'H', ia_humain: 'IA+H' }
const virgule = (x: number) => x.toFixed(2).replace('.', ',')

function corps(c: ContenuBoite): string {
  const n = c.noeud
  if (c.genre === 'drapeau') return `<div class="r34-texte">${texteCompose(n.choix?.hypothese ?? n.enonce)}</div>`
  if (c.genre === 'decision') {
    const d = n.decision
    const q = `<div class="r34-question">${texteCompose(d?.question ?? n.enonce)}</div>`
    if (!d?.alternatives.length) return q
    const coche = rendre('\\checkmark', false) ?? '✓'
    const croix = rendre('\\times', false) ?? '×'
    const alt = d.alternatives.slice(0, 3).map((a) =>
      `<li class="${a.retenue ? 'r34-retenue' : 'r34-rejetee'}"><span class="r34-puce">${a.retenue ? coche : croix}</span><span>${texteCompose(a.libelle)}</span></li>`).join('')
    const reste = d.alternatives.length > 3 ? `<li class="r34-rejetee"><span class="r34-puce"></span><span>+ ${d.alternatives.length - 3}</span></li>` : ''
    return `${q}<ul class="r34-alternatives">${alt}${reste}</ul>`
  }
  if (c.formules && katex) {
    const fs = extraireFormules(n.enonce).map((f) => rendre(f, true))
    if (fs.length && fs.every((f) => f !== null)) return fs.map((f) => `<div class="r34-formule">${f}</div>`).join('')
  }
  return `<div class="r34-texte">${texteCompose(n.enonce)}</div>`
}

function bas(c: ContenuBoite): string {
  const n = c.noeud
  const morceaux: string[] = []
  c.renvois.forEach((r, k) => morceaux.push(`<span class="r34-renvoi" data-renvoi="${k}">${echapper(r)}</span>`))
  c.pastilles.forEach((p, k) => morceaux.push(`<span class="r34-borne" data-borne="${k}">${p.lettre}</span>`))
  if (c.plus) morceaux.push(`<span class="r34-plus">+${c.plus}</span>`)
  if (c.membres > 1) morceaux.push(`<span class="r34-note">${c.membres} énoncés</span>`)
  if (c.genre === 'drapeau') morceaux.push(`<span class="r34-note">portée ${c.portee}</span>`)
  const cf = n.confiance
  const conf = `<span class="r34-conf"><i>c</i> = ${virgule(cf.estimation)} <span class="r34-intervalle">[${virgule(cf.bas)} ; ${virgule(cf.haut)}]</span></span>`
  return `<div class="r34-bas">${morceaux.join('')}${conf}</div>`
}

/** Élément HTML d'une boîte (sans position). `hauteur` fixe la hauteur (sinon naturelle). */
export function composerBoite(c: ContenuBoite, largeur: number, hauteur?: number): HTMLElement {
  const n = c.noeud
  const fam = FAMILLES[familleDe(n)]
  const classes = ['r34-boite']
  if (n.piste === 'abandonnee') classes.push('r34-abandon')
  else if (n.statut === 'incertain') classes.push('r34-incertain')
  else if (n.statut === 'refute') classes.push('r34-refute')
  if (c.genre === 'majeur') classes.push('r34-majeur')
  if (c.genre === 'drapeau') classes.push('r34-hypothese')
  const nom = echapper(n.nom) + (n.piste === 'abandonnee' ? ' <i class="r34-mention">(abandonnée)</i>' : '')
  const val = VALIDATION[n.validation] ?? ''
  const barre = n.statut === 'refute' && n.piste !== 'abandonnee'
    ? '<svg class="r34-barre" viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="0" y1="100" x2="100" y2="0" vector-effect="non-scaling-stroke"/></svg>' : ''
  const noeud = document.createElement('div')
  noeud.className = 'r34-noeud'
  noeud.style.setProperty('--cadre', fam.cadre)
  noeud.style.setProperty('--fond', fam.fond)
  noeud.style.width = `${largeur}px`
  if (hauteur) noeud.style.height = `${hauteur}px`
  noeud.innerHTML =
    (c.membres > 1 ? '<div class="r34-feuille"></div>' : '') +
    `<div class="${classes.join(' ')}">` +
    `<div class="r34-titre"><span class="r34-titre-texte"><b>${echapper(c.ref)}</b> — ${nom}</span><span class="r34-val">${val}</span></div>` +
    `<div class="r34-corps">${corps(c)}</div>${bas(c)}${barre}</div>` +
    '<div class="r34-tags"></div>'
  return noeud
}

/** Réduit les formules trop larges pour la boîte (la formule garde ses proportions). */
function ajusterFormules(e: HTMLElement): void {
  for (const f of e.querySelectorAll<HTMLElement>('.r34-formule')) {
    const k = f.querySelector<HTMLElement>('.katex')
    if (!k) continue
    const dispo = f.clientWidth
    const besoin = k.scrollWidth
    if (besoin > dispo && dispo > 0) f.style.fontSize = `${Math.max(0.55, dispo / besoin).toFixed(3)}em`
  }
}

// ─── Calque ──────────────────────────────────────────────────────────────────

/** Zone cliquable dans une boîte (px de mise en page, depuis le coin haut gauche). */
export interface Puce {
  genre: 'renvoi' | 'pastille'
  /** Indice dans `renvois` ou `pastilles` de la boîte. */
  k: number
  x: number
  y: number
  w: number
  h: number
}

export class CalqueBoites {
  readonly racine: HTMLElement
  private readonly mesure: HTMLElement
  noeuds: (HTMLElement | null)[] = []
  puces: Puce[][] = []
  private etat: { t: string; o: string; c: string; tags: string; z: string }[] = []

  constructor(scene: HTMLElement) {
    this.racine = document.createElement('div')
    this.racine.className = 'r34-calque'
    this.mesure = document.createElement('div')
    this.mesure.className = 'r34-mesure'
    scene.append(this.racine, this.mesure)
  }

  /** Hauteur naturelle d'une boîte composée à la largeur donnée. */
  mesurer(c: ContenuBoite, largeur: number): number {
    const e = composerBoite(c, largeur)
    this.mesure.append(e)
    ajusterFormules(e)
    const h = e.querySelector<HTMLElement>('.r34-boite')!.offsetHeight
    e.remove()
    return Math.ceil(h)
  }

  /** Pose les boîtes de la mise en page (hauteurs fixées à celles de la mise en page). */
  construire(page: MiseEnPage, contenus: (ContenuBoite | null)[]): void {
    this.racine.replaceChildren()
    this.noeuds = contenus.map((c, p) => {
      if (!c) return null
      const b = page.boites[p]!
      const e = composerBoite(c, b.w, b.h)
      this.racine.append(e)
      return e
    })
    this.etat = this.noeuds.map(() => ({ t: '', o: '', c: '', tags: '', z: '' }))
    // Puces (après insertion : positions relatives à la boîte).
    this.puces = this.noeuds.map((e) => {
      if (!e) return []
      ajusterFormules(e)
      const boite = e.querySelector<HTMLElement>('.r34-boite')!
      const r: Puce[] = []
      for (const s of boite.querySelectorAll<HTMLElement>('[data-renvoi], [data-borne]')) {
        const renvoi = s.dataset.renvoi !== undefined
        r.push({ genre: renvoi ? 'renvoi' : 'pastille', k: Number(renvoi ? s.dataset.renvoi : s.dataset.borne), x: s.offsetLeft, y: s.offsetTop, w: s.offsetWidth, h: s.offsetHeight })
      }
      return r
    })
  }

  /**
   * Position, opacité, classes d'état et repères d'hypothèses de chaque boîte (appelé à chaque image).
   * Écrit le DOM seulement quand une valeur change.
   */
  positionner(vue: VueRaisonnement, page: MiseEnPage, etats: (p: number) => { classes: string; tags: string; z: number }): void {
    const pr = vue.projection
    const k = vue.camera.pixelsParUnite() * page.echelle
    for (let p = 0; p < this.noeuds.length; p++) {
      const e = this.noeuds[p]
      if (!e) continue
      const st = this.etat[p]!
      const b: Boite = page.boites[p]!
      const op = vue.opaciteAffichee[p] ?? 0
      const visible = pr.visible[p] && op > 0.02
      const o = visible ? op.toFixed(3) : '0'
      if (o !== st.o) {
        e.style.opacity = o
        e.style.visibility = visible ? '' : 'hidden'
        st.o = o
      }
      if (!visible) continue
      const s = k * (pr.echelle[p] || 1)
      const t = `translate(${(pr.x[p]! - (b.w / 2) * s).toFixed(1)}px,${(pr.y[p]! - (b.h / 2) * s).toFixed(1)}px) scale(${s.toFixed(4)})`
      if (t !== st.t) {
        e.style.transform = t
        st.t = t
      }
      const et = etats(p)
      const c = `r34-noeud${et.classes}`
      if (c !== st.c) {
        e.className = c
        st.c = c
      }
      if (et.tags !== st.tags) {
        e.querySelector('.r34-tags')!.textContent = et.tags
        st.tags = et.tags
      }
      const z = String(et.z)
      if (z !== st.z) {
        e.style.zIndex = z
        st.z = z
      }
    }
  }
}
