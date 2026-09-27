// R19 · Groupes façon Blueprint d'Unreal : boîtes « Comment » autour des sous-problèmes, réduction d'un
// groupe en un nœud-fonction (« Collapse to Function ») et ouverture d'un groupe dans un onglet.
//
// La réduction et l'onglet sont des étapes de dérivation (`etapeGroupes`, ajoutée en fin de chaque
// stratégie du squelette) : le graphe de lecture change vraiment, donc la mise en page, les liaisons,
// la lignée et l'invariant de correspondance (chaque arête complète représentée une fois) restent
// cohérents sans cas particulier.
//
// - Réduire G : toutes les unités vivantes de G (hors choix de modélisation, qui restent en marge)
//   fusionnent dans une seule unité. Les arêtes internes deviennent `aretesInternes`, les arêtes
//   entrantes / sortantes sont reportées sur l'unité fusionnée (une broche par arête entrante, une
//   broche de sortie par énoncé de G utilisé à l'extérieur). Refusé si la fusion créerait un cycle
//   (G → X → G avec X hors de G).
// - Onglet G : ne restent que les unités de G, leurs sources directes (nœud « Entrée ») et leurs
//   utilisateurs directs (nœud « Sortie ») ; le reste passe en contexte.

import type { EtapeLecture, GrapheLecture, JeuRaisonnement, NoeudR, Statut, TravailLecture } from '../../src/raisonnement'

/** État choisi par l'utilisatrice (ids de sous-problèmes). */
export const etatGroupes = {
  /** Groupes réduits en nœud-fonction. */
  reduits: new Set<string>(),
  /** Groupe ouvert dans un onglet (null : graphe principal). */
  onglet: null as string | null,
}

/** Ce qu'une dérivation a produit (ids de nœuds de justification). */
export interface ResultatGroupes {
  /** Id du nœud conclusion d'une unité fusionnée → groupe. */
  fonctions: Map<string, string>
  /** Groupes dont la réduction a été refusée (cycle) → raison. */
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

/** Groupe d'un nœud : son sous-problème. */
export function groupeDeNoeud(n: NoeudR): string {
  return n.sousProbleme || 'cadre'
}

/** Un nœud qui reste hors des groupes (marge des spécifications). */
export function horsGroupe(n: NoeudR): boolean {
  return n.type === 'choix_modelisation'
}

// ─── Couleurs ────────────────────────────────────────────────────────────────

/** Teintes des boîtes « Comment » (translucides à l'affichage), par sous-problème. */
const TEINTES_CONNUES: Record<string, string> = {
  cadre: '#6b7280',
  dyn: '#6a55b0',
  bords: '#c98a12',
  pred: '#2c83b0',
}
const TEINTES = ['#6a55b0', '#c98a12', '#2c83b0', '#2f8f83', '#b5543a', '#5b7f2a', '#8a5a9e']
export const TEINTE_ABANDON = '#9aa0a8'
/** Couleur propre des nœuds-fonctions (groupes réduits) et des nœuds Entrée / Sortie. */
export const COULEUR_FONCTION = '#9b2c5a'

export function teinteGroupe(jeu: JeuRaisonnement, id: string): string {
  const sp = jeu.sousProblemes.find((s) => s.id === id)
  if (sp?.abandonne) return TEINTE_ABANDON
  if (TEINTES_CONNUES[id]) return TEINTES_CONNUES[id]!
  const k = Math.max(0, jeu.sousProblemes.findIndex((s) => s.id === id))
  return TEINTES[k % TEINTES.length]!
}

export function nomGroupe(jeu: JeuRaisonnement, id: string): string {
  return jeu.sousProblemes.find((s) => s.id === id)?.nom ?? id
}

/** Famille d'un nœud (couleur d'en-tête du bloc). */
export type Famille = 'deduction' | 'empirique' | 'calcul' | 'conjecture' | 'resultat' | 'decision' | 'fonction'

export const COULEURS_FAMILLE: Record<Famille, string> = {
  deduction: '#3b5a8a',
  empirique: '#2f7650',
  calcul: '#16707a',
  conjecture: '#9a6416',
  resultat: '#1c2129',
  decision: '#1c2129',
  fonction: COULEUR_FONCTION,
}

export const NOMS_FAMILLE: Record<Famille, string> = {
  deduction: 'déduction (lemme, proposition, définition)',
  empirique: 'empirique (observation, expérience)',
  calcul: 'calcul machine',
  conjecture: 'conjecture, hypothèse',
  resultat: 'résultat, théorème',
  decision: 'décision',
  fonction: 'sous-graphe réduit (fonction)',
}

export function familleDe(n: NoeudR): Famille {
  switch (n.type) {
    case 'observation': case 'experience': return 'empirique'
    case 'calcul': return 'calcul'
    case 'conjecture': case 'hypothese': return 'conjecture'
    case 'theoreme': case 'resultat': return n.admis ? 'deduction' : 'resultat'
    case 'decision': return 'decision'
    default: return 'deduction'
  }
}

// ─── Agrégats d'un groupe réduit ─────────────────────────────────────────────

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

/** Unités vivantes d'un groupe (hors choix de modélisation). */
function unitesDuGroupe(t: TravailLecture, g: string): Set<number> {
  const s = new Set<number>()
  t.unites.forEach((u, k) => {
    if (!u.vivante) return
    const n = t.j.noeuds[u.conclusion]!
    if (!horsGroupe(n) && groupeDeNoeud(n) === g) s.add(k)
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
function isolerOnglet(t: TravailLecture, g: string, resultatGroupes: ResultatGroupes): void {
  const G = unitesDuGroupe(t, g)
  if (!G.size) {
    t.journal.push(`Onglet : le groupe « ${g} » n'a aucune unité à ce niveau.`)
    return
  }
  const E = new Set<number>(), S = new Set<number>()
  for (const a of t.aretes.values()) {
    if (G.has(a.cible) && !G.has(a.source)) E.add(a.source)
  }
  for (const a of t.aretes.values()) {
    if (G.has(a.source) && !G.has(a.cible) && !E.has(a.cible)) S.add(a.cible)
  }
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
  for (const u of E) resultatGroupes.entrees.add(id(u))
  for (const u of S) resultatGroupes.sorties.add(id(u))
  resultatGroupes.onglet = g
  t.journal.push(`Onglet « ${g} » : ${G.size} unité(s), ${E.size} entrée(s), ${S.size} sortie(s) ; ${retirees} liaison(s) hors du sous-graphe passées en contexte.`)
}

/** Étape finale des stratégies R19 : onglet, ou réduction des groupes choisis. */
export const etapeGroupes: EtapeLecture = (t) => {
  const resultatGroupes = vide()
  resultats.set(t.journal, resultatGroupes)
  if (etatGroupes.onglet) return isolerOnglet(t, etatGroupes.onglet, resultatGroupes)
  const faits: string[] = []
  for (const g of etatGroupes.reduits) {
    const G = unitesDuGroupe(t, g)
    if (G.size < 1) continue
    if (G.size > 1 && creeCycle(t, G)) {
      resultatGroupes.refus.set(g, 'un chemin sort du groupe puis y revient : la réduction créerait un cycle')
      continue
    }
    const c = G.size > 1 ? fusionner(t, G) : [...G][0]!
    resultatGroupes.fonctions.set(t.j.noeuds[t.unites[c]!.conclusion]!.id, g)
    faits.push(`${g} (${t.unites[c]!.membres.length})`)
  }
  if (faits.length || resultatGroupes.refus.size) {
    t.journal.push(`Groupes réduits en fonctions : ${faits.join(', ') || 'aucun'}${resultatGroupes.refus.size ? ` ; refusés (cycle) : ${[...resultatGroupes.refus.keys()].join(', ')}` : ''}.`)
  }
}
