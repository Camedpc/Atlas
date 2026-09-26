// Panneau de gauche : conversations avec l'orchestrateur, suivies en direct pendant une exécution.
import { api, type EtatConversation, type Message } from './api'
import { echapper, rendre } from './rendu'

const INTERVALLE_SUIVI_MS = 1500

function rendreMessage(m: Message): string {
  switch (m.role) {
    case 'utilisateur':
      return `<div class="msg utilisateur">${echapper(m.contenu)}</div>`
    case 'assistant':
      return `<div class="msg assistant">${rendre(m.contenu)}</div>`
    case 'outil':
      return `<details class="msg outil"><summary>${echapper(m.contenu)}</summary>
        <pre>${echapper(JSON.stringify(m.donnees, null, 2))}</pre></details>`
    case 'systeme':
      return `<div class="msg systeme">${echapper(m.contenu)}</div>`
  }
}

function decrireEtat(etat: EtatConversation): string {
  if (etat.en_cours) return 'L’orchestrateur travaille…'
  const ex = etat.derniere_execution
  if (!ex) return ''
  const jetons = ex.usage?.total?.totalTokens
  const suffixe = jetons ? ` · ${jetons.toLocaleString('fr-FR')} jetons` : ''
  const libelles = { en_cours: 'En cours', terminee: 'Terminé', erreur: 'Erreur', arretee: 'Arrêté' }
  return libelles[ex.statut] + suffixe
}

export class PanneauConversations {
  private liste: HTMLSelectElement
  private fil: HTMLElement
  private etat: HTMLElement
  private saisie: HTMLTextAreaElement
  private envoyer: HTMLButtonElement
  private arreter: HTMLButtonElement
  private courante: string | null = null
  private dernierId: number | undefined
  private suivi: number | undefined
  private readonly surChangement: (conversationId: string | null) => void
  private readonly surActivite: () => void

  constructor(
    racine: HTMLElement,
    surChangement: (conversationId: string | null) => void,
    surActivite: () => void,
  ) {
    this.surChangement = surChangement
    this.surActivite = surActivite
    racine.innerHTML = `
      <header class="entete">
        <select class="liste"></select>
        <button class="nouvelle" type="button">+ Nouvelle</button>
      </header>
      <div class="fil"></div>
      <div class="etat"></div>
      <form class="saisie">
        <textarea rows="3" placeholder="Question de recherche… (Ctrl+Entrée pour envoyer)"></textarea>
        <div class="boutons">
          <button class="arreter" type="button" hidden>Arrêter</button>
          <button class="envoyer" type="submit">Envoyer</button>
        </div>
      </form>`
    this.liste = racine.querySelector('.liste')!
    this.fil = racine.querySelector('.fil')!
    this.etat = racine.querySelector('.etat')!
    this.saisie = racine.querySelector('textarea')!
    this.envoyer = racine.querySelector('.envoyer')!
    this.arreter = racine.querySelector('.arreter')!

    this.liste.addEventListener('change', () => void this.ouvrir(this.liste.value || null))
    racine.querySelector('.nouvelle')!.addEventListener('click', () => void this.nouvelle())
    racine.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault()
      void this.envoyerMessage()
    })
    this.saisie.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void this.envoyerMessage()
    })
    this.arreter.addEventListener('click', () => this.courante && void api.arreter(this.courante))
  }

  async charger() {
    try {
      const conversations = await api.conversations()
      this.liste.innerHTML =
        '<option value="">— Choisir une conversation —</option>' +
        conversations.map((c) => `<option value="${c.id}">${echapper(c.titre)}</option>`).join('')
      if (conversations.length) await this.ouvrir(this.courante ?? conversations[0].id)
    } catch {
      this.fil.innerHTML = `<div class="msg systeme">Serveur de l’orchestrateur injoignable. En local : lancer
        <code>uvicorn atlas.serveur:app --port 8000</code> ; sinon renseigner <code>VITE_API_URL</code>.
        Le graphe reste consultable.</div>`
      this.saisie.disabled = this.envoyer.disabled = true
    }
  }

  private async nouvelle() {
    const c = await api.creerConversation()
    this.courante = c.id
    await this.charger()
  }

  private async ouvrir(id: string | null) {
    window.clearTimeout(this.suivi)
    this.courante = id
    this.liste.value = id ?? ''
    this.fil.innerHTML = ''
    this.dernierId = undefined
    this.surChangement(id)
    if (id) await this.rafraichir()
  }

  private async envoyerMessage() {
    const contenu = this.saisie.value.trim()
    if (!contenu) return
    if (!this.courante) await this.nouvelle()
    if (!this.courante) return
    this.saisie.value = ''
    try {
      await api.envoyer(this.courante, contenu)
    } catch (e) {
      this.fil.insertAdjacentHTML('beforeend', `<div class="msg systeme">${echapper(String(e))}</div>`)
    }
    await this.rafraichir()
  }

  /** Ajoute les nouveaux messages et, tant que l'orchestrateur travaille, se rappelle lui-même. */
  private async rafraichir() {
    const id = this.courante
    if (!id) return
    const [etat, nouveaux] = await Promise.all([api.conversation(id), api.messages(id, this.dernierId)])
    if (id !== this.courante) return
    if (nouveaux.length) {
      const enBas = this.fil.scrollHeight - this.fil.scrollTop - this.fil.clientHeight < 80
      this.fil.insertAdjacentHTML('beforeend', nouveaux.map(rendreMessage).join(''))
      this.dernierId = nouveaux[nouveaux.length - 1].id
      if (enBas) this.fil.scrollTop = this.fil.scrollHeight
    }
    this.etat.textContent = decrireEtat(etat)
    this.arreter.hidden = !etat.en_cours
    this.envoyer.disabled = etat.en_cours
    const option = this.liste.querySelector<HTMLOptionElement>(`option[value="${id}"]`)
    if (option) option.textContent = etat.titre

    if (nouveaux.length || etat.en_cours) this.surActivite()
    if (etat.en_cours) this.suivi = window.setTimeout(() => void this.rafraichir(), INTERVALLE_SUIVI_MS)
  }
}
