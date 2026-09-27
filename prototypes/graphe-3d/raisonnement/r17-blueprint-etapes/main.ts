// R17 · Blueprint · blocs de raisonnement : le schéma technique de R14 en couleurs, façon Blueprint d'Unreal.
//
// - Dérivation reprise de R14 (squelette.ts), corrigée : un choix de modélisation issu d'une décision reste
//   dans le flux, relié à la décision et à ce qui en dépend.
// - Blocs de raisonnement (etapes.ts) : boîtes « Comment » calculées depuis le graphe (phase du nœud, rang
//   logique, voisinage), pas depuis les sous-problèmes déclarés.
// - Mise en page (mise-en-page.ts) : rangs équilibrés, blocs contigus, cadres sans chevauchement.
// - Rendu (rendu.ts) : fils colorés par rôle de prémisse, broches colorées par famille de la source,
//   en-têtes colorés par famille, décisions en cartes à alternatives ; feuille, règle et cartouche de R14.

import {
  creerVueRaisonnement, el, LIBELLES_ROLE, type Disposition, type ReducteurAreteR, type ReducteurPoint, type VueRaisonnement,
} from '../../src/raisonnement'
import { LIBELLES_FAMILLE, type Famille } from './etapes'
import { jeuFontaine } from './jeu-fontaine'
import meta from './meta.json'
import { mettreEnPage, type MiseEnPage } from './mise-en-page'
import {
  cibleSous, dependantsActifs, dessinerDessous, dessinerDessus, etapeMiseEnAvant, lirePaletteR17, type EtatRendu,
} from './rendu'
import { etatSquelette, NIVEAUX, niveauDeStrategie, STRATEGIE_NIVEAU, type Niveau } from './squelette'

const etat: EtatRendu = {
  page: null,
  palette: lirePaletteR17(document.documentElement),
  cibles: [],
  survol: null,
  etapeActive: null,
  epingles: new Set(),
  hypotheses: new Map(),
  titresEcran: [],
}

// État de la vision (déclaré avant la vue : ses rappels servent dès la construction).
let corpsPanneau: HTMLElement | null = null
let cartouche: HTMLElement | null = null
let cadrerApres = true
let epinglesIds = new Set<string>()
let revision = 0

// ─── Réducteurs : points sigma invisibles, opacité pilotée par la vision ───────

const reducteurPoint: ReducteurPoint = (info, a, vue) => {
  // Sigma ne dessine plus les nœuds : cartes et spécifications sont sur le calque « dessus ».
  a.taille = 0.01
  a.libelle = null
  a.forceLibelle = false
  a.surligne = false
  // Piste abandonnée : grisée par la carte elle-même, pas par l'opacité (qui la rendrait illisible).
  if (info.noeud.piste === 'abandonnee') a.opacite = Math.min(info.presence, a.opacite / 0.55)
  const sv = etat.survol
  const actifs = dependantsActifs(vue, etat)
  const avant = etapeMiseEnAvant(etat)
  if (sv?.genre === 'pastille') {
    const us = etat.page?.usagesPastille.get(sv.noeud)
    a.opacite = info.presence * (us?.includes(info.point) ? 1 : 0.2)
  } else if (sv?.genre === 'renvoi') {
    const us = etat.page?.usagesRenvoi.get(sv.point)
    a.opacite = info.presence * (info.point === sv.point || us?.includes(info.point) ? 1 : 0.2)
  } else if (avant !== null && vue.survol === null && !vue.ligneeActive) {
    // Bloc mis en avant (survol de sa barre de titre ou du panneau) : ses cartes restent nettes.
    a.opacite = info.presence * (etat.page?.boites[info.point]?.etape === avant ? 1 : 0.3)
  } else if (actifs && vue.survol !== null && sv?.genre === 'drapeau') {
    a.opacite = info.presence * (actifs.has(info.point) ? 1 : 0.22)
  } else if (actifs && !vue.ligneeActive && vue.survol === null) {
    a.opacite = info.presence * (actifs.has(info.point) ? 1 : 0.32)
  } else if (info.survol === 'autre') {
    a.opacite = Math.max(a.opacite, info.presence * 0.5)
  }
}

const reducteurArete: ReducteurAreteR = (info, a) => {
  // Les liaisons de lecture sont tracées (fils orthogonaux) sur le calque « dessous ».
  if (info.genre === 'lecture') a.cache = true
}

// ─── Jeu de données ──────────────────────────────────────────────────────────
// La fontaine de chaîne par défaut ; ?jeu=edp pour le jeu synthétique.

const JEUX = { fontaine: 'Fontaine de chaîne', edp: 'EDP stochastique (synthétique)' } as const
type Jeu = keyof typeof JEUX
const jeuChoisi: Jeu = new URLSearchParams(location.search).get('jeu') === 'edp' ? 'edp' : 'fontaine'
// Les blocs se lisent mieux avec chaque énoncé visible : niveau « Tout » sur la fontaine (28 cartes).
const niveauDefaut: Niveau = jeuChoisi === 'fontaine' ? 'tout' : 'squelette'

// ─── Vue ─────────────────────────────────────────────────────────────────────

const D = 'Blueprint R17'
const vue = creerVueRaisonnement(document.getElementById('app')!, {
  // Réglages mémorisés par jeu : cadrage et niveau ne se mélangent pas d'un raisonnement à l'autre.
  id: jeuChoisi === 'fontaine' ? meta.id : `${meta.id}-${jeuChoisi}`,
  jeu: jeuChoisi === 'fontaine' ? jeuFontaine() : undefined,
  mode: '2d',
  strategie: STRATEGIE_NIVEAU[niveauDefaut],
  reglages: {
    ajusterAspect: false,
    pastillesContexte: true,
    liensSemantiques: true,
    opaciteContexte: 0.22,
    opaciteLiensComplets: 0.22,
  },
  reglagesSupplementaires: [
    { cle: 'niveau', defaut: niveauDefaut, dossier: D, libelle: 'niveau de détail', options: Object.fromEntries(NIVEAUX.map((n) => [n.nom, n.id])) },
    { cle: 'blocs', defaut: true, dossier: D, libelle: 'blocs de raisonnement' },
    { cle: 'largeurCarte', defaut: 150, dossier: D, libelle: 'largeur carte', min: 110, max: 260, pas: 2 },
    { cle: 'ecartColonnes', defaut: 56, dossier: D, libelle: 'écart colonnes', min: 30, max: 160, pas: 2 },
    { cle: 'ecartLignes', defaut: 16, dossier: D, libelle: 'écart lignes', min: 4, max: 80, pas: 1 },
    { cle: 'taillePolice', defaut: 12.5, dossier: D, libelle: 'taille texte', min: 9, max: 18, pas: 0.5 },
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
    if (n.type === 'choix_modelisation') texte = 'Survol : repères sur les cartes dépendantes · clic : épingler'
    else if (u && u.membres.length > 1) texte = `Double-clic : ouvrir le sous-système (${u.membres.length} énoncés) · clic : lignée`
    else if (u && dansDeplie(v, p)) texte = 'Double-clic : refermer le sous-système · clic : lignée'
    else if (!u) texte = 'Contexte : clic pour voir les cartes qui l’utilisent'
    if (aide) aide.textContent = texte
    const sv = etat.survol
    const bandeau = (t: string, couleur?: string) => {
      const b = el('div', { class: 'r17-fiche-bandeau' }, t)
      if (couleur) b.style.setProperty('--c', couleur)
      f.prepend(b)
    }
    if (page && sv?.genre === 'pastille') {
      const k = page.usagesPastille.get(sv.noeud)?.length ?? 0
      bandeau(`BORNE DE CONTEXTE · ${k} carte${k > 1 ? 's' : ''} raccordée${k > 1 ? 's' : ''}`)
    } else if (page && sv?.genre === 'renvoi') {
      const k = page.usagesRenvoi.get(sv.point)?.length ?? 0
      bandeau(`RENVOI → ${page.boites[sv.point]?.ref} · cité par ${k} carte${k > 1 ? 's' : ''} en aval`)
    } else if (page && p < v.nU && page.boites[p]) {
      const b = page.boites[p]!
      const et = page.etapes[b.etape]
      const bloc = et?.encadre ? ` · ${et.ref} ${et.titre.toUpperCase()}` : ''
      const statut = n.statut === 'valide' ? 'trait continu : validé' : n.statut === 'incertain' ? 'trait tireté : à vérifier' : 'carte barrée : réfutée'
      const couleur = et?.encadre ? etat.palette.etapes[et.genre] : undefined
      if (b.genre === 'drapeau') {
        const k = page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0
        bandeau(`${b.ref} · HYPOTHÈSE DE MODÉLISATION${bloc} · ${k} carte${k > 1 ? 's' : ''} en dépendent`, couleur)
      } else bandeau(`${b.ref}${bloc} · rang R${Math.max(0, b.rang)} · ${statut}`, couleur)
    }
    return f
  },
  panneau: (p, v) => p.ajouterSection('r17', 'Blueprint · blocs de raisonnement', construirePanneau(v), { position: 'lecture' }),
})

// Les pastilles et liens sémantiques par défaut sont remplacés par ceux de la vision.
vue.dessinsDessus.splice(0, 2)

// ─── Cartouche (coin bas droit, comme sur un plan) ───────────────────────────

function construireCartouche(): HTMLElement {
  const c = el('div', { class: 'r17-cartouche' })
  vue.interface.append(c)
  return c
}

function champ(nom: string, valeur: string, classe = ''): HTMLElement {
  return el('div', { class: `r17-champ ${classe}` }, el('span', { class: 'r17-champ-nom' }, nom), el('span', { class: 'r17-champ-valeur' }, valeur))
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
  let cartes = 0, dec = 0, hyp = 0
  for (let p = 0; p < vue.nU; p++) {
    const g = page.boites[p]!.genre
    if (g === 'drapeau') hyp++
    else if (g === 'decision') dec++
    else cartes++
  }
  const blocs = page.etapes.filter((e) => e.encadre).length
  const rev = String.fromCharCode(65 + ((revision - 1) % 26))
  echelleAffichee = texteEchelle()
  cartouche.replaceChildren(
    el('div', { class: 'r17-cartouche-titre' },
      el('span', { class: 'r17-champ-nom' }, 'BLUEPRINT DE RAISONNEMENT'),
      el('span', { class: 'r17-cartouche-nom' }, vue.jeu.titre)),
    el('div', { class: 'r17-cartouche-grille' },
      champ('ÉLÉMENTS', `${vue.nU} / ${s.noeudsComplet}`),
      champ('LIAISONS', `${s.aretes} / ${s.aretesComplet}`),
      champ('CARTES', `B ${cartes}  D ${dec}  H ${hyp}`),
      champ('BLOCS', `É ${blocs}`),
      champ('NIVEAU', niveau),
      champ('RÉV.', rev),
      champ('ÉCHELLE', echelleAffichee, 'r17-echelle'),
      champ('DATE', new Date().toISOString().slice(0, 10)),
    ),
  )
}

vue.on('image', () => {
  if (!cartouche || cartouche.hidden) return
  const t = texteEchelle()
  if (t === echelleAffichee) return
  echelleAffichee = t
  const v = cartouche.querySelector('.r17-echelle .r17-champ-valeur')
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
    alternativesRejetees: R.lire<boolean>('impasses'),
    precedent: anime ? positionsPrecedentes() : undefined,
  })
  attribuerHypotheses(page)
  etat.page = page
  etat.survol = null
  etat.etapeActive = null
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

/** Marges de cadrage : cartes autour du point d'ancrage, règle et titres de blocs en haut. */
function majMarges(): void {
  const W = vue.reglages.lire<number>('largeurCarte')
  vue.margesSures = { gauche: W / 2 + 40, droite: W / 2 + 30 - 150, haut: 150, bas: 44 }
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

// ─── Survol : cibles dessinées (cartes, bornes, spécifications, barres de titre) ──

vue.pointSous = (x: number, y: number) => {
  const c = cibleSous(etat, x, y)
  const avant = etat.survol
  etat.survol = c
  const change = avant?.genre !== c?.genre || avant?.noeud !== c?.noeud || avant?.point !== c?.point
  if (change && ['pastille', 'renvoi', 'etape'].some((g) => avant?.genre === g || c?.genre === g)) vue.demanderRendu()
  if (!c || c.genre === 'etape') return null
  if (c.genre === 'pastille') return vue.pointDeNoeud(c.noeud)
  return c.point
}

// Clic sur une spécification : épingler ; clic sur la barre de titre d'un bloc : le cadrer.
const selectionnerDefaut = vue.selectionner.bind(vue)
vue.selectionner = (p: number | null) => {
  if (p !== null && p < vue.nU && etat.page?.boites[p]?.genre === 'drapeau' && etat.survol?.genre === 'drapeau') {
    basculerEpingle(vue.noeud(p).id)
    return
  }
  if (p === null && etat.survol?.genre === 'etape') {
    cadrerEtape(etat.survol.point)
    return
  }
  selectionnerDefaut(p)
}

function cadrerEtape(k: number): void {
  const et = etat.page?.etapes[k]
  if (et) vue.cadrer(et.membres)
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
    if (etat.survol?.genre === 'etape') return cadrerEtape(etat.survol.point)
    return vue.cadrerTout()
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
  else if (['largeurCarte', 'ecartColonnes', 'ecartLignes', 'taillePolice', 'maxPastilles', 'ecartCouches', 'impasses'].includes(cle)) {
    cadrerApres = cle !== 'maxPastilles' && cle !== 'impasses'
    recalculer(true)
  } else if (cle === 'cartouche') majCartouche()
  else if (cle === 'blocs') {
    majPanneau()
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
  etat.palette = lirePaletteR17(vue.racine)
  majPanneau()
})
etat.palette = lirePaletteR17(vue.racine)

// ─── Panneau ☰ ───────────────────────────────────────────────────────────────

function construirePanneau(v: VueRaisonnement): HTMLElement {
  corpsPanneau = el('div', { class: 'r17-panneau' })
  void v
  return corpsPanneau
}

function pastille(couleur: string, classe = 'r17-pastille'): HTMLElement {
  const s = el('span', { class: classe })
  s.style.setProperty('--c', couleur)
  return s
}

function majPanneau(): void {
  if (!corpsPanneau || !etat.page) return
  const v = vue
  const page = etat.page
  const P = etat.palette
  const niveau = niveauDeStrategie(v.strategie.id)
  const s = v.lecture.stats
  const boutons = el('div', { class: 'r17-niveaux' }, NIVEAUX.map((n) =>
    el('button', { type: 'button', class: `rsn-bouton${n.id === niveau ? ' actif' : ''}`, onclick: () => definirNiveau(n.id) }, n.nom)))
  const ligne = (k: string, val: string | number) => el('div', { class: 'r17-ligne' }, el('span', {}, k), el('span', { class: 'r17-valeur' }, String(val)))
  // Blocs de raisonnement : survol → mise en avant, clic → cadrer.
  const etapes = page.etapes.filter((e) => e.encadre).sort((a, b) => a.ref.localeCompare(b.ref, 'fr', { numeric: true }))
  const isoles = page.etapes.filter((e) => !e.encadre).length
  const listeBlocs = el('div', { class: 'r17-blocs' }, etapes.map((et) => {
    const item = el('button', { type: 'button', class: 'r17-bloc', title: 'Clic : cadrer le bloc', onclick: () => cadrerEtape(et.index) },
      pastille(P.etapes[et.genre]),
      el('span', { class: 'r17-bloc-ref' }, et.ref),
      el('span', { class: 'r17-bloc-texte' },
        el('span', { class: 'r17-bloc-genre' }, et.titre),
        el('span', { class: 'r17-bloc-tete' }, et.sousTitre)),
      el('span', { class: 'r17-valeur' }, String(et.membres.length)))
    item.style.setProperty('--c', P.etapes[et.genre])
    item.addEventListener('mouseenter', () => {
      etat.etapeActive = et.index
      vue.demanderRendu()
    })
    item.addEventListener('mouseleave', () => {
      if (etat.etapeActive === et.index) etat.etapeActive = null
      vue.demanderRendu()
    })
    return item
  }))
  const hyps = [...etat.hypotheses].map(([p, ref]) => {
    const n = v.noeud(p)
    const c = el('input', { type: 'checkbox' }) as HTMLInputElement
    c.checked = etat.epingles.has(p)
    c.addEventListener('change', () => basculerEpingle(n.id, c.checked))
    return el('label', { class: 'r17-hyp' }, c,
      el('span', { class: 'r17-ref' }, ref),
      el('span', { class: 'r17-hyp-nom' }, n.nom),
      el('span', { class: 'r17-valeur' }, `→${page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0}`))
  })
  const familles: Famille[] = ['modele', 'decision', 'deduction', 'enonce', 'empirique', 'calcul', 'resultat']
  corpsPanneau.replaceChildren(
    el('div', { class: 'rsn-doux rsn-petit' }, 'Niveau de détail'),
    boutons,
    el('div', { class: 'rsn-groupe-titre' }, 'Blocs de raisonnement'),
    v.reglages.lire<boolean>('blocs')
      ? listeBlocs
      : el('div', { class: 'rsn-doux rsn-petit' }, 'Blocs masqués (réglage « blocs de raisonnement »).'),
    el('div', { class: 'rsn-doux rsn-petit' },
      `Calculés depuis le graphe (phase du nœud, rang logique, voisinage), pas depuis les sous-problèmes déclarés. ${isoles} carte${isoles > 1 ? 's' : ''} hors bloc. Survol : mise en avant · clic : cadrer.`),
    el('div', { class: 'r17-nomenclature' },
      ligne('Éléments visibles / nœuds', `${v.nU} / ${s.noeudsComplet}`),
      ligne('Liaisons / arêtes', `${s.aretes} / ${s.aretesComplet}`),
      ligne('Jonctions', page.jonctions.length),
    ),
    etatSquelette.deplies.size
      ? el('button', { type: 'button', class: 'rsn-bouton', onclick: () => {
          etatSquelette.ouvertes.clear()
          etatSquelette.deplies.clear()
          v.definirStrategie(v.strategie)
        } }, `Refermer les sous-systèmes (${etatSquelette.deplies.size})`)
      : el('div', { class: 'rsn-doux rsn-petit' }, 'Double-clic sur un sous-système (carte doublée) pour l’ouvrir sur place.'),
    el('div', { class: 'rsn-groupe-titre' }, 'Hypothèses de modélisation (épingler)'),
    el('div', { class: 'r17-liste-hyp' }, hyps),
    el('div', { class: 'rsn-groupe-titre' }, 'Légende'),
    el('div', { class: 'r17-legende' },
      el('div', { class: 'r17-legende-titre' }, 'En-têtes et broches : famille (type de donnée)'),
      el('div', { class: 'r17-legende-grille' }, familles.map((f) => el('span', { class: 'r17-legende-item' }, pastille(P.familles[f], 'r17-broche'), LIBELLES_FAMILLE[f]))),
      el('div', { class: 'r17-legende-titre' }, 'Fils : rôle de la prémisse'),
      el('div', { class: 'r17-legende-grille' }, (['principale', 'auxiliaire', 'technique', 'contexte'] as const).map((r) =>
        el('span', { class: 'r17-legende-item' }, pastille(P.roles[r], `r17-fil${r === 'contexte' ? ' tirete' : ''}`), LIBELLES_ROLE[r]))),
      el('div', {}, el('b', {}, 'Trait continu'), ' validé · ', el('b', {}, 'tireté'), ' à vérifier · ', el('b', {}, 'barré'), ' réfuté · ', el('b', {}, 'pointillé gris'), ' piste abandonnée.'),
      el('div', {}, el('b', {}, 'Broche pleine'), ' : connectée ; ', el('b', {}, 'creuse'), ' : sortie non utilisée ou alternative rejetée (décision).'),
      el('div', {}, el('b', {}, 'Jauge'), ' : confiance sur 0–1, barre = intervalle, index = estimation.'),
      el('div', {}, el('b', {}, 'Point plein'), ' : jonction · ', el('b', {}, 'pentagone'), ' : renvoi vers une carte très citée.'),
      el('div', {}, el('b', {}, 'Bornes'), ' : contexte (H hypothèse, D définition, O outil, A axiome, L littérature, + auxiliaire).'),
      el('div', {}, el('b', {}, '⊢ H1'), ' : la carte dépend de l’hypothèse H1 (survol ou épingle).'),
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
;(window as unknown as { rsnVue: typeof vue; r17: EtatRendu }).rsnVue = vue
;(window as unknown as { r17: EtatRendu }).r17 = etat

// Sélecteur de jeu, sous le lien vers le catalogue.
{
  const choix = el('select', { class: 'r17-jeu-choix', 'aria-label': 'Raisonnement affiché' }) as HTMLSelectElement
  for (const [cle, libelle] of Object.entries(JEUX)) choix.append(new Option(libelle, cle, false, cle === jeuChoisi))
  choix.addEventListener('change', () => {
    const url = new URL(location.href)
    if (choix.value === 'fontaine') url.searchParams.delete('jeu')
    else url.searchParams.set('jeu', choix.value)
    location.href = url.toString()
  })
  document.body.append(el('label', { class: 'r17-jeu' }, el('span', {}, 'JEU'), choix))
}
