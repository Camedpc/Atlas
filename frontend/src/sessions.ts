// Barre latérale : les conversations (sessions), la plus récente d'abord, groupées par date comme sur
// claude.ai ou ChatGPT. Repliable ; l'état replié est gardé dans ce navigateur.
import type { Conversation } from './api'
import { echapper } from './rendu'

const CLE_REPLIE = 'atlas.sessions.replie'

function groupe(date: Date, maintenant: Date): string {
  const jour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const ecart = Math.round((jour(maintenant) - jour(date)) / 86_400_000)
  if (ecart <= 0) return 'Aujourd’hui'
  if (ecart === 1) return 'Hier'
  if (ecart < 7) return '7 derniers jours'
  if (ecart < 30) return '30 derniers jours'
  return 'Plus anciennes'
}

export class PanneauSessions {
  private racine: HTMLElement
  private liste: HTMLElement
  private readonly surOuvrir: (id: string) => void

  constructor(racine: HTMLElement, surOuvrir: (id: string) => void, surNouvelle: () => void) {
    this.racine = racine
    this.surOuvrir = surOuvrir
    racine.innerHTML = `
      <div class="sessions-tete">
        <span class="marque">Atlas</span>
        <button type="button" class="icone replier-sessions" title="Masquer la barre latérale" aria-label="Masquer la barre latérale">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2.5" y="3" width="13" height="12" rx="2"/><path d="M7 3v12"/></svg>
        </button>
      </div>
      <button type="button" class="nouvelle-session">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 3v10M3 8h10"/></svg>
        Nouvelle recherche
      </button>
      <nav class="sessions-liste" aria-label="Conversations"></nav>`
    this.liste = racine.querySelector('.sessions-liste')!
    racine.querySelector('.nouvelle-session')!.addEventListener('click', () => {
      surNouvelle()
      if (window.innerWidth <= 1200) this.replier(true)
    })
    racine.querySelector('.replier-sessions')!.addEventListener('click', () => this.replier(true))
    this.liste.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')
      if (!el) return
      e.preventDefault()
      this.surOuvrir(el.dataset.id!)
      if (window.innerWidth <= 1200) this.replier(true)
    })
    // Sur écran moyen, la barre flotte au-dessus de la conversation : repliée par défaut.
    let replie = window.innerWidth <= 1200
    try {
      const choix = localStorage.getItem(CLE_REPLIE)
      if (choix !== null && window.innerWidth > 1200) replie = choix === '1'
    } catch {
      // stockage indisponible
    }
    this.replier(replie)
  }

  replier(replie: boolean) {
    document.body.classList.toggle('sessions-repliees', replie)
    if (window.innerWidth <= 1200) return
    try {
      localStorage.setItem(CLE_REPLIE, replie ? '1' : '0')
    } catch {
      // sans importance
    }
  }

  afficher(conversations: Conversation[], courante: string | null, enCours: string | null) {
    const maintenant = new Date()
    let dernier = ''
    const html: string[] = []
    for (const c of conversations) {
      const g = groupe(new Date(c.modifie_le), maintenant)
      if (g !== dernier) {
        html.push(`<h3>${g}</h3>`)
        dernier = g
      }
      const classes = ['session', c.id === courante ? 'active' : ''].join(' ')
      const statut = c.id === enCours ? '<span class="session-statut">en cours</span>' : ''
      html.push(
        `<a class="${classes}" data-id="${c.id}" href="#${c.id}" title="${echapper(c.titre)}"><span class="session-titre">${echapper(c.titre)}</span>${statut}</a>`,
      )
    }
    this.liste.innerHTML = html.join('') || '<p class="vide">Aucune conversation pour l’instant.</p>'
  }

  get element() {
    return this.racine
  }
}
