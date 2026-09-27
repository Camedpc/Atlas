// R42 · Synthèse (essai C) : la figure LaTeX classique de R36, organisée en boîtes comme R18, réductible
// comme R19, avec les graphiques clés de R35 et des niveaux de détail selon le zoom.
//
// - Base R36 : Computer Modern, énoncés « Lemme 7 (nom). » + formule KaTeX centrée, statut par le trait,
//   confiance en pied (c = 0,82 avec bornes), axe des rangs, accolades des zones, légende « Figure 1 – … ».
// - Hypothèses de modélisation présentées comme R37 : « Hypothèse (ii) (nom). » + énoncé en italique +
//   portée, numérotées (i), (ii)… ; « sous (i), (iii) » sur les blocs qui en dépendent.
// - Boîtes de R18 (sous-problèmes et boîtes imbriquées, couleur et forme d'origine), mise en page par boîte
//   sans chevauchement ; réduction de R19 (clic sur la barre de titre → nœud-fonction, nouveau clic →
//   redéploiement ; « ouvrir ↗ » → onglet avec fil d'Ariane).
// - Graphiques de R35, limités aux figures CLÉS (règle dans graphiques.ts) ; les autres à la demande.
// - Niveaux de détail (rendu.ts) : point → titre → complet ; HTML / KaTeX paresseux (composition.ts).

import {
  creerVueRaisonnement, el, LIBELLES_TYPE, type Disposition, type ReducteurAreteR, type ReducteurPoint, type VueRaisonnement,
} from '../../src/raisonnement'
import { Composition } from './composition'
import { enLigne, formulesHtml, katex, rendreTex, texConfiance } from './formules'
import { choisirFiguresCles, construireFigures, legendeFigure, type Figure, type FigureNotee } from './graphiques'
import {
  agreger, ENTREES, etatGroupes, horsGroupe, nomGroupe, resultatDe, SORTIES, teinteGroupe,
} from './groupes'
import { jeuFontaine } from './jeu-fontaine'
import { MESURES } from './mesures'
import meta from './meta.json'
import { mettreEnPage, type MiseEnPage, type OptionsGroupes } from './mise-en-page'
import {
  cibleSous, dependantsActifs, dessinerDessous, dessinerDessus, largeurLegende, lirePaletteR42, type EtatRendu, type FigurePlacee,
} from './rendu'
import { etatSquelette, NIVEAUX, niveauDeStrategie, STRATEGIE_NIVEAU, type Niveau } from './squelette'

const etat: EtatRendu = {
  page: null,
  palette: { encre: '#000000', gris: '#666666', trait: '#000000', surface: '#ffffff', surface2: '#f2f2f2', accent: '#1c4fa0' },
  cibles: [],
  ciblesBoites: [],
  survol: null,
  epingles: new Set(),
  hypotheses: new Map(),
  composition: null,
  figures: new Map(),
  titres: new Map(),
  compte: { point: 0, titre: 0, complet: 0 },
}

// État de la vision (déclaré avant la vue : ses rappels servent dès la construction).
let corpsPanneau: HTMLElement | null = null
let ligneDetail: HTMLElement | null = null
let cadrerApres = true
let epinglesIds = new Set<string>()
/** Graphiques non clés demandés par l'utilisatrice (clé de figure). */
const figuresDemandees = new Set<string>()

// ─── Réducteurs : points sigma invisibles, opacité pilotée par la vision ───────

const reducteurPoint: ReducteurPoint = (info, a, vue) => {
  // Sigma ne dessine pas les nœuds : cadres sur le calque « dessus », texte dans la composition HTML.
  a.taille = 0.01
  a.libelle = null
  a.forceLibelle = false
  a.surligne = false
  if (info.noeud.piste === 'abandonnee') a.opacite = Math.min(info.presence, a.opacite / 0.55)
  const sv = etat.survol
  const actifs = dependantsActifs(vue, etat)
  if (sv?.genre === 'pastille') {
    const us = etat.page?.usagesPastille.get(sv.noeud)
    a.opacite = info.presence * (us?.includes(info.point) ? 1 : 0.2)
  } else if (sv?.genre === 'renvoi') {
    const us = etat.page?.usagesRenvoi.get(sv.point)
    a.opacite = info.presence * (info.point === sv.point || us?.includes(info.point) ? 1 : 0.2)
  } else if ((sv?.genre === 'titre' || sv?.genre === 'ouvrir') && sv.groupe) {
    // Survol d'une barre de titre : la boîte reste nette, le reste s'atténue.
    const c = etat.page?.commentaires.find((x) => x.id === sv.groupe)
    a.opacite = info.presence * (c?.membres.includes(info.point) ? 1 : 0.45)
  } else if (actifs && vue.survol !== null && sv?.genre === 'drapeau') {
    a.opacite = info.presence * (actifs.has(info.point) ? 1 : 0.22)
  } else if (actifs && !vue.ligneeActive && vue.survol === null) {
    a.opacite = info.presence * (actifs.has(info.point) ? 1 : 0.32)
  } else if (info.survol === 'autre') {
    a.opacite = Math.max(a.opacite, info.presence * 0.5)
  }
}

const reducteurArete: ReducteurAreteR = (info, a) => {
  if (info.genre === 'lecture') a.cache = true
}

// ─── Jeu de données ──────────────────────────────────────────────────────────
// Par défaut, la fontaine de chaîne ; ?jeu=edp : le jeu synthétique.

const JEUX = { fontaine: 'Fontaine de chaîne', edp: 'EDP stochastique (synthétique)' } as const
type Jeu = keyof typeof JEUX
const jeuChoisi: Jeu = new URLSearchParams(location.search).get('jeu') === 'edp' ? 'edp' : 'fontaine'

// ─── Vue ─────────────────────────────────────────────────────────────────────

const D = 'Figure R42'
const Z = 'Niveaux de détail (zoom)'
const vue = creerVueRaisonnement(document.getElementById('app')!, {
  id: jeuChoisi === 'fontaine' ? meta.id : `${meta.id}-${jeuChoisi}`,
  jeu: jeuChoisi === 'fontaine' ? jeuFontaine() : undefined,
  mode: '2d',
  strategie: STRATEGIE_NIVEAU.squelette,
  reglages: {
    ajusterAspect: false,
    pastillesContexte: true,
    liensSemantiques: true,
    opaciteContexte: 0.22,
    opaciteLiensComplets: 0.22,
  },
  reglagesSupplementaires: [
    { cle: 'niveau', defaut: 'squelette', dossier: D, libelle: 'niveau de lecture', options: Object.fromEntries(NIVEAUX.map((n) => [n.nom, n.id])) },
    { cle: 'boites', defaut: true, dossier: D, libelle: 'boîtes des sous-problèmes' },
    { cle: 'figuresCles', defaut: 2, dossier: D, libelle: 'graphiques clés (max.)', min: 0, max: 3, pas: 1 },
    { cle: 'largeurCarte', defaut: 184, dossier: D, libelle: 'largeur bloc', min: 140, max: 300, pas: 2 },
    { cle: 'ecartColonnes', defaut: 46, dossier: D, libelle: 'écart colonnes', min: 24, max: 160, pas: 2 },
    { cle: 'ecartLignes', defaut: 20, dossier: D, libelle: 'écart lignes', min: 4, max: 80, pas: 1 },
    { cle: 'taillePolice', defaut: 13, dossier: D, libelle: 'corps du texte', min: 10, max: 18, pas: 0.5 },
    { cle: 'maxPastilles', defaut: 5, dossier: D, libelle: 'bornes max.', min: 0, max: 12, pas: 1 },
    { cle: 'bandesChoix', defaut: 'survol', dossier: D, libelle: 'renvois aux hypothèses', options: { 'au survol / épinglées': 'survol', toujours: 'toujours' } },
    { cle: 'impasses', defaut: true, dossier: D, libelle: 'alternatives non retenues' },
    { cle: 'axe', defaut: true, dossier: D, libelle: 'axe et accolades' },
    { cle: 'legende', defaut: true, dossier: D, libelle: 'légende de figure' },
    { cle: 'seuilPoint', defaut: 0.28, dossier: Z, libelle: 'point → titre (échelle)', min: 0.05, max: 1.5, pas: 0.01 },
    { cle: 'seuilComplet', defaut: 0.5, dossier: Z, libelle: 'titre → complet (échelle)', min: 0.1, max: 2, pas: 0.01 },
  ],
  reducteursNoeud: [reducteurPoint],
  reducteursArete: [reducteurArete],
  dessinerDessous: (c) => dessinerDessous(c, etat),
  dessinerDessus: (c) => dessinerDessus(c, etat),
  rendreFiche: (p, v, defaut) => {
    const f = defaut()
    f.classList.add('r42-fiche')
    const n = v.noeud(p)
    const titre = f.querySelector('.rsn-fiche-titre')
    if (titre) titre.innerHTML = enLigne(n.nom)
    const enonce = f.querySelector('.rsn-fiche-enonce')
    if (enonce) {
      enonce.innerHTML = enLigne(n.enonce)
      const fm = formulesHtml(n.enonce)
      if (fm) {
        const d = el('div', { class: 'r42-fiche-formule' })
        d.innerHTML = fm
        enonce.after(d)
      }
    }
    const barre = f.querySelector('.rsn-confiance span')
    if (barre) barre.innerHTML = rendreTex(`${texConfiance(n.confiance)}\\quad [${n.confiance.bas.toFixed(2).replace('.', '{,}')}\\,;\\,${n.confiance.haut.toFixed(2).replace('.', '{,}')}]`, barre.textContent ?? '')
    const aide = f.querySelector('.rsn-aide')
    const u = p < v.nU ? v.lecture.unites[p] : undefined
    const page = etat.page
    const b = page && p < v.nU ? page.boites[p] : undefined
    let texte = 'Clic : lignée · double-clic : cadrer · Échap : effacer'
    if (n.type === 'choix_modelisation') texte = 'Survol : renvois sur les blocs dépendants · clic : épingler'
    else if (b?.genre === 'fonction') texte = 'Double-clic : ouvrir le sous-graphe dans un onglet · clic sur la barre de titre : déployer'
    else if (u && u.membres.length > 1) texte = `Double-clic : ouvrir le sous-système (${u.membres.length} énoncés) · clic : lignée`
    else if (u && dansDeplie(v, p)) texte = 'Double-clic : refermer le sous-système · clic : lignée'
    else if (!u) texte = 'Contexte : clic pour voir les blocs qui l’utilisent'
    if (aide) aide.textContent = texte
    const sv = etat.survol
    const bandeau = (t: string) => f.prepend(el('div', { class: 'r42-fiche-bandeau' }, t))
    if (page && sv?.genre === 'pastille') {
      const k = page.usagesPastille.get(sv.noeud)?.length ?? 0
      bandeau(`Borne de contexte — ${k} bloc${k > 1 ? 's' : ''} l’utilise${k > 1 ? 'nt' : ''}`)
    } else if (page && sv?.genre === 'renvoi') {
      const k = page.usagesRenvoi.get(sv.point)?.length ?? 0
      bandeau(`Renvoi à ${page.boites[sv.point]?.ref} — cité par ${k} bloc${k > 1 ? 's' : ''} en aval`)
    } else if (page && b && u) {
      const statut = (s: string) => (s === 'valide' ? 'validé' : s === 'incertain' ? 'à vérifier' : 'réfuté')
      const boite = b.sousProbleme && !b.sousProbleme.startsWith('§') ? ` — ${nomGroupe(v.jeu, b.sousProbleme)}` : ''
      if (b.genre === 'fonction') {
        const ag = agreger(v.justification.noeuds, u.membres)
        const maillon = v.justification.noeuds[ag.maillon]!
        bandeau(`Sous-graphe ${b.ref}${boite} — ${ag.n} énoncés — statut le plus faible : ${statut(ag.statut)} — maillon faible : ${maillon.nom} (c = ${ag.confiance.estimation.toFixed(2).replace('.', ',')})`)
        f.append(listeMembres(v, u.membres))
      } else if (b.genre === 'drapeau') {
        const k = page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0
        bandeau(`Hypothèse ${b.ref} — ${k} énoncé${k > 1 ? 's' : ''} en dépend${k > 1 ? 'ent' : ''}`)
      } else if (b.genre === 'decision') bandeau(`Décision ${b.ref}${boite} — rang ${Math.max(0, b.rang)}`)
      else {
        const trait = n.statut === 'valide' ? 'trait plein : validé' : n.statut === 'incertain' ? 'trait tireté : à vérifier' : 'barré : réfuté'
        bandeau(`${LIBELLES_TYPE[n.type]} ${b.ref}${boite} — rang ${Math.max(0, b.rang)} — ${trait}`)
      }
      // Graphiques de ce bloc : clés (dessinés) ou à la demande.
      const figs = (notees ?? []).filter((x) => pointFigure(x.figure) === p)
      if (figs.length) {
        const l = figs.map((x) => `${x.figure.y} contre ${x.figure.x} (${x.cle ? 'clé, sous le bloc' : figuresDemandees.has(x.figure.cle) ? 'demandé, sous le bloc' : 'à la demande : panneau ☰'})`)
        f.append(el('div', { class: 'r42-fiche-figures' }, `Graphique${figs.length > 1 ? 's' : ''} : ${l.join(' ; ')}`))
      }
    }
    return f
  },
  panneau: (p, v) => p.ajouterSection('r42', 'Figure', construirePanneau(v), { position: 'lecture' }),
})

// Les pastilles et liens sémantiques par défaut sont remplacés par ceux de la vision.
vue.dessinsDessus.splice(0, 2)
etat.composition = new Composition(vue.scene)

/** Membres d'un nœud-fonction, avec leur statut (fiche). */
function listeMembres(v: VueRaisonnement, membres: number[]): HTMLElement {
  const noeuds = v.justification.noeuds
  const liste = el('div', { class: 'r42-membres' })
  for (const m of membres) {
    const n = noeuds[m]!
    const marque = n.statut === 'valide' ? '—' : n.statut === 'incertain' ? '- -' : '×'
    const nom = el('span', {})
    nom.innerHTML = enLigne(n.nom)
    liste.append(el('div', { class: 'r42-membre' },
      el('span', { class: 'r42-membre-statut', title: n.statut }, marque), nom,
      el('span', { class: 'r42-valeur' }, n.confiance.estimation.toFixed(2).replace('.', ','))))
  }
  return liste
}

// ─── Graphiques (R35) : figures du jeu, figures clés, ancrage ─────────────────

let cacheFigures: { j: unknown; cles: number; notees: FigureNotee[] } | null = null
let notees: FigureNotee[] | null = null

/** Figures du jeu, notées (clés / à la demande) ; recalculées si le graphe ou le maximum change. */
function figuresNotees(): FigureNotee[] {
  const max = vue.reglages.lire<number>('figuresCles')
  if (cacheFigures?.j !== vue.justification || cacheFigures.cles !== max) {
    const figures = construireFigures(vue.justification, MESURES[jeuChoisi] ?? {})
    cacheFigures = { j: vue.justification, cles: max, notees: choisirFiguresCles(vue.justification, figures, max) }
  }
  notees = cacheFigures.notees
  return notees
}

/** Point (unité de lecture) d'un nœud de justification, ou null. */
const uniteDe = (i: number): number | null => {
  const u = vue.lecture.uniteDe[i]!
  return u >= 0 ? u : null
}

/** Bloc qui porte une figure : celui qui énonce la loi, sinon celui de la première série mesurée. */
function pointFigure(fig: Figure): number | null {
  return uniteDe(fig.noeudLoi) ?? fig.series.map((s) => uniteDe(s.noeud)).find((q) => q !== null) ?? null
}

/** Graphiques affichés (clés + demandés), par bloc ; jamais sous un nœud-fonction. */
function ancrerFigures(fonction: (p: number) => boolean): Map<number, Figure[]> {
  const m = new Map<number, Figure[]>()
  for (const x of figuresNotees()) {
    if (!x.cle && !figuresDemandees.has(x.figure.cle)) continue
    const p = pointFigure(x.figure)
    if (p === null || fonction(p)) continue
    let l = m.get(p)
    if (!l) m.set(p, (l = []))
    l.push(x.figure)
  }
  return m
}

/** Étiquettes (a), (b)… dans l'ordre des numéros de blocs ; légendes avec renvois « cf. 7 ». */
function numeroterFigures(page: MiseEnPage, ancres: Map<number, Figure[]>): void {
  const ref = (i: number) => {
    const u = uniteDe(i)
    return u === null ? null : page.boites[u]?.ref ?? null
  }
  const points = [...ancres.keys()].filter((p) => page.boites[p]!.figures > 0).sort((a, b) => page.boites[a]!.rang - page.boites[b]!.rang || page.boites[a]!.numero - page.boites[b]!.numero)
  let k = 0
  etat.figures = new Map()
  for (const p of points) {
    etat.figures.set(p, ancres.get(p)!.map((fig): FigurePlacee => {
      const etiquette = `(${String.fromCharCode(97 + k++)})`
      return { fig, etiquette, legende: legendeFigure(fig, etiquette, ref) }
    }))
  }
}

// ─── Légende de figure (remplace le cartouche) ───────────────────────────────

function majLegende(): void {
  const comp = etat.composition
  const page = etat.page
  if (!comp || !page) return
  const s = vue.lecture.stats
  const niveau = NIVEAUX.find((n) => n.id === niveauDeStrategie(vue.strategie.id))?.nom.toLowerCase() ?? vue.strategie.nom
  let dec = 0, hyp = 0, fct = 0
  for (let p = 0; p < vue.nU; p++) {
    const g = page.boites[p]!.genre
    if (g === 'drapeau') hyp++
    else if (g === 'decision') dec++
    else if (g === 'fonction') fct++
  }
  const blocs = vue.nU - dec - hyp - fct
  const resume = vue.jeu.resume ? ` ${enLigne(vue.jeu.resume)}` : ''
  const onglet = etatGroupes.onglet ? ` Sous-graphe ouvert : <i>${enLigne(nomGroupe(vue.jeu, etatGroupes.onglet))}</i>, avec ses entrées et ses sorties.` : ''
  const graphiques = [...etat.figures.values()].flat()
  const texteGraphiques = graphiques.length
    ? ` Graphiques ${graphiques.map((f) => f.etiquette).join(', ')} : loi prédite (trait plein) confrontée aux mesures (points, barres d’erreur) sous le bloc qui l’énonce.`
    : ''
  comp.legende.innerHTML = `<span class="r42-sc">Figure</span> 1 – <i>${enLigne(vue.jeu.titre)}.</i>${resume}${onglet}`
    + ` Graphe de lecture, niveau « ${niveau} » : ${blocs} énoncés, ${dec} décision${dec > 1 ? 's' : ''}, ${hyp} hypothèse${hyp > 1 ? 's' : ''} de modélisation`
    + `${fct ? ` et ${fct} sous-graphe${fct > 1 ? 's' : ''} réduit${fct > 1 ? 's' : ''}` : ''} pour ${s.noeudsComplet} nœuds ; ${s.aretes} liaisons pour ${s.aretesComplet} arêtes de justification.`
    + ` Boîtes teintées : sous-problèmes (clic sur la barre de titre : réduire en sous-graphe, ou déployer).`
    + ` Trait plein : validé ; tireté : à vérifier ; barré : réfuté ; pointillé gris : piste abandonnée ; double cadre : résultat ;`
    + ` cadre doublé en retrait : sous-système ou sous-graphe. Losange : décision, × : alternative non retenue ;`
    + ` coins arrondis : hypothèse de modélisation (i), (ii)… ; « sous (i) » : l’énoncé en dépend. ${rendreTex('c', 'c')} : confiance estimée, en exposant et en indice les bornes de son intervalle ;`
    + ` IA, H, IA+H : validation. Lettres encadrées : contexte (H hypothèse, D définition, O outil, A axiome, L littérature) ; « cf. ${rendreTex('n', 'n')} » : renvoi au bloc ${rendreTex('n', 'n')}.${texteGraphiques}`
}

// ─── Disposition maison ──────────────────────────────────────────────────────

const appliquerDisposition = (d: Disposition, anime: boolean) =>
  (vue as unknown as { appliquerDisposition(d: Disposition, anime: boolean): void }).appliquerDisposition(d, anime)

function positionsPrecedentes(): Map<string, number> | undefined {
  const page = etat.page
  if (!page || !vue.lecture) return undefined
  const m = new Map<string, number>()
  const j = vue.justification
  for (let p = 0; p < Math.min(vue.nU, vue.disposition.nU); p++) {
    const u = vue.lecture.unites[p]
    if (!u) continue
    const y = -vue.disposition.z[p]! / page.echelle
    u.membres.forEach((mb, k) => m.set(j.noeuds[mb]!.id, y + k * 1e-3))
  }
  return m
}

/** Boîte, nœud-fonction de chaque unité (d'après la dérivation courante). */
function optionsGroupes(): OptionsGroupes {
  const g = vue.lecture
  const r = resultatDe(g)
  const noeuds = g.justification.noeuds
  const o: OptionsGroupes = { boite: [], fonction: [], onglet: r.onglet, refus: new Set(r.refus.keys()) }
  for (const u of g.unites) {
    const n = noeuds[u.conclusion]!
    const f = r.fonctions.get(n.id) ?? ''
    o.fonction.push(f)
    if (r.entrees.has(n.id)) o.boite.push(ENTREES)
    else if (r.sorties.has(n.id)) o.boite.push(SORTIES)
    else if (f) o.boite.push(f)
    else o.boite.push(horsGroupe(n) ? null : n.sousProbleme)
  }
  return o
}

function recalculer(anime: boolean): void {
  const R = vue.reglages
  const comp = etat.composition!
  const largeur = R.lire<number>('largeurCarte')
  const taille = R.lire<number>('taillePolice')
  const groupes = optionsGroupes()
  const fonction = (p: number) => !!groupes.fonction[p]
  const ancres = ancrerFigures(fonction)
  const { disposition, page } = mettreEnPage(vue.lecture, {
    largeurCarte: largeur,
    ecartColonnes: R.lire<number>('ecartColonnes'),
    ecartLignes: R.lire<number>('ecartLignes'),
    taillePolice: taille,
    maxPastilles: R.lire<number>('maxPastilles'),
    ecartCouches: R.valeurs.ecartCouches,
    sousProblemes: vue.jeu.sousProblemes,
    commentaires: R.lire<boolean>('boites'),
    groupes,
    teinte: (id) => teinteGroupe(vue.jeu, id),
    nom: (id) => nomGroupe(vue.jeu, id),
    hauteurs: comp.hauteurs(vue, { largeur, taille }, fonction),
    figuresDe: (p) => ancres.get(p)?.length ?? 0,
    precedent: anime ? positionsPrecedentes() : undefined,
  })
  comp.preparer(vue, page, { largeur, taille })
  etat.titres = new Map()
  attribuerHypotheses(page)
  numeroterFigures(page, ancres)
  etat.page = page
  etat.survol = null
  vue.margesSures = { droite: -140 }
  appliquerDisposition(disposition, anime)
  majLegende()
  if (cadrerApres) {
    cadrerApres = false
    vue.cadrerTout(anime ? undefined : 1)
  } else if (anime && horsEcran()) vue.cadrerTout()
  majPanneau()
  majOnglets()
}

/** Repères des hypothèses de modélisation présentes ; les épingles suivent les ids. */
function attribuerHypotheses(page: MiseEnPage): void {
  etat.hypotheses = new Map()
  etat.epingles = new Set()
  for (let p = 0; p < vue.lecture.unites.length; p++) {
    const b = page.boites[p]!
    if (b.genre !== 'drapeau') continue
    etat.hypotheses.set(p, b.ref)
    if (epinglesIds.has(vue.justification.noeuds[vue.lecture.unites[p]!.conclusion]!.id)) etat.epingles.add(p)
  }
}

/** Vrai si une partie des unités sort de l'écran après une transition. */
function horsEcran(): boolean {
  const d = vue.disposition
  const cam = vue.camera
  for (let p = 0; p < d.nU; p++) {
    const q = cam.projeterPoint([d.x[p]!, 0, d.z[p]!])
    if (q.x < 40 || q.x > cam.largeur - 40 || q.y < 60 || q.y > cam.hauteur - 60) return true
  }
  return false
}

// La vue appelle `redisposer` à chaque nouvelle dérivation ou réglage de disposition.
vue.redisposer = async () => recalculer(true)

// Cadrage 2D : la figure entière d'après ses bornes exactes (axe au-dessus, boîtes, graphiques, légende
// dessous), centrée dans la zone libre de l'interface. Pas de cartouche qui recouvre, pas de marge fantôme.
const cadrerToutDefaut = vue.cadrerTout.bind(vue)
vue.cadrerTout = (duree?: number) => {
  const page = etat.page
  if (!page || vue.extrusion > 0.02 || vue.reglages.valeurs.liensComplets) return cadrerToutDefaut(duree)
  const E = page.echelle
  const b = page.bornes
  let x0 = b.x0, x1 = b.x1, y0 = b.y0, y1 = b.y1
  if (vue.reglages.lire<boolean>('axe')) y0 -= 76
  if (vue.reglages.lire<boolean>('legende') && etat.composition) {
    const larg = largeurLegende(page)
    const cx = (b.x0 + b.x1) / 2
    x0 = Math.min(x0, cx - larg / 2)
    x1 = Math.max(x1, cx + larg / 2 + 110)
    y1 += 26 + etat.composition.hauteurLegende(larg)
  } else x1 += 110
  const pos = new Float32Array([(x0 - page.cx) * E, 0, -(y0 - page.cy) * E, (x1 - page.cx) * E, 0, -(y1 - page.cy) * E])
  vue.camera.cadrer(pos, [0, 1], duree ?? vue.reglages.valeurs.dureeTransition, 1.03, vue.zoneSure())
  vue.demanderRendu()
}

// ─── Survol et clic : blocs, bornes, hypothèses, barres de titre ──────────────

vue.pointSous = (x: number, y: number) => {
  const c = cibleSous(etat, x, y)
  const avant = etat.survol
  etat.survol = c
  const change = avant?.genre !== c?.genre || avant?.noeud !== c?.noeud || avant?.point !== c?.point || avant?.groupe !== c?.groupe
  if (change && ['pastille', 'renvoi', 'titre', 'ouvrir'].some((g) => avant?.genre === g || c?.genre === g)) vue.demanderRendu()
  vue.scene.style.cursor = c?.genre === 'titre' || c?.genre === 'ouvrir' ? 'pointer' : ''
  if (!c || c.genre === 'titre' || c.genre === 'ouvrir') return null
  if (c.genre === 'pastille') return vue.pointDeNoeud(c.noeud)
  return c.point
}

// Clic : hypothèse → épingler ; barre de titre → réduire / déployer ; « ouvrir ↗ » → onglet.
const selectionnerDefaut = vue.selectionner.bind(vue)
let dernierBasculement = { groupe: '', t: 0 }
vue.selectionner = (p: number | null) => {
  const sv = etat.survol
  if (p === null && sv?.groupe && sv.genre === 'titre') {
    // Le second clic d'un double-clic ne rebascule pas la boîte.
    const t = performance.now()
    if (dernierBasculement.groupe === sv.groupe && t - dernierBasculement.t < 450) return
    dernierBasculement = { groupe: sv.groupe, t }
    return basculerReduction(sv.groupe)
  }
  if (p === null && sv?.groupe && sv.genre === 'ouvrir') return ouvrirOnglet(sv.groupe)
  if (p !== null && p < vue.nU && etat.page?.boites[p]?.genre === 'drapeau' && sv?.genre === 'drapeau') {
    basculerEpingle(vue.noeud(p).id)
    return
  }
  selectionnerDefaut(p)
}

function basculerEpingle(id: string, etatVoulu?: boolean): void {
  const actif = etatVoulu ?? !epinglesIds.has(id)
  if (actif) epinglesIds.add(id)
  else epinglesIds.delete(id)
  epinglesIds = new Set(epinglesIds)
  if (etat.page) attribuerHypotheses(etat.page)
  majPanneau()
  vue.demanderRendu()
}

// ─── Réduction des boîtes (R19) et onglets ───────────────────────────────────

/** Réduit ou redéploie une boîte ; la transition de la vue resserre / ressort les blocs. */
function basculerReduction(g: string, voulu?: boolean): void {
  const reduire = voulu ?? !etatGroupes.reduits.has(g)
  if (reduire === etatGroupes.reduits.has(g)) return
  if (reduire) {
    etatGroupes.reduits.add(g)
    // Réduire un parent absorbe ses boîtes imbriquées : leur état propre est oublié.
    for (const x of [...etatGroupes.reduits]) if (x !== g && x.startsWith(`${g}.`)) etatGroupes.reduits.delete(x)
  } else etatGroupes.reduits.delete(g)
  etat.survol = null
  vue.definirStrategie(vue.strategie)
}

function toutBasculer(reduire: boolean): void {
  etatGroupes.reduits.clear()
  if (reduire) for (const s of vue.jeu.sousProblemes) if (!s.id.includes('.')) etatGroupes.reduits.add(s.id)
  vue.definirStrategie(vue.strategie)
}

function ouvrirOnglet(g: string): void {
  if (etatGroupes.onglet === g) return
  etatGroupes.onglet = g
  etat.survol = null
  cadrerApres = true
  vue.definirStrategie(vue.strategie)
}

function fermerOnglet(): void {
  if (!etatGroupes.onglet) return
  etatGroupes.onglet = null
  etat.survol = null
  cadrerApres = true
  vue.definirStrategie(vue.strategie)
}

// Fil d'Ariane (onglet ouvert), sous la barre d'outils : « Fontaine de chaîne › SP2 · … × ».
const barreOnglets = el('nav', { class: 'r42-ariane', 'aria-label': 'Fil d’Ariane' })
vue.interface.append(barreOnglets)

function majOnglets(): void {
  const onglet = etatGroupes.onglet
  barreOnglets.hidden = !onglet
  if (!onglet) return barreOnglets.replaceChildren()
  const racine = vue.jeu.titre.split('(')[0]!.trim()
  const chemin: HTMLElement[] = [el('a', { href: '#', onclick: (e: Event) => {
    e.preventDefault()
    fermerOnglet()
  } }, racine)]
  // Boîtes parentes (sous-problème imbriqué), puis le sous-graphe ouvert.
  const ids: string[] = []
  for (let x: string | null = onglet; x; x = x.includes('.') ? x.slice(0, x.lastIndexOf('.')) : null) ids.unshift(x)
  ids.forEach((id, k) => {
    chemin.push(el('span', { class: 'r42-ariane-sep' }, '›'))
    if (k < ids.length - 1) chemin.push(el('a', { href: '#', onclick: (e: Event) => {
      e.preventDefault()
      etatGroupes.onglet = id
      cadrerApres = true
      vue.definirStrategie(vue.strategie)
    } }, nomGroupe(vue.jeu, id)))
    else chemin.push(el('span', { class: 'r42-ariane-actuel' }, nomGroupe(vue.jeu, id)))
  })
  chemin.push(el('button', { type: 'button', class: 'r42-ariane-fermer', title: 'Revenir au graphe principal', onclick: () => fermerOnglet() }, '×'))
  barreOnglets.replaceChildren(...chemin)
}

// ─── Double-clic : sous-système sur place, onglet d'un nœud-fonction ──────────

function dansDeplie(v: VueRaisonnement, p: number): string | null {
  const j = v.justification
  const u = v.lecture.unites[p]
  if (!u) return null
  const ids = u.membres.map((m) => j.noeuds[m]!.id)
  let trouve: string | null = null
  for (const [tete, membres] of etatSquelette.deplies) {
    if (ids.some((id) => id === tete || membres.includes(id))) trouve = tete
  }
  return trouve
}

function deplier(p: number): void {
  const u = vue.lecture.unites[p]!
  const j = vue.justification
  const id = j.noeuds[u.conclusion]!.id
  etatSquelette.ouvertes.add(id)
  etatSquelette.deplies.set(id, u.membres.map((m) => j.noeuds[m]!.id).filter((x) => x !== id))
  vue.definirStrategie(vue.strategie)
}

function replier(tete: string): void {
  const membres = etatSquelette.deplies.get(tete) ?? []
  for (const m of membres) if (etatSquelette.deplies.has(m)) replier(m)
  etatSquelette.ouvertes.delete(tete)
  etatSquelette.deplies.delete(tete)
}

function doubleClic(x: number, y: number): void {
  const p = vue.pointSous(x, y)
  if (p === null) {
    if (etat.survol?.genre === 'titre' || etat.survol?.genre === 'ouvrir') return
    return vue.cadrerTout()
  }
  if (p < vue.nU) {
    const b = etat.page?.boites[p]
    if (b?.genre === 'fonction' && b.sousProbleme) return ouvrirOnglet(b.sousProbleme)
    const u = vue.lecture.unites[p]!
    if (u.membres.length > 1) return deplier(p)
    const tete = dansDeplie(vue, p)
    if (tete) {
      replier(tete)
      vue.definirStrategie(vue.strategie)
      return
    }
  }
  vue.selectionner(p)
  vue.cadrerSelection()
}

vue.sigma.removeAllListeners('doubleClickNode')
vue.sigma.removeAllListeners('doubleClickStage')
const surDoubleClic = (e: { event: { x: number; y: number; preventSigmaDefault(): void }; preventSigmaDefault(): void }) => {
  e.preventSigmaDefault()
  e.event.preventSigmaDefault()
  doubleClic(e.event.x, e.event.y)
}
vue.sigma.on('doubleClickNode', surDoubleClic)
vue.sigma.on('doubleClickStage', surDoubleClic)

// ─── Niveau de lecture et réglages ───────────────────────────────────────────

function definirNiveau(n: Niveau): void {
  if (vue.reglages.lire<string>('niveau') !== n) return vue.reglages.definir('niveau', n)
  if (vue.strategie.id === STRATEGIE_NIVEAU[n]) return
  cadrerApres = true
  vue.definirStrategie(STRATEGIE_NIVEAU[n])
}

vue.on('reglage', ({ cle, valeur }) => {
  if (cle === 'niveau') definirNiveau(valeur as Niveau)
  else if (['largeurCarte', 'ecartColonnes', 'ecartLignes', 'taillePolice', 'maxPastilles', 'ecartCouches', 'boites', 'figuresCles'].includes(cle)) {
    cadrerApres = cle !== 'maxPastilles' && cle !== 'figuresCles'
    recalculer(true)
  } else if (cle === 'impasses') {
    etat.composition?.couche.classList.toggle('r42-sans-impasses', !valeur)
    vue.demanderRendu()
  } else if (cle === 'legende' || cle === 'axe' || cle === 'seuilPoint' || cle === 'seuilComplet') {
    vue.demanderRendu()
    majPanneau()
  } else if (cle === 'strategie') cadrerApres = true
  else if (cle === 'liensComplets') window.setTimeout(() => vue.cadrerTout(), 30)
})
vue.on('lecture', () => {
  const n = niveauDeStrategie(vue.strategie.id)
  if (n && vue.reglages.lire<string>('niveau') !== n) {
    ;(vue.reglages.valeurs as unknown as Record<string, string>).niveau = n
    vue.reglages.pane?.refresh()
  }
  cadrerApres ||= !n
})
vue.on('theme', () => {
  etat.palette = lirePaletteR42(vue.racine)
})
etat.palette = lirePaletteR42(vue.racine)

// Compteur des niveaux de détail dans le panneau (au plus deux fois par seconde, sans reconstruire le panneau).
{
  let dernier = 0
  vue.on('image', ({ temps }) => {
    if (!ligneDetail || temps - dernier < 500) return
    dernier = temps
    ligneDetail.textContent = texteDetail()
  })
}

function texteDetail(): string {
  const c = etat.compte
  const comp = etat.composition
  return `À l’écran : ${c.point} en point, ${c.titre} en titre, ${c.complet} complets · HTML composé : ${comp?.enCache ?? 0} bloc${(comp?.enCache ?? 0) > 1 ? 's' : ''} en cache, ${comp?.construits ?? 0} construction${(comp?.construits ?? 0) > 1 ? 's' : ''} depuis le chargement.`
}

// ─── Panneau ☰ ───────────────────────────────────────────────────────────────

function construirePanneau(v: VueRaisonnement): HTMLElement {
  corpsPanneau = el('div', { class: 'r42-panneau' })
  void v
  return corpsPanneau
}

function majPanneau(): void {
  if (!corpsPanneau || !etat.page) return
  const v = vue
  const page = etat.page
  const niveau = niveauDeStrategie(v.strategie.id)
  const compte = { blocs: 0, sousSystemes: 0, fonctions: 0, decisions: 0, hypotheses: 0, rejetees: 0, bornes: 0, renvois: 0, formules: 0 }
  for (let p = 0; p < v.nU; p++) {
    const b = page.boites[p]!
    if (b.genre === 'drapeau') compte.hypotheses++
    else if (b.genre === 'decision') {
      compte.decisions++
      if (b.impasse) compte.rejetees++
    } else if (b.genre === 'fonction') compte.fonctions++
    else {
      compte.blocs++
      if (b.genre === 'etape') compte.sousSystemes++
      if (formulesHtml(v.noeud(p).enonce)) compte.formules++
    }
    compte.bornes += b.pastilles.length
    compte.renvois += b.renvois.length
  }
  const s = v.lecture.stats
  const r = resultatDe(v.lecture)
  const boutons = el('div', { class: 'r42-niveaux' }, NIVEAUX.map((n) =>
    el('button', { type: 'button', class: `rsn-bouton${n.id === niveau ? ' actif' : ''}`, onclick: () => definirNiveau(n.id) }, n.nom)))
  const ligne = (k: string, val: string | number) => el('tr', {}, el('td', {}, k), el('td', { class: 'r42-valeur' }, String(val)))
  // Boîtes : une ligne par sous-problème présent (imbriqués en retrait) ; réduire / déployer, ouvrir.
  const presents = new Set(page.commentaires.map((c) => c.id))
  const boites = v.jeu.sousProblemes.filter((sp) => presents.has(sp.id) || etatGroupes.reduits.has(sp.id) || etatGroupes.onglet === sp.id).map((sp) => {
    const c = page.commentaires.find((x) => x.id === sp.id)
    const n = c?.membres.reduce((t, p) => t + (v.lecture.unites[p]?.membres.length ?? 1), 0) ?? 0
    const reduite = !!c?.reduite
    const teinte = el('span', { class: 'r42-teinte' })
    teinte.style.background = teinteGroupe(v.jeu, sp.id)
    return el('div', { class: `r42-boite${sp.id.includes('.') ? ' r42-boite-imbriquee' : ''}` },
      teinte,
      el('span', { class: 'r42-boite-nom', title: sp.resume }, sp.nom),
      el('span', { class: 'r42-valeur' }, String(n)),
      etatGroupes.onglet
        ? el('span', {})
        : el('button', { type: 'button', class: 'rsn-bouton', disabled: r.refus.has(sp.id) || !c, title: r.refus.get(sp.id) ?? '', onclick: () => basculerReduction(sp.id) }, reduite ? 'Déployer' : 'Réduire'),
      el('button', { type: 'button', class: 'rsn-bouton', onclick: () => (etatGroupes.onglet === sp.id ? fermerOnglet() : ouvrirOnglet(sp.id)) }, etatGroupes.onglet === sp.id ? 'Fermer' : 'Ouvrir ↗'))
  })
  // Graphiques : clés (dessinés), à la demande (case à cocher).
  const figs = (notees ?? []).map((x) => {
    const c = el('input', { type: 'checkbox' }) as HTMLInputElement
    const p = pointFigure(x.figure)
    c.checked = x.cle || figuresDemandees.has(x.figure.cle)
    c.disabled = x.cle || p === null
    c.addEventListener('change', () => {
      if (c.checked) figuresDemandees.add(x.figure.cle)
      else figuresDemandees.delete(x.figure.cle)
      recalculer(true)
    })
    const placee = [...etat.figures.values()].flat().find((f) => f.fig.cle === x.figure.cle)
    const titre = el('span', { class: 'r42-figure-nom' })
    titre.innerHTML = `${placee ? `${placee.etiquette} ` : ''}${enLigne(`${x.figure.y} contre ${x.figure.x}`)}${p !== null ? ` <span class="r42-doux">(bloc ${page.boites[p]?.ref})</span>` : ' <span class="r42-doux">(bloc hors de la vue)</span>'}`
    return el('label', { class: 'r42-figure' }, c, titre,
      el('span', { class: 'r42-doux r42-figure-raison' }, `${x.cle ? 'clé' : 'à la demande'} — ${x.raison}`))
  })
  const hyps = [...etat.hypotheses].map(([p, ref]) => {
    const n = v.noeud(p)
    const c = el('input', { type: 'checkbox' }) as HTMLInputElement
    c.checked = etat.epingles.has(p)
    c.addEventListener('change', () => basculerEpingle(n.id, c.checked))
    const nom = el('span', { class: 'r42-liste-hyp-nom' })
    nom.innerHTML = enLigne(n.nom)
    return el('label', { class: 'r42-liste-hyp-item' }, c,
      el('span', { class: 'r42-ref' }, ref),
      nom,
      el('span', { class: 'r42-valeur' }, `${page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0}`))
  })
  const tableau = el('table', { class: 'r42-table' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Élément'), el('th', { class: 'r42-valeur' }, 'Nombre'))),
    el('tbody', {},
      ligne('Blocs visibles / nœuds', `${v.nU} / ${s.noeudsComplet}`),
      ligne('Liaisons / arêtes', `${s.aretes} / ${s.aretesComplet}`),
      ligne('Énoncés · sous-systèmes', `${compte.blocs} · ${compte.sousSystemes}`),
      ligne('Énoncés avec formule', compte.formules),
      ligne('Sous-graphes réduits', compte.fonctions),
      ligne('Décisions · non retenues', `${compte.decisions} · ${compte.rejetees}`),
      ligne('Hypothèses de modélisation', compte.hypotheses),
      ligne('Bornes · renvois', `${compte.bornes} · ${compte.renvois}`),
      ligne('Boîtes · imbriquées', `${page.commentaires.filter((c) => c.niveau === 0).length} · ${page.commentaires.filter((c) => c.niveau === 1).length}`),
    ),
  )
  const sp = v.reglages.lire<number>('seuilPoint'), sc = v.reglages.lire<number>('seuilComplet')
  const f2 = (x: number) => x.toFixed(2).replace('.', ',')
  ligneDetail = el('div', { class: 'r42-doux' }, texteDetail())
  corpsPanneau.replaceChildren(
    el('div', { class: 'rsn-doux rsn-petit' }, 'Niveau de lecture'),
    boutons,
    tableau,
    el('div', { class: 'rsn-groupe-titre' }, etatGroupes.onglet ? 'Boîtes (onglet ouvert)' : 'Boîtes des sous-problèmes'),
    el('div', { class: 'r42-boites' }, boites),
    etatGroupes.onglet
      ? el('button', { type: 'button', class: 'rsn-bouton', onclick: () => fermerOnglet() }, '← Graphe principal')
      : el('div', { class: 'r42-niveaux' },
          el('button', { type: 'button', class: 'rsn-bouton', onclick: () => toutBasculer(true) }, 'Tout réduire'),
          el('button', { type: 'button', class: 'rsn-bouton', onclick: () => toutBasculer(false) }, 'Tout déployer')),
    etatSquelette.deplies.size
      ? el('button', { type: 'button', class: 'rsn-bouton', onclick: () => {
          etatSquelette.ouvertes.clear()
          etatSquelette.deplies.clear()
          v.definirStrategie(v.strategie)
        } }, `Refermer les sous-systèmes (${etatSquelette.deplies.size})`)
      : el('div', { class: 'rsn-doux rsn-petit' }, 'Double-clic sur un sous-système (cadre doublé en retrait) pour l’ouvrir sur place.'),
    el('div', { class: 'rsn-groupe-titre' }, 'Graphiques'),
    figs.length
      ? el('div', { class: 'r42-figures' }, figs)
      : el('div', { class: 'rsn-doux rsn-petit' }, 'Aucune loi de ce jeu n’est confrontée à des mesures.'),
    el('div', { class: 'rsn-groupe-titre' }, 'Hypothèses de modélisation (épingler)'),
    el('div', { class: 'r42-liste-hyp' }, hyps),
    el('div', { class: 'rsn-groupe-titre' }, 'Niveaux de détail'),
    el('div', { class: 'r42-legende-panneau' },
      el('div', {}, el('i', {}, 'Échelle'), ` = pixels d’écran par pixel de la figure. Sous ${f2(sp)} : chaque bloc est un carré de la couleur de sa boîte ; de ${f2(sp)} à ${f2(sc)} : cadre et titre ; au-delà : énoncé complet (formule, confiance, graphiques). Seuils : réglages « ${Z} ».`),
      ligneDetail,
    ),
    el('div', { class: 'rsn-groupe-titre' }, 'Lecture'),
    el('div', { class: 'r42-legende-panneau' },
      el('div', {}, 'La légende complète est sous la figure (réglage « légende de figure »).'),
      el('div', {}, el('i', {}, 'Numérotation'), ' : un compteur commun pour les énoncés (Lemme 7, Théorème 12), D pour les décisions, (i), (ii)… pour les hypothèses de modélisation, G pour les sous-graphes réduits.'),
      el('div', {}, el('i', {}, 'Boîtes'), ' : clic sur la barre de titre pour réduire la boîte en un sous-graphe (broches d’entrée à gauche, de sortie à droite, statut le plus faible, maillon le plus faible) ; nouveau clic pour la déployer ; « ouvrir ↗ » pour la voir seule, avec ses entrées et ses sorties.'),
    ),
  )
}

// ─── Démarrage ───────────────────────────────────────────────────────────────

{
  const n = vue.reglages.lire<string>('niveau') as Niveau
  if (STRATEGIE_NIVEAU[n] && vue.strategie.id !== STRATEGIE_NIVEAU[n]) vue.definirStrategie(STRATEGIE_NIVEAU[n])
  else recalculer(false)
}

// KaTeX et les fontes Computer Modern arrivent du CDN : on oublie les compositions et les hauteurs
// mesurées avec les fontes de repli, puis on recompose (les blocs visibles seulement).
{
  let fait = false
  const recomposer = () => {
    if (fait) return
    fait = !!katex()
    const fontes = ['400 13px KaTeX_Main', 'italic 400 13px KaTeX_Main', '700 13px KaTeX_Main', 'italic 400 13px KaTeX_Math', '400 13px KaTeX_Size1']
    void Promise.all(fontes.map((f) => document.fonts.load(f))).catch(() => undefined).then(() => {
      etat.composition?.vider()
      cadrerApres = true
      recalculer(false)
      vue.demanderRendu()
    })
  }
  if (katex()) recomposer()
  else {
    document.getElementById('katex-js')?.addEventListener('load', recomposer)
    window.setTimeout(recomposer, 4000)
  }
}

// Convention : le script de capture lit window.rsnVue.
;(window as unknown as { rsnVue: typeof vue; r42: EtatRendu; r42Groupes: typeof etatGroupes }).rsnVue = vue
;(window as unknown as { r42: EtatRendu }).r42 = etat
;(window as unknown as { r42Groupes: typeof etatGroupes }).r42Groupes = etatGroupes

// Sélecteur de jeu, sous le lien vers le catalogue.
{
  const choix = el('select', { class: 'r42-jeu-choix', 'aria-label': 'Raisonnement affiché' }) as HTMLSelectElement
  for (const [cle, libelle] of Object.entries(JEUX)) choix.append(new Option(libelle, cle, false, cle === jeuChoisi))
  choix.addEventListener('change', () => {
    const url = new URL(location.href)
    if (choix.value === 'fontaine') url.searchParams.delete('jeu')
    else url.searchParams.set('jeu', choix.value)
    location.href = url.toString()
  })
  document.body.append(el('label', { class: 'r42-jeu' }, el('span', {}, 'Jeu'), choix))
}
