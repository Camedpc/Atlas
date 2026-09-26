// Sélecteur du modèle et de l'effort de l'orchestrateur, dans la saisie, comme sur claude.ai :
// un bouton « Modèle Effort » ouvre un menu (modèle courant, Effort ›, Autres modèles ›).
// Le choix vaut pour les prochains tours de l'orchestrateur (les sous-agents gardent le modèle de leur rôle)
// et est gardé dans ce navigateur. Pendant un tour, il s'appliquera au suivant.
import { api, type ModeleCodex } from './api'
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

type Page = 'principal' | 'effort' | 'modeles'

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

  /** Charge les modèles du serveur ; sans eux (serveur ancien, jeton manquant), le sélecteur reste masqué. */
  async charger() {
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
      this.racine.hidden = !this.modeles.length
    } catch (e) {
      console.warn('Modèles indisponibles', e)
    }
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
    this.menu.querySelector<HTMLElement>('button')?.focus()
  }

  private dessiner() {
    const m = this.trouver(this.modele)
    if (!m) return
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
      <p class="menu-note">Pour l’orchestrateur, aux prochains tours. Les sous-agents gardent le modèle de leur rôle.</p>`
  }
}
