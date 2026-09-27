// R16 · Blueprint · sous-problèmes : le schéma technique de R14, en couleurs, avec les boîtes
// « Comment » du Blueprint d'Unreal Engine autour de chaque sous-problème.
//
// - Dérivation reprise de R14 / R1 (squelette.ts), inchangée : contexte en bornes, élagage, réduction
//   transitive, repli des sous-arguments exclusifs en « sous-systèmes » (double-clic : ouvrir).
// - Mise en page (mise-en-page.ts) : rangs logiques en colonnes (progression gauche → droite globale),
//   chaque sous-problème dans sa bande horizontale ; les boîtes ne se chevauchent jamais.
// - Rendu (rendu.ts) : feuille de plan, boîtes de sous-problèmes teintées, blocs à en-tête plein coloré
//   par famille, liaisons teintées par la famille de la source, statut toujours par le code de trait.
// - Cartouche HTML en bas à droite : réservé au cadrage, et réduit à une ligne dès qu'il recouvre un bloc.
// Jeu par défaut : fontaine de chaîne (?jeu=edp pour le jeu synthétique).

import {
  creerVueRaisonnement, el, type Disposition, type ReducteurAreteR, type ReducteurPoint, type VueRaisonnement,
} from '../../src/raisonnement'
import { jeuFontaine } from './jeu-fontaine'
import meta from './meta.json'
import { mettreEnPage, type MiseEnPage } from './mise-en-page'
import {
  cibleSous, dependantsActifs, dessinerDessous, dessinerDessus, FAMILLES, lirePaletteR16, teinteBande,
  type EtatRendu,
} from './rendu'
import { etatSquelette, NIVEAUX, niveauDeStrategie, STRATEGIE_NIVEAU, type Niveau } from './squelette'

const etat: EtatRendu = {
  page: null,
  palette: lirePaletteR16(document.documentElement),
  cibles: [],
  survol: null,
  epingles: new Set(),
  hypotheses: new Map(),
  titres: [],
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
// Par défaut la fontaine de chaîne ; ?jeu=edp pour le jeu synthétique (EDP stochastique).

const JEUX = { fontaine: 'Fontaine de chaîne', edp: 'EDP stochastique (synthétique)' } as const
type Jeu = keyof typeof JEUX
const jeuChoisi: Jeu = new URLSearchParams(location.search).get('jeu') === 'edp' ? 'edp' : 'fontaine'

// ─── Vue ─────────────────────────────────────────────────────────────────────

const D = 'Schéma R16'
const B = 'Blueprint R16'
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
    { cle: 'largeurCarte', defaut: 128, dossier: D, libelle: 'largeur bloc', min: 96, max: 240, pas: 2 },
    { cle: 'ecartColonnes', defaut: 44, dossier: D, libelle: 'écart colonnes', min: 24, max: 160, pas: 2 },
    { cle: 'ecartLignes', defaut: 18, dossier: D, libelle: 'écart lignes', min: 4, max: 80, pas: 1 },
    { cle: 'taillePolice', defaut: 12.5, dossier: D, libelle: 'taille texte', min: 9, max: 18, pas: 0.5 },
    { cle: 'maxPastilles', defaut: 5, dossier: D, libelle: 'bornes max.', min: 0, max: 12, pas: 1 },
    { cle: 'bandesChoix', defaut: 'survol', dossier: D, libelle: 'repères d’hypothèses', options: { 'au survol / épinglés': 'survol', toujours: 'toujours' } },
    { cle: 'impasses', defaut: true, dossier: D, libelle: 'alternatives rejetées' },
    { cle: 'enTetes', defaut: true, dossier: D, libelle: 'cadre et règle' },
    { cle: 'grille', defaut: true, dossier: D, libelle: 'trame' },
    { cle: 'cartouche', defaut: true, dossier: D, libelle: 'cartouche' },
    { cle: 'boites', defaut: true, dossier: B, libelle: 'boîtes des sous-problèmes' },
    { cle: 'ordreBandes', defaut: 'abandon', dossier: B, libelle: 'ordre des boîtes', options: { 'ordre du jeu': 'jeu', 'jeu, pistes abandonnées au plus court': 'abandon', 'liaisons les plus courtes': 'court' } },
    { cle: 'ecartBandes', defaut: 30, dossier: B, libelle: 'écart entre boîtes', min: 8, max: 120, pas: 2 },
    { cle: 'couleurLiaisons', defaut: 'famille', dossier: B, libelle: 'couleur des liaisons', options: { 'famille de la source': 'famille', encre: 'encre' } },
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
    const bandeau = (t: string) => f.prepend(el('div', { class: 'r16-fiche-bandeau' }, t))
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
      const bd = page.bandes[b.bande]
      if (bd) {
        const pastille = el('span', { class: 'r16-pastille' })
        pastille.style.background = teinteBande(etat.palette, bd)
        f.querySelector('.r16-fiche-bandeau')?.after(el('div', { class: 'r16-fiche-bande' }, pastille, bd.nom))
      }
    }
    return f
  },
  panneau: (p, v) => p.ajouterSection('r16', 'Schéma technique', construirePanneau(v), { position: 'lecture' }),
})

// Les pastilles et liens sémantiques par défaut sont remplacés par ceux de la vision.
vue.dessinsDessus.splice(0, 2)

// ─── Cartouche (coin bas droit, comme sur un plan) ───────────────────────────

function construireCartouche(): HTMLElement {
  const c = el('div', { class: 'r16-cartouche' })
  vue.interface.append(c)
  return c
}

/** Hauteur du cartouche déplié (px), mesurée à chaque mise à jour. */
let hauteurCartouche = 0

/**
 * Le cartouche ne recouvre jamais un bloc : le cadrage lui réserve le bas de l'écran (majMarges) et,
 * si l'on déplace la vue sous lui, il se réduit à sa ligne de titre (classe « reduit »).
 */
function majRecouvrementCartouche(): void {
  if (!cartouche || cartouche.hidden) return
  const scene = vue.sigma.getContainer().getBoundingClientRect()
  const r = cartouche.getBoundingClientRect()
  if (!r.width) return
  // Rectangle du cartouche déplié, dans le repère des cibles (conteneur sigma).
  const x0 = r.left - scene.left, x1 = r.right - scene.left
  const y1 = r.bottom - scene.top, y0 = y1 - Math.max(r.height, hauteurCartouche)
  const recouvre = etat.cibles.some((c) => c.genre !== 'masque' && c.x1 > x0 && c.x0 < x1 && c.y1 > y0 && c.y0 < y1)
  cartouche.classList.toggle('reduit', recouvre)
}

function champ(nom: string, valeur: string, classe = ''): HTMLElement {
  return el('div', { class: `r16-champ ${classe}` }, el('span', { class: 'r16-champ-nom' }, nom), el('span', { class: 'r16-champ-valeur' }, valeur))
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
  let blocs = 0, dec = 0, hyp = 0
  for (let p = 0; p < vue.nU; p++) {
    const g = page.boites[p]!.genre
    if (g === 'drapeau') hyp++
    else if (g === 'decision') dec++
    else blocs++
  }
  const rev = String.fromCharCode(65 + ((revision - 1) % 26))
  echelleAffichee = texteEchelle()
  const abandonnees = page.bandes.filter((b) => b.abandon).length
  cartouche.replaceChildren(
    el('div', { class: 'r16-cartouche-titre' },
      el('span', { class: 'r16-champ-nom' }, `SCHÉMA DE RAISONNEMENT · RÉV. ${rev}`),
      el('span', { class: 'r16-cartouche-nom' }, vue.jeu.titre)),
    el('div', { class: 'r16-cartouche-grille' },
      champ('ÉLÉMENTS', `${vue.nU} / ${s.noeudsComplet}`),
      champ('LIAISONS', `${s.aretes} / ${s.aretesComplet}`),
      champ('BLOCS', `${blocs}  D ${dec}  H ${hyp}`),
      champ('SOUS-PROBLÈMES', `${page.bandes.length - abandonnees}${abandonnees ? ` + ${abandonnees} abandonné${abandonnees > 1 ? 's' : ''}` : ''}`),
      champ('NIVEAU', niveau),
      champ('ÉCHELLE', echelleAffichee, 'r16-echelle'),
      champ('DATE', new Date().toISOString().slice(0, 10)),
      champ('SOURCE', vue.jeu.source === 'api' ? 'Atlas' : 'synthétique'),
    ),
  )
  const reduit = cartouche.classList.contains('reduit')
  cartouche.classList.remove('reduit')
  hauteurCartouche = cartouche.getBoundingClientRect().height
  cartouche.classList.toggle('reduit', reduit)
}

vue.on('image', () => {
  majRecouvrementCartouche()
  if (!cartouche || cartouche.hidden) return
  const t = texteEchelle()
  if (t === echelleAffichee) return
  echelleAffichee = t
  const v = cartouche.querySelector('.r16-echelle .r16-champ-valeur')
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
    ecartBandes: R.lire<number>('ecartBandes'),
    ordreBandes: R.lire<'jeu' | 'abandon' | 'court'>('ordreBandes'),
  })
  attribuerHypotheses(page)
  etat.page = page
  etat.survol = null
  revision++
  // Cartouche d'abord : sa hauteur entre dans les marges de cadrage.
  majCartouche()
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

/**
 * Marges de cadrage : blocs autour du point d'ancrage, boîtes (barre de titre, marges intérieures),
 * règle en haut, repères à gauche ; en bas, la hauteur du cartouche, qui ne recouvre donc rien au cadrage.
 */
function majMarges(): void {
  const W = vue.reglages.lire<number>('largeurCarte')
  const cart = cartouche && !cartouche.hidden && window.innerWidth > 900 ? hauteurCartouche + 12 : 0
  vue.margesSures = { gauche: W / 2 + 56, droite: W / 2 + 44 - 150, haut: 160, bas: 58 + cart }
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
  if (p === null) {
    // Double-clic sur la barre de titre d'une boîte : cadrer ce sous-problème.
    const t = etat.titres.find((c) => x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1)
    const bd = t ? etat.page?.bandes[t.bande] : undefined
    return bd ? vue.cadrer(bd.points) : vue.cadrerTout()
  }
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
  else if (['largeurCarte', 'ecartColonnes', 'ecartLignes', 'taillePolice', 'maxPastilles', 'ecartCouches', 'ecartBandes', 'ordreBandes'].includes(cle)) {
    cadrerApres = cle !== 'maxPastilles'
    recalculer(true)
  } else if (cle === 'cartouche') {
    majCartouche()
    majMarges()
  } else if (cle === 'boites' || cle === 'couleurLiaisons') vue.demanderRendu()
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
  etat.palette = lirePaletteR16(vue.racine)
})
etat.palette = lirePaletteR16(vue.racine)

// ─── Panneau ☰ ───────────────────────────────────────────────────────────────

function construirePanneau(v: VueRaisonnement): HTMLElement {
  corpsPanneau = el('div', { class: 'r16-panneau' })
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
  const boutons = el('div', { class: 'r16-niveaux' }, NIVEAUX.map((n) =>
    el('button', { type: 'button', class: `rsn-bouton${n.id === niveau ? ' actif' : ''}`, onclick: () => definirNiveau(n.id) }, n.nom)))
  const ligne = (k: string, val: string | number) => el('div', { class: 'r16-ligne' }, el('span', {}, k), el('span', { class: 'r16-valeur' }, String(val)))
  const hyps = [...etat.hypotheses].map(([p, ref]) => {
    const n = v.noeud(p)
    const c = el('input', { type: 'checkbox' }) as HTMLInputElement
    c.checked = etat.epingles.has(p)
    c.addEventListener('change', () => basculerEpingle(n.id, c.checked))
    return el('label', { class: 'r16-hyp' }, c,
      el('span', { class: 'r16-ref' }, ref),
      el('span', { class: 'r16-hyp-nom' }, n.nom),
      el('span', { class: 'r16-valeur' }, `→${page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0}`))
  })
  corpsPanneau.replaceChildren(
    el('div', { class: 'rsn-doux rsn-petit' }, 'Niveau de détail'),
    boutons,
    el('div', { class: 'r16-nomenclature' },
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
    el('div', { class: 'rsn-groupe-titre' }, 'Sous-problèmes (clic : cadrer)'),
    el('div', { class: 'r16-liste-sp' }, page.bandes.map((bd) => {
      const pastille = el('span', { class: 'r16-pastille' })
      pastille.style.background = teinteBande(etat.palette, bd)
      return el('button', { type: 'button', class: `r16-sp${bd.abandon ? ' abandon' : ''}`, title: bd.resume, onclick: () => v.cadrer(bd.points) },
        pastille, el('span', { class: 'r16-sp-nom' }, bd.nom), el('span', { class: 'r16-valeur' }, String(bd.points.length)))
    })),
    el('div', { class: 'rsn-groupe-titre' }, 'Hypothèses de modélisation (épingler)'),
    el('div', { class: 'r16-liste-hyp' }, hyps),
    el('div', { class: 'rsn-groupe-titre' }, 'Familles (en-têtes)'),
    el('div', { class: 'r16-familles' }, FAMILLES.map((fa, k) => {
      const pastille = el('span', { class: 'r16-pastille' })
      pastille.style.background = etat.palette.familles[k]!
      return el('div', { class: 'r16-famille' }, pastille, fa.nom)
    })),
    el('div', { class: 'rsn-groupe-titre' }, 'Légende'),
    el('div', { class: 'r16-legende' },
      el('div', {}, el('b', {}, 'Trait continu'), ' validé · ', el('b', {}, 'tireté'), ' à vérifier · ', el('b', {}, 'barré'), ' réfuté · ', el('b', {}, 'pointillé gris'), ' piste abandonnée. La couleur ne code jamais le statut.'),
      el('div', {}, el('b', {}, 'Boîte'), ' : un sous-problème (barre de titre teintée, double-clic : cadrer). Grisée et hachurée : piste abandonnée.'),
      el('div', {}, el('b', {}, 'En-tête plein'), ' : famille du nœud ; repère (B, D, H), type, validation (H, IA, IA+H). Contour épais : résultat.'),
      el('div', {}, el('b', {}, 'Liaison'), ' : teinte de la famille de sa source (réglable) ; orange : survol, sélection, aval.'),
      el('div', {}, el('b', {}, 'Jauge'), ' : confiance sur 0–1, barre = intervalle, index = estimation.'),
      el('div', {}, el('b', {}, 'Point plein'), ' : jonction (une sortie alimente plusieurs blocs).'),
      el('div', {}, el('b', {}, 'Pentagone'), ' : renvoi vers un bloc plus en amont, cité par son repère.'),
      el('div', {}, el('b', {}, 'Bornes'), ' : contexte (H hypothèse, D définition, O outil, A axiome, L littérature, + auxiliaire).'),
      el('div', {}, el('b', {}, 'Losange'), ' : décision ; ', el('b', {}, '× NC'), ' : alternative rejetée, non connectée.'),
      el('div', {}, el('b', {}, '⊢ H1'), ' : le bloc dépend de l’hypothèse H1 (survol ou épingle, en violet, teinte des hypothèses).'),
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
;(window as unknown as { rsnVue: typeof vue; r16: EtatRendu }).rsnVue = vue
;(window as unknown as { r16: EtatRendu }).r16 = etat

// Sélecteur de jeu, sous le lien vers le catalogue.
{
  const choix = el('select', { class: 'r16-jeu-choix', 'aria-label': 'Raisonnement affiché' }) as HTMLSelectElement
  for (const [cle, libelle] of Object.entries(JEUX)) choix.append(new Option(libelle, cle, false, cle === jeuChoisi))
  choix.addEventListener('change', () => {
    const url = new URL(location.href)
    if (choix.value === 'fontaine') url.searchParams.delete('jeu')
    else url.searchParams.set('jeu', choix.value)
    location.href = url.toString()
  })
  document.body.append(el('label', { class: 'r16-jeu' }, el('span', {}, 'JEU'), choix))
}
