// Colonne centrale : la conversation ouverte, suivie en direct pendant une exécution.
// Le fil montre l'agent sélectionné (l'orchestrateur par défaut) et la saisie lui écrit : un message à un
// sous-agent est relayé par l'orchestrateur (Codex n'accepte pas d'entrée directe vers un sous-agent).
// Pendant une exécution, un message s'injecte dans le tour en cours au lieu d'attendre la fin.
import { RACINE, etat, formatTokens, nomAgent } from './agents'
import { ArbreAgents } from './arbre'
import { api, enregistrerJeton, JetonRequis, type Conversation, type EtatConversation, type Message } from './api'
import { echapper, rendre } from './rendu'
import { PanneauSessions } from './sessions'

const INTERVALLE_SUIVI_MS = 1500

function rendreOutil(m: Message): string {
  const d = m.donnees ?? {}
  if (d.type === 'subAgentActivity' && typeof d.agentPath === 'string') {
    const genres: Record<string, string> = {
      started: 'lancé',
      interacted: 'a reçu un message',
      interrupted: 'interrompu',
      completed: 'a terminé',
    }
    const nom = d.agentPath.slice(d.agentPath.lastIndexOf('/') + 1).replace(/[_-]+/g, ' ')
    return `<div class="msg evenement-agent"><button type="button" class="lien-agent" data-chemin="${echapper(d.agentPath)}">
      ↳ Sous-agent <b>${echapper(nom)}</b> ${genres[String(d.kind)] ?? String(d.kind)}</button></div>`
  }
  const type = typeof d.type === 'string' ? d.type : 'outil'
  const etiquettes: Record<string, string> = {
    commandExecution: 'Commande',
    mcpToolCall: 'Outil',
    webSearch: 'Web',
    fileChange: 'Fichiers',
    collabAgentToolCall: 'Agents',
  }
  return `<details class="msg outil"><summary><span class="etiquette">${etiquettes[type] ?? type}</span>
      <span class="resume">${echapper(m.contenu)}</span></summary>
      <pre>${echapper(JSON.stringify(m.donnees, null, 2))}</pre></details>`
}

function rendreMessage(m: Message): string {
  switch (m.role) {
    case 'utilisateur':
      return `<div class="msg utilisateur"><div class="bulle">${echapper(m.contenu)}</div></div>`
    case 'assistant':
      return `<div class="msg assistant">${rendre(m.contenu)}</div>`
    case 'outil':
      return rendreOutil(m)
    case 'systeme':
      return `<div class="msg systeme">${echapper(m.contenu)}</div>`
  }
}

function decrireEtat(e: EtatConversation): string {
  if (e.en_cours) return 'L’orchestrateur travaille…'
  const ex = e.derniere_execution
  if (!ex) return ''
  const jetons = ex.usage?.total?.totalTokens
  const suffixe = jetons ? ` · ${formatTokens(jetons)} jetons` : ''
  const libelles = { en_cours: 'En cours', terminee: 'Terminé', erreur: 'Erreur', arretee: 'Arrêté' }
  return libelles[ex.statut] + suffixe
}

export class PanneauConversation {
  private sessions: PanneauSessions
  private arbre: ArbreAgents
  private titre: HTMLElement
  private ariane: HTMLElement
  private fil: HTMLElement
  private etatTexte: HTMLElement
  private saisie: HTMLTextAreaElement
  private cible: HTMLElement
  private envoyer: HTMLButtonElement
  private arreter: HTMLButtonElement
  private conversations: Conversation[] = []
  private courante: string | null = null
  private enCours = false
  private dernierId: number | undefined
  private suivi: number | undefined
  private generation = 0
  private readonly surChangement: (conversationId: string | null) => void
  private readonly surActivite: () => void

  constructor(
    racine: HTMLElement,
    sessions: HTMLElement,
    surChangement: (conversationId: string | null) => void,
    surActivite: () => void,
    surAgentGraph: () => void,
  ) {
    this.surChangement = surChangement
    this.surActivite = surActivite
    this.sessions = new PanneauSessions(
      sessions,
      (id) => void this.ouvrir(id),
      () => void this.nouvelle(),
    )
    racine.innerHTML = `
      <header class="conv-tete">
        <button type="button" class="icone deplier-sessions" title="Afficher la barre latérale" aria-label="Afficher la barre latérale">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2.5" y="3" width="13" height="12" rx="2"/><path d="M7 3v12"/></svg>
        </button>
        <div class="conv-titres">
          <h1 class="conv-titre">Nouvelle recherche</h1>
          <nav class="ariane" hidden></nav>
        </div>
        <span class="conv-etat"></span>
      </header>
      <div class="fil"><div class="fil-contenu"></div></div>
      <div class="bas">
        <section class="arbre" hidden></section>
        <form class="saisie">
          <textarea rows="1" placeholder="Pose une question de recherche…"></textarea>
          <div class="saisie-pied">
            <span class="cible"></span>
            <span class="espace"></span>
            <button class="arreter" type="button" hidden>Arrêter</button>
            <button class="envoyer" type="submit" title="Envoyer (Entrée)" aria-label="Envoyer">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5"/></svg>
            </button>
          </div>
        </form>
      </div>`
    this.titre = racine.querySelector('.conv-titre')!
    this.ariane = racine.querySelector('.ariane')!
    this.fil = racine.querySelector('.fil')!
    this.etatTexte = racine.querySelector('.conv-etat')!
    this.saisie = racine.querySelector('textarea')!
    this.cible = racine.querySelector('.cible')!
    this.envoyer = racine.querySelector('.envoyer')!
    this.arreter = racine.querySelector('.arreter')!
    this.arbre = new ArbreAgents(
      racine.querySelector('.arbre')!,
      () => this.saisie.focus(),
      surAgentGraph,
    )

    racine.querySelector('.deplier-sessions')!.addEventListener('click', () => this.sessions.replier(false))
    racine.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault()
      void this.envoyerMessage()
    })
    this.saisie.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault()
        void this.envoyerMessage()
      } else if (e.key === 'ArrowUp' && !this.saisie.value && this.arbre.entrer()) {
        e.preventDefault()
      } else if (e.key === 'Escape' && etat.selection !== RACINE) {
        etat.selectionner(RACINE)
      }
    })
    this.saisie.addEventListener('input', () => this.ajusterSaisie())
    this.arreter.addEventListener('click', () => this.courante && void api.arreter(this.courante))
    this.fil.addEventListener('click', (e) => {
      const lien = (e.target as HTMLElement).closest<HTMLElement>('.lien-agent')
      if (lien) etat.selectionner(lien.dataset.chemin!)
    })
    this.ariane.addEventListener('click', (e) => {
      const lien = (e.target as HTMLElement).closest<HTMLElement>('[data-chemin]')
      if (lien) etat.selectionner(lien.dataset.chemin!)
    })

    etat.surSelection(() => void this.changerAgent())
    etat.surChangement(() => this.majCible())
    this.majCible()
  }

  async charger() {
    try {
      this.conversations = await api.conversations()
      this.majSessions()
      if (this.conversations.length) await this.ouvrir(this.courante ?? this.conversations[0].id)
      else this.ouvrirVide()
    } catch (e) {
      if (e instanceof JetonRequis) return this.demanderJeton()
      console.error(e)
      this.contenu.innerHTML = `<div class="msg systeme">Serveur de l’orchestrateur injoignable. En local : lancer
        <code>uvicorn atlas.serveur:app --port 8000</code> ; sinon renseigner <code>VITE_API_URL</code>.
        Le graphe reste consultable.</div>`
      this.saisie.disabled = this.envoyer.disabled = true
    }
  }

  /** Range ou ressort la barre des sessions (poignée de redimensionnement). */
  replierSessions(replie: boolean) {
    this.sessions.replier(replie)
  }

  /** Place le curseur dans la saisie (depuis l'agent graph : « Écrire → »). */
  focaliser() {
    this.saisie.focus()
  }

  private get contenu(): HTMLElement {
    return this.fil.querySelector('.fil-contenu')!
  }

  private majSessions() {
    this.sessions.afficher(this.conversations, this.courante, this.enCours ? this.courante : null)
  }

  private demanderJeton() {
    this.contenu.innerHTML = `<form class="jeton">
        <p>Ce serveur est protégé : saisis le jeton d’accès (<code>ATLAS_JETON_ACCES</code> dans le .env du serveur).</p>
        <input type="password" autocomplete="off" placeholder="Jeton d’accès" />
        <button type="submit">Valider</button>
      </form>`
    const formulaire = this.contenu.querySelector('form')!
    formulaire.addEventListener('submit', (e) => {
      e.preventDefault()
      enregistrerJeton(formulaire.querySelector('input')!.value.trim())
      void this.charger()
    })
  }

  private ouvrirVide() {
    window.clearTimeout(this.suivi)
    this.courante = null
    this.generation++
    this.enCours = false
    this.titre.textContent = 'Nouvelle recherche'
    this.contenu.innerHTML = this.accueil()
    this.etatTexte.textContent = ''
    etat.vider()
    this.majSessions()
    this.surChangement(null)
    this.saisie.focus()
  }

  private accueil(): string {
    return `<div class="accueil"><h2>Quelle question veux-tu explorer ?</h2>
      <p>L’orchestrateur confie des missions à des directeurs de labo, qui convoquent littérature et expérimentateurs ;
      chaque rapport devient un graphe de raisonnement, puis chaque démonstration est vérifiée.</p></div>`
  }

  private async nouvelle() {
    // La conversation n'est créée qu'au premier message, comme sur claude.ai.
    this.ouvrirVide()
  }

  private async ouvrir(id: string) {
    if (id === this.courante) return
    window.clearTimeout(this.suivi)
    this.courante = id
    this.generation++
    this.enCours = false
    const c = this.conversations.find((x) => x.id === id)
    this.titre.textContent = c?.titre ?? ''
    etat.vider()
    this.majSessions()
    this.surChangement(id)
    await this.rechargerFil()
  }

  private async changerAgent() {
    this.majAriane()
    this.majCible()
    await this.rechargerFil()
  }

  private async rechargerFil() {
    this.generation++
    this.contenu.innerHTML = ''
    this.dernierId = undefined
    window.clearTimeout(this.suivi)
    if (this.courante) await this.rafraichir()
  }

  private majAriane() {
    const choisi = etat.get(etat.selection)
    this.ariane.hidden = etat.selection === RACINE
    if (this.ariane.hidden) return
    const chaine: string[] = []
    for (let a = choisi; a && a.chemin !== RACINE; a = etat.get(a.parent)) chaine.unshift(a.chemin)
    if (!choisi) chaine.push(etat.selection)
    this.ariane.innerHTML = [
      `<button type="button" data-chemin="${RACINE}">Orchestrateur</button>`,
      ...chaine.map(
        (c) => `<span>›</span><button type="button" data-chemin="${echapper(c)}">${echapper(nomAgent(etat.get(c), c))}</button>`,
      ),
    ].join('')
  }

  private majCible() {
    const sous = etat.selection !== RACINE
    const nom = nomAgent(etat.get(etat.selection), etat.selection)
    this.cible.innerHTML = sous
      ? `À <b>${echapper(nom)}</b> <span class="relais">via l’orchestrateur</span>
         <button type="button" class="retirer-cible" title="Écrire à l’orchestrateur (Échap)" aria-label="Écrire à l’orchestrateur">×</button>`
      : `À <b>l’orchestrateur</b>`
    this.cible.querySelector('.retirer-cible')?.addEventListener('click', () => etat.selectionner(RACINE))
    this.saisie.placeholder = sous
      ? `Message à ${nom}…`
      : this.enCours
        ? 'Ajouter une consigne pendant qu’il travaille…'
        : 'Pose une question de recherche…'
    this.majAriane()
  }

  private ajusterSaisie() {
    this.saisie.style.height = 'auto'
    this.saisie.style.height = `${Math.min(this.saisie.scrollHeight, 240)}px`
  }

  private async envoyerMessage() {
    const contenu = this.saisie.value.trim()
    if (!contenu) return
    if (!this.courante) {
      try {
        const c = await api.creerConversation()
        this.conversations.unshift(c)
        this.courante = c.id
        this.contenu.innerHTML = ''
        this.surChangement(c.id)
      } catch (e) {
        this.contenu.insertAdjacentHTML('beforeend', `<div class="msg systeme">${echapper(String(e))}</div>`)
        return
      }
    }
    const agent = etat.selection === RACINE ? null : etat.selection
    this.saisie.value = ''
    this.ajusterSaisie()
    if (!agent) etat.question = contenu
    try {
      await api.envoyer(this.courante, contenu, agent)
    } catch (e) {
      const texte = e instanceof Error && e.message.includes(' 409 ') ? 'L’orchestrateur démarre ou termine son tour : réessaie dans un instant.' : String(e)
      this.contenu.insertAdjacentHTML('beforeend', `<div class="msg systeme">${echapper(texte)}</div>`)
      this.saisie.value = contenu
    }
    window.clearTimeout(this.suivi)
    await this.rafraichir()
  }

  /** Ajoute les nouveaux messages, met l'arbre à jour et, tant que l'orchestrateur travaille, se rappelle. */
  private async rafraichir() {
    const id = this.courante
    const generation = this.generation
    if (!id) return
    const agent = etat.selection === RACINE ? null : etat.selection
    let conv: EtatConversation, nouveaux: Message[], agents
    try {
      ;[conv, nouveaux, agents] = await Promise.all([
        api.conversation(id),
        api.messages(id, this.dernierId, agent),
        api.agents(id),
      ])
    } catch (e) {
      if (generation !== this.generation) return
      this.etatTexte.textContent = 'Connexion perdue, nouvel essai…'
      this.suivi = window.setTimeout(() => void this.rafraichir(), INTERVALLE_SUIVI_MS * 2)
      console.warn(e)
      return
    }
    if (generation !== this.generation) return

    if (nouveaux.length) {
      const enBas = this.fil.scrollHeight - this.fil.scrollTop - this.fil.clientHeight < 80
      const premier = this.dernierId === undefined
      this.contenu.insertAdjacentHTML('beforeend', nouveaux.map(rendreMessage).join(''))
      this.dernierId = nouveaux[nouveaux.length - 1].id
      if (enBas || premier) this.fil.scrollTop = this.fil.scrollHeight
      etat.messages = [...etat.messages, ...nouveaux]
      if (!agent) {
        const question = [...nouveaux].reverse().find((m) => m.role === 'utilisateur')
        if (question) etat.question = question.contenu
      }
    } else if (this.dernierId === undefined) {
      this.contenu.innerHTML =
        agent ? `<p class="vide">${echapper(nomAgent(etat.get(agent), agent))} n’a encore rien produit.</p>` : this.accueil()
    }

    const changement = conv.en_cours !== this.enCours
    this.enCours = conv.en_cours
    this.titre.textContent = conv.titre
    const c = this.conversations.find((x) => x.id === id)
    if (c && c.titre !== conv.titre) c.titre = conv.titre
    this.etatTexte.textContent = decrireEtat(conv)
    this.arreter.hidden = !conv.en_cours
    etat.mettreAJour(agents, conv.en_cours)
    if (changement) this.majSessions()

    if (nouveaux.length || conv.en_cours) this.surActivite()
    if (conv.en_cours) this.suivi = window.setTimeout(() => void this.rafraichir(), INTERVALLE_SUIVI_MS)
  }
}
