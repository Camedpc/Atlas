// R41 · Mise en page : placement par boîtes de R18 (sous-problèmes et boîtes imbriquées posés comme des
// pièces rigides, sans chevauchement), blocs de R36 (hauteur donnée par la composition, numérotation
// continue façon LaTeX), nœuds-fonctions de R19 (broches d'entrée et de sortie), figures de R35 accrochées
// sous le bloc qui énonce la loi (la hauteur leur est réservée).
//
// Coordonnées de mise en page en px (y vers le bas), converties en monde (× 0,01) pour la vue :
//   X monde = x, Z monde = −y, Y monde = couche de type (3D).
//
// Étapes (reprises de R18 sauf mention) :
//   1. marge : choix de modélisation (et décisions qui ne mènent qu'à eux) ;
//   2. ordre topologique ; 3. zones (déduction, résultats ; en onglet, entrées et sorties) ;
//   4. rangs = plus long chemin, puis « au plus tard » (une racine se place juste avant son premier usage) ;
//   5. boîtes (dimensions ; R41 : hauteurs mesurées / estimées, figures, broches des fonctions) ;
//   6. placement boîte par boîte : chaque sous-problème est mis en page seul (barycentres, régression
//      isotone sur ses liaisons internes), puis posé au plus près de ses voisins déjà posés sans chevaucher ;
//   7. liaisons longues : un point de passage libre par colonne traversée ;
//   8. marge ; 9. masqués ; numérotation ; 10. routes orthogonales, jonctions ; 11. zones ; 12. boîtes ; 13. monde.

import {
  coucheDe, dependantsDe, LIBELLES_TYPE, type Disposition, type GrapheLecture, type NoeudR, type SousProbleme,
} from '../../src/raisonnement'
import { parentDe, racineDe } from './groupes'
import { natureDe } from './squelette'

export type GenreBoite = 'drapeau' | 'decision' | 'carte' | 'etape' | 'majeur' | 'masque' | 'fonction'

export interface Pastille {
  /** Nœud de justification rattaché. */
  noeud: number
  lettre: string
  couche: number
}

/** Broche d'entrée d'un nœud-fonction : une liaison de lecture entrante. */
export interface BrocheEntree {
  arete: number
  source: number
  /** Ordonnée relative au point d'ancrage. */
  y: number
}

/** Broche de sortie d'un nœud-fonction : un énoncé du groupe utilisé à l'extérieur. */
export interface BrocheSortie {
  /** Nœud de justification. */
  noeud: number
  aretes: number[]
  y: number
}

export interface Boite {
  genre: GenreBoite
  /** Largeur et hauteur du cadre. */
  w: number
  h: number
  /** Distance du point d'ancrage au haut et au bas de la boîte complète (bornes et figures comprises). */
  haut: number
  bas: number
  pastilles: Pastille[]
  plus: number
  /** Renvois : prémisses lointaines citées par leur numéro (« cf. 7 ») au lieu d'une longue flèche. */
  renvois: number[]
  numero: number
  impasse: { texte: string; autres: number } | null
  /** Zone : 0 marge, 1 entrées (onglet), 2 déduction, 3 résultats, −1 masqué. */
  zone: number
  rang: number
  abandon: boolean
  /** « 7 » (énoncé), « D2 » (décision), « (ii) » (hypothèse), « §1 » (sous-problème réduit). */
  ref: string
  ports: number[]
  /** Sous-problème (identifiant complet) et boîte de premier niveau ('' : hors boîte). */
  sousProbleme: string
  groupe: string
  /** Nœud-fonction : broches et hauteur de l'en-tête (haut des rangées, relatif à l'ancrage). */
  broches: { entrees: BrocheEntree[]; sorties: BrocheSortie[]; y0: number; pas: number } | null
  /** Figures affichées sous le bloc (clés) et ordonnée relative du haut de la première. */
  figures: string[]
  yFigures: number
  /** Figures disponibles à la demande (renvois « fig. n » sous le bloc) et ordonnée de leur ligne. */
  appels: string[]
  yAppels: number
  /** Onglet : unité extérieure au sous-graphe (source directe ou utilisateur direct). */
  externe: '' | 'entree' | 'sortie'
}

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

/** Boîte englobante (sous-problème), comme les boîtes « Comment » de R18. */
export interface Commentaire {
  id: string
  nom: string
  resume: string
  couleur: string
  /** 0 : sous-problème ; 1 : sous-problème imbriqué. */
  niveau: 0 | 1
  abandon: boolean
  /** Réductible en nœud-fonction (faux pour la boîte des hypothèses de modélisation). */
  reductible: boolean
  /** Réduite : ne contient que son nœud-fonction. */
  reduit: boolean
  x0: number
  y0: number
  x1: number
  y1: number
  /** Points membres (unités). */
  membres: number[]
  /** Énoncés représentés (membres des unités). */
  enonces: number
}

/** Marges des boîtes (px de mise en page), celles de R18. */
export const BOITE = { pad: 10, titre: 20, padS: 7, titreS: 16, ecart: 12 }
/** Écart entre un bloc et sa figure, et entre deux figures. */
export const ECART_FIGURE = 8

export interface MiseEnPage {
  boites: Boite[]
  routes: Route[]
  zones: Zone[]
  commentaires: Commentaire[]
  liensMarge: { source: number; cible: number }[]
  portees: Map<number, number[]>
  usagesPastille: Map<number, number[]>
  usagesRenvoi: Map<number, number[]>
  jonctions: [number, number][]
  xRangs: number[]
  largeurCarte: number
  echelle: number
  cx: number
  cy: number
  /** Contenu (blocs + boîtes). */
  bornes: { x0: number; y0: number; x1: number; y1: number }
  hauteurFigure: number
}

/** Groupes par unité (étape « groupes » de la dérivation) : sous-problème, nœud-fonction, onglet. */
export interface OptionsGroupes {
  /** Sous-problème d'affichage de chaque unité (null : hors boîte, ex. choix de modélisation). */
  sp: (string | null)[]
  fonction: boolean[]
  externe: ('' | 'entree' | 'sortie')[]
  onglet: string | null
  reduits: Set<string>
  refus: Set<string>
}

export interface OptionsMiseEnPage {
  largeurCarte: number
  ecartColonnes: number
  ecartLignes: number
  taillePolice: number
  maxPastilles: number
  ecartCouches: number
  sousProblemes: SousProbleme[]
  teinte: (id: string) => string
  teinteSpec: string
  groupes: OptionsGroupes
  /** Hauteurs (point → px) : bloc entier ; libellé d'une décision ; en-tête d'un nœud-fonction. */
  hauteurs: Map<number, number>
  /** Hauteur d'une rangée de broche (nœud-fonction) et du pied d'un nœud-fonction. */
  rangee: number
  piedFonction: number
  /** Figures par point : affichées et à la demande (clés). */
  figuresDe: (p: number) => { affichees: string[]; appels: string[] }
  hauteurFigure: number
  precedent?: Map<string, number>
}

const ECHELLE = 0.01

/** Chiffres romains minuscules (hypothèses (i), (ii)…, comme R37). */
export function romain(n: number): string {
  const t: [number, string][] = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]
  let r = ''
  for (const [v, s] of t) while (n >= v) {
    r += s
    n -= v
  }
  return r
}

export function lettrePastille(n: NoeudR): { lettre: string; ordre: number } {
  if (n.type === 'hypothese') return { lettre: 'H', ordre: 0 }
  if (n.type === 'axiome') return { lettre: 'A', ordre: 3 }
  if (n.type === 'definition') return { lettre: 'D', ordre: 2 }
  if (n.admis && n.type === 'lemme') return { lettre: 'O', ordre: 1 }
  if (n.admis) return { lettre: 'L', ordre: 4 }
  return { lettre: '+', ordre: 5 }
}

/** Genre d'une unité (connu avant la mise en page : la composition en a besoin pour mesurer). */
export function genreUnite(g: GrapheLecture, G: OptionsGroupes, p: number): GenreBoite {
  const u = g.unites[p]!
  const n = g.justification.noeuds[u.conclusion]!
  if (G.fonction[p]) return 'fonction'
  if (n.type === 'choix_modelisation') return 'drapeau'
  if (n.type === 'decision') return 'decision'
  if ((n.type === 'theoreme' || n.type === 'resultat') && !n.admis) return 'majeur'
  return u.genre === 'etape' ? 'etape' : 'carte'
}

// ─── Calcul ──────────────────────────────────────────────────────────────────

export function mettreEnPage(g: GrapheLecture, o: OptionsMiseEnPage): { disposition: Disposition; page: MiseEnPage } {
  const j = g.justification
  const nU = g.unites.length
  const masques = g.masques
  const nP = nU + masques.length
  const G = o.groupes
  const noeudDe = (p: number): NoeudR => j.noeuds[p < nU ? g.unites[p]!.conclusion : masques[p - nU]!]!
  const parents: number[][] = g.unites.map((_, u) => g.entrantes[u]!.map((e) => g.aretes[e]!.source))
  const enfants: number[][] = g.unites.map((_, u) => g.sortantes[u]!.map((e) => g.aretes[e]!.cible))
  const onglet = G.onglet

  // 1. Marge : choix, décisions qui ne mènent qu'à des choix (une décision qui mène à des énoncés reste dans
  //    la boîte de son sous-problème, comme dans R18).
  const marge = new Uint8Array(nU)
  for (let u = 0; u < nU; u++) {
    const n = noeudDe(u)
    if (G.fonction[u] || G.externe[u]) continue
    if (n.type === 'choix_modelisation') marge[u] = 1
    else if (n.type === 'decision' && parents[u]!.length === 0 && enfants[u]!.length > 0 && enfants[u]!.every((v) => noeudDe(v).type === 'choix_modelisation')) marge[u] = 1
  }
  for (let u = 0; u < nU; u++) {
    const n = noeudDe(u)
    if (n.type === 'decision' && !G.fonction[u] && enfants[u]!.length && enfants[u]!.every((v) => marge[v]) && parents[u]!.every((s) => marge[s])) marge[u] = 1
  }

  // 2. Ordre topologique du reste.
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

  // 3. Zones : résultats (majeurs dont toute la descendance est majeure), déduction (le reste) ; en onglet,
  //    entrées à gauche et sorties à droite.
  const zone = new Int8Array(nP).fill(-1)
  const majeur = (u: number) => {
    const n = noeudDe(u)
    return !G.fonction[u] && (n.type === 'theoreme' || n.type === 'resultat') && !n.admis
  }
  const toutMajeur = new Uint8Array(nU)
  for (let k = topo.length - 1; k >= 0; k--) {
    const u = topo[k]!
    toutMajeur[u] = majeur(u) && enfants[u]!.every((v) => marge[v] || toutMajeur[v]) ? 1 : 0
  }
  for (let u = 0; u < nU; u++) if (marge[u]) zone[u] = 0
  for (const u of topo) {
    if (onglet) zone[u] = G.externe[u] === 'entree' ? 1 : G.externe[u] === 'sortie' ? 3 : 2
    else zone[u] = toutMajeur[u] ? 3 : 2
  }

  // 4. Rangs : plus long chemin, bornés par zone, puis au plus tard dans la zone de déduction.
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
  const finEntrees = calculerRangs(1, 0)
  const finEtapes = calculerRangs(2, finEntrees + 1)
  const finResultats = calculerRangs(3, finEtapes + 1)
  const nbRangs = Math.max(finResultats, finEtapes, finEntrees) + 1
  for (let k = topo.length - 1; k >= 0; k--) {
    const u = topo[k]!
    if (zone[u] !== 2) continue
    const cs = enfants[u]!.filter((v) => !marge[v])
    if (!cs.length) continue
    const r = Math.min(...cs.map((v) => rang[v]!)) - 1
    if (r > rang[u]!) rang[u] = r
  }

  // 4 bis. Renvois : prémisse très partagée citée loin en aval, par son numéro.
  const renvoi = new Uint8Array(g.aretes.length)
  const renvoisDe: number[][] = g.unites.map(() => [])
  const usagesRenvoi = new Map<number, number[]>()
  for (const a of g.aretes) {
    if (marge[a.source] || marge[a.cible] || G.fonction[a.source] || G.fonction[a.cible]) continue
    const ecart = rang[a.cible]! - rang[a.source]!
    const sortants = enfants[a.source]!.filter((v) => !marge[v]).length
    if (ecart >= 2 && sortants >= 3) {
      renvoi[a.index] = 1
      renvoisDe[a.cible]!.push(a.source)
      let us = usagesRenvoi.get(a.source)
      if (!us) usagesRenvoi.set(a.source, (us = []))
      us.push(a.cible)
    }
  }

  // Sous-problèmes : ordre du jeu, imbrication « parent.enfant ».
  const ordreSP = new Map<string, number>()
  o.sousProblemes.forEach((s, k) => ordreSP.set(s.id, k))
  const spDe = (p: number) => (p < nU ? G.sp[p] ?? '' : '')
  const groupeDe = (p: number) => (spDe(p) ? racineDe(spDe(p)) : '')
  const sousGroupeDe = (p: number) => (parentDe(spDe(p)) ? spDe(p) : '')

  // 5. Boîtes.
  const boites: Boite[] = []
  const usagesPastille = new Map<number, number[]>()
  const W = o.largeurCarte
  for (let p = 0; p < nP; p++) {
    const n = noeudDe(p)
    const unite = p < nU ? g.unites[p]! : undefined
    const abandon = n.piste === 'abandonnee'
    const genre: GenreBoite = !unite ? 'masque' : genreUnite(g, G, p)
    const pastilles: Pastille[] = []
    if (unite && genre !== 'fonction') {
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
    const place = Math.max(0, Math.floor((W - 16 - renvois.length * 32 - 18) / 15))
    const montrees = Math.min(pastilles.length, o.maxPastilles, place)
    const plus = pastilles.length - montrees
    const rangeePastilles = montrees || renvois.length ? 17 : 0
    let w = W, h: number, haut: number, bas: number, impasse: Boite['impasse'] = null
    let broches: Boite['broches'] = null
    const mesure = o.hauteurs.get(p)
    if (genre === 'drapeau') {
      h = mesure ?? 60
      haut = h / 2
      bas = h / 2
    } else if (genre === 'decision') {
      const alt = n.decision?.alternatives.filter((a) => !a.retenue) ?? []
      if (alt.length) impasse = { texte: alt[0]!.libelle, autres: alt.length - 1 }
      const L = mesure ?? 2 * (o.taillePolice + 3)
      h = L + 4 + 38
      haut = L + 4 + 19
      bas = 19 + (impasse ? 30 : 4) + rangeePastilles
    } else if (genre === 'fonction') {
      // Nœud-fonction (R19) : en-tête, rangées de broches (entrées puis sorties), pied.
      const nIn = g.entrantes[p]!.filter((e) => !marge[g.aretes[e]!.source]).length
      const sorties = new Map<number, number[]>()
      for (const e of g.sortantes[p]!) {
        const a = g.aretes[e]!
        if (marge[a.cible]) continue
        const src = j.aretes[a.resume[0] ?? a.transitives[0]!]!.source
        const l = sorties.get(src)
        if (l) l.push(e)
        else sorties.set(src, [e])
      }
      const nOut = sorties.size
      const tete = mesure ?? 2 * (o.taillePolice + 3)
      const R = o.rangee
      h = tete + (nIn + nOut) * R + (nIn && nOut ? 6 : 0) + o.piedFonction + 4
      haut = h / 2
      bas = h / 2
      broches = { entrees: [], sorties: [...sorties].map(([noeud, aretes]) => ({ noeud, aretes, y: 0 })), y0: tete - h / 2, pas: R }
    } else if (genre === 'masque') {
      w = 12
      h = 12
      haut = 6
      bas = 6
    } else {
      h = mesure ?? 70
      haut = h / 2
      bas = h / 2 + (rangeePastilles ? rangeePastilles + 3 : 0)
    }
    // Figures (R35) sous le bloc, puis la ligne des renvois « fig. n » (figures à la demande).
    const fig = unite && genre !== 'masque' ? o.figuresDe(p) : { affichees: [], appels: [] }
    let yFigures = 0, yAppels = 0
    if (fig.affichees.length) {
      yFigures = bas + ECART_FIGURE
      bas = yFigures + fig.affichees.length * (o.hauteurFigure + ECART_FIGURE)
    }
    if (fig.appels.length) {
      yAppels = bas + 7
      bas += 14
    }
    const sp = spDe(p)
    boites.push({
      genre, w, h, haut, bas, pastilles: pastilles.slice(0, montrees), plus, renvois, numero: 0, impasse, zone: zone[p]!,
      rang: rang[p]!, abandon, ref: '', ports: [], sousProbleme: sp, groupe: groupeDe(p), broches,
      figures: fig.affichees, yFigures, appels: fig.appels, yAppels, externe: p < nU ? G.externe[p] ?? '' : '',
    })
  }

  // Colonnes (largeur fixe : les formules trop larges sont réduites par la composition).
  const xMarge = 0
  const pas = W + o.ecartColonnes
  const x0 = xMarge + W / 2 + o.ecartColonnes * 1.25 + W / 2 + BOITE.pad
  const xRangs: number[] = []
  for (let r = 0; r < nbRangs; r++) xRangs.push(x0 + r * pas)
  const xRang = (r: number) => xRangs[r] ?? 0
  const colDroite = (p: number) => (marge[p] ? xMarge + W / 2 : xRang(rang[p]!) + W / 2)
  const colGauche = (p: number) => (marge[p] ? xMarge - W / 2 : xRang(rang[p]!) - W / 2)

  // 6. Placement par boîte (R18).
  const gap = o.ecartLignes
  const B = BOITE
  const groupeU = (u: number) => boites[u]!.groupe
  const sousU = (u: number) => sousGroupeDe(u)
  const ordreGroupe = (s: string) => (s ? ordreSP.get(s) ?? 999 : -1)
  const xs = new Float64Array(nP), ys = new Float64Array(nP)
  const rangTopo = new Int32Array(nU)
  topo.forEach((u, k) => (rangTopo[u] = k))
  const groupes = new Map<string, number[]>()
  for (const u of topo) {
    const k = groupeU(u)
    let l = groupes.get(k)
    if (!l) groupes.set(k, (l = []))
    l.push(u)
  }
  type Rect = { x0: number; y0: number; x1: number; y1: number }
  const union = (a: Rect | null, b: Rect): Rect => (a ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : { ...b })
  const croise = (a: Rect, b: Rect, m: number) => a.x0 < b.x1 + m && b.x0 < a.x1 + m && a.y0 < b.y1 + m && b.y0 < a.y1 + m
  const rectU = (u: number): Rect => {
    const b = boites[u]!
    const l = b.genre === 'decision' ? Math.max(24, b.w / 2) : b.w / 2
    return { x0: xRang(rang[u]!) - l, y0: ys[u]! - b.haut, x1: xRang(rang[u]!) + l, y1: ys[u]! + b.bas }
  }
  const rectSous = (us: number[], s: string): Rect | null => {
    let r: Rect | null = null
    for (const u of us) if (sousU(u) === s) r = union(r, rectU(u))
    return r ? { x0: r.x0 - B.padS, y0: r.y0 - B.padS - B.titreS, x1: r.x1 + B.padS, y1: r.y1 + B.padS } : null
  }
  const rectGroupe = (us: number[], gid: string): Rect => {
    let r: Rect | null = null
    const sous = new Set<string>()
    for (const u of us) {
      r = union(r, rectU(u))
      if (sousU(u)) sous.add(sousU(u))
    }
    for (const s of sous) r = union(r, rectSous(us, s)!)
    if (!gid) return r!
    return { x0: r!.x0 - B.pad, y0: r!.y0 - B.pad - B.titre, x1: r!.x1 + B.pad, y1: r!.y1 + B.pad }
  }
  const separation = (a: number, b: number) => {
    let s = boites[a]!.bas + gap + boites[b]!.haut
    const sa = sousU(a), sb = sousU(b)
    if (sa !== sb) {
      if (sa) s += B.padS
      if (sb) s += B.padS + B.titreS
      s += 4
    }
    return s
  }
  const placerColonne = (c: number[], voulu: number[]) => {
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
      for (let k = b.debut; k < fin; k++) ys[c[k]!] = b.somme / b.n + off[k]!
    }
  }
  for (const us of groupes.values()) {
    const dans = new Set(us)
    const voisins = (u: number) => [...parents[u]!, ...enfants[u]!].filter((v) => dans.has(v))
    const colonnes = new Map<number, number[]>()
    for (const u of us) {
      let c = colonnes.get(rang[u]!)
      if (!c) colonnes.set(rang[u]!, (c = []))
      c.push(u)
    }
    const rangs = [...colonnes.keys()].sort((a, b) => a - b)
    const prec = (u: number) => o.precedent?.get(noeudDe(u).id)
    const pos = new Map<number, number>()
    for (const c of colonnes.values()) {
      c.sort((a, b) => {
        const pa = prec(a), pb = prec(b)
        return ordreGroupe(sousU(a)) - ordreGroupe(sousU(b)) || (pa !== undefined && pb !== undefined ? pa - pb : rangTopo[a]! - rangTopo[b]!)
      })
      c.forEach((u, k) => pos.set(u, k))
    }
    for (let passe = 0; passe < 8; passe++) {
      const descente = passe % 2 === 0
      for (const r of descente ? rangs : [...rangs].reverse()) {
        const c = colonnes.get(r)!
        const cle = new Map<number, number>()
        for (const u of c) {
          const vs = (descente ? parents[u]! : enfants[u]!).filter((v) => dans.has(v))
          cle.set(u, vs.length ? vs.reduce((t, v) => t + pos.get(v)!, 0) / vs.length : pos.get(u)!)
        }
        c.sort((a, b) => ordreGroupe(sousU(a)) - ordreGroupe(sousU(b)) || cle.get(a)! - cle.get(b)! || pos.get(a)! - pos.get(b)!)
        c.forEach((u, k) => pos.set(u, k))
      }
    }
    for (const c of colonnes.values()) {
      let y = 0
      c.forEach((u, k) => {
        if (k) y += separation(c[k - 1]!, u)
        ys[u] = y
      })
    }
    for (let it = 0; it < 40; it++) {
      for (const r of it % 2 === 0 ? rangs : [...rangs].reverse()) {
        const c = colonnes.get(r)!
        placerColonne(c, c.map((u) => {
          const vs = voisins(u)
          return vs.length ? vs.reduce((t, v) => t + ys[v]!, 0) / vs.length : ys[u]!
        }))
      }
    }
    // Boîtes imbriquées (R18) : un bloc étranger qui déborde dans le rectangle par le haut fait descendre la
    // boîte imbriquée ; un bloc étranger situé sous son milieu est poussé sous elle.
    const decaler = (r: number, y0: number, d: number) => {
      for (const v of colonnes.get(r) ?? []) if (ys[v]! >= y0) ys[v] = ys[v]! + d
    }
    const sous = [...new Set(us.map(sousU).filter(Boolean))].sort((a, b) => ordreGroupe(a) - ordreGroupe(b))
    for (const s of sous) {
      const membres = us.filter((u) => sousU(u) === s)
      for (let passe = 0; passe < 6; passe++) {
        const rs = rectSous(us, s)!
        const milieu = (rs.y0 + rs.y1) / 2
        let d = 0
        for (const u of us) {
          if (sousU(u) === s) continue
          const ru = rectU(u)
          if (!croise(ru, rs, gap / 2) || ys[u]! >= milieu) continue
          d = Math.max(d, ru.y1 + gap - rs.y0 + (sousU(u) ? B.padS : 0))
        }
        if (d > 0.5) {
          const debut = new Map<number, number>()
          for (const m of membres) debut.set(rang[m]!, Math.min(debut.get(rang[m]!) ?? Infinity, ys[m]!))
          for (const [r, y0] of debut) decaler(r, y0 - 0.5, d)
          continue
        }
        let bouge = false
        for (const u of us) {
          if (sousU(u) === s) continue
          const ru = rectU(u)
          if (!croise(ru, rs, gap / 2)) continue
          decaler(rang[u]!, ys[u]! - 0.5, rs.y1 + gap - ru.y0 + (sousU(u) ? B.padS + B.titreS : 0))
          bouge = true
        }
        if (!bouge) break
      }
    }
  }
  // Pose des boîtes comme des pièces rigides, dans l'ordre du flux.
  {
    const rangMin = (us: number[]) => Math.min(...us.map((u) => rang[u]!))
    const ordre = [...groupes.keys()].sort((a, b) => rangMin(groupes.get(a)!) - rangMin(groupes.get(b)!) || ordreGroupe(a) - ordreGroupe(b))
    const poses: Rect[] = []
    const posees = new Set<string>()
    const enX = (a: Rect, b: Rect) => a.x0 < b.x1 + 2 && b.x0 < a.x1 + 2
    for (const gid of ordre) {
      const us = groupes.get(gid)!
      if (!gid) {
        // Hors boîte (onglet : entrées et sorties) : chaque bloc est une pièce à part.
        for (const u of us) {
          const R = rectU(u)
          const vs = [...parents[u]!, ...enfants[u]!].filter((v) => !marge[v] && posees.has(groupeU(v)))
          const voulu = vs.length ? vs.reduce((t, v) => t + ys[v]!, 0) / vs.length - ys[u]! : 0
          const libre = (dy: number) => poses.every((p) => !(enX(R, p) && R.y0 + dy < p.y1 + B.ecart && p.y0 < R.y1 + dy + B.ecart))
          const cands = [voulu]
          for (const p of poses) if (enX(R, p)) cands.push(p.y1 + B.ecart - R.y0, p.y0 - B.ecart - R.y1)
          let dy: number | null = null
          for (const c of cands) if (libre(c) && (dy === null || Math.abs(c - voulu) < Math.abs(dy - voulu))) dy = c
          dy ??= Math.max(0, ...poses.map((p) => p.y1)) + B.ecart - R.y0
          ys[u] = ys[u]! + dy
          poses.push({ x0: R.x0, y0: R.y0 + dy, x1: R.x1, y1: R.y1 + dy })
        }
        posees.add(gid)
        continue
      }
      const R = rectGroupe(us, gid)
      const ecarts: number[] = []
      for (const u of us) for (const v of [...parents[u]!, ...enfants[u]!]) if (!marge[v] && posees.has(groupeU(v))) ecarts.push(ys[v]! - ys[u]!)
      ecarts.sort((a, b) => a - b)
      const voulu = ecarts.length ? ecarts[Math.floor(ecarts.length / 2)]! : poses.length ? Math.min(...poses.map((p) => p.y0)) - R.y0 : -R.y0
      const libre = (dy: number) => poses.every((p) => !(enX(R, p) && R.y0 + dy < p.y1 + B.ecart - 0.01 && p.y0 < R.y1 + dy + B.ecart - 0.01))
      const candidats = [voulu]
      for (const p of poses) if (enX(R, p)) candidats.push(p.y1 + B.ecart - R.y0, p.y0 - B.ecart - R.y1)
      let dy: number | null = null
      for (const c of candidats) if (libre(c) && (dy === null || Math.abs(c - voulu) < Math.abs(dy - voulu))) dy = c
      if (dy === null) dy = Math.max(...poses.map((p) => p.y1)) + B.ecart - R.y0
      for (const u of us) ys[u] = ys[u]! + dy
      poses.push({ x0: R.x0, y0: R.y0 + dy, x1: R.x1, y1: R.y1 + dy })
      posees.add(gid)
    }
  }
  for (const u of topo) xs[u] = xRang(rang[u]!)

  // 7. Liaisons longues : un point de passage par colonne traversée, dans un intervalle libre.
  const chemins = new Map<number, [number, number][]>()
  {
    const occupe = new Map<number, [number, number][]>()
    for (const u of topo) {
      const b = boites[u]!
      let l = occupe.get(rang[u]!)
      if (!l) occupe.set(rang[u]!, (l = []))
      l.push([ys[u]! - b.haut - 6, ys[u]! + b.bas + 6])
    }
    const libreEn = (r: number, y: number) => !(occupe.get(r) ?? []).some(([a, b]) => y > a && y < b)
    const plusProche = (r: number, y: number) => {
      if (libreEn(r, y)) return y
      let m = y, dm = Infinity
      for (const [a, b] of occupe.get(r) ?? []) for (const c of [a - 1, b + 1]) if (libreEn(r, c) && Math.abs(c - y) < dm) {
        dm = Math.abs(c - y)
        m = c
      }
      return m
    }
    for (const a of g.aretes) {
      if (marge[a.source] || marge[a.cible] || renvoi[a.index]) continue
      const r0 = rang[a.source]!, r1 = rang[a.cible]!
      if (r1 - r0 < 2) continue
      const cols: number[] = []
      for (let r = r0 + 1; r < r1; r++) cols.push(r)
      const ya = ys[a.source]!, yb = ys[a.cible]!
      let chemin: [number, number][] | null = null
      for (const c of [ya, yb]) if (cols.every((r) => libreEn(r, c))) {
        chemin = cols.map((r) => [r, c])
        break
      }
      chemin ??= cols.map((r) => [r, plusProche(r, ya + ((yb - ya) * (r - r0)) / (r1 - r0))])
      for (const [r, y] of chemin) {
        let l = occupe.get(r)
        if (!l) occupe.set(r, (l = []))
        l.push([y - 4, y + 4])
      }
      chemins.set(a.index, chemin)
    }
  }

  // 8. Marge : hypothèses de modélisation empilées en haut (une décision juste au-dessus du choix qu'elle fixe).
  let ymin = Infinity, ymax = -Infinity
  for (const u of topo) {
    ymin = Math.min(ymin, ys[u]! - boites[u]!.haut)
    ymax = Math.max(ymax, ys[u]! + boites[u]!.bas)
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
  for (const d of decisionsMarge) if (!placees.has(d)) itemsMarge.push(d)
  {
    let y = ymin + (itemsMarge.length ? B.pad + B.titre : 0)
    for (const u of itemsMarge) {
      const b = boites[u]!
      y += b.haut
      xs[u] = xMarge
      ys[u] = y
      b.zone = 0
      y += b.bas + gap * 0.6
    }
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

  // Numérotation façon LaTeX, de gauche à droite puis de haut en bas : un compteur commun pour les énoncés
  // (« Lemme 7 »), D pour les décisions, (i) (ii) pour les hypothèses de modélisation (R37), § pour les
  // sous-problèmes réduits.
  {
    const cpt = { B: 0, D: 0, H: 0, F: 0 }
    const ordre = [...Array(nU).keys()].sort((a, b) => (boites[a]!.zone === 0 ? -1 : rang[a]!) - (boites[b]!.zone === 0 ? -1 : rang[b]!) || ys[a]! - ys[b]!)
    for (const p of ordre) {
      const b = boites[p]!
      const l = b.genre === 'drapeau' ? 'H' : b.genre === 'decision' ? 'D' : b.genre === 'fonction' ? 'F' : 'B'
      b.numero = ++cpt[l]
      b.ref = l === 'B' ? String(b.numero) : l === 'H' ? `(${romain(b.numero)})` : l === 'F' ? `§${b.numero}` : `D${b.numero}`
    }
  }
  for (const b of boites) b.renvois.sort((a, c) => rang[a]! - rang[c]! || boites[a]!.numero - boites[c]!.numero)

  // 10. Routes orthogonales.
  const demi = (p: number) => (boites[p]!.genre === 'decision' ? 19 : boites[p]!.w / 2)
  interface Segment { route: Route; i: number; xa: number; ya: number; xb: number; yb: number; cle: string }
  const routes: Route[] = []
  const parCanal = new Map<number, Segment[]>()
  const yPort = new Map<number, number>()
  const portsSortie = new Map<number, number>()
  // Broches de sortie des nœuds-fonctions (R19) : triées par ordonnée moyenne des destinations.
  for (let p = 0; p < nU; p++) {
    const br = boites[p]!.broches
    if (!br) continue
    const yCible = (s: BrocheSortie) => s.aretes.reduce((t, e) => t + ys[g.aretes[e]!.cible]!, 0) / Math.max(1, s.aretes.length)
    br.sorties.sort((a, b) => yCible(a) - yCible(b))
    const nIn = g.entrantes[p]!.filter((e) => !marge[g.aretes[e]!.source]).length
    br.sorties.forEach((s, k) => {
      s.y = br.y0 + nIn * br.pas + (nIn ? 6 : 0) + br.pas / 2 + k * br.pas
      for (const e of s.aretes) portsSortie.set(e, s.y)
    })
  }
  {
    const entrees = new Map<number, { arete: number; y: number }[]>()
    for (const a of g.aretes) {
      if (marge[a.cible] || renvoi[a.index]) continue
      const ch = chemins.get(a.index)
      const avant = ch && ch.length ? ch[ch.length - 1]![1] : ys[a.source]! + (portsSortie.get(a.index) ?? 0)
      let l = entrees.get(a.cible)
      if (!l) entrees.set(a.cible, (l = []))
      l.push({ arete: a.index, y: avant })
    }
    for (const [c, l] of entrees) {
      const b = boites[c]!
      l.sort((u, v) => u.y - v.y || u.arete - v.arete)
      if (b.broches) {
        const br = b.broches
        b.ports = l.map((_, k) => br.y0 + br.pas / 2 + k * br.pas)
        br.entrees = l.map((e, k) => ({ arete: e.arete, source: g.aretes[e.arete]!.source, y: b.ports[k]! }))
        l.forEach((e, k) => yPort.set(e.arete, ys[c]! + b.ports[k]!))
        continue
      }
      if (b.genre === 'decision' || l.length === 1) {
        for (const e of l) yPort.set(e.arete, ys[c]!)
        b.ports = [0]
        continue
      }
      // Flanc gauche, à 8 px des coins ; pas maximal de 14 px (R36).
      const y0 = -b.h / 2 + 8, y1 = b.h / 2 - 8
      const pasPort = Math.min(14, (y1 - y0) / Math.max(1, l.length - 1))
      b.ports = l.map((_, k) => (k - (l.length - 1) / 2) * pasPort)
      l.forEach((e, k) => yPort.set(e.arete, ys[c]! + b.ports[k]!))
    }
  }
  const bouts = new Map<Route, [number, number]>()
  for (const a of g.aretes) {
    if (marge[a.cible] || renvoi[a.index]) continue
    const abandon = noeudDe(a.source).piste === 'abandonnee' || noeudDe(a.cible).piste === 'abandonnee'
    const route: Route = { arete: a.index, source: a.source, cible: a.cible, points: [], abandon }
    const stations: [number, number][] = [[colDroite(a.source), ys[a.source]! + (portsSortie.get(a.index) ?? 0)]]
    for (const [r, y] of chemins.get(a.index) ?? []) stations.push([xRang(r) - W / 2, y], [xRang(r) + W / 2, y])
    stations.push([colGauche(a.cible), yPort.get(a.index) ?? ys[a.cible]!])
    routes.push(route)
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
    bouts.set(route, [xs[a.source]! + demi(a.source), xs[a.cible]! - demi(a.cible)])
  }
  const xPiste = new Map<Segment, number>()
  for (const segs of parCanal.values()) {
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
  const segmentsDe = new Map<Route, Segment[]>()
  for (const segs of parCanal.values()) for (const s of segs) {
    let l = segmentsDe.get(s.route)
    if (!l) segmentsDe.set(s.route, (l = []))
    l.push(s)
  }
  for (const r of routes) {
    const st = r.points
    const pts: [number, number][] = [st[0]!]
    for (let k = 0; k + 1 < st.length; k += 2) {
      const seg = segmentsDe.get(r)!.find((s) => s.i === k)!
      const xm = xPiste.get(seg) ?? (seg.xa + seg.xb) / 2
      const [, ya] = st[k]!, [xb, yb] = st[k + 1]!
      if (Math.abs(ya - yb) < 0.5) pts.push([xb, yb])
      else pts.push([xm, ya], [xm, yb], [xb, yb])
      if (k + 2 < st.length) pts.push(st[k + 2]!)
    }
    const [b0, b1] = bouts.get(r)!
    pts.unshift([b0, pts[0]![1]])
    pts.push([b1, pts[pts.length - 1]![1]])
    r.points = pts.filter((p, k) => !k || Math.abs(p[0] - pts[k - 1]![0]) + Math.abs(p[1] - pts[k - 1]![1]) > 0.1)
  }

  // Jonctions : bifurcations d'une même sortie (sauf la dernière), point plein.
  const jonctions: [number, number][] = []
  {
    const parSource = new Map<string, [number, number][]>()
    for (const r of routes) {
      const pts = r.points
      let virage = pts[pts.length - 1]!
      for (let k = 1; k + 1 < pts.length; k++) {
        if (Math.abs(pts[k + 1]![0] - pts[k]![0]) < 0.5) {
          virage = pts[k]!
          break
        }
      }
      const cle = `${r.source}:${Math.round(pts[0]![1])}`
      let l = parSource.get(cle)
      if (!l) parSource.set(cle, (l = []))
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

  // 11. Zones nommées (accolades de R36).
  const zones: Zone[] = []
  const bord = o.ecartColonnes / 2
  if (itemsMarge.length) zones.push({ nom: 'Modélisation', x0: xMarge - W / 2 - bord, x1: xMarge + W / 2 + bord })
  if (finEntrees >= 0) zones.push({ nom: 'Entrées', x0: xRang(0) - W / 2 - bord, x1: xRang(finEntrees) + W / 2 + bord })
  if (finEtapes >= finEntrees + 1) zones.push({ nom: onglet ? 'Sous-graphe' : 'Déduction', x0: xRang(finEntrees + 1) - W / 2 - bord, x1: xRang(finEtapes) + W / 2 + bord })
  if (finResultats >= finEtapes + 1) zones.push({ nom: onglet ? 'Sorties' : 'Résultats', x0: xRang(finEtapes + 1) - W / 2 - bord, x1: xRang(finResultats) + W / 2 + bord })

  // 12. Boîtes englobantes (positions finales), comme R18.
  const commentaires: Commentaire[] = []
  {
    const rectPoint = (p: number): Rect => {
      const b = boites[p]!
      const l = b.genre === 'decision' ? Math.max(24, b.w / 2) : b.w / 2
      return { x0: xs[p]! - l, y0: ys[p]! - b.haut, x1: xs[p]! + l, y1: ys[p]! + b.bas }
    }
    const enonces = (pts: number[]) => pts.reduce((t, p) => t + (g.unites[p]?.membres.length ?? 1), 0)
    const spParId = new Map(o.sousProblemes.map((s) => [s.id, s]))
    const parBoite = new Map<string, number[]>()
    for (let u = 0; u < nU; u++) {
      if (marge[u]) continue
      const k = boites[u]!.groupe
      if (!k) continue
      let l = parBoite.get(k)
      if (!l) parBoite.set(k, (l = []))
      l.push(u)
    }
    for (const [gid, pts] of parBoite) {
      const sp = spParId.get(gid)
      const abandon = !!sp?.abandonne || pts.every((p) => boites[p]!.abandon)
      const couleur = o.teinte(gid)
      const sous = new Map<string, number[]>()
      for (const p of pts) {
        const s = sousGroupeDe(p)
        if (!s) continue
        let l = sous.get(s)
        if (!l) sous.set(s, (l = []))
        l.push(p)
      }
      let r: Rect | null = null
      for (const p of pts) r = union(r, rectPoint(p))
      for (const [sid, sp2] of sous) {
        let rs: Rect | null = null
        for (const p of sp2) rs = union(rs, rectPoint(p))
        const c: Commentaire = {
          id: sid, nom: spParId.get(sid)?.nom ?? sid, resume: spParId.get(sid)?.resume ?? '', couleur, niveau: 1, abandon,
          reductible: !G.refus.has(sid), reduit: sp2.length === 1 && !!G.fonction[sp2[0]!] && G.reduits.has(sid),
          x0: rs!.x0 - B.padS, y0: rs!.y0 - B.padS - B.titreS, x1: rs!.x1 + B.padS, y1: rs!.y1 + B.padS, membres: sp2, enonces: enonces(sp2),
        }
        commentaires.push(c)
        r = union(r, c)
      }
      commentaires.push({
        id: gid, nom: sp?.nom ?? gid, resume: sp?.resume ?? '', couleur, niveau: 0, abandon,
        reductible: !G.refus.has(gid), reduit: pts.length === 1 && !!G.fonction[pts[0]!] && G.reduits.has(gid),
        x0: r!.x0 - B.pad, y0: r!.y0 - B.pad - B.titre, x1: r!.x1 + B.pad, y1: r!.y1 + B.pad, membres: pts, enonces: enonces(pts),
      })
    }
    if (itemsMarge.length) {
      let r: Rect | null = null
      for (const p of itemsMarge) r = union(r, rectPoint(p))
      commentaires.push({
        id: '§modelisation', nom: 'Hypothèses de modélisation', resume: 'Choix de modélisation et décisions qui les fixent.', couleur: o.teinteSpec,
        niveau: 0, abandon: false, reductible: false, reduit: false,
        x0: r!.x0 - B.pad, y0: r!.y0 - B.pad - B.titre, x1: r!.x1 + B.pad, y1: r!.y1 + B.pad, membres: [...itemsMarge], enonces: itemsMarge.length,
      })
    }
    commentaires.sort((a, b) => a.niveau - b.niveau)
  }

  // 13. Monde.
  let bx0 = Infinity, bx1 = -Infinity
  for (let p = 0; p < nU; p++) {
    bx0 = Math.min(bx0, xs[p]! - boites[p]!.w / 2)
    bx1 = Math.max(bx1, xs[p]! + boites[p]!.w / 2)
  }
  if (!Number.isFinite(bx0)) bx0 = bx1 = 0
  for (const c of commentaires) {
    bx0 = Math.min(bx0, c.x0)
    bx1 = Math.max(bx1, c.x1)
    ymin = Math.min(ymin, c.y0)
    ymax = Math.max(ymax, c.y1)
  }
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
  if (!Number.isFinite(wx0)) wx0 = wx1 = wz0 = wz1 = 0
  const disposition: Disposition = {
    moteur: 'dagre', nU, masques, x, z, yCouche, couche, rang,
    xRangs: xRangs.map((xr) => (xr - cx) * ECHELLE),
    xContexte: masques.length ? (xMasques - cx) * ECHELLE : NaN,
    bornes: { xmin: wx0, xmax: wx1, zmin: wz0, zmax: wz1 },
  }
  const page: MiseEnPage = {
    boites, routes, zones, commentaires, liensMarge, portees, usagesPastille, usagesRenvoi, echelle: ECHELLE, cx, cy,
    jonctions, xRangs, largeurCarte: W, bornes: { x0: bx0, y0: ymin, x1: bx1, y1: ymax }, hauteurFigure: o.hauteurFigure,
  }
  return { disposition, page }
}

/** Libellé de type d'un bloc (en-tête amsthm). */
export function libelleType(n: NoeudR): string {
  return LIBELLES_TYPE[n.type]
}
