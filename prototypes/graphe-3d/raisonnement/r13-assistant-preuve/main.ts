// R13 · Assistant de preuve : le squelette déductif de R1 dans le langage visuel d'un blueprint
// (Lean 4 / leanblueprint, Isabelle jEdit).
//
// - Dérivation reprise de R1 (squelette.ts) : contexte rattaché, élagage, réduction transitive,
//   sous-arguments repliés en preuves dépliables (double-clic).
// - Mise en page reprise de R1 (mise-en-page.ts), plus identifiants, états et variables portées.
// - Rendu (rendu.ts) : énoncés à identifiant monospace, état codé par la bordure et un symbole,
//   décisions en points de branchement annotés, choix de modélisation en déclarations `variable cₖ`.
// - Inspecteur (clic) : contexte de but « h₁ : … ⊢ conclusion », démonstration, preuve repliée.
// - Progression globale : x vérifiés / y énoncés à prouver.

import {
  creerVueRaisonnement, demonstrationPrincipale, el, FORCE_ROLE, formaterDate, LIBELLES_ROLE, LIBELLES_TYPE,
  LIBELLES_VALIDATION, LIBELLES_VALIDITE,
  type Disposition, type NoeudR, type ReducteurAreteR, type ReducteurPoint, type RolePremisse, type VueRaisonnement,
} from '../../src/raisonnement'
import meta from './meta.json'
import { mettreEnPage, type MiseEnPage } from './mise-en-page'
import {
  ETATS, etatNoeud, etatUnite, identifiant, indice, LIBELLE_ETAT, motAdmis, progression, SYMBOLE_ETAT, type EtatPreuve,
} from './preuve'
import {
  cibleSous, dependantsActifs, dessinerDessous, dessinerDessus, lirePaletteR13, type EtatRendu,
} from './rendu'
import { etatSquelette, NIVEAUX, niveauDeStrategie, STRATEGIE_NIVEAU, type Niveau } from './squelette'

const etat: EtatRendu = {
  page: null,
  palette: lirePaletteR13(document.body),
  cibles: [],
  survol: null,
  epingles: new Set(),
  couleurChoix: new Map(),
}

// État de la vision (déclaré avant la vue : ses rappels servent dès la construction).
let corpsPanneau: HTMLElement | null = null
let cadrerApres = true
let epinglesIds = new Set<string>()

// ─── Réducteurs : points sigma invisibles, opacité pilotée par la vision ───────

const reducteurPoint: ReducteurPoint = (info, a, vue) => {
  // Sigma ne dessine plus les nœuds : énoncés et variables sont sur le calque « dessus ».
  a.taille = 0.01
  a.libelle = null
  a.forceLibelle = false
  a.surligne = false
  // Piste abandonnée : grisée par le cadre lui-même, pas par l'opacité (qui la rendrait illisible).
  if (info.noeud.piste === 'abandonnee') a.opacite = Math.min(info.presence, a.opacite / 0.55)
  const sv = etat.survol
  const actifs = dependantsActifs(vue, etat)
  if (sv?.genre === 'pastille') {
    // Survol d'une lettre de contexte : les énoncés qui l'utilisent restent nets.
    const us = etat.page?.usagesPastille.get(sv.noeud)
    a.opacite = info.presence * (us?.includes(info.point) ? 1 : 0.22)
  } else if (sv?.genre === 'renvoi') {
    const us = etat.page?.usagesRenvoi.get(sv.point)
    a.opacite = info.presence * (info.point === sv.point || us?.includes(info.point) ? 1 : 0.22)
  } else if (actifs && vue.survol !== null && sv?.genre === 'drapeau') {
    a.opacite = info.presence * (actifs.has(info.point) ? 1 : 0.25)
  } else if (actifs && !vue.ligneeActive && vue.survol === null) {
    a.opacite = info.presence * (actifs.has(info.point) ? 1 : 0.35)
  } else if (info.survol === 'autre') {
    a.opacite = Math.max(a.opacite, info.presence * 0.5)
  }
}

const reducteurArete: ReducteurAreteR = (info, a) => {
  // Les arêtes de lecture sont tracées (orthogonales) sur le calque « dessous ».
  if (info.genre === 'lecture') a.cache = true
}

// ─── Vue ─────────────────────────────────────────────────────────────────────

const DOSSIER = 'Blueprint R13'

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
    { cle: 'niveau', defaut: 'squelette', dossier: DOSSIER, libelle: 'niveau de détail', options: Object.fromEntries(NIVEAUX.map((n) => [n.nom, n.id])) },
    { cle: 'largeurCarte', defaut: 148, dossier: DOSSIER, libelle: 'largeur énoncé', min: 100, max: 260, pas: 2 },
    { cle: 'ecartColonnes', defaut: 34, dossier: DOSSIER, libelle: 'écart colonnes', min: 18, max: 160, pas: 2 },
    { cle: 'ecartLignes', defaut: 16, dossier: DOSSIER, libelle: 'écart lignes', min: 4, max: 80, pas: 1 },
    { cle: 'taillePolice', defaut: 12, dossier: DOSSIER, libelle: 'taille texte', min: 9, max: 18, pas: 0.5 },
    { cle: 'maxPastilles', defaut: 5, dossier: DOSSIER, libelle: 'contexte max.', min: 0, max: 12, pas: 1 },
    { cle: 'aretes', defaut: 'orthogonales', dossier: DOSSIER, libelle: 'arêtes', options: { orthogonales: 'orthogonales', lissées: 'lissees' } },
    { cle: 'rayonCoins', defaut: 2, dossier: DOSSIER, libelle: 'rayon des coins', min: 0, max: 24, pas: 1 },
    { cle: 'impasses', defaut: true, dossier: DOSSIER, libelle: 'branches écartées' },
    { cle: 'enTetes', defaut: true, dossier: DOSSIER, libelle: 'sections nommées' },
    { cle: 'inspecteur', defaut: true, dossier: DOSSIER, libelle: 'inspecteur au clic' },
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
    let texte = 'Clic : contexte de but et lignée · double-clic : cadrer · Échap : effacer'
    if (n.type === 'choix_modelisation') texte = 'Survol : énoncés qui portent cette variable · clic : épingler'
    else if (u && u.membres.length > 1) texte = `Double-clic : déplier la preuve (${u.membres.length} énoncés) · clic : contexte de but`
    else if (u && dansDeplie(v, p)) texte = 'Double-clic : replier la preuve · clic : contexte de but'
    else if (!u) texte = 'Contexte : clic pour son contexte de but'
    if (aide) aide.textContent = texte
    const page = etat.page
    const sv = etat.survol
    let bandeau: string | null = null
    if (page && sv?.genre === 'pastille') {
      const k = page.usagesPastille.get(sv.noeud)?.length ?? 0
      bandeau = `contexte · utilisé par ${k} énoncé${k > 1 ? 's' : ''} visible${k > 1 ? 's' : ''}`
    } else if (page && sv?.genre === 'renvoi') {
      const k = page.usagesRenvoi.get(sv.point)?.length ?? 0
      bandeau = `renvoi (${page.boites[sv.point]?.numero}) · cité par ${k} énoncé${k > 1 ? 's' : ''}`
    } else if (page && u && page.boites[p]?.genre === 'drapeau') {
      const k = page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0
      bandeau = `variable c${indice(page.boites[p]!.variable)} · portée par ${k} énoncé${k > 1 ? 's' : ''} visible${k > 1 ? 's' : ''}`
    }
    // En-tête monospace : identifiant et état.
    const e = page?.boites[p]?.etat ?? etatUnite(v.justification, [v.indexNoeud(p)], v.indexNoeud(p))
    f.prepend(el('div', { class: 'r13-fiche-entete' },
      el('code', {}, identifiant(n)),
      el('span', { class: `r13-etat etat-${e.etat}` }, texteEtat(e.etat, n, e.verifies, e.total))))
    if (bandeau) f.prepend(el('div', { class: 'r13-fiche-bandeau' }, bandeau))
    return f
  },
  panneau: (p, v) => p.ajouterSection('r13', 'Blueprint', construirePanneau(v), { position: 'lecture' }),
})

// Les pastilles et liens sémantiques par défaut sont remplacés par ceux de la vision.
vue.dessinsDessus.splice(0, 2)

function texteEtat(e: EtatPreuve, n: NoeudR, verifies = 0, total = 1): string {
  if (total > 1) return `${SYMBOLE_ETAT[e]} ${verifies}/${total} · ${LIBELLE_ETAT[e]}`
  if (e === 'admis') return `${motAdmis(n)}`
  return `${SYMBOLE_ETAT[e]} ${LIBELLE_ETAT[e]}`
}

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
    ecartCouches: R.valeurs.ecartCouches,
    police: vue.palette.police,
    precedent: anime ? positionsPrecedentes() : undefined,
  })
  attribuerVariables(page)
  etat.page = page
  etat.survol = null
  majMarges()
  appliquerDisposition(disposition, anime)
  if (cadrerApres) {
    cadrerApres = false
    vue.cadrerTout(anime ? undefined : 1)
  } else if (anime && horsEcran()) vue.cadrerTout()
  majPanneau()
  majProgression()
}

/** Variables visibles (point → numéro) ; les épingles suivent les ids. */
function attribuerVariables(page: MiseEnPage): void {
  etat.couleurChoix = new Map()
  etat.epingles = new Set()
  for (const p of page.choix) {
    etat.couleurChoix.set(p, page.boites[p]!.variable)
    if (epinglesIds.has(vue.noeud(p).id)) etat.epingles.add(p)
  }
}

/** Marges de cadrage : les énoncés débordent de leur point d'ancrage ; l'inspecteur occupe la droite. */
function majMarges(): void {
  const W = vue.reglages.lire<number>('largeurCarte')
  vue.margesSures = { gauche: W / 2 + 8, droite: W / 2 + 12 - 150, haut: 84, bas: 40 }
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

// Clic sur une variable : épingler / désépingler sa portée (au lieu de la lignée).
const selectionnerDefaut = vue.selectionner.bind(vue)
vue.selectionner = (p: number | null) => {
  if (p !== null && p < vue.nU && etat.page?.boites[p]?.genre === 'drapeau' && etat.survol?.genre === 'drapeau') {
    basculerEpingle(vue.noeud(p).id)
    return
  }
  selectionnerDefaut(p)
}

function basculerEpingle(id: string): void {
  if (epinglesIds.has(id)) epinglesIds.delete(id)
  else epinglesIds.add(id)
  epinglesIds = new Set(epinglesIds)
  if (etat.page) attribuerVariables(etat.page)
  majPanneau()
  vue.demanderRendu()
}

// ─── Double-clic : déplier une preuve repliée, replier ─────────────────────────

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

// ─── Inspecteur : contexte de but ────────────────────────────────────────────

const inspecteur = el('aside', { class: 'r13-inspecteur', 'aria-label': 'Contexte de but' })
inspecteur.hidden = true
vue.interface.append(inspecteur)

/** Sélectionne l'unité qui contient le nœud i (et la cadre). */
function allerA(i: number): void {
  const q = vue.pointDeNoeud(i)
  if (q === null) return
  selectionnerDefaut(q)
  vue.cadrerSelection()
}

function lienEnonce(i: number, texte?: string): HTMLElement {
  const n = vue.justification.noeuds[i]!
  const q = vue.pointDeNoeud(i)
  return q === null
    ? el('code', { class: 'r13-id' }, texte ?? identifiant(n))
    : el('button', { type: 'button', class: 'r13-id r13-lien', title: n.nom, onclick: () => allerA(i) }, texte ?? identifiant(n))
}

function symboleNoeud(i: number): HTMLElement {
  const n = vue.justification.noeuds[i]!
  const e = etatNoeud(n)
  return el('span', { class: `r13-etat etat-${e}`, title: LIBELLE_ETAT[e] }, e === 'admis' ? motAdmis(n) : SYMBOLE_ETAT[e])
}

function majInspecteur(p: number | null): void {
  if (p === null || !vue.reglages.lire<boolean>('inspecteur') || !etat.page) {
    inspecteur.hidden = true
    return
  }
  const j = vue.justification
  const page = etat.page
  const u = p < vue.nU ? vue.lecture.unites[p] : undefined
  const iC = vue.indexNoeud(p)
  const n = j.noeuds[iC]!
  const b = page.boites[p]!
  const membres = u ? u.membres : [iC]
  const dans = new Set(membres)
  const e = etatUnite(j, membres, iC)

  // Hypothèses du but : prémisses extérieures à l'unité (toutes démonstrations), rôle le plus fort.
  const hyps = new Map<number, RolePremisse>()
  for (const m of membres) for (const k of j.entrantes[m]!) {
    const a = j.aretes[k]!
    if (dans.has(a.source) || j.noeuds[a.source]!.type === 'choix_modelisation') continue
    const ex = hyps.get(a.source)
    if (!ex || FORCE_ROLE[a.role] > FORCE_ROLE[ex]) hyps.set(a.source, a.role)
  }
  const liste = [...hyps].sort((x, y) => FORCE_ROLE[y[1]] - FORCE_ROLE[x[1]] || j.noeuds[x[0]]!.nom.localeCompare(j.noeuds[y[0]]!.nom))

  // Variables : choix de modélisation dont l'énoncé dépend (graphe complet).
  const variables = b.variables.map((k) => {
    const q = page.choix[k - 1]!
    return { k, q, i: vue.indexNoeud(q) }
  })

  const but = el('div', { class: 'r13-but' },
    variables.map(({ k, i }) => el('div', { class: 'r13-ligne' },
      el('span', { class: 'r13-mot' }, 'variable'), ' ',
      el('span', { class: 'r13-nom-hyp' }, `c${indice(k)}`), el('span', { class: 'r13-deux-points' }, ' : '),
      el('span', { class: 'r13-texte' }, j.noeuds[i]!.nom))),
    liste.map(([i, role], k) => el('div', { class: `r13-ligne role-${role}` },
      el('span', { class: 'r13-nom-hyp' }, `h${indice(k + 1)}`), el('span', { class: 'r13-deux-points' }, ' : '),
      lienEnonce(i), ' ', symboleNoeud(i),
      el('span', { class: 'r13-role' }, LIBELLES_ROLE[role].toLowerCase()),
      el('div', { class: 'r13-texte r13-sous' }, j.noeuds[i]!.nom))),
    !variables.length && !liste.length ? el('div', { class: 'r13-vide' }, '(aucune hypothèse)') : null,
    el('div', { class: 'r13-thesee' },
      el('span', { class: 'r13-taquet' }, '⊢'),
      el('div', {}, el('div', { class: 'r13-formule' }, n.enonce || n.nom))),
  )

  const blocs: HTMLElement[] = []
  // Démonstration principale.
  const d = demonstrationPrincipale(n)
  if (d) {
    blocs.push(el('section', {},
      el('h4', {}, 'Démonstration'),
      el('div', { class: 'r13-kv' },
        el('code', {}, d.nom), ' · ', el('span', { class: `r13-validite v-${d.validite}` }, LIBELLES_VALIDITE[d.validite].toLowerCase()),
        el('span', { class: 'r13-doux' }, ` · ${d.auteur} · ${formaterDate(Date.parse(d.cree_le))}`)),
      d.texte ? el('p', { class: 'r13-texte-preuve' }, d.texte.length > 320 ? d.texte.slice(0, 319) + '…' : d.texte) : null,
      n.demonstrations.length > 1 ? el('div', { class: 'r13-doux' }, `${n.demonstrations.length - 1} autre(s) démonstration(s)`) : null,
    ))
  } else {
    blocs.push(el('section', {}, el('h4', {}, 'Démonstration'),
      el('div', { class: 'r13-doux' }, n.admis ? 'Admis : établi hors du projet (axiome, définition, littérature).' : n.type === 'hypothese' ? 'Hypothèse : posée, pas démontrée.' : 'Aucune : laissé ouvert (sorry).')))
  }
  // Preuve repliée : les énoncés internes, dans l'ordre.
  if (membres.length > 1) {
    blocs.push(el('section', {},
      el('h4', {}, `Preuve repliée · ${e.verifies}/${e.total} vérifiés`),
      el('ol', { class: 'r13-etapes' }, membres.map((m) => el('li', {},
        el('span', { class: 'r13-mot' }, m === iC ? 'show' : 'have'), ' ', lienEnonce(m), ' ', symboleNoeud(m),
        el('div', { class: 'r13-texte r13-sous' }, j.noeuds[m]!.nom)))),
      el('div', { class: 'r13-doux' }, 'Double-clic sur l’énoncé pour déplier cette preuve dans le graphe.'),
    ))
  }
  // Décision : branches.
  if (n.decision) {
    const dc = n.decision
    blocs.push(el('section', {},
      el('h4', {}, 'Point de branchement'),
      el('div', { class: 'r13-question' }, dc.question),
      el('ul', { class: 'r13-branches' }, dc.alternatives.map((a) => el('li', { class: a.retenue ? 'retenue' : 'ecartee' },
        el('span', { class: 'r13-marque' }, a.retenue ? '✓' : '✗'), ' ', a.libelle,
        a.raison ? el('div', { class: 'r13-doux' }, a.raison) : null))),
      el('div', { class: 'r13-doux' }, `Raison : ${dc.raison} · ${dc.auteur}, ${formaterDate(Date.parse(dc.date))}`),
    ))
  }
  // Choix de modélisation : la variable et ce qui la porte.
  if (n.choix) {
    const portee = page.portees.get(p) ?? []
    blocs.push(el('section', {},
      el('h4', {}, `variable c${indice(b.variable)}`),
      el('div', {}, n.choix.hypothese),
      el('div', { class: 'r13-doux' }, `Portée déclarée : ${n.choix.portee}`),
      n.choix.alternatives?.length ? el('div', { class: 'r13-doux' }, `Autres modélisations : ${n.choix.alternatives.join(' ; ')}`) : null,
      el('div', {}, `Portée calculée : ${portee.filter((q) => q < vue.nU).length} énoncé(s) visible(s), ${portee.length} au total.`),
      el('button', { type: 'button', class: 'rsn-bouton', onclick: () => basculerEpingle(n.id) }, epinglesIds.has(n.id) ? 'Désépingler la portée' : 'Épingler la portée'),
    ))
  }
  // Utilisé par (graphe complet).
  const usages = [...new Set(j.sortantes[iC]!.map((k) => j.aretes[k]!.cible))].filter((i) => !dans.has(i))
  if (usages.length) {
    blocs.push(el('section', {},
      el('h4', {}, `Utilisé par · ${usages.length}`),
      el('div', { class: 'r13-usages' }, usages.slice(0, 12).map((i) => lienEnonce(i)), usages.length > 12 ? el('span', { class: 'r13-doux' }, ` +${usages.length - 12}`) : null),
    ))
  }

  const sp = vue.jeu.sousProblemes.find((s) => s.id === n.sousProbleme)
  inspecteur.replaceChildren(
    el('header', {},
      el('div', { class: 'r13-entete-ligne' },
        el('code', { class: 'r13-id-principal' }, (membres.length > 1 ? '▸ ' : '') + identifiant(n)),
        el('span', { class: `r13-etat etat-${e.etat}` }, texteEtat(e.etat, n, e.verifies, e.total)),
        el('button', { type: 'button', class: 'r13-fermer', title: 'Fermer (Échap)', 'aria-label': 'Fermer', onclick: () => selectionnerDefaut(null) }, '×')),
      el('div', { class: 'r13-titre' }, n.nom),
      el('div', { class: 'r13-doux' }, [LIBELLES_TYPE[n.type], sp?.nom, n.validation !== 'aucune' ? `validé : ${LIBELLES_VALIDATION[n.validation]}` : null,
        `confiance ${n.confiance.estimation.toFixed(2)} [${n.confiance.bas.toFixed(2)}, ${n.confiance.haut.toFixed(2)}]`].filter(Boolean).join(' · ')),
      n.piste === 'abandonnee' ? el('div', { class: 'r13-abandon' }, 'piste abandonnée') : null,
    ),
    el('h4', {}, 'Contexte de but'),
    but,
    ...blocs,
  )
  inspecteur.hidden = false
}

vue.on('selection', ({ point }) => majInspecteur(point))
vue.on('lecture', () => majInspecteur(null))

// ─── Progression globale ─────────────────────────────────────────────────────

const blocProgression = el('div', { class: 'r13-progression' })
vue.interface.append(blocProgression)

function majProgression(): void {
  const pr = progression(vue.justification)
  const { etats, total } = pr
  const ordre: EtatPreuve[] = ['verifie', 'en_cours', 'a_verifier', 'admis', 'echec']
  const segments = ordre.filter((k) => etats[k] > 0).map((k) =>
    el('span', { class: `r13-seg etat-${k}`, style: `flex:${etats[k]}`, title: `${etats[k]} ${k === 'admis' ? 'sorry' : LIBELLE_ETAT[k]}` }))
  const detail = ordre.filter((k) => k !== 'verifie' && etats[k] > 0).map((k) =>
    el('span', { class: `r13-compte etat-${k}` }, `${k === 'admis' ? 'sorry' : SYMBOLE_ETAT[k]} ${etats[k]}`))
  blocProgression.replaceChildren(
    el('div', { class: 'r13-progression-ligne' },
      el('b', {}, `${etats.verifie}`), el('span', {}, ` / ${total} vérifiés`),
      detail,
      el('span', { class: 'r13-doux' }, `· ${pr.importes} admis`)),
    el('div', { class: 'r13-barre' }, segments),
  )
}

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
  } else if (cle === 'inspecteur') majInspecteur(vue.selection)
  else if (cle === 'strategie') cadrerApres = true
  else if (cle === 'liensComplets') window.setTimeout(() => vue.cadrerTout(), 30)
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
  etat.palette = lirePaletteR13(vue.racine)
})
etat.palette = lirePaletteR13(vue.racine)

// ─── Panneau ☰ ───────────────────────────────────────────────────────────────

function construirePanneau(v: VueRaisonnement): HTMLElement {
  corpsPanneau = el('div', { class: 'r13-panneau' })
  void v
  return corpsPanneau
}

function majPanneau(): void {
  if (!corpsPanneau || !etat.page) return
  const v = vue
  const page = etat.page
  const niveau = niveauDeStrategie(v.strategie.id)
  const compte = { enonces: 0, replies: 0, decisions: 0, variables: 0, contexte: 0 }
  const parEtat: Record<EtatPreuve, number> = { verifie: 0, a_verifier: 0, en_cours: 0, echec: 0, admis: 0 }
  for (let p = 0; p < v.nU; p++) {
    const b = page.boites[p]!
    if (b.genre === 'drapeau') compte.variables++
    else if (b.genre === 'decision') compte.decisions++
    else {
      compte.enonces++
      if ((v.lecture.unites[p]?.membres.length ?? 1) > 1) compte.replies++
      parEtat[b.etat.etat]++
    }
    compte.contexte += b.pastilles.length
  }
  const s = v.lecture.stats
  const boutons = el('div', { class: 'r13-niveaux' }, NIVEAUX.map((n) =>
    el('button', { type: 'button', class: `rsn-bouton${n.id === niveau ? ' actif' : ''}`, onclick: () => definirNiveau(n.id) }, n.nom)))
  const variables = page.choix.map((p) => {
    const n = v.noeud(p)
    const c = el('input', { type: 'checkbox' }) as HTMLInputElement
    c.checked = etat.epingles.has(p)
    c.addEventListener('change', () => basculerEpingle(n.id))
    return el('label', { class: 'r13-variable' }, c,
      el('code', {}, `c${indice(page.boites[p]!.variable)}`),
      el('span', {}, n.nom), el('span', { class: 'rsn-doux' }, ` → ${page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0}`))
  })
  corpsPanneau.replaceChildren(
    el('div', { class: 'rsn-doux rsn-petit' }, 'Niveau de détail'),
    boutons,
    el('div', { class: 'r13-compte-visible' },
      el('div', {}, el('b', {}, `${v.nU}`), ` éléments visibles sur ${s.noeudsComplet} nœuds · ${s.aretes} flèches`),
      el('div', { class: 'rsn-doux' }, `${compte.enonces} énoncés (dont ${compte.replies} preuves repliées), ${compte.decisions} branchements, ${compte.variables} variables`),
      el('div', { class: 'r13-etats-visibles' }, ETATS.filter((k) => parEtat[k]).map((k) =>
        el('span', { class: `r13-compte etat-${k}` }, `${k === 'admis' ? 'admis/sorry' : SYMBOLE_ETAT[k]} ${parEtat[k]}`))),
    ),
    etatSquelette.deplies.size
      ? el('button', { type: 'button', class: 'rsn-bouton', onclick: () => {
          etatSquelette.ouvertes.clear()
          etatSquelette.deplies.clear()
          v.definirStrategie(v.strategie)
        } }, `Tout replier (${etatSquelette.deplies.size})`)
      : el('div', { class: 'rsn-doux rsn-petit' }, 'Double-clic sur un énoncé marqué ▸ pour déplier sa preuve sur place.'),
    el('div', { class: 'rsn-groupe-titre' }, 'Variables de section (épingler la portée)'),
    el('div', { class: 'r13-liste-variables' }, variables),
    el('div', { class: 'rsn-groupe-titre' }, 'Lire un énoncé'),
    el('div', { class: 'r13-legende' },
      el('div', { class: 'r13-legende-etats' }, ETATS.map((k) => el('div', { class: 'r13-legende-etat' },
        el('span', { class: `r13-echantillon etat-${k}` }), el('code', { class: `r13-etat etat-${k}` }, k === 'admis' ? 'sorry' : SYMBOLE_ETAT[k]), ` ${LIBELLE_ETAT[k]}`))),
      el('div', {}, el('b', {}, 'Double cadre'), ' : résultat principal. ', el('b', {}, '▸ n/m'), ' : preuve repliée, énoncés vérifiés.'),
      el('div', {}, el('b', {}, 'H / IA / IA+H'), ' : validé par. Filet du bas : intervalle de confiance.'),
      el('div', {}, el('b', {}, '[c₁ c₃]'), ' : variables (choix de modélisation) dont l’énoncé dépend.'),
      el('div', {}, el('b', {}, 'Losange au trait'), ' : point de branchement ; ✗ en pointillé : branche écartée.'),
      el('div', {}, el('b', {}, 'H D O A L +'), ' : contexte (hypothèse, définition, outil, axiome, littérature, auxiliaire). ', el('b', {}, '(k)'), ' : renvoi.'),
      el('div', {}, 'Clic : contexte de but dans l’inspecteur (h₁ : … ⊢ énoncé).'),
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
;(window as unknown as { rsnVue: typeof vue; r13: EtatRendu }).rsnVue = vue
;(window as unknown as { r13: EtatRendu }).r13 = etat
