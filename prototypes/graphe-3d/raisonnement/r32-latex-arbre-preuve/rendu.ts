// R32 · Rendu des arbres de preuve : une feuille HTML (KaTeX + Latin Modern) posée sur la scène sigma.
//
// La feuille est un calque DOM transformé à chaque image (translation + échelle) pour suivre la caméra
// 2D : les formules restent du vrai texte composé par KaTeX, nettes à tout zoom. Sigma ne dessine plus
// que les liens complets (L) et, en 3D, les points (la feuille s'efface quand les couches s'écartent).
//
// Codes (une seule couleur d'accent, le bleu, pour survol, sélection, aval et hypothèses actives) :
//   trait plein = validé, tireté = à vérifier (\dashedLine), barré de deux traits obliques = réfuté,
//   double trait = plusieurs étapes repliées (\doubleLine), pointillé gris = piste abandonnée.

import { el, FORCE_ROLE, type NoeudR, type VueRaisonnement } from '../../src/raisonnement'
import { disposer, type Arbres, type ElementArbre, type Page, type Rect } from './arbre'
import { echapper, extraireFormule, htmlFormule, htmlTexte, nomCourt } from './formules'

export interface Cible {
  genre: 'regle' | 'renvoi' | 'hypothese' | 'entree'
  point: number
  rect: Rect
}

export interface EtatRendu {
  arbres: Arbres | null
  page: Page | null
  /** Calque (plein écran) et contenu transformé. */
  feuille: HTMLElement
  contenu: HTMLElement
  /** Éléments DOM par point (conclusions, traits, étiquettes, renvois, hypothèses). */
  dom: Map<number, HTMLElement[]>
  cibles: Cible[]
  survol: Cible | null
  /** Hypothèses épinglées (points de choix). */
  epingles: Set<number>
  /** Écran = o + s · page. */
  transformation: { ox: number; oy: number; s: number }
  /** Centre de la page (px) et échelle px → monde. */
  cx: number
  cy: number
  echelle: number
}

export const ECHELLE = 0.01

/**
 * Nœud représenté par un point, lu dans la lecture courante (et non dans la disposition, qui peut
 * encore être celle de la dérivation précédente pendant un recalcul).
 */
export function noeudDe(vue: VueRaisonnement, p: number): NoeudR {
  const g = vue.lecture
  const nU = g.unites.length
  return g.justification.noeuds[p < nU ? g.unites[p]!.conclusion : g.masques[p - nU]!]!
}

export function creerEtat(vue: VueRaisonnement): EtatRendu {
  const feuille = el('div', { class: 'r32-feuille' })
  const contenu = el('div', { class: 'r32-contenu' })
  feuille.append(contenu)
  vue.scene.append(feuille)
  return {
    arbres: null, page: null, feuille, contenu, dom: new Map(), cibles: [], survol: null, epingles: new Set(),
    transformation: { ox: 0, oy: 0, s: 1 }, cx: 0, cy: 0, echelle: ECHELLE,
  }
}

// ─── Contenus ────────────────────────────────────────────────────────────────

const GENERIQUE = /^(Démonstration|Preuve|Variante)( \d+)?$/
const ABREGE_TYPE: Record<string, string> = {
  lemme: 'Lem.', proposition: 'Prop.', theoreme: 'Th.', resultat: 'Rés.', observation: 'Obs.', experience: 'Exp.',
  calcul: 'Calc.', conjecture: 'Conj.', assertion: 'Ass.', definition: 'Déf.', hypothese: 'Hyp.', axiome: 'Ax.',
  decision: 'Déc.', choix_modelisation: 'Mod.',
}
const VALIDATION: Record<string, string> = { humain: 'H', ia: 'IA', ia_humain: 'IA+H', aucune: '—' }

const cacheFormules = new Map<string, string | null>()
/** Formule extraite de l'énoncé (mise en cache par énoncé). */
export function formuleDe(n: NoeudR): string | null {
  if (!cacheFormules.has(n.enonce)) cacheFormules.set(n.enonce, extraireFormule(n.enonce))
  return cacheFormules.get(n.enonce)!
}

/** Outil admis : axiome, ou lemme / théorème / proposition / résultat admis. */
function estOutil(n: NoeudR): boolean {
  return n.type === 'axiome' || (n.admis && ['lemme', 'theoreme', 'proposition', 'resultat'].includes(n.type))
}

/**
 * Nom de la règle (étiquette à droite du trait), dans cet ordre :
 *   décision → son nom ; outil admis cité comme prémisse principale ou technique → son nom court
 *   (« Bilan q.d.m. ») ; nom de démonstration non générique → ce nom ; conclusion en formule → nom court
 *   du nœud ; sinon l'abréviation du type (la conclusion affiche déjà le nom).
 */
export function nomRegle(vue: VueRaisonnement, p: number): string {
  const n = noeudDe(vue, p)
  if (n.type === 'decision') return nomCourt(n.nom)
  const u = vue.lecture.unites[p]
  const j = vue.justification
  const outils = (u?.contexte ?? [])
    .filter((c) => (c.role === 'principale' || c.role === 'technique') && estOutil(j.noeuds[c.noeud]!))
    .sort((a, b) => FORCE_ROLE[b.role] - FORCE_ROLE[a.role])
  if (outils.length) return nomCourt(j.noeuds[outils[0]!.noeud]!.nom)
  const d = n.demonstrations[0]?.nom
  if (d && !GENERIQUE.test(d)) return d
  if (formuleDe(n)) return nomCourt(n.nom)
  return ABREGE_TYPE[n.type] ?? ''
}

/** HTML de la conclusion d'un point : formule, alternative retenue (décision) ou nom. */
function htmlConclusion(vue: VueRaisonnement, p: number): string {
  const n = noeudDe(vue, p)
  if (n.type === 'decision') {
    const r = n.decision?.alternatives.find((a) => a.retenue)?.libelle
    return htmlTexte(r ?? n.nom)
  }
  const f = formuleDe(n)
  return f ? htmlFormule(f) : `<span class="r32-texte">${htmlTexte(n.nom)}</span>`
}

const fmt = (x: number) => x.toFixed(2).replace('.', ',')

function htmlEtiquette(vue: VueRaisonnement, p: number): string {
  const n = noeudDe(vue, p)
  const u = vue.lecture.unites[p]
  const nom = nomRegle(vue, p)
  const mult = u && u.membres.length > 1 ? `<span class="r32-mult">×${u.membres.length}</span>` : ''
  const conf = `${fmt(n.confiance.estimation)}${n.statut === 'incertain' ? '?' : n.statut === 'refute' ? '†' : ''}`
  return `<span class="r32-sc">${htmlTexte(nom)}</span>${mult}<span class="r32-scripts"><span class="r32-sup">${conf}</span><span class="r32-sub">${VALIDATION[n.validation] ?? ''}</span></span>`
}

/** Marque d'hypothèse [Hₖ]ᵏ. */
export function htmlMarqueHyp(k: number): string {
  return htmlFormule(`[H_{${k}}]^{${k}}`)
}

// ─── Construction et mise en page ────────────────────────────────────────────

export interface OptionsRendu {
  taillePolice: number
  ecart: number
  ecartDerivations: number
  largeurPage: number
  largeurListe: number
  exposants: boolean
}

function mesurer(e: HTMLElement): { w: number; h: number } {
  return { w: e.offsetWidth, h: e.offsetHeight }
}

function poser(e: HTMLElement, r: Rect): void {
  e.style.left = `${r.x}px`
  e.style.top = `${r.y}px`
}

/** Construit le DOM des arbres, mesure, dispose ; renvoie les positions (px) de chaque point. */
export function construireFeuille(vue: VueRaisonnement, etat: EtatRendu, a: Arbres, o: OptionsRendu): { xs: Float64Array; ys: Float64Array } {
  const C = etat.contenu
  C.replaceChildren()
  C.style.setProperty('--r32-taille', `${o.taillePolice}px`)
  C.classList.toggle('sans-exposants', !o.exposants)
  etat.dom = new Map()
  const dom = etat.dom
  const lier = (p: number, e: HTMLElement) => {
    let l = dom.get(p)
    if (!l) dom.set(p, (l = []))
    l.push(e)
  }
  const bloc = (classe: string, html: string, p: number | null, titre?: string) => {
    const e = el('div', { class: classe })
    e.innerHTML = html
    if (titre) e.title = titre
    C.append(e)
    if (p !== null) lier(p, e)
    return e
  }
  const elements = new Map<ElementArbre, { c: HTMLElement; b?: HTMLElement; e?: HTMLElement; g?: HTMLElement; x?: HTMLElement }>()
  const conclusionHtml = new Map<number, string>()
  const concl = (p: number) => {
    let h = conclusionHtml.get(p)
    if (h === undefined) conclusionHtml.set(p, (h = htmlConclusion(vue, p)))
    return h
  }
  const creer = (e: ElementArbre) => {
    for (const p of e.premisses) creer(p)
    if (e.genre === 'hypothese') {
      const c = bloc('r32-el r32-feuille-hyp', htmlMarqueHyp(e.numero), e.point)
      ;({ w: e.wC, h: e.hC } = mesurer(c))
      elements.set(e, { c })
      return
    }
    if (e.genre === 'renvoi') {
      const c = bloc('r32-el r32-renvoi', `<div class="r32-vdots"><span>⋮</span><span class="r32-ref">(${e.numero})</span></div><div class="r32-renvoi-concl">${concl(e.point)}</div>`, e.point)
      ;({ w: e.wC, h: e.hC } = mesurer(c))
      elements.set(e, { c })
      return
    }
    const n = noeudDe(vue, e.point)
    let html = concl(e.point)
    if (n.type === 'decision') {
      const ecartees = n.decision?.alternatives.filter((x) => !x.retenue) ?? []
      const introduits = a.introduits.get(e.point) ?? []
      html = `<div class="r32-concl-ligne">${html}</div>`
      if (ecartees.length) html += `<div class="r32-ecartees">écarté : ${htmlTexte(ecartees[0]!.libelle)}${ecartees.length > 1 ? ` ; +${ecartees.length - 1}` : ''}</div>`
      if (introduits.length) html += `<div class="r32-introduit">introduit ${introduits.map(htmlMarqueHyp).join(' ')}</div>`
    }
    const c = bloc(`r32-el r32-concl${n.type === 'decision' ? ' r32-decision' : ''}${n.piste === 'abandonnee' ? ' abandon' : ''}`, html, e.point)
    const u = vue.lecture.unites[e.point]
    const trait = ['r32-el', 'r32-barre']
    if (u && u.membres.length > 1) trait.push('double')
    if (n.piste === 'abandonnee') trait.push('abandon')
    else if (n.statut === 'incertain') trait.push('tirete')
    else if (n.statut === 'refute') trait.push('refute')
    const b = bloc(trait.join(' '), n.statut === 'refute' && n.piste !== 'abandonnee' ? '<i></i><i></i>' : '', e.point)
    const et = bloc(`r32-el r32-etiquette${n.piste === 'abandonnee' ? ' abandon' : ''}`, htmlEtiquette(vue, e.point), e.point)
    let g: HTMLElement | undefined
    if (e.dechargees.length) {
      g = bloc('r32-el r32-dech', htmlFormule(`{}^{${e.dechargees.join(',')}}`), e.point, `Hypothèses déchargées : ${e.dechargees.map((k) => `H${k}`).join(', ')}`)
      ;({ w: e.wG, h: e.hG } = mesurer(g))
    }
    ;({ w: e.wC, h: e.hC } = mesurer(c))
    ;({ w: e.wE, h: e.hE } = mesurer(et))
    elements.set(e, { c, b, e: et, g })
  }
  for (const d of a.derivations) creer(d.racine)
  // Numéros des dérivations.
  const numeros = a.derivations.map((d) => {
    const e = bloc('r32-el r32-numero', `(${d.numero})`, null)
    ;({ w: d.wN, h: d.hN } = mesurer(e))
    return e
  })
  // Liste des hypothèses de modélisation.
  let titreHyp = { w: 0, h: 0 }
  let titre: HTMLElement | null = null
  const entrees: HTMLElement[] = []
  if (a.hypotheses.length) {
    titre = bloc('r32-el r32-liste-titre', 'Hypothèses de modélisation', null)
    titre.style.width = `${o.largeurListe}px`
    titreHyp = mesurer(titre)
    for (const h of a.hypotheses) {
      const n = noeudDe(vue, h.point)
      const intro = h.introduitePar !== null ? a.numeroDe.get(racineDe(a, h.introduitePar)) : undefined
      const html = `<span class="r32-marque">${htmlMarqueHyp(h.indice)}</span> <span class="r32-hyp-nom">${htmlTexte(n.nom)}.</span> ` +
        `<span class="r32-hyp-texte">${htmlTexte(n.choix?.hypothese ?? n.enonce)}</span>` +
        (intro ? ` <span class="r32-hyp-intro">Introduite par la décision (${intro}).</span>` : '')
      const e = bloc('r32-el r32-hyp-entree', html, h.point)
      e.style.width = `${o.largeurListe}px`
      ;({ w: h.w, h: h.h } = mesurer(e))
      entrees.push(e)
    }
  }
  // Légende de figure.
  const s = a.stats
  const niveau = vue.strategie.nom.replace(/^R32 · /, '')
  const legende = bloc('r32-el r32-legende',
    `<span class="r32-legende-num">Figure 1 –</span> ${echapper(vue.jeu.titre)}. ${s.regles} règles en ${s.derivations} dérivations ` +
    `(${s.lemmes} lemme${s.lemmes > 1 ? 's' : ''} cité${s.lemmes > 1 ? 's' : ''} par renvoi, ${s.copies} règle${s.copies > 1 ? 's' : ''} recopiée${s.copies > 1 ? 's' : ''}), ` +
    `${a.hypotheses.length} hypothèse${a.hypotheses.length > 1 ? 's' : ''} de modélisation. Lecture : ${echapper(niveau.toLowerCase())}.`, null)
  legende.style.maxWidth = '760px'
  const page = disposer(a, {
    ecart: o.ecart, ecartDerivations: o.ecartDerivations, largeurPage: o.largeurPage, ecartLignes: Math.round(o.taillePolice * 3),
    blanc: 3, titreHyp, legende: mesurer(legende),
  })
  etat.page = page

  // Positions DOM et cibles.
  etat.cibles = []
  const nU = vue.lecture.unites.length, nP = nU + vue.lecture.masques.length
  const xs = new Float64Array(nP), ys = new Float64Array(nP)
  const place = new Uint8Array(nP)
  const poserElement = (e: ElementArbre) => {
    for (const p of e.premisses) poserElement(p)
    const d = elements.get(e)!
    poser(d.c, e.conclusion)
    if (e.genre === 'regle') {
      const b = d.b!
      b.style.left = `${e.barre.x0}px`
      b.style.top = `${e.barre.y}px`
      b.style.width = `${e.barre.x1 - e.barre.x0}px`
      poser(d.e!, e.etiquette)
      if (d.g) poser(d.g, e.gauche)
      etat.cibles.push({ genre: 'regle', point: e.point, rect: e.conclusion }, { genre: 'regle', point: e.point, rect: e.etiquette })
      if (!place[e.point]) {
        place[e.point] = 1
        xs[e.point] = e.conclusion.x + e.conclusion.w / 2
        ys[e.point] = e.conclusion.y + e.conclusion.h / 2
      }
    } else etat.cibles.push({ genre: e.genre === 'renvoi' ? 'renvoi' : 'hypothese', point: e.point, rect: e.conclusion })
  }
  for (const d of a.derivations) poserElement(d.racine)
  a.derivations.forEach((d, k) => poser(numeros[k]!, d.numeroPos))
  if (titre) poser(titre, { x: page.listeHyp.x, y: page.listeHyp.y, w: 0, h: 0 })
  a.hypotheses.forEach((h, k) => {
    poser(entrees[k]!, h.pos)
    etat.cibles.push({ genre: 'entree', point: h.point, rect: h.pos })
    place[h.point] = 1
    xs[h.point] = h.pos.x + 14
    ys[h.point] = h.pos.y + 9
  })
  poser(legende, page.legende)
  // Masqués (contexte pur) : colonne à gauche, visibles avec les liens complets (dessinés par sigma).
  const xm = page.listeHyp.x - 120
  for (let p = nU; p < nP; p++) {
    xs[p] = xm - Math.floor((p - nU) / 24) * 150
    ys[p] = page.bornes.y + ((p - nU) % 24) * 18
  }
  // Unités jamais placées (ne devrait pas arriver) : sous la légende.
  for (let p = 0; p < nU; p++) if (!place[p]) {
    xs[p] = page.legende.x
    ys[p] = page.legende.y + page.legende.h + 20 + p * 2
  }
  return { xs, ys }
}

/** Dérivation (point racine) dont un point est la racine ou fait partie (première occurrence). */
function racineDe(a: Arbres, p: number): number {
  for (const d of a.derivations) {
    let trouve = false
    const chercher = (e: ElementArbre) => {
      if (e.genre === 'regle' && e.point === p) trouve = true
      for (const q of e.premisses) chercher(q)
    }
    chercher(d.racine)
    if (trouve) return d.point
  }
  return p
}

// ─── Transformation (suivi de la caméra) ─────────────────────────────────────

export function majTransformation(vue: VueRaisonnement, etat: EtatRendu): void {
  const e = vue.extrusion
  const alpha = Math.max(0, 1 - e * 2.2)
  etat.feuille.style.opacity = alpha < 1 ? String(alpha) : ''
  etat.feuille.style.visibility = alpha < 0.02 ? 'hidden' : ''
  const cam = vue.camera
  const E = etat.echelle
  const monde = (x: number, y: number): [number, number, number] => [(x - etat.cx) * E, 0, -(y - etat.cy) * E]
  const O = cam.projeterPoint(monde(0, 0))
  const X = cam.projeterPoint(monde(1000, 0))
  const s = (X.x - O.x) / 1000
  const t = etat.transformation
  if (Math.abs(t.ox - O.x) + Math.abs(t.oy - O.y) + Math.abs(t.s - s) < 1e-3) return
  etat.transformation = { ox: O.x, oy: O.y, s }
  etat.contenu.style.transform = `translate(${O.x}px, ${O.y}px) scale(${s})`
}

// ─── Survol ──────────────────────────────────────────────────────────────────

/** Élément sous le pointeur (écran), d'après la dernière transformation. */
export function cibleSous(etat: EtatRendu, x: number, y: number): Cible | null {
  const t = etat.transformation
  if (!t.s) return null
  const px = (x - t.ox) / t.s, py = (y - t.oy) / t.s
  const m = 3 / t.s
  const dans = (r: Rect, marge: number) => px >= r.x - marge && px <= r.x + r.w + marge && py >= r.y - marge && py <= r.y + r.h + marge
  for (const c of etat.cibles) if ((c.genre === 'renvoi' || c.genre === 'hypothese') && dans(c.rect, m)) return c
  for (const c of etat.cibles) if (dans(c.rect, m)) return c
  return null
}

// ─── États (survol, lignée, hypothèses actives) ──────────────────────────────

/** Hypothèses (points) actives : survolée + épinglées. */
export function hypothesesActives(etat: EtatRendu): number[] {
  const r = [...etat.epingles]
  const s = etat.survol
  if (s && (s.genre === 'hypothese' || s.genre === 'entree') && !etat.epingles.has(s.point)) r.push(s.point)
  return r
}

/** Points qui dépendent d'une hypothèse active (graphe complet), hypothèses comprises. */
export function dependantsActifs(etat: EtatRendu): Set<number> | null {
  const a = etat.arbres
  if (!a) return null
  const actifs = hypothesesActives(etat)
  if (!actifs.length) return null
  const s = new Set<number>(actifs)
  for (const c of actifs) for (const q of a.hypotheses.find((h) => h.point === c)?.portee ?? []) s.add(q)
  return s
}

/** Applique les classes d'état à tous les éléments de la feuille. */
export function majEtats(vue: VueRaisonnement, etat: EtatRendu): void {
  const actifs = dependantsActifs(etat)
  const sv = etat.survol
  const cite = sv?.genre === 'renvoi' ? sv.point : null
  for (const [p, els] of etat.dom) {
    let cls = ''
    if (vue.ligneeActive) {
      const l = vue.lignee[p]!
      cls = l === 3 ? 'r32-sel' : l === 1 ? 'r32-amont' : l === 2 ? 'r32-aval' : 'r32-hors'
    } else if (actifs) cls = actifs.has(p) ? 'r32-dep' : 'r32-hors'
    if (vue.survol === p || cite === p) cls += ' r32-survol'
    if (etat.epingles.has(p)) cls += ' r32-epingle'
    for (const e of els) {
      const base = e.dataset.base ?? (e.dataset.base = e.className)
      const voulu = cls ? `${base} ${cls}` : base
      if (e.className !== voulu) e.className = voulu
    }
  }
}
