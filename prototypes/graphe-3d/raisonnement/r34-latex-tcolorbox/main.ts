// R34 · LaTeX · tcolorbox : le schéma technique de R14 tel qu'il serait composé en LaTeX.
//
// - Dérivation reprise de R14 / R1 (squelette.ts) : contexte en bornes, élagage, réduction transitive,
//   sous-arguments repliés (double-clic : déplier sur place).
// - Mise en page (mise-en-page.ts) : colonnes de rangs logiques, ports, jonctions, liaisons orthogonales ;
//   hauteurs mesurées sur les boîtes composées ; sous-problèmes regroupés en bandes et encadrés.
// - Boîtes (boites.ts) : tcolorbox en HTML (bandeau de titre « Lemme 3 — … », formule KaTeX, partie basse),
//   couleurs xcolor par famille (familles.ts), formules extraites des énoncés (formules.ts).
// - Rendu (rendu.ts) : en-tête booktabs des rangs, cadres englobants des sous-problèmes, liaisons.
// Polices Latin Modern et KaTeX chargées depuis cdn.jsdelivr.net ; repli propre sans réseau.

import {
  creerVueRaisonnement, el, type Disposition, type ReducteurAreteR, type ReducteurPoint, type VueRaisonnement,
} from '../../src/raisonnement'
import { CalqueBoites, chargerKatex, katexPret, type ContenuBoite } from './boites'
import { FAMILLES, reference, type Famille } from './familles'
import { jeuFontaine } from './jeu-fontaine'
import meta from './meta.json'
import { mettreEnPage, type GenreBoite, type MiseEnPage, type Pastille } from './mise-en-page'
import { cibleSous, dependantsActifs, dessinerDessous, dessinerDessus, lirePaletteR34, type EtatRendu } from './rendu'
import { etatSquelette, NIVEAUX, niveauDeStrategie, STRATEGIE_NIVEAU, type Niveau } from './squelette'

const etat: EtatRendu = {
  page: null,
  palette: { encre: '#1a1a1a', gris: '#666666', trait: '#4d4d4d', surface: '#ffffff', surface2: '#f5f5f5', cadre: '#737373' },
  calque: null,
  cibles: [],
  survol: null,
  epingles: new Set(),
  hypotheses: new Map(),
}

// État de la vision (déclaré avant la vue : ses rappels servent dès la construction).
let corpsPanneau: HTMLElement | null = null
let cartouche: HTMLElement | null = null
let cadrerApres = true
let epinglesIds = new Set<string>()
let revision = 0
/** Faux tant que KaTeX et les polices ne sont pas prêts (ou le délai écoulé) : pas de mise en page. */
let pret = false

// ─── Réducteurs : points sigma invisibles, opacité pilotée par la vision ───────

const reducteurPoint: ReducteurPoint = (info, a, vue) => {
  // Sigma ne dessine plus les nœuds : les boîtes sont sur le calque HTML.
  a.taille = 0.01
  a.libelle = null
  a.forceLibelle = false
  a.surligne = false
  // Piste abandonnée : grisée par la boîte elle-même, pas par l'opacité.
  if (info.noeud.piste === 'abandonnee') a.opacite = Math.min(info.presence, a.opacite / 0.55)
  const sv = etat.survol
  const actifs = dependantsActifs(etat)
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
// Fontaine de chaîne par défaut ; ?jeu=edp pour le jeu synthétique.

const JEUX = { fontaine: 'Fontaine de chaîne', edp: 'EDP stochastique (synthétique)' } as const
type Jeu = keyof typeof JEUX
const jeuChoisi: Jeu = new URLSearchParams(location.search).get('jeu') === 'edp' ? 'edp' : 'fontaine'

// ─── Vue ─────────────────────────────────────────────────────────────────────

const D = 'Composition R34'
const vue = creerVueRaisonnement(document.getElementById('app')!, {
  // Réglages mémorisés par jeu.
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
    { cle: 'formules', defaut: true, dossier: D, libelle: 'formules (display)' },
    { cle: 'cadres', defaut: true, dossier: D, libelle: 'cadres des sous-problèmes' },
    { cle: 'largeurCarte', defaut: 214, dossier: D, libelle: 'largeur boîte', min: 150, max: 320, pas: 2 },
    { cle: 'ecartColonnes', defaut: 58, dossier: D, libelle: 'écart colonnes', min: 30, max: 180, pas: 2 },
    { cle: 'ecartLignes', defaut: 20, dossier: D, libelle: 'écart lignes', min: 6, max: 80, pas: 1 },
    { cle: 'taillePolice', defaut: 13, dossier: D, libelle: 'corps du texte', min: 10, max: 17, pas: 0.5 },
    { cle: 'maxPastilles', defaut: 5, dossier: D, libelle: 'bornes max.', min: 0, max: 12, pas: 1 },
    { cle: 'bandesChoix', defaut: 'survol', dossier: D, libelle: 'repères d’hypothèses', options: { 'au survol / épinglés': 'survol', toujours: 'toujours' } },
    { cle: 'enTetes', defaut: true, dossier: D, libelle: 'en-tête des rangs' },
    { cle: 'cartouche', defaut: true, dossier: D, libelle: 'cartouche' },
  ],
  reducteursNoeud: [reducteurPoint],
  reducteursArete: [reducteurArete],
  dessinerDessous: (c) => dessinerDessous(c, etat),
  dessinerDessus: (c) => dessinerDessus(c, etat),
  rendreFiche: (p, v, defaut) => {
    const f = defaut()
    const aide = f.querySelector('.rsn-aide')
    const u = p < v.nU ? v.lecture.unites[p] : undefined
    const n = v.noeud(p)
    const page = etat.page
    let texte = 'Clic : lignée · double-clic : cadrer · Échap : effacer'
    if (n.type === 'choix_modelisation') texte = 'Survol : repères ⊢ sur les boîtes dépendantes · clic : épingler'
    else if (u && u.membres.length > 1) texte = `Double-clic : déplier la démonstration (${u.membres.length} énoncés) · clic : lignée`
    else if (u && dansDeplie(v, p)) texte = 'Double-clic : replier la démonstration · clic : lignée'
    else if (!u) texte = 'Contexte : clic pour voir les boîtes qui l’utilisent'
    if (aide) aide.textContent = texte
    const sv = etat.survol
    const bandeau = (t: string) => f.prepend(el('div', { class: 'r34-fiche-bandeau' }, t))
    if (page && sv?.genre === 'pastille') {
      const k = page.usagesPastille.get(sv.noeud)?.length ?? 0
      bandeau(`Borne de contexte · ${k} boîte${k > 1 ? 's' : ''} l’utilise${k > 1 ? 'nt' : ''}`)
    } else if (page && sv?.genre === 'renvoi') {
      const k = page.usagesRenvoi.get(sv.point)?.length ?? 0
      bandeau(`Renvoi → ${page.boites[sv.point]?.ref} · cité par ${k} boîte${k > 1 ? 's' : ''} en aval`)
    } else if (page && p < v.nU && page.boites[p]) {
      const b = page.boites[p]!
      const statut = n.piste === 'abandonnee' ? 'piste abandonnée' : n.statut === 'valide' ? 'cadre continu : validé' : n.statut === 'incertain' ? 'cadre tireté : à vérifier' : 'boîte barrée : réfuté'
      if (b.genre === 'drapeau') {
        const k = page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0
        bandeau(`${b.ref} · ${k} boîte${k > 1 ? 's' : ''} en dépendent`)
      } else bandeau(`${b.ref} · rang ${Math.max(0, b.rang)} · ${statut}`)
    }
    return f
  },
  panneau: (p, v) => p.ajouterSection('r34', 'Composition LaTeX', construirePanneau(v), { position: 'lecture' }),
})

// Les pastilles et liens sémantiques par défaut sont remplacés par ceux de la vision.
vue.dessinsDessus.splice(0, 2)
etat.calque = new CalqueBoites(vue.scene)

// ─── Contenu des boîtes ──────────────────────────────────────────────────────

function genreDe(p: number): GenreBoite {
  const n = vue.noeud(p)
  if (n.type === 'choix_modelisation') return 'drapeau'
  if (n.type === 'decision') return 'decision'
  if ((n.type === 'theoreme' || n.type === 'resultat') && !n.admis) return 'majeur'
  return (vue.lecture.unites[p]?.membres.length ?? 1) > 1 ? 'etape' : 'carte'
}

/** Contenu d'une boîte ; sans page (mesure), références et portée ont une largeur de réserve (« 99 »). */
function contenu(p: number, page: MiseEnPage | null, renvois: number[], pastilles: Pastille[], plus: number): ContenuBoite {
  const n = vue.noeud(p)
  const b = page?.boites[p]
  return {
    noeud: n,
    genre: b?.genre ?? genreDe(p),
    ref: b?.ref ?? reference(n, 99).longue,
    renvois: renvois.map((q) => page?.boites[q]?.refCourte ?? reference(vue.noeud(q), 99).courte),
    pastilles,
    plus,
    membres: vue.lecture.unites[p]?.membres.length ?? 1,
    portee: page ? page.portees.get(p)?.filter((q) => q < vue.nU).length ?? 0 : 99,
    formules: vue.reglages.lire<boolean>('formules'),
  }
}

// ─── Cartouche : un tableau booktabs, légende au-dessus ──────────────────────

function construireCartouche(): HTMLElement {
  const c = el('div', { class: 'r34-cartouche' })
  vue.interface.append(c)
  return c
}

let echelleAffichee = ''
function texteEchelle(): string {
  const s = vue.camera.pixelsParUnite() * (etat.page?.echelle ?? 0.01)
  return `1 : ${(1 / Math.max(1e-6, s)).toFixed(2).replace('.', ',')}`
}

function environnements(page: MiseEnPage): string {
  const compte = new Map<string, number>()
  for (let p = 0; p < vue.nU; p++) {
    const r = page.boites[p]!.refCourte
    const cle = r.startsWith('(H') ? '(H)' : r.replace(/\s?\d+$/, '').replace(/ $/, '')
    compte.set(cle, (compte.get(cle) ?? 0) + 1)
  }
  return [...compte].map(([k, n]) => `${k} ${n}`).join(' · ')
}

function majCartouche(): void {
  cartouche ??= construireCartouche()
  cartouche.hidden = !vue.reglages.lire<boolean>('cartouche')
  const page = etat.page
  if (!page) return
  const s = vue.lecture.stats
  const niveau = NIVEAUX.find((n) => n.id === niveauDeStrategie(vue.strategie.id))?.nom ?? vue.strategie.nom
  const rev = String.fromCharCode(65 + ((revision - 1) % 26))
  echelleAffichee = texteEchelle()
  const ligne = (a: string, va: string, b: string, vb: string, classe = '') =>
    el('tr', { class: classe }, el('th', {}, a), el('td', {}, va), el('th', {}, b), el('td', { class: b === 'Échelle' ? 'r34-echelle' : '' }, vb))
  cartouche.replaceChildren(
    el('div', { class: 'r34-legende-tableau' }, el('span', { class: 'r34-sc' }, 'Tableau 1'), ` — ${vue.jeu.titre}`),
    el('table', {},
      el('tbody', {},
        ligne('Éléments', `${vue.nU} / ${s.noeudsComplet}`, 'Liaisons', `${s.aretes} / ${s.aretesComplet}`),
        ligne('Niveau', niveau, 'Révision', rev),
        ligne('Date', new Date().toISOString().slice(0, 10), 'Échelle', echelleAffichee),
        el('tr', { class: 'r34-derniere' }, el('th', {}, 'Environ.'), el('td', { colspan: '3' }, environnements(page))),
      ),
    ),
  )
}

vue.on('image', () => {
  if (!cartouche || cartouche.hidden) return
  const t = texteEchelle()
  if (t === echelleAffichee) return
  echelleAffichee = t
  const v = cartouche.querySelector('.r34-echelle')
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
  for (let p = 0; p < Math.min(vue.nU, vue.disposition.nU); p++) {
    const u = vue.lecture.unites[p]
    if (!u) continue
    const y = -vue.disposition.z[p]! / page.echelle
    u.membres.forEach((mb, k) => m.set(j.noeuds[mb]!.id, y + k * 1e-3))
  }
  return m
}

function recalculer(anime: boolean): void {
  if (!pret) return
  const R = vue.reglages
  const calque = etat.calque!
  const W = R.lire<number>('largeurCarte')
  vue.scene.style.setProperty('--r34-corps', `${R.lire<number>('taillePolice')}px`)
  const { disposition, page } = mettreEnPage(vue.lecture, {
    largeurCarte: W,
    ecartColonnes: R.lire<number>('ecartColonnes'),
    ecartLignes: R.lire<number>('ecartLignes'),
    taillePolice: R.lire<number>('taillePolice'),
    maxPastilles: R.lire<number>('maxPastilles'),
    ecartCouches: R.valeurs.ecartCouches,
    police: vue.palette.police,
    // Hauteur : la boîte composée (réserve « 99 » pour les numéros encore inconnus).
    hauteur: (p, renvois, montrees, plus) => calque.mesurer(
      contenu(p, null, renvois, Array.from({ length: montrees }, () => ({ noeud: -1, lettre: 'H', couche: 0 })), plus), W),
    cadres: R.lire<boolean>('cadres'),
    sousProblemes: vue.jeu.sousProblemes,
    precedent: anime ? positionsPrecedentes() : undefined,
  })
  attribuerHypotheses(page)
  etat.page = page
  etat.survol = null
  calque.construire(page, page.boites.map((b, p) => (p < vue.nU ? contenu(p, page, b.renvois, b.pastilles, b.plus) : null)))
  revision++
  majMarges()
  appliquerDisposition(disposition, anime)
  if (cadrerApres) {
    cadrerApres = false
    vue.cadrerTout(anime ? undefined : 1)
  } else if (anime && horsEcran()) vue.cadrerTout()
  majPanneau()
  majCartouche()
  vue.demanderRendu()
}

/** Repères des hypothèses de modélisation présentes ; les épingles suivent les ids. */
function attribuerHypotheses(page: MiseEnPage): void {
  etat.hypotheses = new Map()
  etat.epingles = new Set()
  for (let p = 0; p < vue.lecture.unites.length; p++) {
    const b = page.boites[p]!
    if (b.genre !== 'drapeau') continue
    etat.hypotheses.set(p, b.refCourte)
    if (epinglesIds.has(vue.justification.noeuds[vue.lecture.unites[p]!.conclusion]!.id)) etat.epingles.add(p)
  }
}

/** Marges de cadrage : boîtes autour du point d'ancrage, en-tête en haut, cadres autour. */
function majMarges(): void {
  const W = vue.reglages.lire<number>('largeurCarte')
  vue.margesSures = { gauche: W / 2 + 36, droite: W / 2 + 30 - 150, haut: 170, bas: 90 }
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

// ─── Survol : cibles (boîtes, renvois, bornes) ───────────────────────────────

vue.pointSous = (x: number, y: number) => {
  const c = cibleSous(etat, x, y)
  const avant = etat.survol
  etat.survol = c
  if ((avant?.genre !== c?.genre || avant?.noeud !== c?.noeud || avant?.point !== c?.point) && ['pastille', 'renvoi'].some((g) => avant?.genre === g || c?.genre === g)) vue.demanderRendu()
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

// ─── Double-clic : déplier une démonstration repliée sur place, la replier ────

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
  else if (['largeurCarte', 'ecartColonnes', 'ecartLignes', 'taillePolice', 'maxPastilles', 'ecartCouches', 'cadres', 'formules'].includes(cle)) {
    cadrerApres = cle !== 'maxPastilles' && cle !== 'formules'
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
  etat.palette = lirePaletteR34(vue.racine)
})
etat.palette = lirePaletteR34(vue.racine)

// ─── Panneau ☰ ───────────────────────────────────────────────────────────────

function construirePanneau(v: VueRaisonnement): HTMLElement {
  corpsPanneau = el('div', { class: 'r34-panneau' })
  void v
  return corpsPanneau
}

function nuancier(f: Famille): HTMLElement {
  const d = FAMILLES[f]
  return el('div', { class: 'r34-famille' },
    el('span', { class: 'r34-echantillon', style: `border-color:${d.cadre};background:${d.fond}` }, el('span', { style: `background:${d.cadre}` })),
    el('span', { class: 'r34-famille-nom' }, d.nom),
    el('code', {}, d.xcolor))
}

function majPanneau(): void {
  if (!corpsPanneau || !etat.page) return
  const v = vue
  const page = etat.page
  const niveau = niveauDeStrategie(v.strategie.id)
  const compte = { boites: 0, replies: 0, decisions: 0, hypotheses: 0, bornes: 0, renvois: 0 }
  for (let p = 0; p < v.nU; p++) {
    const b = page.boites[p]!
    if (b.genre === 'drapeau') compte.hypotheses++
    else if (b.genre === 'decision') compte.decisions++
    else {
      compte.boites++
      if (b.genre === 'etape') compte.replies++
    }
    compte.bornes += b.pastilles.length
    compte.renvois += b.renvois.length
  }
  const s = v.lecture.stats
  const boutons = el('div', { class: 'r34-niveaux' }, NIVEAUX.map((n) =>
    el('button', { type: 'button', class: `rsn-bouton${n.id === niveau ? ' actif' : ''}`, onclick: () => definirNiveau(n.id) }, n.nom)))
  const ligne = (k: string, val: string | number) => el('div', { class: 'r34-ligne' }, el('span', {}, k), el('span', { class: 'r34-valeur' }, String(val)))
  const hyps = [...etat.hypotheses].map(([p, ref]) => {
    const n = v.noeud(p)
    const c = el('input', { type: 'checkbox' }) as HTMLInputElement
    c.checked = etat.epingles.has(p)
    c.addEventListener('change', () => basculerEpingle(n.id, c.checked))
    return el('label', { class: 'r34-hyp' }, c,
      el('span', { class: 'r34-ref' }, ref),
      el('span', { class: 'r34-hyp-nom' }, n.nom),
      el('span', { class: 'r34-valeur' }, `→ ${page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0}`))
  })
  corpsPanneau.replaceChildren(
    el('div', { class: 'rsn-doux rsn-petit' }, 'Niveau de détail'),
    boutons,
    el('div', { class: 'r34-nomenclature' },
      ligne('Boîtes visibles / nœuds', `${v.nU} / ${s.noeudsComplet}`),
      ligne('Liaisons / arêtes', `${s.aretes} / ${s.aretesComplet}`),
      ligne('Énoncés · dont repliés', `${compte.boites} · ${compte.replies}`),
      ligne('Décisions', compte.decisions),
      ligne('Hypothèses de modélisation', compte.hypotheses),
      ligne('Bornes · renvois', `${compte.bornes} · ${compte.renvois}`),
      ligne('Sous-problèmes encadrés', page.cadres.filter((c) => !c.marge).length),
      ligne('Jonctions', page.jonctions.length),
      ligne('KaTeX', katexPret() ? 'chargé' : 'indisponible (texte)'),
    ),
    etatSquelette.deplies.size
      ? el('button', { type: 'button', class: 'rsn-bouton', onclick: () => {
          etatSquelette.ouvertes.clear()
          etatSquelette.deplies.clear()
          v.definirStrategie(v.strategie)
        } }, `Replier les démonstrations (${etatSquelette.deplies.size})`)
      : el('div', { class: 'rsn-doux rsn-petit' }, 'Double-clic sur une boîte doublée (démonstration repliée) pour la déplier sur place.'),
    el('div', { class: 'rsn-groupe-titre' }, 'Hypothèses de modélisation (épingler)'),
    el('div', { class: 'r34-liste-hyp' }, hyps),
    el('div', { class: 'rsn-groupe-titre' }, 'Familles (xcolor)'),
    el('div', { class: 'r34-familles' }, (Object.keys(FAMILLES) as Famille[]).map(nuancier)),
    el('div', { class: 'rsn-groupe-titre' }, 'Légende'),
    el('div', { class: 'r34-legende' },
      el('div', {}, el('b', {}, 'Cadre continu'), ' validé · ', el('b', {}, 'tireté'), ' à vérifier · ', el('b', {}, 'barré'), ' réfuté · ', el('b', {}, 'pointillé gris'), ' piste abandonnée.'),
      el('div', {}, el('b', {}, 'Bandeau'), ' : environnement numéroté et nom ; à droite, validation (H, IA, IA+H).'),
      el('div', {}, el('b', {}, 'Corps'), ' : formule(s) extraite(s) de l’énoncé en display, sinon l’énoncé.'),
      el('div', {}, el('b', {}, 'Partie basse'), ' : renvois (Lem. 2), bornes de contexte (H hypothèse, D définition, O outil, A axiome, L littérature, + auxiliaire), confiance c et intervalle.'),
      el('div', {}, el('b', {}, 'Cadre gris titré'), ' : sous-problème ; ', el('b', {}, 'feuille décalée'), ' : démonstration repliée.'),
      el('div', {}, el('b', {}, 'Point plein'), ' : jonction ; ', el('b', {}, '⊢ (H1)'), ' : la boîte dépend de l’hypothèse (H1).'),
    ),
  )
}

// ─── Démarrage : KaTeX et polices, puis première mise en page ────────────────

/** Latin Modern (style.css) et les principales polices de KaTeX (katex.min.css) : mesures justes. */
async function chargerPolices(): Promise<void> {
  const f = document.fonts
  const polices = [
    "13px 'LM Roman 10'", "bold 13px 'LM Roman 10'", "italic 13px 'LM Roman 10'",
    '16px KaTeX_Main', 'italic 16px KaTeX_Math', 'bold 16px KaTeX_Main', '16px KaTeX_AMS', '16px KaTeX_Size1',
  ]
  await Promise.all(polices.map((x) => f.load(x).catch(() => [])))
}

// Une police arrivée après la mise en page (KaTeX charge certaines fontes à la demande) : recomposer,
// dans les 15 premières secondes seulement.
{
  const debut = performance.now()
  let attente = 0
  document.fonts.addEventListener('loadingdone', () => {
    if (!pret || performance.now() - debut > 15000) return
    window.clearTimeout(attente)
    attente = window.setTimeout(() => recalculer(false), 250)
  })
}

function premiereMiseEnPage(): void {
  pret = true
  const n = vue.reglages.lire<string>('niveau') as Niveau
  if (STRATEGIE_NIVEAU[n] && vue.strategie.id !== STRATEGIE_NIVEAU[n]) vue.definirStrategie(STRATEGIE_NIVEAU[n])
  else recalculer(false)
}

{
  const ressources = Promise.all([chargerKatex(), chargerPolices()])
  let fait = false
  // Sans réseau : première mise en page après 2,5 s en texte seul, recomposée si KaTeX arrive ensuite.
  const delai = window.setTimeout(() => {
    if (fait) return
    fait = true
    premiereMiseEnPage()
  }, 2500)
  void ressources.then(() => {
    if (!fait) {
      fait = true
      window.clearTimeout(delai)
      premiereMiseEnPage()
    } else recalculer(false)
  })
}

// Convention : le script de capture lit window.rsnVue.
;(window as unknown as { rsnVue: typeof vue; r34: EtatRendu }).rsnVue = vue
;(window as unknown as { r34: EtatRendu }).r34 = etat

// Sélecteur de jeu, sous le lien vers le catalogue.
{
  const choix = el('select', { class: 'r34-jeu-choix', 'aria-label': 'Raisonnement affiché' }) as HTMLSelectElement
  for (const [cle, libelle] of Object.entries(JEUX)) choix.append(new Option(libelle, cle, false, cle === jeuChoisi))
  choix.addEventListener('change', () => {
    const url = new URL(location.href)
    if (choix.value === 'fontaine') url.searchParams.delete('jeu')
    else url.searchParams.set('jeu', choix.value)
    location.href = url.toString()
  })
  document.body.append(el('label', { class: 'r34-jeu' }, el('span', {}, 'Jeu'), choix))
}
