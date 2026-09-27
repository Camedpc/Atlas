// R41 · Composition HTML des blocs (reprise de R36 : Computer Modern, en-tête façon amsthm « Lemme 7
// (titre). », formule display par KaTeX, confiance en notation d'incertitude), avec deux changements :
//
// - PARESSEUSE. Rien n'est composé à l'avance : la mise en page reçoit des hauteurs ESTIMÉES sans DOM
//   (`estimerHauteur` : largeur des mots mesurée sur un canevas en Computer Modern, hauteur des formules
//   déduite de leur LaTeX : fraction, somme, nombre de lignes). L'élément HTML d'un bloc (et son KaTeX) n'est
//   créé qu'au premier affichage en vue rapprochée, pour un bloc visible à l'écran, puis gardé en cache (clé =
//   contenu : id, numéro, largeur, corps, hauteur…). Un bloc jamais approché n'est jamais composé.
// - AJUSTÉE AU CADRE. À la création, le contenu est mesuré une fois ; s'il dépasse la hauteur réservée,
//   la formule est réduite (jusqu'à 55 %, comme un \resizebox), puis, en dernier recours, tout le contenu ;
//   le cadre coupe le reste. Le texte ne déborde jamais de son cadre et la mise en page ne bouge pas.
//
// Hypothèses de modélisation présentées comme dans R37 : « Hypothèse (ii) (nom). » en gras, puis l'hypothèse
// en italique dans le même paragraphe justifié, « portée : n énoncés » en pied.

import { LIBELLES_TYPE, type NoeudR, type VueRaisonnement } from '../../src/raisonnement'
import { echapper, enLigne, formulesAffichees, katex, rendreTex, texConfiance } from './formules'
import { agreger } from './groupes'
import type { Boite, GenreBoite, MiseEnPage } from './mise-en-page'

/** Computer Modern (fontes de KaTeX, chargées depuis cdn.jsdelivr.net), sinon Latin Modern installée. */
export const SERIF = `KaTeX_Main, 'Latin Modern Roman', 'CMU Serif', 'Computer Modern', 'Times New Roman', serif`
/** Italique mathématique de Computer Modern (variables : r, c…). */
export const SERIF_MATH = `KaTeX_Math, 'Latin Modern Math', 'CMU Serif', serif`

const VALIDATION: Record<string, string> = { aucune: '—', ia: 'IA', humain: 'H', ia_humain: 'IA+H' }

export interface OptionsComposition {
  largeur: number
  taille: number
  /** Hauteur d'une rangée de broche d'un nœud-fonction (px de mise en page). */
  rangee: number
  /** Hauteur du pied d'un nœud-fonction. */
  piedFonction: number
}

/** Informations propres à une unité, fournies par la vision (nom de groupe, portée…). */
export interface InfosUnite {
  /** Nœud-fonction : nom du sous-problème réduit. */
  nomGroupe?: string
  /** Onglet : « entrée » ou « sortie » (unité extérieure au sous-graphe). */
  externe?: '' | 'entree' | 'sortie'
}

// ─── Estimation des hauteurs (sans DOM) ──────────────────────────────────────

let ctxMesure: CanvasRenderingContext2D | null = null
function mesureur(font: string): CanvasRenderingContext2D {
  if (!ctxMesure) ctxMesure = document.createElement('canvas').getContext('2d')!
  ctxMesure.font = font
  return ctxMesure
}

/** Nombre de lignes d'un texte coupé à `largeur` (mots mesurés avec 6 % de marge pour les maths en ligne). */
function nbLignes(texte: string, largeur: number, font: string): number {
  const ctx = mesureur(font)
  const espace = ctx.measureText(' ').width
  let lignes = 1, w = 0
  for (const mot of texte.split(/\s+/).filter(Boolean)) {
    const lm = ctx.measureText(mot).width * 1.06
    if (w && w + espace + lm > largeur) {
      lignes++
      w = lm
    } else w += (w ? espace : 0) + lm
  }
  return lignes
}

const cacheTex = new Map<string, string>()
/** LaTeX des formules affichées d'un énoncé (mémorisé : l'extraction est appelée à chaque mise en page). */
export function texFormules(enonce: string): string {
  let t = cacheTex.get(enonce)
  if (t === undefined) cacheTex.set(enonce, (t = formulesAffichees(enonce)))
  return t
}

/** Hauteur d'une formule display d'après son LaTeX : 1,45 em par ligne, 2,45 em avec une fraction. */
function hauteurTex(tex: string, T: number): number {
  if (!tex) return 0
  let h = 0
  for (const l of tex.split('\\\\')) h += (/\\frac/.test(l) ? 2.45 : /\\sum|\\int|\\prod/.test(l) ? 2.2 : 1.45) * T
  return h
}

const INTERLIGNE = 1.25

function complementDe(n: NoeudR, membres: number): string {
  return [membres > 1 ? `${membres} énoncés` : '', n.piste === 'abandonnee' ? 'piste abandonnée' : ''].filter(Boolean).join(', ')
}

/**
 * Hauteur estimée (px de mise en page) : bloc entier ; libellé d'une décision ; en-tête d'un nœud-fonction.
 * Même structure que `composerUnite`, qui s'ajuste ensuite à cette hauteur.
 */
export function estimerHauteur(vue: VueRaisonnement, p: number, genre: GenreBoite, o: OptionsComposition, infos: InfosUnite): number {
  const u = vue.lecture.unites[p]!
  const n = vue.justification.noeuds[u.conclusion]!
  const T = o.taille
  const L = T * INTERLIGNE
  const police = `400 ${T}px ${SERIF}`
  if (genre === 'decision') return nbLignes(n.nom, o.largeur - 6, police) * L + 2
  if (genre === 'fonction') return nbLignes(`Sous-problème §00 (${infos.nomGroupe ?? n.nom}) — réduit, ${u.membres.length} énoncés.`, o.largeur - 16, police) * L + 10
  if (genre === 'drapeau') {
    const texte = `Hypothèse (viii) (${n.nom}). ${n.choix?.hypothese ?? ''}`
    return nbLignes(texte, o.largeur - 16, police) * L + (0.75 * T * INTERLIGNE + 3) + 9 + 3
  }
  const complement = complementDe(n, u.membres.length)
  const tete = `${LIBELLES_TYPE[n.type]} 00 (${n.nom})${complement ? ` — ${complement}` : ''}.`
  const hTete = nbLignes(tete, o.largeur - 16, police) * L + (infos.externe ? L * 0.85 : 0)
  const tex = texFormules(n.enonce)
  const hF = tex ? hauteurTex(tex, T) + 8 : 0
  return hTete + hF + (T * 1.42 + 3) + 9 + 3
}

// ─── Composition paresseuse ──────────────────────────────────────────────────

interface Entree {
  el: HTMLElement
  visible: boolean
  cle: string
  transform: string
}

const MAX_CACHE = 600

export class Composition {
  readonly couche: HTMLElement
  readonly legende: HTMLElement
  private cache = new Map<string, Entree>()
  /** Clé de contenu de chaque point pour la mise en page courante ('' : pas de composition). */
  private cles: string[] = []
  private place = new Set<Entree>()
  private affiches = new Set<Entree>()
  private cite: number | null = null
  private actifs = new Set<number>()
  private cleLegende = ''
  private contexte: { vue: VueRaisonnement; page: MiseEnPage; o: OptionsComposition; infos: (p: number) => InfosUnite } | null = null
  /** Nombre d'éléments composés depuis le début (diagnostic : panneau). */
  composes = 0

  constructor(scene: HTMLElement) {
    this.couche = document.createElement('div')
    this.couche.className = 'r41-couche'
    this.legende = document.createElement('div')
    this.legende.className = 'r41-legende'
    this.couche.append(this.legende)
    scene.append(this.couche)
  }

  /** Après une mise en page : clés de contenu (rien n'est composé ici). */
  preparer(vue: VueRaisonnement, page: MiseEnPage, o: OptionsComposition, infos: (p: number) => InfosUnite): void {
    this.contexte = { vue, page, o, infos }
    const k = katex() ? 'k' : 's'
    this.cles = []
    for (let p = 0; p < vue.nU; p++) {
      const u = vue.lecture.unites[p]!
      const n = vue.justification.noeuds[u.conclusion]!
      const b = page.boites[p]!
      let extra = ''
      if (b.genre === 'drapeau') extra = String(page.portees.get(p)?.filter((q) => q < vue.nU).length ?? 0)
      else if (b.genre === 'fonction' && b.broches) {
        extra = b.broches.entrees.map((e) => page.boites[e.source]?.ref ?? '').join(',') + '>' + b.broches.sorties.map((s) => s.noeud).join(',')
          + `|${u.membres.join(',')}|${infos(p).nomGroupe ?? ''}`
      } else if (b.genre === 'decision') extra = b.impasse ? `${b.impasse.texte}${b.impasse.autres}` : ''
      extra += `|${infos(p).externe ?? ''}`
      this.cles.push(`${n.id}|${b.genre}|${b.ref}|${u.membres.length}|${b.h.toFixed(1)}|${o.largeur}|${o.taille}|${k}|${extra}`)
    }
    // Les éléments hors de la nouvelle mise en page sont masqués à la prochaine image (finImage).
  }

  /** Vide le cache (KaTeX ou fontes arrivés : tout sera recomposé à la demande). */
  vider(): void {
    for (const e of this.cache.values()) e.el.remove()
    this.cache.clear()
    this.affiches.clear()
  }

  debutImage(): void {
    this.place.clear()
  }

  /** Pose le point p : ancrage (x, y) à l'écran, échelle s ; w et haut en px de mise en page. Compose au besoin. */
  placer(p: number, x: number, y: number, s: number, op: number, w: number, haut: number): void {
    const e = this.entree(p)
    if (!e) return
    this.place.add(e)
    this.affiches.add(e)
    if (!e.visible) {
      e.el.style.visibility = 'visible'
      e.visible = true
    }
    const t = `translate(${(x - (w / 2) * s).toFixed(2)}px,${(y - haut * s).toFixed(2)}px) scale(${s.toFixed(4)})|${op.toFixed(3)}`
    if (t === e.transform) return
    e.transform = t
    const [tr, o] = t.split('|')
    e.el.style.transform = tr!
    e.el.style.opacity = o!
    e.el.classList.toggle('r41-cite', p === this.cite)
    e.el.classList.toggle('r41-actif', this.actifs.has(p))
  }

  /** Masque les éléments affichés à l'image précédente et non placés à celle-ci. */
  finImage(): void {
    for (const e of this.affiches) {
      if (this.place.has(e)) continue
      if (e.visible) {
        e.el.style.visibility = 'hidden'
        e.visible = false
        e.transform = ''
      }
      this.affiches.delete(e)
    }
  }

  /** Numéro mis en évidence (bloc cité par un renvoi survolé) et hypothèses actives (survol, épingle). */
  definirEtat(cite: number | null, actifs: Iterable<number>): void {
    const a = new Set(actifs)
    const change = cite !== this.cite || a.size !== this.actifs.size || [...a].some((p) => !this.actifs.has(p))
    if (!change) return
    this.cite = cite
    this.actifs = a
    for (const e of this.affiches) e.transform = ''
  }

  private entree(p: number): Entree | null {
    const cle = this.cles[p]
    const c = this.contexte
    if (!cle || !c) return null
    let e = this.cache.get(cle)
    if (e) {
      // Récemment utilisé : en fin d'ordre (éviction du plus ancien).
      this.cache.delete(cle)
      this.cache.set(cle, e)
      return e
    }
    const el = this.composerUnite(c.vue, c.page, p, c.o, c.infos(p))
    el.style.visibility = 'hidden'
    this.couche.append(el)
    this.ajuster(el, c.page.boites[p]!, c.o)
    this.composes++
    e = { el, visible: false, cle, transform: '' }
    this.cache.set(cle, e)
    if (this.cache.size > MAX_CACHE) {
      for (const [k, v] of this.cache) {
        if (this.affiches.has(v)) continue
        v.el.remove()
        this.cache.delete(k)
        if (this.cache.size <= MAX_CACHE) break
      }
    }
    return e
  }

  /** Ajuste le contenu à la hauteur réservée par la mise en page (formule réduite, puis tout le contenu). */
  private ajuster(el: HTMLElement, b: Boite, o: OptionsComposition): void {
    // Formule trop large : réduite (jusqu'à 55 %).
    const f = el.querySelector<HTMLElement>('.r41-f')
    const dispoL = o.largeur - 16
    let taille = 1
    if (f && f.offsetWidth > dispoL) {
      taille = Math.max(0.55, dispoL / f.offsetWidth)
      f.style.fontSize = `${taille.toFixed(3)}em`
    }
    if (b.genre === 'fonction') el.style.height = `${b.h.toFixed(2)}px`
    const int = el.querySelector<HTMLElement>('.r41-int')
    // Cadre du texte : le bloc entier, le libellé d'une décision ou l'en-tête d'un nœud-fonction.
    const cadre = el.querySelector<HTMLElement>('.r41-cadre-texte') ?? el
    if (!int) return
    const hauteurCadre = b.genre === 'decision' ? b.haut - 4 - 19 : b.genre === 'fonction' ? (b.broches ? b.broches.y0 + b.h / 2 : 20) : b.h
    const cs = getComputedStyle(cadre)
    const dispo = hauteurCadre - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0)
    let h = int.offsetHeight
    for (let k = 0; f && h > dispo + 0.5 && k < 4 && taille > 0.56; k++) {
      taille = Math.max(0.55, taille * Math.max(0.8, 1 - (h - dispo) / Math.max(20, f.offsetHeight)))
      f.style.fontSize = `${taille.toFixed(3)}em`
      h = int.offsetHeight
    }
    if (h > dispo + 0.5) {
      const k = Math.max(0.5, dispo / h)
      int.style.transform = `scale(${k.toFixed(4)})`
      int.style.transformOrigin = '0 0'
    }
    // Le cadre coupe ce qui dépasserait encore : le texte ne sort jamais de son bloc.
    cadre.style.height = `${hauteurCadre.toFixed(2)}px`
    cadre.style.overflow = 'hidden'
  }

  private composerUnite(vue: VueRaisonnement, page: MiseEnPage, p: number, o: OptionsComposition, infos: InfosUnite): HTMLElement {
    const u = vue.lecture.unites[p]!
    const n = vue.justification.noeuds[u.conclusion]!
    const b = page.boites[p]!
    const e = document.createElement('div')
    e.style.width = `${o.largeur}px`
    e.style.fontSize = `${o.taille}px`
    if (b.genre === 'decision') {
      e.className = 'r41-dec'
      const alt = n.decision?.alternatives.filter((a) => !a.retenue) ?? []
      e.innerHTML = `<div class="r41-cadre-texte r41-dec-titre"><div class="r41-int">${enLigne(n.nom)}</div></div><div class="r41-dec-vide"></div>`
        + (alt.length ? `<div class="r41-dec-nc"><i>non retenu :</i> ${enLigne(alt[0]!.libelle)}${alt.length > 1 ? ` <span class="r41-doux">(+${alt.length - 1})</span>` : ''}</div>` : '')
      return e
    }
    if (b.genre === 'drapeau') {
      // Présentation de R37 : un paragraphe \newtheorem, tête grasse, nom entre parenthèses, corps italique.
      e.className = 'r41-bloc r41-hyp-bloc'
      const portee = page.portees.get(p)?.filter((q) => q < vue.nU).length ?? 0
      e.innerHTML = `<div class="r41-int"><p class="r41-hyp-corps"><span class="r41-hyp-tete">Hypothèse <span class="r41-num">${echapper(b.ref)}</span></span> `
        + `<span class="r41-hyp-nom">(${enLigne(n.nom)}).</span> <span class="r41-hyp-texte">${enLigne(n.choix?.hypothese ?? n.enonce)}</span></p>`
        + `<div class="r41-hyp-pied">portée : ${portee} énoncé${portee === 1 ? '' : 's'}</div></div>`
      return e
    }
    if (b.genre === 'fonction') {
      // Nœud-fonction (R19) composé en LaTeX : en-tête, une rangée par broche, pied agrégé.
      e.className = 'r41-bloc r41-fonction'
      const ag = agreger(vue.justification.noeuds, u.membres)
      const tete = b.broches ? b.broches.y0 + b.h / 2 : 20
      const R = o.rangee
      const ligne = (t: string, droite: boolean) => `<div class="r41-rangee${droite ? ' r41-droite' : ''}" style="height:${R}px;line-height:${R}px">${t}</div>`
      const entrees = (b.broches?.entrees ?? []).map((be) => {
        const s = page.boites[be.source]
        const ns = vue.noeud(be.source)
        return ligne(`<span class="r41-doux">cf.</span> ${echapper(s?.ref ?? '?')} <span class="r41-doux">(${enLigne(ns.nom)})</span>`, false)
      }).join('')
      const sorties = (b.broches?.sorties ?? []).map((bs) => ligne(`${enLigne(vue.justification.noeuds[bs.noeud]!.nom)}`, true)).join('')
      const aVerifier = ag.parStatut.incertain, refutes = ag.parStatut.refute
      const detail = [aVerifier ? `${aVerifier} à vérifier` : '', refutes ? `${refutes} réfuté${refutes > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ')
      e.innerHTML = `<div class="r41-cadre-texte r41-tete-f" style="height:${tete.toFixed(2)}px"><div class="r41-int"><div class="r41-tete">`
        + `<span class="r41-type">Sous-problème <span class="r41-num">${echapper(b.ref)}</span></span> (${enLigne(infos.nomGroupe ?? n.nom)})`
        + ` <span class="r41-doux">— réduit, ${u.membres.length} énoncés</span>.</div></div></div>`
        + `<div class="r41-broches">${entrees}${entrees && sorties ? '<div class="r41-separation"></div>' : ''}${sorties}</div>`
        + `<div class="r41-pied" style="height:${o.piedFonction}px"><span>${detail || 'tous validés'}</span>`
        + `<span class="r41-conf" title="Maillon le plus faible : ${echapper(vue.justification.noeuds[ag.maillon]!.nom)}">min ${rendreTex(texConfiance(ag.confiance).replace(/\^.*$/, ''), ag.confiance.estimation.toFixed(2))}</span></div>`
      return e
    }
    const abandon = n.piste === 'abandonnee'
    e.className = `r41-bloc${b.genre === 'majeur' ? ' r41-majeur' : ''}${abandon ? ' r41-abandon' : ''}`
    const complement = complementDe(n, u.membres.length)
    const tex = texFormules(n.enonce)
    const formule = tex ? rendreTex(tex, n.enonce, true) : ''
    const externe = infos.externe ? `<div class="r41-externe">${infos.externe === 'entree' ? 'entrée du sous-graphe' : 'utilise le sous-graphe'}</div>` : ''
    e.innerHTML = `<div class="r41-int">${externe}<div class="r41-tete"><span class="r41-type">${LIBELLES_TYPE[n.type]} <span class="r41-num">${echapper(b.ref)}</span></span> (${enLigne(n.nom)})${complement ? ` <span class="r41-doux">— ${complement}</span>` : ''}.</div>`
      + (formule ? `<div class="r41-formule"><span class="r41-f">${formule}</span></div>` : '')
      + `<div class="r41-pied"><span class="r41-conf">${rendreTex(texConfiance(n.confiance), `c = ${n.confiance.estimation.toFixed(2)}`)}</span>`
      + `<span class="r41-valid" title="${echapper(validationLongue(n))}">${VALIDATION[n.validation] ?? ''}</span></div></div>`
    return e
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

  /** Hauteur de la légende à la largeur donnée (px de mise en page), même masquée. */
  hauteurLegende(largeur: number): number {
    const st = this.legende.style
    const avant = { display: st.display, width: st.width, visibility: st.visibility }
    st.display = ''
    st.visibility = 'hidden'
    st.width = `${largeur}px`
    const h = this.legende.offsetHeight
    st.display = avant.display
    st.width = avant.width
    st.visibility = avant.visibility
    return h
  }
}

function validationLongue(n: NoeudR): string {
  return n.validation === 'ia_humain' ? 'Validé par l’IA et un humain' : n.validation === 'humain' ? 'Validé par un humain' : n.validation === 'ia' ? 'Validé par l’IA' : 'Non validé'
}
