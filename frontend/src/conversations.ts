// Colonne centrale : la conversation ouverte, suivie en direct pendant une exécution.
// Le fil montre l'agent sélectionné (l'orchestrateur par défaut) et la saisie lui écrit : un message à un
// sous-agent est relayé par l'orchestrateur (Codex n'accepte pas d'entrée directe vers un sous-agent).
// Pendant une exécution, un message s'injecte dans le tour en cours au lieu d'attendre la fin.
// Le bouton micro ouvre un appel avec Atlas voix (voix.ts) : pendant l'appel, le fil montre sa transcription
// (agent /voix) et ce qui est tapé lui est adressé ; en raccrochant, on revient à l'orchestrateur.
import { RACINE, VOIX, estVoix, etat, formatTokens, nomAgent } from './agents'
import { ArbreAgents } from './arbre'
import {
  api,
  enregistrerJeton,
  JetonRequis,
  type Conversation,
  type EtatConversation,
  type Message,
  type Projet,
} from './api'
import { echapper, rendre } from './rendu'
import { SelecteurModele } from './reglages'
import { PanneauSessions } from './sessions'
import { Appel } from './voix'

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

/** « il y a 5 min », « il y a 3 h », « hier », « 21 sept. » */
export function dateRelative(iso: string): string {
  const date = new Date(iso)
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000)
  if (minutes < 1) return 'à l’instant'
  if (minutes < 60) return `il y a ${minutes} min`
  if (minutes < 24 * 60) return `il y a ${Math.round(minutes / 60)} h`
  if (minutes < 48 * 60) return 'hier'
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

const CLE_PROJET = 'atlas.projet'

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
  private selecteur: SelecteurModele
  private titre: HTMLElement
  private ariane: HTMLElement
  private fil: HTMLElement
  private etatTexte: HTMLElement
  private saisie: HTMLTextAreaElement
  private cible: HTMLElement
  private envoyer: HTMLButtonElement
  private arreter: HTMLButtonElement
  private micro: HTMLButtonElement
  private appel: Appel
  private racine: HTMLElement
  private projets: Projet[] = []
  private projet: Projet | null = null
  private utilisateur = ''
  private conversations: Conversation[] = []
  private courante: string | null = null
  private enCours = false
  private dernierId: number | undefined
  private suivi: number | undefined
  private generation = 0
  private readonly surChangement: (conversationId: string | null) => void
  private readonly surActivite: () => void
  private readonly surProjet: (projet: Projet | null, conversations: Conversation[]) => void

  constructor(
    racine: HTMLElement,
    sessions: HTMLElement,
    surChangement: (conversationId: string | null) => void,
    surActivite: () => void,
    surAgentGraph: () => void,
    surProjet: (projet: Projet | null, conversations: Conversation[]) => void,
  ) {
    this.racine = racine
    this.surChangement = surChangement
    this.surActivite = surActivite
    this.surProjet = surProjet
    this.sessions = new PanneauSessions(sessions, {
      surOuvrir: (id) => void this.ouvrir(id),
      surNouvelle: () => void this.nouvelle(),
      surProjet: (id) => void this.entrerProjet(id),
      surCreerProjet: (nom) => this.creerProjet(nom),
    })
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
        <section class="appel" hidden></section>
        <form class="saisie">
          <textarea rows="1" placeholder="Pose une question de recherche…"></textarea>
          <div class="saisie-pied">
            <span class="cible"></span>
            <span class="espace"></span>
            <div class="selecteur"></div>
            <button class="arreter" type="button" hidden>Arrêter</button>
            <button class="micro" type="button" title="Appel vocal avec Atlas voix" aria-label="Appel vocal avec Atlas voix">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5.5" y="1.8" width="5" height="8.4" rx="2.5"/><path d="M3 7.6a5 5 0 0 0 10 0M8 12.6v1.8"/></svg>
            </button>
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
    this.micro = racine.querySelector('.micro')!
    this.selecteur = new SelecteurModele(racine.querySelector('.selecteur')!)
    this.appel = new Appel(racine.querySelector('.appel')!, {
      surEtat: (ouvert) => {
        this.micro.classList.toggle('actif', ouvert)
        this.micro.title = ouvert ? 'Raccrocher' : 'Appel vocal avec Atlas voix'
        etat.selectionner(ouvert ? VOIX : RACINE)
        this.majCible()
        window.clearTimeout(this.suivi)
        void this.rafraichir()
      },
      reglagesOrchestrateur: () => this.selecteur.reglages,
    })
    this.micro.addEventListener('click', () => void this.appeler())
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
      } else if (e.key === 'Escape' && this.appel.ouvert) {
        this.appel.interrompre()
      } else if (e.key === 'Escape' && etat.selection !== RACINE) {
        etat.selectionner(RACINE)
      }
    })
    this.saisie.addEventListener('input', () => this.ajusterSaisie())
    this.arreter.addEventListener('click', () => this.courante && void api.arreter(this.courante))
    this.fil.addEventListener('click', (e) => {
      const lien = (e.target as HTMLElement).closest<HTMLElement>('.lien-agent')
      if (lien) etat.selectionner(lien.dataset.chemin!)
      const session = (e.target as HTMLElement).closest<HTMLElement>('[data-session]')
      if (session) void this.ouvrir(session.dataset.session!)
    })
    this.ariane.addEventListener('click', (e) => {
      const lien = (e.target as HTMLElement).closest<HTMLElement>('[data-chemin]')
      if (lien) etat.selectionner(lien.dataset.chemin!)
    })

    etat.surSelection(() => void this.changerAgent())
    etat.surChangement(() => this.majCible())
    this.majCible()
  }

  /** Arrive sur la page du dernier espace ouvert (le plus récent la première fois). */
  async charger() {
    try {
      const liste = await api.projets()
      this.projets = liste.projets
      this.utilisateur = liste.utilisateur
      // Après la liste : le jeton d'accès est alors connu.
      void this.selecteur.charger()
      let garde: string | null = null
      try {
        garde = localStorage.getItem(CLE_PROJET)
      } catch {
        // stockage indisponible
      }
      const projet = this.projets.find((p) => p.id === (this.projet?.id ?? garde)) ?? this.projets[0]
      await this.entrerProjet(projet?.id ?? null)
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

  private async entrerProjet(id: string | null) {
    this.projet = this.projets.find((p) => p.id === id) ?? null
    try {
      if (this.projet) localStorage.setItem(CLE_PROJET, this.projet.id)
    } catch {
      // le choix ne tiendra que le temps de la page
    }
    this.sessions.afficherProjets(this.projets, this.projet?.id ?? null, this.utilisateur)
    this.conversations = this.projet ? await api.conversations(this.projet.id) : []
    this.ouvrirVide()
    this.surProjet(this.projet, this.conversations)
  }

  private async creerProjet(nom: string) {
    const projet = await api.creerProjet(nom)
    this.projets.unshift(projet)
    await this.entrerProjet(projet.id)
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
    this.appel.raccrocher()
    window.clearTimeout(this.suivi)
    this.courante = null
    this.generation++
    this.enCours = false
    this.titre.textContent = this.projet?.nom ?? 'Nouvelle recherche'
    this.racine.classList.add('accueil-projet')
    this.contenu.innerHTML = this.accueil()
    this.etatTexte.textContent = ''
    etat.vider()
    this.majSessions()
    this.majCible()
    this.surChangement(null)
    this.saisie.focus()
  }

  // Page d'arrivée d'un espace : son nom, sa description, et les sessions à reprendre.
  private accueil(): string {
    const p = this.projet
    if (!p) {
      return `<div class="accueil"><h2>Quelle question veux-tu explorer ?</h2>
        <p>Crée un espace depuis le menu en haut à gauche pour ranger tes recherches.</p></div>`
    }
    const recentes = this.conversations.slice(0, 4)
    const description = p.description
      ? `<p>${echapper(p.description)}</p>`
      : '<p>L’orchestrateur confie des missions à des directeurs de labo ; chaque rapport devient un graphe de raisonnement vérifié.</p>'
    return `<div class="accueil">
      <h2>${echapper(p.nom)}</h2>${description}
      ${
        recentes.length
          ? `<div class="intertitre">Reprendre une session</div>
        <div class="recentes">${recentes
          .map(
            (c) => `<button type="button" data-session="${c.id}"><span>${echapper(c.titre)}</span>
              <span class="quand">${dateRelative(c.modifie_le)}</span></button>`,
          )
          .join('')}</div>`
          : ''
      }</div>`
  }

  private async nouvelle() {
    // La conversation n'est créée qu'au premier message, comme sur claude.ai.
    this.ouvrirVide()
  }

  private async ouvrir(id: string) {
    if (id === this.courante) return
    this.appel.raccrocher()
    window.clearTimeout(this.suivi)
    this.courante = id
    this.generation++
    this.enCours = false
    this.racine.classList.remove('accueil-projet')
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
    // Atlas voix n'est pas sous l'orchestrateur : son fil a sa propre racine.
    const voix = estVoix(etat.selection)
    this.ariane.innerHTML = [
      voix ? '' : `<button type="button" data-chemin="${RACINE}">Orchestrateur</button>`,
      ...chaine.map(
        (c, i) =>
          `${voix && i === 0 ? '' : '<span>›</span>'}<button type="button" data-chemin="${echapper(c)}">${echapper(nomAgent(etat.get(c), c))}</button>`,
      ),
    ].join('')
  }

  private majCible() {
    const sous = etat.selection !== RACINE
    const nom = nomAgent(etat.get(etat.selection), etat.selection)
    if (estVoix(etat.selection)) {
      const enAppel = this.appel?.ouvert
      this.cible.innerHTML = enAppel
        ? `À <b>Atlas voix</b> <span class="relais">pendant l’appel</span>`
        : `À <b>l’orchestrateur</b> <span class="relais">(appel terminé)</span>
           <button type="button" class="retirer-cible" title="Revenir au fil de l’orchestrateur (Échap)" aria-label="Revenir au fil de l’orchestrateur">×</button>`
      this.cible.querySelector('.retirer-cible')?.addEventListener('click', () => etat.selectionner(RACINE))
      this.saisie.placeholder = enAppel ? 'Écrire à Atlas voix pendant l’appel…' : 'Écrire à l’orchestrateur…'
      this.majAriane()
      return
    }
    this.cible.innerHTML = sous
      ? `À <b>${echapper(nom)}</b> <span class="relais">via l’orchestrateur</span>
         <button type="button" class="retirer-cible" title="Écrire à l’orchestrateur (Échap)" aria-label="Écrire à l’orchestrateur">×</button>`
      : `À <b>l’orchestrateur</b>`
    this.cible.querySelector('.retirer-cible')?.addEventListener('click', () => etat.selectionner(RACINE))
    this.saisie.placeholder = sous
      ? `Message à ${nom}…`
      : this.enCours
        ? 'Ajouter une consigne pendant qu’il travaille…'
        : !this.courante && this.projet
          ? `Nouvelle recherche dans « ${this.projet.nom} »…`
          : 'Pose une question de recherche…'
    this.majAriane()
  }

  private ajusterSaisie() {
    this.saisie.style.height = 'auto'
    this.saisie.style.height = `${Math.min(this.saisie.scrollHeight, 240)}px`
  }

  /** Crée la conversation au premier message ou au premier appel, comme sur claude.ai. */
  private async assurerConversation(): Promise<string | null> {
    if (this.courante) return this.courante
    if (!this.projet) return null
    try {
      const c = await api.creerConversation(this.projet.id)
      this.conversations.unshift(c)
      this.courante = c.id
      this.racine.classList.remove('accueil-projet')
      this.contenu.innerHTML = ''
      this.majSessions()
      this.surChangement(c.id)
      this.surProjet(this.projet, this.conversations)
      return c.id
    } catch (e) {
      this.contenu.insertAdjacentHTML('beforeend', `<div class="msg systeme">${echapper(String(e))}</div>`)
      return null
    }
  }

  private async appeler() {
    if (this.appel.ouvert) return this.appel.raccrocher()
    const id = await this.assurerConversation()
    if (id) await this.appel.demarrer(id)
  }

  private async envoyerMessage() {
    const contenu = this.saisie.value.trim()
    if (!contenu) return
    if (this.appel.ouvert && estVoix(etat.selection)) {
      this.appel.ecrire(contenu)
      this.saisie.value = ''
      this.ajusterSaisie()
      return
    }
    const id = await this.assurerConversation()
    if (!id) return
    // Hors appel, Atlas voix n'écoute plus : ce qui est tapé depuis son fil va à l'orchestrateur.
    const agent = etat.selection === RACINE || estVoix(etat.selection) ? null : etat.selection
    this.saisie.value = ''
    this.ajusterSaisie()
    if (!agent) etat.question = contenu
    try {
      await api.envoyer(id, contenu, agent, this.selecteur.reglages)
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
        agent
          ? `<p class="vide">${echapper(nomAgent(etat.get(agent), agent))} n’a encore rien produit.</p>`
          : '<p class="vide">Session vide.</p>'
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

    if (nouveaux.length || conv.en_cours || conv.appel_en_cours) this.surActivite()
    if (conv.en_cours || conv.appel_en_cours || this.appel.ouvert) {
      this.suivi = window.setTimeout(() => void this.rafraichir(), INTERVALLE_SUIVI_MS)
    }
  }
}
