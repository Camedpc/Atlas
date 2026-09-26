// R22 · Énoncés et inférences : graphe biparti (direction D2 de RECHERCHE-REPRESENTATION.md).
//
// Chaque démonstration est un objet dessiné : une barre d'inférence (à la Gentzen) posée devant sa
// conclusion, qui porte sa validité (✓ ? ✕), sa confiance (épaisseur, valeur, tirets du trait sortant
// selon la largeur de l'intervalle) et, en étiquette latérale, ce qu'elle cite sans le tracer (outils,
// contexte, renvois). Page autonome en Canvas 2D (pas de sigma) : il faut dessiner du texte, des
// rectangles et des barres, pas des points.

import { LIBELLES_ROLE, LIBELLES_TYPE, LIBELLES_VALIDATION, LIBELLES_VALIDITE, LIBELLES_ORIGINE, LIBELLES_STATUT, type Confiance } from '../../src/raisonnement/donnees'
import { construireModele, porteeUnites, unitesVisibles, type Niveau } from './modele'
import { LONG_BARRE, mettreEnPage, type MiseEnPage } from './mise-en-page'
import {
  C, COULEUR_STATUT, COULEUR_VALIDITE, dessiner, GLYPHE_STATUT, GLYPHE_VALIDITE, statutUnite, validationUnite,
  type Camera, type EtatDessin,
} from './rendu'
import meta from './meta.json'

// ─── Mesure du texte (cache) ─────────────────────────────────────────────────

const toileMesure = document.createElement('canvas').getContext('2d')!
const cacheMesure = new Map<string, number>()
function mesurer(t: string, police: string): number {
  const cle = `${police}|${t}`
  let v = cacheMesure.get(cle)
  if (v === undefined) {
    toileMesure.font = police
    v = toileMesure.measureText(t).width
    if (cacheMesure.size > 20000) cacheMesure.clear()
    cacheMesure.set(cle, v)
  }
  return v
}

// ─── DOM ─────────────────────────────────────────────────────────────────────

type Attrs = Record<string, string | ((e: Event) => void)>
function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...enfants: (Node | string | null | false)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') e.addEventListener(k.replace(/^on/, ''), v)
    else e.setAttribute(k, v)
  }
  for (const c of enfants) if (c !== null && c !== false) e.append(c)
  return e
}

const fmt = (v: number) => v.toFixed(2).replace('.', ',')
const dateCourte = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

/** Intervalle de confiance sur une échelle 0–1 commune (forest plot miniature). */
function intervalle(c: Confiance, couleur: string = C.encre): SVGSVGElement {
  const w = 132, h = 14
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('width', String(w + 8))
  svg.setAttribute('height', String(h))
  svg.setAttribute('class', 'r22-ic')
  const X = (v: number) => 4 + v * w
  const ligne = (x1: number, y1: number, x2: number, y2: number, c2: string, ep = 1) => {
    const l = document.createElementNS(ns, 'line')
    l.setAttribute('x1', String(x1)); l.setAttribute('y1', String(y1)); l.setAttribute('x2', String(x2)); l.setAttribute('y2', String(y2))
    l.setAttribute('stroke', c2); l.setAttribute('stroke-width', String(ep))
    svg.append(l)
  }
  ligne(X(0), 11, X(1), 11, C.filet)
  for (const t of [0, 0.5, 1]) ligne(X(t), 9, X(t), 13, C.grisClair)
  ligne(X(c.bas), 6, X(c.haut), 6, couleur, 1.5)
  ligne(X(c.bas), 3.5, X(c.bas), 8.5, couleur)
  ligne(X(c.haut), 3.5, X(c.haut), 8.5, couleur)
  const p = document.createElementNS(ns, 'rect')
  p.setAttribute('x', String(X(c.estimation) - 2.5)); p.setAttribute('y', '3.5'); p.setAttribute('width', '5'); p.setAttribute('height', '5')
  p.setAttribute('fill', couleur)
  svg.append(p)
  return svg
}

function texteConfiance(c: Confiance): string {
  return `${fmt(c.estimation)} [${fmt(c.bas)} – ${fmt(c.haut)}]`
}

// ─── État ────────────────────────────────────────────────────────────────────

const m = construireModele()

interface Options {
  niveau: Niveau
  alternatives: boolean
  auxiliaires: boolean
  contexte: boolean
  renvoi: number
  filtre: 'toutes' | 'faibles'
  regle: 'produit' | 'minimum'
}
const CLE = `atlas-raisonnement:${meta.id}`
const defaut: Options = { niveau: 'resultats', alternatives: true, auxiliaires: true, contexte: false, renvoi: 4, filtre: 'toutes', regle: 'produit' }
let opt: Options = { ...defaut }
try {
  const brut = localStorage.getItem(CLE)
  if (brut) opt = { ...defaut, ...JSON.parse(brut) as Partial<Options> }
  if (opt.renvoi === null || opt.renvoi > 1000) opt.renvoi = Infinity
} catch { /* stockage indisponible : défauts */ }
const memoriser = () => {
  try { localStorage.setItem(CLE, JSON.stringify({ ...opt, renvoi: Number.isFinite(opt.renvoi) ? opt.renvoi : 9999 })) } catch { /* ignoré */ }
}

type Selection = { genre: 'unite'; i: number } | { genre: 'barre'; inf: number } | { genre: 'bande'; noeud: number } | null
let selection: Selection = null
let cheminActif = false
let visibles = unitesVisibles(m, opt.niveau)
let page: MiseEnPage = calculerPage()
const cam: Camera = { x: 0, y: 0, k: 0.6 }
let survolUnite: number | null = null
let survolBarre: number | null = null
let survolBande: number | null = null
let largeur = 800, hauteur = 600
const dpr = () => Math.min(2, window.devicePixelRatio || 1)

function calculerPage(): MiseEnPage {
  return mettreEnPage(m, { visibles, alternatives: opt.alternatives, auxiliaires: opt.auxiliaires, renvoiRangs: opt.renvoi, mesurer })
}

// ─── Interface ───────────────────────────────────────────────────────────────

const app = document.getElementById('app')!
const toile = el('canvas', { class: 'r22-canvas' })
const ctx = toile.getContext('2d')!
const fiche = el('div', { class: 'r22-fiche', hidden: '' })
const carte = el('canvas', { class: 'r22-carte', title: 'Vue d’ensemble : cliquer ou glisser pour naviguer' })
const ctxCarte = carte.getContext('2d')!
const zoneToile = el('div', { class: 'r22-toile' }, toile, fiche, carte)
const resume = el('div', { class: 'r22-resume' })
const zoneSelection = el('div', { class: 'r22-selection' })
const legende = construireLegende()
const panneau = el('aside', { class: 'r22-panneau' },
  el('section', {}, el('h2', {}, 'Lecture'), resume),
  el('section', {}, el('h2', {}, 'Sélection'), zoneSelection),
  el('section', {}, el('h2', {}, 'Notation'), legende),
)

function segment<T extends string>(valeurs: [T, string][], courant: () => T, choisir: (v: T) => void): HTMLElement {
  const boutons = valeurs.map(([v, libelle]) => {
    const b = el('button', { type: 'button', 'data-v': v, onclick: () => { choisir(v); maj() } }, libelle)
    return b
  })
  const maj = () => boutons.forEach((b) => b.classList.toggle('actif', b.dataset.v === courant()))
  maj()
  return el('div', { class: 'r22-segment' }, ...boutons)
}

function caseACocher(libelle: string, titre: string, courant: () => boolean, changer: (v: boolean) => void): HTMLElement {
  const input = el('input', { type: 'checkbox' })
  input.checked = courant()
  input.addEventListener('change', () => changer(input.checked))
  return el('label', { class: 'r22-case', title: titre }, input, libelle)
}

function liste(libelle: string, valeurs: [string, string][], courant: () => string, changer: (v: string) => void): HTMLElement {
  const s = el('select', {}, ...valeurs.map(([v, t]) => el('option', { value: v }, t)))
  s.value = courant()
  s.addEventListener('change', () => changer(s.value))
  return el('label', { class: 'r22-liste' }, el('span', {}, libelle), s)
}

const boutonChemin = el('button', {
  type: 'button', class: 'r22-bouton',
  title: 'Chaîne d’inférences la moins sûre qui mène à l’énoncé sélectionné',
  onclick: () => { cheminActif = !cheminActif; toutMettreAJour() },
}, 'Chemin le plus faible')

const barre = el('header', { class: 'r22-barre' },
  el('div', { class: 'r22-titre' },
    el('a', { href: '../../index.html', class: 'r22-retour', title: 'Retour au catalogue' }, '← catalogue'),
    el('h1', {}, meta.titre),
    el('span', { class: 'r22-sous-titre' }, m.jeu.titre),
  ),
  el('div', { class: 'r22-commandes' },
    segment<Niveau>([['resultats', 'Vers les résultats'], ['tout', 'Tout']], () => opt.niveau, (v) => { opt.niveau = v; reconstruire() }),
    caseACocher('Démonstrations alternatives', 'Barres grises empilées sous la principale', () => opt.alternatives, (v) => { opt.alternatives = v; reconstruire() }),
    caseACocher('Auxiliaires tracées', 'Sinon, citées en étiquette « aux. »', () => opt.auxiliaires, (v) => { opt.auxiliaires = v; reconstruire() }),
    caseACocher('Contexte', 'Liens en tirets de chaque hypothèse et choix de modélisation vers les inférences qui les citent', () => opt.contexte, (v) => { opt.contexte = v; toutMettreAJour() }),
    liste('Renvoi au-delà de', [['2', '2 rangs'], ['3', '3 rangs'], ['4', '4 rangs'], ['6', '6 rangs'], ['Infinity', 'jamais']],
      () => String(opt.renvoi), (v) => { opt.renvoi = v === 'Infinity' ? Infinity : Number(v); reconstruire() }),
    liste('Inférences', [['toutes', 'toutes'], ['faibles', 'à vérifier ou invalides']], () => opt.filtre, (v) => { opt.filtre = v as Options['filtre']; toutMettreAJour() }),
    boutonChemin,
    liste('Règle', [['produit', 'produit des confiances'], ['minimum', 'maillon le plus faible']], () => opt.regle, (v) => { opt.regle = v as Options['regle']; toutMettreAJour() }),
    el('button', { type: 'button', class: 'r22-bouton', title: 'Tout cadrer (touche Origine ou 0)', onclick: () => { cadrerTout(); demanderDessin() } }, 'Cadrer'),
  ),
)

app.append(el('div', { class: 'r22' }, barre, el('div', { class: 'r22-corps' }, zoneToile, panneau)))

// ─── Emphase (lignée, filtre, portée, chemin) ────────────────────────────────

let alphaUnite = new Float32Array(m.unites.length).fill(1)
let alphaBarre = new Float32Array(page.barres.length).fill(1)
let chemin: EtatDessin['chemin'] = null
let resultatChemin: { unites: number[]; scores: number[] } | null = null

/** Prémisses (unités) de chaque unité dans la page : arêtes tracées + renvois. */
function premissesPage(): { avant: number[][]; apres: number[][] } {
  const avant: number[][] = m.unites.map(() => [])
  const apres: number[][] = m.unites.map(() => [])
  page.barres.forEach((b) => {
    const u = m.inferences[b.inf]!.conclusion
    const srcs = new Set<number>(b.aretes.map((a) => a.source))
    for (const g of b.groupes) for (const it of g.items) if (it.unite >= 0 && visibles[it.unite] && (g.role === 'principale' || g.role === 'auxiliaire')) srcs.add(it.unite)
    for (const s of srcs) {
      avant[u]!.push(s)
      apres[s]!.push(u)
    }
  })
  return { avant, apres }
}

function parcourir(depart: number, adj: number[][]): Set<number> {
  const vus = new Set<number>([depart])
  const pile = [depart]
  while (pile.length) for (const v of adj[pile.pop()!]!) if (!vus.has(v)) { vus.add(v); pile.push(v) }
  return vus
}

/** Chaîne d'inférences la moins sûre vers u (démonstrations principales, prémisses principales et auxiliaires). */
function cheminLePlusFaible(u: number): { unites: number[]; scores: number[] } {
  const princ = new Map<number, number>()
  page.barres.forEach((b, bi) => { if (m.inferences[b.inf]!.principale) princ.set(m.inferences[b.inf]!.conclusion, bi) })
  const conf = (v: number) => {
    const bi = princ.get(v)
    return bi === undefined ? 1 : m.inferences[page.barres[bi]!.inf]!.confiance.estimation
  }
  const memo = new Map<number, { score: number; suivant: number }>()
  const enCours = new Set<number>()
  const meilleur = (v: number): number => {
    const d = memo.get(v)
    if (d) return d.score
    if (enCours.has(v)) return conf(v)
    enCours.add(v)
    const bi = princ.get(v)
    let pire = Infinity, arg = -1
    if (bi !== undefined) {
      const b = page.barres[bi]!
      const srcs = new Set<number>(b.aretes.map((a) => a.source))
      for (const g of b.groupes) for (const it of g.items) if (it.unite >= 0 && visibles[it.unite] && (g.role === 'principale' || g.role === 'auxiliaire')) srcs.add(it.unite)
      for (const s of srcs) {
        const sc = meilleur(s)
        if (sc < pire) { pire = sc; arg = s }
      }
    }
    const c = conf(v)
    const score = arg < 0 ? c : opt.regle === 'produit' ? c * pire : Math.min(c, pire)
    enCours.delete(v)
    memo.set(v, { score, suivant: arg })
    return score
  }
  meilleur(u)
  const unites: number[] = []
  const scores: number[] = []
  let v = u
  while (v >= 0 && unites.length < 200) {
    unites.push(v)
    scores.push(memo.get(v)!.score)
    v = memo.get(v)!.suivant
  }
  unites.reverse()
  scores.reverse()
  return { unites, scores }
}

function calculerEmphase(): void {
  alphaUnite = new Float32Array(m.unites.length).fill(1)
  alphaBarre = new Float32Array(page.barres.length).fill(1)
  const ATT = 0.22
  const garder = (unites: Set<number> | null, barres: Set<number> | null) => {
    if (unites) for (let u = 0; u < alphaUnite.length; u++) if (!unites.has(u)) alphaUnite[u] = Math.min(alphaUnite[u]!, ATT)
    if (barres) for (let b = 0; b < alphaBarre.length; b++) if (!barres.has(b)) alphaBarre[b] = Math.min(alphaBarre[b]!, ATT)
  }
  const barresDeUnites = (s: Set<number>) => {
    const r = new Set<number>()
    page.barres.forEach((b, i) => { if (s.has(m.inferences[b.inf]!.conclusion)) r.add(i) })
    return r
  }
  // Lignée d'un énoncé sélectionné.
  if (selection?.genre === 'unite' && visibles[selection.i]) {
    const { avant, apres } = premissesPage()
    const anc = parcourir(selection.i, avant)
    const desc = parcourir(selection.i, apres)
    const tous = new Set([...anc, ...desc])
    // Barres : celles des antécédents (et de la sélection) ; pour les descendants aussi.
    garder(tous, barresDeUnites(tous))
  }
  // Inférence sélectionnée : ses prémisses et sa conclusion.
  if (selection?.genre === 'barre') {
    const bi = page.barres.findIndex((b) => b.inf === (selection as { inf: number }).inf)
    if (bi >= 0) {
      const b = page.barres[bi]!
      const s = new Set<number>([m.inferences[b.inf]!.conclusion, ...b.aretes.map((a) => a.source)])
      for (const g of b.groupes) for (const it of g.items) if (it.unite >= 0) s.add(it.unite)
      garder(s, new Set([bi]))
    }
  }
  // Portée d'un élément de bande (épinglé ou survolé).
  const bande = survolBande ?? (selection?.genre === 'bande' ? selection.noeud : null)
  if (bande !== null) {
    const p = porteeUnites(m, bande)
    garder(p, barresDeUnites(p))
  }
  // Filtre : inférences à vérifier ou invalides.
  if (opt.filtre === 'faibles') {
    const bs = new Set<number>()
    const us = new Set<number>()
    page.barres.forEach((b, i) => {
      if (m.inferences[b.inf]!.validite === 'valide') return
      bs.add(i)
      us.add(m.inferences[b.inf]!.conclusion)
      for (const a of b.aretes) us.add(a.source)
    })
    garder(us, bs)
  }
  // Chemin le plus faible.
  chemin = null
  resultatChemin = null
  if (cheminActif && selection?.genre === 'unite' && visibles[selection.i]) {
    resultatChemin = cheminLePlusFaible(selection.i)
    const us = new Set(resultatChemin.unites)
    const bs = new Set<number>()
    page.barres.forEach((b, i) => { if (m.inferences[b.inf]!.principale && us.has(m.inferences[b.inf]!.conclusion)) bs.add(i) })
    chemin = { unites: us, barres: bs }
  }
  boutonChemin.classList.toggle('actif', cheminActif)
  boutonChemin.disabled = selection?.genre !== 'unite'
}

// ─── Dessin ──────────────────────────────────────────────────────────────────

let dessinDemande = false
function demanderDessin(): void {
  if (dessinDemande) return
  dessinDemande = true
  requestAnimationFrame(() => {
    dessinDemande = false
    const etat: EtatDessin = {
      m, page, cam, largeur, hauteur, alphaUnite, alphaBarre, survolUnite, survolBarre,
      selection: selection?.genre === 'unite' ? selection.i : null,
      bandeActive: survolBande ?? (selection?.genre === 'bande' ? selection.noeud : null),
      contexte: opt.contexte, chemin, mesurer,
    }
    dessiner(ctx, etat, dpr())
    dessinerCarte()
  })
}

function dimensionner(): void {
  const r = zoneToile.getBoundingClientRect()
  largeur = Math.max(100, r.width)
  hauteur = Math.max(100, r.height)
  toile.width = Math.round(largeur * dpr())
  toile.height = Math.round(hauteur * dpr())
  toile.style.width = `${largeur}px`
  toile.style.height = `${hauteur}px`
  demanderDessin()
}

function cadrerTout(): void {
  const b = page.bornes
  const k = Math.min(largeur / (b.x1 - b.x0), hauteur / (b.y1 - b.y0)) * 0.97
  cam.k = k
  cam.x = (largeur - (b.x1 - b.x0) * k) / 2 - b.x0 * k
  cam.y = 8 - b.y0 * k
}

/** Cadrage initial : lisible (k ≥ 0,75), calé en haut à gauche (hypothèses et premiers rangs). */
function cadrerDebut(): void {
  const b = page.bornes
  const k = Math.max(0.75, Math.min(1, hauteur / (b.y1 - b.y0)))
  cam.k = k
  cam.x = 4 - b.x0 * k
  cam.y = 6 - b.y0 * k
}

function centrerSur(u: number): void {
  const b = page.boites[u]
  if (!b) return
  if (cam.k < 0.7) cam.k = 0.9
  cam.x = largeur / 2 - (b.x + b.w / 2) * cam.k
  cam.y = hauteur / 2 - (b.y + b.h / 2) * cam.k
}

// Vue d'ensemble.
const CARTE_L = 240
function dessinerCarte(): void {
  const b = page.bornes
  const echelle = CARTE_L / (b.x1 - b.x0)
  const h = Math.round((b.y1 - b.y0) * echelle)
  const d = dpr()
  if (carte.width !== CARTE_L * d || carte.height !== h * d) {
    carte.width = CARTE_L * d
    carte.height = h * d
    carte.style.width = `${CARTE_L}px`
    carte.style.height = `${h}px`
  }
  const c = ctxCarte
  c.setTransform(d, 0, 0, d, 0, 0)
  c.fillStyle = '#ffffff'
  c.fillRect(0, 0, CARTE_L, h)
  c.setTransform(d * echelle, 0, 0, d * echelle, -b.x0 * echelle * d, -b.y0 * echelle * d)
  for (const cl of page.couloirs) {
    c.fillStyle = cl.abandonne ? C.abandon : C.couloir
    c.fillRect(b.x0, cl.y0, b.x1 - b.x0, cl.y1 - cl.y0)
  }
  for (const bo of page.boites) {
    if (!bo) continue
    const un = m.unites[bo.u]!
    c.fillStyle = selection?.genre === 'unite' && selection.i === bo.u ? C.selection : alphaUnite[bo.u]! < 0.5 ? C.grisClair : COULEUR_STATUT[statutUnite(m, un)]
    c.fillRect(bo.x, bo.y, bo.w, bo.h)
  }
  c.setTransform(d, 0, 0, d, 0, 0)
  c.strokeStyle = C.selection
  c.lineWidth = 1
  const vx = (-cam.x / cam.k - b.x0) * echelle, vy = (-cam.y / cam.k - b.y0) * echelle
  c.strokeRect(vx, vy, (largeur / cam.k) * echelle, (hauteur / cam.k) * echelle)
}

function naviguerCarte(e: PointerEvent): void {
  const r = carte.getBoundingClientRect()
  const b = page.bornes
  const echelle = CARTE_L / (b.x1 - b.x0)
  const wx = b.x0 + (e.clientX - r.left) / echelle, wy = b.y0 + (e.clientY - r.top) / echelle
  cam.x = largeur / 2 - wx * cam.k
  cam.y = hauteur / 2 - wy * cam.k
  demanderDessin()
}
carte.addEventListener('pointerdown', (e) => {
  e.stopPropagation()
  carte.setPointerCapture(e.pointerId)
  naviguerCarte(e)
  const bouger = (ev: PointerEvent) => naviguerCarte(ev)
  const fin = () => { carte.removeEventListener('pointermove', bouger); carte.removeEventListener('pointerup', fin) }
  carte.addEventListener('pointermove', bouger)
  carte.addEventListener('pointerup', fin)
})

// ─── Détection ───────────────────────────────────────────────────────────────

type Cible = { genre: 'unite'; i: number } | { genre: 'barre'; bi: number } | { genre: 'bande'; noeud: number } | null

function cibleSous(sx: number, sy: number): Cible {
  const x = (sx - cam.x) / cam.k, y = (sy - cam.y) / cam.k
  for (let bi = page.barres.length - 1; bi >= 0; bi--) {
    const b = page.barres[bi]!
    if (x >= b.x - 4 && x <= b.x + LONG_BARRE + 14 && y >= b.y - 9 && y <= b.y + 9) return { genre: 'barre', bi }
  }
  for (const bo of page.boites) if (bo && x >= bo.x && x <= bo.x + bo.w && y >= bo.y && y <= bo.y + bo.h) return { genre: 'unite', i: bo.u }
  for (const e of page.bande) if (x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h) return { genre: 'bande', noeud: e.noeud }
  return null
}

// ─── Fiches ──────────────────────────────────────────────────────────────────

function lienCode(u: number): HTMLElement {
  const un = m.unites[u]!
  return el('button', { type: 'button', class: 'r22-code', title: un.titre, onclick: () => selectionner({ genre: 'unite', i: u }, true) }, un.code)
}

function ligneMeta(libelle: string, ...valeur: (Node | string)[]): HTMLElement {
  return el('div', { class: 'r22-meta' }, el('span', { class: 'r22-meta-l' }, libelle), el('span', {}, ...valeur))
}

function glyphe(texte: string, couleur: string): HTMLElement {
  const s = el('span', { class: 'r22-glyphe' }, texte)
  s.style.color = couleur
  return s
}

function ficheUnite(u: number, complete: boolean): HTMLElement {
  const un = m.unites[u]!
  const n = un.noeud
  const statut = statutUnite(m, un)
  const f = el('div', { class: 'r22-f' },
    el('div', { class: 'r22-f-tete' }, el('span', { class: 'r22-pc' }, `${LIBELLES_TYPE[un.type]}${un.genre === 'serie' ? ` × ${un.membres.length}` : ''}`), el('span', { class: 'r22-mono' }, un.code)),
    el('div', { class: 'r22-f-titre' }, un.titre),
  )
  if (un.genre === 'noeud') f.append(el('div', { class: 'r22-f-enonce' }, n.enonce))
  f.append(
    ligneMeta('Statut', glyphe(GLYPHE_STATUT[statut], COULEUR_STATUT[statut]), ` ${LIBELLES_STATUT[statut]}${un.ouvert ? ' · aucune démonstration valide' : ''}`),
    ligneMeta('Validation', LIBELLES_VALIDATION[validationUnite(m, un)]),
    ligneMeta('Origine', `${LIBELLES_ORIGINE[n.origine]} · ${n.auteur} · ${dateCourte(n.cree_le)}`),
    ligneMeta('Sous-problème', m.jeu.sousProblemes.find((s) => s.id === un.couloir)?.nom ?? un.couloir),
  )
  // Démonstrations.
  const infs = un.inferences.map((i) => m.inferences[i]!)
  if (infs.length) {
    const t = el('table', { class: 'r22-t' }, el('tr', {}, el('th', {}, ''), el('th', {}, 'Démonstration'), el('th', {}, 'Confiance')))
    for (const inf of infs) t.append(el('tr', { class: inf.principale ? '' : 'r22-gris' },
      el('td', {}, glyphe(GLYPHE_VALIDITE[inf.validite], COULEUR_VALIDITE[inf.validite])),
      el('td', {}, inf.nom, inf.principale && infs.length > 1 ? el('span', { class: 'r22-gris' }, ' · principale') : ''),
      el('td', {}, intervalle(inf.confiance, inf.principale ? C.encre : C.gris), el('span', { class: 'r22-mono r22-petit' }, ` ${fmt(inf.confiance.estimation)}`)),
    ))
    f.append(el('div', { class: 'r22-f-sous' }, 'Inférences'), t)
  } else f.append(ligneMeta('Démonstration', n.admis ? 'admis (sans démonstration)' : 'aucune'))
  // Série : valeurs.
  if (un.serie) {
    const t = el('table', { class: 'r22-t' }, el('tr', {}, el('th', {}, 'Code'), el('th', {}, 'Membre'), el('th', {}, 'Valeur')))
    un.membres.forEach((i, k) => {
      const p = un.serie!.points[k]!
      t.append(el('tr', {}, el('td', { class: 'r22-mono' }, m.code[i]!), el('td', {}, m.j.noeuds[i]!.nom), el('td', { class: 'r22-mono' }, p.y === null ? '—' : String(p.y).replace('.', ','))))
    })
    f.append(el('div', { class: 'r22-f-sous' }, `Série repliée (${un.membres.length} nœuds) · valeurs lues dans les énoncés`), t)
  }
  // Décision (QOC).
  if (n.decision) {
    const d = n.decision
    const t = el('table', { class: 'r22-t' })
    for (const a of d.alternatives) t.append(el('tr', { class: a.retenue ? '' : 'r22-gris' },
      el('td', {}, a.retenue ? glyphe('◆', C.encre) : glyphe('◇', C.gris)),
      el('td', {}, a.retenue ? el('b', {}, a.libelle) : el('s', {}, a.libelle), a.raison ? el('div', { class: 'r22-petit' }, a.raison) : ''),
    ))
    f.append(el('div', { class: 'r22-f-sous' }, `Question : ${d.question}`), t, el('div', { class: 'r22-petit' }, `Raison : ${d.raison}`))
  }
  if (un.controles.length) f.append(ligneMeta('Contrôles', un.controles.map((c) => `${GLYPHE_VALIDITE[m.j.noeuds[c]!.demonstrations[0]?.validite ?? 'a_verifier']} ${m.j.noeuds[c]!.nom} (${m.code[c]})`).join(' ; ')))
  for (const i of un.membres) for (const l of m.j.noeuds[i]!.liens ?? []) {
    const c = m.j.index.get(l.cible)
    const v = c === undefined ? -1 : m.uniteDe[c]!
    f.append(ligneMeta({ contredit: 'Contredit', resout: 'Résout', remplace: 'Remplace', abandonne: 'Abandonne' }[l.genre], v >= 0 ? (complete ? lienCode(v) : m.unites[v]!.code) : l.cible, l.note ? ` — ${l.note}` : ''))
  }
  const utilisateurs = [...new Set(m.citeePar[u]!.map((i) => m.inferences[i]!.conclusion))]
  if (complete) {
    const princ = infs[0]
    if (princ) {
      f.append(el('div', { class: 'r22-f-sous' }, 'Prémisses de la démonstration principale'), premissesParRole(princ.k))
    }
    if (utilisateurs.length) f.append(el('div', { class: 'r22-f-sous' }, `Utilisé par (${utilisateurs.length})`), el('div', { class: 'r22-codes' }, ...utilisateurs.map(lienCode)))
    if (resultatChemin) f.append(blocChemin())
  } else f.append(ligneMeta('Utilisé par', `${utilisateurs.length} énoncé(s)`))
  return f
}

function premissesParRole(inf: number): HTMLElement {
  const i = m.inferences[inf]!
  const bloc = el('div', { class: 'r22-roles' })
  for (const role of ['principale', 'auxiliaire', 'technique', 'contexte'] as const) {
    const cs = i.premisses.filter((c) => c.role === role)
    if (!cs.length) continue
    bloc.append(el('div', { class: 'r22-role' }, el('span', { class: 'r22-meta-l' }, LIBELLES_ROLE[role]),
      el('span', { class: 'r22-codes' }, ...cs.map((c) => c.unite >= 0
        ? (visibles[c.unite] ? lienCode(c.unite) : el('span', { class: 'r22-mono r22-gris', title: `${m.unites[c.unite]!.titre} (masqué au niveau « vers les résultats »)` }, m.unites[c.unite]!.code))
        : el('span', { class: 'r22-mono', title: m.j.noeuds[c.noeud]!.nom }, `${m.court[c.noeud]}`)))))
  }
  return bloc
}

function ficheBarre(inf: number, complete: boolean): HTMLElement {
  const i = m.inferences[inf]!
  const un = m.unites[i.conclusion]!
  const bi = page.barres.findIndex((b) => b.inf === inf)
  const b = bi >= 0 ? page.barres[bi]! : null
  const f = el('div', { class: 'r22-f' },
    el('div', { class: 'r22-f-tete' }, el('span', { class: 'r22-pc' }, i.principale ? 'Inférence · principale' : `Inférence · variante ${i.rang + 1}`), el('span', { class: 'r22-mono' }, `→ ${un.code}`)),
    el('div', { class: 'r22-f-titre' }, i.nom),
    el('div', { class: 'r22-petit' }, `conclut : ${un.titre}`),
    ligneMeta('Validité', glyphe(GLYPHE_VALIDITE[i.validite], COULEUR_VALIDITE[i.validite]), ` ${LIBELLES_VALIDITE[i.validite]}`),
    ligneMeta('Confiance', intervalle(i.confiance), el('span', { class: 'r22-mono r22-petit' }, ` ${texteConfiance(i.confiance)}`)),
    ligneMeta('Auteur', `${i.auteur} · ${dateCourte(i.date)}`),
    el('div', { class: 'r22-f-sous' }, `Prémisses (${i.premisses.length})`),
    premissesParRole(inf),
  )
  if (b) {
    const renvois = b.groupes.flatMap((g) => g.items.filter((it) => it.unite >= 0 && visibles[it.unite] && (g.role === 'principale' || g.role === 'auxiliaire')).map((it) => it.texte))
    f.append(ligneMeta('Tracé', `${b.aretes.length} prémisse(s) tracée(s)${renvois.length ? ` · renvois : ${renvois.join(', ')}` : ''} · ${b.groupes.reduce((s, g) => s + g.items.length, 0) - renvois.length} en étiquette`))
  }
  f.append(ligneMeta('Vérificateur', i.validite === 'a_verifier' ? 'pas encore jugée' : `verdict « ${LIBELLES_VALIDITE[i.validite].toLowerCase()} » ; justification absente du jeu synthétique`))
  if (i.demos.length > 1) f.append(ligneMeta('Agrégée', `${i.demos.length} démonstrations (une par membre de la série) ; validité = la pire, confiance = le minimum`))
  if (complete) f.append(el('div', { class: 'r22-codes' }, el('button', { type: 'button', class: 'r22-bouton', onclick: () => selectionner({ genre: 'unite', i: i.conclusion }, true) }, `Sélectionner ${un.code}`)))
  return f
}

function ficheBande(noeud: number, complete: boolean): HTMLElement {
  const n = m.j.noeuds[noeud]!
  const portee = porteeUnites(m, noeud)
  const vis = [...portee].filter((u) => visibles[u])
  const directes = new Set(m.citeeParNoeud[noeud]!.map((i) => m.inferences[i]!.conclusion))
  const f = el('div', { class: 'r22-f' },
    el('div', { class: 'r22-f-tete' }, el('span', { class: 'r22-pc' }, LIBELLES_TYPE[n.type]), el('span', { class: 'r22-mono' }, m.code[noeud]!)),
    el('div', { class: 'r22-f-titre' }, n.nom),
    el('div', { class: 'r22-f-enonce' }, n.enonce),
    ligneMeta('Statut', glyphe(GLYPHE_STATUT[n.statut], COULEUR_STATUT[n.statut]), ` ${LIBELLES_STATUT[n.statut]}`),
  )
  if (n.choix) {
    f.append(ligneMeta('Hypothèse', n.choix.hypothese), ligneMeta('Portée déclarée', n.choix.portee))
    if (n.choix.alternatives?.length) f.append(ligneMeta('Alternatives', n.choix.alternatives.join(' ; ')))
  }
  f.append(ligneMeta('Portée calculée', `${portee.size} énoncé(s) en dépendent (transitivement), dont ${vis.length} affiché(s) ; cité directement par ${directes.size}`))
  if (complete) {
    const tri = vis.sort((a, b) => (page.boites[a]?.rang ?? 0) - (page.boites[b]?.rang ?? 0))
    f.append(el('div', { class: 'r22-f-sous' }, 'Portée (affichée, par rang)'), el('div', { class: 'r22-codes' }, ...tri.map(lienCode)))
  }
  return f
}

function blocChemin(): HTMLElement {
  const r = resultatChemin!
  const t = el('table', { class: 'r22-t' }, el('tr', {}, el('th', {}, 'Énoncé'), el('th', {}, ''), el('th', {}, 'Confiance'), el('th', {}, 'Cumul')))
  let pireI = -1, pire = Infinity
  r.unites.forEach((u) => {
    const i = m.inferences[m.unites[u]!.inferences[0] ?? -1]
    if (i && i.confiance.estimation < pire) { pire = i.confiance.estimation; pireI = u }
  })
  r.unites.forEach((u, k) => {
    const i = m.inferences[m.unites[u]!.inferences[0] ?? -1]
    t.append(el('tr', { class: u === pireI ? 'r22-pire' : '' },
      el('td', {}, lienCode(u)),
      el('td', {}, i ? glyphe(GLYPHE_VALIDITE[i.validite], COULEUR_VALIDITE[i.validite]) : ''),
      el('td', { class: 'r22-mono' }, i ? texteConfiance(i.confiance) : 'admis'),
      el('td', { class: 'r22-mono' }, fmt(r.scores[k]!)),
    ))
  })
  return el('div', { class: 'r22-chemin' },
    el('div', { class: 'r22-f-sous' }, `Chemin le plus faible · ${opt.regle === 'produit' ? 'produit des confiances' : 'maillon le plus faible'} = ${fmt(r.scores[r.scores.length - 1]!)}`),
    el('div', { class: 'r22-petit' }, 'Démonstrations principales, prémisses principales et auxiliaires (renvois compris). Maillon le plus faible souligné.'),
    t,
  )
}

// ─── Panneau ─────────────────────────────────────────────────────────────────

function majResume(): void {
  const s = m.stats
  const nVis = visibles.reduce((a, b) => a + b, 0)
  const series = m.unites.filter((u) => u.genre === 'serie' && visibles[u.k])
  const aretes = page.barres.reduce((a, b) => a + b.aretes.length, 0)
  const renvois = page.barres.reduce((a, b) => a + b.groupes.reduce((x, g) => x + g.items.filter((it) => it.unite >= 0 && visibles[it.unite] && (g.role === 'principale' || g.role === 'auxiliaire')).length, 0), 0)
  const aVerifier = page.barres.filter((b) => m.inferences[b.inf]!.validite === 'a_verifier').length
  const invalides = page.barres.filter((b) => m.inferences[b.inf]!.validite === 'invalide').length
  resume.replaceChildren(
    el('div', { class: 'r22-chiffres' },
      el('div', {}, el('b', {}, String(s.noeuds)), ' nœuds, ', el('b', {}, String(s.aretes)), ' arêtes de justification'),
      el('div', {}, '→ ', el('b', {}, String(nVis)), ` énoncés (dont ${series.length} séries), `, el('b', {}, String(page.barres.length)), ' inférences'),
      el('div', {}, `${aretes} prémisses tracées, ${renvois} renvois ; ${aVerifier} inférence(s) à vérifier, ${invalides} invalide(s)`),
      el('div', { class: 'r22-gris' }, `${s.bande} hypothèses et choix en bande · ${s.contexte} nœuds de contexte en étiquettes · ${s.controles} contrôles rattachés · ${s.noeudsEnSeries} nœuds repliés en ${s.series} séries${opt.niveau === 'resultats' ? ` · ${m.unites.length - nVis} énoncé(s) hors du chemin des résultats` : ''}`),
      el('div', { class: 'r22-gris' }, `${page.rangs} rangs logiques`),
    ),
  )
}

function majSelection(): void {
  if (!selection) {
    zoneSelection.replaceChildren(el('p', { class: 'r22-aide' },
      'Survoler une barre d’inférence ou un énoncé pour sa fiche ; cliquer pour épingler. Un énoncé cliqué montre sa lignée (antécédents à gauche, dépendants à droite) ; une hypothèse ou un choix de modélisation, sa portée.'))
    return
  }
  const bouton = el('button', { type: 'button', class: 'r22-bouton r22-effacer', onclick: () => selectionner(null) }, 'Effacer (Échap)')
  if (selection.genre === 'unite') zoneSelection.replaceChildren(ficheUnite(selection.i, true), bouton)
  else if (selection.genre === 'barre') zoneSelection.replaceChildren(ficheBarre(selection.inf, true), bouton)
  else zoneSelection.replaceChildren(ficheBande(selection.noeud, true), bouton)
}

function construireLegende(): HTMLElement {
  const ns = 'http://www.w3.org/2000/svg'
  const icone = (dessin: string) => {
    const s = document.createElementNS(ns, 'svg')
    s.setAttribute('width', '34')
    s.setAttribute('height', '16')
    s.innerHTML = dessin
    return s
  }
  const e = C.encre, g = C.gris
  const lignes: [string, string][] = [
    [`<rect x="2" y="2" width="30" height="12" fill="#fff" stroke="${e}"/>`, 'Énoncé déductif (lemme, proposition, théorème, assertion, conjecture)'],
    [`<rect x="2" y="2" width="30" height="12" rx="4" fill="#fff" stroke="${e}"/>`, 'Définition (objet central du raisonnement)'],
    [`<rect x="2" y="2" width="30" height="12" rx="6" fill="#fff" stroke="${e}"/>`, 'Observation (entité PROV)'],
    [`<rect x="2" y="2" width="30" height="12" fill="#fff" stroke="${e}"/><rect x="2" y="2" width="30" height="4" fill="#f2f3f5" stroke="${e}"/>`, 'Expérience ou calcul (activité PROV, en-tête : agent)'],
    [`<rect x="2" y="2" width="30" height="12" fill="#fff" stroke="${e}"/><rect x="4.5" y="4.5" width="25" height="7" fill="none" stroke="${e}"/>`, 'Résultat (double filet)'],
    [`<path d="M2 8 L7 2 L27 2 L32 8 L27 14 L7 14 Z" fill="#fff" stroke="${e}"/>`, 'Décision ; alternatives rejetées en losanges creux, barrées ✕'],
    [`<rect x="2" y="2" width="30" height="12" fill="#fff" stroke="${e}" stroke-dasharray="4 3"/>`, 'Contour en tirets : aucune démonstration valide'],
    [`<rect x="2" y="2" width="30" height="12" fill="#fff" stroke="${C.incertain}" stroke-width="1.3"/>`, 'Contour ocre : incertain · brique : réfuté'],
    [`<rect x="2" y="2" width="9" height="12" fill="#fff" stroke="${g}"/><rect x="12.5" y="2" width="9" height="12" fill="#eceef1" stroke="${g}"/><rect x="23" y="2" width="9" height="12" fill="#e2e4e9" stroke="${g}"/>`, 'Remplissage : validation aucune / IA ou humain / IA + humain (sigle en pied)'],
    [`<rect x="2" y="6.5" width="14" height="3" fill="${e}"/><text x="19" y="11" font-size="10" fill="${C.valide}">✓</text>`, 'Barre d’inférence = une démonstration ; épaisseur ∝ confiance ; ✓ valide, ? à vérifier, ✕ invalide'],
    [`<rect x="2" y="7" width="12" height="2" fill="${e}"/><line x1="14" y1="8" x2="32" y2="8" stroke="${e}" stroke-dasharray="2 3"/>`, 'Trait sortant en tirets : intervalle de confiance large (> 0,15 ; > 0,30 tirets courts)'],
    [`<line x1="2" y1="8" x2="32" y2="8" stroke="${e}"/>`, 'Prémisse principale (plein) · auxiliaire (gris fin) · démonstration alternative (tirets gris)'],
    [`<text x="2" y="11" font-size="9" font-family="monospace" fill="${C.encreDouce}">tech.</text>`, 'Étiquette sous la barre : par (renvoi) · aux. · tech. · ctx. — cités sans trait'],
    [`<rect x="2" y="4" width="8" height="8" fill="none" stroke="${C.encreDouce}"/><path d="M26 8 l-2.7 4.7 h-5.5 l-2.7 -4.7 l2.7 -4.7 h5.5 z" fill="none" stroke="${C.encreDouce}"/>`, 'Bande : hypothèse (H), choix de modélisation (M) ; survol = portée'],
    [`<line x1="2" y1="8" x2="30" y2="8" stroke="${C.refute}" stroke-dasharray="5 3"/><line x1="30" y1="3" x2="30" y2="13" stroke="${C.refute}" stroke-width="1.6"/>`, 'contredit ⊣ · résout ⊢ (encre) · abandonne (gris)'],
  ]
  return el('div', { class: 'r22-legende' }, ...lignes.map(([svg, t]) => el('div', { class: 'r22-leg' }, icone(svg), el('span', {}, t))))
}

// ─── Actions ─────────────────────────────────────────────────────────────────

function selectionner(s: Selection, centrer = false): void {
  selection = s
  if (!s || s.genre !== 'unite') cheminActif = false
  if (s?.genre === 'unite' && !visibles[s.i]) {
    // Énoncé masqué au niveau courant : passer à « tout ».
    opt.niveau = 'tout'
    reconstruire()
    document.querySelectorAll<HTMLButtonElement>('.r22-segment button').forEach((b) => b.classList.toggle('actif', b.dataset.v === 'tout'))
  }
  if (centrer && s?.genre === 'unite') centrerSur(s.i)
  toutMettreAJour()
}

function toutMettreAJour(): void {
  memoriser()
  calculerEmphase()
  majResume()
  majSelection()
  demanderDessin()
}

function reconstruire(): void {
  visibles = unitesVisibles(m, opt.niveau)
  page = calculerPage()
  survolBarre = null
  survolUnite = null
  toutMettreAJour()
}

// ─── Événements ──────────────────────────────────────────────────────────────

let glisse: { x: number; y: number; cx: number; cy: number; bouge: boolean } | null = null

toile.addEventListener('pointerdown', (e) => {
  toile.setPointerCapture(e.pointerId)
  glisse = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, bouge: false }
})
toile.addEventListener('pointermove', (e) => {
  const r = toile.getBoundingClientRect()
  const sx = e.clientX - r.left, sy = e.clientY - r.top
  if (glisse) {
    const dx = e.clientX - glisse.x, dy = e.clientY - glisse.y
    if (Math.abs(dx) + Math.abs(dy) > 3) glisse.bouge = true
    if (glisse.bouge) {
      cam.x = glisse.cx + dx
      cam.y = glisse.cy + dy
      fiche.hidden = true
      toile.style.cursor = 'grabbing'
      demanderDessin()
      return
    }
  }
  survoler(cibleSous(sx, sy), sx, sy)
})
toile.addEventListener('pointerup', (e) => {
  const g = glisse
  glisse = null
  toile.style.cursor = ''
  if (!g || g.bouge) return
  const r = toile.getBoundingClientRect()
  const c = cibleSous(e.clientX - r.left, e.clientY - r.top)
  if (!c) selectionner(null)
  else if (c.genre === 'unite') selectionner({ genre: 'unite', i: c.i })
  else if (c.genre === 'barre') selectionner({ genre: 'barre', inf: page.barres[c.bi]!.inf })
  else selectionner({ genre: 'bande', noeud: c.noeud })
})
toile.addEventListener('pointerleave', () => {
  if (survolBande !== null) { survolBande = null; calculerEmphase() }
  survolUnite = survolBarre = null
  fiche.hidden = true
  demanderDessin()
})
toile.addEventListener('wheel', (e) => {
  e.preventDefault()
  const r = toile.getBoundingClientRect()
  const sx = e.clientX - r.left, sy = e.clientY - r.top
  const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015))
  const k = Math.min(2.5, Math.max(0.08, cam.k * f))
  cam.x = sx - ((sx - cam.x) * k) / cam.k
  cam.y = sy - ((sy - cam.y) * k) / cam.k
  cam.k = k
  fiche.hidden = true
  demanderDessin()
}, { passive: false })

function survoler(c: Cible, sx: number, sy: number): void {
  const u = c?.genre === 'unite' ? c.i : null
  const b = c?.genre === 'barre' ? c.bi : null
  const bd = c?.genre === 'bande' ? c.noeud : null
  const change = u !== survolUnite || b !== survolBarre || bd !== survolBande
  const bandeChange = bd !== survolBande
  survolUnite = u
  survolBarre = b
  survolBande = bd
  toile.style.cursor = c ? 'pointer' : ''
  if (bandeChange) calculerEmphase()
  if (change) {
    if (!c) fiche.hidden = true
    else {
      fiche.replaceChildren(c.genre === 'unite' ? ficheUnite(c.i, false) : c.genre === 'barre' ? ficheBarre(page.barres[c.bi]!.inf, false) : ficheBande(c.noeud, false))
      fiche.hidden = false
    }
    demanderDessin()
  }
  if (!fiche.hidden) {
    // Fiche à côté du curseur, sans sortir de la zone.
    const fw = fiche.offsetWidth, fh = fiche.offsetHeight
    let x = sx + 18, y = sy + 14
    if (x + fw > largeur - 8) x = sx - fw - 18
    if (y + fh > hauteur - 8) y = Math.max(8, hauteur - fh - 8)
    fiche.style.left = `${Math.max(8, x)}px`
    fiche.style.top = `${y}px`
  }
}

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).closest('input, select, textarea')) return
  if (e.key === 'Escape') selectionner(null)
  else if (e.key === 'Home' || e.key === '0') { cadrerTout(); demanderDessin() }
  else if (e.key === '.' && selection?.genre === 'unite') { centrerSur(selection.i); demanderDessin() }
})

new ResizeObserver(() => dimensionner()).observe(zoneToile)
dimensionner()
cadrerDebut()
toutMettreAJour()

// Débogage : état accessible depuis la console.
;(window as unknown as { r22: unknown }).r22 = { m, page: () => page, cam, opt }
