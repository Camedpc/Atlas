// Sélecteur du modèle et de l'effort de l'orchestrateur, dans la saisie, comme sur claude.ai :
// un bouton « Modèle Effort » ouvre un menu (modèle courant, Effort ›, Autres modèles ›).
// Le choix vaut pour les prochains tours de l'orchestrateur (les sous-agents gardent le modèle de leur rôle)
// et est gardé dans ce navigateur. Pendant un tour, il s'appliquera au suivant.
// Page « Clé OpenAI » : une clé de l'utilisateur, gardée dans ce navigateur, fait payer ses tours par ses crédits
// (vérifiée par le serveur avant d'être gardée) ; les modèles proposés sont alors ceux de son compte.
import { api, cleMasquee, cleOpenAI, enregistrerCleOpenAI, type ModeleCodex } from './api'
import { echapper } from './rendu'

const CLE = 'atlas.reglages'

const EFFORTS: Record<string, { libelle: string; description: string }> = {
  none: { libelle: 'Aucun', description: 'Sans raisonnement' },
  minimal: { libelle: 'Minimal', description: 'Le plus rapide' },
  low: { libelle: 'Faible', description: 'Réponses rapides, raisonnement léger' },
  medium: { libelle: 'Moyen', description: 'Équilibre entre vitesse et profondeur' },
  high: { libelle: 'Élevé', description: 'Raisonnement approfondi pour les problèmes complexes' },
  xhigh: { libelle: 'Très élevé', description: 'Raisonnement très approfondi' },
  max: { libelle: 'Maximal', description: 'Profondeur maximale pour les problèmes les plus durs' },
  ultra: { libelle: 'Ultra', description: 'Raisonnement maximal, avec délégation automatique des tâches' },
}

const libelleEffort = (e: string) => EFFORTS[e]?.libelle ?? e

const COCHE =
  '<svg class="coche" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3.5 8.5 3 3 6-7"/></svg>'
const CHEVRON =
  '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m5 3 4 4-4 4"/></svg>'
const RETOUR =
  '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m9 3-4 4 4 4"/></svg>'

type Page = 'principal' | 'effort' | 'modeles' | 'cle'

export class SelecteurModele {
  private racine: HTMLElement
  private bouton: HTMLButtonElement
  private menu: HTMLElement
  private modeles: ModeleCodex[] = []
  private modele: string | null = null
  private effort: string | null = null
  // Effort par défaut d'Atlas (ATLAS_EFFORT_ORCHESTRATEUR), celui d'un tour sans réglage.
  private effortServeur: string | null = null
  private page: Page = 'principal'
  // Résultat de la dernière vérification de clé, affiché sur la page « Clé OpenAI ».
  private noteCle = ''

  constructor(racine: HTMLElement) {
    this.racine = racine
    racine.className = 'selecteur-modele'
    racine.hidden = true
    racine.innerHTML = `
      <button type="button" class="selecteur-bouton" aria-haspopup="menu" aria-expanded="false"
        title="Modèle et effort de l’orchestrateur pour les prochains tours"></button>
      <div class="menu-modele" role="menu" hidden></div>`
    this.bouton = racine.querySelector('.selecteur-bouton')!
    this.menu = racine.querySelector('.menu-modele')!

    this.bouton.addEventListener('click', () => this.basculer())
    this.menu.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')
      if (!el) return
      const { action, valeur } = el.dataset
      if (action === 'page') this.montrer(valeur as Page)
      else if (action === 'effort') this.choisir(this.modele, valeur!)
      else if (action === 'modele') this.choisir(valeur!, this.effort)
      else if (action === 'enregistrer-cle') void this.enregistrerCle()
      else if (action === 'oublier-cle') void this.oublierCle()
    })
    this.menu.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.target as HTMLElement).matches('.champ-cle')) {
        e.preventDefault()
        void this.enregistrerCle()
      }
    })
    document.addEventListener('pointerdown', (e) => {
      if (!this.menu.hidden && !racine.contains(e.target as Node)) this.fermer()
    })
    racine.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.menu.hidden) {
        e.stopPropagation()
        this.fermer()
        this.bouton.focus()
      }
    })
  }

  /** Charge les modèles du serveur (ceux du compte de la clé, s'il y en a une) ; sans eux (serveur ancien, jeton
   * manquant), le sélecteur reste masqué, sauf avec une clé : il faut pouvoir l'oublier. */
  async charger() {
    this.modeles = []
    try {
      const r = await api.modeles()
      this.modeles = r.modeles
      this.effortServeur = r.effort_defaut
      let garde: { modele?: string; effort?: string } = {}
      try {
        garde = JSON.parse(localStorage.getItem(CLE) ?? '{}')
      } catch {
        // rien de gardé
      }
      const modele = this.trouver(garde.modele) ? garde.modele! : r.modele_defaut
      this.choisir(modele, garde.effort ?? r.effort_defaut, false)
      this.racine.hidden = !this.modeles.length && !cleOpenAI()
    } catch (e) {
      console.warn('Modèles indisponibles', e)
      this.racine.hidden = !cleOpenAI()
      if (cleOpenAI()) this.bouton.textContent = 'Clé OpenAI : modèles indisponibles'
    }
  }

  private etatCle(texte: string, erreur = false) {
    const el = this.menu.querySelector<HTMLElement>('.menu-etat')
    if (!el) return
    el.textContent = texte
    el.classList.toggle('erreur', erreur)
  }

  private async enregistrerCle() {
    const champ = this.menu.querySelector<HTMLInputElement>('.champ-cle')
    const cle = champ?.value.trim() ?? ''
    if (!cle.startsWith('sk-')) return this.etatCle('Une clé OpenAI commence par « sk- ».', true)
    this.etatCle('Vérification de la clé auprès d’OpenAI…')
    let verification: Awaited<ReturnType<typeof api.verifierCle>>
    try {
      verification = await api.verifierCle(cle)
    } catch (e) {
      const brut = e instanceof Error ? e.message : String(e)
      let detail = brut
      try {
        detail = (JSON.parse(brut.slice(brut.indexOf('{'))) as { detail?: string }).detail ?? brut
      } catch {
        // message brut
      }
      return this.etatCle(detail, true)
    }
    const manquants = Object.entries(verification.manquants)
    this.noteCle = manquants.length
      ? `Clé vérifiée, mais sans accès à ${[...new Set(manquants.map(([, m]) => m))].join(', ')} : `
        + `${manquants.map(([qui]) => qui.replaceAll('_', ' ')).join(', ')} échoueront.`
      : `Clé vérifiée : ${verification.modeles.length} modèles d’Atlas accessibles.`
    enregistrerCleOpenAI(cle)
    await this.charger()
    this.montrer('cle')
  }

  private async oublierCle() {
    const cle = cleOpenAI()
    if (!cle) return
    this.etatCle('Suppression…')
    // Le serveur efface la connexion de la clé ; même s'il ne répond pas, ce navigateur l'oublie.
    await api.oublierCle(cle).catch((e) => console.warn('Clé non effacée du serveur', e))
    enregistrerCleOpenAI(null)
    this.noteCle = 'Clé oubliée : tes tours repassent par le compte d’Atlas.'
    await this.charger()
    this.montrer('cle')
  }

  /** Réglages à joindre au prochain message (vides tant que les modèles ne sont pas chargés). */
  get reglages(): { modele?: string; effort?: string } {
    if (!this.modeles.length) return {}
    return { modele: this.modele ?? undefined, effort: this.effort ?? undefined }
  }

  private trouver(id: string | null | undefined): ModeleCodex | undefined {
    return this.modeles.find((m) => m.id === id)
  }

  private choisir(modele: string | null, effort: string | null, fermer = true) {
    const m = this.trouver(modele) ?? this.modeles.find((x) => x.par_defaut) ?? this.modeles[0]
    if (!m) return
    this.modele = m.id
    // Un effort que ce modèle n'accepte pas retombe sur celui par défaut du modèle.
    this.effort = effort && m.efforts.includes(effort) ? effort : m.effort_defaut
    try {
      localStorage.setItem(CLE, JSON.stringify({ modele: this.modele, effort: this.effort }))
    } catch {
      // le choix ne tiendra que le temps de la page
    }
    this.bouton.innerHTML = `<span class="nom-modele">${echapper(m.nom)}</span> <span class="effort">${libelleEffort(this.effort ?? '')}</span>`
    if (fermer) this.fermer()
    else this.dessiner()
  }

  private basculer() {
    if (this.menu.hidden) {
      this.page = 'principal'
      this.noteCle = ''
      this.dessiner()
      this.menu.hidden = false
      this.bouton.setAttribute('aria-expanded', 'true')
      this.menu.querySelector<HTMLElement>('button')?.focus()
    } else this.fermer()
  }

  private fermer() {
    this.menu.hidden = true
    this.bouton.setAttribute('aria-expanded', 'false')
  }

  private montrer(page: Page) {
    this.page = page
    this.dessiner()
    const cible = this.menu.querySelector<HTMLElement>('.champ-cle') ?? this.menu.querySelector<HTMLElement>('button')
    cible?.focus()
  }

  private dessiner(): void {
    if (this.page === 'cle') {
      const cle = cleOpenAI()
      this.menu.innerHTML =
        `<button type="button" class="menu-retour" data-action="page" data-valeur="principal">${RETOUR} Clé OpenAI</button>` +
        (cle
          ? `<p class="menu-note">Tes tours (orchestrateur, sous-agents, vérificateur) utilisent tes crédits OpenAI avec la
              clé <b>${echapper(cleMasquee(cle))}</b>. Elle reste dans ce navigateur ; le serveur ne l’écrit jamais en base.
              L’appel vocal passe par le compte d’Atlas : il est désactivé tant que ta clé est active.</p>
            <div class="menu-cle"><button type="button" class="bouton-cle" data-action="oublier-cle">Oublier ma clé</button></div>`
          : `<p class="menu-note">Colle une clé OpenAI (de préférence une clé de projet avec un plafond de dépense) : tes
              tours utiliseront tes crédits au lieu du compte d’Atlas. Elle reste dans ce navigateur.</p>
            <div class="menu-cle">
              <input type="password" class="champ-cle" placeholder="sk-proj-…" autocomplete="off" spellcheck="false"
                aria-label="Clé OpenAI" />
              <button type="button" class="bouton-cle" data-action="enregistrer-cle">Enregistrer</button>
            </div>`) +
        `<p class="menu-etat" aria-live="polite">${echapper(this.noteCle)}</p>`
      return
    }
    const m = this.trouver(this.modele)
    if (!m) {
      // Clé active mais modèles indisponibles : seule la clé reste réglable.
      this.page = 'cle'
      this.dessiner()
      return
    }
    if (this.page === 'effort') {
      this.menu.innerHTML =
        `<button type="button" class="menu-retour" data-action="page" data-valeur="principal">${RETOUR} Effort</button>` +
        m.efforts
          .map((e: string) => {
            const info = EFFORTS[e] ?? { libelle: e, description: '' }
            return `<button type="button" role="menuitemradio" aria-checked="${e === this.effort}" class="menu-ligne"
                data-action="effort" data-valeur="${e}">
              <span class="menu-texte"><b>${info.libelle}${e === (this.effortServeur ?? m.effort_defaut) ? ' <small>par défaut</small>' : ''}</b>
                <span>${info.description}</span></span>${e === this.effort ? COCHE : ''}</button>`
          })
          .join('')
      return
    }
    if (this.page === 'modeles') {
      this.menu.innerHTML =
        `<button type="button" class="menu-retour" data-action="page" data-valeur="principal">${RETOUR} Modèles</button>` +
        this.modeles
          .map(
            (x) => `<button type="button" role="menuitemradio" aria-checked="${x.id === m.id}" class="menu-ligne"
                data-action="modele" data-valeur="${echapper(x.id)}">
              <span class="menu-texte"><b>${echapper(x.nom)}</b><span>${echapper(x.description)}</span></span>
              ${x.id === m.id ? COCHE : ''}</button>`,
          )
          .join('')
      return
    }
    this.menu.innerHTML = `
      <div class="menu-ligne menu-courant">
        <span class="menu-texte"><b>${echapper(m.nom)}</b><span>${echapper(m.description)}</span></span>${COCHE}
      </div>
      <hr />
      <button type="button" class="menu-ligne" data-action="page" data-valeur="effort">
        <span class="menu-texte"><b>Effort</b></span><span class="menu-valeur">${libelleEffort(this.effort ?? '')}</span>${CHEVRON}
      </button>
      <hr />
      <button type="button" class="menu-ligne" data-action="page" data-valeur="modeles">
        <span class="menu-texte"><b>Autres modèles</b></span>${CHEVRON}
      </button>
      <hr />
      <button type="button" class="menu-ligne" data-action="page" data-valeur="cle">
        <span class="menu-texte"><b>Clé OpenAI</b></span>
        <span class="menu-valeur">${cleOpenAI() ? 'la tienne' : 'celle d’Atlas'}</span>${CHEVRON}
      </button>
      <p class="menu-note">Pour l’orchestrateur, aux prochains tours. Les sous-agents gardent le modèle de leur rôle.</p>`
  }
}
