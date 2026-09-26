// Graphe de raisonnement : modèle de données, jeu synthétique déterministe et adaptateur GET /api/graphe.
//
// Le jeu raconte un projet de recherche crédible : « Convergence forte d'un schéma volumes finis
// pour une équation de transport à bruit multiplicatif », avec trois sous-problèmes (stabilité,
// convergence, validation numérique), une piste abandonnée (compacité stochastique) et une
// contradiction résolue (ordre observé 1/4 au lieu de 1/2 → correction d'Itô ajoutée au schéma).
//
// Extension du schéma Atlas (supabase/migrations/20260925000000_init.sql) nécessaire en base :
// -- à ajouter en base : alter table noeuds add column type text;            -- TypeRaisonnement
// -- à ajouter en base : alter table noeuds add column origine text;         -- humain | ia | ordinateur
// -- à ajouter en base : alter table noeuds add column sous_probleme text;
// -- à ajouter en base : alter table noeuds add column piste text;           -- active | abandonnee
// -- à ajouter en base : alter table noeuds add column validation text;      -- aucune | ia | humain | ia_humain
// -- à ajouter en base : alter table noeuds add column confiance jsonb;      -- {estimation, bas, haut}
// -- à ajouter en base : alter table noeuds add column decision jsonb;       -- InfoDecision
// -- à ajouter en base : alter table noeuds add column choix jsonb;          -- InfoChoix
// -- à ajouter en base : alter table noeuds add column liens jsonb;          -- LienSemantique[]
// -- à ajouter en base : alter table demonstrations add column roles jsonb not null default '{}';
// --                     { "<id prémisse>": "principale" | "auxiliaire" | "contexte" | "technique" }
// --                     annoté par l'agent rédacteur ; une prémisse absente vaut « principale ».

import { creerAlea, clamp } from '../core/maths'

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
export const STATUTS = ['valide', 'incertain', 'refute'] as const
export type Statut = (typeof STATUTS)[number]
export const VALIDATIONS = ['aucune', 'ia', 'humain', 'ia_humain'] as const
export type Validation = (typeof VALIDATIONS)[number]
export type Validite = 'a_verifier' | 'valide' | 'invalide'

export const LIBELLES_ORIGINE: Record<Origine, string> = { humain: 'Humain', ia: 'IA', ordinateur: 'Ordinateur' }
export const LIBELLES_STATUT: Record<Statut, string> = { valide: 'Validé', incertain: 'Incertain', refute: 'Réfuté' }
export const LIBELLES_VALIDATION: Record<Validation, string> = { aucune: 'Aucune', ia: 'IA', humain: 'Humain', ia_humain: 'IA + humain' }
export const LIBELLES_VALIDITE: Record<Validite, string> = { a_verifier: 'À vérifier', valide: 'Valide', invalide: 'Invalide' }

export interface Confiance {
  estimation: number
  bas: number
  haut: number
}

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
  origine: Origine
  auteur: string
  /** Date ISO. */
  cree_le: string
  sousProbleme: string
  piste: 'active' | 'abandonnee'
  statut: Statut
  validation: Validation
  confiance: Confiance
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
  source: 'synthetique' | 'api'
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

// ─── Jeu synthétique ─────────────────────────────────────────────────────────
//
// Mini-langage des prémisses : « a b ~c #d +e | f g »
//   a      prémisse principale (étape de déduction naturelle)
//   +e     auxiliaire (sert, mais secondaire)
//   #d     technique (lemme outil standard)
//   ~c     contexte (définition, axiome, notation, hypothèse générale)
//   |      sépare plusieurs démonstrations du même nœud

interface Options {
  sp?: string
  statut?: Statut
  validation?: Validation
  origine?: Origine
  auteur?: string
  admis?: boolean
  abandon?: boolean
  conf?: [number, number, number]
  /** Noms des démonstrations (sinon noms par défaut selon le type). */
  demos?: string[]
  /** Validité de chaque démonstration. */
  validites?: Validite[]
  decision?: Omit<InfoDecision, 'date' | 'auteur'> & { auteur?: string }
  choix?: InfoChoix
  liens?: LienSemantique[]
  /** Jour minimal (depuis le début du projet). */
  jour?: number
}
type Spec = [id: string, type: TypeRaisonnement, nom: string, enonce: string, premisses: string, options?: Options]

export const SOUS_PROBLEMES: SousProbleme[] = [
  { id: 'cadre', nom: 'Cadre et modélisation', resume: 'Hypothèses, définitions et choix de modélisation communs.' },
  { id: 'stab', nom: 'SP1 · Stabilité du schéma', resume: 'Estimations L² et BV discrètes sous condition CFL.' },
  { id: 'conv', nom: 'SP2 · Convergence forte', resume: "Estimation d'erreur d'ordre 1/2 en norme L²(Ω × 𝕋^d)." },
  { id: 'num', nom: 'SP3 · Validation numérique', resume: 'Monte-Carlo multi-niveaux, taux observés, sensibilité.' },
  { id: 'comp', nom: 'Piste abandonnée · compacité', resume: 'Convergence en loi par tension et Skorokhod : abandonnée (pas d’ordre).', abandonne: true },
]
const DEBUT_SP: Record<string, number> = { cadre: 0, comp: 8, stab: 14, conv: 34, num: 46 }
const DEBUT_PROJET = Date.UTC(2026, 4, 4) // 4 mai 2026
const JOUR = 86_400_000

const PERSONNES = { lea: 'Léa Martin', hugo: 'Hugo Bernard', ia: 'IA · Claude', grappe: 'Grappe de calcul' }

// Fondations : axiomes, outils standard, hypothèses, choix, définitions.
const FONDATIONS: Spec[] = [
  // Axiomes et cadre probabiliste
  ['ax_proba', 'axiome', 'Espace probabilisé filtré', 'On travaille sur (Ω, 𝓕, (𝓕_t)_{t≥0}, ℙ) complet, filtration continue à droite.', '', { sp: 'cadre', admis: true }],
  ['ax_brownien', 'axiome', 'Mouvements browniens indépendants', 'β_1, …, β_K sont des mouvements browniens réels indépendants, adaptés à (𝓕_t).', '~ax_proba', { sp: 'cadre', admis: true }],
  ['ax_isometrie', 'axiome', "Isométrie d'Itô", '𝔼|∫ φ dβ|² = 𝔼 ∫ |φ|² dt pour φ progressivement mesurable de carré intégrable.', '~ax_brownien', { sp: 'cadre', admis: true }],
  ['ax_ito', 'axiome', "Formule d'Itô", 'Pour F de classe C², dF(X) = F′(X) dX + ½ F″(X) d⟨X⟩.', '~ax_brownien', { sp: 'cadre', admis: true }],
  ['ax_fubini', 'axiome', 'Fubini stochastique', "Interversion d'une intégrale de Lebesgue et d'une intégrale d'Itô sous intégrabilité L².", '~ax_isometrie', { sp: 'cadre', admis: true }],
  ['ax_mesurabilite', 'axiome', 'Mesurabilité progressive', 'Les processus discrets u^n sont 𝓕_{t_n}-mesurables.', '~ax_proba', { sp: 'cadre', admis: true }],
  // Outils standard (lemmes admis, rôle « technique »)
  ['lt_gronwall', 'lemme', 'Lemme de Grönwall discret', 'Si a_{n+1} ≤ (1 + CΔt) a_n + b_n, alors a_n ≤ e^{C t_n}(a_0 + Σ b_k).', '', { sp: 'cadre', admis: true }],
  ['lt_bdg', 'lemme', 'Inégalité de Burkholder–Davis–Gundy', '𝔼 sup_t |M_t|^p ≤ C_p 𝔼 ⟨M⟩_T^{p/2} pour une martingale continue M.', '~ax_isometrie', { sp: 'cadre', admis: true }],
  ['lt_doob', 'lemme', 'Inégalité maximale de Doob', '𝔼 max_n |M_n|² ≤ 4 𝔼 |M_N|² pour une martingale discrète.', '~ax_proba', { sp: 'cadre', admis: true }],
  ['lt_young', 'lemme', 'Inégalité de Young', 'ab ≤ ε a²/2 + b²/(2ε) pour tout ε > 0.', '', { sp: 'cadre', admis: true }],
  ['lt_cs', 'lemme', 'Cauchy–Schwarz discret', '|Σ_K |K| u_K v_K| ≤ ‖u‖_h ‖v‖_h.', '', { sp: 'cadre', admis: true }],
  ['lt_ipp', 'lemme', 'Sommation par parties discrète', 'Σ_K Σ_{L∼K} F_{K,L} u_K = −½ Σ_{K,L} F_{K,L}(u_L − u_K) pour un flux conservatif.', '', { sp: 'cadre', admis: true }],
  ['lt_jensen', 'lemme', 'Inégalité de Jensen', 'φ(𝔼X) ≤ 𝔼 φ(X) pour φ convexe.', '', { sp: 'cadre', admis: true }],
  ['lt_kolmogorov', 'lemme', 'Critère de continuité de Kolmogorov', '𝔼|X_t − X_s|^p ≤ C|t − s|^{1+α} donne une version höldérienne.', '~ax_proba', { sp: 'cadre', admis: true }],
  ['lt_prokhorov', 'lemme', 'Théorème de Prokhorov', 'Une famille tendue de lois sur un espace polonais est relativement compacte.', '', { sp: 'comp', admis: true }],
  ['lt_skorokhod', 'lemme', 'Représentation de Skorokhod', 'Une convergence en loi se réalise en convergence p.s. sur un nouvel espace.', '', { sp: 'comp', admis: true }],
  // Résultats de la littérature (admis, cités comme auxiliaires ou outils)
  ['lit_kuznetsov', 'theoreme', 'Kuznetsov : ordre 1/2 déterministe', 'Les schémas monotones pour le transport BV convergent à l’ordre 1/2 en L¹.', '', { sp: 'cadre', admis: true }],
  ['lit_sabac', 'theoreme', 'Şabac : optimalité de l’ordre 1/2', 'L’ordre 1/2 est optimal pour les schémas monotones et données BV.', '', { sp: 'cadre', admis: true }],
  ['lit_bcg', 'theoreme', 'Bauzet–Charrier–Gallouët', 'Convergence (sans ordre) de schémas volumes finis pour des lois de conservation stochastiques.', '', { sp: 'cadre', admis: true }],
  ['lit_gyongy', 'theoreme', 'Critère de Gyöngy–Krylov', 'Convergence en loi + unicité trajectorielle ⇒ convergence en probabilité.', '~ax_proba', { sp: 'cadre', admis: true }],
  ['lit_merlet', 'theoreme', 'Estimations BV stochastiques', 'Estimations BV pour le transport stochastique à coefficients réguliers.', '', { sp: 'cadre', admis: true }],
  // Notations
  ['def_maillage_not', 'definition', 'Notations du maillage', 'Mailles K de volume |K| = h^d, interfaces σ_{K,L} de mesure h^{d−1}, voisins L ∼ K.', '', { sp: 'cadre', admis: true }],
  ['def_temps', 'definition', 'Grille temporelle', 't_n = nΔt, 0 ≤ n ≤ N, NΔt = T.', '', { sp: 'cadre', admis: true }],
  // Hypothèses
  ['h_b_lip', 'hypothese', 'Champ b lipschitzien', 'b ∈ W^{1,∞}(𝕋^d; ℝ^d), de constante de Lipschitz L_b.', '', { sp: 'cadre' }],
  ['h_div', 'hypothese', 'Champ à divergence nulle', 'div b = 0 sur 𝕋^d : le transport conserve le volume.', '~h_b_lip', { sp: 'cadre' }],
  ['h_sigma', 'hypothese', 'Coefficient de bruit borné', 'σ_k ∈ W^{1,∞}(𝕋^d), Σ_k ‖σ_k‖²_{W^{1,∞}} < ∞.', '', { sp: 'cadre' }],
  ['h_u0', 'hypothese', 'Donnée initiale BV ∩ L∞', 'u_0 ∈ BV(𝕋^d) ∩ L^∞(𝕋^d), déterministe.', '', { sp: 'cadre' }],
  ['h_cfl', 'hypothese', 'Condition CFL', 'Δt ≤ θ h / ‖b‖_∞ avec θ < 1.', '~def_maillage_not ~def_temps', { sp: 'cadre' }],
  ['h_regul', 'hypothese', 'Régularité de la solution exacte', 'u ∈ L²(Ω; C([0,T]; H¹(𝕋^d))) avec moments d’ordre 4 bornés.', '~h_u0 ~h_b_lip', { sp: 'conv', statut: 'incertain' }],
  // Choix de modélisation
  ['cm_tore', 'choix_modelisation', 'Domaine périodique 𝕋^d', 'On pose le problème sur le tore pour éviter les termes de bord.', '', {
    sp: 'cadre',
    choix: { hypothese: 'Le domaine est le tore 𝕋^d = (ℝ/ℤ)^d.', portee: 'Toute l’analyse : aucune condition au bord, sommations par parties sans reste.', alternatives: ['Domaine borné avec bord entrant', 'Espace entier ℝ^d avec poids'] },
  }],
  ['cm_bruit', 'choix_modelisation', 'Bruit gaussien de dimension finie', 'W(t, x) = Σ_{k≤K} σ_k(x) β_k(t), blanc en temps, régulier en espace.', '~ax_brownien', {
    sp: 'cadre',
    choix: { hypothese: 'Bruit gaussien blanc en temps, de dimension finie K en espace.', portee: 'Estimations de bruit, schéma, simulations.', alternatives: ['Bruit cylindrique de trace infinie', 'Bruit de Lévy'] },
  }],
  ['cm_strato', 'choix_modelisation', 'Bruit au sens de Stratonovich', 'du + b·∇u dt + Σ_k σ_k·∇u ∘ dβ_k = 0 : l’équation conserve la norme L².', 'cm_bruit ~ax_ito', {
    sp: 'cadre',
    choix: { hypothese: 'L’intégrale stochastique est prise au sens de Stratonovich.', portee: 'Conservation L² de l’équation continue ; impose une correction d’Itô dans tout schéma explicite.', alternatives: ['Bruit au sens d’Itô (non conservatif)'] },
  }],
  ['cm_upwind', 'choix_modelisation', 'Volumes finis décentrés amont', 'Flux numérique upwind sur chaque interface σ_{K,L}.', '~def_maillage_not', {
    sp: 'cadre',
    choix: { hypothese: 'Discrétisation en espace par volumes finis décentrés amont.', portee: 'Consistance d’ordre 1, dissipation numérique, estimations BV.', alternatives: ['Volumes finis centrés', 'Éléments finis de Galerkin discontinus'] },
  }],
  ['cm_maillage', 'choix_modelisation', 'Maillage cartésien uniforme', 'Mailles cubiques de pas h = 1/M.', '~def_maillage_not ~cm_tore', {
    sp: 'cadre',
    choix: { hypothese: 'Le maillage est cartésien et uniforme de pas h.', portee: 'Estimations de consistance, projection Π_h, simulations.', alternatives: ['Maillage admissible quelconque'] },
  }],
  ['dec_explicite', 'decision', 'Schéma explicite plutôt qu’implicite', 'On retient Euler–Maruyama explicite en temps sous CFL.', '+cm_upwind ~cm_bruit', {
    sp: 'cadre',
    decision: {
      question: 'Quelle discrétisation en temps ?',
      alternatives: [
        { libelle: 'θ-schéma implicite', retenue: false, raison: 'Système linéaire aléatoire à chaque pas, coût prohibitif en Monte-Carlo.' },
        { libelle: 'Euler–Maruyama explicite sous CFL', retenue: true, raison: 'Simple, local, compatible avec l’analyse upwind.' },
        { libelle: 'Schéma de Milstein', retenue: false, raison: 'Exige la commutativité des champs σ_k.' },
      ],
      raison: 'Coût de simulation et simplicité de l’analyse ; la CFL est acceptable en transport.',
    },
  }],
  ['cm_euler', 'choix_modelisation', 'Euler–Maruyama explicite', 'u^{n+1} = u^n − Δt A_h u^n + Σ_k B_{h,k} u^n Δβ_k^n.', 'dec_explicite ~def_temps', {
    sp: 'cadre',
    choix: { hypothese: 'Discrétisation en temps d’Euler–Maruyama explicite.', portee: 'Schéma, consistance en temps, condition CFL.', alternatives: ['θ-schéma', 'Milstein'] },
  }],
  // Définitions
  ['def_sol', 'definition', 'Solution faible trajectorielle', 'u adaptée, à valeurs L², vérifiant la formulation faible contre toute fonction test φ ∈ C^∞(𝕋^d).', '~ax_proba ~cm_tore ~cm_strato', { sp: 'cadre', admis: true }],
  ['def_norme', 'definition', 'Norme L²_h discrète', '‖u‖²_h = Σ_K |K| u_K².', '~def_maillage_not', { sp: 'cadre', admis: true }],
  ['def_flux', 'definition', 'Flux numérique décentré amont', 'F_{K,L}(u) = |σ| (b·n)^+ u_K − |σ| (b·n)^- u_L.', 'cm_upwind ~def_maillage_not ~h_b_lip', { sp: 'cadre', admis: true }],
  ['def_increment', 'definition', 'Incrément brownien', 'Δβ_k^n = β_k(t_{n+1}) − β_k(t_n), gaussien centré de variance Δt.', '~ax_brownien ~def_temps', { sp: 'cadre', admis: true }],
  ['def_filtration', 'definition', 'Filtration discrète', '𝓕_n = 𝓕_{t_n} ; Δβ^n est indépendant de 𝓕_n.', '~ax_proba ~def_temps', { sp: 'cadre', admis: true }],
  ['def_schema', 'definition', 'Schéma volumes finis stochastique', 'u_K^{n+1} = u_K^n − (Δt/|K|) Σ_L F_{K,L}(u^n) − Σ_k (σ_k·∇_h u^n)_K Δβ_k^n.', 'cm_upwind cm_euler def_flux ~cm_maillage ~def_increment ~def_maillage_not', { sp: 'cadre', admis: true }],
  ['def_energie', 'definition', 'Énergie discrète', 'E_n = 𝔼 ‖u^n‖²_h.', '~def_norme', { sp: 'cadre', admis: true }],
  ['def_diffnum', 'definition', 'Diffusion numérique', 'D_h(u) = ½ Σ_{K,L} |σ| |b·n| (u_L − u_K)² ≥ 0.', 'def_flux ~def_maillage_not', { sp: 'cadre', admis: true }],
  ['def_bv', 'definition', 'Variation totale discrète', '|u|_{BV,h} = Σ_{σ_{K,L}} |σ| |u_L − u_K|.', '~def_maillage_not', { sp: 'cadre', admis: true }],
  ['def_projection', 'definition', 'Projection sur les mailles', '(Π_h v)_K = (1/|K|) ∫_K v.', '~def_maillage_not ~cm_maillage', { sp: 'cadre', admis: true }],
  ['def_erreur', 'definition', 'Erreur discrète', 'e^n = u^n − Π_h u(t_n).', 'def_projection ~def_sol', { sp: 'conv', admis: true }],
  ['def_module', 'definition', 'Module de continuité en temps', 'ω(δ) = sup_{|t−s|≤δ} (𝔼‖u(t) − u(s)‖²)^{1/2}.', '~def_sol', { sp: 'conv', admis: true }],
  ['def_ordre', 'definition', 'Ordre de convergence forte', 'Ordre α si (𝔼‖e^n‖²_h)^{1/2} ≤ C (h + Δt)^α uniformément en n.', '~def_erreur ~def_norme', { sp: 'conv', admis: true }],
  ['def_ito_corr', 'definition', "Terme de correction d'Itô", 'c_h(u) = ½ Σ_k (σ_k·∇_h)(σ_k·∇_h u) Δt.', 'cm_strato ~def_increment ~def_maillage_not', { sp: 'conv', admis: true }],
  ['def_estim_mc', 'definition', 'Estimateur Monte-Carlo de l’erreur', 'Ê_M = (1/M) Σ_{m≤M} ‖u_h^{(m)} − u_ref^{(m)}‖²_h, trajectoires couplées.', '~def_norme', { sp: 'num', admis: true }],
  ['def_taux', 'definition', 'Taux observé', 'Pente de la droite de régression de log Ê en fonction de log h.', '~def_estim_mc', { sp: 'num', admis: true }],
  ['def_tension', 'definition', 'Tension d’une famille de lois', 'Pour tout ε, un compact K_ε de masse ≥ 1 − ε sous toutes les lois.', '~ax_proba', { sp: 'comp', admis: true }],
  ['def_trajectoires', 'definition', 'Espace des trajectoires', '𝒳 = C([0,T]; H^{−1}(𝕋^d)) ∩ L²(0,T; L²(𝕋^d)) faible.', '~cm_tore', { sp: 'comp', admis: true }],
]

// SP1 · Stabilité
const STABILITE: Spec[] = [
  ['lem_masse', 'lemme', 'Conservation de la masse discrète', 'Σ_K |K| u_K^n = Σ_K |K| u_K^0 presque sûrement.', 'def_schema ~h_div ~def_maillage_not #lt_ipp', { sp: 'stab' }],
  ['lem_positif', 'lemme', 'Coefficients positifs sous CFL', 'Sous CFL, u^{n+1} est une combinaison convexe de u^n plus un terme de bruit.', 'def_schema h_cfl ~def_flux ~def_maillage_not', { sp: 'stab' }],
  ['calc_von_neumann', 'calcul', 'Facteur d’amplification de von Neumann', 'Calcul symbolique de |G(ξ)|² pour le schéma sans bruit sur 𝕋^1.', 'def_schema ~cm_tore ~cm_maillage', { sp: 'stab', origine: 'ordinateur' }],
  ['as_cfl_necessaire', 'assertion', 'La CFL est nécessaire', '|G(ξ)| > 1 pour θ > 1 : le schéma explose sans condition CFL.', 'calc_von_neumann ~h_cfl', { sp: 'stab' }],
  ['st_1', 'assertion', 'Développement de ‖u^{n+1}‖²_h', 'On développe le carré en isolant transport, bruit et produit croisé.', 'def_schema def_energie ~def_norme ~def_maillage_not', { sp: 'stab' }],
  ['st_2', 'assertion', 'Réécriture du transport par sommation', 'Le terme de transport devient −Δt D_h(u^n) + reste antisymétrique nul.', 'st_1 ~def_flux #lt_ipp ~h_div', { sp: 'stab' }],
  ['lem_energie', 'lemme', 'Identité d’énergie discrète', '‖u^{n+1}‖²_h = ‖u^n‖²_h − 2Δt D_h(u^n) + Δt² ‖A_h u^n‖²_h + M^n + Q^n.', 'st_2 ~def_energie #ax_ito', { sp: 'stab', demos: ['Par développement direct', 'Par formule d’Itô discrète'], validites: ['valide', 'a_verifier'] }],
  ['lem_dissipation', 'lemme', 'Dissipation numérique dominante', 'Sous CFL, 2Δt D_h(u) − Δt² ‖A_h u‖²_h ≥ (1 − θ) Δt D_h(u) ≥ 0.', 'lem_energie lem_positif def_diffnum ~h_cfl #lt_young', { sp: 'stab' }],
  ['lem_bruit_moy', 'lemme', 'Terme de bruit de moyenne nulle', '𝔼[M^n | 𝓕_n] = 0 : le produit croisé bruit–solution est une martingale.', 'def_increment def_filtration ~ax_proba #ax_isometrie', { sp: 'stab' }],
  ['lem_bruit_quad', 'lemme', 'Contribution quadratique du bruit', '𝔼 Q^n = Δt Σ_k 𝔼‖σ_k·∇_h u^n‖²_h ≤ C_σ Δt E_n / h.', 'def_increment h_sigma ~cm_bruit #ax_isometrie', { sp: 'stab' }],
  ['prop_stab_l2', 'proposition', 'Stabilité L² en moyenne', 'max_n E_n ≤ e^{C T} ‖u_0‖²_h sous CFL, sans correction.', 'lem_energie lem_dissipation lem_bruit_moy lem_bruit_quad #lt_gronwall ~h_cfl | calc_von_neumann ~cm_tore ~def_norme', {
    sp: 'stab', demos: ['Par identité d’énergie', 'Par analyse de Fourier'], validites: ['valide', 'a_verifier'],
  }],
  ['lem_max_bruit', 'lemme', 'Maximum en temps du terme de bruit', '𝔼 max_n |Σ_{m<n} M^m| ≤ C (𝔼 Σ_m |M^m|²)^{1/2}.', 'lem_bruit_moy #lt_bdg #lt_doob ~def_filtration', { sp: 'stab' }],
  ['prop_stab_sup', 'proposition', 'Stabilité L² uniforme en temps', '𝔼 max_n ‖u^n‖²_h ≤ C(T) ‖u_0‖²_h.', 'prop_stab_l2 lem_max_bruit #lt_gronwall #lt_young', { sp: 'stab' }],
  ['bv_1', 'assertion', 'Schéma sur les différences u_L − u_K', 'Les différences vérifient un schéma de même structure, à coefficients perturbés par ∇b.', 'def_schema def_bv ~def_maillage_not h_b_lip', { sp: 'stab' }],
  ['bv_2', 'assertion', 'Contraction du transport en variation totale', 'La partie transport ne fait pas croître |u|_{BV,h} sous CFL, à O(L_b Δt) près.', 'bv_1 lem_positif #lt_jensen', { sp: 'stab' }],
  ['lem_bv_flux', 'lemme', 'Décroissance BV du flux', '|u^{n+1}|_{BV,h} ≤ (1 + L_b Δt) |u^n|_{BV,h} sans bruit.', 'bv_2 ~def_flux', { sp: 'stab' }],
  ['lem_bv_bruit', 'lemme', 'Croissance BV contrôlée par le bruit', '𝔼|u^{n+1}|_{BV,h} ≤ (1 + C_σ Δt) 𝔼|u^n|_{BV,h}.', 'def_bv h_sigma lem_bruit_quad #lt_jensen ~ax_isometrie', { sp: 'stab' }],
  ['prop_bv', 'proposition', 'Estimation BV discrète', 'max_n 𝔼|u^n|_{BV,h} ≤ e^{C T} |u_0|_{BV}.', 'lem_bv_flux lem_bv_bruit h_u0 #lt_gronwall +prop_stab_l2', { sp: 'stab' }],
  ['thm_stabilite', 'theoreme', 'Théorème de stabilité', 'Sous CFL (θ < 1), le schéma est stable dans L²(Ω; ℓ^∞(0,T; L²_h)) et BV en moyenne.', 'prop_stab_sup prop_bv +lem_masse ~h_cfl ~cm_tore', { sp: 'stab' }],
]

// Piste abandonnée : compacité stochastique
const COMPACITE: Spec[] = [
  ['cp_holder', 'lemme', 'Hölder en temps dans H^{−1}', '𝔼‖u_h(t) − u_h(s)‖⁴_{H^{−1}} ≤ C |t − s|².', 'prop_stab_l2 def_trajectoires #lt_bdg #lt_kolmogorov', { sp: 'comp', abandon: true }],
  ['cp_tension', 'lemme', 'Tension des lois de (u_h)', 'La famille des lois de u_h est tendue dans 𝒳.', 'cp_holder prop_bv def_tension ~def_trajectoires', { sp: 'comp', abandon: true }],
  ['cp_loi', 'proposition', 'Convergence en loi à sous-suite près', 'Une sous-suite de (u_h) converge en loi dans 𝒳.', 'cp_tension #lt_prokhorov', { sp: 'comp', abandon: true }],
  ['cp_skorokhod', 'assertion', 'Réalisation presque sûre', 'Sur un nouvel espace, ũ_h → ũ presque sûrement dans 𝒳.', 'cp_loi #lt_skorokhod', { sp: 'comp', abandon: true }],
  ['cp_martingale', 'assertion', 'Identification de la limite', 'ũ est solution martingale : passage à la limite dans la formulation faible.', 'cp_skorokhod def_sol +lem_bruit_moy', { sp: 'comp', abandon: true, statut: 'incertain', origine: 'ia' }],
  ['cp_unicite', 'conjecture', 'Unicité trajectorielle ⇒ convergence en probabilité', 'Par Gyöngy–Krylov, toute la suite convergerait en probabilité.', 'cp_martingale +h_b_lip', { sp: 'comp', abandon: true, statut: 'incertain' }],
  ['cp_bilan', 'observation', 'Bilan : aucune vitesse de convergence', 'L’argument de compacité ne donne ni ordre ni constante explicite.', 'cp_unicite cp_loi', { sp: 'comp', abandon: true, origine: 'humain' }],
  ['dec_abandon', 'decision', 'Abandon de l’approche par compacité', 'On renonce à la compacité au profit d’une estimation d’erreur directe.', 'cp_bilan +cp_martingale', {
    sp: 'conv',
    decision: {
      question: 'Comment prouver la convergence du schéma ?',
      alternatives: [
        { libelle: 'Compacité stochastique (Prokhorov + Skorokhod)', retenue: false, raison: 'Convergence en loi seulement, sans ordre ; l’identification de la limite reste fragile.' },
        { libelle: 'Estimation d’erreur directe (énergie)', retenue: true, raison: 'Donne un ordre explicite et exploite la stabilité L² déjà prouvée.' },
        { libelle: 'Doublement des variables (Kružkov)', retenue: false, raison: 'Lourd en stochastique, pertinent seulement pour L¹.' },
      ],
      raison: 'L’objectif du projet est un ordre de convergence, que la compacité ne fournit pas.',
    },
    liens: [{ genre: 'abandonne', cible: 'cp_unicite', note: 'Piste de compacité close.' }],
  }],
  ['dec_norme', 'decision', 'Erreur mesurée en norme L²', 'L’erreur est estimée dans L²(Ω × 𝕋^d) plutôt que dans L¹.', 'dec_abandon ~def_norme', {
    sp: 'conv',
    decision: {
      question: 'Dans quelle norme mesurer l’erreur ?',
      alternatives: [
        { libelle: 'L¹ (entropique)', retenue: false, raison: 'Nécessite le doublement des variables.' },
        { libelle: 'L² (énergie)', retenue: true, raison: 'Compatible avec l’identité d’énergie discrète et l’isométrie d’Itô.' },
      ],
      raison: 'Réutiliser toute l’analyse de stabilité L².',
    },
  }],
  ['dec_bv', 'decision', 'Se restreindre aux données BV', 'L’ordre 1/2 est visé pour u_0 ∈ BV ; le cas L² général est laissé ouvert.', 'prop_bv ~h_u0', {
    sp: 'conv',
    decision: {
      question: 'Quelle régularité des données initiales ?',
      alternatives: [
        { libelle: 'u_0 ∈ L² quelconque', retenue: false, raison: 'Aucune vitesse attendue sans régularité.' },
        { libelle: 'u_0 ∈ BV ∩ L∞', retenue: true, raison: 'Cadre classique de l’ordre 1/2 en transport déterministe.' },
        { libelle: 'u_0 ∈ H¹', retenue: false, raison: 'Trop restrictif pour les fronts.' },
      ],
      raison: 'Correspond aux applications (fronts) et à la littérature déterministe.',
    },
  }],
]

// SP2 · Convergence (avec la contradiction résolue)
const CONVERGENCE: Spec[] = [
  ['lem_cons_flux', 'lemme', 'Consistance du flux O(h)', '‖A_h Π_h u − Π_h(b·∇u)‖_{H^{−1}_h} ≤ C h ‖u‖_{H¹}.', 'def_flux h_b_lip def_projection #lt_young ~cm_maillage', { sp: 'conv' }],
  ['lem_cons_temps', 'lemme', 'Consistance en temps O(Δt^{1/2})', 'Le reste de consistance temporelle est contrôlé par ω(Δt) ≤ C Δt^{1/2}.', 'def_temps def_module h_regul #lt_jensen', { sp: 'conv' }],
  ['lem_eq_erreur', 'lemme', 'Équation de l’erreur', 'e^{n+1} = e^n − Δt A_h e^n + Σ_k B_{h,k} e^n Δβ_k^n + R^n.', 'def_erreur def_schema def_sol ~def_projection', { sp: 'conv' }],
  ['conj_ordre', 'conjecture', 'Ordre 1/2 sans correction', 'Le schéma non corrigé converge à l’ordre 1/2 en norme L².', 'lem_cons_flux lem_cons_temps prop_stab_l2 ~def_ordre', {
    sp: 'conv', statut: 'refute', validation: 'humain', origine: 'ia',
  }],
  ['er_1', 'assertion', 'Développement de ‖e^{n+1}‖²_h', 'Carré de l’équation de l’erreur, termes regroupés comme pour la stabilité.', 'lem_eq_erreur ~def_norme ~def_maillage_not', { sp: 'conv' }],
  ['er_2', 'assertion', 'Transport de l’erreur absorbé', 'Le transport de e^n est absorbé par la dissipation numérique sous CFL.', 'er_1 lem_dissipation #lt_ipp', { sp: 'conv' }],
  ['er_3', 'assertion', 'Terme croisé bruit–erreur', 'Le produit croisé est une martingale ; sa variation quadratique est O(Δt).', 'er_2 lem_bruit_moy #ax_isometrie', { sp: 'conv' }],
  ['lem_energie_err', 'lemme', 'Identité d’énergie pour l’erreur', '𝔼‖e^{n+1}‖²_h ≤ (1 + CΔt) 𝔼‖e^n‖²_h + 𝔼|R^n|² / Δt.', 'er_3 lem_energie #lt_young', { sp: 'conv' }],
]

// SP3 · Validation numérique (plan d'expérience ; complété par le générateur)
const NUMERIQUE_DEBUT: Spec[] = [
  ['dec_mlmc', 'decision', 'Monte-Carlo multi-niveaux', 'Les erreurs sont estimées par MLMC sur 5 niveaux de maillage.', '~def_estim_mc', {
    sp: 'num',
    decision: {
      question: 'Comment estimer 𝔼‖e‖² à coût raisonnable ?',
      alternatives: [
        { libelle: 'Monte-Carlo standard', retenue: false, raison: 'Coût en O(ε^{−3}) prohibitif à h = 1/512.' },
        { libelle: 'Monte-Carlo multi-niveaux', retenue: true, raison: 'Coût en O(ε^{−2} log² ε) grâce aux trajectoires couplées.' },
        { libelle: 'Quasi-Monte-Carlo', retenue: false, raison: 'Dimension du bruit trop grande pour un gain garanti.' },
      ],
      raison: 'Budget de calcul de la grappe limité à 20 000 heures-cœur.',
    },
  }],
  ['dec_reference', 'decision', 'Solution de référence sur maillage fin', 'La référence est calculée à h = 1/2048 avec les mêmes incréments browniens.', 'dec_mlmc ~def_estim_mc', {
    sp: 'num',
    decision: {
      question: 'Contre quoi mesurer l’erreur ?',
      alternatives: [
        { libelle: 'Solution exacte', retenue: false, raison: 'Inconnue pour b et σ généraux.' },
        { libelle: 'Extrapolation de Richardson', retenue: false, raison: 'Suppose un développement asymptotique non démontré.' },
        { libelle: 'Maillage très fin couplé', retenue: true, raison: 'Même bruit, erreur de référence négligeable devant h = 1/512.' },
      ],
      raison: 'Couplage trajectoriel nécessaire à une mesure d’erreur forte.',
    },
  }],
  ['calc_ref', 'calcul', 'Calcul de la solution de référence', '10⁴ trajectoires à h = 1/2048, Δt = 0,4 h, champ b tourbillonnaire.', 'dec_reference def_schema ~cm_maillage ~h_cfl', { sp: 'num' }],
]

// Résolution de la contradiction et convergence (après les premières mesures)
const RESOLUTION: Spec[] = [
  ['as_diag', 'assertion', 'Diagnostic : dérive d’Itô parasite', 'Le schéma explicite discrétise l’équation d’Itô : il lui manque ½ Σ σ_k·∇(σ_k·∇u).', 'obs_quart cm_strato lem_bruit_quad', { sp: 'conv', origine: 'ia', validation: 'ia_humain' }],
  ['calc_derive', 'calcul', 'Calcul symbolique de la dérive parasite', 'Développement de Taylor stochastique du schéma à l’ordre Δt : terme ½ σσ′ identifié.', 'cm_strato def_increment ~def_schema', { sp: 'conv' }],
  ['dec_correction', 'decision', 'Ajouter la correction d’Itô au schéma', 'Le schéma est modifié : u^{n+1} += c_h(u^n).', 'as_diag calc_derive', {
    sp: 'conv',
    decision: {
      question: 'Comment rétablir l’ordre 1/2 ?',
      alternatives: [
        { libelle: 'Réduire Δt (Δt = h²)', retenue: false, raison: 'Masque le biais sans le corriger, coût × 1/h.' },
        { libelle: 'Schéma de Milstein', retenue: false, raison: 'Commutativité des σ_k non garantie.' },
        { libelle: 'Terme de correction d’Itô explicite', retenue: true, raison: 'Local, peu coûteux, restaure la consistance avec Stratonovich.' },
      ],
      raison: 'Correction minimale qui rend le schéma consistant avec l’équation de Stratonovich.',
    },
    liens: [{ genre: 'resout', cible: 'conj_ordre', note: 'La contradiction venait du choix Stratonovich non répercuté dans le schéma.' }],
  }],
  ['def_schema_c', 'definition', 'Schéma corrigé', 'u^{n+1} = u^n − Δt A_h u^n + c_h(u^n) + Σ_k B_{h,k} u^n Δβ_k^n.', 'def_schema dec_correction def_ito_corr', { sp: 'conv', admis: true }],
  ['lem_cons_c', 'lemme', 'Consistance du schéma corrigé', 'Reste de consistance O(h^{1/2} + Δt^{1/2}) en L²(Ω; H^{−1}_h).', 'def_schema_c lem_cons_flux lem_cons_temps +calc_derive #lt_young', { sp: 'conv' }],
  ['lem_stab_c', 'lemme', 'Stabilité du schéma corrigé', 'La correction est dissipative : l’estimation L² reste vraie.', 'def_schema_c thm_stabilite #lt_young ~h_sigma', { sp: 'conv' }],
  ['lem_gronwall_err', 'lemme', 'Estimation d’énergie de l’erreur', 'max_n 𝔼‖e^n‖²_h ≤ C (h + Δt).', 'lem_energie_err lem_cons_c lem_stab_c #lt_gronwall', { sp: 'conv' }],
  ['prop_interp', 'proposition', 'Interpolation BV–L²', 'Pour u_0 ∈ BV, ‖u(t) − Π_h u(t)‖_{L²} ≤ C h^{1/2} |u_0|_{BV}.', 'prop_bv dec_bv def_projection #lt_cs', { sp: 'conv' }],
  ['thm_conv', 'theoreme', 'Convergence forte d’ordre 1/2', 'Pour u_0 ∈ BV ∩ L∞ et sous CFL, (𝔼‖e^n‖²_h)^{1/2} ≤ C (h + Δt)^{1/2}.', 'lem_gronwall_err prop_interp dec_norme +thm_stabilite ~def_ordre ~h_regul', { sp: 'conv' }],
  ['prop_optimal', 'proposition', 'Optimalité de l’ordre 1/2 pour BV', 'Un front plat transporté donne une erreur ≥ c h^{1/2} : l’ordre est optimal.', 'thm_conv calc_front ~dec_bv', { sp: 'conv' }],
  ['conj_ordre_un', 'conjecture', 'Ordre 1 pour des données lisses', 'Pour u_0 ∈ H², l’ordre serait 1 en h et 1/2 en Δt.', 'thm_conv +lem_cons_flux', { sp: 'conv', statut: 'incertain', origine: 'ia' }],
]

// Assemblage final
const FIN: Spec[] = [
  ['res_principal', 'resultat', 'Résultat principal', 'Le schéma volumes finis stochastique corrigé converge fortement à l’ordre 1/2, et cet ordre est observé numériquement.', 'thm_conv res_ordre +prop_optimal +thm_stabilite', { sp: 'conv', validation: 'ia_humain' }],
  ['res_stab_num', 'resultat', 'Stabilité confirmée sous CFL', 'Seuil CFL numérique θ* ≈ 1, en accord avec le théorème de stabilité.', 'thm_stabilite as_seuil_cfl', { sp: 'stab', validation: 'ia_humain' }],
]

// ─── Générateurs : expériences, calculs et vérifications ──────────────────────

const PAS = [32, 64, 128, 256, 512]

function genererNumerique(): { avant: Spec[]; apresCorrection: Spec[] } {
  const avant: Spec[] = []
  // Balayage CFL
  const thetas = ['0,5', '0,7', '0,9', '1,0', '1,1', '1,2']
  thetas.forEach((t, i) => {
    avant.push([`exp_cfl_${i}`, 'experience', `Balayage CFL θ = ${t}`, `Énergie moyenne sur [0, T] pour θ = ${t}, h = 1/128, 2 000 trajectoires.`, `def_schema h_cfl ~def_energie ~cm_maillage`, { sp: 'num' }])
    avant.push([`obs_cfl_${i}`, 'observation', i < 4 ? `Énergie bornée (θ = ${t})` : `Explosion de l’énergie (θ = ${t})`, i < 4 ? `max_n E_n / E_0 = ${(1.02 + i * 0.03).toFixed(2).replace('.', ',')}.` : `E_n croît comme e^{${(i - 3) * 4}t}.`, `exp_cfl_${i} ~def_energie`, { sp: 'num' }])
  })
  avant.push(['as_seuil_cfl', 'assertion', 'Seuil CFL observé θ* ≈ 1', 'La frontière stable / instable se situe entre θ = 1,0 et θ = 1,1.', thetas.map((_, i) => `obs_cfl_${i}`).join(' ') + ' +as_cfl_necessaire', { sp: 'num' }])
  // Premières mesures d'ordre (schéma non corrigé)
  PAS.forEach((m) => {
    avant.push([`sim_nc_${m}`, 'calcul', `MLMC, h = 1/${m} (non corrigé)`, `Estimation de 𝔼‖u_h − u_ref‖² à h = 1/${m}, schéma sans correction.`, `calc_ref dec_mlmc def_schema ~def_estim_mc ~h_cfl`, { sp: 'num' }])
    avant.push([`obs_nc_${m}`, 'observation', `Erreur mesurée h = 1/${m} (non corrigé)`, `Ê^{1/2} = ${(0.9 * Math.pow(m, -0.25)).toFixed(3).replace('.', ',')} ± 3 %.`, `sim_nc_${m} ~def_estim_mc`, { sp: 'num' }])
  })
  avant.push(['calc_pente_nc', 'calcul', 'Régression log-log (non corrigé)', 'Pente de log Ê^{1/2} contre log h sur 5 niveaux.', PAS.map((m) => `obs_nc_${m}`).join(' ') + ' ~def_taux', { sp: 'num' }])
  avant.push(['obs_quart', 'observation', 'Pente 0,26 au lieu de 0,5', 'Ordre observé 0,26 ± 0,02, incompatible avec la conjecture d’ordre 1/2.', 'calc_pente_nc ~def_taux', {
    sp: 'num', validation: 'humain', liens: [{ genre: 'contredit', cible: 'conj_ordre', note: 'Ordre mesuré ≈ 1/4.' }],
  }])
  // Après correction
  const apres: Spec[] = []
  PAS.forEach((m) => {
    apres.push([`sim_c_${m}`, 'calcul', `MLMC, h = 1/${m} (corrigé)`, `Estimation de 𝔼‖u_h − u_ref‖² à h = 1/${m}, schéma corrigé.`, `calc_ref dec_mlmc def_schema_c ~def_estim_mc ~h_cfl`, { sp: 'num' }])
    apres.push([`obs_c_${m}`, 'observation', `Erreur mesurée h = 1/${m} (corrigé)`, `Ê^{1/2} = ${(1.4 * Math.pow(m, -0.5)).toFixed(4).replace('.', ',')} ± 2 %.`, `sim_c_${m} ~def_estim_mc`, { sp: 'num' }])
  })
  apres.push(['calc_pente_c', 'calcul', 'Régression log-log (corrigé)', 'Pente de log Ê^{1/2} contre log h sur 5 niveaux.', PAS.map((m) => `obs_c_${m}`).join(' ') + ' ~def_taux', { sp: 'num' }])
  apres.push(['obs_demi', 'observation', 'Pente 0,49 avec correction', 'Ordre observé 0,49 ± 0,02 : conforme au théorème.', 'calc_pente_c ~def_taux', { sp: 'num', validation: 'humain' }])
  // Sensibilité à l'amplitude du bruit
  const amplitudes = ['0,1', '0,5', '1,0', '2,0']
  amplitudes.forEach((s, i) => {
    apres.push([`exp_sig_${i}`, 'experience', `Sensibilité au bruit ‖σ‖ = ${s}`, `Ordre observé pour ‖σ‖_∞ = ${s}, schéma corrigé, 3 niveaux.`, `def_schema_c dec_mlmc ~h_sigma ~def_taux`, { sp: 'num' }])
    apres.push([`obs_sig_${i}`, 'observation', `Ordre ${['0,50', '0,49', '0,48', '0,44'][i]} pour ‖σ‖ = ${s}`, i < 3 ? 'Ordre stable.' : 'Légère dégradation : régime pré-asymptotique.', `exp_sig_${i} ~def_taux`, { sp: 'num', statut: i === 3 ? 'incertain' : undefined }])
  })
  apres.push(['as_robuste', 'assertion', 'Ordre robuste en amplitude de bruit', 'L’ordre 1/2 est observé pour ‖σ‖ ≤ 1 ; au-delà, maillages plus fins nécessaires.', amplitudes.map((_, i) => `obs_sig_${i}`).join(' '), { sp: 'num' }])
  // Dimension 2
  apres.push(['exp_2d', 'experience', 'Tourbillon en dimension 2', 'Champ b = ∇^⊥ψ, ψ = sin(πx) sin(πy), bruit à 4 modes, h = 1/64 à 1/512.', 'def_schema_c dec_mlmc ~cm_tore ~cm_bruit', { sp: 'num' }])
  apres.push(['obs_2d', 'observation', 'Ordre 0,47 en dimension 2', 'Pente 0,47 ± 0,04 sur 4 niveaux.', 'exp_2d ~def_taux', { sp: 'num', statut: 'incertain' }])
  apres.push(['calc_front', 'calcul', 'Front plat transporté', 'Erreur exacte pour une marche transportée à vitesse constante : ≈ 0,56 h^{1/2}.', 'def_schema_c ~cm_maillage ~h_u0', { sp: 'num' }])
  apres.push(['res_ordre', 'resultat', 'Ordre 1/2 observé', 'Les mesures confirment l’ordre 1/2 du schéma corrigé (1D et 2D).', 'obs_demi as_robuste obs_2d +calc_front', { sp: 'num', validation: 'ia_humain' }])
  return { avant, apresCorrection: apres }
}

/** Vérifications formelles et relectures par l'ordinateur ou l'IA de lemmes clés. */
function genererVerifications(): Spec[] {
  const cibles: [string, string][] = [
    ['lem_energie', 'identité d’énergie'], ['lem_dissipation', 'dissipation'], ['lem_bruit_quad', 'terme quadratique'],
    ['lem_bv_flux', 'décroissance BV'], ['lem_cons_flux', 'consistance du flux'], ['lem_cons_c', 'consistance corrigée'],
    ['lem_gronwall_err', 'estimation d’erreur'], ['prop_interp', 'interpolation BV–L²'],
  ]
  const r: Spec[] = []
  for (const [c, nom] of cibles) {
    r.push([`verif_${c}`, 'calcul', `Vérification symbolique : ${nom}`, `Contrôle par calcul formel des constantes de « ${nom} » sur un maillage 1D à 8 mailles.`, `${c} ~def_maillage_not`, { sp: c.startsWith('lem_cons') || c === 'lem_gronwall_err' || c === 'prop_interp' ? 'conv' : 'stab', origine: 'ordinateur' }])
  }
  return r
}

/** Étapes de détail (chaînes linéaires) : sous-lemmes et remarques rédigés au fil de l'eau. */
function genererDetails(): Spec[] {
  const r: Spec[] = []
  // Chaîne : constantes explicites du théorème de stabilité
  const cst = ['Constante de Grönwall explicite', 'Dépendance en θ de la constante', 'Dépendance en T de la constante', 'Constante de stabilité finale']
  cst.forEach((nom, i) => {
    r.push([`cst_${i}`, 'assertion', nom, `Suivi explicite des constantes (étape ${i + 1}/4).`, `${i === 0 ? 'thm_stabilite' : `cst_${i - 1}`} ~h_cfl ~def_energie #lt_gronwall`, { sp: 'stab', origine: i % 2 ? 'ia' : 'humain' }])
  })
  // Chaîne : cas particulier d = 1 de l'estimation BV
  const d1 = ['Cas d = 1 : différences finies', 'Cas d = 1 : monotonie', 'Cas d = 1 : borne BV explicite']
  d1.forEach((nom, i) => {
    r.push([`bv1d_${i}`, 'assertion', nom, `Réduction de l’estimation BV au cas unidimensionnel (étape ${i + 1}/3).`, `${i === 0 ? 'prop_bv' : `bv1d_${i - 1}`} ~def_bv ~cm_maillage`, { sp: 'stab' }])
  })
  // Chaîne : remarques sur l'optimalité
  const opt = ['Construction du front test', 'Calcul de l’erreur de projection', 'Minoration de l’erreur totale']
  opt.forEach((nom, i) => {
    r.push([`opt_${i}`, 'assertion', nom, `Argument d’optimalité (étape ${i + 1}/3).`, `${i === 0 ? 'prop_optimal' : `opt_${i - 1}`} ~def_projection ~h_u0`, { sp: 'conv' }])
  })
  r.push(['rq_dim', 'assertion', 'Remarque : indépendance en dimension', 'Aucune constante ne dépend de d, hors |u_0|_{BV}.', 'thm_conv opt_2 +bv1d_2 ~cm_tore', { sp: 'conv', origine: 'ia' }])
  return r
}

/** Travail préparatoire et variantes rédigées puis laissées de côté (riche en prémisses de contexte). */
function genererAnnexes(): Spec[] {
  const r: Spec[] = []
  const notes: [string, string, string, string][] = [
    ['an_moments', 'Moments d’ordre 4 du schéma', 'Estimation de 𝔼‖u^n‖⁴_h par Itô discret.', 'prop_stab_l2 #lt_bdg #lt_young ~def_norme ~h_sigma'],
    ['an_moments_sup', 'Moments d’ordre 4 uniformes en temps', 'Contrôle de 𝔼 max_n ‖u^n‖⁴_h.', 'an_moments lem_max_bruit #lt_doob'],
    ['an_linf', 'Principe du maximum en moyenne', '𝔼 max_K |u_K^n| reste borné si σ est petit.', 'lem_positif h_u0 +lem_bruit_quad ~h_sigma'],
    ['an_linf_contre', 'Contre-exemple au principe du maximum', 'Pour σ grand, le maximum croît : pas de principe du maximum p.s.', 'an_linf calc_von_neumann'],
    ['an_regul_temps', 'Régularité höldérienne en temps', 'u ∈ C^{1/2−ε}([0,T]; H^{−1}) presque sûrement.', 'def_sol h_regul #lt_kolmogorov #lt_bdg'],
    ['an_commut', 'Commutateur transport–bruit', '[b·∇, σ_k·∇] est un opérateur d’ordre 1 borné.', 'h_b_lip h_sigma ~cm_bruit'],
    ['an_commut_est', 'Estimation du commutateur discret', 'Le commutateur discret est O(1) en norme d’opérateur L²_h.', 'an_commut def_flux #lt_cs ~def_norme'],
    ['an_err_proj', 'Erreur de projection initiale', '‖u_0 − Π_h u_0‖_{L²} ≤ C h^{1/2} |u_0|_{BV}.', 'def_projection h_u0 #lt_cs'],
    ['an_err_init', 'Erreur initiale du schéma', 'e^0 = 0 par construction ; la projection contribue en O(h^{1/2}).', 'an_err_proj def_erreur'],
    ['an_mass_err', 'Masse de l’erreur nulle', 'Σ_K |K| e_K^n = 0 : l’erreur est de moyenne nulle.', 'lem_masse def_erreur ~h_div'],
    ['an_poincare', 'Inégalité de Poincaré discrète', '‖e‖_h ≤ C |e|_{H¹_h} pour e de moyenne nulle.', 'an_mass_err ~cm_tore ~def_norme'],
    ['an_poincare_use', 'Contrôle H^{−1} de l’erreur', 'Grâce à Poincaré, ‖e‖_{H^{−1}_h} contrôle la partie basse fréquence.', 'an_poincare #lt_cs +lem_eq_erreur'],
    ['an_bruit_haut', 'Bruit de haute fréquence', 'Les modes σ_k à haute fréquence ne changent pas l’ordre si Σ ‖σ_k‖² < ∞.', 'lem_bruit_quad h_sigma ~cm_bruit +an_commut_est'],
    ['an_ito_strato', 'Conversion Itô ↔ Stratonovich', 'L’équation de Stratonovich équivaut à une équation d’Itô avec dérive ½ Σ (σ_k·∇)².', 'cm_strato ax_ito ~cm_bruit'],
    ['an_ito_strato_disc', 'Conversion discrète', 'Au niveau discret, la dérive d’Itô correspond exactement à c_h.', 'an_ito_strato def_ito_corr'],
    ['an_mlmc_var', 'Variance des corrections MLMC', 'Var(Y_ℓ − Y_{ℓ−1}) = O(h_ℓ) pour le schéma couplé.', 'dec_mlmc thm_conv ~def_estim_mc'],
    ['an_mlmc_cout', 'Coût total MLMC', 'Coût O(ε^{−2} log² ε) pour une précision ε.', 'an_mlmc_var ~dec_mlmc'],
    ['an_cfl_bruit', 'Effet du bruit sur la CFL', 'Le bruit ne modifie pas la CFL en moyenne quadratique.', 'lem_bruit_quad h_cfl +as_seuil_cfl'],
    ['an_semi', 'Variante semi-implicite', 'Traitement implicite du bruit seul : stabilité inconditionnelle du terme stochastique.', 'dec_explicite lem_bruit_quad'],
    ['an_semi_cout', 'Coût de la variante semi-implicite', 'Un système tridiagonal aléatoire par pas : × 3 en temps de calcul.', 'an_semi calc_ref'],
  ]
  for (const [id, nom, enonce, prem] of notes) {
    const type: TypeRaisonnement = id.includes('contre') ? 'observation' : id.includes('cout') ? 'calcul' : id === 'an_semi' ? 'proposition' : 'lemme'
    const sp = /mlmc|semi_cout/.test(id) ? 'num' : /err|poincare|commut|ito|mass|bruit_haut/.test(id) ? 'conv' : 'stab'
    r.push([id, type, nom, enonce, prem, { sp, statut: id === 'an_semi' ? 'incertain' : undefined, origine: id === 'an_linf' ? 'ia' : undefined }])
  }
  // Utilisations des annexes par la ligne principale (auxiliaires et techniques)
  return r
}

// Quelques arêtes supplémentaires ajoutées après coup (liens transverses, rôles variés).
const RENFORTS: [cible: string, premisses: string][] = [
  ['lem_gronwall_err', '+an_err_init #an_poincare_use ~an_mass_err'],
  ['thm_conv', '+an_moments_sup ~an_bruit_haut'],
  ['lem_cons_c', '+an_ito_strato_disc ~an_commut_est'],
  ['lem_stab_c', '#an_moments'],
  ['prop_stab_sup', '+an_moments'],
  ['res_ordre', '+an_mlmc_cout'],
  ['as_diag', '+an_ito_strato'],
  ['lem_energie_err', '~an_commut'],
  ['prop_optimal', '+an_err_proj'],
  ['thm_stabilite', '+an_cfl_bruit ~an_linf'],
  ['thm_conv', '+lit_kuznetsov'],
  ['prop_optimal', '+lit_sabac'],
  ['cp_unicite', '#lit_gyongy'],
  ['cp_loi', '~lit_bcg'],
  ['prop_bv', '+lit_merlet'],
  ['lem_cons_flux', '~lit_kuznetsov'],
]

/** Compléments : coût de calcul, ordre faible, bruit de trace infinie, formalisation. */
function genererComplements(): Spec[] {
  const r: Spec[] = []
  // Coût de calcul par niveau
  PAS.forEach((m, i) => {
    r.push([`cout_${m}`, 'calcul', `Temps de calcul, h = 1/${m}`, `Chronométrage d’un pas MLMC à h = 1/${m} : ${[0.2, 0.9, 3.8, 15, 61][i]} s par trajectoire.`, `sim_c_${m} ~dec_mlmc`, { sp: 'num' }])
  })
  r.push(['obs_cout', 'observation', 'Coût en h^{−3}', 'Le coût par trajectoire croît comme h^{−3} (d = 1, CFL).', PAS.map((m) => `cout_${m}`).join(' ') + ' ~h_cfl', { sp: 'num' }])
  r.push(['as_budget', 'assertion', 'Budget respecté', 'Campagne complète : 14 200 heures-cœur sur 20 000 disponibles.', 'obs_cout an_mlmc_cout', { sp: 'num' }])
  // Ordre faible
  const tests = ['moyenne', 'second moment', 'fonctionnelle de front', 'énergie']
  tests.forEach((t, i) => {
    r.push([`exp_faible_${i}`, 'experience', `Erreur faible : ${t}`, `|𝔼φ(u_h) − 𝔼φ(u_ref)| pour φ = ${t}, 5 niveaux.`, `def_schema_c calc_ref ~def_estim_mc`, { sp: 'num' }])
    r.push([`obs_faible_${i}`, 'observation', `Ordre faible ${['1,02', '0,97', '0,88', '1,01'][i]} (${t})`, 'Pente mesurée sur 5 niveaux.', `exp_faible_${i} ~def_taux`, { sp: 'num', statut: i === 2 ? 'incertain' : undefined }])
  })
  r.push(['calc_faible', 'calcul', 'Synthèse des ordres faibles', 'Régression groupée : ordre faible 0,97 ± 0,05.', tests.map((_, i) => `obs_faible_${i}`).join(' '), { sp: 'num' }])
  r.push(['conj_faible', 'conjecture', 'Ordre faible 1', 'Le schéma corrigé converge faiblement à l’ordre 1.', 'calc_faible +thm_conv ~def_ordre', { sp: 'num', origine: 'ia' }])
  // Extension : bruit de trace infinie (piste ouverte)
  r.push(['h_trace', 'hypothese', 'Bruit de trace infinie', 'Σ_k ‖σ_k‖²_{L∞} < ∞ mais Σ_k ‖∇σ_k‖²_{L∞} = ∞.', '~cm_bruit', { sp: 'conv', statut: 'incertain' }])
  r.push(['tr_1', 'lemme', 'Troncature du bruit à K modes', 'L’erreur de troncature est O(Σ_{k>K} ‖σ_k‖²) en L².', 'h_trace lem_bruit_quad #ax_isometrie', { sp: 'conv' }])
  r.push(['tr_2', 'lemme', 'Choix optimal de K(h)', 'K(h) ≍ h^{−1/2} équilibre troncature et consistance.', 'tr_1 lem_cons_c #lt_young', { sp: 'conv', origine: 'ia' }])
  r.push(['tr_3', 'proposition', 'Ordre 1/4 sous bruit de trace infinie', 'Avec K(h) optimal, l’erreur est O(h^{1/4}).', 'tr_2 thm_conv', { sp: 'conv', statut: 'incertain' }])
  r.push(['conj_trace', 'conjecture', 'L’ordre 1/4 est optimal sans régularité du bruit', 'Aucun schéma explicite ne ferait mieux sans hypothèse sur ∇σ_k.', 'tr_3 +prop_optimal', { sp: 'conv', origine: 'ia' }])
  // Formalisation partielle
  const lean: [string, string][] = [['lt_gronwall', 'Grönwall discret'], ['lem_masse', 'conservation de la masse'], ['lem_positif', 'positivité sous CFL'], ['lem_bruit_moy', 'bruit de moyenne nulle']]
  for (const [c, nom] of lean) r.push([`lean_${c}`, 'calcul', `Formalisation Lean : ${nom}`, `Preuve vérifiée par Lean 4 / Mathlib de « ${nom} ».`, `${c} ~def_maillage_not`, { sp: c === 'lt_gronwall' ? 'cadre' : 'stab', origine: 'ordinateur', validation: 'ia_humain' }])
  // Décisions d'organisation
  r.push(['dec_dim1', 'decision', 'Rédiger la preuve en dimension 1 d’abord', 'La preuve est écrite en d = 1 puis étendue.', 'bv1d_2 +rq_dim', {
    sp: 'conv',
    decision: {
      question: 'Dans quel ordre rédiger ?',
      alternatives: [
        { libelle: 'Dimension d générale d’emblée', retenue: false, raison: 'Notations lourdes, relecture difficile.' },
        { libelle: 'Dimension 1 puis extension', retenue: true, raison: 'Les constantes ne dépendent pas de d (remarque vérifiée).' },
      ],
      raison: 'Lisibilité de l’article ; l’extension est mécanique.',
    },
  }])
  r.push(['res_article', 'resultat', 'Plan de l’article', 'Section 2 : stabilité ; section 3 : convergence d’ordre 1/2 ; section 4 : expériences ; annexe : ordre faible.', 'res_principal res_stab_num dec_dim1 +conj_faible', { sp: 'conv', validation: 'humain' }])
  return r
}

// ─── Construction ────────────────────────────────────────────────────────────

const SYMBOLES: Record<string, RolePremisse> = { '~': 'contexte', '#': 'technique', '+': 'auxiliaire' }

function lirePremisses(texte: string): Premisse[][] {
  if (!texte.trim()) return []
  return texte.split('|').map((bloc) =>
    bloc.trim().split(/\s+/).filter(Boolean).map((t) => {
      const role = SYMBOLES[t[0]!]
      return role ? { id: t.slice(1), role } : { id: t, role: 'principale' as const }
    }),
  )
}

const NOMS_DEMO: Partial<Record<TypeRaisonnement, string>> = {
  experience: 'Protocole', calcul: 'Script', observation: 'Mesure', decision: 'Délibération', choix_modelisation: 'Justification du choix',
  definition: 'Construction', conjecture: 'Heuristique', hypothese: 'Motivation',
}

/**
 * Génère le jeu synthétique (déterministe). Environ 200 nœuds dans le graphe de justification,
 * soit ~650 arêtes, dont une majorité de prémisses de contexte et de lemmes techniques.
 */
export function genererJeuRaisonnement(graine = 20260504): JeuRaisonnement {
  const alea = creerAlea(graine)
  const num = genererNumerique()
  // Ordre topologique : chaque bloc ne cite que des nœuds déjà définis (sauf renvois résolus plus bas).
  const specs: Spec[] = [
    ...FONDATIONS, ...STABILITE, ...COMPACITE, ...CONVERGENCE, ...NUMERIQUE_DEBUT, ...num.avant,
    ...RESOLUTION.slice(0, 7), ...genererAnnexesAvant(), ...RESOLUTION.slice(7, 9),
    ...num.apresCorrection, ...RESOLUTION.slice(9), ...genererVerifications(), ...FIN, ...genererDetails(), ...genererAnnexesApres(),
    ...genererComplements(),
  ]
  const connus = new Map<string, NoeudR>()
  const jours = new Map<string, number>()
  const noeuds: NoeudR[] = []

  for (const [id, type, nom, enonce, texte, o = {}] of specs) {
    if (connus.has(id)) throw new Error(`[raisonnement] identifiant en double : ${id}`)
    const blocs = lirePremisses(texte)
    for (const b of blocs) for (const p of b) if (!connus.has(p.id)) throw new Error(`[raisonnement] ${id} cite ${p.id}, inconnu ou défini après`)
    // Date : après toutes les prémisses et après le début du sous-problème.
    const sp = o.sp ?? 'cadre'
    let jour = Math.max(DEBUT_SP[sp] ?? 0, o.jour ?? 0) + alea.entre(0, sp === 'cadre' ? 6 : 3)
    for (const b of blocs) for (const p of b) jour = Math.max(jour, jours.get(p.id)! + alea.entre(0.15, 1.6))
    jours.set(id, jour)
    const date = new Date(DEBUT_PROJET + jour * JOUR).toISOString()

    const admis = o.admis ?? false
    const origine: Origine = o.origine ?? (type === 'calcul' || type === 'experience' || (type === 'observation' && sp === 'num') ? 'ordinateur' : admis ? 'humain' : alea.suivant() < 0.3 ? 'ia' : 'humain')
    const auteur = o.decision?.auteur ?? o.auteur ?? (origine === 'ordinateur' ? PERSONNES.grappe : origine === 'ia' ? PERSONNES.ia : alea.suivant() < 0.55 ? PERSONNES.lea : PERSONNES.hugo)
    const abandon = o.abandon ?? false
    let statut: Statut = o.statut ?? (admis ? 'valide' : type === 'conjecture' ? 'incertain' : abandon ? (alea.suivant() < 0.5 ? 'incertain' : 'valide') : alea.suivant() < 0.86 ? 'valide' : 'incertain')
    // Hypothèses et conclusions établies : validées sauf mention contraire (cohérence du récit).
    if ((type === 'hypothese' || type === 'theoreme' || type === 'resultat' || type === 'decision' || type === 'choix_modelisation') && !o.statut) statut = 'valide'
    const validation: Validation = o.validation ?? (admis ? 'humain'
      : statut === 'valide' ? alea.pondere(['humain', 'ia_humain', 'ia'] as const, [0.45, 0.35, 0.2])
        : statut === 'refute' ? 'humain' : alea.pondere(['aucune', 'ia'] as const, [0.6, 0.4]))
    const confiance = o.conf ? { estimation: o.conf[0], bas: o.conf[1], haut: o.conf[2] } : confianceDe(statut, validation, alea.suivant())

    const noms = o.demos ?? blocs.map((_, i) => (i === 0 ? NOMS_DEMO[type] ?? 'Démonstration' : `Variante ${i + 1}`))
    const demonstrations: DemonstrationR[] = blocs.map((premisses, i) => ({
      nom: noms[i] ?? `Démonstration ${i + 1}`,
      premisses,
      validite: o.validites?.[i] ?? (statut === 'refute' ? 'invalide' : statut === 'valide' ? 'valide' : 'a_verifier'),
      auteur: auteur === PERSONNES.grappe ? PERSONNES.grappe : i === 0 ? auteur : PERSONNES.ia,
      cree_le: date,
    }))
    const n: NoeudR = {
      id, nom, enonce, type, origine, auteur, cree_le: date, sousProbleme: sp, piste: abandon ? 'abandonnee' : 'active',
      statut, validation, confiance, admis, demonstrations,
    }
    if (o.decision) n.decision = { question: o.decision.question, alternatives: o.decision.alternatives, raison: o.decision.raison, date, auteur }
    if (o.choix) n.choix = o.choix
    if (o.liens) n.liens = o.liens
    connus.set(id, n)
    noeuds.push(n)
  }
  // Renforts : prémisses ajoutées après coup à la démonstration principale (démonstration révisée).
  // On refuse tout renfort qui créerait un cycle (la prémisse dépendrait déjà de la cible).
  const dependDe = (depart: string, cherche: string): boolean => {
    const vus = new Set<string>()
    const pile = [depart]
    while (pile.length) {
      const id = pile.pop()!
      if (id === cherche) return true
      if (vus.has(id)) continue
      vus.add(id)
      for (const d of connus.get(id)?.demonstrations ?? []) for (const p of d.premisses) pile.push(p.id)
    }
    return false
  }
  for (const [cible, texte] of RENFORTS) {
    const n = connus.get(cible)
    const d = n && demonstrationPrincipale(n)
    if (!d) continue
    for (const p of lirePremisses(texte)[0] ?? []) {
      if (!connus.has(p.id) || dependDe(p.id, cible)) continue
      if (!d.premisses.some((x) => x.id === p.id)) d.premisses.push(p)
    }
  }
  return {
    titre: 'Schéma volumes finis pour une EDP de transport à bruit multiplicatif',
    resume: 'Convergence forte d’ordre 1/2 et stabilité d’un schéma upwind / Euler–Maruyama sur le tore, bruit de Stratonovich.',
    sousProblemes: SOUS_PROBLEMES,
    noeuds,
    source: 'synthetique',
  }
}

// Les annexes sont réparties en deux blocs selon leurs prémisses (ordre topologique).
let annexesCache: Spec[] | null = null
const annexes = () => (annexesCache ??= genererAnnexes())
const AVANT_CORRECTION = new Set(['an_moments', 'an_moments_sup', 'an_linf', 'an_linf_contre', 'an_regul_temps', 'an_commut', 'an_commut_est', 'an_err_proj', 'an_err_init', 'an_mass_err', 'an_poincare', 'an_poincare_use', 'an_bruit_haut', 'an_ito_strato', 'an_ito_strato_disc', 'an_cfl_bruit', 'an_semi', 'an_semi_cout'])
const genererAnnexesAvant = () => annexes().filter((s) => AVANT_CORRECTION.has(s[0]))
const genererAnnexesApres = () => annexes().filter((s) => !AVANT_CORRECTION.has(s[0]))

function confianceDe(statut: Statut, validation: Validation, r: number): Confiance {
  let est: number, largeur: number
  if (statut === 'valide') {
    est = 0.86 + 0.1 * r
    largeur = validation === 'ia_humain' ? 0.05 : validation === 'humain' ? 0.08 : 0.14
  } else if (statut === 'refute') {
    est = 0.06 + 0.1 * r
    largeur = 0.12
  } else {
    est = 0.4 + 0.3 * r
    largeur = validation === 'ia' ? 0.3 : 0.42
  }
  const bas = clamp(est - largeur * (0.4 + 0.2 * r), 0, 1)
  const haut = clamp(est + largeur * (0.6 - 0.2 * r), 0, 1)
  return { estimation: Math.round(est * 100) / 100, bas: Math.round(bas * 100) / 100, haut: Math.round(haut * 100) / 100 }
}

// ─── Adaptateur GET /api/graphe (atlas/modeles.py : Graphe{noeuds, aretes}) ───

interface DemonstrationApi {
  noeud_id?: string
  nom_demonstration: string
  justifie_par: string[]
  demonstration?: string
  validite: Validite
  auteur: string
  cree_le?: string
  /** Extension : rôle de chaque prémisse (voir « à ajouter en base » en tête de fichier). */
  roles?: Record<string, RolePremisse>
}
interface NoeudApi {
  id: string
  nom: string
  enonce: string
  admis: boolean
  cree_le: string
  statut: 'etabli' | 'suspendu' | 'a_verifier' | 'invalide' | 'ouvert'
  demonstrations: DemonstrationApi[]
  // Champs étendus facultatifs, repris tels quels s'ils existent.
  type?: TypeRaisonnement
  origine?: Origine
  sous_probleme?: string
  piste?: 'active' | 'abandonnee'
  validation?: Validation
  confiance?: Confiance
  decision?: InfoDecision
  choix?: InfoChoix
  liens?: LienSemantique[]
}
export interface GrapheApi {
  noeuds: NoeudApi[]
  aretes: { source: string; cible: string; nom_demonstration: string; validite: Validite }[]
}

/** Type deviné depuis l'identifiant quand la base ne le stocke pas encore. */
export function deviserType(id: string, admis: boolean): TypeRaisonnement {
  const s = id.toLowerCase()
  const regles: [RegExp, TypeRaisonnement][] = [
    [/^(def|notation)/, 'definition'], [/^ax/, 'axiome'], [/^(hyp|h_)/, 'hypothese'], [/^(cm_|choix)/, 'choix_modelisation'],
    [/^dec/, 'decision'], [/^(lem|lt_)/, 'lemme'], [/^prop/, 'proposition'], [/^(thm|theoreme|cor)/, 'theoreme'],
    [/^(exp)/, 'experience'], [/^(calc|sim)/, 'calcul'], [/^obs/, 'observation'], [/^(res)/, 'resultat'], [/^conj/, 'conjecture'],
  ]
  for (const [re, t] of regles) if (re.test(s)) return t
  return admis ? 'definition' : 'assertion'
}

/** Rôle deviné quand la démonstration n'annote pas ses prémisses. */
function deviserRole(premisse: NoeudR | undefined): RolePremisse {
  if (!premisse) return 'principale'
  if (premisse.type === 'definition' || premisse.type === 'axiome') return 'contexte'
  if (premisse.type === 'lemme' && premisse.admis) return 'technique'
  return 'principale'
}

/** Convertit la réponse de GET /api/graphe en JeuRaisonnement (champs manquants complétés). */
export function depuisApiAtlas(json: GrapheApi, titre = 'Graphe Atlas'): JeuRaisonnement {
  const statutDe = (s: NoeudApi['statut']): Statut => (s === 'etabli' ? 'valide' : s === 'invalide' ? 'refute' : 'incertain')
  const noeuds: NoeudR[] = json.noeuds.map((n) => {
    const type = n.type ?? deviserType(n.id, n.admis)
    const statut = statutDe(n.statut)
    const auteurs = (n.demonstrations ?? []).map((d) => d.auteur)
    const origine: Origine = n.origine ?? (auteurs.length && auteurs.filter((a) => a === 'ia').length * 2 >= auteurs.length ? 'ia' : 'humain')
    const valides = (n.demonstrations ?? []).filter((d) => d.validite === 'valide')
    const validation: Validation = n.validation ?? (n.admis ? 'humain'
      : valides.length === 0 ? 'aucune'
        : valides.some((d) => d.auteur === 'ia') && valides.some((d) => d.auteur !== 'ia') ? 'ia_humain'
          : valides.some((d) => d.auteur === 'ia') ? 'ia' : 'humain')
    return {
      id: n.id, nom: n.nom, enonce: n.enonce, type, origine, auteur: auteurs[0] ?? 'inconnu', cree_le: n.cree_le,
      sousProbleme: n.sous_probleme ?? 'atlas', piste: n.piste ?? 'active', statut, validation,
      confiance: n.confiance ?? confianceDe(statut, validation, 0.5), admis: n.admis,
      // Rôles résolus après coup (il faut connaître le type des prémisses).
      demonstrations: (n.demonstrations ?? []).map((d) => ({
        nom: d.nom_demonstration, validite: d.validite, auteur: d.auteur, cree_le: d.cree_le ?? n.cree_le, texte: d.demonstration,
        premisses: (d.justifie_par ?? []).map((id) => ({ id, role: d.roles?.[id] ?? ('?' as unknown as RolePremisse) })),
      })),
      decision: n.decision, choix: n.choix, liens: n.liens,
    }
  })
  const parId = new Map(noeuds.map((n) => [n.id, n]))
  for (const n of noeuds) for (const d of n.demonstrations) for (const p of d.premisses) {
    if ((p.role as string) === '?') p.role = deviserRole(parId.get(p.id))
  }
  // Arêtes présentes dans `aretes` mais absentes des démonstrations (API partielle).
  for (const a of json.aretes ?? []) {
    const n = parId.get(a.cible)
    if (!n) continue
    let d = n.demonstrations.find((x) => x.nom === a.nom_demonstration)
    if (!d) n.demonstrations.push((d = { nom: a.nom_demonstration, premisses: [], validite: a.validite, auteur: n.auteur, cree_le: n.cree_le }))
    if (!d.premisses.some((p) => p.id === a.source)) d.premisses.push({ id: a.source, role: deviserRole(parId.get(a.source)) })
  }
  const sps = [...new Set(noeuds.map((n) => n.sousProbleme))]
  return {
    titre,
    resume: 'Graphe chargé depuis GET /api/graphe.',
    sousProblemes: sps.map((id) => ({ id, nom: id === 'atlas' ? 'Atlas' : id, resume: '' })),
    noeuds,
    source: 'api',
  }
}

/** Charge /api/graphe si disponible, sinon le jeu synthétique. */
export async function chargerJeu(url = '/api/graphe'): Promise<JeuRaisonnement> {
  try {
    const r = await fetch(url)
    if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) return depuisApiAtlas((await r.json()) as GrapheApi)
  } catch {
    // Pas d'API joignable : jeu synthétique.
  }
  return genererJeuRaisonnement()
}
