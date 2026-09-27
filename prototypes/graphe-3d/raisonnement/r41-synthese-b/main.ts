// R41 · Synthèse (essai B) : la figure LaTeX classique de R36, organisée en boîtes comme R18, réductible
// comme R19, avec les hypothèses de R37 et les graphiques clés de R35, et des niveaux de détail selon le zoom.
//
// - Base R36 : Computer Modern, énoncés « Lemme 7 (nom). » + formule KaTeX centrée, statut par le trait,
//   confiance en notation d'incertitude, axe des rangs, accolades des zones, légende « Figure 1 – … ».
// - Hypothèses de modélisation présentées comme R37 : « Hypothèse (ii) (nom). » puis l'énoncé en italique,
//   « portée : n énoncés » ; numérotation (i), (ii)… ; « sous (i), (iii) » sur les blocs dépendants.
// - Boîtes de R18 (sous-problèmes, boîtes imbriquées ; rectangle teinté translucide, barre de titre colorée ;
//   mise en page boîte par boîte sans chevauchement) ; clic sur la barre de titre : réduction en nœud-fonction
//   de R19 (broches, statut agrégé, maillon le plus faible), nouveau clic : redéploiement ; « ouvrir ↗ » :
//   onglet avec fil d'Ariane.
// - Graphiques de R35 (loi confrontée aux mesures), seulement les figures clés d'office (graphiques.ts).
// - Niveaux de détail (rendu.ts) : points colorés loin, titres à distance moyenne, contenu complet de près ;
//   composition HTML / KaTeX paresseuse et limitée aux blocs visibles (composition.ts).

import {
  creerVueRaisonnement, el, LIBELLES_TYPE, type Disposition, type ReducteurAreteR, type ReducteurPoint, type VueRaisonnement,
} from '../../src/raisonnement'
import { Composition, estimerHauteur, type InfosUnite, type OptionsComposition } from './composition'
import { enLigne, formulesHtml, katex, rendreTex, texConfiance } from './formules'
import { construireFigures, figuresCles, geometrieFigure, legendeFigure, type Figure } from './graphiques'
import {
  agreger, etatGroupes, groupeDeNoeud, horsGroupe, nomGroupe, resultatDe, teinteGroupe, TEINTE_SPEC,
} from './groupes'
import { jeuFontaine } from './jeu-fontaine'
import { MESURES } from './mesures'
import meta from './meta.json'
import { genreUnite, mettreEnPage, type MiseEnPage, type OptionsGroupes } from './mise-en-page'
import {
  cibleSous, dependantsActifs, dessinerDessous, dessinerDessus, lirePaletteR41, type EtatRendu,
} from './rendu'
import { etatSquelette, NIVEAUX, niveauDeStrategie, STRATEGIE_NIVEAU, type Niveau } from './squelette'

const etat: EtatRendu = {
  page: null,
  palette: { encre: '#000000', gris: '#666666', trait: '#000000', surface: '#ffffff', surface2: '#f2f2f2', accent: '#1c4fa0' },
  cibles: [],
  survol: null,
  epingles: new Set(),
  hypotheses: new Map(),
  composition: null,
  figures: new Map(),
  appels: new Map(),
  niveau: 'contenu',
}

// État de la vision (déclaré avant la vue : ses rappels servent dès la construction).
let corpsPanneau: HTMLElement | null = null
let cadrerApres = true
let epinglesIds = new Set<string>()
/** Figures montrées à la demande (clé) et figures clés masquées à la demande. */
const figuresDemandees = new Set<string>()
const figuresRetirees = new Set<string>()
/** Numéro de chaque figure (clé) à la dernière mise en page. */
let numerosFigures = new Map<string, number>()

// ─── Réducteurs : points sigma invisibles, opacité pilotée par la vision ───────

const reducteurPoint: ReducteurPoint = (info, a, vue) => {
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
    // Survol d'une barre de titre : la boîte reste nette, le reste s'atténue un peu.
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

const JEUX = { fontaine: 'Fontaine de chaîne', edp: 'EDP stochastique (synthétique)' } as const
type Jeu = keyof typeof JEUX
const jeuChoisi: Jeu = new URLSearchParams(location.search).get('jeu') === 'edp' ? 'edp' : 'fontaine'

// ─── Vue ─────────────────────────────────────────────────────────────────────

const D = 'Figure R41'
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
    { cle: 'niveau', defaut: 'squelette', dossier: D, libelle: 'niveau de détail', options: Object.fromEntries(NIVEAUX.map((n) => [n.nom, n.id])) },
    { cle: 'seuilPoint', defaut: 0.22, dossier: D, libelle: 'zoom : points sous', min: 0.05, max: 1, pas: 0.01 },
    { cle: 'seuilContenu', defaut: 0.55, dossier: D, libelle: 'zoom : contenu dès', min: 0.1, max: 2, pas: 0.01 },
    { cle: 'largeurCarte', defaut: 184, dossier: D, libelle: 'largeur bloc', min: 140, max: 300, pas: 2 },
    { cle: 'ecartColonnes', defaut: 46, dossier: D, libelle: 'écart colonnes', min: 24, max: 160, pas: 2 },
    { cle: 'ecartLignes', defaut: 20, dossier: D, libelle: 'écart lignes', min: 4, max: 80, pas: 1 },
    { cle: 'taillePolice', defaut: 13, dossier: D, libelle: 'corps du texte', min: 10, max: 18, pas: 0.5 },
    { cle: 'maxPastilles', defaut: 5, dossier: D, libelle: 'bornes max.', min: 0, max: 12, pas: 1 },
    { cle: 'figures', defaut: true, dossier: D, libelle: 'graphiques' },
    { cle: 'figuresCles', defaut: 2, dossier: D, libelle: 'graphiques clés', min: 0, max: 3, pas: 1 },
    { cle: 'bandesChoix', defaut: 'survol', dossier: D, libelle: 'renvois aux hypothèses', options: { 'au survol / épinglées': 'survol', toujours: 'toujours' } },
    { cle: 'impasses', defaut: true, dossier: D, libelle: 'alternatives non retenues' },
    { cle: 'axe', defaut: true, dossier: D, libelle: 'axe et accolades' },
    { cle: 'legende', defaut: true, dossier: D, libelle: 'légende de figure' },
  ],
  reducteursNoeud: [reducteurPoint],
  reducteursArete: [reducteurArete],
  dessinerDessous: (c) => dessinerDessous(c, etat),
  dessinerDessus: (c) => dessinerDessus(c, etat),
  rendreFiche: (p, v, defaut) => {
    const f = defaut()
    f.classList.add('r41-fiche')
    const n = v.noeud(p)
    const page = etat.page
    const b = page && p < v.nU ? page.boites[p] : undefined
    const u = p < v.nU ? v.lecture.unites[p] : undefined
    const titre = f.querySelector('.rsn-fiche-titre')
    if (titre) titre.innerHTML = enLigne(b?.genre === 'fonction' ? nomFonction(p) : n.nom)
    const enonce = f.querySelector('.rsn-fiche-enonce')
    if (enonce && b?.genre !== 'fonction') {
      enonce.innerHTML = enLigne(n.enonce)
      const fm = formulesHtml(n.enonce)
      if (fm) {
        const d = el('div', { class: 'r41-fiche-formule' })
        d.innerHTML = fm
        enonce.after(d)
      }
    }
    const barre = f.querySelector('.rsn-confiance span')
    if (barre) barre.innerHTML = rendreTex(`${texConfiance(n.confiance)}\\quad [${n.confiance.bas.toFixed(2).replace('.', '{,}')}\\,;\\,${n.confiance.haut.toFixed(2).replace('.', '{,}')}]`, barre.textContent ?? '')
    const aide = f.querySelector('.rsn-aide')
    let texte = 'Clic : lignée · double-clic : cadrer · Échap : effacer'
    if (n.type === 'choix_modelisation') texte = 'Survol : renvois sur les blocs dépendants · clic : épingler'
    else if (b?.genre === 'fonction') texte = 'Double-clic : ouvrir le sous-graphe dans un onglet · clic sur la barre de titre : redéployer'
    else if (b?.externe) texte = 'Double-clic : revenir au graphe principal'
    else if (u && u.membres.length > 1) texte = `Double-clic : ouvrir le sous-système (${u.membres.length} énoncés) · clic : lignée`
    else if (u && dansDeplie(v, p)) texte = 'Double-clic : refermer le sous-système · clic : lignée'
    else if (!u) texte = 'Contexte : clic pour voir les blocs qui l’utilisent'
    if (aide) aide.textContent = texte
    const sv = etat.survol
    const bandeau = (t: string) => f.prepend(el('div', { class: 'r41-fiche-bandeau' }, t))
    if (page && sv?.genre === 'pastille') {
      const k = page.usagesPastille.get(sv.noeud)?.length ?? 0
      bandeau(`Borne de contexte — ${k} bloc${k > 1 ? 's' : ''} l’utilise${k > 1 ? 'nt' : ''}`)
    } else if (page && sv?.genre === 'renvoi') {
      const k = page.usagesRenvoi.get(sv.point)?.length ?? 0
      bandeau(`Renvoi à ${page.boites[sv.point]?.ref} — cité par ${k} bloc${k > 1 ? 's' : ''} en aval`)
    } else if (page && b && u) {
      const statut = (s: string) => (s === 'valide' ? 'validé' : s === 'incertain' ? 'à vérifier' : 'réfuté')
      if (b.genre === 'fonction') {
        const ag = agreger(v.justification.noeuds, u.membres)
        const maillon = v.justification.noeuds[ag.maillon]!
        bandeau(`Sous-problème ${b.ref} réduit — ${ag.n} énoncés — statut le plus faible : ${statut(ag.statut)} — maillon le plus faible : ${maillon.nom} (c = ${ag.confiance.estimation.toFixed(2).replace('.', ',')})`)
        f.append(listeMembres(v, u.membres))
      } else if (b.genre === 'drapeau') {
        const k = page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0
        bandeau(`Hypothèse ${b.ref} — ${k} énoncé${k > 1 ? 's' : ''} en dépend${k > 1 ? 'ent' : ''}`)
      } else if (b.genre === 'decision') bandeau(`Décision ${b.ref} — rang ${Math.max(0, b.rang)}`)
      else {
        const boite = b.sousProbleme ? ` — ${nomGroupe(v.jeu, b.sousProbleme)}` : ''
        const trait = n.statut === 'valide' ? 'trait plein : validé' : n.statut === 'incertain' ? 'trait tireté : à vérifier' : 'barré : réfuté'
        bandeau(`${LIBELLES_TYPE[n.type]} ${b.ref} — rang ${Math.max(0, b.rang)}${boite} — ${trait}`)
      }
    }
    return f
  },
  panneau: (p, v) => p.ajouterSection('r41', 'Figure', construirePanneau(v), { position: 'lecture' }),
})

// Les pastilles et liens sémantiques par défaut sont remplacés par ceux de la vision.
vue.dessinsDessus.splice(0, 2)
etat.composition = new Composition(vue.scene)

function listeMembres(v: VueRaisonnement, membres: number[]): HTMLElement {
  const noeuds = v.justification.noeuds
  const liste = el('div', { class: 'r41-membres' })
  for (const m of membres) {
    const n = noeuds[m]!
    const marque = n.statut === 'valide' ? '—' : n.statut === 'incertain' ? '- -' : '×'
    const nom = el('span', {})
    nom.innerHTML = enLigne(n.nom)
    liste.append(el('div', { class: 'r41-membre' },
      el('span', { class: 'r41-membre-statut', title: n.statut }, marque),
      nom,
      el('span', { class: 'r41-valeur' }, n.confiance.estimation.toFixed(2).replace('.', ','))))
  }
  return liste
}

/** Nom du sous-problème représenté par un nœud-fonction. */
function nomFonction(p: number): string {
  const n = vue.noeud(p)
  const g = resultatDe(vue.lecture).fonctions.get(n.id)
  return g ? nomGroupe(vue.jeu, g) : n.nom
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
  const onglet = etatGroupes.onglet ? ` Onglet : sous-graphe « ${enLigne(nomGroupe(vue.jeu, etatGroupes.onglet))} » seul, avec ses entrées et ses utilisateurs directs (cadre tireté gris).` : ''
  comp.legende.innerHTML = `<span class="r41-sc">Figure</span> 1 – <i>${enLigne(vue.jeu.titre)}.</i>${resume}${onglet}`
    + ` Graphe de lecture, niveau « ${niveau} » : ${blocs} énoncés, ${dec} décision${dec > 1 ? 's' : ''}, ${hyp} hypothèse${hyp > 1 ? 's' : ''} de modélisation`
    + `${fct ? ` et ${fct} sous-problème${fct > 1 ? 's' : ''} réduit${fct > 1 ? 's' : ''} (§)` : ''} pour ${s.noeudsComplet} nœuds ; ${s.aretes} liaisons pour ${s.aretesComplet} arêtes de justification.`
    + ` Boîtes teintées : sous-problèmes (clic sur la barre de titre : réduire en un bloc à broches ▷ entrées, ● sorties ; « ouvrir ↗ » : onglet).`
    + ` Trait plein : validé ; tireté : à vérifier ; barré : réfuté ; pointillé gris : piste abandonnée ; double cadre : résultat ;`
    + ` cadre doublé en retrait : sous-système (double-clic pour l’ouvrir). Losange : décision, × : alternative non retenue.`
    + ` ${rendreTex('c', 'c')} : confiance estimée, en exposant et en indice les bornes de son intervalle ; min ${rendreTex('c', 'c')} : maillon le plus faible d’un sous-problème réduit ;`
    + ` IA, H, IA+H : validation. Lettres encadrées : contexte (H hypothèse, D définition, O outil, A axiome, L littérature) ; « cf. ${rendreTex('n', 'n')} » : renvoi au bloc ${rendreTex('n', 'n')} ;`
    + ` « sous (i) » : dépend de l’hypothèse (i). Graphiques : prédiction en trait plein, mesures avec barres d’erreur ; « voir fig. ${rendreTex('n', 'n')} » : graphique disponible à la demande.`
}

// ─── Figures (R35) ───────────────────────────────────────────────────────────

let cacheFigures: { j: unknown; figures: Figure[] } | null = null
function figuresDuJeu(): Figure[] {
  if (cacheFigures?.j !== vue.justification) {
    cacheFigures = { j: vue.justification, figures: construireFigures(vue.justification, MESURES[jeuChoisi] ?? {}) }
  }
  return cacheFigures.figures
}

const uniteDe = (i: number): number | null => {
  const u = vue.lecture.uniteDe[i]!
  return u >= 0 ? u : null
}

/** Figures par point : affichées (clés, ou demandées) et à la demande. */
function ancrerFigures(): Map<number, { affichees: Figure[]; appels: Figure[] }> {
  const m = new Map<number, { affichees: Figure[]; appels: Figure[] }>()
  if (!vue.reglages.lire<boolean>('figures')) return m
  const figures = figuresDuJeu()
  const cles = figuresCles(vue.justification, figures, vue.reglages.lire<number>('figuresCles'))
  const fonctions = resultatDe(vue.lecture).fonctions
  for (const fig of figures) {
    const p = uniteDe(fig.noeudLoi) ?? fig.series.map((s) => uniteDe(s.noeud)).find((q) => q !== null) ?? null
    if (p === null) continue
    let l = m.get(p)
    if (!l) m.set(p, (l = { affichees: [], appels: [] }))
    // Sous un sous-problème réduit, une figure n'est qu'un renvoi « voir fig. n » (le détail est replié).
    const reduit = fonctions.has(vue.noeud(p).id)
    const affichee = reduit ? figuresDemandees.has(fig.cle) : (cles.has(fig.cle) && !figuresRetirees.has(fig.cle)) || figuresDemandees.has(fig.cle)
    ;(affichee ? l.affichees : l.appels).push(fig)
  }
  return m
}

/** Affiche ou retire une figure (d'après ce qui est affiché à la dernière mise en page). */
function basculerFigure(cle: string): void {
  const affichee = [...etat.figures.values()].some((l) => l.some((f) => f.fig.cle === cle))
  if (affichee) {
    figuresDemandees.delete(cle)
    figuresRetirees.add(cle)
  } else {
    figuresRetirees.delete(cle)
    figuresDemandees.add(cle)
  }
  etat.survol = null
  recalculer(true)
}

/** Numéros (ordre des blocs) et légendes des figures. */
function numeroterFigures(page: MiseEnPage, ancres: Map<number, { affichees: Figure[]; appels: Figure[] }>): void {
  const ref = (i: number) => {
    const u = uniteDe(i)
    return u === null ? null : page.boites[u]?.ref ?? null
  }
  const points = [...ancres.keys()].sort((a, b) => page.boites[a]!.numero - page.boites[b]!.numero || a - b)
  let k = 0
  etat.figures = new Map()
  etat.appels = new Map()
  numerosFigures = new Map()
  for (const p of points) {
    const a = ancres.get(p)!
    const figs = a.affichees.map((fig) => {
      const numero = ++k
      numerosFigures.set(fig.cle, numero)
      return { fig, numero, legende: legendeFigure(fig, numero, ref) }
    })
    if (figs.length) etat.figures.set(p, figs)
    const appels = a.appels.map((fig) => {
      const numero = ++k
      numerosFigures.set(fig.cle, numero)
      return { cle: fig.cle, numero }
    })
    if (appels.length) etat.appels.set(p, appels)
  }
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

/** Sous-problème d'affichage, nœud-fonction, entrée / sortie d'onglet de chaque unité. */
function optionsGroupes(): OptionsGroupes {
  const g = vue.lecture
  const r = resultatDe(g)
  const noeuds = g.justification.noeuds
  const o: OptionsGroupes = {
    sp: [], fonction: [], externe: [], onglet: r.onglet, reduits: new Set(etatGroupes.reduits), refus: new Set(r.refus.keys()),
  }
  for (const u of g.unites) {
    const n = noeuds[u.conclusion]!
    const f = r.fonctions.get(n.id)
    const externe = r.entrees.has(n.id) ? 'entree' : r.sorties.has(n.id) ? 'sortie' : ''
    o.externe.push(externe)
    o.fonction.push(f !== undefined)
    o.sp.push(horsGroupe(n) || externe ? null : f ?? groupeDeNoeud(n))
  }
  return o
}

function optionsComposition(): OptionsComposition {
  const T = vue.reglages.lire<number>('taillePolice')
  return { largeur: vue.reglages.lire<number>('largeurCarte'), taille: T, rangee: Math.round(T * 1.35), piedFonction: Math.round(T * 1.45) }
}

function recalculer(anime: boolean): void {
  const R = vue.reglages
  const comp = etat.composition!
  const o = optionsComposition()
  const G = optionsGroupes()
  const infos = (p: number): InfosUnite => ({
    nomGroupe: G.fonction[p] ? nomFonction(p) : undefined,
    externe: G.externe[p] ?? '',
  })
  // Hauteurs estimées sans DOM : la composition HTML ne sera faite qu'à l'affichage rapproché.
  const hauteurs = new Map<number, number>()
  for (let p = 0; p < vue.nU; p++) hauteurs.set(p, estimerHauteur(vue, p, genreUnite(vue.lecture, G, p), o, infos(p)))
  const ancres = ancrerFigures()
  const { disposition, page } = mettreEnPage(vue.lecture, {
    largeurCarte: o.largeur,
    ecartColonnes: R.lire<number>('ecartColonnes'),
    ecartLignes: R.lire<number>('ecartLignes'),
    taillePolice: o.taille,
    maxPastilles: R.lire<number>('maxPastilles'),
    ecartCouches: R.valeurs.ecartCouches,
    sousProblemes: vue.jeu.sousProblemes,
    teinte: (id) => teinteGroupe(vue.jeu, id),
    teinteSpec: TEINTE_SPEC,
    groupes: G,
    hauteurs,
    rangee: o.rangee,
    piedFonction: o.piedFonction,
    figuresDe: (p) => {
      const a = ancres.get(p)
      return { affichees: a?.affichees.map((f) => f.cle) ?? [], appels: a?.appels.map((f) => f.cle) ?? [] }
    },
    hauteurFigure: geometrieFigure(o.largeur).h,
    precedent: anime ? positionsPrecedentes() : undefined,
  })
  numeroterFigures(page, ancres)
  comp.preparer(vue, page, o, infos)
  attribuerHypotheses(page)
  etat.page = page
  etat.survol = null
  majMarges()
  majLegende()
  appliquerDisposition(disposition, anime)
  if (cadrerApres) {
    cadrerApres = false
    vue.cadrerTout(anime ? undefined : 1)
  } else if (anime && horsEcran()) vue.cadrerTout()
  majPanneau()
  majOnglets()
}

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

/** Marges de cadrage : la vue réserve 150 px à droite pour des libellés que R41 n'a pas ; place du fil d'Ariane. */
function majMarges(): void {
  vue.margesSures = { gauche: 0, droite: -150, haut: 30, bas: 0 }
}

function horsEcran(): boolean {
  const d = vue.disposition
  const cam = vue.camera
  for (let p = 0; p < d.nU; p++) {
    const q = cam.projeterPoint([d.x[p]!, 0, d.z[p]!])
    if (q.x < 40 || q.x > cam.largeur - 40 || q.y < 60 || q.y > cam.hauteur - 60) return true
  }
  return false
}

vue.redisposer = async () => recalculer(true)

// Cadrage 2D : la figure entière (axe en haut, boîtes, légende en bas), à la taille de l'écran.
const cadrerToutDefaut = vue.cadrerTout.bind(vue)
vue.cadrerTout = (duree?: number) => {
  const page = etat.page
  if (!page || vue.extrusion > 0.02 || vue.reglages.valeurs.liensComplets) return cadrerToutDefaut(duree)
  const E = page.echelle
  const b = page.bornes
  const axe = vue.reglages.lire<boolean>('axe') ? 78 : 0
  const larg = Math.min(900, Math.max(460, b.x1 - b.x0))
  const legende = vue.reglages.lire<boolean>('legende') && etat.composition ? 26 + etat.composition.hauteurLegende(larg) : 0
  const x0 = Math.min(b.x0, (b.x0 + b.x1) / 2 - larg / 2), x1 = Math.max(b.x1, (b.x0 + b.x1) / 2 + larg / 2) + 90
  const pos = new Float32Array([(x0 - page.cx) * E, 0, -(b.y0 - axe - page.cy) * E, (x1 - page.cx) * E, 0, -(b.y1 + legende - page.cy) * E])
  vue.camera.cadrer(pos, [0, 1], duree ?? vue.reglages.valeurs.dureeTransition, 1.03, vue.zoneSure())
  vue.demanderRendu()
}

// ─── Survol et clics : blocs, bornes, barres de titre, figures ───────────────

vue.pointSous = (x: number, y: number) => {
  const c = cibleSous(etat, x, y)
  const avant = etat.survol
  etat.survol = c
  const change = avant?.genre !== c?.genre || avant?.noeud !== c?.noeud || avant?.point !== c?.point || avant?.groupe !== c?.groupe || avant?.cle !== c?.cle
  if (change && ['pastille', 'renvoi', 'titre', 'ouvrir', 'appel'].some((g) => avant?.genre === g || c?.genre === g)) vue.demanderRendu()
  vue.scene.style.cursor = c?.genre === 'titre' || c?.genre === 'ouvrir' || c?.genre === 'appel' ? 'pointer' : ''
  if (!c || c.genre === 'titre' || c.genre === 'ouvrir' || c.genre === 'appel') return null
  if (c.genre === 'pastille') return vue.pointDeNoeud(c.noeud)
  return c.point
}

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
  if (p === null && sv?.genre === 'appel' && sv.cle) return basculerFigure(sv.cle)
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

function basculerReduction(g: string, voulu?: boolean): void {
  const reduire = voulu ?? !etatGroupes.reduits.has(g)
  if (reduire === etatGroupes.reduits.has(g)) return
  if (reduire) etatGroupes.reduits.add(g)
  else {
    etatGroupes.reduits.delete(g)
    // Redéployer un parent redéploie aussi ses boîtes imbriquées.
    for (const h of [...etatGroupes.reduits]) if (h.startsWith(`${g}.`)) etatGroupes.reduits.delete(h)
  }
  etat.survol = null
  vue.definirStrategie(vue.strategie)
}

function toutBasculer(reduire: boolean): void {
  if (reduire) for (const s of vue.jeu.sousProblemes) if (!s.id.includes('.')) etatGroupes.reduits.add(s.id)
  if (!reduire) etatGroupes.reduits.clear()
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

// Onglet et fil d'Ariane, sous la barre d'outils.
const barreOnglets = el('nav', { class: 'r41-onglets', 'aria-label': 'Onglets de graphe' })
vue.interface.append(barreOnglets)

function majOnglets(): void {
  const onglet = etatGroupes.onglet
  const racine = vue.jeu.titre.split('(')[0]!.trim()
  if (!onglet) {
    barreOnglets.replaceChildren()
    barreOnglets.hidden = true
    return
  }
  barreOnglets.hidden = false
  const retour = el('a', { href: '#', onclick: (e: Event) => {
    e.preventDefault()
    fermerOnglet()
  } }, racine)
  const fermer = el('button', { type: 'button', class: 'r41-onglet-fermer', title: 'Fermer l’onglet', onclick: () => fermerOnglet() }, '×')
  const chemin: HTMLElement[] = [retour]
  // Fil d'Ariane : racine › parent › sous-problème (boîtes imbriquées).
  const ids: string[] = []
  for (let s: string | null = onglet; s; s = s.includes('.') ? s.slice(0, s.lastIndexOf('.')) : null) ids.unshift(s)
  ids.forEach((id, k) => {
    chemin.push(el('span', { class: 'r41-ariane-sep' }, '›'))
    chemin.push(k === ids.length - 1 ? el('span', { class: 'r41-ariane-ici' }, nomGroupe(vue.jeu, id))
      : el('a', { href: '#', onclick: (e: Event) => {
          e.preventDefault()
          etatGroupes.onglet = id
          cadrerApres = true
          vue.definirStrategie(vue.strategie)
        } }, nomGroupe(vue.jeu, id)))
  })
  barreOnglets.replaceChildren(el('div', { class: 'r41-ariane' }, chemin, fermer))
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
    if (etat.survol?.genre === 'titre' || etat.survol?.genre === 'ouvrir' || etat.survol?.genre === 'appel') return
    return vue.cadrerTout()
  }
  if (p < vue.nU) {
    const b = etat.page?.boites[p]
    if (b?.genre === 'fonction') {
      const g = resultatDe(vue.lecture).fonctions.get(vue.noeud(p).id)
      if (g) return ouvrirOnglet(g)
    }
    if (b?.externe) return fermerOnglet()
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

// ─── Niveau de détail et réglages ────────────────────────────────────────────

function definirNiveau(n: Niveau): void {
  if (vue.reglages.lire<string>('niveau') !== n) return vue.reglages.definir('niveau', n)
  if (vue.strategie.id === STRATEGIE_NIVEAU[n]) return
  cadrerApres = true
  vue.definirStrategie(STRATEGIE_NIVEAU[n])
}

vue.on('reglage', ({ cle, valeur }) => {
  if (cle === 'niveau') definirNiveau(valeur as Niveau)
  else if (['largeurCarte', 'ecartColonnes', 'ecartLignes', 'taillePolice', 'maxPastilles', 'ecartCouches', 'figures', 'figuresCles'].includes(cle)) {
    cadrerApres = !['maxPastilles', 'figures', 'figuresCles'].includes(cle)
    recalculer(true)
  } else if (cle === 'impasses') {
    etat.composition?.couche.classList.toggle('r41-sans-impasses', !valeur)
    vue.demanderRendu()
  } else if (['legende', 'axe', 'seuilPoint', 'seuilContenu'].includes(cle)) {
    vue.demanderRendu()
    window.setTimeout(majPanneau, 0)
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
  etat.palette = lirePaletteR41(vue.racine)
})
etat.palette = lirePaletteR41(vue.racine)

// Niveau de détail courant dans le panneau (mis à jour quand il change).
{
  let dernier = ''
  vue.on('image', () => {
    if (etat.niveau === dernier) return
    dernier = etat.niveau
    majPanneau()
  })
}

// ─── Panneau ☰ ───────────────────────────────────────────────────────────────

function construirePanneau(v: VueRaisonnement): HTMLElement {
  corpsPanneau = el('div', { class: 'r41-panneau' })
  void v
  return corpsPanneau
}

function majPanneau(): void {
  if (!corpsPanneau || !etat.page) return
  const v = vue
  const page = etat.page
  const niveau = niveauDeStrategie(v.strategie.id)
  const compte = { blocs: 0, fonctions: 0, decisions: 0, hypotheses: 0, rejetees: 0, bornes: 0, renvois: 0, formules: 0 }
  for (let p = 0; p < v.nU; p++) {
    const b = page.boites[p]!
    if (b.genre === 'drapeau') compte.hypotheses++
    else if (b.genre === 'decision') {
      compte.decisions++
      if (b.impasse) compte.rejetees++
    } else if (b.genre === 'fonction') compte.fonctions++
    else {
      compte.blocs++
      if (formulesHtml(v.noeud(p).enonce)) compte.formules++
    }
    compte.bornes += b.pastilles.length
    compte.renvois += b.renvois.length
  }
  const s = v.lecture.stats
  const r = resultatDe(v.lecture)
  const boutons = el('div', { class: 'r41-niveaux' }, NIVEAUX.map((n) =>
    el('button', { type: 'button', class: `rsn-bouton${n.id === niveau ? ' actif' : ''}`, onclick: () => definirNiveau(n.id) }, n.nom)))
  const ligne = (k: string, val: string | number) => el('tr', {}, el('td', {}, k), el('td', { class: 'r41-valeur' }, String(val)))
  const tableau = el('table', { class: 'r41-table' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Élément'), el('th', { class: 'r41-valeur' }, 'Nombre'))),
    el('tbody', {},
      ligne('Blocs visibles / nœuds', `${v.nU} / ${s.noeudsComplet}`),
      ligne('Liaisons / arêtes', `${s.aretes} / ${s.aretesComplet}`),
      ligne('Énoncés · avec formule', `${compte.blocs} · ${compte.formules}`),
      ligne('Sous-problèmes réduits', compte.fonctions),
      ligne('Décisions · non retenues', `${compte.decisions} · ${compte.rejetees}`),
      ligne('Hypothèses de modélisation', compte.hypotheses),
      ligne('Bornes · renvois', `${compte.bornes} · ${compte.renvois}`),
      ligne('Blocs composés (HTML)', etat.composition?.composes ?? 0),
    ),
  )
  // Boîtes : un sous-problème par ligne, réduire / redéployer, ouvrir dans un onglet.
  const presents = new Map(page.commentaires.map((c) => [c.id, c]))
  const boites = v.jeu.sousProblemes.filter((sp) => presents.has(sp.id) || etatGroupes.onglet === sp.id).map((sp) => {
    const c = presents.get(sp.id)
    const reduit = etatGroupes.reduits.has(sp.id) && !r.refus.has(sp.id)
    const teinte = el('span', { class: 'r41-teinte' })
    teinte.style.background = teinteGroupe(v.jeu, sp.id)
    const nom = el('span', { class: `r41-groupe-nom${sp.id.includes('.') ? ' r41-imbrique' : ''}`, title: sp.resume })
    nom.innerHTML = enLigne(sp.nom)
    return el('div', { class: 'r41-groupe' },
      teinte,
      nom,
      el('span', { class: 'r41-valeur' }, String(c?.enonces ?? '')),
      etatGroupes.onglet
        ? el('span', {})
        : el('button', { type: 'button', class: 'rsn-bouton', disabled: r.refus.has(sp.id), title: r.refus.has(sp.id) ? 'La réduction créerait un cycle' : '', onclick: () => basculerReduction(sp.id) }, reduit ? 'Déployer' : 'Réduire'),
      el('button', { type: 'button', class: 'rsn-bouton', onclick: () => (etatGroupes.onglet === sp.id ? fermerOnglet() : ouvrirOnglet(sp.id)) }, etatGroupes.onglet === sp.id ? 'Fermer' : 'Ouvrir ↗'))
  })
  // Graphiques : clés affichés d'office, les autres à la demande.
  const figures = v.reglages.lire<boolean>('figures') ? figuresDuJeu() : []
  const cles = figuresCles(v.justification, figures, v.reglages.lire<number>('figuresCles'))
  const listeFigures = figures.map((fig) => {
    const c = el('input', { type: 'checkbox' }) as HTMLInputElement
    c.checked = [...etat.figures.values()].some((l) => l.some((f) => f.fig.cle === fig.cle))
    c.addEventListener('change', () => basculerFigure(fig.cle))
    const t = el('span', { class: 'r41-hyp-liste-nom' })
    t.innerHTML = `${rendreTex(`${versTex(fig.y)}\\ \\text{contre}\\ ${versTex(fig.x)}`, `${fig.y} contre ${fig.x}`)} <span class="r41-doux">(${enLigne(v.justification.noeuds[fig.noeudLoi]!.nom)})</span>`
    return el('label', { class: 'r41-hyp-liste' }, c,
      el('span', { class: 'r41-ref' }, numerosFigures.has(fig.cle) ? `${numerosFigures.get(fig.cle)}` : '—'), t,
      el('span', { class: 'r41-valeur' }, cles.has(fig.cle) ? 'clé' : ''))
  })
  const hyps = [...etat.hypotheses].map(([p, ref]) => {
    const n = v.noeud(p)
    const c = el('input', { type: 'checkbox' }) as HTMLInputElement
    c.checked = etat.epingles.has(p)
    c.addEventListener('change', () => basculerEpingle(n.id, c.checked))
    const nom = el('span', { class: 'r41-hyp-liste-nom' })
    nom.innerHTML = enLigne(n.nom)
    return el('label', { class: 'r41-hyp-liste' }, c,
      el('span', { class: 'r41-ref' }, ref),
      nom,
      el('span', { class: 'r41-valeur' }, `${page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0}`))
  })
  const sp = v.reglages.lire<number>('seuilPoint'), sc = v.reglages.lire<number>('seuilContenu')
  const nomNiveau = etat.niveau === 'point' ? 'points (vue lointaine)' : etat.niveau === 'titre' ? 'titres seuls' : 'contenu complet'
  corpsPanneau.replaceChildren(
    el('div', { class: 'rsn-doux rsn-petit' }, 'Niveau de détail du raisonnement'),
    boutons,
    tableau,
    el('div', { class: 'rsn-groupe-titre' }, etatGroupes.onglet ? 'Boîtes (onglet ouvert)' : 'Boîtes (sous-problèmes)'),
    el('div', { class: 'r41-groupes' }, boites),
    etatGroupes.onglet
      ? el('button', { type: 'button', class: 'rsn-bouton', onclick: () => fermerOnglet() }, '← Graphe principal')
      : el('div', { class: 'r41-niveaux' },
          el('button', { type: 'button', class: 'rsn-bouton', onclick: () => toutBasculer(true) }, 'Tout réduire'),
          el('button', { type: 'button', class: 'rsn-bouton', onclick: () => toutBasculer(false) }, 'Tout déployer')),
    etatSquelette.deplies.size
      ? el('button', { type: 'button', class: 'rsn-bouton', onclick: () => {
          etatSquelette.ouvertes.clear()
          etatSquelette.deplies.clear()
          v.definirStrategie(v.strategie)
        } }, `Refermer les sous-systèmes (${etatSquelette.deplies.size})`)
      : el('div', { class: 'rsn-doux rsn-petit' }, 'Double-clic sur un sous-système (cadre doublé en retrait) pour l’ouvrir sur place.'),
    el('div', { class: 'rsn-groupe-titre' }, 'Graphiques (clés d’office, autres à la demande)'),
    figures.length ? el('div', { class: 'r41-liste-hyp' }, listeFigures) : el('div', { class: 'rsn-doux rsn-petit' }, 'Aucune loi confrontée à des mesures dans ce jeu.'),
    el('div', { class: 'rsn-groupe-titre' }, 'Hypothèses de modélisation (épingler)'),
    el('div', { class: 'r41-liste-hyp' }, hyps),
    el('div', { class: 'rsn-groupe-titre' }, 'Zoom'),
    el('div', { class: 'r41-legende-panneau' },
      el('div', {}, el('i', {}, 'Affichage'), ` : ${nomNiveau}.`),
      el('div', {}, `Points sous ${sp.toFixed(2).replace('.', ',')} px par unité de figure, titres jusqu’à ${sc.toFixed(2).replace('.', ',')}, contenu complet au-delà (réglages « zoom »).`),
      el('div', {}, 'Le contenu (formules KaTeX) n’est composé que pour les blocs visibles en vue rapprochée, puis gardé en cache.'),
    ),
  )
}

/** Symbole Unicode court (« v² », « h₂ ») → LaTeX pour le panneau. */
function versTex(s: string): string {
  const ind: Record<string, string> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3' }
  const exp: Record<string, string> = { '²': '2', '³': '3' }
  let t = ''
  for (const ch of s) t += ind[ch] ? `_{${ind[ch]}}` : exp[ch] ? `^{${exp[ch]}}` : ch
  return t
}

// ─── Démarrage ───────────────────────────────────────────────────────────────

{
  const n = vue.reglages.lire<string>('niveau') as Niveau
  if (STRATEGIE_NIVEAU[n] && vue.strategie.id !== STRATEGIE_NIVEAU[n]) vue.definirStrategie(STRATEGIE_NIVEAU[n])
  else recalculer(false)
}

// KaTeX et les fontes Computer Modern arrivent du CDN : estimations refaites, cache de composition vidé.
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

;(window as unknown as { rsnVue: typeof vue; r41: EtatRendu; r41Groupes: typeof etatGroupes }).rsnVue = vue
;(window as unknown as { r41: EtatRendu }).r41 = etat
;(window as unknown as { r41Groupes: typeof etatGroupes }).r41Groupes = etatGroupes

// Sélecteur de jeu, sous le lien vers le catalogue.
{
  const choix = el('select', { class: 'r41-jeu-choix', 'aria-label': 'Raisonnement affiché' }) as HTMLSelectElement
  for (const [cle, libelle] of Object.entries(JEUX)) choix.append(new Option(libelle, cle, false, cle === jeuChoisi))
  choix.addEventListener('change', () => {
    const url = new URL(location.href)
    if (choix.value === 'fontaine') url.searchParams.delete('jeu')
    else url.searchParams.set('jeu', choix.value)
    location.href = url.toString()
  })
  document.body.append(el('label', { class: 'r41-jeu' }, el('span', {}, 'Jeu'), choix))
}
