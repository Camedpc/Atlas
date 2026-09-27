// Modèle de la vue du graphe (pur, sans DOM) : cases de la base → pixels, numérotation « Lemme 7 » / « Hypothèse (ii) »,
// cadres imbriqués (rectangles englobants), cadres réduits en nœuds-fonctions (R19) et liaisons orthogonales.
//
// Les positions viennent de /api/vue (colonne, ligne) : rien n'est mis en page ici, sauf les nœuds jamais placés,
// rangés provisoirement sous le reste (la première opération « placer » les inscrit en base).
//
// Une figure (graphique ou image, « fig:<id> ») est un bloc comme un autre pour la grille (sélection, glisser, cadres,
// annuler) : `figure` est renseigné, et `noeud` n'en est qu'un tenant-lieu (nom = titre, sans statut ni démonstration).
// Un document (fichier ou dossier du projet, « doc:<id> ») aussi, sur une case : `document` est renseigné. Ses liens
// nommés (« produit », « implémente »…) sont routés comme les prémisses, mais portent leur `relation`.

import type { DocumentVue, FigureVue, Graphe, GroupeVue, Noeud, RelationDocument, TypeNoeud, Validite, Vue } from './api'

/** Pas de la grille et taille d'un bloc 1 × 1 (px de mise en page) ; l'écart sert aux liaisons et aux cadres. */
export const GRILLE = { pasX: 280, pasY: 170, blocL: 236, blocH: 124 }
export const ECART_X = GRILLE.pasX - GRILLE.blocL
export const ECART_Y = GRILLE.pasY - GRILLE.blocH
/** Cadre : marge autour de ses nœuds et hauteur de la barre de titre. */
export const CADRE = { marge: 12, titre: 22 }
/** Teintes des cadres de R18 (sans couleur en base : par ordre des cadres de premier niveau). */
export const TEINTES = ['#64748b', '#1d7a8c', '#a26a12', '#4f56b8', '#9a4a6b', '#3f7a3a', '#8a5a2b']
export const TEINTE_ABANDON = '#8a8f97'
/** Nœud-fonction : en-tête, rangée de broche, pied (px de mise en page). */
export const FONCTION = { tete: 46, rangee: 17, separation: 6, pied: 24 }

export const LIBELLES_TYPE: Record<TypeNoeud, string> = {
  hypothese: 'Hypothèse',
  definition: 'Définition',
  axiome: 'Axiome',
  choix_modelisation: 'Hypothèse',
  decision: 'Décision',
  lemme: 'Lemme',
  proposition: 'Proposition',
  theoreme: 'Théorème',
  assertion: 'Assertion',
  experience: 'Expérience',
  calcul: 'Calcul',
  observation: 'Observation',
  resultat: 'Résultat',
  conjecture: 'Conjecture',
}

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface Bloc {
  id: string
  noeud: Noeud
  colonne: number
  ligne: number
  largeur: number
  hauteur: number
  /** Coin haut gauche et taille (px de mise en page). */
  x: number
  y: number
  w: number
  h: number
  groupe: string | null
  fixe: boolean
  /** Placé en base (sinon rangé provisoirement sous le reste). */
  place: boolean
  /** « 7 » ou « (ii) » : numérotation stable, dans l'ordre des cases. */
  numero: string
  /** « Lemme », « Hypothèse »… */
  libelle: string
  /** Hypothèse ou choix de modélisation : présentée comme dans R37. */
  hypothese: boolean
  /** Théorème ou résultat démontré : double cadre. */
  majeur: boolean
  /** Cadre réduit (le plus extérieur) qui masque le bloc, sinon null. */
  cache: string | null
  /** Prémisses techniques ou de contexte : renvois « cf. 7 » sous le bloc. */
  renvois: string[]
  /** Meilleure démonstration : validité et confiance (null si aucune). */
  validite: Validite | null
  confiance: number | null
  /** Hypothèse : énoncés qui en dépendent (transitivement). */
  portee: Set<string> | null
  /** Bloc d'une figure (sinon null) ; son `numero` est celui de la figure (« Figure 2 »). */
  figure: FigureVue | null
  /** Bloc d'un document (sinon null) ; `libelle` dit sa nature (« Script », « Dossier »), numérotée à part. */
  document: DocumentVue | null
}

export interface Broche {
  /** Représentant (entrée) ou nœud membre (sortie). */
  id: string
  y: number
}

export interface Fonction {
  x: number
  y: number
  w: number
  h: number
  entrees: Broche[]
  sorties: Broche[]
  /** Broches qui n'ont pas trouvé de place. */
  plus: number
  /** Ordonnée du filet sous l'en-tête et du pied. */
  yBroches: number
  yPied: number
}

export interface Cadre {
  id: string
  nom: string
  parent: string | null
  genre: GroupeVue['genre']
  teinte: string
  replie: boolean
  ordre: number
  profondeur: number
  /** « §1.2 ». */
  numero: string
  /** Cases englobées [c0, l0, c1, l1] ; null si le cadre est vide. */
  cases: [number, number, number, number] | null
  /** Rectangle dessiné (barre de titre comprise) ; null si le cadre est vide, réduit ou masqué. */
  rect: Rect | null
  /** Cadre réduit (le plus extérieur, hors lui-même) qui le masque. */
  cache: string | null
  /** Nœuds du cadre et de ses sous-cadres. */
  enonces: number
  /** Cadre réduit et visible : son nœud-fonction. */
  fonction: Fonction | null
}

export interface Lien {
  /** Représentants (id de bloc, ou « cadre:<id> » pour un nœud-fonction). */
  de: string
  vers: string
  role: 'principale' | 'auxiliaire'
  validite: Validite
  /** Lien de document (gris, nommé) ; absent pour une prémisse. */
  relation?: RelationDocument
  /** Polyligne orthogonale x0, y0, x1, y1… */
  points: number[]
  bbox: Rect
}

export interface Modele {
  blocs: Map<string, Bloc>
  cadres: Map<string, Cadre>
  /** Parents avant enfants (ordre de dessin). */
  cadresOrdonnes: Cadre[]
  liens: Lien[]
  /** Représentant visible d'un nœud : lui-même, ou « cadre:<id> » s'il est dans un cadre réduit. */
  representant: Map<string, string>
  bornes: Rect
  nonPlaces: number
}

/** Déplacement provisoire (glisser) : case et cadre d'un nœud. */
export interface Surcharge {
  colonne: number
  ligne: number
  groupe: string | null
}

export const CLE_FONCTION = 'cadre:'
/** Préfixe des figures dans les placements et les opérations de vue. */
export const PREFIXE_FIGURE = 'fig:'
/** Taille par défaut d'une figure (cases), et ses formats possibles (atlas/vue.py, FORMATS_FIGURE). */
export const TAILLE_FIGURE = { largeur: 2, hauteur: 2 }
export const FORMATS_FIGURE: [number, number][] = [[1, 1], [2, 1], [1, 2], [2, 2]]
/** Préfixe des documents (fichiers et dossiers du projet) ; un document occupe une case. */
export const PREFIXE_DOCUMENT = 'doc:'
/** Nature d'un document → mot de sa tête (atlas/documents.py, NATURES). */
export const LIBELLES_NATURE: Record<string, string> = {
  script: 'Script', donnees: 'Données', document: 'Document', image: 'Image', fichier: 'Fichier', dossier: 'Dossier',
}
/** Libellé d'une relation de document, écrit sur son lien. */
export const LIBELLES_RELATION: Record<RelationDocument, string> = {
  source: 'source', implemente: 'implémente', produit: 'produit', ecrit_dans: 'écrit dans', entree: 'entrée',
}

/** Figure ou document : un bloc de la grille qui n'est pas un nœud du raisonnement. */
export function estPseudo(b: Bloc | undefined): boolean {
  return !!b && (!!b.figure || !!b.document)
}

export function natureDocument(d: DocumentVue): string {
  return d.genre === 'dossier' ? 'dossier' : d.apercu.nature ?? 'fichier'
}

const romains = (n: number) => {
  const t: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'],
    [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]
  let r = ''
  for (const [v, s] of t) {
    while (n >= v) {
      r += s
      n -= v
    }
  }
  return r
}

const RANG_VALIDITE: Record<Validite, number> = { valide: 2, a_verifier: 1, invalide: 0 }
const FORCE_ROLE = { principale: 3, auxiliaire: 2, technique: 1, contexte: 0 } as const

export function estHypothese(n: Noeud): boolean {
  return n.type === 'hypothese' || n.type === 'choix_modelisation'
}

/** Construit le modèle ; `surcharges` déplace provisoirement des nœuds (sans changer la numérotation). */
export function construireModele(graphe: Graphe, vue: Vue, surcharges?: Map<string, Surcharge>): Modele {
  const { pasX, pasY, blocL, blocH } = GRILLE
  const noeuds = new Map(graphe.noeuds.map((n) => [n.id, n]))
  const figures = new Map((vue.figures ?? []).map((f) => [PREFIXE_FIGURE + f.id, f]))
  const documents = new Map((vue.documents ?? []).map((d) => [PREFIXE_DOCUMENT + d.id, d]))
  const connu = (id: string) => noeuds.has(id) || figures.has(id) || documents.has(id)
  const placements = new Map(vue.placements.filter((p) => connu(p.noeud_id)).map((p) => [p.noeud_id, p]))

  // Nœuds jamais placés : sous tout le reste, sur autant de colonnes que la vue (6 au moins).
  let maxC = -1, maxL = -1
  for (const p of placements.values()) {
    maxC = Math.max(maxC, p.colonne + p.largeur - 1)
    maxL = Math.max(maxL, p.ligne + p.hauteur - 1)
  }
  const nonPlaces = graphe.noeuds.filter((n) => !placements.has(n.id)).map((n) => n.id).sort()
  const colonnes = Math.max(6, maxC + 1)
  const provisoire = new Map(nonPlaces.map((id, k) => [id, { colonne: k % colonnes, ligne: maxL + 2 + Math.floor(k / colonnes) }]))
  // Figures jamais placées : encore dessous, côte à côte (2 × 2 cases chacune).
  const figuresNonPlacees = [...figures.keys()].filter((id) => !placements.has(id)).sort()
  const ligneFigures = maxL + 2 + Math.ceil(nonPlaces.length / colonnes) + (nonPlaces.length ? 1 : 0)
  const parRangee = Math.max(1, Math.floor(colonnes / TAILLE_FIGURE.largeur))
  figuresNonPlacees.forEach((id, k) => provisoire.set(id, {
    colonne: (k % parRangee) * TAILLE_FIGURE.largeur,
    ligne: ligneFigures + Math.floor(k / parRangee) * TAILLE_FIGURE.hauteur,
  }))
  // Documents jamais placés : sous les figures, une case chacun.
  const documentsNonPlaces = [...documents.keys()].filter((id) => !placements.has(id)).sort()
  const ligneDocuments = ligneFigures + Math.ceil(figuresNonPlacees.length / parRangee) * TAILLE_FIGURE.hauteur
    + (figuresNonPlacees.length ? 1 : 0)
  documentsNonPlaces.forEach((id, k) => provisoire.set(id, { colonne: k % colonnes, ligne: ligneDocuments + Math.floor(k / colonnes) }))

  // Numérotation stable : ordre des cases en base (colonne, ligne), puis les non placés ; les hypothèses à part.
  const ordre = graphe.noeuds.map((n) => {
    const p = placements.get(n.id) ?? provisoire.get(n.id)!
    return { n, c: p.colonne, l: p.ligne }
  })
  ordre.sort((a, b) => a.c - b.c || a.l - b.l || (a.n.id < b.n.id ? -1 : 1))
  const numeros = new Map<string, string>()
  let k = 0, h = 0
  for (const { n } of ordre) numeros.set(n.id, estHypothese(n) ? `(${romains(++h)})` : String(++k))

  // Cadres : profondeur, parents d'abord.
  const groupes = new Map(vue.groupes.map((g) => [g.id, g]))
  const parentDe = (g: GroupeVue) => (g.parent_id && groupes.has(g.parent_id) ? g.parent_id : null)
  const profondeur = (id: string) => {
    let d = 0
    for (let g = groupes.get(id); g && parentDe(g) && d < 50; g = groupes.get(parentDe(g)!)) d++
    return d
  }
  /** Cadre réduit le plus extérieur parmi `id` et ses ancêtres. */
  const reduitExterieur = (id: string | null) => {
    let r: string | null = null
    for (let g = id ? groupes.get(id) : undefined, d = 0; g && d < 50; g = parentDe(g) ? groupes.get(parentDe(g)!) : undefined, d++) {
      if (g.replie) r = g.id
    }
    return r
  }

  // Blocs.
  const blocs = new Map<string, Bloc>()
  for (const n of graphe.noeuds) {
    const p = placements.get(n.id)
    const s = surcharges?.get(n.id)
    const base = p ?? { colonne: provisoire.get(n.id)!.colonne, ligne: provisoire.get(n.id)!.ligne, largeur: 1, hauteur: 1, groupe_id: null, fixe: false }
    const colonne = s?.colonne ?? base.colonne
    const ligne = s?.ligne ?? base.ligne
    const groupe = s ? s.groupe : base.groupe_id && groupes.has(base.groupe_id) ? base.groupe_id : null
    const meilleure = [...n.demonstrations].sort(
      (a, b) => RANG_VALIDITE[b.validite] - RANG_VALIDITE[a.validite] || (b.confiance ?? -1) - (a.confiance ?? -1),
    )[0]
    blocs.set(n.id, {
      id: n.id,
      noeud: n,
      colonne,
      ligne,
      largeur: base.largeur,
      hauteur: base.hauteur,
      x: colonne * pasX,
      y: ligne * pasY,
      w: base.largeur * pasX - (pasX - blocL),
      h: base.hauteur * pasY - (pasY - blocH),
      groupe,
      fixe: base.fixe,
      place: !!p,
      numero: numeros.get(n.id)!,
      libelle: n.type ? LIBELLES_TYPE[n.type] : n.admis ? 'Fait admis' : 'Énoncé',
      hypothese: estHypothese(n),
      majeur: (n.type === 'theoreme' || n.type === 'resultat') && !n.admis,
      cache: reduitExterieur(groupe),
      renvois: [],
      validite: meilleure?.validite ?? null,
      confiance: meilleure?.confiance ?? null,
      portee: null,
      figure: null,
      document: null,
    })
  }

  // Figures : numérotées à part (« Figure 2 »), dans l'ordre des cases.
  const ordreFigures = [...figures.keys()].map((id) => ({ id, p: placements.get(id) ?? provisoire.get(id)! }))
  ordreFigures.sort((a, b) => a.p.colonne - b.p.colonne || a.p.ligne - b.p.ligne || (a.id < b.id ? -1 : 1))
  ordreFigures.forEach(({ id }, k) => {
    const f = figures.get(id)!
    const p = placements.get(id)
    const s = surcharges?.get(id)
    const base = p ?? { ...provisoire.get(id)!, ...TAILLE_FIGURE, groupe_id: null, fixe: false }
    const colonne = s?.colonne ?? base.colonne
    const ligne = s?.ligne ?? base.ligne
    const groupe = s ? s.groupe : base.groupe_id && groupes.has(base.groupe_id) ? base.groupe_id : null
    blocs.set(id, {
      id,
      noeud: tenantLieu(id, f),
      colonne,
      ligne,
      largeur: base.largeur,
      hauteur: base.hauteur,
      x: colonne * pasX,
      y: ligne * pasY,
      w: base.largeur * pasX - (pasX - blocL),
      h: base.hauteur * pasY - (pasY - blocH),
      groupe,
      fixe: base.fixe,
      place: !!p,
      numero: String(k + 1),
      libelle: 'Figure',
      hypothese: false,
      majeur: false,
      cache: reduitExterieur(groupe),
      renvois: [],
      validite: null,
      confiance: null,
      portee: null,
      figure: f,
      document: null,
    })
  })

  // Documents : numérotés par nature (« Script 1 », « Dossier 2 »), dans l'ordre des cases.
  const ordreDocuments = [...documents.keys()].map((id) => ({ id, p: placements.get(id) ?? provisoire.get(id)! }))
  ordreDocuments.sort((a, b) => a.p.colonne - b.p.colonne || a.p.ligne - b.p.ligne || (a.id < b.id ? -1 : 1))
  const compteurs = new Map<string, number>()
  for (const { id } of ordreDocuments) {
    const d = documents.get(id)!
    const p = placements.get(id)
    const s = surcharges?.get(id)
    const base = p ?? { ...provisoire.get(id)!, largeur: 1, hauteur: 1, groupe_id: null, fixe: false }
    const colonne = s?.colonne ?? base.colonne
    const ligne = s?.ligne ?? base.ligne
    const groupe = s ? s.groupe : base.groupe_id && groupes.has(base.groupe_id) ? base.groupe_id : null
    const libelle = LIBELLES_NATURE[natureDocument(d)] ?? 'Fichier'
    const n = (compteurs.get(libelle) ?? 0) + 1
    compteurs.set(libelle, n)
    blocs.set(id, {
      id,
      noeud: tenantLieuDocument(id, d),
      colonne,
      ligne,
      largeur: 1,
      hauteur: 1,
      x: colonne * pasX,
      y: ligne * pasY,
      w: blocL,
      h: blocH,
      groupe,
      fixe: base.fixe,
      place: !!p,
      numero: String(n),
      libelle,
      hypothese: false,
      majeur: false,
      cache: reduitExterieur(groupe),
      renvois: [],
      validite: null,
      confiance: null,
      portee: null,
      figure: null,
      document: d,
    })
  }

  // Portée des hypothèses : tout ce qui en dépend.
  for (const b of blocs.values()) {
    if (!b.hypothese) continue
    const vus = new Set<string>()
    const pile = [...b.noeud.enfants]
    while (pile.length) {
      const id = pile.pop()!
      if (vus.has(id) || !noeuds.has(id)) continue
      vus.add(id)
      pile.push(...noeuds.get(id)!.enfants)
    }
    b.portee = vus
  }

  // Cadres : cases englobées (comme atlas/vue.py : nœuds du cadre et de ses sous-cadres).
  const cadres = new Map<string, Cadre>()
  for (const g of vue.groupes) {
    cadres.set(g.id, {
      id: g.id,
      nom: g.nom,
      parent: parentDe(g),
      genre: g.genre,
      teinte: '',
      replie: g.replie,
      ordre: g.ordre,
      profondeur: profondeur(g.id),
      numero: '',
      cases: null,
      rect: null,
      cache: reduitExterieur(parentDe(g)),
      enonces: 0,
      fonction: null,
    })
  }
  for (const b of blocs.values()) {
    for (let id = b.groupe, d = 0; id && d < 50; id = cadres.get(id)?.parent ?? null, d++) {
      const c = cadres.get(id)
      if (!c) break
      if (!estPseudo(b)) c.enonces++
      const r: [number, number, number, number] = [b.colonne, b.ligne, b.colonne + b.largeur - 1, b.ligne + b.hauteur - 1]
      c.cases = c.cases
        ? [Math.min(c.cases[0], r[0]), Math.min(c.cases[1], r[1]), Math.max(c.cases[2], r[2]), Math.max(c.cases[3], r[3])]
        : r
    }
  }
  // Numéros « §1.2 » et teintes, dans l'ordre de lecture (colonne, ligne) à chaque niveau.
  const enfants = (parent: string | null) =>
    [...cadres.values()]
      .filter((c) => c.parent === parent)
      .sort((a, b) => (a.cases?.[0] ?? 1e9) - (b.cases?.[0] ?? 1e9) || (a.cases?.[1] ?? 1e9) - (b.cases?.[1] ?? 1e9) || a.ordre - b.ordre || (a.id < b.id ? -1 : 1))
  const cadresOrdonnes: Cadre[] = []
  const parcourir = (parent: Cadre | null) => {
    enfants(parent?.id ?? null).forEach((c, i) => {
      c.numero = parent ? `${parent.numero}.${i + 1}` : `§${i + 1}`
      const couleur = groupes.get(c.id)!.couleur
      c.teinte = couleur ?? (c.genre === 'piste_abandonnee' ? TEINTE_ABANDON : parent ? parent.teinte : TEINTES[i % TEINTES.length]!)
      cadresOrdonnes.push(c)
      parcourir(c)
    })
  }
  parcourir(null)

  // Représentants : un nœud d'un cadre réduit est remplacé par le nœud-fonction du cadre réduit le plus extérieur.
  const representant = new Map<string, string>()
  for (const b of blocs.values()) representant.set(b.id, b.cache ? CLE_FONCTION + b.cache : b.id)

  // Arêtes : rôle le plus fort par couple (prémisse, conclusion).
  const couples = new Map<string, { p: string; n: string; role: keyof typeof FORCE_ROLE; validite: Validite }>()
  for (const n of graphe.noeuds) {
    for (const d of n.demonstrations) {
      for (const p of d.justifie_par) {
        if (!blocs.has(p) || p === n.id) continue
        const role = d.roles?.[p] ?? 'principale'
        const cle = `${p}\u0000${n.id}`
        const avant = couples.get(cle)
        if (!avant || FORCE_ROLE[role] > FORCE_ROLE[avant.role]) couples.set(cle, { p, n: n.id, role, validite: d.validite })
      }
    }
  }

  // Nœuds-fonctions : broches d'entrée (représentants extérieurs) et de sortie (membres utilisés dehors).
  const entrees = new Map<string, Set<string>>()
  const sorties = new Map<string, Set<string>>()
  const fleches: {
    de: string; vers: string; sortie: string | null; role: 'principale' | 'auxiliaire'; validite: Validite; relation?: RelationDocument
  }[] = []
  const vues = new Set<string>()
  for (const { p, n, role, validite } of couples.values()) {
    if (role === 'technique' || role === 'contexte') {
      const b = blocs.get(n)!
      if (!b.cache) b.renvois.push(p)
      continue
    }
    const de = representant.get(p)!, vers = representant.get(n)!
    if (de === vers) continue
    const sortie = de.startsWith(CLE_FONCTION) ? p : null
    const cle = `${de}\u0000${vers}\u0000${sortie ?? ''}`
    if (vues.has(cle)) continue
    vues.add(cle)
    fleches.push({ de, vers, sortie, role, validite })
    if (vers.startsWith(CLE_FONCTION)) (entrees.get(vers) ?? entrees.set(vers, new Set()).get(vers)!).add(de)
    if (sortie) (sorties.get(de) ?? sorties.set(de, new Set()).get(de)!).add(sortie)
  }
  // Liens de documents : seulement entre blocs visibles (un cadre réduit ne leur donne pas de broche).
  for (const l of vue.liens_documents ?? []) {
    const de = blocs.get(l.de), vers = blocs.get(l.vers)
    if (!de || !vers || de.cache || vers.cache) continue
    fleches.push({ de: l.de, vers: l.vers, sortie: null, role: 'auxiliaire', validite: 'valide', relation: l.relation })
  }

  // Géométrie des nœuds-fonctions (cadres réduits visibles) : au coin haut gauche de leurs cases.
  const position = (id: string): { x: number; y: number } => {
    if (id.startsWith(CLE_FONCTION)) {
      const f = cadres.get(id.slice(CLE_FONCTION.length))!.fonction!
      return { x: f.x, y: f.y }
    }
    const b = blocs.get(id)!
    return { x: b.x, y: b.y }
  }
  for (const c of cadres.values()) {
    if (!c.replie || c.cache || !c.cases) continue
    const cle = CLE_FONCTION + c.id
    const [c0, l0, c1, l1] = c.cases
    const x = c0 * pasX, y = l0 * pasY
    const w = blocL + (Math.min(2, c1 - c0 + 1) - 1) * pasX
    const e = [...(entrees.get(cle) ?? [])]
    const s = [...(sorties.get(cle) ?? [])]
    const hMax = Math.max(blocH, (l1 - l0 + 1) * pasY - ECART_Y)
    const fixe = FONCTION.tete + FONCTION.pied + (e.length && s.length ? FONCTION.separation : 0)
    const place = Math.max(1, Math.floor((hMax - fixe) / FONCTION.rangee))
    const total = e.length + s.length
    const plus = Math.max(0, total - place)
    const ne = Math.min(e.length, Math.max(0, place - Math.min(s.length, Math.ceil(place / 2))))
    const ns = Math.min(s.length, place - ne)
    c.fonction = { x, y, w, h: 0, entrees: [], sorties: [], plus, yBroches: y + FONCTION.tete, yPied: 0 }
    const f = c.fonction
    // Entrées triées par la hauteur de leur source, sorties par celle du membre.
    e.sort((a, b) => (a.startsWith(CLE_FONCTION) ? 0 : blocs.get(a)!.y) - (b.startsWith(CLE_FONCTION) ? 0 : blocs.get(b)!.y))
    s.sort((a, b) => blocs.get(a)!.y - blocs.get(b)!.y)
    let yr = f.yBroches
    for (const id of e.slice(0, ne)) {
      f.entrees.push({ id, y: yr + FONCTION.rangee / 2 })
      yr += FONCTION.rangee
    }
    if (ne && ns) yr += FONCTION.separation
    for (const id of s.slice(0, ns)) {
      f.sorties.push({ id, y: yr + FONCTION.rangee / 2 })
      yr += FONCTION.rangee
    }
    f.yPied = yr + 2
    f.h = Math.max(blocH, f.yPied - y + FONCTION.pied)
  }

  // Rectangles dessinés des cadres, des plus profonds aux parents.
  const parProfondeur = [...cadres.values()].sort((a, b) => b.profondeur - a.profondeur)
  const boite = new Map<string, Rect>()
  for (const b of blocs.values()) {
    if (b.cache || !b.groupe) continue
    const r = boite.get(b.groupe)
    boite.set(b.groupe, r ? union(r, rectBloc(b)) : rectBloc(b))
  }
  for (const c of parProfondeur) {
    if (c.cache) continue
    let r: Rect | null = null
    if (c.replie) {
      if (c.fonction) r = { x0: c.fonction.x, y0: c.fonction.y, x1: c.fonction.x + c.fonction.w, y1: c.fonction.y + c.fonction.h }
    } else {
      const contenu = boite.get(c.id)
      if (contenu) {
        const m = CADRE.marge
        c.rect = { x0: contenu.x0 - m, y0: contenu.y0 - m - CADRE.titre, x1: contenu.x1 + m, y1: contenu.y1 + m }
        r = c.rect
      }
    }
    if (r && c.parent) {
      const rp = boite.get(c.parent)
      boite.set(c.parent, rp ? union(rp, r) : r)
    }
  }

  // Liaisons orthogonales : sortie à droite, entrée à gauche, par les couloirs entre les cases.
  const taille = (id: string) => {
    if (id.startsWith(CLE_FONCTION)) {
      const f = cadres.get(id.slice(CLE_FONCTION.length))!.fonction!
      return { w: f.w, h: f.h }
    }
    const b = blocs.get(id)!
    return { w: b.w, h: b.h }
  }
  const arrivees = new Map<string, typeof fleches>()
  for (const f of fleches) (arrivees.get(f.vers) ?? arrivees.set(f.vers, []).get(f.vers)!).push(f)
  const liens: Lien[] = []
  for (const [vers, liste] of arrivees) {
    if (vers.startsWith(CLE_FONCTION) && !cadres.get(vers.slice(CLE_FONCTION.length))?.fonction) continue
    const pv = position(vers), tv = taille(vers)
    const fonctionV = vers.startsWith(CLE_FONCTION) ? cadres.get(vers.slice(CLE_FONCTION.length))!.fonction! : null
    const yDepart = (f: (typeof liste)[number]) => {
      if (f.de.startsWith(CLE_FONCTION)) {
        const fo = cadres.get(f.de.slice(CLE_FONCTION.length))?.fonction
        return fo?.sorties.find((s) => s.id === f.sortie)?.y ?? (fo ? fo.y + fo.h / 2 : 0)
      }
      const b = blocs.get(f.de)!
      return b.y + b.h / 2
    }
    const valides = liste.filter((f) => !f.de.startsWith(CLE_FONCTION) || cadres.get(f.de.slice(CLE_FONCTION.length))?.fonction)
    valides.sort((a, b) => yDepart(a) - yDepart(b))
    valides.forEach((f, k) => {
      const pd = position(f.de), td = taille(f.de)
      const xa = pd.x + td.w, ya = yDepart(f)
      let yb: number
      if (fonctionV) {
        const e = fonctionV.entrees.find((x) => x.id === f.de)
        if (!e) return // broche sans place (« +k »)
        yb = e.y
      } else yb = pv.y + (tv.h * (k + 1)) / (valides.length + 1)
      const xb = pv.x
      const couloir = Math.max(-16, Math.min(16, (k - (valides.length - 1) / 2) * 5))
      const xg1 = xa + ECART_X / 2
      const xg2 = xb - ECART_X / 2 + couloir
      let pts: number[]
      if (Math.abs(xg1 - (xb - ECART_X / 2)) < 1) pts = [xa, ya, xg2, ya, xg2, yb, xb, yb]
      else {
        const yr = pv.y - ECART_Y / 2 + ((hache(f.de) % 5) - 2) * 3
        pts = [xa, ya, xg1, ya, xg1, yr, xg2, yr, xg2, yb, xb, yb]
      }
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (let i = 0; i < pts.length; i += 2) {
        x0 = Math.min(x0, pts[i]!)
        x1 = Math.max(x1, pts[i]!)
        y0 = Math.min(y0, pts[i + 1]!)
        y1 = Math.max(y1, pts[i + 1]!)
      }
      liens.push({ de: f.de, vers, role: f.role, validite: f.validite, relation: f.relation, points: pts, bbox: { x0, y0, x1, y1 } })
    })
  }

  // Bornes de la figure (blocs visibles, cadres, nœuds-fonctions).
  let bornes: Rect | null = null
  for (const b of blocs.values()) if (!b.cache) bornes = bornes ? union(bornes, rectBloc(b)) : rectBloc(b)
  for (const c of cadres.values()) {
    if (c.rect) bornes = bornes ? union(bornes, c.rect) : c.rect
    if (c.fonction) {
      const r = { x0: c.fonction.x, y0: c.fonction.y, x1: c.fonction.x + c.fonction.w, y1: c.fonction.y + c.fonction.h }
      bornes = bornes ? union(bornes, r) : r
    }
  }
  return {
    blocs,
    cadres,
    cadresOrdonnes,
    liens,
    representant,
    bornes: bornes ?? { x0: 0, y0: 0, x1: GRILLE.blocL, y1: GRILLE.blocH },
    nonPlaces: nonPlaces.length,
  }
}

/** Nœud tenant-lieu d'une figure : ce que les chemins communs aux blocs lisent (nom = titre). */
function tenantLieu(id: string, f: FigureVue): Noeud {
  return {
    projet_id: '', id, nom: f.titre, enonce: f.legende ?? '', admis: false, type: null, details: null, parents: [],
    enfants: [], conversation_id: null, statut: 'etabli', demonstrations: [],
  }
}

/** Nœud tenant-lieu d'un document (nom = titre, énoncé = description). */
function tenantLieuDocument(id: string, d: DocumentVue): Noeud {
  return {
    projet_id: '', id, nom: d.titre, enonce: d.description ?? '', admis: false, type: null, details: null, parents: [],
    enfants: [], conversation_id: null, statut: 'etabli', demonstrations: [],
  }
}

export function rectBloc(b: Bloc): Rect {
  return { x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h }
}

export function union(a: Rect, b: Rect): Rect {
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }
}

export function dansRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1
}

function hache(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
