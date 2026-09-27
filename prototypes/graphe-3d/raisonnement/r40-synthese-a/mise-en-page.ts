// R40 · Mise en page : celle de R18 (placement boîte par boîte, sans chevauchement, boîtes imbriquées),
// avec les blocs de R36 et la réduction de R19. Colonnes = rangs logiques, liaisons orthogonales,
// ports d'entrée répartis, jonctions, renvois « cf. 7 ».
//
// - Hauteurs : fournies par la composition (composition.ts) : estimées sans créer de HTML, ou mesurées si
//   le bloc a déjà été composé (le contenu HTML n'est créé qu'à la demande, voir composition.ts).
//   Largeur fixe (réglage « largeur bloc ») ; ancrage au centre du bloc.
// - Boîtes (R18) : dans chaque boîte de premier niveau, les éléments d'une colonne sont triés par boîte
//   imbriquée (« parent.enfant ») ; la séparation verticale réserve la marge et la barre de titre des
//   boîtes ; la boîte est mise en page seule (barycentres, régression isotone sur ses liaisons internes),
//   puis posée comme une pièce rigide au plus près de la hauteur médiane de ses voisins déjà posés, sans
//   chevaucher une boîte posée. Rangs « au plus tard » (une racine se place juste avant son premier usage).
// - Nœud-fonction (R19) : une boîte réduite est une seule unité ; une broche d'entrée par liaison
//   entrante, une broche de sortie par énoncé de la boîte utilisé à l'extérieur.
// - Graphiques (R35) : la place des figures affichées est réservée sous le bloc qui énonce la loi.
// - Numérotation (R36 / R37) : compteur commun des énoncés (« Lemme 7 »), D1… pour les décisions,
//   (i), (ii)… pour les hypothèses de modélisation, F1… pour les boîtes réduites.
//
// Coordonnées de mise en page en px (y vers le bas), converties en monde (× 0,01) pour la vue :
//   X monde = x, Z monde = −y, Y monde = couche de type (3D).

import {
  coucheDe, dependantsDe, type Disposition, type GrapheLecture, type NoeudR, type SousProbleme,
} from '../../src/raisonnement'
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

/** Broche de sortie d'un nœud-fonction : un énoncé de la boîte utilisé à l'extérieur. */
export interface BrocheSortie {
  /** Nœud de justification. */
  noeud: number
  aretes: number[]
  y: number
}

export interface Boite {
  genre: GenreBoite
  /** Largeur et hauteur du cadre (bloc, hypothèse, nœud-fonction ; libellé + losange pour une décision). */
  w: number
  h: number
  /** Distance du point d'ancrage (ports des arêtes) au haut et au bas de l'emprise complète (bornes et figures comprises). */
  haut: number
  bas: number
  /** Hauteur du libellé d'une décision (au-dessus du losange). */
  hLibelle: number
  /** Nœud-fonction : nom de la boîte (lignes). */
  lignes: string[]
  pastilles: Pastille[]
  /** Pastilles non montrées. */
  plus: number
  /** Renvois : prémisses lointaines citées par leur numéro au lieu d'une longue flèche. */
  renvois: number[]
  numero: number
  /** Décision : alternative(s) rejetée(s). */
  impasse: { texte: string; autres: number } | null
  /** Zone : 0 marge (choix), 1 outils / entrée, 2 étapes, 3 résultats / sortie, −1 masqué. */
  zone: number
  rang: number
  abandon: boolean
  /** Numéro : « 7 » (énoncé), « D2 » (décision), « (ii) » (hypothèse), « F1 » (boîte réduite). */
  ref: string
  /** Ordonnées relatives des ports d'entrée. */
  ports: number[]
  /** Nœud-fonction : broches, et ordonnée relative du haut de leurs rangées. */
  broches: { entrees: BrocheEntree[]; sorties: BrocheSortie[]; y0: number } | null
  /** Figures (graphiques) sous le bloc et ordonnée relative du haut de la première. */
  figures: number
  yFigures: number
  /** Sous-problème effectif (boîte la plus intérieure) et boîte de premier niveau. */
  sousProbleme: string
  groupe: string
  /** Teinte de sa boîte (niveau de détail « points »). */
  couleur: string
}

/** Computer Modern (fontes de KaTeX, chargées depuis cdn.jsdelivr.net), sinon Latin Modern installée. */
export const SERIF = `KaTeX_Main, 'Latin Modern Roman', 'CMU Serif', 'Computer Modern', 'Times New Roman', serif`
/** Italique mathématique de Computer Modern (variables : r, c…). */
export const SERIF_MATH = `KaTeX_Math, 'Latin Modern Math', 'CMU Serif', serif`

// ─── Boîtes (R18) ────────────────────────────────────────────────────────────

export interface Commentaire {
  id: string
  nom: string
  resume: string
  couleur: string
  /** 0 : boîte de premier niveau ; 1 : boîte imbriquée. */
  niveau: 0 | 1
  abandon: boolean
  /** Boîte réduite en nœud-fonction (clic sur la barre : déployer). */
  reduit: boolean
  /** La barre de titre réduit / déploie (pas la marge des spécifications ni les boîtes d'onglet). */
  reductible: boolean
  /** Rectangle (px de mise en page). */
  x0: number
  y0: number
  x1: number
  y1: number
  /** Points membres (unités). */
  membres: number[]
}

/** Marges des boîtes (px de mise en page), comme R18. */
export const BOITE = { pad: 10, titre: 20, padS: 7, titreS: 16, ecart: 12 }

/** Sous-problème parent (« a.b » → « a ») ou null. */
export function parentDe(id: string): string | null {
  const k = id.lastIndexOf('.')
  return k > 0 ? id.slice(0, k) : null
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
  /** Liaison de lecture → ordonnée relative de sa broche de sortie (nœuds-fonctions). */
  portsSortie: Map<number, number>
  /** Abscisses (px) des rangs logiques ; largeurs des rangs ; abscisse de la marge des hypothèses. */
  xRangs: number[]
  largeursRangs: number[]
  xMarge: number
  largeurCarte: number
  onglet: boolean
  echelle: number
  cx: number
  cy: number
  /** Contenu (blocs + boîtes). */
  bornes: { x0: number; y0: number; x1: number; y1: number }
}

/** Boîtes (R18 / R19), par unité. */
export interface OptionsGroupes {
  /** Sous-problème effectif de chaque unité : le sien, la boîte réduite pour un nœud-fonction, « §entree » / « §sortie » en onglet. */
  sp: string[]
  fonction: boolean[]
  entree: boolean[]
  sortie: boolean[]
  /** Boîte ouverte en onglet (null : graphe principal). */
  onglet: string | null
  nom: (id: string) => string
  teinte: (id: string) => string
  abandonne: (id: string) => boolean
}

export interface OptionsMiseEnPage {
  largeurCarte: number
  ecartColonnes: number
  ecartLignes: number
  taillePolice: number
  maxPastilles: number
  ecartCouches: number
  police: string
  sousProblemes: SousProbleme[]
  precedent?: Map<string, number>
  /** Hauteur du bloc composé (estimée ou mesurée, px) ; pour une décision, celle de son libellé. */
  hauteur: (p: number) => number
  groupes: OptionsGroupes
  /** Nombre de figures affichées sous le bloc d'un point, et hauteur d'une figure. */
  figuresDe?: (p: number) => number
  hauteurFigure?: number
}

/** Écart entre le bloc (ou sa rangée de bornes) et une figure, et entre deux figures. */
export const ECART_FIGURE = 10

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
  return lignes.map((l) => {
    if (ctx.measureText(l).width <= largeur) return l
    let x = l
    while (x.length > 1 && ctx.measureText(x + '…').width > largeur) x = x.slice(0, -1)
    return x + '…'
  })
}

// ─── Pastilles ───────────────────────────────────────────────────────────────

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
    // Avec les boîtes, une décision sans prémisse qui mène à des énoncés reste dans le flux (dans la
    // boîte de son sous-problème) au lieu de partir dans la marge.
    else if (n.type === 'decision' && parents[u]!.length === 0 && enfants[u]!.every((v) => noeudDe(v).type === 'choix_modelisation')) marge[u] = 1
  }
  for (let u = 0; u < nU; u++) {
    const n = noeudDe(u)
    if (n.type === 'decision' && enfants[u]!.length && enfants[u]!.every((v) => marge[v]) && parents[u]!.every((s) => marge[s])) marge[u] = 1
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

  // 3. Zones : outils, étapes, résultats.
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
  // Avec les boîtes, pas de zone « outils » : une racine se place juste avant son premier usage (4),
  // à côté des blocs de son sous-problème, au lieu de tout empiler au rang 0.
  const G = o.groupes
  const onglet = G.onglet !== null
  for (const u of topo) {
    if (onglet) zone[u] = G.entree[u] ? 1 : G.sortie[u] ? 3 : 2
    else zone[u] = toutMajeur[u] ? 3 : 2
  }
  void racine

  // 4. Rangs : plus long chemin, bornés par zone.
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
  {
    // Rangs au plus tard : chaque énoncé glisse vers la droite jusqu'au rang qui précède son premier
    // usage (arêtes plus courtes, boîtes plus compactes horizontalement).
    for (let k = topo.length - 1; k >= 0; k--) {
      const u = topo[k]!
      if (zone[u] !== 2) continue
      const cs = enfants[u]!.filter((v) => !marge[v])
      if (!cs.length) continue
      const r = Math.min(...cs.map((v) => rang[v]!)) - 1
      if (r > rang[u]!) rang[u] = r
    }
  }

  // 4 bis. Renvois : prémisse outil (ou très partagée) citée loin en aval, par son repère.
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

  // Sous-problèmes : ordre du jeu, parent (imbrication « a.b »). Sous-problème effectif fourni par la vue
  // (boîte réduite pour un nœud-fonction, « §entree » / « §sortie » en onglet).
  const ordreSP = new Map<string, number>()
  o.sousProblemes.forEach((s, k) => ordreSP.set(s.id, k))
  ordreSP.set('§entree', -2)
  ordreSP.set('§sortie', 1e6)
  const spDe = (p: number) => (marge[p] ? '§spec' : G.sp[p] ?? '')
  const groupeDe = (p: number) => {
    let s = spDe(p)
    for (let q = parentDe(s); q; q = parentDe(s)) s = q
    return s
  }
  const sousGroupeDe = (p: number) => (parentDe(spDe(p)) ? spDe(p) : '')

  // 5. Boîtes (dimensions, pastilles, broches des nœuds-fonctions, figures).
  const T = o.taillePolice
  const boites: Boite[] = []
  const usagesPastille = new Map<number, number[]>()
  const W = o.largeurCarte
  const hF = o.hauteurFigure ?? 0
  for (let p = 0; p < nP; p++) {
    const n = noeudDe(p)
    const unite = p < nU ? g.unites[p]! : undefined
    const abandon = n.piste === 'abandonnee'
    let genre: GenreBoite = !unite ? 'masque' : n.type === 'choix_modelisation' ? 'drapeau' : n.type === 'decision' ? 'decision'
      : majeur(p) ? 'majeur' : unite.genre === 'etape' ? 'etape' : 'carte'
    if (unite && G.fonction[p]) genre = 'fonction'
    // Pastilles : contexte rattaché, sans les choix (représentés par les hypothèses de la marge).
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
    // La rangée tient dans la largeur du bloc : renvois « cf. 12 » (32 px) puis bornes (15 px).
    const place = Math.max(0, Math.floor((W - 16 - renvois.length * 32 - 18) / 15))
    const montrees = Math.min(pastilles.length, o.maxPastilles, place)
    const plus = pastilles.length - montrees
    const rangeePastilles = pastilles.length || renvois.length ? 17 : 0
    let w = W, h: number, haut: number, bas: number, hLibelle = 0, lignes: string[] = [], impasse: Boite['impasse'] = null
    let broches: Boite['broches'] = null
    if (genre === 'decision') {
      const alt = n.decision?.alternatives.filter((a) => !a.retenue) ?? []
      if (alt.length) impasse = { texte: alt[0]!.libelle, autres: alt.length - 1 }
      hLibelle = o.hauteur(p)
      h = hLibelle + 4 + 38
      haut = hLibelle + 4 + 19
      bas = 19 + (impasse ? 30 : 4) + rangeePastilles
    } else if (genre === 'fonction') {
      // Nœud-fonction (R19) : en-tête, nom de la boîte, rangées de broches (entrées puis sorties), pied.
      lignes = couperLignes(G.nom(spDe(p)), w - 16, `700 ${T}px ${SERIF}`, 2)
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
      const y0 = 6 + T * 1.3 + 4 + lignes.length * (T + 3) + 5
      h = y0 + (nIn + nOut) * 14 + (nIn && nOut ? 6 : 0) + 6 + T * 1.25 + 8
      haut = h / 2
      bas = h / 2 + (rangeePastilles ? rangeePastilles + 3 : 0)
      broches = { entrees: [], sorties: [...sorties].map(([noeud, aretes]) => ({ noeud, aretes, y: 0 })), y0: y0 - h / 2 }
    } else if (genre === 'masque') {
      lignes = couperLignes(n.nom, 150, `500 11px ${o.police}`, 1)
      w = 12
      h = 12
      haut = 6
      bas = 6
    } else {
      h = o.hauteur(p)
      haut = h / 2
      bas = h / 2 + (rangeePastilles ? rangeePastilles + 3 : 0)
    }
    // Figures (R35) sous le bloc qui énonce la loi.
    let figures = 0, yFigures = 0
    if (unite && hF && (genre === 'carte' || genre === 'etape' || genre === 'majeur')) {
      figures = o.figuresDe?.(p) ?? 0
      if (figures) {
        yFigures = bas + ECART_FIGURE
        bas = yFigures + figures * (hF + ECART_FIGURE)
      }
    }
    boites.push({
      genre, w, h, haut, bas, hLibelle, lignes, pastilles: pastilles.slice(0, montrees), plus, renvois, numero: 0, impasse,
      zone: zone[p]!, rang: rang[p]!, abandon, ref: '', ports: [], broches, figures, yFigures,
      sousProbleme: p < nU ? spDe(p) : '', groupe: p < nU ? groupeDe(p) : '', couleur: p < nU ? G.teinte(spDe(p)) : '#000000',
    })
  }

  // Largeur des rangs et abscisses (blocs centrés dans leur colonne).
  const largeurRang = new Float64Array(Math.max(1, nbRangs)).fill(W)
  for (let u = 0; u < nU; u++) if (!marge[u] && rang[u]! >= 0) largeurRang[rang[u]!] = Math.max(largeurRang[rang[u]!]!, boites[u]!.w)
  let largeurMarge = W
  for (let u = 0; u < nU; u++) if (marge[u]) largeurMarge = Math.max(largeurMarge, boites[u]!.w)
  const xMarge = 0
  const xRangs: number[] = []
  {
    let x = xMarge + largeurMarge / 2 + o.ecartColonnes * 1.25
    for (let r = 0; r < nbRangs; r++) {
      xRangs.push(x + largeurRang[r]! / 2)
      x += largeurRang[r]! + o.ecartColonnes
    }
  }
  const xRang = (r: number) => xRangs[r] ?? 0
  const colDroite = (p: number) => (marge[p] ? xMarge + largeurMarge / 2 : xRang(rang[p]!) + largeurRang[rang[p]!]! / 2)
  const colGauche = (p: number) => (marge[p] ? xMarge - largeurMarge / 2 : xRang(rang[p]!) - largeurRang[rang[p]!]! / 2)

  // 6. Placement par boîte. Chaque boîte (sous-problème de premier niveau) est mise en page seule :
  //    ordre dans chaque colonne par barycentres (sous-problème imbriqué d'abord), hauteurs par régression
  //    isotone vers la moyenne de ses voisins INTERNES. Puis les boîtes sont posées comme des pièces
  //    rigides, dans l'ordre du flux, chacune au plus près de la hauteur médiane de ses voisins déjà posés
  //    sans chevaucher une boîte posée (au-dessus ou au-dessous). Sans boîtes : un seul groupe.
  const gap = o.ecartLignes
  const B = BOITE
  const actifsBoites = true
  const groupeU = (u: number) => (actifsBoites ? boites[u]!.groupe : '')
  const sousU = (u: number) => (actifsBoites ? sousGroupeDe(u) : '')
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
  const rectGroupe = (us: number[]): Rect => {
    let r: Rect | null = null
    const sous = new Set<string>()
    for (const u of us) {
      r = union(r, rectU(u))
      if (sousU(u)) sous.add(sousU(u))
    }
    for (const s of sous) r = union(r, rectSous(us, s)!)
    if (!actifsBoites) return r!
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
  const placer = (c: number[], voulu: number[]) => {
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
    // Ordre initial : positions précédentes (stabilité au dépliage), sinon ordre topologique.
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
        placer(c, c.map((u) => {
          const vs = voisins(u)
          return vs.length ? vs.reduce((t, v) => t + ys[v]!, 0) / vs.length : ys[u]!
        }))
      }
    }
    // Boîtes imbriquées : leurs membres sont en bas de chaque colonne (tri). Un bloc étranger qui déborde
    // dans le rectangle par le haut fait descendre la boîte imbriquée (et ce qui la suit dans ses
    // colonnes) ; un bloc étranger situé sous son milieu est poussé sous elle.
    if (actifsBoites) {
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
  }
  // Pose des boîtes, dans l'ordre du flux (rang minimal), puis de l'ordre des sous-problèmes.
  {
    const rangMin = (us: number[]) => Math.min(...us.map((u) => rang[u]!))
    const ordre = [...groupes.keys()].sort((a, b) => rangMin(groupes.get(a)!) - rangMin(groupes.get(b)!) || ordreGroupe(a) - ordreGroupe(b))
    const poses: Rect[] = []
    const posees = new Set<string>()
    const enX = (a: Rect, b: Rect) => a.x0 < b.x1 + 2 && b.x0 < a.x1 + 2
    for (const gid of ordre) {
      const us = groupes.get(gid)!
      const R = rectGroupe(us)
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

  // 7. Liaisons longues : un point de passage par colonne traversée, dans un intervalle libre de la
  //    colonne (jamais sur un bloc) ; tout droit à la hauteur de la source ou de la cible si possible.
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

  // 8. Marge : spécifications empilées en haut (une décision juste au-dessus du choix qu'elle fixe),
  //    puis les décisions sans prémisse au niveau de leurs enfants.
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
  const hautMarge = ymin + (actifsBoites && itemsMarge.length ? B.pad + B.titre : 0)
  const voulusMarge: number[] = []
  let yPile = hautMarge
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
    const el = itemsMarge.map((u) => ({ point: u, haut: boites[u]!.haut, bas: boites[u]!.bas }))
    const sep = (a: { bas: number }, b: { haut: number }) => a.bas + gap * 0.6 + b.haut
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
        ys[u] = Math.max(hautMarge + boites[u]!.haut, b.somme / b.n + off[k]!)
        boites[u]!.zone = 0
      }
    })
  }
  for (const u of itemsMarge) {
    ymin = Math.min(ymin, ys[u]! - boites[u]!.haut)
    ymax = Math.max(ymax, ys[u]! + boites[u]!.bas)
  }

  // 9. Masqués (contexte pur) : colonne à gauche de la marge, visible avec les liens complets.
  const xMasques = xMarge - largeurMarge / 2 - o.ecartColonnes * 1.6 - 60
  const hauteurDispo = Math.max(200, ymax - ymin)
  const parColonne = Math.max(1, Math.floor(hauteurDispo / 15))
  const ordreMasques = masques.map((m, k) => ({ m, k })).sort((a, b) => coucheDe(j.noeuds[a.m]!.type) - coucheDe(j.noeuds[b.m]!.type) || j.sortantes[b.m]!.length - j.sortantes[a.m]!.length)
  ordreMasques.forEach(({ k }, i) => {
    const col = Math.floor(i / parColonne), lig = i % parColonne
    xs[nU + k] = xMasques - col * 170
    ys[nU + k] = ymin + 6 + lig * 15
  })

  // Numéros, de gauche à droite puis de haut en bas : compteur commun des énoncés (façon amsthm, R36),
  // D1… pour les décisions, (i), (ii)… pour les hypothèses de modélisation (R37), F1… pour les boîtes réduites.
  {
    const cpt = { E: 0, D: 0, H: 0, F: 0 }
    const ordre = [...Array(nU).keys()].sort((a, b) => (boites[a]!.zone === 0 ? -1 : rang[a]!) - (boites[b]!.zone === 0 ? -1 : rang[b]!) || ys[a]! - ys[b]!)
    for (const p of ordre) {
      const b = boites[p]!
      const l = b.genre === 'drapeau' ? 'H' : b.genre === 'decision' ? 'D' : b.genre === 'fonction' ? 'F' : 'E'
      b.numero = ++cpt[l]
      b.ref = l === 'E' ? String(b.numero) : l === 'H' ? `(${romain(b.numero)})` : `${l}${b.numero}`
    }
  }
  for (const b of boites) b.renvois.sort((a, c) => rang[a]! - rang[c]! || boites[a]!.numero - boites[c]!.numero)

  // 10. Routes orthogonales : bord du bloc → bord de sa colonne → canal (piste verticale) → … → bord de
  //     la colonne cible → port du bloc.
  const demi = (p: number) => (boites[p]!.genre === 'decision' ? 19 : boites[p]!.w / 2)
  interface Segment { route: Route; i: number; xa: number; ya: number; xb: number; yb: number; cle: string }
  const routes: Route[] = []
  const parCanal = new Map<number, Segment[]>()
  const yPort = new Map<number, number>()
  const portsSortie = new Map<number, number>()
  // Broches de sortie des nœuds-fonctions : triées par ordonnée moyenne des destinations.
  for (let p = 0; p < nU; p++) {
    const br = boites[p]!.broches
    if (!br) continue
    const yCible = (b: BrocheSortie) => b.aretes.reduce((t, e) => t + ys[g.aretes[e]!.cible]!, 0) / Math.max(1, b.aretes.length)
    br.sorties.sort((a, b) => yCible(a) - yCible(b))
    const nIn = g.entrantes[p]!.filter((e) => !marge[g.aretes[e]!.source]).length
    br.sorties.forEach((b, k) => {
      b.y = br.y0 + nIn * 14 + (nIn ? 6 : 0) + 7 + k * 14
      for (const e of b.aretes) portsSortie.set(e, b.y)
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
        // Nœud-fonction : une broche par liaison entrante, dans l'ordre des arrivées (pas de croisement).
        const br = b.broches
        b.ports = l.map((_, k) => br.y0 + 7 + k * 14)
        br.entrees = l.map((e, k) => ({ arete: e.arete, source: g.aretes[e.arete]!.source, y: b.ports[k]! }))
        l.forEach((e, k) => yPort.set(e.arete, ys[c]! + b.ports[k]!))
      } else if (b.genre === 'decision' || l.length === 1) {
        for (const e of l) yPort.set(e.arete, ys[c]!)
        b.ports = [0]
      } else {
        // Sur le flanc gauche, à 8 px des coins ; pas maximal de 14 px (R36).
        const y0 = -b.h / 2 + 8, y1 = b.h / 2 - 8
        const pasPort = Math.min(14, (y1 - y0) / Math.max(1, l.length - 1))
        b.ports = l.map((_, k) => (k - (l.length - 1) / 2) * pasPort)
        l.forEach((e, k) => yPort.set(e.arete, ys[c]! + b.ports[k]!))
      }
    }
  }
  for (const a of g.aretes) {
    if (marge[a.cible] || renvoi[a.index]) continue
    const abandon = noeudDe(a.source).piste === 'abandonnee' || noeudDe(a.cible).piste === 'abandonnee'
    const route: Route = { arete: a.index, source: a.source, cible: a.cible, points: [], abandon }
    const stations: [number, number][] = [[colDroite(a.source), ys[a.source]! + (portsSortie.get(a.index) ?? 0)]]
    for (const [r, y] of chemins.get(a.index) ?? []) stations.push([xRang(r) - largeurRang[r]! / 2, y], [xRang(r) + largeurRang[r]! / 2, y])
    const yp = yPort.get(a.index) ?? ys[a.cible]!
    stations.push([colGauche(a.cible), yp])
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
    // Bouts dans la colonne : du bord du bloc au bord de colonne (horizontaux).
    ;(route as Route & { bouts?: [number, number] }).bouts = [xs[a.source]! + demi(a.source), xs[a.cible]! - demi(a.cible)]
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
  const tousSegments = [...parCanal.values()].flat()
  for (const r of routes) {
    const st = r.points
    const pts: [number, number][] = [st[0]!]
    for (let k = 0; k + 1 < st.length; k += 2) {
      const seg = tousSegments.find((s) => s.route === r && s.i === k)!
      const xm = xPiste.get(seg) ?? (seg.xa + seg.xb) / 2
      const [, ya] = st[k]!, [xb, yb] = st[k + 1]!
      if (Math.abs(ya - yb) < 0.5) pts.push([xb, yb])
      else pts.push([xm, ya], [xm, yb], [xb, yb])
      if (k + 2 < st.length) pts.push(st[k + 2]!)
    }
    const bouts = (r as Route & { bouts?: [number, number] }).bouts!
    pts.unshift([bouts[0], pts[0]![1]])
    pts.push([bouts[1], pts[pts.length - 1]![1]])
    r.points = pts.filter((p, k) => !k || Math.abs(p[0] - pts[k - 1]![0]) + Math.abs(p[1] - pts[k - 1]![1]) > 0.1)
  }

  // Jonctions : bifurcations d'une même sortie (sauf la dernière).
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
      const cle = r.source * 1000 + Math.round(portsSortie.get(r.arete) ?? 0)
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

  // 11. Zones nommées (accolades au-dessus de la figure, R36).
  const zones: Zone[] = []
  const bord = o.ecartColonnes / 2
  const bordRang = (r: number, cote: -1 | 1) => xRang(r) + (cote * largeurRang[r]!) / 2
  const noms = onglet ? ['Entrée', 'Sous-graphe', 'Sortie'] : ['Prémisses', 'Déduction', 'Résultats']
  if (itemsMarge.length) zones.push({ nom: 'Modélisation', x0: xMarge - largeurMarge / 2 - bord, x1: xMarge + largeurMarge / 2 + bord })
  if (finOutils >= 0) zones.push({ nom: noms[0]!, x0: bordRang(0, -1) - bord, x1: bordRang(finOutils, 1) + bord })
  if (finEtapes >= finOutils + 1) zones.push({ nom: noms[1]!, x0: bordRang(finOutils + 1, -1) - bord, x1: bordRang(finEtapes, 1) + bord })
  if (finResultats >= finEtapes + 1) zones.push({ nom: noms[2]!, x0: bordRang(finEtapes + 1, -1) - bord, x1: bordRang(finResultats, 1) + bord })

  // 12. Boîtes (positions finales ; le rendu les recalcule à chaque image depuis les blocs membres).
  const commentaires: Commentaire[] = []
  {
    const rectPoint = (p: number): Rect => {
      const b = boites[p]!
      const l = b.genre === 'decision' ? Math.max(24, b.w / 2) : b.w / 2
      return { x0: xs[p]! - l, y0: ys[p]! - b.haut, x1: xs[p]! + l, y1: ys[p]! + b.bas }
    }
    const spParId = new Map(o.sousProblemes.map((x) => [x.id, x]))
    const parBoite = new Map<string, number[]>()
    for (let u = 0; u < nU; u++) {
      if (marge[u]) continue
      const k = boites[u]!.groupe
      let l = parBoite.get(k)
      if (!l) parBoite.set(k, (l = []))
      l.push(u)
    }
    // Une boîte est réduite quand elle ne contient que le nœud-fonction qui la représente.
    const reduite = (id: string, pts: number[]) => pts.length === 1 && boites[pts[0]!]!.genre === 'fonction' && spDe(pts[0]!) === id
    const reductible = (id: string) => !onglet && !id.startsWith('§')
    for (const [gid, pts] of parBoite) {
      const abandon = G.abandonne(gid) || pts.every((p) => boites[p]!.abandon)
      const couleur = G.teinte(gid)
      const sous = new Map<string, number[]>()
      for (const p of pts) {
        const x = sousGroupeDe(p)
        if (!x) continue
        let l = sous.get(x)
        if (!l) sous.set(x, (l = []))
        l.push(p)
      }
      let r: Rect | null = null
      for (const p of pts) r = union(r, rectPoint(p))
      for (const [sid, sp2] of sous) {
        let rs: Rect | null = null
        for (const p of sp2) rs = union(rs, rectPoint(p))
        const c: Commentaire = {
          id: sid, nom: G.nom(sid), resume: spParId.get(sid)?.resume ?? '', couleur, niveau: 1, abandon: abandon || G.abandonne(sid),
          reduit: reduite(sid, sp2), reductible: reductible(sid),
          x0: rs!.x0 - B.padS, y0: rs!.y0 - B.padS - B.titreS, x1: rs!.x1 + B.padS, y1: rs!.y1 + B.padS, membres: sp2,
        }
        commentaires.push(c)
        r = union(r, c)
      }
      commentaires.push({
        id: gid, nom: G.nom(gid), resume: spParId.get(gid)?.resume ?? '', couleur, niveau: 0, abandon,
        reduit: reduite(gid, pts), reductible: reductible(gid),
        x0: r!.x0 - B.pad, y0: r!.y0 - B.pad - B.titre, x1: r!.x1 + B.pad, y1: r!.y1 + B.pad, membres: pts,
      })
    }
    if (itemsMarge.length) {
      let r: Rect | null = null
      for (const p of itemsMarge) r = union(r, rectPoint(p))
      commentaires.push({
        id: '§spec', nom: G.nom('§spec'), resume: 'Choix de modélisation et décisions qui les fixent.', couleur: G.teinte('§spec'),
        niveau: 0, abandon: false, reduit: false, reductible: false,
        x0: r!.x0 - B.pad, y0: r!.y0 - B.pad - B.titre, x1: r!.x1 + B.pad, y1: r!.y1 + B.pad, membres: [...itemsMarge],
      })
    }
    // Niveau 0 d'abord (dessous), imbriquées ensuite.
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
  const disposition: Disposition = {
    moteur: 'dagre', nU, masques, x, z, yCouche, couche, rang,
    xRangs: xRangs.map((xr) => (xr - cx) * ECHELLE),
    xContexte: masques.length ? (xMasques - cx) * ECHELLE : NaN,
    bornes: { xmin: wx0, xmax: wx1, zmin: wz0, zmax: wz1 },
  }
  const page: MiseEnPage = {
    boites, routes, zones, commentaires, liensMarge, portees, usagesPastille, usagesRenvoi, echelle: ECHELLE, cx, cy,
    jonctions, portsSortie, xRangs, largeursRangs: [...largeurRang], xMarge, largeurCarte: W, onglet,
    bornes: { x0: bx0, y0: ymin, x1: bx1, y1: ymax },
  }
  return { disposition, page }
}

/** Chiffres romains minuscules (hypothèses (i), (ii)…), comme R37. */
export function romain(n: number): string {
  const t: [number, string][] = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]
  let r = ''
  for (const [v, x] of t) while (n >= v) {
    r += x
    n -= v
  }
  return r
}
