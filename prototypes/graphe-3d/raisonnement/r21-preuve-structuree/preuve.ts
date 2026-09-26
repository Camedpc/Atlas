// R21 · Preuve structurée : dérivation d'une preuve hiérarchique numérotée (à la Lamport) depuis le
// graphe de justification. Fonctions pures, sans DOM.
//
//   1. Fondations (« Supposons ») : hypothèses H, choix de modélisation M, définitions D (admises et
//      construites uniquement sur des fondations), axiomes A, outils admis T, littérature L.
//   2. Entrées : une par résultat majeur (théorème ou résultat non admis), dans l'ordre du graphe
//      (ce qui est prouvé d'abord vient d'abord, comme dans un article).
//   3. Développement de chaque entrée, de la conclusion vers les étapes : les enfants d'un énoncé sont
//      les prémisses *principales* de sa démonstration principale qui ne sont ni des fondations, ni
//      des résultats majeurs, ni déjà développées ailleurs ; un énoncé partagé n'est développé
//      qu'une fois, ailleurs il est cité par son numéro. Les enfants sont réservés niveau par niveau
//      avant de descendre (un énoncé partagé reste au niveau le moins profond).
//   4. Décisions : blocs placés sous l'étape qu'elles conditionnent (premier usage), avant ses
//      autres étapes ; leurs propres prémisses sont développées sous elles.
//   5. Séries : ≥ 3 mesures sœurs de même type, produites chacune par une seule activité
//      (expérience ou calcul), deviennent un tableau ; les prémisses communes des activités sont
//      développées sous le tableau.
//   6. Contrôles : calculs sans usage qui ne vérifient qu'un énoncé (vérification symbolique,
//      formalisation Lean) ; rattachés à l'énoncé contrôlé, listés à part.
//   7. Reste (conjectures, piste abandonnée, compléments) : mêmes règles, depuis les énoncés que plus
//      rien n'utilise comme prémisse principale.
//
// Numérotation : ⟨niveau⟩numéro, le compteur d'un niveau court sur toute l'entrée (numéros uniques
// dans l'entrée) ; hors de son entrée, une étape se cite « Th 2 ⟨3⟩1 ».

import {
  construireJustification, demonstrationPrincipale, dependantsDe,
  type Confiance, type DemonstrationR, type GrapheJustification, type JeuRaisonnement, type LienSemantique,
  type NoeudR, type RolePremisse,
} from '../../src/raisonnement/donnees'

export type Famille = 'H' | 'M' | 'D' | 'A' | 'T' | 'L'
export const FAMILLES: { id: Famille; titre: string }[] = [
  { id: 'H', titre: 'Hypothèses' },
  { id: 'M', titre: 'Choix de modélisation' },
  { id: 'D', titre: 'Définitions et notations' },
  { id: 'A', titre: 'Axiomes' },
  { id: 'T', titre: 'Outils admis' },
  { id: 'L', titre: 'Résultats de la littérature' },
]

export type Genre = 'fondation' | 'racine' | 'etape' | 'decision' | 'ligne' | 'activite' | 'controle'

export interface Element {
  genre: Genre
  /** Indice du nœud dans le graphe de justification. */
  i: number
  /** 0 pour les fondations et les racines d'entrée. */
  niveau: number
  /** Étiquette locale : ⟨2⟩3, H1, Déc 4, Th 2, Ctl 3. */
  etiquette: string
  entree: Entree | null
  parent: Element | null
  enfants: Bloc[]
  famille?: Famille
  /** Ligne de série : indice de l'activité qui a produit la mesure. */
  activite?: number
  /** Replié à l'ouverture de la page. */
  replie?: boolean
}

export type Bloc = { genre: 'element'; e: Element } | { genre: 'serie'; s: Serie }

export interface Serie {
  parent: Element
  /** Niveau des lignes (celui des enfants du parent). */
  niveau: number
  lignes: Element[]
  /** Activités développées ici (les autres sont citées). */
  activites: Element[]
  /** Prémisses principales des activités, développées sous le tableau. */
  communs: Element[]
}

export type Section = 'resultats' | 'conjectures' | 'abandon' | 'complements'
export const TITRES_SECTION: Record<Section, string> = {
  resultats: 'Résultats',
  conjectures: 'Conjectures et questions ouvertes',
  abandon: 'Piste abandonnée',
  complements: 'Compléments',
}

export interface Entree {
  racine: Element
  section: Section
  /** Pour les renvois : « Th 2 ». */
  court: string
  /** Pour l'en-tête : « Théorème 2 ». */
  long: string
}

export interface LienEntrant {
  genre: LienSemantique['genre']
  source: number
  note?: string
}

export interface Portee {
  i: number
  etiquette: string
  dependants: Set<number>
}

export interface Preuve {
  jeu: JeuRaisonnement
  j: GrapheJustification
  fondations: Map<Famille, Element[]>
  entrees: Entree[]
  controles: Element[]
  /** Élément de chaque nœud (tous les nœuds sont placés exactement une fois). */
  elements: Element[]
  portees: Portee[]
  liensEntrants: Map<number, LienEntrant[]>
  /** Nœud contrôlé → contrôles. */
  controlesDe: Map<number, number[]>
  stats: { noeuds: number; fondations: number; etapes: number; decisions: number; series: number; lignesSerie: number; renvoisCroises: number; niveauMax: number; entrees: number; controles: number }
}

/** Accès unique à la confiance (aujourd'hui portée par le nœud, en base par la démonstration). */
export function confianceDe(n: NoeudR): Confiance {
  return n.confiance
}

const ABREV: Partial<Record<NoeudR['type'], [string, string]>> = {
  theoreme: ['Th', 'Théorème'],
  resultat: ['Rés', 'Résultat'],
}

export function construirePreuve(jeu: JeuRaisonnement): Preuve {
  const j = construireJustification(jeu, 'toutes')
  const N = j.noeuds.length
  const noeud = (i: number) => j.noeuds[i]!

  // Prémisses principales de la démonstration principale, et usages principaux inverses.
  const principales: number[][] = j.noeuds.map((n, i) => {
    const d = demonstrationPrincipale(n)
    const r: number[] = []
    for (const p of d?.premisses ?? []) {
      if (p.role !== 'principale') continue
      const k = j.index.get(p.id)
      if (k !== undefined && k !== i && !r.includes(k)) r.push(k)
    }
    return r
  })
  const usagesPrincipaux: number[][] = j.noeuds.map(() => [])
  principales.forEach((ps, i) => ps.forEach((k) => usagesPrincipaux[k]!.push(i)))
  const toutesPremisses = (i: number) => j.entrantes[i]!.map((a) => j.aretes[a]!.source)

  // 1. Familles de fondations (point fixe pour les définitions construites sur d'autres définitions).
  const famille: (Famille | null)[] = new Array(N).fill(null)
  for (let i = 0; i < N; i++) {
    const n = noeud(i)
    if (n.type === 'hypothese') famille[i] = 'H'
    else if (n.type === 'choix_modelisation') famille[i] = 'M'
    else if (n.type === 'axiome') famille[i] = 'A'
    else if (n.admis && n.type === 'lemme') famille[i] = 'T'
    else if (n.admis && (n.type === 'theoreme' || n.type === 'proposition' || n.type === 'resultat')) famille[i] = 'L'
  }
  for (let change = true; change;) {
    change = false
    for (let i = 0; i < N; i++) {
      const n = noeud(i)
      if (famille[i] || !n.admis || n.type !== 'definition') continue
      if (toutesPremisses(i).every((k) => famille[k] !== null)) {
        famille[i] = 'D'
        change = true
      }
    }
  }
  const majeur = j.noeuds.map((n) => (n.type === 'theoreme' || n.type === 'resultat') && !n.admis)
  const controle = j.noeuds.map((n, i) => {
    if (n.type !== 'calcul' || n.demonstrations.length !== 1 || j.sortantes[i]!.length > 0) return false
    const ps = n.demonstrations[0]!.premisses
    return ps.filter((p) => p.role === 'principale').length === 1 && ps.every((p) => p.role === 'principale' || p.role === 'contexte')
  })

  const elements: (Element | undefined)[] = new Array(N)
  const place = new Uint8Array(N)
  const peutDevelopper = (k: number) => famille[k] === null && !majeur[k] && !controle[k] && !place[k]
  const nouveau = (genre: Genre, i: number, niveau: number, parent: Element | null, entree: Entree | null): Element => {
    const e: Element = { genre, i, niveau, etiquette: '', entree, parent, enfants: [] }
    elements[i] = e
    place[i] = 1
    return e
  }

  // Séries parmi des candidats : mesures produites chacune par une activité, sans autre usage.
  const activiteDe = (k: number, parent: number): number | null => {
    const n = noeud(k)
    if (n.type !== 'observation' && n.type !== 'calcul' && n.type !== 'experience') return null
    if (n.demonstrations.length !== 1) return null
    if (usagesPrincipaux[k]!.some((u) => u !== parent)) return null
    const ps = principales[k]!.filter((x) => famille[x] === null)
    if (ps.length !== 1) return null
    const t = noeud(ps[0]!).type
    return t === 'experience' || t === 'calcul' ? ps[0]! : null
  }

  let nSeries = 0
  let nLignes = 0
  const developper = (e: Element): void => {
    const candidats = principales[e.i]!.filter(peutDevelopper)
    if (!candidats.length) return
    const niveau = e.niveau + 1
    // Séries : regroupées par type de mesure.
    const act = new Map<number, number>()
    const parType = new Map<string, number[]>()
    for (const k of candidats) {
      const a = activiteDe(k, e.i)
      if (a === null) continue
      act.set(k, a)
      const t = noeud(k).type
      parType.set(t, [...(parType.get(t) ?? []), k])
    }
    const groupeDe = new Map<number, number[]>()
    for (const g of parType.values()) {
      if (g.length < 3 || new Set(g.map((k) => act.get(k))).size !== g.length) continue
      for (const k of g) groupeDe.set(k, g)
    }
    const blocs: Bloc[] = []
    const suite: Element[] = []
    // Décisions d'abord : elles conditionnent l'étape.
    for (const k of candidats) {
      if (noeud(k).type !== 'decision') continue
      const c = nouveau('decision', k, niveau, e, e.entree)
      blocs.push({ genre: 'element', e: c })
      suite.push(c)
    }
    for (const k of candidats) {
      if (place[k]) continue
      const g = groupeDe.get(k)
      if (g) {
        const s: Serie = { parent: e, niveau, lignes: [], activites: [], communs: [] }
        for (const m of g) {
          const l = nouveau('ligne', m, niveau, e, e.entree)
          l.activite = act.get(m)!
          s.lignes.push(l)
        }
        for (const l of s.lignes) if (peutDevelopper(l.activite!)) s.activites.push(nouveau('activite', l.activite!, niveau + 1, l, e.entree))
        for (const a of s.activites) {
          for (const k2 of principales[a.i]!) {
            if (!peutDevelopper(k2)) continue
            s.communs.push(nouveau(noeud(k2).type === 'decision' ? 'decision' : 'etape', k2, niveau + 2, e, e.entree))
          }
        }
        s.communs.sort((x, y) => (noeud(x.i).type === 'decision' ? 0 : 1) - (noeud(y.i).type === 'decision' ? 0 : 1))
        blocs.push({ genre: 'serie', s })
        suite.push(...s.communs)
        nSeries++
        nLignes += s.lignes.length
        continue
      }
      const c = nouveau('etape', k, niveau, e, e.entree)
      blocs.push({ genre: 'element', e: c })
      suite.push(c)
    }
    e.enfants = blocs
    for (const c of suite) developper(c)
  }

  // 2. Fondations (toutes créées avant tout développement).
  const fondations = new Map<Famille, Element[]>(FAMILLES.map((f) => [f.id, []]))
  for (const f of FAMILLES) {
    for (let i = 0; i < N; i++) {
      if (famille[i] !== f.id) continue
      const e = nouveau('fondation', i, 0, null, null)
      e.famille = f.id
      const liste = fondations.get(f.id)!
      liste.push(e)
      e.etiquette = `${f.id}${liste.length}`
    }
  }
  for (const f of FAMILLES) for (const e of fondations.get(f.id)!) developper(e)

  // 3. Entrées des résultats majeurs.
  const entrees: Entree[] = []
  const compteurs = new Map<string, number>()
  const creerEntree = (i: number, section: Section): Entree => {
    const n = noeud(i)
    let court: string, long: string
    if (section === 'resultats') {
      const [a, l] = ABREV[n.type] ?? ['É', 'Énoncé']
      const k = (compteurs.get(a) ?? 0) + 1
      compteurs.set(a, k)
      court = `${a} ${k}`
      long = `${l} ${k}`
    } else {
      const [a, l] = section === 'conjectures' ? ['Conj', 'Conjecture'] : section === 'abandon' ? ['Ab', 'Piste abandonnée'] : ['C', 'Complément']
      const k = (compteurs.get(a) ?? 0) + 1
      compteurs.set(a, k)
      court = `${a} ${k}`
      long = `${l} ${k}`
    }
    const entree: Entree = { racine: undefined as unknown as Element, section, court, long }
    const r = nouveau(n.type === 'decision' ? 'decision' : 'racine', i, 0, null, entree)
    r.etiquette = court
    entree.racine = r
    entrees.push(entree)
    return entree
  }
  for (let i = 0; i < N; i++) if (majeur[i]) developper(creerEntree(i, 'resultats').racine)

  // 4. Reste : conjectures, piste abandonnée, compléments.
  let reste = [...Array(N).keys()].filter((i) => !place[i] && !controle[i])
  const sectionDe = (n: NoeudR): Section => (n.piste === 'abandonnee' ? 'abandon' : n.type === 'conjecture' ? 'conjectures' : 'complements')
  const ordreSection: Section[] = ['conjectures', 'abandon', 'complements']
  while (reste.length) {
    const dansReste = new Set(reste)
    let racines = reste.filter((i) => !usagesPrincipaux[i]!.some((u) => dansReste.has(u)))
    if (!racines.length) racines = [reste[0]!]
    racines.sort((a, b) => ordreSection.indexOf(sectionDe(noeud(a))) - ordreSection.indexOf(sectionDe(noeud(b))) || a - b)
    for (const r of racines) {
      if (place[r]) continue
      const entree = creerEntree(r, sectionDe(noeud(r)))
      if (entree.section === 'complements') entree.racine.replie = true
      developper(entree.racine)
    }
    reste = reste.filter((i) => !place[i])
  }
  // Entrées regroupées par section (ordre stable à l'intérieur).
  const ordreSections: Section[] = ['resultats', 'conjectures', 'abandon', 'complements']
  entrees.sort((a, b) => ordreSections.indexOf(a.section) - ordreSections.indexOf(b.section))

  // 5. Contrôles.
  const controles: Element[] = []
  const controlesDe = new Map<number, number[]>()
  for (let i = 0; i < N; i++) {
    if (!controle[i]) continue
    const e = nouveau('controle', i, 0, null, null)
    e.etiquette = `Ctl ${controles.length + 1}`
    controles.push(e)
    const cible = principales[i]![0]!
    controlesDe.set(cible, [...(controlesDe.get(cible) ?? []), i])
  }

  // 6. Numérotation en ordre de lecture.
  let nDec = 0
  let nEtapes = 0
  let niveauMax = 0
  const etiqueter = (x: Element, cpt: Map<number, number>) => {
    niveauMax = Math.max(niveauMax, x.niveau)
    if (x.genre === 'decision') {
      x.etiquette = `Déc ${++nDec}`
      return
    }
    const k = (cpt.get(x.niveau) ?? 0) + 1
    cpt.set(x.niveau, k)
    x.etiquette = `⟨${x.niveau}⟩${k}`
    nEtapes++
  }
  const numeroter = (e: Element, cpt: Map<number, number>) => {
    for (const b of e.enfants) {
      if (b.genre === 'element') {
        etiqueter(b.e, cpt)
        numeroter(b.e, cpt)
      } else {
        for (const l of b.s.lignes) etiqueter(l, cpt)
        for (const a of b.s.activites) etiqueter(a, cpt)
        for (const c of b.s.communs) {
          etiqueter(c, cpt)
          numeroter(c, cpt)
        }
      }
    }
  }
  for (const f of FAMILLES) for (const e of fondations.get(f.id)!) numeroter(e, new Map())
  for (const en of entrees) {
    if (en.racine.genre === 'decision') {
      en.racine.etiquette = `Déc ${++nDec}`
      en.court = en.racine.etiquette
    }
    numeroter(en.racine, new Map())
  }

  // 7. Portées des choix, liens entrants, statistiques.
  const portees: Portee[] = fondations.get('M')!.map((e) => ({ i: e.i, etiquette: e.etiquette, dependants: new Set(dependantsDe(j, e.i)) }))
  const liensEntrants = new Map<number, LienEntrant[]>()
  j.noeuds.forEach((n, i) => {
    for (const l of n.liens ?? []) {
      const c = j.index.get(l.cible)
      if (c === undefined) continue
      liensEntrants.set(c, [...(liensEntrants.get(c) ?? []), { genre: l.genre, source: i, note: l.note }])
    }
  })
  const tous = elements as Element[]
  for (let i = 0; i < N; i++) if (!elements[i]) throw new Error(`[r21] nœud non placé : ${noeud(i).id}`)
  let renvoisCroises = 0
  for (const e of tous) {
    const enfants = new Set(enfantsDirects(e))
    for (const k of principales[e.i]!) if (!enfants.has(k) && famille[k] === null) renvoisCroises++
  }
  return {
    jeu, j, fondations, entrees, controles, elements: tous, portees, liensEntrants, controlesDe,
    stats: {
      noeuds: N, fondations: tous.filter((e) => e.genre === 'fondation').length, etapes: nEtapes, decisions: nDec,
      series: nSeries, lignesSerie: nLignes, renvoisCroises, niveauMax, entrees: entrees.length, controles: controles.length,
    },
  }
}

/** Nœuds développés directement sous un élément (lignes de série et communs compris). */
export function enfantsDirects(e: Element): number[] {
  const r: number[] = []
  for (const b of e.enfants) {
    if (b.genre === 'element') r.push(b.e.i)
    else r.push(...b.s.lignes.map((l) => l.i), ...b.s.communs.map((c) => c.i))
  }
  return r
}

/** Étiquette à utiliser pour citer le nœud i depuis une entrée donnée. */
export function citation(p: Preuve, i: number, depuis: Entree | null): string {
  const e = p.elements[i]!
  if ((e.genre === 'etape' || e.genre === 'ligne' || e.genre === 'activite') && e.entree && e.entree !== depuis) return `${e.entree.court} ${e.etiquette}`
  return e.etiquette
}

/** Prémisses d'une démonstration groupées par rôle (ordre : principale, auxiliaire, technique, contexte). */
export function premissesParRole(p: Preuve, d: DemonstrationR): [RolePremisse, number[]][] {
  const ordre: RolePremisse[] = ['principale', 'auxiliaire', 'technique', 'contexte']
  const r = new Map<RolePremisse, number[]>(ordre.map((x) => [x, []]))
  for (const q of d.premisses) {
    const k = p.j.index.get(q.id)
    if (k !== undefined && !r.get(q.role)!.includes(k)) r.get(q.role)!.push(k)
  }
  return ordre.map((x) => [x, r.get(x)!] as [RolePremisse, number[]]).filter(([, v]) => v.length > 0)
}
