// R12 · Console d'instrument : le squelette déductif de R1, rendu comme un outil de laboratoire.
//
// - Dérivation (squelette.ts) et mise en page (mise-en-page.ts) reprises de R1 : colonnes, rangées,
//   sous-arguments repliés en étapes dépliables, renvois au lieu des longues flèches.
// - Rendu (rendu.ts) : blocs à champs (repère, statut, validation, confiance chiffrée et barre
//   d'erreur, prémisses / dépendants / profondeur), grille, règle de profondeur, arêtes à angles vifs.
// - Interface : inspecteur propriété-valeur à droite (sélection, sinon survol), barre d'état en bas,
//   fiche de survol réduite à une ligne de mesures.

import {
  creerVueRaisonnement, dependantsDe, el, formaterDate, LIBELLES_ORIGINE, LIBELLES_ROLE, LIBELLES_STATUT,
  LIBELLES_TYPE, LIBELLES_VALIDATION, LIBELLES_VALIDITE,
  type Disposition, type NoeudR, type ReducteurAreteR, type ReducteurPoint, type VueRaisonnement,
} from '../../src/raisonnement'
import meta from './meta.json'
import { mettreEnPage, type MiseEnPage } from './mise-en-page'
import {
  cibleSous, CODE_STATUT, CODE_VALIDATION, dependantsActifs, dessinerDessous, dessinerDessus, f2, lirePaletteR12,
  type EtatRendu,
} from './rendu'
import { etatSquelette, NIVEAUX, niveauDeStrategie, STRATEGIE_NIVEAU, type Niveau } from './squelette'

const etat: EtatRendu = {
  page: null,
  palette: lirePaletteR12(document.documentElement),
  cibles: [],
  survol: null,
  epingles: new Set(),
  couleurChoix: new Map(),
}

// État de la vision (déclaré avant la vue : ses rappels servent dès la construction).
let corpsPanneau: HTMLElement | null = null
let cadrerApres = true
const couleurParId = new Map<string, number>()
let epinglesIds = new Set<string>()
const LARGEUR_INSPECTEUR = 312
let inspecteurOuvert = true

// ─── Réducteurs : points sigma invisibles, opacité pilotée par la vision ───────

const reducteurPoint: ReducteurPoint = (info, a, vue) => {
  a.taille = 0.01
  a.libelle = null
  a.forceLibelle = false
  a.surligne = false
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
    a.opacite = Math.max(a.opacite, info.presence * 0.55)
  }
}

const reducteurArete: ReducteurAreteR = (info, a) => {
  if (info.genre === 'lecture') a.cache = true
}

// ─── Vue ─────────────────────────────────────────────────────────────────────

const DOSSIER = 'Console R12'
const vue = creerVueRaisonnement(document.getElementById('app')!, {
  id: meta.id,
  mode: '2d',
  strategie: STRATEGIE_NIVEAU.squelette,
  ui: { compteur: false },
  reglages: {
    ajusterAspect: false,
    pastillesContexte: true,
    liensSemantiques: true,
    opaciteContexte: 0.22,
    opaciteLiensComplets: 0.22,
  },
  reglagesSupplementaires: [
    { cle: 'niveau', defaut: 'squelette', dossier: DOSSIER, libelle: 'niveau de détail', options: Object.fromEntries(NIVEAUX.map((n) => [n.nom, n.id])) },
    { cle: 'largeurCarte', defaut: 184, dossier: DOSSIER, libelle: 'largeur bloc', min: 150, max: 280, pas: 2 },
    { cle: 'ecartColonnes', defaut: 36, dossier: DOSSIER, libelle: 'écart colonnes', min: 20, max: 160, pas: 4 },
    { cle: 'ecartLignes', defaut: 16, dossier: DOSSIER, libelle: 'écart lignes', min: 8, max: 80, pas: 4 },
    { cle: 'taillePolice', defaut: 11.5, dossier: DOSSIER, libelle: 'taille énoncé', min: 9, max: 16, pas: 0.5 },
    { cle: 'maxPastilles', defaut: 6, dossier: DOSSIER, libelle: 'cellules contexte max.', min: 0, max: 12, pas: 1 },
    { cle: 'aretes', defaut: 'orthogonales', dossier: DOSSIER, libelle: 'arêtes', options: { orthogonales: 'orthogonales', lissées: 'lissees' } },
    { cle: 'rayonCoins', defaut: 0, dossier: DOSSIER, libelle: 'rayon des coins', min: 0, max: 12, pas: 1 },
    { cle: 'bandesChoix', defaut: 'survol', dossier: DOSSIER, libelle: 'portée des choix', options: { 'au survol / épinglées': 'survol', toujours: 'toujours' } },
    { cle: 'impasses', defaut: true, dossier: DOSSIER, libelle: 'alternatives rejetées' },
    { cle: 'enTetes', defaut: true, dossier: DOSSIER, libelle: 'règle et zones' },
    { cle: 'grille', defaut: true, dossier: DOSSIER, libelle: 'grille' },
  ],
  reducteursNoeud: [reducteurPoint],
  reducteursArete: [reducteurArete],
  dessinerDessous: (c) => dessinerDessous(c, etat),
  dessinerDessus: (c) => dessinerDessus(c, etat),
  rendreFiche: (p, v) => ficheCourte(v, p),
  panneau: (p, v) => p.ajouterSection('r12', 'Console', construirePanneau(v), { position: 'lecture' }),
})

// Pastilles et liens sémantiques par défaut remplacés par ceux de la vision.
vue.dessinsDessus.splice(0, 2)

// ─── Repères et petites aides ────────────────────────────────────────────────

/** Repère d'un nœud de justification (« LEM-03 »). */
const refNoeud = (i: number): string => etat.page?.refs.get(i) ?? `#${i}`
/** Repère d'un point (unité, étape ou masqué). */
const refPoint = (p: number): string => etat.page?.boites[p]?.ref ?? `#${p}`

// ─── Fiche de survol : une ligne de mesures ──────────────────────────────────

function ficheCourte(v: VueRaisonnement, p: number): HTMLElement {
  const n = v.noeud(p)
  const sv = etat.survol
  const page = etat.page
  const u = p < v.nU ? v.lecture.unites[p] : undefined
  let entete = `${refPoint(p)} · ${LIBELLES_TYPE[n.type].toUpperCase()} · ${CODE_STATUT[n.statut]} · ${CODE_VALIDATION[n.validation]} · c ${f2(n.confiance.estimation)}`
  let aide = 'clic : lignée · double-clic : cadrer'
  if (page && sv?.genre === 'pastille') {
    const k = page.usagesPastille.get(sv.noeud)?.length ?? 0
    entete = `CTX ${refNoeud(sv.noeud)} · ${LIBELLES_TYPE[n.type].toUpperCase()} · utilisé par ${k} bloc${k > 1 ? 's' : ''}`
    aide = 'contexte rattaché : les blocs qui l’utilisent restent nets'
  } else if (page && sv?.genre === 'renvoi') {
    const k = page.usagesRenvoi.get(sv.point)?.length ?? 0
    entete = `RENVOI ${refPoint(sv.point)} · cité par ${k} bloc${k > 1 ? 's' : ''}`
    aide = 'prémisse lointaine citée par son repère au lieu d’une longue flèche'
  } else if (n.type === 'choix_modelisation') aide = 'survol : portée · clic : épingler'
  else if (u && u.membres.length > 1) aide = `double-clic : déplier ${u.membres.length} énoncés sur place`
  else if (u && dansDeplie(v, p)) aide = 'double-clic : replier le sous-argument'
  return el('div', { class: 'r12-fiche' },
    el('div', { class: 'r12-fiche-mesures' }, entete),
    el('div', { class: 'r12-fiche-nom' }, n.nom),
    el('div', { class: 'r12-fiche-aide' }, aide),
  )
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
  attribuerCouleursChoix(page)
  etat.page = page
  etat.survol = null
  majMarges()
  appliquerDisposition(disposition, anime)
  if (cadrerApres) {
    cadrerApres = false
    vue.cadrerTout(anime ? undefined : 1)
  } else if (anime && horsEcran()) vue.cadrerTout()
  majPanneau()
  majBarreEtat()
  majInspecteur()
}

function attribuerCouleursChoix(page: MiseEnPage): void {
  etat.couleurChoix = new Map()
  etat.epingles = new Set()
  for (let p = 0; p < vue.lecture.unites.length; p++) {
    if (page.boites[p]!.genre !== 'drapeau') continue
    const id = vue.justification.noeuds[vue.lecture.unites[p]!.conclusion]!.id
    if (!couleurParId.has(id)) couleurParId.set(id, couleurParId.size)
    etat.couleurChoix.set(p, couleurParId.get(id)!)
    if (epinglesIds.has(id)) etat.epingles.add(p)
  }
}

/** Marges de cadrage : blocs autour de leur ancrage, inspecteur à droite, barre d'état en bas. */
function majMarges(): void {
  const W = vue.reglages.lire<number>('largeurCarte')
  const droite = inspecteurOuvert ? LARGEUR_INSPECTEUR : 0
  vue.margesSures = { gauche: W / 2 + 8, droite: W / 2 + 12 - 150 + droite, haut: 64, bas: 34 }
}

function horsEcran(): boolean {
  const d = vue.disposition
  const cam = vue.camera
  const droite = cam.largeur - (inspecteurOuvert ? LARGEUR_INSPECTEUR : 0)
  for (let p = 0; p < d.nU; p++) {
    const q = cam.projeterPoint([d.x[p]!, 0, d.z[p]!])
    if (q.x < 40 || q.x > droite - 40 || q.y < 60 || q.y > cam.hauteur - 60) return true
  }
  return false
}

vue.redisposer = async () => recalculer(true)

// ─── Survol : cibles dessinées ───────────────────────────────────────────────

vue.pointSous = (x: number, y: number) => {
  const c = cibleSous(etat, x, y)
  const avant = etat.survol
  etat.survol = c
  if ((avant?.genre !== c?.genre || avant?.noeud !== c?.noeud || avant?.point !== c?.point) && ['pastille', 'renvoi'].some((g) => avant?.genre === g || c?.genre === g)) vue.demanderRendu()
  if (!c) return null
  if (c.genre === 'pastille') return vue.pointDeNoeud(c.noeud)
  return c.point
}

// Clic sur un drapeau : épingler / désépingler sa portée (au lieu de la lignée).
const selectionnerDefaut = vue.selectionner.bind(vue)
vue.selectionner = (p: number | null) => {
  if (p !== null && p < vue.nU && etat.page?.boites[p]?.genre === 'drapeau' && etat.survol?.genre === 'drapeau') {
    const id = vue.noeud(p).id
    if (epinglesIds.has(id)) epinglesIds.delete(id)
    else epinglesIds.add(id)
    epinglesIds = new Set(epinglesIds)
    if (etat.page) attribuerCouleursChoix(etat.page)
    majPanneau()
    vue.demanderRendu()
    return
  }
  selectionnerDefaut(p)
}

// ─── Double-clic : déplier une étape sur place, replier un sous-argument ───────

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
  etat.palette = lirePaletteR12(vue.racine)
  majInspecteur()
})
vue.on('survol', () => {
  if (vue.selection === null) majInspecteur()
  majBarreEtat()
})
vue.on('selection', () => {
  majInspecteur()
  majBarreEtat()
})
vue.on('mode', () => majBarreEtat())
etat.palette = lirePaletteR12(vue.racine)

// ─── Panneau ☰ ───────────────────────────────────────────────────────────────

function construirePanneau(v: VueRaisonnement): HTMLElement {
  corpsPanneau = el('div', { class: 'r12-panneau' })
  void v
  return corpsPanneau
}

function majPanneau(): void {
  if (!corpsPanneau || !etat.page) return
  const v = vue
  const page = etat.page
  const choix = [...etat.couleurChoix].map(([p, k]) => {
    const n = v.noeud(p)
    const c = el('input', { type: 'checkbox' }) as HTMLInputElement
    c.checked = etat.epingles.has(p)
    c.addEventListener('change', () => {
      if (c.checked) epinglesIds.add(n.id)
      else epinglesIds.delete(n.id)
      attribuerCouleursChoix(page)
      v.demanderRendu()
    })
    return el('label', { class: 'r12-choix' }, c,
      el('span', { class: 'r12-puce', style: `border-color:${etat.palette.choix[k % etat.palette.choix.length]}` }),
      el('span', { class: 'r12-mono' }, page.boites[p]!.ref),
      el('span', { class: 'r12-choix-nom' }, n.nom),
      el('span', { class: 'r12-mono r12-doux' }, `${page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0}`))
  })
  corpsPanneau.replaceChildren(
    etatSquelette.deplies.size
      ? el('button', { type: 'button', class: 'rsn-bouton', onclick: () => {
          etatSquelette.ouvertes.clear()
          etatSquelette.deplies.clear()
          v.definirStrategie(v.strategie)
        } }, `Tout replier (${etatSquelette.deplies.size})`)
      : el('div', { class: 'r12-doux' }, 'Double-clic sur un bloc ETP (étape repliée) pour le déplier sur place.'),
    el('div', { class: 'rsn-groupe-titre' }, 'Choix de modélisation · portée'),
    el('div', { class: 'r12-liste-choix' }, choix),
    el('div', { class: 'rsn-groupe-titre' }, 'Lire un bloc'),
    el('table', { class: 'r12-legende' },
      ligneLegende('LEM-03', 'repère : code de type + numéro dans l’ordre de lecture'),
      ligneLegende('■ VAL', 'statut : VAL validé, INC incertain, RÉF réfuté'),
      ligneLegende('IA+H', 'validation : IA, H (humain), IA+H, — aucune'),
      ligneLegende('0.82 [.74,.90]', 'confiance : estimation [bas, haut] ; barre d’erreur sur [0, 1]'),
      ligneLegende('←2 →3 D4', 'prémisses et dépendants dans la lecture, profondeur logique'),
      ligneLegende('ETP ×5', 'étape repliée de 5 énoncés (double-clic : déplier)'),
      ligneLegende('◁ LEM-03', 'renvoi : prémisse lointaine citée par son repère'),
      ligneLegende('H D O A L +', 'contexte rattaché : hypothèse, définition, outil, axiome, littérature, auxiliaire'),
      ligneLegende('◇', 'décision ; REJ : alternative rejetée'),
      ligneLegende('CHX', 'choix de modélisation (marge) ; survol : repères de portée sur les blocs'),
    ),
  )
}

function ligneLegende(code: string, texte: string): HTMLElement {
  return el('tr', {}, el('td', { class: 'r12-mono' }, code), el('td', {}, texte))
}

// ─── Inspecteur (droite) : tableau propriété-valeur ──────────────────────────

const inspecteur = el('aside', { class: 'r12-inspecteur' })
const corpsInspecteur = el('div', { class: 'r12-inspecteur-corps' })
const modeInspecteur = el('span', { class: 'r12-mono r12-doux' }, '')
const boutonInspecteur = el('button', { type: 'button', class: 'r12-bascule', title: 'Masquer / afficher l’inspecteur (I)' }, 'Inspecteur ▸')
inspecteur.append(
  el('div', { class: 'r12-inspecteur-entete' }, el('span', { class: 'r12-titre-section' }, 'INSPECTEUR'), modeInspecteur,
    el('button', { type: 'button', class: 'r12-fermer', title: 'Masquer (I)', onclick: () => basculerInspecteur() }, '×')),
  corpsInspecteur,
)
vue.racine.append(inspecteur, boutonInspecteur)
boutonInspecteur.addEventListener('click', () => basculerInspecteur())

function basculerInspecteur(ouvert = !inspecteurOuvert): void {
  inspecteurOuvert = ouvert
  vue.racine.classList.toggle('r12-sans-inspecteur', !ouvert)
  majMarges()
  vue.demanderRendu()
}

/** Ligne propriété-valeur ; la valeur peut être un nœud DOM. */
function ligne(propriete: string, valeur: HTMLElement | string | null, classe = ''): HTMLElement | null {
  if (valeur === null || valeur === '') return null
  return el('tr', {}, el('th', {}, propriete), el('td', { class: classe }, valeur))
}

/** Barre d'erreur SVG (axe [0, 1]) pour l'inspecteur. */
function barreErreur(n: NoeudR, couleur: string, texte: string): HTMLElement {
  const c = n.confiance
  const L = 120
  const x = (t: number) => (4 + t * L).toFixed(1)
  const span = el('span', { class: 'r12-barre' })
  span.innerHTML = `<svg width="${L + 8}" height="14" viewBox="0 0 ${L + 8} 14" aria-hidden="true">
    <line x1="4" y1="7" x2="${L + 4}" y2="7" stroke="${texte}" stroke-opacity=".45" stroke-width="1"/>
    ${[0, 0.25, 0.5, 0.75, 1].map((t) => `<line x1="${x(t)}" y1="${t % 0.5 === 0 ? 3 : 5}" x2="${x(t)}" y2="${t % 0.5 === 0 ? 11 : 9}" stroke="${texte}" stroke-opacity=".45" stroke-width="1"/>`).join('')}
    <line x1="${x(c.bas)}" y1="7" x2="${x(c.haut)}" y2="7" stroke="${couleur}" stroke-width="2"/>
    <line x1="${x(c.bas)}" y1="3.5" x2="${x(c.bas)}" y2="10.5" stroke="${couleur}" stroke-width="1.2"/>
    <line x1="${x(c.haut)}" y1="3.5" x2="${x(c.haut)}" y2="10.5" stroke="${couleur}" stroke-width="1.2"/>
    <rect x="${(4 + c.estimation * L - 2.5).toFixed(1)}" y="4.5" width="5" height="5" fill="${couleur}"/>
  </svg>`
  return span
}

/** Liste de repères (cliquables : sélection). */
function listeRefs(points: number[], max = 8): HTMLElement | string {
  if (!points.length) return '—'
  const s = el('span', { class: 'r12-refs' })
  for (const q of points.slice(0, max)) {
    s.append(el('button', { type: 'button', class: 'r12-ref', title: vue.noeud(q).nom, onclick: () => {
      selectionnerDefaut(q)
      vue.cadrerSelection()
    } }, refPoint(q)))
  }
  if (points.length > max) s.append(el('span', { class: 'r12-doux' }, ` +${points.length - max}`))
  return s
}

function majInspecteur(): void {
  const page = etat.page
  const p = vue.selection ?? vue.survol
  modeInspecteur.textContent = vue.selection !== null ? 'SÉLECTION' : vue.survol !== null ? 'SURVOL' : ''
  if (!page || p === null || p >= vue.nP) {
    corpsInspecteur.replaceChildren(el('div', { class: 'r12-vide' },
      el('div', {}, 'Aucun élément sélectionné.'),
      el('div', { class: 'r12-doux' }, 'Survol : lecture immédiate · clic : figer la sélection et la lignée · Échap : effacer.'),
    ))
    return
  }
  const pal = vue.palette
  const j = vue.justification
  const g = vue.lecture
  const n = vue.noeud(p)
  const i = vue.indexNoeud(p)
  const u = p < vue.nU ? g.unites[p] : undefined
  const b = page.boites[p]!
  const sp = vue.jeu.sousProblemes.find((s) => s.id === n.sousProbleme)
  const c = n.confiance
  const statut = el('span', {}, el('span', { class: 'r12-carre', style: `background:${pal.statut[n.statut]}` }), ` ${CODE_STATUT[n.statut]} · ${LIBELLES_STATUT[n.statut]}`)
  const premissesLecture = u ? g.entrantes[p]!.map((e) => g.aretes[e]!.source) : []
  const dependantsLecture = u ? g.sortantes[p]!.map((e) => g.aretes[e]!.cible) : []
  const nbPremissesCompletes = j.entrantes[i]!.length
  const nbDependantsTransitifs = dependantsDe(j, i).length
  const choixAmont = [...etat.couleurChoix.keys()].filter((q) => q !== p && page.portees.get(q)?.includes(p))
  const rangMax = page.nbRangs - 1
  // Contexte rattaché, par rôle.
  const parRole = new Map<string, number>()
  for (const ctx of u?.contexte ?? []) parRole.set(ctx.role, (parRole.get(ctx.role) ?? 0) + 1)
  const contexte = u ? `${u.contexte.length}${parRole.size ? ` (${[...parRole].map(([r, k]) => `${k} ${LIBELLES_ROLE[r as keyof typeof LIBELLES_ROLE].toLowerCase()}`).join(', ')})` : ''}` : null

  const table = el('table', { class: 'r12-proprietes' },
    ligne('Repère', b.ref, 'r12-mono r12-fort'),
    ligne('Type', `${LIBELLES_TYPE[n.type]} (${b.code === 'ETP' ? 'ETP' : b.code})`),
    ligne('Unité', !u ? 'contexte pur (hors lecture)' : u.membres.length > 1 ? `étape repliée · ${u.membres.length} énoncés` : 'énoncé'),
    ligne('Statut', statut),
    ligne('Validation', `${CODE_VALIDATION[n.validation]} · ${LIBELLES_VALIDATION[n.validation]}`),
    ligne('Confiance', `${f2(c.estimation)} [${f2(c.bas)}, ${f2(c.haut)}]`, 'r12-mono'),
    ligne('Largeur IC', f2(c.haut - c.bas), 'r12-mono'),
    ligne('', barreErreur(n, pal.statut[n.statut], pal.texteDoux)),
    ligne('Profondeur', u ? `D${Math.max(0, b.rang)} / D${rangMax}${b.zone === 0 ? ' (marge)' : ''}` : '—', 'r12-mono'),
    ligne('Prémisses · lecture', u ? el('span', {}, el('span', { class: 'r12-mono' }, `${premissesLecture.length}  `), listeRefs(premissesLecture)) : null),
    ligne('Renvois', b.renvois.length ? listeRefs(b.renvois) : null),
    ligne('Dépendants · lecture', u ? el('span', {}, el('span', { class: 'r12-mono' }, `${dependantsLecture.length}  `), listeRefs(dependantsLecture)) : null),
    ligne('Prémisses · complet', `${nbPremissesCompletes}`, 'r12-mono'),
    ligne('Dépendants · complet', `${nbDependantsTransitifs} (transitifs)`, 'r12-mono'),
    ligne('Contexte rattaché', contexte),
    ligne('Choix amont', choixAmont.length ? listeRefs(choixAmont) : '—'),
    ligne('Origine', `${LIBELLES_ORIGINE[n.origine]} · ${n.auteur}`),
    ligne('Créé le', formaterDate(Date.parse(n.cree_le))),
    ligne('Sous-problème', sp?.nom ?? n.sousProbleme),
    ligne('Piste', n.piste === 'abandonnee' ? 'abandonnée' : 'active'),
    ligne('Identifiant', n.id, 'r12-mono r12-doux'),
  )
  const blocs: HTMLElement[] = [
    el('div', { class: 'r12-inspecteur-nom' }, n.nom),
    el('div', { class: 'r12-inspecteur-enonce' }, n.enonce),
    table,
  ]
  // Démonstrations : tableau (nom, validité, prémisses).
  if (n.demonstrations.length) {
    blocs.push(el('div', { class: 'r12-titre-section' }, `DÉMONSTRATIONS · ${n.demonstrations.length}`),
      el('table', { class: 'r12-grille' },
        el('tr', {}, el('th', {}, 'nom'), el('th', {}, 'validité'), el('th', { class: 'num' }, 'prém.')),
        n.demonstrations.map((d) => el('tr', {}, el('td', {}, d.nom), el('td', {}, LIBELLES_VALIDITE[d.validite]), el('td', { class: 'num' }, `${d.premisses.length}`)))))
  } else blocs.push(el('div', { class: 'r12-doux r12-note' }, n.admis ? 'Admis : aucune démonstration.' : 'Aucune démonstration.'))
  if (n.decision) {
    const d = n.decision
    blocs.push(el('div', { class: 'r12-titre-section' }, 'DÉCISION'),
      el('div', { class: 'r12-note' }, d.question),
      el('table', { class: 'r12-grille' }, d.alternatives.map((a) =>
        el('tr', { class: a.retenue ? '' : 'r12-rejetee' }, el('td', { class: 'r12-mono' }, a.retenue ? 'RET' : 'REJ'), el('td', {}, a.libelle, a.raison ? el('div', { class: 'r12-doux' }, a.raison) : null)))),
      el('div', { class: 'r12-note r12-doux' }, `Raison : ${d.raison}`))
  }
  if (n.choix) {
    const portee = page.portees.get(p) ?? []
    blocs.push(el('div', { class: 'r12-titre-section' }, 'CHOIX DE MODÉLISATION'),
      el('table', { class: 'r12-proprietes' },
        ligne('Hypothèse', n.choix.hypothese),
        ligne('Portée déclarée', n.choix.portee),
        ligne('Portée calculée', `${portee.filter((q) => q < vue.nU).length} bloc(s) visibles · ${dependantsDe(j, i).length} nœud(s)`, 'r12-mono'),
        ligne('Alternatives', n.choix.alternatives?.join(' ; ') ?? null),
      ))
  }
  if (u && u.membres.length > 1) {
    blocs.push(el('div', { class: 'r12-titre-section' }, `MEMBRES · ${u.membres.length}`),
      el('table', { class: 'r12-grille' }, u.membres.map((m) => {
        const x = j.noeuds[m]!
        return el('tr', {}, el('td', { class: 'r12-mono' }, refNoeud(m)), el('td', {}, x.nom), el('td', { class: 'r12-mono', style: `color:${pal.statut[x.statut]}` }, CODE_STATUT[x.statut]))
      })))
  }
  if (n.liens?.length) {
    blocs.push(el('div', { class: 'r12-titre-section' }, 'LIENS'),
      el('table', { class: 'r12-grille' }, n.liens.map((l) => {
        const ci = j.index.get(l.cible)
        return el('tr', {}, el('td', { class: 'r12-mono' }, l.genre.toUpperCase()), el('td', {}, ci !== undefined ? `${refNoeud(ci)} · ${j.noeuds[ci]!.nom}` : l.cible, l.note ? el('div', { class: 'r12-doux' }, l.note) : null))
      })))
  }
  corpsInspecteur.replaceChildren(...blocs)
}

// ─── Barre d'état (bas) ──────────────────────────────────────────────────────

const barreEtat = el('div', { class: 'r12-etat' })
const zoneNiveaux = el('span', { class: 'r12-etat-niveaux' })
const zoneMesures = el('span', { class: 'r12-etat-mesures' })
const zoneCurseur = el('span', { class: 'r12-etat-curseur' })
barreEtat.append(zoneNiveaux, zoneMesures, zoneCurseur)
vue.racine.append(barreEtat)

const champ = (cle: string, valeur: string, titre?: string) =>
  el('span', { class: 'r12-champ', title: titre ?? '' }, el('span', { class: 'r12-cle' }, cle), el('span', { class: 'r12-val' }, valeur))

function majBarreEtat(): void {
  const page = etat.page
  if (!page) return
  const g = vue.lecture
  const s = g.stats
  const niveau = niveauDeStrategie(vue.strategie.id)
  zoneNiveaux.replaceChildren(el('span', { class: 'r12-cle' }, 'NIVEAU'), ...NIVEAUX.map((x) =>
    el('button', { type: 'button', class: `r12-seg${x.id === niveau ? ' actif' : ''}`, onclick: () => definirNiveau(x.id) }, x.nom)))
  let etapes = 0, decisions = 0, choix = 0
  const statuts = { valide: 0, incertain: 0, refute: 0 }
  const resultats: NoeudR[] = []
  for (let p = 0; p < vue.nU; p++) {
    const b = page.boites[p]!
    const n = vue.noeud(p)
    statuts[n.statut]++
    if (b.genre === 'etape') etapes++
    else if (b.genre === 'decision') decisions++
    else if (b.genre === 'drapeau') choix++
    else if (b.genre === 'majeur' && n.piste === 'active') resultats.push(n)
  }
  const moy = resultats.length ? resultats.reduce((t, n) => t + n.confiance.estimation, 0) / resultats.length : NaN
  const bas = resultats.length ? resultats.reduce((t, n) => t + n.confiance.bas, 0) / resultats.length : NaN
  const haut = resultats.length ? resultats.reduce((t, n) => t + n.confiance.haut, 0) / resultats.length : NaN
  const min = resultats.length ? Math.min(...resultats.map((n) => n.confiance.estimation)) : NaN
  const nb = (x: number) => (Number.isFinite(x) ? f2(x) : '—')
  zoneMesures.replaceChildren(
    champ('NŒUDS', `${vue.nU}/${s.noeudsComplet}`, 'unités visibles / nœuds du graphe de justification'),
    champ('ARÊTES', `${s.aretes}/${s.aretesComplet}`, 'flèches de lecture / arêtes complètes'),
    champ('ETP', `${etapes}`, 'étapes repliées'),
    champ('DEC', `${decisions}`, 'décisions'),
    champ('CHX', `${choix}`, 'choix de modélisation'),
    champ('PROF. MAX', `D${Math.max(0, page.nbRangs - 1)}`, 'profondeur logique maximale'),
    champ('RÉSULTATS', `${resultats.length}`, 'théorèmes et résultats établis (piste active)'),
    champ('CONF. MOY.', `${nb(moy)} [${nb(bas)}, ${nb(haut)}]`, 'confiance moyenne des résultats [bas, haut moyens]'),
    champ('MIN', nb(min), 'confiance du résultat le plus faible'),
    el('span', { class: 'r12-champ' }, el('span', { class: 'r12-cle' }, 'STATUT'),
      el('span', { class: 'r12-val' }, el('span', { class: 'r12-carre', style: `background:${vue.palette.statut.valide}` }), ` ${statuts.valide} `,
        el('span', { class: 'r12-carre', style: `background:${vue.palette.statut.incertain}` }), ` ${statuts.incertain} `,
        el('span', { class: 'r12-carre', style: `background:${vue.palette.statut.refute}` }), ` ${statuts.refute}`)),
  )
  const p = vue.selection ?? vue.survol
  zoneCurseur.replaceChildren(
    champ('MODE', vue.mode.toUpperCase()),
    champ(vue.selection !== null ? 'SÉL' : 'SURVOL', p !== null && p < vue.nP ? refPoint(p) : '—'),
  )
}

// ─── Raccourci I : inspecteur ────────────────────────────────────────────────

window.addEventListener('keydown', (e) => {
  const cible = e.target as HTMLElement | null
  if (cible && (cible.tagName === 'INPUT' || cible.tagName === 'SELECT' || cible.tagName === 'TEXTAREA' || cible.isContentEditable)) return
  if ((e.key === 'i' || e.key === 'I') && !e.ctrlKey && !e.metaKey && !e.altKey) basculerInspecteur()
})

// ─── Démarrage ───────────────────────────────────────────────────────────────

{
  const n = vue.reglages.lire<string>('niveau') as Niveau
  if (STRATEGIE_NIVEAU[n] && vue.strategie.id !== STRATEGIE_NIVEAU[n]) vue.definirStrategie(STRATEGIE_NIVEAU[n])
  else recalculer(false)
}
// Les polices (Inter, JetBrains Mono) arrivent après le premier calcul : on remesure les énoncés.
document.fonts?.ready.then(() => {
  cadrerApres = false
  recalculer(false)
})

// Convention : le script de capture lit window.rsnVue.
;(window as unknown as { rsnVue: typeof vue; r12: EtatRendu }).rsnVue = vue
;(window as unknown as { r12: EtatRendu }).r12 = etat
