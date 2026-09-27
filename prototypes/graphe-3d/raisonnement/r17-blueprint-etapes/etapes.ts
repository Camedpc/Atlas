// R17 · Blocs de raisonnement : les boîtes « Comment » façon Blueprint ne suivent pas les sous-problèmes
// déclarés, elles sont CALCULÉES depuis le graphe de lecture. Aucune règle ne connaît un jeu particulier :
// seuls comptent le type des nœuds, la piste (active / abandonnée), les liaisons et les rangs logiques.
//
// 1. Phase de chaque unité (d'après son type et ses voisins) :
//      modèle      choix de modélisation, hypothèses, décisions qui fixent un choix, marge des spécifications
//      décision    décision qui ne fixe pas de choix et ne mène pas à des mesures
//      lemme       lemme, assertion (énoncés intermédiaires)
//      énoncé      proposition, théorème, conjecture
//      mesure      expérience, observation, calcul, décision qui ne mène qu'à des mesures
//      résultat    résultat
//      abandon     tout nœud d'une piste abandonnée (prime sur le type)
// 2. Union : deux unités de même phase sont dans le même bloc si
//      (a) une liaison les relie avec un écart de rang ≤ 1 (une chaîne contiguë), ou
//      (b) elles sont au même rang et ont un enfant commun (prémisses parallèles d'une même conclusion), ou
//      (c) elles sont au même rang et ont un parent commun (conséquences parallèles).
// 3. Rattachements :
//      - un bloc fait uniquement de résultats conclut l'étape qui lui fournit le plus de prémisses ;
//      - une unité isolée (bloc d'un seul nœud, hors piste abandonnée, hors décision et choix) rejoint le bloc voisin avec lequel elle
//        partage le plus de liaisons d'écart ≤ 2 (à égalité : celui d'où elle découle).
//    Les blocs d'un seul nœud restants ne sont pas encadrés.
// 4. Genre et titre, d'après la phase dominante du bloc (à égalité, celle de sa tête) : modèle → décision
//    (s'il contient une décision) ou modélisation ; mesure → confrontation (s'il contient une expérience ou
//    une observation) ou calcul ; énoncé → prédictions (un énoncé est ensuite confronté à des mesures) ou
//    conséquences ; lemme → dérivation (lemmes enchaînés) ou conditions (lemmes parallèles) ; résultat →
//    conclusion ; abandon → piste abandonnée. Le sous-titre est le nom de la « tête » :
//    le membre majeur (théorème, résultat) d'abord, puis celui qui a le plus de liaisons sortant du bloc,
//    puis le plus de liaisons internes entrantes, puis le rang le plus élevé.

import type { GrapheLecture, NoeudR, TypeRaisonnement } from '../../src/raisonnement'

export type Phase = 'modele' | 'decision' | 'lemme' | 'enonce' | 'mesure' | 'resultat' | 'abandon'

export type GenreEtape =
  | 'modele' | 'modelisation' | 'decision' | 'derivation' | 'conditions' | 'prediction' | 'consequence'
  | 'confrontation' | 'calcul' | 'conclusion' | 'abandon'

export const LIBELLES_ETAPE: Record<GenreEtape, string> = {
  modele: 'Modèle',
  modelisation: 'Modélisation',
  decision: 'Décision',
  derivation: 'Dérivation',
  conditions: 'Conditions',
  prediction: 'Prédictions',
  consequence: 'Conséquences',
  confrontation: 'Confrontation',
  calcul: 'Calcul',
  conclusion: 'Conclusion',
  abandon: 'Piste abandonnée',
}

export interface Etape {
  index: number
  /** Repère « É1 », numéroté de gauche à droite puis de haut en bas. */
  ref: string
  genre: GenreEtape
  titre: string
  sousTitre: string
  /** Unités (points) du bloc. */
  membres: number[]
  /** Unité de tête (donne le sous-titre). */
  tete: number
  /** Bloc encadré (au moins deux unités, ou une piste abandonnée). */
  encadre: boolean
  /** Bloc de la marge des spécifications. */
  marge: boolean
  /** Rangs extrêmes (−1 : marge). */
  r0: number
  r1: number
}

export interface Regroupement {
  etapes: Etape[]
  /** Unité → index d'étape (toutes les unités en ont une ; les isolées forment une étape non encadrée). */
  etapeDe: Int32Array
  phase: Phase[]
}

// ─── Familles (couleur des en-têtes et des broches) ──────────────────────────

export type Famille = 'modele' | 'decision' | 'deduction' | 'enonce' | 'empirique' | 'calcul' | 'resultat'

export const LIBELLES_FAMILLE: Record<Famille, string> = {
  modele: 'Modèle (hypothèse, définition, choix)',
  decision: 'Décision',
  deduction: 'Lemme, assertion',
  enonce: 'Proposition, théorème, conjecture',
  empirique: 'Expérience, observation',
  calcul: 'Calcul',
  resultat: 'Résultat',
}

export function familleDe(type: TypeRaisonnement): Famille {
  switch (type) {
    case 'hypothese': case 'axiome': case 'definition': case 'choix_modelisation': return 'modele'
    case 'decision': return 'decision'
    case 'lemme': case 'assertion': return 'deduction'
    case 'proposition': case 'theoreme': case 'conjecture': return 'enonce'
    case 'experience': case 'observation': return 'empirique'
    case 'calcul': return 'calcul'
    case 'resultat': return 'resultat'
  }
}

// ─── Calcul ──────────────────────────────────────────────────────────────────

const EMPIRIQUES = new Set<TypeRaisonnement>(['experience', 'observation', 'calcul'])

export interface EntreeRegroupement {
  g: GrapheLecture
  nU: number
  noeudDe: (u: number) => NoeudR
  parents: number[][]
  enfants: number[][]
  rang: ArrayLike<number>
  marge: ArrayLike<number>
}

export function regrouper(e: EntreeRegroupement): Regroupement {
  const { nU, noeudDe, parents, enfants, rang, marge } = e
  const type = (u: number) => noeudDe(u).type

  // 1. Phases.
  const phase: Phase[] = []
  for (let u = 0; u < nU; u++) {
    const n = noeudDe(u)
    let ph: Phase
    if (n.piste === 'abandonnee') ph = 'abandon'
    else if (marge[u]) ph = 'modele'
    else switch (n.type) {
      case 'hypothese': case 'axiome': case 'definition': case 'choix_modelisation': ph = 'modele'; break
      case 'decision': {
        const ef = enfants[u]!
        if (ef.some((v) => type(v) === 'choix_modelisation')) ph = 'modele'
        else if (ef.length && ef.every((v) => EMPIRIQUES.has(type(v)))) ph = 'mesure'
        else ph = 'decision'
        break
      }
      case 'lemme': case 'assertion': ph = 'lemme'; break
      case 'proposition': case 'theoreme': case 'conjecture': ph = 'enonce'; break
      case 'experience': case 'observation': case 'calcul': ph = 'mesure'; break
      default: ph = 'resultat'
    }
    phase.push(ph)
  }

  // 2. Union-find.
  const pere = Int32Array.from({ length: nU }, (_, k) => k)
  const trouver = (x: number): number => {
    while (pere[x] !== x) x = pere[x] = pere[pere[x]!]!
    return x
  }
  const unir = (a: number, b: number) => {
    const ra = trouver(a), rb = trouver(b)
    if (ra !== rb) pere[Math.max(ra, rb)] = Math.min(ra, rb)
  }
  // La marge des spécifications forme un seul bloc « Modèle ».
  let premierMarge = -1
  for (let u = 0; u < nU; u++) if (marge[u]) {
    if (premierMarge < 0) premierMarge = u
    else unir(premierMarge, u)
  }
  for (let u = 0; u < nU; u++) {
    if (marge[u]) continue
    for (const v of enfants[u]!) {
      if (marge[v] || phase[v] !== phase[u]) continue
      if (Math.abs(rang[v]! - rang[u]!) <= 1) unir(u, v)
    }
  }
  const parRang = (voisins: number[][]) => {
    for (let c = 0; c < nU; c++) {
      const vs = voisins[c]!.filter((u) => !marge[u])
      for (let i = 0; i < vs.length; i++) for (let k = i + 1; k < vs.length; k++) {
        const a = vs[i]!, b = vs[k]!
        if (phase[a] === phase[b] && rang[a] === rang[b]) unir(a, b)
      }
    }
  }
  parRang(parents) // (b) enfant commun : les parents de c, deux à deux
  parRang(enfants) // (c) parent commun

  // Blocs courants.
  const blocs = () => {
    const m = new Map<number, number[]>()
    for (let u = 0; u < nU; u++) {
      const r = trouver(u)
      let l = m.get(r)
      if (!l) m.set(r, (l = []))
      l.push(u)
    }
    return m
  }
  const liaisonsVers = (membres: number[], ecartMax: number, cotes: 'deux' | 'parents' = 'deux') => {
    const dans = new Set(membres)
    const compte = new Map<number, { n: number; parent: number; rangMax: number }>()
    for (const u of membres) {
      const voisins: [number, boolean][] = [...parents[u]!.map((v) => [v, true] as [number, boolean])]
      if (cotes === 'deux') voisins.push(...enfants[u]!.map((v) => [v, false] as [number, boolean]))
      for (const [v, estParent] of voisins) {
        if (dans.has(v) || marge[v] || phase[v] === 'abandon') continue
        if (Math.abs(rang[v]! - rang[u]!) > ecartMax) continue
        const r = trouver(v)
        const c = compte.get(r) ?? { n: 0, parent: 0, rangMax: -1 }
        c.n++
        if (estParent) c.parent++
        c.rangMax = Math.max(c.rangMax, rang[v]!)
        compte.set(r, c)
      }
    }
    return compte
  }

  // 3a. Blocs de résultats : rattachés à l'étape qui fournit le plus de prémisses.
  {
    const bs = [...blocs().values()].filter((l) => l.every((u) => phase[u] === 'resultat' && !marge[u]))
    // Du plus en amont au plus en aval : un résultat qui en conclut un autre suit son rattachement.
    bs.sort((a, b) => Math.min(...a.map((u) => rang[u]!)) - Math.min(...b.map((u) => rang[u]!)))
    for (const l of bs) {
      const c = liaisonsVers(l, Infinity, 'parents')
      let meilleur = -1, score: [number, number, number] = [-1, -1, -1]
      const tailles = blocs()
      for (const [r, v] of c) {
        const s: [number, number, number] = [v.n, v.rangMax, tailles.get(r)?.length ?? 0]
        if (s[0] > score[0] || (s[0] === score[0] && (s[1] > score[1] || (s[1] === score[1] && s[2] > score[2])))) {
          score = s
          meilleur = r
        }
      }
      if (meilleur >= 0) unir(l[0]!, meilleur)
    }
  }

  // 3b. Unités isolées : rattachées au voisin le plus lié (écart de rang ≤ 2 ; à égalité, côté parent).
  for (let passe = 0; passe < 2; passe++) {
    const tailles = blocs()
    for (const [, l] of tailles) {
      if (l.length !== 1) continue
      const u = l[0]!
      // Une décision ou un choix isolé reste hors cadre : c'est un embranchement entre deux blocs.
      if (marge[u] || phase[u] === 'abandon' || type(u) === 'decision' || type(u) === 'choix_modelisation') continue
      const c = liaisonsVers(l, 2)
      let meilleur = -1, score: [number, number, number] = [0, -1, -1]
      for (const [r, v] of c) {
        const s: [number, number, number] = [v.n, v.parent, tailles.get(r)?.length ?? 0]
        if (s[0] > score[0] || (s[0] === score[0] && (s[1] > score[1] || (s[1] === score[1] && s[2] > score[2])))) {
          score = s
          meilleur = r
        }
      }
      if (meilleur >= 0) unir(u, meilleur)
    }
  }

  // 4. Étapes, genres, titres.
  const listes = [...blocs().values()]
  const etapeDe = new Int32Array(nU).fill(-1)
  const etapes: Etape[] = listes.map((membres, index) => {
    for (const u of membres) etapeDe[u] = index
    const estMarge = membres.every((u) => marge[u])
    const genre = genreDe(membres, estMarge)
    const tete = teteDe(membres)
    const r0 = estMarge ? -1 : Math.min(...membres.map((u) => rang[u]!))
    const r1 = estMarge ? -1 : Math.max(...membres.map((u) => rang[u]!))
    return {
      index, ref: '', genre, titre: LIBELLES_ETAPE[genre], sousTitre: '', membres, tete,
      encadre: membres.length >= 2 || genre === 'abandon' || estMarge, marge: estMarge, r0, r1,
    }
  })
  for (const et of etapes) et.sousTitre = sousTitreDe(et)
  return { etapes, etapeDe, phase }

  function genreDe(membres: number[], estMarge: boolean): GenreEtape {
    if (estMarge) return 'modele'
    const types = new Set(membres.map(type))
    // Phase dominante (à égalité : celle de la tête).
    const tete = teteDe(membres)
    const compte = new Map<Phase, number>()
    for (const u of membres) compte.set(phase[u]!, (compte.get(phase[u]!) ?? 0) + 1)
    let dominante = phase[tete]!
    for (const [ph, n] of compte) if (n > compte.get(dominante)!) dominante = ph
    const dans = new Set(membres)
    switch (dominante) {
      case 'abandon': return 'abandon'
      case 'modele': return types.has('decision') ? 'decision' : 'modelisation'
      case 'decision': return 'decision'
      case 'mesure': return types.has('experience') || types.has('observation') ? 'confrontation' : 'calcul'
      case 'resultat': return 'conclusion'
      case 'enonce': {
        // Prédictions : un énoncé du bloc est ensuite confronté à des mesures.
        const confronte = membres.some((u) => enfants[u]!.some((v) => !dans.has(v) && descendAvecMesures(v)))
        return confronte ? 'prediction' : 'consequence'
      }
      default: return membres.some((u) => enfants[u]!.some((v) => dans.has(v))) ? 'derivation' : 'conditions'
    }
  }

  /** Vrai si v, ou un de ses parents, est une mesure (expérience, observation). */
  function descendAvecMesures(v: number): boolean {
    if (type(v) === 'experience' || type(v) === 'observation') return true
    return parents[v]!.some((w) => type(w) === 'experience' || type(w) === 'observation')
  }

  function teteDe(membres: number[]): number {
    const dans = new Set(membres)
    let meilleure = membres[0]!
    let score = [-1, -1, -1, -1]
    for (const u of membres) {
      const n = noeudDe(u)
      const majeur = (n.type === 'theoreme' || n.type === 'resultat') && !n.admis ? 1 : 0
      const sortantes = enfants[u]!.filter((v) => !dans.has(v)).length
      const internes = parents[u]!.filter((v) => dans.has(v)).length
      const s = [majeur, sortantes, internes, rang[u]!]
      let mieux = false
      for (let k = 0; k < s.length; k++) {
        if (s[k]! > score[k]!) { mieux = true; break }
        if (s[k]! < score[k]!) break
      }
      if (mieux) {
        score = s
        meilleure = u
      }
    }
    return meilleure
  }

  function sousTitreDe(et: Etape): string {
    if (et.genre === 'modele') {
      const k = et.membres.filter((u) => type(u) === 'choix_modelisation').length
      const d = et.membres.length - k
      return `${k} hypothèse${k > 1 ? 's' : ''} de travail${d ? ` · ${d} décision${d > 1 ? 's' : ''}` : ''}`
    }
    if (et.genre === 'decision' || et.genre === 'modelisation') {
      const d = et.membres.find((u) => type(u) === 'decision') ?? et.membres.find((u) => type(u) === 'choix_modelisation')
      return noeudDe(d ?? et.tete).nom
    }
    if (et.genre === 'conditions') {
      const dans = new Set(et.membres)
      const cibles = [...new Set(et.membres.flatMap((u) => enfants[u]!.filter((v) => !dans.has(v))))]
      cibles.sort((a, b) => rang[a]! - rang[b]!)
      const noms = cibles.slice(0, 2).map((v) => noeudDe(v).nom)
      return noms.length ? `→ ${noms.join(' · ')}${cibles.length > 2 ? ' …' : ''}` : noeudDe(et.tete).nom
    }
    return noeudDe(et.tete).nom
  }
}
