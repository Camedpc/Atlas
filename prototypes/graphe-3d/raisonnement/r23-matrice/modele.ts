// R23 · Matrice de dépendance : modèle pur (aucun DOM), testable hors navigateur.
//
// Une dépendance = un couple (conclusion, prémisse), avec le détail des démonstrations qui la
// citent et du rôle dans chacune. Les lignes sont les conclusions, les colonnes les prémisses,
// dans le même ordre. Tout ce qui est calculé ici est déterministe.

import {
  demonstrationPrincipale, FORCE_ROLE, LIBELLES_TYPE,
  type Confiance, type JeuRaisonnement, type LienSemantique, type NoeudR,
  type RolePremisse, type TypeRaisonnement, type Validite,
} from '../../src/raisonnement/donnees'

// ─── Identifiants citables ───────────────────────────────────────────────────

/** Sigle d'un type : sert à l'identifiant court (« Lem 4 », « H2 », « Déc 3 »). */
export const SIGLES: Record<TypeRaisonnement, string> = {
  hypothese: 'H', choix_modelisation: 'M', decision: 'Déc', axiome: 'Ax', definition: 'Déf',
  lemme: 'Lem', proposition: 'Prop', theoreme: 'Thm', assertion: 'As', experience: 'Exp',
  calcul: 'Calc', observation: 'Obs', resultat: 'Rés', conjecture: 'Conj',
}

/** Type en petites capitales pour l'en-tête de ligne (abrégé pour tenir en ~70 px). */
export const TYPES_COURTS: Record<TypeRaisonnement, string> = {
  hypothese: 'hypothèse', choix_modelisation: 'choix mod.', decision: 'décision', axiome: 'axiome',
  definition: 'définition', lemme: 'lemme', proposition: 'proposition', theoreme: 'théorème',
  assertion: 'assertion', experience: 'expérience', calcul: 'calcul', observation: 'observation',
  resultat: 'résultat', conjecture: 'conjecture',
}

/**
 * Rang de priorité dans le tri topologique d'un bloc : hypothèses, choix et décisions d'abord
 * (leurs colonnes se regroupent à gauche), puis fondations admises, puis le travail.
 */
function rangType(n: NoeudR): number {
  switch (n.type) {
    case 'hypothese': return 0
    case 'choix_modelisation': return 1
    case 'decision': return 2
    case 'axiome': return 3
    case 'definition': return 4
    default: return n.admis ? 5 : 6
  }
}

/** Accès unique à la confiance : aujourd'hui portée par le nœud, demain par la démonstration principale. */
export function confianceDe(n: NoeudR): Confiance {
  return n.confiance
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type ModeDemos = 'toutes' | 'principale'
export type Tri = 'topologique' | 'date' | 'confiance'
export type Transitif = 'aucun' | 'fondations' | 'tout'
export type GenreLien = LienSemantique['genre']

export interface Citation {
  /** Indice de la démonstration dans `noeud.demonstrations`. */
  demo: number
  role: RolePremisse
}

export interface Dependance {
  index: number
  /** Prémisse (colonne). */
  source: number
  /** Conclusion (ligne). */
  cible: number
  citations: Citation[]
  /** Citée par la démonstration principale de la conclusion. */
  principale: boolean
  /** Démonstration représentée par la cellule : la principale si elle cite, sinon la première qui cite. */
  demo: number
  /** Rôle dans la démonstration représentée. */
  role: RolePremisse
  /** Validité de la démonstration représentée. */
  validite: Validite
  /** Rétroaction logique : la prémisse vient après la conclusion dans l'ordre canonique (blocs). */
  retroOrdre: boolean
  /** Rétroaction temporelle : la prémisse a été créée après la conclusion (démonstration révisée). */
  retroDate: boolean
}

export interface Lien {
  index: number
  source: number
  cible: number
  genre: GenreLien
  note?: string
}

export interface Bloc {
  id: string
  nom: string
  /** Étiquette de marge (« SP1 », « Cadre », « Piste abandonnée »). */
  court: string
  abandonne: boolean
  /** Nœuds du bloc, dans l'ordre canonique. */
  noeuds: number[]
}

export interface Modele {
  jeu: JeuRaisonnement
  noeuds: NoeudR[]
  n: number
  index: Map<string, number>
  mode: ModeDemos
  ident: string[]
  date: number[]
  blocs: Bloc[]
  blocDe: number[]
  /** Position de chaque nœud dans l'ordre canonique (blocs, puis topologique à priorité). */
  rangCanonique: Int32Array
  deps: Dependance[]
  /** Dépendances entrantes (prémisses) et sortantes (utilisations), par nœud. */
  entrantes: number[][]
  sortantes: number[][]
  /** cible * n + source → indice de dépendance. */
  directe: Map<number, number>
  /** ancetres[c][s] = 1 si c dépend (transitivement) de s. */
  ancetres: Uint8Array[]
  liens: Lien[]
}

// ─── Construction ────────────────────────────────────────────────────────────

/** Tri topologique à priorité (Kahn) restreint à `ensemble`, arêtes = toutes les prémisses. */
function kahn(noeuds: NoeudR[], index: Map<string, number>, ensemble: number[], cle: (i: number) => number[]): number[] {
  const dans = new Set(ensemble)
  const degre = new Map<number, number>()
  const succ = new Map<number, number[]>()
  for (const c of ensemble) {
    const sources = new Set<number>()
    for (const d of noeuds[c]!.demonstrations) for (const p of d.premisses) {
      const s = index.get(p.id)
      if (s !== undefined && s !== c && dans.has(s)) sources.add(s)
    }
    degre.set(c, sources.size)
    for (const s of sources) {
      if (!succ.has(s)) succ.set(s, [])
      succ.get(s)!.push(c)
    }
  }
  const compare = (a: number, b: number) => {
    const ka = cle(a), kb = cle(b)
    for (let k = 0; k < ka.length; k++) if (ka[k] !== kb[k]) return ka[k]! - kb[k]!
    return a - b
  }
  const prets = ensemble.filter((i) => degre.get(i) === 0)
  const ordre: number[] = []
  while (prets.length) {
    prets.sort(compare)
    const u = prets.shift()!
    ordre.push(u)
    for (const v of succ.get(u) ?? []) {
      const d = degre.get(v)! - 1
      degre.set(v, d)
      if (d === 0) prets.push(v)
    }
  }
  // Par sécurité (cycle inattendu) : le reste à la suite, dans l'ordre des clés.
  if (ordre.length < ensemble.length) {
    const vus = new Set(ordre)
    ordre.push(...ensemble.filter((i) => !vus.has(i)).sort(compare))
  }
  return ordre
}

function nomCourt(nom: string, abandonne: boolean): string {
  if (abandonne) return 'Piste abandonnée'
  const i = nom.indexOf(' · ')
  if (i > 0) return nom.slice(0, i)
  return nom.split(' ')[0] ?? nom
}

/** Ordre canonique : blocs (sous-problèmes, piste abandonnée en dernier), topologique dans chaque bloc. */
function ordreCanonique(jeu: JeuRaisonnement, index: Map<string, number>, date: number[]): { blocs: Bloc[]; blocDe: number[] } {
  const noeuds = jeu.noeuds
  const sps = [...jeu.sousProblemes].sort((a, b) => Number(!!a.abandonne) - Number(!!b.abandonne))
  const connus = new Set(sps.map((s) => s.id))
  // Sous-problèmes inconnus (données réelles) : un bloc chacun, à la fin.
  for (const n of noeuds) if (!connus.has(n.sousProbleme)) {
    connus.add(n.sousProbleme)
    sps.push({ id: n.sousProbleme, nom: n.sousProbleme, resume: '' })
  }
  const blocDe = new Array<number>(noeuds.length).fill(0)
  const blocs: Bloc[] = sps.map((sp, b) => {
    const membres: number[] = []
    noeuds.forEach((n, i) => {
      if (n.sousProbleme === sp.id) {
        membres.push(i)
        blocDe[i] = b
      }
    })
    const ordre = kahn(noeuds, index, membres, (i) => [rangType(noeuds[i]!), date[i]!])
    return { id: sp.id, nom: sp.nom, court: nomCourt(sp.nom, !!sp.abandonne), abandonne: !!sp.abandonne, noeuds: ordre }
  }).filter((b) => b.noeuds.length > 0)
  blocs.forEach((b, k) => { for (const i of b.noeuds) blocDe[i] = k })
  return { blocs, blocDe }
}

export function construireModele(jeu: JeuRaisonnement, mode: ModeDemos = 'toutes'): Modele {
  const noeuds = jeu.noeuds
  const n = noeuds.length
  const index = new Map(noeuds.map((x, i) => [x.id, i]))
  const date = noeuds.map((x) => Date.parse(x.cree_le))
  const { blocs, blocDe } = ordreCanonique(jeu, index, date)
  const rangCanonique = new Int32Array(n)
  let k = 0
  for (const b of blocs) for (const i of b.noeuds) rangCanonique[i] = k++

  // Identifiants : numérotation par sigle dans l'ordre canonique (stable, indépendante du tri affiché).
  const ident = new Array<string>(n).fill('')
  const compteurs = new Map<string, number>()
  for (const b of blocs) for (const i of b.noeuds) {
    const sigle = SIGLES[noeuds[i]!.type]
    const c = (compteurs.get(sigle) ?? 0) + 1
    compteurs.set(sigle, c)
    ident[i] = sigle.length === 1 ? `${sigle}${c}` : `${sigle} ${c}`
  }

  // Dépendances : une par couple (conclusion, prémisse), avec le détail des citations.
  const deps: Dependance[] = []
  const entrantes: number[][] = noeuds.map(() => [])
  const sortantes: number[][] = noeuds.map(() => [])
  const directe = new Map<number, number>()
  noeuds.forEach((noeud, c) => {
    const princ = demonstrationPrincipale(noeud)
    const indexPrinc = princ ? noeud.demonstrations.indexOf(princ) : -1
    noeud.demonstrations.forEach((d, di) => {
      if (mode === 'principale' && di !== indexPrinc) return
      for (const p of d.premisses) {
        const s = index.get(p.id)
        if (s === undefined || s === c) continue
        const cle = c * n + s
        let dep = directe.has(cle) ? deps[directe.get(cle)!] : undefined
        if (!dep) {
          dep = {
            index: deps.length, source: s, cible: c, citations: [], principale: false, demo: di, role: p.role,
            validite: d.validite, retroOrdre: rangCanonique[s]! > rangCanonique[c]!, retroDate: date[s]! > date[c]!,
          }
          directe.set(cle, dep.index)
          deps.push(dep)
          entrantes[c]!.push(dep.index)
          sortantes[s]!.push(dep.index)
        }
        dep.citations.push({ demo: di, role: p.role })
      }
    })
  })
  // Démonstration représentée et rôle affiché.
  for (const dep of deps) {
    const noeud = noeuds[dep.cible]!
    const princ = demonstrationPrincipale(noeud)
    const indexPrinc = princ ? noeud.demonstrations.indexOf(princ) : -1
    const dansPrinc = dep.citations.find((c) => c.demo === indexPrinc)
    if (dansPrinc) {
      dep.principale = true
      dep.demo = indexPrinc
      dep.role = dansPrinc.role
    } else {
      const forte = dep.citations.reduce((a, b) => (FORCE_ROLE[b.role] > FORCE_ROLE[a.role] ? b : a))
      dep.demo = forte.demo
      dep.role = forte.role
    }
    dep.validite = noeud.demonstrations[dep.demo]!.validite
  }

  // Fermeture transitive (224 nœuds : un parcours par nœud suffit).
  const ancetres = noeuds.map((_, c) => {
    const vus = new Uint8Array(n)
    const pile = [c]
    while (pile.length) {
      const u = pile.pop()!
      for (const a of entrantes[u]!) {
        const s = deps[a]!.source
        if (!vus[s]) {
          vus[s] = 1
          pile.push(s)
        }
      }
    }
    return vus
  })

  const liens: Lien[] = []
  noeuds.forEach((noeud, s) => {
    for (const l of noeud.liens ?? []) {
      const c = index.get(l.cible)
      if (c !== undefined) liens.push({ index: liens.length, source: s, cible: c, genre: l.genre, note: l.note })
    }
  })

  return { jeu, noeuds, n, index, mode, ident, date, blocs, blocDe, rangCanonique, deps, entrantes, sortantes, directe, ancetres, liens }
}

// ─── Requêtes ────────────────────────────────────────────────────────────────

export const estRetro = (d: Dependance): boolean => d.retroOrdre || d.retroDate

/** Nœuds dont `c` dépend (transitivement). */
export function listeAncetres(m: Modele, c: number): number[] {
  const res: number[] = []
  const a = m.ancetres[c]!
  for (let s = 0; s < m.n; s++) if (a[s]) res.push(s)
  return res
}

/** Nœuds qui dépendent (transitivement) de `s` : la portée. */
export function listeDependants(m: Modele, s: number): number[] {
  const res: number[] = []
  for (let c = 0; c < m.n; c++) if (m.ancetres[c]![s]) res.push(c)
  return res
}

/** Plus court chemin de prémisses de `s` vers `c` (liste de nœuds, s en tête), ou null. */
export function cheminDe(m: Modele, s: number, c: number): number[] | null {
  const pred = new Int32Array(m.n).fill(-1)
  const vus = new Uint8Array(m.n)
  const file = [c]
  vus[c] = 1
  while (file.length) {
    const u = file.shift()!
    if (u === s) break
    for (const a of m.entrantes[u]!) {
      const v = m.deps[a]!.source
      if (!vus[v]) {
        vus[v] = 1
        pred[v] = u
        file.push(v)
      }
    }
  }
  if (!vus[s]) return null
  const chemin = [s]
  let u = s
  while (u !== c) {
    u = pred[u]!
    chemin.push(u)
  }
  return chemin
}

/** Ordre affiché : une liste de nœuds par bloc (ou une seule liste sans blocs). */
export function ordonner(m: Modele, tri: Tri, parBlocs: boolean): number[][] {
  const groupes = parBlocs ? m.blocs.map((b) => b.noeuds) : [m.blocs.flatMap((b) => b.noeuds)]
  return groupes.map((g) => {
    if (tri === 'date') return [...g].sort((a, b) => m.date[a]! - m.date[b]! || m.rangCanonique[a]! - m.rangCanonique[b]!)
    if (tri === 'confiance') return [...g].sort((a, b) => confianceDe(m.noeuds[a]!).estimation - confianceDe(m.noeuds[b]!).estimation || m.rangCanonique[a]! - m.rangCanonique[b]!)
    if (parBlocs) return g
    // Sans blocs : un seul tri topologique global, mêmes priorités.
    return kahn(m.noeuds, m.index, g, (i) => [rangType(m.noeuds[i]!), m.date[i]!])
  })
}

// ─── Grille affichée ─────────────────────────────────────────────────────────

export type Ligne =
  | { genre: 'noeud'; i: number; bloc: number }
  | { genre: 'alternative'; i: number; k: number; bloc: number }
  | { genre: 'bloc'; bloc: number }
export type Colonne = { genre: 'noeud'; i: number; bloc: number } | { genre: 'bloc'; bloc: number }

export interface Cellule {
  r: number
  c: number
  deps: number[]
  liens: number[]
  /** Dépendance indirecte seulement (bascule « transitif »). */
  transitif: boolean
  diagonale: boolean
  /** Au moins un axe est un bloc replié : la cellule compte des dépendances. */
  agregat: boolean
}

export interface Plage { bloc: number; debut: number; fin: number }

export interface OptionsGrille {
  tri: Tri
  parBlocs: boolean
  replies: Set<string>
  transitif: Transitif
  alternatives: boolean
}

export interface Grille {
  lignes: Ligne[]
  colonnes: Colonne[]
  /** Nœud → ligne (ou ligne du bloc replié). */
  ligneDe: Int32Array
  colonneDe: Int32Array
  /** Position du nœud dans l'ordre affiché (−1 s'il est replié). */
  position: Int32Array
  cellules: Map<number, Cellule>
  liste: Cellule[]
  plagesLignes: Plage[]
  plagesColonnes: Plage[]
  /** Marques au-dessus de la diagonale dans l'ordre affiché. */
  auDessus: number
}

const TYPES_FONDATION = new Set<TypeRaisonnement>(['hypothese', 'choix_modelisation', 'decision'])

export function construireGrille(m: Modele, o: OptionsGrille): Grille {
  const groupes = ordonner(m, o.tri, o.parBlocs)
  const lignes: Ligne[] = []
  const colonnes: Colonne[] = []
  const ligneDe = new Int32Array(m.n).fill(-1)
  const colonneDe = new Int32Array(m.n).fill(-1)
  const position = new Int32Array(m.n).fill(-1)
  const plagesLignes: Plage[] = []
  const plagesColonnes: Plage[] = []
  let pos = 0
  groupes.forEach((g, gi) => {
    const bloc = o.parBlocs ? gi : -1
    const replie = o.parBlocs && o.replies.has(m.blocs[gi]!.id)
    const l0 = lignes.length, c0 = colonnes.length
    if (replie) {
      for (const i of g) {
        ligneDe[i] = lignes.length
        colonneDe[i] = colonnes.length
      }
      lignes.push({ genre: 'bloc', bloc: gi })
      colonnes.push({ genre: 'bloc', bloc: gi })
    } else {
      for (const i of g) {
        position[i] = pos++
        ligneDe[i] = lignes.length
        colonneDe[i] = colonnes.length
        lignes.push({ genre: 'noeud', i, bloc })
        colonnes.push({ genre: 'noeud', i, bloc })
        const dec = m.noeuds[i]!.decision
        if (o.alternatives && dec) dec.alternatives.forEach((a, k) => { if (!a.retenue) lignes.push({ genre: 'alternative', i, k, bloc }) })
      }
    }
    if (o.parBlocs) {
      plagesLignes.push({ bloc: gi, debut: l0, fin: lignes.length })
      plagesColonnes.push({ bloc: gi, debut: c0, fin: colonnes.length })
    }
  })

  const nc = colonnes.length
  const cellules = new Map<number, Cellule>()
  const cellule = (r: number, c: number): Cellule => {
    const cle = r * nc + c
    let x = cellules.get(cle)
    if (!x) {
      x = { r, c, deps: [], liens: [], transitif: false, diagonale: false, agregat: lignes[r]!.genre === 'bloc' || colonnes[c]!.genre === 'bloc' }
      cellules.set(cle, x)
    }
    return x
  }
  for (let i = 0; i < m.n; i++) if (lignes[ligneDe[i]!]!.genre === 'noeud' && colonnes[colonneDe[i]!]!.genre === 'noeud') cellule(ligneDe[i]!, colonneDe[i]!).diagonale = true
  let auDessus = 0
  for (const d of m.deps) {
    cellule(ligneDe[d.cible]!, colonneDe[d.source]!).deps.push(d.index)
    if (position[d.source]! >= 0 && position[d.cible]! >= 0 && position[d.source]! > position[d.cible]!) auDessus++
  }
  for (const l of m.liens) cellule(ligneDe[l.source]!, colonneDe[l.cible]!).liens.push(l.index)
  if (o.transitif !== 'aucun') {
    for (let s = 0; s < m.n; s++) {
      if (o.transitif === 'fondations' && !TYPES_FONDATION.has(m.noeuds[s]!.type)) continue
      if (colonnes[colonneDe[s]!]!.genre !== 'noeud') continue
      for (let c = 0; c < m.n; c++) {
        if (!m.ancetres[c]![s] || m.directe.has(c * m.n + s)) continue
        if (lignes[ligneDe[c]!]!.genre !== 'noeud') continue
        cellule(ligneDe[c]!, colonneDe[s]!).transitif = true
      }
    }
  }
  return { lignes, colonnes, ligneDe, colonneDe, position, cellules, liste: [...cellules.values()], plagesLignes, plagesColonnes, auDessus }
}

// ─── Statistiques ────────────────────────────────────────────────────────────

export interface Statistiques {
  noeuds: number
  dependances: number
  parRole: Record<RolePremisse, number>
  horsPrincipale: number
  invalides: number
  aVerifier: number
  retroOrdre: number
  retroDate: number
  liens: number
  densite: number
}

export function statistiques(m: Modele): Statistiques {
  const parRole: Record<RolePremisse, number> = { principale: 0, auxiliaire: 0, technique: 0, contexte: 0 }
  let horsPrincipale = 0, invalides = 0, aVerifier = 0, retroOrdre = 0, retroDate = 0
  for (const d of m.deps) {
    parRole[d.role]++
    if (!d.principale) horsPrincipale++
    if (d.validite === 'invalide') invalides++
    if (d.validite === 'a_verifier') aVerifier++
    if (d.retroOrdre) retroOrdre++
    if (d.retroDate) retroDate++
  }
  return {
    noeuds: m.n, dependances: m.deps.length, parRole, horsPrincipale, invalides, aVerifier, retroOrdre, retroDate,
    liens: m.liens.length, densite: m.deps.length / Math.max(1, m.n * (m.n - 1)),
  }
}

export const libelleType = (t: TypeRaisonnement): string => LIBELLES_TYPE[t]
