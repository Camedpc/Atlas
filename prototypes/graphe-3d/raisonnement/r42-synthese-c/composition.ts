// R42 · Composition HTML des blocs (texte de R36 : Computer Modern, en-tête amsthm « Lemme 7 (titre). »,
// formule display par KaTeX, confiance en notation d'incertitude ; hypothèses composées comme R37),
// rendue PARESSEUSEMENT : l'élément HTML (et le KaTeX) d'un bloc n'est construit que lorsque le bloc est
// à l'écran et assez grand pour le niveau de détail « complet », puis gardé en cache tant que son
// contenu ne change pas (numéro, largeur, corps, arrivée de KaTeX).
//
// Conséquence pour la mise en page (qui a besoin des hauteurs AVANT de dessiner) :
//   - hauteur MESURÉE si le bloc a déjà été composé (cache par contenu, sans le numéro) ;
//   - sinon hauteur ESTIMÉE : en-tête coupé au canevas avec les mêmes fontes (KaTeX_Main) et la même
//     largeur, formule display comptée d'après son LaTeX (ligne simple ≈ 1,35 em, avec fraction ≈ 2,6 em,
//     une ligne par ligne de `gathered`), pied fixe.
//   - À la composition, le contenu est AJUSTÉ au cadre : formule réduite (jusqu'à 60 %) si trop large ou
//     trop haute, puis corps réduit (jusqu'à 70 %) ; le texte ne déborde jamais du cadre. La hauteur
//     naturelle mesurée sert à la mise en page suivante (changement de niveau, réduction, réglage).

import { LIBELLES_TYPE, type NoeudR, type VueRaisonnement } from '../../src/raisonnement'
import { echapper, enLigne, formulesAffichees, formulesHtml, katex, rendreTex, SERIF, texConfiance } from './formules'
import type { MiseEnPage } from './mise-en-page'

export type GenreComposition = 'drapeau' | 'decision' | 'carte' | 'etape' | 'majeur' | 'fonction'

const VALIDATION: Record<string, string> = { aucune: '—', ia: 'IA', humain: 'H', ia_humain: 'IA+H' }

export interface OptionsComposition {
  largeur: number
  taille: number
}

interface Entree {
  el: HTMLElement
  cle: string
  transform: string
  opacite: string
  affiche: boolean
}

// ─── Mesure au canevas (estimation) ──────────────────────────────────────────

let ctxMesure: CanvasRenderingContext2D | null = null
function ctx2d(): CanvasRenderingContext2D {
  if (!ctxMesure) ctxMesure = document.createElement('canvas').getContext('2d')!
  return ctxMesure
}

/** Nombre de lignes d'un texte coupé à `largeur` ; les `grasMots` premiers mots sont en gras. */
function nombreLignes(texte: string, largeur: number, taille: number, grasMots = 0, italique = false): number {
  const ctx = ctx2d()
  const mots = texte.split(/\s+/).filter(Boolean)
  const regulier = `${italique ? 'italic ' : ''}400 ${taille}px ${SERIF}`
  const gras = `700 ${taille}px ${SERIF}`
  ctx.font = regulier
  const espace = ctx.measureText(' ').width
  let lignes = 1, x = 0
  mots.forEach((m, k) => {
    ctx.font = k < grasMots ? gras : regulier
    // Les mathématiques en ligne (KaTeX) sont un peu plus larges que le texte : marge de 6 %.
    const w = ctx.measureText(m).width * (/[^\p{L}\p{P}\s]|[α-ωΑ-Ω]/u.test(m) ? 1.12 : 1.02)
    if (x > 0 && x + espace + w > largeur) {
      lignes++
      x = w
    } else x += (x > 0 ? espace : 0) + w
  })
  return lignes
}

/** Hauteur (px) d'une formule display d'après son LaTeX. */
function hauteurFormule(tex: string, taille: number): number {
  if (!tex) return 0
  const lignes = tex.startsWith('\\begin{gathered}') ? tex.split('\\\\') : [tex]
  return lignes.reduce((t, l) => t + (l.includes('\\frac') ? 2.6 : 1.35) * taille, 0) + (lignes.length - 1) * 0.3 * taille
}

/** Même règle que `mettreEnPage` (le genre doit être connu avant la mise en page). */
export function genreDe(vue: VueRaisonnement, p: number, fonction: boolean): GenreComposition {
  if (fonction) return 'fonction'
  const u = vue.lecture.unites[p]!
  const n = vue.justification.noeuds[u.conclusion]!
  if (n.type === 'choix_modelisation') return 'drapeau'
  if (n.type === 'decision') return 'decision'
  if ((n.type === 'theoreme' || n.type === 'resultat') && !n.admis) return 'majeur'
  return u.genre === 'etape' ? 'etape' : 'carte'
}

/** Complément de l'en-tête : « — 3 énoncés, piste abandonnée ». */
function complementDe(n: NoeudR, k: number): string {
  return [k > 1 ? `${k} énoncés` : '', n.piste === 'abandonnee' ? 'piste abandonnée' : ''].filter(Boolean).join(', ')
}

export class Composition {
  readonly couche: HTMLElement
  readonly legende: HTMLElement
  /** Éléments composés, par clé de contenu (numéro compris). */
  private cache = new Map<string, Entree>()
  /** Hauteur naturelle mesurée, par clé de contenu SANS numéro (pour la mise en page suivante). */
  private mesurees = new Map<string, number>()
  private cles: string[] = []
  private clesMesure: string[] = []
  private courants: (Entree | null)[] = []
  private marques = new Uint8Array(0)
  private cite: number | null = null
  private cleLegende = ''
  private vue: VueRaisonnement | null = null
  private page: MiseEnPage | null = null
  private o: OptionsComposition = { largeur: 184, taille: 13 }
  /** Nombre d'éléments construits (panneau : preuve de la paresse). */
  construits = 0

  constructor(scene: HTMLElement) {
    this.couche = document.createElement('div')
    this.couche.className = 'r42-couche'
    this.legende = document.createElement('div')
    this.legende.className = 'r42-legende'
    this.couche.append(this.legende)
    scene.append(this.couche)
  }

  /** Clé de contenu sans numéro (mesure) : même texte, même largeur, même corps, même moteur. */
  private cleMesure(vue: VueRaisonnement, p: number, genre: GenreComposition, o: OptionsComposition): string {
    const u = vue.lecture.unites[p]!
    const n = vue.justification.noeuds[u.conclusion]!
    return `${n.id}|${genre}|${u.membres.length}|${o.largeur}|${o.taille}|${katex() ? 'k' : 's'}`
  }

  /**
   * Hauteurs pour la mise en page (point → px) : mesurées si le contenu a déjà été composé, sinon
   * estimées. Bloc entier ; libellé seulement pour une décision. Rien pour un nœud-fonction.
   */
  hauteurs(vue: VueRaisonnement, o: OptionsComposition, fonction: (p: number) => boolean): Map<number, number> {
    const r = new Map<number, number>()
    const T = o.taille, lh = T * 1.25, W = o.largeur
    for (let p = 0; p < vue.nU; p++) {
      const f = fonction(p)
      const genre = genreDe(vue, p, f)
      if (genre === 'fonction') continue
      const m = this.mesurees.get(this.cleMesure(vue, p, genre, o))
      if (m !== undefined) {
        r.set(p, m)
        continue
      }
      const u = vue.lecture.unites[p]!
      const n = vue.justification.noeuds[u.conclusion]!
      if (genre === 'decision') {
        r.set(p, nombreLignes(n.nom, W - 4, T) * lh)
      } else if (genre === 'drapeau') {
        const texte = `Hypothèse (iv) (${n.nom}). ${n.choix?.hypothese ?? ''}`
        r.set(p, Math.ceil(5 + nombreLignes(texte, W - 16, T, 2, true) * lh + 3 + 0.75 * T * 1.25 + 4 + 2))
      } else {
        const c = complementDe(n, u.membres.length)
        const tete = `${LIBELLES_TYPE[n.type]} 00 (${n.nom})${c ? ` — ${c}` : ''}.`
        const grasMots = LIBELLES_TYPE[n.type].split(' ').length + 1
        const hf = hauteurFormule(formulesAffichees(n.enonce), T)
        r.set(p, Math.ceil(5 + nombreLignes(tete, W - 16, T, grasMots) * lh + (hf ? 8 + hf : 0) + 3 + 0.82 * T * 1.25 + 4 + 2))
      }
    }
    return r
  }

  /** Après la mise en page : clés de contenu des points ; les éléments obsolètes quittent le cache. */
  preparer(vue: VueRaisonnement, page: MiseEnPage, o: OptionsComposition): void {
    this.vue = vue
    this.page = page
    this.o = o
    this.cite = null
    this.cles = []
    this.clesMesure = []
    for (let p = 0; p < vue.nU; p++) {
      const b = page.boites[p]!
      if (b.genre === 'fonction' || b.genre === 'masque') {
        this.cles.push('')
        this.clesMesure.push('')
        continue
      }
      const genre = b.genre as GenreComposition
      const km = this.cleMesure(vue, p, genre, o)
      const portee = genre === 'drapeau' ? page.portees.get(p)?.filter((q) => q < vue.nU).length ?? 0 : 0
      this.clesMesure.push(km)
      this.cles.push(`${km}|${b.ref}|${portee}|${Math.round(b.h)}`)
    }
    const garder = new Set(this.cles)
    for (const [k, e] of this.cache) if (!garder.has(k)) {
      e.el.remove()
      this.cache.delete(k)
    }
    for (const e of this.cache.values()) this.masquer(e)
    this.courants = this.cles.map((k) => (k ? this.cache.get(k) ?? null : null))
    this.marques = new Uint8Array(vue.nU)
  }

  /** Oublie tout (KaTeX ou fontes arrivées : les hauteurs mesurées ne valent plus). */
  vider(): void {
    for (const e of this.cache.values()) e.el.remove()
    this.cache.clear()
    this.mesurees.clear()
    this.courants = []
  }

  /** Nombre d'éléments HTML actuellement en cache (panneau). */
  get enCache(): number {
    return this.cache.size
  }

  // ─── Construction d'un bloc (à la demande) ─────────────────────────────────

  private construire(p: number): Entree | null {
    const vue = this.vue, page = this.page
    if (!vue || !page) return null
    const cle = this.cles[p]
    if (!cle) return null
    const b = page.boites[p]!
    const u = vue.lecture.unites[p]!
    const n = vue.justification.noeuds[u.conclusion]!
    const o = this.o
    const e = document.createElement('div')
    e.style.width = `${o.largeur}px`
    e.style.fontSize = `${o.taille}px`
    e.style.visibility = 'hidden'
    if (b.genre === 'decision') {
      e.className = 'r42-dec'
      const alt = n.decision?.alternatives.filter((a) => !a.retenue) ?? []
      e.innerHTML = `<div class="r42-dec-titre">${enLigne(n.nom)}</div><div class="r42-dec-vide"></div>`
        + (alt.length ? `<div class="r42-dec-nc"><i>non retenu :</i> ${enLigne(alt[0]!.libelle)}${alt.length > 1 ? ` <span class="r42-doux">(+${alt.length - 1})</span>` : ''}</div>` : '')
    } else if (b.genre === 'drapeau') {
      // Présentation des hypothèses de R37 : énoncé \newtheorem, tête grasse, corps en italique, portée.
      e.className = 'r42-bloc r42-hyp'
      const k = page.portees.get(p)?.filter((q) => q < vue.nU).length ?? 0
      e.innerHTML = `<p class="r42-hyp-corps"><span class="r42-hyp-tete">Hypothèse <span class="r42-num">${echapper(b.ref)}</span></span> `
        + `<span class="r42-hyp-nom">(${enLigne(n.nom)}).</span> <span class="r42-hyp-texte">${enLigne(n.choix?.hypothese ?? n.enonce)}</span></p>`
        + `<div class="r42-pied r42-hyp-pied">portée : ${k} énoncé${k > 1 ? 's' : ''}</div>`
    } else {
      const abandon = n.piste === 'abandonnee'
      e.className = `r42-bloc${b.genre === 'majeur' ? ' r42-majeur' : ''}${abandon ? ' r42-abandon' : ''}`
      const c = complementDe(n, u.membres.length)
      const formule = formulesHtml(n.enonce)
      e.innerHTML = `<div class="r42-tete"><span class="r42-type">${LIBELLES_TYPE[n.type]} <span class="r42-num">${echapper(b.ref)}</span></span> (${enLigne(n.nom)})${c ? ` <span class="r42-doux">— ${c}</span>` : ''}.</div>`
        + (formule ? `<div class="r42-formule"><span class="r42-f">${formule}</span></div>` : '')
        + `<div class="r42-pied"><span class="r42-conf">${rendreTex(texConfiance(n.confiance), `c = ${n.confiance.estimation.toFixed(2)}`)}</span>`
        + `<span class="r42-valid" title="${echapper(validationLongue(n))}">${VALIDATION[n.validation] ?? ''}</span></div>`
    }
    this.couche.append(e)
    this.ajuster(e, b.genre === 'decision' ? null : b.h, b.genre === 'decision')
    if (p === this.cite) e.classList.add('r42-cite')
    this.construits++
    const entree: Entree = { el: e, cle, transform: '', opacite: '', affiche: false }
    this.cache.set(cle, entree)
    return entree
  }

  /**
   * Ajuste le contenu au cadre : formule trop large réduite (≥ 60 %), puis, si le bloc dépasse la
   * hauteur réservée, formule puis corps réduits ; mémorise la hauteur naturelle (mise en page suivante).
   */
  private ajuster(e: HTMLElement, h: number | null, decision: boolean): void {
    const dispo = this.o.largeur - 16
    const f = e.querySelector<HTMLElement>('.r42-f')
    if (f) {
      const w = f.offsetWidth
      if (w > dispo) f.style.fontSize = `${Math.max(0.6, dispo / w).toFixed(3)}em`
    }
    if (decision) {
      const t = e.querySelector<HTMLElement>('.r42-dec-titre')!
      const naturel = t.offsetHeight
      this.memoriser(naturel)
      const L = this.hauteurDecision()
      if (L && naturel > L + 0.5) {
        t.style.fontSize = `${Math.max(0.7, L / naturel).toFixed(3)}em`
        t.style.height = `${L}px`
        t.style.overflow = 'hidden'
      } else if (L) t.style.height = `${L}px`
      return
    }
    if (h === null) return
    const naturel = e.offsetHeight
    this.memoriser(naturel)
    if (naturel > h + 0.5) {
      // D'abord la formule (son corps compte le plus), puis tout le bloc.
      if (f) {
        const k = Math.max(0.6, (parseFloat(f.style.fontSize) || 1) * Math.max(0.6, 1 - (naturel - h) / Math.max(1, f.offsetHeight)))
        f.style.fontSize = `${k.toFixed(3)}em`
      }
      let t = 1
      while (e.offsetHeight > h + 0.5 && t > 0.7) {
        t -= 0.05
        e.style.fontSize = `${(this.o.taille * t).toFixed(2)}px`
      }
    }
    e.style.height = `${h}px`
  }

  /** Hauteur réservée au libellé d'une décision (celle de la mise en page). */
  private hauteurDecision(): number {
    const p = this.pointEnConstruction
    if (p < 0 || !this.page) return 0
    const b = this.page.boites[p]!
    return b.haut - 4 - 19
  }

  /** Point en cours de construction (pour mémoriser sa hauteur naturelle). */
  private pointEnConstruction = -1

  private memoriser(naturel: number): void {
    const p = this.pointEnConstruction
    if (p >= 0 && this.clesMesure[p]) this.mesurees.set(this.clesMesure[p]!, naturel)
  }

  // ─── Placement à chaque image ──────────────────────────────────────────────

  /** À chaque image, avant les placements. */
  debutImage(): void {
    this.marques.fill(0)
  }

  /** Pose l'élément du point p (construit s'il le faut) : ancrage (x, y) à l'écran, échelle s. */
  placer(p: number, x: number, y: number, s: number, op: number, w: number, haut: number): void {
    let e = this.courants[p] ?? null
    if (!e) {
      this.pointEnConstruction = p
      e = this.construire(p)
      this.pointEnConstruction = -1
      if (!e) return
      this.courants[p] = e
    }
    this.marques[p] = 1
    const t = `translate(${(x - (w / 2) * s).toFixed(2)}px,${(y - haut * s).toFixed(2)}px) scale(${s.toFixed(4)})`
    const o = op.toFixed(3)
    if (!e.affiche) {
      e.el.style.visibility = 'visible'
      e.affiche = true
    }
    if (t !== e.transform) {
      e.transform = t
      e.el.style.transform = t
    }
    if (o !== e.opacite) {
      e.opacite = o
      e.el.style.opacity = o
    }
  }

  /** Masque les éléments non placés à cette image (hors écran, trop petits, ou autre niveau). */
  finImage(): void {
    this.courants.forEach((e, p) => {
      if (e && !this.marques[p]) this.masquer(e)
    })
  }

  private masquer(e: Entree): void {
    if (e.affiche) {
      e.el.style.visibility = 'hidden'
      e.affiche = false
    }
  }

  /** Numéro mis en évidence (bloc cité par un renvoi survolé). */
  definirCite(p: number | null): void {
    if (p === this.cite) return
    if (this.cite !== null) this.courants[this.cite]?.el.classList.remove('r42-cite')
    this.cite = p
    if (p !== null) this.courants[p]?.el.classList.add('r42-cite')
  }

  // ─── Légende de figure ─────────────────────────────────────────────────────

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

  /** Hauteur de la légende (px de mise en page) à une largeur donnée. */
  hauteurLegende(largeur: number): number {
    const d = this.legende.style.display
    this.legende.style.display = ''
    this.legende.style.width = `${largeur}px`
    const h = this.legende.offsetHeight
    this.legende.style.display = d
    this.cleLegende = ''
    return h
  }
}

function validationLongue(n: NoeudR): string {
  return n.validation === 'ia_humain' ? 'Validé par l’IA et un humain' : n.validation === 'humain' ? 'Validé par un humain' : n.validation === 'ia' ? 'Validé par l’IA' : 'Non validé'
}
