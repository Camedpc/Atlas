// Agrégation alternative : « squelette par importance ».
//
// On calcule un score d'importance par nœud (descendants transitifs, centralité de degré, bonus
// pour les résultats majeurs), puis on garde visibles les nœuds dont le rang dépasse un seuil
// (les « clés »). Chaque autre nœud se replie vers son ancêtre clé le plus proche dans le DAG
// (à défaut son descendant clé le plus proche, puis la meilleure clé de sa catégorie).
//
// Mise en œuvre sans toucher au moteur : la granularité globale reste à 3 (tout est « ouvert »),
// on enveloppe `granularite.calculerPositions` pour tirer chaque nœud replié vers sa clé
// (même trajectoire d'étincelle que les transitions de catégories), et les réducteurs de la
// variante règlent opacité, taille et arêtes (une seule arête affichée par paire de clés).

import type { Courbe, PointTrajectoire, Trajectoire, VueGraphe } from '../../src/core'

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

export interface PoidsImportance {
  descendants: number
  centralite: number
  resultats: number
}

export class Squelette {
  readonly nF: number
  /** Score brut et rang (percentile 0…1) par feuille. */
  readonly score: Float32Array
  readonly rang: Float32Array
  /** 1 si la feuille est une clé. */
  readonly cle: Uint8Array
  /** Clé vers laquelle la feuille se replie (elle-même si clé). */
  readonly cible: Int32Array
  /** État animé : 0 = à sa place, 1 = replié dans sa clé. */
  readonly repli: Float32Array
  /** Somme des replis des feuilles absorbées, par clé (animée). */
  readonly absorbes: Float32Array
  /** Nombre de feuilles repliées (cible) par clé. */
  readonly nbAbsorbes: Int32Array
  /** Mode actif (agrégation « importance »). */
  actif = false
  /** Clés ouvertes localement (double-clic) : leurs feuilles restent dehors. */
  readonly ouvertes = new Set<number>()
  /** Feuilles de la lignée gardées dehors. */
  readonly gardees: Uint8Array
  /** Incrémentée à chaque changement de cibles. */
  version = 0
  nbCles = 0

  /** Arêtes feuilles retenues (clé s·nF + t) → nombre d'arêtes représentées. */
  readonly aretesRetenues = new Map<number, number>()

  private depart: Float32Array
  private arrivee: Float32Array
  private ancienne: Int32Array
  private transfert: Float32Array
  private debut: Float64Array
  private duree = 900
  private enCours = false

  constructor(private vue: VueGraphe) {
    const nF = (this.nF = vue.h.nF)
    this.score = new Float32Array(nF)
    this.rang = new Float32Array(nF)
    this.cle = new Uint8Array(nF).fill(1)
    this.cible = Int32Array.from({ length: nF }, (_, i) => i)
    this.repli = new Float32Array(nF)
    this.absorbes = new Float32Array(nF)
    this.nbAbsorbes = new Int32Array(nF)
    this.gardees = new Uint8Array(nF)
    this.depart = new Float32Array(nF)
    this.arrivee = new Float32Array(nF)
    this.ancienne = Int32Array.from({ length: nF }, (_, i) => i)
    this.transfert = new Float32Array(nF).fill(1)
    this.debut = new Float64Array(nF)
  }

  get enAnimation(): boolean {
    return this.enCours
  }

  /** Vrai si le squelette influence l'affichage (actif ou en train de se défaire). */
  get engage(): boolean {
    return this.actif || this.enCours
  }

  /** Scores et rangs d'importance. */
  calculerScores(p: PoidsImportance): void {
    const { h } = this.vue
    const nF = this.nF
    let degMax = 1
    for (let f = 0; f < nF; f++) degMax = Math.max(degMax, h.premisses[f]!.length + h.utilisePar[f]!.length)
    for (let f = 0; f < nF; f++) {
      const n = h.noeuds[f]!
      const desc = Math.sqrt(h.importance[f]! / h.importanceMax)
      const deg = Math.sqrt((h.premisses[f]!.length + h.utilisePar[f]!.length) / degMax)
      let bonus = 0
      if (n.type === 'resultat') bonus += 1
      else if (n.type === 'lemme') bonus += 0.35
      if (n.statut === 'valide') bonus += 0.25
      if (n.validation === 'ia_humain') bonus += 0.2
      if (n.statut === 'refute') bonus -= 0.4
      // Petite part déterministe pour départager les ex æquo.
      this.score[f] = p.descendants * desc + p.centralite * deg + p.resultats * 0.5 * bonus + h.graines[f]! * 1e-3
    }
    const ordre = Array.from({ length: nF }, (_, i) => i).sort((a, b) => this.score[a]! - this.score[b]!)
    ordre.forEach((f, i) => (this.rang[f] = nF > 1 ? i / (nF - 1) : 1))
  }

  /** Choisit les clés (rang ≥ seuil) et la clé de repli de chaque feuille. */
  calculerCles(seuil: number): void {
    const { h } = this.vue
    const nF = this.nF
    let nb = 0
    for (let f = 0; f < nF; f++) {
      this.cle[f] = this.rang[f]! >= seuil ? 1 : 0
      nb += this.cle[f]!
    }
    if (nb === 0) {
      // Garder au moins le nœud le plus important.
      let m = 0
      for (let f = 1; f < nF; f++) if (this.rang[f]! > this.rang[m]!) m = f
      this.cle[m] = 1
      nb = 1
    }
    this.nbCles = nb
    // Meilleure clé par catégorie (sous-thème, thème, domaine) pour les nœuds isolés.
    const meilleure = new Int32Array(h.nC).fill(-1)
    for (let f = 0; f < nF; f++) {
      if (!this.cle[f]) continue
      for (let k = 0; k < 3; k++) {
        const c = h.chaine[f * 3 + k]!
        if (meilleure[c]! < 0 || this.score[f]! > this.score[meilleure[c]!]!) meilleure[c] = f
      }
    }
    const vu = new Int32Array(nF).fill(-1)
    let front: number[] = [], suivant: number[] = []
    // `marque` distingue les parcours (évite de réinitialiser `vu` à chaque feuille).
    const plusProche = (f: number, voisins: number[][], marque: number): number => {
      front.length = 0
      front.push(f)
      vu[f] = marque
      while (front.length) {
        let choix = -1
        suivant.length = 0
        for (const x of front) {
          for (const y of voisins[x]!) {
            if (vu[y] === marque) continue
            vu[y] = marque
            if (this.cle[y] && (choix < 0 || this.score[y]! > this.score[choix]!)) choix = y
            suivant.push(y)
          }
        }
        if (choix >= 0) return choix
        ;[front, suivant] = [suivant, front]
      }
      return -1
    }
    for (let f = 0; f < nF; f++) {
      if (this.cle[f]) {
        this.cible[f] = f
        continue
      }
      let c = plusProche(f, h.premisses, f)
      if (c < 0) c = plusProche(f, h.utilisePar, nF + f)
      for (let k = 2; c < 0 && k >= 0; k--) c = meilleure[h.chaine[f * 3 + k]!]!
      this.cible[f] = c < 0 ? f : c
    }
    // Les ouvertures locales qui ne sont plus des clés disparaissent.
    for (const k of [...this.ouvertes]) if (!this.cle[k]) this.ouvertes.delete(k)
  }

  /** Feuilles de la lignée à garder hors du squelette. */
  definirGardees(masque: Uint8Array | null): void {
    if (masque) this.gardees.set(masque)
    else this.gardees.fill(0)
  }

  /** Recalcule les cibles de repli et lance les animations (départs dispersés). */
  majCibles(duree: number, dispersion: number): void {
    const { h } = this.vue
    const maintenant = performance.now()
    this.duree = Math.max(50, duree)
    this.nbAbsorbes.fill(0)
    for (let f = 0; f < this.nF; f++) {
      const k = this.cible[f]!
      const veut = this.actif && k !== f && !this.ouvertes.has(k) && !this.gardees[f] ? 1 : 0
      if (veut) this.nbAbsorbes[k]!++
      const changeCle = k !== this.ancienne[f] && this.repli[f]! > 0.001
      if (veut === this.arrivee[f] && !changeCle) continue
      if (changeCle) {
        // La feuille glisse de son ancienne clé vers la nouvelle.
        this.transfert[f] = 0
      } else {
        this.ancienne[f] = k
        this.transfert[f] = 1
      }
      this.depart[f] = this.repli[f]!
      this.arrivee[f] = veut
      this.debut[f] = maintenant + h.graines[f]! * dispersion * this.duree
      this.enCours = true
    }
    this.retenirAretes()
    this.version++
  }

  /** Représentant cible (clé si la feuille doit être repliée). */
  representantCible(f: number): number {
    return this.arrivee[f]! > 0.5 ? this.cible[f]! : f
  }

  /** Représentant affiché (clé si la feuille est majoritairement repliée). */
  representant(f: number): number {
    return this.repli[f]! > 0.5 ? this.cible[f]! : f
  }

  /** Filtrage des arêtes : toutes les paires, les k plus fortes par clé, ou clé → clé directes. */
  modeAretes: 'toutes' | 'fortes' | 'directes' = 'fortes'
  aretesParCle = 2
  /** Nombre de paires de représentants avant filtrage (pour le panneau). */
  nbPairesBrutes = 0

  /** Une seule arête affichée par paire orientée de représentants, épaisseur ∝ nombre. */
  retenirAretes(): void {
    const { h } = this.vue
    const nF = this.nF
    const paires = new Map<number, { cf: number; n: number; a: number; b: number }>()
    this.aretesRetenues.clear()
    const { aretesSource: S, aretesCible: T } = h
    const directes = this.modeAretes === 'directes'
    for (let e = 0; e < S.length; e++) {
      const s = S[e]!, t = T[e]!
      const rs = this.representantCible(s), rt = this.representantCible(t)
      if (rs === rt) continue
      if (directes && (rs !== s || rt !== t)) continue
      const cp = rs * nF + rt
      const p = paires.get(cp)
      if (p) p.n++
      else paires.set(cp, { cf: s * nF + t, n: 1, a: rs, b: rt })
    }
    this.nbPairesBrutes = paires.size
    let gardees = [...paires.values()]
    if (this.modeAretes === 'fortes') {
      // Une paire reste si elle est parmi les k plus fortes de l'une de ses deux extrémités.
      const parNoeud = new Map<number, { n: number; i: number }[]>()
      gardees.forEach((p, i) => {
        for (const x of [p.a, p.b]) {
          let l = parNoeud.get(x)
          if (!l) parNoeud.set(x, (l = []))
          l.push({ n: p.n, i })
        }
      })
      const garder = new Uint8Array(gardees.length)
      for (const l of parNoeud.values()) {
        l.sort((x, y) => y.n - x.n)
        for (let j = 0; j < Math.min(this.aretesParCle, l.length); j++) garder[l[j]!.i] = 1
      }
      gardees = gardees.filter((_, i) => garder[i])
    }
    for (const p of gardees) this.aretesRetenues.set(p.cf, p.n)
  }

  /** Avance les animations ; renvoie vrai s'il en reste. */
  avancer(maintenant: number, courbe: Courbe): boolean {
    if (!this.enCours) return false
    let reste = false
    for (let f = 0; f < this.nF; f++) {
      const d = this.depart[f]!, a = this.arrivee[f]!
      if (this.repli[f] === a && this.transfert[f] === 1) continue
      const t = clamp01((maintenant - this.debut[f]!) / this.duree)
      const e = courbe(t)
      this.repli[f] = t >= 1 ? a : d + (a - d) * e
      if (this.transfert[f]! < 1) {
        this.transfert[f] = t >= 1 ? 1 : e
        if (t >= 1) this.ancienne[f] = this.cible[f]!
      }
      if (t < 1) reste = true
    }
    this.enCours = reste
    return reste
  }

  /** Vrai si la feuille est en mouvement (pour les traînées). */
  enMouvement(f: number): boolean {
    const r = this.repli[f]!
    return (r > 0.001 && r < 0.999) || this.transfert[f]! < 1
  }

  /**
   * Tire chaque feuille repliée vers sa clé. Appelée juste après le calcul des positions du
   * moteur (qui a déjà placé chaque feuille à sa place de granularité).
   */
  appliquer(sortie: Float32Array, courbe: Courbe, trajectoire: Trajectoire): void {
    this.avancer(performance.now(), courbe)
    this.absorbes.fill(0)
    if (!this.engage) return
    const { h } = this.vue
    const p = POINT
    for (let f = 0; f < this.nF; f++) {
      const r = this.repli[f]!
      if (r <= 1e-4) continue
      const k = this.cible[f]!
      if (k === f) continue
      this.absorbes[k]! += r
      const tr = this.transfert[f]!
      const o = this.ancienne[f]!
      // Point de départ : la clé (ou le glissement de l'ancienne clé vers la nouvelle).
      p.dx = sortie[o * 3]! + (sortie[k * 3]! - sortie[o * 3]!) * tr
      p.dy = sortie[o * 3 + 1]! + (sortie[k * 3 + 1]! - sortie[o * 3 + 1]!) * tr
      p.dz = sortie[o * 3 + 2]! + (sortie[k * 3 + 2]! - sortie[o * 3 + 2]!) * tr
      p.ax = sortie[f * 3]!
      p.ay = sortie[f * 3 + 1]!
      p.az = sortie[f * 3 + 2]!
      p.t = 1 - r
      p.graine = h.graines[f]!
      p.unite = f
      p.parent = k
      p.sens = this.arrivee[f]! > this.depart[f]! ? -1 : 1
      trajectoire(p)
      sortie[f * 3] = p.x
      sortie[f * 3 + 1] = p.y
      sortie[f * 3 + 2] = p.z
    }
  }
}

const POINT: PointTrajectoire = { dx: 0, dy: 0, dz: 0, ax: 0, ay: 0, az: 0, t: 0, graine: 0, x: 0, y: 0, z: 0 }
