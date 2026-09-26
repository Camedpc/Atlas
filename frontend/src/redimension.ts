// Poignées entre les colonnes : on glisse pour régler la largeur des sessions et de la conversation.
// Glisser les sessions en deçà de SEUIL_RANGEMENT les range (bouton en haut à gauche pour les rouvrir) ;
// double-clic sur une poignée : largeur par défaut. Les largeurs sont gardées dans ce navigateur.

const CLE = 'atlas.largeurs'
const SESSIONS = { min: 200, max: 480, defaut: 260 }
const CONVERSATION_MIN = 340
const DROITE_MIN = 360
const SEUIL_RANGEMENT = 140
// En dessous, les sessions flottent au-dessus de la conversation (style.css) : pas de poignée pour elles.
const LARGEUR_FLOTTANTE = 1200

interface Largeurs {
  sessions?: number
  conversation?: number
}

function lire(): Largeurs {
  try {
    return JSON.parse(localStorage.getItem(CLE) ?? '{}') as Largeurs
  } catch {
    return {}
  }
}

function ecrire(l: Largeurs) {
  try {
    localStorage.setItem(CLE, JSON.stringify(l))
  } catch {
    // stockage indisponible : les largeurs ne tiendront que le temps de la page
  }
}

export function installerPoignees(replierSessions: (replie: boolean) => void) {
  const app = document.querySelector<HTMLElement>('#app')!
  const conversation = document.querySelector<HTMLElement>('.panneau-conversation')!
  const droite = document.querySelector<HTMLElement>('.panneau-droit')!
  const largeurs = lire()

  const appliquer = () => {
    app.style.setProperty('--largeur-sessions', `${largeurs.sessions ?? SESSIONS.defaut}px`)
    if (largeurs.conversation) app.style.setProperty('--colonne-conversation', `${largeurs.conversation}px`)
    else app.style.removeProperty('--colonne-conversation')
  }
  appliquer()

  const poignee = (parent: HTMLElement, cible: 'sessions' | 'conversation') => {
    const el = document.createElement('div')
    el.className = `poignee poignee-${cible}`
    el.setAttribute('role', 'separator')
    el.setAttribute('aria-orientation', 'vertical')
    el.title = cible === 'sessions' ? 'Glisser pour régler la largeur des sessions' : 'Glisser pour régler la largeur de la conversation'
    parent.append(el)

    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      if (cible === 'sessions' && window.innerWidth <= LARGEUR_FLOTTANTE) return
      e.preventDefault()
      el.setPointerCapture(e.pointerId)
      document.body.classList.add('redimensionne')
      const rangees = document.body.classList.contains('sessions-repliees')

      const deplacer = (m: PointerEvent) => {
        if (cible === 'sessions') {
          const x = m.clientX
          if (x < SEUIL_RANGEMENT) {
            replierSessions(true)
            return
          }
          replierSessions(false)
          const max = Math.min(SESSIONS.max, window.innerWidth - CONVERSATION_MIN - DROITE_MIN)
          largeurs.sessions = Math.round(Math.max(SESSIONS.min, Math.min(max, x)))
        } else {
          const debut = conversation.getBoundingClientRect().left
          const max = window.innerWidth - debut - DROITE_MIN
          largeurs.conversation = Math.round(Math.max(CONVERSATION_MIN, Math.min(max, m.clientX - debut)))
        }
        appliquer()
      }
      const finir = () => {
        el.removeEventListener('pointermove', deplacer)
        document.body.classList.remove('redimensionne')
        ecrire(largeurs)
        window.dispatchEvent(new Event('resize'))
      }
      el.addEventListener('pointermove', deplacer)
      el.addEventListener('pointerup', finir, { once: true })
      el.addEventListener('pointercancel', finir, { once: true })
      // Sessions rangées : saisir la poignée les ressort sous le curseur.
      if (cible === 'sessions' && rangees) deplacer(e)
    })

    el.addEventListener('dblclick', () => {
      if (cible === 'sessions') {
        delete largeurs.sessions
        replierSessions(false)
      } else delete largeurs.conversation
      appliquer()
      ecrire(largeurs)
      window.dispatchEvent(new Event('resize'))
    })
  }

  // Chaque poignée est posée sur le bord gauche de la colonne qu'elle précède.
  poignee(conversation, 'sessions')
  poignee(droite, 'conversation')
}
