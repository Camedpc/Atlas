// Agrégation alternative : communautés automatiques (Louvain) quand on n'a pas de catégories.
//
// On construit un graphe non orienté des nœuds (arêtes prémisse ↔ conclusion, plus des liens
// faibles entre nœuds consécutifs d'une même session), puis trois niveaux imbriqués :
//   niveau 2 (≈ sous-thèmes) : Louvain sur les nœuds, résolution r ;
//   niveau 1 (≈ thèmes)      : Louvain sur le graphe quotient des communautés fines ;
//   niveau 0 (≈ domaines)    : idem sur le quotient du niveau 1.
// Les niveaux supérieurs visent un nombre de groupes raisonnable ; les composantes isolées
// (que Louvain ne fusionne jamais) sont rattachées par proximité temporelle.
// Le résultat est un nouveau JeuDonnees dont `categorie` = chemin de communautés : tout le
// moteur (hiérarchie, granularité, dispositions) fonctionne ensuite sans modification.

import Graph from 'graphology'
import louvain from 'graphology-communities-louvain'
import { creerAlea, type JeuDonnees, type Noeud } from '../../src/core'

export interface OptionsCommunautes {
  resolution: number
  /** Poids des liens entre nœuds consécutifs d'une même session (0 = aucun). */
  poidsSession: number
}

type Aretes = Map<string, number>

const clampEntier = (x: number, a: number, b: number) => Math.max(a, Math.min(b, Math.round(x)))

const cleArete = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`)

function ajouter(aretes: Aretes, a: number, b: number, w: number): void {
  if (a === b || w <= 0) return
  const k = cleArete(a, b)
  aretes.set(k, (aretes.get(k) ?? 0) + w)
}

/** Louvain déterministe sur n sommets ; renvoie une communauté (0…k-1) par sommet. */
function partitionner(n: number, aretes: Aretes, resolution: number, graine: number): Int32Array {
  const g = new Graph({ type: 'undirected' })
  for (let i = 0; i < n; i++) g.addNode(String(i))
  for (const [k, w] of aretes) {
    const [a, b] = k.split('|')
    g.addUndirectedEdge(a!, b!, { weight: w })
  }
  const alea = creerAlea(graine)
  const res = louvain(g, { resolution, getEdgeWeight: 'weight', rng: alea.suivant })
  return renumeroter(Int32Array.from({ length: n }, (_, i) => res[String(i)] ?? i))
}

function renumeroter(p: Int32Array): Int32Array {
  const m = new Map<number, number>()
  return p.map((c) => {
    let x = m.get(c)
    if (x === undefined) m.set(c, (x = m.size))
    return x
  })
}

/** Graphe quotient : arêtes entre groupes (poids cumulés). */
function quotient(aretes: Aretes, p: Int32Array): Aretes {
  const q: Aretes = new Map()
  for (const [k, w] of aretes) {
    const [a, b] = k.split('|').map(Number) as [number, number]
    ajouter(q, p[a]!, p[b]!, w)
  }
  return q
}

/**
 * Fusionne des groupes jusqu'à respecter `max` groupes et `tailleMin` éléments par groupe :
 * le plus petit est absorbé par le groupe le plus connecté, ou à défaut le plus proche en date.
 */
function fusionner(p: Int32Array, tailles: number[], aretes: Aretes, dates: number[], max: number, tailleMin: number): Int32Array {
  const k0 = Math.max(...p) + 1
  const parent = Array.from({ length: k0 }, (_, i) => i)
  const racine = (x: number): number => (parent[x] === x ? x : (parent[x] = racine(parent[x]!)))
  const taille = new Map<number, number>()
  const date = new Map<number, number>()
  for (let g = 0; g < k0; g++) {
    taille.set(g, 0)
    date.set(g, 0)
  }
  p.forEach((g, i) => {
    taille.set(g, taille.get(g)! + tailles[i]!)
    date.set(g, date.get(g)! + dates[i]! * tailles[i]!)
  })
  const vivants = new Set(Array.from({ length: k0 }, (_, i) => i))
  const liens = (a: number) => {
    const r = new Map<number, number>()
    for (const [k, w] of aretes) {
      const [x, y] = k.split('|').map(Number) as [number, number]
      const gx = racine(p[x]!), gy = racine(p[y]!)
      if (gx === gy) continue
      if (gx === a) r.set(gy, (r.get(gy) ?? 0) + w)
      else if (gy === a) r.set(gx, (r.get(gx) ?? 0) + w)
    }
    return r
  }
  for (;;) {
    let plusPetit = -1, t = Infinity
    for (const g of vivants) if (taille.get(g)! < t) (t = taille.get(g)!), (plusPetit = g)
    if (plusPetit < 0 || (vivants.size <= max && t >= tailleMin) || vivants.size <= 1) break
    const l = liens(plusPetit)
    let cible = -1, meilleur = 0
    for (const [g, w] of l) if (w > meilleur) (meilleur = w), (cible = g)
    if (cible < 0) {
      const dm = date.get(plusPetit)! / Math.max(1, taille.get(plusPetit)!)
      let ecart = Infinity
      for (const g of vivants) {
        if (g === plusPetit) continue
        const e = Math.abs(date.get(g)! / Math.max(1, taille.get(g)!) - dm)
        if (e < ecart) (ecart = e), (cible = g)
      }
    }
    if (cible < 0) break
    parent[plusPetit] = cible
    taille.set(cible, taille.get(cible)! + taille.get(plusPetit)!)
    date.set(cible, date.get(cible)! + date.get(plusPetit)!)
    vivants.delete(plusPetit)
  }
  return renumeroter(p.map((g) => racine(g)))
}

/** Agglomération hiérarchique sur un petit graphe pondéré, jusqu'à `cible` groupes. */
function agglomerer(tailles: number[], aretes: Aretes, dates: number[], cible: number): Int32Array {
  const k = tailles.length
  const groupe = Int32Array.from({ length: k }, (_, i) => i)
  const taille = [...tailles], date = dates.map((d, i) => d * tailles[i]!)
  let liens = new Map<string, number>()
  for (const [c, w] of aretes) liens.set(c, w)
  const vivants = new Set(groupe)
  while (vivants.size > Math.max(1, cible)) {
    let meilleur = -1, a = -1, b = -1
    for (const [c, w] of liens) {
      const [x, y] = c.split('|').map(Number) as [number, number]
      const score = w / (taille[x]! * taille[y]!)
      if (score > meilleur) (meilleur = score), (a = x), (b = y)
    }
    if (a < 0) {
      // Plus aucun lien : le plus petit rejoint le plus proche en date.
      const liste = [...vivants].sort((x, y) => taille[x]! - taille[y]!)
      a = liste[0]!
      const da = date[a]! / taille[a]!
      b = liste.slice(1).sort((x, y) => Math.abs(date[x]! / taille[x]! - da) - Math.abs(date[y]! / taille[y]! - da))[0]!
    }
    // b est absorbé par a.
    taille[a] = taille[a]! + taille[b]!
    date[a] = date[a]! + date[b]!
    vivants.delete(b)
    for (let i = 0; i < k; i++) if (groupe[i] === b) groupe[i] = a
    const nouveaux = new Map<string, number>()
    for (const [c, w] of liens) {
      let [x, y] = c.split('|').map(Number) as [number, number]
      if (x === b) x = a
      if (y === b) y = a
      if (x !== y) ajouter(nouveaux, x, y, w)
    }
    liens = nouveaux
  }
  return renumeroter(groupe)
}

/** Terme le plus fréquent (niveau k de la catégorie d'origine), sinon nom du nœud le plus cité. */
function nommer(membres: number[], noeuds: Noeud[], k: 0 | 1 | 2, cites: Int32Array): string {
  const compte = new Map<string, number>()
  for (const i of membres) {
    const t = noeuds[i]!.categorie?.[k]
    if (t) compte.set(t, (compte.get(t) ?? 0) + 1)
  }
  let terme = '', max = 0
  for (const [t, c] of compte) if (c > max) (max = c), (terme = t)
  if (!terme) {
    let best = membres[0]!
    for (const i of membres) if (cites[i]! > cites[best]!) best = i
    terme = noeuds[best]!.nom
  }
  return terme
}

export interface ResultatCommunautes {
  jeu: JeuDonnees
  nbParNiveau: [number, number, number]
}

export function communautes(jeu: JeuDonnees, o: OptionsCommunautes): ResultatCommunautes {
  const noeuds = jeu.noeuds
  const n = noeuds.length
  const index = new Map(noeuds.map((x, i) => [x.id, i]))
  const dates = noeuds.map((x) => Date.parse(x.cree_le))
  const cites = new Int32Array(n)

  // Graphe des nœuds.
  const aretes: Aretes = new Map()
  noeuds.forEach((x, i) => {
    for (const p of x.justifie_par) {
      const j = index.get(p)
      if (j === undefined) continue
      ajouter(aretes, i, j, 1)
      cites[j]!++
    }
  })
  if (o.poidsSession > 0) {
    const sessions = new Map<string, number[]>()
    noeuds.forEach((x, i) => {
      if (!sessions.has(x.session)) sessions.set(x.session, [])
      sessions.get(x.session)!.push(i)
    })
    for (const membres of sessions.values()) {
      membres.sort((a, b) => dates[a]! - dates[b]!)
      for (let k = 1; k < membres.length; k++) ajouter(aretes, membres[k - 1]!, membres[k]!, o.poidsSession)
    }
  }

  // Niveau 2 : communautés fines.
  let fin = partitionner(n, aretes, o.resolution, 7)
  fin = fusionner(fin, new Array(n).fill(1), aretes, dates, Math.max(8, Math.round(n / 12)), 5)

  // Niveaux 1 et 0 sur les graphes quotients.
  const monter = (p: Int32Array, taillesElem: number[], datesElem: number[], aretesElem: Aretes, resolution: number, cible: number, max: number, tailleMin: number) => {
    const k = Math.max(...p) + 1
    const tailles = new Array(k).fill(0), sommeDates = new Array(k).fill(0)
    p.forEach((g, i) => {
      tailles[g] += taillesElem[i]!
      sommeDates[g] += datesElem[i]! * taillesElem[i]!
    })
    const datesG = sommeDates.map((s, g) => s / Math.max(1, tailles[g]))
    const q = quotient(aretesElem, p)
    // Le graphe quotient est petit et dense : Louvain y fusionne souvent tout en un seul groupe.
    // On agglomère donc de façon déterministe, en fusionnant la paire la plus liée
    // (poids / (taille_a × taille_b)) jusqu'à la cible ; la résolution ne sert qu'au niveau fin.
    void resolution
    let haut = agglomerer(tailles, q, datesG, cible)
    haut = fusionner(haut, tailles, q, datesG, max, tailleMin)
    return { haut, tailles, datesG, q }
  }
  const n2 = Math.max(...fin) + 1
  const m1 = monter(fin, new Array(n).fill(1), dates, aretes, o.resolution * 0.6, clampEntier(n2 / 3, 3, 14), Math.max(6, Math.min(16, Math.round(n2 / 2.5))), 12)
  const theme = Int32Array.from(fin, (g) => m1.haut[g]!)
  const n1 = Math.max(...m1.haut) + 1
  const m0 = monter(m1.haut, m1.tailles, m1.datesG, m1.q, o.resolution * 0.35, clampEntier(n1 / 3, 2, 5), Math.max(3, Math.min(6, Math.round(n1 / 2.5))), 40)
  const domaine = Int32Array.from(theme, (g) => m0.haut[g]!)

  // Noms uniques par niveau.
  const noms = (p: Int32Array, k: 0 | 1 | 2) => {
    const membres = new Map<number, number[]>()
    p.forEach((g, i) => {
      if (!membres.has(g)) membres.set(g, [])
      membres.get(g)!.push(i)
    })
    const r = new Map<number, string>()
    const vus = new Map<string, number>()
    for (const [g, m] of [...membres].sort((a, b) => b[1].length - a[1].length)) {
      const base = `≈ ${nommer(m, noeuds, k, cites)}`
      const deja = vus.get(base) ?? 0
      vus.set(base, deja + 1)
      r.set(g, deja ? `${base} ·${deja + 1}` : base)
    }
    return r
  }
  const nomsD = noms(domaine, 0), nomsT = noms(theme, 1), nomsS = noms(fin, 2)
  const nouveaux: Noeud[] = noeuds.map((x, i) => ({
    ...x,
    categorie: [nomsD.get(domaine[i]!)!, nomsT.get(theme[i]!)!, nomsS.get(fin[i]!)!],
  }))
  return {
    jeu: { ...jeu, noeuds: nouveaux },
    nbParNiveau: [nomsD.size, nomsT.size, nomsS.size],
  }
}
