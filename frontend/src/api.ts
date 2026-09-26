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

/** Le serveur a refusé le jeton (401) : l'interface doit en demander un. */
export class JetonRequis extends Error {}

export type Statut = 'etabli' | 'suspendu' | 'a_verifier' | 'invalide' | 'ouvert'
export type Validite = 'a_verifier' | 'valide' | 'invalide'

export interface Demonstration {
  projet_id: string
  noeud_id: string
  nom_demonstration: string
  justifie_par: string[]
  demonstration: string
  validite: Validite
  auteur: string
}

export interface Noeud {
  projet_id: string
  id: string
  nom: string
  enonce: string
  admis: boolean
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
}

export interface EtatConversation extends Conversation {
  en_cours: boolean
  derniere_execution: Execution | null
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

async function requete(chemin: string, init?: RequestInit): Promise<Response> {
  const entetes: Record<string, string> = {}
  if (init?.body) entetes['Content-Type'] = 'application/json'
  if (jetonEnMemoire) entetes.Authorization = `Bearer ${jetonEnMemoire}`
  const r = await fetch(BASE + chemin, { ...init, headers: entetes })
  if (r.status === 401) throw new JetonRequis()
  if (!r.ok) throw new Error(`${chemin} : ${r.status} ${await r.text()}`)
  return r
}

async function appel<T>(chemin: string, init?: RequestInit): Promise<T> {
  return (await requete(chemin, init)).json() as Promise<T>
}

export const api = {
  // Sans espace : le graphe du projet « defaut ».
  graphe: (projetId: string | null) =>
    appel<Graphe>(`/api/graphe${projetId ? `?projet_id=${encodeURIComponent(projetId)}` : ''}`),
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
    }),
  modeles: () => appel<Modeles>('/api/orchestrateur/modeles'),
  arreter: (id: string) => appel<unknown>(`/api/conversations/${id}/arreter`, { method: 'POST' }),
}
