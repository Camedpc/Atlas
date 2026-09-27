// Demandes d'affichage à l'écrit : la même chaîne que la voix, sans la voix. Le texte devient une tâche
// `navigateur` du registre d'AtlasVoice (`VITE_AFFICHAGE_URL`) ; l'agent moyen 2 et l'agent navigateur la
// traduisent en commandes pour cet écran. La réponse (« C'est affiché. », une erreur ou une question
// d'ambiguïté) s'affiche sous le champ ; une question se répond dans le même champ.

const BASE = (import.meta.env.VITE_AFFICHAGE_URL as string | undefined)?.replace(/\/$/, '') ?? ''
const INTERVALLE_MS = 150
const DELAI_MAX_MS = 30000
const STATUTS_FINAUX = ['terminee', 'echouee', 'annulee']

interface Tache {
  id: number
  statut: string
  question: string | null
  resultat_oral: string | null
  erreur: string | null
}

export class CommandeTexte {
  readonly element: HTMLFormElement
  private champ: HTMLInputElement
  private retour: HTMLElement
  /** Tâche qui attend une précision : la prochaine saisie lui répond. */
  private enAttente: number | null = null
  private jeton: () => string | null

  static configure(): boolean {
    return BASE !== ''
  }

  constructor(parent: HTMLElement, jeton: () => string | null = () => null) {
    this.jeton = jeton
    this.element = document.createElement('form')
    this.element.className = 'commande-texte'
    this.element.innerHTML = `
      <input type="text" name="demande" autocomplete="off"
        placeholder="Demander à l'affichage… (passe en 3D, montre la lignée du lemme…)" aria-label="Demande d'affichage" />
      <button type="submit">Envoyer</button>
      <p class="retour" aria-live="polite" hidden></p>`
    this.champ = this.element.querySelector('input')!
    this.retour = this.element.querySelector('.retour')!
    this.element.addEventListener('submit', (e) => {
      e.preventDefault()
      void this.envoyer()
    })
    parent.appendChild(this.element)
  }

  private entetes(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    const j = this.jeton()
    if (j) h.Authorization = `Bearer ${j}`
    return h
  }

  private afficher(texte: string, genre: 'attente' | 'ok' | 'erreur' | 'question'): void {
    this.retour.hidden = false
    this.retour.textContent = texte
    this.retour.dataset.genre = genre
  }

  private async envoyer(): Promise<void> {
    const texte = this.champ.value.trim()
    if (!texte) return
    this.champ.value = ''
    this.champ.disabled = true
    try {
      let tache: Tache
      if (this.enAttente !== null) {
        this.afficher(`Réponse transmise : « ${texte} »…`, 'attente')
        tache = await this.appel<Tache>(`/api/taches/${this.enAttente}/reponse`, { reponse: texte })
      } else {
        this.afficher(`« ${texte} »…`, 'attente')
        tache = await this.appel<Tache>('/api/taches', {
          type_agent: 'navigateur', titre: texte.slice(0, 60), demande_brute: texte, canal: 'texte',
        })
      }
      this.enAttente = null
      this.montrer(await this.attendre(tache.id))
    } catch (e) {
      this.afficher(`Impossible de joindre le relais d'affichage : ${e instanceof Error ? e.message : String(e)}`, 'erreur')
    } finally {
      this.champ.disabled = false
      this.champ.focus()
    }
  }

  private montrer(t: Tache): void {
    if (t.statut === 'besoin_precision' && t.question) {
      this.enAttente = t.id
      this.afficher(t.question, 'question')
      this.champ.placeholder = 'Votre réponse…'
      return
    }
    this.champ.placeholder = "Demander à l'affichage… (passe en 3D, montre la lignée du lemme…)"
    if (t.statut === 'terminee') this.afficher(t.resultat_oral ?? "C'est affiché.", 'ok')
    else if (t.statut === 'echouee') this.afficher(t.erreur ?? "L'affichage a échoué.", 'erreur')
    else if (t.statut === 'annulee') this.afficher('Demande annulée.', 'erreur')
    else this.afficher("Pas de réponse : l'agent moyen 2 et l'agent navigateur tournent-ils ?", 'erreur')
  }

  /** Suit la tâche jusqu'à un état où il y a quelque chose à dire (fin ou question). */
  private async attendre(id: number): Promise<Tache> {
    const debut = performance.now()
    for (;;) {
      const r = await fetch(`${BASE}/api/taches/${id}`, { headers: this.entetes() })
      if (!r.ok) throw new Error(`${r.status}`)
      const t = (await r.json()) as Tache
      if (STATUTS_FINAUX.includes(t.statut) || t.statut === 'besoin_precision') return t
      if (performance.now() - debut > DELAI_MAX_MS) return t
      await new Promise((f) => setTimeout(f, INTERVALLE_MS))
    }
  }

  private async appel<T>(chemin: string, corps: unknown): Promise<T> {
    const r = await fetch(BASE + chemin, { method: 'POST', headers: this.entetes(), body: JSON.stringify(corps) })
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
    return r.json() as Promise<T>
  }
}
