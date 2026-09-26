// R5 · Carte d'arguments : dérivation du graphe de lecture en « arguments » (Toulmin + IBIS).
//
// Chaque nœud de justification reçoit un rôle argumentatif :
//   carte     conclusion d'un argument : théorème, proposition, résultat, décision (question
//             tranchée), conjecture (question ouverte) ou objection (nœud qui contredit) ;
//   membre    étape intermédiaire (lemme, assertion, calcul, mesure…) absorbée dans la carte
//             qu'elle sert : c'est une « raison » ou une sous-étape de la carte ;
//   donnee    hypothèse du problème : citée par étiquette (H1…Hn), jamais par une arête ;
//   modele    choix de modélisation : hypothèse de travail (M1…Mn), affichée en bandeau ;
//   garantie  énoncé admis (définition, axiome, lemme outil, littérature) : la « garantie »
//             de Toulmin, écrite en petit sur la flèche qui entre dans la carte.
//
// L'étape `etapeArguments` fusionne chaque carte avec ses membres (une unité de lecture par
// carte), masque données, modèles et garanties, et ne garde entre cartes que les liens portés par
// au moins une prémisse principale. Elle respecte l'invariant de lecture.ts : chaque arête complète
// reste représentée exactement une fois (arête de lecture, arête interne ou contexte).

import {
  demonstrationPrincipale, etapeReductionTransitive, enregistrerStrategie,
  type EtapeLecture, type GrapheJustification, type GrapheLecture, type TravailLecture,
} from '../../src/raisonnement'

export type RoleArgument = 'carte' | 'membre' | 'donnee' | 'modele' | 'garantie'

const TYPES_CARTE = new Set(['theoreme', 'resultat', 'proposition', 'decision', 'conjecture'])

/** Rôles de tous les nœuds d'un graphe de justification (voir l'en-tête). */
export function rolesArguments(j: GrapheJustification): RoleArgument[] {
  const base = j.noeuds.map((n): RoleArgument => {
    if (n.type === 'hypothese') return 'donnee'
    if (n.type === 'choix_modelisation') return 'modele'
    if (n.admis) return 'garantie'
    if (TYPES_CARTE.has(n.type)) return 'carte'
    if (n.liens?.some((l) => l.genre === 'contredit')) return 'carte'
    return 'membre'
  })
  // Un énoncé admis construit à partir du raisonnement (ex. « schéma corrigé », issu d'une
  // décision) n'est pas une garantie générale : c'est une étape du raisonnement.
  return base.map((r, i) => {
    if (r !== 'garantie') return r
    const derive = j.entrantes[i]!.some((e) => {
      const a = j.aretes[e]!
      return a.role === 'principale' && (base[a.source] === 'carte' || base[a.source] === 'membre')
    })
    return derive ? 'membre' : r
  })
}

export interface Affectation {
  /** Carte (index de nœud) de chaque nœud, −1 hors lecture (données, modèles, garanties, isolés). */
  carte: Int32Array
  /** Vrai pour un membre rattaché « par repli » (hors chemin principal) : complément, appui. */
  repli: Uint8Array
  role: RoleArgument[]
}

/**
 * Affecte chaque membre à une carte :
 *  1. si ses prémisses principales ne mènent qu'à une seule première carte → cette carte ;
 *  2. sinon, s'il a une carte pour parent direct → cette carte (mise en œuvre d'une décision…) ;
 *  3. sinon la carte en aval la plus proche (à égalité, un argument actif et non réfuté) ;
 *  4. sans carte en aval par prémisses principales : la plus proche par n'importe quel rôle
 *     (appui auxiliaire ou technique), sinon la carte de son parent (vérification, complément) ;
 *  5. sinon il sort du graphe de lecture (contexte pur).
 */
export function affecterMembres(j: GrapheJustification): Affectation {
  const N = j.noeuds.length
  const role = rolesArguments(j)
  const noeuds = j.noeuds
  const actif = (i: number) => role[i] === 'carte' || role[i] === 'membre'
  const sortiesP: number[][] = noeuds.map(() => []), sortiesT: number[][] = noeuds.map(() => [])
  const entreesP: number[][] = noeuds.map(() => []), entreesT: number[][] = noeuds.map(() => [])
  for (const a of j.aretes) {
    if (!actif(a.source) || !actif(a.cible)) continue
    sortiesT[a.source]!.push(a.cible)
    entreesT[a.cible]!.push(a.source)
    if (a.role !== 'principale') continue
    sortiesP[a.source]!.push(a.cible)
    entreesP[a.cible]!.push(a.source)
  }
  /** Premières cartes atteintes vers l'aval (parcours en largeur arrêté aux cartes). */
  const cartesEnAval = (i: number, sorties: number[][]) => {
    const dist = new Map<number, number>([[i, 0]])
    const file = [i]
    const res: { c: number; d: number }[] = []
    while (file.length) {
      const u = file.shift()!
      for (const v of sorties[u]!) {
        if (dist.has(v)) continue
        dist.set(v, dist.get(u)! + 1)
        if (role[v] === 'carte') res.push({ c: v, d: dist.get(v)! })
        else file.push(v)
      }
    }
    return res
  }
  // À distance égale, un argument actif et non réfuté est un meilleur « propriétaire » qu’une question.
  // (À distance inégale, la plus proche l’emporte : les lemmes d’une conjecture réfutée restent avec
  // elle, et la carte réfutée précède ainsi celle qui les réemploie.)
  const penalite = (c: number) => {
    const n = noeuds[c]!
    return (n.statut === 'refute' || n.piste === 'abandonnee' ? 2 : 0) + (n.type === 'conjecture' || n.type === 'decision' ? 1 : 0)
  }
  const carte = new Int32Array(N).fill(-1)
  const repli = new Uint8Array(N)
  for (let i = 0; i < N; i++) if (role[i] === 'carte') carte[i] = i
  const enAttente: number[] = []
  for (let i = 0; i < N; i++) {
    if (role[i] !== 'membre') continue
    const aval = cartesEnAval(i, sortiesP)
    if (aval.length === 1) carte[i] = aval[0]!.c
    else if (aval.length > 1) {
      const parent = entreesP[i]!.find((p) => role[p] === 'carte')
      carte[i] = parent ?? aval.sort((a, b) => a.d - b.d || penalite(a.c) - penalite(b.c) || a.c - b.c)[0]!.c
    } else {
      const large = cartesEnAval(i, sortiesT)
      if (large.length) {
        carte[i] = large.sort((a, b) => a.d - b.d || penalite(a.c) - penalite(b.c) || a.c - b.c)[0]!.c
        repli[i] = 1
      } else enAttente.push(i)
    }
  }
  // Membres sans aval : ils suivent un parent déjà affecté (ordre topologique itéré).
  for (let tour = 0; tour < 50 && enAttente.some((i) => carte[i]! < 0); tour++) {
    for (const i of enAttente) {
      if (carte[i]! >= 0) continue
      const p = entreesP[i]!.find((q) => carte[q]! >= 0) ?? entreesT[i]!.find((q) => carte[q]! >= 0)
      if (p !== undefined) {
        carte[i] = carte[p]!
        repli[i] = 1
      }
    }
  }
  return { carte, repli, role }
}

/** Étape de dérivation : une unité par carte, arêtes entre cartes portées par une prémisse principale. */
export const etapeArguments: EtapeLecture = (t: TravailLecture) => {
  const j = t.j
  const N = j.noeuds.length
  const { carte, repli } = affecterMembres(j)
  const U = (i: number) => carte[i]!
  // Unités : la carte absorbe ses membres (dans l'ordre des nœuds, la conclusion en dernier).
  const membres = new Map<number, number[]>()
  for (let i = 0; i < N; i++) {
    const c = U(i)
    if (c < 0) continue
    if (!membres.has(c)) membres.set(c, [])
    if (i !== c) membres.get(c)!.push(i)
  }
  for (let i = 0; i < N; i++) {
    const u = t.unites[i]!
    if (membres.has(i)) {
      u.membres = [...membres.get(i)!, i]
      u.conclusion = i
      u.vivante = true
    } else u.vivante = false
    t.uniteDe[i] = U(i)
  }
  // Arêtes : paires de cartes reliées par au moins une prémisse principale. Une arête qui entre
  // dans un membre « de repli » (complément) depuis une autre carte reste du contexte : sinon un
  // complément tirerait sa carte après celle qu'il complète (cycles).
  const anciennes = [...t.aretes.values()]
  t.aretes.clear()
  const entreCartes = (e: number) => {
    const a = j.aretes[e]!
    const s = U(a.source), c = U(a.cible)
    return s >= 0 && c >= 0 && s !== c && !repli[a.cible]
  }
  const paires = new Set<number>()
  for (const a of anciennes) for (const e of [...a.resume, ...a.transitives]) {
    const aj = j.aretes[e]!
    if (entreCartes(e) && aj.role === 'principale') paires.add(t.cle(U(aj.source), U(aj.cible)))
  }
  // Rupture des cycles éventuels (données incohérentes) : parcours en profondeur, arêtes retour écartées.
  const suivants = new Map<number, number[]>()
  for (const k of paires) {
    const s = Math.floor(k / N), c = k % N
    if (!suivants.has(s)) suivants.set(s, [])
    suivants.get(s)!.push(c)
  }
  const etat = new Uint8Array(N)
  const retour = new Set<number>()
  const visiter = (u: number) => {
    etat[u] = 1
    for (const v of suivants.get(u) ?? []) {
      if (etat[v] === 1) retour.add(t.cle(u, v))
      else if (etat[v] === 0) visiter(v)
    }
    etat[u] = 2
  }
  for (const s of [...suivants.keys()].sort((a, b) => a - b)) if (!etat[s]) visiter(s)
  for (const k of retour) paires.delete(k)

  let internes = 0, contexte = 0
  for (const a of anciennes) for (const e of [...a.resume, ...a.transitives]) {
    const aj = j.aretes[e]!
    const s = U(aj.source), c = U(aj.cible)
    if (s >= 0 && s === c) {
      t.unites[c]!.aretesInternes.push(e)
      internes++
    } else if (entreCartes(e) && paires.has(t.cle(s, c))) t.ajouterResume(s, c, e)
    else {
      t.versContexte(e, c)
      contexte++
    }
  }
  const cycles = retour.size ? `, ${retour.size} cycle(s) rompu(s)` : ''
  t.journal.push(`Arguments : ${N} nœuds → ${membres.size} cartes ; ${internes} arête(s) internes (raisons, sous-étapes, compléments), ${contexte} arête(s) en contexte (données, hypothèses de travail, garanties)${cycles}.`)
}

export const ID_STRATEGIE = 'r5-arguments'

enregistrerStrategie({
  id: ID_STRATEGIE,
  nom: 'R5 · Carte d’arguments',
  description: 'Une carte par argument (conclusion + raisons absorbées) ; hypothèses, hypothèses de travail et garanties citées par étiquette ; réduction transitive entre cartes.',
  etapes: [etapeArguments, etapeReductionTransitive],
  parametres: { masquerContexte: true },
})

// ─── Modèle d'affichage des cartes ───────────────────────────────────────────

export type GenreCarte = 'argument' | 'question' | 'decision' | 'objection'
export type EtatQuestion = 'ouverte' | 'refutee' | 'abandonnee'

export interface Raison {
  /** Nœud de justification. */
  noeud: number
  /** Carte qui le contient (unité), égale à la carte courante pour un membre absorbé. */
  carte: number
  /** Nombre de sous-étapes absorbées sous cette raison, dans la même carte. */
  sousEtapes: number
}

export interface Etiquette {
  code: string
  noeud: number
}

export interface Reserve {
  noeud: number
  texte: string
  grave: boolean
}

export interface Carte {
  unite: number
  conclusion: number
  genre: GenreCarte
  etat?: EtatQuestion
  raisons: Raison[]
  /** Garanties (Toulmin) : énoncés admis qui autorisent le passage. */
  garanties: number[]
  donnees: Etiquette[]
  modeles: Etiquette[]
  reserves: Reserve[]
  /** Vérifications machine rattachées (calcul formel, Lean). */
  verifications: number[]
  /** Membres hors du chemin vers la conclusion (compléments, variantes). */
  complements: number[]
  sousProbleme: string
  abandonnee: boolean
}

export interface ModeleArguments {
  cartes: Carte[]
  /** Hypothèses du problème (H1…). */
  donnees: Etiquette[]
  /** Hypothèses de travail (M1…), avec les cartes qui en dépendent (graphe complet). */
  modeles: (Etiquette & { cartes: number[] })[]
  /** Liens hors justification entre cartes (objections, réponses, abandons). */
  liens: { genre: 'contredit' | 'resout' | 'abandonne' | 'remplace'; source: number; cible: number; note?: string }[]
}

/** Construit le modèle d'affichage à partir d'un graphe de lecture dérivé par la stratégie R5. */
export function construireModele(g: GrapheLecture): ModeleArguments {
  const j = g.justification
  const noeuds = j.noeuds
  const role = rolesArguments(j)
  const code = (prefixe: string, liste: number[]) => liste.map((noeud, k) => ({ code: `${prefixe}${k + 1}`, noeud }))
  const donnees = code('H', noeuds.flatMap((_n, i) => (role[i] === 'donnee' ? [i] : [])))
  const modelesBruts = code('M', noeuds.flatMap((_n, i) => (role[i] === 'modele' ? [i] : [])))
  const codeDonnee = new Map(donnees.map((e) => [e.noeud, e]))
  const codeModele = new Map(modelesBruts.map((e) => [e.noeud, e]))

  const cartes: Carte[] = g.unites.map((u) => {
    const c = u.conclusion
    const n = noeuds[c]!
    const dans = new Set(u.membres)
    const genre: GenreCarte = n.type === 'decision' ? 'decision'
      : n.liens?.some((l) => l.genre === 'contredit') ? 'objection'
        : n.type === 'conjecture' ? 'question' : 'argument'
    const etat: EtatQuestion | undefined = genre !== 'question' ? undefined
      : n.statut === 'refute' ? 'refutee' : n.piste === 'abandonnee' ? 'abandonnee' : 'ouverte'
    // Sous-arbre principal de chaque membre dans la carte (pour compter les sous-étapes).
    const parentsDans = (i: number) => j.entrantes[i]!.map((e) => j.aretes[e]!).filter((a) => a.role === 'principale' && dans.has(a.source)).map((a) => a.source)
    const sousArbre = (i: number) => {
      const vus = new Set<number>()
      const pile = [i]
      while (pile.length) for (const p of parentsDans(pile.pop()!)) if (!vus.has(p)) { vus.add(p); pile.push(p) }
      return vus
    }
    // Raisons : prémisses principales de la démonstration principale de la conclusion.
    const demo = demonstrationPrincipale(n)
    const raisons: Raison[] = []
    for (const p of demo?.premisses ?? []) {
      if (p.role !== 'principale') continue
      const i = j.index.get(p.id)
      if (i === undefined || (role[i] !== 'carte' && role[i] !== 'membre')) continue
      const carte = g.uniteDe[i]!
      if (carte < 0) continue
      raisons.push({ noeud: i, carte, sousEtapes: carte === u.index ? sousArbre(i).size : 0 })
    }
    // Chemin vers la conclusion : tout ce dont elle dépend dans la carte.
    const chemin = sousArbre(c)
    const verifications: number[] = [], complements: number[] = []
    for (const m of u.membres) {
      if (m === c || chemin.has(m)) continue
      const nm = noeuds[m]!
      if (nm.origine === 'ordinateur' && nm.type === 'calcul' && j.sortantes[m]!.length === 0) verifications.push(m)
      else complements.push(m)
    }
    // Garanties, données, modèles : prémisses de la carte selon leur rôle argumentatif.
    const garanties = new Map<number, number>()
    const donneesCarte = new Map<number, Etiquette>(), modelesCarte = new Map<number, Etiquette>()
    for (const m of u.membres) {
      for (const e of j.entrantes[m]!) {
        const a = j.aretes[e]!
        const s = a.source
        if (role[s] === 'garantie') {
          // Poids : outil cité par la conclusion > outil technique > définition de contexte.
          const poids = (m === c ? 4 : chemin.has(m) ? 2 : 0) + (a.role === 'technique' ? 2 : a.role === 'principale' ? 1.5 : a.role === 'auxiliaire' ? 1 : 0)
          garanties.set(s, Math.max(garanties.get(s) ?? 0, poids))
        } else if (role[s] === 'donnee') donneesCarte.set(s, codeDonnee.get(s)!)
        else if (role[s] === 'modele') modelesCarte.set(s, codeModele.get(s)!)
      }
    }
    // Réserves (Toulmin : conditions de réfutation) : énoncés incertains et preuves non validées.
    const reserves: Reserve[] = []
    for (const m of u.membres) {
      const nm = noeuds[m]!
      if (m !== c && nm.statut !== 'valide') reserves.push({ noeud: m, texte: `${nm.nom} (${nm.statut === 'refute' ? 'réfuté' : 'incertain'})`, grave: nm.statut === 'refute' })
      for (const d of nm.demonstrations) {
        if (d.validite === 'invalide' && m !== c) reserves.push({ noeud: m, texte: `Démonstration invalide : ${d.nom}`, grave: true })
        else if (d.validite === 'a_verifier' && nm.demonstrations.length > 1 && nm.statut === 'valide') reserves.push({ noeud: m, texte: `Variante à vérifier : ${nm.nom} (${d.nom.toLowerCase()})`, grave: false })
      }
    }
    for (const [s] of donneesCarte) if (noeuds[s]!.statut !== 'valide') reserves.push({ noeud: s, texte: `Hypothèse incertaine : ${noeuds[s]!.nom}`, grave: false })
    return {
      unite: u.index,
      conclusion: c,
      genre,
      etat,
      raisons,
      garanties: [...garanties].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([s]) => s),
      donnees: [...donneesCarte.values()].sort((a, b) => a.noeud - b.noeud),
      modeles: [...modelesCarte.values()].sort((a, b) => a.noeud - b.noeud),
      reserves,
      verifications,
      complements,
      sousProbleme: n.sousProbleme,
      abandonnee: n.piste === 'abandonnee',
    }
  })

  // Portée de chaque hypothèse de travail : cartes qui en dépendent (graphe complet).
  const modeles = modelesBruts.map((m) => {
    const vus = new Uint8Array(noeuds.length)
    const pile = [m.noeud]
    const touchees = new Set<number>()
    while (pile.length) {
      const x = pile.pop()!
      for (const e of j.sortantes[x]!) {
        const y = j.aretes[e]!.cible
        if (vus[y]) continue
        vus[y] = 1
        pile.push(y)
        const u = g.uniteDe[y]!
        if (u >= 0) touchees.add(u)
      }
    }
    return { ...m, cartes: [...touchees].sort((a, b) => a - b) }
  })

  // Liens sémantiques entre cartes.
  const liens: ModeleArguments['liens'] = []
  noeuds.forEach((n, i) => {
    for (const l of n.liens ?? []) {
      const ci = j.index.get(l.cible)
      if (ci === undefined) continue
      const s = g.uniteDe[i]!, c = g.uniteDe[ci]!
      if (s >= 0 && c >= 0 && s !== c) liens.push({ genre: l.genre, source: s, cible: c, note: l.note })
    }
  })
  return { cartes, donnees, modeles, liens }
}
