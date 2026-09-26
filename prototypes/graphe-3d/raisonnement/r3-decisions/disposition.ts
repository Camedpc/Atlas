// R3 · Disposition en deux bandes, gauche → droite.
//
//  1. dagre (network-simplex) donne le rang logique de chaque unité et un ordre qui limite les
//     croisements ;
//  2. les colonnes sont espacées pour occuper la largeur de l'écran (les libellés sont mesurés :
//     la place réservée est celle du texte dessiné) ;
//  3. bande haute = colonne vertébrale : les décisions et choix de modélisation, dans l'ordre des
//     rangs ; bande basse = ce qu'ils ont permis (blocs, résultats, nœuds clés), chaque unité au
//     barycentre de ses prédécesseurs ; les boîtes (libellé + glyphe + embranchements, ou titre +
//     carte) ne se chevauchent jamais : une unité gênée descend.
//
// Coordonnées : celles de `src/raisonnement/disposition.ts` (X = rang, Z = vertical, Y = couche de
// type, profondeur en 3D). La géométrie des boîtes est exposée pour le dessin (`geometrie`).

import dagre from '@dagrejs/dagre'
import { COUCHES, coucheDe, LIBELLES_TYPE, type Disposition, type GrapheLecture, type NoeudR } from '../../src/raisonnement'
import { blocReplie, etatStrategie, type AnalyseR3 } from './modele'
import { contexteMesure, couperTexte, interligne, largeurMax, lignesTexte, police, type Polices } from './textes'

export interface ParametresDispositionR3 extends Polices {
  /** Écart minimal entre deux colonnes (px). */
  ecartRangs: number
  /** Marge verticale entre deux boîtes (px). */
  ecartNoeuds: number
  ecartCouches: number
  largeurBloc: number
  /** Hauteur de carte par résultat (px) : l'esprit Sankey. */
  hauteurParResultat: number
  hauteurMinBloc: number
  /** Largeur des libellés des décisions et nœuds clés (px). */
  largeurTexte: number
  /** Zone d'écran disponible (px) : l'écart des colonnes est choisi pour l'occuper au mieux. */
  largeurDispo: number
  hauteurDispo: number
  alternatives: boolean
  raisons: boolean
}

export interface Alternative {
  texte: string
  raison: string | null
}

/** Boîte d'une unité (px de mise en page ; origine = centre du glyphe ou de la carte). */
export interface Boite {
  genre: 'carte' | 'glyphe'
  /** Carte : largeur, hauteur, titre (coupé). */
  w: number
  h: number
  titre: string
  /** Glyphe : rayon estimé, étiquette de genre, lignes du libellé, embranchements. */
  rayon: number
  etiquette: string | null
  lignes: string[]
  alternatives: Alternative[]
  /** Encombrement autour de l'origine. */
  gauche: number
  droite: number
  haut: number
  bas: number
}

export interface GeometrieR3 {
  lecture: GrapheLecture | null
  /** Unités monde par px de mise en page. */
  echelle: number
  boites: Boite[]
}

export const geometrie: GeometrieR3 = { lecture: null, echelle: 0.01, boites: [] }

export function hauteurBloc(nb: number, o: Pick<ParametresDispositionR3, 'hauteurParResultat' | 'hauteurMinBloc'>): number {
  return Math.max(o.hauteurMinBloc, 20 + nb * o.hauteurParResultat)
}

/** Alternatives rejetées (décision, avec raison) ou envisagées (choix de modélisation). */
export function alternativesRejetees(n: NoeudR): { libelle: string; raison?: string }[] {
  if (n.decision) return n.decision.alternatives.filter((a) => !a.retenue).map((a) => ({ libelle: a.libelle, raison: a.raison }))
  if (n.choix?.alternatives) return n.choix.alternatives.map((l) => ({ libelle: l }))
  return []
}

/** Étiquette de genre affichée au-dessus d'un glyphe. */
export function etiquetteDe(an: AnalyseR3, i: number): string | null {
  const n = an.j.noeuds[i]!
  const g = an.genre[i]
  if (g === 'pivot') return n.type === 'decision' ? 'Décision' : 'Choix de modélisation'
  if (g === 'impasse') return 'Impasse'
  if (g === 'cle') return n.statut === 'refute' ? `${LIBELLES_TYPE[n.type]} réfutée` : LIBELLES_TYPE[n.type]
  return null
}

function mesurerBoite(g: GrapheLecture, an: AnalyseR3, u: number, o: ParametresDispositionR3): Boite {
  const ctx = contexteMesure()
  const un = g.unites[u]!
  const i = un.conclusion
  const n = an.j.noeuds[i]!
  const b = blocReplie(an, i, un.membres.length)
  if (b) {
    const w = o.largeurBloc, h = hauteurBloc(un.membres.length, o)
    ctx.font = police.titreCarte(o, b.abandonne)
    const titre = couperTexte(ctx, b.titre, Math.max(w, o.largeurTexte))
    const lt = ctx.measureText(titre).width
    return { genre: 'carte', w, h, titre, rayon: 0, etiquette: null, lignes: [], alternatives: [], gauche: w / 2, droite: Math.max(w / 2, lt - w / 2), haut: h / 2 + o.taille + 8, bas: h / 2 + 16 }
  }
  const genre = an.genre[i]
  const important = genre === 'pivot' || genre === 'cle' || genre === 'impasse'
  const rayon = genre === 'pivot' ? 10 : genre === 'cle' ? 9 : 6
  const etiquette = etiquetteDe(an, i)
  ctx.font = police.nom(o, important)
  const W = important ? o.largeurTexte : Math.min(o.largeurTexte, 118)
  const lignes = lignesTexte(ctx, n.nom, W, important ? 3 : 2)
  let larg = largeurMax(ctx, lignes)
  if (etiquette) {
    ctx.font = police.etiquette(o)
    larg = Math.max(larg, ctx.measureText(etiquette.toUpperCase()).width * 1.08)
  }
  const hLib = lignes.length * interligne.nom(o) + (etiquette ? interligne.etiquette(o) : 0)
  const alternatives: Alternative[] = []
  let hAlt = 0
  if (genre === 'pivot' && o.alternatives) {
    const alts = alternativesRejetees(n)
    if (n.decision) {
      // Décision : une ligne par alternative rejetée, puis sa raison en une ligne.
      for (const a of alts) {
        ctx.font = police.alternative(o)
        const texte = couperTexte(ctx, `✗ ${a.libelle}`, o.largeurTexte)
        let wa = ctx.measureText(texte).width
        let raison: string | null = null
        if (a.raison && o.raisons) {
          ctx.font = police.raison(o)
          raison = couperTexte(ctx, a.raison, o.largeurTexte)
          wa = Math.max(wa, ctx.measureText(raison).width)
        }
        larg = Math.max(larg, wa)
        hAlt += interligne.alternative(o) + (raison ? interligne.raison(o) : 0) + 1
        alternatives.push({ texte, raison })
      }
    } else if (alts.length) {
      // Choix de modélisation : les autres modélisations envisagées, sur une ligne.
      ctx.font = police.alternative(o)
      const texte = couperTexte(ctx, `✗ ${alts.map((a) => a.libelle).join(' · ')}`, o.largeurTexte)
      larg = Math.max(larg, ctx.measureText(texte).width)
      hAlt += interligne.alternative(o) + 1
      alternatives.push({ texte, raison: null })
    }
  }
  return {
    genre: 'glyphe', w: 0, h: 0, titre: '', rayon, etiquette, lignes, alternatives,
    gauche: Math.max(rayon + 12, larg / 2 + 6), droite: Math.max(rayon + 12, larg / 2 + 6),
    haut: rayon + 6 + hLib, bas: rayon + (hAlt ? 8 + hAlt : 12),
  }
}

interface Place {
  x: number
  y: number
  b: Boite
}

/** Élément de mise en page : une unité, ou un bloc déplié (ses membres, disposés à part). */
interface Element {
  unites: number[]
  b: Boite
  pivot: boolean
  /** Bloc déplié : positions relatives des membres (px, origine au centre du groupe). */
  relatives: Map<number, { x: number; y: number }> | null
  titre: string
  id: string
}

export interface GroupeDeplie {
  id: string
  titre: string
  n: number
  /** Centre (monde) et dimensions (px de mise en page) du cadre. */
  x: number
  z: number
  w: number
  h: number
}

export const groupes: GroupeDeplie[] = []

/** Disposition locale des membres d'un bloc déplié (dagre compact, libellés au-dessus). */
function sousDisposition(g: GrapheLecture, unites: number[], boites: Boite[]): { rel: Map<number, { x: number; y: number }>; w: number; h: number } {
  const dans = new Set(unites)
  const gr = new dagre.graphlib.Graph()
  gr.setGraph({ rankdir: 'LR', nodesep: 6, ranksep: 22, ranker: 'network-simplex', marginx: 0, marginy: 0 })
  gr.setDefaultEdgeLabel(() => ({}))
  for (const u of unites) {
    const b = boites[u]!
    gr.setNode(String(u), { width: Math.max(26, b.gauche + b.droite), height: b.haut + b.bas })
  }
  for (const a of g.aretes) if (dans.has(a.source) && dans.has(a.cible)) gr.setEdge(String(a.source), String(a.cible))
  dagre.layout(gr)
  const rel = new Map<number, { x: number; y: number }>()
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const u of unites) {
    const nd = gr.node(String(u))
    const b = boites[u]!
    const x = nd.x ?? 0
    const y = (nd.y ?? 0) - (b.haut + b.bas) / 2 + b.haut
    rel.set(u, { x, y })
    x0 = Math.min(x0, x - b.gauche); x1 = Math.max(x1, x + b.droite)
    y0 = Math.min(y0, y - b.haut); y1 = Math.max(y1, y + b.bas)
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  for (const p of rel.values()) { p.x -= cx; p.y -= cy }
  return { rel, w: x1 - x0 + 24, h: y1 - y0 + 16 }
}

export function disposerR3(g: GrapheLecture, an: AnalyseR3, o: ParametresDispositionR3): Disposition {
  const N = g.justification.noeuds
  const nU = g.unites.length
  const e = 0.01
  const boites = Array.from({ length: nU }, (_, u) => mesurerBoite(g, an, u, o))

  // 0. Éléments : unités seules, et un élément par bloc déplié.
  const elements: Element[] = []
  const elementDe = new Int32Array(nU).fill(-1)
  for (const bl of an.blocs) {
    if (!etatStrategie.deplies.has(bl.id)) continue
    const us = [...new Set(bl.membres.map((m) => g.uniteDe[m]!).filter((u) => u >= 0))]
    if (!us.length) continue
    const sd = sousDisposition(g, us, boites)
    const b: Boite = { genre: 'carte', w: sd.w, h: sd.h, titre: bl.titre, rayon: 0, etiquette: null, lignes: [], alternatives: [], gauche: sd.w / 2, droite: sd.w / 2, haut: sd.h / 2 + 30, bas: sd.h / 2 + 6 }
    for (const u of us) elementDe[u] = elements.length
    elements.push({ unites: us, b, pivot: false, relatives: sd.rel, titre: bl.titre, id: bl.id })
  }
  for (let u = 0; u < nU; u++) {
    if (elementDe[u]! >= 0) continue
    elementDe[u] = elements.length
    const pivot = an.genre[g.unites[u]!.conclusion] === 'pivot' && boites[u]!.genre === 'glyphe'
    elements.push({ unites: [u], b: boites[u]!, pivot, relatives: null, titre: '', id: String(u) })
  }
  const nE = elements.length
  const entrantes: number[][] = elements.map(() => [])
  const vus = new Set<number>()
  const gr = new dagre.graphlib.Graph()
  gr.setGraph({ rankdir: 'LR', nodesep: 20, ranksep: 40, ranker: 'network-simplex', marginx: 0, marginy: 0 })
  gr.setDefaultEdgeLabel(() => ({}))
  elements.forEach((el, k) => gr.setNode(String(k), { width: el.b.genre === 'carte' ? el.b.w : 26, height: el.b.haut + el.b.bas }))
  for (const a of g.aretes) {
    const s = elementDe[a.source]!, c = elementDe[a.cible]!
    if (s === c || vus.has(s * nE + c)) continue
    vus.add(s * nE + c)
    entrantes[c]!.push(s)
    gr.setEdge(String(s), String(c), { weight: a.resume.length ? 2 : 3, minlen: 1 })
  }
  // 1. Rangs et ordre (dagre) ; les hypothèses et les résultats sans choix restent au premier rang.
  gr.setNode('racine', { width: 1, height: 1 })
  for (let k = 0; k < nE; k++) if (entrantes[k]!.length === 0 && !elements[k]!.pivot) gr.setEdge('racine', String(k), { weight: 4, minlen: 1 })
  dagre.layout(gr)
  const dx = new Float32Array(nE), dy = new Float32Array(nE)
  for (let k = 0; k < nE; k++) {
    const nd = gr.node(String(k))
    dx[k] = nd.x ?? 0
    dy[k] = nd.y ?? 0
  }
  const cles = [...new Set([...dx].map((v) => Math.round(v)))].sort((a, b) => a - b)
  const rangDe = new Map(cles.map((c, k) => [c, k]))
  const R = cles.length
  const rangs: number[][] = Array.from({ length: R }, () => [])
  const rang = new Int32Array(nE)
  for (let k = 0; k < nE; k++) {
    rang[k] = rangDe.get(Math.round(dx[k]!)) ?? 0
    rangs[rang[k]!]!.push(k)
  }
  for (const l of rangs) l.sort((a, b) => dy[a]! - dy[b]!)

  // 2. Colonnes : largeur propre + écart ; 3. placement sans chevauchement. L'écart est choisi pour
  //    remplir au mieux la zone d'écran : plus d'écart = moins de libellés voisins qui se gênent.
  const coeur = rangs.map((l) => Math.max(26, ...l.map((k) => (elements[k]!.b.genre === 'carte' ? elements[k]!.b.w : 26))))
  const somme = coeur.reduce((s, v) => s + v, 0)
  const m = o.ecartNoeuds

  const placer = (ecart: number) => {
    const xCol: number[] = []
    let xc = 0
    for (let r = 0; r < R; r++) {
      if (r > 0) xc += coeur[r - 1]! / 2 + ecart + coeur[r]! / 2
      xCol.push(xc)
    }
    const places: Place[] = []
    const pos = new Map<number, { x: number; y: number }>()
    const gene = (x: number, y: number, b: Boite, p: Place) =>
      x - b.gauche < p.x + p.b.droite && x + b.droite > p.x - p.b.gauche && y - b.haut < p.y + p.b.bas + m && y + b.bas + m > p.y - p.b.haut
    const touche = (x: number, y: number, b: Boite) => places.some((p) => gene(x, y, b, p))
    /** Ordonnée libre la plus proche de `ideal`, jamais au-dessus de `min`. */
    const libre = (x: number, ideal: number, min: number, b: Boite): number => {
      const y0 = Math.max(ideal, min)
      if (!touche(x, y0, b)) return y0
      const cand: number[] = []
      for (const p of places) {
        if (x - b.gauche >= p.x + p.b.droite || x + b.droite <= p.x - p.b.gauche) continue
        cand.push(p.y + p.b.bas + m + b.haut + 0.5, p.y - p.b.haut - m - b.bas - 0.5)
      }
      cand.sort((a, c) => Math.abs(a - y0) - Math.abs(c - y0))
      for (const y of cand) if (y >= min && !touche(x, y, b)) return y
      let y = y0
      for (let garde = 0; garde < 200 && touche(x, y, b); garde++) for (const p of places) if (gene(x, y, b, p)) y = p.y + p.b.bas + m + b.haut + 0.5
      return y
    }
    // Bande haute : la colonne vertébrale des décisions et choix.
    for (let r = 0; r < R; r++) {
      let dernier = -Infinity
      for (const k of rangs[r]!) {
        const el = elements[k]!
        if (!el.pivot) continue
        const y = libre(xCol[r]!, el.b.haut, dernier + el.b.haut, el.b)
        places.push({ x: xCol[r]!, y, b: el.b })
        pos.set(k, { x: xCol[r]!, y })
        dernier = y + el.b.bas + m
      }
    }
    // Bande basse : ce qu'ils ont permis, sous les décisions de sa colonne, au barycentre des
    // prédécesseurs déjà placés.
    const pivotsPlaces = [...places]
    for (let r = 0; r < R; r++) {
      let dernier = -Infinity
      for (const k of rangs[r]!) {
        const el = elements[k]!
        if (el.pivot) continue
        const b = el.b
        const x = xCol[r]!
        let haut = 0
        for (const p of pivotsPlaces) if (x - b.gauche < p.x + p.b.droite && x + b.droite > p.x - p.b.gauche) haut = Math.max(haut, p.y + p.b.bas + 26)
        let s = 0, n = 0
        for (const src of entrantes[k]!) {
          const p = pos.get(src)
          if (p && !elements[src]!.pivot) { s += p.y; n++ }
        }
        const min = Math.max(haut + b.haut, dernier + b.haut)
        const y = libre(x, n ? s / n : min, min, b)
        places.push({ x, y, b })
        pos.set(k, { x, y })
        dernier = y + b.bas + m
      }
    }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const p of places) {
      x0 = Math.min(x0, p.x - p.b.gauche); x1 = Math.max(x1, p.x + p.b.droite)
      y0 = Math.min(y0, p.y - p.b.haut); y1 = Math.max(y1, p.y + p.b.bas)
    }
    if (!places.length) x0 = x1 = y0 = y1 = 0
    const echelle = Math.min(o.largeurDispo / Math.max(1, x1 - x0), o.hauteurDispo / Math.max(1, y1 - y0))
    return { xCol, pos, x0, x1, y0, y1, echelle }
  }
  let meilleur = placer(o.ecartRangs)
  if (o.largeurDispo > 0 && o.hauteurDispo > 0 && R > 1) {
    const max = Math.max(o.ecartRangs, (o.largeurDispo - somme) / (R - 1))
    for (let k = 1; k <= 8; k++) {
      const essai = placer(o.ecartRangs + ((max - o.ecartRangs) * k) / 8)
      if (essai.echelle > meilleur.echelle + 0.005) meilleur = essai
    }
  }
  const { xCol, pos, x0, x1, y0, y1 } = meilleur

  // 4. Monde.
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  const masques = g.masques
  const n = nU + masques.length
  const x = new Float32Array(n), z = new Float32Array(n), yCouche = new Float32Array(n)
  const couche = new Int8Array(n), rangP = new Int32Array(n).fill(-1)
  groupes.length = 0
  elements.forEach((el, k) => {
    const p = pos.get(k)!
    for (const u of el.unites) {
      const rel = el.relatives?.get(u) ?? { x: 0, y: 0 }
      x[u] = (p.x + rel.x - cx) * e
      z[u] = -(p.y + rel.y - cy) * e
      rangP[u] = rang[k]!
    }
    if (el.relatives) groupes.push({ id: el.id, titre: el.titre, n: el.unites.length, x: (p.x - cx) * e, z: -(p.y - cy) * e, w: el.b.w, h: el.b.h })
  })
  const xRangs = xCol.map((v) => (v - cx) * e)
  // Contexte pur : colonne à gauche (visible avec les liens complets).
  const gauche = (x0 - cx) * e - 0.6
  const pas = 0.18
  const hauteur = (y1 - y0) * e
  const parCol = Math.max(1, Math.floor(hauteur / pas))
  const ordre = masques.map((mq, k) => ({ mq, k })).sort((a, b) => coucheDe(N[a.mq]!.type) - coucheDe(N[b.mq]!.type) || a.mq - b.mq)
  const nbCol = Math.ceil(ordre.length / parCol)
  ordre.forEach(({ k }, r) => {
    const col = Math.floor(r / parCol), ligne = r % parCol
    const dans = Math.min(parCol, ordre.length - col * parCol)
    x[nU + k] = gauche - (nbCol - 1 - col) * 0.7
    z[nU + k] = ((dans - 1) / 2 - ligne) * pas
  })
  const milieu = (COUCHES.length - 1) / 2
  for (let p = 0; p < n; p++) {
    const i = p < nU ? g.unites[p]!.conclusion : masques[p - nU]!
    couche[p] = coucheDe(N[i]!.type)
    yCouche[p] = (couche[p]! - milieu) * o.ecartCouches
  }
  let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity
  for (let p = 0; p < n; p++) {
    bx0 = Math.min(bx0, x[p]!); bx1 = Math.max(bx1, x[p]!)
    bz0 = Math.min(bz0, z[p]!); bz1 = Math.max(bz1, z[p]!)
  }
  geometrie.echelle = e
  geometrie.boites = boites
  geometrie.lecture = g
  return {
    moteur: 'dagre', nU, masques, x, z, yCouche, couche, rang: rangP, xRangs, xContexte: masques.length ? gauche : NaN,
    bornes: { xmin: bx0, xmax: bx1, zmin: bz0, zmax: bz1 },
  }
}
