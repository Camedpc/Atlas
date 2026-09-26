// Lentille focus + contexte : dans un disque autour du curseur (ou du doigt en appui long), les
// agrégats s'ouvrent localement ; hors du disque, ils rentrent dans leur parent. Délais d'entrée et
// de sortie + hystérésis sur le rayon évitent que ça « frétille ». Déformation fisheye optionnelle.

import type { Projection, VueGraphe } from '../../src/core'

interface Suivi {
  /** Instant où la catégorie a cessé de toucher la lentille (0 = elle la touche). */
  sortie: number
}

/** Accès à la méthode privée `Granularite.retirer` (retour animé à la granularité globale). */
type GranulariteInterne = { retirer(c: number): void }

export class Lentille {
  /** Centre (pixels du conteneur de la scène). */
  x = 0
  y = 0
  /** Pointeur souris dans la scène. */
  dedans = false
  epinglee = false
  /** Appui long tactile en cours (la lentille suit le doigt). */
  tactile = false
  /** Présence affichée 0…1, lissée (apparition / disparition douces). */
  intensite = 0
  /** Catégories ouvertes par la lentille. */
  readonly suivies = new Map<number, Suivi>()
  /** Catégories sous la lentille en attente d'ouverture : instant d'entrée. */
  private candidates = new Map<number, number>()
  private ecouteurs = new Set<() => void>()

  constructor(private vue: VueGraphe) {}

  private R<T extends number | boolean>(cle: string): T {
    return this.vue.reglages.lire<T>(cle)
  }

  get rayon(): number {
    return this.R<number>('rayonLentille')
  }

  /** La lentille doit-elle être présente ? */
  get voulue(): boolean {
    return this.R<boolean>('lentille') && (this.dedans || this.epinglee || this.tactile)
  }

  /** Prévient l'interface (puce d'état, fil d'Ariane) d'un changement d'état. */
  quandChange(f: () => void): void {
    this.ecouteurs.add(f)
  }
  notifier(): void {
    for (const f of this.ecouteurs) f()
  }

  epingler(etat = !this.epinglee): void {
    this.epinglee = etat
    if (etat && !this.dedans && !this.tactile && this.x === 0 && this.y === 0) {
      // Pas de position connue (commande clavier) : centre de l'écran.
      this.x = this.vue.rendu.largeur / 2
      this.y = this.vue.rendu.hauteur / 2
    }
    this.notifier()
    this.vue.demanderRendu()
  }

  /** Influence 0…1 d'un point écran : 1 au centre, 0 au bord et au-delà (pondérée par l'intensité). */
  influence(px: number, py: number): number {
    if (this.intensite <= 0.001) return 0
    const d = Math.hypot(px - this.x, py - this.y) / this.rayon
    return d >= 1 ? 0 : (1 - d) * this.intensite
  }

  /** Lisse l'intensité ; renvoie vrai tant qu'elle évolue. */
  lisser(dt: number): boolean {
    const cible = this.voulue ? 1 : 0
    const tau = this.R<number>('lissageLentille')
    const k = tau <= 0 ? 1 : 1 - Math.exp(-dt / tau)
    this.intensite += (cible - this.intensite) * k
    if (Math.abs(cible - this.intensite) < 0.004) this.intensite = cible
    return this.intensite !== cible
  }

  /**
   * Déformation fisheye (Sarkar & Brown) des positions écran dans le disque : d' = R·(k+1)t / (kt+1),
   * t = d/R. Continue au bord (d' = R en d = R), agrandit le centre. Appliquée en place à la
   * projection juste avant que sigma ne lise les positions.
   */
  deformer(p: Projection, n: number): void {
    const k = this.R<number>('fisheye') * this.intensite
    if (k <= 0.001) return
    const R = this.rayon, cx = this.x, cy = this.y
    for (let u = 0; u < n; u++) {
      const dx = p.x[u]! - cx, dy = p.y[u]! - cy
      if (Math.abs(dx) >= R || Math.abs(dy) >= R) continue
      const d = Math.hypot(dx, dy)
      if (d >= R || d < 1e-6) continue
      const t = d / R
      const s = (k + 1) / (k * t + 1)
      p.x[u] = cx + dx * s
      p.y[u] = cy + dy * s
    }
  }

  /** Même déformation pour un point isolé (grille de la loupe). */
  deformerPoint(px: number, py: number, sortie: { x: number; y: number }): void {
    const k = this.R<number>('fisheye') * this.intensite
    const dx = px - this.x, dy = py - this.y
    const d = Math.hypot(dx, dy), R = this.rayon
    if (k <= 0.001 || d >= R || d < 1e-6) {
      sortie.x = px
      sortie.y = py
      return
    }
    const s = (k + 1) / ((k * d) / R + 1)
    sortie.x = this.x + dx * s
    sortie.y = this.y + dy * s
  }

  private distance(u: number): number {
    const p = this.vue.projection
    return Math.hypot(p.x[u]! - this.x, p.y[u]! - this.y)
  }

  /** Vrai si la catégorie c (ou ce qui en est sorti) touche le disque de rayon r. */
  private touche(c: number, r: number): boolean {
    const { h, granularite: g } = this.vue
    const cat = h.categories[c]!
    if (this.distance(cat.unite) < r) return true
    if (cat.niveau === 2) {
      for (const f of cat.feuilles) if (g.alpha[f]! > 0.05 && this.distance(f) < r) return true
      return false
    }
    for (const e of cat.enfants) {
      if (this.suivies.has(e) ? this.touche(e, r) : this.distance(h.categories[e]!.unite) < r + this.vue.tailleAffichee[h.categories[e]!.unite]! * 0.5) return true
    }
    return false
  }

  private retirer(c: number): void {
    ;(this.vue.granularite as unknown as GranulariteInterne).retirer(c)
  }

  /** Referme c et les catégories qu'elle contient ouvertes par la lentille (les plus profondes d'abord). */
  private fermer(c: number): void {
    const { h } = this.vue
    const u = h.categories[c]!.unite
    const liste = [...this.suivies.keys()].filter((d) => h.contient(u, h.categories[d]!.unite))
    liste.sort((a, b) => h.categories[b]!.niveau - h.categories[a]!.niveau)
    for (const d of liste) {
      this.suivies.delete(d)
      this.retirer(d)
    }
  }

  /** Referme tout ce que la lentille a ouvert (lentille désactivée). */
  toutFermer(): void {
    const { h } = this.vue
    const racines = [...this.suivies.keys()].filter((c) => {
      const p = h.categories[c]!.parent
      return p < 0 || !this.suivies.has(p)
    })
    for (const c of racines) this.fermer(c)
    this.candidates.clear()
    this.vue.demanderRendu()
  }

  /** Logique d'ouverture / fermeture, appelée à intervalle régulier. */
  mettreAJour(t: number): void {
    const v = this.vue
    const { h, granularite: g } = v
    const actif = this.voulue
    const R = this.rayon
    const hyst = this.R<number>('hysteresis')
    const base = Math.floor(g.globale + 1e-3)
    const profondeur = this.R<number>('profondeurLentille')
    const dOuv = this.R<number>('delaiOuverture')
    const dFerm = this.R<number>('delaiFermeture')
    let change = false

    // 1. Fermetures (hystérésis : on ne referme qu'au-delà de R × hystérésis, après un délai).
    for (const [c, s] of [...this.suivies]) {
      if (!this.suivies.has(c)) continue
      const u = h.categories[c]!.unite
      // Plus pertinent : rentrée dans un parent fermé, ou déjà ouverte par la granularité globale.
      if (g.presence[u]! < 0.1 || g.ouvertureGlobale(c) >= 0.999) {
        this.fermer(c)
        change = true
        continue
      }
      if (actif && this.touche(c, R * hyst)) s.sortie = 0
      else if (!s.sortie) s.sortie = t
      else if (t - s.sortie >= dFerm) {
        this.fermer(c)
        change = true
      }
    }

    // 2. Ouvertures : agrégat visible, fermé, assez peu profond, sous la lentille depuis dOuv ms.
    if (actif) {
      const vus = new Set<number>()
      for (const cat of h.categories) {
        const c = cat.index
        if (cat.niveau >= base + profondeur || this.suivies.has(c)) continue
        const u = cat.unite
        if (g.presence[u]! < 0.9 || g.ouverture[c]! > 0.5 || g.nbActives[c] === 0 || g.surcharge(c) !== null) continue
        if (this.distance(u) >= R + v.tailleAffichee[u]! * 0.5) continue
        vus.add(c)
        const debut = this.candidates.get(c)
        if (debut === undefined) this.candidates.set(c, t)
        else if (t - debut >= dOuv) {
          this.candidates.delete(c)
          this.suivies.set(c, { sortie: 0 })
          g.ouvrir(c)
          change = true
        }
      }
      for (const c of [...this.candidates.keys()]) if (!vus.has(c)) this.candidates.delete(c)
    } else this.candidates.clear()

    if (change) {
      v.demanderRendu()
      this.notifier()
    }
  }

  /** Unité la plus proche du centre dans la lentille (pour le fil d'Ariane), ou null. */
  uniteAuCentre(): number | null {
    if (this.intensite < 0.2) return null
    const v = this.vue
    let meilleure: number | null = null, dMin = this.rayon
    for (let u = 0; u < v.h.nU; u++) {
      if (v.opaciteAffichee[u]! < 0.1) continue
      const d = this.distance(u)
      if (d < dMin) {
        dMin = d
        meilleure = u
      }
    }
    return meilleure
  }
}
