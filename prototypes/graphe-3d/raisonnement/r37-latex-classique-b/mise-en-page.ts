// R37 (essai B) · Mise en page reprise de R14 (colonnes = rangs logiques, rangées horizontales,
// liaisons orthogonales, entrées réparties, jonctions). Changements : la hauteur des blocs vient de la
// composition typographique (HTML mesuré, `mesurer`) ; repères à la manière d'un article : énoncés
// numérotés comme des équations « (4) », décisions D1…, hypothèses de modélisation (i), (ii)… ; le
// contexte rattaché est cité comme une bibliographie « [3] », numéroté dans l'ordre de première citation.
//
// Coordonnées de mise en page en px (y vers le bas), converties en monde (× 0,01) pour la vue :
//   X monde = x, Z monde = −y, Y monde = couche de type (3D).
//
//   ┌ marge ┐┌──── Outils ────┐┌──── Étapes intermédiaires ────┐┌── Résultats ──┐
//   drapeaux  rangs 0 … rT      rangs rT+1 … r2                  rangs r2+1 … fin
//   (choix, décisions sans prémisse)
//
// Rangs : plus long chemin avec bornes par zone. Ordre dans un rang : barycentres avec nœuds
// fictifs pour les arêtes longues (qui réservent un couloir). Hauteurs : régression isotone (PAV)
// vers la moyenne des voisins, ce qui aligne les chaînes à l'horizontale.

import {
  coucheDe, dependantsDe, type Disposition, type GrapheLecture, type NoeudR,
} from '../../src/raisonnement'
import { romain } from './formules'
import { natureDe } from './squelette'

export type GenreBoite = 'drapeau' | 'decision' | 'carte' | 'etape' | 'majeur' | 'masque'

export interface Pastille {
  /** Nœud de justification rattaché. */
  noeud: number
  lettre: string
  couche: number
}

export interface Boite {
  genre: GenreBoite
  /** Largeur et hauteur du corps (carte, pennon, libellé + losange). */
  w: number
  h: number
  /** Distance du point d'ancrage (ports des arêtes) au haut et au bas de la boîte complète. */
  haut: number
  bas: number
  lignes: string[]
  etiquette: string
  pastilles: Pastille[]
  /** Pastilles non montrées. */
  plus: number
  /** Renvois : prémisses lointaines citées par leur numéro « (k) » au lieu d'une longue flèche. */
  renvois: number[]
  /** Numéro de renvoi de ce point s'il est cité ainsi (sinon 0). */
  numero: number
  /** Décision : alternative(s) rejetée(s). */
  impasse: { texte: string; autres: number } | null
  /** Zone : 0 marge (choix), 1 outils, 2 étapes, 3 résultats, −1 masqué. */
  zone: number
  rang: number
  abandon: boolean
  /** Repère : « (7) » (énoncé), « D2 » (décision), « (ii) » (hypothèse de modélisation). */
  ref: string
  /** Ordonnées relatives des ports d'entrée (flanc gauche). */
  ports: number[]
}

/** Computer Modern (CMU Serif, chargée depuis jsDelivr), puis des replis sérif. */
export const SERIF = `'CMU Serif', 'Latin Modern Roman', 'Computer Modern Serif', 'Times New Roman', serif`

export interface Route {
  arete: number
  source: number
  cible: number
  /** Points de la ligne brisée orthogonale (px de mise en page). */
  points: [number, number][]
  abandon: boolean
}

export interface Zone {
  nom: string
  x0: number
  x1: number
}

export interface MiseEnPage {
  boites: Boite[]
  routes: Route[]
  zones: Zone[]
  /** Liens décision → choix dans la marge. */
  liensMarge: { source: number; cible: number }[]
  /** Pour chaque choix (point) : les points qui en dépendent dans le graphe complet. */
  portees: Map<number, number[]>
  /** Nœud de contexte → points qui le portent en pastille. */
  usagesPastille: Map<number, number[]>
  /** Point cité par renvoi → points qui le citent. */
  usagesRenvoi: Map<number, number[]>
  /** Contexte cité : nœud → numéro [n] (ordre de première citation, de gauche à droite). */
  citations: Map<number, number>
  /** Nœuds de contexte dans l'ordre des numéros. */
  bibliographie: number[]
  /** Contexte qui est aussi un énoncé affiché : cité par son repère « (k) » (nœud → point). */
  contexteAffiche: Map<number, number>
  /** Jonctions (px de mise en page) : une sortie qui se divise en plusieurs liaisons. */
  jonctions: [number, number][]
  /** Abscisses (px) des rangs logiques et de la marge des hypothèses. */
  xRangs: number[]
  xMarge: number
  largeurCarte: number
  /** Conversion px → monde et centre. */
  echelle: number
  cx: number
  cy: number
  bornes: { x0: number; y0: number; x1: number; y1: number }
}

export interface OptionsMiseEnPage {
  largeurCarte: number
  ecartColonnes: number
  ecartLignes: number
  taillePolice: number
  maxPastilles: number
  ecartCouches: number
  police: string
  /** Positions précédentes (id de nœud conclusion → y) : ordre stable d'une dérivation à l'autre. */
  precedent?: Map<string, number>
  /**
   * Hauteur du contenu composé (px de mise en page) : bloc, hypothèse, ou libellé de décision.
   * `membres` : taille de l'unité (sous-argument replié).
   */
  mesurer: (p: number, genre: GenreBoite, membres: number) => number
  /** Marge intérieure des blocs autour du contenu. */
  pad: number
}

const ECHELLE = 0.01

// ─── Mesure du texte ─────────────────────────────────────────────────────────

let ctxMesure: CanvasRenderingContext2D | null = null
function mesurer(font: string): CanvasRenderingContext2D {
  if (!ctxMesure) ctxMesure = document.createElement('canvas').getContext('2d')!
  ctxMesure.font = font
  return ctxMesure
}

/** Coupe un texte en lignes de largeur maximale (px), au plus `max` lignes. */
export function couperLignes(texte: string, largeur: number, font: string, max: number): string[] {
  const ctx = mesurer(font)
  const mots = texte.split(/\s+/)
  const lignes: string[] = []
  let courante = ''
  for (const m of mots) {
    const essai = courante ? `${courante} ${m}` : m
    if (ctx.measureText(essai).width <= largeur || !courante) courante = essai
    else {
      lignes.push(courante)
      courante = m
    }
  }
  if (courante) lignes.push(courante)
  if (lignes.length > max) {
    lignes.length = max
    let l = lignes[max - 1]!
    while (l.length > 1 && ctx.measureText(l + '…').width > largeur) l = l.slice(0, -1)
    lignes[max - 1] = l.trimEnd() + '…'
  }
  // Mot unique trop long : coupé.
  return lignes.map((l) => {
    if (ctx.measureText(l).width <= largeur) return l
    let x = l
    while (x.length > 1 && ctx.measureText(x + '…').width > largeur) x = x.slice(0, -1)
    return x + '…'
  })
}

// ─── Pastilles ───────────────────────────────────────────────────────────────

/** Lettre d'une pastille de contexte (et ordre d'affichage). */
export function lettrePastille(n: NoeudR): { lettre: string; ordre: number } {
  if (n.type === 'hypothese') return { lettre: 'H', ordre: 0 }
  if (n.type === 'axiome') return { lettre: 'A', ordre: 3 }
  if (n.type === 'definition') return { lettre: 'D', ordre: 2 }
  if (n.admis && n.type === 'lemme') return { lettre: 'O', ordre: 1 }
  if (n.admis) return { lettre: 'L', ordre: 4 }
  return { lettre: '+', ordre: 5 }
}

// ─── Calcul ──────────────────────────────────────────────────────────────────

export function mettreEnPage(g: GrapheLecture, o: OptionsMiseEnPage): { disposition: Disposition; page: MiseEnPage } {
  const j = g.justification
  const nU = g.unites.length
  const masques = g.masques
  const nP = nU + masques.length
  const noeudDe = (p: number): NoeudR => j.noeuds[p < nU ? g.unites[p]!.conclusion : masques[p - nU]!]!
  const parents: number[][] = g.unites.map((_, u) => g.entrantes[u]!.map((e) => g.aretes[e]!.source))
  const enfants: number[][] = g.unites.map((_, u) => g.sortantes[u]!.map((e) => g.aretes[e]!.cible))

  // 1. Marge : choix, décisions sans prémisse, décisions qui ne mènent qu'à des choix.
  const marge = new Uint8Array(nU)
  for (let u = 0; u < nU; u++) {
    const n = noeudDe(u)
    if (n.type === 'choix_modelisation') marge[u] = 1
    else if (n.type === 'decision' && parents[u]!.length === 0) marge[u] = 1
  }
  for (let u = 0; u < nU; u++) {
    const n = noeudDe(u)
    if (n.type === 'decision' && enfants[u]!.length && enfants[u]!.every((v) => marge[v]) && parents[u]!.every((s) => marge[s])) marge[u] = 1
  }

  // 2. Ordre topologique du reste (les cycles éventuels passent en fin).
  const principaux: number[] = []
  for (let u = 0; u < nU; u++) if (!marge[u]) principaux.push(u)
  const degre = new Int32Array(nU)
  for (const u of principaux) for (const s of parents[u]!) if (!marge[s]) degre[u]!++
  const topo: number[] = []
  const file = principaux.filter((u) => degre[u] === 0)
  while (file.length) {
    const u = file.shift()!
    topo.push(u)
    for (const v of enfants[u]!) if (!marge[v] && --degre[v]! === 0) file.push(v)
  }
  const vus = new Set(topo)
  for (const u of principaux) if (!vus.has(u)) topo.push(u)
  const parentsPrincipaux = (u: number) => parents[u]!.filter((s) => !marge[s])

  // 3. Zones : outils (racines et leurs enfants partagés), résultats (majeurs dont toute la
  //    descendance est majeure), étapes (le reste).
  const zone = new Int8Array(nP).fill(-1)
  const majeur = (u: number) => {
    const n = noeudDe(u)
    return (n.type === 'theoreme' || n.type === 'resultat') && !n.admis
  }
  const racine = new Uint8Array(nU)
  for (const u of principaux) if (parentsPrincipaux(u).length === 0 && noeudDe(u).type !== 'decision' && !majeur(u)) racine[u] = 1
  const toutMajeur = new Uint8Array(nU)
  for (let k = topo.length - 1; k >= 0; k--) {
    const u = topo[k]!
    toutMajeur[u] = majeur(u) && enfants[u]!.every((v) => marge[v] || toutMajeur[v]) ? 1 : 0
  }
  for (let u = 0; u < nU; u++) if (marge[u]) zone[u] = 0
  for (const u of topo) {
    if (toutMajeur[u]) zone[u] = 3
    else if (racine[u]) zone[u] = 1
    else {
      const ps = parentsPrincipaux(u)
      const outil = ps.length > 0 && ps.every((s) => racine[s]) && enfants[u]!.length >= 2 && noeudDe(u).type !== 'decision' && noeudDe(u).piste === 'active'
      zone[u] = outil ? 1 : 2
    }
  }

  // 4. Rangs : plus long chemin, bornés par zone (outils < étapes < résultats).
  const rang = new Int32Array(nP).fill(-1)
  const calculerRangs = (z: number, borne: number) => {
    for (const u of topo) {
      if (zone[u] !== z) continue
      let r = borne
      for (const s of parentsPrincipaux(u)) if (rang[s]! >= 0) r = Math.max(r, rang[s]! + 1)
      rang[u] = r
    }
    let max = borne - 1
    for (const u of topo) if (zone[u] === z) max = Math.max(max, rang[u]!)
    return max
  }
  const finOutils = calculerRangs(1, 0)
  const finEtapes = calculerRangs(2, finOutils + 1)
  const finResultats = calculerRangs(3, finEtapes + 1)
  const nbRangs = Math.max(finResultats, finEtapes, finOutils) + 1

  // 4 bis. Renvois : une prémisse outil (ou très partagée) citée loin en aval ne tire pas une longue
  // flèche à travers le tableau ; la carte cible la cite par son numéro, comme une équation « (2) ».
  const renvoi = new Uint8Array(g.aretes.length)
  const renvoisDe: number[][] = g.unites.map(() => [])
  const usagesRenvoi = new Map<number, number[]>()
  for (const a of g.aretes) {
    if (marge[a.source] || marge[a.cible]) continue
    const ecart = rang[a.cible]! - rang[a.source]!
    const sortants = enfants[a.source]!.filter((v) => !marge[v]).length
    if (ecart >= 2 && (zone[a.source] === 1 || sortants >= 3)) {
      renvoi[a.index] = 1
      renvoisDe[a.cible]!.push(a.source)
      let us = usagesRenvoi.get(a.source)
      if (!us) usagesRenvoi.set(a.source, (us = []))
      us.push(a.cible)
    }
  }

  // 5. Boîtes (dimensions, texte, pastilles).
  const boites: Boite[] = []
  const usagesPastille = new Map<number, number[]>()
  const W = o.largeurCarte
  for (let p = 0; p < nP; p++) {
    const n = noeudDe(p)
    const unite = p < nU ? g.unites[p]! : undefined
    const abandon = n.piste === 'abandonnee'
    let genre: GenreBoite = !unite ? 'masque' : n.type === 'choix_modelisation' ? 'drapeau' : n.type === 'decision' ? 'decision'
      : majeur(p) ? 'majeur' : unite.genre === 'etape' ? 'etape' : 'carte'
    if (genre === 'majeur' && unite?.genre === 'etape') genre = 'majeur'
    // Pastilles : contexte rattaché, sans les choix (représentés par leurs drapeaux).
    const pastilles: Pastille[] = []
    if (unite) {
      const vues = new Set<number>()
      const cands = unite.contexte
        .filter((c) => natureDe(j, c.noeud) !== 'choix' && !vues.has(c.noeud) && (vues.add(c.noeud), true))
        .map((c) => ({ c, l: lettrePastille(j.noeuds[c.noeud]!) }))
        .sort((a, b) => a.l.ordre - b.l.ordre || j.sortantes[b.c.noeud]!.length - j.sortantes[a.c.noeud]!.length)
      for (const { c, l } of cands) {
        pastilles.push({ noeud: c.noeud, lettre: l.lettre, couche: coucheDe(j.noeuds[c.noeud]!.type) })
        let us = usagesPastille.get(c.noeud)
        if (!us) usagesPastille.set(c.noeud, (us = []))
        us.push(p)
      }
    }
    const renvois = p < nU ? renvoisDe[p]! : []
    // Rangée de citations sous le bloc « (3) [1, 4] » : le rendu coupe ce qui dépasse la largeur.
    const montrees = Math.min(pastilles.length, o.maxPastilles)
    const plus = pastilles.length - montrees
    const rangeePastilles = montrees || renvois.length ? 15 : 0
    let w = W, h: number, haut: number, bas: number, lignes: string[], impasse: Boite['impasse'] = null
    const membres = unite?.membres.length ?? 1
    const etiquette = ''
    if (genre === 'drapeau') {
      // Hypothèse de modélisation composée comme un énoncé de théorème (HTML mesuré).
      lignes = []
      h = o.mesurer(p, genre, membres) + 2 * o.pad
      haut = h / 2
      bas = h / 2
    } else if (genre === 'decision') {
      lignes = []
      const hl = o.mesurer(p, genre, membres)
      const alt = n.decision?.alternatives.filter((a) => !a.retenue) ?? []
      if (alt.length) impasse = { texte: alt[0]!.libelle, autres: alt.length - 1 }
      h = hl + 6 + 38
      haut = hl + 6 + 19
      bas = 19 + (impasse ? 30 : 4) + rangeePastilles
    } else if (genre === 'masque') {
      lignes = couperLignes(n.nom, 150, `500 11px ${o.police}`, 1)
      w = 12
      h = 12
      haut = 6
      bas = 6
    } else {
      lignes = []
      h = o.mesurer(p, genre, membres) + 2 * o.pad
      haut = h / 2
      bas = h / 2 + (rangeePastilles ? rangeePastilles + 3 : 0)
    }
    boites.push({ genre, w, h, haut, bas, lignes, etiquette, pastilles: pastilles.slice(0, montrees), plus, renvois, numero: 0, impasse, zone: zone[p]!, rang: rang[p]!, abandon, ref: '', ports: [] })
  }

  // 6. Rangées : couches avec nœuds fictifs pour les arêtes longues.
  interface Element { id: number; point: number; arete: number; h: number; haut: number; bas: number; y: number }
  const couches: Element[][] = Array.from({ length: nbRangs }, () => [])
  const elements: Element[] = []
  const nouvel = (point: number, arete: number, r: number) => {
    const b = point >= 0 ? boites[point]! : null
    const e: Element = { id: elements.length, point, arete, h: b ? b.h : 6, haut: b ? b.haut : 3, bas: b ? b.bas : 3, y: 0 }
    elements.push(e)
    couches[r]!.push(e)
    return e
  }
  const elementDe = new Int32Array(nU).fill(-1)
  for (const u of topo) elementDe[u] = nouvel(u, -1, rang[u]!).id
  // Chaînes (élément → élément) pour l'ordre et les hauteurs.
  const pred: number[][] = [], succ: number[][] = []
  const chaines = new Map<number, number[]>()
  const lier = (a: number, b: number) => {
    pred[b] ??= []
    succ[a] ??= []
    pred[b]!.push(a)
    succ[a]!.push(b)
  }
  for (const a of g.aretes) {
    if (marge[a.source] || marge[a.cible] || renvoi[a.index]) continue
    const r0 = rang[a.source]!, r1 = rang[a.cible]!
    if (r1 <= r0) continue
    let prec = elementDe[a.source]!
    const chaine = [prec]
    for (let r = r0 + 1; r < r1; r++) {
      const d = nouvel(-1, a.index, r)
      lier(prec, d.id)
      chaine.push(d.id)
      prec = d.id
    }
    lier(prec, elementDe[a.cible]!)
    chaine.push(elementDe[a.cible]!)
    chaines.set(a.index, chaine)
  }
  for (let i = 0; i < elements.length; i++) {
    pred[i] ??= []
    succ[i] ??= []
  }

  // Ordre initial : position précédente (stabilité au dépliage) sinon ordre d'apparition.
  const clePrec = (e: Element): number => {
    if (!o.precedent || e.point < 0) return NaN
    return o.precedent.get(noeudDe(e.point).id) ?? NaN
  }
  for (const c of couches) {
    c.forEach((e, k) => (e.y = k))
    if (o.precedent) {
      const cles = c.map((e) => clePrec(e))
      if (cles.some((v) => !Number.isNaN(v))) {
        c.forEach((e, k) => (e.y = Number.isNaN(cles[k]!) ? k * 1e-3 : cles[k]!))
        c.sort((a, b) => a.y - b.y)
      }
    }
    c.forEach((e, k) => (e.y = k))
  }
  // Barycentres (descente / remontée) en gardant le meilleur ordre.
  const position = new Float64Array(elements.length)
  const majPositions = () => couches.forEach((c) => c.forEach((e, k) => (position[e.id] = k)))
  majPositions()
  const croisements = (): number => {
    let n = 0
    for (let r = 0; r + 1 < nbRangs; r++) {
      const seg: [number, number][] = []
      for (const e of couches[r]!) for (const s of succ[e.id]!) seg.push([position[e.id]!, position[s]!])
      for (let a = 0; a < seg.length; a++) for (let b = a + 1; b < seg.length; b++) {
        const [a0, a1] = seg[a]!, [b0, b1] = seg[b]!
        if ((a0 - b0) * (a1 - b1) < 0) n++
      }
    }
    return n
  }
  let meilleur = couches.map((c) => [...c])
  let meilleurScore = croisements()
  for (let passe = 0; passe < 16; passe++) {
    const descente = passe % 2 === 0
    const ordreRangs = descente ? [...couches.keys()].slice(1) : [...couches.keys()].reverse().slice(1)
    for (const r of ordreRangs) {
      const c = couches[r]!
      const cle = new Map<number, number>()
      for (const e of c) {
        const voisins = descente ? pred[e.id]! : succ[e.id]!
        cle.set(e.id, voisins.length ? voisins.reduce((s, v) => s + position[v]!, 0) / voisins.length : position[e.id]!)
      }
      c.sort((a, b) => cle.get(a.id)! - cle.get(b.id)! || position[a.id]! - position[b.id]!)
      c.forEach((e, k) => (position[e.id] = k))
    }
    const score = croisements()
    if (score < meilleurScore) {
      meilleurScore = score
      meilleur = couches.map((c) => [...c])
    }
  }
  couches.forEach((c, r) => {
    c.length = 0
    c.push(...meilleur[r]!)
  })
  majPositions()

  // 7. Hauteurs : régression isotone vers la moyenne des voisins (chaînes horizontales).
  const gap = o.ecartLignes
  const separation = (a: Element, b: Element) => a.bas + (a.point < 0 && b.point < 0 ? 4 : gap) + b.haut
  for (const c of couches) {
    let y = 0
    c.forEach((e, k) => {
      if (k) y += separation(c[k - 1]!, e)
      e.y = y
    })
  }
  const placer = (c: Element[], voulu: number[]) => {
    // PAV sur z_i = voulu_i − o_i (o_i = somme des séparations) : z croissant.
    const off: number[] = [0]
    for (let k = 1; k < c.length; k++) off.push(off[k - 1]! + separation(c[k - 1]!, c[k]!))
    const blocs: { somme: number; n: number; debut: number }[] = []
    for (let k = 0; k < c.length; k++) {
      blocs.push({ somme: voulu[k]! - off[k]!, n: 1, debut: k })
      while (blocs.length > 1) {
        const b = blocs[blocs.length - 1]!, a = blocs[blocs.length - 2]!
        if (a.somme / a.n <= b.somme / b.n) break
        a.somme += b.somme
        a.n += b.n
        blocs.pop()
      }
    }
    for (let bi = 0; bi < blocs.length; bi++) {
      const b = blocs[bi]!
      const fin = bi + 1 < blocs.length ? blocs[bi + 1]!.debut : c.length
      for (let k = b.debut; k < fin; k++) c[k]!.y = b.somme / b.n + off[k]!
    }
  }
  const yDe = (id: number) => elements[id]!.y
  for (let it = 0; it < 60; it++) {
    const ordre = it % 2 === 0 ? [...couches.keys()] : [...couches.keys()].reverse()
    for (const r of ordre) {
      const c = couches[r]!
      if (!c.length) continue
      const voulu = c.map((e) => {
        const v = [...pred[e.id]!, ...succ[e.id]!]
        // Les nœuds fictifs tirent fort : ils rendent les longues arêtes droites.
        return v.length ? v.reduce((s, x) => s + yDe(x), 0) / v.length : e.y
      })
      placer(c, voulu)
    }
  }

  // 8. Abscisses des rangs et de la marge.
  const pas = W + o.ecartColonnes
  const xMarge = 0
  const x0 = W / 2 + o.ecartColonnes * 1.25 + W / 2
  const xRang = (r: number) => x0 + r * pas
  const xs = new Float64Array(nP), ys = new Float64Array(nP)
  for (const e of elements) if (e.point >= 0) {
    xs[e.point] = xRang(rang[e.point]!)
    ys[e.point] = e.y
  }

  // Marge : drapeaux empilés en haut (une décision juste au-dessus du choix qu'elle fixe), puis
  // les décisions sans prémisse au niveau de leurs enfants.
  let ymin = Infinity, ymax = -Infinity
  for (const e of elements) if (e.point >= 0) {
    ymin = Math.min(ymin, e.y - e.haut)
    ymax = Math.max(ymax, e.y + e.bas)
  }
  if (!Number.isFinite(ymin)) ymin = ymax = 0
  const itemsMarge: number[] = []
  const choix = [...Array(nU).keys()].filter((u) => marge[u] && noeudDe(u).type === 'choix_modelisation')
  const portees = new Map<number, number[]>()
  const pointDe = (i: number): number | null => {
    const u = g.uniteDe[i]!
    if (u >= 0) return u
    const k = masques.indexOf(i)
    return k >= 0 ? nU + k : null
  }
  for (const c of choix) {
    const pts = new Set<number>()
    for (const d of dependantsDe(j, g.unites[c]!.conclusion)) {
      const q = pointDe(d)
      if (q !== null && q !== c) pts.add(q)
    }
    portees.set(c, [...pts])
  }
  choix.sort((a, b) => portees.get(b)!.length - portees.get(a)!.length)
  const liensMarge: { source: number; cible: number }[] = []
  const decisionsMarge = [...Array(nU).keys()].filter((u) => marge[u] && noeudDe(u).type === 'decision')
  const placees = new Set<number>()
  for (const c of choix) {
    for (const d of decisionsMarge) if (!placees.has(d) && enfants[d]!.includes(c) && enfants[d]!.every((v) => marge[v])) {
      itemsMarge.push(d)
      placees.add(d)
      liensMarge.push({ source: d, cible: c })
    }
    itemsMarge.push(c)
  }
  const voulusMarge: number[] = []
  let yPile = ymin
  for (const u of itemsMarge) {
    const b = boites[u]!
    yPile += b.haut
    voulusMarge.push(yPile)
    yPile += b.bas + gap * 0.6
  }
  for (const d of decisionsMarge) if (!placees.has(d)) {
    const cibles = enfants[d]!.filter((v) => !marge[v])
    const y = cibles.length ? cibles.reduce((s, v) => s + ys[v]!, 0) / cibles.length : yPile
    itemsMarge.push(d)
    voulusMarge.push(Math.max(y, yPile + boites[d]!.haut))
  }
  {
    const el: Element[] = itemsMarge.map((u) => ({ id: -1, point: u, arete: -1, h: boites[u]!.h, haut: boites[u]!.haut, bas: boites[u]!.bas, y: 0 }))
    const sep = (a: Element, b: Element) => a.bas + gap * 0.6 + b.haut
    // Tri par hauteur voulue, puis PAV (même contrainte d'écart).
    const ordre = el.map((e, k) => ({ e, v: voulusMarge[k]! })).sort((a, b) => a.v - b.v)
    const off: number[] = [0]
    for (let k = 1; k < ordre.length; k++) off.push(off[k - 1]! + sep(ordre[k - 1]!.e, ordre[k]!.e))
    const blocs: { somme: number; n: number; debut: number }[] = []
    ordre.forEach((x, k) => {
      blocs.push({ somme: x.v - off[k]!, n: 1, debut: k })
      while (blocs.length > 1) {
        const b = blocs[blocs.length - 1]!, a = blocs[blocs.length - 2]!
        if (a.somme / a.n <= b.somme / b.n) break
        a.somme += b.somme
        a.n += b.n
        blocs.pop()
      }
    })
    blocs.forEach((b, bi) => {
      const fin = bi + 1 < blocs.length ? blocs[bi + 1]!.debut : ordre.length
      for (let k = b.debut; k < fin; k++) {
        const u = ordre[k]!.e.point
        xs[u] = xMarge
        ys[u] = Math.max(ymin + boites[u]!.haut, b.somme / b.n + off[k]!)
        boites[u]!.zone = 0
      }
    })
  }
  for (const u of itemsMarge) {
    ymin = Math.min(ymin, ys[u]! - boites[u]!.haut)
    ymax = Math.max(ymax, ys[u]! + boites[u]!.bas)
  }

  // 9. Masqués (contexte pur) : colonne à gauche de la marge, visible avec les liens complets.
  const xMasques = xMarge - W / 2 - o.ecartColonnes * 1.6 - 60
  const hauteurDispo = Math.max(200, ymax - ymin)
  const parColonne = Math.max(1, Math.floor(hauteurDispo / 15))
  const ordreMasques = masques.map((m, k) => ({ m, k })).sort((a, b) => coucheDe(j.noeuds[a.m]!.type) - coucheDe(j.noeuds[b.m]!.type) || j.sortantes[b.m]!.length - j.sortantes[a.m]!.length)
  ordreMasques.forEach(({ k }, i) => {
    const col = Math.floor(i / parColonne), lig = i % parColonne
    xs[nU + k] = xMasques - col * 170
    ys[nU + k] = ymin + 6 + lig * 15
  })

  // Repères, de gauche à droite puis de haut en bas : énoncés numérotés comme des équations « (4) »,
  // décisions D1…, hypothèses de modélisation (i), (ii)… Un bloc cité par renvoi l'est par son repère.
  const citations = new Map<number, number>()
  const bibliographie: number[] = []
  const contexteAffiche = new Map<number, number>()
  {
    const cpt = { B: 0, D: 0, H: 0 }
    const ordre = [...Array(nU).keys()].sort((a, b) => (boites[a]!.zone === 0 ? -1 : rang[a]!) - (boites[b]!.zone === 0 ? -1 : rang[b]!) || ys[a]! - ys[b]!)
    for (const p of ordre) {
      const b = boites[p]!
      const l = b.genre === 'drapeau' ? 'H' : b.genre === 'decision' ? 'D' : 'B'
      b.numero = ++cpt[l]
      b.ref = l === 'H' ? `(${romain(b.numero)})` : l === 'D' ? `D${b.numero}` : `(${b.numero})`
    }
    // Contexte cité comme une bibliographie : numéros dans l'ordre de première citation. Un nœud de
    // contexte qui est aussi un énoncé affiché est cité par son repère.
    for (const p of ordre) for (const pa of boites[p]!.pastilles) {
      const u = g.uniteDe[pa.noeud]!
      if (u >= 0 && u < nU) contexteAffiche.set(pa.noeud, u)
      else if (!citations.has(pa.noeud)) {
        bibliographie.push(pa.noeud)
        citations.set(pa.noeud, bibliographie.length)
      }
    }
  }
  for (const b of boites) b.renvois.sort((a, c) => rang[a]! - rang[c]! || boites[a]!.numero - boites[c]!.numero)

  // 10. Routes orthogonales (stations : ports, nœuds fictifs, ports).
  const xDroite = (p: number) => xs[p]! + (boites[p]!.genre === 'decision' ? 19 : boites[p]!.w / 2)
  const xGauche = (p: number) => xs[p]! - (boites[p]!.genre === 'decision' ? 19 : boites[p]!.w / 2)
  interface Segment { route: Route; i: number; xa: number; ya: number; xb: number; yb: number; cle: string }
  const routes: Route[] = []
  const parCanal = new Map<number, Segment[]>()
  // Ports d'entrée : une liaison entrante par port, répartis sur le flanc gauche du bloc dans l'ordre
  // des ordonnées d'arrivée (pas de croisement à l'entrée). Losange : un seul port, au sommet gauche.
  const yPort = new Map<number, number>()
  {
    const entrees = new Map<number, { arete: number; y: number }[]>()
    for (const a of g.aretes) {
      if (marge[a.cible] || renvoi[a.index]) continue
      const chaine = chaines.get(a.index)
      const avant = chaine && chaine.length > 2 ? elements[chaine[chaine.length - 2]!]!.y : ys[a.source]!
      let l = entrees.get(a.cible)
      if (!l) entrees.set(a.cible, (l = []))
      l.push({ arete: a.index, y: avant })
    }
    for (const [c, l] of entrees) {
      const b = boites[c]!
      l.sort((u, v) => u.y - v.y || u.arete - v.arete)
      if (b.genre === 'decision' || l.length === 1) {
        for (const e of l) yPort.set(e.arete, ys[c]!)
        b.ports = [0]
        continue
      }
      // Sous l'en-tête (16 px), au-dessus de la jauge (10 px) ; pas minimal de 7 px.
      const y0 = -b.h / 2 + 18, y1 = b.h / 2 - 10
      const pasPort = Math.min(14, (y1 - y0) / Math.max(1, l.length - 1))
      const milieu = (y0 + y1) / 2
      b.ports = l.map((_, k) => milieu + (k - (l.length - 1) / 2) * pasPort)
      l.forEach((e, k) => yPort.set(e.arete, ys[c]! + b.ports[k]!))
    }
  }
  for (const a of g.aretes) {
    if (marge[a.cible] || renvoi[a.index]) continue
    const abandon = noeudDe(a.source).piste === 'abandonnee' || noeudDe(a.cible).piste === 'abandonnee'
    const route: Route = { arete: a.index, source: a.source, cible: a.cible, points: [], abandon }
    const stations: [number, number][] = [[xDroite(a.source), ys[a.source]!]]
    const chaine = chaines.get(a.index)
    if (chaine) for (const id of chaine.slice(1, -1)) {
      const e = elements[id]!
      const r = couches.findIndex((c) => c.includes(e))
      stations.push([xRang(r) - W / 2, e.y], [xRang(r) + W / 2, e.y])
    }
    stations.push([xGauche(a.cible), yPort.get(a.index) ?? ys[a.cible]!])
    routes.push(route)
    // Segments entre stations successives (paires : départ → arrivée à travers un canal).
    // Chaque port a sa piste verticale : pas de tronçon commun ambigu à l'arrivée.
    for (let k = 0; k + 1 < stations.length; k += 2) {
      const [xa, ya] = stations[k]!, [xb, yb] = stations[k + 1]!
      const canal = Math.round(xb)
      const cle = k + 2 >= stations.length ? `c${a.cible}:${a.index}` : `d${a.index}:${k}`
      const s: Segment = { route, i: k, xa, ya, xb, yb, cle }
      let l = parCanal.get(canal)
      if (!l) parCanal.set(canal, (l = []))
      l.push(s)
    }
    route.points = stations
  }
  // Pistes verticales : une par destination dans chaque canal, réparties au milieu du canal.
  const xPiste = new Map<Segment, number>()
  for (const segs of parCanal.values()) {
    const dest = [...new Set(segs.map((s) => s.cle))]
    const yDest = new Map(dest.map((d) => [d, segs.find((s) => s.cle === d)!.yb]))
    const ySrc = new Map(dest.map((d) => {
      const l = segs.filter((s) => s.cle === d)
      return [d, l.reduce((t, s) => t + s.ya, 0) / l.length]
    }))
    // Les destinations qui montent prennent les pistes de gauche en haut, etc. : on trie par pente.
    dest.sort((a, b) => (yDest.get(a)! - ySrc.get(a)!) - (yDest.get(b)! - ySrc.get(b)!) || yDest.get(a)! - yDest.get(b)!)
    const s0 = segs[0]!
    const largeur = Math.max(8, s0.xb - Math.max(...segs.map((s) => s.xa)))
    const xa = s0.xb - largeur
    dest.forEach((d, k) => {
      const x = xa + largeur * (dest.length === 1 ? 0.5 : 0.22 + 0.56 * (k / (dest.length - 1)))
      for (const s of segs) if (s.cle === d) xPiste.set(s, x)
    })
  }
  for (const r of routes) {
    const st = r.points
    const pts: [number, number][] = [st[0]!]
    for (let k = 0; k + 1 < st.length; k += 2) {
      const seg = [...parCanal.values()].flat().find((s) => s.route === r && s.i === k)!
      const xm = xPiste.get(seg) ?? (seg.xa + seg.xb) / 2
      const [, ya] = st[k]!, [xb, yb] = st[k + 1]!
      if (Math.abs(ya - yb) < 0.5) pts.push([xb, yb])
      else pts.push([xm, ya], [xm, yb], [xb, yb])
      if (k + 2 < st.length) pts.push(st[k + 2]!)
    }
    // Retirer les doublons consécutifs.
    r.points = pts.filter((p, k) => !k || Math.abs(p[0] - pts[k - 1]![0]) + Math.abs(p[1] - pts[k - 1]![1]) > 0.1)
  }

  // Jonctions : les liaisons d'une même sortie partagent le tronçon horizontal issu du port, puis
  // bifurquent chacune sur sa piste. Chaque bifurcation qui n'est pas la dernière est un « T » : point plein.
  const jonctions: [number, number][] = []
  {
    const parSource = new Map<number, [number, number][]>()
    for (const r of routes) {
      const pts = r.points
      let virage = pts[pts.length - 1]!
      for (let k = 1; k + 1 < pts.length; k++) {
        if (Math.abs(pts[k + 1]![0] - pts[k]![0]) < 0.5) {
          virage = pts[k]!
          break
        }
      }
      let l = parSource.get(r.source)
      if (!l) parSource.set(r.source, (l = []))
      l.push(virage)
    }
    for (const l of parSource.values()) {
      if (l.length < 2) continue
      const xMax = Math.max(...l.map((v) => v[0]))
      const faits = new Set<string>()
      for (const v of l) {
        const cle = `${Math.round(v[0])}:${Math.round(v[1])}`
        if (v[0] < xMax - 0.5 && !faits.has(cle)) {
          faits.add(cle)
          jonctions.push(v)
        }
      }
    }
  }

  // 11. Zones nommées.
  const zones: Zone[] = []
  const bord = o.ecartColonnes / 2
  if (itemsMarge.length) zones.push({ nom: 'Hypothèses', x0: xMarge - W / 2 - bord, x1: xMarge + W / 2 + bord })
  if (finOutils >= 0) zones.push({ nom: 'Outils', x0: xRang(0) - W / 2 - bord, x1: xRang(finOutils) + W / 2 + bord })
  if (finEtapes >= finOutils + 1) zones.push({ nom: 'Étapes', x0: xRang(finOutils + 1) - W / 2 - bord, x1: xRang(finEtapes) + W / 2 + bord })
  if (finResultats >= finEtapes + 1) zones.push({ nom: 'Résultats', x0: xRang(finEtapes + 1) - W / 2 - bord, x1: xRang(finResultats) + W / 2 + bord })

  // 12. Monde.
  let bx0 = Infinity, bx1 = -Infinity
  for (let p = 0; p < nU; p++) {
    bx0 = Math.min(bx0, xs[p]! - boites[p]!.w / 2)
    bx1 = Math.max(bx1, xs[p]! + boites[p]!.w / 2)
  }
  if (!Number.isFinite(bx0)) bx0 = bx1 = 0
  const cx = (bx0 + bx1) / 2, cy = (ymin + ymax) / 2
  const x = new Float32Array(nP), z = new Float32Array(nP), yCouche = new Float32Array(nP)
  const couche = new Int8Array(nP)
  const milieu = 3
  for (let p = 0; p < nP; p++) {
    x[p] = (xs[p]! - cx) * ECHELLE
    z[p] = -(ys[p]! - cy) * ECHELLE
    couche[p] = coucheDe(noeudDe(p).type)
    yCouche[p] = (couche[p]! - milieu) * o.ecartCouches
  }
  let wx0 = Infinity, wx1 = -Infinity, wz0 = Infinity, wz1 = -Infinity
  for (let p = 0; p < nU; p++) {
    wx0 = Math.min(wx0, x[p]!); wx1 = Math.max(wx1, x[p]!)
    wz0 = Math.min(wz0, z[p]!); wz1 = Math.max(wz1, z[p]!)
  }
  const disposition: Disposition = {
    moteur: 'dagre', nU, masques, x, z, yCouche, couche, rang,
    xRangs: Array.from({ length: nbRangs }, (_, r) => (xRang(r) - cx) * ECHELLE),
    xContexte: masques.length ? (xMasques - cx) * ECHELLE : NaN,
    bornes: { xmin: wx0, xmax: wx1, zmin: wz0, zmax: wz1 },
  }
  const page: MiseEnPage = {
    boites, routes, zones, liensMarge, portees, usagesPastille, usagesRenvoi, echelle: ECHELLE, cx, cy, citations, bibliographie, contexteAffiche,
    jonctions, xRangs: Array.from({ length: nbRangs }, (_, r) => xRang(r)), xMarge, largeurCarte: W,
    bornes: { x0: bx0, y0: ymin, x1: bx1, y1: ymax },
  }
  return { disposition, page }
}
