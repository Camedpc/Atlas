// R30 · LaTeX · figure TikZ : dérivation du graphe de lecture reprise de R14 / R1 (squelette déductif).
//
// Quatre étapes, appliquées au travail de lecture partagé (src/raisonnement/lecture.ts) :
//
//   1. contexte   le contexte n'est jamais une flèche : définitions admises, axiomes, lemmes outils,
//                 résultats de la littérature, hypothèses générales et choix de modélisation
//                 deviennent du contexte rattaché (pastilles, drapeaux). Seules restent les prémisses
//                 principales (+ auxiliaires selon le niveau) entre énoncés « de travail ».
//   2. élagage    (niveau squelette) on ne garde que ce qui mène à un résultat majeur ou à une décision.
//   3. transitive réduction transitive (étape partagée).
//   4. repli      un sous-argument exclusif (tout ce dont l'unique usage est, directement ou non, un
//                 même énoncé C) est replié dans C : une « étape » qui se déplie au double-clic.
//                 C'est une fusion de chaînes généralisée aux arbres : chaînes et éventails fusionnent.
//
// Les nœuds « ancres » (décisions, choix, hypothèses, conjectures, théorèmes et résultats non admis)
// ne sont jamais repliés : ils portent le récit.

import {
  enregistrerStrategie, etapeReductionTransitive, FORCE_ROLE,
  type EtapeLecture, type GrapheJustification, type NoeudR, type StrategieLecture, type TravailLecture,
} from '../../src/raisonnement'

export type Niveau = 'squelette' | 'auxiliaires' | 'tout'

/** État partagé avec la vue : groupes dépliés par l'utilisatrice (ids des têtes d'étape). */
export const etatSquelette = {
  /** Têtes d'étape dépliées : elles ne replient plus leur sous-argument et restent visibles. */
  ouvertes: new Set<string>(),
  /** Pour chaque tête dépliée : les ids des nœuds qu'elle contenait (pour replier ensuite). */
  deplies: new Map<string, string[]>(),
}

// ─── Classification ──────────────────────────────────────────────────────────

/** Nature d'un nœud du point de vue du squelette. */
export type Nature = 'choix' | 'contexte' | 'travail'

const cacheNature = new WeakMap<GrapheJustification, Uint8Array>()

/**
 * Contexte : hypothèses, axiomes, définitions admises (sauf « objets centraux »), lemmes outils et
 * résultats de la littérature. Un objet central est une définition construite par une décision
 * (schéma corrigé) ou citée comme prémisse principale par au moins 6 énoncés (le schéma lui-même).
 */
export function natureDe(j: GrapheJustification, i: number): Nature {
  let c = cacheNature.get(j)
  if (!c) {
    c = new Uint8Array(j.noeuds.length)
    j.noeuds.forEach((n, k) => (c![k] = calculerNature(j, n, k)))
    cacheNature.set(j, c)
  }
  return c[i] === 0 ? 'choix' : c[i] === 1 ? 'contexte' : 'travail'
}

function calculerNature(j: GrapheJustification, n: NoeudR, i: number): number {
  if (n.type === 'choix_modelisation') return 0
  if (n.type === 'hypothese' || n.type === 'axiome') return 1
  if (n.admis && (n.type === 'lemme' || n.type === 'theoreme' || n.type === 'proposition' || n.type === 'resultat')) return 1
  if (n.admis && n.type === 'definition') {
    const construiteParDecision = j.entrantes[i]!.some((e) => {
      const a = j.aretes[e]!
      return a.role === 'principale' && j.noeuds[a.source]!.type === 'decision'
    })
    const usages = j.sortantes[i]!.filter((e) => j.aretes[e]!.role === 'principale').length
    return construiteParDecision || usages >= 6 ? 2 : 1
  }
  return 2
}

/**
 * Ancre : jamais repliée dans une étape. Dans une piste abandonnée, seules les décisions restent
 * des ancres : la piste entière se replie en une impasse.
 */
export function estAncre(n: NoeudR): boolean {
  if (n.piste === 'abandonnee') return n.type === 'decision' || n.type === 'choix_modelisation'
  return n.type === 'decision' || n.type === 'choix_modelisation' || n.type === 'hypothese' || n.type === 'conjecture' ||
    ((n.type === 'theoreme' || n.type === 'resultat') && !n.admis)
}

/** Résultat majeur : théorème ou résultat établi dans le projet (non admis). */
export function estMajeur(n: NoeudR): boolean {
  return (n.type === 'theoreme' || n.type === 'resultat') && !n.admis
}

// ─── Étapes ──────────────────────────────────────────────────────────────────

/** 1. Le contexte n'est jamais une flèche. */
const etapeContexte: EtapeLecture = (t, p) => {
  const retenus = new Set(p.rolesRetenus)
  const j = t.j
  let nb = 0
  for (const [k, a] of [...t.aretes]) {
    const garder: number[] = []
    for (const e of a.resume) {
      const ar = j.aretes[e]!
      if (retenus.has(ar.role) && natureDe(j, ar.source) === 'travail') garder.push(e)
      else {
        t.versContexte(e, a.cible)
        nb++
      }
    }
    if (garder.length) a.resume = garder
    else {
      for (const e of a.transitives) t.versContexte(e, a.cible)
      t.aretes.delete(k)
    }
  }
  // Nœuds de contexte devenus sans arête : retirés du graphe (ils vivent en pastilles).
  const { parents, enfants } = t.adjacence()
  let masques = 0
  for (let u = 0; u < t.unites.length; u++) {
    const un = t.unites[u]!
    if (!un.vivante || parents.has(u) || enfants.has(u)) continue
    const nature = natureDe(j, un.conclusion)
    if (nature === 'choix' || j.noeuds[un.conclusion]!.type === 'decision') continue
    if (nature === 'travail' && !j.noeuds[un.conclusion]!.admis) continue
    if (j.sortantes[un.conclusion]!.length === 0) continue
    un.vivante = false
    for (const m of un.membres) t.uniteDe[m] = -1
    masques++
  }
  t.journal.push(`Contexte : ${nb} prémisse(s) de contexte, d'outil ou de choix rattachée(s) en pastilles ; ${masques} nœud(s) de contexte retiré(s).`)
}

/** 2. Élagage : ne garder que ce qui mène à un résultat majeur ou à une décision. */
const etapeElagage: EtapeLecture = (t) => {
  const j = t.j
  const { parents } = t.adjacence()
  const garde = new Uint8Array(t.unites.length)
  const pile: number[] = []
  t.unites.forEach((u, k) => {
    if (!u.vivante) return
    const n = j.noeuds[u.conclusion]!
    if (estMajeur(n) || n.type === 'decision' || n.type === 'choix_modelisation') {
      garde[k] = 1
      pile.push(k)
    }
  })
  while (pile.length) {
    const u = pile.pop()!
    for (const s of parents.get(u) ?? []) if (!garde[s]) {
      garde[s] = 1
      pile.push(s)
    }
  }
  let retires = 0
  t.unites.forEach((u, k) => {
    if (!u.vivante || garde[k]) return
    u.vivante = false
    for (const m of u.membres) t.uniteDe[m] = -1
    retires++
  })
  for (const [k, a] of [...t.aretes]) {
    if (garde[a.source] && garde[a.cible]) continue
    for (const e of [...a.resume, ...a.transitives]) t.versContexte(e, garde[a.cible] ? a.cible : -1)
    t.aretes.delete(k)
  }
  t.journal.push(`Élagage : ${retires} énoncé(s) hors du chemin des résultats majeurs mis de côté (visibles au niveau « + auxiliaires »).`)
}

/** Ordre topologique des unités vivantes (Kahn). */
function ordreTopologique(t: TravailLecture, enfants: Map<number, number[]>): number[] {
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
  return ordre
}

/** 4. Repli des sous-arguments exclusifs. */
const etapeRepli: EtapeLecture = (t) => {
  const j = t.j
  const { parents, enfants } = t.adjacence()
  const ordre = ordreTopologique(t, enfants)
  const rangTopo = new Int32Array(t.unites.length).fill(-1)
  ordre.forEach((u, k) => (rangTopo[u] = k))
  const noeudDe = (u: number) => j.noeuds[t.unites[u]!.conclusion]!
  const ouverte = (u: number) => etatSquelette.ouvertes.has(noeudDe(u).id)
  const repliable = (u: number) => t.unites[u]!.vivante && !estAncre(noeudDe(u)) && !ouverte(u)
  const pris = new Uint8Array(t.unites.length)
  const groupes: number[][] = []
  // Des puits vers les sources : la tête la plus en aval absorbe le plus grand sous-argument.
  for (let k = ordre.length - 1; k >= 0; k--) {
    const c = ordre[k]!
    if (pris[c] || !repliable(c)) continue
    const piste = noeudDe(c).piste
    const g = new Set([c])
    let change = true
    while (change) {
      change = false
      for (const v of [...g]) for (const u of parents.get(v) ?? []) {
        if (g.has(u) || pris[u] || !repliable(u) || noeudDe(u).piste !== piste) continue
        if ((enfants.get(u) ?? []).every((w) => g.has(w))) {
          g.add(u)
          change = true
        }
      }
    }
    for (const u of g) pris[u] = 1
    if (g.size >= 2) groupes.push([...g].sort((a, b) => rangTopo[a]! - rangTopo[b]!))
  }
  let noeuds = 0
  for (const g of groupes) {
    replier(t, g)
    noeuds += g.length
  }
  t.journal.push(`Repli : ${groupes.length} sous-argument(s) exclusif(s) replié(s) en étapes (${noeuds} unités absorbées).`)
}

/** Replie un groupe (ordre topologique, tête en dernier) dans sa tête. */
function replier(t: TravailLecture, groupe: number[]): void {
  const c = groupe[groupe.length - 1]!
  const cible = t.unites[c]!
  const dans = new Set(groupe)
  const membres: number[] = []
  const internes: number[] = []
  for (const u of groupe) {
    const un = t.unites[u]!
    membres.push(...un.membres)
    internes.push(...un.aretesInternes)
    if (u === c) continue
    for (const [k, ctx] of un.contexte) {
      const ex = cible.contexte.get(k)
      if (!ex || FORCE_ROLE[ctx.role] > FORCE_ROLE[ex.role]) cible.contexte.set(k, ctx)
    }
    un.vivante = false
  }
  for (const [k, a] of [...t.aretes]) {
    const s = dans.has(a.source), d = dans.has(a.cible)
    if (s && d) {
      internes.push(...a.resume, ...a.transitives)
      t.aretes.delete(k)
    } else if (d && a.cible !== c) {
      t.aretes.delete(k)
      const k2 = t.cle(a.source, c)
      const ex = t.aretes.get(k2)
      if (ex) {
        ex.resume.push(...a.resume)
        ex.transitives.push(...a.transitives)
      } else t.aretes.set(k2, { source: a.source, cible: c, resume: a.resume, transitives: a.transitives })
    }
  }
  cible.membres = membres
  cible.aretesInternes = internes
  for (const m of membres) t.uniteDe[m] = c
}

// ─── Stratégies ──────────────────────────────────────────────────────────────

export const STRATEGIE_NIVEAU: Record<Niveau, string> = {
  squelette: 'r30-squelette',
  auxiliaires: 'r30-auxiliaires',
  tout: 'r30-tout',
}

export const NIVEAUX: { id: Niveau; nom: string }[] = [
  { id: 'squelette', nom: 'Squelette' },
  { id: 'auxiliaires', nom: '+ auxiliaires' },
  { id: 'tout', nom: 'Tout' },
]

const strategies: StrategieLecture[] = [
  {
    id: STRATEGIE_NIVEAU.squelette,
    nom: 'R30 · Squelette déductif',
    description: 'Prémisses principales seulement, contexte en pastilles, élagage vers les résultats majeurs, réduction transitive, sous-arguments repliés en étapes.',
    etapes: [etapeContexte, etapeElagage, etapeReductionTransitive, etapeRepli],
    parametres: { rolesRetenus: ['principale'] },
  },
  {
    id: STRATEGIE_NIVEAU.auxiliaires,
    nom: 'R30 · + auxiliaires',
    description: 'Prémisses principales et auxiliaires, sans élagage (branches annexes visibles), sous-arguments repliés.',
    etapes: [etapeContexte, etapeReductionTransitive, etapeRepli],
    parametres: { rolesRetenus: ['principale', 'auxiliaire'] },
  },
  {
    id: STRATEGIE_NIVEAU.tout,
    nom: 'R30 · Tout (sans repli)',
    description: 'Prémisses principales et auxiliaires, réduction transitive, aucun repli : chaque énoncé est une carte. Le contexte reste en pastilles.',
    etapes: [etapeContexte, etapeReductionTransitive],
    parametres: { rolesRetenus: ['principale', 'auxiliaire'] },
  },
]
for (const s of strategies) enregistrerStrategie(s)

export function niveauDeStrategie(id: string): Niveau | null {
  for (const n of NIVEAUX) if (STRATEGIE_NIVEAU[n.id] === id) return n.id
  return null
}
