// Colonne centrale : la conversation ouverte, suivie en direct pendant une exécution.
// Le fil montre l'agent sélectionné (l'orchestrateur par défaut) et la saisie lui écrit : un message à un
// sous-agent est relayé par l'orchestrateur (Codex n'accepte pas d'entrée directe vers un sous-agent).
// Pendant une exécution, un message s'injecte dans le tour en cours au lieu d'attendre la fin : l'orchestrateur le
// lit à sa prochaine étape (même s'il attend ses sous-agents). Les sous-agents peuvent travailler après la fin du
// tour : le fil se suit tant que quelqu'un travaille, et le texte en cours d'écriture s'affiche au fil de l'eau.
// Le bouton micro ouvre un appel avec Atlas voix (voix.ts), présenté comme sur claude.ai : ta phrase s'écrit en
// direct dans la saisie, le fil montre l'échange (agent /voix) avec la voix d'Atlas colorée au fil de sa lecture,
// « Stop » raccroche, et la pastille (pastille.ts) montre les deux voix. En raccrochant, on revient à l'orchestrateur.
import { RACINE, VOIX, estVoix, etat, formatDuree, formatTokens, nomAgent } from './agents'
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
import { Pastille } from './pastille'
import { choisirSon, ecouterSon, sonChoisi, SONS } from './sons'
import type { Pilote } from './pilotage/pilote'
import { Appel, optionsVoix, VOIX_GRADIUM, type MessageVoix } from './voix'

const INTERVALLE_SUIVI_MS = 700

function rendreOutil(m: Message): string {
  const d = m.donnees ?? {}
  if (d.type === 'subAgentActivity' && typeof d.agentPath === 'string') {
    const genres: Record<string, string> = {
      started: 'lancé',
      interrupted: 'interrompu',
      completed: 'a terminé',
    }
    const nom = d.agentPath.slice(d.agentPath.lastIndexOf('/') + 1).replace(/[_-]+/g, ' ')
    // « interacted » : l'agent de ce fil a écrit à agentPath (un sous-agent, ou son parent).
    if (d.kind === 'interacted') {
      const destinataire = d.agentPath === RACINE ? 'l’orchestrateur' : `<b>${echapper(nom)}</b>`
      return `<div class="msg evenement-agent"><button type="button" class="lien-agent" data-chemin="${echapper(d.agentPath)}">
        ↳ Message à ${destinataire}</button></div>`
    }
    // Comme « Done (N tool uses · X tokens · durée) » de Claude Code : le bilan de cette exécution, joint par le
    // serveur ; à défaut (messages plus anciens), celui de l'arbre, rempli par majResumesAgents.
    const fin = d.kind === 'completed' || d.kind === 'interrupted'
    const bilan = d.bilan as Bilan | undefined
    const resume = !fin
      ? ''
      : bilan
        ? `<span class="resume-agent">${echapper(texteBilan(bilan.nb_outils, bilan.tokens, bilan.duree))}</span>`
        : `<span class="resume-agent" data-chemin="${echapper(d.agentPath)}"></span>`
    return `<div class="msg evenement-agent"><button type="button" class="lien-agent" data-chemin="${echapper(d.agentPath)}">
      ↳ Sous-agent <b>${echapper(nom)}</b> ${genres[String(d.kind)] ?? String(d.kind)}</button>${resume}</div>`
  }
  // Titres de réflexion, comme les lignes « thinking » de la CLI Codex.
  if (d.type === 'reasoning' && Array.isArray(d.titres)) {
    return `<div class="msg reflexion">${d.titres.map((t) => `<div>${echapper(String(t))}</div>`).join('')}</div>`
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


interface Bilan {
  nb_outils: number
  tokens: number
  duree: number
}

function texteBilan(nbOutils: number, tokens: number, duree: number): string {
  const outils = nbOutils ? `${nbOutils} outil${nbOutils > 1 ? 's' : ''} · ` : ''
  return `${outils}${formatTokens(tokens)} tok · ${formatDuree(duree)}`
}

/** Mesures des sous-agents terminés dans le fil sans bilan enregistré (anciens messages), d'après l'arbre. */
function majResumesAgents(racine: HTMLElement) {
  for (const el of racine.querySelectorAll<HTMLElement>('.resume-agent[data-chemin]')) {
    const a = etat.get(el.dataset.chemin)
    if (a?.fin) el.textContent = texteBilan(a.nb_outils, a.tokens, a.fin - a.debut)
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
  if (e.actif) return 'Sous-agents au travail…'
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
  private stop: HTMLButtonElement
  private menuVoix: HTMLElement
  private boutonOptions: HTMLButtonElement
  private appel: Appel
  private pastille: Pastille
  /** Écran du graphe, piloté par Atlas voix pendant un appel (main.ts le branche). */
  private ecran: Pilote | null = null
  private avantCommandes: () => Promise<void> = async () => {}
  /** La saisie montre ce que Camille est en train de dire (et non un texte tapé). */
  private dictee = false
  /** Camille tape pendant l'appel : la dictée n'écrase plus la saisie. */
  private tape = false
  /** Fil de la voix chargé au début de l'appel ; ensuite il se remplit en direct, sans relire la base. */
  private filVoixCharge = false
  private elementsVoix = new Map<string, HTMLElement>()
  /** Raison de la fin d'appel, à afficher dans le fil de l'orchestrateur une fois rechargé. */
  private avisFin = ''
  private racine: HTMLElement
  private projets: Projet[] = []
  private projet: Projet | null = null
  private utilisateur = ''
  private conversations: Conversation[] = []
  private courante: string | null = null
  private enCours = false
  /** L'orchestrateur ou un sous-agent travaille. */
  private actif = false
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
      surSupprimerProjet: (id) => this.supprimerProjet(id),
    })
    racine.innerHTML = `
      <header class="conv-tete">
        <button type="button" class="icone deplier-sessions" title="Afficher la barre latérale" aria-label="Afficher la barre latérale">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2.5" y="3" width="13" height="12" rx="2"/><path d="M7 3v12"/></svg>
        </button>
        <div class="conv-titres">
          <h1 class="conv-titre">Nouvelle session</h1>
          <nav class="ariane" hidden></nav>
        </div>
        <span class="conv-etat"></span>
        <button type="button" class="icone ranger-conversation" title="Masquer la conversation" aria-label="Masquer la conversation">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2.5" y="3" width="13" height="12" rx="2"/><path d="M7 3v12"/></svg>
        </button>
      </header>
      <div class="fil"><div class="fil-contenu"></div></div>
      <div class="bas">
        <section class="arbre" hidden></section>
        <form class="saisie">
          <textarea rows="1" placeholder="Pose une question de recherche…"></textarea>
          <div class="saisie-pied">
            <span class="cible"></span>
            <span class="espace"></span>
            <div class="selecteur"></div>
            <button class="arreter" type="button" hidden>Arrêter</button>
            <div class="groupe-micro">
              <button class="micro" type="button" title="Parler avec Atlas voix" aria-label="Parler avec Atlas voix">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5.5" y="1.8" width="5" height="8.4" rx="2.5"/><path d="M3 7.6a5 5 0 0 0 10 0M8 12.6v1.8"/></svg>
              </button>
              <button class="options-voix" type="button" aria-haspopup="menu" aria-expanded="false" title="Options de la voix" aria-label="Options de la voix">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m3 4.5 3 3 3-3"/></svg>
              </button>
              <div class="menu-modele menu-voix" role="menu" hidden></div>
            </div>
            <button class="envoyer" type="submit" title="Envoyer (Entrée)" aria-label="Envoyer">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5"/></svg>
            </button>
            <button class="stop-appel" type="button" hidden title="Raccrocher" data-etat="demarrage">
              <span class="points"><i></i><i></i><i></i></span>Stop
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
    this.stop = racine.querySelector('.stop-appel')!
    this.menuVoix = racine.querySelector('.menu-voix')!
    this.boutonOptions = racine.querySelector('.options-voix')!
    this.pastille = new Pastille(() => void this.appeler())
    this.selecteur = new SelecteurModele(racine.querySelector('.selecteur')!)
    this.appel = new Appel({
      surEtat: (ouvert, raison) => this.surAppel(ouvert, raison),
      surEtatVoix: (e) => {
        this.stop.dataset.etat = e
      },
      surSources: (sources) => this.pastille.brancher(sources),
      surPartiel: (texte) => this.afficherDictee(texte),
      surUtilisateur: (texte) => this.ajouterVoix(`<div class="msg utilisateur"><div class="bulle">${echapper(texte)}</div></div>`),
      surMessage: (m) => this.afficherMessageVoix(m),
      surOutil: (id, description, fini, ok) => {
        let el = this.elementsVoix.get(`outil:${id}`)
        if (!el) {
          el = this.ajouterVoix(`<div class="msg outil-voix"><span class="etiquette">Outil</span>
            <span class="resume">${echapper(description)}</span></div>`)
          this.elementsVoix.set(`outil:${id}`, el)
        }
        el.classList.toggle('en-cours', !fini)
        el.classList.toggle('echec', fini && !ok)
      },
      surInfo: (texte, erreur) => this.ajouterVoix(`<div class="msg systeme${erreur ? ' erreur' : ''}">${echapper(texte)}</div>`),
      reglagesOrchestrateur: () => this.selecteur.reglages,
      ecran: () => this.ecran,
      avantCommandes: () => this.avantCommandes(),
    })
    this.micro.addEventListener('click', () => void this.appeler())
    this.micro.addEventListener('pointerenter', () => this.preparerVoix())
    this.stop.addEventListener('click', () => this.appel.raccrocher())
    this.boutonOptions.addEventListener('click', () => this.basculerMenuVoix())
    this.menuVoix.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-voix], [data-option], [data-son]')
      if (!el) return
      if (el.dataset.son) {
        // Choisir un son le fait entendre : ouverture puis fermeture.
        choisirSon(el.dataset.son)
        ecouterSon(el.dataset.son)
        this.dessinerMenuVoix()
        return
      }
      if (el.dataset.voix) optionsVoix.voix = el.dataset.voix
      if (el.dataset.option === 'casque') optionsVoix.casque = !optionsVoix.casque
      this.appel.envoyerReglages()
      this.dessinerMenuVoix()
    })
    document.addEventListener('pointerdown', (e) => {
      if (!this.menuVoix.hidden && !this.menuVoix.parentElement!.contains(e.target as Node)) this.basculerMenuVoix(false)
    })
    this.menuVoix.parentElement!.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.menuVoix.hidden) {
        e.stopPropagation()
        this.basculerMenuVoix(false)
        this.boutonOptions.focus()
      }
    })
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
      } else if (this.appel.ouvert && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        // Camille se met à taper : la dictée s'efface et ne réécrit plus la saisie.
        if (this.dictee) this.saisie.value = ''
        this.dictee = false
        this.tape = true
        this.saisie.classList.remove('dictee')
      } else if (e.key === 'Escape' && etat.selection !== RACINE) {
        etat.selectionner(RACINE)
      } else if (e.key === 'Escape' && this.actif) {
        // Comme Échap dans Codex : interrompre.
        void this.interrompre()
      }
    })
    this.saisie.addEventListener('input', () => this.ajusterSaisie())
    this.arreter.addEventListener('click', () => void this.interrompre())
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
    etat.surChangement(() => {
      this.majCible()
      this.majArreter()
    })
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
  /** Écran du graphe que la voix pilote pendant un appel ; `avant` le rend visible avant chaque lot. */
  brancherEcran(pilote: Pilote, avant: () => Promise<void>) {
    this.ecran = pilote
    this.avantCommandes = avant
  }

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

  private async supprimerProjet(id: string) {
    await api.supprimerProjet(id)
    this.projets = this.projets.filter((p) => p.id !== id)
    if (this.projet?.id === id) await this.entrerProjet(this.projets[0]?.id ?? null)
    else this.sessions.afficherProjets(this.projets, this.projet?.id ?? null, this.utilisateur)
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
    this.enCours = this.actif = false
    this.titre.textContent = this.projet?.nom ?? 'Nouvelle session'
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
        <p>Crée un espace depuis le menu en haut à gauche pour ranger tes sessions.</p></div>`
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
    this.enCours = this.actif = false
    this.racine.classList.remove('accueil-projet')
    const c = this.conversations.find((x) => x.id === id)
    this.titre.textContent = c?.titre ?? ''
    etat.vider()
    this.majSessions()
    this.surChangement(id)
    this.preparerVoix()
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
      this.saisie.placeholder = enAppel ? 'Parle, ou écris à Atlas voix…' : 'Écrire à l’orchestrateur…'
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
        ? 'Ajouter une consigne : il la lira à sa prochaine étape…'
        : !this.courante && this.projet
          ? `Nouvelle session dans « ${this.projet.nom} »…`
          : 'Pose une question de recherche…'
    this.majAriane()
  }

  /** Le sous-agent sélectionné s'il travaille (Arrêter ne vise que lui), sinon null (Arrêter vise tout). */
  private cibleArret(): string | null {
    const a = etat.get(etat.selection)
    return a && a.chemin !== RACINE && (a.etat === 'actif' || a.etat === 'attend') ? a.chemin : null
  }

  private majArreter() {
    this.arreter.hidden = !this.actif
    const agent = this.cibleArret()
    this.arreter.textContent = agent ? 'Arrêter l’agent' : 'Tout arrêter'
    this.arreter.title = agent
      ? `Interrompre ${nomAgent(etat.get(agent), agent)} seulement`
      : 'Interrompre l’orchestrateur et tous ses sous-agents (Échap)'
  }

  private async interrompre() {
    if (!this.courante) return
    try {
      await api.arreter(this.courante, this.cibleArret())
    } catch (e) {
      console.warn(e)
    }
    window.clearTimeout(this.suivi)
    await this.rafraichir()
  }

  /** Ligne d'état de l'agent affiché tant qu'il travaille, comme « • Working (6m 12s) » de la CLI Codex :
   *  son étape en cours (titre de réflexion, outil) et depuis quand. Toujours tout en bas du fil. */
  private majEtape() {
    const a = etat.get(etat.selection)
    let ligne = this.contenu.querySelector<HTMLElement>('.etape-en-cours')
    if (!a || !this.actif || (a.etat !== 'actif' && a.etat !== 'attend')) {
      ligne?.remove()
      return
    }
    if (!ligne) {
      ligne = document.createElement('div')
      ligne.className = 'msg etape-en-cours'
    }
    if (ligne !== this.contenu.lastElementChild) this.contenu.append(ligne)
    const texte = a.outil ? `${a.outil} · ${a.activite}` : a.activite
    const duree = a.depuis ? ` · ${formatDuree(Date.now() / 1000 - a.depuis)}` : ''
    ligne.textContent = `${texte}${duree}`
  }

  /** Texte que l'agent affiché est en train d'écrire, toujours en bas du fil. */
  private majBrouillon(brouillons: Record<string, string>) {
    const texte = brouillons[etat.selection]
    let bloc = this.contenu.querySelector<HTMLElement>('.brouillon')
    if (!texte) {
      bloc?.remove()
      return
    }
    this.contenu.querySelector('.vide')?.remove()
    if (!bloc) {
      bloc = document.createElement('div')
      bloc.className = 'msg assistant brouillon'
    }
    const etape = this.contenu.querySelector('.etape-en-cours')
    if (etape) {
      if (bloc.nextElementSibling !== etape) etape.before(bloc)
    } else if (bloc !== this.contenu.lastElementChild) this.contenu.append(bloc)
    if (bloc.dataset.texte !== texte) {
      bloc.dataset.texte = texte
      bloc.innerHTML = rendre(texte)
    }
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

  // ─── Appel vocal ───

  private surAppel(ouvert: boolean, raison?: string) {
    this.racine.classList.toggle('en-appel', ouvert)
    this.stop.hidden = !ouvert
    this.envoyer.hidden = ouvert
    this.micro.classList.toggle('actif', ouvert)
    this.micro.title = ouvert ? 'Raccrocher' : 'Parler avec Atlas voix'
    this.tape = false
    this.afficherDictee('')
    this.elementsVoix.clear()
    this.filVoixCharge = false
    etat.selectionner(ouvert ? VOIX : RACINE)
    this.majCible()
    // Le fil se recharge sur celui de l'orchestrateur : la raison (« Atlas voix a raccroché ») s'y affiche ensuite.
    this.avisFin = raison ?? ''
    if (!ouvert) this.preparerVoix() // prêt pour le prochain appel
    window.clearTimeout(this.suivi)
    void this.rafraichir()
  }

  private afficherDictee(texte: string) {
    if (this.tape) return
    this.dictee = texte.length > 0
    this.saisie.classList.toggle('dictee', this.dictee)
    this.saisie.value = texte
    this.ajusterSaisie()
  }

  /** Ajoute un élément au fil pendant l'appel (et le fait défiler s'il était en bas). */
  private ajouterVoix(html: string): HTMLElement {
    const enBas = this.fil.scrollHeight - this.fil.scrollTop - this.fil.clientHeight < 80
    this.contenu.querySelector(':scope > .vide')?.remove()
    this.contenu.insertAdjacentHTML('beforeend', html)
    if (enBas) this.fil.scrollTop = this.fil.scrollHeight
    return this.contenu.lastElementChild as HTMLElement
  }

  /** Réponse d'Atlas voix : ce qu'il a déjà dit en noir, le reste en gris, comme sur claude.ai. */
  private afficherMessageVoix(m: MessageVoix) {
    if (!m.texte.trim()) return
    let el = this.elementsVoix.get(m.id)
    if (!el) {
      el = this.ajouterVoix('<div class="msg assistant voix-direct"></div>')
      this.elementsVoix.set(m.id, el)
    }
    const enBas = this.fil.scrollHeight - this.fil.scrollTop - this.fil.clientHeight < 80
    el.innerHTML =
      `<span class="dit">${echapper(m.texte.slice(0, m.prononce))}</span>` +
      `<span class="a-dire">${echapper(m.texte.slice(m.prononce))}</span>` +
      (m.coupe ? '<span class="coupe">coupé</span>' : '')
    if (enBas) this.fil.scrollTop = this.fil.scrollHeight
  }

  private basculerMenuVoix(ouvrir = this.menuVoix.hidden) {
    this.menuVoix.hidden = !ouvrir
    this.boutonOptions.setAttribute('aria-expanded', String(ouvrir))
    if (ouvrir) this.dessinerMenuVoix()
  }

  private dessinerMenuVoix() {
    const coche = (oui: boolean) =>
      oui ? '<svg class="coche" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3.5 8.5 3 3 6-7"/></svg>' : ''
    const voix = optionsVoix.voix
    this.menuVoix.innerHTML =
      '<p class="menu-titre">Voix d’Atlas</p>' +
      VOIX_GRADIUM.map(
        ([id, nom]) => `<button type="button" role="menuitemradio" aria-checked="${id === voix}" class="menu-ligne" data-voix="${id}">
          <span class="menu-texte"><b>${nom}</b></span>${coche(id === voix)}</button>`,
      ).join('') +
      '<hr><p class="menu-titre">Son de l’appel <small>(clic pour écouter)</small></p>' +
      SONS.map(
        (s) => `<button type="button" role="menuitemradio" aria-checked="${s.id === sonChoisi()}" class="menu-ligne" data-son="${s.id}">
          <span class="menu-texte"><b>${s.nom}</b><span>${s.description}</span></span>${coche(s.id === sonChoisi())}</button>`,
      ).join('') +
      `<hr><button type="button" role="menuitemcheckbox" aria-checked="${optionsVoix.casque}" class="menu-ligne" data-option="casque">
        <span class="menu-texte"><b>Coupure immédiate</b><span>Atlas se tait dès que tu parles</span></span>${coche(optionsVoix.casque)}</button>`
  }

  /** Prépare Atlas voix à l'avance pour la conversation ouverte (sans effet si c'est déjà fait). */
  private preparerVoix() {
    if (this.courante && !this.appel.ouvert) void api.preparerVoix(this.courante).catch(() => {})
  }

  private async appeler() {
    if (this.appel.ouvert) return this.appel.raccrocher()
    const id = await this.assurerConversation()
    if (id) await this.appel.demarrer(id)
  }

  private async envoyerMessage() {
    const contenu = this.saisie.value.trim()
    if (!contenu) return
    if (this.appel.ouvert) {
      if (this.dictee) return // la saisie montre la dictée en cours, pas un message tapé
      this.appel.ecrire(contenu)
      this.tape = false
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
      this.contenu.insertAdjacentHTML('beforeend', `<div class="msg systeme">${echapper(String(e))}</div>`)
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
    // Pendant l'appel, le fil de la voix se remplit en direct (voix.ts) : on ne le lit qu'une fois, au début.
    const direct = this.appel.ouvert && estVoix(etat.selection) && this.filVoixCharge
    if (this.appel.ouvert && estVoix(etat.selection)) this.filVoixCharge = true
    let conv: EtatConversation, nouveaux: Message[], agents
    try {
      ;[conv, nouveaux, agents] = await Promise.all([
        api.conversation(id),
        direct ? Promise.resolve([]) : api.messages(id, this.dernierId, agent),
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

    const enBas = this.fil.scrollHeight - this.fil.scrollTop - this.fil.clientHeight < 80
    if (nouveaux.length) {
      const premier = this.dernierId === undefined
      if (premier) this.contenu.innerHTML = ''
      this.contenu.querySelector('.brouillon')?.remove()
      this.contenu.querySelector('.etape-en-cours')?.remove()
      this.contenu.insertAdjacentHTML('beforeend', nouveaux.map(rendreMessage).join(''))
      this.dernierId = nouveaux[nouveaux.length - 1].id
      if (enBas || premier) this.fil.scrollTop = this.fil.scrollHeight
      etat.messages = [...etat.messages, ...nouveaux]
      if (!agent) {
        const question = [...nouveaux].reverse().find((m) => m.role === 'utilisateur')
        if (question) etat.question = question.contenu
      }
    } else if (this.dernierId === undefined && !direct) {
      this.contenu.innerHTML =
        agent
          ? `<p class="vide">${echapper(nomAgent(etat.get(agent), agent))} n’a encore rien produit.</p>`
          : '<p class="vide">Session vide.</p>'
    }

    // Fil de l'orchestrateur chargé (messages ou « Session vide ») : la raison de la fin d'appel s'y ajoute.
    const filCharge = this.dernierId !== undefined || this.contenu.querySelector(':scope > .vide')
    if (this.avisFin && !estVoix(etat.selection) && filCharge) {
      this.contenu.insertAdjacentHTML('beforeend', `<div class="msg systeme">${echapper(this.avisFin)}</div>`)
      this.avisFin = ''
    }

    const changement = conv.en_cours !== this.enCours
    this.enCours = conv.en_cours
    this.actif = conv.actif ?? conv.en_cours
    this.titre.textContent = conv.titre
    const c = this.conversations.find((x) => x.id === id)
    if (c && c.titre !== conv.titre) c.titre = conv.titre
    this.etatTexte.textContent = decrireEtat(conv)
    etat.mettreAJour(agents, this.actif)
    majResumesAgents(this.contenu)
    this.majArreter()
    this.majBrouillon(conv.brouillons ?? {})
    this.majEtape()
    if (enBas) this.fil.scrollTop = this.fil.scrollHeight
    if (changement) this.majSessions()

    if (nouveaux.length || this.actif || conv.appel_en_cours) this.surActivite()
    // Suivi tant que quelqu'un travaille (les sous-agents peuvent continuer après le tour de l'orchestrateur),
    // et pendant un appel vocal.
    if (this.actif || conv.appel_en_cours || this.appel.ouvert) {
      this.suivi = window.setTimeout(() => void this.rafraichir(), INTERVALLE_SUIVI_MS)
    }
  }
}
