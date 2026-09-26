// Questions critiques « à la Walton », dérivées de façon déterministe du graphe.
//
// En production, elles devraient être produites par le vérificateur (voir NOTES.md) ; ici chaque
// question est générée par une règle nommée (Q1…Q10) à partir de la structure, pour être traçable.
// Une question est « traitée » si le graphe contient l'élément qui y répond (vérification formelle,
// réfutation, relecture humaine) ; sinon elle est ouverte.

import { demonstrationPrincipale, LIBELLES_STATUT, LIBELLES_ROLE, type NoeudR } from '../../src/raisonnement/donnees'
import type { Audit, LigneAudit } from './modele'

export type Schema = 'deduction' | 'generalisation' | 'mesure' | 'heuristique'
export const LIBELLES_SCHEMA: Record<Schema, string> = {
  deduction: 'déduction',
  generalisation: 'généralisation empirique',
  mesure: 'mesure / calcul',
  heuristique: 'heuristique',
}

export interface QuestionCritique {
  /** Règle de dérivation (traçabilité). */
  regle: string
  texte: string
  traitee: boolean
  /** Ce qui traite la question, le cas échéant. */
  reponse?: string
}

/** Schéma d'argument de l'inférence qui conclut le nœud i (démonstration principale). */
export function schemaDe(audit: Audit, i: number): Schema {
  const n = audit.j.noeuds[i]!
  if (n.type === 'conjecture') return 'heuristique'
  if (n.type === 'experience' || n.type === 'calcul' || n.type === 'observation') return 'mesure'
  const d = demonstrationPrincipale(n)
  const citeObservation = d?.premisses.some((p) => {
    const v = audit.j.index.get(p.id)
    return p.role === 'principale' && v !== undefined && audit.j.noeuds[v]!.type === 'observation'
  })
  return citeObservation ? 'generalisation' : 'deduction'
}

const fr = (x: number) => x.toFixed(2).replace('.', ',')
const cite = (audit: Audit, v: number) => `${audit.sigles[v]} « ${audit.j.noeuds[v]!.nom} »`

/** Contrôles indépendants (calcul formel, Lean) qui citent le nœud comme prémisse principale. */
function controles(audit: Audit, i: number): number[] {
  const { j } = audit
  return j.sortantes[i]!.map((a) => j.aretes[a]!).filter((a) => {
    const c = j.noeuds[a.cible]!
    return a.role === 'principale' && c.type === 'calcul' && c.origine === 'ordinateur' && /^(verif_|lean_)/.test(c.id)
  }).map((a) => a.cible)
}

/** Questions critiques d'une inférence (démonstration principale du nœud i). */
export function questionsInference(audit: Audit, i: number): QuestionCritique[] {
  const { j } = audit
  const n = j.noeuds[i]!
  const d = demonstrationPrincipale(n)
  if (!d) return []
  const q: QuestionCritique[] = []
  const schema = schemaDe(audit, i)
  const premisses = d.premisses
    .map((p) => ({ p, v: j.index.get(p.id) }))
    .filter((x): x is { p: typeof x.p; v: number } => x.v !== undefined)

  if (schema === 'deduction') {
    // Q1 : conditions d'application des outils techniques.
    for (const { p, v } of premisses) {
      if (p.role !== 'technique') continue
      q.push({ regle: 'Q1', texte: `Les conditions d’application de ${cite(audit, v)} sont-elles établies à cette étape ?`, traitee: false })
    }
    // Q4 : régime de validité des choix de modélisation cités directement.
    for (const { v } of premisses) {
      const c = j.noeuds[v]!
      if (c.type !== 'choix_modelisation' || !c.choix?.alternatives?.length) continue
      q.push({ regle: 'Q4', texte: `L’étape reste-t-elle valide sous « ${c.choix.alternatives[0]} » (alternative à ${audit.sigles[v]}) ?`, traitee: false })
    }
    // Q6 : contrôle indépendant des constantes (théorèmes, propositions, lemmes).
    if (n.type === 'lemme' || n.type === 'proposition' || n.type === 'theoreme') {
      const k = controles(audit, i)
      q.push({
        regle: 'Q6', texte: 'Les constantes et les étapes ont-elles été contrôlées indépendamment (calcul formel, Lean) ?',
        traitee: k.length > 0, reponse: k.length ? k.map((v) => audit.sigles[v]).join(', ') : undefined,
      })
    }
  }
  // Q2 : prémisse fragile (incertaine ou réfutée) dans la démonstration principale.
  for (const { p, v } of premisses) {
    const c = j.noeuds[v]!
    if (c.statut === 'valide' || p.role === 'contexte') continue
    q.push({ regle: 'Q2', texte: `${cite(audit, v)} est ${LIBELLES_STATUT[c.statut].toLowerCase()}e (rôle ${LIBELLES_ROLE[p.role].toLowerCase()}) : l’étape en a-t-elle réellement besoin ?`, traitee: false })
  }
  // Q3 : démonstration alternative non vérifiée.
  for (const alt of n.demonstrations) {
    if (alt === d || alt.validite === 'valide') continue
    q.push({ regle: 'Q3', texte: `La démonstration « ${alt.nom} » (${alt.validite === 'invalide' ? 'invalide' : 'à vérifier'}) est-elle indépendante de la principale ?`, traitee: false })
  }
  if (schema === 'mesure') {
    // Q7 : hypothèses citées par un protocole ou un calcul, vérifiées dans le régime simulé ?
    for (const { v } of premisses) {
      if (j.noeuds[v]!.type !== 'hypothese') continue
      q.push({ regle: 'Q7', texte: `${cite(audit, v)} est-elle vérifiée dans le régime simulé ?`, traitee: false })
    }
    if (n.type === 'observation' && n.statut !== 'valide') {
      q.push({ regle: 'Q8', texte: 'L’observation, incertaine, est-elle reproduite à résolution plus fine ou avec plus de trajectoires ?', traitee: false })
    }
  }
  if (schema === 'generalisation') {
    // Q8 : observations incertaines décisives ?
    const obs = premisses.filter(({ v }) => j.noeuds[v]!.type === 'observation')
    const fragiles = obs.filter(({ v }) => j.noeuds[v]!.statut !== 'valide')
    q.push({
      regle: 'Q8', texte: `Les ${obs.length} observation${obs.length > 1 ? 's' : ''} citée${obs.length > 1 ? 's' : ''} couvrent-elles le domaine revendiqué par l’énoncé ?`,
      traitee: false,
    })
    for (const { v } of fragiles) q.push({ regle: 'Q8', texte: `${cite(audit, v)} (incertaine) est-elle nécessaire à la conclusion ?`, traitee: false })
  }
  if (schema === 'heuristique') {
    // Q9 : test de réfutation.
    const refutations = j.noeuds.map((x, v) => ({ x, v })).filter(({ x }) => x.liens?.some((l) => l.genre === 'contredit' && l.cible === n.id))
    q.push({
      regle: 'Q9', texte: 'Quelle observation réfuterait la conjecture, et a-t-elle été tentée ?',
      traitee: refutations.length > 0, reponse: refutations.length ? `réfutée par ${refutations.map(({ v }) => audit.sigles[v]).join(', ')}` : undefined,
    })
  }
  // Q5 : rédaction IA sans relecture humaine.
  if (n.origine === 'ia') {
    const humain = n.validation === 'humain' || n.validation === 'ia_humain'
    q.push({ regle: 'Q5', texte: 'Rédigée par l’IA : une relecture humaine a-t-elle eu lieu ?', traitee: humain, reponse: humain ? `validation ${n.validation === 'humain' ? 'humaine' : 'IA + humain'}` : undefined })
  }
  return q
}

/** Questions critiques au niveau du résultat entier (conditions, contradictions, écart de confiance). */
export function questionsResultat(audit: Audit, l: LigneAudit): QuestionCritique[] {
  const q: QuestionCritique[] = []
  for (const c of audit.colonnes) {
    if (!l.deps[c.k] || !c.fragile) continue
    q.push({ regle: 'R1', texte: `Le résultat tient-il sans ${c.sigle} « ${c.noeud.nom} » (condition ${LIBELLES_STATUT[c.noeud.statut].toLowerCase()}e, dépendance ${l.deps[c.k] === 2 ? 'directe' : 'transitive'}) ?`, traitee: false })
  }
  for (const c of l.contradictionsResolues) {
    if (c.par === null) continue
    q.push({ regle: 'R2', texte: `La résolution par ${audit.sigles[c.par]} couvre-t-elle toute la contradiction ${audit.sigles[c.source]} ⊣ ${audit.sigles[c.cible]} ?`, traitee: false })
  }
  for (const c of l.contradictionsActives) {
    q.push({ regle: 'R2', texte: `Contradiction active ${audit.sigles[c.source]} ⊣ ${audit.sigles[c.cible]} : aucune résolution enregistrée.`, traitee: false })
  }
  if (l.ecart > 0.15) {
    q.push({
      regle: 'R3',
      texte: `Confiance déclarée ${fr(l.declaree.estimation)} contre ${fr(l.propagee.estimation)} propagée : qu’est-ce qui justifie l’écart au-delà de ${audit.sigles[l.maillon]} ?`,
      traitee: false,
    })
  }
  return q
}

export interface VerdictSynthetique {
  juge: string
  recours: boolean
  motifRecours?: string
}

/**
 * Verdict du vérificateur tel qu'Atlas le produit (juge économique, recours si invalide ou sous le seuil).
 * Le jeu synthétique n'a pas d'entrées `verdict` : on reconstitue seulement l'aiguillage.
 */
export function verdictSynthetique(n: NoeudR, seuil: number): VerdictSynthetique {
  const d = demonstrationPrincipale(n)
  const invalide = d?.validite === 'invalide'
  const bas = n.confiance.estimation < seuil
  return {
    juge: 'ATLAS_MODELE_VERIFICATEUR',
    recours: invalide || bas,
    motifRecours: invalide ? 'jugée invalide' : bas ? `confiance < ${fr(seuil)}` : undefined,
  }
}
