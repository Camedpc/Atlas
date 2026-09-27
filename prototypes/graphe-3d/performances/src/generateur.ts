// Générateur de grands jeux de raisonnement (200 → 20 000 nœuds) pour les mesures de performance.
//
// Principe : un gros projet de recherche = une suite de « chapitres », chacun copie d'un des deux jeux
// réalistes existants (jeu synthétique EDP, ≈ 200 nœuds ; jeu fontaine de R36, ≈ 70 nœuds), en
// alternance 2 EDP : 1 fontaine. Chaque copie reçoit un préfixe d'identifiant `cK/` et ses propres
// sous-problèmes (`cK/stab`…), puis on la relie au reste :
//
//   1. littérature partagée : dans une copie qui n'est pas la première de son jeu, un nœud admis
//      (axiome, définition, lemme ou résultat de la littérature) est, avec probabilité 0,6, remplacé
//      par celui de la première copie (même objet cité par tout le projet : les nœuds les plus
//      partagés du graphe, comme en vrai) ;
//   2. dépendances entre chapitres : chaque énoncé de travail « racine » d'un chapitre (sans prémisse
//      principale vers un énoncé de travail) cite, avec probabilité 0,5, un théorème, un résultat ou
//      une proposition d'un des trois chapitres précédents, comme prémisse principale ;
//   3. contexte croisé : 30 % des démonstrations gagnent une prémisse de contexte vers un nœud admis
//      d'un chapitre antérieur.
//
// Les références ne vont que vers des chapitres antérieurs : la concaténation reste en ordre
// topologique, et le jeu de taille N est le préfixe des N premiers nœuds (le dernier chapitre est
// tronqué ; une prémisse vers un nœud absent est ignorée par construireJustification).
// Déterministe (graine).

import { genererJeuRaisonnement, type JeuRaisonnement, type NoeudR, type Premisse, type SousProbleme } from '../../src/raisonnement/donnees'
import { jeuFontaine } from '../../raisonnement/r36-latex-classique-a/jeu-fontaine'

function alea(graine: number): () => number {
  let s = graine >>> 0 || 1
  return () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s / 4294967296
  }
}

const ADMIS_PARTAGES = new Set(['axiome', 'definition', 'lemme', 'theoreme', 'proposition', 'resultat'])
const MAJEURS = new Set(['theoreme', 'resultat', 'proposition'])

export interface GrandJeu extends JeuRaisonnement {
  chapitres: number
}

export function genererGrandJeu(cible: number, graine = 20260927): GrandJeu {
  const r = alea(graine)
  const bases = { edp: genererJeuRaisonnement(), fontaine: jeuFontaine() }
  const ordreBases: (keyof typeof bases)[] = ['edp', 'edp', 'fontaine']
  const noeuds: NoeudR[] = []
  const sousProblemes: SousProbleme[] = []
  /** Première copie de chaque jeu : id d'origine → id copié (pour la littérature partagée). */
  const premiere: Record<string, Map<string, string>> = {}
  /** Par chapitre : ids des énoncés majeurs et des nœuds admis. */
  const majeursDe: string[][] = []
  const admisDe: string[][] = []
  let k = 0
  while (noeuds.length < cible) {
    const nomBase = ordreBases[k % ordreBases.length]!
    const base = bases[nomBase]
    const prefixe = `c${k}/`
    const renom = new Map<string, string>()
    const partage = premiere[nomBase]
    const estPremiere = !partage
    if (estPremiere) premiere[nomBase] = renom
    for (const sp of base.sousProblemes) sousProblemes.push({ ...sp, id: prefixe + sp.id, nom: `Ch. ${k + 1} · ${sp.nom}` })
    const copies: NoeudR[] = []
    const majeurs: string[] = [], admis: string[] = []
    for (const n of base.noeuds) {
      // 1. Littérature partagée.
      if (!estPremiere && n.admis && ADMIS_PARTAGES.has(n.type) && partage!.has(n.id) && r() < 0.6) {
        renom.set(n.id, partage!.get(n.id)!)
        continue
      }
      const id = prefixe + n.id
      renom.set(n.id, id)
      const c: NoeudR = {
        ...n,
        id,
        sousProbleme: prefixe + n.sousProbleme,
        demonstrations: n.demonstrations.map((d) => ({ ...d, premisses: d.premisses.map((p) => ({ ...p })) })),
        liens: n.liens?.map((l) => ({ ...l })),
      }
      copies.push(c)
      if (n.admis && ADMIS_PARTAGES.has(n.type)) admis.push(id)
      else if (MAJEURS.has(n.type) && n.piste === 'active') majeurs.push(id)
    }
    // Renommage des prémisses et des liens (après coup : les renforts peuvent citer un nœud défini plus loin).
    for (const c of copies) {
      for (const d of c.demonstrations) for (const p of d.premisses) p.id = renom.get(p.id) ?? prefixe + p.id
      if (c.liens) for (const l of c.liens) l.cible = renom.get(l.cible) ?? prefixe + l.cible
    }
    if (k > 0) {
      const travail = new Set(copies.filter((c) => !c.admis && c.type !== 'hypothese' && c.type !== 'choix_modelisation' && c.type !== 'axiome').map((c) => c.id))
      for (const c of copies) {
        if (!travail.has(c.id) || !c.demonstrations.length) continue
        const d0 = c.demonstrations[0]!
        // 2. Dépendances entre chapitres (racines de travail).
        const racine = !d0.premisses.some((p) => p.role === 'principale' && travail.has(p.id))
        if (racine && r() < 0.5) {
          const ch = Math.max(0, k - 1 - Math.floor(r() * 3))
          const l = majeursDe[ch]!
          if (l.length) d0.premisses.push({ id: l[Math.floor(r() * l.length)]!, role: 'principale' } satisfies Premisse)
        }
        // 3. Contexte croisé.
        for (const d of c.demonstrations) {
          if (r() >= 0.3) continue
          const ch = Math.floor(r() * k)
          const l = admisDe[ch]!
          if (l.length) {
            const id = l[Math.floor(r() * l.length)]!
            if (!d.premisses.some((p) => p.id === id)) d.premisses.push({ id, role: 'contexte' })
          }
        }
      }
    }
    majeursDe.push(majeurs)
    admisDe.push(admis)
    noeuds.push(...copies)
    k++
  }
  noeuds.length = cible
  return {
    titre: `Grand jeu · ${cible} nœuds (${k} chapitres)`,
    resume: 'Chapitres copiés du jeu EDP et du jeu fontaine, reliés par la littérature partagée et des dépendances entre chapitres.',
    sousProblemes,
    noeuds,
    source: 'synthetique',
    chapitres: k,
  }
}

/** Statistiques descriptives d'un jeu (types, prémisses par nœud, rôles). */
export function decrireJeu(jeu: JeuRaisonnement): Record<string, unknown> {
  const types: Record<string, number> = {}
  const roles: Record<string, number> = {}
  let premisses = 0, demos = 0
  const ids = new Set(jeu.noeuds.map((n) => n.id))
  let pendantes = 0
  for (const n of jeu.noeuds) {
    types[n.type] = (types[n.type] ?? 0) + 1
    for (const d of n.demonstrations) {
      demos++
      for (const p of d.premisses) {
        premisses++
        roles[p.role] = (roles[p.role] ?? 0) + 1
        if (!ids.has(p.id)) pendantes++
      }
    }
  }
  return {
    noeuds: jeu.noeuds.length,
    demonstrations: demos,
    premissesParNoeud: +(premisses / jeu.noeuds.length).toFixed(2),
    premissesPendantes: pendantes,
    sousProblemes: jeu.sousProblemes.length,
    types,
    roles,
  }
}
