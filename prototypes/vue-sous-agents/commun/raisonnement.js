// Graphe de raisonnement d'exemple : résolution d'un problème scientifique, selon le modèle d'Atlas.
// - nœud = assertion (`admis` = fait mesuré, axiome ou résultat connu : établi sans démonstration) ;
// - démonstration = liaison depuis ses prémisses (`justifie_par`) vers le nœud qu'elle démontre,
//   avec `validite` (valide | invalide | a_verifier) et `confiance` (sur 1) ;
// - le statut d'un nœud n'est jamais stocké : `calculerStatuts` le recalcule (port de atlas/graphe.py).
// Les catégories sont des suggestions de regroupement (boîtes « Comment » à la Unreal).

export const PROBLEME = 'Un hydrure peut-il être supraconducteur à température ambiante sans pression extrême ?'

export const NOEUDS = [
  { id: 'f1', nom: 'LaH10 à 250 K', enonce: 'LaH10 est supraconducteur jusqu’à 250 K sous 170 GPa (Drozdov 2019).', admis: true },
  { id: 'f2', nom: 'H3S à 203 K', enonce: 'H3S est supraconducteur jusqu’à 203 K sous 155 GPa, reproduit par trois groupes.', admis: true },
  { id: 'f3', nom: 'Chute sous 100 GPa', enonce: 'La Tc des hydrures binaires connus s’effondre sous 100 GPa.', admis: true },
  { id: 'p1', nom: 'LaBeH8 à 110 K', enonce: 'LaBeH8 reste supraconducteur à 110 K sous seulement 80 GPa.', admis: true },
  { id: 't1', nom: 'Théorie d’Eliashberg', enonce: 'La supraconductivité conventionnelle est décrite par la théorie d’Eliashberg (couplage électron-phonon).', admis: true },
  { id: 't2', nom: 'Formule d’Allen-Dynes', enonce: 'Tc ≈ (ω_log / 1,2) · exp(−1,04 (1 + λ) / (λ − μ* (1 + 0,62 λ))).', admis: true },
  { id: 'c1', nom: 'λ entre 2 et 3', enonce: 'Le couplage électron-phonon λ des hydrures denses est compris entre 2 et 3.', admis: false },
  { id: 'c2', nom: 'ω_log élevé', enonce: 'La légèreté de l’hydrogène donne des fréquences ω_log très élevées.', admis: false },
  { id: 'c3', nom: 'Pas de borne sous 300 K', enonce: 'Le mécanisme phononique n’impose aucune borne dure de Tc sous 300 K.', admis: false },
  { id: 'r3', nom: 'CSH jamais répliqué', enonce: 'Aucun groupe indépendant n’a reproduit la supraconductivité de CSH (Dias 2020).', admis: true },
  { id: 'r1', nom: 'Fond soustrait', enonce: 'Les données de susceptibilité de CSH contiennent un fond soustrait non documenté.', admis: false },
  { id: 'r2', nom: 'CSH écarté', enonce: 'Le résultat CSH à 288 K ne peut pas servir de preuve.', admis: false },
  { id: 'r5', nom: 'Transition de Cu2S', enonce: 'Cu2S subit une transition structurelle vers 385 K.', admis: true },
  { id: 'r4', nom: 'LK-99 = Cu2S', enonce: 'La chute de résistivité de LK-99 vient de l’impureté Cu2S.', admis: false },
  { id: 'r6', nom: 'LK-99 écarté', enonce: 'LK-99 n’est pas un supraconducteur à température ambiante.', admis: false },
  { id: 'm1', nom: 'Mg2IrH6 stable à 0 GPa', enonce: 'Mg2IrH6 est dynamiquement stable à pression ambiante (phonons sans mode imaginaire).', admis: false },
  { id: 'm2', nom: 'Barrière > 0,5 eV', enonce: 'La barrière de décomposition des hydrures métastables dépasse 0,5 eV/atome.', admis: false },
  { id: 'm3', nom: 'Métastabilité possible', enonce: 'Un hydrure métastable peut conserver sa structure supraconductrice à pression ambiante.', admis: false },
  { id: 'p2', nom: 'Précompression chimique', enonce: 'Les ternaires abaissent la pression nécessaire d’environ 30 GPa par génération de matériaux.', admis: false },
  { id: 'q', nom: 'Conclusion', enonce: 'Un hydrure supraconducteur à température ambiante sans pression extrême est plausible, mais non démontré.', admis: false },
  { id: 'h1', nom: 'Ternaire à 1 atm', enonce: 'Il existe un hydrure ternaire stable à 1 atm avec Tc > 250 K.', admis: false },
]

export const DEMONSTRATIONS = [
  { noeud_id: 'c1', nom_demonstration: 'eliashberg_numerique', justifie_par: ['t1', 'f1', 'f2'], demonstration: 'Résolution des équations d’Eliashberg ajustée sur LaH10 et H3S.', validite: 'a_verifier', confiance: null, auteur: 'experimentateur' },
  { noeud_id: 'c2', nom_demonstration: 'masse_isotopique', justifie_par: ['t1'], demonstration: 'ω ∝ 1/√M : l’hydrogène, le plus léger, maximise les fréquences.', validite: 'valide', confiance: 0.94, auteur: 'verificateur' },
  { noeud_id: 'c3', nom_demonstration: 'allen_dynes', justifie_par: ['t2', 'c1', 'c2'], demonstration: 'Avec λ ≈ 2,5 et ω_log ≈ 1500 K, Allen-Dynes donne Tc > 300 K.', validite: 'valide', confiance: 0.81, auteur: 'verificateur' },
  { noeud_id: 'r1', nom_demonstration: 'reanalyse', justifie_par: ['r3'], demonstration: 'Réanalyse des données brutes publiées : le fond ne correspond à aucune mesure.', validite: 'valide', confiance: 0.77, auteur: 'recours' },
  { noeud_id: 'r2', nom_demonstration: 'retractation', justifie_par: ['r1', 'r3'], demonstration: 'Données douteuses et aucune réplication : l’article a été rétracté.', validite: 'valide', confiance: 0.92, auteur: 'verificateur' },
  { noeud_id: 'r4', nom_demonstration: 'simulation_cu2s', justifie_par: ['r5'], demonstration: 'La transition de Cu2S reproduit la chute de résistivité à 385 K.', validite: 'valide', confiance: 0.88, auteur: 'verificateur' },
  { noeud_id: 'r6', nom_demonstration: 'explication_alternative', justifie_par: ['r4'], demonstration: 'L’effet observé s’explique sans supraconductivité.', validite: 'valide', confiance: 0.9, auteur: 'verificateur' },
  { noeud_id: 'm1', nom_demonstration: 'phonons_dft', justifie_par: ['t1'], demonstration: 'Calcul DFT des phonons de Mg2IrH6 à 0 GPa.', validite: 'a_verifier', confiance: null, auteur: 'experimentateur' },
  { noeud_id: 'm2', nom_demonstration: 'neb', justifie_par: ['f3'], demonstration: 'Chemin de décomposition estimé par NEB sur deux composés seulement.', validite: 'invalide', confiance: 0.38, auteur: 'recours' },
  { noeud_id: 'm3', nom_demonstration: 'stabilite_cinetique', justifie_par: ['m1', 'm2'], demonstration: 'Stabilité dynamique et barrière élevée : la structure survit à la décompression.', validite: 'valide', confiance: 0.7, auteur: 'verificateur' },
  { noeud_id: 'p2', nom_demonstration: 'front_pareto', justifie_par: ['p1', 'f1', 'f3'], demonstration: 'Front de Pareto Tc / pression sur neuf ternaires.', validite: 'valide', confiance: 0.74, auteur: 'verificateur' },
  { noeud_id: 'q', nom_demonstration: 'synthese', justifie_par: ['c3', 'm3', 'p2', 'r2', 'r6'], demonstration: 'Aucune borne théorique, voie métastable ouverte, pression en baisse ; les contre-exemples annoncés sont écartés.', validite: 'valide', confiance: 0.66, auteur: 'orchestrateur' },
]

export const CATEGORIES = [
  { id: 'k1', titre: 'Mesures sous pression', couleur: '#2563eb', noeuds: ['f1', 'f2', 'f3', 'p1'] },
  { id: 'k2', titre: 'Théorie du couplage', couleur: '#7c3aed', noeuds: ['t1', 't2', 'c1', 'c2', 'c3'] },
  { id: 'k3', titre: 'Contre-exemples écartés', couleur: '#b45309', noeuds: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'] },
  { id: 'k4', titre: 'Voie métastable', couleur: '#0f766e', noeuds: ['m1', 'm2', 'm3', 'p2'] },
  { id: 'k5', titre: 'Conclusion', couleur: '#18181b', noeuds: ['q', 'h1'] },
]

export const STATUTS = {
  etabli: { libelle: 'Établi', couleur: '#15803d' },
  suspendu: { libelle: 'Suspendu', couleur: '#a16207' },
  a_verifier: { libelle: 'À vérifier', couleur: '#2563eb' },
  invalide: { libelle: 'Invalide', couleur: '#dc2626' },
  ouvert: { libelle: 'Ouvert', couleur: '#71717a' },
}

export const VALIDITES = {
  valide: { libelle: 'Valide', couleur: '#15803d' },
  a_verifier: { libelle: 'À vérifier', couleur: '#2563eb' },
  invalide: { libelle: 'Invalide', couleur: '#dc2626' },
}

// Port de atlas/graphe.py : un nœud est établi s'il est admis, ou s'il a une démonstration valide dont
// toutes les prémisses sont établies (propagation jusqu'au point fixe : un cycle ne s'auto-valide pas).
export function calculerStatuts(noeuds, demonstrations) {
  const parNoeud = new Map(noeuds.map((n) => [n.id, []]))
  for (const d of demonstrations) parNoeud.get(d.noeud_id)?.push(d)
  const etablis = new Set(noeuds.filter((n) => n.admis).map((n) => n.id))
  let change = true
  while (change) {
    change = false
    for (const n of noeuds) {
      if (etablis.has(n.id)) continue
      if (parNoeud.get(n.id).some((d) => d.validite === 'valide' && d.justifie_par.every((p) => etablis.has(p)))) {
        etablis.add(n.id)
        change = true
      }
    }
  }
  const statuts = {}
  for (const n of noeuds) {
    const demos = parNoeud.get(n.id)
    const validites = new Set(demos.map((d) => d.validite))
    statuts[n.id] = etablis.has(n.id) ? 'etabli'
      : validites.has('valide') ? 'suspendu'
        : validites.has('a_verifier') ? 'a_verifier'
          : demos.length ? 'invalide' : 'ouvert'
  }
  return statuts
}

// Copie profonde du jeu d'exemple, à modifier librement par un éditeur.
export function grapheInitial() {
  return structuredClone({ probleme: PROBLEME, noeuds: NOEUDS, demonstrations: DEMONSTRATIONS, categories: CATEGORIES })
}
