// Dispositions 3D des unités : une par face (dessus / face / droite) + le « cube strict ».
// Calculées une fois, puis mélangées à chaque image selon l'orientation de la caméra.
//
// Repère Blender : Z vertical. Toutes les dispositions tiennent à peu près dans [-1, 1]³.
//   dessus : X, Y = carte thématique (cercles imbriqués domaine > thème > sous-thème > session)
//   face   : X = date de création,   Y = Y thématique (profondeur), Z = bande thématique
//   droite : Y = couloirs type × origine, X = X thématique (profondeur), Z = bande thématique
//   cube   : X = date, Y = couloirs, Z = bande thématique

import { hierarchy, pack, type HierarchyCircularNode } from 'd3-hierarchy'
import { TYPES_NOEUD, ORIGINES } from './donnees'
import type { Hierarchie } from './hierarchie'
import { hacher, type Vec3 } from './maths'

export const NOMS_DISPOSITIONS = ['dessus', 'face', 'droite', 'cube'] as const
export type NomDisposition = (typeof NOMS_DISPOSITIONS)[number]
/** Positions 3D par unité (3 × nU), catégories comprises (barycentres). */
export type Dispositions = Record<NomDisposition, Float32Array>

/** Hauteur de la bande thématique (Z ∈ [-Z_MAX, Z_MAX]). */
export const Z_MAX = 0.75

interface NoeudPack {
  nom: string
  enfants?: NoeudPack[]
  feuille?: number
}

/** Carte thématique 2D par empilement de cercles (d3-hierarchy pack). */
export function carteThematique(h: Hierarchie, espacement = 1): Float32Array {
  const racine: NoeudPack = { nom: 'racine', enfants: [] }
  const parCategorie = new Map<number, NoeudPack>()
  for (const c of h.categories) {
    const n: NoeudPack = { nom: c.id, enfants: [] }
    parCategorie.set(c.index, n)
    ;(c.parent < 0 ? racine : parCategorie.get(c.parent)!).enfants!.push(n)
  }
  // Sous-thème → groupes par session (les nœuds « appelés ensemble » restent groupés).
  for (const c of h.categories) {
    if (c.niveau !== 2) continue
    const groupes = new Map<string, NoeudPack>()
    for (const f of c.feuilles) {
      const s = h.noeuds[f]!.session
      if (!groupes.has(s)) groupes.set(s, { nom: s, enfants: [] })
      groupes.get(s)!.enfants!.push({ nom: h.cles[f]!, feuille: f })
    }
    parCategorie.get(c.index)!.enfants = [...groupes.values()]
  }
  const racineH = hierarchy<NoeudPack>(racine, (d) => d.enfants)
    .sum((d) => (d.feuille !== undefined ? 1 : 0))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  const empile = pack<NoeudPack>()
    .size([2, 2])
    .padding((d: HierarchyCircularNode<NoeudPack>) => ([0.03, 0.018, 0.01, 0.004][d.depth] ?? 0) * espacement)(racineH)

  const sortie = new Float32Array(h.nF * 2)
  for (const f of empile.leaves()) {
    const i = f.data.feuille
    if (i === undefined) continue
    sortie[i * 2] = f.x - 1
    sortie[i * 2 + 1] = 1 - f.y
  }
  return sortie
}

/** Bande verticale (Z) de chaque feuille, ordonnée par sous-thème. */
function bandes(h: Hierarchie): Float32Array {
  const sousThemes = h.categories.filter((c) => c.niveau === 2)
  const rang = new Map(sousThemes.map((c, k) => [c.index, k]))
  const K = sousThemes.length
  const z = new Float32Array(h.nF)
  const hauteur = (2 * Z_MAX) / K
  for (let f = 0; f < h.nF; f++) {
    const k = rang.get(h.chaine[f * 3 + 2]!)!
    const gigue = (hacher(h.cles[f]!, 7) - 0.5) * 0.76
    z[f] = Z_MAX - (k + 0.5 + gigue) * hauteur
  }
  return z
}

/** Couloirs type × origine (Y ∈ [-1, 1]), avec un espace entre types. */
export function couloirs(h: Hierarchie): Float32Array {
  const nO = ORIGINES.length
  const total = TYPES_NOEUD.length * (nO + 1) - 1
  const y = new Float32Array(h.nF)
  for (let f = 0; f < h.nF; f++) {
    const n = h.noeuds[f]!
    const slot = TYPES_NOEUD.indexOf(n.type) * (nO + 1) + ORIGINES.indexOf(n.origine)
    const gigue = (hacher(h.cles[f]!, 3) - 0.5) * 0.8
    y[f] = -1 + (2 * (slot + 0.5 + gigue)) / total
  }
  return y
}

/** Position d'un couloir (centre) pour dessiner des repères. */
export function centreCouloir(type: number, origine: number): number {
  const nO = ORIGINES.length
  const total = TYPES_NOEUD.length * (nO + 1) - 1
  return -1 + (2 * (type * (nO + 1) + origine + 0.5)) / total
}

export function calculerDispositions(h: Hierarchie): Dispositions {
  const carte = carteThematique(h)
  const z = bandes(h)
  const y = couloirs(h)
  const d: Dispositions = {
    dessus: new Float32Array(h.nU * 3),
    face: new Float32Array(h.nU * 3),
    droite: new Float32Array(h.nU * 3),
    cube: new Float32Array(h.nU * 3),
  }
  const duree = h.dateMax - h.dateMin
  for (let f = 0; f < h.nF; f++) {
    const tx = -1 + (2 * (h.dates[f]! - h.dateMin)) / duree
    const cx = carte[f * 2]!, cy = carte[f * 2 + 1]!
    const o = f * 3
    d.dessus.set([cx, cy, z[f]!], o)
    d.face.set([tx, cy, z[f]!], o)
    d.droite.set([cx, y[f]!, z[f]!], o)
    d.cube.set([tx, y[f]!, z[f]!], o)
  }
  calculerBarycentres(h, d)
  return d
}

/** Position des agrégats = barycentre de leurs feuilles actives (toutes si aucune). */
export function calculerBarycentres(h: Hierarchie, d: Dispositions, actives?: Uint8Array): void {
  for (const nom of NOMS_DISPOSITIONS) {
    const p = d[nom]
    for (const c of h.categories) {
      let x = 0, y = 0, z = 0, n = 0
      const compter = (seulementActives: boolean) => {
        for (const f of c.feuilles) {
          if (seulementActives && actives && !actives[f]) continue
          x += p[f * 3]!
          y += p[f * 3 + 1]!
          z += p[f * 3 + 2]!
          n++
        }
      }
      compter(true)
      if (n === 0) compter(false)
      const u = c.unite * 3
      p[u] = x / n
      p[u + 1] = y / n
      p[u + 2] = z / n
    }
  }
}

/**
 * Poids des trois faces selon la direction de visée : w_i ∝ |avant · normale_i|^netteté.
 * Ordre du résultat : [dessus, face, droite].
 */
export function poidsFaces(avant: Vec3, nettete: number, sortie: Float32Array = new Float32Array(3)): Float32Array {
  const wd = Math.pow(Math.abs(avant[2]), nettete)
  const wf = Math.pow(Math.abs(avant[1]), nettete)
  const wr = Math.pow(Math.abs(avant[0]), nettete)
  const s = wd + wf + wr || 1
  sortie[0] = wd / s
  sortie[1] = wf / s
  sortie[2] = wr / s
  return sortie
}

/** Mélange des dispositions dans `sortie` (3 × nU). */
export function melangerDispositions(
  d: Dispositions,
  poids: Float32Array,
  mode: 'faces' | 'cube',
  sortie: Float32Array,
): void {
  if (mode === 'cube') {
    sortie.set(d.cube)
    return
  }
  const a = d.dessus, b = d.face, c = d.droite
  const wa = poids[0]!, wb = poids[1]!, wc = poids[2]!
  for (let i = 0; i < sortie.length; i++) sortie[i] = a[i]! * wa + b[i]! * wb + c[i]! * wc
}
