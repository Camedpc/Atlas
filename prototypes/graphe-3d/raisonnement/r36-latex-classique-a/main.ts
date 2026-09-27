// R36 · LaTeX classique (essai A) : le schéma R14 composé comme une figure d'article de physique.
//
// - Dérivation reprise de R14 / R1 (squelette.ts) : contexte en bornes, élagage vers les résultats majeurs,
//   réduction transitive, repli des sous-arguments exclusifs en sous-systèmes (double-clic : ouvrir).
// - Mise en page (mise-en-page.ts) : rangs logiques en colonnes, ports d'entrée répartis, jonctions ;
//   hauteurs des blocs mesurées sur leur composition HTML.
// - Composition (composition.ts + formules.ts) : Computer Modern, en-têtes façon amsthm, formules
//   extraites des énoncés par une règle générique et composées par KaTeX (cdn.jsdelivr.net).
// - Rendu (rendu.ts) : cadres fins, pointes LaTeX, axe des rangs, accolades des zones ; légende
//   « Figure 1 – … » sous la figure (elle remplace le cartouche de R14).

import {
  creerVueRaisonnement, el, LIBELLES_TYPE, type Disposition, type ReducteurAreteR, type ReducteurPoint, type VueRaisonnement,
} from '../../src/raisonnement'
import { Composition } from './composition'
import { enLigne, formulesHtml, katex, rendreTex, texConfiance } from './formules'
import { jeuFontaine } from './jeu-fontaine'
import meta from './meta.json'
import { mettreEnPage, type MiseEnPage } from './mise-en-page'
import {
  cibleSous, dependantsActifs, dessinerDessous, dessinerDessus, lirePaletteR36, type EtatRendu,
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
}

// État de la vision (déclaré avant la vue : ses rappels servent dès la construction).
let corpsPanneau: HTMLElement | null = null
let cadrerApres = true
let epinglesIds = new Set<string>()

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

const D = 'Figure R36'
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
    { cle: 'largeurCarte', defaut: 184, dossier: D, libelle: 'largeur bloc', min: 120, max: 300, pas: 2 },
    { cle: 'ecartColonnes', defaut: 46, dossier: D, libelle: 'écart colonnes', min: 24, max: 160, pas: 2 },
    { cle: 'ecartLignes', defaut: 20, dossier: D, libelle: 'écart lignes', min: 4, max: 80, pas: 1 },
    { cle: 'taillePolice', defaut: 13, dossier: D, libelle: 'corps du texte', min: 10, max: 18, pas: 0.5 },
    { cle: 'maxPastilles', defaut: 5, dossier: D, libelle: 'bornes max.', min: 0, max: 12, pas: 1 },
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
    f.classList.add('r36-fiche')
    const n = v.noeud(p)
    // Titre et énoncé composés (mathématiques en ligne), formules en display, confiance en notation physique.
    const titre = f.querySelector('.rsn-fiche-titre')
    if (titre) titre.innerHTML = enLigne(n.nom)
    const enonce = f.querySelector('.rsn-fiche-enonce')
    if (enonce) {
      enonce.innerHTML = enLigne(n.enonce)
      const fm = formulesHtml(n.enonce)
      if (fm) {
        const d = el('div', { class: 'r36-fiche-formule' })
        d.innerHTML = fm
        enonce.after(d)
      }
    }
    const barre = f.querySelector('.rsn-confiance span')
    if (barre) barre.innerHTML = rendreTex(`${texConfiance(n.confiance)}\\quad [${n.confiance.bas.toFixed(2).replace('.', '{,}')}\\,;\\,${n.confiance.haut.toFixed(2).replace('.', '{,}')}]`, barre.textContent ?? '')
    const aide = f.querySelector('.rsn-aide')
    const u = p < v.nU ? v.lecture.unites[p] : undefined
    const page = etat.page
    let texte = 'Clic : lignée · double-clic : cadrer · Échap : effacer'
    if (n.type === 'choix_modelisation') texte = 'Survol : renvois sur les blocs dépendants · clic : épingler'
    else if (u && u.membres.length > 1) texte = `Double-clic : ouvrir le sous-système (${u.membres.length} énoncés) · clic : lignée`
    else if (u && dansDeplie(v, p)) texte = 'Double-clic : refermer le sous-système · clic : lignée'
    else if (!u) texte = 'Contexte : clic pour voir les blocs qui l’utilisent'
    if (aide) aide.textContent = texte
    const sv = etat.survol
    const bandeau = (t: string) => f.prepend(el('div', { class: 'r36-fiche-bandeau' }, t))
    if (page && sv?.genre === 'pastille') {
      const k = page.usagesPastille.get(sv.noeud)?.length ?? 0
      bandeau(`Borne de contexte — ${k} bloc${k > 1 ? 's' : ''} l’utilise${k > 1 ? 'nt' : ''}`)
    } else if (page && sv?.genre === 'renvoi') {
      const k = page.usagesRenvoi.get(sv.point)?.length ?? 0
      bandeau(`Renvoi à ${page.boites[sv.point]?.ref} — cité par ${k} bloc${k > 1 ? 's' : ''} en aval`)
    } else if (page && p < v.nU && page.boites[p]) {
      const b = page.boites[p]!
      const statut = n.statut === 'valide' ? 'trait plein : validé' : n.statut === 'incertain' ? 'trait tireté : à vérifier' : 'barré : réfuté'
      if (b.genre === 'drapeau') {
        const k = page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0
        bandeau(`Hypothèse ${b.ref} — ${k} bloc${k > 1 ? 's' : ''} en dépend${k > 1 ? 'ent' : ''}`)
      } else if (b.genre === 'decision') bandeau(`Décision ${b.ref} — rang ${Math.max(0, b.rang)}`)
      else bandeau(`${LIBELLES_TYPE[n.type]} ${b.ref} — rang ${Math.max(0, b.rang)} — ${statut}`)
    }
    return f
  },
  panneau: (p, v) => p.ajouterSection('r36', 'Figure', construirePanneau(v), { position: 'lecture' }),
})

// Les pastilles et liens sémantiques par défaut sont remplacés par ceux de la vision.
vue.dessinsDessus.splice(0, 2)
etat.composition = new Composition(vue.scene)

// ─── Légende de figure (remplace le cartouche) ───────────────────────────────

function majLegende(): void {
  const comp = etat.composition
  const page = etat.page
  if (!comp || !page) return
  const s = vue.lecture.stats
  const niveau = NIVEAUX.find((n) => n.id === niveauDeStrategie(vue.strategie.id))?.nom.toLowerCase() ?? vue.strategie.nom
  let dec = 0, hyp = 0
  for (let p = 0; p < vue.nU; p++) {
    const g = page.boites[p]!.genre
    if (g === 'drapeau') hyp++
    else if (g === 'decision') dec++
  }
  const blocs = vue.nU - dec - hyp
  const resume = vue.jeu.resume ? ` ${enLigne(vue.jeu.resume)}` : ''
  comp.legende.innerHTML = `<span class="r36-sc">Figure</span> 1 – <i>${enLigne(vue.jeu.titre)}.</i>${resume}`
    + ` Graphe de lecture, niveau « ${niveau} » : ${blocs} énoncés, ${dec} décision${dec > 1 ? 's' : ''} et ${hyp} hypothèse${hyp > 1 ? 's' : ''} de modélisation`
    + ` pour ${s.noeudsComplet} nœuds ; ${s.aretes} liaisons pour ${s.aretesComplet} arêtes de justification.`
    + ` Trait plein : validé ; tireté : à vérifier ; barré : réfuté ; pointillé gris : piste abandonnée ; double cadre : résultat ;`
    + ` cadre doublé en retrait : sous-système (double-clic pour l’ouvrir). Losange : décision, × : alternative non retenue ;`
    + ` coins arrondis : hypothèse de modélisation. ${rendreTex('c', 'c')} : confiance estimée, en exposant et en indice les bornes de son intervalle ;`
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

function recalculer(anime: boolean): void {
  const R = vue.reglages
  const comp = etat.composition!
  const largeur = R.lire<number>('largeurCarte')
  const taille = R.lire<number>('taillePolice')
  const precedent = anime ? positionsPrecedentes() : undefined
  const calculer = (hauteurs: Map<number, number>) => mettreEnPage(vue.lecture, {
    largeurCarte: largeur,
    ecartColonnes: R.lire<number>('ecartColonnes'),
    ecartLignes: R.lire<number>('ecartLignes'),
    taillePolice: taille,
    maxPastilles: R.lire<number>('maxPastilles'),
    ecartCouches: R.valeurs.ecartCouches,
    police: vue.palette.police,
    precedent,
    hauteurs,
  })
  // Composition (numéros provisoires « 00 »), mise en page, numéros définitifs ; une seconde mise en page
  // seulement si un numéro plus court a changé une hauteur.
  const h1 = comp.composer(vue, { largeur, taille }, null)
  let { disposition, page } = calculer(h1)
  comp.numeroter(vue, page)
  const h2 = comp.mesurer()
  if ([...h2].some(([p, h]) => Math.abs(h - (h1.get(p) ?? h)) > 0.5)) {
    ;({ disposition, page } = calculer(h2))
    comp.numeroter(vue, page)
  }
  comp.couche.classList.toggle('r36-sans-impasses', !R.lire<boolean>('impasses'))
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
  majLegende()
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

/** Marges de cadrage : blocs autour du point d'ancrage, axe en haut, légende en bas. */
function majMarges(): void {
  const W = vue.reglages.lire<number>('largeurCarte')
  const legende = vue.reglages.lire<boolean>('legende')
  vue.margesSures = { gauche: W / 2 + 30, droite: W / 2 + 90 - 150, haut: 118, bas: legende ? 120 : 40 }
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
  if ((avant?.genre !== c?.genre || avant?.noeud !== c?.noeud || avant?.point !== c?.point) && ['pastille', 'renvoi'].some((g) => avant?.genre === g || c?.genre === g)) vue.demanderRendu()
  if (!c) return null
  if (c.genre === 'pastille') return vue.pointDeNoeud(c.noeud)
  return c.point
}

// Clic sur une hypothèse de modélisation : épingler / désépingler ses renvois (au lieu de la lignée).
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
  else if (['largeurCarte', 'ecartColonnes', 'ecartLignes', 'taillePolice', 'maxPastilles', 'ecartCouches'].includes(cle)) {
    cadrerApres = cle !== 'maxPastilles'
    recalculer(true)
  } else if (cle === 'impasses') {
    etat.composition?.couche.classList.toggle('r36-sans-impasses', !valeur)
    vue.demanderRendu()
  } else if (cle === 'legende' || cle === 'axe') {
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
  etat.palette = lirePaletteR36(vue.racine)
})
etat.palette = lirePaletteR36(vue.racine)

// ─── Panneau ☰ ───────────────────────────────────────────────────────────────

function construirePanneau(v: VueRaisonnement): HTMLElement {
  corpsPanneau = el('div', { class: 'r36-panneau' })
  void v
  return corpsPanneau
}

function majPanneau(): void {
  if (!corpsPanneau || !etat.page) return
  const v = vue
  const page = etat.page
  const niveau = niveauDeStrategie(v.strategie.id)
  const compte = { blocs: 0, sousSystemes: 0, decisions: 0, hypotheses: 0, rejetees: 0, bornes: 0, renvois: 0, formules: 0 }
  for (let p = 0; p < v.nU; p++) {
    const b = page.boites[p]!
    if (b.genre === 'drapeau') compte.hypotheses++
    else if (b.genre === 'decision') {
      compte.decisions++
      if (b.impasse) compte.rejetees++
    } else {
      compte.blocs++
      if (b.genre === 'etape') compte.sousSystemes++
      if (formulesHtml(v.noeud(p).enonce)) compte.formules++
    }
    compte.bornes += b.pastilles.length
    compte.renvois += b.renvois.length
  }
  const s = v.lecture.stats
  const boutons = el('div', { class: 'r36-niveaux' }, NIVEAUX.map((n) =>
    el('button', { type: 'button', class: `rsn-bouton${n.id === niveau ? ' actif' : ''}`, onclick: () => definirNiveau(n.id) }, n.nom)))
  const ligne = (k: string, val: string | number) => el('tr', {}, el('td', {}, k), el('td', { class: 'r36-valeur' }, String(val)))
  const hyps = [...etat.hypotheses].map(([p, ref]) => {
    const n = v.noeud(p)
    const c = el('input', { type: 'checkbox' }) as HTMLInputElement
    c.checked = etat.epingles.has(p)
    c.addEventListener('change', () => basculerEpingle(n.id, c.checked))
    const nom = el('span', { class: 'r36-hyp-nom' })
    nom.innerHTML = enLigne(n.nom)
    return el('label', { class: 'r36-hyp' }, c,
      el('span', { class: 'r36-ref' }, ref),
      nom,
      el('span', { class: 'r36-valeur' }, `${page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0}`))
  })
  // Tableau façon booktabs : filets haut et bas épais, filet médian fin, pas de filet vertical.
  const tableau = el('table', { class: 'r36-table' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Élément'), el('th', { class: 'r36-valeur' }, 'Nombre'))),
    el('tbody', {},
      ligne('Blocs visibles / nœuds', `${v.nU} / ${s.noeudsComplet}`),
      ligne('Liaisons / arêtes', `${s.aretes} / ${s.aretesComplet}`),
      ligne('Énoncés · sous-systèmes', `${compte.blocs} · ${compte.sousSystemes}`),
      ligne('Énoncés avec formule', compte.formules),
      ligne('Décisions · non retenues', `${compte.decisions} · ${compte.rejetees}`),
      ligne('Hypothèses de modélisation', compte.hypotheses),
      ligne('Bornes · renvois', `${compte.bornes} · ${compte.renvois}`),
      ligne('Jonctions', page.jonctions.length),
    ),
  )
  corpsPanneau.replaceChildren(
    el('div', { class: 'rsn-doux rsn-petit' }, 'Niveau de détail'),
    boutons,
    tableau,
    etatSquelette.deplies.size
      ? el('button', { type: 'button', class: 'rsn-bouton', onclick: () => {
          etatSquelette.ouvertes.clear()
          etatSquelette.deplies.clear()
          v.definirStrategie(v.strategie)
        } }, `Refermer les sous-systèmes (${etatSquelette.deplies.size})`)
      : el('div', { class: 'rsn-doux rsn-petit' }, 'Double-clic sur un sous-système (cadre doublé en retrait) pour l’ouvrir sur place.'),
    el('div', { class: 'rsn-groupe-titre' }, 'Hypothèses de modélisation (épingler)'),
    el('div', { class: 'r36-liste-hyp' }, hyps),
    el('div', { class: 'rsn-groupe-titre' }, 'Lecture'),
    el('div', { class: 'r36-legende-panneau' },
      el('div', {}, 'La légende complète est sous la figure (réglage « légende de figure »).'),
      el('div', {}, el('i', {}, 'Numérotation'), ' : un compteur commun pour les énoncés (Lemme 7, Théorème 12), D pour les décisions, H pour les hypothèses de modélisation, de gauche à droite puis de haut en bas.'),
      el('div', {}, el('i', {}, 'Formules'), ' : extraites des énoncés par une règle générique (voir NOTES.md) et composées par KaTeX ; l’énoncé complet est dans la fiche.'),
      el('div', {}, el('i', {}, 'sous H1'), ' : le bloc dépend de l’hypothèse H1 (survol ou épingle, en bleu).'),
    ),
  )
}

// ─── Démarrage ───────────────────────────────────────────────────────────────

{
  const n = vue.reglages.lire<string>('niveau') as Niveau
  if (STRATEGIE_NIVEAU[n] && vue.strategie.id !== STRATEGIE_NIVEAU[n]) vue.definirStrategie(STRATEGIE_NIVEAU[n])
  else recalculer(false)
}

// KaTeX et les fontes Computer Modern arrivent du CDN : on recompose quand ils sont là (hauteurs exactes).
{
  // Au plus deux passes : une de secours sans KaTeX (CDN lent), une dès que KaTeX est là.
  let fait = false
  const recomposer = () => {
    if (fait) return
    fait = !!katex()
    const fontes = ['400 13px KaTeX_Main', 'italic 400 13px KaTeX_Main', '700 13px KaTeX_Main', 'italic 400 13px KaTeX_Math', '400 13px KaTeX_Size1']
    void Promise.all(fontes.map((f) => document.fonts.load(f))).catch(() => undefined).then(() => {
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
;(window as unknown as { rsnVue: typeof vue; r36: EtatRendu }).rsnVue = vue
;(window as unknown as { r36: EtatRendu }).r36 = etat

// Sélecteur de jeu, sous le lien vers le catalogue.
{
  const choix = el('select', { class: 'r36-jeu-choix', 'aria-label': 'Raisonnement affiché' }) as HTMLSelectElement
  for (const [cle, libelle] of Object.entries(JEUX)) choix.append(new Option(libelle, cle, false, cle === jeuChoisi))
  choix.addEventListener('change', () => {
    const url = new URL(location.href)
    if (choix.value === 'fontaine') url.searchParams.delete('jeu')
    else url.searchParams.set('jeu', choix.value)
    location.href = url.toString()
  })
  document.body.append(el('label', { class: 'r36-jeu' }, el('span', {}, 'Jeu'), choix))
}
