// Liens vers des fichiers du projet dans les messages (rapports cités par les agents) : `docs_session/…/rapport.md`,
// `../../doc_projet/…`, `scripts_projet/…`, ou le chemin absolu sur le serveur
// (`/donnees/espace/utilisateurs/<u>/<projet>/sessions/<id>/…`). Le navigateur ne sait pas les ouvrir : on les
// ramène au dossier du projet pour les montrer dans la vue Documents.

const RACINES = ['doc_projet', 'scripts_projet', 'sessions']
const SANS_SESSION = '\u0000'

/** Chemin relatif au dossier du projet désigné par `lien` (href ou texte), ou null si ce n'est pas un fichier du
 * projet. `session` : id de la conversation affichée (base des chemins relatifs à la session). */
export function cheminProjet(lien: string, session: string | null): string | null {
  let brut = lien.trim()
  if (!brut || /^(https?|mailto|tel|data|blob|javascript):/i.test(brut) || brut.startsWith('#')) return null
  brut = brut.replace(/^file:\/\//i, '').replace(/[?#].*$/, '')
  try {
    brut = decodeURIComponent(brut)
  } catch {
    // tel quel
  }
  brut = brut.replace(/\\/g, '/')
  let base: string[]
  // Chemin absolu du serveur : ce qui suit utilisateurs/<utilisateur>/<projet>/.
  const absolu = brut.match(/\/utilisateurs\/[^/]+\/[^/]+\/(.+)$/)
  if (absolu) {
    brut = absolu[1]!
    base = []
  } else if (brut.startsWith('/') || /^[A-Za-z]:\//.test(brut)) return null
  else {
    const premier = brut.replace(/^(\.\/)+/, '').split('/')[0]!
    // Sans conversation ouverte, une session fictive : `../../doc_projet/…` reste lisible, `docs_session/…` non.
    base = RACINES.includes(premier) ? [] : ['sessions', session ?? SANS_SESSION]
  }
  const parties = [...base]
  for (const p of brut.split('/')) {
    if (!p || p === '.') continue
    if (p === '..') {
      if (!parties.length) return null
      parties.pop()
    } else parties.push(p)
  }
  if (!parties.length || !RACINES.includes(parties[0]!) || parties.some((p) => p.startsWith('.') || p === SANS_SESSION)) return null
  return parties.join('/')
}

/** Un texte de code (`scripts_projet/…/simulation.py`) qui ressemble à un chemin de fichier du projet ou de la
 * session : il devient cliquable comme un lien. */
export function ressembleAUnChemin(texte: string): boolean {
  return /^(\.\.\/\.\.\/)?(doc_projet|scripts_projet|docs_session|scripts|sessions)\/[^\s`'"<>]+$/.test(texte.trim())
}
