// Modèle de données étendu (CONCEPTION §2), jeu synthétique déterministe et adaptateur GET /api/graphe.

import { creerAlea, clamp, type Alea } from './maths'

export const TYPES_NOEUD = ['definition', 'hypothese', 'assertion', 'lemme', 'resultat', 'experience', 'calcul', 'observation'] as const
export type TypeNoeud = (typeof TYPES_NOEUD)[number]
export const ORIGINES = ['humain', 'ia', 'ordinateur'] as const
export type Origine = (typeof ORIGINES)[number]
export const STATUTS = ['valide', 'incertain', 'refute'] as const
export type Statut = (typeof STATUTS)[number]
export const VALIDATIONS = ['aucune', 'ia', 'humain', 'ia_humain'] as const
export type Validation = (typeof VALIDATIONS)[number]
export type Validite = 'a_verifier' | 'valide' | 'invalide'

export const LIBELLES_TYPE: Record<TypeNoeud, string> = {
  definition: 'Définition',
  hypothese: 'Hypothèse',
  assertion: 'Assertion',
  lemme: 'Lemme',
  resultat: 'Résultat',
  experience: 'Expérience',
  calcul: 'Calcul',
  observation: 'Observation',
}
export const LIBELLES_ORIGINE: Record<Origine, string> = { humain: 'Humain', ia: 'IA', ordinateur: 'Ordinateur' }
export const LIBELLES_STATUT: Record<Statut, string> = { valide: 'Validé', incertain: 'Incertain', refute: 'Réfuté' }
export const LIBELLES_VALIDATION: Record<Validation, string> = {
  aucune: 'Aucune',
  ia: 'IA',
  humain: 'Humain',
  ia_humain: 'IA + humain',
}
export const LIBELLES_VALIDITE: Record<Validite, string> = { a_verifier: 'À vérifier', valide: 'Valide', invalide: 'Invalide' }

export interface Confiance {
  estimation: number
  bas: number
  haut: number
}

export interface Demonstration {
  nom: string
  justifie_par: string[]
  validite: Validite
  auteur: string
  texte?: string
}

export interface Noeud {
  id: string
  nom: string
  enonce: string
  type: TypeNoeud
  origine: Origine
  /** [domaine, thème, sous-thème] */
  categorie: [string, string, string]
  /** Date ISO. */
  cree_le: string
  /** Session de recherche : nœuds « appelés ensemble ». */
  session: string
  statut: Statut
  validation: Validation
  confiance: Confiance
  /** Prémisses (union des démonstrations). */
  justifie_par: string[]
  demonstrations: Demonstration[]
  admis?: boolean
}

export interface JeuDonnees {
  noeuds: Noeud[]
  source: 'synthetique' | 'api'
}

// ─── Jeu synthétique ─────────────────────────────────────────────────────────

interface SousThemeDef {
  nom: string
  notions: string[]
}
interface ThemeDef {
  nom: string
  sous: SousThemeDef[]
}
interface DomaineDef {
  nom: string
  themes: ThemeDef[]
  /** Poids des types (ordre TYPES_NOEUD). */
  types: number[]
  experience: string
}

const st = (nom: string, ...notions: string[]): SousThemeDef => ({ nom, notions })

export const HIERARCHIE_SYNTHETIQUE: DomaineDef[] = [
  {
    nom: 'Analyse',
    types: [14, 8, 16, 24, 20, 3, 10, 5],
    experience: 'Vérification numérique',
    themes: [
      {
        nom: 'Suites et séries',
        sous: [
          st('Convergence monotone', 'convergence monotone', 'borne supérieure', 'suites adjacentes', 'limite monotone', 'suite de Cauchy'),
          st('Séries entières', 'rayon de convergence', 'série entière', 'prolongement analytique', 'développement en série', "règle de d'Alembert"),
          st('Critères de convergence', 'critère de Cauchy', 'convergence absolue', 'série alternée', 'comparaison série-intégrale', 'sommation par parties'),
        ],
      },
      {
        nom: 'Intégration',
        sous: [
          st('Intégrale de Lebesgue', 'mesure de Lebesgue', 'fonction mesurable', 'intégrabilité', 'tribu borélienne', 'ensemble négligeable'),
          st('Théorèmes de convergence', 'convergence dominée', 'intégrabilité uniforme', 'convergence presque partout', 'interversion limite-intégrale'),
          st('Espaces Lp', 'inégalité de Hölder', 'inégalité de Minkowski', 'complétude de Lp', 'densité des fonctions continues', 'dualité Lp-Lq'),
        ],
      },
      {
        nom: 'Équations différentielles',
        sous: [
          st('Existence et unicité', 'théorème de Cauchy-Lipschitz', 'solution maximale', 'inégalité de Grönwall', 'condition de Lipschitz', 'explosion en temps fini'),
          st('Stabilité', 'stabilité de Lyapunov', "point d'équilibre", 'linéarisation', 'fonction de Lyapunov', 'stabilité asymptotique'),
          st('Systèmes dynamiques', 'orbite périodique', 'attracteur étrange', 'bifurcation de Hopf', 'section de Poincaré', 'exposant de Lyapunov'),
        ],
      },
      {
        nom: 'Analyse fonctionnelle',
        sous: [
          st('Espaces de Banach', 'espace de Banach', 'théorème de Hahn-Banach', 'espace réflexif', 'topologie faible', 'théorème de Baire'),
          st('Opérateurs compacts', 'opérateur compact', 'alternative de Fredholm', 'opérateur de Hilbert-Schmidt', 'approximation de rang fini'),
          st('Théorie spectrale', "spectre d'un opérateur", 'valeur propre', 'résolvante', 'théorème spectral', 'calcul fonctionnel'),
        ],
      },
    ],
  },
  {
    nom: 'Probabilités et statistique',
    types: [10, 10, 14, 18, 14, 8, 16, 10],
    experience: 'Simulation Monte-Carlo',
    themes: [
      {
        nom: 'Processus stochastiques',
        sous: [
          st('Chaînes de Markov', 'matrice de transition', 'mesure invariante', 'ergodicité', 'temps de mélange', 'récurrence'),
          st('Martingales', 'martingale', "temps d'arrêt", 'inégalité de Doob', 'convergence des martingales', "théorème d'arrêt"),
          st('Mouvement brownien', 'mouvement brownien', "intégrale d'Itô", "formule d'Itô", 'variation quadratique', 'processus de diffusion'),
        ],
      },
      {
        nom: 'Inférence',
        sous: [
          st('Estimation bayésienne', 'loi a posteriori', 'loi a priori conjuguée', 'estimateur bayésien', 'vraisemblance marginale', 'intervalle de crédibilité'),
          st("Tests d'hypothèses", 'rapport de vraisemblance', 'puissance du test', 'p-valeur', 'correction de Bonferroni', 'test du khi-deux'),
        ],
      },
      {
        nom: 'Méthodes Monte-Carlo',
        sous: [
          st('Échantillonnage préférentiel', 'loi instrumentale', "poids d'importance", "taille effective d'échantillon", 'estimateur autonormalisé'),
          st('MCMC', 'algorithme de Metropolis-Hastings', 'échantillonneur de Gibbs', 'temps de chauffe', 'autocorrélation des chaînes', 'diagnostic de Gelman-Rubin'),
          st('Réduction de variance', 'variables de contrôle', 'variables antithétiques', 'stratification', 'quasi-Monte-Carlo'),
        ],
      },
    ],
  },
  {
    nom: 'Physique numérique',
    types: [8, 10, 10, 10, 8, 18, 22, 14],
    experience: 'Simulation',
    themes: [
      {
        nom: 'Mécanique des fluides',
        sous: [
          st('Navier-Stokes', 'équations de Navier-Stokes', 'nombre de Reynolds', "condition d'incompressibilité", 'couche limite', 'solution faible de Leray'),
          st('Turbulence', "cascade d'énergie", 'spectre de Kolmogorov', 'intermittence', 'modèle k-epsilon', 'simulation des grandes échelles'),
          st('Écoulements poreux', 'loi de Darcy', 'perméabilité', 'milieu poreux', 'front de saturation'),
        ],
      },
      {
        nom: 'Schémas numériques',
        sous: [
          st('Éléments finis', 'formulation variationnelle', 'lemme de Céa', 'maillage adaptatif', 'élément de Lagrange', 'estimation a posteriori'),
          st('Volumes finis', 'flux numérique', 'schéma de Godunov', 'schéma décentré', 'conservation discrète'),
          st('Stabilité CFL', 'condition CFL', 'stabilité de von Neumann', 'dissipation numérique', 'pas de temps adaptatif'),
        ],
      },
      {
        nom: 'Matière condensée',
        sous: [
          st("Modèle d'Ising", "modèle d'Ising", 'aimantation spontanée', 'température critique', 'algorithme de Wolff', 'fonction de partition'),
          st('Transitions de phase', 'exposant critique', 'groupe de renormalisation', 'longueur de corrélation', "loi d'échelle"),
        ],
      },
    ],
  },
  {
    nom: 'Apprentissage automatique',
    types: [6, 12, 12, 10, 8, 24, 14, 14],
    experience: "Expérience d'entraînement",
    themes: [
      {
        nom: 'Optimisation',
        sous: [
          st('Descente de gradient', 'descente de gradient', "pas d'apprentissage", 'accélération de Nesterov', 'condition de Polyak-Łojasiewicz', 'point selle'),
          st('Convexité', 'forte convexité', 'dualité de Lagrange', 'conditions KKT', 'sous-gradient', 'opérateur proximal'),
          st('Méthodes stochastiques', 'gradient stochastique', 'réduction de variance SVRG', 'taille de lot', 'méthode Adam', 'bruit de gradient'),
        ],
      },
      {
        nom: "Théorie de l'apprentissage",
        sous: [
          st('Généralisation', 'erreur de généralisation', 'complexité de Rademacher', 'borne PAC-bayésienne', 'double descente', 'stabilité algorithmique'),
          st('Dimension VC', 'dimension VC', 'lemme de Sauer-Shelah', 'fonction de croissance', 'apprenabilité PAC'),
        ],
      },
      {
        nom: 'Réseaux de neurones',
        sous: [
          st('Approximation universelle', 'approximation universelle', 'réseau à une couche cachée', 'profondeur et expressivité', 'activation ReLU'),
          st("Dynamique d'entraînement", 'noyau tangent neuronal', 'régime paresseux', 'apprentissage de caractéristiques', 'initialisation', 'grokking'),
          st('Architectures', "mécanisme d'attention", 'connexion résiduelle', 'normalisation par couches', 'réseau convolutif'),
        ],
      },
      {
        nom: 'Expériences',
        sous: [
          st('Jeux de données', 'jeu de données synthétique', 'fuite de données', "biais d'échantillonnage", 'augmentation de données'),
          st('Ablations', 'ablation de couche', 'sensibilité aux hyperparamètres', 'graine aléatoire', "loi d'échelle empirique"),
        ],
      },
    ],
  },
]

const COMPLEMENTS = [
  'en dimension finie', 'sous contrainte', 'à pas variable', 'en régime stationnaire', 'dans le cas borné',
  'à grande échelle', 'sur domaine borné', 'en temps long', 'avec bruit', 'dans le cas général',
  'sous hypothèse de régularité', 'pour données parcimonieuses', 'en grande dimension', 'au voisinage du point critique',
]
const CHERCHEURS = ['C. Duparc', 'M. Laurent', 'A. Benali', 'J. Moreau', 'S. Petit', 'L. Nguyen']
const NOMS_DEMO: Partial<Record<TypeNoeud, string[]>> = {
  lemme: ['Démonstration directe', "Par l'absurde", 'Par récurrence', 'Par compacité', 'Argument de densité'],
  resultat: ['Démonstration directe', 'Par récurrence', 'Par couplage', 'Par passage à la limite', 'Argument variationnel'],
  assertion: ['Argument direct', 'Par contre-exemple', 'Par comparaison'],
  experience: ['Protocole expérimental', 'Protocole de réplication'],
  calcul: ['Script de calcul', 'Calcul formel', 'Intégration numérique'],
  observation: ['Relevé de mesures', 'Analyse des journaux'],
  hypothese: ['Motivation heuristique'],
  definition: ['Construction'],
}

const elision = (mot: string) => (/^[aeiouyéèêâîôûh]/i.test(mot) ? "d'" : 'de ')
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function nommer(type: TypeNoeud, notion: string, complement: string, dom: DomaineDef, a: Alea, numero: () => number): string {
  switch (type) {
    case 'definition':
      return a.suivant() < 0.5 ? `Définition : ${notion}` : `${majuscule(notion)} (définition)`
    case 'hypothese':
      return `Hypothèse : ${notion} ${complement}`
    case 'assertion':
      return `${majuscule(notion)} ${complement}`
    case 'lemme':
      return `Lemme ${elision(notion)}${notion}${a.suivant() < 0.4 ? ' ' + complement : ''}`
    case 'resultat': {
      const f = a.choix(['Théorème', 'Proposition', 'Corollaire'])
      return `${f} ${elision(notion)}${notion}${a.suivant() < 0.35 ? ' ' + complement : ''}`
    }
    case 'experience':
      return `${dom.experience} n°${numero()} — ${notion}`
    case 'calcul':
      return a.suivant() < 0.5 ? `Calcul ${elision(notion)}${notion}` : `Estimation numérique n°${numero()} : ${notion}`
    case 'observation':
      return `Observation : ${notion} ${complement}`
  }
}

function enoncer(type: TypeNoeud, notion: string, complement: string, a: Alea): string {
  const k = a.entier(1, 6)
  switch (type) {
    case 'definition':
      return `On appelle ${notion} tout objet vérifiant les conditions (C1) à (C${k + 1}).`
    case 'hypothese':
      return `On suppose que la propriété « ${notion} » est satisfaite ${complement}.`
    case 'assertion':
      return `La propriété « ${notion} » entraîne (P${k}) ${complement}.`
    case 'lemme':
      return `Sous les hypothèses de la section ${k}, la quantité associée à « ${notion} » reste contrôlée ${complement}.`
    case 'resultat':
      return `Pour toute donnée admissible, « ${notion} » implique la convergence annoncée ${complement}.`
    case 'experience':
      return `Protocole : ${a.entier(3, 40)} répétitions, mesure de « ${notion} » ${complement}.`
    case 'calcul':
      return `Calcul numérique de « ${notion} » ${complement} (précision 1e-${k + 2}).`
    case 'observation':
      return `On observe un comportement inattendu de « ${notion} » ${complement}.`
  }
}

const NOEUDS_SEED: Omit<Noeud, 'cree_le' | 'session'>[] = [
  {
    id: 'def_suite_croissante', nom: 'Suite croissante', type: 'definition', origine: 'humain', admis: true,
    enonce: 'Une suite réelle $(u_n)_{n \\in \\mathbb{N}}$ est **croissante** si $u_n \\le u_{n+1}$ pour tout $n$.',
    categorie: ['Analyse', 'Suites et séries', 'Convergence monotone'],
    statut: 'valide', validation: 'humain', confiance: { estimation: 0.99, bas: 0.97, haut: 1 }, justifie_par: [], demonstrations: [],
  },
  {
    id: 'def_convergence', nom: "Convergence d'une suite", type: 'definition', origine: 'humain', admis: true,
    enonce: '$(u_n)$ **converge** vers $\\ell$ si $\\forall \\varepsilon > 0,\\ \\exists N,\\ \\forall n \\ge N,\\ |u_n - \\ell| \\le \\varepsilon$.',
    categorie: ['Analyse', 'Suites et séries', 'Convergence monotone'],
    statut: 'valide', validation: 'humain', confiance: { estimation: 0.99, bas: 0.97, haut: 1 }, justifie_par: [], demonstrations: [],
  },
  {
    id: 'axiome_borne_sup', nom: 'Propriété de la borne supérieure', type: 'hypothese', origine: 'humain', admis: true,
    enonce: 'Toute partie non vide et majorée de $\\mathbb{R}$ admet une borne supérieure.',
    categorie: ['Analyse', 'Suites et séries', 'Convergence monotone'],
    statut: 'valide', validation: 'humain', confiance: { estimation: 0.99, bas: 0.98, haut: 1 }, justifie_par: [], demonstrations: [],
  },
  {
    id: 'lemme_approx_sup', nom: 'Approximation de la borne supérieure', type: 'lemme', origine: 'ia',
    enonce: 'Si $(u_n)$ est majorée, alors $\\ell = \\sup_n u_n$ existe et pour tout $\\varepsilon > 0$ il existe $N$ tel que $u_N > \\ell - \\varepsilon$.',
    categorie: ['Analyse', 'Suites et séries', 'Convergence monotone'],
    statut: 'incertain', validation: 'ia', confiance: { estimation: 0.72, bas: 0.55, haut: 0.86 },
    justifie_par: ['axiome_borne_sup'],
    demonstrations: [
      { nom: 'Par caractérisation de la borne supérieure', justifie_par: ['axiome_borne_sup'], validite: 'a_verifier', auteur: 'ia' },
      { nom: "Par l'absurde (erronée)", justifie_par: ['axiome_borne_sup'], validite: 'invalide', auteur: 'ia' },
    ],
  },
  {
    id: 'thm_convergence_monotone', nom: 'Théorème de la limite monotone', type: 'resultat', origine: 'ia',
    enonce: 'Toute suite réelle croissante et majorée converge, vers $\\sup_n u_n$.',
    categorie: ['Analyse', 'Suites et séries', 'Convergence monotone'],
    statut: 'valide', validation: 'ia_humain', confiance: { estimation: 0.93, bas: 0.88, haut: 0.97 },
    justifie_par: ['def_suite_croissante', 'def_convergence', 'lemme_approx_sup'],
    demonstrations: [
      { nom: 'Démonstration directe', justifie_par: ['def_suite_croissante', 'def_convergence', 'lemme_approx_sup'], validite: 'valide', auteur: 'ia' },
    ],
  },
]

export interface OptionsSynthetique {
  graine?: number
  nbNoeuds?: number
  /** Début de la période (ISO). */
  debut?: string
  jours?: number
}

interface SousThemeRef {
  d: number
  t: number
  s: number
  def: SousThemeDef
  poids: number
}

/** Jeu synthétique réaliste et déterministe (même graine → mêmes données). */
export function genererJeuSynthetique(options: OptionsSynthetique = {}): JeuDonnees {
  const a = creerAlea(options.graine ?? 42)
  const nbNoeuds = options.nbNoeuds ?? 1200
  const debut = Date.parse(options.debut ?? '2026-03-23T08:00:00Z')
  const jours = options.jours ?? 182
  const JOUR = 86_400_000

  const sousThemes: SousThemeRef[] = []
  HIERARCHIE_SYNTHETIQUE.forEach((dom, d) =>
    dom.themes.forEach((th, t) =>
      th.sous.forEach((s, i) => sousThemes.push({ d, t, s: i, def: s, poids: 0.4 + a.suivant() * 1.6 })),
    ),
  )

  // Rafales d'activité : quelques pics, chacun avec 2-3 sous-thèmes « à la mode ».
  const rafales = Array.from({ length: 9 }, () => ({
    centre: a.entre(0.04, 0.97) * jours,
    focus: [a.choix(sousThemes), a.choix(sousThemes), a.choix(sousThemes)],
  }))

  interface Session { id: string; date: number; st: SousThemeRef; taille: number; origine: Origine }
  const sessions: Session[] = []
  let total = NOEUDS_SEED.length
  while (total < nbNoeuds) {
    const r = a.choix(rafales)
    const enRafale = a.suivant() < 0.72
    const jour = enRafale ? clamp(r.centre + a.normal() * 4, 1, jours - 0.5) : a.entre(1, jours - 0.5)
    const stRef = enRafale && a.suivant() < 0.65 ? a.choix(r.focus) : a.pondere(sousThemes, sousThemes.map((s) => s.poids))
    const taille = Math.min(nbNoeuds - total, clamp(Math.round(5 + Math.abs(a.normal()) * 17), 3, 60))
    const heure = a.entre(8.5, 19)
    sessions.push({
      id: '',
      date: debut + Math.floor(jour) * JOUR + heure * 3_600_000,
      st: stRef,
      taille,
      origine: a.pondere(ORIGINES, [40, 42, 18]),
    })
    total += taille
  }
  sessions.sort((x, y) => x.date - y.date)
  sessions.forEach((s, i) => (s.id = `s${String(i + 1).padStart(3, '0')}`))

  const noeuds: Noeud[] = []
  const date = new Date(debut)
  for (const n of NOEUDS_SEED) {
    noeuds.push({ ...n, cree_le: new Date(date.getTime() + noeuds.length * 600_000).toISOString(), session: 's000' })
  }

  // Index pour le choix des prémisses.
  const parSousTheme = new Map<SousThemeRef, number[]>()
  const parTheme = new Map<string, number[]>()
  const cleTheme = (s: SousThemeRef) => `${s.d}/${s.t}`
  const stSeed = sousThemes[0]!
  parSousTheme.set(stSeed, noeuds.map((_, i) => i))
  parTheme.set(cleTheme(stSeed), noeuds.map((_, i) => i))
  const compteurs = new Map<string, number>()
  const nomsVus = new Map<string, number>()

  const choisirRecent = (liste: number[] | undefined, exclus: Set<number>): number | undefined => {
    if (!liste || liste.length === 0) return undefined
    for (let essai = 0; essai < 4; essai++) {
      const u = a.suivant()
      const i = liste.length - 1 - Math.floor(liste.length * u * u)
      const c = liste[i]!
      if (!exclus.has(c)) return c
    }
    return undefined
  }

  const NB_PREMISSES: Record<TypeNoeud, [number, number]> = {
    definition: [0, 1], hypothese: [0, 1], assertion: [1, 2], lemme: [1, 3], resultat: [2, 4],
    experience: [1, 2], calcul: [1, 2], observation: [1, 2],
  }

  for (const session of sessions) {
    const dom = HIERARCHIE_SYNTHETIQUE[session.st.d]!
    const dansSession: number[] = []
    let t = session.date
    for (let k = 0; k < session.taille; k++) {
      const pos = k / Math.max(1, session.taille - 1)
      // Sous-thème : surtout celui de la session, parfois un voisin du même thème.
      let stRef = session.st
      const r = a.suivant()
      if (r < 0.1) {
        const voisins = sousThemes.filter((s) => s.d === stRef.d && s.t === stRef.t)
        stRef = a.choix(voisins)
      } else if (r < 0.14) stRef = a.choix(sousThemes)

      const poidsTypes = dom.types.map((p, i) => {
        const type = TYPES_NOEUD[i]!
        if (pos < 0.25 && (type === 'definition' || type === 'hypothese')) return p * 2.5
        if (pos > 0.7 && (type === 'resultat' || type === 'observation')) return p * 1.8
        return p
      })
      const type = a.pondere(TYPES_NOEUD, poidsTypes)
      const empirique = type === 'experience' || type === 'calcul'
      const origine: Origine =
        a.suivant() < 0.55
          ? empirique && session.origine === 'humain' ? 'ordinateur' : session.origine
          : empirique ? a.pondere(ORIGINES, [20, 25, 55]) : a.pondere(ORIGINES, [45, 45, 10])

      // Prémisses : même session, même sous-thème, même thème, puis transverses.
      const [mini, maxi] = NB_PREMISSES[type]
      const nbPrem = type === 'definition' && a.suivant() < 0.7 ? 0 : a.entier(mini, maxi)
      const premisses = new Set<number>()
      for (let p = 0; p < nbPrem; p++) {
        const s = a.suivant()
        let c: number | undefined
        if (s < 0.5) c = choisirRecent(dansSession, premisses)
        else if (s < 0.78) c = choisirRecent(parSousTheme.get(stRef), premisses)
        else if (s < 0.9) c = choisirRecent(parTheme.get(cleTheme(stRef)), premisses)
        else if (noeuds.length > 0) {
          const cand = a.entier(0, noeuds.length - 1)
          if (!premisses.has(cand)) c = cand
        }
        c ??= choisirRecent(dansSession, premisses) ?? choisirRecent(parSousTheme.get(stRef), premisses)
        if (c !== undefined) premisses.add(c)
      }
      const premRefutee = [...premisses].some((i) => noeuds[i]!.statut === 'refute')

      // Statut, validation, confiance cohérents.
      const recence = (t - debut) / (jours * JOUR)
      let pv = type === 'definition' ? 0.93 : type === 'hypothese' ? 0.35 : type === 'observation' ? 0.5 : 0.62
      let pr = type === 'definition' ? 0.01 : 0.1
      if (premRefutee) {
        pv -= 0.2
        pr += 0.15
      }
      if (recence > 0.88) pv -= 0.15
      const statut = a.pondere(STATUTS, [Math.max(0.02, pv), Math.max(0.05, 1 - pv - pr), pr])
      const validation: Validation =
        statut === 'valide'
          ? a.pondere(VALIDATIONS, [5, origine === 'ordinateur' ? 30 : 15, 35, 45])
          : statut === 'incertain'
            ? a.pondere(VALIDATIONS, [50, 30, 15, 5])
            : a.pondere(VALIDATIONS, [0, 30, 50, 20])
      const centre = statut === 'valide' ? a.entre(0.78, 0.97) : statut === 'incertain' ? a.entre(0.38, 0.72) : a.entre(0.04, 0.24)
      const largeur = { aucune: 0.4, ia: 0.26, humain: 0.16, ia_humain: 0.08 }[validation] * a.entre(0.6, 1.3)
      const u = a.suivant()
      const confiance: Confiance = {
        estimation: +centre.toFixed(3),
        bas: +Math.max(0, centre - largeur * u).toFixed(3),
        haut: +Math.min(1, centre + largeur * (1 - u)).toFixed(3),
      }

      // Nom, énoncé.
      const notion = a.choix(stRef.def.notions)
      const complement = a.choix(COMPLEMENTS)
      const cleNum = `${stRef.d}/${type}`
      let nom = nommer(type, notion, complement, dom, a, () => {
        const v = (compteurs.get(cleNum) ?? 0) + 1
        compteurs.set(cleNum, v)
        return v
      })
      const vus = nomsVus.get(nom) ?? 0
      nomsVus.set(nom, vus + 1)
      if (vus > 0) nom = `${nom} (${vus + 1})`

      // Démonstrations.
      const ids = [...premisses].map((i) => noeuds[i]!.id)
      const auteur = origine === 'humain' ? a.choix(CHERCHEURS) : origine === 'ia' ? 'ia' : 'calcul'
      const validite: Validite =
        statut === 'refute' ? 'invalide' : statut === 'valide' && validation !== 'aucune' && validation !== 'ia' ? 'valide' : 'a_verifier'
      const demonstrations: Demonstration[] = []
      if (ids.length > 0) {
        const noms = NOMS_DEMO[type] ?? ['Démonstration directe']
        demonstrations.push({ nom: a.choix(noms), justifie_par: ids, validite, auteur })
        if (ids.length > 1 && a.suivant() < 0.18) {
          demonstrations.push({
            nom: a.choix(noms) + ' (variante)',
            justifie_par: ids.slice(0, Math.max(1, ids.length - 1)),
            validite: statut === 'refute' ? 'invalide' : 'a_verifier',
            auteur: a.suivant() < 0.5 ? 'ia' : a.choix(CHERCHEURS),
          })
        }
      }

      const d = HIERARCHIE_SYNTHETIQUE[stRef.d]!
      const th = d.themes[stRef.t]!
      const index = noeuds.length
      noeuds.push({
        id: `n${String(index).padStart(4, '0')}`,
        nom,
        enonce: enoncer(type, notion, complement, a),
        type,
        origine,
        categorie: [d.nom, th.nom, stRef.def.nom],
        cree_le: new Date(t).toISOString(),
        session: session.id,
        statut,
        validation,
        confiance,
        justifie_par: ids,
        demonstrations,
      })
      dansSession.push(index)
      if (!parSousTheme.has(stRef)) parSousTheme.set(stRef, [])
      parSousTheme.get(stRef)!.push(index)
      const ct = cleTheme(stRef)
      if (!parTheme.has(ct)) parTheme.set(ct, [])
      parTheme.get(ct)!.push(index)
      t += a.entre(2, 14) * 60_000
    }
  }
  return { noeuds, source: 'synthetique' }
}

// ─── Adaptateur GET /api/graphe (atlas/modeles.py : Graphe{noeuds, aretes}) ───

interface DemonstrationApi {
  noeud_id?: string
  nom_demonstration: string
  justifie_par: string[]
  demonstration?: string
  validite: Validite
  auteur: string
}
interface NoeudApi {
  id: string
  nom: string
  enonce: string
  admis: boolean
  cree_le: string
  statut: 'etabli' | 'suspendu' | 'a_verifier' | 'invalide' | 'ouvert'
  demonstrations: DemonstrationApi[]
  // Champs étendus facultatifs (futurs) : repris tels quels s'ils existent.
  type?: TypeNoeud
  origine?: Origine
  categorie?: [string, string, string]
  session?: string
  validation?: Validation
  confiance?: Confiance
}
export interface GrapheApi {
  noeuds: NoeudApi[]
  aretes: { source: string; cible: string; nom_demonstration: string; validite: Validite }[]
}

function deviserType(n: NoeudApi): TypeNoeud {
  const id = n.id.toLowerCase()
  if (id.startsWith('def')) return 'definition'
  if (id.startsWith('axiome') || id.startsWith('hyp')) return 'hypothese'
  if (id.startsWith('lemme') || id.startsWith('lem')) return 'lemme'
  if (id.startsWith('thm') || id.startsWith('theoreme') || id.startsWith('prop') || id.startsWith('cor')) return 'resultat'
  if (id.startsWith('exp')) return 'experience'
  if (id.startsWith('calc')) return 'calcul'
  if (id.startsWith('obs')) return 'observation'
  return n.admis ? 'definition' : 'assertion'
}

/** Convertit la réponse de GET /api/graphe en JeuDonnees, en complétant les champs manquants. */
export function depuisApiAtlas(json: GrapheApi): JeuDonnees {
  const premissesParNoeud = new Map<string, Set<string>>()
  for (const ar of json.aretes ?? []) {
    if (!premissesParNoeud.has(ar.cible)) premissesParNoeud.set(ar.cible, new Set())
    premissesParNoeud.get(ar.cible)!.add(ar.source)
  }
  const noeuds: Noeud[] = json.noeuds.map((n) => {
    const type = n.type ?? deviserType(n)
    const demonstrations: Demonstration[] = (n.demonstrations ?? []).map((d) => ({
      nom: d.nom_demonstration,
      justifie_par: d.justifie_par ?? [],
      validite: d.validite,
      auteur: d.auteur,
      texte: d.demonstration,
    }))
    const premisses = new Set<string>(premissesParNoeud.get(n.id) ?? [])
    for (const d of demonstrations) for (const p of d.justifie_par) premisses.add(p)

    const auteurs = demonstrations.map((d) => d.auteur)
    const origine: Origine =
      n.origine ?? (auteurs.length === 0 ? 'humain' : auteurs.filter((x) => x === 'ia').length * 2 >= auteurs.length ? 'ia' : 'humain')
    const statut: Statut = n.statut === 'etabli' ? 'valide' : n.statut === 'invalide' ? 'refute' : 'incertain'
    const valides = demonstrations.filter((d) => d.validite === 'valide')
    const validation: Validation =
      n.validation ??
      (n.admis
        ? 'humain'
        : valides.length === 0
          ? 'aucune'
          : valides.some((d) => d.auteur === 'ia') && valides.some((d) => d.auteur !== 'ia')
            ? 'ia_humain'
            : valides.some((d) => d.auteur === 'ia') ? 'ia' : 'humain')
    const confiance: Confiance =
      n.confiance ??
      (statut === 'valide'
        ? { estimation: 0.9, bas: 0.82, haut: 0.97 }
        : statut === 'refute'
          ? { estimation: 0.1, bas: 0.02, haut: 0.22 }
          : { estimation: 0.55, bas: 0.3, haut: 0.78 })
    const groupe =
      type === 'definition' || type === 'hypothese' ? 'Fondements'
        : type === 'experience' || type === 'calcul' || type === 'observation' ? 'Empirique' : 'Démonstrations'
    return {
      id: n.id,
      nom: n.nom,
      enonce: n.enonce,
      type,
      origine,
      categorie: n.categorie ?? ['Atlas', groupe, LIBELLES_TYPE[type]],
      cree_le: n.cree_le,
      session: n.session ?? String(n.cree_le).slice(0, 10),
      statut,
      validation,
      confiance,
      justifie_par: [...premisses],
      demonstrations,
      admis: n.admis,
    }
  })
  return { noeuds, source: 'api' }
}

/** Charge /api/graphe si disponible, sinon le jeu synthétique. */
export async function chargerDonnees(url = '/api/graphe'): Promise<JeuDonnees> {
  try {
    const r = await fetch(url)
    if (r.ok) return depuisApiAtlas((await r.json()) as GrapheApi)
  } catch {
    // Pas d'API joignable : on retombe sur le jeu synthétique.
  }
  return genererJeuSynthetique()
}
