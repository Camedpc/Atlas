// Arbre des agents au-dessus de la saisie, comme la liste des sous-agents de Claude Code dans le terminal.
// Clavier (l'arbre a le focus) : ↑ ↓ naviguer · ← → replier, déplier · Entrée écrire à l'agent · Échap revenir
// à l'orchestrateur. Depuis la saisie vide, ↑ entre dans l'arbre.
import type { Agent } from './api'
import {
  RACINE,
  couleurRole,
  estFini,
  etat,
  formatDuree,
  formatTokens,
  LIBELLES_ETAT,
  libelleRole,
  mission,
} from './agents'
import { echapper } from './rendu'

const SYMBOLES: Record<Agent['etat'], string> = {
  actif: '●',
  attend: '◐',
  termine: '✓',
  echec: '✕',
  interrompu: '■',
}

interface Ligne {
  agent: Agent
  prefixe: string
  enfants: number
  replie: boolean
}

export class ArbreAgents {
  private racine: HTMLElement
  private liste: HTMLElement
  private resume: HTMLElement
  private curseur: string | null = null
  // Replis choisis à la main ; sinon un sous-arbre entièrement fini est replié.
  private replis = new Map<string, boolean>()
  private ouvert = true
  private lignes: Ligne[] = []
  private readonly surValider: () => void
  private readonly surAgentGraph: () => void

  constructor(racine: HTMLElement, surValider: () => void, surAgentGraph: () => void) {
    this.racine = racine
    this.surValider = surValider
    this.surAgentGraph = surAgentGraph
    racine.innerHTML = `
      <div class="arbre-tete">
        <button type="button" class="arbre-bascule" aria-expanded="true" title="Afficher ou masquer les agents">
          <span class="chevron">▾</span> Agents <span class="arbre-resume"></span>
        </button>
        <span class="arbre-aide">↑↓ naviguer · ←→ replier · Entrée écrire · Échap orchestrateur</span>
        <button type="button" class="bouton-agent-graph" title="Ouvrir l'agent graph">Agent graph</button>
      </div>
      <div class="arbre-liste" tabindex="0" role="tree" aria-label="Agents de la conversation"></div>`
    this.liste = racine.querySelector('.arbre-liste')!
    this.resume = racine.querySelector('.arbre-resume')!

    racine.querySelector('.arbre-bascule')!.addEventListener('click', () => {
      this.ouvert = !this.ouvert
      this.dessiner()
    })
    racine.querySelector('.bouton-agent-graph')!.addEventListener('click', () => this.surAgentGraph())
    this.liste.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-chemin]')
      if (!el) return
      const chemin = el.dataset.chemin!
      if ((e.target as HTMLElement).closest('.replier')) {
        this.basculerRepli(chemin)
        return
      }
      this.curseur = chemin
      etat.selectionner(chemin)
      this.surValider()
    })
    this.liste.addEventListener('keydown', (e) => this.clavier(e))
    this.liste.addEventListener('focus', () => {
      if (!this.curseur) this.curseur = etat.selection
      this.dessiner()
    })
    this.liste.addEventListener('blur', () => this.dessiner())

    etat.surChangement(() => this.dessiner())
    // Les durées avancent pendant une exécution.
    window.setInterval(() => {
      if (etat.enCours && this.ouvert) this.dessiner()
    }, 1000)
  }

  /** Donne le focus à l'arbre (depuis la saisie), sur la dernière ligne. */
  entrer(): boolean {
    if (!this.lignes.length || !this.ouvert) return false
    this.curseur = this.lignes[this.lignes.length - 1].agent.chemin
    this.liste.focus()
    return true
  }

  private estReplie(a: Agent): boolean {
    const choix = this.replis.get(a.chemin)
    if (choix !== undefined) return choix
    if (a.chemin === RACINE) return false
    const descendants = this.descendants(a)
    return descendants.length > 0 && estFini(a) && descendants.every(estFini)
  }

  private descendants(a: Agent): Agent[] {
    return etat.enfants(a).flatMap((e) => [e, ...this.descendants(e)])
  }

  private basculerRepli(chemin: string) {
    const a = etat.get(chemin)
    if (!a) return
    this.replis.set(chemin, !this.estReplie(a))
    this.dessiner()
  }

  private aplatir(): Ligne[] {
    const lignes: Ligne[] = []
    const racine = etat.racine
    if (!racine) return lignes
    const parcourir = (a: Agent, prefixe: string, suite: string) => {
      const enfants = etat.enfants(a)
      const replie = enfants.length > 0 && this.estReplie(a)
      lignes.push({ agent: a, prefixe, enfants: this.descendants(a).length, replie })
      if (replie) return
      enfants.forEach((e, i) => {
        const dernier = i === enfants.length - 1
        parcourir(e, suite + (dernier ? '└─ ' : '├─ '), suite + (dernier ? '   ' : '│  '))
      })
    }
    parcourir(racine, '', '')
    return lignes
  }

  private dessiner() {
    const sous = etat.sousAgents
    this.racine.hidden = sous.length === 0
    const actifs = sous.filter((a) => !estFini(a)).length
    this.resume.textContent = `${sous.length} · ${actifs ? `${actifs} au travail` : 'tous terminés'}`
    this.racine.classList.toggle('replie', !this.ouvert)
    this.racine.querySelector('.arbre-bascule')!.setAttribute('aria-expanded', String(this.ouvert))
    if (!this.ouvert) return

    this.lignes = this.aplatir()
    if (this.curseur && !this.lignes.some((l) => l.agent.chemin === this.curseur)) this.curseur = etat.selection
    const focus = document.activeElement === this.liste
    const maintenant = Date.now() / 1000
    this.liste.innerHTML = this.lignes
      .map(({ agent: a, prefixe, enfants, replie }) => {
        const classes = [
          'ligne-agent',
          `e-${a.etat}`,
          a.chemin === etat.selection ? 'choisie' : '',
          focus && a.chemin === this.curseur ? 'curseur' : '',
        ].join(' ')
        const nom = a.chemin === RACINE ? 'Orchestrateur' : libelleRole(a.role)
        const tache = a.chemin === RACINE ? '' : `<span class="tache">${echapper(mission(a))}</span>`
        const activite = a.outil ? `${a.outil} · ${a.activite}` : a.activite || LIBELLES_ETAT[a.etat]
        const repli = enfants
          ? `<span class="replier" title="${replie ? 'Déplier' : 'Replier'}">${replie ? `+${enfants}` : '−'}</span>`
          : ''
        const duree = formatDuree((a.fin ?? maintenant) - a.debut)
        return `<div class="${classes}" data-chemin="${echapper(a.chemin)}" role="treeitem"
            aria-selected="${a.chemin === etat.selection}" title="${echapper(a.chemin)}">
          <span class="prefixe">${prefixe}</span><span class="symbole" style="color:${estFini(a) ? '' : couleurRole(a.role)}">${SYMBOLES[a.etat]}</span>
          <span class="nom">${echapper(nom)}</span>${tache}${repli}
          <span class="activite">${echapper(activite)}</span>
          <span class="mesures">${a.nb_outils ? `${a.nb_outils} outils · ` : ''}${formatTokens(a.tokens)} tok · ${duree}</span>
        </div>`
      })
      .join('')
    this.liste.querySelector('.curseur')?.scrollIntoView({ block: 'nearest' })
  }

  private clavier(e: KeyboardEvent) {
    const i = this.lignes.findIndex((l) => l.agent.chemin === this.curseur)
    const ligne = this.lignes[i]
    const aller = (j: number) => {
      this.curseur = this.lignes[Math.max(0, Math.min(this.lignes.length - 1, j))].agent.chemin
      this.dessiner()
    }
    switch (e.key) {
      case 'ArrowUp':
        aller(i - 1)
        break
      case 'ArrowDown':
        if (i >= this.lignes.length - 1) this.surValider()
        else aller(i + 1)
        break
      case 'ArrowLeft':
        if (ligne?.enfants && !ligne.replie) this.basculerRepli(ligne.agent.chemin)
        else if (ligne?.agent.parent) aller(this.lignes.findIndex((l) => l.agent.chemin === ligne.agent.parent))
        break
      case 'ArrowRight':
        if (ligne?.replie) this.basculerRepli(ligne.agent.chemin)
        else if (ligne?.enfants) aller(i + 1)
        break
      case 'Enter':
      case ' ':
        if (ligne) etat.selectionner(ligne.agent.chemin)
        this.surValider()
        break
      case 'Escape':
        etat.selectionner(RACINE)
        this.surValider()
        break
      default:
        return
    }
    e.preventDefault()
  }
}
