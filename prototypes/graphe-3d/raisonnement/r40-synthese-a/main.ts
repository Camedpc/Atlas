// R40 · Synthèse (essai A) : la figure LaTeX de R36, organisée en boîtes comme R18, réductible comme R19,
// avec les hypothèses de R37 et les graphiques clés de R35 ; niveaux de détail selon le zoom.
//
// - Base R36 : Computer Modern, énoncés « Lemme 7 (nom). » + formule KaTeX centrée, statut par le trait,
//   confiance en pied, axe des rangs logiques, accolades des zones, légende « Figure 1 – … » sous la figure.
// - Hypothèses de modélisation présentées comme R37 : « Hypothèse (ii) (nom). » + énoncé en italique,
//   « portée : n énoncés », renvois « sous (i), (iii) » ; numérotation (i), (ii)…
// - Boîtes de R18 (sous-problèmes, boîtes imbriquées, teinte et barre de titre, placement boîte par boîte
//   sans chevauchement) ; clic sur une barre : réduire en nœud-fonction / redéployer (R19) ; « ouvrir ↗ » :
//   la boîte seule dans un onglet, fil d'Ariane (R19).
// - Graphiques de R35 : seuls les graphiques clés sont dessinés (règle dans graphiques.ts), les autres à la
//   demande (panneau ☰).
// - Niveaux de détail (rendu.ts) : points colorés loin, titres à mi-distance, contenu complet de près ; le
//   HTML / KaTeX d'un bloc n'est créé qu'au premier affichage complet à l'écran (composition.ts).

import {
  creerVueRaisonnement, el, LIBELLES_TYPE, type Disposition, type ReducteurAreteR, type ReducteurPoint, type VueRaisonnement,
} from '../../src/raisonnement'
import { Composition } from './composition'
import { enLigne, formulesHtml, katex, rendreTex, texConfiance } from './formules'
import { construireFigures, figuresCles, geometrieFigure, legendeFigure, niveauFigure, type Figure } from './graphiques'
import {
  agreger, dansBoite, etatGroupes, horsGroupe, nomGroupe, parentDe, resultatDe, sousProblemeDe, teinteGroupe, TEINTE_ABANDON,
} from './groupes'
import { jeuFontaine } from './jeu-fontaine'
import { MESURES } from './mesures'
import meta from './meta.json'
import { mettreEnPage, type MiseEnPage, type OptionsGroupes } from './mise-en-page'
import {
  cibleSous, dependantsActifs, dessinerDessous, dessinerDessus, lirePaletteR40, niveauDetail, type EtatRendu, type FigurePlacee,
} from './rendu'
import { etatSquelette, NIVEAUX, niveauDeStrategie, STRATEGIE_NIVEAU, type Niveau } from './squelette'

const etat: EtatRendu = {
  page: null,
  palette: { encre: '#000000', gris: '#666666', trait: '#000000', surface: '#ffffff', surface2: '#f2f2f2', accent: '#1c4fa0' },
  cibles: [],
  ciblesGroupes: [],
  survol: null,
  epingles: new Set(),
  hypotheses: new Map(),
  composition: null,
  figures: new Map(),
  fantomes: null,
  compte: { point: 0, titre: 0, complet: 0 },
}

// État de la vision (déclaré avant la vue : ses rappels servent dès la construction).
let corpsPanneau: HTMLElement | null = null
let cadrerApres = true
let epinglesIds = new Set<string>()
/** Choix explicites de l'utilisatrice pour les graphiques (clé de figure → affiché ou non). */
const choixFigures = new Map<string, boolean>()

// ─── Réducteurs : points sigma invisibles, opacité pilotée par la vision ───────

const reducteurPoint: ReducteurPoint = (info, a, vue) => {
  // Sigma ne dessine plus les nœuds : cadres sur le calque « dessus », texte dans la composition HTML.
  a.taille = 0.01
  a.libelle = null
  a.forceLibelle = false
  a.surligne = false
  // Piste abandonnée : grisée par le bloc lui-même, pas par l'opacité (qui la rendrait illisible).
  if (info.noeud.piste === 'abandonnee') a.opacite = Math.min(info.presence, a.opacite / 0.55)
  const sv = etat.survol
  const actifs = dependantsActifs(vue, etat)
  if (sv?.genre === 'pastille') {
    // Survol d'une borne : les blocs qui utilisent ce contexte restent nets.
    const us = etat.page?.usagesPastille.get(sv.noeud)
    a.opacite = info.presence * (us?.includes(info.point) ? 1 : 0.2)
  } else if (sv?.genre === 'renvoi') {
    // Survol d'un renvoi : le bloc cité et ceux qui le citent.
    const us = etat.page?.usagesRenvoi.get(sv.point)
    a.opacite = info.presence * (info.point === sv.point || us?.includes(info.point) ? 1 : 0.2)
  } else if ((sv?.genre === 'titre' || sv?.genre === 'ouvrir') && sv.groupe) {
    // Survol d'une barre de titre : la boîte reste nette, le reste s'atténue un peu.
    const b = etat.page?.boites[info.point]
    a.opacite = info.presence * (b && dansBoite(b.sousProbleme, sv.groupe) ? 1 : 0.45)
  } else if (actifs && vue.survol !== null && sv?.genre === 'drapeau') {
    a.opacite = info.presence * (actifs.has(info.point) ? 1 : 0.22)
  } else if (actifs && !vue.ligneeActive && vue.survol === null) {
    a.opacite = info.presence * (actifs.has(info.point) ? 1 : 0.32)
  } else if (info.survol === 'autre') {
    a.opacite = Math.max(a.opacite, info.presence * 0.5)
  }
}

const reducteurArete: ReducteurAreteR = (info, a) => {
  // Les liaisons de lecture sont tracées (orthogonales) sur le calque « dessous ».
  if (info.genre === 'lecture') a.cache = true
}

// ─── Jeu de données ──────────────────────────────────────────────────────────
// Par défaut, la fontaine de chaîne ; ?jeu=edp : le jeu synthétique.

const JEUX = { fontaine: 'Fontaine de chaîne', edp: 'EDP stochastique (synthétique)' } as const
type Jeu = keyof typeof JEUX
const jeuChoisi: Jeu = new URLSearchParams(location.search).get('jeu') === 'edp' ? 'edp' : 'fontaine'

// ─── Vue ─────────────────────────────────────────────────────────────────────

const D = 'Figure R40'
const DD = 'Niveaux de détail'
const vue = creerVueRaisonnement(document.getElementById('app')!, {
  // Réglages mémorisés par jeu : cadrage et niveau ne se mélangent pas d'un raisonnement à l'autre.
  id: jeuChoisi === 'fontaine' ? meta.id : `${meta.id}-${jeuChoisi}`,
  jeu: jeuChoisi === 'fontaine' ? jeuFontaine() : undefined,
  mode: '2d',
  strategie: STRATEGIE_NIVEAU.auxiliaires,
  reglages: {
    ajusterAspect: false,
    pastillesContexte: true,
    liensSemantiques: true,
    opaciteContexte: 0.22,
    opaciteLiensComplets: 0.22,
  },
  reglagesSupplementaires: [
    { cle: 'niveau', defaut: 'auxiliaires', dossier: D, libelle: 'niveau de lecture', options: Object.fromEntries(NIVEAUX.map((n) => [n.nom, n.id])) },
    { cle: 'largeurCarte', defaut: 184, dossier: D, libelle: 'largeur bloc', min: 140, max: 300, pas: 2 },
    { cle: 'ecartColonnes', defaut: 46, dossier: D, libelle: 'écart colonnes', min: 24, max: 160, pas: 2 },
    { cle: 'ecartLignes', defaut: 18, dossier: D, libelle: 'écart lignes', min: 4, max: 80, pas: 1 },
    { cle: 'taillePolice', defaut: 13, dossier: D, libelle: 'corps du texte', min: 10, max: 18, pas: 0.5 },
    { cle: 'maxPastilles', defaut: 5, dossier: D, libelle: 'bornes max.', min: 0, max: 12, pas: 1 },
    { cle: 'bandesChoix', defaut: 'survol', dossier: D, libelle: 'renvois aux hypothèses', options: { 'au survol / épinglées': 'survol', toujours: 'toujours' } },
    { cle: 'impasses', defaut: true, dossier: D, libelle: 'alternatives non retenues' },
    { cle: 'axe', defaut: true, dossier: D, libelle: 'axe et accolades' },
    { cle: 'legende', defaut: true, dossier: D, libelle: 'légende de figure' },
    { cle: 'graphiques', defaut: 'cles', dossier: D, libelle: 'graphiques', options: { 'clés (+ choisis)': 'cles', tous: 'tous', aucun: 'aucun' } },
    { cle: 'maxGraphiques', defaut: 2, dossier: D, libelle: 'graphiques clés max.', min: 1, max: 3, pas: 1 },
    { cle: 'seuilPoints', defaut: 0.34, dossier: DD, libelle: 'seuil points → titres', min: 0.1, max: 1, pas: 0.01 },
    { cle: 'seuilContenu', defaut: 0.66, dossier: DD, libelle: 'seuil titres → contenu', min: 0.2, max: 1.6, pas: 0.01 },
  ],
  reducteursNoeud: [reducteurPoint],
  reducteursArete: [reducteurArete],
  dessinerDessous: (c) => dessinerDessous(c, etat),
  dessinerDessus: (c) => dessinerDessus(c, etat),
  rendreFiche: (p, v, defaut) => rendreFiche(p, v, defaut),
  panneau: (p, v) => p.ajouterSection('r40', 'Figure', construirePanneau(v), { position: 'lecture' }),
})

// Les pastilles et liens sémantiques par défaut sont remplacés par ceux de la vision.
vue.dessinsDessus.splice(0, 2)
etat.composition = new Composition(vue.scene)

// ─── Fiche de survol ─────────────────────────────────────────────────────────

function rendreFiche(p: number, v: VueRaisonnement, defaut: () => HTMLElement): HTMLElement {
  const f = defaut()
  f.classList.add('r40-fiche')
  const n = v.noeud(p)
  const page = etat.page
  const b = page && p < v.nU ? page.boites[p] : undefined
  const u = p < v.nU ? v.lecture.unites[p] : undefined
  // Titre et énoncé composés (mathématiques en ligne), formules en display, confiance en notation physique.
  const titre = f.querySelector('.rsn-fiche-titre')
  if (titre) titre.innerHTML = enLigne(n.nom)
  const enonce = f.querySelector('.rsn-fiche-enonce')
  if (enonce) {
    enonce.innerHTML = enLigne(n.enonce)
    const fm = formulesHtml(n.enonce)
    if (fm) {
      const d = el('div', { class: 'r40-fiche-formule' })
      d.innerHTML = fm
      enonce.after(d)
    }
  }
  const barre = f.querySelector('.rsn-confiance span')
  if (barre) barre.innerHTML = rendreTex(`${texConfiance(n.confiance)}\\quad [${n.confiance.bas.toFixed(2).replace('.', '{,}')}\\,;\\,${n.confiance.haut.toFixed(2).replace('.', '{,}')}]`, barre.textContent ?? '')
  const aide = f.querySelector('.rsn-aide')
  let texte = 'Clic : lignée · double-clic : cadrer · Échap : effacer'
  if (n.type === 'choix_modelisation') texte = 'Survol : renvois « sous (i) » sur les blocs dépendants · clic : épingler'
  else if (b?.genre === 'fonction') texte = 'Clic sur la barre de la boîte : redéployer · double-clic : ouvrir dans un onglet'
  else if (u && u.membres.length > 1) texte = `Double-clic : ouvrir le sous-système (${u.membres.length} énoncés) · clic : lignée`
  else if (u && dansDeplie(v, p)) texte = 'Double-clic : refermer le sous-système · clic : lignée'
  else if (!u) texte = 'Contexte : clic pour voir les blocs qui l’utilisent'
  if (aide) aide.textContent = texte
  const sv = etat.survol
  const bandeau = (t: string) => f.prepend(el('div', { class: 'r40-fiche-bandeau' }, t))
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
      bandeau(`Boîte réduite ${b.ref}${boite} — ${ag.n} énoncés — statut agrégé : ${statut(ag.statut)} — maillon le plus faible : ${maillon.nom} (${ag.confiance.estimation.toFixed(2).replace('.', ',')})`)
      f.append(listeMembres(v, u.membres))
    } else if (b.genre === 'drapeau') {
      const k = page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0
      bandeau(`Hypothèse ${b.ref} — ${k} énoncé${k > 1 ? 's' : ''} en dépend${k > 1 ? 'ent' : ''}`)
    } else if (b.genre === 'decision') bandeau(`Décision ${b.ref}${boite} — rang ${Math.max(0, b.rang)}`)
    else {
      const trait = n.statut === 'valide' ? 'trait plein : validé' : n.statut === 'incertain' ? 'trait tireté : à vérifier' : 'barré : réfuté'
      bandeau(`${LIBELLES_TYPE[n.type]} ${b.ref}${boite} — rang ${Math.max(0, b.rang)} — ${trait}`)
    }
    // Graphiques de ce bloc : affichés ou disponibles à la demande.
    const figs = figuresDuPoint(p)
    if (figs.length) {
      const l = figs.map((x) => `Figure ${x.numero}${estAffichee(x.fig) ? '' : ' (à la demande : panneau ☰)'}`)
      f.append(el('div', { class: 'r40-fiche-figures' }, `Graphique${figs.length > 1 ? 's' : ''} : ${l.join(' ; ')}`))
    }
  }
  return f
}

/** Membres d'un nœud-fonction, avec leur statut (fiche). */
function listeMembres(v: VueRaisonnement, membres: number[]): HTMLElement {
  const noeuds = v.justification.noeuds
  const liste = el('div', { class: 'r40-membres' })
  for (const m of membres) {
    const n = noeuds[m]!
    const marque = n.statut === 'valide' ? '─' : n.statut === 'incertain' ? '┄' : '╳'
    const nom = el('span', {})
    nom.innerHTML = enLigne(n.nom)
    liste.append(el('div', { class: 'r40-membre' },
      el('span', { class: 'r40-membre-statut', title: n.statut }, marque),
      nom,
      el('span', { class: 'r40-valeur' }, n.confiance.estimation.toFixed(2).replace('.', ','))))
  }
  return liste
}

// ─── Graphiques (R35) : construits une fois par graphe de justification ────────

let cacheFigures: { j: unknown; figures: Figure[]; cles: Set<string>; numeros: Map<string, number> } | null = null

function figuresDuJeu(): { figures: Figure[]; cles: Set<string>; numeros: Map<string, number> } {
  const max = vue.reglages.lire<number>('maxGraphiques')
  if (cacheFigures?.j !== vue.justification) {
    const figures = construireFigures(vue.justification, MESURES[jeuChoisi] ?? {})
    cacheFigures = { j: vue.justification, figures, cles: new Set(), numeros: new Map() }
  }
  cacheFigures.cles = new Set(figuresCles(vue.justification, cacheFigures.figures, max))
  return cacheFigures
}

/** Vrai si la figure est dessinée : clé (ou toutes), sauf choix contraire de l'utilisatrice. */
function estAffichee(fig: Figure): boolean {
  const mode = vue.reglages.lire<string>('graphiques')
  if (mode === 'aucun') return false
  const choix = choixFigures.get(fig.cle)
  if (choix !== undefined) return choix
  return mode === 'tous' || figuresDuJeu().cles.has(fig.cle)
}

/** Point (unité de lecture) d'un nœud de justification, ou null. */
const uniteDe = (i: number): number | null => {
  const u = vue.lecture.uniteDe[i]
  return u !== undefined && u >= 0 ? u : null
}

/** Ancre d'une figure : le bloc qui énonce la loi, sinon celui de la première série mesurée. */
function ancre(fig: Figure): number | null {
  return uniteDe(fig.noeudLoi) ?? fig.series.map((s) => uniteDe(s.noeud)).find((q) => q !== null) ?? null
}

/** Toutes les figures dont l'ancre est le point p (affichées ou non), numérotées. */
function figuresDuPoint(p: number): FigurePlacee[] {
  const { figures, numeros } = figuresDuJeu()
  return figures.filter((f) => ancre(f) === p).map((fig) => ({ fig, legende: '', numero: numeros.get(fig.cle) ?? 0 }))
}

/** Figures affichées par point (avant la mise en page, pour réserver leur place). */
function figuresAffichees(): Map<number, Figure[]> {
  const m = new Map<number, Figure[]>()
  for (const fig of figuresDuJeu().figures) {
    if (!estAffichee(fig)) continue
    const p = ancre(fig)
    if (p === null) continue
    let l = m.get(p)
    if (!l) m.set(p, (l = []))
    l.push(fig)
  }
  return m
}

/** Numérote toutes les figures (ordre des blocs), légendes des figures affichées avec renvois aux blocs. */
function numeroterFigures(page: MiseEnPage, affichees: Map<number, Figure[]>): void {
  const donnees = figuresDuJeu()
  const ref = (i: number) => {
    const u = uniteDe(i)
    return u === null ? null : page.boites[u]?.ref ?? null
  }
  const numeroBloc = (f: Figure) => {
    const p = ancre(f)
    return p === null ? 1e9 : page.boites[p]!.numero + (page.boites[p]!.zone === 0 ? -1e6 : 0)
  }
  const ordre = [...donnees.figures].sort((a, b) => numeroBloc(a) - numeroBloc(b))
  donnees.numeros = new Map(ordre.map((f, k) => [f.cle, k + 1]))
  etat.figures = new Map()
  for (const [p, figs] of affichees) {
    if (!page.boites[p]!.figures) continue
    etat.figures.set(p, figs.map((fig) => {
      const numero = donnees.numeros.get(fig.cle)!
      return { fig, numero, legende: legendeFigure(fig, numero, ref) }
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
  const onglet = etatGroupes.onglet ? ` Onglet : boîte « ${enLigne(nomGroupe(vue.jeu, etatGroupes.onglet))} » seule, avec ses entrées et ses sorties.` : ''
  comp.legende.innerHTML = `<span class="r40-sc">Figure</span> 1 – <i>${enLigne(vue.jeu.titre)}.</i>${resume}${onglet}`
    + ` Graphe de lecture, niveau « ${niveau} » : ${blocs} énoncés, ${dec} décision${dec > 1 ? 's' : ''}, ${hyp} hypothèse${hyp > 1 ? 's' : ''} de modélisation`
    + `${fct ? ` et ${fct} boîte${fct > 1 ? 's' : ''} réduite${fct > 1 ? 's' : ''}` : ''} pour ${s.noeudsComplet} nœuds ; ${s.aretes} liaisons pour ${s.aretesComplet} arêtes de justification.`
    + ` Boîtes teintées : sous-problèmes (clic sur la barre : réduire / déployer ; « ouvrir ↗ » : onglet).`
    + ` Trait plein : validé ; tireté : à vérifier ; barré : réfuté ; pointillé gris : piste abandonnée ; double cadre : résultat ;`
    + ` cadre doublé en retrait : sous-système ou boîte réduite. Losange : décision, × : alternative non retenue ;`
    + ` coins arrondis : hypothèse de modélisation, « sous (i) » : bloc qui en dépend. ${rendreTex('c', 'c')} : confiance estimée, bornes en exposant et en indice ;`
    + ` IA, H, IA+H : validation. Lettres encadrées : contexte (H hypothèse, D définition, O outil, A axiome, L littérature) ; « cf. ${rendreTex('n', 'n')} » : renvoi au bloc ${rendreTex('n', 'n')}.`
}

// ─── Disposition maison ──────────────────────────────────────────────────────

const appliquerDisposition = (d: Disposition, anime: boolean) =>
  (vue as unknown as { appliquerDisposition(d: Disposition, anime: boolean): void }).appliquerDisposition(d, anime)

function positionsPrecedentes(): Map<string, number> | undefined {
  const page = etat.page
  if (!page || !vue.lecture) return undefined
  const m = new Map<string, number>()
  const j = vue.justification
  // Chaque membre hérite de la hauteur de son unité : un sous-système s'ouvre « sur place ».
  for (let p = 0; p < Math.min(vue.nU, vue.disposition.nU); p++) {
    const u = vue.lecture.unites[p]
    if (!u) continue
    const y = -vue.disposition.z[p]! / page.echelle
    u.membres.forEach((mb, k) => m.set(j.noeuds[mb]!.id, y + k * 1e-3))
  }
  return m
}

/** Boîte effective, nœud-fonction, Entrée / Sortie de chaque unité (d'après la dérivation courante). */
function optionsGroupes(): OptionsGroupes {
  const g = vue.lecture
  const r = resultatDe(g)
  const noeuds = g.justification.noeuds
  const jeu = vue.jeu
  const o: OptionsGroupes = {
    sp: [], fonction: [], entree: [], sortie: [],
    onglet: r.onglet,
    nom: (id) => nomGroupe(jeu, id),
    teinte: (id) => teinteGroupe(jeu, id),
    abandonne: (id) => teinteGroupe(jeu, id) === TEINTE_ABANDON,
  }
  for (const u of g.unites) {
    const n = noeuds[u.conclusion]!
    const f = r.fonctions.get(n.id)
    const e = r.entrees.has(n.id), s = r.sorties.has(n.id)
    o.sp.push(e ? '§entree' : s ? '§sortie' : horsGroupe(n) ? '§spec' : f ?? sousProblemeDe(n))
    o.fonction.push(f !== undefined)
    o.entree.push(e)
    o.sortie.push(s)
  }
  return o
}

function recalculer(anime: boolean): void {
  const R = vue.reglages
  const comp = etat.composition!
  const largeur = R.lire<number>('largeurCarte')
  const taille = R.lire<number>('taillePolice')
  const groupes = optionsGroupes()
  // Aucune composition HTML ici : les hauteurs sont estimées (ou déjà mesurées) sans créer d'élément.
  comp.preparer(vue, { largeur, taille }, groupes.fonction)
  const affichees = figuresAffichees()
  const { disposition, page } = mettreEnPage(vue.lecture, {
    largeurCarte: largeur,
    ecartColonnes: R.lire<number>('ecartColonnes'),
    ecartLignes: R.lire<number>('ecartLignes'),
    taillePolice: taille,
    maxPastilles: R.lire<number>('maxPastilles'),
    ecartCouches: R.valeurs.ecartCouches,
    police: vue.palette.police,
    sousProblemes: vue.jeu.sousProblemes,
    precedent: anime ? positionsPrecedentes() : undefined,
    hauteur: (p) => comp.hauteur(p),
    groupes,
    figuresDe: (p) => affichees.get(p)?.length ?? 0,
    hauteurFigure: geometrieFigure(largeur).h,
  })
  comp.couche.classList.toggle('r40-sans-impasses', !R.lire<boolean>('impasses'))
  attribuerHypotheses(page)
  numeroterFigures(page, affichees)
  etat.page = page
  etat.survol = null
  majMarges()
  appliquerDisposition(disposition, anime)
  if (cadrerApres) {
    cadrerApres = false
    vue.cadrerTout(anime ? undefined : 1)
  } else if (anime && horsEcran()) vue.cadrerTout()
  majPanneau()
  majLegende()
  majOnglets()
}

/** Numéros des hypothèses de modélisation présentes ; les épingles suivent les ids. */
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

/** Marges de cadrage : place des onglets en haut ; pas de réserve à droite (pas de libellés sigma). */
function majMarges(): void {
  vue.margesSures = { gauche: 0, droite: -140, haut: 44, bas: 0 }
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

// Cadrage 2D : la figure entière (axe au-dessus, légende dessous) d'après ses bornes exactes. Si elle ne
// tient qu'à une échelle où les blocs seraient des points, on cadre à l'échelle des titres le début du
// raisonnement (en haut à gauche) : jamais de cadrage initial minuscule.
const cadrerToutDefaut = vue.cadrerTout.bind(vue)
vue.cadrerTout = (duree?: number) => {
  const page = etat.page
  if (!page || vue.extrusion > 0.02 || vue.reglages.valeurs.liensComplets) return cadrerToutDefaut(duree)
  const R = vue.reglages
  const b = page.bornes
  const axe = R.lire<boolean>('axe')
  const hLegende = R.lire<boolean>('legende') ? (etat.composition?.legende.offsetHeight || 110) + 30 : 10
  const x0 = b.x0 - 8, x1 = b.x1 + (axe ? 120 : 8)
  const y0 = b.y0 - (axe ? 78 : 8), y1 = b.y1 + hLegende
  const cam = vue.camera
  const z = vue.zoneSure()
  const Wz = Math.max(cam.largeur * 0.25, cam.largeur - z.gauche - z.droite)
  const Hz = Math.max(cam.hauteur * 0.25, cam.hauteur - z.haut - z.bas)
  const sTout = Math.min(Wz / (x1 - x0), Hz / (y1 - y0)) / 1.03
  const sMin = R.lire<number>('seuilPoints') * 1.08
  let rx0 = x0, ry0 = y0, rx1 = x1, ry1 = y1
  if (sTout < sMin) {
    rx1 = x0 + Wz / sMin
    ry1 = y0 + Hz / sMin
  }
  const E = page.echelle
  const pos = new Float32Array([(rx0 - page.cx) * E, 0, -(ry0 - page.cy) * E, (rx1 - page.cx) * E, 0, -(ry1 - page.cy) * E])
  cam.cadrer(pos, [0, 1], duree ?? R.valeurs.dureeTransition, sTout < sMin ? 1 : 1.03, z)
  vue.demanderRendu()
}

// ─── Survol : cibles dessinées (blocs, bornes, hypothèses, barres de titre) ────

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

/** Réduit ou redéploie une boîte ; à la réduction, les anciens blocs se resserrent vers la fonction. */
function basculerReduction(g: string, voulu?: boolean): void {
  const reduire = voulu ?? !etatGroupes.reduits.has(g)
  if (reduire === etatGroupes.reduits.has(g)) return
  const page = etat.page
  if (reduire) {
    etatGroupes.reduits.add(g)
    const pts = page ? [...Array(vue.nU).keys()].filter((p) => dansBoite(page.boites[p]!.sousProbleme, g)) : []
    if (page && pts.length > 1) {
      etat.fantomes = {
        debut: performance.now(),
        duree: vue.reglages.valeurs.dureeTransition,
        groupe: g,
        couleur: teinteGroupe(vue.jeu, g),
        boites: pts.map((p) => ({ x: vue.positions[p * 3]!, z: vue.positions[p * 3 + 2]!, w: page.boites[p]!.w, h: page.boites[p]!.h })),
      }
    }
  } else {
    etatGroupes.reduits.delete(g)
    // Déployer un parent déploie aussi ses boîtes imbriquées.
    for (const x of [...etatGroupes.reduits]) if (dansBoite(x, g)) etatGroupes.reduits.delete(x)
    etat.fantomes = null
  }
  etat.survol = null
  vue.definirStrategie(vue.strategie)
}

function toutBasculer(reduire: boolean): void {
  if (!etat.page) return
  const ids = vue.jeu.sousProblemes.filter((s) => !parentDe(s.id)).map((s) => s.id)
  etatGroupes.reduits.clear()
  if (reduire) for (const id of ids) etatGroupes.reduits.add(id)
  etat.fantomes = null
  vue.definirStrategie(vue.strategie)
}

function ouvrirOnglet(g: string): void {
  if (etatGroupes.onglet === g) return
  etatGroupes.onglet = g
  etat.survol = null
  etat.fantomes = null
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

// Barre d'onglets et fil d'Ariane, sous la barre d'outils.
const barreOnglets = el('nav', { class: 'r40-onglets', 'aria-label': 'Onglets de graphe' })
vue.interface.append(barreOnglets)

function majOnglets(): void {
  const onglet = etatGroupes.onglet
  const racine = vue.jeu.titre.split('(')[0]!.trim()
  const principal = el('button', { type: 'button', class: `r40-onglet${onglet ? '' : ' actif'}`, onclick: () => fermerOnglet() }, racine)
  const enfants: HTMLElement[] = [principal]
  if (onglet) {
    const fermer = el('span', { class: 'r40-onglet-fermer', title: 'Fermer l’onglet', onclick: (e: Event) => {
      e.stopPropagation()
      fermerOnglet()
    } }, '×')
    const o = el('button', { type: 'button', class: 'r40-onglet actif' }, nomGroupe(vue.jeu, onglet), fermer)
    o.style.borderTopColor = teinteGroupe(vue.jeu, onglet)
    enfants.push(o)
  }
  // Fil d'Ariane : racine › boîte parente › boîte.
  const chemin: HTMLElement[] = []
  if (onglet) {
    chemin.push(el('a', { href: '#', onclick: (e: Event) => {
      e.preventDefault()
      fermerOnglet()
    } }, racine))
    const ancetres: string[] = []
    for (let q = parentDe(onglet); q; q = parentDe(q)) ancetres.unshift(q)
    for (const a of ancetres) chemin.push(el('span', { class: 'r40-ariane-sep' }, '›'), el('a', { href: '#', onclick: (e: Event) => {
      e.preventDefault()
      ouvrirOnglet(a)
    } }, nomGroupe(vue.jeu, a)))
    chemin.push(el('span', { class: 'r40-ariane-sep' }, '›'), el('span', {}, nomGroupe(vue.jeu, onglet)))
  } else chemin.push(el('span', {}, racine), el('span', { class: 'r40-ariane-sep' }, '›'), el('i', { class: 'r40-doux' }, 'graphe principal'))
  barreOnglets.replaceChildren(el('div', { class: 'r40-onglets-liste' }, enfants), el('div', { class: 'r40-ariane' }, chemin))
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
    if (b?.genre === 'fonction') return ouvrirOnglet(b.sousProbleme)
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
  else if (['largeurCarte', 'ecartColonnes', 'ecartLignes', 'taillePolice', 'maxPastilles', 'ecartCouches'].includes(cle)) {
    cadrerApres = cle !== 'maxPastilles'
    recalculer(true)
  } else if (cle === 'graphiques' || cle === 'maxGraphiques') recalculer(true)
  else if (cle === 'impasses') {
    etat.composition?.couche.classList.toggle('r40-sans-impasses', !valeur)
    vue.demanderRendu()
  }
  else if (cle === 'legende' || cle === 'axe' || cle === 'seuilPoints' || cle === 'seuilContenu') {
    majMarges()
    vue.demanderRendu()
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
  etat.palette = lirePaletteR40(vue.racine)
})
etat.palette = lirePaletteR40(vue.racine)

// Échelle courante et nombre de blocs par niveau de détail (panneau), mis à jour quand la vue s'arrête.
let minuterieDetail = 0
vue.on('image', () => {
  window.clearTimeout(minuterieDetail)
  minuterieDetail = window.setTimeout(majDetail, 250)
})

// ─── Panneau ☰ ───────────────────────────────────────────────────────────────

let ligneDetail: HTMLElement | null = null

function construirePanneau(v: VueRaisonnement): HTMLElement {
  corpsPanneau = el('div', { class: 'r40-panneau' })
  void v
  return corpsPanneau
}

function majDetail(): void {
  const page = etat.page
  if (!ligneDetail || !page) return
  const s = vue.camera.pixelsParUnite() * page.echelle
  const R = vue.reglages
  const nv = niveauDetail(vue, s)
  const nom = nv === 'point' ? 'points' : nv === 'titre' ? 'titres' : 'contenu complet'
  const c = etat.compte
  const html = etat.composition?.etat()
  ligneDetail.textContent = `Échelle ${s.toFixed(2).replace('.', ',')} (${nom}) ; seuils ${R.lire<number>('seuilPoints').toFixed(2).replace('.', ',')} et ${R.lire<number>('seuilContenu').toFixed(2).replace('.', ',')}.`
    + ` À l’écran : ${c.point} point${c.point > 1 ? 's' : ''}, ${c.titre} titre${c.titre > 1 ? 's' : ''}, ${c.complet} complet${c.complet > 1 ? 's' : ''}.`
    + (html ? ` HTML composé : ${html.crees} bloc${html.crees > 1 ? 's' : ''} depuis le chargement, ${html.attaches} attaché${html.attaches > 1 ? 's' : ''}.` : '')
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
  const boutons = el('div', { class: 'r40-niveaux' }, NIVEAUX.map((n) =>
    el('button', { type: 'button', class: `rsn-bouton${n.id === niveau ? ' actif' : ''}`, onclick: () => definirNiveau(n.id) }, n.nom)))
  const ligne = (k: string, val: string | number) => el('tr', {}, el('td', {}, k), el('td', { class: 'r40-valeur' }, String(val)))
  // Boîtes : une ligne par sous-problème présent (imbriquées en retrait), réduire / déployer et ouvrir.
  const presents = new Set(page.commentaires.map((c) => c.id))
  const boites = v.jeu.sousProblemes.filter((sp) => presents.has(sp.id) || etatGroupes.onglet === sp.id || etatGroupes.reduits.has(sp.id)).map((sp) => {
    const n = page.boites.slice(0, v.nU).reduce((t, b, p) => t + (dansBoite(b.sousProbleme, sp.id) ? v.lecture.unites[p]!.membres.length : 0), 0)
    const reduit = etatGroupes.reduits.has(sp.id) && !r.refus.has(sp.id)
    const teinte = el('span', { class: 'r40-teinte' })
    teinte.style.background = teinteGroupe(v.jeu, sp.id)
    return el('div', { class: `r40-boite${parentDe(sp.id) ? ' r40-imbriquee' : ''}` },
      teinte,
      el('span', { class: 'r40-boite-nom', title: sp.resume }, sp.nom),
      el('span', { class: 'r40-valeur' }, String(n)),
      etatGroupes.onglet
        ? el('span', {})
        : el('button', { type: 'button', class: 'rsn-bouton', disabled: r.refus.has(sp.id), title: r.refus.get(sp.id) ?? '', onclick: () => basculerReduction(sp.id) }, reduit ? 'Déployer' : 'Réduire'),
      el('button', { type: 'button', class: 'rsn-bouton', onclick: () => (etatGroupes.onglet === sp.id ? fermerOnglet() : ouvrirOnglet(sp.id)) }, etatGroupes.onglet === sp.id ? 'Fermer' : 'Ouvrir ↗'))
  })
  const hyps = [...etat.hypotheses].map(([p, ref]) => {
    const n = v.noeud(p)
    const c = el('input', { type: 'checkbox' }) as HTMLInputElement
    c.checked = etat.epingles.has(p)
    c.addEventListener('change', () => basculerEpingle(n.id, c.checked))
    const nom = el('span', { class: 'r40-liste-hyp-nom' })
    nom.innerHTML = enLigne(n.nom)
    return el('label', { class: 'r40-liste-hyp-ligne' }, c,
      el('span', { class: 'r40-ref' }, ref),
      nom,
      el('span', { class: 'r40-valeur' }, `${page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0}`))
  })
  // Graphiques : clés d'abord, puis à la demande ; case « afficher ».
  const donnees = figuresDuJeu()
  const figures = [...donnees.figures].sort((a, b) => (donnees.numeros.get(a.cle) ?? 0) - (donnees.numeros.get(b.cle) ?? 0)).map((fig) => {
    const c = el('input', { type: 'checkbox' }) as HTMLInputElement
    c.checked = estAffichee(fig)
    c.addEventListener('change', () => {
      choixFigures.set(fig.cle, c.checked)
      recalculer(true)
    })
    const p = ancre(fig)
    const nom = el('span', { class: 'r40-figure-nom' })
    nom.innerHTML = `${enLigne(`${fig.y} en fonction de ${fig.x}`)}${p !== null ? ` <span class="r40-doux">(sous ${page.boites[p]!.ref})</span>` : ''}`
    const cle = donnees.cles.has(fig.cle)
    return el('label', { class: 'r40-figure-ligne', title: `Loi : ${v.justification.noeuds[fig.noeudLoi]!.nom} — niveau ${niveauFigure(v.justification, fig)}` }, c,
      el('span', { class: 'r40-ref' }, `Fig. ${donnees.numeros.get(fig.cle) ?? '?'}`),
      nom,
      el('span', { class: 'r40-doux' }, cle ? 'clé' : 'à la demande'))
  })
  const tableau = el('table', { class: 'r40-table' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Élément'), el('th', { class: 'r40-valeur' }, 'Nombre'))),
    el('tbody', {},
      ligne('Blocs visibles / nœuds', `${v.nU} / ${s.noeudsComplet}`),
      ligne('Liaisons / arêtes', `${s.aretes} / ${s.aretesComplet}`),
      ligne('Énoncés · sous-systèmes', `${compte.blocs} · ${compte.sousSystemes}`),
      ligne('Énoncés avec formule', compte.formules),
      ligne('Boîtes · réduites', `${page.commentaires.filter((c) => !c.id.startsWith('§')).length} · ${compte.fonctions}`),
      ligne('Décisions · non retenues', `${compte.decisions} · ${compte.rejetees}`),
      ligne('Hypothèses de modélisation', compte.hypotheses),
      ligne('Graphiques affichés / construits', `${[...etat.figures.values()].reduce((t, l) => t + l.length, 0)} / ${donnees.figures.length}`),
      ligne('Bornes · renvois', `${compte.bornes} · ${compte.renvois}`),
    ),
  )
  ligneDetail = el('div', { class: 'r40-detail' })
  corpsPanneau.replaceChildren(
    el('div', { class: 'rsn-doux rsn-petit' }, 'Niveau de lecture'),
    boutons,
    tableau,
    el('div', { class: 'rsn-groupe-titre' }, etatGroupes.onglet ? 'Boîtes (onglet ouvert)' : 'Boîtes (sous-problèmes)'),
    el('div', { class: 'r40-boites' }, boites),
    etatGroupes.onglet
      ? el('button', { type: 'button', class: 'rsn-bouton', onclick: () => fermerOnglet() }, '← Graphe principal')
      : el('div', { class: 'r40-niveaux' },
          el('button', { type: 'button', class: 'rsn-bouton', onclick: () => toutBasculer(true) }, 'Tout réduire'),
          el('button', { type: 'button', class: 'rsn-bouton', onclick: () => toutBasculer(false) }, 'Tout déployer')),
    etatSquelette.deplies.size
      ? el('button', { type: 'button', class: 'rsn-bouton', onclick: () => {
          etatSquelette.ouvertes.clear()
          etatSquelette.deplies.clear()
          v.definirStrategie(v.strategie)
        } }, `Refermer les sous-systèmes (${etatSquelette.deplies.size})`)
      : el('div', { class: 'rsn-doux rsn-petit' }, 'Double-clic sur un sous-système (cadre doublé en retrait) pour l’ouvrir sur place.'),
    el('div', { class: 'rsn-groupe-titre' }, 'Hypothèses de modélisation (épingler)'),
    el('div', { class: 'r40-liste-hyp' }, hyps),
    el('div', { class: 'rsn-groupe-titre' }, 'Graphiques'),
    figures.length
      ? el('div', { class: 'r40-liste-figures' }, figures)
      : el('div', { class: 'rsn-doux rsn-petit' }, 'Aucune loi de ce jeu n’est confrontée à des mesures.'),
    el('div', { class: 'rsn-groupe-titre' }, 'Niveaux de détail'),
    ligneDetail,
    el('div', { class: 'rsn-groupe-titre' }, 'Lecture'),
    el('div', { class: 'r40-legende-panneau' },
      el('div', {}, 'La légende complète est sous la figure (réglage « légende de figure »).'),
      el('div', {}, el('i', {}, 'Numérotation'), ' : un compteur commun pour les énoncés (Lemme 7, Théorème 12), D pour les décisions, (i), (ii)… pour les hypothèses de modélisation, F pour les boîtes réduites.'),
      el('div', {}, el('i', {}, 'Boîtes'), ' : un sous-problème par boîte teintée, les sous-problèmes « parent.enfant » en boîtes imbriquées ; clic sur la barre : réduire en nœud-fonction (▶ entrées, ● sorties, trait du statut le plus faible, maillon le plus faible) ; « ouvrir ↗ » : onglet.'),
      el('div', {}, el('i', {}, 'Graphiques clés'), ' : la loi d’un résultat principal confrontée aux mesures (règle dans NOTES.md) ; les autres se cochent ci-dessus.'),
      el('div', {}, el('i', {}, 'Zoom'), ' : loin, un carré de la couleur de sa boîte par bloc ; à mi-distance, les titres ; de près, le contenu complet (formules, confiance).'),
      el('div', {}, el('i', {}, 'sous (i)'), ' : le bloc dépend de l’hypothèse (i) (survol ou épingle, en bleu).'),
    ),
  )
  majDetail()
}

// ─── Démarrage ───────────────────────────────────────────────────────────────

{
  const n = vue.reglages.lire<string>('niveau') as Niveau
  if (STRATEGIE_NIVEAU[n] && vue.strategie.id !== STRATEGIE_NIVEAU[n]) vue.definirStrategie(STRATEGIE_NIVEAU[n])
  else recalculer(false)
}

// KaTeX et les fontes Computer Modern arrivent du CDN : on vide le cache HTML (hauteurs et rendus de
// secours) et on recompose ; seuls les blocs visibles au niveau « complet » seront recréés.
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
    const script = document.getElementById('katex-js')
    script?.addEventListener('load', recomposer)
    // Secours : si l'événement est déjà passé ou si le CDN ne répond pas, on compose avec ce qu'on a.
    window.setTimeout(recomposer, 4000)
  }
}

// Convention : le script de capture lit window.rsnVue.
;(window as unknown as { rsnVue: typeof vue; r40: EtatRendu; r40Groupes: typeof etatGroupes }).rsnVue = vue
;(window as unknown as { r40: EtatRendu }).r40 = etat
;(window as unknown as { r40Groupes: typeof etatGroupes }).r40Groupes = etatGroupes

// Sélecteur de jeu, sous le lien vers le catalogue.
{
  const choix = el('select', { class: 'r40-jeu-choix', 'aria-label': 'Raisonnement affiché' }) as HTMLSelectElement
  for (const [cle, libelle] of Object.entries(JEUX)) choix.append(new Option(libelle, cle, false, cle === jeuChoisi))
  choix.addEventListener('change', () => {
    const url = new URL(location.href)
    if (choix.value === 'fontaine') url.searchParams.delete('jeu')
    else url.searchParams.set('jeu', choix.value)
    location.href = url.toString()
  })
  document.body.append(el('label', { class: 'r40-jeu' }, el('span', {}, 'Jeu'), choix))
}
