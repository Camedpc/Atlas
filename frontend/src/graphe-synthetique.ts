// Jeu synthétique pour éprouver la vue à grande taille, en développement seulement (`?synthetique=1000`) : chapitres
// de 40 énoncés dans des cadres (un sous-cadre par chapitre), prémisses vers la gauche, formules Unicode et LaTeX.
// Lecture seule : rien n'est écrit en base.

import type { Demonstration, Graphe, GroupeVue, Noeud, PlacementVue, RolePremisse, Statut, TypeNoeud, Vue } from './api'

const TYPES: TypeNoeud[] = ['lemme', 'proposition', 'lemme', 'assertion', 'calcul', 'observation', 'theoreme', 'definition']
const STATUTS: Statut[] = ['etabli', 'etabli', 'a_verifier', 'a_verifier', 'suspendu', 'invalide', 'ouvert']
const ROLES: RolePremisse[] = ['principale', 'principale', 'principale', 'auxiliaire', 'technique', 'contexte']
const ENONCES = [
  'La tension au point de prise vérifie T₁ = λ v² (1 − α) pour toute vitesse v.',
  'Pour tout $x \\in \\mathbb{R}$, on a $f(x) \\leq C (1 + |x|^2)$.',
  'Le carré moyen du déplacement croît linéairement : ⟨X²⟩ = 2 D t.',
  'La hauteur de la fontaine est proportionnelle au carré de la vitesse de chute.',
  'On a $$\\sum_{k=1}^{n} \\frac{1}{k^2} \\leq 2 - \\frac{1}{n}$$ pour tout entier $n \\geq 1$.',
  'Sous le régime stationnaire, h₁ / h₂ = β / (1 − α − β).',
  'Le schéma numérique est stable si Δt ≤ Δx² / (2 D).',
]

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function aleatoire(graine: number): () => number {
  let a = graine
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function jeuSynthetique(n: number): { graphe: Graphe; vue: Vue } {
  const r = aleatoire(7)
  const choisir = <T>(t: T[]) => t[Math.floor(r() * t.length)]!
  const noeuds: Noeud[] = []
  const placements: PlacementVue[] = []
  const groupes: GroupeVue[] = []
  const parChapitre = 40
  const chapitres = Math.ceil(n / parChapitre)
  const parLigne = 5
  for (let k = 0; k < chapitres; k++) {
    const c0 = (k % parLigne) * 9, l0 = Math.floor(k / parLigne) * 9
    groupes.push({ id: `ch${k}`, nom: `Chapitre ${k + 1}`, parent_id: null, genre: k % 11 === 10 ? 'piste_abandonnee' : 'sous_probleme', couleur: null, replie: false, ordre: k, rectangle: null })
    groupes.push({ id: `ch${k}_base`, nom: `Hypothèses du chapitre ${k + 1}`, parent_id: `ch${k}`, genre: 'etape', couleur: null, replie: false, ordre: 0, rectangle: null })
    for (let j = 0; j < parChapitre && noeuds.length < n; j++) {
      const i = noeuds.length
      const col = Math.floor(j / 6), lig = j % 6
      const hypothese = col === 0 && lig < 3
      const type: TypeNoeud = hypothese ? 'hypothese' : choisir(TYPES)
      const demonstrations: Demonstration[] = []
      if (!hypothese && col > 0) {
        const justifie: string[] = []
        const roles: Record<string, RolePremisse> = {}
        const nb = 1 + Math.floor(r() * 3)
        for (let q = 0; q < nb; q++) {
          const jj = Math.max(0, j - 6 - Math.floor(r() * 12))
          const id = `n${i - j + jj}`
          if (justifie.includes(id)) continue
          justifie.push(id)
          const role = choisir(ROLES)
          if (role !== 'principale') roles[id] = role
        }
        if (k > 0 && r() < 0.15) justifie.push(`n${(k - 1) * parChapitre + 34}`)
        demonstrations.push({
          projet_id: 'synthetique', noeud_id: `n${i}`, nom_demonstration: 'principale', justifie_par: justifie, roles,
          demonstration: 'Démonstration synthétique.', validite: choisir(['valide', 'a_verifier', 'invalide']),
          confiance: r() < 0.7 ? Math.round((0.4 + r() * 0.6) * 100) / 100 : null, auteur: 'synthétique',
        })
      }
      noeuds.push({
        projet_id: 'synthetique', id: `n${i}`, nom: hypothese ? `Hypothèse de travail ${i}` : `Énoncé ${i} du chapitre ${k + 1}`,
        enonce: choisir(ENONCES), admis: type === 'definition', type, details: null, parents: [], enfants: [],
        conversation_id: null, statut: hypothese ? 'ouvert' : choisir(STATUTS), demonstrations,
      })
      placements.push({
        noeud_id: `n${i}`, groupe_id: col <= 1 && lig <= 3 ? `ch${k}_base` : `ch${k}`, colonne: c0 + col, ligne: l0 + lig,
        largeur: 1, hauteur: 1, fixe: false,
      })
    }
  }
  const parId = new Map(noeuds.map((x) => [x.id, x]))
  const aretes: Graphe['aretes'] = []
  for (const x of noeuds) {
    for (const d of x.demonstrations) {
      for (const p of d.justifie_par) {
        const pn = parId.get(p)
        if (!pn) continue
        x.parents.push(p)
        pn.enfants.push(x.id)
        aretes.push({ source: p, cible: x.id, nom_demonstration: d.nom_demonstration, validite: d.validite })
      }
    }
  }
  return { graphe: { noeuds, aretes }, vue: { groupes, placements, etiquettes: [], marques: [] } }
}
