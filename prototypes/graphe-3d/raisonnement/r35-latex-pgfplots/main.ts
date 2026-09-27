// R35 · LaTeX · pgfplots : le schéma technique de R14 tel qu'il serait composé en LaTeX, enrichi des
// graphiques qu'un physicien tracerait avec pgfplots.
//
// - Dérivation, mise en page, feuille, ports, liaisons, code de trait, cartouche : repris de R14.
// - Composition (composition.ts) : Latin Modern partout, petites capitales, formules des blocs en KaTeX
//   (calque HTML qui suit la caméra), pointes de flèche « latex ».
// - Formules et valeurs (formules.ts) : extraites des énoncés par une règle générique ; lois traçables.
// - Figures (graphiques.ts, mesures.ts) : loi prédite (blue!60!black) contre mesures avec barres d'erreur,
//   construites depuis les énoncés et le champ optionnel `mesures` ; accrochées sous le bloc de la loi.

import {
  creerVueRaisonnement, el, type Disposition, type NoeudR, type ReducteurAreteR, type ReducteurPoint, type VueRaisonnement,
} from '../../src/raisonnement'
import { CalqueFormules } from './composition'
import { formulesDuNoeud } from './formules'
import {
  construireFigures, geometrieFigure, legendeFigure, texteValeur, valeursDuJeu, type Figure,
} from './graphiques'
import { jeuFontaine } from './jeu-fontaine'
import { MESURES } from './mesures'
import meta from './meta.json'
import { mettreEnPage, type MiseEnPage } from './mise-en-page'
import {
  cibleSous, dependantsActifs, dessinerDessous, dessinerDessus, latexDe, lirePaletteR35, type EtatRendu,
} from './rendu'
import { etatSquelette, NIVEAUX, niveauDeStrategie, STRATEGIE_NIVEAU, type Niveau } from './squelette'

const etat: EtatRendu = {
  page: null,
  palette: { encre: '#111111', gris: '#5c5c5c', trait: '#222222', surface: '#ffffff', surface2: '#f4f4f4', accent: '#000099' },
  cibles: [],
  survol: null,
  epingles: new Set(),
  hypotheses: new Map(),
  figures: new Map(),
  calque: null,
}

// État de la vision (déclaré avant la vue : ses rappels servent dès la construction).
let corpsPanneau: HTMLElement | null = null
let cartouche: HTMLElement | null = null
let cadrerApres = true
let epinglesIds = new Set<string>()
let revision = 0

// ─── Réducteurs : points sigma invisibles, opacité pilotée par la vision ───────

const reducteurPoint: ReducteurPoint = (info, a, vue) => {
  // Sigma ne dessine plus les nœuds : blocs et spécifications sont sur le calque « dessus ».
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
    // Survol d'un connecteur de renvoi : le bloc cité et ceux qui le citent.
    const us = etat.page?.usagesRenvoi.get(sv.point)
    a.opacite = info.presence * (info.point === sv.point || us?.includes(info.point) ? 1 : 0.2)
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
// Jeu par défaut : la fontaine de chaîne (?jeu=fontaine) ; le jeu synthétique reste accessible (?jeu=edp).

const JEUX = { fontaine: 'Fontaine de chaîne', edp: 'EDP stochastique (synthétique)' } as const
type Jeu = keyof typeof JEUX
const jeuChoisi: Jeu = new URLSearchParams(location.search).get('jeu') === 'edp' ? 'edp' : 'fontaine'

// ─── Vue ─────────────────────────────────────────────────────────────────────

const D = 'Schéma R35'
const vue = creerVueRaisonnement(document.getElementById('app')!, {
  // Réglages mémorisés par jeu : cadrage et niveau ne se mélangent pas d'un raisonnement à l'autre.
  id: `${meta.id}-${jeuChoisi}`,
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
    { cle: 'largeurCarte', defaut: 180, dossier: D, libelle: 'largeur bloc', min: 140, max: 280, pas: 2 },
    { cle: 'ecartColonnes', defaut: 46, dossier: D, libelle: 'écart colonnes', min: 24, max: 160, pas: 2 },
    { cle: 'ecartLignes', defaut: 18, dossier: D, libelle: 'écart lignes', min: 4, max: 80, pas: 1 },
    { cle: 'taillePolice', defaut: 12.5, dossier: D, libelle: 'taille texte', min: 9, max: 18, pas: 0.5 },
    { cle: 'formules', defaut: true, dossier: D, libelle: 'formules (KaTeX)' },
    { cle: 'figures', defaut: true, dossier: D, libelle: 'figures pgfplots' },
    { cle: 'maxPastilles', defaut: 5, dossier: D, libelle: 'bornes max.', min: 0, max: 12, pas: 1 },
    { cle: 'bandesChoix', defaut: 'survol', dossier: D, libelle: 'repères d’hypothèses', options: { 'au survol / épinglés': 'survol', toujours: 'toujours' } },
    { cle: 'impasses', defaut: true, dossier: D, libelle: 'alternatives rejetées' },
    { cle: 'enTetes', defaut: true, dossier: D, libelle: 'cadre et règle' },
    { cle: 'grille', defaut: false, dossier: D, libelle: 'trame' },
    { cle: 'cartouche', defaut: true, dossier: D, libelle: 'cartouche' },
  ],
  reducteursNoeud: [reducteurPoint],
  reducteursArete: [reducteurArete],
  dessinerDessous: (c) => dessinerDessous(c, etat),
  dessinerDessus: (c) => dessinerDessus(c, etat),
  rendreFiche: (p, v, defaut) => {
    const f = defaut()
    ajouterFormuleFiche(f, v.noeud(p))
    const aide = f.querySelector('.rsn-aide')
    const u = p < v.nU ? v.lecture.unites[p] : undefined
    const n = v.noeud(p)
    const page = etat.page
    let texte = 'Clic : lignée · double-clic : cadrer · Échap : effacer'
    if (n.type === 'choix_modelisation') texte = 'Survol : repères sur les blocs dépendants · clic : épingler'
    else if (u && u.membres.length > 1) texte = `Double-clic : ouvrir le sous-système (${u.membres.length} énoncés) · clic : lignée`
    else if (u && dansDeplie(v, p)) texte = 'Double-clic : refermer le sous-système · clic : lignée'
    else if (!u) texte = 'Contexte : clic pour voir les blocs qui l’utilisent'
    if (aide) aide.textContent = texte
    const sv = etat.survol
    const bandeau = (t: string) => f.prepend(el('div', { class: 'r35-fiche-bandeau' }, t))
    if (page && sv?.genre === 'pastille') {
      const k = page.usagesPastille.get(sv.noeud)?.length ?? 0
      bandeau(`Borne de contexte · ${k} bloc${k > 1 ? 's' : ''} raccordé${k > 1 ? 's' : ''}`)
    } else if (page && sv?.genre === 'renvoi') {
      const k = page.usagesRenvoi.get(sv.point)?.length ?? 0
      bandeau(`Renvoi → ${page.boites[sv.point]?.ref} · cité par ${k} bloc${k > 1 ? 's' : ''} en aval`)
    } else if (page && p < v.nU && page.boites[p]) {
      const b = page.boites[p]!
      const statut = n.statut === 'valide' ? 'trait continu : validé' : n.statut === 'incertain' ? 'trait tireté : à vérifier' : 'bloc barré : réfuté'
      if (b.genre === 'drapeau') {
        const k = page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0
        bandeau(`${b.ref} · hypothèse de modélisation · ${k} bloc${k > 1 ? 's' : ''} en dépendent`)
      } else bandeau(`${b.ref} · rang R${Math.max(0, b.rang)} · ${statut}`)
    }
    return f
  },
  panneau: (p, v) => p.ajouterSection('r35', 'Schéma LaTeX · pgfplots', construirePanneau(v), { position: 'lecture' }),
})

// Formules KaTeX : calque HTML au-dessus des canvas de la scène.
etat.calque = new CalqueFormules(vue.scene)

/** Fiche de survol : la formule de l'énoncé en KaTeX (mode display), sous le titre. */
function ajouterFormuleFiche(f: HTMLElement, n: NoeudR): void {
  const katex = (window as unknown as { katex?: { render(t: string, e: HTMLElement, o?: object): void } }).katex
  const formules = formulesDuNoeud(n, 2)
  if (!formules.length) return
  const bloc = el('div', { class: 'r35-fiche-formules' })
  for (const fo of formules) {
    const d = el('div', { class: 'r35-fiche-formule' })
    if (katex) {
      try {
        katex.render(latexDe(fo), d, { throwOnError: false, displayMode: true, strict: 'ignore' })
      } catch {
        d.textContent = fo
      }
    } else d.textContent = fo
    bloc.append(d)
  }
  const titre = f.querySelector('.rsn-fiche-enonce') ?? f.querySelector('.rsn-fiche-titre')
  if (titre) titre.after(bloc)
  else f.append(bloc)
}

// Les pastilles et liens sémantiques par défaut sont remplacés par ceux de la vision.
vue.dessinsDessus.splice(0, 2)

// ─── Cartouche (coin bas droit, comme sur un plan) ───────────────────────────

function construireCartouche(): HTMLElement {
  const c = el('div', { class: 'r35-cartouche' })
  vue.interface.append(c)
  return c
}

function champ(nom: string, valeur: string, classe = ''): HTMLElement {
  return el('div', { class: `r35-champ ${classe}` }, el('span', { class: 'r35-champ-nom' }, nom), el('span', { class: 'r35-champ-valeur' }, valeur))
}

let echelleAffichee = ''
function texteEchelle(): string {
  const s = vue.camera.pixelsParUnite() * (etat.page?.echelle ?? 0.01)
  return `1 : ${(1 / Math.max(1e-6, s)).toFixed(2).replace('.', ',')}`
}

function majCartouche(): void {
  cartouche ??= construireCartouche()
  cartouche.hidden = !vue.reglages.lire<boolean>('cartouche')
  const page = etat.page
  if (!page) return
  const s = vue.lecture.stats
  const niveau = NIVEAUX.find((n) => n.id === niveauDeStrategie(vue.strategie.id))?.nom ?? vue.strategie.nom
  let blocs = 0, dec = 0, hyp = 0, nbFormules = 0, nbFigures = 0
  for (let p = 0; p < vue.nU; p++) {
    if (page.boites[p]!.formule) nbFormules++
    nbFigures += page.boites[p]!.figures
    const g = page.boites[p]!.genre
    if (g === 'drapeau') hyp++
    else if (g === 'decision') dec++
    else blocs++
  }
  const rev = String.fromCharCode(65 + ((revision - 1) % 26))
  echelleAffichee = texteEchelle()
  cartouche.replaceChildren(
    el('div', { class: 'r35-cartouche-titre' },
      el('span', { class: 'r35-champ-nom' }, 'Schéma de raisonnement'),
      el('span', { class: 'r35-cartouche-nom' }, vue.jeu.titre)),
    el('div', { class: 'r35-cartouche-grille' },
      champ('Éléments', `${vue.nU} / ${s.noeudsComplet}`),
      champ('Liaisons', `${s.aretes} / ${s.aretesComplet}`),
      champ('Blocs', `${blocs}  D ${dec}  H ${hyp}`),
      champ('Niveau', niveau),
      champ('Formules', String(nbFormules)),
      champ('Figures', String(nbFigures)),
      champ('Rév.', rev),
      champ('Échelle', echelleAffichee, 'r35-echelle'),
      champ('Date', new Date().toISOString().slice(0, 10)),
      champ('Source', vue.jeu.source === 'api' ? 'Atlas' : 'synthétique'),
    ),
  )
}

vue.on('image', () => {
  if (!cartouche || cartouche.hidden) return
  const t = texteEchelle()
  if (t === echelleAffichee) return
  echelleAffichee = t
  const v = cartouche.querySelector('.r35-echelle .r35-champ-valeur')
  if (v) v.textContent = t
})

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

// ─── Formules et figures ─────────────────────────────────────────────────────

let cacheFigures: { j: unknown; figures: Figure[] } | null = null
/** Figures du jeu (construites une fois par graphe de justification). */
function figuresDuJeu(): Figure[] {
  if (cacheFigures?.j !== vue.justification) {
    cacheFigures = { j: vue.justification, figures: construireFigures(vue.justification, MESURES[jeuChoisi] ?? {}) }
  }
  return cacheFigures.figures
}

/** Point (unité de lecture) d'un nœud de justification, ou null s'il n'est pas un bloc. */
const uniteDe = (i: number): number | null => {
  const u = vue.lecture.uniteDe[i]!
  return u >= 0 ? u : null
}

/** Ancre de chaque figure : le bloc qui énonce la loi, sinon celui de la première série mesurée. */
function ancrerFigures(): Map<number, Figure[]> {
  const m = new Map<number, Figure[]>()
  if (!vue.reglages.lire<boolean>('figures')) return m
  for (const fig of figuresDuJeu()) {
    const p = uniteDe(fig.noeudLoi) ?? fig.series.map((s) => uniteDe(s.noeud)).find((q) => q !== null) ?? null
    if (p === null) continue
    let l = m.get(p)
    if (!l) m.set(p, (l = []))
    l.push(fig)
  }
  return m
}

function recalculer(anime: boolean): void {
  const R = vue.reglages
  const ancres = ancrerFigures()
  const avecFormules = R.lire<boolean>('formules')
  const { disposition, page } = mettreEnPage(vue.lecture, {
    formuleDe: (p) => {
      const u = vue.lecture.unites[p]
      return avecFormules && u ? formulesDuNoeud(vue.justification.noeuds[u.conclusion]!, 1)[0] ?? null : null
    },
    figuresDe: (p) => ancres.get(p)?.length ?? 0,
    hauteurFigure: geometrieFigure(R.lire<number>('largeurCarte')).h,
    largeurCarte: R.lire<number>('largeurCarte'),
    ecartColonnes: R.lire<number>('ecartColonnes'),
    ecartLignes: R.lire<number>('ecartLignes'),
    taillePolice: R.lire<number>('taillePolice'),
    maxPastilles: R.lire<number>('maxPastilles'),
    ecartCouches: R.valeurs.ecartCouches,
    police: vue.palette.police,
    precedent: anime ? positionsPrecedentes() : undefined,
  })
  attribuerHypotheses(page)
  numeroterFigures(page, ancres)
  etat.page = page
  etat.survol = null
  revision++
  majMarges()
  appliquerDisposition(disposition, anime)
  if (cadrerApres) {
    cadrerApres = false
    vue.cadrerTout(anime ? undefined : 1)
  } else if (anime && horsEcran()) vue.cadrerTout()
  majPanneau()
  majCartouche()
}

/** Figures numérotées dans l'ordre des repères B (gauche → droite, haut → bas), légendes avec renvois. */
function numeroterFigures(page: MiseEnPage, ancres: Map<number, Figure[]>): void {
  const ref = (i: number) => {
    const u = uniteDe(i)
    return u === null ? null : page.boites[u]?.ref ?? null
  }
  const points = [...ancres.keys()].filter((p) => page.boites[p]!.figures > 0).sort((a, b) => page.boites[a]!.numero - page.boites[b]!.numero || a - b)
  let k = 0
  etat.figures = new Map()
  for (const p of points) {
    etat.figures.set(p, ancres.get(p)!.map((fig) => ({ fig, legende: legendeFigure(fig, ++k, ref) })))
  }
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

/** Marges de cadrage : blocs autour du point d'ancrage, règle en haut, repères à gauche. */
function majMarges(): void {
  const W = vue.reglages.lire<number>('largeurCarte')
  vue.margesSures = { gauche: W / 2 + 40, droite: W / 2 + 30 - 150, haut: 122, bas: 44 }
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

// ─── Survol : cibles dessinées (blocs, bornes, spécifications, alternatives) ──

vue.pointSous = (x: number, y: number) => {
  const c = cibleSous(etat, x, y)
  const avant = etat.survol
  etat.survol = c
  if ((avant?.genre !== c?.genre || avant?.noeud !== c?.noeud || avant?.point !== c?.point) && ['pastille', 'renvoi'].some((g) => avant?.genre === g || c?.genre === g)) vue.demanderRendu()
  if (!c) return null
  if (c.genre === 'pastille') return vue.pointDeNoeud(c.noeud)
  return c.point
}

// Clic sur une spécification : épingler / désépingler ses repères (au lieu de la lignée).
const selectionnerDefaut = vue.selectionner.bind(vue)
vue.selectionner = (p: number | null) => {
  if (p !== null && p < vue.nU && etat.page?.boites[p]?.genre === 'drapeau' && etat.survol?.genre === 'drapeau') {
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

// ─── Double-clic : ouvrir un sous-système sur place, le refermer ──────────────

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
  if (p === null) return vue.cadrerTout()
  if (p < vue.nU) {
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
  else if (['largeurCarte', 'ecartColonnes', 'ecartLignes', 'taillePolice', 'maxPastilles', 'ecartCouches', 'formules', 'figures'].includes(cle)) {
    cadrerApres = cle !== 'maxPastilles'
    recalculer(true)
  } else if (cle === 'cartouche') majCartouche()
  else if (cle === 'strategie') cadrerApres = true
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
  etat.palette = lirePaletteR35(vue.racine)
})
etat.palette = lirePaletteR35(vue.racine)

// ─── Panneau ☰ ───────────────────────────────────────────────────────────────

function construirePanneau(v: VueRaisonnement): HTMLElement {
  corpsPanneau = el('div', { class: 'r35-panneau' })
  void v
  return corpsPanneau
}

function majPanneau(): void {
  if (!corpsPanneau || !etat.page) return
  const v = vue
  const page = etat.page
  const niveau = niveauDeStrategie(v.strategie.id)
  const compte = { blocs: 0, sousSystemes: 0, decisions: 0, hypotheses: 0, rejetees: 0, bornes: 0, renvois: 0 }
  for (let p = 0; p < v.nU; p++) {
    const b = page.boites[p]!
    if (b.genre === 'drapeau') compte.hypotheses++
    else if (b.genre === 'decision') {
      compte.decisions++
      if (b.impasse) compte.rejetees++
    } else {
      compte.blocs++
      if (b.genre === 'etape') compte.sousSystemes++
    }
    compte.bornes += b.pastilles.length
    compte.renvois += b.renvois.length
  }
  const s = v.lecture.stats
  const boutons = el('div', { class: 'r35-niveaux' }, NIVEAUX.map((n) =>
    el('button', { type: 'button', class: `rsn-bouton${n.id === niveau ? ' actif' : ''}`, onclick: () => definirNiveau(n.id) }, n.nom)))
  const ligne = (k: string, val: string | number) => el('div', { class: 'r35-ligne' }, el('span', {}, k), el('span', { class: 'r35-valeur' }, String(val)))
  const hyps = [...etat.hypotheses].map(([p, ref]) => {
    const n = v.noeud(p)
    const c = el('input', { type: 'checkbox' }) as HTMLInputElement
    c.checked = etat.epingles.has(p)
    c.addEventListener('change', () => basculerEpingle(n.id, c.checked))
    return el('label', { class: 'r35-hyp' }, c,
      el('span', { class: 'r35-ref' }, ref),
      el('span', { class: 'r35-hyp-nom' }, n.nom),
      el('span', { class: 'r35-valeur' }, `→${page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0}`))
  })
  corpsPanneau.replaceChildren(
    el('div', { class: 'rsn-doux rsn-petit' }, 'Niveau de détail'),
    boutons,
    el('div', { class: 'r35-nomenclature' },
      ligne('Éléments visibles / nœuds', `${v.nU} / ${s.noeudsComplet}`),
      ligne('Liaisons / arêtes', `${s.aretes} / ${s.aretesComplet}`),
      ligne('Blocs (B) · dont sous-systèmes', `${compte.blocs} · ${compte.sousSystemes}`),
      ligne('Décisions (D) · alternatives NC', `${compte.decisions} · ${compte.rejetees}`),
      ligne('Hypothèses (H)', compte.hypotheses),
      ligne('Bornes · renvois', `${compte.bornes} · ${compte.renvois}`),
      ligne('Jonctions', page.jonctions.length),
    ),
    etatSquelette.deplies.size
      ? el('button', { type: 'button', class: 'rsn-bouton', onclick: () => {
          etatSquelette.ouvertes.clear()
          etatSquelette.deplies.clear()
          v.definirStrategie(v.strategie)
        } }, `Refermer les sous-systèmes (${etatSquelette.deplies.size})`)
      : el('div', { class: 'rsn-doux rsn-petit' }, 'Double-clic sur un sous-système (contour doublé) pour l’ouvrir sur place.'),
    el('div', { class: 'rsn-groupe-titre' }, 'Figures'),
    listeFigures(page),
    el('div', { class: 'rsn-groupe-titre' }, 'Valeurs lues dans les énoncés'),
    tableValeurs(page),
    el('div', { class: 'rsn-groupe-titre' }, 'Hypothèses de modélisation (épingler)'),
    el('div', { class: 'r35-liste-hyp' }, hyps),
    el('div', { class: 'rsn-groupe-titre' }, 'Légende'),
    el('div', { class: 'r35-legende' },
      el('div', {}, el('b', {}, 'Trait continu'), ' validé · ', el('b', {}, 'tireté'), ' à vérifier · ', el('b', {}, 'barré'), ' réfuté · ', el('b', {}, 'pointillé gris'), ' piste abandonnée.'),
      el('div', {}, el('b', {}, 'En-tête'), ' : repère (B, D, H) en gras, type en petites capitales, validation (H, IA, IA+H). Double filet : résultat.'),
      el('div', {}, el('b', {}, 'Barre d’erreur'), ' (pied de bloc) : confiance sur [0, 1], point = estimation, moustaches = intervalle.'),
      el('div', {}, el('b', {}, 'Formule'), ' : première équation de l’énoncé, extraite par règle et composée en KaTeX.'),
      el('div', {}, el('b', {}, 'Figure'), ' : trait bleu = loi prédite (paramètres lus dans des énoncés indépendants des mesures), pointillés = ±1σ, points = mesures avec barres d’erreur, tirets gris = pente déclarée.'),
      el('div', {}, el('b', {}, 'Point plein'), ' : jonction (une sortie alimente plusieurs blocs).'),
      el('div', {}, el('b', {}, 'Pentagone'), ' : renvoi vers un bloc plus en amont, cité par son repère.'),
      el('div', {}, el('b', {}, 'Bornes'), ' : contexte (H hypothèse, D définition, O outil, A axiome, L littérature, + auxiliaire).'),
      el('div', {}, el('b', {}, 'Losange'), ' : décision ; ', el('b', {}, '× NC'), ' : alternative rejetée, non connectée.'),
      el('div', {}, el('b', {}, '⊢ H1'), ' : le bloc dépend de l’hypothèse H1 (survol ou épingle, en bleu).'),
    ),
  )
}

function listeFigures(page: MiseEnPage): HTMLElement {
  const l = el('div', { class: 'r35-liste-figures' })
  let k = 0
  const tri = [...etat.figures.entries()].sort((a, b) => page.boites[a[0]]!.numero - page.boites[b[0]]!.numero)
  for (const [p, figs] of tri) {
    for (const { fig } of figs) {
      k++
      const params = fig.parametres.map((v) => texteValeur(v)).join(' ; ')
      l.append(el('div', { class: 'r35-figure-ligne' },
        el('span', { class: 'r35-ref' }, `Fig. ${k}`),
        el('span', {}, `${fig.y} contre ${fig.x} · sous ${page.boites[p]!.ref}`),
        el('span', { class: 'r35-doux' }, `${fig.loi.formule}${params ? ` — ${params}` : ''}${fig.illustratives ? ' — mesures illustratives' : ''}`)))
    }
  }
  if (!k) l.append(el('div', { class: 'rsn-doux rsn-petit' }, 'Aucune loi traçable appariée à des mesures.'))
  return l
}

function tableValeurs(page: MiseEnPage): HTMLElement {
  const t = el('div', { class: 'r35-valeurs' })
  const j = vue.justification
  for (const v of valeursDuJeu(j)) {
    if (v.aparte) continue
    const u = uniteDe(v.noeud)
    const ou = u === null ? j.noeuds[v.noeud]!.nom : page.boites[u]!.ref
    t.append(el('div', { class: 'r35-ligne' }, el('span', { class: 'r35-valeur' }, texteValeur(v)), el('span', { class: 'r35-doux' }, ou)))
  }
  if (!t.childElementCount) t.append(el('div', { class: 'rsn-doux rsn-petit' }, 'Aucune valeur « symbole = nombre » dans les énoncés.'))
  return t
}

// ─── Démarrage ───────────────────────────────────────────────────────────────

{
  const n = vue.reglages.lire<string>('niveau') as Niveau
  if (STRATEGIE_NIVEAU[n] && vue.strategie.id !== STRATEGIE_NIVEAU[n]) vue.definirStrategie(STRATEGIE_NIVEAU[n])
  else recalculer(false)
}

// Latin Modern arrive après le premier calcul : on remesure les titres une fois les polices chargées.
if (document.fonts) {
  Promise.all([
    document.fonts.load(`400 12px 'Latin Modern Roman'`),
    document.fonts.load(`italic 400 12px 'Latin Modern Roman'`),
    document.fonts.load(`700 12px 'Latin Modern Roman'`),
    document.fonts.load(`400 12px 'Latin Modern Mono'`),
  ]).then(() => {
    cadrerApres = true
    recalculer(false)
    vue.demanderRendu()
  }, () => undefined)
}

// Convention : le script de capture lit window.rsnVue.
;(window as unknown as { rsnVue: typeof vue; r35: EtatRendu }).rsnVue = vue
;(window as unknown as { r35: EtatRendu }).r35 = etat

// Sélecteur de jeu, sous le lien vers le catalogue.
{
  const choix = el('select', { class: 'r35-jeu-choix', 'aria-label': 'Raisonnement affiché' }) as HTMLSelectElement
  for (const [cle, libelle] of Object.entries(JEUX)) choix.append(new Option(libelle, cle, false, cle === jeuChoisi))
  choix.addEventListener('change', () => {
    const url = new URL(location.href)
    if (choix.value === 'fontaine') url.searchParams.delete('jeu')
    else url.searchParams.set('jeu', choix.value)
    location.href = url.toString()
  })
  document.body.append(el('label', { class: 'r35-jeu' }, el('span', {}, 'Jeu'), choix))
}
