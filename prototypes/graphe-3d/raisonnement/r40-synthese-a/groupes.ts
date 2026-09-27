// R40 · Boîtes (sous-problèmes, repris de R18) et leur réduction en nœud-fonction (repris de R19,
// « Collapse to Function » d'un Blueprint) ; ouverture d'une boîte dans un onglet.
//
// Boîtes : un sous-problème = une boîte de premier niveau ; un identifiant « parent.enfant » = une boîte
// imbriquée dans celle du parent (convention de R18). Teintes de R18, par ordre du jeu.
//
// La réduction et l'onglet sont des étapes de dérivation (`etapeGroupes`, ajoutée en fin de chaque
// stratégie du squelette) : le graphe de lecture change vraiment, donc la mise en page, les liaisons,
// la lignée et l'invariant de correspondance (chaque arête complète représentée une fois) restent
// cohérents sans cas particulier.
//
// - Réduire la boîte B : toutes les unités vivantes de B et de ses boîtes imbriquées (hors choix de
//   modélisation, qui restent dans la marge) fusionnent en une seule unité. Les arêtes internes deviennent
//   `aretesInternes`, les arêtes entrantes / sortantes sont reportées sur l'unité fusionnée (une broche par
//   arête entrante, une broche de sortie par énoncé de B utilisé à l'extérieur). Refusé si la fusion
//   créerait un cycle (B → X → B avec X hors de B). Les boîtes imbriquées sont réduites avant leur parent.
// - Onglet B : ne restent que les unités de B, leurs sources directes (« Entrée ») et leurs utilisateurs
//   directs (« Sortie ») ; le reste passe en contexte.

import type { EtapeLecture, GrapheLecture, JeuRaisonnement, NoeudR, Statut, TravailLecture } from '../../src/raisonnement'

/** État choisi par l'utilisatrice (ids de sous-problèmes). */
export const etatGroupes = {
  /** Boîtes réduites en nœud-fonction. */
  reduits: new Set<string>(),
  /** Boîte ouverte dans un onglet (null : graphe principal). */
  onglet: null as string | null,
}

/** Ce qu'une dérivation a produit (ids de nœuds de justification). */
export interface ResultatGroupes {
  /** Id du nœud conclusion d'une unité fusionnée → boîte réduite. */
  fonctions: Map<string, string>
  /** Boîtes dont la réduction a été refusée (cycle) → raison. */
  refus: Map<string, string>
  /** Onglet : ids des conclusions des unités « Entrée » et « Sortie ». */
  entrees: Set<string>
  sorties: Set<string>
  onglet: string | null
}

const vide = (): ResultatGroupes => ({ fonctions: new Map(), refus: new Map(), entrees: new Set(), sorties: new Set(), onglet: null })

// Rattaché au journal de la dérivation (même tableau dans le travail et dans le graphe de lecture).
const resultats = new WeakMap<object, ResultatGroupes>()

/** Résultat de l'étape « groupes » pour un graphe de lecture (vide si l'étape n'a pas tourné). */
export function resultatDe(g: GrapheLecture): ResultatGroupes {
  return resultats.get(g.journal) ?? vide()
}

/** Sous-problème parent (« a.b » → « a ») ou null. */
export function parentDe(id: string): string | null {
  const k = id.lastIndexOf('.')
  return k > 0 ? id.slice(0, k) : null
}

/** Boîte de premier niveau d'un sous-problème. */
export function racineDe(id: string): string {
  let s = id
  for (let q = parentDe(s); q; q = parentDe(s)) s = q
  return s
}

/** Vrai si le sous-problème `sp` est dans la boîte `g` (elle-même ou une boîte imbriquée). */
export function dansBoite(sp: string, g: string): boolean {
  return sp === g || sp.startsWith(`${g}.`)
}

/** Sous-problème d'un nœud (« cadre » s'il n'en a pas). */
export function sousProblemeDe(n: NoeudR): string {
  return n.sousProbleme || 'cadre'
}

/** Un nœud qui reste hors des boîtes (marge des spécifications). */
export function horsGroupe(n: NoeudR): boolean {
  return n.type === 'choix_modelisation'
}

// ─── Couleurs (R18) ──────────────────────────────────────────────────────────

/** Teintes des boîtes (sous-problèmes de premier niveau, dans l'ordre du jeu), comme R18. */
export const TEINTES_BOITES = ['#64748b', '#1d7a8c', '#a26a12', '#4f56b8', '#9a4a6b', '#3f7a3a', '#8a5a2b']
export const TEINTE_ABANDON = '#8a8f97'
/** Boîte « Spécifications · modélisation » (choix de modélisation et décisions qui les fixent). */
export const TEINTE_SPEC = '#236b70'
/** Boîtes « Entrée » / « Sortie » d'un onglet. */
export const TEINTE_ES = '#5f6670'

/** Teinte d'une boîte (une boîte imbriquée prend celle de son parent). */
export function teinteGroupe(jeu: JeuRaisonnement, id: string): string {
  if (id === '§spec') return TEINTE_SPEC
  if (id === '§entree' || id === '§sortie') return TEINTE_ES
  const sp = jeu.sousProblemes.find((s) => s.id === id)
  if (sp?.abandonne) return TEINTE_ABANDON
  const racine = racineDe(id)
  const racines = jeu.sousProblemes.filter((s) => !parentDe(s.id))
  const k = racines.findIndex((s) => s.id === racine)
  if (racines[k]?.abandonne) return TEINTE_ABANDON
  return TEINTES_BOITES[Math.max(0, k) % TEINTES_BOITES.length]!
}

export function nomGroupe(jeu: JeuRaisonnement, id: string): string {
  if (id === '§spec') return 'Spécifications · modélisation'
  if (id === '§entree') return 'Entrée'
  if (id === '§sortie') return 'Sortie'
  return jeu.sousProblemes.find((s) => s.id === id)?.nom ?? id
}

// ─── Agrégats d'un groupe réduit (R19) ───────────────────────────────────────

export interface Agregat {
  /** Nombre d'énoncés représentés. */
  n: number
  /** Statut le plus faible : réfuté < à vérifier < validé. */
  statut: Statut
  parStatut: Record<Statut, number>
  /** Maillon le plus faible (indice de nœud de justification) et sa confiance. */
  maillon: number
  confiance: NoeudR['confiance']
}

const RANG_STATUT: Record<Statut, number> = { refute: 0, incertain: 1, valide: 2 }

export function agreger(noeuds: NoeudR[], membres: number[]): Agregat {
  const parStatut: Record<Statut, number> = { valide: 0, incertain: 0, refute: 0 }
  let statut: Statut = 'valide'
  let maillon = membres[0] ?? 0
  for (const m of membres) {
    const n = noeuds[m]!
    parStatut[n.statut]++
    if (RANG_STATUT[n.statut] < RANG_STATUT[statut]) statut = n.statut
    if (n.confiance.estimation < noeuds[maillon]!.confiance.estimation) maillon = m
  }
  return { n: membres.length, statut, parStatut, maillon, confiance: noeuds[maillon]!.confiance }
}

// ─── Étape de dérivation ─────────────────────────────────────────────────────

function ordreTopo(t: TravailLecture, enfants: Map<number, number[]>): number[] {
  const degre = new Int32Array(t.unites.length)
  for (const a of t.aretes.values()) degre[a.cible]!++
  const ordre: number[] = []
  const file: number[] = []
  for (let u = 0; u < t.unites.length; u++) if (t.unites[u]!.vivante && degre[u] === 0) file.push(u)
  while (file.length) {
    const u = file.shift()!
    ordre.push(u)
    for (const v of enfants.get(u) ?? []) if (--degre[v]! === 0) file.push(v)
  }
  return ordre
}

/** Unités vivantes d'une boîte et de ses boîtes imbriquées (hors choix de modélisation). */
function unitesDuGroupe(t: TravailLecture, g: string): Set<number> {
  const s = new Set<number>()
  t.unites.forEach((u, k) => {
    if (!u.vivante) return
    const n = t.j.noeuds[u.conclusion]!
    if (!horsGroupe(n) && dansBoite(sousProblemeDe(n), g)) s.add(k)
  })
  return s
}

/** Vrai si un chemin sort de G puis y revient (la fusion créerait un cycle). */
function creeCycle(t: TravailLecture, G: Set<number>): boolean {
  const { enfants } = t.adjacence()
  const vus = new Set<number>()
  const pile: number[] = []
  for (const u of G) for (const v of enfants.get(u) ?? []) if (!G.has(v) && !vus.has(v)) {
    vus.add(v)
    pile.push(v)
  }
  while (pile.length) {
    const x = pile.pop()!
    for (const y of enfants.get(x) ?? []) {
      if (G.has(y)) return true
      if (!vus.has(y)) {
        vus.add(y)
        pile.push(y)
      }
    }
  }
  return false
}

/** Fusionne toutes les unités de G dans la dernière (ordre topologique). Renvoie la tête. */
function fusionner(t: TravailLecture, G: Set<number>): number {
  const { enfants } = t.adjacence()
  const ordre = ordreTopo(t, enfants).filter((u) => G.has(u))
  for (const u of G) if (!ordre.includes(u)) ordre.push(u)
  const c = ordre[ordre.length - 1]!
  const tete = t.unites[c]!
  const membres: number[] = []
  const internes: number[] = [...tete.aretesInternes]
  for (const u of ordre) {
    const un = t.unites[u]!
    membres.push(...un.membres)
    if (u === c) continue
    internes.push(...un.aretesInternes)
    for (const [k, ctx] of un.contexte) if (!tete.contexte.has(k)) tete.contexte.set(k, ctx)
    un.vivante = false
  }
  for (const [k, a] of [...t.aretes]) {
    const s = G.has(a.source), d = G.has(a.cible)
    if (!s && !d) continue
    if (s && d) {
      internes.push(...a.resume, ...a.transitives)
      t.aretes.delete(k)
      continue
    }
    const src = s ? c : a.source, dst = d ? c : a.cible
    if (src === a.source && dst === a.cible) continue
    t.aretes.delete(k)
    const k2 = t.cle(src, dst)
    const ex = t.aretes.get(k2)
    if (ex) {
      ex.resume.push(...a.resume)
      ex.transitives.push(...a.transitives)
    } else t.aretes.set(k2, { source: src, cible: dst, resume: [...a.resume], transitives: [...a.transitives] })
  }
  tete.membres = membres
  tete.aretesInternes = internes
  for (const m of membres) t.uniteDe[m] = c
  return c
}

/** Onglet : ne garde que G, ses sources directes (Entrée) et ses utilisateurs directs (Sortie). */
function isolerOnglet(t: TravailLecture, g: string, r: ResultatGroupes): void {
  const G = unitesDuGroupe(t, g)
  if (!G.size) {
    t.journal.push(`Onglet : la boîte « ${g} » n'a aucune unité à ce niveau.`)
    return
  }
  const E = new Set<number>(), S = new Set<number>()
  for (const a of t.aretes.values()) if (G.has(a.cible) && !G.has(a.source)) E.add(a.source)
  for (const a of t.aretes.values()) if (G.has(a.source) && !G.has(a.cible) && !E.has(a.cible)) S.add(a.cible)
  let retirees = 0
  for (const [k, a] of [...t.aretes]) {
    const garde = (G.has(a.source) && G.has(a.cible)) || (E.has(a.source) && G.has(a.cible)) || (G.has(a.source) && S.has(a.cible))
    if (garde) continue
    for (const e of [...a.resume, ...a.transitives]) t.versContexte(e, -1)
    t.aretes.delete(k)
    retirees++
  }
  t.unites.forEach((u, k) => {
    if (!u.vivante || G.has(k) || E.has(k) || S.has(k)) return
    u.vivante = false
    for (const m of u.membres) t.uniteDe[m] = -1
    // Les arêtes internes d'une étape retirée restent représentées (en contexte).
    for (const e of u.aretesInternes) t.versContexte(e, -1)
    u.aretesInternes = []
  })
  const id = (u: number) => t.j.noeuds[t.unites[u]!.conclusion]!.id
  for (const u of E) r.entrees.add(id(u))
  for (const u of S) r.sorties.add(id(u))
  r.onglet = g
  t.journal.push(`Onglet « ${g} » : ${G.size} unité(s), ${E.size} entrée(s), ${S.size} sortie(s) ; ${retirees} liaison(s) hors du sous-graphe passées en contexte.`)
}

/** Étape finale des stratégies R40 : onglet, ou réduction des boîtes choisies (imbriquées d'abord). */
export const etapeGroupes: EtapeLecture = (t) => {
  const r = vide()
  resultats.set(t.journal, r)
  if (etatGroupes.onglet) return isolerOnglet(t, etatGroupes.onglet, r)
  const faits: string[] = []
  const profondeur = (id: string) => id.split('.').length
  const ordre = [...etatGroupes.reduits].sort((a, b) => profondeur(b) - profondeur(a))
  for (const g of ordre) {
    const G = unitesDuGroupe(t, g)
    if (G.size < 1) continue
    if (G.size > 1 && creeCycle(t, G)) {
      r.refus.set(g, 'un chemin sort de la boîte puis y revient : la réduction créerait un cycle')
      continue
    }
    const c = G.size > 1 ? fusionner(t, G) : [...G][0]!
    // Une boîte imbriquée déjà réduite est absorbée par la réduction de son parent.
    for (const [id, h] of [...r.fonctions]) if (dansBoite(h, g) && h !== g) r.fonctions.delete(id)
    r.fonctions.set(t.j.noeuds[t.unites[c]!.conclusion]!.id, g)
    faits.push(`${g} (${t.unites[c]!.membres.length})`)
  }
  if (faits.length || r.refus.size) {
    t.journal.push(`Boîtes réduites en fonctions : ${faits.join(', ') || 'aucune'}${r.refus.size ? ` ; refusées (cycle) : ${[...r.refus.keys()].join(', ')}` : ''}.`)
  }
}
