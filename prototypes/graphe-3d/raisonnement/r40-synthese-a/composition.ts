// R40 · Composition HTML des blocs (reprise de R36), créée À LA DEMANDE.
//
// Texte composé comme dans un article : Computer Modern, en-tête façon amsthm « Lemme 7 (titre). »,
// formule en mode display par KaTeX, confiance en notation d'incertitude ; hypothèses de modélisation
// présentées comme dans R37 : « Hypothèse (ii) (nom). » puis l'énoncé en italique, dans le même
// paragraphe justifié, et « portée : n énoncés » en pied.
//
// Niveaux de détail (voir rendu.ts) : le HTML n'existe que pour les blocs affichés au niveau « complet »
// et visibles à l'écran. Il est créé au premier besoin, mis en cache (clé : genre, membres, largeur, corps),
// détaché du DOM quand le bloc sort de l'écran ou redescend sous le seuil, et réattaché ensuite.
//
// Hauteurs : la mise en page a besoin de la hauteur de chaque bloc AVANT que son HTML existe. Elle est
// estimée (mesure canvas du texte avec les fontes Computer Modern, hauteur type d'une formule display :
// 1,45 corps par ligne, 2,35 avec une fraction) ; dès qu'un bloc a été composé, sa hauteur mesurée
// remplace l'estimation aux mises en page suivantes. Si le HTML composé dépasse son cadre, son corps est
// réduit jusqu'à tenir (jamais de texte hors du cadre) ; s'il est plus court, le pied reste en bas.

import { LIBELLES_TYPE, type NoeudR, type VueRaisonnement } from '../../src/raisonnement'
import { echapper, enLigne, formulesAffichees, formulesHtml, katex, rendreTex, texConfiance } from './formules'
import { SERIF } from './mise-en-page'

export type GenreComposition = 'drapeau' | 'decision' | 'carte' | 'etape' | 'majeur' | 'fonction'

/** Même règle que `mettreEnPage` (le genre doit être connu avant la mise en page). */
export function genreDe(vue: VueRaisonnement, p: number, fonction: boolean): GenreComposition {
  const u = vue.lecture.unites[p]!
  const n = vue.justification.noeuds[u.conclusion]!
  if (fonction) return 'fonction'
  if (n.type === 'choix_modelisation') return 'drapeau'
  if (n.type === 'decision') return 'decision'
  if ((n.type === 'theoreme' || n.type === 'resultat') && !n.admis) return 'majeur'
  return u.genre === 'etape' ? 'etape' : 'carte'
}

export const VALIDATION: Record<string, string> = { aucune: '—', ia: 'IA', humain: 'H', ia_humain: 'IA+H' }

export interface OptionsComposition {
  largeur: number
  taille: number
}

interface Entree {
  el: HTMLElement
  num: HTMLElement | null
  portee: HTMLElement | null
  genre: GenreComposition
  /** Composé avec KaTeX (sinon : repli Unicode, recomposé à l'arrivée de KaTeX). */
  katex: boolean
  attache: boolean
  /** Hauteur du cadre à laquelle le contenu a été ajusté. */
  cadre: number
  transform: string
  opacite: string
  ref: string
  portees: string
}

/** Rembourrage des blocs (px), identique au CSS. */
const PAD_H = 5, PAD_B = 4, PAD_X = 8

let ctxMesure: CanvasRenderingContext2D | null = null
function ctx(font: string): CanvasRenderingContext2D {
  if (!ctxMesure) ctxMesure = document.createElement('canvas').getContext('2d')!
  ctxMesure.font = font
  return ctxMesure
}

/** Nombre de lignes d'un texte coupé aux espaces dans une largeur donnée (mesure canvas). */
function nbLignes(texte: string, largeur: number, font: string): number {
  const c = ctx(font)
  const espace = c.measureText(' ').width
  let lignes = 1, w = 0
  for (const mot of texte.split(/\s+/)) {
    if (!mot) continue
    const m = c.measureText(mot).width
    if (w > 0 && w + espace + m > largeur) {
      lignes++
      w = m
    } else w += (w > 0 ? espace : 0) + m
  }
  return lignes
}

export class Composition {
  readonly couche: HTMLElement
  readonly legende: HTMLElement
  private cache = new Map<string, Entree>()
  /** Clé de composition de chaque point de la page courante. */
  private cles: string[] = []
  /** Hauteurs naturelles mesurées (clé → px) : elles remplacent l'estimation. */
  private mesures = new Map<string, number>()
  private placees = new Set<Entree>()
  private vue: VueRaisonnement | null = null
  private o: OptionsComposition = { largeur: 184, taille: 13 }
  private genres: GenreComposition[] = []
  private cite: number | null = null
  private cleLegende = ''
  /** Nombre d'éléments HTML créés depuis le chargement (contrôle de la paresse). */
  crees = 0

  constructor(scene: HTMLElement) {
    this.couche = document.createElement('div')
    this.couche.className = 'r40-couche'
    this.legende = document.createElement('div')
    this.legende.className = 'r40-legende'
    this.couche.append(this.legende)
    scene.append(this.couche)
  }

  /** Nouvelle dérivation ou nouveaux réglages : clés des points (aucun HTML n'est créé ici). */
  preparer(vue: VueRaisonnement, o: OptionsComposition, fonction: boolean[]): void {
    this.vue = vue
    if (o.largeur !== this.o.largeur || o.taille !== this.o.taille) this.vider()
    this.o = o
    this.genres = []
    this.cles = []
    const j = vue.justification
    for (let p = 0; p < vue.nU; p++) {
      const u = vue.lecture.unites[p]!
      const genre = genreDe(vue, p, !!fonction[p])
      this.genres.push(genre)
      this.cles.push(`${genre}|${u.membres.map((m) => j.noeuds[m]!.id).join(',')}|${o.largeur}|${o.taille}`)
    }
  }

  /** Hauteur du bloc du point p (mesurée si le bloc a déjà été composé, sinon estimée) ; libellé pour une décision. */
  hauteur(p: number): number {
    const m = this.mesures.get(this.cles[p] ?? '')
    return m ?? this.estimer(p)
  }

  /** Estimation sans DOM (voir l'en-tête du fichier). */
  estimer(p: number): number {
    const vue = this.vue!
    const { largeur, taille } = this.o
    const n = vue.justification.noeuds[vue.lecture.unites[p]!.conclusion]!
    const genre = this.genres[p]!
    const ligne = taille * 1.25
    const interieur = (largeur - 2 * PAD_X) * 0.96
    const romain = `400 ${taille}px ${SERIF}`
    const gras = `700 ${taille}px ${SERIF}`
    const italique = `italic 400 ${taille}px ${SERIF}`
    if (genre === 'decision') return Math.ceil(nbLignes(n.nom, largeur - 4, romain) * ligne) + 1
    if (genre === 'drapeau') {
      const tete = `Hypothèse (iii) (${n.nom}).`
      const texte = n.choix?.hypothese ?? n.enonce
      // Paragraphe unique : tête grasse puis texte en italique (mesure mixte : on additionne les largeurs).
      const lignes = nbLignes(`${tete} ${texte}`, interieur, italique) + (ctx(gras).measureText(tete).width > interieur ? 1 : 0)
      return Math.ceil(PAD_H + PAD_B + lignes * ligne + 3 + taille * 0.78 * 1.25) + 2
    }
    const k = vue.lecture.unites[p]!.membres.length
    const complement = [k > 1 ? `${k} énoncés` : '', n.piste === 'abandonnee' ? 'piste abandonnée' : ''].filter(Boolean).join(', ')
    const tete = `${LIBELLES_TYPE[n.type]} 00 (${n.nom})${complement ? ` — ${complement}` : ''}.`
    const lignes = nbLignes(tete, interieur, romain)
    let hF = 0
    const tex = formulesAffichees(n.enonce)
    if (tex) {
      const rangs = 1 + (tex.match(/\\\\/g)?.length ?? 0)
      hF = rangs * taille * (tex.includes('\\frac') ? 2.35 : 1.45) + 8
    }
    const pied = 3 + taille * 0.82 * 1.7
    return Math.ceil(PAD_H + PAD_B + lignes * ligne + hF + pied) + 2
  }

  /** Vide le cache (réglages de largeur ou de corps changés, ou KaTeX arrivé). */
  vider(seulementSansKatex = false): void {
    for (const [cle, e] of this.cache) {
      if (seulementSansKatex && e.katex) continue
      e.el.remove()
      this.cache.delete(cle)
      this.mesures.delete(cle)
    }
    this.placees.clear()
  }

  /** Nombre d'éléments en cache et attachés au DOM (panneau, contrôle). */
  etat(): { cache: number; attaches: number; crees: number } {
    let attaches = 0
    for (const e of this.cache.values()) if (e.attache) attaches++
    return { cache: this.cache.size, attaches, crees: this.crees }
  }

  private construire(p: number): Entree {
    const vue = this.vue!
    const { largeur, taille } = this.o
    const u = vue.lecture.unites[p]!
    const n = vue.justification.noeuds[u.conclusion]!
    const genre = this.genres[p]!
    const e = document.createElement('div')
    e.style.width = `${largeur}px`
    e.style.fontSize = `${taille}px`
    let num: HTMLElement | null = null
    let portee: HTMLElement | null = null
    if (genre === 'decision') {
      e.className = 'r40-dec'
      const alt = n.decision?.alternatives.filter((a) => !a.retenue) ?? []
      e.innerHTML = `<div class="r40-dec-titre">${enLigne(n.nom)}</div><div class="r40-dec-vide"></div>`
        + (alt.length ? `<div class="r40-dec-nc"><i>non retenu :</i> ${enLigne(alt[0]!.libelle)}${alt.length > 1 ? ` <span class="r40-doux">(+${alt.length - 1})</span>` : ''}</div>` : '')
    } else if (genre === 'drapeau') {
      // R37 : « Hypothèse (ii) (nom). » en gras puis l'hypothèse en italique, un seul paragraphe justifié.
      e.className = 'r40-bloc r40-hypothese'
      e.innerHTML = `<p class="r40-hyp-corps"><span class="r40-hyp-tete">Hypothèse <span class="r40-num"></span></span> `
        + `<span class="r40-hyp-nom">(${enLigne(n.nom)}).</span> <span class="r40-hyp-texte">${enLigne(n.choix?.hypothese ?? n.enonce)}</span></p>`
        + `<div class="r40-hyp-pied">portée : <span class="r40-portee"></span></div>`
      portee = e.querySelector('.r40-portee')
    } else {
      const abandon = n.piste === 'abandonnee'
      e.className = `r40-bloc${genre === 'majeur' ? ' r40-majeur' : ''}${abandon ? ' r40-abandon' : ''}`
      const k = u.membres.length
      const complement = [k > 1 ? `${k} énoncés` : '', abandon ? 'piste abandonnée' : ''].filter(Boolean).join(', ')
      const formule = formulesHtml(n.enonce)
      e.innerHTML = `<div class="r40-tete"><span class="r40-type">${LIBELLES_TYPE[n.type]} <span class="r40-num"></span></span> (${enLigne(n.nom)})${complement ? ` <span class="r40-doux">— ${complement}</span>` : ''}.</div>`
        + (formule ? `<div class="r40-formule"><span class="r40-f">${formule}</span></div>` : '<div class="r40-formule r40-sans"></div>')
        + `<div class="r40-pied"><span class="r40-conf">${rendreTex(texConfiance(n.confiance), `c = ${n.confiance.estimation.toFixed(2)}`)}</span>`
        + `<span class="r40-valid" title="${echapper(validationLongue(n))}">${VALIDATION[n.validation] ?? ''}</span></div>`
    }
    num = e.querySelector('.r40-num')
    this.crees++
    return { el: e, num, portee, genre, katex: !!katex(), attache: false, cadre: -1, transform: '', opacite: '', ref: '', portees: '' }
  }

  /** Ajuste le contenu au cadre : mesure la hauteur naturelle, réduit le corps s'il dépasse. */
  private ajuster(e: Entree, cle: string, cadre: number): void {
    const { largeur, taille } = this.o
    const el = e.el
    el.style.height = ''
    el.style.fontSize = `${taille}px`
    // Formule trop large : réduite (jusqu'à 60 %), comme un \resizebox discret (R36).
    const f = el.querySelector<HTMLElement>('.r40-f')
    if (f) {
      f.style.fontSize = ''
      const dispo = largeur - 2 * PAD_X
      const w = f.offsetWidth
      if (w > dispo) f.style.fontSize = `${Math.max(0.6, dispo / w).toFixed(3)}em`
    }
    const cible = e.genre === 'decision' ? el.querySelector<HTMLElement>('.r40-dec-titre') : el
    let naturel = cible?.offsetHeight ?? cadre
    this.mesures.set(cle, naturel)
    // Trop haut pour le cadre : corps réduit par pas (au plus 3 essais, jusqu'à 70 %).
    let t = taille
    for (let k = 0; k < 3 && naturel > cadre + 0.5; k++) {
      t = Math.max(taille * 0.7, t * (cadre / naturel) * 0.99)
      el.style.fontSize = `${t.toFixed(2)}px`
      naturel = cible?.offsetHeight ?? cadre
    }
    // Le bloc prend exactement la hauteur de son cadre : pied en bas, formule centrée.
    if (e.genre !== 'decision') el.style.height = `${cadre}px`
    e.cadre = cadre
  }

  /** À chaque image, avant les placements. */
  debutImage(): void {
    this.placees.clear()
  }

  /**
   * Pose le HTML du point p (créé au besoin) : ancrage (x, y) à l'écran, échelle s ; w, haut et cadre en px
   * de mise en page (cadre : hauteur du bloc, ou du libellé pour une décision).
   */
  placer(p: number, x: number, y: number, s: number, op: number, w: number, haut: number, cadre: number, ref: string, portee: number): void {
    const cle = this.cles[p]
    if (!cle || !this.vue) return
    let e = this.cache.get(cle)
    if (!e) {
      e = this.construire(p)
      this.cache.set(cle, e)
    }
    if (!e.attache) {
      this.couche.append(e.el)
      e.attache = true
    }
    if (e.cadre !== cadre) this.ajuster(e, cle, cadre)
    this.placees.add(e)
    if (e.ref !== ref) {
      e.ref = ref
      if (e.num) e.num.textContent = ref
    }
    const pt = `${portee} énoncé${portee > 1 ? 's' : ''}`
    if (e.portee && e.portees !== pt) {
      e.portees = pt
      e.portee.textContent = pt
    }
    e.el.classList.toggle('r40-cite', this.cite === p)
    const t = `translate(${(x - (w / 2) * s).toFixed(2)}px,${(y - haut * s).toFixed(2)}px) scale(${s.toFixed(4)})`
    if (t !== e.transform) {
      e.transform = t
      e.el.style.transform = t
    }
    const o = op.toFixed(3)
    if (o !== e.opacite) {
      e.opacite = o
      e.el.style.opacity = o
    }
  }

  /** Détache du DOM les éléments non placés à cette image (ils restent en cache). */
  finImage(): void {
    for (const e of this.cache.values()) {
      if (e.attache && !this.placees.has(e)) {
        e.el.remove()
        e.attache = false
      }
    }
  }

  /** Numéro mis en évidence (bloc cité par un renvoi survolé). */
  definirCite(p: number | null): void {
    this.cite = p
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
}

export function validationLongue(n: NoeudR): string {
  return n.validation === 'ia_humain' ? 'Validé par l’IA et un humain' : n.validation === 'humain' ? 'Validé par un humain' : n.validation === 'ia' ? 'Validé par l’IA' : 'Non validé'
}
