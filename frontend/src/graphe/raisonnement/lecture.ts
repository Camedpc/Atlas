// Dérivation du graphe de lecture depuis le graphe de justification.
//
// Le graphe de justification contient toutes les prémisses de toutes les démonstrations. Le graphe
// de lecture ne garde que les liens qui correspondent à une déduction naturelle pour un humain.
// Une stratégie est une suite d'étapes appliquées à un « travail » (unités + arêtes) :
//
//   (a) roles       ne garder que les prémisses de rôle retenu (par défaut `principale`) ; les autres
//                   sont rattachées comme contexte du nœud ; les nœuds devenus isolés et purement
//                   contextuels (définitions, axiomes, outils) sortent du graphe.
//   (b) transitive  réduction transitive : A → C disparaît s'il existe déjà A → … → C.
//   (c) chaines     fusion des chaînes linéaires (u → v, u n'a qu'un enfant, v qu'un parent) en « étapes ».
//   (d) defaut      a + b + c.
//
// Invariant : chaque arête complète est comptée exactement une fois, soit dans `resume` ou
// `transitives` d'une arête de lecture, soit dans `aretesInternes` d'une étape, soit dans
// `aretesContexte` (rôle écarté ou extrémité masquée). `verifierCorrespondance` le contrôle.

import {
  construireJustification, FORCE_ROLE, type AreteJustification, type GrapheJustification, type JeuRaisonnement,
  type RolePremisse, type TypeRaisonnement,
} from './donnees'

// ─── Paramètres et stratégies ────────────────────────────────────────────────

export interface ParametresLecture {
  /** Démonstrations prises en compte : toutes (graphe exhaustif) ou la principale de chaque nœud. */
  demonstrations: 'toutes' | 'principale'
  /** Rôles qui deviennent des arêtes de lecture (étape roles). */
  rolesRetenus: RolePremisse[]
  /** Retirer du graphe les nœuds sans arête de lecture qui ne servent que de contexte. */
  masquerContexte: boolean
  /** Types jamais masqués (décisions, choix, résultats…), sauf s'ils sont admis (littérature). */
  typesToujoursVisibles: TypeRaisonnement[]
  /** Types qui ne sont jamais absorbés dans une étape. */
  typesInsecables: TypeRaisonnement[]
  /** Longueur minimale d'une chaîne fusionnée (nombre de nœuds). */
  longueurMinChaine: number
  /** Longueur maximale d'une étape (au-delà, la chaîne est coupée). */
  longueurMaxChaine: number
  /** Ne fusionner que des nœuds du même sous-problème. */
  memeSousProbleme: boolean
}

export const PARAMETRES_DEFAUT: ParametresLecture = {
  demonstrations: 'toutes',
  rolesRetenus: ['principale'],
  masquerContexte: true,
  typesToujoursVisibles: ['decision', 'choix_modelisation', 'theoreme', 'resultat', 'conjecture', 'hypothese'],
  typesInsecables: ['decision', 'choix_modelisation', 'theoreme', 'resultat', 'conjecture', 'hypothese', 'axiome'],
  longueurMinChaine: 2,
  longueurMaxChaine: 6,
  memeSousProbleme: true,
}

/** Étape de dérivation : transforme le travail en place. */
export type EtapeLecture = (t: TravailLecture, p: ParametresLecture) => void

export interface StrategieLecture {
  id: string
  nom: string
  description: string
  /** Étapes appliquées dans l'ordre. */
  etapes: EtapeLecture[]
  /** Surcharges des paramètres par défaut. */
  parametres?: Partial<ParametresLecture>
}

// ─── Résultat ────────────────────────────────────────────────────────────────

export interface ContexteRattache {
  /** Nœud de justification rattaché comme contexte. */
  noeud: number
  role: RolePremisse
  /** Arête complète d'origine. */
  arete: number
}

export interface UniteLecture {
  index: number
  genre: 'noeud' | 'etape'
  /** Nœuds de justification représentés, dans l'ordre de la chaîne (la conclusion en dernier). */
  membres: number[]
  /** Nœud qui donne son nom, son type et son statut à l'unité. */
  conclusion: number
  /** Prémisses écartées, rattachées à l'unité (dédoublonnées par nœud, rôle le plus fort). */
  contexte: ContexteRattache[]
  /** Arêtes complètes internes à une étape. */
  aretesInternes: number[]
}

export interface AreteLecture {
  index: number
  /** Indices d'unités. */
  source: number
  cible: number
  /** Arêtes complètes directement représentées par cette arête. */
  resume: number[]
  /** Arêtes complètes retirées par la réduction transitive et absorbées par cette arête. */
  transitives: number[]
}

export interface StatistiquesLecture {
  noeudsComplet: number
  aretesComplet: number
  unites: number
  aretes: number
  masques: number
  etapes: number
  noeudsFusionnes: number
  aretesContexte: number
  transitivesRetirees: number
  /** Répartition des arêtes complètes par rôle. */
  roles: Record<RolePremisse, number>
}

export interface GrapheLecture {
  strategie: StrategieLecture
  parametres: ParametresLecture
  justification: GrapheJustification
  unites: UniteLecture[]
  aretes: AreteLecture[]
  /** Nœud de justification → unité (-1 si masqué). */
  uniteDe: Int32Array
  /** Nœuds masqués (hors graphe de lecture, contexte pur). */
  masques: number[]
  /** Arêtes complètes devenues contexte (rôle écarté ou extrémité masquée). */
  aretesContexte: number[]
  /** Adjacence par unité : indices d'arêtes de lecture. */
  entrantes: number[][]
  sortantes: number[][]
  stats: StatistiquesLecture
  /** Ce que chaque étape a fait (lisible). */
  journal: string[]
}

// ─── Travail (état intermédiaire manipulé par les étapes) ─────────────────────

interface UniteTravail {
  membres: number[]
  conclusion: number
  contexte: Map<number, ContexteRattache>
  aretesInternes: number[]
  vivante: boolean
}
interface AreteTravail {
  source: number
  cible: number
  resume: number[]
  transitives: number[]
}

export class TravailLecture {
  readonly j: GrapheJustification
  readonly unites: UniteTravail[] = []
  /** Clé `source * N + cible` → arête (entre unités). */
  readonly aretes = new Map<number, AreteTravail>()
  readonly uniteDe: Int32Array
  readonly aretesContexte: number[] = []
  readonly journal: string[] = []
  transitivesRetirees = 0
  private readonly N: number

  constructor(j: GrapheJustification) {
    this.j = j
    const n = j.noeuds.length
    this.N = n
    this.uniteDe = new Int32Array(n)
    for (let i = 0; i < n; i++) {
      this.unites.push({ membres: [i], conclusion: i, contexte: new Map(), aretesInternes: [], vivante: true })
      this.uniteDe[i] = i
    }
    for (const a of j.aretes) this.ajouterResume(a.source, a.cible, a.index)
  }

  cle(s: number, c: number): number {
    return s * this.N + c
  }

  ajouterResume(s: number, c: number, arete: number): void {
    const k = this.cle(s, c)
    let a = this.aretes.get(k)
    if (!a) this.aretes.set(k, (a = { source: s, cible: c, resume: [], transitives: [] }))
    a.resume.push(arete)
  }

  /** Transforme une arête complète en contexte de l'unité cible (si elle existe encore). */
  versContexte(arete: number, uniteCible: number): void {
    this.aretesContexte.push(arete)
    if (uniteCible < 0) return
    const a = this.j.aretes[arete]!
    const u = this.unites[uniteCible]!
    const exist = u.contexte.get(a.source)
    if (!exist || FORCE_ROLE[a.role] > FORCE_ROLE[exist.role]) u.contexte.set(a.source, { noeud: a.source, role: a.role, arete })
  }

  /** Listes d'adjacence courantes (unités vivantes). */
  adjacence(): { parents: Map<number, number[]>; enfants: Map<number, number[]> } {
    const parents = new Map<number, number[]>(), enfants = new Map<number, number[]>()
    for (const a of this.aretes.values()) {
      if (!parents.has(a.cible)) parents.set(a.cible, [])
      if (!enfants.has(a.source)) enfants.set(a.source, [])
      parents.get(a.cible)!.push(a.source)
      enfants.get(a.source)!.push(a.cible)
    }
    return { parents, enfants }
  }

  typeDe(u: number): TypeRaisonnement {
    return this.j.noeuds[this.unites[u]!.conclusion]!.type
  }
}

// ─── Étapes ──────────────────────────────────────────────────────────────────

/** (a) Filtre par rôles et masquage des nœuds de contexte pur. */
export const etapeRoles: EtapeLecture = (t, p) => {
  const retenus = new Set(p.rolesRetenus)
  let nbCtx = 0
  for (const [k, a] of [...t.aretes]) {
    const garder: number[] = []
    for (const e of a.resume) {
      if (retenus.has(t.j.aretes[e]!.role)) garder.push(e)
      else {
        t.versContexte(e, a.cible)
        nbCtx++
      }
    }
    if (garder.length) a.resume = garder
    else {
      // Les arêtes absorbées (transitives) suivent l'arête si elle disparaît.
      for (const e of a.transitives) t.versContexte(e, a.cible)
      t.aretes.delete(k)
    }
  }
  let masques = 0
  if (p.masquerContexte) {
    const visibles = new Set(p.typesToujoursVisibles)
    const { parents, enfants } = t.adjacence()
    for (let u = 0; u < t.unites.length; u++) {
      const un = t.unites[u]!
      // Toujours visibles… sauf les résultats admis (littérature), qui ne sont que du contexte.
      if (!un.vivante || (visibles.has(t.typeDe(u)) && !t.j.noeuds[un.conclusion]!.admis)) continue
      if (parents.has(u) || enfants.has(u)) continue
      // Masqué seulement s'il sert (comme contexte) à au moins un autre nœud.
      if (t.j.sortantes[un.conclusion]!.length === 0) continue
      un.vivante = false
      for (const m of un.membres) t.uniteDe[m] = -1
      masques++
    }
  }
  t.journal.push(`Rôles : ${nbCtx} prémisse(s) hors {${p.rolesRetenus.join(', ')}} rattachée(s) comme contexte ; ${masques} nœud(s) de contexte pur retiré(s).`)
}

/** (b) Réduction transitive : retire A → C quand un autre chemin A → … → C existe. */
export const etapeReductionTransitive: EtapeLecture = (t) => {
  const { enfants } = t.adjacence()
  // Ordre topologique (Kahn) des unités vivantes.
  const n = t.unites.length
  const degre = new Int32Array(n)
  for (const a of t.aretes.values()) degre[a.cible]!++
  const ordre: number[] = []
  const file: number[] = []
  for (let u = 0; u < n; u++) if (t.unites[u]!.vivante && degre[u] === 0) file.push(u)
  while (file.length) {
    const u = file.shift()!
    ordre.push(u)
    for (const v of enfants.get(u) ?? []) if (--degre[v]! === 0) file.push(v)
  }
  // Accessibilité par ensembles de bits (n ≤ quelques milliers).
  const mots = Math.ceil(n / 32)
  const atteint = new Map<number, Uint32Array>()
  for (let i = ordre.length - 1; i >= 0; i--) {
    const u = ordre[i]!
    const b = new Uint32Array(mots)
    for (const v of enfants.get(u) ?? []) {
      b[v >> 5]! |= 1 << (v & 31)
      const bv = atteint.get(v)
      if (bv) for (let w = 0; w < mots; w++) b[w]! |= bv[w]!
    }
    atteint.set(u, b)
  }
  // Un cycle (données API incohérentes) laisse des unités hors de l'ordre : elles sont ignorées.
  const accessible = (a: number, c: number) => ((atteint.get(a)?.[c >> 5] ?? 0) & (1 << (c & 31))) !== 0
  let retirees = 0
  for (const u of ordre) {
    const fils = enfants.get(u) ?? []
    for (const c of fils) {
      // u → c est redondante si un autre enfant v de u atteint c.
      const relais = fils.find((v) => v !== c && accessible(v, c))
      if (relais === undefined) continue
      const k = t.cle(u, c)
      const a = t.aretes.get(k)
      if (!a) continue
      // On rattache les arêtes complètes à la dernière arête d'un chemin relais → … → c.
      const derniere = dernierPas(t, enfants, accessible, relais, c)
      const cible = derniere ? t.aretes.get(t.cle(derniere, c)) : undefined
      if (cible) cible.transitives.push(...a.resume, ...a.transitives)
      else for (const e of [...a.resume, ...a.transitives]) t.versContexte(e, c)
      t.aretes.delete(k)
      retirees++
    }
  }
  t.transitivesRetirees += retirees
  t.journal.push(`Réduction transitive : ${retirees} arête(s) redondante(s) retirée(s).`)
}

/** Dernier nœud avant c sur un chemin depuis `depart` (parcours en profondeur guidé par l'accessibilité). */
function dernierPas(
  t: TravailLecture, enfants: Map<number, number[]>, accessible: (a: number, c: number) => boolean, depart: number, c: number,
): number | null {
  let u = depart
  for (let garde = 0; garde < 10_000; garde++) {
    const fils = enfants.get(u) ?? []
    if (fils.includes(c) && t.aretes.has(t.cle(u, c))) return u
    const suivant = fils.find((v) => v !== c && accessible(v, c))
    if (suivant === undefined) return null
    u = suivant
  }
  return null
}

/** (c) Fusion des chaînes linéaires en étapes. */
export const etapeFusionChaines: EtapeLecture = (t, p) => {
  const insecables = new Set(p.typesInsecables)
  const { parents, enfants } = t.adjacence()
  const noeuds = t.j.noeuds
  const fusible = (u: number) => t.unites[u]!.vivante && !insecables.has(t.typeDe(u))
  const lien = (u: number, v: number) =>
    (enfants.get(u)?.length ?? 0) === 1 && (parents.get(v)?.length ?? 0) === 1 && enfants.get(u)![0] === v &&
    fusible(u) && fusible(v) &&
    (!p.memeSousProbleme || noeuds[t.unites[u]!.conclusion]!.sousProbleme === noeuds[t.unites[v]!.conclusion]!.sousProbleme)
  const pris = new Uint8Array(t.unites.length)
  let etapes = 0, fusionnes = 0
  for (let u = 0; u < t.unites.length; u++) {
    if (pris[u] || !fusible(u)) continue
    // Début de chaîne : pas de lien entrant fusible.
    const par = parents.get(u)
    if (par && par.length === 1 && lien(par[0]!, u)) continue
    const chaine = [u]
    let c = u
    while (chaine.length <= t.unites.length) {
      const f = enfants.get(c)
      if (!f || f.length !== 1 || !lien(c, f[0]!)) break
      c = f[0]!
      chaine.push(c)
    }
    // Une chaîne trop longue est coupée en segments d'au plus longueurMaxChaine nœuds.
    for (let debut = 0; debut < chaine.length; debut += p.longueurMaxChaine) {
      const segment = chaine.slice(debut, debut + p.longueurMaxChaine)
      if (segment.length < p.longueurMinChaine) continue
      for (const x of segment) pris[x] = 1
      fusionner(t, segment)
      etapes++
      fusionnes += segment.length
    }
  }
  t.journal.push(`Chaînes : ${etapes} étape(s) formée(s) à partir de ${fusionnes} nœud(s).`)
}

/** Fusionne une chaîne d'unités dans la dernière (la conclusion). */
function fusionner(t: TravailLecture, chaine: number[]): void {
  const dernier = chaine[chaine.length - 1]!
  const cible = t.unites[dernier]!
  const membres: number[] = []
  for (let i = 0; i < chaine.length; i++) {
    const u = chaine[i]!
    const un = t.unites[u]!
    membres.push(...un.membres)
    if (u !== dernier) {
      for (const [k, c] of un.contexte) if (!cible.contexte.has(k)) cible.contexte.set(k, c)
      cible.aretesInternes.push(...un.aretesInternes)
      un.vivante = false
    }
    if (i > 0) {
      const k = t.cle(chaine[i - 1]!, u)
      const a = t.aretes.get(k)!
      cible.aretesInternes.push(...a.resume, ...a.transitives)
      t.aretes.delete(k)
    }
  }
  cible.membres = membres
  // Les arêtes entrantes du premier membre pointent maintenant vers l'étape.
  const premier = chaine[0]!
  if (premier !== dernier) {
    for (const [k, a] of [...t.aretes]) {
      if (a.cible !== premier) continue
      t.aretes.delete(k)
      const k2 = t.cle(a.source, dernier)
      const ex = t.aretes.get(k2)
      if (ex) {
        ex.resume.push(...a.resume)
        ex.transitives.push(...a.transitives)
      } else t.aretes.set(k2, { ...a, cible: dernier })
    }
  }
  for (const m of membres) t.uniteDe[m] = dernier
}

// ─── Stratégies prédéfinies ──────────────────────────────────────────────────

export const STRATEGIES: StrategieLecture[] = [
  {
    id: 'defaut',
    nom: 'Lecture (a + b + c)',
    description: 'Rôles principaux seulement, réduction transitive, puis fusion des chaînes linéaires en étapes.',
    etapes: [etapeRoles, etapeReductionTransitive, etapeFusionChaines],
  },
  {
    id: 'roles',
    nom: '(a) Par rôles',
    description: 'Seules les prémisses principales deviennent des arêtes ; le contexte est rattaché aux nœuds.',
    etapes: [etapeRoles],
  },
  {
    id: 'roles_aux',
    nom: '(a′) Rôles principal + auxiliaire',
    description: 'Comme (a), en gardant aussi les prémisses auxiliaires comme arêtes.',
    etapes: [etapeRoles, etapeReductionTransitive],
    parametres: { rolesRetenus: ['principale', 'auxiliaire'] },
  },
  {
    id: 'transitive',
    nom: '(b) Réduction transitive',
    description: 'Toutes les prémisses, mais sans les arêtes impliquées par un autre chemin.',
    etapes: [etapeReductionTransitive],
  },
  {
    id: 'chaines',
    nom: '(c) Fusion des chaînes',
    description: 'Toutes les prémisses ; les chaînes linéaires sont regroupées en étapes.',
    etapes: [etapeFusionChaines],
  },
  {
    id: 'complet',
    nom: 'Graphe complet',
    description: 'Le graphe de justification tel quel : toutes les prémisses de toutes les démonstrations.',
    etapes: [],
  },
]

const registre = new Map(STRATEGIES.map((s) => [s.id, s]))

/** Ajoute (ou remplace) une stratégie : elle devient disponible dans les sélecteurs. */
export function enregistrerStrategie(s: StrategieLecture): void {
  const i = STRATEGIES.findIndex((x) => x.id === s.id)
  if (i >= 0) STRATEGIES[i] = s
  else STRATEGIES.push(s)
  registre.set(s.id, s)
}

export function strategie(id: string): StrategieLecture {
  return registre.get(id) ?? registre.get('defaut')!
}

// ─── Dérivation ──────────────────────────────────────────────────────────────

/**
 * Dérive le graphe de lecture. `source` : un jeu (le graphe de justification est construit selon
 * `parametres.demonstrations`) ou un graphe de justification déjà construit.
 */
export function deriverLecture(
  source: JeuRaisonnement | GrapheJustification,
  strat: string | StrategieLecture = 'defaut',
  surcharges: Partial<ParametresLecture> = {},
): GrapheLecture {
  const s = typeof strat === 'string' ? strategie(strat) : strat
  const parametres: ParametresLecture = { ...PARAMETRES_DEFAUT, ...(s.parametres ?? {}), ...surcharges }
  const j = 'aretes' in source && 'entrantes' in source ? source : construireJustification(source, parametres.demonstrations)
  const t = new TravailLecture(j)
  for (const e of s.etapes) e(t, parametres)
  return finaliser(t, s, parametres)
}

function finaliser(t: TravailLecture, s: StrategieLecture, parametres: ParametresLecture): GrapheLecture {
  const j = t.j
  const nouvel = new Int32Array(t.unites.length).fill(-1)
  const unites: UniteLecture[] = []
  t.unites.forEach((u, i) => {
    if (!u.vivante) return
    nouvel[i] = unites.length
    unites.push({
      index: unites.length,
      genre: u.membres.length > 1 ? 'etape' : 'noeud',
      membres: u.membres,
      conclusion: u.conclusion,
      contexte: [...u.contexte.values()].filter((c) => !u.membres.includes(c.noeud)).sort((a, b) => FORCE_ROLE[b.role] - FORCE_ROLE[a.role] || a.noeud - b.noeud),
      aretesInternes: u.aretesInternes,
    })
  })
  const uniteDe = new Int32Array(j.noeuds.length)
  const masques: number[] = []
  for (let i = 0; i < j.noeuds.length; i++) {
    const u = t.uniteDe[i]!
    uniteDe[i] = u < 0 ? -1 : nouvel[u]!
    if (uniteDe[i]! < 0) masques.push(i)
  }
  const aretes: AreteLecture[] = []
  const entrantes: number[][] = unites.map(() => [])
  const sortantes: number[][] = unites.map(() => [])
  const aretesContexte = [...t.aretesContexte]
  for (const a of t.aretes.values()) {
    const s2 = nouvel[a.source]!, c2 = nouvel[a.cible]!
    if (s2 < 0 || c2 < 0) {
      aretesContexte.push(...a.resume, ...a.transitives)
      continue
    }
    const ar: AreteLecture = { index: aretes.length, source: s2, cible: c2, resume: a.resume, transitives: a.transitives }
    aretes.push(ar)
    sortantes[s2]!.push(ar.index)
    entrantes[c2]!.push(ar.index)
  }
  const roles = { principale: 0, auxiliaire: 0, technique: 0, contexte: 0 } as Record<RolePremisse, number>
  for (const a of j.aretes) roles[a.role]++
  const etapes = unites.filter((u) => u.genre === 'etape')
  const g: GrapheLecture = {
    strategie: s, parametres, justification: j, unites, aretes, uniteDe, masques, aretesContexte, entrantes, sortantes,
    stats: {
      noeudsComplet: j.noeuds.length,
      aretesComplet: j.aretes.length,
      unites: unites.length,
      aretes: aretes.length,
      masques: masques.length,
      etapes: etapes.length,
      noeudsFusionnes: etapes.reduce((n, u) => n + u.membres.length, 0),
      aretesContexte: aretesContexte.length,
      transitivesRetirees: t.transitivesRetirees,
      roles,
    },
    journal: t.journal,
  }
  const erreur = verifierCorrespondance(g)
  if (erreur) console.warn(`[raisonnement] correspondance incomplète (${s.id}) : ${erreur}`)
  return g
}

/** Vérifie que chaque arête complète est représentée exactement une fois. Renvoie un message ou null. */
export function verifierCorrespondance(g: GrapheLecture): string | null {
  const vu = new Uint8Array(g.justification.aretes.length)
  const marquer = (e: number) => vu[e]!++
  for (const a of g.aretes) {
    a.resume.forEach(marquer)
    a.transitives.forEach(marquer)
  }
  for (const u of g.unites) u.aretesInternes.forEach(marquer)
  g.aretesContexte.forEach(marquer)
  const manquantes = vu.reduce((n, v) => n + (v === 0 ? 1 : 0), 0)
  const doubles = vu.reduce((n, v) => n + (v > 1 ? 1 : 0), 0)
  return manquantes || doubles ? `${manquantes} arête(s) non représentée(s), ${doubles} en double` : null
}

// ─── Outils de lecture ───────────────────────────────────────────────────────

/** Toutes les arêtes complètes résumées par une arête de lecture. */
export function aretesResumees(a: AreteLecture): number[] {
  return a.transitives.length ? [...a.resume, ...a.transitives] : a.resume
}

/** Ancêtres et descendants d'une unité dans le graphe de lecture. */
export function ligneeLecture(g: GrapheLecture, u: number, descendants = true): { ancetres: Uint8Array; descendants: Uint8Array } {
  const n = g.unites.length
  const anc = new Uint8Array(n), desc = new Uint8Array(n)
  const parcourir = (depart: number, marque: Uint8Array, versParents: boolean) => {
    const pile = [depart]
    while (pile.length) {
      const x = pile.pop()!
      for (const e of versParents ? g.entrantes[x]! : g.sortantes[x]!) {
        const a = g.aretes[e]!
        const y = versParents ? a.source : a.cible
        if (!marque[y]) {
          marque[y] = 1
          pile.push(y)
        }
      }
    }
  }
  parcourir(u, anc, true)
  if (descendants) parcourir(u, desc, false)
  return { ancetres: anc, descendants: desc }
}

/** Rôle de chaque arête complète : utile aux légendes et aux filtres. */
export function roleArete(g: GrapheLecture, e: number): AreteJustification['role'] {
  return g.justification.aretes[e]!.role
}

/** Résumé texte du compteur « graphe complet → lecture ». */
export function texteCompteur(g: GrapheLecture): string {
  const s = g.stats
  return `Graphe complet : ${s.noeudsComplet} nœuds / ${s.aretesComplet} arêtes → lecture : ${s.unites} / ${s.aretes}`
}
