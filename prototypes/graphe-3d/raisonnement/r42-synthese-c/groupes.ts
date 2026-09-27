// R42 · Groupes (repris de R19, adaptés aux boîtes imbriquées de R18) : réduction d'une boîte en un
// nœud-fonction (« Collapse to Function » d'un Blueprint) et ouverture d'un sous-graphe dans un onglet.
//
// Une boîte = un sous-problème `id` ; elle contient les nœuds dont le sous-problème est `id` ou un
// sous-problème imbriqué `id.xxx` (convention d'identifiant « parent.enfant » de R18). Les choix de
// modélisation n'appartiennent à aucune boîte de sous-problème (ils restent dans la marge).
//
// La réduction et l'onglet sont une étape de dérivation (`etapeGroupes`, ajoutée en fin de chaque
// stratégie du squelette) : le graphe de lecture change vraiment, donc mise en page, liaisons, lignée et
// invariant de correspondance (chaque arête complète représentée une fois) restent exacts.
//
// - Réduire G : toutes les unités vivantes de G fusionnent dans la dernière (ordre topologique). Arêtes
//   internes → `aretesInternes` ; arêtes entrantes et sortantes reportées sur l'unité fusionnée. Refusé
//   si la fusion créerait un cycle (un chemin sort de G puis y revient). Une boîte imbriquée dont le
//   parent est réduit n'est pas traitée à part (elle est dans la fonction du parent).
// - Onglet G : ne restent que les unités de G, leurs sources directes (Entrées) et leurs utilisateurs
//   directs (Sorties) ; le reste passe en contexte.

import type { EtapeLecture, GrapheLecture, JeuRaisonnement, NoeudR, Statut, TravailLecture } from '../../src/raisonnement'

/** État choisi par l'utilisatrice (identifiants de sous-problèmes). */
export const etatGroupes = {
  /** Boîtes réduites en nœud-fonction. */
  reduits: new Set<string>(),
  /** Sous-graphe ouvert dans un onglet (null : graphe principal). */
  onglet: null as string | null,
}

/** Ce qu'une dérivation a produit (ids de nœuds de justification). */
export interface ResultatGroupes {
  /** Id du nœud conclusion d'une unité fusionnée → boîte. */
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

/** Profondeur d'imbrication (0 : sous-problème de premier niveau). */
export function profondeur(id: string): number {
  let d = 0
  for (let p = parentDe(id); p; p = parentDe(p)) d++
  return d
}

/** Vrai si le sous-problème `sp` est `g` ou est imbriqué dans `g`. */
export function dansGroupe(sp: string, g: string): boolean {
  return sp === g || sp.startsWith(`${g}.`)
}

/** Un nœud qui reste hors des boîtes de sous-problème (marge des hypothèses de modélisation). */
export function horsGroupe(n: NoeudR): boolean {
  return n.type === 'choix_modelisation'
}

export function nomGroupe(jeu: JeuRaisonnement, id: string): string {
  if (id === ENTREES) return 'Entrées du sous-graphe'
  if (id === SORTIES) return 'Sorties du sous-graphe'
  if (id === SPEC) return 'Hypothèses de modélisation'
  return jeu.sousProblemes.find((s) => s.id === id)?.nom ?? id
}

// ─── Teintes (boîtes de R18, reprises telles quelles) ────────────────────────

/** Teintes des boîtes (sous-problèmes de premier niveau, dans l'ordre du jeu). */
export const TEINTES_COMMENTAIRES = ['#64748b', '#1d7a8c', '#a26a12', '#4f56b8', '#9a4a6b', '#3f7a3a', '#8a5a2b']
export const TEINTE_ABANDON = '#8a8f97'
export const TEINTE_SPEC = '#236b70'
/** Boîtes « Entrées » et « Sorties » d'un onglet : neutres. */
export const TEINTE_ES = '#6b7280'

/** Boîtes spéciales (non réductibles). */
export const SPEC = '§spec'
export const ENTREES = '§entrees'
export const SORTIES = '§sorties'

export function teinteGroupe(jeu: JeuRaisonnement, id: string): string {
  if (id === SPEC) return TEINTE_SPEC
  if (id === ENTREES || id === SORTIES) return TEINTE_ES
  let racine = id
  for (let p = parentDe(racine); p; p = parentDe(racine)) racine = p
  const sp = jeu.sousProblemes.find((s) => s.id === racine)
  if (sp?.abandonne || jeu.sousProblemes.find((s) => s.id === id)?.abandonne) return TEINTE_ABANDON
  const premiers = jeu.sousProblemes.filter((s) => !parentDe(s.id))
  const k = Math.max(0, premiers.findIndex((s) => s.id === racine))
  return TEINTES_COMMENTAIRES[k % TEINTES_COMMENTAIRES.length]!
}

// ─── Agrégats d'un nœud-fonction ─────────────────────────────────────────────

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

/** Unités vivantes d'une boîte (hors choix de modélisation). */
function unitesDuGroupe(t: TravailLecture, g: string): Set<number> {
  const s = new Set<number>()
  t.unites.forEach((u, k) => {
    if (!u.vivante) return
    const n = t.j.noeuds[u.conclusion]!
    if (!horsGroupe(n) && dansGroupe(n.sousProbleme, g)) s.add(k)
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

/** Onglet : ne garde que G, ses sources directes (Entrées) et ses utilisateurs directs (Sorties). */
function isolerOnglet(t: TravailLecture, g: string, r: ResultatGroupes): void {
  const G = unitesDuGroupe(t, g)
  if (!G.size) {
    t.journal.push(`Onglet : le sous-problème « ${g} » n'a aucune unité à ce niveau.`)
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

/** Étape finale des stratégies R42 : onglet, ou réduction des boîtes choisies (parents d'abord). */
export const etapeGroupes: EtapeLecture = (t) => {
  const r = vide()
  resultats.set(t.journal, r)
  if (etatGroupes.onglet) return isolerOnglet(t, etatGroupes.onglet, r)
  const faits: string[] = []
  const ordre = [...etatGroupes.reduits].sort((a, b) => profondeur(a) - profondeur(b) || a.localeCompare(b))
  const reduitsFaits = new Set<string>()
  for (const g of ordre) {
    // Un parent déjà réduit contient cette boîte.
    let couvert = false
    for (let p = parentDe(g); p; p = parentDe(p)) if (reduitsFaits.has(p)) couvert = true
    if (couvert) continue
    const G = unitesDuGroupe(t, g)
    if (G.size < 1) continue
    if (G.size > 1 && creeCycle(t, G)) {
      r.refus.set(g, 'un chemin sort de la boîte puis y revient : la réduction créerait un cycle')
      continue
    }
    const c = G.size > 1 ? fusionner(t, G) : [...G][0]!
    r.fonctions.set(t.j.noeuds[t.unites[c]!.conclusion]!.id, g)
    reduitsFaits.add(g)
    faits.push(`${g} (${t.unites[c]!.membres.length})`)
  }
  if (faits.length || r.refus.size) {
    t.journal.push(`Boîtes réduites en fonctions : ${faits.join(', ') || 'aucune'}${r.refus.size ? ` ; refusées (cycle) : ${[...r.refus.keys()].join(', ')}` : ''}.`)
  }
}
