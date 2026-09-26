// Graphe de raisonnement : modèle de données du moteur et graphe de justification.
//
// Le modèle suit Atlas (atlas/modeles.py) : cinq statuts recalculés par le serveur, validité et
// confiance portées par la démonstration. L'adaptateur `../donneesAtlas.ts` traduit GET /api/graphe
// vers ce modèle ; les champs absents en base (type, rôles des prémisses, sous-problème, décisions…)
// sont déduits quand c'est sûr, sinon laissés vides (« non renseigné »).


// ─── Types ───────────────────────────────────────────────────────────────────

export const TYPES_RAISONNEMENT = [
  'hypothese', 'definition', 'axiome', 'choix_modelisation', 'decision', 'lemme', 'proposition',
  'theoreme', 'assertion', 'experience', 'calcul', 'observation', 'resultat', 'conjecture',
] as const
export type TypeRaisonnement = (typeof TYPES_RAISONNEMENT)[number]

export const LIBELLES_TYPE: Record<TypeRaisonnement, string> = {
  hypothese: 'Hypothèse',
  definition: 'Définition',
  axiome: 'Axiome',
  choix_modelisation: 'Choix de modélisation',
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

/** Rôle d'une prémisse dans une démonstration (annoté par l'agent rédacteur). */
export const ROLES_PREMISSE = ['principale', 'auxiliaire', 'technique', 'contexte'] as const
export type RolePremisse = (typeof ROLES_PREMISSE)[number]
export const LIBELLES_ROLE: Record<RolePremisse, string> = {
  principale: 'Principale',
  auxiliaire: 'Auxiliaire',
  technique: 'Technique',
  contexte: 'Contexte',
}
/** Force d'un rôle (plus grand = plus proche de la déduction). Sert à fusionner les doublons. */
export const FORCE_ROLE: Record<RolePremisse, number> = { principale: 3, auxiliaire: 2, technique: 1, contexte: 0 }

export const ORIGINES = ['humain', 'ia', 'ordinateur'] as const
export type Origine = (typeof ORIGINES)[number]
/** Statut effectif d'un nœud, calculé par atlas/graphe.py (jamais stocké). */
export const STATUTS = ['etabli', 'suspendu', 'a_verifier', 'invalide', 'ouvert'] as const
export type Statut = (typeof STATUTS)[number]
export type Validite = 'a_verifier' | 'valide' | 'invalide'

export const LIBELLES_ORIGINE: Record<Origine, string> = { humain: 'Humain', ia: 'IA', ordinateur: 'Ordinateur' }
export const LIBELLES_STATUT: Record<Statut, string> = {
  etabli: 'Établi', suspendu: 'Suspendu', a_verifier: 'À vérifier', invalide: 'Invalide', ouvert: 'Ouvert',
}
export const LIBELLES_VALIDITE: Record<Validite, string> = { a_verifier: 'À vérifier', valide: 'Valide', invalide: 'Invalide' }

export interface Premisse {
  id: string
  role: RolePremisse
}

export interface DemonstrationR {
  nom: string
  premisses: Premisse[]
  validite: Validite
  auteur: string
  /** Date ISO. */
  cree_le: string
  texte?: string
  /** Note sur 1 (prévue en base, absente pour l'instant). */
  confiance?: number | null
}

export interface Alternative {
  libelle: string
  retenue: boolean
  /** Pourquoi elle a été retenue ou rejetée. */
  raison?: string
}

/** Nœud « décision » : un choix fait pendant la recherche. */
export interface InfoDecision {
  question: string
  alternatives: Alternative[]
  raison: string
  /** Date ISO de la décision. */
  date: string
  auteur: string
}

/** Nœud « choix de modélisation » : une hypothèse de travail qui conditionne la suite. */
export interface InfoChoix {
  /** L'hypothèse de travail, formulée simplement. */
  hypothese: string
  /** Portée déclarée (texte) ; la portée calculée est `dependantsDe(j, i)`. */
  portee: string
  /** Autres modélisations possibles. */
  alternatives?: string[]
}

/** Lien hors justification (ne participe pas à la validité). */
export interface LienSemantique {
  genre: 'contredit' | 'resout' | 'remplace' | 'abandonne'
  cible: string
  note?: string
}

export interface SousProbleme {
  id: string
  nom: string
  resume: string
  /** Piste abandonnée : gardée pour mémoire. */
  abandonne?: boolean
}

export interface NoeudR {
  id: string
  nom: string
  enonce: string
  type: TypeRaisonnement
  /** Vrai si le type est déduit (identifiant, position dans le graphe) faute d'être stocké. */
  typeDeduit: boolean
  /** Non renseigné en base pour l'instant. */
  origine?: Origine
  auteur: string
  /** Date ISO. */
  cree_le: string
  /** Conversation qui a créé le nœud (noeuds.conversation_id). */
  conversation: string | null
  sousProbleme: string | null
  piste?: 'active' | 'abandonnee'
  statut: Statut
  /** Confiance agrégée pour l'affichage (démonstration principale), null si non renseignée. */
  confiance: number | null
  /** Axiome, définition ou résultat connu : établi sans démonstration. */
  admis: boolean
  demonstrations: DemonstrationR[]
  decision?: InfoDecision
  choix?: InfoChoix
  liens?: LienSemantique[]
}

export interface JeuRaisonnement {
  titre: string
  resume: string
  sousProblemes: SousProbleme[]
  noeuds: NoeudR[]
  source: 'api' | 'test'
}

// ─── Graphe de justification (toutes les prémisses) ─────────────────────────

export interface AreteJustification {
  index: number
  /** Indices de nœuds : prémisse → nœud justifié. */
  source: number
  cible: number
  /** Rôle le plus fort parmi les démonstrations retenues. */
  role: RolePremisse
  /** Démonstrations (noms) qui citent cette prémisse. */
  demonstrations: string[]
  /** Vrai si la prémisse figure dans la démonstration principale du nœud. */
  principale: boolean
}

export interface GrapheJustification {
  jeu: JeuRaisonnement
  noeuds: NoeudR[]
  index: Map<string, number>
  aretes: AreteJustification[]
  /** Indices d'arêtes entrantes (prémisses) et sortantes (utilisations) par nœud. */
  entrantes: number[][]
  sortantes: number[][]
}

/**
 * Démonstration principale d'un nœud : la première valide, sinon la première à vérifier,
 * sinon la première. C'est elle que suit le graphe de lecture par défaut.
 */
export function demonstrationPrincipale(n: NoeudR): DemonstrationR | undefined {
  return n.demonstrations.find((d) => d.validite === 'valide') ?? n.demonstrations.find((d) => d.validite === 'a_verifier') ?? n.demonstrations[0]
}

/**
 * Construit le graphe de justification. `demonstrations` : 'toutes' (défaut, graphe exhaustif
 * comme en base) ou 'principale' (seulement la démonstration principale de chaque nœud).
 * Les doublons (même prémisse dans plusieurs démonstrations) sont fusionnés en une arête
 * dont le rôle est le plus fort.
 */
export function construireJustification(jeu: JeuRaisonnement, demonstrations: 'toutes' | 'principale' = 'toutes'): GrapheJustification {
  const noeuds = jeu.noeuds
  const index = new Map(noeuds.map((n, i) => [n.id, i]))
  const aretes: AreteJustification[] = []
  const entrantes: number[][] = noeuds.map(() => [])
  const sortantes: number[][] = noeuds.map(() => [])
  noeuds.forEach((n, c) => {
    const princ = demonstrationPrincipale(n)
    const parSource = new Map<number, AreteJustification>()
    for (const d of n.demonstrations) {
      if (demonstrations === 'principale' && d !== princ) continue
      for (const p of d.premisses) {
        const s = index.get(p.id)
        if (s === undefined || s === c) continue
        let a = parSource.get(s)
        if (!a) {
          a = { index: aretes.length, source: s, cible: c, role: p.role, demonstrations: [], principale: false }
          parSource.set(s, a)
          aretes.push(a)
          entrantes[c]!.push(a.index)
          sortantes[s]!.push(a.index)
        }
        if (FORCE_ROLE[p.role] > FORCE_ROLE[a.role]) a.role = p.role
        a.demonstrations.push(d.nom)
        if (d === princ) a.principale = true
      }
    }
  })
  return { jeu, noeuds, index, aretes, entrantes, sortantes }
}

/** Tous les nœuds qui dépendent (transitivement) de i dans le graphe complet : la portée d'un choix. */
export function dependantsDe(j: GrapheJustification, i: number): number[] {
  const vus = new Uint8Array(j.noeuds.length)
  const pile = [i]
  const res: number[] = []
  while (pile.length) {
    const u = pile.pop()!
    for (const a of j.sortantes[u]!) {
      const v = j.aretes[a]!.cible
      if (!vus[v]) {
        vus[v] = 1
        res.push(v)
        pile.push(v)
      }
    }
  }
  return res
}

/** Tous les nœuds dont i dépend (transitivement) dans le graphe complet. */
export function antecedentsDe(j: GrapheJustification, i: number): number[] {
  const vus = new Uint8Array(j.noeuds.length)
  const pile = [i]
  const res: number[] = []
  while (pile.length) {
    const u = pile.pop()!
    for (const a of j.entrantes[u]!) {
      const v = j.aretes[a]!.source
      if (!vus[v]) {
        vus[v] = 1
        res.push(v)
        pile.push(v)
      }
    }
  }
  return res
}
