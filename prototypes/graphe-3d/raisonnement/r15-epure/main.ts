// R15 · Épure : le squelette déductif de R1, composé comme une page de Tufte.
//
// - Dérivation (squelette.ts) : celle de R1 (contexte hors des flèches, élagage, réduction
//   transitive, repli des sous-arguments exclusifs en étapes dépliables au double-clic).
// - Mise en page (mise-en-page.ts) : colonnes et rangées de R1, mais des blocs de texte au lieu de
//   cartes, et une colonne de notes de marge numérotées pour le contexte.
// - Rendu (rendu.ts) : texte, filets fins, micro-graphiques de confiance, une seule couleur d'accent.

import {
  creerVueRaisonnement, el, type Disposition, type ReducteurAreteR, type ReducteurPoint, type VueRaisonnement,
} from '../../src/raisonnement'
import meta from './meta.json'
import { mettreEnPage, type MiseEnPage } from './mise-en-page'
import {
  cibleSous, dependantsActifs, dessinerDessous, dessinerDessus, lirePalette, type EtatRendu,
} from './rendu'
import { etatSquelette, NIVEAUX, niveauDeStrategie, STRATEGIE_NIVEAU, type Niveau } from './squelette'

const etat: EtatRendu = {
  page: null,
  palette: lirePalette(document.body),
  cibles: [],
  survol: null,
  epingles: new Set(),
  numeroChoix: new Map(),
}

// État de la vision (déclaré avant la vue : ses rappels servent dès la construction).
let corpsPanneau: HTMLElement | null = null
let cadrerApres = true
const numeroParId = new Map<string, number>()
let epinglesIds = new Set<string>()

// ─── Réducteurs : points sigma invisibles, opacité pilotée par la vision ───────

const reducteurPoint: ReducteurPoint = (info, a, vue) => {
  // Sigma ne dessine plus les nœuds : le texte est composé sur le calque « dessus ».
  a.taille = 0.01
  a.libelle = null
  a.forceLibelle = false
  a.surligne = false
  // Piste abandonnée : grisée par la carte elle-même, pas par l'opacité (qui la rendrait illisible).
  if (info.noeud.piste === 'abandonnee') a.opacite = Math.min(info.presence, a.opacite / 0.55)
  const sv = etat.survol
  const actifs = dependantsActifs(vue, etat)
  if (sv?.genre === 'pastille') {
    // Survol d'une note (ou de son appel) : les énoncés qui la citent restent nets.
    const us = etat.page?.usagesPastille.get(sv.noeud)
    a.opacite = info.presence * (us?.includes(info.point) ? 1 : 0.22)
  } else if (sv?.genre === 'renvoi') {
    // Survol d'un renvoi « (k) » : la carte citée et celles qui la citent.
    const us = etat.page?.usagesRenvoi.get(sv.point)
    a.opacite = info.presence * (info.point === sv.point || us?.includes(info.point) ? 1 : 0.22)
  } else if (actifs && vue.survol !== null && sv?.genre === 'drapeau') {
    a.opacite = info.presence * (actifs.has(info.point) ? 1 : 0.25)
  } else if (actifs && !vue.ligneeActive && vue.survol === null) {
    a.opacite = info.presence * (actifs.has(info.point) ? 1 : 0.35)
  } else if (info.survol === 'autre') {
    // Survol d'un énoncé : voisins nets, le reste atténué (moins fort que par défaut).
    a.opacite = Math.max(a.opacite, info.presence * 0.5)
  }
}

const reducteurArete: ReducteurAreteR = (info, a) => {
  // Les filets de lecture sont tracés sur le calque « dessous ».
  if (info.genre === 'lecture') a.cache = true
}

// ─── Vue ─────────────────────────────────────────────────────────────────────

const vue = creerVueRaisonnement(document.getElementById('app')!, {
  id: meta.id,
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
    { cle: 'niveau', defaut: 'squelette', dossier: 'Épure R15', libelle: 'niveau de détail', options: Object.fromEntries(NIVEAUX.map((n) => [n.nom, n.id])) },
    { cle: 'largeurCarte', defaut: 118, dossier: 'Épure R15', libelle: 'mesure (largeur du texte)', min: 90, max: 260, pas: 2 },
    { cle: 'ecartColonnes', defaut: 40, dossier: 'Épure R15', libelle: 'écart colonnes', min: 30, max: 180, pas: 2 },
    { cle: 'ecartLignes', defaut: 18, dossier: 'Épure R15', libelle: 'interligne des énoncés', min: 4, max: 80, pas: 1 },
    { cle: 'taillePolice', defaut: 13, dossier: 'Épure R15', libelle: 'corps du texte', min: 9, max: 18, pas: 0.5 },
    { cle: 'maxPastilles', defaut: 5, dossier: 'Épure R15', libelle: 'appels de notes max.', min: 0, max: 12, pas: 1 },
    { cle: 'notesMarge', defaut: true, dossier: 'Épure R15', libelle: 'notes de marge' },
    { cle: 'largeurNotes', defaut: 150, dossier: 'Épure R15', libelle: 'largeur des notes', min: 110, max: 280, pas: 2 },
    { cle: 'aretes', defaut: 'lissees', dossier: 'Épure R15', libelle: 'filets', options: { lissés: 'lissees', orthogonaux: 'orthogonales' } },
    { cle: 'rayonCoins', defaut: 6, dossier: 'Épure R15', libelle: 'rayon des coins', min: 0, max: 24, pas: 1 },
    { cle: 'epaisseurFilet', defaut: 0.8, dossier: 'Épure R15', libelle: 'épaisseur des filets', min: 0.4, max: 2, pas: 0.05 },
    { cle: 'pointes', defaut: false, dossier: 'Épure R15', libelle: 'pointes de flèche' },
    { cle: 'marquesChoix', defaut: 'survol', dossier: 'Épure R15', libelle: 'portée des choix', options: { 'au survol / épinglés': 'survol', toujours: 'toujours' } },
    { cle: 'impasses', defaut: true, dossier: 'Épure R15', libelle: 'branches abandonnées' },
    { cle: 'enTetes', defaut: true, dossier: 'Épure R15', libelle: 'titres de colonnes' },
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
    let texte = 'Clic : lignée · double-clic : cadrer · Échap : effacer'
    if (n.type === 'choix_modelisation') texte = 'Survol : portée (sigle dans la rubrique des énoncés) · clic : épingler'
    else if (u && u.membres.length > 1) texte = `Double-clic : déplier les ${u.membres.length} énoncés sur place · clic : lignée`
    else if (u && dansDeplie(v, p)) texte = 'Double-clic : replier le sous-argument · clic : lignée'
    else if (!u) texte = 'Contexte : note de marge'
    if (aide) aide.textContent = texte
    // Note ou renvoi survolé : combien d'énoncés du squelette s'en servent.
    const sv = etat.survol
    const page = etat.page
    if (page && sv?.genre === 'pastille') {
      const k = page.usagesPastille.get(sv.noeud)?.length ?? 0
      f.prepend(el('div', { class: 'r15-fiche-bandeau' }, `Note ${page.numeroNote.get(sv.noeud) ?? ''} · citée par ${k} énoncé${k > 1 ? 's' : ''} (restés nets)`))
    } else if (page && sv?.genre === 'renvoi') {
      const k = page.usagesRenvoi.get(sv.point)?.length ?? 0
      f.prepend(el('div', { class: 'r15-fiche-bandeau' }, `Renvoi (${page.boites[sv.point]?.numero}) · cité par ${k} énoncé${k > 1 ? 's' : ''} plus loin dans le raisonnement`))
    }
    if (page && u && page.boites[p]?.genre === 'drapeau') {
      const k = page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0
      f.prepend(el('div', { class: 'r15-fiche-bandeau' }, `Choix C${etat.numeroChoix.get(p) ?? ''} · ${k} énoncé${k > 1 ? 's' : ''} du squelette en dépendent`))
    }
    return f
  },
  panneau: (p, v) => p.ajouterSection('r15', 'Épure', construirePanneau(v), { position: 'lecture' }),
})

// Les pastilles et liens sémantiques par défaut sont remplacés par ceux de la vision (dessus : pastilles,
// liens sémantiques, en-tête du contexte, puis notre calque).
vue.dessinsDessus.splice(0, 2)

// ─── Disposition maison ──────────────────────────────────────────────────────

const appliquerDisposition = (d: Disposition, anime: boolean) =>
  (vue as unknown as { appliquerDisposition(d: Disposition, anime: boolean): void }).appliquerDisposition(d, anime)

function positionsPrecedentes(): Map<string, number> | undefined {
  const page = etat.page
  if (!page || !vue.lecture) return undefined
  const m = new Map<string, number>()
  const j = vue.justification
  // Chaque membre hérite de la hauteur de son unité : un dépliage s'ouvre « sur place ».
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
    largeurNotes: R.lire<number>('largeurNotes'),
    ecartCouches: R.valeurs.ecartCouches,
    police: etat.palette.serif,
    precedent: anime ? positionsPrecedentes() : undefined,
  })
  attribuerNumerosChoix(page)
  etat.page = page
  etat.survol = null
  majMarges(page)
  appliquerDisposition(disposition, anime)
  if (cadrerApres) {
    cadrerApres = false
    vue.cadrerTout(anime ? undefined : 1)
  } else if (anime && horsEcran()) vue.cadrerTout()
  majPanneau()
}

/** Un numéro stable par choix (id), affiché « Ck » ; les épingles suivent les ids. */
function attribuerNumerosChoix(page: MiseEnPage): void {
  etat.numeroChoix = new Map()
  etat.epingles = new Set()
  for (let p = 0; p < vue.lecture.unites.length; p++) {
    if (page.boites[p]!.genre !== 'drapeau') continue
    const id = vue.justification.noeuds[vue.lecture.unites[p]!.conclusion]!.id
    if (!numeroParId.has(id)) numeroParId.set(id, numeroParId.size + 1)
    etat.numeroChoix.set(p, numeroParId.get(id)!)
    if (epinglesIds.has(id)) etat.epingles.add(p)
  }
}

/**
 * Marges de cadrage (px écran) : le texte déborde de son point d'ancrage et la colonne des notes
 * n'est pas faite de points. On estime l'échelle finale pour leur réserver la place.
 */
function majMarges(page: MiseEnPage): void {
  const W = vue.reglages.lire<number>('largeurCarte')
  const notes = vue.reglages.lire<boolean>('notesMarge') ? page.largeurNotes : 0
  const largeurPage = page.bornes.x1 - page.bornes.x0 + 30
  const s = Math.min(1.4, Math.max(0.2, (vue.racine.clientWidth - 60) / (largeurPage + notes)))
  vue.margesSures = { gauche: (W / 2 + 18) * s, droite: (W / 2 + notes) * s + 16 - 150, haut: 60, bas: 36 }
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

// ─── Survol : cibles dessinées (cartes, pastilles, drapeaux, impasses) ────────

vue.pointSous = (x: number, y: number) => {
  const c = cibleSous(etat, x, y)
  const avant = etat.survol
  etat.survol = c
  if ((avant?.genre !== c?.genre || avant?.noeud !== c?.noeud || avant?.point !== c?.point) && ['pastille', 'renvoi'].some((g) => avant?.genre === g || c?.genre === g)) vue.demanderRendu()
  if (!c) return null
  if (c.genre === 'pastille') return vue.pointDeNoeud(c.noeud)
  return c.point
}

// Clic sur un drapeau : épingler / désépingler sa bande de portée (au lieu de la lignée).
const selectionnerDefaut = vue.selectionner.bind(vue)
vue.selectionner = (p: number | null) => {
  if (p !== null && p < vue.nU && etat.page?.boites[p]?.genre === 'drapeau' && etat.survol?.genre === 'drapeau') {
    const id = vue.noeud(p).id
    if (epinglesIds.has(id)) epinglesIds.delete(id)
    else epinglesIds.add(id)
    epinglesIds = new Set(epinglesIds)
    if (etat.page) attribuerNumerosChoix(etat.page)
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
  // Replier aussi les sous-arguments dépliés à l'intérieur.
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
  else if (['largeurCarte', 'ecartColonnes', 'ecartLignes', 'taillePolice', 'maxPastilles', 'largeurNotes', 'ecartCouches'].includes(cle)) {
    cadrerApres = cle !== 'maxPastilles'
    recalculer(true)
  } else if (cle === 'strategie') cadrerApres = true
  else if (cle === 'liensComplets') window.setTimeout(() => vue.cadrerTout(), 30)
  else if (cle === 'notesMarge' && etat.page) {
    majMarges(etat.page)
    vue.cadrerTout()
  }
})
vue.on('lecture', () => {
  // Stratégie choisie ailleurs (compteur, panneau) : le niveau suit si c'est une des nôtres.
  const n = niveauDeStrategie(vue.strategie.id)
  if (n && vue.reglages.lire<string>('niveau') !== n) {
    ;(vue.reglages.valeurs as unknown as Record<string, string>).niveau = n
    vue.reglages.pane?.refresh()
  }
  cadrerApres ||= !n
})
vue.on('theme', () => {
  etat.palette = lirePalette(vue.racine)
})
etat.palette = lirePalette(vue.racine)

// ─── Panneau ☰ ───────────────────────────────────────────────────────────────

function construirePanneau(v: VueRaisonnement): HTMLElement {
  corpsPanneau = el('div', { class: 'r15-panneau' })
  void v
  return corpsPanneau
}

function majPanneau(): void {
  if (!corpsPanneau || !etat.page) return
  const v = vue
  const page = etat.page
  const niveau = niveauDeStrategie(v.strategie.id)
  const compte = { enonces: 0, etapes: 0, decisions: 0, choix: 0, impasses: 0 }
  for (let p = 0; p < v.nU; p++) {
    const b = page.boites[p]!
    if (b.genre === 'drapeau') compte.choix++
    else if (b.genre === 'decision') {
      compte.decisions++
      if (b.impasse) compte.impasses++
    } else {
      compte.enonces++
      if (b.genre === 'etape') compte.etapes++
    }
  }
  const s = v.lecture.stats
  const boutons = el('div', { class: 'r15-niveaux' }, NIVEAUX.map((n) =>
    el('button', { type: 'button', class: `r15-niveau${n.id === niveau ? ' actif' : ''}`, onclick: () => definirNiveau(n.id) }, n.nom)))
  const choix = [...etat.numeroChoix].sort((a, b) => a[1] - b[1]).map(([p, k]) => {
    const n = v.noeud(p)
    const c = el('input', { type: 'checkbox' }) as HTMLInputElement
    c.checked = etat.epingles.has(p)
    c.addEventListener('change', () => {
      if (c.checked) epinglesIds.add(n.id)
      else epinglesIds.delete(n.id)
      attribuerNumerosChoix(page)
      v.demanderRendu()
    })
    return el('label', { class: 'r15-choix' }, c,
      el('span', { class: 'r15-sigle' }, `C${k}`),
      el('span', {}, n.nom), el('span', { class: 'rsn-doux' }, ` · ${page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0}`))
  })
  corpsPanneau.replaceChildren(
    el('div', { class: 'r15-titre' }, 'Niveau de détail'),
    boutons,
    el('div', { class: 'r15-compte' },
      el('div', {}, el('b', {}, `${v.nU}`), ` éléments sur ${s.noeudsComplet} nœuds · ${s.aretes} filets`),
      el('div', { class: 'rsn-doux' }, `${compte.enonces} énoncés (dont ${compte.etapes} étapes repliées), ${compte.decisions} décisions (${compte.impasses} branches abandonnées), ${compte.choix} choix`),
      el('div', { class: 'rsn-doux' }, `${page.notes.length} notes de marge`),
    ),
    etatSquelette.deplies.size
      ? el('button', { type: 'button', class: 'r15-niveau', onclick: () => {
          etatSquelette.ouvertes.clear()
          etatSquelette.deplies.clear()
          v.definirStrategie(v.strategie)
        } }, `Tout replier (${etatSquelette.deplies.size})`)
      : el('div', { class: 'rsn-doux rsn-petit' }, 'Double-clic sur une étape pour la déplier sur place.'),
    el('div', { class: 'r15-titre' }, 'Choix de modélisation'),
    el('div', { class: 'r15-liste-choix' }, choix),
    el('div', { class: 'r15-titre' }, 'Lire la page'),
    el('dl', { class: 'r15-legende' },
      el('dt', {}, '✓ ? ✕'), el('dd', {}, 'statut, dans la gouttière : établi, incertain, réfuté.'),
      el('dt', {}, '0,82 ⊢●⊣'), el('dd', {}, 'confiance : estimation et intervalle, sur une échelle de 0 à 1.'),
      el('dt', {}, 'IA, H'), el('dd', {}, 'validation : par l’IA, par un humain, par les deux.'),
      el('dt', {}, 'gras'), el('dd', {}, 'résultat majeur ; italique : choix de modélisation, décision.'),
      el('dt', {}, '³,⁷'), el('dd', {}, 'appels de notes : le contexte (hypothèses, définitions, outils) est en marge, à droite.'),
      el('dt', {}, '(4)'), el('dd', {}, 'renvoi à l’énoncé numéroté (4), cité plus loin sans filet.'),
      el('dt', {}, '◇'), el('dd', {}, 'décision : le trait bifurque ; la branche abandonnée reste en gris léger, barrée.'),
      el('dt', {}, 'C1'), el('dd', {}, 'choix de modélisation ; survol ou épingle : son sigle marque les énoncés qui en dépendent.'),
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
;(window as unknown as { rsnVue: typeof vue }).rsnVue = vue
;(window as unknown as { r15: EtatRendu }).r15 = etat
