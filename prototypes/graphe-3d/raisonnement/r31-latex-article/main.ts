// R31 · LaTeX · article amsmath : le schéma technique de R14 devient la figure 1 d'un article composé
// avec les conventions amsart / amsmath / amsthm, et le texte du raisonnement est posé en regard.
//
// - Figure (à gauche, ou au-dessus sur écran étroit) : dérivation, mise en page et rendu de R14, en
//   Latin Modern ; chaque bloc porte le numéro de son énoncé dans l'article (« Lem. 2.3 »).
// - Article (article.ts) : sections = sous-problèmes, environnements numérotés, équations numérotées
//   (formules.ts : extraction générique depuis les énoncés, composées par KaTeX), démonstrations générées
//   depuis les prémisses avec renvois façon \cref / \eqref, notes marginales (statut, confiance, figure).
// - Liens croisés : survoler un renvoi, une équation ou un énoncé met le bloc en évidence dans la figure ;
//   survoler un bloc surligne ses énoncés dans le texte. Cliquer un renvoi fait défiler le texte, cliquer
//   un bloc aussi ; « fig. 1 » dans la marge cadre la figure sur le bloc.

import {
  creerVueRaisonnement, el, type Disposition, type ReducteurAreteR, type ReducteurPoint, type VueRaisonnement,
} from '../../src/raisonnement'
import { chargerKatex, composerArticle, composerFormules, numeroter, type Numerotation } from './article'
import { jeuFontaine } from './jeu-fontaine'
import meta from './meta.json'
import { mettreEnPage, type MiseEnPage } from './mise-en-page'
import {
  cibleSous, dependantsActifs, dessinerDessous, dessinerDessus, lirePaletteR14, numeroSeul, type EtatRendu,
} from './rendu'
import { etatSquelette, NIVEAUX, niveauDeStrategie, STRATEGIE_NIVEAU, type Niveau } from './squelette'

const etat: EtatRendu = {
  page: null,
  palette: { encre: '#111111', gris: '#5f6368', trait: '#222222', surface: '#ffffff', surface2: '#f4f4f4', accent: '#1f3a93' },
  cibles: [],
  survol: null,
  epingles: new Set(),
  hypotheses: new Map(),
  focus: new Set(),
  focusNoeud: -1,
}

// État de la vision (déclaré avant la vue : ses rappels servent dès la construction).
let corpsPanneau: HTMLElement | null = null
let cadrerApres = true
let epinglesIds = new Set<string>()
let num: Numerotation | null = null

// ─── Réducteurs : points sigma invisibles, opacité pilotée par la vision ───────

const reducteurPoint: ReducteurPoint = (info, a, vue) => {
  // Sigma ne dessine plus les nœuds : blocs et spécifications sont sur le calque « dessus ».
  a.taille = 0.01
  a.libelle = null
  a.forceLibelle = false
  a.surligne = false
  if (info.noeud.piste === 'abandonnee') a.opacite = Math.min(info.presence, a.opacite / 0.55)
  // Mise en évidence venue du texte : le bloc visé reste net, le reste s'efface.
  if (etat.focus.size || etat.focusNoeud >= 0) {
    const garde = etat.focus.has(info.point) || (etat.focusNoeud >= 0 && !!etat.page?.usagesPastille.get(etat.focusNoeud)?.includes(info.point))
    a.opacite = info.presence * (garde ? 1 : 0.28)
    return
  }
  const sv = etat.survol
  const actifs = dependantsActifs(vue, etat)
  if (sv?.genre === 'pastille') {
    const us = etat.page?.usagesPastille.get(sv.noeud)
    a.opacite = info.presence * (us?.includes(info.point) ? 1 : 0.2)
  } else if (sv?.genre === 'renvoi') {
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

// ─── Jeu de données : fontaine par défaut, ?jeu=edp pour le jeu synthétique ────

const JEUX = { fontaine: 'Fontaine de chaîne', edp: 'EDP stochastique (synthétique)' } as const
type Jeu = keyof typeof JEUX
const jeuChoisi: Jeu = new URLSearchParams(location.search).get('jeu') === 'edp' ? 'edp' : 'fontaine'

// ─── Vue (figure 1) ──────────────────────────────────────────────────────────

const D = 'Figure 1'
const vue = creerVueRaisonnement(document.getElementById('app')!, {
  id: `${meta.id}-${jeuChoisi}`,
  jeu: jeuChoisi === 'fontaine' ? jeuFontaine() : undefined,
  mode: '2d',
  strategie: STRATEGIE_NIVEAU.squelette,
  ui: { fiche: false },
  reglages: {
    ajusterAspect: false,
    pastillesContexte: true,
    liensSemantiques: true,
    opaciteContexte: 0.22,
    opaciteLiensComplets: 0.22,
  },
  reglagesSupplementaires: [
    { cle: 'niveau', defaut: 'squelette', dossier: D, libelle: 'niveau de détail', options: Object.fromEntries(NIVEAUX.map((n) => [n.nom, n.id])) },
    { cle: 'largeurCarte', defaut: 120, dossier: D, libelle: 'largeur bloc', min: 96, max: 240, pas: 2 },
    { cle: 'ecartColonnes', defaut: 38, dossier: D, libelle: 'écart colonnes', min: 24, max: 160, pas: 2 },
    { cle: 'ecartLignes', defaut: 16, dossier: D, libelle: 'écart lignes', min: 4, max: 80, pas: 1 },
    { cle: 'taillePolice', defaut: 12, dossier: D, libelle: 'taille texte', min: 9, max: 18, pas: 0.5 },
    { cle: 'maxPastilles', defaut: 5, dossier: D, libelle: 'bornes max.', min: 0, max: 12, pas: 1 },
    { cle: 'bandesChoix', defaut: 'survol', dossier: D, libelle: 'renvois aux choix', options: { 'au survol / épinglés': 'survol', toujours: 'toujours' } },
    { cle: 'impasses', defaut: true, dossier: D, libelle: 'alternatives écartées' },
    { cle: 'enTetes', defaut: true, dossier: D, libelle: 'cadre et règle' },
    { cle: 'grille', defaut: false, dossier: D, libelle: 'trame' },
  ],
  reducteursNoeud: [reducteurPoint],
  reducteursArete: [reducteurArete],
  dessinerDessous: (c) => dessinerDessous(c, etat),
  dessinerDessus: (c) => dessinerDessus(c, etat),
  panneau: (p, v) => p.ajouterSection('r31', 'Figure 1', construirePanneau(v), { position: 'lecture' }),
})

// Les pastilles et liens sémantiques par défaut sont remplacés par ceux de la vision.
vue.dessinsDessus.splice(0, 2)

// ─── Article ─────────────────────────────────────────────────────────────────

const conteneurArticle = document.getElementById('article')!
num = numeroter(vue.jeu.noeuds, vue.jeu.sousProblemes)
const article = composerArticle({ titre: vue.jeu.titre, resume: vue.jeu.resume, noeuds: vue.jeu.noeuds, num })
conteneurArticle.replaceChildren(article)
document.title = `${vue.jeu.titre} — R31 · article amsmath`
void chargerKatex().then((k) => composerFormules(article, k))

/** Point de la figure qui porte un énoncé (bloc, ou étape repliée qui le contient) ; null sinon. */
function pointDe(id: string): number | null {
  const i = vue.justification.index.get(id)
  if (i === undefined) return null
  const p = vue.pointDeNoeud(i)
  return p !== null && p < vue.nU ? p : null
}

/** Mise en évidence dans la figure depuis le texte. */
let focusId: string | null = null
function focaliser(id: string | null): void {
  if (id === focusId) return
  focusId = id
  etat.focus = new Set()
  etat.focusNoeud = -1
  if (id) {
    const p = pointDe(id)
    const i = vue.justification.index.get(id)
    if (p !== null) etat.focus.add(p)
    else if (i !== undefined && etat.page?.usagesPastille.has(i)) etat.focusNoeud = i
  }
  vue.demanderRendu()
}

/** Surligne dans le texte les énoncés d'un bloc de la figure (tous les membres d'une étape). */
let surlignes: Element[] = []
function surligner(ids: string[]): void {
  for (const e of surlignes) e.classList.remove('lie')
  surlignes = []
  for (const id of ids) {
    for (const e of article.querySelectorAll(`[data-noeud="${CSS.escape(id)}"]`)) {
      e.classList.add('lie')
      surlignes.push(e)
    }
  }
}

function idsDuPoint(p: number): string[] {
  const j = vue.justification
  if (p < vue.nU) return vue.lecture.unites[p]!.membres.map((m) => j.noeuds[m]!.id)
  return [vue.noeud(p).id]
}

/** Fait défiler l'article jusqu'à un élément et le marque comme cible (comme :target). */
let cible: Element | null = null
function allerA(e: Element | null): void {
  if (!e) return
  cible?.classList.remove('cible')
  cible = e
  e.classList.add('cible')
  e.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

/** Cadre la figure sur un bloc et ses voisins de lecture (si `toujours`, même s'il est déjà visible). */
function montrerBloc(id: string, toujours: boolean): void {
  const p = pointDe(id)
  if (p === null) return
  if (!toujours) {
    const x = vue.projection.x[p]!, y = vue.projection.y[p]!
    const r = vue.scene.getBoundingClientRect()
    if (x > 40 && x < r.width - 40 && y > 60 && y < r.height - 60) return
  }
  const pts = new Set([p])
  for (const e of vue.lecture.entrantes[p] ?? []) pts.add(vue.lecture.aretes[e]!.source)
  for (const e of vue.lecture.sortantes[p] ?? []) pts.add(vue.lecture.aretes[e]!.cible)
  vue.cadrer(pts)
}

// Texte → figure : survol et clic (délégués).
article.addEventListener('mouseover', (e) => {
  const t = (e.target as Element).closest<HTMLElement>('[data-noeud]')
  focaliser(t?.dataset.noeud ?? null)
})
article.addEventListener('mouseleave', () => focaliser(null))
article.addEventListener('click', (e) => {
  const a = (e.target as Element).closest<HTMLAnchorElement>('a')
  if (!a) return
  if (a.dataset.figureTout) {
    e.preventDefault()
    vue.cadrerTout()
    return
  }
  if (a.dataset.figure) {
    e.preventDefault()
    if (!a.classList.contains('absent')) montrerBloc(a.dataset.figure, true)
    return
  }
  if (a.classList.contains('ref') && a.dataset.noeud) {
    e.preventDefault()
    allerA(a.dataset.eq ? document.getElementById(a.dataset.eq) : document.getElementById(`env-${a.dataset.noeud}`))
    montrerBloc(a.dataset.noeud, false)
  }
})

// Figure → texte : survol d'un bloc ou d'une borne, clic sur un bloc.
vue.on('survol', ({ point }) => surligner(point === null ? [] : idsDuPoint(point)))
vue.on('selection', ({ point }) => {
  if (point === null) return
  const id = vue.noeud(point).id
  allerA(document.getElementById(`env-${id}`))
})

/** Notes marginales « fig. 1 » : où l'énoncé se trouve dans la figure au niveau courant. */
function majLocalisations(): void {
  const page = etat.page
  if (!page) return
  const j = vue.justification
  for (const a of article.querySelectorAll<HTMLAnchorElement>('a.marge-fig')) {
    const id = a.dataset.noeud!
    a.dataset.figure = id
    const i = j.index.get(id)
    const p = pointDe(id)
    let texte = 'hors figure à ce niveau'
    let absent = true
    if (p !== null && i !== undefined) {
      absent = false
      const b = page.boites[p]!
      texte = vue.lecture.unites[p]!.conclusion === i ? `fig. 1 : ${b.ref}` : `fig. 1 : dans l’étape ${b.ref}`
    } else if (i !== undefined && page.usagesPastille.has(i)) {
      const us = page.usagesPastille.get(i)!
      absent = false
      texte = `fig. 1 : borne de ${page.boites[us[0]!]!.ref}${us.length > 1 ? ` (+${us.length - 1})` : ''}`
      a.dataset.figure = vue.noeud(us[0]!).id
    }
    a.textContent = texte
    a.classList.toggle('absent', absent)
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

/** Repères de la figure = numéros de l'article (« Lem. 2.3 », décision « 3.4 » dans son losange). */
function nommerBlocs(page: MiseEnPage): void {
  if (!num) return
  for (let p = 0; p < vue.nU; p++) {
    const b = page.boites[p]!
    const n = vue.noeud(p)
    const e = num.parId.get(n.id)
    if (!e) continue
    const k = vue.lecture.unites[p]!.membres.length
    b.ref = b.genre === 'decision' ? e.numero : `${e.def.abrege} ${e.numero}`
    b.etiquette = n.piste === 'abandonnee' ? 'abandonnée' : k > 1 ? `+ ${k - 1} énoncé${k > 2 ? 's' : ''}` : ''
  }
}

function recalculer(anime: boolean): void {
  const R = vue.reglages
  const { disposition, page } = mettreEnPage(vue.lecture, {
    largeurCarte: R.lire<number>('largeurCarte'),
    ecartColonnes: R.lire<number>('ecartColonnes'),
    ecartLignes: R.lire<number>('ecartLignes'),
    taillePolice: R.lire<number>('taillePolice'),
    maxPastilles: R.lire<number>('maxPastilles'),
    ecartCouches: R.valeurs.ecartCouches,
    police: vue.palette.police,
    precedent: anime ? positionsPrecedentes() : undefined,
  })
  nommerBlocs(page)
  attribuerHypotheses(page)
  etat.page = page
  etat.survol = null
  majMarges()
  appliquerDisposition(disposition, anime)
  if (cadrerApres) {
    cadrerApres = false
    vue.cadrerTout(anime ? undefined : 1)
  } else if (anime && horsEcran()) vue.cadrerTout()
  majPanneau()
  majLocalisations()
}

/** Choix de modélisation présents ; les épingles suivent les ids. */
function attribuerHypotheses(page: MiseEnPage): void {
  etat.hypotheses = new Map()
  etat.epingles = new Set()
  for (let p = 0; p < vue.lecture.unites.length; p++) {
    const b = page.boites[p]!
    if (b.genre !== 'drapeau') continue
    etat.hypotheses.set(p, numeroSeul(b.ref))
    if (epinglesIds.has(vue.justification.noeuds[vue.lecture.unites[p]!.conclusion]!.id)) etat.epingles.add(p)
  }
}

function majMarges(): void {
  const W = vue.reglages.lire<number>('largeurCarte')
  vue.margesSures = { gauche: W / 2 + 40, droite: W / 2 + 30 - 150, haut: 100, bas: 44 }
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

// Clic sur un choix de modélisation : épingler / désépingler ses renvois (au lieu de la lignée).
const selectionnerDefaut = vue.selectionner.bind(vue)
vue.selectionner = (p: number | null) => {
  if (p !== null && p < vue.nU && etat.page?.boites[p]?.genre === 'drapeau' && etat.survol?.genre === 'drapeau') {
    basculerEpingle(vue.noeud(p).id)
    allerA(document.getElementById(`env-${vue.noeud(p).id}`))
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

// ─── Double-clic : ouvrir une étape sur place, la refermer ────────────────────

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
  else if (['largeurCarte', 'ecartColonnes', 'ecartLignes', 'taillePolice', 'maxPastilles', 'ecartCouches'].includes(cle)) {
    cadrerApres = cle !== 'maxPastilles'
    recalculer(true)
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
  etat.palette = lirePaletteR14(vue.racine)
})
etat.palette = lirePaletteR14(vue.racine)

// ─── Panneau ☰ ───────────────────────────────────────────────────────────────

function construirePanneau(v: VueRaisonnement): HTMLElement {
  corpsPanneau = el('div', { class: 'r14-panneau' })
  void v
  return corpsPanneau
}

function majPanneau(): void {
  if (!corpsPanneau || !etat.page) return
  const v = vue
  const page = etat.page
  const niveau = niveauDeStrategie(v.strategie.id)
  const compte = { blocs: 0, etapes: 0, decisions: 0, choix: 0, ecartees: 0, bornes: 0, renvois: 0 }
  for (let p = 0; p < v.nU; p++) {
    const b = page.boites[p]!
    if (b.genre === 'drapeau') compte.choix++
    else if (b.genre === 'decision') {
      compte.decisions++
      if (b.impasse) compte.ecartees++
    } else {
      compte.blocs++
      if (v.lecture.unites[p]!.membres.length > 1) compte.etapes++
    }
    compte.bornes += b.pastilles.length
    compte.renvois += b.renvois.length
  }
  const s = v.lecture.stats
  const boutons = el('div', { class: 'r14-niveaux' }, NIVEAUX.map((n) =>
    el('button', { type: 'button', class: `rsn-bouton${n.id === niveau ? ' actif' : ''}`, onclick: () => definirNiveau(n.id) }, n.nom)))
  const ligne = (k: string, val: string | number) => el('div', { class: 'r14-ligne' }, el('span', {}, k), el('span', { class: 'r14-valeur' }, String(val)))
  const hyps = [...etat.hypotheses].map(([p, ref]) => {
    const n = v.noeud(p)
    const c = el('input', { type: 'checkbox' }) as HTMLInputElement
    c.checked = etat.epingles.has(p)
    c.addEventListener('change', () => basculerEpingle(n.id, c.checked))
    return el('label', { class: 'r14-hyp' }, c,
      el('span', { class: 'r14-ref' }, ref),
      el('span', { class: 'r14-hyp-nom' }, n.nom),
      el('span', { class: 'r14-valeur' }, `→${page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0}`))
  })
  corpsPanneau.replaceChildren(
    el('div', { class: 'rsn-doux rsn-petit' }, 'Niveau de détail'),
    boutons,
    el('div', { class: 'r14-nomenclature' },
      ligne('Blocs / énoncés', `${v.nU} / ${s.noeudsComplet}`),
      ligne('Liaisons / prémisses', `${s.aretes} / ${s.aretesComplet}`),
      ligne('Énoncés · dont étapes repliées', `${compte.blocs} · ${compte.etapes}`),
      ligne('Décisions · alternatives écartées', `${compte.decisions} · ${compte.ecartees}`),
      ligne('Choix de modélisation', compte.choix),
      ligne('Bornes · renvois', `${compte.bornes} · ${compte.renvois}`),
      ligne('Équations numérotées (texte)', num?.nbEquations ?? 0),
    ),
    etatSquelette.deplies.size
      ? el('button', { type: 'button', class: 'rsn-bouton', onclick: () => {
          etatSquelette.ouvertes.clear()
          etatSquelette.deplies.clear()
          v.definirStrategie(v.strategie)
        } }, `Refermer les étapes (${etatSquelette.deplies.size})`)
      : el('div', { class: 'rsn-doux rsn-petit' }, 'Double-clic sur une étape (contour doublé) pour l’ouvrir sur place.'),
    el('div', { class: 'rsn-groupe-titre' }, 'Choix de modélisation (épingler)'),
    el('div', { class: 'r14-liste-hyp' }, hyps),
    el('div', { class: 'rsn-groupe-titre' }, 'Lecture'),
    el('div', { class: 'r14-legende' },
      el('div', {}, 'La légende complète est celle de la figure 1, dans l’article.'),
      el('div', {}, el('b', {}, '⊢ 1.12'), ' au-dessus d’un bloc : il dépend du choix de modélisation 1.12 (survol ou épingle).'),
      el('div', {}, el('b', {}, 'Pentagone'), ' : renvoi vers un énoncé plus en amont, cité par son numéro.'),
    ),
  )
}

// ─── Démarrage ───────────────────────────────────────────────────────────────

{
  const n = vue.reglages.lire<string>('niveau') as Niveau
  if (STRATEGIE_NIVEAU[n] && vue.strategie.id !== STRATEGIE_NIVEAU[n]) vue.definirStrategie(STRATEGIE_NIVEAU[n])
  else recalculer(false)
}

// Les blocs sont mesurés avec Latin Modern : on recompose la figure quand les fontes sont là.
void Promise.all(['400 12px "Latin Modern"', '700 12px "Latin Modern"', 'italic 400 12px "Latin Modern"'].map((f) => document.fonts.load(f)))
  .then(() => {
    cadrerApres = true
    recalculer(false)
  })
  .catch(() => undefined)

// Convention : le script de capture lit window.rsnVue.
;(window as unknown as { rsnVue: typeof vue; r31: EtatRendu }).rsnVue = vue
;(window as unknown as { r31: EtatRendu }).r31 = etat

// Sélecteur de jeu et étiquette de la figure, en haut à gauche du panneau de figure.
{
  const choix = el('select', { class: 'r31-jeu-choix', 'aria-label': 'Raisonnement affiché' }) as HTMLSelectElement
  for (const [cle, libelle] of Object.entries(JEUX)) choix.append(new Option(libelle, cle, false, cle === jeuChoisi))
  choix.addEventListener('change', () => {
    const url = new URL(location.href)
    if (choix.value === 'fontaine') url.searchParams.delete('jeu')
    else url.searchParams.set('jeu', choix.value)
    location.href = url.toString()
  })
  document.body.append(el('div', { class: 'r31-entete-figure' },
    el('label', { class: 'r31-jeu' }, el('span', {}, 'Jeu'), choix),
    el('span', { class: 'r31-fig-etiquette' }, el('b', {}, 'Figure 1.'), ' Schéma de lecture')))
}
