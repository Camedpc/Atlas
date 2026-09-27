// R18 · Mise en page « Blueprint · équations » (reprise de R14 / R1) : colonnes = rangs logiques,
// liaisons orthogonales, repères B / D / H, ports répartis, jonctions. Ajouts R18 :
//
// - Blocs à la taille de leur contenu : en-tête coloré (repère, type, titre), corps = formules extraites
//   de l'énoncé (formules.ts) ou énoncé court, pied = jauge de confiance. La largeur grandit pour tenir la
//   formule (jusqu'à 2,2 × la largeur de base, puis coupure aux relations) ; chaque rang a la largeur de
//   son bloc le plus large, les blocs sont centrés dans leur colonne.
// - Point d'ancrage = milieu du corps (pas le centre du bloc) : ports d'entrée et de sortie y sont alignés,
//   donc une chaîne reste horizontale même si les en-têtes ont des hauteurs différentes.
// - Broches : chaque liaison entrante porte la grandeur physique transmise (symbole partagé par les
//   formules de la source et de la cible) ; sinon le rôle de la prémisse.
// - Boîtes de commentaire (sous-problèmes) : dans chaque rang, les éléments sont triés par sous-problème
//   (ordre du jeu) puis sous-problème imbriqué (« parent.enfant ») ; la séparation verticale réserve la
//   marge et la barre de titre des boîtes ; puis une passe de résolution descend une boîte entière quand
//   elle en chevauche une autre, et pousse sous une boîte imbriquée les blocs voisins qui y entreraient.
//
// Coordonnées de mise en page en px (y vers le bas), converties en monde (× 0,01) pour la vue :
//   X monde = x, Z monde = −y, Y monde = couche de type (3D).

import {
  coucheDe, dependantsDe, LIBELLES_TYPE, type Disposition, type GrapheLecture, type NoeudR, type RolePremisse,
  type SousProbleme,
} from '../../src/raisonnement'
import {
  composer, couperFormule, enonceCourt, formulesDuNoeud, grandeurPrincipale, grandeurTransmise, mesurerFormule,
  type Grandeur, type Morceau,
} from './formules'
import { natureDe } from './squelette'

export type GenreBoite = 'drapeau' | 'decision' | 'carte' | 'etape' | 'majeur' | 'masque'

export interface Pastille {
  /** Nœud de justification rattaché. */
  noeud: number
  lettre: string
  couche: number
}

/** Broche d'entrée : une liaison entrante. */
export interface Broche {
  /** Ordonnée relative au point d'ancrage. */
  y: number
  arete: number
  source: number
  grandeur: Grandeur | null
  symbole: string
  role: RolePremisse
}

export interface Boite {
  genre: GenreBoite
  /** Largeur et hauteur du corps complet (en-tête + corps + pied). */
  w: number
  h: number
  /** Distance du point d'ancrage (ports des arêtes) au haut et au bas de la boîte complète (bornes comprises). */
  haut: number
  bas: number
  /** Hauteur de l'en-tête coloré et du corps (px de mise en page). */
  hEnTete: number
  hCorps: number
  /** Titre (lignes). */
  lignes: string[]
  etiquette: string
  /** Formules composées (une entrée par ligne). */
  formules: Morceau[][]
  /** Formules brutes (texte), pour la fiche. */
  formulesTexte: string[]
  /** Énoncé court quand il n'y a pas de formule. */
  court: string[]
  /** Marge gauche du corps (colonne des symboles de broches). */
  retrait: number
  pastilles: Pastille[]
  /** Pastilles non montrées. */
  plus: number
  /** Renvois : prémisses lointaines citées par leur repère au lieu d'une longue flèche. */
  renvois: number[]
  numero: number
  /** Décision : alternative(s) rejetée(s). */
  impasse: { texte: string; autres: number } | null
  /** Zone : 0 marge (choix), 1 outils, 2 étapes, 3 résultats, −1 masqué. */
  zone: number
  rang: number
  abandon: boolean
  /** Repère de schéma : « B7 », « D2 », « H1 ». */
  ref: string
  /** Spécification (choix de modélisation) : lignes « Hyp. : … ». */
  specs: string[]
  /** Ordonnées relatives des ports d'entrée. */
  ports: number[]
  broches: Broche[]
  /** Grandeur de la sortie (membre de gauche de la première formule). */
  sortie: Grandeur | null
  /** Famille (couleur d'en-tête). */
  famille: Famille
  /** Sous-problème (identifiant complet) et boîte de premier niveau. */
  sousProbleme: string
  groupe: string
}

/** Police à chasse fixe des repères, cotes et spécifications. */
export const MONO = `'JetBrains Mono', ui-monospace, 'Cascadia Mono', 'SF Mono', Consolas, monospace`

// ─── Familles (couleur d'en-tête, comme les catégories de nœuds d'un Blueprint) ─

export type Famille = 'principe' | 'hypothese' | 'derivation' | 'resultat' | 'empirique' | 'calcul' | 'decision'

export const FAMILLES: Record<Famille, { nom: string; couleur: string; couleurSombre: string }> = {
  principe: { nom: 'Principes, définitions', couleur: '#566170', couleurSombre: '#7d8795' },
  hypothese: { nom: 'Hypothèses, modélisation, conjectures', couleur: '#236b70', couleurSombre: '#3f949a' },
  derivation: { nom: 'Lemmes, propositions', couleur: '#2b4f8c', couleurSombre: '#4f78c0' },
  resultat: { nom: 'Théorèmes, résultats', couleur: '#5a3a8e', couleurSombre: '#8a6bc0' },
  empirique: { nom: 'Expériences, observations', couleur: '#8f3b2c', couleurSombre: '#bf6a58' },
  calcul: { nom: 'Calculs machine', couleur: '#3c6a33', couleurSombre: '#66985b' },
  decision: { nom: 'Décisions', couleur: '#4a4a52', couleurSombre: '#808089' },
}

export function familleDe(n: NoeudR): Famille {
  switch (n.type) {
    case 'axiome': case 'definition': return 'principe'
    case 'hypothese': case 'choix_modelisation': case 'conjecture': return 'hypothese'
    case 'theoreme': case 'resultat': return n.admis ? 'principe' : 'resultat'
    case 'experience': case 'observation': return 'empirique'
    case 'calcul': return 'calcul'
    case 'decision': return 'decision'
    default: return n.admis ? 'principe' : 'derivation'
  }
}

// ─── Boîtes de commentaire ───────────────────────────────────────────────────

export interface Commentaire {
  id: string
  nom: string
  resume: string
  couleur: string
  /** 0 : sous-problème ; 1 : sous-problème imbriqué. */
  niveau: 0 | 1
  abandon: boolean
  /** Rectangle (px de mise en page). */
  x0: number
  y0: number
  x1: number
  y1: number
  /** Points membres (unités). */
  membres: number[]
}

/** Teintes des boîtes (sous-problèmes de premier niveau, dans l'ordre du jeu). */
export const TEINTES_COMMENTAIRES = ['#64748b', '#1d7a8c', '#a26a12', '#4f56b8', '#9a4a6b', '#3f7a3a', '#8a5a2b']
const TEINTE_ABANDON = '#8a8f97'
const TEINTE_SPEC = '#236b70'

/** Marges des boîtes (px de mise en page). */
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
  grandeur: Grandeur | null
  symbole: string
  role: RolePremisse
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
  /** Abscisses (px) des rangs logiques et de la marge des hypothèses ; largeurs des rangs. */
  xRangs: number[]
  largeursRangs: number[]
  xMarge: number
  largeurCarte: number
  echelle: number
  cx: number
  cy: number
  /** Contenu (blocs + boîtes). */
  bornes: { x0: number; y0: number; x1: number; y1: number }
  /** Grandeurs présentes sur les broches (légende). */
  grandeurs: Grandeur[]
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
  /** Formules affichées (au plus) par bloc. */
  maxFormules: number
  commentaires: boolean
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

// ─── Géométrie des blocs ─────────────────────────────────────────────────────

/** Taille des formules et hauteur de leurs lignes. */
export const tailleFormule = (taille: number) => taille + 1.5
export const interligneFormule = (taille: number) => tailleFormule(taille) * 1.55
export const tailleCourt = (taille: number) => taille - 1.5
export const PIED = 12
export const TAILLE_SYMBOLE = 10

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
    else if (n.type === 'decision' && parents[u]!.length === 0 && (!o.commentaires || enfants[u]!.every((v) => noeudDe(v).type === 'choix_modelisation'))) marge[u] = 1
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
  for (const u of topo) {
    if (toutMajeur[u]) zone[u] = 3
    else if (o.commentaires) zone[u] = 2
    else if (racine[u]) zone[u] = 1
    else {
      const ps = parentsPrincipaux(u)
      const outil = ps.length > 0 && ps.every((s) => racine[s]) && enfants[u]!.length >= 2 && noeudDe(u).type !== 'decision' && noeudDe(u).piste === 'active'
      zone[u] = outil ? 1 : 2
    }
  }

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
  if (o.commentaires) {
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

  // 4 ter. Formules et grandeurs transmises (liaison par liaison).
  const formules: string[][] = []
  for (let p = 0; p < nP; p++) formules.push(p < nU ? formulesDuNoeud(noeudDe(p), o.maxFormules) : [])
  const transmis = g.aretes.map((a) => {
    const t = grandeurTransmise(formules[a.source]!, formules[a.cible]!)
    let role: RolePremisse = 'contexte'
    for (const e of [...a.resume, ...a.transitives]) {
      const r = j.aretes[e]!.role
      if (r === 'principale' || (r === 'auxiliaire' && role !== 'principale') || (r === 'technique' && role === 'contexte')) role = r
    }
    return { grandeur: t?.g ?? null, symbole: t?.symbole ?? '', role }
  })
  // Liaisons entrantes dessinées (ni renvoi, ni vers la marge), par cible.
  const entreesDe: number[][] = g.unites.map(() => [])
  for (const a of g.aretes) if (!marge[a.cible] && !renvoi[a.index]) entreesDe[a.cible]!.push(a.index)

  // Sous-problèmes : ordre du jeu, parent (imbrication « a.b »).
  const ordreSP = new Map<string, number>()
  o.sousProblemes.forEach((s, k) => ordreSP.set(s.id, k))
  const spDe = (p: number) => noeudDe(p).sousProbleme
  const groupeDe = (p: number) => {
    let s = spDe(p)
    for (let q = parentDe(s); q; q = parentDe(s)) s = q
    return s
  }
  const sousGroupeDe = (p: number) => (parentDe(spDe(p)) ? spDe(p) : '')

  // 5. Boîtes (dimensions, texte, pastilles, broches).
  const T = o.taillePolice
  const fontTitre = (gras: boolean) => `${gras ? 650 : 600} ${T}px ${o.police}`
  const tF = tailleFormule(T)
  const ctxF = mesurer(`400 ${tF}px serif`)
  const boites: Boite[] = []
  const usagesPastille = new Map<number, number[]>()
  const W = o.largeurCarte
  const WMAX = W * 2.2
  for (let p = 0; p < nP; p++) {
    const n = noeudDe(p)
    const unite = p < nU ? g.unites[p]! : undefined
    const abandon = n.piste === 'abandonnee'
    const genre: GenreBoite = !unite ? 'masque' : n.type === 'choix_modelisation' ? 'drapeau' : n.type === 'decision' ? 'decision'
      : majeur(p) ? 'majeur' : unite.genre === 'etape' ? 'etape' : 'carte'
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
    const etiquette = etiquetteDe(n, unite?.genre === 'etape' ? unite.membres.length : 1, genre)
    const fs = formules[p]!
    // Broches : grandeur transmise et symbole ; largeur de la colonne des symboles.
    const entrees = p < nU ? entreesDe[p]! : []
    let retrait = 8
    if (genre !== 'decision' && genre !== 'masque' && entrees.length) {
      let wSym = 0
      for (const e of entrees) {
        const s = transmis[e]!.symbole
        if (s) wSym = Math.max(wSym, mesurerFormule(ctxF, composer(s), TAILLE_SYMBOLE))
      }
      retrait = 10 + (wSym ? wSym + 6 : 0)
    }
    // Largeur : base, ou ce qu'il faut pour la formule la plus large (bornée).
    let wNat = 0
    for (const f of fs) wNat = Math.max(wNat, mesurerFormule(ctxF, composer(f), tF))
    let w = W
    if (genre !== 'decision' && genre !== 'masque' && wNat) w = Math.min(WMAX, Math.max(W, Math.ceil(retrait + wNat + 12)))
    const lignesFormules: Morceau[][] = []
    for (const f of fs) for (const l of couperFormule(ctxF, f, tF, w - retrait - 10)) if (lignesFormules.length < 4) lignesFormules.push(l)
    const rangeePastilles = pastilles.length || renvois.length ? 17 : 0
    const place = Math.max(0, Math.floor((w - 16 - renvois.length * 32 - 18) / 15))
    const montrees = Math.min(pastilles.length, o.maxPastilles, place)
    const plus = pastilles.length - montrees
    let h: number, haut: number, bas: number, lignes: string[], impasse: Boite['impasse'] = null
    let hEnTete = 0, hCorps = 0
    let specs: string[] = []
    let court: string[] = []
    if (genre === 'drapeau') {
      lignes = couperLignes(n.nom, w - 16, fontTitre(true), 2)
      hEnTete = 16 + lignes.length * (T + 2) + 4
      const tSpec = T - 2
      specs = n.choix?.hypothese && !fs.length ? couperLignes(`Hyp. : ${n.choix.hypothese}`, w - 16, `400 ${tSpec}px ${MONO}`, 3) : []
      if (n.choix?.hypothese && fs.length) specs = couperLignes(`Hyp. : ${n.choix.hypothese}`, w - 16, `400 ${tSpec}px ${MONO}`, 2)
      hCorps = 6 + lignesFormules.length * interligneFormule(T) + (specs.length ? 4 + specs.length * (tSpec + 3) : 0) + 4
      h = hEnTete + hCorps
      haut = h / 2
      bas = h / 2
    } else if (genre === 'decision') {
      lignes = couperLignes(n.nom, w - 6, fontTitre(true), 3)
      const alt = n.decision?.alternatives.filter((a) => !a.retenue) ?? []
      if (alt.length) impasse = { texte: alt[0]!.libelle, autres: alt.length - 1 }
      h = lignes.length * (T + 3) + 4 + 38
      haut = lignes.length * (T + 3) + 4 + 19
      bas = 19 + (impasse ? 30 : 4) + rangeePastilles
    } else if (genre === 'masque') {
      lignes = couperLignes(n.nom, 150, `500 11px ${o.police}`, 1)
      w = 12
      h = 12
      haut = 6
      bas = 6
    } else {
      lignes = couperLignes(n.nom, w - 14, fontTitre(genre === 'majeur'), 2)
      hEnTete = 16 + lignes.length * (T + 2) + 4
      if (!lignesFormules.length) court = couperLignes(enonceCourt(n), w - retrait - 8, `italic 400 ${tailleCourt(T)}px ${o.police}`, 3)
      const contenu = lignesFormules.length
        ? lignesFormules.length * interligneFormule(T) + 6
        : court.length * (tailleCourt(T) + 3.5) + 9
      hCorps = Math.max(contenu, entrees.length * 13 + 8, 22)
      h = hEnTete + hCorps + PIED
      // Ancrage au milieu du corps : ports et sortie alignés d'un bloc à l'autre.
      haut = hEnTete + hCorps / 2
      bas = hCorps / 2 + PIED + (rangeePastilles ? rangeePastilles + 3 : 0)
    }
    boites.push({
      genre, w, h, haut, bas, hEnTete, hCorps, lignes, etiquette, formules: lignesFormules, formulesTexte: fs, court, retrait,
      pastilles: pastilles.slice(0, montrees), plus, renvois, numero: 0, impasse, zone: zone[p]!, rang: rang[p]!, abandon,
      ref: '', specs, ports: [], broches: [], sortie: grandeurPrincipale(fs), famille: familleDe(n),
      sousProbleme: p < nU ? spDe(p) : '', groupe: p < nU ? groupeDe(p) : '',
    })
  }

  // Largeur des rangs et abscisses (blocs centrés dans leur colonne).
  const largeurRang = new Float64Array(Math.max(1, nbRangs)).fill(W)
  for (let u = 0; u < nU; u++) if (!marge[u] && rang[u]! >= 0) largeurRang[rang[u]!] = Math.max(largeurRang[rang[u]!]!, boites[u]!.genre === 'decision' ? 60 : boites[u]!.w)
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
  const actifsBoites = o.commentaires
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

  // Repères : B (blocs), D (décisions), H (hypothèses de modélisation), de gauche à droite puis de haut en bas.
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

  // 10. Routes orthogonales : bord du bloc → bord de sa colonne → canal (piste verticale) → … → bord de
  //     la colonne cible → port du bloc.
  const demi = (p: number) => (boites[p]!.genre === 'decision' ? 19 : boites[p]!.w / 2)
  interface Segment { route: Route; i: number; xa: number; ya: number; xb: number; yb: number; cle: string }
  const routes: Route[] = []
  const parCanal = new Map<number, Segment[]>()
  const yPort = new Map<number, number>()
  {
    const entrees = new Map<number, { arete: number; y: number }[]>()
    for (const a of g.aretes) {
      if (marge[a.cible] || renvoi[a.index]) continue
      const ch = chemins.get(a.index)
      const avant = ch && ch.length ? ch[ch.length - 1]![1] : ys[a.source]!
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
      } else {
        // Dans le corps, réparties autour de l'ancrage ; pas maximal de 13 px.
        const utile = b.hCorps - 10
        const pasPort = Math.min(13, utile / Math.max(1, l.length - 1))
        b.ports = l.map((_, k) => (k - (l.length - 1) / 2) * pasPort)
        l.forEach((e, k) => yPort.set(e.arete, ys[c]! + b.ports[k]!))
      }
      b.broches = l.map((e, k) => {
        const a = g.aretes[e.arete]!
        const t = transmis[e.arete]!
        return { y: b.ports[k] ?? 0, arete: e.arete, source: a.source, grandeur: t.grandeur, symbole: t.symbole, role: t.role }
      })
    }
  }
  for (const a of g.aretes) {
    if (marge[a.cible] || renvoi[a.index]) continue
    const abandon = noeudDe(a.source).piste === 'abandonnee' || noeudDe(a.cible).piste === 'abandonnee'
    const t = transmis[a.index]!
    const route: Route = { arete: a.index, source: a.source, cible: a.cible, points: [], abandon, grandeur: t.grandeur, symbole: t.symbole, role: t.role }
    const stations: [number, number][] = [[colDroite(a.source), ys[a.source]!]]
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

  // 11. Zones nommées (cotes sous la règle).
  const zones: Zone[] = []
  const bord = o.ecartColonnes / 2
  const bordRang = (r: number, cote: -1 | 1) => xRang(r) + (cote * largeurRang[r]!) / 2
  if (itemsMarge.length) zones.push({ nom: 'Spécifications', x0: xMarge - largeurMarge / 2 - bord, x1: xMarge + largeurMarge / 2 + bord })
  if (finOutils >= 0) zones.push({ nom: 'Outils', x0: bordRang(0, -1) - bord, x1: bordRang(finOutils, 1) + bord })
  if (finEtapes >= finOutils + 1) zones.push({ nom: 'Étapes', x0: bordRang(finOutils + 1, -1) - bord, x1: bordRang(finEtapes, 1) + bord })
  if (finResultats >= finEtapes + 1) zones.push({ nom: 'Résultats', x0: bordRang(finEtapes + 1, -1) - bord, x1: bordRang(finResultats, 1) + bord })

  // 12. Boîtes de commentaire (positions finales).
  const commentaires: Commentaire[] = []
  if (actifsBoites) {
    const rectPoint = (p: number): Rect => {
      const b = boites[p]!
      const l = b.genre === 'decision' ? Math.max(24, b.w / 2) : b.w / 2
      return { x0: xs[p]! - l, y0: ys[p]! - b.haut, x1: xs[p]! + l, y1: ys[p]! + b.bas }
    }
    const spParId = new Map(o.sousProblemes.map((s) => [s.id, s]))
    const parBoite = new Map<string, number[]>()
    for (let u = 0; u < nU; u++) {
      if (marge[u]) continue
      const k = boites[u]!.groupe
      let l = parBoite.get(k)
      if (!l) parBoite.set(k, (l = []))
      l.push(u)
    }
    const teinte = new Map<string, string>()
    let k = 0
    for (const s of o.sousProblemes) if (!parentDe(s.id)) teinte.set(s.id, TEINTES_COMMENTAIRES[k++ % TEINTES_COMMENTAIRES.length]!)
    for (const [gid, pts] of parBoite) {
      const sp = spParId.get(gid)
      const abandon = !!sp?.abandonne || pts.every((p) => boites[p]!.abandon)
      const couleur = abandon ? TEINTE_ABANDON : teinte.get(gid) ?? TEINTES_COMMENTAIRES[0]!
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
          x0: rs!.x0 - B.padS, y0: rs!.y0 - B.padS - B.titreS, x1: rs!.x1 + B.padS, y1: rs!.y1 + B.padS, membres: sp2,
        }
        commentaires.push(c)
        r = union(r, c)
      }
      commentaires.push({
        id: gid, nom: sp?.nom ?? gid, resume: sp?.resume ?? '', couleur, niveau: 0, abandon,
        x0: r!.x0 - B.pad, y0: r!.y0 - B.pad - B.titre, x1: r!.x1 + B.pad, y1: r!.y1 + B.pad, membres: pts,
      })
    }
    if (itemsMarge.length) {
      let r: Rect | null = null
      for (const p of itemsMarge) r = union(r, rectPoint(p))
      commentaires.push({
        id: '§spec', nom: 'Spécifications · modélisation', resume: 'Choix de modélisation et décisions qui les fixent.', couleur: TEINTE_SPEC,
        niveau: 0, abandon: false, x0: r!.x0 - B.pad, y0: r!.y0 - B.pad - B.titre, x1: r!.x1 + B.pad, y1: r!.y1 + B.pad, membres: [...itemsMarge],
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
  const grandeurs = new Map<string, Grandeur>()
  for (const r of routes) if (r.grandeur) grandeurs.set(r.grandeur.id, r.grandeur)
  const disposition: Disposition = {
    moteur: 'dagre', nU, masques, x, z, yCouche, couche, rang,
    xRangs: xRangs.map((xr) => (xr - cx) * ECHELLE),
    xContexte: masques.length ? (xMasques - cx) * ECHELLE : NaN,
    bornes: { xmin: wx0, xmax: wx1, zmin: wz0, zmax: wz1 },
  }
  const page: MiseEnPage = {
    boites, routes, zones, commentaires, liensMarge, portees, usagesPastille, usagesRenvoi, echelle: ECHELLE, cx, cy,
    jonctions, xRangs, largeursRangs: [...largeurRang], xMarge, largeurCarte: W,
    bornes: { x0: bx0, y0: ymin, x1: bx1, y1: ymax },
    grandeurs: [...grandeurs.values()].sort((a, b) => a.priorite - b.priorite),
  }
  return { disposition, page }
}

/** Petite étiquette en capitales (en-tête). */
function etiquetteDe(n: NoeudR, membres: number, genre: GenreBoite): string {
  if (n.piste === 'abandonnee' && genre !== 'decision') return membres > 1 ? `ABANDONNÉE · ${membres}` : 'ABANDONNÉE'
  const t = LIBELLES_TYPE[n.type].toUpperCase()
  if (genre === 'etape') return `SOUS-SYST. × ${membres}`
  if (membres > 1) return `${t} · +${membres - 1}`
  return t
}
