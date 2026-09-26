// R3 · Modèle : les décisions et les choix de modélisation structurent la lecture.
//
// Analyse générique du graphe de justification (jeu synthétique ou API) :
//  - pivots   : décisions et choix de modélisation (non admis), rangés dans l'ordre logique
//               (tri topologique de leurs dépendances mutuelles, puis date) ;
//  - clés     : ce qui reste individuellement visible entre les pivots (théorèmes et résultats,
//               énoncés réfutés, extrémités d'une contradiction, motifs d'une décision corrective
//               ou d'un abandon, impasse de la piste abandonnée) ;
//  - blocs    : tout le reste (hors contexte) est regroupé derrière son « ancre » la plus récente
//               (le dernier pivot ou nœud clé dont il dépend), par sous-problème et par piste.
//               Un bloc résume « ce que ce choix a permis » ;
//  - contexte : définitions, axiomes, outils admis : rattachés, visibles avec les liens complets.
//
// La stratégie `r3-decisions` transforme le travail de lecture en conséquence (unités = pivots,
// clés et blocs) en respectant l'invariant de correspondance des arêtes (voir lecture.ts).

import {
  FORCE_ROLE, etapeReductionTransitive, TravailLecture,
  type GrapheJustification, type NoeudR, type ParametresLecture, type RolePremisse, type StrategieLecture, type TypeRaisonnement,
} from '../../src/raisonnement'

export const ID_STRATEGIE = 'r3-decisions'

export type GenreR3 = 'pivot' | 'cle' | 'impasse' | 'bloc' | 'cadre' | 'contexte'

export interface BlocR3 {
  /** Identifiant stable (ancre | sous-problème | piste). */
  id: string
  /** Nœud d'ancrage (pivot ou clé) ; -1 pour le cadre (hypothèses). */
  ancre: number
  sousProbleme: string
  abandonne: boolean
  /** Nœuds du bloc (hors contexte), dans l'ordre des dates. */
  membres: number[]
  /** Résultat le plus important du bloc. */
  vedette: number
  titre: string
}

export interface AnalyseR3 {
  j: GrapheJustification
  genre: GenreR3[]
  /** Pivots dans l'ordre logique (colonne vertébrale). */
  pivots: number[]
  ordrePivot: Map<number, number>
  blocs: BlocR3[]
  /** Nœud → indice de bloc (-1 sinon). */
  blocDe: Int32Array
  /** Nœuds de l'histoire « contradiction résolue » : conjecture, mesure, décision, confirmation. */
  histoire: { conjecture: number; mesure: number; diagnostic: number; decision: number; confirmation: number } | null
  /** Ordre topologique des nœuds du graphe complet. */
  topo: number[]
}

// ─── Outils de graphe ────────────────────────────────────────────────────────

function ordreTopologique(j: GrapheJustification): number[] {
  const n = j.noeuds.length
  const degre = new Int32Array(n)
  for (const a of j.aretes) degre[a.cible]!++
  const file: number[] = []
  for (let i = 0; i < n; i++) if (degre[i] === 0) file.push(i)
  const ordre: number[] = []
  while (file.length) {
    const u = file.shift()!
    ordre.push(u)
    for (const e of j.sortantes[u]!) {
      const v = j.aretes[e]!.cible
      if (--degre[v]! === 0) file.push(v)
    }
  }
  // Données incohérentes (cycle) : les restants à la fin.
  if (ordre.length < n) for (let i = 0; i < n; i++) if (degre[i]! > 0) ordre.push(i)
  return ordre
}

const date = (n: NoeudR) => Date.parse(n.cree_le) || 0

/** Priorité d'un type pour choisir la « vedette » d'un bloc. */
const PRIORITE_TYPE: Partial<Record<TypeRaisonnement, number>> = {
  theoreme: 9, resultat: 9, proposition: 7, lemme: 6, observation: 5, assertion: 4, calcul: 3, experience: 3, conjecture: 4, hypothese: 2,
}

/** Nombre de descendants de chaque nœud (graphe complet). */
function nombreDescendants(j: GrapheJustification, topo: number[]): Int32Array {
  const n = j.noeuds.length
  const mots = Math.ceil(n / 32)
  const desc = new Array<Uint32Array>(n)
  const r = new Int32Array(n)
  for (let k = topo.length - 1; k >= 0; k--) {
    const u = topo[k]!
    const b = new Uint32Array(mots)
    for (const e of j.sortantes[u]!) {
      const v = j.aretes[e]!.cible
      b[v >> 5]! |= 1 << (v & 31)
      const bv = desc[v]
      if (bv) for (let w = 0; w < mots; w++) b[w]! |= bv[w]!
    }
    desc[u] = b
    let c = 0
    for (let w = 0; w < mots; w++) { let x = b[w]!; while (x) { x &= x - 1; c++ } }
    r[u] = c
  }
  return r
}

/** Composantes fortement connexes (Tarjan) : indice de composante par sommet. */
function tarjan(n: number, succ: Set<number>[]): Int32Array {
  const index = new Int32Array(n).fill(-1), bas = new Int32Array(n), comp = new Int32Array(n).fill(-1)
  const pile: number[] = []
  const surPile = new Uint8Array(n)
  let compteur = 0, nc = 0
  const visiter = (v: number) => {
    index[v] = bas[v] = compteur++
    pile.push(v)
    surPile[v] = 1
    for (const w of succ[v]!) {
      if (index[w]! < 0) { visiter(w); bas[v] = Math.min(bas[v]!, bas[w]!) }
      else if (surPile[w]) bas[v] = Math.min(bas[v]!, index[w]!)
    }
    if (bas[v] === index[v]) {
      let w: number
      do { w = pile.pop()!; surPile[w] = 0; comp[w] = nc } while (w !== v)
      nc++
    }
  }
  for (let v = 0; v < n; v++) if (index[v]! < 0) visiter(v)
  return comp
}

// ─── Analyse ─────────────────────────────────────────────────────────────────

export interface OptionsAnalyse {
  /** Un bloc plus petit rejoint le bloc qui le suit. */
  tailleMinBloc: number
  /** Garder visibles les motifs (prémisses principales) des décisions correctives et des abandons. */
  motifs: boolean
}

export const OPTIONS_ANALYSE: OptionsAnalyse = { tailleMinBloc: 3, motifs: true }

export function analyser(j: GrapheJustification, o: OptionsAnalyse = OPTIONS_ANALYSE): AnalyseR3 {
  const N = j.noeuds
  const n = N.length
  const topo = ordreTopologique(j)
  const posTopo = new Int32Array(n)
  topo.forEach((u, k) => (posTopo[u] = k))
  const genre: GenreR3[] = new Array(n).fill('bloc')

  // 1. Contexte : définitions, axiomes et tout énoncé admis (outils, littérature).
  for (let i = 0; i < n; i++) {
    const t = N[i]!.type
    if (N[i]!.admis || t === 'definition' || t === 'axiome') genre[i] = 'contexte'
    else if (t === 'hypothese') genre[i] = 'cadre'
  }
  // 2. Pivots.
  const estPivot = (i: number) => (N[i]!.type === 'decision' || N[i]!.type === 'choix_modelisation') && genre[i] !== 'contexte'
  for (let i = 0; i < n; i++) if (estPivot(i)) genre[i] = 'pivot'

  // 3. Clés : théorèmes / résultats, réfutés, extrémités de contradiction, motifs.
  const decisionsLiees: number[] = []
  for (let i = 0; i < n; i++) {
    const x = N[i]!
    if (genre[i] === 'contexte' || genre[i] === 'pivot' || genre[i] === 'cadre') continue
    if (x.type === 'theoreme' || x.type === 'resultat' || x.statut === 'refute') genre[i] = 'cle'
  }
  for (let i = 0; i < n; i++) {
    for (const l of N[i]!.liens ?? []) {
      const c = j.index.get(l.cible)
      if (c === undefined) continue
      if (l.genre === 'contredit') {
        if (genre[i] === 'bloc') genre[i] = 'cle'
        if (genre[c] === 'bloc') genre[c] = 'cle'
      }
      if ((l.genre === 'resout' || l.genre === 'abandonne') && genre[i] === 'pivot') decisionsLiees.push(i)
    }
  }
  if (o.motifs) {
    // Mesures qui contredisent : un motif de décision corrective n'est gardé que s'il en découle.
    const mesures = new Set<number>()
    for (let i = 0; i < n; i++) for (const l of N[i]!.liens ?? []) if (l.genre === 'contredit') mesures.add(i)
    const descendDeMesure = (s: number): boolean => {
      const vus = new Set<number>()
      const pile = [s]
      while (pile.length) {
        const u = pile.pop()!
        if (mesures.has(u)) return true
        if (vus.has(u)) continue
        vus.add(u)
        for (const e of j.entrantes[u]!) pile.push(j.aretes[e]!.source)
      }
      return false
    }
    for (const d of decisionsLiees) {
      const abandon = (N[d]!.liens ?? []).some((l) => l.genre === 'abandonne')
      for (const e of j.entrantes[d]!) {
        const a = j.aretes[e]!
        if (a.role !== 'principale' || genre[a.source] !== 'bloc') continue
        // Un motif issu d'une piste abandonnée est l'impasse de cette piste.
        if (abandon && N[a.source]!.piste === 'abandonnee') genre[a.source] = 'impasse'
        else if (!abandon && descendDeMesure(a.source)) genre[a.source] = 'cle'
      }
    }
  }

  // 4. Ordre logique des pivots : tri topologique (restreint aux pivots), départagé par la date.
  const pivots = topo.filter((i) => genre[i] === 'pivot')
  // Ancêtres pivots de chaque nœud (ensembles de bits sur les pivots).
  const P = pivots.length
  const idxPivot = new Map(pivots.map((p, k) => [p, k]))
  const motsP = Math.max(1, Math.ceil(P / 32))
  const ancP: Uint32Array[] = new Array(n)
  for (const u of topo) {
    const b = new Uint32Array(motsP)
    for (const e of j.entrantes[u]!) {
      const s = j.aretes[e]!.source
      const bs = ancP[s]
      if (bs) for (let w = 0; w < motsP; w++) b[w]! |= bs[w]!
      const k = idxPivot.get(s)
      if (k !== undefined) b[k >> 5]! |= 1 << (k & 31)
    }
    ancP[u] = b
  }
  const dependDePivot = (u: number, k: number) => (ancP[u]![k >> 5]! & (1 << (k & 31))) !== 0
  // Kahn sur les pivots, en choisissant à chaque pas le plus ancien disponible.
  const restants = new Set(pivots.map((_, k) => k))
  const ordreK: number[] = []
  while (restants.size) {
    let choisi = -1
    for (const k of restants) {
      let libre = true
      for (const k2 of restants) if (k2 !== k && dependDePivot(pivots[k]!, k2)) { libre = false; break }
      if (!libre) continue
      if (choisi < 0 || date(N[pivots[k]!]!) < date(N[pivots[choisi]!]!)) choisi = k
    }
    if (choisi < 0) choisi = [...restants][0]!
    restants.delete(choisi)
    ordreK.push(choisi)
  }
  const pivotsOrdonnes = ordreK.map((k) => pivots[k]!)
  const ordrePivot = new Map(pivotsOrdonnes.map((p, k) => [p, k]))

  // 5. Ancre de chaque nœud de bloc : la dernière ancre (pivot ou clé) dont il dépend, au sens
  //    de l'ordre topologique du graphe complet (garantit l'absence de cycle entre blocs).
  const estAncre = (i: number) => genre[i] === 'pivot' || genre[i] === 'cle' || genre[i] === 'impasse'
  const ancre = new Int32Array(n).fill(-1)
  for (const u of topo) {
    let meilleur = -1
    for (const e of j.entrantes[u]!) {
      const s = j.aretes[e]!.source
      const cand = estAncre(s) ? s : ancre[s]!
      if (cand >= 0 && (meilleur < 0 || posTopo[cand]! > posTopo[meilleur]!)) meilleur = cand
    }
    ancre[u] = meilleur
  }

  // 6. Blocs : un par (ancre, piste) — « ce que cette ancre a permis ».
  const descendants = nombreDescendants(j, topo)
  const parCle = new Map<string, number[]>()
  for (const u of topo) {
    if (genre[u] !== 'cadre' && genre[u] !== 'bloc') continue
    const k = genre[u] === 'cadre' ? 'cadre' : `${ancre[u]}|${N[u]!.piste}`
    if (!parCle.has(k)) parCle.set(k, [])
    parCle.get(k)!.push(u)
  }
  // Cycles entre blocs (possibles entre pistes d'une même ancre) : blocs fusionnés.
  const cles = [...parCle.keys()]
  const blocDeNoeud = new Map<number, number>()
  cles.forEach((k, b) => parCle.get(k)!.forEach((m) => blocDeNoeud.set(m, b)))
  const succ: Set<number>[] = cles.map(() => new Set())
  for (const a of j.aretes) {
    const bs = blocDeNoeud.get(a.source), bc = blocDeNoeud.get(a.cible)
    if (bs !== undefined && bc !== undefined && bs !== bc) succ[bs]!.add(bc)
  }
  // Blocs minuscules : absorbés par le bloc qui les suit (toujours sans cycle, car ce bloc
  // dépend d'eux), s'il en existe un de même piste.
  const hote = cles.map((_, b) => b)
  const racineDe = (b: number): number => (hote[b] === b ? b : (hote[b] = racineDe(hote[b]!)))
  cles.forEach((k, b) => {
    if (k === 'cadre' || parCle.get(k)!.length >= o.tailleMinBloc) return
    const compte = new Map<number, number>()
    for (const m of parCle.get(k)!) for (const e of j.sortantes[m]!) {
      const c = blocDeNoeud.get(j.aretes[e]!.cible)
      if (c === undefined || c === b || cles[c] === 'cadre' || cles[c]!.split('|')[1] !== k.split('|')[1]) continue
      compte.set(c, (compte.get(c) ?? 0) + 1)
    }
    const meilleur = [...compte].sort((x, y) => y[1] - x[1])[0]
    if (meilleur) hote[b] = racineDe(meilleur[0])
  })
  for (let b = 0; b < cles.length; b++) {
    const h = racineDe(b)
    if (h === b) continue
    for (const c of succ[b]!) if (racineDe(c) !== h) succ[h]!.add(c)
    for (let a = 0; a < cles.length; a++) if (succ[a]!.has(b)) succ[a]!.add(h)
  }
  const composanteBrute = tarjan(cles.length, succ)
  const composante = cles.map((_, b) => composanteBrute[racineDe(b)]!)
  const final = new Map<number, number[]>()
  cles.forEach((k, b) => {
    const c = composante[b]!
    if (!final.has(c)) final.set(c, [])
    final.get(c)!.push(...parCle.get(k)!)
  })
  const blocs: BlocR3[] = []
  const blocDe = new Int32Array(n).fill(-1)
  const spMajoritaire = (membres: number[]) => {
    const c = new Map<string, number>()
    for (const m of membres) c.set(N[m]!.sousProbleme, (c.get(N[m]!.sousProbleme) ?? 0) + 1)
    return [...c].sort((a, b) => b[1] - a[1])[0]![0]
  }
  for (const membres of final.values()) {
    membres.sort((a, b) => posTopo[a]! - posTopo[b]!)
    const cadre = genre[membres[0]!] === 'cadre'
    let vedette = membres[0]!
    const score = (i: number) => (PRIORITE_TYPE[N[i]!.type] ?? 1) * 1000 + descendants[i]!
    for (const m of membres) if (score(m) > score(vedette)) vedette = m
    const a = cadre ? -1 : ancre[vedette]!
    const sp = spMajoritaire(membres)
    const abandonne = membres.every((m) => N[m]!.piste === 'abandonnee')
    const nomSp = j.jeu.sousProblemes.find((s) => s.id === sp)?.nom ?? sp
    const titre = cadre ? 'Hypothèses de départ' : abandonne ? nomSp : nomSp.replace(/^SP\d+\s*·\s*/, '')
    const id = cadre ? 'cadre' : `${a >= 0 ? N[a]!.id : 'racine'}|${abandonne ? 'abandonnee' : 'active'}`
    const k = blocs.length
    blocs.push({ id, ancre: a, sousProbleme: sp, abandonne, membres, vedette, titre })
    for (const m of membres) blocDe[m] = k
  }

  // 7. Histoire de la contradiction : conjecture ← mesure (contredit), décision (résout), confirmation.
  let histoire: AnalyseR3['histoire'] = null
  for (let i = 0; i < n && !histoire; i++) {
    for (const l of N[i]!.liens ?? []) {
      if (l.genre !== 'contredit') continue
      const conj = j.index.get(l.cible)
      if (conj === undefined) continue
      const dec = N.findIndex((x) => (x.liens ?? []).some((m) => m.genre === 'resout' && m.cible === l.cible))
      if (dec < 0) continue
      // Diagnostic : motif principal de la décision qui dépend de la mesure.
      let diagnostic = -1
      for (const e of j.entrantes[dec]!) {
        const s = j.aretes[e]!.source
        if (j.aretes[e]!.role === 'principale' && (genre[s] === 'cle') && s !== i) { diagnostic = s; break }
      }
      // Confirmation : premier résultat (clé, validé) qui dépend de la décision.
      let confirmation = -1
      const pileVus = new Uint8Array(n)
      const file = [dec]
      while (file.length && confirmation < 0) {
        const u = file.shift()!
        for (const e of j.sortantes[u]!) {
          const v = j.aretes[e]!.cible
          if (pileVus[v]) continue
          pileVus[v] = 1
          if (genre[v] === 'cle' && N[v]!.statut === 'valide' && (N[v]!.type === 'resultat' || N[v]!.type === 'theoreme')) {
            // Préférer une confirmation expérimentale (observation → résultat) si elle existe.
            if (confirmation < 0 || (N[v]!.type === 'resultat' && N[confirmation]!.type !== 'resultat')) confirmation = v
          }
          file.push(v)
        }
      }
      histoire = { conjecture: conj, mesure: i, diagnostic, decision: dec, confirmation }
    }
  }

  return { j, genre, pivots: pivotsOrdonnes, ordrePivot, blocs, blocDe, histoire, topo }
}

// ─── « Et si ? » : ce qui tomberait sans ce choix ─────────────────────────────

/**
 * Nœuds qui tomberaient (deviendraient suspendus) si l'on retirait `retire` : un nœud non admis
 * tombe quand chacune de ses démonstrations cite au moins une prémisse tombée.
 * `survivants` : dépendants qui tiennent grâce à une autre démonstration.
 */
export function etSi(j: GrapheJustification, topo: number[], retire: number): { tombes: Uint8Array; nbTombes: number; survivants: number[] } {
  const n = j.noeuds.length
  const tombe = new Uint8Array(n)
  tombe[retire] = 1
  const touche = new Uint8Array(n)
  touche[retire] = 1
  let nb = 0
  const survivants: number[] = []
  for (const u of topo) {
    if (u === retire) continue
    const x = j.noeuds[u]!
    let atteint = false
    for (const e of j.entrantes[u]!) if (touche[j.aretes[e]!.source]) { atteint = true; break }
    if (!atteint) continue
    touche[u] = 1
    // Même un énoncé admis tombe s'il a été construit sur ce choix (définition du schéma corrigé…).
    if (!x.demonstrations.length) continue
    const tient = x.demonstrations.some((d) => d.premisses.every((p) => { const s = j.index.get(p.id); return s === undefined || !tombe[s] }))
    if (tient) survivants.push(u)
    else { tombe[u] = 1; nb++ }
  }
  return { tombes: tombe, nbTombes: nb, survivants }
}

// ─── Stratégie de lecture ────────────────────────────────────────────────────

/** État partagé avec la stratégie : analyse courante et blocs dépliés (ids). */
export const etatStrategie = {
  options: { ...OPTIONS_ANALYSE },
  deplies: new Set<string>(),
  analyse: null as AnalyseR3 | null,
}

type Unite = TravailLecture['unites'][number]

/** Fusionne les unités d'un groupe dans `rep` (arêtes internes absorbées, externes redirigées). */
function fusionnerGroupe(t: TravailLecture, groupe: number[], rep: number): void {
  const dans = new Set(groupe)
  const cible: Unite = t.unites[rep]!
  const membres: number[] = []
  for (const u of groupe) {
    const un = t.unites[u]!
    membres.push(...un.membres)
    if (u === rep) continue
    for (const [k, c] of un.contexte) {
      const ex = cible.contexte.get(k)
      if (!ex || FORCE_ROLE[c.role] > FORCE_ROLE[ex.role]) cible.contexte.set(k, c)
    }
    cible.aretesInternes.push(...un.aretesInternes)
    un.vivante = false
  }
  for (const [k, a] of [...t.aretes]) {
    const s = dans.has(a.source), c = dans.has(a.cible)
    if (!s && !c) continue
    t.aretes.delete(k)
    if (s && c) {
      cible.aretesInternes.push(...a.resume, ...a.transitives)
      continue
    }
    const ns = s ? rep : a.source, nc = c ? rep : a.cible
    const k2 = t.cle(ns, nc)
    const ex = t.aretes.get(k2)
    if (ex) {
      ex.resume.push(...a.resume)
      ex.transitives.push(...a.transitives)
    } else t.aretes.set(k2, { source: ns, cible: nc, resume: [...a.resume], transitives: [...a.transitives] })
  }
  cible.membres = membres
  for (const m of membres) t.uniteDe[m] = rep
}

/** Étape : pivots, clés et blocs ; le contexte est rattaché ; puis réduction transitive. */
export const etapeDecisions = (t: TravailLecture, p: ParametresLecture): void => {
  const j = t.j
  const an = analyser(j, etatStrategie.options)
  etatStrategie.analyse = an
  const N = j.noeuds
  // (1) Arêtes : un pivot garde toutes ses sorties (un choix sert souvent de contexte) ;
  //     ailleurs, seuls les rôles retenus deviennent des arêtes de lecture.
  const retenus = new Set<RolePremisse>(p.rolesRetenus)
  let nbCtx = 0
  for (const [k, a] of [...t.aretes]) {
    const garder: number[] = []
    for (const e of a.resume) {
      const ar = j.aretes[e]!
      const src = an.genre[ar.source]
      const garde = src !== 'contexte' && (src === 'pivot' ? an.genre[ar.cible] !== 'cadre' : retenus.has(ar.role))
      if (garde) garder.push(e)
      else { t.versContexte(e, a.cible); nbCtx++ }
    }
    if (garder.length) a.resume = garder
    else {
      for (const e of a.transitives) t.versContexte(e, a.cible)
      t.aretes.delete(k)
    }
  }
  // (2) Contexte pur : retiré du graphe de lecture (colonne « contexte » avec les liens complets).
  let masques = 0
  for (let i = 0; i < N.length; i++) {
    if (an.genre[i] !== 'contexte') continue
    const un = t.unites[i]!
    un.vivante = false
    t.uniteDe[i] = -1
    masques++
  }
  for (const [k, a] of [...t.aretes]) {
    if (t.unites[a.source]!.vivante && t.unites[a.cible]!.vivante) continue
    for (const e of [...a.resume, ...a.transitives]) t.versContexte(e, t.unites[a.cible]!.vivante ? a.cible : -1)
    t.aretes.delete(k)
  }
  // (3) Blocs (sauf ceux dépliés, dont les membres restent des unités individuelles).
  let nbBlocs = 0, nbDeplies = 0
  for (const b of an.blocs) {
    if (etatStrategie.deplies.has(b.id) && b.membres.length > 1) { nbDeplies++; continue }
    const groupe = b.membres.filter((m) => t.unites[m]!.vivante)
    if (!groupe.length) continue
    const rep = groupe.includes(b.vedette) ? b.vedette : groupe[0]!
    fusionnerGroupe(t, groupe, rep)
    // Ordre des membres : ordre topologique (lecture de la chaîne dans la fiche).
    t.unites[rep]!.membres = [...b.membres]
    nbBlocs++
  }
  // (4) Ancrage : chaque bloc est relié à son ancre, même quand le lien passe par du contexte
  //     (un choix de modélisation agit souvent à travers une définition : schéma, flux…).
  //     Arête sans arête complète propre (résumé vide) : l'invariant de correspondance tient.
  let ancrages = 0
  for (const b of an.blocs) {
    if (b.ancre < 0 || etatStrategie.deplies.has(b.id)) continue
    const s = t.uniteDe[b.ancre]!, c = t.uniteDe[b.vedette]!
    if (s < 0 || c < 0 || s === c || t.aretes.has(t.cle(s, c))) continue
    t.aretes.set(t.cle(s, c), { source: s, cible: c, resume: [], transitives: [] })
    ancrages++
  }
  t.journal.push(`Décisions : ${an.pivots.length} décision(s) et choix de modélisation, ${an.genre.filter((g) => g === 'cle' || g === 'impasse').length} nœud(s) clé(s), ${nbBlocs} bloc(s) de résultats${nbDeplies ? ` (${nbDeplies} déplié(s))` : ''} ; ${masques} nœud(s) de contexte retiré(s), ${nbCtx} prémisse(s) rattachée(s), ${ancrages} ancrage(s) via le contexte.`)
}

export const STRATEGIE_R3: StrategieLecture = {
  id: ID_STRATEGIE,
  nom: 'R3 · Arbre des décisions',
  description: 'Décisions et choix de modélisation en colonne vertébrale ; entre eux, un bloc par groupe de résultats qu’ils ont permis ; le contexte est rattaché.',
  etapes: [etapeDecisions, etapeReductionTransitive],
  parametres: { rolesRetenus: ['principale', 'auxiliaire'], masquerContexte: true },
}

/** Bloc représenté (replié) par l'unité dont `conclusion` est la vedette, sinon null. */
export function blocReplie(an: AnalyseR3, conclusion: number, nbMembres: number): BlocR3 | null {
  const g = an.genre[conclusion]
  if (g !== 'bloc' && g !== 'cadre') return null
  const b = an.blocs[an.blocDe[conclusion]!]
  if (!b || etatStrategie.deplies.has(b.id)) return null
  return nbMembres >= 1 ? b : null
}
