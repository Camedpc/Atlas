// R22 · Modèle biparti : énoncés d'un côté, inférences (démonstrations) de l'autre.
//
// Dérivation déterministe depuis le jeu de `src/raisonnement/donnees.ts` (rien n'est modifié) :
//
//   nature      chaque nœud est un énoncé (boîte), un élément de la bande « Hypothèses et modèle »
//               (hypothèses, choix de modélisation), du contexte (axiomes, définitions admises, lemmes
//               outils, littérature : cités en étiquettes latérales) ou un contrôle (calcul terminal qui
//               vérifie un seul énoncé déductif : Lean, calcul formel ; marque sur l'énoncé vérifié).
//   séries      les expériences, calculs et observations numérotés (`sim_c_32`, `sim_c_64`…) d'au
//               moins trois membres sont repliés en une activité « × n » (et son observation « × n »
//               avec un sparkline des valeurs lues dans les énoncés).
//   inférences  une par démonstration (plusieurs pour un même énoncé : barres empilées) ; une seule,
//               agrégée, pour une série.
//   codes       identifiants courts et stables, par type et dans l'ordre du jeu : H3, M2, Déf 7, Lem 12…
//
// La confiance d'une inférence passe par une seule fonction (`confianceInference`) : le prototype la
// porte sur le nœud, la base la porte sur la démonstration ; changer cette fonction suffit à basculer.

import {
  construireJustification, demonstrationPrincipale, FORCE_ROLE, genererJeuRaisonnement,
  type Confiance, type DemonstrationR, type GrapheJustification, type JeuRaisonnement, type NoeudR,
  type RolePremisse, type TypeRaisonnement, type Validite,
} from '../../src/raisonnement/donnees'

export type Nature = 'bande' | 'contexte' | 'controle' | 'enonce'
/** Famille graphique d'un énoncé (forme de la boîte). */
export type Famille = 'deductif' | 'definition' | 'observation' | 'resultat' | 'activite' | 'decision'

export interface PointSerie {
  libelle: string
  x: number | null
  y: number | null
}

export interface InfoSerie {
  /** Motif du titre, la partie variable remplacée par « {a … b} ». */
  motif: string
  points: PointSerie[]
  logX: boolean
  logY: boolean
}

export interface Unite {
  k: number
  /** Id du nœud, ou `serie:<préfixe>`. */
  id: string
  genre: 'noeud' | 'serie'
  /** Indices de nœuds du graphe de justification. */
  membres: number[]
  /** Représentant (premier membre). */
  noeud: NoeudR
  type: TypeRaisonnement
  famille: Famille
  code: string
  titre: string
  couloir: string
  abandonnee: boolean
  /** Énoncé sans démonstration valide et non admis : contour en tirets. */
  ouvert: boolean
  /** Inférences qui concluent sur cette unité, la principale d'abord. */
  inferences: number[]
  /** Nœuds de contrôle rattachés (Lean, calcul formel…). */
  controles: number[]
  serie?: InfoSerie
}

export interface Citation {
  role: RolePremisse
  /** Nœud cité (graphe de justification). */
  noeud: number
  /** Unité du nœud cité, −1 s'il n'est pas une boîte (bande, contexte, contrôle). */
  unite: number
}

export interface Inference {
  k: number
  conclusion: number
  nom: string
  principale: boolean
  /** Rang parmi les démonstrations de la conclusion (0 = principale). */
  rang: number
  validite: Validite
  confiance: Confiance
  auteur: string
  date: string
  premisses: Citation[]
  /** Démonstrations d'origine (plusieurs pour une série). */
  demos: DemonstrationR[]
}

export interface LienBande {
  /** Unité qui instaure l'élément de bande (ex. une décision → un choix de modélisation). */
  source: number
  bande: number
}

export interface Modele {
  jeu: JeuRaisonnement
  j: GrapheJustification
  nature: Nature[]
  code: string[]
  /** Libellé court d'un nœud dans une étiquette latérale (nom d'outil ou code). */
  court: string[]
  uniteDe: Int32Array
  unites: Unite[]
  inferences: Inference[]
  /** Indices de nœuds de la bande : hypothèses puis choix de modélisation. */
  bande: number[]
  liensBande: LienBande[]
  /** Inférences qui citent une unité (tous rôles). */
  citeePar: number[][]
  /** Inférences qui citent un nœud de bande ou de contexte (par nœud). */
  citeeParNoeud: number[][]
  stats: { noeuds: number; aretes: number; bande: number; contexte: number; controles: number; series: number; noeudsEnSeries: number }
}

// ─── Codes et libellés courts ────────────────────────────────────────────────

const PREFIXE_CODE: Record<TypeRaisonnement, string> = {
  hypothese: 'H', choix_modelisation: 'M', definition: 'Déf ', axiome: 'Ax ', decision: 'Déc ', lemme: 'Lem ',
  proposition: 'Prop ', theoreme: 'Thm ', assertion: 'As ', experience: 'Exp ', calcul: 'Calc ', observation: 'Obs ',
  resultat: 'Rés ', conjecture: 'Conj ',
}

const OUTIL = /^(?:Lemme|Inégalité(?: maximale)?|Théorème|Critère(?: de continuité)?|Représentation) d(?:e |’|')/

/** Nom court d'un outil ou d'un résultat de la littérature (« Grönwall discret », « BDG »), sinon null. */
function nomOutil(nom: string): string | null {
  const s = nom.replace(OUTIL, '').split(' : ')[0]!.trim()
  if (s.length <= 16) return s
  const premier = s.split(' ')[0]!
  const parties = premier.split('–')
  if (parties.length >= 3) return parties.map((p) => p[0]).join('')
  if (parties.length === 2 && premier.length <= 16) return premier
  return null
}

// ─── Confiance d'une inférence (point de bascule base / prototype) ────────────

/**
 * Confiance portée par une démonstration. En base, `confiance` vit sur la démonstration ; ici, la
 * principale reprend celle du nœud et les autres sont dérivées de leur validité.
 */
export function confianceInference(n: NoeudR, d: DemonstrationR): Confiance {
  const c = n.confiance
  if (d === demonstrationPrincipale(n) || d.validite === 'valide') return { ...c }
  if (d.validite === 'invalide') return { estimation: 0.1, bas: 0.03, haut: 0.2 }
  const r = (v: number) => Math.round(v * 100) / 100
  return { estimation: r(c.estimation * 0.7), bas: r(c.bas * 0.5), haut: r(Math.min(1, c.haut * 0.9)) }
}

const GRAVITE: Record<Validite, number> = { valide: 0, a_verifier: 1, invalide: 2 }

// ─── Séries ──────────────────────────────────────────────────────────────────

const RE_NOMBRE = /(\d+(?:[,.]\d+)?)/

function lireNombre(s: string): number | null {
  const fraction = /1\/(\d+)/.exec(s)
  if (fraction) return 1 / Number(fraction[1])
  const m = RE_NOMBRE.exec(s)
  return m ? Number(m[1]!.replace(',', '.')) : null
}

/** Motif commun des noms (préfixe et suffixe communs, coupés sur un espace ou un séparateur). */
function motifSerie(noms: string[]): { motif: string; variables: string[] } | null {
  let pre = noms[0]!
  let suf = noms[0]!
  for (const n of noms) {
    let i = 0
    while (i < pre.length && i < n.length && pre[i] === n[i]) i++
    pre = pre.slice(0, i)
    let k = 0
    while (k < suf.length && k < n.length && suf[suf.length - 1 - k] === n[n.length - 1 - k]) k++
    suf = suf.slice(suf.length - k)
  }
  // Ne pas couper un nombre en deux (« 1/32 » et « 1/64 » partagent « 1/ » : on le garde dans le préfixe).
  while (pre.length && /[\d,]/.test(pre[pre.length - 1]!)) pre = pre.slice(0, -1)
  while (suf.length && /[\d,]/.test(suf[0]!)) suf = suf.slice(1)
  if (pre.length + suf.length < 8) return null
  const variables = noms.map((n) => n.slice(pre.length, n.length - suf.length))
  // Une partie variable qui coupe une parenthèse rend le motif trompeur : on y renonce.
  if (variables.some((v) => /[()]/.test(v))) return null
  return { motif: `${pre}{${variables[0]} … ${variables[variables.length - 1]}}${suf}`, variables }
}

/**
 * Série repliée : motif du titre et points (paramètre, valeur) lus dans les noms et énoncés.
 * Le paramètre est la partie variable du nom (ou ce qui suit le dernier « = ») ; la valeur, le
 * premier nombre après « = » dans l'énoncé, sinon le premier nombre du nom hors paramètre.
 * Seules les observations (et les calculs dont chaque membre donne une valeur) portent des valeurs.
 */
function infoSerie(membres: NoeudR[]): InfoSerie {
  const noms = membres.map((n) => n.nom)
  const m = motifSerie(noms)
  const type = membres[0]!.type
  const points: PointSerie[] = membres.map((n, i) => {
    const varPart = m ? m.variables[i]! : n.nom.includes('= ') ? n.nom.split('= ').pop()! : ''
    const x = (varPart ? lireNombre(varPart.includes('=') ? varPart.split('=').pop()! : varPart) : null) ?? i
    let y: number | null = null
    if (type !== 'experience') {
      const apres = n.enonce.includes('=') ? n.enonce.split('=').slice(1).join('=') : ''
      y = apres ? lireNombre(apres.replace(/1\/\d+/g, '')) : null
      if (y === null) y = lireNombre(n.nom.replace(/\(.*\)/g, '').replace(/(?:h|θ|‖σ‖) = [\d/,]+/g, ''))
      if (y !== null && y === x) y = null
    }
    return { libelle: n.nom, x, y }
  })
  if (type === 'calcul' && points.some((p) => p.y === null)) for (const p of points) p.y = null
  const xs = points.map((p) => p.x).filter((v): v is number => v !== null && v > 0)
  const ysDef = points.map((p) => p.y).filter((v): v is number => v !== null)
  const rapport = (v: number[]) => (v.length > 1 ? Math.max(...v) / Math.min(...v) : 1)
  const logX = rapport(xs) >= 8
  const ysPos = ysDef.every((v) => v > 0)
  return {
    motif: m ? m.motif : `${noms[0]} … ${noms[noms.length - 1]}`,
    points,
    logX,
    logY: ysPos && ysDef.length > 1 && (logX || rapport(ysDef) >= 3),
  }
}

// ─── Construction ────────────────────────────────────────────────────────────

function familleDe(n: NoeudR): Famille {
  switch (n.type) {
    case 'definition': case 'axiome': return 'definition'
    case 'observation': return 'observation'
    case 'resultat': return 'resultat'
    case 'experience': case 'calcul': return 'activite'
    case 'decision': return 'decision'
    default: return 'deductif'
  }
}

const DEDUCTIFS = new Set<TypeRaisonnement>(['lemme', 'proposition', 'theoreme', 'assertion', 'conjecture'])

export function construireModele(jeu: JeuRaisonnement = genererJeuRaisonnement()): Modele {
  const j = construireJustification(jeu, 'toutes')
  const N = j.noeuds.length

  // Codes, par type, dans l'ordre du jeu.
  const compteurs = new Map<TypeRaisonnement, number>()
  const code = j.noeuds.map((n) => {
    const c = (compteurs.get(n.type) ?? 0) + 1
    compteurs.set(n.type, c)
    return `${PREFIXE_CODE[n.type]}${c}`
  })

  // Nature.
  const usagesPrincipaux = (i: number) => j.sortantes[i]!.filter((e) => j.aretes[e]!.role === 'principale').length
  const nature: Nature[] = j.noeuds.map((n, i) => {
    if (n.type === 'hypothese' || n.type === 'choix_modelisation') return 'bande'
    if (n.type === 'axiome') return 'contexte'
    if (n.admis && (n.type === 'lemme' || n.type === 'theoreme' || n.type === 'proposition' || n.type === 'resultat')) return 'contexte'
    if (n.admis && n.type === 'definition') {
      // Objet central (repris de R1) : construit par une décision, ou prémisse principale ≥ 6 fois.
      const parDecision = j.entrantes[i]!.some((e) => j.aretes[e]!.role === 'principale' && j.noeuds[j.aretes[e]!.source]!.type === 'decision')
      return parDecision || usagesPrincipaux(i) >= 6 ? 'enonce' : 'contexte'
    }
    if (n.type === 'calcul' && j.sortantes[i]!.length === 0) {
      const d = demonstrationPrincipale(n)
      const princ = d?.premisses.filter((p) => p.role === 'principale') ?? []
      if (princ.length === 1) {
        const cible = j.index.get(princ[0]!.id)
        if (cible !== undefined && DEDUCTIFS.has(j.noeuds[cible]!.type)) return 'controle'
      }
    }
    return 'enonce'
  })

  const court = j.noeuds.map((n, i) => (nature[i] === 'contexte' && n.type !== 'definition' && n.type !== 'axiome' ? nomOutil(n.nom) ?? code[i]! : code[i]!))

  // Séries.
  const cleSerie = new Map<number, string>()
  const groupes = new Map<string, number[]>()
  j.noeuds.forEach((n, i) => {
    if (nature[i] !== 'enonce' || !(n.type === 'experience' || n.type === 'calcul' || n.type === 'observation')) return
    const m = /^(.*)_(\d+)$/.exec(n.id)
    if (!m) return
    const cle = `${m[1]}|${n.type}`
    if (!groupes.has(cle)) groupes.set(cle, [])
    groupes.get(cle)!.push(i)
  })
  for (const [cle, membres] of groupes) if (membres.length >= 3) for (const i of membres) cleSerie.set(i, cle)

  // Unités.
  const uniteDe = new Int32Array(N).fill(-1)
  const unites: Unite[] = []
  const dejaSerie = new Map<string, number>()
  j.noeuds.forEach((n, i) => {
    if (nature[i] !== 'enonce') return
    const cle = cleSerie.get(i)
    if (cle !== undefined) {
      if (dejaSerie.has(cle)) return
      const membres = groupes.get(cle)!.slice().sort((a, b) => Number(/_(\d+)$/.exec(j.noeuds[a]!.id)![1]) - Number(/_(\d+)$/.exec(j.noeuds[b]!.id)![1]))
      const noeuds = membres.map((m) => j.noeuds[m]!)
      const serie = infoSerie(noeuds)
      const dernier = code[membres[membres.length - 1]!]!.replace(/^\D+/, '')
      const u: Unite = {
        k: unites.length, id: `serie:${cle}`, genre: 'serie', membres, noeud: n, type: n.type, famille: familleDe(n),
        code: `${code[membres[0]!]}–${dernier}`, titre: serie.motif, couloir: n.sousProbleme, abandonnee: n.piste === 'abandonnee',
        ouvert: noeuds.some((x) => !x.admis && !x.demonstrations.some((d) => d.validite === 'valide')),
        inferences: [], controles: [], serie,
      }
      dejaSerie.set(cle, u.k)
      for (const m of membres) uniteDe[m] = u.k
      unites.push(u)
      return
    }
    uniteDe[i] = unites.length
    unites.push({
      k: unites.length, id: n.id, genre: 'noeud', membres: [i], noeud: n, type: n.type, famille: familleDe(n),
      code: code[i]!, titre: n.nom, couloir: n.sousProbleme, abandonnee: n.piste === 'abandonnee',
      ouvert: !n.admis && !n.demonstrations.some((d) => d.validite === 'valide'),
      inferences: [], controles: [],
    })
  })

  // Contrôles rattachés à l'énoncé vérifié.
  j.noeuds.forEach((n, i) => {
    if (nature[i] !== 'controle') return
    const p = demonstrationPrincipale(n)!.premisses.find((x) => x.role === 'principale')!
    const u = uniteDe[j.index.get(p.id)!]!
    if (u >= 0) unites[u]!.controles.push(i)
  })

  // Inférences.
  const inferences: Inference[] = []
  const citation = (p: { id: string; role: RolePremisse }): Citation | null => {
    const s = j.index.get(p.id)
    return s === undefined ? null : { role: p.role, noeud: s, unite: uniteDe[s]! }
  }
  for (const u of unites) {
    if (u.genre === 'noeud') {
      const n = u.noeud
      const princ = demonstrationPrincipale(n)
      const demos = princ ? [princ, ...n.demonstrations.filter((d) => d !== princ)] : []
      demos.forEach((d, r) => {
        const premisses = d.premisses.map(citation).filter((c): c is Citation => c !== null && c.noeud !== u.membres[0])
        u.inferences.push(inferences.length)
        inferences.push({
          k: inferences.length, conclusion: u.k, nom: d.nom, principale: r === 0, rang: r, validite: d.validite,
          confiance: confianceInference(n, d), auteur: d.auteur, date: d.cree_le, premisses, demos: [d],
        })
      })
    } else {
      // Série : une inférence agrégée (démonstrations principales des membres, prémisses fusionnées).
      const parCle = new Map<string, Citation>()
      const demos: DemonstrationR[] = []
      let validite: Validite = 'valide'
      const conf: Confiance = { estimation: 1, bas: 1, haut: 1 }
      for (const m of u.membres) {
        const n = j.noeuds[m]!
        const d = demonstrationPrincipale(n)
        if (!d) continue
        demos.push(d)
        if (GRAVITE[d.validite] > GRAVITE[validite]) validite = d.validite
        const c = confianceInference(n, d)
        conf.estimation = Math.min(conf.estimation, c.estimation)
        conf.bas = Math.min(conf.bas, c.bas)
        conf.haut = Math.min(conf.haut, c.haut)
        for (const p of d.premisses) {
          const c2 = citation(p)
          if (!c2 || u.membres.includes(c2.noeud)) continue
          const cle = c2.unite >= 0 ? `u${c2.unite}` : `n${c2.noeud}`
          const ex = parCle.get(cle)
          if (!ex || FORCE_ROLE[c2.role] > FORCE_ROLE[ex.role]) parCle.set(cle, c2)
        }
      }
      if (!demos.length) continue
      u.inferences.push(inferences.length)
      inferences.push({
        k: inferences.length, conclusion: u.k, nom: `${demos[0]!.nom} × ${demos.length}`, principale: true, rang: 0, validite,
        confiance: conf, auteur: demos[0]!.auteur, date: demos[demos.length - 1]!.cree_le, premisses: [...parCle.values()], demos,
      })
    }
  }

  const citeePar: number[][] = unites.map(() => [])
  const citeeParNoeud: number[][] = j.noeuds.map(() => [])
  for (const inf of inferences) {
    const vues = new Set<number>()
    for (const c of inf.premisses) {
      citeeParNoeud[c.noeud]!.push(inf.k)
      if (c.unite >= 0 && !vues.has(c.unite)) {
        vues.add(c.unite)
        citeePar[c.unite]!.push(inf.k)
      }
    }
  }

  // Bande : hypothèses puis choix de modélisation ; liens « instaure » depuis une unité.
  const bande = [
    ...j.noeuds.map((_, i) => i).filter((i) => j.noeuds[i]!.type === 'hypothese'),
    ...j.noeuds.map((_, i) => i).filter((i) => j.noeuds[i]!.type === 'choix_modelisation'),
  ]
  const liensBande: LienBande[] = []
  for (const b of bande) {
    const d = demonstrationPrincipale(j.noeuds[b]!)
    for (const p of d?.premisses ?? []) {
      const s = j.index.get(p.id)
      if (s !== undefined && p.role === 'principale' && uniteDe[s]! >= 0) liensBande.push({ source: uniteDe[s]!, bande: b })
    }
  }

  const enSeries = unites.filter((u) => u.genre === 'serie')
  return {
    jeu, j, nature, code, court, uniteDe, unites, inferences, bande, liensBande, citeePar, citeeParNoeud,
    stats: {
      noeuds: N, aretes: j.aretes.length, bande: bande.length,
      contexte: nature.filter((x) => x === 'contexte').length,
      controles: nature.filter((x) => x === 'controle').length,
      series: enSeries.length,
      noeudsEnSeries: enSeries.reduce((s, u) => s + u.membres.length, 0),
    },
  }
}

// ─── Sélection de ce qui est affiché ─────────────────────────────────────────

export type Niveau = 'resultats' | 'tout'

/**
 * Unités visibles. « résultats » : seulement ce qui mène (prémisses principales ou auxiliaires, toutes
 * démonstrations) à un résultat, un théorème, une décision, une conjecture ou un énoncé porteur d'un
 * lien sémantique ; « tout » : toutes les unités.
 */
export function unitesVisibles(m: Modele, niveau: Niveau): Uint8Array {
  const v = new Uint8Array(m.unites.length)
  if (niveau === 'tout') return v.fill(1)
  const pile: number[] = []
  for (const u of m.unites) {
    const n = u.noeud
    const cible = n.type === 'resultat' || n.type === 'decision' || n.type === 'conjecture' ||
      (n.type === 'theoreme' && !n.admis) || u.membres.some((x) => (m.j.noeuds[x]!.liens?.length ?? 0) > 0)
    if (cible) {
      v[u.k] = 1
      pile.push(u.k)
    }
  }
  while (pile.length) {
    const u = pile.pop()!
    for (const i of m.unites[u]!.inferences) for (const c of m.inferences[i]!.premisses) {
      if (c.unite < 0 || v[c.unite] || (c.role !== 'principale' && c.role !== 'auxiliaire')) continue
      v[c.unite] = 1
      pile.push(c.unite)
    }
  }
  return v
}

/** Portée d'un nœud (bande ou unité) : unités dont un membre dépend transitivement de lui. */
export function porteeUnites(m: Modele, noeud: number): Set<number> {
  const vus = new Uint8Array(m.j.noeuds.length)
  const pile = [noeud]
  const res = new Set<number>()
  while (pile.length) {
    const x = pile.pop()!
    for (const e of m.j.sortantes[x]!) {
      const y = m.j.aretes[e]!.cible
      if (vus[y]) continue
      vus[y] = 1
      pile.push(y)
      if (m.uniteDe[y]! >= 0) res.add(m.uniteDe[y]!)
    }
  }
  return res
}
