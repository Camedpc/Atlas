// R19 · Mise en page (reprise de R14) : colonnes = rangs logiques, rangées horizontales, liaisons
// orthogonales, repères B / D / H, ports d'entrée répartis, jonctions, spécifications « Hyp. : … ».
// Ajouts R19 :
// - bandes de groupes : chaque sous-problème occupe une bande horizontale (sa boîte « Comment »), les
//   bandes sont empilées sans chevauchement, dans l'ordre qui minimise la longueur verticale des
//   liaisons entre bandes ; l'ordre et les hauteurs sont calculés à l'intérieur de chaque bande ;
// - nœud-fonction (groupe réduit) : une broche d'entrée par liaison entrante, une broche de sortie par
//   énoncé du groupe utilisé à l'extérieur, les liaisons partent de la broche de leur énoncé ;
// - onglet : colonnes Entrée (sources directes) · sous-graphe · Sortie (utilisateurs directs) ;
// - feuille et cartouche : la feuille réserve la place du cartouche sous le schéma (coin bas droit).
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
  coucheDe, dependantsDe, LIBELLES_TYPE, type Disposition, type GrapheLecture, type NoeudR,
} from '../../src/raisonnement'
import { natureDe } from './squelette'

export type GenreBoite = 'drapeau' | 'decision' | 'carte' | 'etape' | 'majeur' | 'masque' | 'fonction' | 'entree' | 'sortie'

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
  /** Repère de schéma : « B7 » (bloc), « D2 » (décision), « H1 » (hypothèse de modélisation). */
  ref: string
  /** Spécification (choix de modélisation) : lignes « Hyp. : … ». */
  specs: string[]
  /** Ordonnées relatives des ports d'entrée (flanc gauche). */
  ports: number[]
  /** Groupe (sous-problème) du bloc ; null dans la marge. */
  groupe: string | null
  /** Nœud-fonction : broches, et ordonnée relative du haut de leurs rangées. */
  broches: { entrees: BrocheEntree[]; sorties: BrocheSortie[]; y0: number } | null
}

/** Boîte « Comment » : points d'un groupe (le rectangle est calculé à l'image, d'après la projection). */
export interface GroupePage {
  id: string
  points: number[]
  reduit: boolean
}

/** Police à chasse fixe des repères, cotes et spécifications. */
export const MONO = `'JetBrains Mono', ui-monospace, 'Cascadia Mono', 'SF Mono', Consolas, monospace`

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
  groupes: GroupePage[]
  /** Liaison de lecture → ordonnée relative de sa broche de sortie (nœuds-fonctions). */
  portsSortie: Map<number, number>
  onglet: boolean
  /** Feuille (cadre) et cartouche, px de mise en page. */
  feuille: { x0: number; y0: number; x1: number; y1: number }
  cartouche: { x0: number; y0: number; x1: number; y1: number }
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
  /** Groupes (R19), par unité : groupe, nœud-fonction, Entrée / Sortie d'onglet. */
  groupes: OptionsGroupes
}

export interface OptionsGroupes {
  groupe: (string | null)[]
  fonction: boolean[]
  entree: boolean[]
  sortie: boolean[]
  /** Groupe ouvert en onglet (seule boîte « Comment » dessinée). */
  onglet: string | null
  /** Ordre des sous-problèmes dans le jeu (départage des bandes). */
  ordre: string[]
  nom: (id: string) => string
}

/** Dimensions du cartouche (px de mise en page). */
export const CARTOUCHE = { w: 340, h: 88 }
/** Boîte « Comment » : barre de titre et marges autour des blocs (px de mise en page). */
export const COMMENT = { titre: 20, haut: 30, cote: 12, bas: 10 }

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
    // R19 : une décision sans prémisse reste dans la bande de son groupe (plus isolée en marge).
    if (n.type === 'choix_modelisation') marge[u] = 1
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
  const G = o.groupes
  const onglet = G.onglet !== null
  const special = (u: number) => u < nU && (G.fonction[u] || G.entree[u] || G.sortie[u])
  if (onglet) for (const u of topo) zone[u] = G.entree[u] ? 1 : G.sortie[u] ? 3 : 2

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
    if (marge[a.source] || marge[a.cible] || onglet || special(a.source) || special(a.cible)) continue
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
  const fontTitre = (gras: boolean) => `${gras ? 650 : 560} ${o.taillePolice}px ${o.police}`
  const boites: Boite[] = []
  const usagesPastille = new Map<number, number[]>()
  const W = o.largeurCarte
  for (let p = 0; p < nP; p++) {
    const n = noeudDe(p)
    const unite = p < nU ? g.unites[p]! : undefined
    const abandon = n.piste === 'abandonnee'
    let genre: GenreBoite = !unite ? 'masque' : n.type === 'choix_modelisation' ? 'drapeau' : n.type === 'decision' ? 'decision'
      : majeur(p) ? 'majeur' : unite.genre === 'etape' ? 'etape' : 'carte'
    if (unite && G.fonction[p]) genre = 'fonction'
    else if (unite && G.entree[p]) genre = 'entree'
    else if (unite && G.sortie[p]) genre = 'sortie'
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
    // La rangée tient dans la largeur du bloc : connecteurs de renvoi (32 px) puis bornes (15 px).
    const place = Math.max(0, Math.floor((o.largeurCarte - 16 - renvois.length * 32 - 18) / 15))
    const montrees = Math.min(pastilles.length, o.maxPastilles, place)
    const plus = pastilles.length - montrees
    if (genre === 'entree' || genre === 'sortie') pastilles.length = 0
    const rangeePastilles = pastilles.length || renvois.length ? 17 : 0
    let w = W, h: number, haut: number, bas: number, lignes: string[], impasse: Boite['impasse'] = null
    let specs: string[] = []
    let broches: Boite['broches'] = null
    const etiquette = etiquetteDe(n, unite?.genre === 'etape' ? unite.membres.length : 1, genre)
    if (genre === 'drapeau') {
      // Bloc de spécification : nom, puis l'hypothèse écrite comme une spécification.
      w = W
      lignes = couperLignes(n.nom, w - 16, fontTitre(true), 2)
      const tSpec = o.taillePolice - 2
      specs = n.choix?.hypothese ? couperLignes(`Hyp. : ${n.choix.hypothese}`, w - 16, `400 ${tSpec}px ${MONO}`, 4) : []
      h = 18 + lignes.length * (o.taillePolice + 3) + (specs.length ? 5 + specs.length * (tSpec + 3) : 0) + 6
      haut = h / 2
      bas = h / 2
    } else if (genre === 'decision') {
      lignes = couperLignes(n.nom, w - 6, fontTitre(true), 3)
      const alt = n.decision?.alternatives.filter((a) => !a.retenue) ?? []
      if (alt.length) impasse = { texte: alt[0]!.libelle, autres: alt.length - 1 }
      h = lignes.length * (o.taillePolice + 3) + 4 + 38
      haut = lignes.length * (o.taillePolice + 3) + 4 + 19
      bas = 19 + (impasse ? 30 : 4) + rangeePastilles
    } else if (genre === 'fonction') {
      // Nœud-fonction : en-tête, nom du groupe, rangées de broches (entrées puis sorties), pied.
      const gid = G.groupe[p] ?? ''
      lignes = couperLignes(G.nom(gid), w - 16, fontTitre(true), 2)
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
      const y0 = 16 + 4 + lignes.length * (o.taillePolice + 3) + 4
      h = y0 + (nIn + nOut) * 13 + (nIn && nOut ? 6 : 0) + 4 + 24
      haut = h / 2
      bas = h / 2 + (rangeePastilles ? rangeePastilles + 3 : 0)
      broches = {
        entrees: [],
        sorties: [...sorties].map(([noeud, aretes]) => ({ noeud, aretes, y: 0 })),
        y0: y0 - h / 2,
      }
    } else if (genre === 'entree' || genre === 'sortie') {
      // Rangée d'un nœud Entrée / Sortie d'onglet : une broche par énoncé extérieur.
      lignes = couperLignes(n.nom, w - 44, `500 ${o.taillePolice - 1.5}px ${o.police}`, 1)
      h = 17
      haut = h / 2
      bas = h / 2
    } else if (genre === 'masque') {
      lignes = couperLignes(n.nom, 150, `500 11px ${o.police}`, 1)
      w = 12
      h = 12
      haut = 6
      bas = 6
    } else {
      lignes = couperLignes(n.nom, w - 16, fontTitre(genre === 'majeur'), 4)
      h = 7 + 11 + 4 + lignes.length * (o.taillePolice + 3) + 6 + 4
      haut = h / 2
      bas = h / 2 + (rangeePastilles ? rangeePastilles + 3 : 0)
    }
    boites.push({ genre, w, h, haut, bas, lignes, etiquette, pastilles: pastilles.slice(0, montrees), plus, renvois, numero: 0, impasse, zone: zone[p]!, rang: rang[p]!, abandon, ref: '', specs, ports: [], groupe: p < nU ? G.groupe[p] ?? null : null, broches })
  }

  // 6. Rangées : couches avec nœuds fictifs pour les arêtes longues.
  // Bandes (R19) : un groupe par bande ; ordre des bandes qui minimise la longueur verticale des liaisons
  // entre bandes (essai de toutes les permutations jusqu'à 7 bandes), départagé par l'ordre du jeu.
  const cleBande = (u: number) => (onglet ? '·' : G.groupe[u] ?? '·')
  const idsBandes = [...new Set(topo.map(cleBande))]
  const rangJeu = (id: string) => {
    const k = G.ordre.indexOf(id)
    return k < 0 ? G.ordre.length : k
  }
  idsBandes.sort((a, b) => rangJeu(a) - rangJeu(b))
  if (idsBandes.length > 1 && idsBandes.length <= 7) {
    const liens: [number, number][] = []
    for (const a of g.aretes) {
      if (marge[a.source] || marge[a.cible] || renvoi[a.index]) continue
      const bs = idsBandes.indexOf(cleBande(a.source)), bc = idsBandes.indexOf(cleBande(a.cible))
      if (bs !== bc) liens.push([bs, bc])
    }
    const n = idsBandes.length
    let meilleure = [...Array(n).keys()], cout = Infinity
    const perm = [...Array(n).keys()]
    const essayer = () => {
      const pos = new Array<number>(n)
      perm.forEach((b, k) => (pos[b] = k))
      let c = 0
      for (const [x, y] of liens) c += Math.abs(pos[x]! - pos[y]!)
      // Départage : l'ordre du jeu (petite pénalité par déplacement).
      for (let k = 0; k < n; k++) c += Math.abs(pos[k]! - k) * 1e-3
      if (c < cout - 1e-9) {
        cout = c
        meilleure = [...perm]
      }
    }
    const echanger = (a: number, b: number) => {
      const t = perm[a]!
      perm[a] = perm[b]!
      perm[b] = t
    }
    const permuter = (k: number): void => {
      if (k === n) return essayer()
      for (let i = k; i < n; i++) {
        echanger(k, i)
        permuter(k + 1)
        echanger(k, i)
      }
    }
    permuter(0)
    const tri = meilleure.map((b) => idsBandes[b]!)
    idsBandes.splice(0, n, ...tri)
  }
  const bandeDe = new Int32Array(nU)
  for (const u of topo) bandeDe[u] = idsBandes.indexOf(cleBande(u))

  interface Element { id: number; point: number; arete: number; h: number; haut: number; bas: number; y: number; bande: number }
  const couches: Element[][] = Array.from({ length: nbRangs }, () => [])
  const elements: Element[] = []
  const nouvel = (point: number, arete: number, r: number) => {
    const b = point >= 0 ? boites[point]! : null
    const bande = point >= 0 ? bandeDe[point]! : bandeDe[g.aretes[arete]!.source]!
    const e: Element = { id: elements.length, point, arete, h: b ? b.h : 6, haut: b ? b.haut : 3, bas: b ? b.bas : 3, y: 0, bande }
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
    // Les bandes restent contiguës dans chaque rang.
    c.sort((a, b) => a.bande - b.bande)
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
      c.sort((a, b) => a.bande - b.bande || cle.get(a.id)! - cle.get(b.id)! || position[a.id]! - position[b.id]!)
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
  const broche = (e: Element) => e.point >= 0 && (boites[e.point]!.genre === 'entree' || boites[e.point]!.genre === 'sortie')
  const separation = (a: Element, b: Element) => a.bas + (a.point < 0 && b.point < 0 ? 4 : broche(a) && broche(b) ? 3 : gap) + b.haut
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
  // Chaque bande est placée seule (voisins de la même bande), puis les bandes sont empilées : leurs
  // boîtes « Comment » ne se chevauchent jamais.
  let curseur = 0
  for (let B = 0; B < idsBandes.length; B++) {
    const sous = couches.map((c) => c.filter((e) => e.bande === B))
    for (const c of sous) {
      let y = 0
      c.forEach((e, k) => {
        if (k) y += separation(c[k - 1]!, e)
        e.y = y
      })
    }
    for (let it = 0; it < 60; it++) {
      const ordre = it % 2 === 0 ? [...sous.keys()] : [...sous.keys()].reverse()
      for (const r of ordre) {
        const c = sous[r]!
        if (!c.length) continue
        const voulu = c.map((e, k) => {
          const v = [...pred[e.id]!, ...succ[e.id]!].filter((x) => elements[x]!.bande === B)
          // Les nœuds fictifs tirent fort : ils rendent les longues arêtes droites.
          if (v.length) return v.reduce((s, x) => s + yDe(x), 0) / v.length
          // Élément isolé dans la bande (décision sans liaison…) : collé à son voisin de colonne, sinon
          // il dériverait vers le bas d'une itération à l'autre.
          if (k > 0) return c[k - 1]!.y + separation(c[k - 1]!, e)
          return c.length > 1 ? c[1]!.y - separation(e, c[1]!) : e.y
        })
        placer(c, voulu)
      }
    }
    let haut = Infinity, bas = -Infinity
    for (const c of sous) for (const e of c) {
      haut = Math.min(haut, e.y - e.haut)
      bas = Math.max(bas, e.y + e.bas)
    }
    if (!Number.isFinite(haut)) continue
    const dy = curseur + COMMENT.haut - haut
    for (const c of sous) for (const e of c) e.y += dy
    curseur = bas + dy + COMMENT.bas + Math.max(18, gap * 1.4)
  }
  // Colonnes Entrée / Sortie d'un onglet : rangées jointives (un seul nœud), centrées sur leur moyenne.
  for (const c of couches) {
    if (!c.length || !c.every(broche)) continue
    const moyenne = c.reduce((t, e) => t + e.y, 0) / c.length
    let y = 0
    const ys0 = c.map((e, k) => (k ? (y += separation(c[k - 1]!, e)) : 0))
    const decalage = moyenne - ys0.reduce((t, v) => t + v, 0) / c.length
    c.forEach((e, k) => (e.y = ys0[k]! + decalage))
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
    const el: Element[] = itemsMarge.map((u) => ({ id: -1, point: u, arete: -1, h: boites[u]!.h, haut: boites[u]!.haut, bas: boites[u]!.bas, y: 0, bande: -1 }))
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

  // Repères de schéma, de gauche à droite puis de haut en bas : B (blocs), D (décisions), H (hypothèses
  // de modélisation, dans la marge). Un bloc cité par renvoi l'est par son repère.
  {
    const cpt = { B: 0, D: 0, H: 0 }
    const ordre = [...Array(nU).keys()].sort((a, b) => (boites[a]!.zone === 0 ? -1 : rang[a]!) - (boites[b]!.zone === 0 ? -1 : rang[b]!) || ys[a]! - ys[b]!)
    for (const p of ordre) {
      const b = boites[p]!
      const l = b.genre === 'drapeau' ? 'H' : b.genre === 'decision' ? 'D' : 'B'
      b.ref = `${l}${++cpt[l]}`
      b.numero = cpt[l]
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
  const portsSortie = new Map<number, number>()
  // Broches de sortie des nœuds-fonctions : triées par ordonnée moyenne des destinations.
  for (let p = 0; p < nU; p++) {
    const br = boites[p]!.broches
    if (!br) continue
    const yCible = (s: BrocheSortie) => s.aretes.reduce((t, e) => t + ys[g.aretes[e]!.cible]!, 0) / Math.max(1, s.aretes.length)
    br.sorties.sort((a, b) => yCible(a) - yCible(b))
    const nIn = g.entrantes[p]!.filter((e) => !marge[g.aretes[e]!.source]).length
    br.sorties.forEach((s, k) => {
      s.y = br.y0 + nIn * 13 + (nIn ? 6 : 0) + 6.5 + k * 13
      for (const e of s.aretes) portsSortie.set(e, s.y)
    })
  }
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
      if (b.broches) {
        // Nœud-fonction : une broche par liaison entrante, dans l'ordre des arrivées.
        const br = b.broches
        b.ports = l.map((_, k) => br.y0 + 6.5 + k * 13)
        br.entrees = l.map((e, k) => ({ arete: e.arete, source: g.aretes[e.arete]!.source, y: b.ports[k]! }))
        l.forEach((e, k) => yPort.set(e.arete, ys[c]! + b.ports[k]!))
        continue
      }
      if (b.genre === 'decision' || b.genre === 'sortie' || l.length === 1) {
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
    const stations: [number, number][] = [[xDroite(a.source), ys[a.source]! + (portsSortie.get(a.index) ?? 0)]]
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
      const cle = r.source * 1e4 + Math.round(pts[0]![1] * 10)
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

  // 11. Zones nommées.
  const zones: Zone[] = []
  const bord = o.ecartColonnes / 2
  const noms = onglet ? ['Entrée', 'Sous-graphe', 'Sortie'] : ['Outils', 'Étapes', 'Résultats']
  if (itemsMarge.length) zones.push({ nom: 'Spécifications', x0: xMarge - W / 2 - bord, x1: xMarge + W / 2 + bord })
  if (finOutils >= 0) zones.push({ nom: noms[0]!, x0: xRang(0) - W / 2 - bord, x1: xRang(finOutils) + W / 2 + bord })
  if (finEtapes >= finOutils + 1) zones.push({ nom: noms[1]!, x0: xRang(finOutils + 1) - W / 2 - bord, x1: xRang(finEtapes) + W / 2 + bord })
  if (finResultats >= finEtapes + 1) zones.push({ nom: noms[2]!, x0: xRang(finEtapes + 1) - W / 2 - bord, x1: xRang(finResultats) + W / 2 + bord })

  // Boîtes « Comment » : un groupe par sous-problème (en onglet, seulement le groupe ouvert).
  const groupes: GroupePage[] = []
  {
    const parId = new Map<string, number[]>()
    for (const u of topo) {
      const id = G.groupe[u]
      if (!id || G.entree[u] || G.sortie[u]) continue
      if (onglet && id !== G.onglet) continue
      let l = parId.get(id)
      if (!l) parId.set(id, (l = []))
      l.push(u)
    }
    const ordreIds = [...parId.keys()].sort((a, b) => rangJeu(a) - rangJeu(b))
    for (const id of ordreIds) {
      const points = parId.get(id)!
      groupes.push({ id, points, reduit: points.length === 1 && !!G.fonction[points[0]!] })
    }
  }

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
  // Feuille : règle et cotes au-dessus, cartouche sous le schéma dans le coin bas droit (jamais sur un bloc).
  const fx0 = bx0 - 46
  const fx1 = Math.max(bx1 + 34, fx0 + CARTOUCHE.w + 80)
  const fy0 = ymin - 100
  const fy1 = ymax + 30 + CARTOUCHE.h
  const page: MiseEnPage = {
    groupes, portsSortie, onglet,
    feuille: { x0: fx0, y0: fy0, x1: fx1, y1: fy1 },
    cartouche: { x0: fx1 - CARTOUCHE.w, y0: fy1 - CARTOUCHE.h, x1: fx1, y1: fy1 },
    boites, routes, zones, liensMarge, portees, usagesPastille, usagesRenvoi, echelle: ECHELLE, cx, cy,
    jonctions, xRangs: Array.from({ length: nbRangs }, (_, r) => xRang(r)), xMarge, largeurCarte: W,
    bornes: { x0: bx0, y0: ymin, x1: bx1, y1: ymax },
  }
  return { disposition, page }
}

/** Petite étiquette en capitales au-dessus du titre. */
function etiquetteDe(n: NoeudR, membres: number, genre: GenreBoite): string {
  if (n.piste === 'abandonnee' && genre !== 'decision') return membres > 1 ? `ABANDONNÉE · ${membres}` : 'ABANDONNÉE'
  const t = LIBELLES_TYPE[n.type].toUpperCase()
  if (genre === 'fonction') return `FONCTION · ${membres}`
  if (genre === 'etape') return `SOUS-SYST. × ${membres}`
  if (membres > 1) return `${t} · +${membres - 1}`
  return t
}
