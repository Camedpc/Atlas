// Nœud « décision » : un losange qui porte « Décision D1 » et son nom ; le contenu (question, options retenues ✓,
// écartées × et leurs raisons, raison du choix, nœuds et cadres visés) s'ouvre dans la fiche, comme pour tout nœud.
// Le losange pointe vers ce qui découle de chaque option (details.alternatives[].noeuds et .groupes, voir
// atlas/decisions.py) : flèche pleine vers une option retenue, tiretée et marquée × vers une option écartée.
// Taille : une case (atlas/vue.py, TAILLE_DECISION) ; le losange remplit le bloc.

export interface Alternative {
  libelle: string
  retenue: boolean
  raison?: string
  noeuds: string[]
  groupes: string[]
}

export interface DetailsDecision {
  question: string
  alternatives: Alternative[]
  raison?: string
}

const ids = (v: unknown) => (Array.isArray(v) ? v.filter((n): n is string => typeof n === 'string') : [])

/** Détails d'une décision, tolérants (un champ mal formé est ignoré) ; null s'il n'y a pas de question. */
export function lireDecision(details: unknown): DetailsDecision | null {
  if (!details || typeof details !== 'object') return null
  const d = details as Record<string, unknown>
  if (typeof d.question !== 'string') return null
  const alternatives = (Array.isArray(d.alternatives) ? d.alternatives : [])
    .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object' && typeof (a as { libelle?: unknown }).libelle === 'string')
    .map((a) => ({
      libelle: a.libelle as string,
      retenue: a.retenue === true,
      raison: typeof a.raison === 'string' ? a.raison : undefined,
      noeuds: ids(a.noeuds),
      groupes: ids(a.groupes),
    }))
  return { question: d.question, alternatives, raison: typeof d.raison === 'string' ? d.raison : undefined }
}

/** Ce que vise une décision : id → retenue (une option retenue l'emporte sur une écartée). */
export function cibles(d: DetailsDecision, champ: 'noeuds' | 'groupes'): Map<string, boolean> {
  const r = new Map<string, boolean>()
  for (const a of d.alternatives) for (const id of a[champ]) r.set(id, (r.get(id) ?? false) || a.retenue)
  return r
}

/** Contour du losange (x, y relatifs au coin du bloc) : il remplit le bloc. */
export function contourDecision(w: number, h: number): number[] {
  return [w / 2, 0, w, h / 2, w / 2, h, 0, h / 2]
}
