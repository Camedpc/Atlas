// R25 · Audit des hypothèses et de la confiance : calculs purs (aucun DOM).
//
// Lignes = résultats majeurs (théorèmes, propositions, résultats, conjectures non admis).
// Colonnes = conditions (hypothèses H, choix de modélisation M, décisions Déc).
// Cellule = dépendance directe (2) ou transitive (1) dans le graphe de justification complet.
// Confiance déclarée (nœud) contre confiance propagée le long de la chaîne principale.
// Contrefactuel : retirer des conditions et recalculer ce qui tombe, démonstration par démonstration.

import {
  construireJustification, antecedentsDe, dependantsDe, demonstrationPrincipale,
  SOUS_PROBLEMES,
  type JeuRaisonnement, type NoeudR, type GrapheJustification, type RolePremisse,
  type DemonstrationR, type Confiance, type TypeRaisonnement,
} from '../../src/raisonnement/donnees'

// ─── Réglages ────────────────────────────────────────────────────────────────

/** Règle de combinaison des confiances le long d'une chaîne : c'est un choix épistémique, exposé. */
export type Regle = 'min' | 'produit' | 'frechet'
export const LIBELLES_REGLE: Record<Regle, string> = {
  min: 'min (maillon le plus faible)',
  produit: 'produit (indépendance)',
  frechet: 'Fréchet (sans indépendance)',
}
export const DESCRIPTIONS_REGLE: Record<Regle, string> = {
  min: 'P(A∧B) ≤ min(P(A), P(B)) : borne haute de la conjonction, optimiste dès que les maillons sont nombreux.',
  produit: 'Π pᵢ : exact si les inférences sont indépendantes, hypothèse rarement justifiée dans une preuve.',
  frechet: '[max(0, 1 − Σ(1 − basᵢ)), min hautᵢ] : bornes de Fréchet, valables sans hypothèse d’indépendance ; point = produit.',
}

export type Profondeur = 'principale' | 'auxiliaire' | 'technique'
export const ROLES_SUIVIS: Record<Profondeur, RolePremisse[]> = {
  principale: ['principale'],
  auxiliaire: ['principale', 'auxiliaire'],
  technique: ['principale', 'auxiliaire', 'technique'],
}

export interface ReglagesAudit {
  regle: Regle
  profondeur: Profondeur
  /** Sous ce seuil (ou si invalide), le verdict passe au modèle de recours (ATLAS_SEUIL_CONFIANCE). */
  seuilRecours: number
}
export const REGLAGES_DEFAUT: ReglagesAudit = { regle: 'min', profondeur: 'principale', seuilRecours: 0.7 }

// ─── Identifiants courts, stables et citables ────────────────────────────────

const PREFIXES: Record<TypeRaisonnement, string> = {
  hypothese: 'H', choix_modelisation: 'M', decision: 'Déc', definition: 'Déf', axiome: 'Ax', lemme: 'Lem',
  proposition: 'Prop', theoreme: 'Thm', assertion: 'As', experience: 'Exp', calcul: 'Calc',
  observation: 'Obs', resultat: 'Rés', conjecture: 'Conj',
}

/** Numérotation par type dans l'ordre du jeu (ordre de création) ; outils et références admis à part. */
export function calculerSigles(noeuds: NoeudR[]): string[] {
  const compteurs = new Map<string, number>()
  return noeuds.map((n) => {
    const p = n.admis && n.type === 'lemme' ? 'Out' : n.admis && n.type === 'theoreme' ? 'Réf' : PREFIXES[n.type]
    const k = (compteurs.get(p) ?? 0) + 1
    compteurs.set(p, k)
    return p.length === 1 ? `${p}${k}` : `${p} ${k}`
  })
}

// ─── Accès à la confiance (un seul point, pour basculer vers la base) ───────

/**
 * Confiance d'une démonstration. En base, `validite` et `confiance` vivent sur la démonstration ;
 * le prototype la porte sur le nœud : la démonstration principale hérite de celle du nœud.
 */
export function confianceDemonstration(n: NoeudR, _d: DemonstrationR | undefined): Confiance {
  return n.confiance
}
/** Confiance déclarée d'un résultat = celle de sa démonstration principale. */
export const confianceDeclaree = (n: NoeudR): Confiance => confianceDemonstration(n, demonstrationPrincipale(n))

export function combiner(intervalles: Confiance[], regle: Regle): Confiance {
  if (!intervalles.length) return { estimation: 1, bas: 1, haut: 1 }
  const min = (f: (c: Confiance) => number) => Math.min(...intervalles.map(f))
  const produit = (f: (c: Confiance) => number) => intervalles.reduce((a, c) => a * f(c), 1)
  if (regle === 'min') return { estimation: min((c) => c.estimation), bas: min((c) => c.bas), haut: min((c) => c.haut) }
  if (regle === 'produit') return { estimation: produit((c) => c.estimation), bas: produit((c) => c.bas), haut: produit((c) => c.haut) }
  const bas = Math.max(0, 1 - intervalles.reduce((a, c) => a + (1 - c.bas), 0))
  const haut = min((c) => c.haut)
  return { estimation: Math.min(haut, Math.max(bas, produit((c) => c.estimation))), bas, haut }
}

// ─── Structure de l'audit ────────────────────────────────────────────────────

export type Famille = 'hypothese' | 'choix' | 'decision'
export const FAMILLES: Famille[] = ['hypothese', 'choix', 'decision']
export const LIBELLES_FAMILLE: Record<Famille, string> = { hypothese: 'Hypothèses', choix: 'Choix de modélisation', decision: 'Décisions' }
const FAMILLE_DE: Partial<Record<TypeRaisonnement, Famille>> = { hypothese: 'hypothese', choix_modelisation: 'choix', decision: 'decision' }

/** Types qui arrêtent la chaîne d'inférences : ce sont des conditions (colonnes), pas des inférences. */
const ARRETS = new Set<TypeRaisonnement>(['hypothese', 'choix_modelisation', 'decision'])
const TYPES_LIGNES = new Set<TypeRaisonnement>(['theoreme', 'proposition', 'resultat', 'conjecture'])

export interface ColonneAudit {
  k: number
  i: number
  noeud: NoeudR
  sigle: string
  famille: Famille
  /** Condition elle-même incertaine ou réfutée. */
  fragile: boolean
  /** Lignes touchées (directement ou non). */
  touches: number
  directes: number
}

export interface Contradiction {
  source: number
  cible: number
  /** Nœud qui résout (lien `resout`), s'il existe. */
  par: number | null
}

export interface LigneAudit {
  i: number
  noeud: NoeudR
  sigle: string
  abandonnee: boolean
  /** 0 = indépendant, 1 = transitif, 2 = direct ; une entrée par colonne. */
  deps: Uint8Array
  nDirectes: number
  nTransitives: number
  /** Dépend d'une condition fragile. */
  fragile: boolean
  declaree: Confiance
  /** Inférences de la chaîne principale (indices de nœuds), la ligne comprise. */
  chaine: number[]
  propagee: Confiance
  maillon: number
  ecart: number
  /** Observations qui soutiennent (les plus proches le long de la chaîne, hors contradictions). */
  soutiens: number[]
  contradictionsActives: Contradiction[]
  contradictionsResolues: Contradiction[]
  /** Antécédents (tout le graphe) : masque par nœud. */
  antecedents: Uint8Array
}

export interface Audit {
  jeu: JeuRaisonnement
  j: GrapheJustification
  sigles: string[]
  colonnes: ColonneAudit[]
  lignes: LigneAudit[]
  /** Ordre topologique (prémisses d'abord). */
  topo: number[]
  reglages: ReglagesAudit
}

function ordreTopologique(j: GrapheJustification): number[] {
  const n = j.noeuds.length
  const degre = new Int32Array(n)
  for (const a of j.aretes) degre[a.cible]!++
  const file: number[] = []
  for (let i = 0; i < n; i++) if (!degre[i]) file.push(i)
  const res: number[] = []
  while (file.length) {
    const u = file.shift()!
    res.push(u)
    for (const a of j.sortantes[u]!) {
      const v = j.aretes[a]!.cible
      if (!--degre[v]!) file.push(v)
    }
  }
  // Par sécurité (cycle improbable) : les restants dans l'ordre du jeu.
  if (res.length < n) for (let i = 0; i < n; i++) if (!res.includes(i)) res.push(i)
  return res
}

/** Inférences de la chaîne principale : démonstration principale, rôles suivis, arrêt aux conditions. */
export function chainePrincipale(j: GrapheJustification, r: number, roles: RolePremisse[]): number[] {
  const vus = new Uint8Array(j.noeuds.length)
  const pile = [r]
  const res: number[] = []
  while (pile.length) {
    const u = pile.pop()!
    if (vus[u]) continue
    vus[u] = 1
    const n = j.noeuds[u]!
    if (u !== r && ARRETS.has(n.type)) continue
    if (!n.admis && n.demonstrations.length) res.push(u)
    const d = demonstrationPrincipale(n)
    if (!d) continue
    for (const p of d.premisses) {
      if (!roles.includes(p.role)) continue
      const v = j.index.get(p.id)
      if (v !== undefined && !vus[v]) pile.push(v)
    }
  }
  return res
}

/** Observations les plus proches le long de la chaîne (on s'arrête à la première observation rencontrée). */
function soutiensEmpiriques(j: GrapheJustification, r: number, roles: RolePremisse[], contradicteurs: Set<number>): number[] {
  const vus = new Uint8Array(j.noeuds.length)
  const pile = [r]
  const res: number[] = []
  while (pile.length) {
    const u = pile.pop()!
    if (vus[u]) continue
    vus[u] = 1
    const n = j.noeuds[u]!
    if (u !== r) {
      if (ARRETS.has(n.type)) continue
      if (n.type === 'observation') {
        if (!contradicteurs.has(u)) res.push(u)
        continue
      }
    }
    const d = demonstrationPrincipale(n)
    if (!d) continue
    for (const p of d.premisses) {
      if (!roles.includes(p.role)) continue
      const v = j.index.get(p.id)
      if (v !== undefined) pile.push(v)
    }
  }
  return res.sort((a, b) => a - b)
}

export function construireAudit(jeu: JeuRaisonnement, reglages: ReglagesAudit): Audit {
  const j = construireJustification(jeu, 'toutes')
  const sigles = calculerSigles(j.noeuds)
  const topo = ordreTopologique(j)
  const roles = ROLES_SUIVIS[reglages.profondeur]

  // Colonnes, groupées par famille, dans l'ordre du jeu.
  const colonnes: ColonneAudit[] = []
  for (const f of FAMILLES) {
    j.noeuds.forEach((n, i) => {
      if (FAMILLE_DE[n.type] !== f) return
      colonnes.push({ k: colonnes.length, i, noeud: n, sigle: sigles[i]!, famille: f, fragile: n.statut !== 'valide', touches: 0, directes: 0 })
    })
  }

  // Liens sémantiques : contradictions et résolutions.
  const contredit: { source: number; cible: number }[] = []
  const resolveur = new Map<number, number>()
  j.noeuds.forEach((n, s) => {
    for (const l of n.liens ?? []) {
      const c = j.index.get(l.cible)
      if (c === undefined) continue
      if (l.genre === 'contredit') contredit.push({ source: s, cible: c })
      if (l.genre === 'resout') resolveur.set(c, s)
    }
  })
  const contradicteurs = new Set(contredit.map((c) => c.source))

  // Lignes : ordre par sous-problème (piste abandonnée en dernier), puis ordre du jeu.
  const rangSp = new Map(SOUS_PROBLEMES.map((s, k) => [s.id, s.abandonne ? 100 + k : k]))
  const indices = j.noeuds.map((_, i) => i).filter((i) => TYPES_LIGNES.has(j.noeuds[i]!.type) && !j.noeuds[i]!.admis)
  indices.sort((a, b) => {
    const na = j.noeuds[a]!, nb = j.noeuds[b]!
    const ra = na.piste === 'abandonnee' ? 200 : rangSp.get(na.sousProbleme) ?? 50
    const rb = nb.piste === 'abandonnee' ? 200 : rangSp.get(nb.sousProbleme) ?? 50
    return ra - rb || a - b
  })

  const lignes: LigneAudit[] = indices.map((r) => {
    const n = j.noeuds[r]!
    const antecedents = new Uint8Array(j.noeuds.length)
    for (const v of antecedentsDe(j, r)) antecedents[v] = 1
    const directs = new Set(j.entrantes[r]!.map((a) => j.aretes[a]!.source))
    const deps = new Uint8Array(colonnes.length)
    let nDirectes = 0, nTransitives = 0, fragile = false
    for (const c of colonnes) {
      const d = directs.has(c.i) ? 2 : antecedents[c.i] ? 1 : 0
      deps[c.k] = d
      if (d === 2) nDirectes++
      if (d === 1) nTransitives++
      if (d) {
        c.touches++
        if (d === 2) c.directes++
        if (c.fragile) fragile = true
      }
    }
    const chaine = chainePrincipale(j, r, roles)
    const intervalles = chaine.map((u) => confianceDemonstration(j.noeuds[u]!, demonstrationPrincipale(j.noeuds[u]!)))
    const propagee = combiner(intervalles, reglages.regle)
    let maillon = r
    for (const u of chaine) if (j.noeuds[u]!.confiance.estimation < j.noeuds[maillon]!.confiance.estimation) maillon = u
    const declaree = confianceDeclaree(n)
    const dansChaine = (x: number) => x === r || antecedents[x] === 1
    const contradictionsActives: Contradiction[] = []
    const contradictionsResolues: Contradiction[] = []
    for (const c of contredit) {
      const par = resolveur.get(c.cible) ?? null
      if (dansChaine(c.cible)) (par === null ? contradictionsActives : contradictionsResolues).push({ ...c, par })
      else if (par !== null && dansChaine(par)) contradictionsResolues.push({ ...c, par })
    }
    return {
      i: r, noeud: n, sigle: sigles[r]!, abandonnee: n.piste === 'abandonnee',
      deps, nDirectes, nTransitives, fragile, declaree, chaine, propagee, maillon,
      ecart: declaree.estimation - propagee.estimation,
      soutiens: soutiensEmpiriques(j, r, roles, contradicteurs),
      contradictionsActives, contradictionsResolues, antecedents,
    }
  })

  return { jeu, j, sigles, colonnes, lignes, topo, reglages }
}

// ─── Chemins et rôles (inspection d'une cellule) ─────────────────────────────

/** Plus court chemin de dépendance de `depuis` vers `vers` (indices de nœuds), ou [] s'il n'y en a pas. */
export function cheminDependance(j: GrapheJustification, depuis: number, vers: number): number[] {
  const precedent = new Int32Array(j.noeuds.length).fill(-1)
  precedent[depuis] = depuis
  const file = [depuis]
  while (file.length) {
    const u = file.shift()!
    if (u === vers) break
    for (const a of j.sortantes[u]!) {
      const v = j.aretes[a]!.cible
      if (precedent[v] === -1) {
        precedent[v] = u
        file.push(v)
      }
    }
  }
  if (precedent[vers] === -1) return []
  const chemin = [vers]
  while (chemin[0] !== depuis) chemin.unshift(precedent[chemin[0]!]!)
  return chemin
}

/** Rôle d'une prémisse directe (le plus fort) et démonstrations qui la citent. */
export function roleDirect(j: GrapheJustification, premisse: number, conclusion: number): { role: RolePremisse; demonstrations: string[]; principale: boolean } | null {
  for (const a of j.entrantes[conclusion]!) {
    const x = j.aretes[a]!
    if (x.source === premisse) return { role: x.role, demonstrations: x.demonstrations, principale: x.principale }
  }
  return null
}

// ─── Contrefactuel (« tearing ») ─────────────────────────────────────────────

export interface Retrait {
  /** Nœuds qui tombent : toutes leurs démonstrations utilisables citent un nœud tombé. */
  tombes: Uint8Array
  /** Dépendants (portée brute `dependantsDe`) qui ne tombent pas. */
  exposes: Uint8Array
  /** Nœuds sauvés : démonstration principale atteinte, mais une autre démonstration tient. */
  sauveurs: Map<number, DemonstrationR>
  nTombes: number
}

/**
 * Un nœud tombe si toutes ses démonstrations utilisables (non invalides ; toutes si aucune ne l'est)
 * citent au moins une prémisse tombée, quel que soit son rôle. Plus fin que `dependantsDe`, qui compte
 * aussi les nœuds sauvés par une démonstration alternative.
 */
export function calculerRetrait(audit: Audit, retires: Iterable<number>): Retrait {
  const { j, topo } = audit
  const n = j.noeuds.length
  const tombes = new Uint8Array(n)
  const exposes = new Uint8Array(n)
  const sauveurs = new Map<number, DemonstrationR>()
  const ensemble = new Set(retires)
  for (const r of ensemble) tombes[r] = 1
  const atteinte = (d: DemonstrationR) => d.premisses.some((p) => {
    const v = j.index.get(p.id)
    return v !== undefined && tombes[v] === 1
  })
  for (const v of topo) {
    if (tombes[v]) continue
    const noeud = j.noeuds[v]!
    if (!noeud.demonstrations.length) continue
    let utilisables = noeud.demonstrations.filter((d) => d.validite !== 'invalide')
    if (!utilisables.length) utilisables = noeud.demonstrations
    const atteintes = utilisables.map(atteinte)
    if (atteintes.every(Boolean)) tombes[v] = 1
    else if (atteintes.some(Boolean)) {
      const princ = demonstrationPrincipale(noeud)
      if (princ && atteinte(princ)) sauveurs.set(v, utilisables[atteintes.indexOf(false)]!)
    }
  }
  for (const r of ensemble) for (const v of dependantsDe(j, r)) if (!tombes[v]) exposes[v] = 1
  let nTombes = 0
  for (let v = 0; v < n; v++) if (tombes[v] && !ensemble.has(v)) nTombes++
  return { tombes, exposes, sauveurs, nTombes }
}

// ─── Tri, filtre et export ───────────────────────────────────────────────────

export type Tri = 'sous_probleme' | 'declaree' | 'propagee' | 'dependances' | 'ecart'
export const LIBELLES_TRI: Record<Tri, string> = {
  sous_probleme: 'sous-problème',
  declaree: 'confiance déclarée ↑',
  propagee: 'confiance propagée ↑',
  dependances: 'nombre de dépendances ↓',
  ecart: 'écart déclarée − propagée ↓',
}

export function trier(lignes: LigneAudit[], tri: Tri): LigneAudit[] {
  const l = [...lignes]
  if (tri === 'declaree') l.sort((a, b) => a.declaree.estimation - b.declaree.estimation)
  else if (tri === 'propagee') l.sort((a, b) => a.propagee.estimation - b.propagee.estimation)
  else if (tri === 'dependances') l.sort((a, b) => b.nDirectes + b.nTransitives - (a.nDirectes + a.nTransitives))
  else if (tri === 'ecart') l.sort((a, b) => b.ecart - a.ecart)
  return l
}

const nombre = (x: number) => x.toFixed(2)

export function exporterCsv(audit: Audit, lignes: LigneAudit[], retrait: Retrait | null): string {
  const { sigles, colonnes } = audit
  const echapper = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const entete = [
    'id', 'sigle', 'type', 'titre', 'statut', 'validation', 'sous_probleme', 'piste',
    'conf_estimation', 'conf_bas', 'conf_haut', `propagee_${audit.reglages.regle}_estimation`, 'propagee_bas', 'propagee_haut',
    'ecart', 'maillon_faible', 'inferences_chaine', 'dependances_directes', 'dependances_transitives',
    'soutiens', 'contradictions_actives', 'contradictions_resolues', 'suspendu',
    ...colonnes.map((c) => c.sigle),
  ]
  const lignesCsv = lignes.map((l) => [
    l.noeud.id, l.sigle, l.noeud.type, l.noeud.nom, l.noeud.statut, l.noeud.validation, l.noeud.sousProbleme, l.noeud.piste,
    nombre(l.declaree.estimation), nombre(l.declaree.bas), nombre(l.declaree.haut),
    nombre(l.propagee.estimation), nombre(l.propagee.bas), nombre(l.propagee.haut),
    nombre(l.ecart), sigles[l.maillon]!, String(l.chaine.length), String(l.nDirectes), String(l.nTransitives),
    String(l.soutiens.length), String(l.contradictionsActives.length), String(l.contradictionsResolues.length),
    retrait?.tombes[l.i] ? 'oui' : 'non',
    ...colonnes.map((c) => (l.deps[c.k] === 2 ? 'D' : l.deps[c.k] === 1 ? 'T' : '')),
  ].map(echapper).join(';'))
  return [entete.map(echapper).join(';'), ...lignesCsv].join('\n')
}
