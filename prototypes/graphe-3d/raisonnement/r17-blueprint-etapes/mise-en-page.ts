// R17 · Mise en page « Blueprint » : colonnes = rangs logiques, liaisons orthogonales, blocs de raisonnement.
// Reprise de R14 (ports répartis, jonctions, repères B / D / H), avec :
//   - des rangs équilibrés : plus long chemin, puis chaque unité glisse vers ses conséquences quand elle a
//     plus d'enfants que de parents (une source se place juste avant ce qu'elle alimente) ;
//   - des blocs de raisonnement (etapes.ts) contigus dans chaque rang, et des cadres qui ne se chevauchent
//     jamais (balayage : chaque bloc, dans l'ordre vertical, se place sous ceux qui partagent ses colonnes,
//     au plus près de l'alignement avec ses voisins) ;
//   - un choix de modélisation issu d'une décision qui reste dans le flux (plus dans la marge) ;
//   - des décisions en cartes : une ligne par alternative, broche de sortie pleine pour la retenue, creuse
//     (non connectée) pour les rejetées ;
//   - pour chaque liaison, le rôle de la prémisse (couleur du fil) et la famille de la source (couleur de la
//     broche d'entrée).
//
// Coordonnées de mise en page en px (y vers le bas), converties en monde (× 0,01) pour la vue :
//   X monde = x, Z monde = −y, Y monde = couche de type (3D).

import {
  coucheDe, dependantsDe, FORCE_ROLE, LIBELLES_TYPE,
  type Disposition, type GrapheLecture, type NoeudR, type RolePremisse,
} from '../../src/raisonnement'
import { familleDe, regrouper, type Etape, type Famille } from './etapes'

export type GenreBoite = 'drapeau' | 'decision' | 'carte' | 'etape' | 'majeur' | 'masque'

export interface Pastille {
  /** Nœud de justification rattaché. */
  noeud: number
  lettre: string
  couche: number
}

export interface Alternative {
  texte: string
  retenue: boolean
}

export interface Boite {
  genre: GenreBoite
  famille: Famille
  /** Largeur et hauteur de la carte. */
  w: number
  h: number
  /** Distance du point d'ancrage (centre de la carte) au haut et au bas de la boîte complète. */
  haut: number
  bas: number
  lignes: string[]
  etiquette: string
  pastilles: Pastille[]
  /** Pastilles non montrées. */
  plus: number
  /** Renvois : prémisses lointaines citées par leur repère au lieu d'un très long fil. */
  renvois: number[]
  /** Numéro de repère (B3 → 3). */
  numero: number
  /** Décision : alternatives affichées (retenue d'abord) et nombre de rejetées non montrées. */
  alternatives: Alternative[]
  autresAlternatives: number
  /** 0 marge (spécifications), 2 flux, −1 masqué. */
  zone: number
  rang: number
  abandon: boolean
  /** Repère de schéma : « B7 » (bloc), « D2 » (décision), « H1 » (hypothèse de modélisation). */
  ref: string
  /** Spécification (choix de modélisation) : lignes « Hyp. : … ». */
  specs: string[]
  /** Ordonnées relatives des ports d'entrée (flanc gauche) et famille de la source de chacun. */
  ports: number[]
  portsFamille: Famille[]
  /** Ordonnée relative du port de sortie. */
  ySortie: number
  /** Bloc de raisonnement (index dans `page.etapes`). */
  etape: number
}

/** Police à chasse fixe des repères, cotes et spécifications. */
export const MONO = `'JetBrains Mono', ui-monospace, 'Cascadia Mono', 'SF Mono', Consolas, monospace`

/** Hauteur de l'en-tête coloré d'une carte. */
export const EN_TETE = 18
/** Hauteur d'une ligne d'alternative (décision). */
export const LIGNE_ALT = 13
/** Cadres des blocs : marges intérieures et barre de titre (px de mise en page). */
export const CADRE = { padX: 12, padY: 10, titre: 30, ecart: 18 }

export interface Route {
  arete: number
  source: number
  cible: number
  /** Points de la ligne brisée orthogonale (px de mise en page). */
  points: [number, number][]
  abandon: boolean
  /** Rôle le plus fort parmi les prémisses représentées (couleur du fil). */
  role: RolePremisse
}

export interface MiseEnPage {
  boites: Boite[]
  routes: Route[]
  etapes: Etape[]
  /** Liens décision → choix dans la marge. */
  liensMarge: { source: number; cible: number }[]
  /** Pour chaque choix (point) : les points qui en dépendent dans le graphe complet. */
  portees: Map<number, number[]>
  /** Nœud de contexte → points qui le portent en pastille. */
  usagesPastille: Map<number, number[]>
  /** Point cité par renvoi → points qui le citent. */
  usagesRenvoi: Map<number, number[]>
  /** Jonctions (px de mise en page) : une sortie qui se divise en plusieurs liaisons. */
  jonctions: [number, number][]
  /** Abscisses (px) des rangs logiques et de la marge des spécifications. */
  xRangs: number[]
  xMarge: number
  aMarge: boolean
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
  /** Montrer les alternatives rejetées dans les cartes de décision. */
  alternativesRejetees: boolean
  /** Positions précédentes (id de nœud conclusion → y) : ordre stable d'une dérivation à l'autre. */
  precedent?: Map<string, number>
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

  // 1. Marge des spécifications : choix SANS prémisse de travail (un choix issu d'une décision reste dans le
  //    flux), décisions sans prémisse, décisions qui ne mènent qu'à la marge.
  const marge = new Uint8Array(nU)
  for (let u = 0; u < nU; u++) {
    const n = noeudDe(u)
    if (n.type === 'choix_modelisation' && parents[u]!.length === 0) marge[u] = 1
    else if (n.type === 'decision' && parents[u]!.length === 0 && enfants[u]!.every((v) => noeudDe(v).type === 'choix_modelisation' && parents[v]!.length <= 1)) marge[u] = 1
  }
  for (let u = 0; u < nU; u++) {
    const n = noeudDe(u)
    if (n.type === 'decision' && enfants[u]!.length && enfants[u]!.every((v) => marge[v]) && parents[u]!.every((s) => marge[s])) marge[u] = 1
  }
  // Un choix dont la seule prémisse est une décision de marge reste avec elle.
  for (let u = 0; u < nU; u++) if (noeudDe(u).type === 'choix_modelisation' && parents[u]!.length && parents[u]!.every((s) => marge[s])) marge[u] = 1

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
  const enfantsPrincipaux = (u: number) => enfants[u]!.filter((v) => !marge[v])
  const majeur = (u: number) => {
    const n = noeudDe(u)
    return (n.type === 'theoreme' || n.type === 'resultat') && !n.admis
  }

  // 3. Rangs : plus long chemin (au plus tôt), puis au plus tard sauf pour les puits.
  const rang = new Int32Array(nP).fill(-1)
  for (const u of topo) {
    let r = 0
    for (const s of parentsPrincipaux(u)) if (rang[s]! >= 0) r = Math.max(r, rang[s]! + 1)
    rang[u] = r
  }
  // Au plus tard : chaque unité qui a des conséquences se place juste avant la plus proche d'entre elles ;
  // un puits garde son rang au plus tôt (au plus près de ses prémisses).
  for (let k = topo.length - 1; k >= 0; k--) {
    const u = topo[k]!
    const es = enfantsPrincipaux(u)
    if (!es.length) continue
    const hi = es.reduce((m, v) => Math.min(m, rang[v]! - 1), Infinity)
    if (Number.isFinite(hi) && hi > rang[u]!) rang[u] = hi
  }
  {
    let rMin = Infinity
    for (const u of topo) rMin = Math.min(rMin, rang[u]!)
    if (Number.isFinite(rMin) && rMin > 0) for (const u of topo) rang[u]! -= rMin
  }
  let nbRangs = 0
  for (const u of topo) nbRangs = Math.max(nbRangs, rang[u]! + 1)

  // 3 bis. Renvois : un énoncé très partagé (≥ 4 usages) cité loin en aval ne tire pas un long fil à travers
  // le schéma ; la carte cible le cite par son repère.
  const renvoi = new Uint8Array(g.aretes.length)
  const renvoisDe: number[][] = g.unites.map(() => [])
  const usagesRenvoi = new Map<number, number[]>()
  for (const a of g.aretes) {
    if (marge[a.source] || marge[a.cible]) continue
    const ecart = rang[a.cible]! - rang[a.source]!
    if (ecart >= 2 && enfantsPrincipaux(a.source).length >= 4) {
      renvoi[a.index] = 1
      renvoisDe[a.cible]!.push(a.source)
      let us = usagesRenvoi.get(a.source)
      if (!us) usagesRenvoi.set(a.source, (us = []))
      us.push(a.cible)
    }
  }

  // 4. Blocs de raisonnement.
  const { etapes, etapeDe } = regrouper({ g, nU, noeudDe, parents, enfants, rang, marge })

  // 5. Boîtes (dimensions, texte, pastilles).
  const fontTitre = (gras: boolean) => `${gras ? 650 : 560} ${o.taillePolice}px ${o.police}`
  const lh = o.taillePolice + 3
  const boites: Boite[] = []
  const usagesPastille = new Map<number, number[]>()
  const W = o.largeurCarte
  for (let p = 0; p < nP; p++) {
    const n = noeudDe(p)
    const unite = p < nU ? g.unites[p]! : undefined
    const abandon = n.piste === 'abandonnee'
    const genre: GenreBoite = !unite ? 'masque' : n.type === 'choix_modelisation' ? 'drapeau' : n.type === 'decision' ? 'decision'
      : majeur(p) ? 'majeur' : unite.genre === 'etape' ? 'etape' : 'carte'
    // Pastilles : contexte rattaché, sans les choix (représentés par les repères ⊢ H).
    const pastilles: Pastille[] = []
    if (unite) {
      const vues = new Set<number>()
      const cands = unite.contexte
        .filter((c) => j.noeuds[c.noeud]!.type !== 'choix_modelisation' && !vues.has(c.noeud) && (vues.add(c.noeud), true))
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
    // La rangée tient dans la largeur de la carte : connecteurs de renvoi (32 px) puis bornes (15 px).
    const place = Math.max(0, Math.floor((W - 16 - renvois.length * 32 - 18) / 15))
    const montrees = Math.min(pastilles.length, o.maxPastilles, place)
    const plus = pastilles.length - montrees
    const rangeePastilles = pastilles.length || renvois.length ? 17 : 0
    let w = W, h: number, haut: number, bas: number, lignes: string[]
    let specs: string[] = []
    const alternatives: Alternative[] = []
    let autresAlternatives = 0
    let ySortie = 0
    const etiquette = etiquetteDe(n, unite?.genre === 'etape' ? unite.membres.length : 1, genre)
    if (genre === 'masque') {
      lignes = couperLignes(n.nom, 150, `500 11px ${o.police}`, 1)
      w = 12
      h = 12
      haut = 6
      bas = 6
    } else {
      lignes = couperLignes(n.nom, w - 14, fontTitre(genre === 'majeur' || genre === 'decision' || genre === 'drapeau'), genre === 'drapeau' ? 2 : 3)
      h = EN_TETE + 4 + lignes.length * lh + 4
      if (genre === 'drapeau') {
        // Spécification : l'hypothèse écrite comme une spécification.
        const tSpec = o.taillePolice - 2
        specs = n.choix?.hypothese ? couperLignes(`Hyp. : ${n.choix.hypothese}`, w - 14, `400 ${tSpec}px ${MONO}`, 4) : []
        if (specs.length) h += 4 + specs.length * (tSpec + 3)
        h += 4
      } else if (genre === 'decision') {
        // Une ligne par alternative : la retenue (broche de sortie pleine), puis les rejetées (creuses).
        const alts = n.decision?.alternatives ?? []
        const retenue = alts.find((a) => a.retenue)
        if (retenue) alternatives.push({ texte: retenue.libelle, retenue: true })
        const rejetees = alts.filter((a) => !a.retenue)
        if (o.alternativesRejetees) {
          for (const a of rejetees.slice(0, 2)) alternatives.push({ texte: a.libelle, retenue: false })
          autresAlternatives = Math.max(0, rejetees.length - 2)
        } else autresAlternatives = rejetees.length
        if (alternatives.length) h += 2 + alternatives.length * LIGNE_ALT + (autresAlternatives && o.alternativesRejetees ? 10 : 0)
        h += 4
        if (retenue) ySortie = -h / 2 + EN_TETE + 4 + lignes.length * lh + 4 + 2 + LIGNE_ALT / 2
      } else h += 12 // jauge de confiance
      haut = h / 2
      bas = h / 2 + (rangeePastilles ? rangeePastilles + 3 : 0)
    }
    boites.push({
      genre, famille: familleDe(n.type), w, h, haut, bas, lignes, etiquette, pastilles: pastilles.slice(0, montrees), plus, renvois,
      numero: 0, alternatives, autresAlternatives, zone: unite ? (marge[p] ? 0 : 2) : -1, rang: rang[p]!, abandon, ref: '', specs,
      ports: [], portsFamille: [], ySortie, etape: p < nU ? etapeDe[p]! : -1,
    })
  }

  // 6. Rangées : couches avec nœuds fictifs pour les arêtes longues.
  interface Element { id: number; point: number; arete: number; rang: number; h: number; haut: number; bas: number; y: number }
  const couches: Element[][] = Array.from({ length: nbRangs }, () => [])
  const elements: Element[] = []
  const nouvel = (point: number, arete: number, r: number) => {
    const b = point >= 0 ? boites[point]! : null
    const e: Element = { id: elements.length, point, arete, rang: r, h: b ? b.h : 6, haut: b ? b.haut : 3, bas: b ? b.bas : 3, y: 0 }
    elements.push(e)
    couches[r]!.push(e)
    return e
  }
  const elementDe = new Int32Array(nU).fill(-1)
  for (const u of topo) elementDe[u] = nouvel(u, -1, rang[u]!).id
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
  // Clé de bloc d'un élément (fixée plus bas) : les membres d'un bloc restent contigus dans chaque rang.
  let cleBloc: ((e: Element) => number) | null = null
  const ordonner = (passes: number) => {
    let meilleur = couches.map((c) => [...c])
    let meilleurScore = croisements()
    for (let passe = 0; passe < passes; passe++) {
      const descente = passe % 2 === 0
      const ordreRangs = descente ? [...couches.keys()].slice(1) : [...couches.keys()].reverse().slice(1)
      for (const r of ordreRangs) {
        const c = couches[r]!
        const cle = new Map<number, number>()
        for (const e of c) {
          const voisins = descente ? pred[e.id]! : succ[e.id]!
          cle.set(e.id, voisins.length ? voisins.reduce((s, v) => s + position[v]!, 0) / voisins.length : position[e.id]!)
        }
        const kb = cleBloc
        c.sort((a, b) => (kb ? kb(a) - kb(b) : 0) || cle.get(a.id)! - cle.get(b.id)! || position[a.id]! - position[b.id]!)
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
  }
  ordonner(16)

  // 7. Hauteurs : régression isotone vers la moyenne des voisins (chaînes horizontales).
  const gap = o.ecartLignes
  const encadre = (e: Element) => e.point >= 0 && etapes[etapeDe[e.point]!]!.encadre
  let parBlocs = false
  const separation = (a: Element, b: Element) => {
    if (a.point < 0 && b.point < 0) return a.bas + 4 + b.haut
    if (!parBlocs) return a.bas + gap + b.haut
    const memeBloc = a.point >= 0 && b.point >= 0 && etapeDe[a.point] === etapeDe[b.point]
    if (memeBloc) return a.bas + gap + b.haut
    const basA = encadre(a) ? CADRE.padY : 0, hautB = encadre(b) ? CADRE.padY + CADRE.titre : 0
    const ecart = a.point < 0 || b.point < 0 ? 8 : encadre(a) || encadre(b) ? CADRE.ecart : gap
    return a.bas + basA + ecart + hautB + b.haut
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
  const aligner = (iterations: number) => {
    for (const c of couches) {
      let y = 0
      c.forEach((e, k) => {
        if (k) y += separation(c[k - 1]!, e)
        e.y = y
      })
    }
    for (let it = 0; it < iterations; it++) {
      const ordre = it % 2 === 0 ? [...couches.keys()] : [...couches.keys()].reverse()
      for (const r of ordre) {
        const c = couches[r]!
        if (!c.length) continue
        const voulu = c.map((e) => {
          const v = [...pred[e.id]!, ...succ[e.id]!]
          return v.length ? v.reduce((s, x) => s + yDe(x), 0) / v.length : e.y
        })
        placer(c, voulu)
      }
    }
  }
  aligner(60)

  // 7 bis. Blocs : ordre vertical des blocs (hauteur moyenne de leurs membres), membres contigus dans chaque
  // rang, puis balayage sans chevauchement des cadres.
  const ordreBloc = new Float64Array(etapes.length)
  {
    const moy = etapes.map((et) => {
      const ys = et.membres.filter((u) => !marge[u] && elementDe[u]! >= 0).map((u) => elements[elementDe[u]!]!.y)
      return ys.length ? ys.reduce((s, y) => s + y, 0) / ys.length : 0
    })
    const tri = etapes.map((_, k) => k).sort((a, b) => moy[a]! - moy[b]!)
    tri.forEach((k, i) => (ordreBloc[k] = i))
  }
  const sourceFictif = (e: Element) => g.aretes[e.arete]!.source
  cleBloc = (e: Element) => (e.point >= 0 ? ordreBloc[etapeDe[e.point]!]! : ordreBloc[etapeDe[sourceFictif(e)]!]! + 0.5)
  for (const c of couches) {
    c.sort((a, b) => cleBloc!(a) - cleBloc!(b) || a.y - b.y)
  }
  majPositions()
  ordonner(6)
  parBlocs = true
  aligner(40)
  {
    // Éléments d'un « objet » rigide : un bloc (toutes ses unités), ou un nœud fictif seul.
    interface Objet { cle: number; elements: Element[]; c0: number; c1: number; cadre: boolean }
    const objets: Objet[] = []
    const objetDe = new Int32Array(elements.length).fill(-1)
    const parEtape = new Map<number, Objet>()
    for (const e of elements) {
      if (e.point >= 0) {
        const k = etapeDe[e.point]!
        let ob = parEtape.get(k)
        if (!ob) {
          ob = { cle: ordreBloc[k]!, elements: [], c0: Infinity, c1: -Infinity, cadre: etapes[k]!.encadre }
          parEtape.set(k, ob)
          objets.push(ob)
        }
        ob.elements.push(e)
        ob.c0 = Math.min(ob.c0, e.rang)
        ob.c1 = Math.max(ob.c1, e.rang)
      } else objets.push({ cle: cleBloc(e), elements: [e], c0: e.rang, c1: e.rang, cadre: false })
    }
    objets.sort((a, b) => a.cle - b.cle || a.elements[0]!.y - b.elements[0]!.y)
    objets.forEach((ob, k) => ob.elements.forEach((e) => (objetDe[e.id] = k)))
    const haut = (ob: Objet) => Math.min(...ob.elements.map((e) => e.y - e.haut)) - (ob.cadre ? CADRE.padY + CADRE.titre : 0)
    const bas = (ob: Objet) => Math.max(...ob.elements.map((e) => e.y + e.bas)) + (ob.cadre ? CADRE.padY : 0)
    const ecartEntre = (a: Objet, b: Objet) => (a.elements[0]!.point < 0 || b.elements[0]!.point < 0 ? 8 : a.cadre || b.cadre ? CADRE.ecart : gap)
    const NB = 24
    // Passes alternées : descendante (chaque objet sous les précédents qui partagent ses colonnes), puis
    // montante (au-dessus des suivants), chacune tirant vers l'alignement avec les voisins ; la dernière
    // passe descendante, sans alignement, garantit l'absence de chevauchement.
    const cible = (ob: Objet) => {
      let somme = 0, n = 0
      for (const e of ob.elements) for (const x of [...pred[e.id]!, ...succ[e.id]!]) {
        if (objetDe[x] === objetDe[e.id]) continue
        somme += elements[x]!.y - e.y
        n++
      }
      return n ? (0.7 * somme) / n : 0
    }
    const croise = (a: Objet, b: Objet) => a.c0 <= b.c1 && b.c0 <= a.c1
    for (let it = 0; it < NB; it++) {
      const final = it === NB - 1
      const places: Objet[] = []
      if (it % 2 === 0 || final) {
        for (const ob of objets) {
          let d = final ? 0 : cible(ob)
          const h0 = haut(ob)
          for (const q of places) if (croise(q, ob)) d = Math.max(d, bas(q) + ecartEntre(q, ob) - h0)
          if (d !== 0) for (const e of ob.elements) e.y += d
          places.push(ob)
        }
      } else {
        for (let k = objets.length - 1; k >= 0; k--) {
          const ob = objets[k]!
          let d = cible(ob)
          const b0 = bas(ob)
          for (const q of places) if (croise(q, ob)) d = Math.min(d, haut(q) - ecartEntre(ob, q) - b0)
          if (d !== 0) for (const e of ob.elements) e.y += d
          places.push(ob)
        }
      }
    }
  }

  // 8. Abscisses des rangs et de la marge.
  const pas = W + o.ecartColonnes
  const xMarge = 0
  const aMarge = marge.some((v) => v === 1)
  const x0 = aMarge ? W + o.ecartColonnes * 1.25 + CADRE.padX * 2 : 0
  const xRang = (r: number) => x0 + r * pas
  const xs = new Float64Array(nP), ys = new Float64Array(nP)
  for (const e of elements) if (e.point >= 0) {
    xs[e.point] = xRang(rang[e.point]!)
    ys[e.point] = e.y
  }

  // Marge : spécifications empilées en haut (une décision juste au-dessus du choix qu'elle fixe), puis
  // les décisions sans prémisse au niveau de leurs enfants.
  let ymin = Infinity, ymax = -Infinity
  for (const e of elements) if (e.point >= 0) {
    ymin = Math.min(ymin, e.y - e.haut)
    ymax = Math.max(ymax, e.y + e.bas)
  }
  if (!Number.isFinite(ymin)) ymin = ymax = 0
  const itemsMarge: number[] = []
  const choix = [...Array(nU).keys()].filter((u) => noeudDe(u).type === 'choix_modelisation')
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
  const choixMarge = choix.filter((u) => marge[u]).sort((a, b) => portees.get(b)!.length - portees.get(a)!.length)
  const liensMarge: { source: number; cible: number }[] = []
  const decisionsMarge = [...Array(nU).keys()].filter((u) => marge[u] && noeudDe(u).type === 'decision')
  const placees = new Set<number>()
  for (const c of choixMarge) {
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
    const el: Element[] = itemsMarge.map((u) => ({ id: -1, point: u, arete: -1, rang: -1, h: boites[u]!.h, haut: boites[u]!.haut, bas: boites[u]!.bas, y: 0 }))
    const sep = (a: Element, b: Element) => a.bas + gap * 0.6 + b.haut
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

  // Repères de schéma, de gauche à droite puis de haut en bas : B (blocs), D (décisions), H (hypothèses de
  // modélisation). Blocs de raisonnement : É1, É2…, même ordre (marge d'abord).
  {
    const cpt = { B: 0, D: 0, H: 0 }
    const ordre = [...Array(nU).keys()].sort((a, b) => (marge[a] ? -1 : rang[a]!) - (marge[b] ? -1 : rang[b]!) || ys[a]! - ys[b]!)
    for (const p of ordre) {
      const b = boites[p]!
      const l = b.genre === 'drapeau' ? 'H' : b.genre === 'decision' ? 'D' : 'B'
      b.ref = `${l}${++cpt[l]}`
      b.numero = cpt[l]
    }
    const haut = (et: Etape) => Math.min(...et.membres.map((u) => ys[u]! - boites[u]!.haut))
    const tri = etapes.filter((et) => et.encadre).sort((a, b) => a.r0 - b.r0 || haut(a) - haut(b))
    tri.forEach((et, k) => (et.ref = `É${k + 1}`))
  }
  for (const b of boites) b.renvois.sort((a, c) => rang[a]! - rang[c]! || boites[a]!.numero - boites[c]!.numero)

  // 10. Routes orthogonales (stations : ports, nœuds fictifs, ports).
  const xDroite = (p: number) => xs[p]! + boites[p]!.w / 2
  const xGauche = (p: number) => xs[p]! - boites[p]!.w / 2
  interface Segment { route: Route; i: number; xa: number; ya: number; xb: number; yb: number; cle: string }
  const routes: Route[] = []
  const parCanal = new Map<number, Segment[]>()
  // Ports d'entrée : une liaison entrante par port, répartis sur le flanc gauche de la carte dans l'ordre des
  // ordonnées d'arrivée (pas de croisement à l'entrée). Chaque port garde la famille de sa source (broche).
  const yPort = new Map<number, number>()
  {
    const entrees = new Map<number, { arete: number; y: number }[]>()
    for (const a of g.aretes) {
      if (marge[a.cible] || renvoi[a.index]) continue
      const chaine = chaines.get(a.index)
      const avant = chaine && chaine.length > 2 ? elements[chaine[chaine.length - 2]!]!.y : ys[a.source]! + boites[a.source]!.ySortie
      let l = entrees.get(a.cible)
      if (!l) entrees.set(a.cible, (l = []))
      l.push({ arete: a.index, y: avant })
    }
    for (const [c, l] of entrees) {
      const b = boites[c]!
      l.sort((u, v) => u.y - v.y || u.arete - v.arete)
      b.portsFamille = l.map((e) => familleDe(noeudDe(g.aretes[e.arete]!.source).type))
      if (l.length === 1) {
        const y1 = b.ySortie !== 0 ? -b.h / 2 + EN_TETE + 9 : 0
        yPort.set(l[0]!.arete, ys[c]! + y1)
        b.ports = [y1]
        continue
      }
      // Sous l'en-tête, au-dessus du pied ; pas maximal de 14 px.
      const y0 = -b.h / 2 + EN_TETE + 5, y1 = b.h / 2 - 7
      const pasPort = Math.min(14, (y1 - y0) / Math.max(1, l.length - 1))
      const milieu = (y0 + y1) / 2
      b.ports = l.map((_, k) => milieu + (k - (l.length - 1) / 2) * pasPort)
      l.forEach((e, k) => yPort.set(e.arete, ys[c]! + b.ports[k]!))
    }
  }
  for (const a of g.aretes) {
    if (marge[a.cible] || renvoi[a.index]) continue
    const abandon = noeudDe(a.source).piste === 'abandonnee' || noeudDe(a.cible).piste === 'abandonnee'
    let role: RolePremisse = 'contexte'
    for (const e of a.resume.length ? a.resume : a.transitives) {
      const r = j.aretes[e]!.role
      if (FORCE_ROLE[r] > FORCE_ROLE[role]) role = r
    }
    const route: Route = { arete: a.index, source: a.source, cible: a.cible, points: [], abandon, role }
    const stations: [number, number][] = [[xDroite(a.source), ys[a.source]! + boites[a.source]!.ySortie]]
    const chaine = chaines.get(a.index)
    if (chaine) for (const id of chaine.slice(1, -1)) {
      const e = elements[id]!
      stations.push([xRang(e.rang) - W / 2, e.y], [xRang(e.rang) + W / 2, e.y])
    }
    stations.push([xGauche(a.cible), yPort.get(a.index) ?? ys[a.cible]!])
    routes.push(route)
    // Segments entre stations successives (paires : départ → arrivée à travers un canal).
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
  const segmentDe = new Map<Route, Map<number, Segment>>()
  for (const segs of parCanal.values()) {
    for (const s of segs) {
      let m = segmentDe.get(s.route)
      if (!m) segmentDe.set(s.route, (m = new Map()))
      m.set(s.i, s)
    }
    const dest = [...new Set(segs.map((s) => s.cle))]
    const yDest = new Map(dest.map((d) => [d, segs.find((s) => s.cle === d)!.yb]))
    const ySrc = new Map(dest.map((d) => {
      const l = segs.filter((s) => s.cle === d)
      return [d, l.reduce((t, s) => t + s.ya, 0) / l.length]
    }))
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
      const seg = segmentDe.get(r)!.get(k)!
      const xm = xPiste.get(seg) ?? (seg.xa + seg.xb) / 2
      const [, ya] = st[k]!, [xb, yb] = st[k + 1]!
      if (Math.abs(ya - yb) < 0.5) pts.push([xb, yb])
      else pts.push([xm, ya], [xm, yb], [xb, yb])
      if (k + 2 < st.length) pts.push(st[k + 2]!)
    }
    r.points = pts.filter((p, k) => !k || Math.abs(p[0] - pts[k - 1]![0]) + Math.abs(p[1] - pts[k - 1]![1]) > 0.1)
  }

  // Jonctions : les liaisons d'une même sortie partagent le tronçon horizontal issu du port, puis bifurquent.
  // Chaque bifurcation qui n'est pas la dernière est un « T » : point plein.
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

  // 11. Monde (bornes : cartes et cadres des blocs).
  let bx0 = Infinity, bx1 = -Infinity
  for (let p = 0; p < nU; p++) {
    bx0 = Math.min(bx0, xs[p]! - boites[p]!.w / 2)
    bx1 = Math.max(bx1, xs[p]! + boites[p]!.w / 2)
  }
  for (const et of etapes) if (et.encadre) {
    for (const u of et.membres) {
      bx0 = Math.min(bx0, xs[u]! - boites[u]!.w / 2 - CADRE.padX)
      bx1 = Math.max(bx1, xs[u]! + boites[u]!.w / 2 + CADRE.padX)
      ymin = Math.min(ymin, ys[u]! - boites[u]!.haut - CADRE.padY - CADRE.titre)
      ymax = Math.max(ymax, ys[u]! + boites[u]!.bas + CADRE.padY)
    }
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
    boites, routes, etapes, liensMarge, portees, usagesPastille, usagesRenvoi, echelle: ECHELLE, cx, cy,
    jonctions, xRangs: Array.from({ length: nbRangs }, (_, r) => xRang(r)), xMarge, aMarge, largeurCarte: W,
    bornes: { x0: bx0, y0: ymin, x1: bx1, y1: ymax },
  }
  return { disposition, page }
}

/** Petite étiquette en capitales dans l'en-tête. */
function etiquetteDe(n: NoeudR, membres: number, genre: GenreBoite): string {
  if (n.piste === 'abandonnee' && genre !== 'decision') return membres > 1 ? `ABANDONNÉE · ${membres}` : 'ABANDONNÉE'
  if (genre === 'drapeau') return 'MODÉLISATION'
  const t = LIBELLES_TYPE[n.type].toUpperCase()
  if (genre === 'etape') return `SOUS-SYST. × ${membres}`
  if (membres > 1) return `${t} · +${membres - 1}`
  return t
}
