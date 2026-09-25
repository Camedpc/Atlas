// Appels au back. Fire-and-forget : le back répond tout de suite et travaille en
// arrière-plan ; le résultat arrive par Supabase Realtime.
const API = (import.meta.env.VITE_API_URL as string).replace(/\/$/, '')

async function appel(chemin: string, init?: RequestInit): Promise<Response> {
  const r = await fetch(`${API}${chemin}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!r.ok) {
    const detail = await r.text().catch(() => '')
    throw new Error(`${r.status} ${detail || r.statusText}`)
  }
  return r
}

const post = (chemin: string, corps: unknown = {}) =>
  appel(chemin, { method: 'POST', body: JSON.stringify(corps) })

export const api = {
  resoudre: (objectif: string) => post('/resoudre', { objectif }),
  verifier: (ids?: string[]) => post('/verifier', ids ? { ids } : {}),
  stop: () => post('/stop'),
  importer: (graphe: unknown) => post('/import', graphe),
  exporter: async (): Promise<unknown> => (await appel('/export')).json(),
  sante: async (): Promise<Sante> => (await appel('/health')).json(),
}

export interface Sante {
  ok: boolean
  /** Agent en cours d'exécution, s'il y en a un. */
  run: { type: 'chercheur' | 'verificateur'; depuis: string; detail: string } | null
  /** Résultat (ou erreur) du dernier run terminé. */
  dernier_resultat: string | null
}
