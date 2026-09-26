// Hiérarchie domaine → thème → sous-thème → nœud, granularité continue et arêtes agrégées.
//
// Indexation « unité » partagée par tout le moteur :
//   0 … nF-1          feuilles (nœuds de recherche, dans l'ordre des données)
//   nF … nF+nC-1      catégories (agrégats), triées par niveau (domaines, thèmes, sous-thèmes)

import type { Noeud, JeuDonnees, Statut, Origine, TypeNoeud, Validation } from './donnees'
import { STATUTS, ORIGINES, TYPES_NOEUD, VALIDATIONS } from './donnees'
import { clamp, hacher } from './maths'
import type { Animateur, Animation, Courbe, PointTrajectoire, Trajectoire } from './anim'
import type { Lignee } from './lignee'

export interface Categorie {
  /** Index dans `categories`. */
  index: number
  /** Index d'unité (nF + index). */
  unite: number
  /** Chemin joint par « / », unique. */
  id: string
  nom: string
  niveau: 0 | 1 | 2
  /** Catégorie parente (-1 pour un domaine). */
  parent: number
  enfants: number[]
  /** Toutes les feuilles descendantes. */
  feuilles: number[]
  /** Index du domaine (0…nbDomaines-1), pratique pour les couleurs. */
  domaine: number
  chemin: string[]
}

export const NOMS_NIVEAUX = ['Domaines', 'Thèmes', 'Sous-thèmes', 'Nœuds'] as const

export class Hierarchie {
  readonly noeuds: Noeud[]
  readonly nF: number
  readonly nC: number
  readonly nU: number
  readonly categories: Categorie[] = []
  readonly domaines: number[] = []
  /** Par feuille : [domaine, thème, sous-thème] (index de catégories). */
  readonly chaine: Int32Array
  readonly indexParId = new Map<string, number>()
  /** Clé du nœud sigma de chaque unité (id de feuille ou « cat:chemin »). */
  readonly cles: string[] = []
  readonly uniteParCle = new Map<string, number>()
  /** Arêtes feuilles : prémisse (source) → nœud justifié (cible). */
  readonly aretesSource: Int32Array
  readonly aretesCible: Int32Array
  readonly premisses: number[][]
  readonly utilisePar: number[][]
  readonly dates: Float64Array
  readonly dateMin: number
  readonly dateMax: number
  /** Nombre de descendants transitifs (proxy d'importance). */
  readonly importance: Float32Array
  readonly importanceMax: number
  /** Graine stable par unité, dans [0,1). */
  readonly graines: Float32Array
  readonly sessions: Map<string, number[]> = new Map()

  constructor(jeu: JeuDonnees) {
    this.noeuds = jeu.noeuds
    const nF = (this.nF = jeu.noeuds.length)
    jeu.noeuds.forEach((n, i) => this.indexParId.set(n.id, i))

    // Catégories, triées par niveau puis par nom.
    const cmp = (a: string, b: string) => a.localeCompare(b, 'fr')
    const domaines = [...new Set(jeu.noeuds.map((n) => n.categorie[0]))].sort(cmp)
    const parChemin = new Map<string, number>()
    const ajouter = (chemin: string[], niveau: 0 | 1 | 2, parent: number, domaine: number) => {
      const c: Categorie = {
        index: this.categories.length, unite: -1, id: chemin.join('/'), nom: chemin[chemin.length - 1]!,
        niveau, parent, enfants: [], feuilles: [], domaine, chemin,
      }
      this.categories.push(c)
      parChemin.set(c.id, c.index)
      if (parent >= 0) this.categories[parent]!.enfants.push(c.index)
      return c.index
    }
    domaines.forEach((d, i) => this.domaines.push(ajouter([d], 0, -1, i)))
    for (const niveau of [1, 2] as const) {
      const chemins = new Map<string, string[]>()
      for (const n of jeu.noeuds) {
        const ch = n.categorie.slice(0, niveau + 1)
        chemins.set(ch.join('/'), ch)
      }
      for (const ch of [...chemins.values()].sort((a, b) => cmp(a.join('/'), b.join('/')))) {
        const parent = parChemin.get(ch.slice(0, niveau).join('/'))!
        ajouter(ch, niveau, parent, this.categories[parent]!.domaine)
      }
    }
    this.nC = this.categories.length
    this.nU = nF + this.nC
    this.categories.forEach((c) => (c.unite = nF + c.index))

    this.chaine = new Int32Array(nF * 3)
    this.dates = new Float64Array(nF)
    let dMin = Infinity, dMax = -Infinity
    jeu.noeuds.forEach((n, i) => {
      for (let k = 0; k < 3; k++) {
        const c = parChemin.get(n.categorie.slice(0, k + 1).join('/'))!
        this.chaine[i * 3 + k] = c
        this.categories[c]!.feuilles.push(i)
      }
      const d = Date.parse(n.cree_le)
      this.dates[i] = d
      if (d < dMin) dMin = d
      if (d > dMax) dMax = d
      if (!this.sessions.has(n.session)) this.sessions.set(n.session, [])
      this.sessions.get(n.session)!.push(i)
    })
    this.dateMin = dMin
    this.dateMax = dMax > dMin ? dMax : dMin + 1

    for (let i = 0; i < nF; i++) this.cles.push(jeu.noeuds[i]!.id)
    for (const c of this.categories) this.cles.push(`cat:${c.id}`)
    this.cles.forEach((k, u) => this.uniteParCle.set(k, u))

    // Arêtes (prémisses inconnues ignorées).
    const src: number[] = [], cib: number[] = []
    this.premisses = jeu.noeuds.map(() => [])
    this.utilisePar = jeu.noeuds.map(() => [])
    jeu.noeuds.forEach((n, i) => {
      for (const p of new Set(n.justifie_par)) {
        const j = this.indexParId.get(p)
        if (j === undefined || j === i) continue
        src.push(j)
        cib.push(i)
        this.premisses[i]!.push(j)
        this.utilisePar[j]!.push(i)
      }
    })
    this.aretesSource = Int32Array.from(src)
    this.aretesCible = Int32Array.from(cib)

    // Importance = nombre de descendants transitifs.
    this.importance = new Float32Array(nF)
    const vu = new Int32Array(nF).fill(-1)
    let impMax = 1
    for (let i = 0; i < nF; i++) {
      let compte = 0
      const pile = [...this.utilisePar[i]!]
      while (pile.length) {
        const j = pile.pop()!
        if (vu[j] === i) continue
        vu[j] = i
        compte++
        for (const k of this.utilisePar[j]!) if (vu[k] !== i) pile.push(k)
      }
      this.importance[i] = compte
      if (compte > impMax) impMax = compte
    }
    this.importanceMax = impMax

    this.graines = new Float32Array(this.nU)
    this.cles.forEach((k, u) => (this.graines[u] = hacher(k)))
  }

  estAgregat(u: number): boolean {
    return u >= this.nF
  }
  categorieDe(u: number): Categorie | undefined {
    return u >= this.nF ? this.categories[u - this.nF] : undefined
  }
  noeudDe(u: number): Noeud | undefined {
    return u < this.nF ? this.noeuds[u] : undefined
  }
  /** 0 domaine, 1 thème, 2 sous-thème, 3 feuille. */
  niveau(u: number): 0 | 1 | 2 | 3 {
    return u < this.nF ? 3 : this.categories[u - this.nF]!.niveau
  }
  /** Unité parente (-1 pour un domaine). */
  parent(u: number): number {
    if (u < this.nF) return this.nF + this.chaine[u * 3 + 2]!
    const p = this.categories[u - this.nF]!.parent
    return p < 0 ? -1 : this.nF + p
  }
  nom(u: number): string {
    return u < this.nF ? this.noeuds[u]!.nom : this.categories[u - this.nF]!.nom
  }
  /** Index de domaine de l'unité. */
  domaine(u: number): number {
    return u < this.nF ? this.categories[this.chaine[u * 3]!]!.domaine : this.categories[u - this.nF]!.domaine
  }
  /** Vrai si l'unité `a` contient (ou est) l'unité `b`. */
  contient(a: number, b: number): boolean {
    for (let x = b; x >= 0; x = this.parent(x)) if (x === a) return true
    return false
  }
}

// ─── Granularité ─────────────────────────────────────────────────────────────

export type SurchargeLocale = 'ouvert' | 'ferme'

interface Surcharge {
  cible: 0 | 1
  lambda: number
  anim?: Animation
}

/**
 * État de granularité : valeur globale continue g ∈ [0,3] + ouvertures/fermetures locales animées.
 *
 * Pour une catégorie c de niveau n, l'ouverture globale vaut clamp(g − n, 0, 1) : à g = 1 les
 * domaines sont ouverts (les thèmes sont sortis), à g = 3 tout est ouvert. Une surcharge locale
 * mélange cette valeur avec 0 ou 1 via un facteur λ animé, ce qui garde tout continu.
 *
 * Pour chaque feuille, les poids alpha de sa chaîne (domaine, thème, sous-thème, feuille) forment
 * une partition de l'unité : c'est ce qui rend continues les tailles, opacités et arêtes agrégées.
 */
export class Granularite {
  globale = 3
  /** Ouverture affichée par catégorie (0 = fermée, 1 = enfants sortis). */
  readonly ouverture: Float32Array
  /** Présence par unité : produit des ouvertures des ancêtres. */
  readonly presence: Float32Array
  /** Part visible de l'unité (présence × (1 − ouverture) pour un agrégat). */
  readonly alpha: Float32Array
  /** Nombre de feuilles actives (filtres) par catégorie. */
  readonly nbActives: Int32Array
  readonly actives: Uint8Array
  masquerInactives = false
  private surcharges = new Map<number, Surcharge>()
  private animGlobale?: Animation
  /** Incrémenté à chaque changement : les consommateurs comparent pour savoir s'il faut recalculer. */
  version = 0

  constructor(
    readonly h: Hierarchie,
    private animateur: Animateur,
    private duree: () => number,
  ) {
    this.ouverture = new Float32Array(h.nC)
    this.presence = new Float32Array(h.nU)
    this.alpha = new Float32Array(h.nU)
    this.nbActives = new Int32Array(h.nC)
    this.actives = new Uint8Array(h.nF).fill(1)
    this.definirActives(this.actives, false)
  }

  /** Ouverture globale (sans surcharge) de la catégorie c. */
  ouvertureGlobale(c: number): number {
    return clamp(this.globale - this.h.categories[c]!.niveau, 0, 1)
  }

  get aDesSurcharges(): boolean {
    return this.surcharges.size > 0
  }

  surcharge(c: number): SurchargeLocale | null {
    const s = this.surcharges.get(c)
    return s ? (s.cible === 1 ? 'ouvert' : 'ferme') : null
  }

  /** Change g immédiatement (glisser le curseur fait défiler la transition). */
  definirGlobale(g: number): void {
    this.animGlobale?.annuler()
    this.globale = clamp(g, 0, 3)
    this.version++
  }

  /** Anime g vers une valeur. */
  allerA(g: number, duree = this.duree()): void {
    this.animGlobale?.annuler()
    const depart = this.globale
    const arrivee = clamp(g, 0, 3)
    this.animGlobale = this.animateur.animer(duree * Math.max(0.35, Math.abs(arrivee - depart)), (t) => {
      this.globale = depart + (arrivee - depart) * t
      this.version++
    })
  }

  /** Ouvre la catégorie c (et ses ancêtres) : ses enfants en sortent. */
  ouvrir(c: number): void {
    for (let x = c; x >= 0; x = this.h.categories[x]!.parent) {
      if (this.ouverture[x]! < 0.999 || this.surcharges.get(x)?.cible === 0) this.poser(x, 1)
    }
  }

  /** Referme la catégorie c : ses descendants y rentrent. */
  replier(c: number): void {
    this.poser(c, 0)
    const pile = [...this.h.categories[c]!.enfants]
    while (pile.length) {
      const x = pile.pop()!
      this.retirer(x)
      pile.push(...this.h.categories[x]!.enfants)
    }
  }

  /** Bascule ouvert/fermé selon l'état affiché. */
  basculer(c: number): void {
    if (this.ouverture[c]! > 0.5) this.replier(c)
    else this.ouvrir(c)
  }

  /** Supprime toutes les surcharges locales (retour animé à la granularité globale). */
  reinitialiserLocales(): void {
    for (const c of [...this.surcharges.keys()]) this.retirer(c)
  }

  private poser(c: number, cible: 0 | 1): void {
    const og = this.ouvertureGlobale(c)
    const actuelle = this.ouverture[c]!
    const ancienne = this.surcharges.get(c)
    ancienne?.anim?.annuler()
    // λ de départ choisi pour que l'ouverture affichée reste continue.
    const lambda0 = Math.abs(cible - og) < 1e-6 ? 1 : clamp((actuelle - og) / (cible - og), 0, 1)
    const s: Surcharge = { cible, lambda: lambda0 }
    this.surcharges.set(c, s)
    s.anim = this.animateur.animer(this.duree() * Math.max(0.3, 1 - lambda0), (t) => {
      s.lambda = lambda0 + (1 - lambda0) * t
      this.version++
    })
    this.version++
  }

  private retirer(c: number): void {
    const s = this.surcharges.get(c)
    if (!s) return
    s.anim?.annuler()
    const l0 = s.lambda
    s.anim = this.animateur.animer(
      this.duree() * Math.max(0.3, l0),
      (t) => {
        s.lambda = l0 * (1 - t)
        this.version++
      },
      { fin: () => this.surcharges.get(c) === s && this.surcharges.delete(c) },
    )
  }

  /** Feuilles actives (filtres). En mode « masquer », les inactives sortent de l'agrégation. */
  definirActives(actives: Uint8Array, masquer: boolean): void {
    if (actives !== this.actives) this.actives.set(actives)
    this.masquerInactives = masquer
    this.nbActives.fill(0)
    const { chaine, nF } = this.h
    for (let f = 0; f < nF; f++) {
      if (!this.actives[f]) continue
      this.nbActives[chaine[f * 3]!]!++
      this.nbActives[chaine[f * 3 + 1]!]!++
      this.nbActives[chaine[f * 3 + 2]!]!++
    }
    this.version++
  }

  /** Recalcule ouvertures, présences et alphas. */
  calculer(): void {
    const { h } = this
    const { nF } = h
    for (const c of h.categories) {
      const og = this.ouvertureGlobale(c.index)
      const s = this.surcharges.get(c.index)
      const o = s ? og + (s.cible - og) * s.lambda : og
      this.ouverture[c.index] = o
      const u = nF + c.index
      const pres = c.parent < 0 ? 1 : this.presence[nF + c.parent]! * this.ouverture[c.parent]!
      this.presence[u] = pres
      const vide = this.masquerInactives && this.nbActives[c.index] === 0
      this.alpha[u] = vide ? 0 : pres * (1 - o)
    }
    for (let f = 0; f < nF; f++) {
      const s = h.chaine[f * 3 + 2]!
      const pres = this.presence[nF + s]! * this.ouverture[s]!
      this.presence[f] = pres
      this.alpha[f] = this.masquerInactives && !this.actives[f] ? 0 : pres
    }
  }

  /** Unité qui représente le mieux la feuille f dans l'état affiché (poids alpha maximal). */
  representant(f: number): number {
    const { h } = this
    let meilleure = f, poids = this.presence[f]!
    for (let k = 0; k < 3; k++) {
      const u = h.nF + h.chaine[f * 3 + k]!
      const p = this.presence[u]! * (1 - this.ouverture[h.chaine[f * 3 + k]!]!)
      if (p > poids) {
        poids = p
        meilleure = u
      }
    }
    return meilleure
  }

  /** Facteur d'interpolation de la feuille : 0 = dans son sous-thème, 1 = à sa place. */
  facteur(f: number): number {
    return this.ouverture[this.h.chaine[f * 3 + 2]!]!
  }

  /**
   * Positions affichées : chaque unité part de la position affichée de son parent et glisse
   * vers sa position cible `base` selon l'ouverture du parent, la courbe et la trajectoire.
   */
  calculerPositions(base: Float32Array, sortie: Float32Array, courbe: Courbe, trajectoire: Trajectoire): void {
    const { h } = this
    const { nF } = h
    const p = POINT
    const placer = (u: number, parentU: number, o: number) => {
      p.dx = sortie[parentU * 3]!
      p.dy = sortie[parentU * 3 + 1]!
      p.dz = sortie[parentU * 3 + 2]!
      p.ax = base[u * 3]!
      p.ay = base[u * 3 + 1]!
      p.az = base[u * 3 + 2]!
      p.t = o <= 0 ? 0 : o >= 1 ? 1 : courbe(o)
      p.graine = h.graines[u]!
      trajectoire(p)
      sortie[u * 3] = p.x
      sortie[u * 3 + 1] = p.y
      sortie[u * 3 + 2] = p.z
    }
    for (const c of h.categories) {
      const u = nF + c.index
      if (c.parent < 0) {
        sortie[u * 3] = base[u * 3]!
        sortie[u * 3 + 1] = base[u * 3 + 1]!
        sortie[u * 3 + 2] = base[u * 3 + 2]!
      } else placer(u, nF + c.parent, this.ouverture[c.parent]!)
    }
    for (let f = 0; f < nF; f++) {
      const s = h.chaine[f * 3 + 2]!
      placer(f, nF + s, this.ouverture[s]!)
    }
  }
}

const POINT: PointTrajectoire = { dx: 0, dy: 0, dz: 0, ax: 0, ay: 0, az: 0, t: 0, graine: 0, x: 0, y: 0, z: 0 }

// ─── Arêtes agrégées ─────────────────────────────────────────────────────────

export interface Paire {
  /** Clé numérique (source × nU + cible). */
  cle: number
  source: number
  cible: number
  /** Poids affiché : Σ alpha(source) × alpha(cible) sur les arêtes sous-jacentes. */
  poids: number
  /** Nombre d'arêtes feuilles sous-jacentes (poids > 0). */
  nombre: number
  /** Part du poids portée par des arêtes de la lignée active. */
  poidsLignee: number
  /** Clé de l'arête dans le graphe sigma. */
  cleSigma: string
  /** Vrai si les deux extrémités sont des feuilles (arête d'origine, orientée prémisse → cible). */
  feuille: boolean
}

/**
 * Arêtes affichées entre unités. Chaque arête feuille (s, t) répartit son poids sur les paires
 * (unité de la chaîne de s, unité de la chaîne de t) selon les alphas : à granularité entière on
 * retrouve exactement les arêtes agrégées classiques, et la transition est continue.
 */
export class AretesAgregees {
  readonly paires = new Map<number, Paire>()
  private versionCalculee = -1

  constructor(readonly h: Hierarchie) {}

  /**
   * Parcourt chaque arête feuille e et chaque paire d'unités affichées qu'elle alimente,
   * avec la part de poids correspondante.
   */
  private parcourir(g: Granularite, visiter: (e: number, u: number, v: number, feuille: boolean, poids: number) => void): void {
    const { nF, chaine, aretesSource, aretesCible } = this.h
    const cs = this.cs, ct = this.ct, as = this.as, at = this.at
    const remplir = (f: number, c: Int32Array, a: Float32Array) => {
      const d = chaine[f * 3]!, t = chaine[f * 3 + 1]!, s = chaine[f * 3 + 2]!
      const oD = g.ouverture[d]!, oT = g.ouverture[t]!, oS = g.ouverture[s]!
      c[0] = nF + d; c[1] = nF + t; c[2] = nF + s; c[3] = f
      a[0] = 1 - oD
      a[1] = oD * (1 - oT)
      a[2] = oD * oT * (1 - oS)
      a[3] = oD * oT * oS
    }
    const masquer = g.masquerInactives
    for (let e = 0; e < aretesSource.length; e++) {
      const s = aretesSource[e]!, t = aretesCible[e]!
      if (masquer && (!g.actives[s] || !g.actives[t])) continue
      remplir(s, cs, as)
      remplir(t, ct, at)
      for (let i = 0; i < 4; i++) {
        const ai = as[i]!
        if (ai < 1e-4) continue
        for (let j = 0; j < 4; j++) {
          const aj = at[j]!
          if (aj < 1e-4) continue
          // Même unité ou relation ancêtre/descendant : arête interne, pas dessinée.
          const k = Math.min(i, j)
          if (cs[k] === ct[k]) continue
          visiter(e, cs[i]!, ct[j]!, i === 3 && j === 3, ai * aj)
        }
      }
    }
  }
  private cs = new Int32Array(4)
  private ct = new Int32Array(4)
  private as = new Float32Array(4)
  private at = new Float32Array(4)

  private cle(u: number, v: number, feuille: boolean): number {
    return feuille ? u * this.h.nU + v : Math.min(u, v) * this.h.nU + Math.max(u, v)
  }

  /** Recalcule les poids ; renvoie les paires apparues et disparues (pour synchroniser sigma). */
  calculer(g: Granularite, force = false): { ajoutees: Paire[]; retirees: Paire[] } | null {
    if (!force && g.version === this.versionCalculee) return null
    this.versionCalculee = g.version
    for (const p of this.paires.values()) {
      p.poids = 0
      p.nombre = 0
    }
    const ajoutees: Paire[] = []
    this.parcourir(g, (_e, u, v, feuille, poids) => {
      const cle = this.cle(u, v, feuille)
      let p = this.paires.get(cle)
      if (!p) {
        const a = feuille ? u : Math.min(u, v), b = feuille ? v : Math.max(u, v)
        p = { cle, source: a, cible: b, poids: 0, nombre: 0, poidsLignee: 0, cleSigma: `${feuille ? 'f' : 'a'}${a}_${b}`, feuille }
        this.paires.set(cle, p)
        ajoutees.push(p)
      }
      p.poids += poids
      p.nombre++
    })
    const retirees: Paire[] = []
    for (const [cle, p] of this.paires) {
      if (p.nombre === 0) {
        retirees.push(p)
        this.paires.delete(cle)
      }
    }
    return { ajoutees, retirees }
  }

  /**
   * Part de chaque paire portée par des arêtes de la lignée : une arête feuille (s → t) en fait
   * partie si s et t sont ancêtres (ou sélection), ou si s est sélection/descendant et t descendant.
   */
  calculerLignee(g: Granularite, l: Lignee): void {
    for (const p of this.paires.values()) p.poidsLignee = 0
    if (!l.active) return
    const { aretesSource, aretesCible } = this.h
    const amont = (f: number) => l.ancetres[f] === 1 || l.graines[f] === 1
    const aval = (f: number) => l.descendants[f] === 1 || l.graines[f] === 1
    this.parcourir(g, (e, u, v, feuille, poids) => {
      const s = aretesSource[e]!, t = aretesCible[e]!
      if (!((amont(s) && amont(t)) || (aval(s) && l.descendants[t] === 1))) return
      const p = this.paires.get(this.cle(u, v, feuille))
      if (p) p.poidsLignee += poids
    })
  }

  /** Voisins affichés d'une unité (poids > seuil). */
  voisins(u: number, seuil = 0.02): Set<number> {
    const r = new Set<number>()
    for (const p of this.paires.values()) {
      if (p.poids / p.nombre < seuil) continue
      if (p.source === u) r.add(p.cible)
      else if (p.cible === u) r.add(p.source)
    }
    return r
  }
}

// ─── Statistiques d'agrégat ──────────────────────────────────────────────────

export interface StatsCategorie {
  nb: number
  nbActives: number
  statuts: Record<Statut, number>
  origines: Record<Origine, number>
  types: Record<TypeNoeud, number>
  validations: Record<Validation, number>
  dateMin: number
  dateMax: number
  confianceMoyenne: number
  /** Feuilles les plus importantes (par nombre de descendants). */
  principales: number[]
}

const compteur = <K extends string>(cles: readonly K[]) => Object.fromEntries(cles.map((k) => [k, 0])) as Record<K, number>

export function statistiquesCategorie(h: Hierarchie, c: number, actives?: Uint8Array): StatsCategorie {
  const cat = h.categories[c]!
  const s: StatsCategorie = {
    nb: cat.feuilles.length, nbActives: 0,
    statuts: compteur(STATUTS), origines: compteur(ORIGINES), types: compteur(TYPES_NOEUD), validations: compteur(VALIDATIONS),
    dateMin: Infinity, dateMax: -Infinity, confianceMoyenne: 0, principales: [],
  }
  let somme = 0
  const retenues: number[] = []
  for (const f of cat.feuilles) {
    if (actives && !actives[f]) continue
    const n = h.noeuds[f]!
    s.nbActives++
    s.statuts[n.statut]++
    s.origines[n.origine]++
    s.types[n.type]++
    s.validations[n.validation]++
    somme += n.confiance.estimation
    const d = h.dates[f]!
    if (d < s.dateMin) s.dateMin = d
    if (d > s.dateMax) s.dateMax = d
    retenues.push(f)
  }
  s.confianceMoyenne = s.nbActives ? somme / s.nbActives : 0
  s.principales = retenues.sort((a, b) => h.importance[b]! - h.importance[a]!).slice(0, 5)
  return s
}
