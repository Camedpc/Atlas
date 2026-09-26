// Filtres : période, type, origine, statut, validation, confiance minimale, catégories, texte.
// Deux comportements : « masquer » (les nœuds sortent aussi de l'agrégation) ou « estomper ».

import type { Origine, Statut, TypeNoeud, Validation } from './donnees'
import type { Hierarchie } from './hierarchie'

export type ModeFiltre = 'masquer' | 'estomper'

export interface EtatFiltres {
  /** [début, fin] en ms, ou null = toute la période. */
  periode: [number, number] | null
  typesExclus: Set<TypeNoeud>
  originesExclues: Set<Origine>
  statutsExclus: Set<Statut>
  validationsExclues: Set<Validation>
  confianceMin: number
  /** Index de catégories exclues (tout niveau). */
  categoriesExclues: Set<number>
  texte: string
  mode: ModeFiltre
}

export const normaliserTexte = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function etatFiltresVide(): EtatFiltres {
  return {
    periode: null,
    typesExclus: new Set(),
    originesExclues: new Set(),
    statutsExclus: new Set(),
    validationsExclues: new Set(),
    confianceMin: 0,
    categoriesExclues: new Set(),
    texte: '',
    mode: 'estomper',
  }
}

export class Filtres {
  etat: EtatFiltres = etatFiltresVide()
  /** 1 si la feuille passe les filtres. */
  readonly actives: Uint8Array
  nbActives: number
  version = 0
  private textes: string[]

  constructor(
    readonly h: Hierarchie,
    private surChangement: () => void = () => {},
  ) {
    this.actives = new Uint8Array(h.nF).fill(1)
    this.nbActives = h.nF
    this.textes = h.noeuds.map((n) => normaliserTexte(`${n.nom} ${n.id} ${n.enonce} ${n.categorie.join(' ')}`))
  }

  /** Vrai si au moins un filtre restreint l'ensemble. */
  get restrictif(): boolean {
    const e = this.etat
    return (
      e.periode !== null || e.typesExclus.size > 0 || e.originesExclues.size > 0 || e.statutsExclus.size > 0 ||
      e.validationsExclues.size > 0 || e.confianceMin > 0 || e.categoriesExclues.size > 0 || e.texte.trim() !== ''
    )
  }

  modifier(partiel: Partial<EtatFiltres>): void {
    this.etat = { ...this.etat, ...partiel }
    this.recalculer()
  }

  /** Ajoute / retire une valeur d'un ensemble d'exclusion. */
  basculer<K extends 'typesExclus' | 'originesExclues' | 'statutsExclus' | 'validationsExclues' | 'categoriesExclues'>(
    ensemble: K,
    valeur: EtatFiltres[K] extends Set<infer V> ? V : never,
  ): void {
    const s = new Set(this.etat[ensemble] as Set<unknown>)
    if (s.has(valeur)) s.delete(valeur)
    else s.add(valeur)
    this.modifier({ [ensemble]: s } as Partial<EtatFiltres>)
  }

  reinitialiser(): void {
    const mode = this.etat.mode
    this.etat = { ...etatFiltresVide(), mode }
    this.recalculer()
  }

  private recalculer(): void {
    const e = this.etat
    const { h } = this
    const mots = normaliserTexte(e.texte).split(/\s+/).filter(Boolean)
    let n = 0
    for (let f = 0; f < h.nF; f++) {
      const nd = h.noeuds[f]!
      let ok =
        !e.typesExclus.has(nd.type) &&
        !e.originesExclues.has(nd.origine) &&
        !e.statutsExclus.has(nd.statut) &&
        !e.validationsExclues.has(nd.validation) &&
        nd.confiance.estimation >= e.confianceMin
      if (ok && e.periode) {
        const d = h.dates[f]!
        ok = d >= e.periode[0] && d <= e.periode[1]
      }
      if (ok && e.categoriesExclues.size) {
        for (let k = 0; k < 3 && ok; k++) if (e.categoriesExclues.has(h.chaine[f * 3 + k]!)) ok = false
      }
      if (ok && mots.length) ok = mots.every((m) => this.textes[f]!.includes(m))
      this.actives[f] = ok ? 1 : 0
      if (ok) n++
    }
    this.nbActives = n
    this.version++
    this.surChangement()
  }
}
