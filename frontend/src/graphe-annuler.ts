// Annuler / rétablir les opérations de vue de la session (pur). Chaque opération réussie garde l'état de la vue avant
// et après ; annuler envoie les opérations qui ramènent de « après » à « avant » (rétablir : l'inverse). On ne touche
// qu'à ce qui diffère entre les deux états : ce que l'IA a déplacé entre-temps ailleurs reste en place.

import type { GroupeVue, OperationVue, PlacementVue, Vue } from './api'

export interface Instantane {
  groupes: Map<string, GroupeVue>
  placements: Map<string, PlacementVue>
  /** Noms des nœuds (renommer_noeud). */
  noms: Map<string, string>
}

export interface Entree {
  libelle: string
  avant: Instantane
  apres: Instantane
}

export function instantane(vue: Vue, noms: Iterable<[string, string]>): Instantane {
  return {
    groupes: new Map(vue.groupes.map((g) => [g.id, g])),
    placements: new Map(vue.placements.map((p) => [p.noeud_id, p])),
    noms: new Map(noms),
  }
}

function profondeur(groupes: Map<string, GroupeVue>, id: string): number {
  let d = 0
  for (let g = groupes.get(id); g?.parent_id && d < 50; g = groupes.get(g.parent_id)) d++
  return d
}

/** Opérations qui font passer la vue de `de` à `vers` (tout ou rien côté serveur). */
export function operationsVers(de: Instantane, vers: Instantane): OperationVue[] {
  const ops: OperationVue[] = []
  // 1. Cadres à recréer, parents d'abord.
  const aCreer = [...vers.groupes.values()].filter((g) => !de.groupes.has(g.id))
  aCreer.sort((a, b) => profondeur(vers.groupes, a.id) - profondeur(vers.groupes, b.id))
  for (const g of aCreer) {
    ops.push({ op: 'creer_groupe', id: g.id, nom: g.nom, parent: g.parent_id ?? '', genre: g.genre, couleur: g.couleur ?? '', ordre: g.ordre })
    if (g.replie) ops.push({ op: 'modifier_groupe', id: g.id, replie: true })
  }
  // 2. Cadres modifiés.
  for (const g of vers.groupes.values()) {
    const a = de.groupes.get(g.id)
    if (!a) continue
    const champs: Record<string, unknown> = {}
    if (a.nom !== g.nom) champs.nom = g.nom
    if (a.parent_id !== g.parent_id) champs.parent = g.parent_id ?? ''
    if (a.genre !== g.genre) champs.genre = g.genre
    if (a.couleur !== g.couleur) champs.couleur = g.couleur ?? ''
    if (a.replie !== g.replie) champs.replie = g.replie
    if (a.ordre !== g.ordre) champs.ordre = g.ordre
    if (Object.keys(champs).length) ops.push({ op: 'modifier_groupe', id: g.id, ...champs })
  }
  // 3. Noms des nœuds.
  for (const [id, nom] of vers.noms) {
    const avant = de.noms.get(id)
    if (avant !== undefined && avant !== nom) ops.push({ op: 'renommer_noeud', id, nom })
  }
  // 4. Placements (un nœud placé d'un côté seulement ne peut pas être « déplacé » : on le laisse).
  for (const p of vers.placements.values()) {
    const a = de.placements.get(p.noeud_id)
    if (a && a.colonne === p.colonne && a.ligne === p.ligne && a.groupe_id === p.groupe_id && a.fixe === p.fixe
      && a.largeur === p.largeur && a.hauteur === p.hauteur) continue
    if (!a) continue
    ops.push({
      op: 'placer', noeud: p.noeud_id, colonne: p.colonne, ligne: p.ligne, groupe: p.groupe_id ?? '',
      largeur: p.largeur, hauteur: p.hauteur, fixe: p.fixe,
    })
  }
  // 5. Cadres à supprimer, sous-cadres d'abord (leurs nœuds ont déjà été replacés).
  const aSupprimer = [...de.groupes.values()].filter((g) => !vers.groupes.has(g.id))
  aSupprimer.sort((a, b) => profondeur(de.groupes, b.id) - profondeur(de.groupes, a.id))
  for (const g of aSupprimer) ops.push({ op: 'supprimer_groupe', id: g.id })
  return ops
}
