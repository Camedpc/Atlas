// Données synthétiques : l'utilisatrice, ses projets et leurs sessions (conversations), avec un fil factice.
// Les fichiers du bunker viennent de manifeste.js (voir bunker.js).

export const MAINTENANT = new Date('2026-09-26T18:00:00')

export const UTILISATRICE = { id: 'camille', nom: 'Camille Duparc', initiales: 'CD', courriel: 'camille@atlas.local' }

export const PROJETS = [
  {
    id: 'hydrures',
    nom: 'Supraconductivité des hydrures',
    court: 'Hydrures',
    description: 'Tc des hydrures riches en hydrogène sous pression : théorie d’Eliashberg contre mesures en cellule à enclumes.',
    cree: '2026-09-04',
    graphe: { noeuds: 64, etablis: 31, a_verifier: 22, invalides: 3, ouverts: 8 },
  },
  {
    id: 'rtsg',
    nom: 'Chute libre en RTSG',
    court: 'RTSG',
    description: 'Géodésiques radiales de Schwarzschild : temps propre, temps de coordonnée, limite newtonienne.',
    cree: '2026-08-27',
    graphe: { noeuds: 27, etablis: 19, a_verifier: 5, invalides: 0, ouverts: 3 },
  },
  {
    id: 'populations',
    nom: 'Dynamique des populations',
    court: 'Populations',
    description: 'Lotka–Volterra, logistique retardée et ajustement aux séries lynx–lièvres de la baie d’Hudson.',
    cree: '2026-08-17',
    graphe: { noeuds: 38, etablis: 24, a_verifier: 9, invalides: 1, ouverts: 4 },
  },
  {
    id: 'transport-optimal',
    nom: 'Transport optimal en imagerie',
    court: 'Transport optimal',
    description: 'Distances de Wasserstein et de Sinkhorn entre histogrammes d’images.',
    cree: '2026-08-06',
    graphe: { noeuds: 9, etablis: 6, a_verifier: 3, invalides: 0, ouverts: 0 },
  },
]

const f = (chemin) => chemin // lisibilité : chemins relatifs à la session

export const SESSIONS = [
  {
    id: 's-7f3a2c',
    projet: 'hydrures',
    titre: 'Tc de LaH10 sous pression',
    modifie: '2026-09-26T13:05',
    statut: 'terminee',
    messages: [
      { role: 'utilisateur', texte: 'Reproduis la courbe Tc(P) de LaH10 entre 140 et 220 GPa et dis-moi si Allen–Dynes suffit. Les mesures de Drozdov sont dans docs_session.' },
      { role: 'assistant', texte: 'Je confie deux missions : un directeur de labo pour le couplage électron-phonon, un second pour l’état de l’art expérimental. Le graphiste mettra ensuite les deux rapports en graphe.' },
      { role: 'agent', texte: 'directeur_de_labo · 01-couplage-electron-phonon démarré' },
      { role: 'agent', texte: 'directeur_de_labo · 02-revue-litterature démarré' },
      { role: 'agent', texte: 'directeur_de_labo · 02-revue-litterature terminé', fichier: f('directeurs/02-revue-litterature/rapport.md') },
      { role: 'agent', texte: 'directeur_de_labo · 01-couplage-electron-phonon terminé', fichier: f('directeurs/01-couplage-electron-phonon/rapport.md') },
      { role: 'agent', texte: 'graphiste · rapport 01 mis en graphe', fichier: f('graphe/rapport-01.graphe.json') },
      { role: 'outil', nom: 'verifier', resume: '3 démonstrations jugées : 2 valides, 1 à revoir' },
      { role: 'assistant', texte: 'Allen–Dynes reproduit la mesure à **8 %** près au-dessus de 170 GPa (μ* = 0,10). En dessous de 160 GPa, l’approximation harmonique surestime λ d’environ 30 % : la prédiction diverge.\n\nLa figure est dans `directeurs/01-couplage-electron-phonon/figures/tc-vs-pression.png`, le détail dans `directeurs/01-couplage-electron-phonon/rapport.md`.' },
    ],
  },
  {
    id: 's-2b9e41',
    projet: 'hydrures',
    titre: 'Allen–Dynes ou Eliashberg complet ?',
    modifie: '2026-09-25T17:00',
    statut: 'terminee',
    messages: [
      { role: 'utilisateur', texte: 'Dans quel régime de couplage la formule d’Allen–Dynes cesse-t-elle d’être fiable ?' },
      { role: 'assistant', texte: 'Un directeur compare les deux approches sur un spectre d’Einstein, puis le vérificateur juge les démonstrations.' },
      { role: 'agent', texte: 'directeur_de_labo · 01-formule-allen-dynes terminé', fichier: f('directeurs/01-formule-allen-dynes/rapport.md') },
      { role: 'outil', nom: 'verifier', resume: '3 démonstrations : 2 valides, 1 à revoir', fichier: f('verification/verdicts.md') },
      { role: 'assistant', texte: 'Au-delà de **λ ≈ 2,5**, l’écart dépasse 10 % ; il atteint 22 % pour λ = 4. Le schéma du cycle de calcul est dans `directeurs/01-formule-allen-dynes/figures/schema-eliashberg.svg`.' },
    ],
  },
  {
    id: 's-c0d8e5',
    projet: 'hydrures',
    titre: 'Hydrures ternaires à basse pression',
    modifie: '2026-09-21T10:55',
    statut: 'en_cours',
    messages: [
      { role: 'utilisateur', texte: 'Liste les ternaires La–X–H prédits stables sous 50 GPa.' },
      { role: 'assistant', texte: 'Un directeur de labo interroge la littérature ; les premiers candidats sont LaBeH8 et LaB2H8. Tableau provisoire : `directeurs/01-ternaires-la-x-h/candidats.csv`.' },
      { role: 'agent', texte: 'directeur_de_labo · 01-ternaires-la-x-h en cours', fichier: f('directeurs/01-ternaires-la-x-h/journal.md') },
    ],
  },
  {
    id: 's-41aa07',
    projet: 'rtsg',
    titre: 'Géodésiques radiales de Schwarzschild',
    modifie: '2026-09-26T13:00',
    statut: 'terminee',
    messages: [
      { role: 'utilisateur', texte: 'Combien de temps propre met un corps lâché au repos depuis r₀ = 10M pour atteindre l’horizon ?' },
      { role: 'agent', texte: 'directeur_de_labo · 01-temps-propre terminé', fichier: f('directeurs/01-temps-propre/rapport.md') },
      { role: 'assistant', texte: 'L’horizon est franchi à **τ ≈ 33,7 M** et la singularité atteinte à τ ≈ 35,1 M. Le temps de Schwarzschild, lui, diverge à l’horizon : voir `directeurs/01-temps-propre/figures/chute-radiale.png`.' },
    ],
  },
  {
    id: 's-9d02f3',
    projet: 'rtsg',
    titre: 'Écart au newtonien en champ faible',
    modifie: '2026-09-14T17:35',
    statut: 'terminee',
    messages: [
      { role: 'utilisateur', texte: 'À partir de quel rayon la chute en RTSG s’écarte-t-elle de plus de 1 % de la chute newtonienne ?' },
      { role: 'agent', texte: 'directeur_de_labo · 01-champ-faible terminé', fichier: f('directeurs/01-champ-faible/rapport.md') },
      { role: 'assistant', texte: 'L’écart relatif vaut environ 3M / 2r₀ : il dépasse 1 % pour **r₀ ≲ 150 M**. Détail dans `directeurs/01-champ-faible/rapport.md`.' },
    ],
  },
  {
    id: 's-5e71b0',
    projet: 'populations',
    titre: 'Stabilité du point fixe de Lotka–Volterra',
    modifie: '2026-09-24T18:20',
    statut: 'terminee',
    messages: [
      { role: 'utilisateur', texte: 'Le point fixe intérieur de Lotka–Volterra est-il stable ? Ajuste le modèle aux données d’Hudson du projet.' },
      { role: 'agent', texte: 'directeur_de_labo · 01-analyse-lineaire terminé', fichier: f('directeurs/01-analyse-lineaire/rapport.md') },
      { role: 'agent', texte: 'graphiste · rapport 01 mis en graphe', fichier: f('graphe/rapport-01.graphe.json') },
      { role: 'assistant', texte: 'Le point fixe est un **centre** (valeurs propres ±i√(αγ)) : stabilité neutre, pas asymptotique. La période ajustée est de 9,2 ans contre 10 observés. Portrait de phase : `directeurs/01-analyse-lineaire/figures/portrait-de-phase.png` ; export PDF : `directeurs/01-analyse-lineaire/rapport.pdf`.' },
    ],
  },
  {
    id: 's-a3f9c2',
    projet: 'populations',
    titre: 'Modèle logistique avec retard',
    modifie: '2026-09-18T10:20',
    statut: 'terminee',
    messages: [
      { role: 'utilisateur', texte: 'Pour l’équation de Hutchinson, à partir de quel retard apparaissent les oscillations ?' },
      { role: 'agent', texte: 'directeur_de_labo · 01-hutchinson terminé', fichier: f('directeurs/01-hutchinson/rapport.md') },
      { role: 'assistant', texte: 'Une bifurcation de Hopf se produit pour **rτ = π/2** : voir `directeurs/01-hutchinson/figures/bifurcation-hopf.png`.' },
    ],
  },
  {
    id: 's-e1c4d7',
    projet: 'transport-optimal',
    titre: 'Distance de Wasserstein entre histogrammes',
    modifie: '2026-09-05T17:45',
    statut: 'terminee',
    messages: [
      { role: 'utilisateur', texte: 'Explique pourquoi W1 entre histogrammes 1D se calcule par les fonctions de répartition.' },
      { role: 'agent', texte: 'directeur_de_labo · 01-wasserstein-1d terminé', fichier: f('directeurs/01-wasserstein-1d/rapport.md') },
      { role: 'assistant', texte: 'En dimension 1, le couplage monotone est optimal : W1 = ∫|Fμ − Fν|. Rapport : `directeurs/01-wasserstein-1d/rapport.md`, script : `scripts/wasserstein.py`.' },
    ],
  },
]

export const projet = (id) => PROJETS.find((p) => p.id === id)
export const session = (id) => SESSIONS.find((s) => s.id === id)
export const sessionsDu = (projetId) =>
  SESSIONS.filter((s) => s.projet === projetId).sort((a, b) => b.modifie.localeCompare(a.modifie))

/** Dernière activité d'un projet (date ISO de sa session la plus récente). */
export const derniereActivite = (projetId) => sessionsDu(projetId)[0]?.modifie ?? projet(projetId).cree

/** Groupe de date façon claude.ai / ChatGPT. */
export function groupeDate(iso) {
  const jour = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const ecart = Math.round((jour(MAINTENANT) - jour(new Date(iso))) / 86_400_000)
  if (ecart <= 0) return 'Aujourd’hui'
  if (ecart === 1) return 'Hier'
  if (ecart < 7) return '7 derniers jours'
  if (ecart < 30) return '30 derniers jours'
  return 'Plus anciennes'
}

/** « il y a 3 h », « hier », « 12 sept. » */
export function dateRelative(iso) {
  const d = new Date(iso)
  const minutes = Math.round((MAINTENANT - d) / 60_000)
  if (minutes < 60) return `il y a ${Math.max(1, minutes)} min`
  if (minutes < 60 * 24 && d.getDate() === MAINTENANT.getDate()) return `il y a ${Math.round(minutes / 60)} h`
  if (groupeDate(iso) === 'Hier') return 'hier'
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export const heure = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
export const dateLongue = (iso) =>
  new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
