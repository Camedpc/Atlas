// R38 · LaTeX classique (essai C) : le schéma R14 tel qu'il serait composé dans un article de physique.
//
// - Dérivation reprise de R14 / R1 (squelette.ts) : contexte en bornes, élagage vers les résultats
//   majeurs, réduction transitive, sous-arguments repliés (double-clic : ouvrir).
// - Mise en page reprise de R14 (mise-en-page.ts), hauteurs mesurées sur le texte composé.
// - Texte (texte.ts, latex.ts) : Computer Modern (CMU) et KaTeX ; chaque bloc est un énoncé à la
//   amsthm, « Lemme 3 (Nom). », avec sa formule centrée et numérotée « (4) » tirée de l'énoncé par une
//   règle générique, et sa confiance ĉ en pied.
// - Rendu (rendu.ts) : figure TikZ noir sur blanc (traits fins, pointes « to », accolades, axe des
//   rangs) ; la légende « Figure 1 – … » sous le schéma remplace le cartouche.

import {
  creerVueRaisonnement, el, LIBELLES_STATUT, type Disposition, type ReducteurAreteR, type ReducteurPoint, type VueRaisonnement,
} from '../../src/raisonnement'
import { jeuFontaine } from './jeu-fontaine'
import { aFormule, chargerKatex, echapper, htmlEnonce, htmlMath, htmlTexte, mathifier } from './latex'
import meta from './meta.json'
import { mettreEnPage, type MiseEnPage } from './mise-en-page'
import {
  cibleSous, dependantsActifs, dessinerDessous, dessinerDessus, lirePaletteR38, type EtatRendu,
} from './rendu'
import { etatSquelette, NIVEAUX, niveauDeStrategie, STRATEGIE_NIVEAU, type Niveau } from './squelette'
import { CoucheTexte } from './texte'

const etat: EtatRendu = {
  page: null,
  palette: { encre: '#111111', gris: '#6b6b6b', trait: '#1a1a1a', surface: '#ffffff', surface2: '#f2f2f2', accent: '#1f4aa8' },
  cibles: [],
  survol: null,
  epingles: new Set(),
  hypotheses: new Map(),
}

// État de la vision (déclaré avant la vue : ses rappels servent dès la construction).
let corpsPanneau: HTMLElement | null = null
let couche: CoucheTexte | null = null
let cadrerApres = true
let epinglesIds = new Set<string>()

// ─── Réducteurs : points sigma invisibles, opacité pilotée par la vision ───────

const reducteurPoint: ReducteurPoint = (info, a, vue) => {
  // Sigma ne dessine plus les nœuds : cadres sur le calque « dessus », texte dans la couche HTML.
  a.taille = 0.01
  a.libelle = null
  a.forceLibelle = false
  a.surligne = false
  // Piste abandonnée : grisée par son trait pointillé, pas par l'opacité (qui la rendrait illisible).
  if (info.noeud.piste === 'abandonnee') a.opacite = Math.min(info.presence, a.opacite / 0.55)
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

// ─── Jeu de données ──────────────────────────────────────────────────────────
// Par défaut la fontaine de chaîne ; ?jeu=edp : le jeu synthétique.

const JEUX = { fontaine: 'Fontaine de chaîne', edp: 'EDP stochastique (synthétique)' } as const
type Jeu = keyof typeof JEUX
const jeuChoisi: Jeu = new URLSearchParams(location.search).get('jeu') === 'edp' ? 'edp' : 'fontaine'

// ─── Vue ─────────────────────────────────────────────────────────────────────

const D = 'Figure R38'
const vue = creerVueRaisonnement(document.getElementById('app')!, {
  // Réglages mémorisés par jeu : cadrage et niveau ne se mélangent pas d'un raisonnement à l'autre.
  id: jeuChoisi === 'fontaine' ? meta.id : `${meta.id}-${jeuChoisi}`,
  jeu: jeuChoisi === 'fontaine' ? jeuFontaine() : undefined,
  mode: '2d',
  strategie: STRATEGIE_NIVEAU.squelette,
  reglages: {
    theme: 'clair',
    ajusterAspect: false,
    pastillesContexte: true,
    liensSemantiques: true,
    opaciteContexte: 0.22,
    opaciteLiensComplets: 0.22,
  },
  reglagesSupplementaires: [
    { cle: 'niveau', defaut: 'squelette', dossier: D, libelle: 'niveau de détail', options: Object.fromEntries(NIVEAUX.map((n) => [n.nom, n.id])) },
    { cle: 'largeurCarte', defaut: 184, dossier: D, libelle: 'largeur bloc', min: 130, max: 300, pas: 2 },
    { cle: 'ecartColonnes', defaut: 46, dossier: D, libelle: 'écart colonnes', min: 24, max: 160, pas: 2 },
    { cle: 'ecartLignes', defaut: 20, dossier: D, libelle: 'écart lignes', min: 4, max: 80, pas: 1 },
    { cle: 'taillePolice', defaut: 12, dossier: D, libelle: 'corps (px)', min: 9, max: 17, pas: 0.5 },
    { cle: 'maxPastilles', defaut: 5, dossier: D, libelle: 'bornes max.', min: 0, max: 12, pas: 1 },
    { cle: 'bandesChoix', defaut: 'survol', dossier: D, libelle: 'repères ⊢ (H)', options: { 'au survol / épinglés': 'survol', toujours: 'toujours' } },
    { cle: 'impasses', defaut: true, dossier: D, libelle: 'alternatives non retenues' },
    { cle: 'enTetes', defaut: true, dossier: D, libelle: 'axe et accolades' },
    { cle: 'legende', defaut: true, dossier: D, libelle: 'légende de la figure' },
  ],
  reducteursNoeud: [reducteurPoint],
  reducteursArete: [reducteurArete],
  dessinerDessous: (c) => dessinerDessous(c, etat),
  dessinerDessus: (c) => {
    dessinerDessus(c, etat)
    placerTexte(c.vue)
  },
  rendreFiche: (p, v, defaut) => ficheLatex(p, v, defaut()),
  panneau: (p, v) => p.ajouterSection('r38', 'Figure', construirePanneau(v), { position: 'lecture' }),
})

// Les pastilles et liens sémantiques par défaut sont remplacés par ceux de la vision.
vue.dessinsDessus.splice(0, 2)
couche = new CoucheTexte(vue.scene)

// ─── Couche de texte et légende ──────────────────────────────────────────────

function classesTexte(p: number): string {
  const page = etat.page!
  const b = page.boites[p]!
  const sv = etat.survol
  const c: string[] = []
  if (b.genre === 'drapeau' && (etat.epingles.has(p) || (sv?.genre === 'drapeau' && sv.point === p))) c.push('r38-actif')
  if (sv?.genre === 'renvoi' && sv.point === p) c.push('r38-cite')
  if (vue.ligneeActive && vue.lignee[p] === 3) c.push('r38-choisi')
  return c.join(' ')
}

function placerTexte(v: VueRaisonnement): void {
  const page = etat.page
  if (!couche || !page) return
  let legende = null
  if (v.reglages.lire<boolean>('legende')) {
    const b = page.bornes
    const E = page.echelle
    const q = v.camera.projeterPoint([((b.x0 + b.x1) / 2 - page.cx) * E, 0, -(b.y1 + 30 - page.cy) * E])
    const taille = v.reglages.lire<number>('taillePolice')
    legende = {
      x: q.x, y: q.y, s: v.camera.pixelsParUnite() * E,
      w: Math.min(b.x1 - b.x0, 50 * taille), alpha: q.visible ? Math.max(0, 1 - v.extrusion * 1.6) : 0,
    }
  }
  couche.placer(v, page, classesTexte, legende)
}

function majLegende(): void {
  if (!couche || !etat.page) return
  const s = vue.lecture.stats
  const page = etat.page
  const niveau = NIVEAUX.find((n) => n.id === niveauDeStrategie(vue.strategie.id))?.nom.toLowerCase() ?? vue.strategie.nom
  let enonces = 0, dec = 0, hyp = 0, eq = 0
  for (let p = 0; p < vue.nU; p++) {
    const b = page.boites[p]!
    if (b.genre === 'drapeau') hyp++
    else if (b.genre === 'decision') dec++
    else enonces++
    if (b.eq) eq++
  }
  const source = vue.jeu.source === 'api' ? 'Atlas' : 'jeu illustratif'
  couche.definirLegende(
    `<span class="r38-legende-num">Figure 1 –</span> <i>${htmlTexte(vue.jeu.titre)}</i>. ` +
    `Graphe de lecture du raisonnement, niveau « ${echapper(niveau)} » : ${vue.nU} éléments pour ${s.noeudsComplet} énoncés, ` +
    `${s.aretes} liaisons pour ${s.aretesComplet} prémisses (${enonces} énoncés numérotés, ${eq} équations, ${dec} décision${dec > 1 ? 's' : ''}, ` +
    `${hyp} hypothèse${hyp > 1 ? 's' : ''} de modélisation). Le rang logique croît de gauche à droite. ` +
    `Cadre plein : validé ; tireté : à vérifier ; barré : réfuté ; pointillé : piste abandonnée ; double : résultat ; ` +
    `ombré : sous-argument replié. ${htmlMath('\\hat c', false, 'ĉ')} : confiance estimée et intervalle ; H, IA, IA+H : validation. Source : ${source}.`,
  )
}

// ─── Fiche de survol : énoncé composé comme un corps de théorème ─────────────

function ficheLatex(p: number, v: VueRaisonnement, f: HTMLElement): HTMLElement {
  f.classList.add('r38-fiche')
  const aide = f.querySelector('.rsn-aide')
  const u = p < v.nU ? v.lecture.unites[p] : undefined
  const n = v.noeud(p)
  const page = etat.page
  const b = page && p < v.nU ? page.boites[p] : undefined
  let texte = 'Clic : lignée · double-clic : cadrer · Échap : effacer'
  if (n.type === 'choix_modelisation') texte = 'Survol : repères ⊢ sur les énoncés dépendants · clic : épingler'
  else if (u && u.membres.length > 1) texte = `Double-clic : ouvrir le sous-argument (${u.membres.length} énoncés) · clic : lignée`
  else if (u && dansDeplie(v, p)) texte = 'Double-clic : refermer le sous-argument · clic : lignée'
  else if (!u) texte = 'Contexte : clic pour voir les énoncés qui l’utilisent'
  if (aide) aide.textContent = texte
  // Titre « Lemme 3 (Nom). » et énoncé complet avec sa formule numérotée.
  const titre = f.querySelector<HTMLElement>('.rsn-fiche-titre')
  if (titre) titre.innerHTML = b?.titre && b.genre !== 'decision' && b.genre !== 'drapeau'
    ? `<b>${echapper(b.titre)}</b> (${htmlTexte(n.nom)}).`
    : b?.titre ? `<b>${echapper(b.titre)}</b> ${htmlTexte(n.nom)}.` : htmlTexte(n.nom)
  const enonce = f.querySelector<HTMLElement>('.rsn-fiche-enonce')
  if (enonce) enonce.innerHTML = htmlEnonce(n.enonce, b?.eq || null)
  for (const x of [titre, enonce, aide]) x?.classList.add('r38-sans-math')
  mathifier(f)
  const sv = etat.survol
  const bandeau = (t: string) => f.prepend(el('div', { class: 'r38-fiche-bandeau r38-sans-math' }, t))
  if (page && sv?.genre === 'pastille') {
    const k = page.usagesPastille.get(sv.noeud)?.length ?? 0
    bandeau(`Borne de contexte — ${k} énoncé${k > 1 ? 's' : ''} l’utilise${k > 1 ? 'nt' : ''}`)
  } else if (page && sv?.genre === 'renvoi') {
    const k = page.usagesRenvoi.get(sv.point)?.length ?? 0
    const c = page.boites[sv.point]!
    bandeau(`Renvoi ${c.citation} — ${c.titre}, cité par ${k} énoncé${k > 1 ? 's' : ''} en aval`)
  } else if (b) {
    const statut = n.statut === 'valide' ? 'cadre plein' : n.statut === 'incertain' ? 'cadre tireté' : 'cadre barré'
    if (b.genre === 'drapeau') {
      const k = page!.portees.get(p)?.filter((q) => q < v.nU).length ?? 0
      bandeau(`Hypothèse de modélisation ${b.titre} — ${k} énoncé${k > 1 ? 's' : ''} en dépendent`)
    } else bandeau(`${b.titre}${b.eq ? `, équation (${b.eq})` : ''} — rang ${Math.max(0, b.rang)} — ${LIBELLES_STATUT[n.statut].toLowerCase()} (${statut})`)
  }
  return f
}

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
  if (!couche) return
  couche.taille = R.lire<number>('taillePolice')
  const { disposition, page } = mettreEnPage(vue.lecture, {
    largeurCarte: R.lire<number>('largeurCarte'),
    ecartColonnes: R.lire<number>('ecartColonnes'),
    ecartLignes: R.lire<number>('ecartLignes'),
    taillePolice: R.lire<number>('taillePolice'),
    maxPastilles: R.lire<number>('maxPastilles'),
    ecartCouches: R.valeurs.ecartCouches,
    police: vue.palette.police,
    precedent: anime ? positionsPrecedentes() : undefined,
    mesurer: (n, genre, membres, w) => couche!.mesurer(n, genre, membres, w),
    aFormule: (n) => aFormule(n.enonce),
  })
  attribuerHypotheses(page)
  etat.page = page
  etat.survol = null
  couche.construire(vue, page)
  majMarges()
  appliquerDisposition(disposition, anime)
  if (cadrerApres) {
    cadrerApres = false
    vue.cadrerTout(anime ? undefined : 1)
  } else if (anime && horsEcran()) vue.cadrerTout()
  majPanneau()
  majLegende()
  vue.demanderRendu()
}

/** Polices ou KaTeX arrivés : nouvelles mesures, même disposition logique. */
function remesurer(cadrer: boolean): void {
  if (!couche || !etat.page) return
  couche.oublier()
  cadrerApres ||= cadrer
  recalculer(false)
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

/** Marges de cadrage : blocs autour du point d'ancrage, axe et accolades en haut, légende en bas. */
function majMarges(): void {
  const W = vue.reglages.lire<number>('largeurCarte')
  const bas = vue.reglages.lire<boolean>('legende') ? 120 : 50
  vue.margesSures = { gauche: W / 2 + 30, droite: W / 2 + 30 - 150, haut: 118, bas }
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

// ─── Survol : cibles dessinées (blocs, bornes, hypothèses, alternatives) ──────

vue.pointSous = (x: number, y: number) => {
  const c = cibleSous(etat, x, y)
  const avant = etat.survol
  etat.survol = c
  if ((avant?.genre !== c?.genre || avant?.noeud !== c?.noeud || avant?.point !== c?.point) && ['pastille', 'renvoi', 'drapeau'].some((g) => avant?.genre === g || c?.genre === g)) vue.demanderRendu()
  if (!c) return null
  if (c.genre === 'pastille') return vue.pointDeNoeud(c.noeud)
  return c.point
}

// Clic sur une hypothèse : épingler / désépingler ses repères (au lieu de la lignée).
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
  else if (['largeurCarte', 'ecartColonnes', 'ecartLignes', 'taillePolice', 'maxPastilles', 'ecartCouches'].includes(cle)) {
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
  etat.palette = lirePaletteR38(vue.racine)
})
etat.palette = lirePaletteR38(vue.racine)

// ─── Panneau ☰ ───────────────────────────────────────────────────────────────

function construirePanneau(v: VueRaisonnement): HTMLElement {
  corpsPanneau = el('div', { class: 'r38-panneau' })
  void v
  return corpsPanneau
}

function majPanneau(): void {
  if (!corpsPanneau || !etat.page) return
  const v = vue
  const page = etat.page
  const niveau = niveauDeStrategie(v.strategie.id)
  const compte = { enonces: 0, sousArguments: 0, equations: 0, decisions: 0, hypotheses: 0, rejetees: 0, bornes: 0, renvois: 0 }
  for (let p = 0; p < v.nU; p++) {
    const b = page.boites[p]!
    if (b.genre === 'drapeau') compte.hypotheses++
    else if (b.genre === 'decision') {
      compte.decisions++
      if (b.impasse) compte.rejetees++
    } else {
      compte.enonces++
      if (b.genre === 'etape' || (v.lecture.unites[p]?.membres.length ?? 1) > 1) compte.sousArguments++
    }
    if (b.eq) compte.equations++
    compte.bornes += b.pastilles.length
    compte.renvois += b.renvois.length
  }
  const s = v.lecture.stats
  const boutons = el('div', { class: 'r38-niveaux' }, NIVEAUX.map((n) =>
    el('button', { type: 'button', class: `rsn-bouton${n.id === niveau ? ' actif' : ''}`, onclick: () => definirNiveau(n.id) }, n.nom)))
  const ligne = (k: string, val: string | number) => el('div', { class: 'r38-ligne' }, el('span', {}, k), el('span', { class: 'r38-valeur' }, String(val)))
  const hyps = [...etat.hypotheses].map(([p, ref]) => {
    const n = v.noeud(p)
    const c = el('input', { type: 'checkbox' }) as HTMLInputElement
    c.checked = etat.epingles.has(p)
    c.addEventListener('change', () => basculerEpingle(n.id, c.checked))
    const nom = el('span', { class: 'r38-hyp-nom' })
    nom.innerHTML = htmlTexte(n.nom)
    return el('label', { class: 'r38-hyp' }, c,
      el('span', { class: 'r38-ref' }, `(${ref})`),
      nom,
      el('span', { class: 'r38-valeur' }, `${page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0}`))
  })
  corpsPanneau.replaceChildren(
    el('div', { class: 'rsn-doux rsn-petit' }, 'Niveau de détail'),
    boutons,
    el('div', { class: 'r38-tableau' },
      ligne('Éléments visibles / énoncés', `${v.nU} / ${s.noeudsComplet}`),
      ligne('Liaisons / prémisses', `${s.aretes} / ${s.aretesComplet}`),
      ligne('Énoncés numérotés · sous-arguments', `${compte.enonces} · ${compte.sousArguments}`),
      ligne('Équations numérotées', compte.equations),
      ligne('Décisions · alternatives non retenues', `${compte.decisions} · ${compte.rejetees}`),
      ligne('Hypothèses de modélisation', compte.hypotheses),
      ligne('Bornes · renvois', `${compte.bornes} · ${compte.renvois}`),
      ligne('Jonctions', page.jonctions.length),
    ),
    etatSquelette.deplies.size
      ? el('button', { type: 'button', class: 'rsn-bouton', onclick: () => {
          etatSquelette.ouvertes.clear()
          etatSquelette.deplies.clear()
          v.definirStrategie(v.strategie)
        } }, `Refermer les sous-arguments (${etatSquelette.deplies.size})`)
      : el('div', { class: 'rsn-doux rsn-petit' }, 'Double-clic sur un sous-argument (cadre ombré) pour l’ouvrir sur place.'),
    el('div', { class: 'rsn-groupe-titre' }, 'Hypothèses de modélisation (épingler)'),
    el('div', { class: 'r38-liste-hyp' }, hyps),
    el('div', { class: 'rsn-groupe-titre' }, 'Conventions'),
    el('div', { class: 'r38-legende' },
      el('div', {}, el('b', {}, 'Cadre plein'), ' validé · ', el('b', {}, 'tireté'), ' à vérifier · ', el('b', {}, 'barré'), ' réfuté · ', el('b', {}, 'pointillé'), ' piste abandonnée.'),
      el('div', {}, el('b', {}, 'Double cadre'), ' : résultat. ', el('b', {}, 'Cadre ombré'), ' : sous-argument replié.'),
      el('div', {}, el('b', {}, 'Lemme 3 (…)'), ' : compteur commun des énoncés ; ', el('b', {}, '(4)'), ' : équation tirée de l’énoncé.'),
      el('div', {}, el('b', {}, 'ĉ = 0,82 [0,76 ; 0,90]'), ' : confiance estimée et intervalle ; H, IA, IA+H : validation.'),
      el('div', {}, el('b', {}, 'Point plein'), ' : jonction (une sortie alimente plusieurs énoncés).'),
      el('div', {}, el('b', {}, '(4), lem. 3'), ' sous un cadre : renvoi vers un énoncé plus en amont.'),
      el('div', {}, el('b', {}, 'Lettres encadrées'), ' : contexte (H hypothèse, D définition, O outil, A axiome, L littérature, + auxiliaire).'),
      el('div', {}, el('b', {}, 'Losange D1'), ' : décision ; ', el('b', {}, '×'), ' : alternative non retenue.'),
      el('div', {}, el('b', {}, '⊢ (H1)'), ' : l’énoncé dépend de l’hypothèse (H1) (survol ou épingle, en bleu).'),
    ),
  )
}

// ─── Démarrage ───────────────────────────────────────────────────────────────

{
  const n = vue.reglages.lire<string>('niveau') as Niveau
  if (STRATEGIE_NIVEAU[n] && vue.strategie.id !== STRATEGIE_NIVEAU[n]) vue.definirStrategie(STRATEGIE_NIVEAU[n])
  else recalculer(false)
}

// KaTeX et polices Computer Modern : on recompose et on remesure à leur arrivée.
void chargerKatex().then((ok) => {
  if (ok) remesurer(true)
})
{
  const familles = ['400 12px "R38 CMU Serif"', 'italic 400 12px "R38 CMU Serif"', '700 12px "R38 CMU Serif"']
  void Promise.all(familles.map((f) => document.fonts.load(f))).then(() => remesurer(true)).catch(() => undefined)
  let minuterie = 0
  document.fonts.addEventListener('loadingdone', () => {
    clearTimeout(minuterie)
    minuterie = window.setTimeout(() => remesurer(false), 60)
  })
}

// Convention : le script de capture lit window.rsnVue.
;(window as unknown as { rsnVue: typeof vue; r38: EtatRendu }).rsnVue = vue
;(window as unknown as { r38: EtatRendu }).r38 = etat

// Sélecteur de jeu, sous le lien vers le catalogue.
{
  const choix = el('select', { class: 'r38-jeu-choix', 'aria-label': 'Raisonnement affiché' }) as HTMLSelectElement
  for (const [cle, libelle] of Object.entries(JEUX)) choix.append(new Option(libelle, cle, false, cle === jeuChoisi))
  choix.addEventListener('change', () => {
    const url = new URL(location.href)
    if (choix.value === 'fontaine') url.searchParams.delete('jeu')
    else url.searchParams.set('jeu', choix.value)
    location.href = url.toString()
  })
  document.body.append(el('label', { class: 'r38-jeu' }, el('span', {}, 'Jeu'), choix))
}
