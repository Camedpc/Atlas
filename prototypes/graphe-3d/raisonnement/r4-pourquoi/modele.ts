// R4 · Modèle du dépliage progressif.
//
// On ne montre jamais tout le graphe de lecture. L'ensemble visible est *dérivé* de quelques
// décisions de l'utilisatrice :
//   - la base : résultats principaux (à droite) et fondations (hypothèses, choix de modélisation,
//     décisions sans prémisse, à gauche) ;
//   - `deplies`  : unités dont on a demandé « pourquoi ? » → leurs prémisses de lecture apparaissent ;
//   - `comments` : unités dont on a demandé « comment ? » → ce qu'elles ont permis apparaît ;
//   - `explicites` : unités révélées une à une (lecture guidée, ruban, liste des décisions).
// Tout le reste est « replié » : il n'existe à l'écran que sous forme de fils et de compteurs.
//
// Les indices manipulés ici sont des unités de lecture (points 0 … nU−1 de la vue).

import type { GrapheLecture, NoeudR, TypeRaisonnement, VueRaisonnement } from '../../src/raisonnement'

export type Groupe = 'hypotheses' | 'choix' | 'decisions'
export const GROUPES: { id: Groupe; nom: string }[] = [
  { id: 'hypotheses', nom: 'Hypothèses' },
  { id: 'choix', nom: 'Choix de modélisation' },
  { id: 'decisions', nom: 'Décisions de départ' },
]

/** Résumé d'un fil replié : ce qui reste caché en amont (pourquoi) ou en aval (comment). */
export interface Fil {
  /** Unités masquées atteintes sans traverser d'unité visible (hors fondations). */
  etapes: number
  /** Prémisses (ou suites) directes encore masquées. */
  directs: number
  /** Fondations sur lesquelles repose la partie repliée (pourquoi) ou unités visibles atteintes (comment). */
  appuis: number[]
}

/** Un pas de la lecture guidée : l'unité dont on explique la déduction et le chemin qui y mène. */
export interface PasGuide {
  unite: number
  /** Chemin depuis le résultat visé jusqu'à l'unité (inclus). */
  chemin: number[]
}

const TYPES_RESULTAT = new Set<TypeRaisonnement>(['resultat'])

export class ModeleDepliage {
  readonly vue: VueRaisonnement
  g!: GrapheLecture
  nU = 0
  /** Type de fondation par unité (null sinon). */
  groupe: (Groupe | null)[] = []
  fondations: number[] = []
  resultats: number[] = []
  deplies = new Set<number>()
  comments = new Set<number>()
  explicites = new Set<number>()
  /** 1 si visible. */
  visible = new Uint8Array(0)
  /** Unité qui a fait apparaître l'unité (−1 : base ou inconnue). */
  revelePar = new Int32Array(0)
  /** Ordre topologique des unités (prémisses d'abord). */
  topo: number[] = []
  /** Nombre d'ancêtres (graphe de lecture) : sert à choisir la « prémisse principale ». */
  poids = new Int32Array(0)
  /** Focus : dernière unité dépliée ou cliquée (fil d'Ariane). */
  focus: number | null = null
  /** Chemin imposé par la lecture guidée (résultat visé → pas courant), sinon null. */
  cheminGuide: number[] | null = null
  /** Dernière décision révélée (encart ouvert automatiquement). */
  encarts = new Set<number>()
  private filsPourquoi = new Map<number, Fil>()
  private filsComment = new Map<number, Fil>()
  private ecouteurs: (() => void)[] = []

  constructor(vue: VueRaisonnement) {
    this.vue = vue
    this.reconstruire(new Set())
  }

  // ─── Construction (à chaque nouvelle dérivation de lecture) ────────────────

  /** Recalcule les structures ; `garder` : ids de nœuds à garder dépliés (changement de stratégie). */
  reconstruire(garder: Set<string>, garderExplicites = new Set<string>(), garderComments = new Set<string>()): void {
    const g = this.vue.lecture
    this.g = g
    const nU = g.unites.length
    this.nU = nU
    const N = g.justification.noeuds
    const noeud = (u: number) => N[g.unites[u]!.conclusion]!
    this.groupe = []
    this.fondations = []
    this.resultats = []
    for (let u = 0; u < nU; u++) {
      const n = noeud(u)
      let gr: Groupe | null = null
      if (n.type === 'hypothese') gr = 'hypotheses'
      else if (n.type === 'choix_modelisation') gr = 'choix'
      else if (n.type === 'decision' && g.entrantes[u]!.length === 0) gr = 'decisions'
      this.groupe.push(gr)
      if (gr) this.fondations.push(u)
      if (!gr && (TYPES_RESULTAT.has(n.type) || (n.type === 'theoreme' && !n.admis))) this.resultats.push(u)
    }
    // Repli pour un jeu sans résultat typé : les puits les plus importants.
    if (!this.resultats.length) {
      const puits = [...Array(nU).keys()].filter((u) => !g.sortantes[u]!.length && g.entrantes[u]!.length)
      this.resultats = puits.slice(0, 5)
    }
    // Ordre topologique (Kahn) et poids (nombre d'ancêtres).
    const degre = new Int32Array(nU)
    for (const a of g.aretes) degre[a.cible]!++
    const file: number[] = []
    for (let u = 0; u < nU; u++) if (!degre[u]) file.push(u)
    const topo: number[] = []
    while (file.length) {
      const u = file.shift()!
      topo.push(u)
      for (const e of g.sortantes[u]!) if (--degre[g.aretes[e]!.cible]! === 0) file.push(g.aretes[e]!.cible)
    }
    this.topo = topo
    const anc: Set<number>[] = Array.from({ length: nU }, () => new Set())
    for (const u of topo) for (const e of g.entrantes[u]!) {
      const s = g.aretes[e]!.source
      anc[u]!.add(s)
      for (const x of anc[s]!) anc[u]!.add(x)
    }
    this.poids = Int32Array.from(anc, (s) => s.size)
    const parId = (ids: Set<string>) => {
      const r = new Set<number>()
      for (let u = 0; u < nU; u++) if (ids.has(noeud(u).id)) r.add(u)
      return r
    }
    this.deplies = parId(garder)
    this.explicites = parId(garderExplicites)
    this.comments = parId(garderComments)
    this.focus = null
    this.encarts.clear()
    this.recalculer()
  }

  /** Ids des unités dépliées (pour survivre à un changement de stratégie). */
  etatIds(): { deplies: Set<string>; explicites: Set<string>; comments: Set<string> } {
    const id = (u: number) => this.noeud(u).id
    return { deplies: new Set([...this.deplies].map(id)), explicites: new Set([...this.explicites].map(id)), comments: new Set([...this.comments].map(id)) }
  }

  noeud(u: number): NoeudR {
    return this.g.justification.noeuds[this.g.unites[u]!.conclusion]!
  }

  estFondation(u: number): boolean {
    return this.groupe[u] !== null && this.groupe[u] !== undefined
  }

  premisses(u: number): number[] {
    return this.g.entrantes[u]!.map((e) => this.g.aretes[e]!.source)
  }

  suites(u: number): number[] {
    return this.g.sortantes[u]!.map((e) => this.g.aretes[e]!.cible)
  }

  /** Prémisses triées : la « principale » (plus longue histoire) d'abord. */
  premissesTriees(u: number): number[] {
    return this.premisses(u).sort((a, b) => this.poids[b]! - this.poids[a]! || a - b)
  }

  /** Unités qui rattachent le nœud de l'unité u comme contexte (quand u n'a pas de suite de lecture). */
  dependantsContexte(u: number, max = 6): number[] {
    const i = this.g.unites[u]!.conclusion
    const r: number[] = []
    this.g.unites.forEach((x, k) => {
      if (k !== u && x.contexte.some((c) => c.noeud === i)) r.push(k)
    })
    return r.sort((a, b) => this.poids[b]! - this.poids[a]!).slice(0, max)
  }

  // ─── Visibilité dérivée ────────────────────────────────────────────────────

  recalculer(): void {
    const nU = this.nU
    const vis = new Uint8Array(nU)
    const par = new Int32Array(nU).fill(-1)
    const file: number[] = []
    const ajouter = (u: number, depuis: number) => {
      if (vis[u]) return
      vis[u] = 1
      par[u] = depuis
      file.push(u)
    }
    for (const u of this.resultats) ajouter(u, -1)
    for (const u of this.fondations) ajouter(u, -1)
    for (const u of this.explicites) ajouter(u, -1)
    while (file.length) {
      const u = file.shift()!
      if (this.deplies.has(u)) for (const s of this.premissesTriees(u)) ajouter(s, u)
      if (this.comments.has(u)) {
        const suites = this.suites(u)
        for (const c of suites.length ? suites : this.dependantsContexte(u)) ajouter(c, u)
      }
    }
    this.visible = vis
    this.revelePar = par
    this.calculerFils()
    for (const f of this.ecouteurs) f()
  }

  surChangement(f: () => void): void {
    this.ecouteurs.push(f)
  }

  nbVisibles(): number {
    let n = 0
    for (let u = 0; u < this.nU; u++) n += this.visible[u]!
    return n
  }

  private calculerFils(): void {
    this.filsPourquoi.clear()
    this.filsComment.clear()
    for (let u = 0; u < this.nU; u++) {
      if (!this.visible[u]) continue
      const p = this.parcourir(u, 'amont')
      if (p.directs) this.filsPourquoi.set(u, p)
      let c = this.parcourir(u, 'aval')
      // Sans suite de lecture (ex. domaine périodique) : « comment ? » montre qui le cite en contexte.
      if (!c.directs && !this.suites(u).length) {
        const dep = this.dependantsContexte(u).filter((x) => !this.visible[x])
        if (dep.length) c = { etapes: dep.length, directs: dep.length, appuis: [] }
      }
      if (c.directs) this.filsComment.set(u, c)
    }
  }

  /** Parcourt les unités masquées depuis u (sans traverser d'unité visible). */
  private parcourir(u: number, sens: 'amont' | 'aval'): Fil {
    const voisins = (x: number) => (sens === 'amont' ? this.premisses(x) : this.suites(x))
    let directs = 0
    for (const v of voisins(u)) if (!this.visible[v]) directs++
    if (!directs) return { etapes: 0, directs: 0, appuis: [] }
    const vus = new Set<number>([u])
    const pile = voisins(u).filter((v) => !this.visible[v])
    const appuis = new Set<number>()
    let etapes = 0
    for (const v of pile) vus.add(v)
    while (pile.length) {
      const x = pile.pop()!
      if (!this.estFondation(x)) etapes++
      for (const y of voisins(x)) {
        if (vus.has(y)) continue
        vus.add(y)
        if (this.visible[y]) {
          // Amont : les fondations (toujours visibles) sur lesquelles repose le repli.
          if (sens === 'amont' ? this.estFondation(y) : true) appuis.add(y)
          continue
        }
        pile.push(y)
      }
    }
    // Les prémisses directes qui sont des fondations visibles comptent aussi comme appuis.
    if (sens === 'amont') for (const v of voisins(u)) if (this.visible[v] && this.estFondation(v)) appuis.add(v)
    return { etapes, directs, appuis: [...appuis] }
  }

  filPourquoi(u: number): Fil | undefined {
    return this.filsPourquoi.get(u)
  }

  filComment(u: number): Fil | undefined {
    return this.filsComment.get(u)
  }

  /** Nombre total d'étapes encore repliées (toutes unités masquées). */
  masquees(): number {
    return this.nU - this.nbVisibles()
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  /** « Pourquoi ? » : déplie un niveau de prémisses. Renvoie les unités nouvellement visibles. */
  pourquoi(u: number, focusSeul = false): number[] {
    const avant = this.visible
    this.cheminGuide = null
    if (focusSeul) this.garderSeulementChemin(u)
    this.deplies.add(u)
    this.focus = u
    this.recalculer()
    const nouvelles = this.nouvelles(avant)
    this.ouvrirEncarts(nouvelles)
    return nouvelles
  }

  comment(u: number): number[] {
    const avant = this.visible
    this.cheminGuide = null
    this.comments.add(u)
    this.focus = u
    this.recalculer()
    const nouvelles = this.nouvelles(avant)
    this.ouvrirEncarts(nouvelles)
    return nouvelles
  }

  /** Replie : les prémisses (ou suites) de u disparaissent si rien d'autre ne les retient. */
  replier(u: number, sens: 'pourquoi' | 'comment' = 'pourquoi'): void {
    this.cheminGuide = null
    ;(sens === 'pourquoi' ? this.deplies : this.comments).delete(u)
    this.recalculer()
    this.elaguer()
    if (this.focus !== null && !this.visible[this.focus]) this.focus = u
  }

  /** Oublie les dépliages d'unités devenues invisibles (pas de réapparition surprise). */
  private elaguer(): void {
    let change = true
    while (change) {
      change = false
      for (const s of [this.deplies, this.comments, this.explicites]) for (const u of s) if (!this.visible[u]) { s.delete(u); change = true }
      if (change) this.recalculer()
    }
  }

  toutReplier(): void {
    this.cheminGuide = null
    this.deplies.clear()
    this.comments.clear()
    this.explicites.clear()
    this.encarts.clear()
    this.focus = null
    this.recalculer()
  }

  /** Déplie d'un niveau toutes les unités visibles qui ont un fil (hors fondations). */
  deplierUnNiveau(): number[] {
    const avant = this.visible
    for (let u = 0; u < this.nU; u++) if (this.visible[u] && !this.estFondation(u) && this.filsPourquoi.has(u)) this.deplies.add(u)
    this.recalculer()
    return this.nouvelles(avant)
  }

  /** Ne garde déplié que le chemin de u vers un résultat (lecture « en ligne »). */
  private garderSeulementChemin(u: number): void {
    const chemin = new Set(this.cheminVersResultat(u))
    for (const x of [...this.deplies]) if (!chemin.has(x)) this.deplies.delete(x)
    this.recalculer()
  }

  /**
   * Révèle une unité quelconque et le plus court chemin qui la relie à ce qui est visible
   * (vers l'aval d'abord : on la rattache à un résultat ; sinon vers l'amont).
   */
  reveler(u: number): number[] {
    const avant = this.visible
    this.cheminGuide = null
    const chemin = this.plusCourtChemin(u, 'aval') ?? this.plusCourtChemin(u, 'amont') ?? [u]
    for (const x of chemin) if (!this.visible[x]) this.explicites.add(x)
    this.focus = u
    this.recalculer()
    const nouvelles = this.nouvelles(avant)
    this.ouvrirEncarts(nouvelles)
    return nouvelles
  }

  private plusCourtChemin(u: number, sens: 'amont' | 'aval'): number[] | null {
    if (this.visible[u]) return [u]
    const prec = new Map<number, number>([[u, -1]])
    const file = [u]
    while (file.length) {
      const x = file.shift()!
      for (const y of sens === 'aval' ? this.suites(x) : this.premisses(x)) {
        if (prec.has(y)) continue
        prec.set(y, x)
        if (this.visible[y]) {
          const r: number[] = []
          for (let k = x; k !== -1; k = prec.get(k)!) r.push(k)
          return r
        }
        file.push(y)
      }
    }
    return null
  }

  private nouvelles(avant: Uint8Array): number[] {
    const r: number[] = []
    for (let u = 0; u < this.nU; u++) if (this.visible[u] && !avant[u]) r.push(u)
    return r
  }

  private ouvrirEncarts(nouvelles: number[]): void {
    const dec = nouvelles.filter((u) => this.noeud(u).decision)
    if (dec.length) {
      this.encarts.clear()
      for (const u of dec) this.encarts.add(u)
    }
  }

  // ─── Chemins, phrases ──────────────────────────────────────────────────────

  /** Chemin visible de u vers un résultat : [u, …, résultat]. */
  cheminVersResultat(u: number): number[] {
    const prec = new Map<number, number>([[u, -1]])
    const file = [u]
    const cibles = new Set(this.resultats)
    let fin = -1
    while (file.length) {
      const x = file.shift()!
      if (cibles.has(x) && this.suites(x).every((c) => !this.visible[c] || !cibles.has(c))) { fin = x; break }
      for (const y of this.suites(x)) {
        if (!this.visible[y] || prec.has(y)) continue
        prec.set(y, x)
        file.push(y)
      }
    }
    if (fin < 0) {
      // Pas de résultat atteint : on remonte au dernier visible atteint.
      fin = [...prec.keys()].pop() ?? u
    }
    const r: number[] = []
    for (let k = fin; k !== -1; k = prec.get(k)!) r.push(k)
    return r.reverse()
  }

  /** Fil d'Ariane : résultat ← … ← focus (← fondation principale si le focus en dépend directement). */
  ariane(): number[] {
    if (this.focus === null || !this.visible[this.focus]) return []
    const f = this.focus
    const g = this.cheminGuide
    const chemin = g && g[g.length - 1] === f && g.every((x) => this.visible[x]) ? [...g] : this.cheminVersResultat(f).reverse()
    // Prolonge vers l'amont le long de la prémisse principale visible, jusqu'à une fondation.
    let x = f
    for (let k = 0; k < 12; k++) {
      const p = this.premissesTriees(x).filter((s) => this.visible[s])
      if (!p.length) break
      // Préférer une fondation directe, sinon la prémisse principale.
      const suivant = p.find((s) => this.estFondation(s)) ?? p[0]!
      if (chemin.includes(suivant)) break
      chemin.push(suivant)
      if (this.estFondation(suivant)) break
      x = suivant
    }
    return chemin
  }

  /** Phrase de déduction : « de A et B, on déduit C ». */
  phrase(u: number): { texte: string; premisses: string[]; conclusion: string; verbe: string } {
    const n = this.noeud(u)
    const prem = this.premissesTriees(u).map((s) => this.noeud(s).nom)
    const unite = this.g.unites[u]!
    const verbe =
      n.type === 'decision' ? 'on décide'
        : n.type === 'choix_modelisation' ? 'on choisit de modéliser'
          : n.type === 'conjecture' ? 'on conjecture'
            : n.type === 'observation' ? 'on observe'
              : n.type === 'calcul' || n.type === 'experience' ? 'le calcul donne'
                : n.type === 'definition' ? 'on définit'
                  : 'on déduit'
    const liste = prem.length <= 1 ? prem.map(guillemets).join('') : `${prem.slice(0, -1).map(guillemets).join(', ')} et ${guillemets(prem[prem.length - 1]!)}`
    let texte = prem.length ? `De ${liste}, ${verbe} ${guillemets(n.nom)}.` : `${guillemets(n.nom)} est un point de départ (${n.admis ? 'admis' : 'sans prémisse de lecture'}).`
    if (unite.genre === 'etape') texte += ` (${unite.membres.length} étapes enchaînées)`
    return { texte, premisses: prem, conclusion: n.nom, verbe }
  }

  // ─── Lecture guidée ────────────────────────────────────────────────────────

  /** Pas de la preuve de `cible`, en profondeur d'abord (prémisse principale d'abord). */
  pasGuide(cible: number): PasGuide[] {
    const pas: PasGuide[] = []
    const vus = new Set<number>()
    const visiter = (u: number, chemin: number[]) => {
      if (vus.has(u)) return
      vus.add(u)
      const c = [...chemin, u]
      if (!this.premisses(u).length || this.estFondation(u)) return
      pas.push({ unite: u, chemin: c })
      for (const s of this.premissesTriees(u)) visiter(s, c)
    }
    visiter(cible, [])
    return pas
  }

  /** Installe l'état d'un pas : compact (chemin + prémisses du pas) ou cumulatif. */
  appliquerPas(liste: PasGuide[], k: number, cumulatif: boolean): number[] {
    const avant = this.visible
    const p = liste[k]!
    this.deplies.clear()
    this.comments.clear()
    this.explicites.clear()
    if (cumulatif) for (let i = 0; i <= k; i++) this.deplies.add(liste[i]!.unite)
    else {
      for (const x of p.chemin) this.explicites.add(x)
      this.deplies.add(p.unite)
    }
    this.focus = p.unite
    this.cheminGuide = p.chemin
    this.recalculer()
    this.encarts.clear()
    const n = this.noeud(p.unite)
    if (n.decision) this.encarts.add(p.unite)
    for (const s of this.premisses(p.unite)) if (this.noeud(s).decision) this.encarts.add(s)
    return this.nouvelles(avant)
  }
}

export function guillemets(s: string): string {
  return `« ${s} »`
}
