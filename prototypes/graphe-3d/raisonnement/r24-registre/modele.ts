// R24 · Registre de la démarche : modèle dérivé du jeu de raisonnement.
//
// Tout est calculé de façon déterministe à partir de `JeuRaisonnement` (aucune annotation ajoutée) :
// lignes (sous-problèmes), jalons majeurs, campagnes (séries d'expériences ou de calculs), numérotation
// citable, correspondances entre lignes, arcs sémantiques et contraintes « choix → décision ».

import {
  antecedentsDe, construireJustification, demonstrationPrincipale, dependantsDe,
  type Confiance, type GrapheJustification, type JeuRaisonnement, type NoeudR, type SousProbleme, type TypeRaisonnement,
} from '../../src/raisonnement/donnees'

export const JOUR = 86_400_000

/** Accès unique à la confiance : aujourd'hui portée par le nœud, demain par sa démonstration principale. */
export function confianceDe(n: NoeudR): Confiance {
  return n.confiance
}

export type GenreJalon = 'decision' | 'choix' | 'resultat' | 'enonce' | 'observation' | 'demarche' | 'campagne'

export interface Jalon {
  /** Clé stable : id du nœud, ou `serie:<id du premier membre>` pour une campagne. */
  cle: string
  genre: GenreJalon
  /** Identifiant court citable (D3, T2, S1…). */
  ident: string
  titre: string
  ligne: string
  /** Nœud représentatif (le seul, ou le dernier membre d'une campagne). */
  noeud: number
  /** Nœuds couverts par le jalon (campagne : expériences ou calculs + observations absorbées). */
  membres: number[]
  /** Date de position (ms) : la date du nœud, ou la dernière date d'une campagne. */
  date: number
  /** Première date couverte (campagne). */
  debut: number
}

export interface Ligne {
  sp: SousProbleme
  debut: number
  fin: number
  /** Piste abandonnée : date et nœud de la décision qui la clôt. */
  abandon: { date: number; decision: number } | null
  /** Nœuds de la ligne sans jalon propre (tirets de densité). */
  mineurs: number[]
  jalons: Jalon[]
  /** Choix de modélisation de la ligne (bannières). */
  choix: Jalon[]
}

export interface Arc {
  genre: 'contredit' | 'resout' | 'remplace' | 'abandonne'
  de: number
  vers: number
  note?: string
}

export interface Registre {
  jeu: JeuRaisonnement
  j: GrapheJustification
  lignes: Ligne[]
  jalons: Jalon[]
  parCle: Map<string, Jalon>
  /** Index de nœud → jalon qui le couvre (ou undefined : nœud mineur). */
  jalonDe: (Jalon | undefined)[]
  dates: number[]
  /** Identifiant citable de chaque nœud (numérotation par type, dans l'ordre chronologique). */
  ident: string[]
  debut: number
  fin: number
  /** Décisions, dans l'ordre chronologique. */
  decisions: Jalon[]
  /** Liens de jalon à jalon entre deux lignes différentes (clés), orientés prémisse → conclusion. */
  correspondances: [string, string][]
  arcs: Arc[]
  /** Clé de décision → clés des choix de modélisation qui la contraignent (prémisses à distance ≤ 2). */
  contraintes: Map<string, string[]>
}

// ─── Numérotation ────────────────────────────────────────────────────────────

const PREFIXES: Record<TypeRaisonnement, string> = {
  hypothese: 'H', definition: 'Df', axiome: 'Ax', choix_modelisation: 'M', decision: 'D', lemme: 'L',
  proposition: 'P', theoreme: 'T', assertion: 'A', experience: 'E', calcul: 'K', observation: 'O',
  resultat: 'R', conjecture: 'C',
}

// ─── Campagnes ───────────────────────────────────────────────────────────────

/** Souche d'un nom de série : « MLMC, h = 1/64 (corrigé) » → « MLMC, h (corrigé) ». */
export function soucheDe(nom: string): string {
  const paren = /\(([^)]*)\)\s*$/.exec(nom)?.[0] ?? ''
  let base = nom.replace(/\([^)]*\)\s*$/, '')
  const deuxPoints = base.indexOf(':')
  if (deuxPoints > 0) base = base.slice(0, deuxPoints)
  else base = base.replace(/[=\d].*$/, '')
  base = base.replace(/[\s,;:=]+$/, '').trim()
  return paren ? `${base} ${paren}` : base
}

// ─── Construction ────────────────────────────────────────────────────────────

const DEMARCHE = new Set<TypeRaisonnement>(['experience', 'calcul', 'observation'])

export function construireRegistre(jeu: JeuRaisonnement): Registre {
  const j = construireJustification(jeu, 'toutes')
  const N = j.noeuds.length
  const n = j.noeuds
  const dates = n.map((x) => Date.parse(x.cree_le))

  // Numérotation chronologique par type.
  const ordre = [...n.keys()].sort((a, b) => dates[a]! - dates[b]! || a - b)
  const compteurs = new Map<string, number>()
  const ident: string[] = new Array(N)
  for (const i of ordre) {
    const p = PREFIXES[n[i]!.type]
    const k = (compteurs.get(p) ?? 0) + 1
    compteurs.set(p, k)
    ident[i] = `${p}${k}`
  }

  const ligneDe = (i: number) => n[i]!.sousProbleme
  // Prémisses principales de la démonstration principale.
  const principalesDe = (i: number): number[] => {
    const d = demonstrationPrincipale(n[i]!)
    if (!d) return []
    return d.premisses.filter((p) => p.role === 'principale').map((p) => j.index.get(p.id)).filter((x): x is number => x !== undefined)
  }
  // Utilisations « principales » : i est prémisse principale de la démonstration principale de c.
  const utilisationsPrincipales = (i: number): number[] =>
    j.sortantes[i]!.map((a) => j.aretes[a]!).filter((a) => a.principale && principalesDe(a.cible).includes(i)).map((a) => a.cible)

  // Liens sémantiques.
  const arcs: Arc[] = []
  const lies = new Set<number>()
  n.forEach((x, i) => {
    for (const l of x.liens ?? []) {
      const c = j.index.get(l.cible)
      if (c === undefined) continue
      arcs.push({ genre: l.genre, de: i, vers: c, note: l.note })
      lies.add(i)
      lies.add(c)
    }
  })

  // 1. Campagnes : ≥ 3 expériences ou calculs de même ligne, même type, même souche de nom.
  const groupes = new Map<string, number[]>()
  n.forEach((x, i) => {
    if ((x.type !== 'experience' && x.type !== 'calcul') || x.admis || lies.has(i)) return
    const cle = `${x.sousProbleme}|${x.type}|${soucheDe(x.nom)}`
    const g = groupes.get(cle)
    if (g) g.push(i)
    else groupes.set(cle, [i])
  })
  const jalonDe: (Jalon | undefined)[] = new Array(N).fill(undefined)
  const jalons: Jalon[] = []
  for (const g of groupes.values()) {
    if (g.length < 3) continue
    const membres = [...g]
    const ensemble = new Set(g)
    // Observations absorbées : toutes leurs prémisses principales sont des membres de la campagne.
    n.forEach((x, i) => {
      if (x.type !== 'observation' || lies.has(i)) return
      const pr = principalesDe(i)
      if (pr.length && pr.every((p) => ensemble.has(p))) membres.push(i)
    })
    const ds = membres.map((i) => dates[i]!)
    const dernier = membres.reduce((a, b) => (dates[b]! > dates[a]! ? b : a))
    const premier = g.reduce((a, b) => (dates[b]! < dates[a]! ? b : a))
    const jal: Jalon = {
      cle: `serie:${n[premier]!.id}`, genre: 'campagne', ident: '', titre: `${soucheDe(n[premier]!.nom)} × ${g.length}`,
      ligne: ligneDe(premier), noeud: dernier, membres, date: Math.max(...ds), debut: Math.min(...ds),
    }
    jalons.push(jal)
    for (const m of membres) jalonDe[m] = jal
  }

  // 2. Jalons individuels.
  const TYPES_CONCLUSION = new Set<TypeRaisonnement>(['decision', 'theoreme', 'resultat', 'proposition', 'conjecture'])
  n.forEach((x, i) => {
    if (jalonDe[i]) return
    let genre: GenreJalon | null = null
    const usages = utilisationsPrincipales(i)
    if (x.type === 'decision') genre = 'decision'
    else if (x.type === 'choix_modelisation') genre = 'choix'
    else if (x.admis) genre = null
    else if (x.type === 'theoreme' || x.type === 'resultat') genre = 'resultat'
    else if (x.type === 'proposition' || x.type === 'conjecture') genre = 'enonce'
    else if (x.type === 'observation') genre = lies.has(i) || usages.some((c) => !DEMARCHE.has(n[c]!.type)) ? 'observation' : null
    else if (x.type === 'experience' || x.type === 'calcul') genre = lies.has(i) || usages.some((c) => TYPES_CONCLUSION.has(n[c]!.type)) ? 'demarche' : null
    else if (lies.has(i) || usages.some((c) => n[c]!.type === 'decision')) genre = 'enonce'
    if (!genre) return
    const jal: Jalon = { cle: x.id, genre, ident: ident[i]!, titre: x.nom, ligne: x.sousProbleme, noeud: i, membres: [i], date: dates[i]!, debut: dates[i]! }
    jalons.push(jal)
    jalonDe[i] = jal
  })

  // Identifiants des campagnes : S1, S2… dans l'ordre chronologique de fin.
  jalons.filter((x) => x.genre === 'campagne').sort((a, b) => a.date - b.date).forEach((x, k) => { x.ident = `S${k + 1}` })
  jalons.sort((a, b) => a.date - b.date || a.cle.localeCompare(b.cle))
  const parCle = new Map(jalons.map((x) => [x.cle, x]))

  // 3. Lignes.
  const lignes: Ligne[] = []
  for (const sp of jeu.sousProblemes) {
    const ids = [...n.keys()].filter((i) => n[i]!.sousProbleme === sp.id)
    if (!ids.length) continue
    let debut = Math.min(...ids.map((i) => dates[i]!))
    let fin = Math.max(...ids.map((i) => dates[i]!))
    let abandon: Ligne['abandon'] = null
    if (sp.abandonne) {
      const a = arcs.find((x) => x.genre === 'abandonne' && n[x.vers]!.sousProbleme === sp.id)
      if (a) {
        abandon = { date: dates[a.de]!, decision: a.de }
        fin = Math.max(fin, dates[a.de]!)
      }
    }
    debut = Math.min(debut, fin)
    lignes.push({
      sp, debut, fin, abandon,
      mineurs: ids.filter((i) => !jalonDe[i]).sort((a, b) => dates[a]! - dates[b]!),
      jalons: jalons.filter((x) => x.ligne === sp.id && x.genre !== 'choix'),
      choix: jalons.filter((x) => x.ligne === sp.id && x.genre === 'choix'),
    })
  }
  // Nœuds dont le sous-problème n'est pas déclaré : ligne « Autres ».
  const connus = new Set(lignes.map((l) => l.sp.id))
  const orphelins = [...n.keys()].filter((i) => !connus.has(n[i]!.sousProbleme))
  if (orphelins.length) {
    const sp: SousProbleme = { id: '__autres', nom: 'Autres', resume: 'Sous-problème non déclaré.' }
    for (const jal of jalons) if (!connus.has(jal.ligne)) jal.ligne = sp.id
    lignes.push({
      sp, debut: Math.min(...orphelins.map((i) => dates[i]!)), fin: Math.max(...orphelins.map((i) => dates[i]!)), abandon: null,
      mineurs: orphelins.filter((i) => !jalonDe[i]),
      jalons: jalons.filter((x) => x.ligne === sp.id && x.genre !== 'choix'),
      choix: jalons.filter((x) => x.ligne === sp.id && x.genre === 'choix'),
    })
  }

  // 4. Correspondances : jalon amont le plus proche (prémisses principales et auxiliaires de la
  //    démonstration principale, à travers les nœuds mineurs), s'il est sur une autre ligne.
  const correspondances: [string, string][] = []
  const vusPaires = new Set<string>()
  for (const jal of jalons) {
    if (jal.genre === 'choix') continue
    const pile: [number, number][] = jal.membres.map((m) => [m, 0])
    const vus = new Set<number>(jal.membres)
    while (pile.length) {
      const [u, prof] = pile.pop()!
      const d = demonstrationPrincipale(n[u]!)
      if (!d || prof > 8) continue
      for (const p of d.premisses) {
        if (p.role !== 'principale' && p.role !== 'auxiliaire') continue
        const v = j.index.get(p.id)
        if (v === undefined || vus.has(v)) continue
        vus.add(v)
        const amont = jalonDe[v]
        if (amont && amont !== jal) {
          if (amont.genre !== 'choix' && amont.ligne !== jal.ligne) {
            const cle = `${amont.cle}>${jal.cle}`
            if (!vusPaires.has(cle)) {
              vusPaires.add(cle)
              correspondances.push([amont.cle, jal.cle])
            }
          }
          continue
        }
        if (!n[v]!.admis) pile.push([v, prof + 1])
      }
    }
  }

  // 5. Contraintes : choix de modélisation parmi les prémisses (tous rôles) à distance ≤ 2.
  const contraintes = new Map<string, string[]>()
  for (const jal of jalons) {
    if (jal.genre !== 'decision') continue
    const trouves = new Set<string>()
    let front = [jal.noeud]
    for (let prof = 0; prof < 2; prof++) {
      const suivant: number[] = []
      for (const u of front) for (const a of j.entrantes[u]!) {
        const v = j.aretes[a]!.source
        if (n[v]!.type === 'choix_modelisation') trouves.add(n[v]!.id)
        else suivant.push(v)
      }
      front = suivant
    }
    if (trouves.size) contraintes.set(jal.cle, [...trouves].sort((a, b) => dates[j.index.get(a)!]! - dates[j.index.get(b)!]!))
  }

  return {
    jeu, j, lignes, jalons, parCle, jalonDe, dates, ident,
    debut: Math.min(...dates), fin: Math.max(...dates),
    decisions: jalons.filter((x) => x.genre === 'decision'),
    correspondances, arcs, contraintes,
  }
}

// ─── Requêtes ────────────────────────────────────────────────────────────────

/** Nœuds liés à un jalon dans le graphe complet : amont, aval et lui-même. */
export function voisinageDe(r: Registre, jal: Jalon): { amont: Set<number>; aval: Set<number> } {
  const amont = new Set<number>()
  const aval = new Set<number>()
  for (const m of jal.membres) {
    for (const x of antecedentsDe(r.j, m)) amont.add(x)
    for (const x of dependantsDe(r.j, m)) aval.add(x)
  }
  for (const m of jal.membres) {
    amont.delete(m)
    aval.delete(m)
  }
  return { amont, aval }
}

/** Portée d'un nœud : tout ce qui en dépend (graphe complet). */
export function porteeDe(r: Registre, i: number): number[] {
  return dependantsDe(r.j, i)
}

/** Nœud par identifiant. */
export function noeudDe(r: Registre, id: string): number | undefined {
  return r.j.index.get(id)
}
