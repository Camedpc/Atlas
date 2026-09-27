// V4 · Instrument : le graphe lu comme un instrument de mesure (viewport Blender + logiciel
// scientifique). Faces du cube, grilles et règles graduées sémantiques (dates, couloirs de type,
// bandes thématiques, secteurs), réticule de lecture, symboles de statut, barres d'erreur,
// en-tête de viewport, N-panel à onglets, regroupement par catégories ou par cases.

import {
  creerVue, el, rgb, rgbaGL, melangerCouleurs, barreStatuts, statistiquesCategorie, genererJeuSynthetique,
  LIBELLES_ORIGINE, LIBELLES_STATUT, LIBELLES_TYPE, LIBELLES_VALIDATION, NOMS_DISPOSITIONS, NOMS_NIVEAUX, TYPES_NOEUD, VALIDATIONS,
  COURBES, type ContexteDessin, type Courbe, type DefinitionReglage, type NomVue, type Quat, type ReducteurNoeud, type Vec3, type VueGraphe,
} from '../../src/core'
import { dessinerEtenduesInstrument } from './etendues'
import { BORNES, versions, dessinerGrilles, dessinerRegles, dessinerReticule, etat, lireVar, viderCacheReticule } from './axes'
import { donneesParCases, placerCases, type OrdreCases, type PasCases } from './cases'
import { dessinerBarresErreur } from './confiance'
import { dateIso, Echelles, JOUR } from './echelles'
import { construireEntete, construireSurimpression, MenuRadialInstrument, type Pilote } from './entete'
import { construireNPanel, type NPanel, type Onglet } from './npanel'
import { PARAMS_FORME, ProgrammeForme } from './programme-forme'
import meta from './meta.json'

const CLE_STOCKAGE = `atlas-graphe3d:${meta.id}`
const JEU = genererJeuSynthetique()
const ECH = new Echelles(JEU)

// ─── Réglages propres ────────────────────────────────────────────────────────

const D = {
  grille: 'Instrument · grille',
  grad: 'Instrument · graduations',
  ret: 'Instrument · réticule',
  conf: 'Instrument · confiance',
  sym: 'Instrument · symboles',
  agr: 'Instrument · agrégation',
  tr: 'Instrument · transitions',
}
const REGLAGES: DefinitionReglage[] = [
  { cle: 'grille', defaut: true, dossier: D.grille, libelle: 'grilles des faces' },
  { cle: 'facesTeintees', defaut: true, dossier: D.grille, libelle: 'faces teintées' },
  { cle: 'opaciteGrille', defaut: 1, dossier: D.grille, libelle: 'opacité', min: 0, max: 2, pas: 0.05 },
  { cle: 'densiteGrille', defaut: 1, dossier: D.grille, libelle: 'densité', min: 0.3, max: 3, pas: 0.05 },
  { cle: 'densiteAuto', defaut: true, dossier: D.grille, libelle: 'densité auto (faces de biais)' },
  { cle: 'axesOrigine', defaut: true, dossier: D.grille, libelle: "axes d'origine (sol)" },
  { cle: 'secteurs', defaut: true, dossier: D.grille, libelle: 'secteurs (dessus)' },
  { cle: 'graduations', defaut: true, dossier: D.grad, libelle: 'règles graduées' },
  { cle: 'regleEcran', defaut: true, dossier: D.grad, libelle: 'collées au bord' },
  { cle: 'opaciteBandeau', defaut: 0.6, dossier: D.grad, libelle: 'bandeau collé (opacité)', min: 0, max: 1, pas: 0.05 },
  { cle: 'recadrerPanneau', defaut: true, dossier: D.grad, libelle: 'recadrer à l’ouverture du panneau' },
  { cle: 'policeGraduations', defaut: 10.5, dossier: D.grad, libelle: 'taille police', min: 8, max: 15, pas: 0.5 },
  { cle: 'longueurGraduations', defaut: 5, dossier: D.grad, libelle: 'longueur traits', min: 2, max: 14, pas: 0.5 },
  { cle: 'reticule', defaut: true, dossier: D.ret, libelle: 'réticule' },
  { cle: 'tailleReticule', defaut: 5, dossier: D.ret, libelle: 'écart mire (px)', min: 0, max: 20, pas: 0.5 },
  { cle: 'pastillesReticule', defaut: true, dossier: D.ret, libelle: 'valeurs sur les axes' },
  { cle: 'crochetsAgregat', defaut: true, dossier: D.ret, libelle: "étendue d'un agrégat" },
  { cle: 'barresErreur', defaut: 'verticales', dossier: D.conf, libelle: "barres d'erreur", options: { verticales: 'verticales', horizontales: 'horizontales', croix: 'croix', aucune: 'aucune' } },
  { cle: 'longueurBarres', defaut: 42, dossier: D.conf, libelle: 'px par unité', min: 0, max: 160, pas: 1 },
  { cle: 'buteeBarres', defaut: 2.5, dossier: D.conf, libelle: 'butées (px)', min: 0, max: 8, pas: 0.25 },
  { cle: 'epaisseurBarres', defaut: 1, dossier: D.conf, libelle: 'épaisseur', min: 0.5, max: 3, pas: 0.1 },
  { cle: 'opaciteBarres', defaut: 0.7, dossier: D.conf, libelle: 'opacité', min: 0, max: 1, pas: 0.01 },
  { cle: 'etenduesPeriode', defaut: true, dossier: D.conf, libelle: 'étendue des agrégats (face / droite)' },
  { cle: 'barresAgregats', defaut: true, dossier: D.conf, libelle: 'sur les agrégats' },
  { cle: 'nbLibelles', defaut: 14, dossier: D.sym, libelle: 'libellés (N plus importants)', min: 0, max: 120, pas: 1 },
  { cle: 'tailleSymbole', defaut: 1.45, dossier: D.sym, libelle: 'taille symboles', min: 0.4, max: 3, pas: 0.05 },
  { cle: 'tailleSymboleAgregat', defaut: 1, dossier: D.sym, libelle: 'taille agrégats', min: 0.3, max: 3, pas: 0.05 },
  { cle: 'indicateurValidation', defaut: 0.34, dossier: D.sym, libelle: 'indicateur validation', min: 0, max: 0.6, pas: 0.01 },
  { cle: 'contourSymbole', defaut: 0.16, dossier: D.sym, libelle: 'contour (fond)', min: 0, max: 0.5, pas: 0.01 },
  { cle: 'regroupement', defaut: 'categories', dossier: D.agr, libelle: 'regroupement', options: { 'catégories thématiques': 'categories', 'cases période × type': 'cases' } },
  { cle: 'pasCases', defaut: 'mois', dossier: D.agr, libelle: 'pas des cases', options: { mois: 'mois', quinzaine: 'quinzaine', semaine: 'semaine' } },
  { cle: 'ordreCases', defaut: 'periode', dossier: D.agr, libelle: 'ordre', options: { 'période › type': 'periode', 'type › période': 'type' } },
  { cle: 'courbeExpo', defaut: true, dossier: D.tr, libelle: 'sortie exponentielle' },
  { cle: 'forceExpo', defaut: 9, dossier: D.tr, libelle: 'raideur', min: 3, max: 16, pas: 0.5 },
]

/** Lecture directe du stockage (avant de créer la vue, pour choisir les données). */
function stocke(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(CLE_STOCKAGE) ?? '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}
function ecrireStocke(valeurs: Record<string, unknown>): void {
  try {
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify({ ...stocke(), ...valeurs }))
  } catch {
    // stockage indisponible : ignoré
  }
}

// ─── Transitions : ease-out-expo ─────────────────────────────────────────────

function sortieExpo(k: number): Courbe {
  const norme = 1 - Math.pow(2, -k)
  return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : (1 - Math.pow(2, -k * t)) / norme)
}

// ─── Symboles (réducteur) ────────────────────────────────────────────────────

const FORME_STATUT = { valide: 0, incertain: 1, refute: 2 } as const
const CODE_VALIDATION = { aucune: 0, ia: 1, humain: 2, ia_humain: 3 } as const
/** Objet réutilisé (copié par le moteur à chaque appel). */
const EXTRA = { forme: 0, validation: 0, couleurBordure: '', tailleBordure: 0, compte: 0 }

function creerReducteur(regroupement: 'categories' | 'cases', couleurs: (vue: VueGraphe) => Map<number, string>): ReducteurNoeud {
  return (info, a, vue) => {
    const R = vue.reglages.valeurs
    a.type = 'forme'
    const pal = vue.palette
    if (info.estAgregat) {
      EXTRA.forme = regroupement === 'cases' ? 4 : 3
      EXTRA.validation = 0
      EXTRA.compte = info.nbFeuilles
      a.taille *= R.tailleSymboleAgregat as number
      if (regroupement === 'cases') a.couleur = couleurs(vue).get(info.unite) ?? a.couleur
    } else {
      const n = info.noeud!
      EXTRA.forme = FORME_STATUT[n.statut]
      EXTRA.validation = CODE_VALIDATION[n.validation]
      EXTRA.compte = 0
      a.taille *= R.tailleSymbole as number
    }
    // Libellés : seulement les N unités visibles les plus importantes, plus survol et lignée.
    if (a.libelle !== null && !a.forceLibelle && !LIBELLES_RETENUS.has(info.unite)) {
      const lignee = info.lignee === 'selection' || info.lignee === 'ancetre'
      if (!lignee && info.survol !== 'voisin') a.libelle = null
    }
    if (a.surligne || info.survol === 'survole') {
      EXTRA.couleurBordure = rgbaGL(info.survol === 'survole' && !a.surligne ? pal.accent : a.couleurBordure, Math.max(a.opacite, 0.9))
      EXTRA.tailleBordure = 0.3
    } else {
      EXTRA.couleurBordure = rgbaGL(pal.fond, a.opacite)
      EXTRA.tailleBordure = R.contourSymbole as number
    }
    EXTRA.tailleBordure *= info.estAgregat ? 0.5 : 1
    a.extra = EXTRA
  }
}

// ─── Libellés (calque sigma) ─────────────────────────────────────────────────

/** Unités dont le libellé est affiché d'office (recalculé quand la granularité ou les filtres changent). */
const LIBELLES_RETENUS = new Set<number>()
function choisirLibelles(vue: VueGraphe): void {
  LIBELLES_RETENUS.clear()
  const N = vue.reglages.valeurs.nbLibelles as number
  if (N <= 0) return
  const { h, granularite: g } = vue
  const candidats: [number, number][] = []
  for (let u = 0; u < h.nU; u++) {
    if (g.alpha[u]! < 0.5) continue
    if (u < h.nF) {
      if (!vue.filtres.actives[u]) continue
      candidats.push([u, h.importance[u]!])
    } else {
      const c = u - h.nF
      // Agrégats : effectif (prioritaires sur les feuilles, le poids est gonflé).
      candidats.push([u, 1e6 + g.nbActives[c]!])
    }
  }
  candidats.sort((a, b) => b[1] - a[1])
  for (let i = 0; i < Math.min(N, candidats.length); i++) LIBELLES_RETENUS.add(candidats[i]![0])
}

let vueActive: VueGraphe | null = null

interface DonneesLibelle {
  x: number
  y: number
  size: number
  label: string | null
  estAgregat?: boolean
  opaciteLibelle?: number
  compte?: number
}

function dessinerLibelle(ctx: CanvasRenderingContext2D, data: DonneesLibelle): void {
  const v = vueActive
  if (!v || !data.label) return
  const pal = v.palette
  const base = v.reglages.valeurs.tailleLibelle
  const mono = lireVar(v, '--police-mono', 'ui-monospace, monospace')
  ctx.save()
  ctx.globalAlpha = data.opaciteLibelle ?? 1
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3.5
  ctx.strokeStyle = pal.fond
  if (data.estAgregat) {
    const y = data.y + data.size + 4
    ctx.font = `600 ${base}px ${pal.police}`
    const compte = data.compte ? ` ${data.compte}` : ''
    const l1 = ctx.measureText(data.label).width
    ctx.font = `500 ${base - 2}px ${mono}`
    const l2 = ctx.measureText(compte).width
    const x0 = data.x - (l1 + l2) / 2
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.font = `600 ${base}px ${pal.police}`
    ctx.strokeText(data.label, x0, y)
    ctx.fillStyle = pal.texte
    ctx.fillText(data.label, x0, y)
    if (compte) {
      ctx.font = `500 ${base - 2}px ${mono}`
      ctx.strokeText(compte, x0 + l1, y + 1.5)
      ctx.fillStyle = pal.texteDoux
      ctx.fillText(compte, x0 + l1, y + 1.5)
    }
  } else {
    ctx.font = `450 ${base - 1}px ${pal.police}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const x = data.x + data.size + 5
    ctx.strokeText(data.label, x, data.y)
    ctx.fillStyle = pal.texteDoux
    ctx.fillText(data.label, x, data.y)
  }
  ctx.restore()
}

// ─── Fiche technique de survol ──────────────────────────────────────────────

function iconeStatut(vue: VueGraphe, statut: keyof typeof FORME_STATUT): string {
  const c = vue.palette.statut[statut]
  if (statut === 'valide') return `<circle r="5" fill="${c}"/>`
  if (statut === 'incertain') return `<circle r="5" fill="${c}" fill-opacity=".16"/><circle r="4.3" fill="none" stroke="${c}" stroke-width="1.5"/><path d="M0,-3.4 A3.4,3.4 0 0,0 0,3.4 Z" fill="${c}"/>`
  return `<path d="M-4,-4 L4,4 M4,-4 L-4,4" stroke="${c}" stroke-width="2.6"/>`
}

function svgEl(contenu: string, l = 14, h = 14, vb = '-7 -7 14 14'): HTMLElement {
  const s = el('span', { class: 'v4-fiche-icone' })
  s.innerHTML = `<svg width="${l}" height="${h}" viewBox="${vb}">${contenu}</svg>`
  return s
}

/** Échelle 0…1 avec l'intervalle, l'estimation et des graduations (barre d'erreur horizontale). */
function echelleConfiance(vue: VueGraphe, bas: number, est: number, haut: number, couleur: string): HTMLElement {
  const W = 176, x = (v: number) => 4 + v * (W - 8)
  const texte = vue.palette.texteDoux
  let g = ''
  for (let k = 0; k <= 10; k++) g += `<line x1="${x(k / 10)}" x2="${x(k / 10)}" y1="${k % 5 ? 13 : 11}" y2="15" stroke="${texte}" stroke-opacity=".6"/>`
  const s = `<line x1="${x(0)}" x2="${x(1)}" y1="15" y2="15" stroke="${texte}" stroke-opacity=".6"/>${g}
    <rect x="${x(bas)}" y="4" width="${Math.max(1, x(haut) - x(bas))}" height="6" rx="1" fill="${couleur}" fill-opacity=".22"/>
    <line x1="${x(bas)}" x2="${x(haut)}" y1="7" y2="7" stroke="${couleur}" stroke-width="1.4"/>
    <line x1="${x(bas)}" x2="${x(bas)}" y1="3" y2="11" stroke="${couleur}" stroke-width="1.4"/>
    <line x1="${x(haut)}" x2="${x(haut)}" y1="3" y2="11" stroke="${couleur}" stroke-width="1.4"/>
    <circle cx="${x(est)}" cy="7" r="3" fill="${couleur}" stroke="${vue.palette.fond}" stroke-width="1"/>`
  const e = el('span', { class: 'v4-echelle-conf' })
  e.innerHTML = `<svg width="${W}" height="18" viewBox="0 0 ${W} 18">${s}</svg>`
  return e
}

function rendreFiche(u: number, vue: VueGraphe): HTMLElement {
  const h = vue.h
  const ligne = (cle: string, ...valeur: (Node | string | null)[]) => [el('dt', {}, cle), el('dd', {}, ...valeur)]
  const mono = (t: string) => el('span', { class: 'v4-mono' }, t)
  const x = vue.positions[u * 3]!, y = vue.positions[u * 3 + 1]!, z = vue.positions[u * 3 + 2]!
  const n = h.noeudDe(u)
  if (n) {
    const couleur = vue.palette.statut[n.statut]
    const theme = ECH.h.noeuds[u]!.categorie
    return el('div', { class: 'v4-fiche' },
      el('div', { class: 'v4-fiche-titre' }, svgEl(iconeStatut(vue, n.statut)), el('span', {}, n.nom)),
      el('div', { class: 'v4-fiche-chemin' }, theme.join(' › ')),
      el('dl', { class: 'v4-fiche-table' },
        ...ligne('id', mono(n.id)),
        ...ligne('type', `${LIBELLES_TYPE[n.type]} · ${LIBELLES_ORIGINE[n.origine]}`),
        ...ligne('créé', mono(dateIso(h.dates[u]!)), el('small', {}, ` session ${n.session}`)),
        ...ligne('statut', el('b', { style: `color:${couleur}` }, LIBELLES_STATUT[n.statut])),
        ...ligne('validé', LIBELLES_VALIDATION[n.validation]),
        ...ligne('conf.', mono(`${n.confiance.estimation.toFixed(2)} [${n.confiance.bas.toFixed(2)} ; ${n.confiance.haut.toFixed(2)}]`)),
      ),
      echelleConfiance(vue, n.confiance.bas, n.confiance.estimation, n.confiance.haut, couleur),
      el('dl', { class: 'v4-fiche-table' },
        ...ligne('liens', mono(`${h.premisses[u]!.length}`), ' prémisse(s) · ', mono(`${h.importance[u]}`), ' descendant(s)'),
        ...ligne('xyz', mono(`${fmt(x)}  ${fmt(y)}  ${fmt(z)}`)),
      ),
      el('div', { class: 'v4-fiche-aide' }, 'clic : lignée · double-clic : cadrer les voisins'),
    )
  }
  const c = h.categorieDe(u)!
  const s = statistiquesCategorie(h, c.index, vue.filtres.actives)
  // Moyenne et écart-type des estimations.
  let m = 0, m2 = 0, k = 0
  for (const f of c.feuilles) {
    if (!vue.filtres.actives[f]) continue
    const e = h.noeuds[f]!.confiance.estimation
    m += e
    m2 += e * e
    k++
  }
  const moyenne = k ? m / k : 0
  const ecart = k ? Math.sqrt(Math.max(0, m2 / k - moyenne * moyenne)) : 0
  const types = TYPES_NOEUD.map((t) => [t, s.types[t]] as const).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3)
  const couleur = vue.palette.domaines[c.domaine % vue.palette.domaines.length]!
  const niveaux = etatMontage?.nomsNiveaux ?? NOMS_NIVEAUX
  return el('div', { class: 'v4-fiche' },
    el('div', { class: 'v4-fiche-titre' }, svgEl(etatMontage?.regroupement === 'cases'
      ? `<rect x="-5" y="-5" width="10" height="10" fill="${couleur}" fill-opacity=".18" stroke="${couleur}" stroke-width="1.4"/>`
      : `<circle r="5.2" fill="${couleur}" fill-opacity=".18" stroke="${couleur}" stroke-width="1.3"/><circle r="1.2" fill="${couleur}"/>`), el('span', {}, c.nom)),
    el('div', { class: 'v4-fiche-chemin' }, `${niveaux[c.niveau]} · ${c.chemin.slice(0, -1).join(' › ') || 'racine'}`),
    el('div', { class: 'v4-fiche-compte' }, el('span', { class: 'v4-mono v4-grand' }, `n = ${s.nbActives}`), s.nbActives !== s.nb ? el('small', {}, ` sur ${s.nb}`) : null),
    barreStatuts(vue, s.statuts),
    s.nbActives ? el('dl', { class: 'v4-fiche-table' },
      ...ligne('période', mono(`${dateIso(s.dateMin, false)} → ${dateIso(s.dateMax, false)}`), el('small', {}, ` ${Math.round((s.dateMax - s.dateMin) / JOUR)} j`)),
      ...ligne('conf.', mono(`μ ${moyenne.toFixed(2)} ± ${ecart.toFixed(2)}`)),
      ...ligne('types', types.map(([t, v]) => `${LIBELLES_TYPE[t]} ${Math.round((100 * v) / s.nbActives)} %`).join(' · ')),
      ...ligne('valid.', VALIDATIONS.filter((v) => s.validations[v]).map((v) => `${LIBELLES_VALIDATION[v]} ${s.validations[v]}`).join(' · ')),
    ) : null,
    s.principales.length ? el('div', { class: 'v4-fiche-principaux' }, el('span', {}, 'principaux'), el('ol', {}, s.principales.slice(0, 3).map((f) => el('li', {}, h.noeuds[f]!.nom)))) : null,
    el('div', { class: 'v4-fiche-aide' }, 'double-clic : ouvrir · Alt + double-clic : replier'),
  )
}

const fmt = (v: number) => (v >= 0 ? ' ' : '') + v.toFixed(3)

// ─── Montage (recréé quand le regroupement change) ──────────────────────────

interface EtatConserve {
  orientation: Quat
  cible: Vec3
  distance: number
  modeCamera: 'auto' | 'ortho' | 'persp'
  mode: '2d' | '3d'
  granularite: number
  selection: number | null
  panneau: Onglet | null
}

interface Montage {
  vue: VueGraphe
  regroupement: 'categories' | 'cases'
  nomsNiveaux: readonly string[]
  npanel: NPanel
  detruire: () => void
}

let etatMontage: Montage | null = null
const app = document.getElementById('app')!

function nomsNiveaux(regroupement: string, ordre: string): readonly string[] {
  if (regroupement !== 'cases') return NOMS_NIVEAUX
  return ordre === 'type'
    ? ['Types', 'Type × période', 'Type × période × origine', 'Nœuds']
    : ['Périodes', 'Période × type', 'Période × type × origine', 'Nœuds']
}

function monter(conserve?: EtatConserve): Montage {
  viderCacheReticule()
  vueActive = null
  const memo = stocke()
  const regroupement = memo.regroupement === 'cases' ? 'cases' : 'categories'
  const pas = (memo.pasCases as PasCases) ?? 'mois'
  const ordre = (memo.ordreCases as OrdreCases) ?? 'periode'
  const donnees = regroupement === 'cases' ? donneesParCases(JEU, pas, ordre) : JEU
  const niveaux = nomsNiveaux(regroupement, ordre)

  // Couleurs des cases : rampe séquentielle par période (ordre chronologique), sinon par type.
  let cacheCouleurs: { theme: string; m: Map<number, string> } | null = null
  const couleursCases = (v: VueGraphe) => {
    const theme = v.reglages.valeurs.theme
    if (cacheCouleurs?.theme === theme) return cacheCouleurs.m
    const m = new Map<number, string>()
    const racines = v.h.domaines.length
    const clair = lireVar(v, '--rampe-debut', '#9fb3dd'), fonce = lireVar(v, '--rampe-fin', '#1d3b8f')
    for (const c of v.h.categories) {
      const t = racines > 1 ? c.domaine / (racines - 1) : 0
      m.set(c.unite, ordre === 'periode' ? melangerCouleurs(clair, fonce, Math.round(t * 12) / 12) : v.palette.domaines[c.domaine % v.palette.domaines.length]!)
    }
    cacheCouleurs = { theme, m }
    return m
  }

  const vue = creerVue(app, {
    id: meta.id,
    donnees,
    mode: conserve?.mode ?? '3d',
    vueInitiale: 'face' as NomVue,
    granularite: conserve?.granularite ?? 2,
    reglages: { dureeTransition: 380, dureeVues: 340, tailleNoeud: 3.4, opaciteAretes: 0.2, nettete: 5, densiteLibelles: 0.45, tailleLibelle: 11.5, etendues: 'aucune' },
    // Étendues : dessinées par l'instrument (barres d'erreur de période), pas par la capsule du moteur.
    etenduesParDefaut: false,
    // Zone sûre : place des libellés de la règle Z à gauche et de la règle X en bas.
    margesSures: { gauche: 150, bas: 34, haut: 26, droite: 70 },
    reglagesSupplementaires: REGLAGES,
    reducteursNoeud: [creerReducteur(regroupement, couleursCases)],
    dessinerDessous: (c: ContexteDessin) => {
      dessinerGrilles(c, ECH)
      dessinerEtenduesInstrument(c, ECH, (u) =>
        regroupement === 'cases' ? couleursCases(c.vue).get(u) ?? c.vue.palette.texteDoux : c.vue.palette.domaines[c.vue.h.domaine(u) % c.vue.palette.domaines.length]!)
      dessinerBarresErreur(c)
    },
    dessinerDessus: (c: ContexteDessin) => {
      dessinerRegles(c, ECH)
      dessinerReticule(c, ECH)
    },
    rendreFiche: (u, v) => rendreFiche(u, v),
    programmesNoeud: { forme: ProgrammeForme as never },
    reglagesSigma: {
      defaultDrawNodeLabel: dessinerLibelle as never,
      defaultDrawNodeHover: (() => {}) as never,
    },
    ui: { panneau: true, panneauOuvert: false, histogramme: true, granularite: false, gizmo: true, reglages: true, barreVues: false, fiche: true },
  })
  vueActive = vue
  vue.racine.classList.add('v4')

  // Cases : les feuilles gardent les positions thématiques d'origine.
  if (regroupement === 'cases') {
    for (const nom of NOMS_DISPOSITIONS) vue.remplacerDisposition(nom, ECH.dispositions[nom])
    // … et chaque case va à la coordonnée de son intervalle (période × couloir).
    placerCases(vue.h, vue.dispositions, pas, ordre, (t) => ECH.dateVersX(t))
    vue.on('filtres', () => placerCases(vue.h, vue.dispositions, pas, ordre, (t) => ECH.dateVersX(t)))
  }

  // Transitions nettes : ease-out-expo pour la granularité et pour la caméra.
  const appliquerCourbe = () => {
    const R = vue.reglages.valeurs
    vue.courbePerso = R.courbeExpo ? sortieExpo(R.forceExpo as number) : null
    // Caméra : même courbe (API du moteur), sinon celle du réglage « courbeVues ».
    vue.camera.courbeAnimations = R.courbeExpo ? sortieExpo(R.forceExpo as number) : (COURBES[R.courbeVues] ?? COURBES.sortie)
    vue.granularite.version++
  }
  appliquerCourbe()

  // Symboles : couleurs de validation (uniformes WebGL) et taille de l'indicateur.
  const appliquerSymboles = () => {
    const c = (s: string): [number, number, number, number] => {
      const [r, g, b] = rgb(s)
      return [r / 255, g / 255, b / 255, 1]
    }
    PARAMS_FORME.couleurIA = c(vue.palette.validation.ia)
    PARAMS_FORME.couleurHumain = c(vue.palette.validation.humain)
    PARAMS_FORME.rayonIndicateur = vue.reglages.valeurs.indicateurValidation as number
  }
  appliquerSymboles()

  // Menu radial de l'instrument à la place de celui du moteur.
  vue.ui.menu?.element.remove()
  vue.ui.menu = new MenuRadialInstrument(vue.interface, vue)

  const pilote: Pilote = {
    vue,
    ech: ECH,
    regroupement,
    nomsNiveaux: niveaux,
    basculerPanneau: (o) => npanel.basculer(o),
    panneauOuvert: () => npanel.ouvert(),
    changerRegroupement: (m) => {
      if (m !== regroupement) vue.reglages.definir('regroupement', m)
    },
  }
  const npanel = construireNPanel(pilote, vue.ui.panneau!, conserve?.panneau ?? null)
  const entete = construireEntete(pilote)
  const surimp = construireSurimpression(pilote)

  // Marges des règles d'écran : en-tête en haut, histogramme en bas.
  const mesurer = () => {
    const r = vue.racine.getBoundingClientRect()
    const histo = vue.interface.querySelector('.atlas-histo')
    etat.marges.haut = 38
    etat.marges.bas = histo ? Math.max(24, r.bottom - histo.getBoundingClientRect().top + 10) : 24
    etat.marges.droite = 10
  }
  const observateur = new ResizeObserver(() => {
    mesurer()
    vue.demanderRendu()
  })
  observateur.observe(vue.racine)
  mesurer()
  let derniereMesure = 0

  choisirLibelles(vue)
  let versionLibelles = -1
  const desabonnements = [
    vue.on('granularite', () => {
      // Pendant une transition la granularité change à chaque image : on recalcule au plus par palier.
      const cle = Math.round(vue.granularite.globale * 4)
      if (cle !== versionLibelles || !vue.animateur.enCours) {
        versionLibelles = cle
        choisirLibelles(vue)
      }
    }),
    vue.on('filtres', () => choisirLibelles(vue)),
    vue.on('reglage', ({ cle }) => {
      versions.reglages++
      if (cle === 'nbLibelles') choisirLibelles(vue)
      if (cle === 'courbeExpo' || cle === 'forceExpo' || cle === 'courbeVues') appliquerCourbe()
      if (cle === 'indicateurValidation') appliquerSymboles()
      if (cle === 'regroupement' || ((cle === 'pasCases' || cle === 'ordreCases') && regroupement === 'cases')) {
        // Écriture immédiate (la sauvegarde du moteur est différée) ; regroupement lu avant la recréation.
        vue.reglages.sauver()
        ecrireStocke({ regroupement: vue.reglages.valeurs.regroupement, pasCases: vue.reglages.valeurs.pasCases, ordreCases: vue.reglages.valeurs.ordreCases })
        window.setTimeout(remonter, 0)
      }
    }),
    // L'histogramme peut changer de hauteur après sa première mise en page : on remesure de temps en temps.
    vue.on('image', ({ temps }) => {
      if (temps - derniereMesure > 500) {
        derniereMesure = temps
        mesurer()
      }
    }),
    vue.on('theme', () => {
      appliquerSymboles()
      vue.demanderRendu()
    }),
  ]

  // « Tout cadrer » vise le cube de l'instrument (ses règles comprises), pas seulement les points.
  const coins = new Float32Array(24)
  for (let i = 0; i < 8; i++) coins.set([(i & 1 ? 1 : -1) * BORNES[0], (i & 2 ? 1 : -1) * BORNES[1], (i & 4 ? 1 : -1) * BORNES[2]], i * 3)
  vue.cadrerTout = () => {
    vue.camera.cadrer(coins, null, vue.reglages.valeurs.dureeVues, 1.08, vue.zoneSure())
    vue.demanderRendu()
  }

  // Restaure la caméra et l'état de lecture.
  if (conserve) {
    vue.camera.definirOrientation(conserve.orientation)
    vue.camera.cible = [...conserve.cible]
    vue.camera.distance = conserve.distance
    vue.camera.mode = conserve.modeCamera
    vue.camera.version++
    if (conserve.selection !== null && conserve.selection < vue.h.nF) vue.selectionner(conserve.selection)
    vue.demanderRendu()
  } else {
    // Cadrage initial du cube dans la zone sûre, refait à la première image (mise en page faite).
    vue.camera.cadrer(coins, null, 1, 1.08, vue.zoneSure())
    const une = vue.on('image', () => {
      une()
      vue.camera.cadrer(coins, null, 1, 1.08, vue.zoneSure())
      vue.demanderRendu()
    })
  }

  ;(window as unknown as { atlasVue: VueGraphe }).atlasVue = vue
  return {
    vue,
    regroupement,
    nomsNiveaux: niveaux,
    npanel,
    detruire: () => {
      desabonnements.forEach((f) => f())
      observateur.disconnect()
      entete.detruire()
      surimp.detruire()
      npanel.detruire()
      vue.detruire()
    },
  }
}

function remonter(): void {
  const m = etatMontage
  if (!m) return
  const v = m.vue
  const conserve: EtatConserve = {
    orientation: [...v.camera.orientation] as Quat,
    cible: [...v.camera.cible] as Vec3,
    distance: v.camera.distance,
    modeCamera: v.camera.mode,
    mode: v.mode,
    granularite: Math.round(v.granularite.globale),
    selection: v.lignee.selection,
    panneau: m.npanel.ouvert() ? m.npanel.onglet() : null,
  }
  m.detruire()
  etatMontage = monter(conserve)
}

etatMontage = monter()
