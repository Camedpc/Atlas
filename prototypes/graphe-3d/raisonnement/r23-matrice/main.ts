// R23 · Matrice de dépendance (direction D3 de RECHERCHE-REPRESENTATION.md).
//
// Tout le graphe de justification en DSM séquencée : lignes = conclusions, colonnes = prémisses,
// même ordre ; blocs diagonaux = sous-problèmes ; marques au-dessus de la diagonale = rétroactions.
// Rendu canvas (224 nœuds ≈ 50 000 cellules), en-têtes figés, zoom sémantique, panneau d'inspection.

import { chargerJeu, genererJeuRaisonnement, type JeuRaisonnement } from '../../src/raisonnement/donnees'
import {
  construireGrille, construireModele, listeAncetres, listeDependants,
  type Grille, type ModeDemos, type Modele, type Transitif, type Tri,
} from './modele'
import {
  bornerVue, cibleEn, dessiner, geometrie, tailleAjustee, SEUIL_TEXTE_LIGNES,
  type Cible, type EtatRendu, type Surimpression,
} from './rendu'
import { ficheAccueil, ficheBrosse, ficheCellule, ficheNoeud, h, legende, noeudsBrosse, resumeNoeud } from './panneau'
import meta from './meta.json'

// ─── Options (mémorisées par navigateur, confort seulement) ─────────────────

interface Options {
  tri: Tri
  parBlocs: boolean
  transitif: Transitif
  mode: ModeDemos
  surimpression: Surimpression
  alternatives: boolean
  replies: string[]
}
const DEFAUT: Options = { tri: 'topologique', parBlocs: true, transitif: 'aucun', mode: 'toutes', surimpression: 'antecedents', alternatives: true, replies: [] }
const CLE = `atlas-raisonnement:${meta.id}`
function lireOptions(): Options {
  try {
    const brut = localStorage.getItem(CLE)
    if (brut) return { ...DEFAUT, ...(JSON.parse(brut) as Partial<Options>) }
  } catch { /* stockage indisponible : défauts */ }
  return { ...DEFAUT }
}
function ecrireOptions(): void {
  try { localStorage.setItem(CLE, JSON.stringify(opt)) } catch { /* sans effet */ }
}
const opt = lireOptions()

// ─── Éléments ────────────────────────────────────────────────────────────────

const zone = document.getElementById('zone')!
const toile = document.getElementById('toile') as HTMLCanvasElement
const ctx = toile.getContext('2d')!
const bulle = document.getElementById('survol')!
const inspection = document.getElementById('inspection')!
const panneau = document.getElementById('panneau')!
const barreEtat = document.getElementById('etat')!
const commandes = document.getElementById('commandes')!

// ─── Données ─────────────────────────────────────────────────────────────────

const parametres = new URLSearchParams(location.search)
const jeu: JeuRaisonnement = parametres.get('source') === 'api' ? await chargerJeu() : genererJeuRaisonnement()
document.getElementById('sous-titre')!.textContent = jeu.titre

let m: Modele = construireModele(jeu, opt.mode)
let g: Grille = construireGrille(m, { ...opt, replies: new Set(opt.replies) })

const etat: EtatRendu = {
  m, g,
  vue: { s: 0, ox: 0, oy: 0, largeur: 0, hauteur: 0 },
  survol: null, noeud: null, cellule: null, brosse: null,
  surimpression: opt.surimpression, lignee: null,
}

// ─── Rendu à la demande ──────────────────────────────────────────────────────

let enAttente = false
function demander(): void {
  if (enAttente) return
  enAttente = true
  requestAnimationFrame(() => {
    enAttente = false
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    dessiner(ctx, etat)
    majEtat()
  })
}

function redimensionner(): void {
  const r = zone.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  toile.width = Math.max(1, Math.round(r.width * dpr))
  toile.height = Math.max(1, Math.round(r.height * dpr))
  toile.style.width = `${r.width}px`
  toile.style.height = `${r.height}px`
  const premiere = etat.vue.largeur === 0
  etat.vue.largeur = r.width
  etat.vue.hauteur = r.height
  if (premiere) ajuster()
  bornerVue(etat.vue, g)
  demander()
}
new ResizeObserver(redimensionner).observe(zone)

// ─── Vue : zoom et défilement ────────────────────────────────────────────────

function ajuster(): void {
  etat.vue.s = tailleAjustee(g, etat.vue.largeur, etat.vue.hauteur)
  etat.vue.ox = 0
  etat.vue.oy = 0
  demander()
}

/** Zoom autour d'un point d'écran (px CSS). */
function zoomer(s: number, x?: number, y?: number): void {
  const v = etat.vue
  const avant = geometrie(v)
  const px = x ?? (avant.x0 + v.largeur) / 2, py = y ?? (avant.y0 + v.hauteur) / 2
  const u = (Math.max(px, avant.x0) - avant.x0 + v.ox) / v.s
  const w = (Math.max(py, avant.y0) - avant.y0 + v.oy) / v.s
  v.s = Math.max(1.5, Math.min(40, s))
  const apres = geometrie(v)
  v.ox = u * v.s - (Math.max(px, apres.x0) - apres.x0)
  v.oy = w * v.s - (Math.max(py, apres.y0) - apres.y0)
  bornerVue(v, g)
  demander()
}

/** Amène la ligne et la colonne d'un nœud dans la vue (lisible si besoin). */
function montrerNoeud(i: number): void {
  const v = etat.vue
  if (v.s < SEUIL_TEXTE_LIGNES) v.s = 14
  const { x0, y0 } = geometrie(v)
  const r = g.ligneDe[i]!, c = g.colonneDe[i]!
  const y = r * v.s - v.oy, x = c * v.s - v.ox
  if (y < 0 || y > v.hauteur - y0 - v.s) v.oy = r * v.s - (v.hauteur - y0) / 2
  if (x < 0 || x > v.largeur - x0 - v.s) v.ox = c * v.s - (v.largeur - x0) / 2
  bornerVue(v, g)
  demander()
}

// ─── Sélection ───────────────────────────────────────────────────────────────

function calculerLignee(): void {
  if (etat.noeud === null) { etat.lignee = null; return }
  const l = new Uint8Array(m.n)
  l[etat.noeud] = 1
  for (const k of etat.surimpression === 'antecedents' ? listeAncetres(m, etat.noeud) : listeDependants(m, etat.noeud)) l[k] = 1
  etat.lignee = l
}

function selectionnerNoeud(i: number | null, montrer = false): void {
  etat.noeud = etat.noeud === i && !montrer ? null : i
  etat.cellule = null
  etat.brosse = null
  calculerLignee()
  if (etat.noeud !== null && montrer) montrerNoeud(etat.noeud)
  majPanneau()
  demander()
}

function selectionnerCellule(r: number, c: number): void {
  etat.noeud = null
  etat.lignee = null
  etat.brosse = null
  etat.cellule = etat.cellule && etat.cellule.r === r && etat.cellule.c === c ? null : { r, c }
  majPanneau()
  demander()
}

function effacer(): void {
  etat.noeud = null
  etat.cellule = null
  etat.brosse = null
  etat.lignee = null
  majPanneau()
  demander()
}

function basculerBloc(b: number): void {
  const id = m.blocs[b]!.id
  opt.replies = opt.replies.includes(id) ? opt.replies.filter((x) => x !== id) : [...opt.replies, id]
  reconstruire()
}

// ─── Panneau ─────────────────────────────────────────────────────────────────

function majPanneau(): void {
  let contenu: HTMLElement
  if (etat.noeud !== null) contenu = ficheNoeud(m, etat.noeud)
  else if (etat.brosse) contenu = ficheBrosse(m, g, etat.brosse)
  else if (etat.cellule) contenu = ficheCellule(m, g, etat.cellule.r, etat.cellule.c, true) ?? h('p', { class: 'r23-doux' }, 'Cellule vide : aucune dépendance.')
  else contenu = ficheAccueil(m, g)
  const retour = etat.noeud !== null || etat.brosse || etat.cellule
    ? h('button', { class: 'r23-lien', type: 'button', 'data-action': 'effacer' }, '← vue d’ensemble') : null
  inspection.replaceChildren(...[retour, contenu].filter((x): x is HTMLElement => !!x))
  panneau.scrollTop = 0
}
document.getElementById('legende')!.append(legende())

panneau.addEventListener('click', (ev) => {
  const cible = ev.target as HTMLElement
  const ref = cible.closest<HTMLElement>('[data-noeud]')
  if (ref) { selectionnerNoeud(Number(ref.dataset.noeud), true); return }
  const action = cible.closest<HTMLElement>('[data-action]')?.dataset.action
  if (action === 'effacer') effacer()
  if (action === 'copier-brosse' && etat.brosse) {
    const ids = noeudsBrosse(g, etat.brosse).map((i) => m.noeuds[i]!.id)
    void navigator.clipboard?.writeText(JSON.stringify(ids)).catch(() => undefined)
  }
})

// ─── Barre de commandes ──────────────────────────────────────────────────────

const majCommandes: (() => void)[] = []
function segment<T extends string>(titre: string, choix: [T, string][], lire: () => T, ecrire: (v: T) => void): HTMLElement {
  const boutons = choix.map(([v, texte]) => {
    const b = h('button', { type: 'button', class: 'r23-seg' }, texte)
    b.addEventListener('click', () => { ecrire(v); synchroniser() })
    return [v, b] as const
  })
  majCommandes.push(() => { for (const [v, b] of boutons) b.classList.toggle('actif', lire() === v) })
  return h('div', { class: 'r23-groupe' }, h('span', { class: 'r23-groupe-titre' }, titre), h('div', { class: 'r23-segments' }, ...boutons.map(([, b]) => b)))
}
function bascule(titre: string, texte: string, lire: () => boolean, ecrire: (v: boolean) => void): HTMLElement {
  const b = h('button', { type: 'button', class: 'r23-seg' }, texte)
  b.addEventListener('click', () => { ecrire(!lire()); synchroniser() })
  majCommandes.push(() => b.classList.toggle('actif', lire()))
  return h('div', { class: 'r23-groupe' }, h('span', { class: 'r23-groupe-titre' }, titre), h('div', { class: 'r23-segments' }, b))
}
function bouton(texte: string, titre: string, f: () => void): HTMLElement {
  const b = h('button', { type: 'button', class: 'r23-seg', title: titre }, texte)
  b.addEventListener('click', f)
  return b
}

commandes.append(
  segment<Tri>('Tri', [['topologique', 'Topologique'], ['date', 'Date'], ['confiance', 'Confiance']], () => opt.tri, (v) => { opt.tri = v }),
  bascule('Blocs', 'Sous-problèmes', () => opt.parBlocs, (v) => { opt.parBlocs = v }),
  segment<Transitif>('Transitif', [['aucun', 'Non'], ['fondations', 'H · M · Déc'], ['tout', 'Tout']], () => opt.transitif, (v) => { opt.transitif = v }),
  segment<ModeDemos>('Démonstrations', [['toutes', 'Toutes'], ['principale', 'Principale']], () => opt.mode, (v) => { opt.mode = v }),
  segment<Surimpression>('Surimpression', [['antecedents', 'Antécédents'], ['dependants', 'Dépendants']], () => opt.surimpression, (v) => { opt.surimpression = v }),
  bascule('Décisions', 'Options rejetées', () => opt.alternatives, (v) => { opt.alternatives = v }),
  h('div', { class: 'r23-groupe' }, h('span', { class: 'r23-groupe-titre' }, 'Zoom'), h('div', { class: 'r23-segments' },
    bouton('−', 'Dézoomer (−)', () => zoomer(etat.vue.s / 1.4)),
    bouton('Ensemble', 'Toute la matrice (0)', ajuster),
    bouton('Lisible', 'Cellules de 14 px', () => zoomer(14)),
    bouton('+', 'Zoomer (+)', () => zoomer(etat.vue.s * 1.4)),
  )),
)

let modeConstruit = opt.mode
function synchroniser(): void {
  for (const f of majCommandes) f()
  etat.surimpression = opt.surimpression
  calculerLignee()
  reconstruire()
}

function reconstruire(): void {
  if (modeConstruit !== opt.mode) {
    m = construireModele(jeu, opt.mode)
    modeConstruit = opt.mode
  }
  g = construireGrille(m, { ...opt, replies: new Set(opt.replies) })
  etat.m = m
  etat.g = g
  etat.cellule = null
  etat.brosse = null
  etat.survol = null
  calculerLignee()
  bornerVue(etat.vue, g)
  ecrireOptions()
  for (const f of majCommandes) f()
  majPanneau()
  demander()
}

// ─── Barre d'état ────────────────────────────────────────────────────────────

function nomLigne(r: number): string {
  const l = g.lignes[r]
  if (!l) return '—'
  return l.genre === 'bloc' ? m.blocs[l.bloc]!.court : l.genre === 'alternative' ? `${m.ident[l.i]} (option rejetée)` : m.ident[l.i]!
}
function nomColonne(c: number): string {
  const l = g.colonnes[c]
  return !l ? '—' : l.genre === 'bloc' ? m.blocs[l.bloc]!.court : m.ident[l.i]!
}
function majEtat(): void {
  const s = etat.survol
  const pos = !s ? '' : s.zone === 'cellule' ? `ligne ${nomLigne(s.r)} × colonne ${nomColonne(s.c)}` : s.zone === 'ligne' ? `ligne ${nomLigne(s.r)}` : s.zone === 'colonne' ? `colonne ${nomColonne(s.c)}` : 'marge de bloc : cliquer pour replier / déplier'
  barreEtat.replaceChildren(
    h('span', { class: 'r23-mono' }, `${etat.vue.s.toFixed(1).replace('.', ',')} px`),
    h('span', {}, `${g.lignes.length} lignes × ${g.colonnes.length} colonnes`),
    h('span', {}, `${g.auDessus} au-dessus de la diagonale`),
    h('span', { class: 'r23-pos' }, pos),
    h('span', { class: 'r23-aide' }, 'Ctrl + molette : zoom · glisser : défiler · Maj + glisser : sous-matrice · double-clic : zoom · Échap'),
  )
}

// ─── Souris ──────────────────────────────────────────────────────────────────

interface Glisse { x: number; y: number; ox: number; oy: number; brosse: boolean; bouge: boolean; depart: Cible | null }
let glisse: Glisse | null = null

function coords(ev: MouseEvent): { x: number; y: number } {
  const r = toile.getBoundingClientRect()
  return { x: ev.clientX - r.left, y: ev.clientY - r.top }
}

function montrerBulle(x: number, y: number, contenu: HTMLElement | null): void {
  if (!contenu) { bulle.hidden = true; return }
  bulle.replaceChildren(contenu)
  bulle.hidden = false
  const lz = zone.clientWidth, hz = zone.clientHeight
  const lb = bulle.offsetWidth, hb = bulle.offsetHeight
  let bx = x + 16, by = y + 16
  if (bx + lb > lz - 8) bx = x - lb - 16
  if (by + hb > hz - 8) by = y - hb - 16
  bulle.style.left = `${Math.max(8, bx)}px`
  bulle.style.top = `${Math.max(8, by)}px`
}

let derniereBulle = ''
function survoler(x: number, y: number): void {
  const c = cibleEn(etat, x, y)
  etat.survol = c
  let contenu: HTMLElement | null = null
  let cle = ''
  if (c?.zone === 'cellule') {
    cle = `c${c.r},${c.c}`
    if (cle !== derniereBulle) contenu = ficheCellule(m, g, c.r, c.c, false)
  } else if (c?.zone === 'ligne' || c?.zone === 'colonne') {
    const l = c.zone === 'ligne' ? g.lignes[c.r] : g.colonnes[c.c]
    if (l && l.genre === 'noeud') {
      cle = `n${l.i}`
      if (cle !== derniereBulle) contenu = resumeNoeud(m, l.i)
    }
  }
  if (!cle) { bulle.hidden = true; derniereBulle = '' }
  else if (cle !== derniereBulle) { derniereBulle = cle; montrerBulle(x, y, contenu); if (!contenu) derniereBulle = '' }
  else if (!bulle.hidden) montrerBulle(x, y, bulle.firstElementChild as HTMLElement)
  demander()
}

function celluleBornee(x: number, y: number): { r: number; c: number } {
  const v = etat.vue
  const { x0, y0 } = geometrie(v)
  return {
    r: Math.max(0, Math.min(g.lignes.length - 1, Math.floor((y - y0 + v.oy) / v.s))),
    c: Math.max(0, Math.min(g.colonnes.length - 1, Math.floor((x - x0 + v.ox) / v.s))),
  }
}

toile.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0) return
  const { x, y } = coords(ev)
  toile.setPointerCapture(ev.pointerId)
  glisse = { x, y, ox: etat.vue.ox, oy: etat.vue.oy, brosse: ev.shiftKey, bouge: false, depart: cibleEn(etat, x, y) }
})

toile.addEventListener('pointermove', (ev) => {
  const { x, y } = coords(ev)
  if (!glisse) { survoler(x, y); return }
  if (!glisse.bouge && Math.hypot(x - glisse.x, y - glisse.y) > 3) glisse.bouge = true
  if (!glisse.bouge) return
  bulle.hidden = true
  derniereBulle = ''
  if (glisse.brosse) {
    const a = celluleBornee(glisse.x, glisse.y), b = celluleBornee(x, y)
    etat.brosse = { r0: Math.min(a.r, b.r), r1: Math.max(a.r, b.r), c0: Math.min(a.c, b.c), c1: Math.max(a.c, b.c) }
    etat.noeud = null
    etat.lignee = null
    etat.cellule = null
    toile.style.cursor = 'crosshair'
  } else {
    etat.vue.ox = glisse.ox - (x - glisse.x)
    etat.vue.oy = glisse.oy - (y - glisse.y)
    bornerVue(etat.vue, g)
    toile.style.cursor = 'grabbing'
  }
  demander()
})

toile.addEventListener('pointerup', (ev) => {
  const gl = glisse
  glisse = null
  toile.style.cursor = ''
  if (!gl) return
  if (gl.bouge) {
    if (gl.brosse) majPanneau()
    return
  }
  const c = cibleEn(etat, coords(ev).x, coords(ev).y)
  if (!c) { effacer(); return }
  switch (c.zone) {
    case 'blocLigne': case 'blocColonne': basculerBloc(c.bloc); break
    case 'ligne': {
      const l = g.lignes[c.r]!
      if (l.genre === 'bloc') basculerBloc(l.bloc)
      else selectionnerNoeud(l.i)
      break
    }
    case 'colonne': {
      const l = g.colonnes[c.c]!
      if (l.genre === 'bloc') basculerBloc(l.bloc)
      else selectionnerNoeud(l.i)
      break
    }
    case 'cellule': {
      const cel = g.cellules.get(c.r * g.colonnes.length + c.c)
      const l = g.lignes[c.r]!
      if (cel?.diagonale && l.genre === 'noeud') selectionnerNoeud(l.i)
      else selectionnerCellule(c.r, c.c)
      break
    }
  }
})

toile.addEventListener('pointerleave', () => {
  if (glisse) return
  etat.survol = null
  bulle.hidden = true
  derniereBulle = ''
  demander()
})

toile.addEventListener('dblclick', (ev) => {
  const { x, y } = coords(ev)
  zoomer(etat.vue.s < 12 ? 14 : etat.vue.s < 22 ? 24 : tailleAjustee(g, etat.vue.largeur, etat.vue.hauteur), x, y)
})

toile.addEventListener('wheel', (ev) => {
  ev.preventDefault()
  const { x, y } = coords(ev)
  if (ev.ctrlKey || ev.metaKey) {
    zoomer(etat.vue.s * Math.exp(-ev.deltaY * 0.0022), x, y)
    return
  }
  const facteur = ev.deltaMode === 1 ? 16 : 1
  const dx = (ev.shiftKey ? ev.deltaY : ev.deltaX) * facteur
  const dy = (ev.shiftKey ? 0 : ev.deltaY) * facteur
  etat.vue.ox += dx
  etat.vue.oy += dy
  bornerVue(etat.vue, g)
  bulle.hidden = true
  derniereBulle = ''
  demander()
}, { passive: false })

window.addEventListener('keydown', (ev) => {
  if ((ev.target as HTMLElement).closest('input, textarea')) return
  if (ev.key === 'Escape') effacer()
  else if (ev.key === '+' || ev.key === '=') zoomer(etat.vue.s * 1.4)
  else if (ev.key === '-') zoomer(etat.vue.s / 1.4)
  else if (ev.key === '0') ajuster()
})

// ─── Démarrage ───────────────────────────────────────────────────────────────

for (const f of majCommandes) f()
majPanneau()
redimensionner()

// Débogage : état et modèle accessibles depuis la console.
;(window as unknown as { r23: unknown }).r23 = { etat, get modele() { return m }, get grille() { return g }, selectionnerNoeud, zoomer }
