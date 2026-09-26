// Filtres de l'affichage (EtatFiltres, P3/P4) appliqués par réducteur de point : `masquer` cache le point,
// `estomper` le rend translucide. Les arêtes suivent seules (la vue les cache ou les estompe avec leurs
// extrémités). Un point passe si l'un des nœuds qu'il représente passe (une étape regroupe une chaîne).

import type { NoeudR } from '../graphe/raisonnement/donnees'
import type { ReducteurPoint, VueRaisonnement } from '../graphe/raisonnement/vue'
import { filtresVides } from './etat'
import type { EtatFiltres } from './protocole'

export const OPACITE_ESTOMPEE = 0.12

export function filtresActifs(f: EtatFiltres): boolean {
  return f.conversation !== null || f.statuts.length > 0 || f.types.length > 0 || f.periode.debut !== null
    || f.periode.fin !== null || f.texte.trim() !== ''
}

/** Minuscules sans accents, espaces réduits : sert aussi à la recherche de texte. */
export function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Une date seule (AAAA-MM-JJ) couvre toute la journée pour la borne de fin. */
function borne(date: string, fin: boolean): number {
  return Date.parse(date.length === 10 ? `${date}T${fin ? '23:59:59.999' : '00:00:00'}Z` : date)
}

export function noeudPasse(n: NoeudR, f: EtatFiltres): boolean {
  if (f.conversation !== null && n.conversation !== f.conversation) return false
  if (f.statuts.length && !f.statuts.includes(n.statut)) return false
  if (f.types.length && !f.types.includes(n.type)) return false
  if (f.periode.debut !== null || f.periode.fin !== null) {
    const t = Date.parse(n.cree_le)
    if (f.periode.debut !== null && t < borne(f.periode.debut, false)) return false
    if (f.periode.fin !== null && t > borne(f.periode.fin, true)) return false
  }
  const texte = normaliser(f.texte)
  if (texte && !normaliser(`${n.id} ${n.nom} ${n.enonce}`).includes(texte)) return false
  return true
}

/** Filtres d'une vue : état courant, cache par point, réducteur à brancher sur la vue. */
export class FiltresVue {
  private vue: VueRaisonnement
  private etatCourant = filtresVides()
  private cache: Uint8Array | null = null

  constructor(vue: VueRaisonnement) {
    this.vue = vue
    vue.ajouterReducteurNoeud(this.reducteur)
    vue.on('disposition', () => (this.cache = null))
  }

  get etat(): EtatFiltres {
    return this.etatCourant
  }

  definir(etat: EtatFiltres): void {
    this.etatCourant = etat
    this.cache = null
    this.vue.demanderRendu()
  }

  /** Le point passe-t-il les filtres (toujours vrai sans filtre actif) ? */
  passe(p: number): boolean {
    if (!filtresActifs(this.etatCourant)) return true
    const v = this.vue
    if (!this.cache || this.cache.length !== v.nP) {
      this.cache = new Uint8Array(v.nP)
      const noeuds = v.justification.noeuds
      for (let q = 0; q < v.nP; q++) {
        const membres = q < v.nU ? v.lecture.unites[q]!.membres : [v.indexNoeud(q)]
        this.cache[q] = membres.some((i) => noeudPasse(noeuds[i]!, this.etatCourant)) ? 1 : 0
      }
    }
    return this.cache[p] === 1
  }

  /** Points qui passent les filtres (parmi les points affichés), pour le cadrage. */
  points(): number[] {
    return this.vue.pointsVisibles().filter((p) => this.passe(p))
  }

  private reducteur: ReducteurPoint = (info, a) => {
    if (this.passe(info.point)) return
    if (this.etatCourant.mode === 'masquer') a.cache = true
    else {
      a.opacite *= OPACITE_ESTOMPEE
      a.libelle = null
      a.forceLibelle = false
    }
  }
}
