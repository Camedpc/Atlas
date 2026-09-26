// Lignée : ancêtres (tout ce dont un nœud découle) et descendants transitifs, projetés sur les agrégats.

import type { Hierarchie } from './hierarchie'

/** Parcours transitif depuis `depart` en suivant `voisins` ; les départs ne sont pas marqués. */
function parcourir(voisins: number[][], depart: Iterable<number>, sortie: Uint8Array): Uint8Array {
  sortie.fill(0)
  const pile: number[] = []
  for (const d of depart) pile.push(...voisins[d]!)
  while (pile.length) {
    const x = pile.pop()!
    if (sortie[x]) continue
    sortie[x] = 1
    for (const y of voisins[x]!) if (!sortie[y]) pile.push(y)
  }
  return sortie
}

export const ancetres = (h: Hierarchie, depart: Iterable<number>, sortie: Uint8Array = new Uint8Array(h.nF)) =>
  parcourir(h.premisses, depart, sortie)
export const descendants = (h: Hierarchie, depart: Iterable<number>, sortie: Uint8Array = new Uint8Array(h.nF)) =>
  parcourir(h.utilisePar, depart, sortie)

export type RoleLignee = 'aucune' | 'selection' | 'ancetre' | 'descendant' | 'hors'

export class Lignee {
  /** Unité sélectionnée (feuille ou agrégat), ou null. */
  selection: number | null = null
  inclureDescendants = true
  readonly graines: Uint8Array
  readonly ancetres: Uint8Array
  readonly descendants: Uint8Array
  /** Par catégorie : nombre de feuilles graines / ancêtres / descendants contenues. */
  readonly nbGraines: Int32Array
  readonly nbAncetres: Int32Array
  readonly nbDescendants: Int32Array
  version = 0

  constructor(readonly h: Hierarchie) {
    this.graines = new Uint8Array(h.nF)
    this.ancetres = new Uint8Array(h.nF)
    this.descendants = new Uint8Array(h.nF)
    this.nbGraines = new Int32Array(h.nC)
    this.nbAncetres = new Int32Array(h.nC)
    this.nbDescendants = new Int32Array(h.nC)
  }

  get active(): boolean {
    return this.selection !== null
  }

  selectionner(u: number | null): void {
    this.selection = u
    this.recalculer()
  }

  definirDescendants(inclure: boolean): void {
    this.inclureDescendants = inclure
    this.recalculer()
  }

  private recalculer(): void {
    const { h } = this
    this.graines.fill(0)
    this.nbGraines.fill(0)
    this.nbAncetres.fill(0)
    this.nbDescendants.fill(0)
    if (this.selection === null) {
      this.ancetres.fill(0)
      this.descendants.fill(0)
      this.version++
      return
    }
    const u = this.selection
    const graines = u < h.nF ? [u] : h.categories[u - h.nF]!.feuilles
    for (const g of graines) this.graines[g] = 1
    ancetres(h, graines, this.ancetres)
    if (this.inclureDescendants) descendants(h, graines, this.descendants)
    else this.descendants.fill(0)
    for (let f = 0; f < h.nF; f++) {
      const g = this.graines[f], a = this.ancetres[f], d = this.descendants[f]
      if (!g && !a && !d) continue
      for (let k = 0; k < 3; k++) {
        const c = h.chaine[f * 3 + k]!
        if (g) this.nbGraines[c]!++
        if (a) this.nbAncetres[c]!++
        if (d) this.nbDescendants[c]!++
      }
    }
    this.version++
  }

  /** Rôle d'une unité dans la lignée courante. */
  role(u: number): RoleLignee {
    if (this.selection === null) return 'aucune'
    const { h } = this
    if (u < h.nF) {
      if (this.graines[u]) return 'selection'
      if (this.ancetres[u]) return 'ancetre'
      if (this.descendants[u]) return 'descendant'
      return 'hors'
    }
    const c = u - h.nF
    // Un agrégat qui contient la sélection est « sélection », sinon on privilégie les ancêtres.
    if (this.nbGraines[c]! > 0) return 'selection'
    if (this.nbAncetres[c]! > 0) return 'ancetre'
    if (this.nbDescendants[c]! > 0) return 'descendant'
    return 'hors'
  }

  /** Part des feuilles de l'agrégat qui appartiennent à la lignée (0…1). */
  part(u: number): number {
    const { h } = this
    if (u < h.nF) return this.role(u) === 'hors' || this.role(u) === 'aucune' ? 0 : 1
    const c = h.categories[u - h.nF]!
    return Math.min(1, (this.nbGraines[c.index]! + this.nbAncetres[c.index]! + this.nbDescendants[c.index]!) / c.feuilles.length)
  }
}
