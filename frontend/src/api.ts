// Appels au serveur Atlas. Types calqués sur atlas/modeles.py.
//
// Le graphe est servi partout (Vercel ou atlas.serveur) ; les conversations seulement par atlas.serveur
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
  noeud_id: string
  nom_demonstration: string
  justifie_par: string[]
  demonstration: string
  validite: Validite
  auteur: string
}

export interface Noeud {
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
  modifie_le: string
}

export interface Execution {
  id: string
  statut: 'en_cours' | 'terminee' | 'erreur' | 'arretee'
  erreur: string | null
  usage: { total?: { totalTokens?: number } } | null
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
  cree_le: string
}

async function appel<T>(chemin: string, init?: RequestInit): Promise<T> {
  const entetes: Record<string, string> = {}
  if (init?.body) entetes['Content-Type'] = 'application/json'
  if (jetonEnMemoire) entetes.Authorization = `Bearer ${jetonEnMemoire}`
  const r = await fetch(BASE + chemin, { ...init, headers: entetes })
  if (r.status === 401) throw new JetonRequis()
  if (!r.ok) throw new Error(`${chemin} : ${r.status} ${await r.text()}`)
  return r.json() as Promise<T>
}

export const api = {
  graphe: () => appel<Graphe>('/api/graphe'),
  conversations: () => appel<Conversation[]>('/api/conversations'),
  creerConversation: () => appel<Conversation>('/api/conversations', { method: 'POST', body: '{}' }),
  conversation: (id: string) => appel<EtatConversation>(`/api/conversations/${id}`),
  messages: (id: string, apresId?: number) =>
    appel<Message[]>(`/api/conversations/${id}/messages${apresId === undefined ? '' : `?apres_id=${apresId}`}`),
  envoyer: (id: string, contenu: string) =>
    appel<Execution>(`/api/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ contenu }) }),
  arreter: (id: string) => appel<unknown>(`/api/conversations/${id}/arreter`, { method: 'POST' }),
}
