// Modèle du « plan de métro des arguments » (vision R2), sans DOM ni rendu.
//
// 1. Stratégie de lecture `r2-metro` : prémisses principales et auxiliaires ; le cadre commun
//    (définitions, axiomes, outils admis) devient du contexte ; les choix de modélisation ne tracent
//    plus d'arêtes (ils deviennent des zones tarifaires).
// 2. Parmi les unités de lecture : **stations** = résultats clés (théorèmes, propositions, conjectures,
//    résultats, nœuds reliés par une contradiction ou une résolution), **aiguillages** = décisions,
//    **terminus de départ** = hypothèses ; tout le reste est une **étape intermédiaire**, rangée dans
//    un seul tronçon (ou dans l'annexe en impasse d'une station).
// 3. **Tronçon** : station → station quand un chemin de lecture les relie sans passer par une autre
//    station (puis réduction transitive).
// 4. **Lignes** : une par sous-problème (fil d'argument). Un tronçon appartient à la ligne du
//    sous-problème majoritaire de ses étapes, sinon à celle de sa station de départ (le fil court
//    jusqu'à la correspondance où il est utilisé). Une ligne coupée en morceaux est raccordée par le
//    plus court chemin de stations : les tronçons partagés portent alors plusieurs lignes (parallèles).
// 5. **Zones tarifaires** : choix de modélisation regroupés quand ils couvrent presque les mêmes
//    stations (dépendances dans le graphe de justification complet).
// 6. **Mise en page** : colonnes = profondeur logique ; tronçons longs découpés par des points
//    fictifs ; ordre des colonnes par barycentres ; hauteurs par relaxation (régression isotone avec
//    écart minimal) puis grille ; tracés octolinéaires (0°, 45°, 90°) décalés en parallèle.

import {
  dependantsDe, type GrapheJustification, type NoeudR, type TypeRaisonnement,
} from '../../src/raisonnement/donnees'
import { etapeRoles, type EtapeLecture, type GrapheLecture, type StrategieLecture } from '../../src/raisonnement/lecture'

// ─── Stratégie de lecture ────────────────────────────────────────────────────

/** Nœud de pur contexte : cadre commun (hors hypothèses, choix, décisions) ou outil admis. */
function estCadre(n: NoeudR): boolean {
  if (n.type === 'hypothese' || n.type === 'choix_modelisation' || n.type === 'decision') return false
  if (n.sousProbleme === 'cadre') return true
  return n.admis && n.type !== 'definition'
}

/** Retire le cadre commun du graphe de lecture : ses arêtes deviennent du contexte. */
export const etapeCadre: EtapeLecture = (t) => {
  const retirer = new Set<number>()
  t.unites.forEach((u, i) => {
    if (u.vivante && estCadre(t.j.noeuds[u.conclusion]!)) retirer.add(i)
  })
  let aretes = 0
  for (const [k, a] of [...t.aretes]) {
    if (!retirer.has(a.source) && !retirer.has(a.cible)) continue
    const cible = retirer.has(a.cible) ? -1 : a.cible
    for (const e of [...a.resume, ...a.transitives]) t.versContexte(e, cible)
    aretes += a.resume.length + a.transitives.length
    t.aretes.delete(k)
  }
  for (const i of retirer) {
    const u = t.unites[i]!
    u.vivante = false
    for (const m of u.membres) t.uniteDe[m] = -1
  }
  t.journal.push(`Cadre commun : ${retirer.size} nœud(s) (définitions, axiomes, outils admis) rattaché(s) comme contexte, ${aretes} arête(s).`)
}

/** Les choix de modélisation ne tracent plus d'arêtes : ils deviennent des zones tarifaires. */
export const etapeChoixEnZones: EtapeLecture = (t) => {
  let n = 0
  for (const [k, a] of [...t.aretes]) {
    if (t.typeDe(a.source) !== 'choix_modelisation') continue
    for (const e of [...a.resume, ...a.transitives]) t.versContexte(e, a.cible)
    n++
    t.aretes.delete(k)
  }
  t.journal.push(`Choix de modélisation : ${n} arête(s) sortante(s) remplacée(s) par des zones tarifaires.`)
}

export const ID_STRATEGIE = 'r2-metro'

export const STRATEGIE_METRO: StrategieLecture = {
  id: ID_STRATEGIE,
  nom: 'R2 · Plan de métro',
  description: 'Prémisses principales et auxiliaires ; cadre commun rattaché comme contexte ; choix de modélisation en zones tarifaires. Les étapes intermédiaires sont rangées dans les tronçons entre stations.',
  etapes: [etapeRoles, etapeCadre, etapeChoixEnZones],
  parametres: { rolesRetenus: ['principale', 'auxiliaire'], masquerContexte: true },
}

// ─── Types du plan ───────────────────────────────────────────────────────────

export type GenreStation = 'terminus' | 'station' | 'aiguillage' | 'zone'
export type Pt = [number, number]

export interface StationM {
  /** Unité de lecture (= point de la vue). */
  u: number
  noeud: number
  genre: GenreStation
  /** Ligne « maison » (sous-problème), -1 pour le cadre. */
  ligne: number
  /** Lignes qui desservent la station (triées). */
  lignes: number[]
  colonne: number
  /** Position de mise en page : x vers la droite, y vers le bas (unité = une piste). */
  x: number
  y: number
  /** Étendue verticale du symbole (décalages des lignes parallèles). */
  haut: number
  bas: number
  /** Hors du plan (choix de modélisation, aiguillage sans tronçon) : montré dans la légende. */
  horsPlan: boolean
}

export interface TronconM {
  index: number
  de: number
  vers: number
  /** Lignes qui empruntent le tronçon (la première est la ligne propre). */
  lignes: number[]
  /** Étapes intermédiaires rangées dans ce tronçon (unités), ordre du raisonnement. */
  etapes: number[]
  /** Unités sur un chemin de → vers. */
  chemin: number[]
  /** Tracé central octolinéaire. */
  trace: Pt[]
  /** Tracé de chaque ligne (décalé en parallèle), dans l'ordre de `lignes`. */
  traces: Pt[][]
}

export interface LigneM {
  index: number
  sp: string
  nom: string
  numero: string
  abandonnee: boolean
  /** Stations desservies (unités), de gauche à droite. */
  stations: number[]
  troncons: number[]
  etapes: number
}

export interface ZoneM {
  index: number
  nom: string
  /** Choix de modélisation regroupés (unités). */
  choix: number[]
  /** Stations qui dépendent d'au moins un des choix (unités). */
  stations: number[]
  /** Tronçons dont les deux extrémités sont dans la zone. */
  troncons: number[]
  couverture: number
  /** Profondeur d'imbrication (0 = la plus large). */
  niveau: number
}

export interface AnnexeM {
  station: number
  /** Étapes en impasse (vérifications, remarques…) rattachées à la station. */
  etapes: number[]
}

export interface PlanM {
  lecture: GrapheLecture
  stations: StationM[]
  /** Unité → indice dans `stations` (-1 sinon). */
  stationDe: Int32Array
  troncons: TronconM[]
  lignes: LigneM[]
  zones: ZoneM[]
  annexes: AnnexeM[]
  tronconDe: Int32Array
  annexeDe: Int32Array
  orphelines: number[]
  colonnes: number
  largeurColonne: number
  bornes: { x0: number; x1: number; y0: number; y1: number }
  /** Positions des choix de modélisation (pastilles de zone) et des aiguillages du cadre. */
  ancres: Map<number, Pt>
}

export interface OptionsPlan {
  /** Types devenant des stations (s'ils ne sont pas admis). */
  typesStation: TypeRaisonnement[]
  /** Largeur d'une colonne (en pistes). */
  largeurColonne: number
  /** Écart minimal entre deux éléments d'une colonne (en pistes). */
  ecartMin: number
  /** Décalage entre lignes parallèles (en pistes). */
  ecartParallele: number
  /** Attraction de chaque ligne vers sa bande horizontale (0 = libre). */
  attractionBande: number
  /** Seuil de regroupement des choix en zones (Jaccard). */
  seuilZone: number
  /** Nombre minimal d'étapes pour garder un tronçon court-circuité par la réduction transitive. */
  seuilTroncon: number
  /** Un terminus dont la première station est au-delà de cette colonne est rapproché d'elle. */
  eloignementTerminus: number
  /** Coût d'un croisement face à un coude (recherche locale). */
  poidsCroisement: number
}

export const OPTIONS_PLAN: OptionsPlan = {
  typesStation: ['theoreme', 'resultat', 'decision', 'proposition', 'conjecture'],
  largeurColonne: 2.4,
  ecartMin: 1,
  ecartParallele: 0.17,
  attractionBande: 0.25,
  seuilZone: 0.85,
  seuilTroncon: 4,
  eloignementTerminus: 4,
  poidsCroisement: 12,
}

// ─── Construction ────────────────────────────────────────────────────────────

export function construirePlan(g: GrapheLecture, options: Partial<OptionsPlan> = {}): PlanM {
  const o = { ...OPTIONS_PLAN, ...options }
  const j: GrapheJustification = g.justification
  const jeu = j.jeu
  const nU = g.unites.length
  const noeudDe = (u: number) => j.noeuds[g.unites[u]!.conclusion]!
  const typesStation = new Set(o.typesStation)
  const ciblesLiens = new Set<string>()
  for (const n of j.noeuds) for (const l of n.liens ?? []) ciblesLiens.add(l.cible)

  // ── Genre de chaque unité ──
  const genre: (GenreStation | null)[] = []
  for (let u = 0; u < nU; u++) {
    const n = noeudDe(u)
    let gnr: GenreStation | null = null
    if (n.type === 'hypothese') gnr = 'terminus'
    else if (n.type === 'choix_modelisation') gnr = 'zone'
    else if (n.type === 'decision') gnr = 'aiguillage'
    else if (!n.admis && (typesStation.has(n.type) || n.liens?.length || ciblesLiens.has(n.id))) gnr = 'station'
    genre.push(gnr)
  }
  const estArret = (u: number) => genre[u] === 'station' || genre[u] === 'aiguillage' || genre[u] === 'terminus'

  // Accessibilité à travers les étapes (ni station, ni zone).
  const parcourir = (depart: number, versAval: boolean) => {
    const etapes = new Set<number>(), arrets = new Set<number>()
    const pile = [depart]
    const vus = new Set<number>([depart])
    while (pile.length) {
      const x = pile.pop()!
      for (const e of versAval ? g.sortantes[x]! : g.entrantes[x]!) {
        const a = g.aretes[e]!
        const y = versAval ? a.cible : a.source
        if (vus.has(y)) continue
        vus.add(y)
        if (genre[y] === 'zone') continue
        if (estArret(y)) arrets.add(y)
        else {
          etapes.add(y)
          pile.push(y)
        }
      }
    }
    return { etapes, arrets }
  }
  // Une proposition en impasse (aucune station en aval, aucune en amont hors terminus) redevient une étape.
  for (let u = 0; u < nU; u++) {
    if (genre[u] !== 'station' || noeudDe(u).type !== 'proposition') continue
    if (parcourir(u, true).arrets.size === 0 && !noeudDe(u).liens?.length) genre[u] = null
  }
  const avant = new Map<number, Set<number>>(), atteintes = new Map<number, Set<number>>()
  const arriere = new Map<number, Set<number>>()
  const arrets: number[] = []
  for (let u = 0; u < nU; u++) {
    if (!estArret(u)) continue
    arrets.push(u)
    const f = parcourir(u, true), b = parcourir(u, false)
    avant.set(u, f.etapes)
    atteintes.set(u, f.arrets)
    arriere.set(u, b.etapes)
  }

  // ── Graphe des stations : ordre topologique et réduction transitive ──
  const degre = new Map<number, number>(arrets.map((u) => [u, 0]))
  for (const u of arrets) for (const v of atteintes.get(u)!) degre.set(v, degre.get(v)! + 1)
  const ordre: number[] = []
  const file = arrets.filter((u) => degre.get(u) === 0)
  while (file.length) {
    const u = file.shift()!
    ordre.push(u)
    for (const v of atteintes.get(u)!) {
      degre.set(v, degre.get(v)! - 1)
      if (degre.get(v) === 0) file.push(v)
    }
  }
  const accessibles = new Map<number, Set<number>>()
  for (let i = ordre.length - 1; i >= 0; i--) {
    const u = ordre[i]!
    const s = new Set<number>()
    for (const v of atteintes.get(u)!) {
      s.add(v)
      for (const w of accessibles.get(v) ?? []) s.add(w)
    }
    accessibles.set(u, s)
  }
  const paires: Pt[] = []
  for (const u of ordre) {
    const fils = [...atteintes.get(u)!]
    for (const c of fils) if (!fils.some((v) => v !== c && accessibles.get(v)?.has(c))) paires.push([u, c])
  }

  // ── Lignes : une par sous-problème non « cadre » ──
  const spLignes = jeu.sousProblemes.filter((s) => s.id !== 'cadre').map((s) => s.id)
  for (const u of arrets) {
    const sp = noeudDe(u).sousProbleme
    if (sp !== 'cadre' && !spLignes.includes(sp)) spLignes.push(sp)
  }
  const ligneDeSp = new Map(spLignes.map((s, i) => [s, i]))
  const lignes: LigneM[] = spLignes.map((sp, i) => {
    const s = jeu.sousProblemes.find((x) => x.id === sp)
    const court = (s?.nom ?? sp).replace(/^SP\d+\s*·\s*/, '').replace(/^Piste abandonnée\s*·\s*/i, '')
    const nom = s?.abandonne ? `Piste ${court} (abandonnée)` : court.charAt(0).toUpperCase() + court.slice(1)
    return { index: i, sp, nom, numero: String(i + 1), abandonnee: !!s?.abandonne, stations: [], troncons: [], etapes: 0 }
  })
  const ligneDe = (u: number) => ligneDeSp.get(noeudDe(u).sousProbleme) ?? -1

  // ── Étapes : chaque étape est rangée entre sa station amont la plus proche et sa station aval la
  //    plus précoce (paire du graphe réduit de préférence) ; sans aval, dans l'annexe d'une station amont.
  const rang = new Map<number, number>()
  ordre.forEach((u, i) => rang.set(u, i))
  const reduites = new Set(paires.map(([a, b]) => a * nU + b))
  const amonts: number[][] = [], avals: number[][] = []
  for (let u = 0; u < nU; u++) { amonts.push([]); avals.push([]) }
  for (const u of arrets) {
    for (const x of avant.get(u)!) amonts[x]!.push(u)
    for (const x of arriere.get(u)!) avals[x]!.push(u)
  }
  const affectation = new Map<number, number[]>()
  const affecter = (a: number, b: number, x: number) => {
    const k = a * nU + b
    if (!affectation.has(k)) affectation.set(k, [])
    affectation.get(k)!.push(x)
  }
  const annexes: AnnexeM[] = []
  const annexeDe = new Int32Array(nU).fill(-1)
  const annexe = (s: number, x: number) => {
    let an = annexes.find((a) => a.station === s)
    if (!an) annexes.push((an = { station: s, etapes: [] }))
    annexeDe[x] = annexes.indexOf(an)
    an.etapes.push(x)
  }
  const sansAmont: number[] = []
  let restantes: number[] = []
  for (let x = 0; x < nU; x++) {
    if (genre[x] !== null) continue
    const up = amonts[x]!, dn = avals[x]!
    if (up.length && dn.length) {
      let meilleur: [number, number] | null = null, score = -Infinity
      for (const a of up) for (const b of dn) {
        const sc = (reduites.has(a * nU + b) ? 1e6 : 0) + rang.get(a)! * 1e3 - rang.get(b)!
        if (sc > score) { score = sc; meilleur = [a, b] }
      }
      affecter(meilleur![0], meilleur![1], x)
    } else if (dn.length) sansAmont.push(x)
    else if (up.length) {
      const lx = ligneDe(x)
      const ups = [...up].sort((a, b) => rang.get(b)! - rang.get(a)!)
      annexe(ups.find((u) => ligneDe(u) === lx) ?? ups[0]!, x)
    } else restantes.push(x)
  }

  // ── Tronçons : graphe réduit + paires qui portent assez d'étapes (sinon repliées sur le graphe réduit) ──
  const cles = new Set(reduites)
  const aReplacer: [number, number][] = []
  for (const [k, xs] of affectation) {
    if (reduites.has(k) || xs.length >= o.seuilTroncon) cles.add(k)
    else {
      for (const x of xs) aReplacer.push([x, k % nU])
      affectation.delete(k)
    }
  }
  const troncons: TronconM[] = [...cles].sort((p, q) => rang.get(Math.floor(p / nU))! - rang.get(Math.floor(q / nU))! || rang.get(p % nU)! - rang.get(q % nU)!)
    .map((k, index) => {
      const a = Math.floor(k / nU), b = k % nU
      return { index, de: a, vers: b, lignes: [], etapes: affectation.get(k) ?? [], chemin: [...avant.get(a)!].filter((x) => arriere.get(b)!.has(x)), trace: [], traces: [] }
    })
  const entrants = new Map<number, TronconM[]>()
  for (const t of troncons) {
    if (!entrants.has(t.vers)) entrants.set(t.vers, [])
    entrants.get(t.vers)!.push(t)
  }
  const sortants = new Map<number, TronconM[]>()
  for (const t of troncons) {
    if (!sortants.has(t.de)) sortants.set(t.de, [])
    sortants.get(t.de)!.push(t)
  }
  const tronconDe = new Int32Array(nU).fill(-1)
  // Étapes sans station amont (ou repliées) : dans un tronçon entrant de leur station aval, de
  // préférence depuis une de leurs stations amont, la plus proche.
  for (const x of sansAmont) aReplacer.push([x, [...avals[x]!].sort((p, q) => rang.get(p)! - rang.get(q)!)[0]!])
  for (const [x, b] of aReplacer) {
    const up = new Set(amonts[x]!)
    const cands = [...(entrants.get(b) ?? [])].sort((p, q) => (up.has(q.de) ? 1e6 : 0) - (up.has(p.de) ? 1e6 : 0) + rang.get(q.de)! - rang.get(p.de)!)
    const t = cands.find((c) => up.has(c.de)) ?? cands.find((c) => ligneDe(c.de) === ligneDe(x)) ?? cands[0]
    if (t) t.etapes.push(x)
    else restantes.push(x)
  }
  for (const t of troncons) for (const x of t.etapes) tronconDe[x] = t.index
  // Étapes isolées : rangées avec une étape voisine déjà placée.
  for (let garde = 0; garde < 6 && restantes.length; garde++) {
    const encore: number[] = []
    for (const x of restantes) {
      let fait = false
      for (const e of [...g.entrantes[x]!, ...g.sortantes[x]!]) {
        const a = g.aretes[e]!
        const y = a.source === x ? a.cible : a.source
        if (tronconDe[y]! >= 0) {
          tronconDe[x] = tronconDe[y]!
          troncons[tronconDe[y]!]!.etapes.push(x)
          fait = true
          break
        }
        if (annexeDe[y]! >= 0) {
          annexe(annexes[annexeDe[y]!]!.station, x)
          fait = true
          break
        }
      }
      if (!fait) encore.push(x)
    }
    restantes = encore
  }
  const ordreUnite = (a: number, b: number) => g.unites[a]!.conclusion - g.unites[b]!.conclusion
  for (const t of troncons) t.etapes.sort(ordreUnite)
  for (const a of annexes) a.etapes.sort(ordreUnite)

  // ── Ligne propre de chaque tronçon : sous-problème majoritaire de ses étapes, sinon de son chemin,
  //    sinon celui de la station de départ (le fil court jusqu'à la correspondance qui l'utilise). ──
  for (const t of troncons) {
    const vote = (liste: number[]) => {
      const votes = new Map<number, number>()
      for (const x of liste) {
        const l = ligneDe(x)
        if (l >= 0) votes.set(l, (votes.get(l) ?? 0) + 1)
      }
      let ligne = -1, max = 0
      for (const [l, k] of votes) if (k > max || (k === max && l === ligneDe(t.vers))) { ligne = l; max = k }
      return ligne
    }
    let l = vote(t.etapes)
    if (l < 0) l = vote(t.chemin)
    if (l < 0) l = ligneDe(t.de) >= 0 && genre[t.de] !== 'terminus' ? ligneDe(t.de) : ligneDe(t.vers)
    t.lignes = l >= 0 ? [l] : []
  }
  for (const t of troncons) {
    if (t.lignes.length) continue
    const suite = troncons.find((x) => x.de === t.vers && x.lignes.length)
    t.lignes = [suite ? suite.lignes[0]! : 0]
  }

  // ── Continuité des lignes : un morceau isolé est raccordé au morceau principal ──
  for (const L of lignes) {
    for (let garde = 0; garde < 8; garde++) {
      const segs = troncons.filter((t) => t.lignes.includes(L.index))
      // Composantes (non orientées) des stations de la ligne.
      const parent = new Map<number, number>()
      const racine = (x: number): number => {
        while (parent.get(x) !== x) x = parent.get(x)!
        return x
      }
      for (const t of segs) for (const x of [t.de, t.vers]) if (!parent.has(x)) parent.set(x, x)
      for (const t of segs) parent.set(racine(t.de), racine(t.vers))
      const tailles = new Map<number, number>()
      for (const t of segs) tailles.set(racine(t.de), (tailles.get(racine(t.de)) ?? 0) + 1)
      if (tailles.size <= 1) break
      const principale = [...tailles].sort((a, b) => b[1] - a[1])[0]![0]
      let raccorde = false
      for (const [comp] of tailles) {
        if (comp === principale) continue
        // Station d'entrée du morceau : la plus à gauche (rang topologique minimal).
        const membres = [...parent.keys()].filter((x) => racine(x) === comp)
        const entree = membres.sort((a, b) => ordre.indexOf(a) - ordre.indexOf(b))[0]!
        // Plus court chemin (en tronçons, vers l'amont) jusqu'à une station du morceau principal.
        const prec = new Map<number, TronconM>()
        const f = [entree]
        const vus = new Set([entree])
        let trouve = -1
        while (f.length && trouve < 0) {
          const x = f.shift()!
          for (const t of entrants.get(x) ?? []) {
            if (vus.has(t.de)) continue
            vus.add(t.de)
            prec.set(t.de, t)
            if (parent.has(t.de) && racine(t.de) === principale && genre[t.de] !== 'terminus') { trouve = t.de; break }
            f.push(t.de)
          }
        }
        if (trouve >= 0) {
          for (let x = trouve; x !== entree;) {
            const t = prec.get(x)!
            if (!t.lignes.includes(L.index)) t.lignes.push(L.index)
            x = t.vers
          }
          raccorde = true
          break
        }
        // Sinon, vers l'aval : de la sortie du morceau jusqu'au morceau principal.
        const sortie = membres[membres.length - 1]!
        const suiv = new Map<number, TronconM>()
        const f2 = [sortie]
        const vus2 = new Set([sortie])
        let arrivee = -1
        while (f2.length && arrivee < 0) {
          const x = f2.shift()!
          for (const t of sortants.get(x) ?? []) {
            if (vus2.has(t.vers)) continue
            vus2.add(t.vers)
            suiv.set(t.vers, t)
            if (parent.has(t.vers) && racine(t.vers) === principale) { arrivee = t.vers; break }
            f2.push(t.vers)
          }
        }
        if (arrivee < 0) continue
        for (let x = arrivee; x !== sortie;) {
          const t = suiv.get(x)!
          if (!t.lignes.includes(L.index)) t.lignes.push(L.index)
          x = t.de
        }
        raccorde = true
        break
      }
      if (!raccorde) break
    }
  }

  // ── Stations ──
  const stations: StationM[] = []
  const stationDe = new Int32Array(nU).fill(-1)
  for (let u = 0; u < nU; u++) {
    if (genre[u] === null) continue
    stationDe[u] = stations.length
    stations.push({ u, noeud: g.unites[u]!.conclusion, genre: genre[u]!, ligne: ligneDe(u), lignes: [], colonne: 0, x: 0, y: 0, haut: 0, bas: 0, horsPlan: false })
  }
  const st = (u: number) => stations[stationDe[u]!]!
  for (const t of troncons) {
    for (const l of t.lignes) {
      for (const u of [t.de, t.vers]) if (!st(u).lignes.includes(l)) st(u).lignes.push(l)
      lignes[l]!.troncons.push(t.index)
    }
    lignes[t.lignes[0]!]!.etapes += t.etapes.length
  }
  for (const s of stations) {
    s.lignes.sort((a, b) => a - b)
    if (s.genre === 'zone') continue
    if (s.ligne < 0 || !s.lignes.includes(s.ligne)) {
      const votes = new Map<number, number>()
      for (const t of troncons) if (t.de === s.u || t.vers === s.u) votes.set(t.lignes[0]!, (votes.get(t.lignes[0]!) ?? 0) + 1)
      let best = s.ligne, max = 0
      for (const [l, k] of votes) if (k > max) { best = l; max = k }
      s.ligne = best
    }
  }

  // ── Zones tarifaires ──
  const visibles = stations.filter((s) => s.genre !== 'zone' && s.genre !== 'terminus')
  const couverts = new Map<number, Set<number>>()
  for (const s of stations) {
    if (s.genre !== 'zone') continue
    const dep = new Set(dependantsDe(j, s.noeud))
    couverts.set(s.u, new Set(visibles.filter((x) => dep.has(x.noeud)).map((x) => x.u)))
  }
  const jaccard = (a: Set<number>, b: Set<number>) => {
    let inter = 0
    for (const x of a) if (b.has(x)) inter++
    return inter / Math.max(1, a.size + b.size - inter)
  }
  const groupes: number[][] = []
  for (const [c, ens] of couverts) {
    const gr = groupes.find((gg) => jaccard(couverts.get(gg[0]!)!, ens) >= o.seuilZone)
    if (gr) gr.push(c)
    else groupes.push([c])
  }
  const zones: ZoneM[] = groupes.map((choix, index) => {
    const union = new Set<number>()
    for (const c of choix) for (const x of couverts.get(c)!) union.add(x)
    const stationsZ = [...union]
    return {
      index,
      nom: choix.length === 1 ? noeudDe(choix[0]!).nom : 'Cadre discret',
      choix, stations: stationsZ,
      troncons: troncons.filter((t) => union.has(t.de) && union.has(t.vers)).map((t) => t.index),
      couverture: stationsZ.length / Math.max(1, visibles.length), niveau: 0,
    }
  })
  zones.sort((a, b) => b.couverture - a.couverture)
  zones.forEach((z, i) => {
    z.index = i
    z.niveau = i
  })

  const plan: PlanM = {
    lecture: g, stations, stationDe, troncons, lignes, zones, annexes, tronconDe, annexeDe, orphelines: restantes,
    colonnes: 0, largeurColonne: o.largeurColonne, bornes: { x0: 0, x1: 0, y0: 0, y1: 0 }, ancres: new Map(),
  }
  disposerPlan(plan, o, ordre)
  for (const L of lignes) L.stations = stations.filter((s) => s.lignes.includes(L.index)).sort((a, b) => a.x - b.x || a.y - b.y).map((s) => s.u)
  return plan
}

// ─── Mise en page ────────────────────────────────────────────────────────────

interface Noeud {
  /** Station (unité) ou -1 pour un point fictif. */
  u: number
  troncon: number
  colonne: number
  y: number
  /** Hauteur visée (bande de la ligne). */
  y0: number
  voisins: number[]
  poids: number[]
}

function disposerPlan(plan: PlanM, o: OptionsPlan, ordre: number[]): void {
  const { stations, stationDe, troncons, lignes } = plan
  const st = (u: number) => stations[stationDe[u]!]!
  const W = o.largeurColonne

  // Colonnes : plus long chemin depuis les terminus ; une station sans prédécesseur est tirée
  // juste avant son premier successeur (les tronçons restent courts).
  const pred = new Map<number, number[]>(), succ = new Map<number, number[]>()
  for (const t of troncons) {
    if (!succ.has(t.de)) succ.set(t.de, [])
    if (!pred.has(t.vers)) pred.set(t.vers, [])
    succ.get(t.de)!.push(t.vers)
    pred.get(t.vers)!.push(t.de)
  }
  const col = new Map<number, number>()
  for (const u of ordre) {
    let c = st(u).genre === 'terminus' ? 0 : 1
    for (const p of pred.get(u) ?? []) c = Math.max(c, col.get(p)! + 1)
    col.set(u, c)
  }
  for (let i = ordre.length - 1; i >= 0; i--) {
    const u = ordre[i]!
    const s = succ.get(u)
    if (!s?.length || (pred.get(u)?.length ?? 0) > 0) continue
    const avantSucc = Math.min(...s.map((v) => col.get(v)!)) - 1
    // Un terminus reste à gauche, sauf s'il ne dessert qu'une branche lointaine.
    if (st(u).genre === 'terminus' && avantSucc < o.eloignementTerminus) continue
    col.set(u, Math.max(col.get(u)!, avantSucc))
  }
  let nbCol = 1
  for (const u of ordre) {
    st(u).colonne = col.get(u)!
    nbCol = Math.max(nbCol, col.get(u)! + 1)
  }
  plan.colonnes = nbCol
  plan.largeurColonne = W

  // Bandes : ordre des lignes qui minimise le trajet vertical des tronçons entre lignes.
  const nL = lignes.length
  const poidsL = Array.from({ length: nL }, () => new Array<number>(nL).fill(0))
  for (const t of troncons) {
    const l0 = t.lignes[0]!
    for (const u of [t.de, t.vers]) {
      const l = st(u).ligne
      if (l >= 0 && l !== l0) { poidsL[l0]![l]!++; poidsL[l]![l0]!++ }
    }
    for (const l of t.lignes.slice(1)) { poidsL[l0]![l]! += 2; poidsL[l]![l0]! += 2 }
  }
  let meilleur = [...Array(nL).keys()], cout = Infinity
  const permuter = (reste: number[], acc: number[]) => {
    if (!reste.length) {
      let c = 0
      for (let a = 0; a < nL; a++) for (let b = a + 1; b < nL; b++) c += poidsL[acc[a]!]![acc[b]!]! * (b - a)
      if (c < cout) { cout = c; meilleur = [...acc] }
      return
    }
    for (let i = 0; i < reste.length; i++) permuter([...reste.slice(0, i), ...reste.slice(i + 1)], [...acc, reste[i]!])
  }
  if (nL <= 7) permuter([...Array(nL).keys()], [])
  // Hauteur de bande proportionnelle au nombre maximal de stations de la ligne dans une colonne.
  const bandeY = new Map<number, number>()
  let yb = 0
  for (const l of meilleur) {
    const parCol = new Map<number, number>()
    for (const s of stations) if (s.ligne === l && s.genre !== 'zone') parCol.set(s.colonne, (parCol.get(s.colonne) ?? 0) + 1)
    const h = Math.max(1, ...parCol.values())
    bandeY.set(l, yb + (h - 1) / 2)
    yb += h + 0.5
  }

  // Nœuds : stations + points fictifs des tronçons longs.
  const noeuds: Noeud[] = []
  const idStation = new Map<number, number>()
  for (const s of stations) {
    if (s.genre === 'zone') continue
    if (s.genre === 'aiguillage' && !troncons.some((t) => t.de === s.u || t.vers === s.u)) continue
    idStation.set(s.u, noeuds.length)
    const y0 = s.ligne >= 0 ? bandeY.get(s.ligne)! : yb
    noeuds.push({ u: s.u, troncon: -1, colonne: s.colonne, y: y0, y0, voisins: [], poids: [] })
  }
  const chaines: number[][] = []
  const lier = (a: number, b: number, w: number) => {
    noeuds[a]!.voisins.push(b); noeuds[a]!.poids.push(w)
    noeuds[b]!.voisins.push(a); noeuds[b]!.poids.push(w)
  }
  for (const t of troncons) {
    const a = idStation.get(t.de)!, b = idStation.get(t.vers)!
    const ca = noeuds[a]!.colonne, cb = noeuds[b]!.colonne
    const chaine = [a]
    for (let c = ca + 1; c < cb; c++) {
      const f = (c - ca) / (cb - ca)
      const y0 = bandeY.get(t.lignes[0]!) ?? noeuds[a]!.y0 * (1 - f) + noeuds[b]!.y0 * f
      chaine.push(noeuds.length)
      noeuds.push({ u: -1, troncon: t.index, colonne: c, y: y0, y0, voisins: [], poids: [] })
    }
    chaine.push(b)
    for (let k = 0; k + 1 < chaine.length; k++) {
      const fictifs = (noeuds[chaine[k]!]!.u < 0 ? 1 : 0) + (noeuds[chaine[k + 1]!]!.u < 0 ? 1 : 0)
      lier(chaine[k]!, chaine[k + 1]!, fictifs === 2 ? 6 : fictifs === 1 ? 2.5 : 1)
    }
    chaines[t.index] = chaine
  }
  const colonnes: number[][] = Array.from({ length: nbCol }, () => [])
  noeuds.forEach((n, i) => colonnes[n.colonne]!.push(i))

  // Ordre dans les colonnes : bandes, puis balayages de barycentres (on garde le meilleur).
  for (const c of colonnes) c.sort((a, b) => noeuds[a]!.y0 - noeuds[b]!.y0)
  const position = new Float64Array(noeuds.length)
  const numeroter = () => colonnes.forEach((c) => c.forEach((i, k) => (position[i] = k)))
  const croisements = () => {
    let n = 0
    for (let c = 0; c + 1 < nbCol; c++) {
      const aretes: Pt[] = []
      for (const i of colonnes[c]!) for (const v of noeuds[i]!.voisins) if (noeuds[v]!.colonne === c + 1) aretes.push([position[i]!, position[v]!])
      for (let a = 0; a < aretes.length; a++) for (let b = a + 1; b < aretes.length; b++) {
        const [p1, q1] = aretes[a]!, [p2, q2] = aretes[b]!
        if ((p1 - p2) * (q1 - q2) < 0) n++
      }
    }
    return n
  }
  numeroter()
  let meilleurOrdre = colonnes.map((c) => [...c]), meilleursCroisements = croisements()
  for (let it = 0; it < 12; it++) {
    const versDroite = it % 2 === 0
    const suite = versDroite ? [...Array(nbCol).keys()].slice(1) : [...Array(nbCol).keys()].reverse().slice(1)
    for (const c of suite) {
      const cVoisine = versDroite ? c - 1 : c + 1
      const bary = new Map<number, number>()
      for (const i of colonnes[c]!) {
        const vs = noeuds[i]!.voisins.filter((v) => noeuds[v]!.colonne === cVoisine)
        bary.set(i, vs.length ? vs.reduce((s, v) => s + position[v]!, 0) / vs.length : position[i]!)
      }
      colonnes[c]!.sort((a, b) => bary.get(a)! - bary.get(b)! || position[a]! - position[b]!)
      colonnes[c]!.forEach((i, k) => (position[i] = k))
    }
    const n = croisements()
    if (n < meilleursCroisements) {
      meilleursCroisements = n
      meilleurOrdre = colonnes.map((c) => [...c])
    }
  }
  meilleurOrdre.forEach((c, k) => (colonnes[k] = c))
  numeroter()

  // Hauteurs : relaxation (voisins + attraction de bande), ordre et écart minimal garantis par
  // une régression isotone pondérée dans chaque colonne.
  const s0 = o.ecartMin
  const placerColonne = (c: number[], vise: number[], poids: number[]) => {
    const blocs: { somme: number; w: number; n: number }[] = []
    c.forEach((_, k) => {
      blocs.push({ somme: (vise[k]! - k * s0) * poids[k]!, w: poids[k]!, n: 1 })
      while (blocs.length > 1) {
        const b = blocs[blocs.length - 1]!, a = blocs[blocs.length - 2]!
        if (a.somme / a.w <= b.somme / b.w) break
        a.somme += b.somme; a.w += b.w; a.n += b.n
        blocs.pop()
      }
    })
    let k = 0
    for (const b of blocs) for (let m = 0; m < b.n; m++, k++) noeuds[c[k]!]!.y = b.somme / b.w + k * s0
  }
  for (const c of colonnes) c.forEach((i, k) => (noeuds[i]!.y = noeuds[i]!.y0 + k * 0.001))
  for (let it = 0; it < 60; it++) {
    const suite = it % 2 === 0 ? colonnes : [...colonnes].reverse()
    for (const c of suite) {
      const vise: number[] = [], poids: number[] = []
      for (const i of c) {
        const n = noeuds[i]!
        const lam = n.u >= 0 ? Math.max(0.01, o.attractionBande) : 0.02
        let s = lam * n.y0, w = lam
        n.voisins.forEach((v, k) => { s += n.poids[k]! * noeuds[v]!.y; w += n.poids[k]! })
        vise.push(s / w)
        poids.push(n.u >= 0 ? 1 : 0.6)
      }
      placerColonne(c, vise, poids)
    }
  }
  // Grille entière (une piste), écart minimal préservé.
  for (const c of colonnes) {
    let prec = -Infinity
    for (const i of c) {
      const n = noeuds[i]!
      n.y = Math.max(Math.round(n.y), prec + s0)
      prec = n.y
    }
  }
  // Recherche locale : déplacer un nœud (ou toute une chaîne fictive) sur la hauteur d'un voisin
  // quand cela réduit croisements et coudes, sans jamais violer l'écart minimal.
  const aretes: [number, number][] = []
  for (let i = 0; i < noeuds.length; i++) for (const v of noeuds[i]!.voisins) if (noeuds[v]!.colonne === noeuds[i]!.colonne + 1) aretes.push([i, v])
  const parEcart: [number, number][][] = Array.from({ length: nbCol }, () => [])
  for (const a of aretes) parEcart[noeuds[a[0]]!.colonne]!.push(a)
  const m0 = 0.32
  const coutTotal = () => {
    let c = 0
    for (const [i, j] of aretes) {
      const dy = Math.abs(noeuds[i]!.y - noeuds[j]!.y)
      c += dy < 1e-6 ? 0 : dy <= W - 2 * m0 ? 2 + dy * 0.2 : 4 + dy * 0.2
    }
    for (const liste of parEcart) {
      for (let a = 0; a < liste.length; a++) for (let b = a + 1; b < liste.length; b++) {
        const [i1, j1] = liste[a]!, [i2, j2] = liste[b]!
        if (i1 === i2 || j1 === j2) continue
        if ((noeuds[i1]!.y - noeuds[i2]!.y) * (noeuds[j1]!.y - noeuds[j2]!.y) < 0) c += o.poidsCroisement
      }
    }
    return c
  }
  const libre = (i: number, y: number, ignorer: Set<number>) => {
    const n = noeuds[i]!
    return colonnes[n.colonne]!.every((k) => k === i || ignorer.has(k) || Math.abs(noeuds[k]!.y - y) >= s0 - 1e-6)
  }
  let cour = coutTotal()
  const yBas = Math.min(...noeuds.map((n) => n.y)) - s0, yHaut = Math.max(...noeuds.map((n) => n.y)) + s0
  for (let passe = 0; passe < 12; passe++) {
    let ameliore = false
    // Chaînes fictives entières.
    for (const t of troncons) {
      const fictifs = chaines[t.index]!.slice(1, -1)
      if (!fictifs.length) continue
      const ens = new Set(fictifs)
      const ch = chaines[t.index]!
      const cands = new Set([noeuds[ch[0]!]!.y, noeuds[ch[ch.length - 1]!]!.y, ...fictifs.map((i) => noeuds[i]!.y)])
      const avant = fictifs.map((i) => noeuds[i]!.y)
      for (const y of cands) {
        if (!fictifs.every((i) => libre(i, y, ens))) continue
        for (const i of fictifs) noeuds[i]!.y = y
        const c = coutTotal()
        if (c < cour - 1e-9) { cour = c; ameliore = true; avant.splice(0, avant.length, ...fictifs.map((i) => noeuds[i]!.y)) }
        else fictifs.forEach((i, k) => (noeuds[i]!.y = avant[k]!))
      }
    }
    // Nœuds seuls : hauteurs des voisins, ± une piste.
    for (let i = 0; i < noeuds.length; i++) {
      const n = noeuds[i]!
      const y0 = n.y
      const cands = new Set<number>()
      for (const v of n.voisins) { cands.add(noeuds[v]!.y); cands.add(noeuds[v]!.y + s0); cands.add(noeuds[v]!.y - s0) }
      // Les stations peuvent aussi sauter plus loin dans leur colonne (échange avec un voisin de rang).
      if (n.u >= 0) for (let y = yBas; y <= yHaut; y += s0) cands.add(y)
      for (const y of cands) {
        if (y === n.y || !libre(i, y, new Set())) continue
        const prec = n.y
        n.y = y
        const c = coutTotal()
        if (c < cour - 1e-9) { cour = c; ameliore = true }
        else n.y = prec
      }
      void y0
    }
    if (!ameliore) break
  }
  // Recalage : ordre des colonnes cohérent avec les hauteurs finales.
  for (const c of colonnes) c.sort((a, b) => noeuds[a]!.y - noeuds[b]!.y)

  // Positions finales des stations.
  const ymin = Math.min(...noeuds.map((n) => n.y))
  for (const n of noeuds) n.y -= ymin
  for (const n of noeuds) {
    if (n.u < 0) continue
    const s = st(n.u)
    s.x = n.colonne * W
    s.y = n.y
  }

  // Tracés octolinéaires : sortie et arrivée horizontales, diagonale à 45° centrée ; si la
  // dénivelée dépasse la largeur disponible, diagonale – verticale – diagonale. `decalage` écarte la
  // verticale des lignes parallèles pour qu'elles ne se superposent pas.
  const m = 0.32
  const relier = (a: Pt, b: Pt, pts: Pt[], decalage: number) => {
    const [x1, y1] = a, [x2, y2] = b
    const dx = x2 - x1, dy = y2 - y1, ady = Math.abs(dy), sy = Math.sign(dy)
    if (ady < 1e-6) { pts.push([x2, y2]); return }
    if (ady <= dx - 2 * m) {
      const xd = x1 + (dx - ady) / 2
      pts.push([xd, y1], [xd + ady, y2], [x2, y2])
    } else {
      const mm = Math.min(m, dx / 4)
      const xv = Math.min(x2 - mm - 0.02, Math.max(x1 + mm + 0.02, x1 + dx / 2 - decalage * sy))
      const d1 = xv - x1 - mm, d2 = x2 - mm - xv
      pts.push([x1 + mm, y1], [xv, y1 + sy * d1], [xv, y2 - sy * d2], [x2 - mm, y2], [x2, y2])
    }
  }
  // Emplacements des lignes : à chaque station, les lignes sont empilées dans l'ordre des bandes ;
  // dans un tronçon partagé, idem. Chaque ligne a son propre tracé (parallèles, jamais superposées).
  const g = o.ecartParallele
  const rangBande = (l: number) => meilleur.indexOf(l)
  const emplacement = (liste: number[], l: number) => {
    const tri = [...liste].sort((a, b) => rangBande(a) - rangBande(b))
    return (tri.indexOf(l) - (tri.length - 1) / 2) * g
  }
  for (const s of stations) { s.haut = 0; s.bas = 0 }
  for (const t of troncons) {
    const ch = chaines[t.index]!
    const route = (sA: number, sT: number, sB: number): Pt[] => {
      const pts: Pt[] = [[noeuds[ch[0]!]!.colonne * W, noeuds[ch[0]!]!.y + sA]]
      for (let k = 1; k < ch.length; k++) {
        const n = noeuds[ch[k]!]!
        const s = k === ch.length - 1 ? sB : sT
        relier(pts[pts.length - 1]!, [n.colonne * W, n.y + s], pts, sT)
      }
      return simplifier(pts)
    }
    t.trace = route(0, 0, 0)
    t.traces = t.lignes.map((l) => route(emplacement(st(t.de).lignes, l), emplacement(t.lignes, l), emplacement(st(t.vers).lignes, l)))
    for (const [u, debut] of [[t.de, true], [t.vers, false]] as const) {
      const s = st(u)
      for (const tr of t.traces) {
        const p = debut ? tr[0]! : tr[tr.length - 1]!
        s.haut = Math.min(s.haut, p[1] - s.y)
        s.bas = Math.max(s.bas, p[1] - s.y)
      }
    }
  }

  // Bornes, puis ancres : aiguillages du cadre et pastilles de zones au-dessus du plan.
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const s of stations) {
    if (!idStation.has(s.u)) continue
    x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y)
  }
  plan.bornes = { x0, x1, y0, y1 }
  // Hors plan : choix de modélisation (zones) et aiguillages sans tronçon, montrés dans la légende.
  for (const s of stations) {
    if (idStation.has(s.u)) continue
    s.horsPlan = true
    s.x = x0
    s.y = y1
    plan.ancres.set(s.u, [x0, y1])
  }
}

/** Retire les points alignés (tracé plus court, décalage propre). */
function simplifier(pts: Pt[]): Pt[] {
  const r: Pt[] = []
  for (const p of pts) {
    const q = r[r.length - 1]
    if (q && Math.abs(q[0] - p[0]) < 1e-9 && Math.abs(q[1] - p[1]) < 1e-9) continue
    if (r.length >= 2) {
      const a = r[r.length - 2]!, b = r[r.length - 1]!
      const cross = (b[0] - a[0]) * (p[1] - b[1]) - (b[1] - a[1]) * (p[0] - b[0])
      if (Math.abs(cross) < 1e-9) r.pop()
    }
    r.push(p)
  }
  return r
}

/** Décalage perpendiculaire (à gauche du sens de parcours, y vers le bas) avec jointures en onglet. */
export function decaler(pts: Pt[], d: number): Pt[] {
  if (Math.abs(d) < 1e-9 || pts.length < 2) return pts.map((p) => [p[0], p[1]] as Pt)
  const normale = (a: Pt, b: Pt): Pt => {
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const l = Math.hypot(dx, dy) || 1
    return [dy / l, -dx / l]
  }
  const r: Pt[] = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    const n1 = i > 0 ? normale(pts[i - 1]!, p) : null
    const n2 = i < pts.length - 1 ? normale(p, pts[i + 1]!) : null
    let nx: number, ny: number
    if (n1 && n2) {
      const mx = n1[0] + n2[0], my = n1[1] + n2[1]
      const l = Math.hypot(mx, my) || 1
      const cos = (mx / l) * n1[0] + (my / l) * n1[1]
      nx = (mx / l) / Math.max(0.3, cos)
      ny = (my / l) / Math.max(0.3, cos)
    } else [nx, ny] = (n1 ?? n2)!
    r.push([p[0] + nx * d, p[1] + ny * d])
  }
  return r
}

/** Point à la fraction f (0…1) de la longueur d'un tracé. */
export function pointSur(pts: Pt[], f: number): Pt {
  let total = 0
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1])
  let reste = total * Math.min(1, Math.max(0, f))
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!
    const l = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (reste <= l || i === pts.length - 1) {
      const t = l ? Math.min(1, reste / l) : 0
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    }
    reste -= l
  }
  return pts[0] ?? [0, 0]
}

/** Résumé texte (débogage, NOTES). */
export function resumerPlan(p: PlanM): string {
  const nom = (u: number) => p.lecture.justification.noeuds[p.lecture.unites[u]!.conclusion]!.id
  const l: string[] = []
  const arrets = p.stations.filter((s) => s.genre !== 'zone')
  l.push(`arrêts ${arrets.length} (terminus ${arrets.filter((s) => s.genre === 'terminus').length}, aiguillages ${arrets.filter((s) => s.genre === 'aiguillage').length}), zones ${p.zones.length} (${p.zones.map((z) => z.choix.length).join('+')} choix), tronçons ${p.troncons.length}, annexes ${p.annexes.length}, orphelines ${p.orphelines.length}, colonnes ${p.colonnes}`)
  for (const li of p.lignes) l.push(`ligne ${li.numero} ${li.nom} : ${li.stations.map(nom).join(', ')} | ${li.troncons.length} tronçons, ${li.etapes} étapes`)
  for (const t of p.troncons) l.push(`  [${t.lignes.map((x) => x + 1).join('+')}] ${nom(t.de)} → ${nom(t.vers)} (${t.etapes.length}) ${t.trace.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ')}`)
  for (const a of p.annexes) l.push(`  annexe ${nom(a.station)} : ${a.etapes.map(nom).join(' ')}`)
  for (const z of p.zones) l.push(`  zone ${z.nom} [${z.choix.map(nom).join(' ')}] ${Math.round(z.couverture * 100)} %`)
  for (const s of p.stations) l.push(`  ${s.genre} ${nom(s.u)} ligne ${s.ligne} [${s.lignes}] col ${s.colonne} (${s.x.toFixed(1)}, ${s.y.toFixed(2)})`)
  l.push(`orphelines : ${p.orphelines.map(nom).join(' ')}`)
  return l.join('\n')
}
