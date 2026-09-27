// Jeu synthétique pour éprouver la vue à grande taille, en développement seulement (`?synthetique=1000`) : chapitres
// de 40 énoncés dans des cadres (un sous-cadre par chapitre), prémisses vers la gauche, formules Unicode et LaTeX.
// Quelques figures vectorielles (mesures, lois et bandes, échelles log) y sont jointes, et une scène 3D animée (le
// pendule de tests/donnees/pendule3d.py, produit par Atlas dans graphe-synthetique-scene.json). Lecture seule : rien
// n'est écrit en base.

import type { Demonstration, DocumentVue, FigureVue, Graphe, GroupeVue, LienDocumentVue, Noeud, PlacementVue, RolePremisse, SceneFigure, Statut, TypeNoeud, Vue } from './api'

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
  // Décisions (losanges) entre deux chapitres voisins, hors cadre : une branche = un cadre (le chapitre suivant, et
  // celui du dessous suivi en parallèle), et une option écartée qui vise un nœud.
  for (let k = 0; k + 1 < chapitres; k += 2) {
    if (k % parLigne === parLigne - 1) continue
    const id = `d${k}`
    const c0 = (k % parLigne) * 9, l0 = Math.floor(k / parLigne) * 9
    const dessous = k + 1 + parLigne < chapitres ? [`ch${k + 1 + parLigne}`] : []
    noeuds.push({
      projet_id: 'synthetique', id, nom: `Suite du chapitre ${k + 1}`, enonce: 'Décision synthétique.', admis: false,
      type: 'decision', parents: [], enfants: [], conversation_id: null, statut: 'etabli', demonstrations: [],
      details: {
        question: `Après le chapitre ${k + 1}, quel modèle ? On suit les deux.`,
        alternatives: [
          { libelle: 'Modèle stationnaire', retenue: true, groupes: [`ch${k + 1}`] },
          { libelle: 'Modèle transitoire', retenue: true, groupes: dessous },
          { libelle: 'Modèle microscopique', retenue: false, raison: 'Trop coûteux pour ce qu’il apporte.', noeuds: [`n${(k + 1) * parChapitre + 20}`] },
        ],
        raison: 'Les deux régimes se confrontent aux mêmes mesures.',
      },
    })
    placements.push({ noeud_id: id, groupe_id: null, colonne: c0 + 7, ligne: l0 + 7, largeur: 1, hauteur: 1, fixe: false })
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
  // Figures : une par chapitre sur trois, sous ses énoncés (3 × 2 cases), qui illustre son 11e énoncé.
  const figures: FigureVue[] = []
  for (let k = 0; k < chapitres; k += 3) {
    const noeud = `n${k * parChapitre + 10}`
    if (!parId.has(noeud)) continue
    const f = figureSynthetique(figures.length, noeud, r)
    figures.push(f)
    placements.push({
      noeud_id: `fig:${f.id}`, groupe_id: `ch${k}`, colonne: (k % parLigne) * 9, ligne: Math.floor(k / parLigne) * 9 + 6,
      largeur: 3, hauteur: 2, fixe: false,
    })
  }
  // Documents : un script, son dossier de résultats, un article, des données (dont une introuvable), au chapitre 1.
  const documents: DocumentVue[] = []
  const liens_documents: LienDocumentVue[] = []
  if (parId.has('n7') && figures[0]) {
    const doc = (id: string, chemin: string, genre: DocumentVue['genre'], apercu: DocumentVue['apercu'], colonne: number, ligne: number, present = true) => {
      documents.push({ id, chemin, genre, titre: id, description: null, apercu, present, modifie_le: '2026-09-28T00:00:00Z' })
      placements.push({ noeud_id: `doc:${id}`, groupe_id: 'ch0', colonne, ligne, largeur: 1, hauteur: 1, fixe: false })
    }
    doc('simulation', 'scripts_projet/double-pendule/simulation.py', 'fichier', {
      nature: 'script', lignes: 142, extrait: [
        '"""Double pendule : RK4, pas fixe."""', 'def derivees(etat, m1, m2, l1, l2, g):', '    t1, w1, t2, w2 = etat',
        '    d = t2 - t1', '    ...', 'def integrer(etat0, dt=1e-3, T=30):',
      ],
    }, 3, 6)
    doc('resultats', 'scripts_projet/double-pendule/resultats', 'dossier', {
      nature: 'dossier', entrees: ['trajectoire.gif', 'energie.png', 'energie.csv', 'trajectoire.csv', 'params.json'],
      autres: 3, fichiers: 9, dossiers: 0,
    }, 4, 6)
    doc('shinbrot', 'doc_projet/sources/shinbrot-1992.pdf', 'fichier', {
      nature: 'document', pages: 12, titre_pdf: 'Chaos in a double pendulum',
    }, 3, 7)
    doc('mesures', 'scripts_projet/double-pendule/mesures.csv', 'fichier', { nature: 'donnees', colonnes: ['t', 'theta1'] }, 4, 7, false)
    liens_documents.push(
      { de: 'n7', vers: 'doc:simulation', relation: 'implemente' },
      { de: 'doc:simulation', vers: 'doc:resultats', relation: 'ecrit_dans' },
      { de: 'doc:simulation', vers: `fig:${figures[0].id}`, relation: 'produit' },
      { de: 'doc:shinbrot', vers: 'doc:mesures', relation: 'source' },
    )
  }
  // Scène 3D : à droite de la première figure et des documents, dans le premier chapitre.
  if (parId.has('n10')) {
    figures.push({
      id: 'synth_3d', noeud_id: 'n10', titre: 'Pendule simple, $\\theta_0 = 1$ rad (une période)',
      legende: 'Pendule non linéaire intégré par RK4, joué en boucle.', trace: null, image: false,
      image_largeur: null, image_hauteur: null, scene: true, source: 'tests/donnees/pendule3d.py',
      fichier: null, modifie_le: '2026-09-27T00:00:00Z',
    })
    placements.push({ noeud_id: 'fig:synth_3d', groupe_id: 'ch0', colonne: 5, ligne: 6, largeur: 2, hauteur: 2, fixe: false })
  }
  return { graphe: { noeuds, aretes }, vue: { groupes, placements, etiquettes: [], marques: [], figures, documents, liens_documents } }
}

/** Scène de la figure 3D du jeu synthétique. Pour la refaire après un changement du format : voir
 * tests/donnees/pendule3d.py, exécuté par atlas/orchestrateur/figure3d.py (produire, puis figures3d.serialiser). */
export async function sceneSynthetique(): Promise<SceneFigure> {
  return (await import('./graphe-synthetique-scene.json')).default as unknown as SceneFigure
}

/** Figure vectorielle synthétique, de quatre sortes : chute (loi et bande), loi de puissance (log-log), deux séries
 * de mesures et une simulation, décroissance (y en log). */
function figureSynthetique(i: number, noeud: string, r: () => number): FigureVue {
  const bruit = () => (r() - 0.5) * 2
  const base = { id: `synth_${i}`, noeud_id: noeud, image: false, image_largeur: null, image_hauteur: null, modifie_le: '2026-09-27T00:00:00Z' }
  const pas = (a: number, b: number, n: number) => Array.from({ length: n }, (_, k) => a + ((b - a) * k) / (n - 1))
  switch (i % 4) {
    case 0: {
      const vl = 7.4, s = 0.35
      const v = (t: number, u: number) => u * Math.tanh((9.81 * t) / u)
      return {
        ...base, titre: 'Vitesse de chute d’un filtre à café',
        legende: 'Vitesse $v$ en fonction du temps $t$ ; trait plein : $v = v_\\ell \\tanh(g t / v_\\ell)$ avec $v_\\ell = 7{,}4 \\pm 0{,}35$ m/s, aplat : ±1σ.',
        source: 'docs_session/chute.csv',
        trace: {
          x: { titre: '$t$', unite: 's', echelle: 'lin', min: 0 },
          y: { titre: '$v$', unite: 'm·s⁻¹', echelle: 'lin', min: 0 },
          series: [
            { genre: 'mesures', nom: 'Chronophotographie', points: pas(0.1, 2, 12).map((t) => [t, v(t, vl) + bruit() * 0.25, 0.3]) },
            {
              genre: 'loi', nom: 'Prédiction', expression: 'v_l*tanh(g*x/v_l)', variable: 'x',
              parametres: { v_l: { valeur: vl, incertitude: s }, g: { valeur: 9.81 } }, de: 0, a: 2.1,
              points: pas(0, 2.1, 60).map((t) => [t, v(t, vl)]),
              bande: pas(0, 2.1, 60).map((t) => [t, v(t, vl - s), v(t, vl + s)]),
            },
          ],
        },
      }
    }
    case 1: {
      const loi = (x: number) => 2.1 * x ** 1.5
      return {
        ...base, titre: 'Période orbitale et demi-grand axe',
        legende: 'Troisième loi de Kepler : $T \\propto a^{3/2}$ (échelles logarithmiques).', source: null,
        trace: {
          x: { titre: '$a$', unite: 'UA', echelle: 'log' },
          y: { titre: '$T$', unite: 'an', echelle: 'log' },
          series: [
            { genre: 'mesures', nom: 'Planètes', points: [0.39, 0.72, 1, 1.52, 5.2, 9.54, 19.2, 30.1].map((a) => [a, loi(a) * (1 + bruit() * 0.08), loi(a) * 0.1, a * 0.05]) },
            {
              genre: 'loi', nom: '$T = k\\,a^{3/2}$', expression: 'k*x^1.5', variable: 'x', parametres: { k: { valeur: 2.1, incertitude: 0.15 } },
              points: pas(-0.5, 1.55, 40).map((l) => [10 ** l, loi(10 ** l)]),
              bande: pas(-0.5, 1.55, 40).map((l) => [10 ** l, 1.95 * 10 ** (1.5 * l), 2.25 * 10 ** (1.5 * l)]),
            },
          ],
        },
      }
    }
    case 2:
      return {
        ...base, titre: 'Hauteur de la fontaine de chaînette',
        legende: 'Deux séries de mesures et la simulation numérique ; la hauteur croît comme $v^2$.', source: 'scripts/simulation.py',
        trace: {
          x: { titre: '$v^2$', unite: 'm²·s⁻²', echelle: 'lin' },
          y: { titre: '$h_2$', unite: 'cm', echelle: 'lin' },
          series: [
            { genre: 'mesures', nom: 'Série A', points: pas(4, 30, 9).map((x) => [x, 0.52 * x + bruit() * 0.9, 0.8]) },
            { genre: 'mesures', nom: 'Série B', points: pas(6, 32, 8).map((x) => [x, 0.49 * x + bruit() * 1.1, 1, 0.6]) },
            { genre: 'courbe', nom: 'Simulation', points: pas(0, 34, 30).map((x) => [x, 0.5 * x + 0.02 * x * Math.sin(x / 3)]) },
          ],
        },
      }
    default:
      return {
        ...base, titre: 'Décroissance de l’activité',
        legende: 'Activité $A(t) = A_0 e^{-t/\\tau}$, $\\tau = 12{,}3$ h.', source: null,
        trace: {
          x: { titre: '$t$', unite: 'h', echelle: 'lin', min: 0, max: 60 },
          y: { titre: '$A$', unite: 'Bq', echelle: 'log' },
          series: [
            { genre: 'mesures', nom: 'Compteur', points: pas(2, 56, 10).map((t) => [t, 12000 * Math.exp(-t / 12.3) * (1 + bruit() * 0.1), 12000 * Math.exp(-t / 12.3) * 0.08]) },
            {
              genre: 'loi', nom: 'Ajustement', expression: 'A0*exp(-x/tau)', variable: 'x', parametres: { A0: { valeur: 12000 }, tau: { valeur: 12.3, incertitude: 0.6 } },
              points: pas(0, 60, 50).map((t) => [t, 12000 * Math.exp(-t / 12.3)]),
              bande: pas(0, 60, 50).map((t) => [t, 12000 * Math.exp(-t / 11.7), 12000 * Math.exp(-t / 12.9)]),
            },
          ],
        },
      }
  }
}
