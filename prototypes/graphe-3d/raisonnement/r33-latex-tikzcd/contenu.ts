// R33 · Ce que dit chaque élément du diagramme : formule des nœuds, style et étiquettes des flèches,
// repères des prémisses citées (légende « où : »). Fonctions pures du graphe de lecture.
//
// Règles (génériques, sans identifiant de jeu) :
//   - Flèche = démonstration de la cible (celle qui cite la source ; la principale à défaut).
//     Style : ↛ barrée si la démonstration est invalide ou la cible réfutée ; ⇢ pointillée si elle est
//     à vérifier ; ⇒ double si elle est valide et conclut un théorème, un résultat ou une proposition
//     (implication forte) ; → sinon.
//   - Une seule flèche entrante par cible porte les étiquettes : celle qui vient de la prémisse la plus
//     proche (rang de lecture le plus élevé). Au-dessus, le nom de l'argument : le nom de la démonstration
//     s'il est spécifique (pas « Démonstration », « Preuve », « Variante n »), sinon les prémisses
//     techniques (outils) qu'elle invoque. Au-dessous, les repères des autres prémisses non tracées
//     (auxiliaires, contexte : H1, D2…), y compris celles des membres d'un argument replié.
//   - Flèche issue d'une décision : branche retenue, étiquetée par l'alternative retenue.
//   - Racine qui a des prémisses (toutes non tracées) : talon d'entrée « H1, D2 → nœud ».
//   - Repères : lettre par type (M choix de modélisation, H hypothèse, A axiome, D définition, L lemme ou
//     résultat, E expérience / observation / calcul, P autre), numérotés dans l'ordre de la légende.

import {
  demonstrationPrincipale, type DemonstrationR, type GrapheLecture, type NoeudR, type Premisse,
} from '../../src/raisonnement'
import { formuleDuNoeud } from './formules'

export type StyleFleche = 'simple' | 'double' | 'pointillee' | 'barree'

export interface EtiquettesArete {
  style: StyleFleche
  /** Démonstration représentée et nœud de justification qu'elle conclut. */
  demo: DemonstrationR | null
  noeud: number
  /** Porte les étiquettes de sa cible. */
  principale: boolean
  /** Issue d'une décision (branche retenue). */
  branche: boolean
  dessus: string | null
  /** Repères des prémisses non tracées (nœuds de justification). */
  dessous: number[]
}

export interface Talon {
  demo: DemonstrationR
  dessus: string | null
  dessous: number[]
}

export interface Contenu {
  /** Formule LaTeX par unité (null : nom en romain). */
  formules: (string | null)[]
  aretes: EtiquettesArete[]
  /** Racines avec prémisses citées : talon d'entrée. */
  talons: Map<number, Talon>
  /** Repère par nœud de justification cité (« H1 »). */
  reperes: Map<number, string>
  /** Nœuds de la légende, dans l'ordre. */
  legende: number[]
  /** Nœud cité → arêtes de lecture (et talons, en −1 − unité) qui le citent. */
  citations: Map<number, number[]>
  /** Alternatives rejetées par unité de décision. */
  rejetees: Map<number, string[]>
  /** Rang de lecture (plus long chemin). */
  rang: Int32Array
}

const GENERIQUE = /^(démonstration|preuve|variante(\s*\d+)?)$/i
const ORDRE_LETTRES = ['M', 'H', 'A', 'D', 'L', 'E', 'P']

export function lettreRepere(n: NoeudR): string {
  switch (n.type) {
    case 'choix_modelisation': return 'M'
    case 'hypothese': return 'H'
    case 'axiome': return 'A'
    case 'definition': return 'D'
    case 'lemme': case 'proposition': case 'theoreme': case 'resultat': case 'assertion': return 'L'
    case 'experience': case 'observation': case 'calcul': return 'E'
    default: return 'P'
  }
}

/** Démonstration de `n` qui porte le nom donné, sinon sa démonstration principale. */
export function demonstrationNommee(n: NoeudR, nom: string | undefined): DemonstrationR | null {
  return (nom ? n.demonstrations.find((d) => d.nom === nom) : undefined) ?? demonstrationPrincipale(n) ?? null
}

export function styleDe(demo: DemonstrationR | null, cible: NoeudR): StyleFleche {
  if (demo?.validite === 'invalide' || cible.statut === 'refute') return 'barree'
  if (demo?.validite === 'a_verifier') return 'pointillee'
  if (cible.type === 'theoreme' || cible.type === 'resultat' || cible.type === 'proposition') return 'double'
  return 'simple'
}

/** Nom d'argument (règle en tête) et prémisses techniques qu'il absorbe. */
function argument(demo: DemonstrationR, j: GrapheLecture['justification']): { nom: string | null; absorbees: Set<string> } {
  if (demo.nom && !GENERIQUE.test(demo.nom.trim())) return { nom: demo.nom, absorbees: new Set() }
  const tech = demo.premisses.filter((p) => p.role === 'technique')
  if (!tech.length) return { nom: null, absorbees: new Set() }
  const noms = tech.map((p) => j.noeuds[j.index.get(p.id) ?? -1]?.nom ?? p.id)
  return { nom: `par ${noms.join(' et ')}`, absorbees: new Set(tech.map((p) => p.id)) }
}

export function construireContenu(g: GrapheLecture): Contenu {
  const j = g.justification
  const nU = g.unites.length
  const formules = g.unites.map((u) => formuleDuNoeud(j.noeuds[u.conclusion]!))

  // Rang de lecture (plus long chemin depuis les racines).
  const rang = new Int32Array(nU).fill(-1)
  const calcul = (u: number, pile: Set<number>): number => {
    if (rang[u]! >= 0) return rang[u]!
    if (pile.has(u)) return 0
    pile.add(u)
    let r = 0
    for (const e of g.entrantes[u]!) r = Math.max(r, calcul(g.aretes[e]!.source, pile) + 1)
    pile.delete(u)
    rang[u] = r
    return r
  }
  for (let u = 0; u < nU; u++) calcul(u, new Set())

  // Arête principale par cible : source de rang maximal.
  const principale = new Int32Array(nU).fill(-1)
  for (let u = 0; u < nU; u++) {
    let meilleure = -1
    for (const e of g.entrantes[u]!) {
      if (meilleure < 0 || rang[g.aretes[e]!.source]! > rang[g.aretes[meilleure]!.source]!) meilleure = e
    }
    principale[u] = meilleure
  }

  // Nœuds de justification tracés en flèche vers chaque unité (ou membres de l'unité).
  const traces = (u: number): Set<string> => {
    const s = new Set<string>()
    for (const m of g.unites[u]!.membres) s.add(j.noeuds[m]!.id)
    for (const e of g.entrantes[u]!) {
      const a = g.aretes[e]!
      for (const x of [...a.resume, ...a.transitives]) s.add(j.noeuds[j.aretes[x]!.source]!.id)
      for (const m of g.unites[a.source]!.membres) s.add(j.noeuds[m]!.id)
    }
    return s
  }

  // Prémisses d'une unité : la démonstration représentée, plus celles des membres d'un argument replié
  // (leurs prémisses externes font partie de l'argument ; les prémisses internes sont exclues par `traces`).
  const premissesUnite = (u: number, demo: DemonstrationR): Premisse[] => {
    const r = [...demo.premisses]
    const un = g.unites[u]!
    for (const m of un.membres) {
      if (m === un.conclusion) continue
      const d = demonstrationPrincipale(j.noeuds[m]!)
      if (d) r.push(...d.premisses)
    }
    return r
  }

  const cites = new Set<number>()
  const citations = new Map<number, number[]>()
  const citer = (ids: Premisse[], exclus: Set<string>, cle: number): number[] => {
    const r: number[] = []
    for (const p of ids) {
      if (exclus.has(p.id)) continue
      const i = j.index.get(p.id)
      if (i === undefined || r.includes(i)) continue
      r.push(i)
      cites.add(i)
      let l = citations.get(i)
      if (!l) citations.set(i, (l = []))
      l.push(cle)
    }
    return r
  }

  const aretes: EtiquettesArete[] = g.aretes.map((a) => {
    const e0 = a.resume[0] ?? a.transitives[0]
    const ar = e0 !== undefined ? j.aretes[e0]! : undefined
    const noeud = ar ? ar.cible : g.unites[a.cible]!.conclusion
    const n = j.noeuds[noeud]!
    const demo = demonstrationNommee(n, ar?.demonstrations[0])
    const source = j.noeuds[g.unites[a.source]!.conclusion]!
    const branche = source.type === 'decision'
    const estPrincipale = principale[a.cible] === a.index
    let dessus: string | null = null
    let dessous: number[] = []
    if (branche) dessus = source.decision?.alternatives.find((x) => x.retenue)?.libelle ?? null
    if (estPrincipale && demo) {
      const arg = argument(demo, j)
      if (!branche) dessus = arg.nom
      const exclus = traces(a.cible)
      for (const id of arg.absorbees) exclus.add(id)
      dessous = citer(premissesUnite(a.cible, demo), exclus, a.index)
    }
    return { style: styleDe(demo, n), demo, noeud, principale: estPrincipale, branche, dessus, dessous }
  })

  // Talons des racines.
  const talons = new Map<number, Talon>()
  for (let u = 0; u < nU; u++) {
    if (g.entrantes[u]!.length) continue
    const n = j.noeuds[g.unites[u]!.conclusion]!
    // Choix de modélisation isolé : il est lui-même une entrée de la légende, sans talon.
    if (n.type === 'choix_modelisation' && !g.sortantes[u]!.length) continue
    const demo = demonstrationPrincipale(n)
    if (!demo || !demo.premisses.length) continue
    const arg = argument(demo, j)
    const exclus = traces(u)
    for (const id of arg.absorbees) exclus.add(id)
    const dessous = citer(premissesUnite(u, demo), exclus, -1 - u)
    if (dessous.length) talons.set(u, { demo, dessus: arg.nom, dessous })
  }

  // Choix de modélisation présents : toujours en légende (ce sont des hypothèses de travail).
  for (let u = 0; u < nU; u++) {
    const i = g.unites[u]!.conclusion
    if (j.noeuds[i]!.type === 'choix_modelisation' && !g.entrantes[u]!.length) cites.add(i)
  }

  // Légende ordonnée par lettre puis par ordre du jeu ; repères numérotés dans cet ordre.
  const legende = [...cites].sort((a, b) =>
    ORDRE_LETTRES.indexOf(lettreRepere(j.noeuds[a]!)) - ORDRE_LETTRES.indexOf(lettreRepere(j.noeuds[b]!)) || a - b)
  const reperes = new Map<number, string>()
  const compteurs = new Map<string, number>()
  for (const i of legende) {
    const l = lettreRepere(j.noeuds[i]!)
    const k = (compteurs.get(l) ?? 0) + 1
    compteurs.set(l, k)
    reperes.set(i, `${l}${k}`)
  }

  const rejetees = new Map<number, string[]>()
  for (let u = 0; u < nU; u++) {
    const n = j.noeuds[g.unites[u]!.conclusion]!
    const alt = n.decision?.alternatives.filter((a) => !a.retenue).map((a) => a.libelle) ?? []
    if (alt.length) rejetees.set(u, alt)
  }

  return { formules, aretes, talons, reperes, legende, citations, rejetees, rang }
}
