// Appels au serveur Atlas. Types calqués sur atlas/modeles.py.
//
// Le graphe (un par espace de travail) est servi partout (Vercel ou atlas.serveur) ; les conversations seulement
// par atlas.serveur
// (en local via le proxy Vite, ou sur la VM via VITE_API_URL).

const BASE = import.meta.env.VITE_API_URL ?? ''

// Jeton d'accès du serveur de l'orchestrateur (ATLAS_JETON_ACCES), saisi une fois et gardé dans ce navigateur.
const CLE_JETON = 'atlas.jeton'

export function lireJeton(): string | null {
  try {
    return localStorage.getItem(CLE_JETON)
  } catch {
    return null
  }
}

export function enregistrerJeton(jeton: string) {
  try {
    localStorage.setItem(CLE_JETON, jeton)
  } catch {
    // navigation privée : le jeton ne tiendra que le temps de la page
  }
  jetonEnMemoire = jeton
}

let jetonEnMemoire = lireJeton()

// Clé OpenAI de l'utilisateur (facultative), gardée dans ce navigateur seulement : ses tours de l'orchestrateur
// passent alors par ses crédits. Envoyée seulement aux routes qui font travailler Codex (en-tête X-Atlas-Cle-OpenAI).
const CLE_OPENAI = 'atlas.cle-openai'
const EVENEMENT_CLE = 'atlas:cle-openai'

let cleEnMemoire: string | null = (() => {
  try {
    return localStorage.getItem(CLE_OPENAI)
  } catch {
    return null
  }
})()

export function cleOpenAI(): string | null {
  return cleEnMemoire
}

/** Enregistre (ou efface, avec null) la clé OpenAI de ce navigateur et prévient l'interface. */
export function enregistrerCleOpenAI(cle: string | null) {
  cleEnMemoire = cle
  try {
    if (cle) localStorage.setItem(CLE_OPENAI, cle)
    else localStorage.removeItem(CLE_OPENAI)
  } catch {
    // navigation privée : la clé ne tiendra que le temps de la page
  }
  window.dispatchEvent(new Event(EVENEMENT_CLE))
}

export function surChangementCle(f: () => void) {
  window.addEventListener(EVENEMENT_CLE, f)
}

/** « sk-proj-…abcd » : de quoi reconnaître sa clé sans l'afficher. */
export function cleMasquee(cle: string): string {
  return `${cle.slice(0, cle.startsWith('sk-proj-') ? 8 : 3)}…${cle.slice(-4)}`
}

/** Le serveur a refusé le jeton (401) : l'interface doit en demander un. */
export class JetonRequis extends Error {}

export type Statut = 'etabli' | 'suspendu' | 'a_verifier' | 'invalide' | 'ouvert'
export type Validite = 'a_verifier' | 'valide' | 'invalide'
export type TypeNoeud =
  | 'hypothese' | 'definition' | 'axiome' | 'choix_modelisation' | 'decision' | 'lemme' | 'proposition'
  | 'theoreme' | 'assertion' | 'experience' | 'calcul' | 'observation' | 'resultat' | 'conjecture'
/** Rôle d'une prémisse dans une démonstration ; une prémisse absente de `roles` est principale. */
export type RolePremisse = 'principale' | 'auxiliaire' | 'technique' | 'contexte'

export interface Demonstration {
  projet_id: string
  noeud_id: string
  nom_demonstration: string
  justifie_par: string[]
  /** Rôle des prémisses non principales. */
  roles: Record<string, RolePremisse>
  demonstration: string
  validite: Validite
  /** Note du vérificateur (0 à 1), null tant qu'elle n'est pas jugée. */
  confiance: number | null
  auteur: string
}

export interface Noeud {
  projet_id: string
  id: string
  nom: string
  enonce: string
  admis: boolean
  type: TypeNoeud | null
  /** Décision : {question, alternatives, raison} ; choix de modélisation : {hypothese, portee, alternatives}. */
  details: Record<string, unknown> | null
  parents: string[]
  enfants: string[]
  conversation_id: string | null
  statut: Statut
  demonstrations: Demonstration[]
}

export interface Arete {
  source: string
  cible: string
  nom_demonstration: string
  validite: Validite
}

export interface Graphe {
  noeuds: Noeud[]
  aretes: Arete[]
}

/** Vue du graphe d'un espace (atlas/vue.py) : cadres imbriqués et nœuds placés en cases de grille. */
export interface GroupeVue {
  id: string
  nom: string
  parent_id: string | null
  genre: 'sous_probleme' | 'etape' | 'piste_abandonnee' | 'libre'
  couleur: string | null
  replie: boolean
  ordre: number
  /** [colonne_min, ligne_min, colonne_max, ligne_max], bornes incluses ; null si le cadre est vide. */
  rectangle: [number, number, number, number] | null
}

export interface PlacementVue {
  noeud_id: string
  groupe_id: string | null
  colonne: number
  ligne: number
  largeur: number
  hauteur: number
  fixe: boolean
}

export interface EtiquetteVue {
  id: string
  nom: string
  couleur: string | null
}

export interface Vue {
  groupes: GroupeVue[]
  /** Nœuds et figures placés ; une figure y figure sous l'id « fig:<id> ». */
  placements: PlacementVue[]
  etiquettes: EtiquetteVue[]
  /** [noeud_id, etiquette_id]. */
  marques: [string, string][]
  /** Figures (graphiques et images) rattachées aux nœuds ; absent d'un serveur plus ancien. */
  figures?: FigureVue[]
}

/** Axe d'un tracé (atlas/figures.py). */
export interface Axe {
  /** Markdown + LaTeX court (« $t$ »). */
  titre: string
  unite?: string
  echelle: 'lin' | 'log'
  min?: number
  max?: number
}

/** Paramètre d'une loi : valeur, incertitude, et le nœud qui la fournit. */
export interface ParametreLoi {
  valeur: number
  incertitude?: number
  noeud?: string
}

export type Serie =
  /** Points [x, y], [x, y, σy] ou [x, y, σy, σx]. */
  | { genre: 'mesures'; nom: string; source?: string; points: number[][] }
  /** Points [x, y], tracés en ligne. */
  | { genre: 'courbe'; nom: string; source?: string; points: number[][] }
  /** Loi échantillonnée par le serveur : points [x, y] et bande ±1σ [x, ymin, ymax]. */
  | {
    genre: 'loi'; nom: string; expression: string; variable: string; parametres: Record<string, ParametreLoi>
    de?: number; a?: number; points?: number[][]; bande?: number[][]
  }

export interface Trace {
  x: Axe
  y: Axe
  series: Serie[]
}

/** Une figure : tracé vectoriel et / ou image, qui illustre un nœud et a sa place dans la grille (« fig:<id> »). */
export interface FigureVue {
  id: string
  noeud_id: string
  titre: string
  /** Markdown + LaTeX. */
  legende: string | null
  trace: Trace | null
  /** Vrai : une image est servie par GET /api/figures/{id}/image. */
  image: boolean
  image_largeur: number | null
  image_hauteur: number | null
  source: string | null
  modifie_le: string
}

/** Une opération de vue (voir organiser_vue dans atlas/orchestrateur/mcp_atlas.py). */
export type OperationVue = { op: string } & Record<string, unknown>

/** Refus du serveur (422) : le message est à montrer tel quel. */
export class RefusVue extends Error {}

export interface Conversation {
  id: string
  titre: string
  session_agent: string | null
  projet_id: string | null
  modifie_le: string
}

/** Un espace de travail : ses sessions, et son dossier dans le bunker. */
export interface Projet {
  id: string
  nom: string
  description: string
  dossier: string
  modifie_le: string
}

export interface ListeProjets {
  utilisateur: string
  projets: Projet[]
}

/** Un nœud de l'arborescence d'un projet du bunker (atlas/orchestrateur/fichiers.py). */
export interface NoeudFichier {
  nom: string
  chemin: string
  type: 'dossier' | 'fichier'
  taille?: number
  modifie?: number
  enfants?: NoeudFichier[]
  tronque?: boolean
}

export interface Execution {
  id: string
  statut: 'en_cours' | 'terminee' | 'erreur' | 'arretee'
  erreur: string | null
  usage: { total?: { totalTokens?: number } } | null
}

/** Un modèle proposé par Codex pour l'orchestrateur, avec les efforts qu'il accepte. */
export interface ModeleCodex {
  id: string
  nom: string
  description: string
  par_defaut: boolean
  effort_defaut: string
  efforts: string[]
}

export interface Modeles {
  modele_defaut: string | null
  effort_defaut: string
  modeles: ModeleCodex[]
}

export type EtatAgent = 'actif' | 'attend' | 'termine' | 'echec' | 'interrompu'

/** Un agent de la conversation (atlas/orchestrateur/suivi_agents.py) : l'orchestrateur (/root) ou un sous-agent. */
export interface Agent {
  chemin: string
  thread_id: string
  parent: string | null
  role: string
  surnom: string | null
  modele: string | null
  etat: EtatAgent
  activite: string
  outil: string | null
  tokens: number
  nb_outils: number
  debut: number
  fin: number | null
  resultat: string | null
  /** Début de l'étape en cours (secondes), null si l'agent ne travaille pas. */
  depuis?: number | null
}

export interface EtatConversation extends Conversation {
  /** L'orchestrateur a un tour en cours. */
  en_cours: boolean
  /** L'orchestrateur ou un sous-agent travaille (les sous-agents continuent après le tour). */
  actif: boolean
  /** Messages en cours d'écriture, par chemin d'agent. */
  brouillons: Record<string, string>
  derniere_execution: Execution | null
  /** Un appel vocal avec Atlas voix est ouvert (atlas/voix). */
  appel_en_cours: boolean
}

/** WebSocket de l'appel vocal d'une conversation. Le jeton n'y figure pas : il part dans le premier message. */
export function urlAppel(conversationId: string): string {
  const url = new URL(`/api/conversations/${conversationId}/voix`, BASE || location.origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export function jetonAcces(): string | null {
  return jetonEnMemoire
}

export interface Message {
  id: number
  execution_id: string | null
  role: 'utilisateur' | 'assistant' | 'outil' | 'systeme'
  contenu: string
  donnees: Record<string, unknown> | null
  agent: string | null
  cree_le: string
}

/** `cle` : clé OpenAI à joindre (routes qui font travailler Codex) ; undefined : celle de ce navigateur, s'il en a une. */
async function requete(chemin: string, init?: RequestInit, avecCle = false, cle?: string | null): Promise<Response> {
  const entetes: Record<string, string> = {}
  if (init?.body) entetes['Content-Type'] = 'application/json'
  if (jetonEnMemoire) entetes.Authorization = `Bearer ${jetonEnMemoire}`
  const cleJointe = cle === undefined ? cleEnMemoire : cle
  if (avecCle && cleJointe) entetes['X-Atlas-Cle-OpenAI'] = cleJointe
  const r = await fetch(BASE + chemin, { ...init, headers: entetes })
  if (r.status === 401) throw new JetonRequis()
  if (!r.ok) throw new Error(`${chemin} : ${r.status} ${await r.text()}`)
  return r
}

async function appel<T>(chemin: string, init?: RequestInit, avecCle = false, cle?: string | null): Promise<T> {
  return (await requete(chemin, init, avecCle, cle)).json() as Promise<T>
}

export const api = {
  // Sans espace : le graphe du projet « defaut ».
  graphe: (projetId: string | null) =>
    appel<Graphe>(`/api/graphe${projetId ? `?projet_id=${encodeURIComponent(projetId)}` : ''}`),
  vue: (projetId: string | null) =>
    appel<Vue>(`/api/vue${projetId ? `?projet_id=${encodeURIComponent(projetId)}` : ''}`),
  /** Opérations de vue, tout ou rien ; RefusVue (422) avec le message du serveur si elles sont refusées. */
  organiserVue: async (projetId: string, operations: OperationVue[]) => {
    const entetes: Record<string, string> = { 'Content-Type': 'application/json' }
    if (jetonEnMemoire) entetes.Authorization = `Bearer ${jetonEnMemoire}`
    const r = await fetch(`${BASE}/api/projets/${encodeURIComponent(projetId)}/vue`, {
      method: 'POST',
      headers: entetes,
      body: JSON.stringify({ operations }),
    })
    if (r.status === 401) throw new JetonRequis()
    if (r.status === 422) {
      const corps = (await r.json().catch(() => null)) as { detail?: unknown } | null
      throw new RefusVue(typeof corps?.detail === 'string' ? corps.detail : 'Opération refusée par le serveur.')
    }
    if (!r.ok) throw new Error(`/vue : ${r.status} ${await r.text()}`)
    return (await r.json()) as Record<string, unknown>
  },
  /** Image d'une figure (fetch : le jeton d'accès est un en-tête) ; `v` ne sert qu'à contourner le cache. */
  imageFigure: async (projetId: string, figureId: string, v: string) =>
    (await requete(`/api/figures/${encodeURIComponent(figureId)}/image?projet_id=${encodeURIComponent(projetId)}&v=${encodeURIComponent(v)}`)).blob(),
  projets: () => appel<ListeProjets>('/api/projets'),
  creerProjet: (nom: string) =>
    appel<Projet>('/api/projets', { method: 'POST', body: JSON.stringify({ nom }) }),
  conversations: (projetId: string) =>
    appel<Conversation[]>(`/api/conversations?projet_id=${encodeURIComponent(projetId)}`),
  creerConversation: (projetId: string) =>
    appel<Conversation>('/api/conversations', { method: 'POST', body: JSON.stringify({ projet_id: projetId }) }),
  fichiers: (projetId: string) => appel<NoeudFichier>(`/api/projets/${projetId}/fichiers`),
  // Le fichier passe par fetch (le jeton d'accès est un en-tête) : l'aperçu en fait une URL blob.
  fichier: async (projetId: string, chemin: string) =>
    (await requete(`/api/projets/${projetId}/fichier?chemin=${encodeURIComponent(chemin)}`)).blob(),
  conversation: (id: string) => appel<EtatConversation>(`/api/conversations/${id}`),
  messages: (id: string, apresId?: number, agent?: string | null) => {
    const params = new URLSearchParams()
    if (apresId !== undefined) params.set('apres_id', String(apresId))
    if (agent) params.set('agent', agent)
    const requete = params.toString()
    return appel<Message[]>(`/api/conversations/${id}/messages${requete ? `?${requete}` : ''}`)
  },
  agents: (id: string) => appel<Agent[]>(`/api/conversations/${id}/agents`),
  envoyer: (id: string, contenu: string, agent?: string | null, reglages: { modele?: string; effort?: string } = {}) =>
    appel<Execution>(`/api/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ contenu, ...(agent ? { agent } : {}), ...reglages }),
    }, true),
  modeles: () => appel<Modeles>('/api/orchestrateur/modeles', undefined, true),
  /** Connecte la clé sur le serveur (processus Codex à elle) ; lève avec la raison si elle est refusée. */
  verifierCle: (cle: string) =>
    appel<{ ok: boolean; modeles: string[]; manquants: Record<string, string> }>(
      '/api/orchestrateur/compte', { method: 'POST' }, true, cle,
    ),
  /** Supprime du serveur la connexion et les threads de la clé. */
  oublierCle: (cle: string) => appel<{ ok: boolean }>('/api/orchestrateur/compte', { method: 'DELETE' }, true, cle),
  /** Tout arrêter, ou seulement le sous-agent `agent`. */
  arreter: (id: string, agent?: string | null) =>
    appel<unknown>(`/api/conversations/${id}/arreter`, {
      method: 'POST',
      body: JSON.stringify(agent ? { agent } : {}),
    }),
}
