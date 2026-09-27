// R18 · Blueprint · équations : le schéma technique de R14 en couleurs, façon Blueprint d'Unreal Engine,
// avec l'équation de chaque énoncé dans son bloc.
//
// - Formules (formules.ts) : extraites de l'énoncé par une règle générique (relation « = ≈ < → … » et
//   jetons mathématiques autour, ou annotation `$…$`), composées en typographie mathématique ; grandeur
//   physique de chaque symbole par convention de notation (T tension, v vitesse, h hauteur…).
// - Dérivation (squelette.ts) : celle de R14, repli limité à un même sous-problème.
// - Mise en page (mise-en-page.ts) : blocs à la taille de leur formule, colonnes de largeur variable,
//   boîtes de commentaire par sous-problème (imbriquées « parent.enfant »), broches colorées.
// - Rendu (rendu.ts) : en-têtes colorés par famille, liaisons colorées par grandeur transmise, statut par
//   le code de trait ; cartouche dessiné dans le coin de la feuille, sous le schéma (il ne recouvre plus rien).

import {
  creerVueRaisonnement, el, type Disposition, type ReducteurAreteR, type ReducteurPoint, type VueRaisonnement,
} from '../../src/raisonnement'
import { jeuFontaine } from './jeu-fontaine'
import meta from './meta.json'
import { mettreEnPage, type MiseEnPage } from './mise-en-page'
import { FAMILLES } from './mise-en-page'
import {
  cibleSous, couleurLiaison, dependantsActifs, dessinerDessous, dessinerDessus, feuilleDe, lirePaletteR18, type EtatRendu,
} from './rendu'
import { etatSquelette, NIVEAUX, niveauDeStrategie, STRATEGIE_NIVEAU, type Niveau } from './squelette'

const etat: EtatRendu = {
  page: null,
  palette: { encre: '#16181c', gris: '#62676f', trait: '#3a3e45', surface: '#ffffff', surface2: '#f3f4f5', accent: '#1a5fd0', sombre: false },
  cibles: [],
  survol: null,
  epingles: new Set(),
  hypotheses: new Map(),
  cartouche: null,
}

// État de la vision (déclaré avant la vue : ses rappels servent dès la construction).
let corpsPanneau: HTMLElement | null = null
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
// Fontaine de chaîne par défaut (raisonnement de physique) ; ?jeu=edp : le jeu synthétique.

const JEUX = { fontaine: 'Fontaine de chaîne', edp: 'EDP stochastique (synthétique)' } as const
type Jeu = keyof typeof JEUX
const jeuChoisi: Jeu = new URLSearchParams(location.search).get('jeu') === 'edp' ? 'edp' : 'fontaine'

// ─── Vue ─────────────────────────────────────────────────────────────────────

const D = 'Blueprint R18'
const vue = creerVueRaisonnement(document.getElementById('app')!, {
  // Réglages mémorisés par jeu : cadrage et niveau ne se mélangent pas d'un raisonnement à l'autre.
  id: `${meta.id}-${jeuChoisi}`,
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
    { cle: 'niveau', defaut: 'auxiliaires', dossier: D, libelle: 'niveau de détail', options: Object.fromEntries(NIVEAUX.map((n) => [n.nom, n.id])) },
    { cle: 'largeurCarte', defaut: 150, dossier: D, libelle: 'largeur bloc (min.)', min: 110, max: 260, pas: 2 },
    { cle: 'ecartColonnes', defaut: 64, dossier: D, libelle: 'écart colonnes', min: 36, max: 180, pas: 2 },
    { cle: 'ecartLignes', defaut: 16, dossier: D, libelle: 'écart lignes', min: 4, max: 80, pas: 1 },
    { cle: 'taillePolice', defaut: 12, dossier: D, libelle: 'taille texte', min: 9, max: 18, pas: 0.5 },
    { cle: 'maxFormules', defaut: 2, dossier: D, libelle: 'formules par bloc', min: 1, max: 4, pas: 1 },
    { cle: 'boites', defaut: true, dossier: D, libelle: 'boîtes de sous-problèmes' },
    { cle: 'maxPastilles', defaut: 5, dossier: D, libelle: 'bornes max.', min: 0, max: 12, pas: 1 },
    { cle: 'bandesChoix', defaut: 'survol', dossier: D, libelle: 'repères d’hypothèses', options: { 'au survol / épinglés': 'survol', toujours: 'toujours' } },
    { cle: 'impasses', defaut: true, dossier: D, libelle: 'alternatives rejetées' },
    { cle: 'enTetes', defaut: true, dossier: D, libelle: 'cadre et règle' },
    { cle: 'grille', defaut: true, dossier: D, libelle: 'trame' },
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
    if (n.type === 'choix_modelisation') texte = 'Survol : repères sur les blocs dépendants · clic : épingler'
    else if (u && u.membres.length > 1) texte = `Double-clic : ouvrir le sous-système (${u.membres.length} énoncés) · clic : lignée`
    else if (u && dansDeplie(v, p)) texte = 'Double-clic : refermer le sous-système · clic : lignée'
    else if (!u) texte = 'Contexte : clic pour voir les blocs qui l’utilisent'
    if (aide) aide.textContent = texte
    const sv = etat.survol
    const bandeau = (t: string) => f.prepend(el('div', { class: 'r18-fiche-bandeau' }, t))
    if (page && sv?.genre === 'pastille') {
      const k = page.usagesPastille.get(sv.noeud)?.length ?? 0
      bandeau(`BORNE DE CONTEXTE · ${k} bloc${k > 1 ? 's' : ''} raccordé${k > 1 ? 's' : ''}`)
    } else if (page && sv?.genre === 'renvoi') {
      const k = page.usagesRenvoi.get(sv.point)?.length ?? 0
      bandeau(`RENVOI → ${page.boites[sv.point]?.ref} · cité par ${k} bloc${k > 1 ? 's' : ''} en aval`)
    } else if (page && p < v.nU && page.boites[p]) {
      const b = page.boites[p]!
      const statut = n.statut === 'valide' ? 'trait continu : validé' : n.statut === 'incertain' ? 'trait tireté : à vérifier' : 'bloc barré : réfuté'
      if (b.genre === 'drapeau') {
        const k = page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0
        bandeau(`${b.ref} · HYPOTHÈSE DE MODÉLISATION · ${k} bloc${k > 1 ? 's' : ''} en dépendent`)
      } else bandeau(`${b.ref} · rang R${Math.max(0, b.rang)} · ${statut}`)
      // Formules extraites et broches : ce que le bloc affiche, et d'où vient chaque entrée.
      const details = el('div', { class: 'r18-fiche-details' })
      if (b.formulesTexte.length) details.append(el('div', {}, el('span', { class: 'r18-fiche-cle' }, 'FORMULE'), el('span', { class: 'r18-fiche-formule' }, b.formulesTexte.join('   ;   '))))
      for (const br of b.broches) {
        const src = page.boites[br.source]?.ref ?? '?'
        const quoi = br.grandeur ? `${br.symbole ? br.symbole + ' · ' : ''}${br.grandeur.nom.toLowerCase()}` : `prémisse ${br.role}`
        details.append(el('div', {},
          el('span', { class: 'r18-fiche-cle' }, 'ENTRÉE'),
          el('span', { class: 'r18-carre', style: `background:${couleurLiaison(br.grandeur, br.role, etat.palette)}` }),
          `${quoi} ← ${src}`))
      }
      const bx = page.commentaires.filter((c) => c.membres.includes(p)).map((c) => c.nom)
      if (bx.length) details.append(el('div', {}, el('span', { class: 'r18-fiche-cle' }, 'BOÎTE'), bx.reverse().join(' › ')))
      if (details.childElementCount) f.querySelector('.r18-fiche-bandeau')?.after(details)
    }
    return f
  },
  panneau: (p, v) => p.ajouterSection('r18', 'Blueprint · équations', construirePanneau(v), { position: 'lecture' }),
})

// Les pastilles et liens sémantiques par défaut sont remplacés par ceux de la vision.
vue.dessinsDessus.splice(0, 2)

// ─── Cartouche (dessiné sur la feuille, coin bas droit, sous le schéma) ───────

function majCartouche(): void {
  const page = etat.page
  if (!page || !vue.reglages.lire<boolean>('cartouche')) {
    etat.cartouche = null
    vue.demanderRendu()
    return
  }
  const s = vue.lecture.stats
  const niveau = NIVEAUX.find((n) => n.id === niveauDeStrategie(vue.strategie.id))?.nom ?? vue.strategie.nom
  let blocs = 0, dec = 0, hyp = 0
  for (let p = 0; p < vue.nU; p++) {
    const g = page.boites[p]!.genre
    if (g === 'drapeau') hyp++
    else if (g === 'decision') dec++
    else blocs++
  }
  const avecFormule = page.boites.slice(0, vue.nU).filter((b) => b.formulesTexte.length).length
  const rev = String.fromCharCode(65 + ((revision - 1) % 26))
  etat.cartouche = {
    titre: vue.jeu.titre,
    champs: [
      ['ÉLÉMENTS / NŒUDS', `${vue.nU} / ${s.noeudsComplet}`],
      ['LIAISONS / ARÊTES', `${s.aretes} / ${s.aretesComplet}`],
      ['BLOCS · D · H', `${blocs} · ${dec} · ${hyp}`],
      ['AVEC FORMULE', `${avecFormule} / ${vue.nU}`],
      ['NIVEAU', niveau],
      ['RÉV.', rev],
      ['ÉCHELLE', ''],
      ['DATE · SOURCE', `${new Date().toISOString().slice(0, 10)} · ${vue.jeu.source === 'api' ? 'Atlas' : 'synthétique'}`],
    ],
  }
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
  const { disposition, page } = mettreEnPage(vue.lecture, {
    sousProblemes: vue.jeu.sousProblemes,
    maxFormules: R.lire<number>('maxFormules'),
    commentaires: R.lire<boolean>('boites'),
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
  etat.page = page
  etat.survol = null
  revision++
  majMarges()
  majCartouche()
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

/** Marges de cadrage d'une sélection (ancres) : blocs autour du point d'ancrage, règle en haut. */
function majMarges(): void {
  const W = vue.reglages.lire<number>('largeurCarte')
  vue.margesSures = { gauche: W / 2 + 40, droite: W / 2 + 30 - 150, haut: 122, bas: 60 }
}

// Cadrer tout (2D) : la feuille entière, cartouche compris, d'après ses bornes exactes.
const cadrerDefaut = vue.cadrer.bind(vue)
vue.cadrer = (points: Iterable<number> | null = null, duree = vue.reglages.valeurs.dureeTransition, extrusion = vue.extrusion) => {
  const page = etat.page
  if (points !== null || !page || extrusion > 0.5 || vue.reglages.lire<boolean>('liensComplets')) return cadrerDefaut(points, duree, extrusion)
  const f = feuilleDe(page, !!etat.cartouche)
  const E = page.echelle
  const pos = new Float32Array([(f.x0 - page.cx) * E, 0, -(f.y0 - page.cy) * E, (f.x1 - page.cx) * E, 0, -(f.y1 - page.cy) * E])
  const z = vue.zoneSure()
  for (const k of ['haut', 'bas', 'gauche', 'droite'] as const) z[k] = Math.max(8, z[k] - (vue.margesSures[k] ?? 0))
  z.droite = Math.max(8, z.droite - 150)
  vue.camera.cadrer(pos, null, duree, 1.02, z)
  vue.demanderRendu()
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
  else if (['largeurCarte', 'ecartColonnes', 'ecartLignes', 'taillePolice', 'maxPastilles', 'ecartCouches', 'maxFormules', 'boites'].includes(cle)) {
    cadrerApres = cle !== 'maxPastilles'
    recalculer(true)
  } else if (cle === 'cartouche') {
    majCartouche()
    vue.cadrerTout()
  }
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
  etat.palette = lirePaletteR18(vue.racine)
  majPanneau()
})
etat.palette = lirePaletteR18(vue.racine)

// ─── Panneau ☰ ───────────────────────────────────────────────────────────────

function construirePanneau(v: VueRaisonnement): HTMLElement {
  corpsPanneau = el('div', { class: 'r18-panneau' })
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
  const boutons = el('div', { class: 'r18-niveaux' }, NIVEAUX.map((n) =>
    el('button', { type: 'button', class: `rsn-bouton${n.id === niveau ? ' actif' : ''}`, onclick: () => definirNiveau(n.id) }, n.nom)))
  const ligne = (k: string, val: string | number) => el('div', { class: 'r18-ligne' }, el('span', {}, k), el('span', { class: 'r18-valeur' }, String(val)))
  const hyps = [...etat.hypotheses].map(([p, ref]) => {
    const n = v.noeud(p)
    const c = el('input', { type: 'checkbox' }) as HTMLInputElement
    c.checked = etat.epingles.has(p)
    c.addEventListener('change', () => basculerEpingle(n.id, c.checked))
    return el('label', { class: 'r18-hyp' }, c,
      el('span', { class: 'r18-ref' }, ref),
      el('span', { class: 'r18-hyp-nom' }, n.nom),
      el('span', { class: 'r18-valeur' }, `→${page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0}`))
  })
  corpsPanneau.replaceChildren(
    el('div', { class: 'rsn-doux rsn-petit' }, 'Niveau de détail'),
    boutons,
    el('div', { class: 'r18-nomenclature' },
      ligne('Éléments visibles / nœuds', `${v.nU} / ${s.noeudsComplet}`),
      ligne('Liaisons / arêtes', `${s.aretes} / ${s.aretesComplet}`),
      ligne('Blocs (B) · dont sous-systèmes', `${compte.blocs} · ${compte.sousSystemes}`),
      ligne('Décisions (D) · alternatives NC', `${compte.decisions} · ${compte.rejetees}`),
      ligne('Hypothèses (H)', compte.hypotheses),
      ligne('Bornes · renvois', `${compte.bornes} · ${compte.renvois}`),
      ligne('Jonctions', page.jonctions.length),
      ligne('Blocs avec formule', `${page.boites.slice(0, v.nU).filter((b) => b.formulesTexte.length).length} / ${v.nU}`),
      ligne('Boîtes · imbriquées', `${page.commentaires.filter((c) => c.niveau === 0).length} · ${page.commentaires.filter((c) => c.niveau === 1).length}`),
    ),
    etatSquelette.deplies.size
      ? el('button', { type: 'button', class: 'rsn-bouton', onclick: () => {
          etatSquelette.ouvertes.clear()
          etatSquelette.deplies.clear()
          v.definirStrategie(v.strategie)
        } }, `Refermer les sous-systèmes (${etatSquelette.deplies.size})`)
      : el('div', { class: 'rsn-doux rsn-petit' }, 'Double-clic sur un sous-système (contour doublé) pour l’ouvrir sur place.'),
    el('div', { class: 'rsn-groupe-titre' }, 'Hypothèses de modélisation (épingler)'),
    el('div', { class: 'r18-liste-hyp' }, hyps),
    el('div', { class: 'rsn-groupe-titre' }, 'Boîtes (sous-problèmes)'),
    el('div', { class: 'r18-liste-couleurs' }, page.commentaires.map((c) =>
      el('div', { class: `r18-couleur${c.niveau ? ' r18-imbrique' : ''}` },
        el('span', { class: 'r18-carre r18-carre-boite', style: `border-color:${c.couleur};background:${c.couleur}22` }),
        el('span', { class: 'r18-hyp-nom' }, c.nom),
        el('span', { class: 'r18-valeur' }, String(c.membres.length))))),
    el('div', { class: 'rsn-groupe-titre' }, 'En-têtes (famille)'),
    el('div', { class: 'r18-liste-couleurs' }, Object.values(FAMILLES).map((f) =>
      el('div', { class: 'r18-couleur' },
        el('span', { class: 'r18-carre', style: `background:${etat.palette.sombre ? f.couleurSombre : f.couleur}` }),
        el('span', {}, f.nom)))),
    el('div', { class: 'rsn-groupe-titre' }, 'Broches et liaisons (grandeur transmise)'),
    el('div', { class: 'r18-liste-couleurs' },
      page.grandeurs.map((g) => el('div', { class: 'r18-couleur' }, el('span', { class: 'r18-rond', style: `background:${g.couleur}` }), el('span', {}, g.nom))),
      el('div', { class: 'r18-couleur' }, el('span', { class: 'r18-rond', style: `background:${couleurLiaison(null, 'principale', etat.palette)}` }), el('span', {}, 'Sans grandeur : prémisse principale')),
      el('div', { class: 'r18-couleur' }, el('span', { class: 'r18-rond', style: `background:${couleurLiaison(null, 'auxiliaire', etat.palette)}` }), el('span', {}, 'Sans grandeur : prémisse auxiliaire'))),
    el('div', { class: 'rsn-doux rsn-petit' },
      'Grandeur : symbole commun aux formules de la source et de la cible (hors constantes g, λ), le plus significatif ; à défaut, membre de gauche de la source ; à défaut, rôle de la prémisse.'),
    el('div', { class: 'rsn-groupe-titre' }, 'Légende'),
    el('div', { class: 'r18-legende' },
      el('div', {}, el('b', {}, 'Trait continu'), ' validé · ', el('b', {}, 'tireté'), ' à vérifier · ', el('b', {}, 'barré'), ' réfuté · ', el('b', {}, 'pointillé gris'), ' piste abandonnée.'),
      el('div', {}, el('b', {}, 'En-tête'), ' : repère (B, D, H), type, validation (H, IA, IA+H), titre. ', el('b', {}, 'Corps'), ' : formule extraite de l’énoncé (sinon énoncé court, en italique).'),
      el('div', {}, el('b', {}, 'Formules'), ' : relation (= ≈ < → …) et termes mathématiques qui l’entourent dans l’énoncé, ou segment ', el('code', {}, '$…$'), '. Le texte exact est dans la fiche.'),
      el('div', {}, el('b', {}, 'Jauge'), ' : confiance sur 0–1, barre = intervalle, index = estimation.'),
      el('div', {}, el('b', {}, 'Point plein'), ' : jonction (une sortie alimente plusieurs blocs).'),
      el('div', {}, el('b', {}, 'Pentagone'), ' : renvoi vers un bloc plus en amont, cité par son repère.'),
      el('div', {}, el('b', {}, 'Bornes'), ' : contexte (H hypothèse, D définition, O outil, A axiome, L littérature, + auxiliaire).'),
      el('div', {}, el('b', {}, 'Losange'), ' : décision ; ', el('b', {}, '× NC'), ' : alternative rejetée, non connectée.'),
      el('div', {}, el('b', {}, '⊢ H1'), ' : le bloc dépend de l’hypothèse H1 (survol ou épingle, en bleu).'),
    ),
  )
}

// ─── Démarrage ───────────────────────────────────────────────────────────────

{
  const n = vue.reglages.lire<string>('niveau') as Niveau
  if (STRATEGIE_NIVEAU[n] && vue.strategie.id !== STRATEGIE_NIVEAU[n]) vue.definirStrategie(STRATEGIE_NIVEAU[n])
  else recalculer(false)
}

// Convention : le script de capture lit window.rsnVue.
;(window as unknown as { rsnVue: typeof vue; r18: EtatRendu }).rsnVue = vue
;(window as unknown as { r18: EtatRendu }).r18 = etat

// Sélecteur de jeu, sous le lien vers le catalogue.
{
  const choix = el('select', { class: 'r18-jeu-choix', 'aria-label': 'Raisonnement affiché' }) as HTMLSelectElement
  for (const [cle, libelle] of Object.entries(JEUX)) choix.append(new Option(libelle, cle, false, cle === jeuChoisi))
  choix.addEventListener('change', () => {
    const url = new URL(location.href)
    if (choix.value === 'fontaine') url.searchParams.delete('jeu')
    else url.searchParams.set('jeu', choix.value)
    location.href = url.toString()
  })
  document.body.append(el('label', { class: 'r18-jeu' }, el('span', {}, 'JEU'), choix))
}
