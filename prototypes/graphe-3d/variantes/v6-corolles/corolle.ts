// Trajectoire « corolle » : à l'ouverture LOCALE d'un agrégat (ou de peu d'agrégats), ses enfants
// éclosent en éventail ordonné autour du parent (anneau de pétales dans le plan de l'écran), puis
// rejoignent leur position ; à l'agrégation ils reviennent sur l'anneau et se replient au centre.
// Quand beaucoup d'agrégats s'ouvrent ensemble (granularité globale), variante sobre : trajet
// direct, mais les parents partent en « vague » (décalage dans le temps selon leur position écran),
// ce qui évite la superposition de dizaines de corolles.
//
// Itération 2 : le moteur fournit `unite`, `parent`, `o` (ouverture brute, linéaire dans le temps)
// et `sens` ; on applique nous-mêmes décalage puis courbe sur `o` (départ immédiat).

import { COURBES, STATUTS, TRAJECTOIRES, VALIDATIONS, clamp, type Courbe, type PointTrajectoire, type VueGraphe } from '../../src/core'

export type OrdreEclosion = 'statut' | 'date' | 'validation' | 'confiance'
export type FormeTrajectoire = 'corolle' | keyof typeof TRAJECTOIRES

const lisse = (t: number) => t * t * (3 - 2 * t)

export class Corolle {
  /** Rang normalisé [0,1] de chaque unité parmi ses frères (ordre de l'éclosion). */
  readonly rang: Float32Array
  /** Angle écran (radians, sens horaire, −π/2 = haut) de chaque unité autour de son parent. */
  readonly angle: Float32Array
  /** Rayon (px) de l'anneau de pétales de chaque unité (celui de son parent). */
  readonly rayonPx: Float32Array
  /** Retard (0…1) de chaque parent dans la vague d'une ouverture globale. */
  readonly retardVague: Float32Array
  /** Nombre de catégories en transition (image précédente) et si la corolle complète s'applique. */
  nbEnTransition = 0
  private sale = true
  /** Paramètres lus à chaque image (mis à jour par main.ts). */
  forme: FormeTrajectoire = 'corolle'
  phase = 0.45
  decalage = 0.12
  vague = 0.35
  seuilCorolle = 3

  constructor(
    private vue: VueGraphe,
    /** Rayon d'anneau d'un agrégat pour n feuilles (px, sans perspective). */
    private rayonAgregat: (n: number) => number,
  ) {
    const { h } = vue
    this.rang = new Float32Array(h.nU)
    this.angle = new Float32Array(h.nU)
    this.rayonPx = new Float32Array(h.nU)
    this.retardVague = new Float32Array(h.nC)
    vue.granularite.version++
  }

  /**
   * Après chaque image : compte les catégories en transition et calcule la vague (rang de gauche
   * à droite à l'écran, pour une lecture continue). Utilisé à l'image suivante.
   */
  observer(): void {
    const { h, granularite: g, projection: p } = this.vue
    const enCours: number[] = []
    for (let c = 0; c < h.nC; c++) {
      const o = g.ouverture[c]!
      if (o > 1e-3 && o < 0.999) enCours.push(c)
    }
    // On ne recalcule la vague qu'au démarrage d'une transition (ordre stable ensuite).
    if (enCours.length && enCours.length !== this.nbEnTransition) {
      enCours.sort((a, b) => p.x[h.nF + a]! - p.x[h.nF + b]!)
      enCours.forEach((c, i) => (this.retardVague[c] = enCours.length > 1 ? i / (enCours.length - 1) : 0))
    }
    this.nbEnTransition = enCours.length
  }

  /** Vrai si l'ouverture de la catégorie c mérite la corolle complète. */
  corolleComplete(c: number): boolean {
    return this.vue.granularite.surcharge(c) !== null || this.nbEnTransition <= this.seuilCorolle
  }

  invalider(): void {
    this.sale = true
    this.vue.granularite.version++
    this.vue.demanderRendu()
  }

  /** Ordre, angles et rayons des pétales, par parent. */
  private calculer(): void {
    this.sale = false
    const v = this.vue
    const { h } = v
    const R = v.reglages
    const ordre = R.lire<OrdreEclosion>('ordreEclosion')
    const arc = (clamp(R.lire<number>('arcCorolle'), 30, 360) * Math.PI) / 180
    const amplitude = R.lire<number>('amplitudeCorolle')
    const tailleFeuille = R.valeurs.tailleNoeud * (1 + 0.5 * R.valeurs.tailleImportance)
    const actives = v.granularite.actives

    // Clé de tri d'une feuille / d'une catégorie (moyenne sur ses feuilles actives).
    const cleFeuille = (f: number): number => {
      const n = h.noeuds[f]!
      switch (ordre) {
        case 'statut': return STATUTS.indexOf(n.statut) + 1e-3 * ((h.dates[f]! - h.dateMin) / (h.dateMax - h.dateMin))
        case 'validation': return -VALIDATIONS.indexOf(n.validation) + 1e-3 * ((h.dates[f]! - h.dateMin) / (h.dateMax - h.dateMin))
        case 'confiance': return -n.confiance.estimation
        default: return h.dates[f]!
      }
    }
    const cleCategorie = (c: number): number => {
      let s = 0, k = 0
      for (const f of h.categories[c]!.feuilles) {
        if (!actives[f]) continue
        s += cleFeuille(f)
        k++
      }
      return k ? s / k : Infinity
    }
    const disposer = (enfants: number[], cle: (u: number) => number, diametre: (u: number) => number, nParent: number) => {
      const cles = new Map(enfants.map((u) => [u, cle(u)]))
      enfants.sort((a, b) => cles.get(a)! - cles.get(b)!)
      const n = enfants.length
      const plein = arc >= 2 * Math.PI - 1e-3
      const debut = plein ? -Math.PI / 2 : -Math.PI / 2 - arc / 2
      let perimetre = 0, dMax = 0
      for (const u of enfants) {
        const d = diametre(u)
        perimetre += d
        dMax = Math.max(dMax, d)
      }
      // Les pétales se posent juste hors de l'anneau parent, sans se chevaucher entre eux.
      const rayon = amplitude * Math.max(this.rayonAgregat(nParent) + dMax / 2 + 8, perimetre / arc)
      enfants.forEach((u, k) => {
        this.rang[u] = n > 1 ? k / (n - 1) : 0
        this.angle[u] = debut + (arc * (k + 0.5)) / n
        this.rayonPx[u] = rayon
      })
    }
    for (const c of h.categories) {
      const nParent = Math.max(1, v.granularite.nbActives[c.index]!)
      if (c.niveau === 2) {
        disposer([...c.feuilles], cleFeuille, () => 2 * tailleFeuille + 3, nParent)
      } else {
        const enfants = c.enfants.map((e) => h.nF + e)
        disposer(enfants, (u) => cleCategorie(u - h.nF), (u) => 2 * this.rayonAgregat(Math.max(1, v.granularite.nbActives[u - h.nF]!)) + 8, nParent)
      }
    }
  }

  /** Trajectoire à passer au moteur (options.trajectoire). */
  readonly trajectoire = (p: PointTrajectoire): void => {
    const v = this.vue
    const h = v.h
    const u = p.unite ?? -1
    const parent = p.parent ?? -1
    const courbe: Courbe = COURBES[v.reglages.valeurs.courbe] ?? COURBES.sortie
    if (u < 0 || parent < h.nF || this.forme !== 'corolle') {
      if (this.forme !== 'corolle') return (TRAJECTOIRES[this.forme] ?? TRAJECTOIRES.droite)(p)
      return TRAJECTOIRES.droite(p)
    }
    const c = parent - h.nF
    const o = p.o ?? p.t
    if (this.sale) this.calculer()
    const fin = (t: number) => {
      if (t <= 0) { p.x = p.dx; p.y = p.dy; p.z = p.dz; return true }
      if (t >= 1) { p.x = p.ax; p.y = p.ay; p.z = p.az; return true }
      return false
    }
    if (!this.corolleComplete(c)) {
      // Ouverture globale : trajet direct, parents décalés en vague.
      const d = this.vague * this.retardVague[c]!
      const t = courbe(clamp((o - d) / Math.max(0.05, 1 - d), 0, 1))
      if (fin(t)) return
      p.x = p.dx + (p.ax - p.dx) * t
      p.y = p.dy + (p.ay - p.dy) * t
      p.z = p.dz + (p.az - p.dz) * t
      return
    }
    // Corolle : les enfants éclosent l'un après l'autre (cascade courte), puis courbe.
    const s = this.decalage
    const t = courbe(s > 0 ? clamp((o - s * this.rang[u]!) / (1 - s), 0, 1) : o)
    if (fin(t)) return
    const cam = v.camera
    const k = cam.pixelsParUnite()
    const rw = this.rayonPx[u]! / Math.max(1e-6, k)
    const th = this.angle[u]!
    const cx = Math.cos(th) * rw, cy = -Math.sin(th) * rw // y écran vers le bas = −haut
    const dr = cam.droite, hh = cam.haut
    const ph = clamp(this.phase, 0.05, 0.95)
    const s1 = lisse(clamp(t / ph, 0, 1))
    const s2 = lisse(clamp((t - ph * 0.75) / (1 - ph * 0.75), 0, 1))
    const px = p.dx + (dr[0] * cx + hh[0] * cy) * s1
    const py = p.dy + (dr[1] * cx + hh[1] * cy) * s1
    const pz = p.dz + (dr[2] * cx + hh[2] * cy) * s1
    p.x = px + (p.ax - px) * s2
    p.y = py + (p.ay - py) * s2
    p.z = pz + (p.az - pz) * s2
  }
}
