// Barre latérale : l'espace de travail (projet) en tête, puis ses sessions groupées par date, comme sur
// claude.ai. Le nom de l'espace ouvre un menu pour en changer ou en créer un (« + Nouvel espace » devient un
// champ : Entrée crée l'espace et y entre). Repliable ; l'état replié est gardé dans ce navigateur.
import type { Conversation, Projet } from './api'
import { echapper } from './rendu'

const CLE_REPLIE = 'atlas.sessions.replie'

const PLUS =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 3v10M3 8h10"/></svg>'
const CHOIX =
  '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m4.5 5.5 2.5-2.5 2.5 2.5M4.5 8.5 7 11l2.5-2.5"/></svg>'

function groupe(date: Date, maintenant: Date): string {
  const jour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const ecart = Math.round((jour(maintenant) - jour(date)) / 86_400_000)
  if (ecart <= 0) return 'Aujourd’hui'
  if (ecart === 1) return 'Hier'
  if (ecart < 7) return '7 derniers jours'
  if (ecart < 30) return '30 derniers jours'
  return 'Plus anciennes'
}

/** « Supraconductivité des hydrures » → « SH » ; « Hydrures » → « H ». */
export function monogramme(nom: string): string {
  const mots = nom.split(/\s+/).filter((m) => m.length > 3 || /^[A-ZÀ-Ý]/.test(m))
  return (mots.length ? mots : nom.split(/\s+/))
    .map((m) => m[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export interface RappelsSessions {
  surOuvrir: (id: string) => void
  surNouvelle: () => void
  surProjet: (id: string) => void
  surCreerProjet: (nom: string) => Promise<void>
}

export class PanneauSessions {
  private liste: HTMLElement
  private tete: HTMLElement
  private selecteur: HTMLButtonElement
  private menu: HTMLElement
  private pied: HTMLElement
  private projets: Projet[] = []
  private projet: string | null = null
  private readonly rappels: RappelsSessions

  constructor(racine: HTMLElement, rappels: RappelsSessions) {
    this.rappels = rappels
    racine.innerHTML = `
      <div class="sessions-tete">
        <button type="button" class="selecteur-espace" aria-haspopup="menu" aria-expanded="false" title="Changer d’espace">
          <span class="monogramme">A</span><span class="nom-espace">Atlas</span>${CHOIX}
        </button>
        <button type="button" class="icone replier-sessions" title="Masquer la barre latérale" aria-label="Masquer la barre latérale">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2.5" y="3" width="13" height="12" rx="2"/><path d="M7 3v12"/></svg>
        </button>
        <div class="menu-espaces" role="menu" hidden></div>
      </div>
      <button type="button" class="nouvelle-session">${PLUS} Nouvelle recherche</button>
      <nav class="sessions-liste" aria-label="Sessions"></nav>
      <div class="sessions-pied"></div>`
    this.liste = racine.querySelector('.sessions-liste')!
    this.tete = racine.querySelector('.sessions-tete')!
    this.selecteur = racine.querySelector('.selecteur-espace')!
    this.menu = racine.querySelector('.menu-espaces')!
    this.pied = racine.querySelector('.sessions-pied')!

    racine.querySelector('.nouvelle-session')!.addEventListener('click', () => {
      rappels.surNouvelle()
      if (window.innerWidth <= 1200) this.replier(true)
    })
    racine.querySelector('.replier-sessions')!.addEventListener('click', () => this.replier(true))
    this.liste.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')
      if (!el) return
      e.preventDefault()
      rappels.surOuvrir(el.dataset.id!)
      if (window.innerWidth <= 1200) this.replier(true)
    })
    this.selecteur.addEventListener('click', () => (this.menu.hidden ? this.ouvrirMenu() : this.fermerMenu()))
    this.menu.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-projet], .nouvel-espace')
      if (!el) return
      if (el.classList.contains('nouvel-espace')) return this.saisirNouvelEspace()
      this.fermerMenu()
      if (el.dataset.projet !== this.projet) rappels.surProjet(el.dataset.projet!)
    })
    document.addEventListener('pointerdown', (e) => {
      if (!this.menu.hidden && !this.tete.contains(e.target as Node)) this.fermerMenu()
    })
    this.menu.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.fermerMenu()
        this.selecteur.focus()
      }
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

  afficherProjets(projets: Projet[], courant: string | null, utilisateur: string) {
    this.projets = projets
    this.projet = courant
    const p = projets.find((x) => x.id === courant)
    this.selecteur.querySelector('.monogramme')!.textContent = p ? monogramme(p.nom) : 'A'
    this.selecteur.querySelector('.nom-espace')!.textContent = p?.nom ?? 'Atlas'
    this.selecteur.title = p ? `${p.nom} — changer d’espace` : 'Choisir un espace'
    const nom = utilisateur.charAt(0).toUpperCase() + utilisateur.slice(1)
    this.pied.innerHTML = `<span class="avatar">${echapper(nom.slice(0, 2).toUpperCase())}</span>${echapper(nom)}`
    if (!this.menu.hidden) this.dessinerMenu()
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
    this.liste.innerHTML = html.join('') || '<p class="vide">Aucune session dans cet espace pour l’instant.</p>'
  }

  private ouvrirMenu() {
    this.dessinerMenu()
    this.menu.hidden = false
    this.selecteur.setAttribute('aria-expanded', 'true')
    this.menu.querySelector<HTMLElement>('button')?.focus()
  }

  private fermerMenu() {
    this.menu.hidden = true
    this.selecteur.setAttribute('aria-expanded', 'false')
  }

  private dessinerMenu() {
    this.menu.innerHTML = `
      <div class="menu-titre">Espaces</div>
      ${this.projets
        .map(
          (p) => `<button type="button" role="menuitemradio" aria-checked="${p.id === this.projet}" data-projet="${p.id}">
            <span class="monogramme">${echapper(monogramme(p.nom))}</span><span class="nom">${echapper(p.nom)}</span>
            ${p.id === this.projet ? '<span class="coche">✓</span>' : ''}</button>`,
        )
        .join('')}
      <hr />
      <button type="button" class="nouvel-espace">${PLUS}<span>Nouvel espace</span></button>`
  }

  // « + Nouvel espace » devient un champ dans le menu : Entrée crée l'espace, Échap annule.
  private saisirNouvelEspace() {
    const bouton = this.menu.querySelector<HTMLElement>('.nouvel-espace')!
    const formulaire = document.createElement('form')
    formulaire.className = 'nouvel-espace-saisie'
    formulaire.innerHTML = `<input type="text" maxlength="120" placeholder="Nom de l’espace" aria-label="Nom du nouvel espace" />`
    bouton.replaceWith(formulaire)
    const champ = formulaire.querySelector('input')!
    champ.focus()
    champ.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        this.dessinerMenu()
      }
    })
    champ.addEventListener('input', () => champ.setCustomValidity(''))
    formulaire.addEventListener('submit', async (e) => {
      e.preventDefault()
      const nom = champ.value.trim()
      if (!nom) return
      champ.disabled = true
      try {
        await this.rappels.surCreerProjet(nom)
        this.fermerMenu()
      } catch (erreur) {
        champ.disabled = false
        champ.setCustomValidity(erreur instanceof Error ? erreur.message : String(erreur))
        champ.reportValidity()
      }
    })
  }
}
