// Validité effective — même algorithme que backend/app/validite.py.
// Cas de test partagés : shared/fixtures/validite/*.json.
import type { Demonstration, Noeud, Statut } from './types'

/**
 * Point fixe : on part des nœuds admis, puis on ajoute tout nœud possédant une
 * démonstration valide dont toutes les prémisses sont déjà établies, jusqu'à
 * stabilité. Deux démonstrations circulaires ne peuvent donc jamais se valider.
 */
export function calculerEtablis(noeuds: Noeud[]): Set<string> {
  const etablis = new Set(noeuds.filter((n) => n.admis).map((n) => n.id))
  let change = true
  while (change) {
    change = false
    for (const n of noeuds) {
      if (etablis.has(n.id)) continue
      const prouve = n.demonstrations.some(
        (d) => d.validite === 'valide' && d.justifie_par.every((p) => etablis.has(p)),
      )
      if (prouve) {
        etablis.add(n.id)
        change = true
      }
    }
  }
  return etablis
}

export function statutNoeud(n: Noeud, etablis: Set<string>): Statut {
  if (etablis.has(n.id)) return 'etabli'
  const demos = n.demonstrations
  // Validée mais au moins une prémisse ne l'est pas.
  if (demos.some((d) => d.validite === 'valide')) return 'suspendu'
  if (demos.some((d) => d.validite === 'a_verifier')) return 'a_verifier'
  if (demos.length > 0) return 'invalide'
  return 'ouvert'
}

export function calculerStatuts(noeuds: Noeud[]): Map<string, Statut> {
  const etablis = calculerEtablis(noeuds)
  return new Map(noeuds.map((n) => [n.id, statutNoeud(n, etablis)]))
}

/** Prémisses non établies d'une démonstration (vide si elle tient). */
export function premissesManquantes(d: Demonstration, etablis: Set<string>): string[] {
  return d.justifie_par.filter((p) => !etablis.has(p))
}
