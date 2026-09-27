// R30 · LaTeX · figure TikZ : le schéma technique de R14, composé comme une figure d'article.
//
// - Dérivation reprise de R14 / R1 (squelette.ts) : contexte en cercles, élagage vers les résultats
//   majeurs, réduction transitive, repli des sous-arguments (double-clic : ouvrir).
// - Mise en page (mise-en-page.ts) : rangs logiques en colonnes, ports répartis, jonctions ; la taille
//   des nœuds est celle du texte composé (composition.ts : HTML + KaTeX, Computer Modern).
// - Rendu (rendu.ts) : nœuds TikZ au trait fin, flèches Stealth, accolades des zones, axe des rangs ;
//   formules extraites des énoncés (formules.ts) ; légende « Figure 1 » sous la figure.

import {
  creerVueRaisonnement, el, type Disposition, type ReducteurAreteR, type ReducteurPoint, type VueRaisonnement,
} from '../../src/raisonnement'
import { CalqueTeX, composer, htmlLegende, viderCacheMesure, type Corps } from './composition'
import { htmlTexte, katexPret } from './formules'
import { jeuFontaine } from './jeu-fontaine'
import meta from './meta.json'
import { mettreEnPage, type MiseEnPage } from './mise-en-page'
import {
  cibleSous, dependantsActifs, dessinerDessous, dessinerDessus, lirePaletteR30, type EtatRendu,
} from './rendu'
import { etatSquelette, NIVEAUX, niveauDeStrategie, STRATEGIE_NIVEAU, type Niveau } from './squelette'

const etat: EtatRendu = {
  page: null,
  palette: { encre: '#000000', gris: '#808080', grisClair: '#bfbfbf', surface: '#ffffff', accent: '#000099' },
  cibles: [],
  survol: null,
  epingles: new Set(),
  hypotheses: new Map(),
  calque: null,
  legende: null,
}

// État de la vision (déclaré avant la vue : ses rappels servent dès la construction).
let corpsPanneau: HTMLElement | null = null
let cadrerApres = true
let epinglesIds = new Set<string>()

/** Nom d'environnement (amsthm) par type de nœud. */
const ENVIRONNEMENT: Record<string, string> = {
  hypothese: 'Hypothèse', definition: 'Définition', axiome: 'Axiome', lemme: 'Lemme', proposition: 'Proposition',
  theoreme: 'Théorème', assertion: 'Assertion', experience: 'Expérience', calcul: 'Calcul', observation: 'Observation',
  resultat: 'Résultat', conjecture: 'Conjecture',
}

// ─── Réducteurs : points sigma invisibles, opacité pilotée par la vision ───────

const reducteurPoint: ReducteurPoint = (info, a, vue) => {
  // Sigma ne dessine plus les nœuds : nœuds TikZ sur le calque « dessus », texte sur le calque DOM.
  a.taille = 0.01
  a.libelle = null
  a.forceLibelle = false
  a.surligne = false
  // Piste abandonnée : grisée par le nœud lui-même, pas par l'opacité (qui la rendrait illisible).
  if (info.noeud.piste === 'abandonnee') a.opacite = Math.min(info.presence, a.opacite / 0.55)
  const sv = etat.survol
  const actifs = dependantsActifs(vue, etat)
  if (sv?.genre === 'pastille') {
    // Survol d'un contexte : les nœuds qui l'utilisent restent nets.
    const us = etat.page?.usagesPastille.get(sv.noeud)
    a.opacite = info.presence * (us?.includes(info.point) ? 1 : 0.2)
  } else if (sv?.genre === 'renvoi') {
    // Survol d'un renvoi : le nœud cité et ceux qui le citent.
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
// Fontaine de chaîne par défaut ; ?jeu=edp : le jeu synthétique.

const JEUX = { fontaine: 'Fontaine de chaîne', edp: 'EDP stochastique (synthétique)' } as const
type Jeu = keyof typeof JEUX
const jeuChoisi: Jeu = new URLSearchParams(location.search).get('jeu') === 'edp' ? 'edp' : 'fontaine'

// ─── Vue ─────────────────────────────────────────────────────────────────────

const D = 'Figure R30'
const vue = creerVueRaisonnement(document.getElementById('app')!, {
  // Réglages mémorisés par jeu : cadrage et niveau ne se mélangent pas d'un raisonnement à l'autre.
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
    { cle: 'corps', defaut: 'formules', dossier: D, libelle: 'contenu des nœuds', options: { 'titre + formules': 'formules', 'titre + énoncé': 'enonce', 'titre seul': 'titre' } },
    { cle: 'maxFormules', defaut: 2, dossier: D, libelle: 'formules max.', min: 1, max: 4, pas: 1 },
    { cle: 'largeurCarte', defaut: 180, dossier: D, libelle: 'largeur nœud', min: 120, max: 300, pas: 2 },
    { cle: 'ecartColonnes', defaut: 46, dossier: D, libelle: 'écart colonnes', min: 24, max: 160, pas: 2 },
    { cle: 'ecartLignes', defaut: 20, dossier: D, libelle: 'écart lignes', min: 4, max: 80, pas: 1 },
    { cle: 'taillePolice', defaut: 12.5, dossier: D, libelle: 'corps du texte (px)', min: 9, max: 18, pas: 0.5 },
    { cle: 'maxPastilles', defaut: 5, dossier: D, libelle: 'contexte max.', min: 0, max: 12, pas: 1 },
    { cle: 'bandesChoix', defaut: 'survol', dossier: D, libelle: 'dépendance aux hypothèses', options: { 'au survol / épinglées': 'survol', toujours: 'toujours' } },
    { cle: 'impasses', defaut: true, dossier: D, libelle: 'alternatives rejetées' },
    { cle: 'enTetes', defaut: true, dossier: D, libelle: 'axe et accolades' },
    { cle: 'legende', defaut: true, dossier: D, libelle: 'légende « Figure 1 »' },
  ],
  reducteursNoeud: [reducteurPoint],
  reducteursArete: [reducteurArete],
  dessinerDessous: (c) => dessinerDessous(c, etat),
  dessinerDessus: (c) => dessinerDessus(c, etat),
  rendreFiche: (p, v, defaut) => {
    const f = defaut()
    f.classList.add('r30-fiche')
    const n = v.noeud(p)
    // Titre et énoncé avec leurs formules composées.
    const titre = f.querySelector('.rsn-fiche-titre')
    if (titre) titre.innerHTML = htmlTexte(n.nom)
    const enonce = f.querySelector('.rsn-fiche-enonce')
    if (enonce) enonce.innerHTML = htmlTexte(n.enonce)
    const aide = f.querySelector('.rsn-aide')
    const u = p < v.nU ? v.lecture.unites[p] : undefined
    const page = etat.page
    let texte = 'Clic : lignée · double-clic : cadrer · Échap : effacer'
    if (n.type === 'choix_modelisation') texte = 'Survol : dépendances marquées sur les nœuds · clic : épingler'
    else if (u && u.membres.length > 1) texte = `Double-clic : ouvrir le sous-argument (${u.membres.length} énoncés) · clic : lignée`
    else if (u && dansDeplie(v, p)) texte = 'Double-clic : refermer le sous-argument · clic : lignée'
    else if (!u) texte = 'Contexte : clic pour voir les nœuds qui l’utilisent'
    if (aide) aide.textContent = texte
    const sv = etat.survol
    const bandeau = (t: string) => f.prepend(el('div', { class: 'r30-fiche-bandeau' }, t))
    if (page && sv?.genre === 'pastille') {
      const k = page.usagesPastille.get(sv.noeud)?.length ?? 0
      bandeau(`Contexte · utilisé par ${k} nœud${k > 1 ? 's' : ''}`)
    } else if (page && sv?.genre === 'renvoi') {
      const k = page.usagesRenvoi.get(sv.point)?.length ?? 0
      bandeau(`Renvoi → ${nomNoeud(v, sv.point)} · cité par ${k} nœud${k > 1 ? 's' : ''} en aval`)
    } else if (page && p < v.nU && page.boites[p]) {
      const b = page.boites[p]!
      const statut = b.abandon ? 'pointillé : piste abandonnée' : n.statut === 'valide' ? 'trait plein : validé' : n.statut === 'incertain' ? 'tireté : à vérifier' : 'barré : réfuté'
      if (b.genre === 'drapeau') {
        const k = page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0
        bandeau(`${nomNoeud(v, p)} · hypothèse de modélisation · ${k} nœud${k > 1 ? 's' : ''} en dépendent`)
      } else bandeau(`${nomNoeud(v, p)} · rang ${Math.max(0, b.rang)} · ${statut}`)
    }
    return f
  },
  panneau: (p, v) => p.ajouterSection('r30', 'Figure TikZ', construirePanneau(v), { position: 'lecture' }),
})

// Les pastilles et liens sémantiques par défaut sont remplacés par ceux de la vision.
vue.dessinsDessus.splice(0, 2)

// Texte composé : calque DOM au-dessus des canvas de la scène (sous la fiche et le panneau).
etat.calque = new CalqueTeX(vue.scene)

/** « Lemme 7 », « Décision D2 », « (H1) ». */
function nomNoeud(v: VueRaisonnement, p: number): string {
  const b = etat.page?.boites[p]
  if (!b) return ''
  if (b.genre === 'drapeau') return `(${b.ref})`
  if (b.genre === 'decision') return `Décision ${b.ref}`
  return `${ENVIRONNEMENT[v.noeud(p).type] ?? 'Énoncé'} ${b.numero}`
}

/** Corps du texte (px de mise en page), partagé par le calque et la mesure. */
function appliquerTaille(): void {
  document.documentElement.style.setProperty('--r30-taille', `${vue.reglages.lire<number>('taillePolice')}px`)
}
appliquerTaille()

// ─── Disposition maison ──────────────────────────────────────────────────────

const appliquerDisposition = (d: Disposition, anime: boolean) =>
  (vue as unknown as { appliquerDisposition(d: Disposition, anime: boolean): void }).appliquerDisposition(d, anime)

function positionsPrecedentes(): Map<string, number> | undefined {
  const page = etat.page
  if (!page || !vue.lecture) return undefined
  const m = new Map<string, number>()
  const j = vue.justification
  // Chaque membre hérite de la hauteur de son unité : un sous-argument s'ouvre « sur place ».
  for (let p = 0; p < Math.min(vue.nU, vue.disposition.nU); p++) {
    const u = vue.lecture.unites[p]
    if (!u) continue
    const y = -vue.disposition.z[p]! / page.echelle
    u.membres.forEach((mb, k) => m.set(j.noeuds[mb]!.id, y + k * 1e-3))
  }
  return m
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
    police: `'CMU Serif', KaTeX_Main, serif`,
    corps: R.lire<string>('corps') as Corps,
    maxFormules: R.lire<number>('maxFormules'),
    precedent: anime ? positionsPrecedentes() : undefined,
  })
  attribuerHypotheses(page)
  etat.page = page
  etat.survol = null
  etat.legende = composerLegende(page)
  majMarges()
  appliquerDisposition(disposition, anime)
  if (cadrerApres) {
    cadrerApres = false
    vue.cadrerTout(anime ? undefined : 1)
  } else if (anime && horsEcran()) vue.cadrerTout()
  majPanneau()
}

/** Légende « Figure 1 » : sous la figure, centrée, de la largeur d'une colonne de texte. */
function composerLegende(page: MiseEnPage): EtatRendu['legende'] {
  const b = page.bornes
  const w = Math.round(Math.min(660, Math.max(380, b.x1 - b.x0)))
  const s = vue.lecture.stats
  const niveau = NIVEAUX.find((n) => n.id === niveauDeStrategie(vue.strategie.id))?.nom ?? vue.strategie.nom
  const c = composer('legende', htmlLegende({
    titre: vue.jeu.titre, noeuds: s.noeudsComplet, visibles: vue.nU, aretes: s.aretesComplet, liaisons: s.aretes, niveau,
  }), w)
  return { classe: 'legende', html: c.html, x: (b.x0 + b.x1) / 2 - w / 2, y: b.y1 + 30, w, h: c.h }
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

/** Marges de cadrage : nœuds autour du point d'ancrage, axe et accolades en haut, légende en bas. */
function majMarges(): void {
  const W = vue.reglages.lire<number>('largeurCarte')
  const legende = etat.legende && vue.reglages.lire<boolean>('legende') ? etat.legende.h + 30 : 0
  vue.margesSures = { gauche: W / 2 + 70, droite: W / 2 + 30 - 150, haut: 104, bas: 44 + legende }
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

// ─── Survol : cibles dessinées (nœuds, contexte, hypothèses, alternatives) ────

vue.pointSous = (x: number, y: number) => {
  const c = cibleSous(etat, x, y)
  const avant = etat.survol
  etat.survol = c
  if ((avant?.genre !== c?.genre || avant?.noeud !== c?.noeud || avant?.point !== c?.point) && ['pastille', 'renvoi'].some((g) => avant?.genre === g || c?.genre === g)) vue.demanderRendu()
  if (!c) return null
  if (c.genre === 'pastille') return vue.pointDeNoeud(c.noeud)
  return c.point
}

// Clic sur une hypothèse de modélisation : épingler / désépingler (au lieu de la lignée).
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

// ─── Double-clic : ouvrir un sous-argument sur place, le refermer ─────────────

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
  else if (['largeurCarte', 'ecartColonnes', 'ecartLignes', 'taillePolice', 'maxPastilles', 'ecartCouches', 'corps', 'maxFormules'].includes(cle)) {
    if (cle === 'taillePolice') appliquerTaille()
    cadrerApres = cle !== 'maxPastilles'
    recalculer(true)
  } else if (cle === 'legende') {
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
  etat.palette = lirePaletteR30(vue.racine)
})
etat.palette = lirePaletteR30(vue.racine)

// ─── Panneau ☰ ───────────────────────────────────────────────────────────────

function construirePanneau(v: VueRaisonnement): HTMLElement {
  corpsPanneau = el('div', { class: 'r30-panneau' })
  void v
  return corpsPanneau
}

function majPanneau(): void {
  if (!corpsPanneau || !etat.page) return
  const v = vue
  const page = etat.page
  const niveau = niveauDeStrategie(v.strategie.id)
  const compte = { noeuds: 0, sousArguments: 0, decisions: 0, hypotheses: 0, rejetees: 0, contexte: 0, renvois: 0, formules: 0 }
  for (let p = 0; p < v.nU; p++) {
    const b = page.boites[p]!
    if (b.genre === 'drapeau') compte.hypotheses++
    else if (b.genre === 'decision') {
      compte.decisions++
      if (b.impasse) compte.rejetees++
    } else {
      compte.noeuds++
      if (b.genre === 'etape') compte.sousArguments++
      compte.formules += b.pieces.reduce((t, pc) => t + (pc.html.match(/class="r30-eq"/g)?.length ?? 0), 0)
    }
    compte.contexte += b.pastilles.length
    compte.renvois += b.renvois.length
  }
  const s = v.lecture.stats
  const boutons = el('div', { class: 'r30-niveaux' }, NIVEAUX.map((n) =>
    el('button', { type: 'button', class: `rsn-bouton${n.id === niveau ? ' actif' : ''}`, onclick: () => definirNiveau(n.id) }, n.nom)))
  const ligne = (k: string, val: string | number) => el('div', { class: 'r30-ligne' }, el('span', {}, k), el('span', { class: 'r30-valeur' }, String(val)))
  const hyps = [...etat.hypotheses].map(([p, ref]) => {
    const n = v.noeud(p)
    const c = el('input', { type: 'checkbox' }) as HTMLInputElement
    c.checked = etat.epingles.has(p)
    c.addEventListener('change', () => basculerEpingle(n.id, c.checked))
    const nom = el('span', { class: 'r30-hyp-nom' })
    nom.innerHTML = htmlTexte(n.nom)
    return el('label', { class: 'r30-hyp' }, c,
      el('span', { class: 'r30-ref' }, `(${ref})`),
      nom,
      el('span', { class: 'r30-valeur' }, `→ ${page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0}`))
  })
  corpsPanneau.replaceChildren(
    el('div', { class: 'rsn-doux rsn-petit' }, 'Niveau de détail'),
    boutons,
    el('div', { class: 'r30-nomenclature' },
      ligne('Éléments visibles / énoncés', `${v.nU} / ${s.noeudsComplet}`),
      ligne('Liaisons / arêtes', `${s.aretes} / ${s.aretesComplet}`),
      ligne('Nœuds · dont sous-arguments', `${compte.noeuds} · ${compte.sousArguments}`),
      ligne('Formules composées', compte.formules),
      ligne('Décisions (D) · alternatives rejetées', `${compte.decisions} · ${compte.rejetees}`),
      ligne('Hypothèses de modélisation (H)', compte.hypotheses),
      ligne('Contexte · renvois', `${compte.contexte} · ${compte.renvois}`),
      ligne('Jonctions', page.jonctions.length),
    ),
    etatSquelette.deplies.size
      ? el('button', { type: 'button', class: 'rsn-bouton', onclick: () => {
          etatSquelette.ouvertes.clear()
          etatSquelette.deplies.clear()
          v.definirStrategie(v.strategie)
        } }, `Refermer les sous-arguments (${etatSquelette.deplies.size})`)
      : el('div', { class: 'rsn-doux rsn-petit' }, 'Double-clic sur un sous-argument (contour dédoublé) pour l’ouvrir sur place.'),
    el('div', { class: 'rsn-groupe-titre' }, 'Hypothèses de modélisation (épingler)'),
    el('div', { class: 'r30-liste-hyp' }, hyps),
    el('div', { class: 'rsn-groupe-titre' }, 'Légende'),
    el('div', { class: 'r30-legende-panneau' },
      el('div', {}, el('b', {}, 'Trait plein'), ' validé · ', el('b', {}, 'tireté'), ' à vérifier · ', el('b', {}, 'barré'), ' réfuté · ', el('b', {}, 'pointillé gris'), ' piste abandonnée.'),
      el('div', {}, el('b', {}, 'Double trait'), ' : résultat. ', el('b', {}, 'Contour dédoublé'), ' : sous-argument replié.'),
      el('div', {}, el('b', {}, 'En tête'), ' : environnement et numéro (Lemme 7), nom entre parenthèses ; ', el('b', {}, 'au centre'), ' : les formules de l’énoncé.'),
      el('div', {}, el('b', {}, 'En pied'), ' : validation (h, ia, ia+h) ; ', el('i', {}, 'c'), ' = confiance estimée [intervalle].'),
      el('div', {}, el('b', {}, 'Point plein'), ' : jonction (une sortie alimente plusieurs nœuds).'),
      el('div', {}, el('b', {}, 'Signal numéroté'), ' : renvoi vers un nœud plus en amont.'),
      el('div', {}, el('b', {}, 'Cercles'), ' : contexte (H hypothèse, D définition, O outil, A axiome, L littérature, + auxiliaire).'),
      el('div', {}, el('b', {}, 'Losange'), ' : décision ; ', el('b', {}, '×'), ' : alternative non retenue.'),
      el('div', {}, el('b', {}, '⊢ (H1)'), ' : le nœud dépend de l’hypothèse H1 (survol ou épingle).'),
    ),
  )
}

// ─── Démarrage ───────────────────────────────────────────────────────────────

{
  const n = vue.reglages.lire<string>('niveau') as Niveau
  if (STRATEGIE_NIVEAU[n] && vue.strategie.id !== STRATEGIE_NIVEAU[n]) vue.definirStrategie(STRATEGIE_NIVEAU[n])
  else recalculer(false)
}

// Polices : la mesure du texte composé dépend de Computer Modern et des polices KaTeX, chargées à la
// première utilisation. On les sollicite, puis on recompose quand elles sont là (et à chaque nouvelle
// police chargée ensuite).
{
  const amorce = document.createElement('div')
  amorce.className = 'r30-tex r30-mesure'
  amorce.innerHTML = `<div class="r30-piece r30-bloc"><b>Lemme</b> <i>italique</i> <span class="r30-sc">ia+h</span> ${htmlTexte('h₁ / h₂ = α / (1 − β) et ∂ₛ(T′ 𝐭) = 𝟎')}</div>`
  document.body.append(amorce)
  void amorce.offsetHeight
  let attente = 0
  let premiere = true
  const recomposer = () => {
    window.clearTimeout(attente)
    attente = window.setTimeout(() => {
      viderCacheMesure()
      // On ne recadre qu'à la première composition complète (pas après un déplacement de la vue).
      cadrerApres ||= premiere
      premiere = false
      recalculer(false)
    }, 60)
  }
  void document.fonts.ready.then(() => {
    amorce.remove()
    recomposer()
  })
  document.fonts.addEventListener('loadingdone', recomposer)
  if (!katexPret()) console.warn('[R30] KaTeX absent : formules en texte italique.')
}

// Convention : le script de capture lit window.rsnVue.
;(window as unknown as { rsnVue: typeof vue; r30: EtatRendu }).rsnVue = vue
;(window as unknown as { r30: EtatRendu }).r30 = etat

// Sélecteur de jeu, sous le lien vers le catalogue.
{
  const choix = el('select', { class: 'r30-jeu-choix', 'aria-label': 'Raisonnement affiché' }) as HTMLSelectElement
  for (const [cle, libelle] of Object.entries(JEUX)) choix.append(new Option(libelle, cle, false, cle === jeuChoisi))
  choix.addEventListener('change', () => {
    const url = new URL(location.href)
    url.searchParams.set('jeu', choix.value)
    location.href = url.toString()
  })
  document.body.append(el('label', { class: 'r30-jeu' }, el('span', {}, 'Jeu'), choix))
}
