// État partagé des agents de la conversation ouverte : l'arbre au-dessus de la saisie, l'agent graph et le fil
// lisent la même liste et la même sélection. La sélection désigne l'agent à qui l'on écrit (/root par défaut).
import type { Agent, EtatAgent, Message } from './api'

export const RACINE = '/root'
/** Atlas voix, la façade vocale (atlas/voix) : sommet de l'arbre pendant un appel, ses petites tâches dessous. */
export const VOIX = '/voix'
export const estVoix = (chemin: string | null | undefined) => !!chemin && (chemin === VOIX || chemin.startsWith(`${VOIX}/`))

// Couleurs de rôle pensées pour un fond clair (prototypes/vue-sous-agents/commun/clair.js).
const COULEURS: Record<string, string> = {
  orchestrateur: '#27272a',
  directeur_de_labo: '#b45309',
  litterature: '#0f766e',
  experimentateur: '#6d28d9',
  graphiste: '#be185d',
  scribe: '#4338ca',
  verificateur: '#15803d',
  recours: '#a16207',
  atlas_voice: '#1d4ed8',
  tache_vocale: '#0369a1',
}

const LIBELLES: Record<string, string> = {
  orchestrateur: 'Orchestrateur',
  directeur_de_labo: 'Directeur de labo',
  litterature: 'Littérature',
  experimentateur: 'Expérimentateur',
  graphiste: 'Graphiste',
  scribe: 'Scribe',
  verificateur: 'Vérificateur',
  recours: 'Recours',
  atlas_voice: 'Atlas voix',
  tache_vocale: 'Tâche vocale',
}

const ICONES: Record<string, string> = {
  orchestrateur: 'ƒ',
  directeur_de_labo: '▤',
  litterature: '¶',
  experimentateur: '∫',
  graphiste: '◇',
  scribe: '✎',
  verificateur: '✓',
  recours: '§',
  atlas_voice: '∿',
  tache_vocale: '›',
}

export const LIBELLES_ETAT: Record<EtatAgent, string> = {
  actif: 'Au travail',
  attend: 'Attend ses sous-agents',
  termine: 'Terminé',
  echec: 'Échec',
  interrompu: 'Interrompu',
}

export const couleurRole = (role: string) => COULEURS[role] ?? '#52525b'
export const libelleRole = (role: string) => LIBELLES[role] ?? role
export const iconeRole = (role: string) => ICONES[role] ?? '•'
export const estFini = (a: Agent) => a.etat === 'termine' || a.etat === 'echec' || a.etat === 'interrompu'
export const estVivant = (a: Agent) => a.etat === 'actif'

/** Nom de la tâche donné par l'agent parent : dernier segment du chemin (`/root/hydrures_pression`). */
export function mission(a: Agent): string {
  if (a.chemin === RACINE) return 'Orchestrateur'
  if (a.chemin === VOIX) return 'Appel vocal'
  return a.chemin.slice(a.chemin.lastIndexOf('/') + 1).replace(/[_-]+/g, ' ')
}

/** « Directeur de labo · hydrures pression » */
export function nomAgent(a: Agent | undefined, chemin = RACINE): string {
  if (!a) return chemin === RACINE ? 'Orchestrateur' : chemin === VOIX ? 'Atlas voix' : chemin
  if (a.chemin === RACINE) return 'Orchestrateur'
  if (a.chemin === VOIX) return 'Atlas voix'
  return `${libelleRole(a.role)} · ${mission(a)}`
}

export function formatDuree(secondes: number): string {
  const s = Math.max(0, Math.floor(secondes))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)} k` : `${Math.round(n)}`
}

type Ecouteur = () => void

class EtatAgents {
  agents: Agent[] = []
  selection = RACINE
  /** Dernière question de Camille à l'orchestrateur : l'événement de départ de l'agent graph. */
  question = ''
  enCours = false
  /** Messages de l'agent sélectionné, tels que le fil les affiche (journal de l'agent graph). */
  messages: Message[] = []
  private parChemin = new Map<string, Agent>()
  private ecouteurs = new Set<Ecouteur>()
  private ecouteursSelection = new Set<Ecouteur>()

  surChangement(fn: Ecouteur) {
    this.ecouteurs.add(fn)
  }

  surSelection(fn: Ecouteur) {
    this.ecouteursSelection.add(fn)
  }

  get(chemin: string | null | undefined): Agent | undefined {
    return chemin ? this.parChemin.get(chemin) : undefined
  }

  get racine(): Agent | undefined {
    return this.parChemin.get(RACINE)
  }

  enfants(a: Agent): Agent[] {
    return this.agents.filter((x) => x.parent === a.chemin)
  }

  /** Sommets de l'arbre : l'orchestrateur, et Atlas voix pendant un appel (en premier). S'il a confié du travail
   * à l'orchestrateur, l'orchestrateur est son enfant et la voix est le seul sommet. */
  get sommets(): Agent[] {
    return this.agents
      .filter((a) => !a.parent || !this.parChemin.has(a.parent))
      .sort((a, b) => Number(b.chemin === VOIX) - Number(a.chemin === VOIX))
  }

  /** Sous-agents seulement (l'arbre n'apparaît que s'il y en a). */
  get sousAgents(): Agent[] {
    return this.agents.filter((a) => a.chemin !== RACINE)
  }

  mettreAJour(agents: Agent[], enCours: boolean) {
    this.agents = [...agents].sort((a, b) => a.debut - b.debut)
    this.parChemin = new Map(this.agents.map((a) => [a.chemin, a]))
    this.enCours = enCours
    this.notifier()
  }

  vider() {
    this.agents = []
    this.parChemin.clear()
    this.messages = []
    this.question = ''
    this.enCours = false
    this.selectionner(RACINE)
    this.notifier()
  }

  selectionner(chemin: string | null) {
    const cible = chemin ?? RACINE
    if (cible === this.selection) return
    this.selection = cible
    this.messages = []
    for (const fn of this.ecouteursSelection) fn()
    this.notifier()
  }

  notifier() {
    for (const fn of this.ecouteurs) fn()
  }
}

export const etat = new EtatAgents()
