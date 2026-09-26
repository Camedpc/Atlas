// Échelles sémantiques de l'instrument : ce que valent les coordonnées X, Y, Z selon la face.
//   X (face)   : date de création  → mois / semaines / jours
//   Y (droite) : couloirs type × origine
//   Z (partout): bandes thématiques (domaine › thème › sous-thème)
//   X, Y (dessus, faces sémantiques) : carte thématique → secteurs (cercles des domaines / thèmes)
// Toujours calculées sur la hiérarchie thématique d'origine, même quand la vue regroupe par cases.

import {
  Hierarchie, TYPES_NOEUD, ORIGINES, LIBELLES_TYPE, LIBELLES_ORIGINE, Z_MAX, calculerDispositions, centreCouloir,
  type Dispositions, type JeuDonnees,
} from '../../src/core'

export const JOUR = 86_400_000
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

export interface Bande {
  nom: string
  /** Chemin complet (domaine › thème › sous-thème). */
  chemin: string
  zHaut: number
  zBas: number
  niveau: 0 | 1 | 2
  domaine: number
}

export interface Secteur {
  nom: string
  niveau: 0 | 1
  domaine: number
  cx: number
  cy: number
  r: number
}

export interface Graduation {
  v: number
  /** 0 majeure, 1 moyenne, 2 mineure, 3 micro. */
  niveau: number
  trait: boolean
  libelle?: string
  /** Domaine (couleur) pour un libellé de domaine. */
  domaine?: number
}

export class Echelles {
  readonly h: Hierarchie
  readonly dateMin: number
  readonly dateMax: number
  readonly bandes: Bande[] = []
  /** Bande de sous-thème de chaque feuille. */
  readonly bandeFeuille: Int32Array
  readonly secteurs: Secteur[] = []
  private readonly hauteurBande: number

  /** Dispositions thématiques d'origine (réinjectées dans la vue en mode « cases »). */
  readonly dispositions: Dispositions

  constructor(jeu: JeuDonnees) {
    const h = (this.h = new Hierarchie(jeu))
    const dispositions = (this.dispositions = calculerDispositions(h))
    this.dateMin = h.dateMin
    this.dateMax = h.dateMax
    // Bandes Z : même ordre que le moteur (sous-thèmes triés par chemin).
    const sous = h.categories.filter((c) => c.niveau === 2)
    const K = sous.length
    this.hauteurBande = (2 * Z_MAX) / K
    const etendue = new Map<number, [number, number]>()
    sous.forEach((c, k) => {
      for (let x = c.index; x >= 0; x = h.categories[x]!.parent) {
        const e = etendue.get(x)
        etendue.set(x, e ? [Math.min(e[0], k), Math.max(e[1], k)] : [k, k])
      }
    })
    for (const c of h.categories) {
      const e = etendue.get(c.index)
      if (!e) continue
      this.bandes.push({
        nom: c.nom, chemin: c.chemin.join(' › '), niveau: c.niveau, domaine: c.domaine,
        zHaut: Z_MAX - e[0] * this.hauteurBande, zBas: Z_MAX - (e[1] + 1) * this.hauteurBande,
      })
    }
    this.bandeFeuille = new Int32Array(h.nF)
    const indexBande = new Map<number, number>()
    h.categories.forEach((c) => c.niveau === 2 && indexBande.set(c.index, this.bandes.findIndex((b) => b.chemin === c.chemin.join(' › '))))
    for (let f = 0; f < h.nF; f++) this.bandeFeuille[f] = indexBande.get(h.chaine[f * 3 + 2]!) ?? 0

    // Secteurs de la carte thématique (vue de dessus) : cercle englobant des feuilles.
    const d = dispositions.dessus
    for (const c of h.categories) {
      if (c.niveau > 1) continue
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const f of c.feuilles) {
        const x = d[f * 3]!, y = d[f * 3 + 1]!
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
      let r = 0
      for (const f of c.feuilles) r = Math.max(r, Math.hypot(d[f * 3]! - cx, d[f * 3 + 1]! - cy))
      this.secteurs.push({ nom: c.nom, niveau: c.niveau as 0 | 1, domaine: c.domaine, cx, cy, r: r + (c.niveau === 0 ? 0.025 : 0.012) })
    }
  }

  // ─── Temps ────────────────────────────────────────────────────────────────

  dateVersX(t: number): number {
    return -1 + (2 * (t - this.dateMin)) / (this.dateMax - this.dateMin)
  }
  xVersDate(x: number): number {
    return this.dateMin + ((x + 1) / 2) * (this.dateMax - this.dateMin)
  }
  /** Unités monde par jour sur l'axe X. */
  get uniteJour(): number {
    return (2 * JOUR) / (this.dateMax - this.dateMin)
  }

  /** Graduations temporelles selon la place disponible (px par jour). */
  graduationsTemps(pxJour: number, densite: number): Graduation[] {
    const r: Graduation[] = []
    const debut = new Date(this.dateMin)
    const fin = this.dateMax
    const seuil = (px: number) => px * densite
    // Jours
    if (seuil(pxJour) > 11) {
      const d = new Date(Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth(), debut.getUTCDate() + 1))
      for (; d.getTime() < fin; d.setUTCDate(d.getUTCDate() + 1)) {
        if (d.getUTCDate() === 1) continue
        const lundi = d.getUTCDay() === 1
        r.push({ v: this.dateVersX(d.getTime()), niveau: lundi ? 2 : 3, trait: true, libelle: seuil(pxJour) > 22 || (lundi && seuil(pxJour) > 11) ? String(d.getUTCDate()) : undefined })
      }
    } else if (seuil(pxJour * 7) > 9) {
      // Semaines (lundis)
      const d = new Date(Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth(), debut.getUTCDate()))
      while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1)
      for (; d.getTime() < fin; d.setUTCDate(d.getUTCDate() + 7)) {
        if (d.getUTCDate() === 1) continue
        r.push({ v: this.dateVersX(d.getTime()), niveau: 2, trait: true, libelle: seuil(pxJour * 7) > 34 ? `${d.getUTCDate()}` : undefined })
      }
    }
    // Mois (et années)
    const m = new Date(Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth() + 1, 1))
    for (; m.getTime() < fin; m.setUTCMonth(m.getUTCMonth() + 1)) {
      const mois = m.getUTCMonth()
      r.push({ v: this.dateVersX(m.getTime()), niveau: mois === 0 ? 0 : 1, trait: true, libelle: `${MOIS_COURTS[mois]} ${mois === 0 || seuil(pxJour * 30) > 70 ? m.getUTCFullYear() : ''}`.trim() })
    }
    return r
  }

  // ─── Couloirs ─────────────────────────────────────────────────────────────

  graduationsCouloirs(pxUnite: number, densite: number): Graduation[] {
    const r: Graduation[] = []
    const nO = ORIGINES.length
    const total = TYPES_NOEUD.length * (nO + 1) - 1
    const slot = (s: number) => -1 + (2 * s) / total
    const pxSlot = ((2 / total) * pxUnite) * densite
    TYPES_NOEUD.forEach((t, i) => {
      // Bords du couloir de type (majeurs) et séparations d'origine (mineures).
      r.push({ v: slot(i * (nO + 1)), niveau: 1, trait: true })
      r.push({ v: slot(i * (nO + 1) + nO), niveau: 1, trait: true })
      if (pxSlot > 7) for (let o = 1; o < nO; o++) r.push({ v: slot(i * (nO + 1) + o), niveau: 3, trait: true })
      r.push({ v: centreCouloir(i, 1), niveau: 0, trait: false, libelle: LIBELLES_TYPE[t] })
      if (pxSlot > 26) ORIGINES.forEach((o, k) => r.push({ v: centreCouloir(i, k), niveau: 2, trait: false, libelle: abreviationOrigine(o) }))
    })
    return r
  }

  /** Couloir (type, origine) le plus proche d'une coordonnée Y. */
  couloirDe(y: number): { type: number; origine: number } {
    const nO = ORIGINES.length
    const total = TYPES_NOEUD.length * (nO + 1) - 1
    const s = Math.max(0, Math.min(total - 1, Math.floor(((y + 1) / 2) * total)))
    return { type: Math.floor(s / (nO + 1)), origine: Math.min(nO - 1, s % (nO + 1)) }
  }

  // ─── Bandes ───────────────────────────────────────────────────────────────

  graduationsBandes(pxUnite: number, densite: number): Graduation[] {
    const r: Graduation[] = []
    const px = this.hauteurBande * pxUnite * densite
    for (const b of this.bandes) {
      const pxB = (b.zHaut - b.zBas) * pxUnite * densite
      if (b.niveau === 0) r.push({ v: b.zHaut, niveau: 0, trait: true })
      else if (b.niveau === 1 && px > 3) r.push({ v: b.zHaut, niveau: 1, trait: true })
      else if (b.niveau === 2 && px > 8) r.push({ v: b.zHaut, niveau: 3, trait: true })
      const lisible = b.niveau === 0 ? pxB > 12 : b.niveau === 1 ? pxB > 15 : pxB > 13
      if (lisible) r.push({ v: (b.zHaut + b.zBas) / 2, niveau: b.niveau, trait: false, libelle: b.niveau === 0 ? b.nom.toUpperCase() : b.nom, domaine: b.niveau === 0 ? b.domaine : undefined })
    }
    r.push({ v: -Z_MAX, niveau: 0, trait: true })
    return r
  }

  /** Bande de sous-thème qui contient z (ou null). */
  bandeDe(z: number): Bande | null {
    let meilleure: Bande | null = null
    for (const b of this.bandes) if (b.niveau === 2 && z <= b.zHaut && z >= b.zBas) meilleure = b
    return meilleure
  }

  // ─── Carte (grille neutre) ────────────────────────────────────────────────

  graduationsCarte(pxUnite: number, densite: number): Graduation[] {
    const r: Graduation[] = []
    const pas = pxUnite * 0.1 * densite > 9 ? 0.1 : pxUnite * 0.25 * densite > 9 ? 0.25 : 0.5
    for (let v = -1; v <= 1.0001; v += pas) {
      const k = Math.round(v * 100) / 100
      r.push({ v: k, niveau: Math.abs(k % 0.5) < 1e-6 ? 1 : 3, trait: true })
    }
    return r
  }
}

export function abreviationOrigine(o: string): string {
  return o === 'humain' ? 'H' : o === 'ia' ? 'IA' : 'Ord.'
}

/** Date ISO compacte (AAAA-MM-JJ hh:mm), pour les lectures d'instrument. */
export function dateIso(t: number, heure = true): string {
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  const j = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  return heure ? `${j} ${p(d.getHours())}:${p(d.getMinutes())}` : j
}

export function libelleOrigine(o: number): string {
  return LIBELLES_ORIGINE[ORIGINES[o]!]
}
