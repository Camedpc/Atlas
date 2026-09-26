// Adaptateur P5 : GET /api/graphe (atlas/modeles.py) → modèle du moteur de raisonnement.
//
// Seul endroit qui connaît les deux formats. Règles (cahier des charges, P5) :
// - les cinq statuts Atlas sont repris tels quels ;
// - validité et confiance restent par démonstration ; la confiance du nœud (couleur) est celle de sa
//   démonstration principale, null tant que la base ne la stocke pas ;
// - ce qui n'est pas en base est déduit seulement quand c'est sûr, sinon laissé vide : le type est
//   déduit (préfixe de l'id, admis, sans enfant) et marqué comme tel ; les rôles de prémisses valent
//   « principale » (défaut documenté du moteur), pour ne rien retirer du graphe de lecture.

import type { Graphe, Noeud } from '../api'
import { demonstrationPrincipale, type JeuRaisonnement, type NoeudR, type TypeRaisonnement } from './raisonnement/donnees'

const PREFIXES: [RegExp, TypeRaisonnement][] = [
  [/^(def|notation)/, 'definition'], [/^ax/, 'axiome'], [/^(hyp|h_)/, 'hypothese'], [/^(cm_|choix)/, 'choix_modelisation'],
  [/^dec/, 'decision'], [/^(lem|lt_)/, 'lemme'], [/^prop/, 'proposition'], [/^(thm|theoreme|cor)/, 'theoreme'],
  [/^exp/, 'experience'], [/^(calc|sim)/, 'calcul'], [/^obs/, 'observation'], [/^res/, 'resultat'], [/^conj/, 'conjecture'],
]

/** Type déduit : préfixe de l'id, sinon admis → définition (fondation), sans enfant → résultat, sinon assertion. */
export function deduireType(n: Pick<Noeud, 'id' | 'admis' | 'enfants' | 'demonstrations'>): TypeRaisonnement {
  const id = n.id.toLowerCase()
  for (const [re, t] of PREFIXES) if (re.test(id)) return t
  if (n.admis) return 'definition'
  if (!n.enfants.length && n.demonstrations.length) return 'resultat'
  return 'assertion'
}

export function depuisGrapheAtlas(graphe: Graphe): JeuRaisonnement {
  const noeuds = graphe.noeuds.map((n): NoeudR => {
    const r: NoeudR = {
      id: n.id,
      nom: n.nom,
      enonce: n.enonce,
      type: deduireType(n),
      typeDeduit: true,
      auteur: n.demonstrations[0]?.auteur ?? '—',
      cree_le: n.cree_le,
      conversation: n.conversation_id,
      sousProbleme: null,
      statut: n.statut,
      confiance: null,
      admis: n.admis,
      demonstrations: n.demonstrations.map((d) => ({
        nom: d.nom_demonstration,
        premisses: d.justifie_par.map((id) => ({ id, role: 'principale' as const })),
        validite: d.validite,
        auteur: d.auteur,
        cree_le: d.cree_le,
        texte: d.demonstration,
        confiance: null,
      })),
    }
    r.confiance = demonstrationPrincipale(r)?.confiance ?? null
    return r
  })
  return { titre: 'Graphe Atlas', resume: 'GET /api/graphe', sousProblemes: [], noeuds, source: 'api' }
}

/** Empreinte des données (P4 `version_donnees`) : dernière modification + nombre de nœuds. */
export function versionDonnees(graphe: Graphe): string {
  let max = ''
  for (const n of graphe.noeuds) {
    if (n.modifie_le > max) max = n.modifie_le
    for (const d of n.demonstrations) if (d.modifie_le > max) max = d.modifie_le
  }
  return `${max || '-'}#${graphe.noeuds.length}`
}
