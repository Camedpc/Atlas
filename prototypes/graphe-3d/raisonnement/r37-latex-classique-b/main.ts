// R37 (essai B) · LaTeX classique : le schéma de R14 tel qu'il serait composé dans un article de
// physique ordinaire (TikZ + Computer Modern + légende de figure).
//
// - Dérivation reprise de R14 / R1 (squelette.ts) : contexte en citations, élagage vers les résultats
//   majeurs, réduction transitive, sous-arguments repliés (double-clic : ouvrir).
// - Mise en page (mise-en-page.ts) : rangs logiques en colonnes, entrées réparties, jonctions ;
//   énoncés numérotés (4), décisions D1, hypothèses de modélisation (i), contexte cité [3].
// - Composition (composition.ts, formules.ts) : texte des blocs en HTML, Computer Modern et KaTeX ;
//   la formule principale de chaque énoncé est extraite par une règle générique et composée hors texte.
// - Rendu (rendu.ts) : cadres fins, statut par le trait (plein, tireté, barré, pointillé), flèches
//   « latex », en-têtes de colonnes ; légende « Figure 1 – … » sous la figure.

import {
  creerVueRaisonnement, el, type Disposition, type ReducteurAreteR, type ReducteurPoint, type VueRaisonnement,
} from '../../src/raisonnement'
import { Composition, PAD } from './composition'
import { katexHtml, texteHtml } from './formules'
import { jeuFontaine } from './jeu-fontaine'
import meta from './meta.json'
import { mettreEnPage, type MiseEnPage } from './mise-en-page'
import {
  cibleSous, dependantsActifs, dessinerDessous, dessinerDessus, ECART_LEGENDE, EN_TETE, lirePaletteR37, type EtatRendu,
} from './rendu'
import { etatSquelette, NIVEAUX, niveauDeStrategie, STRATEGIE_NIVEAU, type Niveau } from './squelette'

const etat: EtatRendu = {
  page: null,
  palette: { encre: '#000000', gris: '#5f5f5f', trait: '#000000', surface: '#ffffff', surface2: '#f4f4f4', accent: '#1f4bb4' },
  cibles: [],
  survol: null,
  epingles: new Set(),
  hypotheses: new Map(),
  compo: null,
  legende: { x0: 0, largeur: 0, h: 0 },
}

// État de la vision (déclaré avant la vue : ses rappels servent dès la construction).
let corpsPanneau: HTMLElement | null = null
let cadrerApres = true
let epinglesIds = new Set<string>()

// ─── Réducteurs : points sigma invisibles, opacité pilotée par la vision ───────

const reducteurPoint: ReducteurPoint = (info, a, vue) => {
  // Sigma ne dessine plus les nœuds : cadres sur le calque « dessus », texte en HTML.
  a.taille = 0.01
  a.libelle = null
  a.forceLibelle = false
  a.surligne = false
  // Piste abandonnée : grisée par le cadre pointillé, pas par l'opacité (qui la rendrait illisible).
  if (info.noeud.piste === 'abandonnee') a.opacite = Math.min(info.presence, a.opacite / 0.55)
  const sv = etat.survol
  const actifs = dependantsActifs(vue, etat)
  if (sv?.genre === 'pastille') {
    // Survol d'une citation de contexte : les blocs qui la citent restent nets.
    const us = etat.page?.usagesPastille.get(sv.noeud)
    const cite = etat.page?.contexteAffiche.get(sv.noeud)
    a.opacite = info.presence * (us?.includes(info.point) || cite === info.point ? 1 : 0.2)
  } else if (sv?.genre === 'renvoi') {
    // Survol d'un renvoi « (k) » : le bloc cité et ceux qui le citent.
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
// Fontaine de chaîne par défaut ; ?jeu=edp pour le jeu synthétique.

const JEUX = { fontaine: 'Fontaine de chaîne', edp: 'EDP stochastique (synthétique)' } as const
type Jeu = keyof typeof JEUX
const jeuChoisi: Jeu = new URLSearchParams(location.search).get('jeu') === 'edp' ? 'edp' : 'fontaine'

// ─── Vue ─────────────────────────────────────────────────────────────────────

const D = 'Figure R37'
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
    { cle: 'largeurCarte', defaut: 178, dossier: D, libelle: 'largeur bloc', min: 130, max: 300, pas: 2 },
    { cle: 'ecartColonnes', defaut: 46, dossier: D, libelle: 'écart colonnes', min: 24, max: 160, pas: 2 },
    { cle: 'ecartLignes', defaut: 20, dossier: D, libelle: 'écart lignes', min: 4, max: 80, pas: 1 },
    { cle: 'taillePolice', defaut: 12, dossier: D, libelle: 'corps du texte', min: 9, max: 16, pas: 0.5 },
    { cle: 'maxPastilles', defaut: 6, dossier: D, libelle: 'citations max.', min: 0, max: 12, pas: 1 },
    { cle: 'formules', defaut: true, dossier: D, libelle: 'formules dans les blocs' },
    { cle: 'bandesChoix', defaut: 'survol', dossier: D, libelle: 'repères d’hypothèses', options: { 'au survol / épinglés': 'survol', toujours: 'toujours' } },
    { cle: 'impasses', defaut: true, dossier: D, libelle: 'alternatives rejetées' },
    { cle: 'enTetes', defaut: true, dossier: D, libelle: 'en-têtes de colonnes' },
    { cle: 'legendeFigure', defaut: true, dossier: D, libelle: 'légende de la figure' },
  ],
  reducteursNoeud: [reducteurPoint],
  reducteursArete: [reducteurArete],
  dessinerDessous: (c) => dessinerDessous(c, etat),
  dessinerDessus: (c) => dessinerDessus(c, etat),
  rendreFiche: (p, v, defaut) => {
    const f = defaut()
    const n = v.noeud(p)
    // Titre et énoncé composés : mathématiques en ligne (même règle que les blocs).
    const titre = f.querySelector('.rsn-fiche-titre')
    if (titre) titre.innerHTML = texteHtml(n.nom)
    const enonce = f.querySelector('.rsn-fiche-enonce')
    if (enonce) enonce.innerHTML = texteHtml(n.enonce)
    for (const li of f.querySelectorAll('.rsn-alternatives li, .rsn-bloc-titre')) {
      if (!li.children.length) li.innerHTML = texteHtml(li.textContent ?? '')
    }
    const aide = f.querySelector('.rsn-aide')
    const u = p < v.nU ? v.lecture.unites[p] : undefined
    const page = etat.page
    let texte = 'Clic : lignée · double-clic : cadrer · Échap : effacer'
    if (n.type === 'choix_modelisation') texte = 'Survol : repères sur les énoncés dépendants · clic : épingler'
    else if (u && u.membres.length > 1) texte = `Double-clic : ouvrir le sous-argument (${u.membres.length} énoncés) · clic : lignée`
    else if (u && dansDeplie(v, p)) texte = 'Double-clic : refermer le sous-argument · clic : lignée'
    else if (!u) texte = 'Contexte : clic pour voir les énoncés qui le citent'
    if (aide) aide.textContent = texte
    const sv = etat.survol
    const bandeau = (t: string) => f.prepend(el('div', { class: 'r37-fiche-bandeau' }, t))
    const pluriel = (k: number, mot: string) => `${k} ${mot}${k > 1 ? 's' : ''}`
    if (page && sv?.genre === 'pastille') {
      const k = page.usagesPastille.get(sv.noeud)?.length ?? 0
      const num = page.citations.get(sv.noeud)
      const q = page.contexteAffiche.get(sv.noeud)
      bandeau(`${num ? `[${num}]` : q !== undefined ? page.boites[q]!.ref : 'Contexte'} · cité par ${pluriel(k, 'énoncé')}`)
    } else if (page && sv?.genre === 'renvoi') {
      const k = page.usagesRenvoi.get(sv.point)?.length ?? 0
      bandeau(`Renvoi ${page.boites[sv.point]?.ref} · cité par ${pluriel(k, 'énoncé')} en aval`)
    } else if (page && p < v.nU && page.boites[p]) {
      const b = page.boites[p]!
      const statut = b.abandon ? 'pointillé : piste abandonnée' : n.statut === 'valide' ? 'trait plein : validé' : n.statut === 'incertain' ? 'tireté : à vérifier' : 'barré : réfuté'
      if (b.genre === 'drapeau') {
        const k = page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0
        bandeau(`Hypothèse ${b.ref} · ${pluriel(k, 'énoncé')} en dépendent`)
      } else if (b.genre === 'decision') bandeau(`Décision ${b.ref} · rang ${Math.max(0, b.rang)}`)
      else bandeau(`Énoncé ${b.ref} · rang ${Math.max(0, b.rang)} · ${statut}`)
    }
    return f
  },
  panneau: (p, v) => p.ajouterSection('r37', 'Figure', construirePanneau(v), { position: 'lecture' }),
})

// Les pastilles et liens sémantiques par défaut sont remplacés par ceux de la vision.
vue.dessinsDessus.splice(0, 2)

const compo = new Composition(vue.scene)
etat.compo = compo

// ─── Légende de la figure (sous la figure, comme \caption) ───────────────────

/** Contenu de la légende : conventions, niveau et comptes, puis le contexte cité. */
function contenuLegende(page: MiseEnPage): string {
  const s = vue.lecture.stats
  const niveau = NIVEAUX.find((n) => n.id === niveauDeStrategie(vue.strategie.id))?.nom.toLowerCase() ?? vue.strategie.nom
  const hyps = [...etat.hypotheses.values()]
  const plage = hyps.length > 1 ? `${hyps[0]}–${hyps[hyps.length - 1]}` : hyps[0] ?? ''
  const j = vue.justification
  const biblio = page.bibliographie.map((i, k) => `[${k + 1}]&nbsp;${texteHtml(j.noeuds[i]!.nom)}`).join(' ; ')
  const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
  return [
    `<span class="r37-fig">Figure 1</span> – ${esc(vue.jeu.titre)}. `,
    'Lecture de gauche à droite ; les nombres sous les en-têtes sont les rangs logiques. ',
    'Trait plein : validé ; tireté : à vérifier ; barré : réfuté ; pointillé gris : piste abandonnée ; ',
    'double cadre : résultat ; cadre doublé en retrait : sous-argument replié. ',
    `${katexHtml('\\hat c')} : confiance estimée et intervalle ; validation <span class="r37-sc">h</span> (humain), <span class="r37-sc">ia</span>, <span class="r37-sc">ia+h</span>. `,
    'Losanges : décisions ; ×&nbsp;: alternative rejetée. ',
    plage ? `${plage} : hypothèses de modélisation ; « sous (i) » marque les énoncés qui en dépendent. ` : '',
    `Niveau « ${esc(niveau)} » : ${vue.nU} éléments pour ${s.noeudsComplet} nœuds, ${s.aretes} liaisons pour ${s.aretesComplet} arêtes.`,
    biblio ? ` Contexte cité : ${biblio}.` : '',
  ].join('')
}

function majLegende(page: MiseEnPage): void {
  const b = page.bornes
  const largeurFigure = b.x1 - b.x0
  const largeur = Math.max(420, Math.min(960, largeurFigure))
  etat.legende.largeur = largeur
  etat.legende.x0 = (b.x0 + b.x1) / 2 - largeur / 2
  etat.legende.h = compo.remplirLegende(contenuLegende(page), largeur, 11)
}

// ─── Cadrage : toute la figure, en-têtes et légende compris (2D) ─────────────

const cadrerToutDefaut = vue.cadrerTout.bind(vue)
vue.cadrerTout = (duree?: number) => {
  const page = etat.page
  if (!page || vue.mode !== '2d') return cadrerToutDefaut(duree)
  const b = page.bornes
  const E = page.echelle
  const L = etat.legende
  const legende = vue.reglages.lire<boolean>('legendeFigure')
  let x0 = b.x0, x1 = b.x1
  if (legende) {
    x0 = Math.min(x0, L.x0)
    x1 = Math.max(x1, L.x0 + L.largeur)
  }
  // Colonne du contexte pur (liens complets) : incluse si elle est affichée.
  if (vue.reglages.valeurs.liensComplets && vue.nP > vue.nU) {
    for (let p = vue.nU; p < vue.nP; p++) x0 = Math.min(x0, vue.disposition.x[p]! / E + page.cx - 180)
  }
  const y0 = b.y0 + (vue.reglages.lire<boolean>('enTetes') ? EN_TETE.haut : -10)
  const y1 = legende ? b.y1 + ECART_LEGENDE + L.h : b.y1 + 16
  const coins = new Float32Array([
    (x0 - page.cx) * E, 0, -(y0 - page.cy) * E,
    (x1 - page.cx) * E, 0, -(y1 - page.cy) * E,
  ])
  vue.camera.cadrer(coins, null, duree ?? vue.reglages.valeurs.dureeTransition, 1.03, vue.zoneSure())
  vue.demanderRendu()
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
  const W = R.lire<number>('largeurCarte')
  const options = { largeur: W, taille: R.lire<number>('taillePolice'), formules: R.lire<boolean>('formules') }
  const { disposition, page } = mettreEnPage(vue.lecture, {
    largeurCarte: W,
    ecartColonnes: R.lire<number>('ecartColonnes'),
    ecartLignes: R.lire<number>('ecartLignes'),
    taillePolice: options.taille,
    maxPastilles: R.lire<number>('maxPastilles'),
    ecartCouches: R.valeurs.ecartCouches,
    police: vue.palette.police,
    precedent: anime ? positionsPrecedentes() : undefined,
    mesurer: (p, genre, membres) => compo.mesurer(vue, p, genre, membres, options),
    pad: PAD,
  })
  attribuerHypotheses(page)
  etat.page = page
  etat.survol = null
  compo.attacher(vue, page)
  majLegende(page)
  majMarges()
  appliquerDisposition(disposition, anime)
  if (cadrerApres) {
    cadrerApres = false
    vue.cadrerTout(anime ? undefined : 1)
  } else if (anime && horsEcran()) vue.cadrerTout()
  majPanneau()
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

/** Marges de cadrage : la figure entière est cadrée par ses coins (voir cadrerTout). */
function majMarges(): void {
  vue.margesSures = { gauche: 12, droite: -138, haut: 6, bas: 6 }
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

// ─── Survol : cibles dessinées (blocs, citations, hypothèses, alternatives) ──

vue.pointSous = (x: number, y: number) => {
  const c = cibleSous(etat, x, y)
  const avant = etat.survol
  etat.survol = c
  if ((avant?.genre !== c?.genre || avant?.noeud !== c?.noeud || avant?.point !== c?.point) && ['pastille', 'renvoi', 'drapeau'].some((g) => avant?.genre === g || c?.genre === g)) vue.demanderRendu()
  if (!c) return null
  if (c.genre === 'pastille') return vue.pointDeNoeud(c.noeud)
  return c.point
}

// Clic sur une hypothèse de modélisation : épingler / désépingler ses repères (au lieu de la lignée).
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

// ─── Double-clic : ouvrir un sous-argument sur place, le refermer ────────────

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

vue.on('reglage', ({ cle }) => {
  if (cle === 'niveau') definirNiveau(vue.reglages.lire<string>('niveau') as Niveau)
  else if (['largeurCarte', 'ecartColonnes', 'ecartLignes', 'taillePolice', 'maxPastilles', 'ecartCouches', 'formules'].includes(cle)) {
    cadrerApres = cle !== 'maxPastilles'
    recalculer(true)
  } else if (cle === 'legendeFigure' || cle === 'enTetes') {
    vue.cadrerTout()
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
  etat.palette = lirePaletteR37(vue.racine)
})
etat.palette = lirePaletteR37(vue.racine)

// ─── Panneau ☰ ───────────────────────────────────────────────────────────────

function construirePanneau(v: VueRaisonnement): HTMLElement {
  corpsPanneau = el('div', { class: 'r37-panneau' })
  void v
  return corpsPanneau
}

function majPanneau(): void {
  if (!corpsPanneau || !etat.page) return
  const v = vue
  const page = etat.page
  const niveau = niveauDeStrategie(v.strategie.id)
  const compte = { blocs: 0, sousArguments: 0, decisions: 0, hypotheses: 0, rejetees: 0, citations: 0, renvois: 0 }
  for (let p = 0; p < v.nU; p++) {
    const b = page.boites[p]!
    if (b.genre === 'drapeau') compte.hypotheses++
    else if (b.genre === 'decision') {
      compte.decisions++
      if (b.impasse) compte.rejetees++
    } else {
      compte.blocs++
      if (b.genre === 'etape') compte.sousArguments++
    }
    compte.citations += b.pastilles.length
    compte.renvois += b.renvois.length
  }
  const s = v.lecture.stats
  const boutons = el('div', { class: 'r37-niveaux' }, NIVEAUX.map((n) =>
    el('button', { type: 'button', class: `rsn-bouton${n.id === niveau ? ' actif' : ''}`, onclick: () => definirNiveau(n.id) }, n.nom)))
  const ligne = (k: string, val: string | number) => el('div', { class: 'r37-ligne' }, el('span', {}, k), el('span', { class: 'r37-valeur' }, String(val)))
  const hyps = [...etat.hypotheses].map(([p, ref]) => {
    const n = v.noeud(p)
    const c = el('input', { type: 'checkbox' }) as HTMLInputElement
    c.checked = etat.epingles.has(p)
    c.addEventListener('change', () => basculerEpingle(n.id, c.checked))
    const nom = el('span', { class: 'r37-hyp-liste-nom' })
    nom.innerHTML = texteHtml(n.nom)
    return el('label', { class: 'r37-hyp-liste' }, c,
      el('span', { class: 'r37-ref' }, ref),
      nom,
      el('span', { class: 'r37-valeur' }, String(page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0)))
  })
  corpsPanneau.replaceChildren(
    el('div', { class: 'rsn-doux rsn-petit' }, 'Niveau de détail'),
    boutons,
    el('div', { class: 'r37-nomenclature' },
      ligne('Éléments affichés / nœuds', `${v.nU} / ${s.noeudsComplet}`),
      ligne('Liaisons / arêtes', `${s.aretes} / ${s.aretesComplet}`),
      ligne('Énoncés · dont sous-arguments', `${compte.blocs} · ${compte.sousArguments}`),
      ligne('Décisions · alternatives rejetées', `${compte.decisions} · ${compte.rejetees}`),
      ligne('Hypothèses de modélisation', compte.hypotheses),
      ligne('Citations de contexte · renvois', `${compte.citations} · ${compte.renvois}`),
      ligne('Contexte distinct cité', page.bibliographie.length),
      ligne('Jonctions', page.jonctions.length),
    ),
    etatSquelette.deplies.size
      ? el('button', { type: 'button', class: 'rsn-bouton', onclick: () => {
          etatSquelette.ouvertes.clear()
          etatSquelette.deplies.clear()
          v.definirStrategie(v.strategie)
        } }, `Refermer les sous-arguments (${etatSquelette.deplies.size})`)
      : el('div', { class: 'rsn-doux rsn-petit' }, 'Double-clic sur un sous-argument (cadre doublé) pour l’ouvrir sur place.'),
    el('div', { class: 'rsn-groupe-titre' }, 'Hypothèses de modélisation (épingler) · portée'),
    el('div', { class: 'r37-liste-hyp' }, hyps),
  )
}

// ─── Polices : relayout quand Computer Modern et les fontes KaTeX arrivent ────

{
  let minuterie = 0
  const relayout = () => {
    window.clearTimeout(minuterie)
    minuterie = window.setTimeout(() => {
      compo.vider()
      recalculer(false)
      vue.demanderRendu()
    }, 60)
  }
  document.fonts?.addEventListener('loadingdone', relayout)
  const faces = ['400 12px "CMU Serif"', 'italic 400 12px "CMU Serif"', '700 12px "CMU Serif"', '400 12px KaTeX_Main', 'italic 400 12px KaTeX_Math']
  void Promise.all(faces.map((f) => document.fonts.load(f).catch(() => []))).then(() => {
    cadrerApres = true
    relayout()
  })
}

// ─── Démarrage ───────────────────────────────────────────────────────────────

{
  const n = vue.reglages.lire<string>('niveau') as Niveau
  if (STRATEGIE_NIVEAU[n] && vue.strategie.id !== STRATEGIE_NIVEAU[n]) vue.definirStrategie(STRATEGIE_NIVEAU[n])
  else recalculer(false)
}

// Convention : le script de capture lit window.rsnVue.
;(window as unknown as { rsnVue: typeof vue; r37b: EtatRendu }).rsnVue = vue
;(window as unknown as { r37b: EtatRendu }).r37b = etat

// Sélecteur de jeu, sous le lien vers le catalogue.
{
  const choix = el('select', { class: 'r37-jeu-choix', 'aria-label': 'Raisonnement affiché' }) as HTMLSelectElement
  for (const [cle, libelle] of Object.entries(JEUX)) choix.append(new Option(libelle, cle, false, cle === jeuChoisi))
  choix.addEventListener('change', () => {
    const url = new URL(location.href)
    if (choix.value === 'fontaine') url.searchParams.delete('jeu')
    else url.searchParams.set('jeu', choix.value)
    location.href = url.toString()
  })
  document.body.append(el('label', { class: 'r37-jeu' }, el('span', {}, 'Jeu'), choix))
}
