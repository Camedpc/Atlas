// R32 · LaTeX · arbre de preuve : le raisonnement composé comme en déduction naturelle (`bussproofs`).
//
// - Dérivation reprise de R14 (squelette.ts) : contexte rattaché, élagage, réduction transitive, repli
//   des sous-arguments exclusifs (double trait ; double-clic pour ouvrir).
// - Arbres (arbre.ts) : une règle d'inférence par unité de lecture ; lemmes partagés numérotés et cités
//   par renvoi « ⋮ (k) » ; choix de modélisation en feuilles [Hₖ]ᵏ déchargées à la racine des résultats.
// - Rendu (rendu.ts) : feuille HTML (KaTeX, Latin Modern) transformée pour suivre la caméra 2D.
// - Formules (formules.ts) : extraction générique depuis les énoncés, conversion Unicode → LaTeX.

import {
  coucheDe, creerVueRaisonnement, el, type Disposition, type ReducteurAreteR, type ReducteurPoint, type VueRaisonnement,
} from '../../src/raisonnement'
import { construireArbres } from './arbre'
import { htmlFormule } from './formules'
import { jeuFontaine } from './jeu-fontaine'
import meta from './meta.json'
import {
  cibleSous, construireFeuille, creerEtat, ECHELLE, formuleDe, majEtats, majTransformation, noeudDe, nomRegle, type EtatRendu,
} from './rendu'
import { etatSquelette, NIVEAUX, niveauDeStrategie, STRATEGIE_NIVEAU, type Niveau } from './squelette'

// État de la vision (déclaré avant la vue : ses rappels servent dès la construction).
let etat: EtatRendu | null = null
let corpsPanneau: HTMLElement | null = null
let cadrerApres = true
let epinglesIds = new Set<string>()

// ─── Réducteurs : sigma ne dessine plus les unités en 2D ─────────────────────

const reducteurPoint: ReducteurPoint = (info, a, vue) => {
  // 3D : la feuille s'efface, les points de la vue commune prennent le relais.
  if (vue.extrusion > 0.02) {
    a.libelle = info.noeud.nom
    return
  }
  // Masqués (contexte pur) : dessinés par sigma quand les liens complets sont affichés.
  if (info.point >= vue.nU) return
  a.taille = 0.01
  a.libelle = null
  a.forceLibelle = false
  a.surligne = false
}

const reducteurArete: ReducteurAreteR = (info, a, vue) => {
  // En 2D, les liens de lecture sont les traits d'inférence des arbres.
  if (info.genre === 'lecture' && vue.extrusion < 0.02) a.cache = true
}

// ─── Jeu de données ──────────────────────────────────────────────────────────
// Fontaine de chaîne par défaut ; ?jeu=edp pour le jeu synthétique.

const JEUX = { fontaine: 'Fontaine de chaîne', edp: 'EDP stochastique (synthétique)' } as const
type Jeu = keyof typeof JEUX
const jeuChoisi: Jeu = new URLSearchParams(location.search).get('jeu') === 'edp' ? 'edp' : 'fontaine'

// ─── Vue ─────────────────────────────────────────────────────────────────────

const D = 'Arbre de preuve R32'
const vue = creerVueRaisonnement(document.getElementById('app')!, {
  id: jeuChoisi === 'fontaine' ? meta.id : `${meta.id}-${jeuChoisi}`,
  jeu: jeuChoisi === 'fontaine' ? jeuFontaine() : undefined,
  mode: '2d',
  strategie: STRATEGIE_NIVEAU.squelette,
  reglages: {
    ajusterAspect: false,
    pastillesContexte: false,
    liensSemantiques: false,
    opaciteContexte: 0.22,
    opaciteLiensComplets: 0.22,
  },
  reglagesSupplementaires: [
    { cle: 'niveau', defaut: 'squelette', dossier: D, libelle: 'niveau de détail', options: Object.fromEntries(NIVEAUX.map((n) => [n.nom, n.id])) },
    { cle: 'taillePolice', defaut: 15, dossier: D, libelle: 'corps (px)', min: 10, max: 22, pas: 0.5 },
    { cle: 'ecartPremisses', defaut: 22, dossier: D, libelle: 'écart prémisses', min: 8, max: 60, pas: 1 },
    { cle: 'ecartDerivations', defaut: 72, dossier: D, libelle: 'écart dérivations', min: 24, max: 200, pas: 2 },
    { cle: 'largeurPage', defaut: 1500, dossier: D, libelle: 'largeur de page', min: 500, max: 8000, pas: 50 },
    { cle: 'seuilLemme', defaut: 2, dossier: D, libelle: 'lemme cité dès (règles)', min: 1, max: 8, pas: 1 },
    { cle: 'largeurListe', defaut: 300, dossier: D, libelle: 'largeur hypothèses', min: 200, max: 480, pas: 10 },
    { cle: 'exposants', defaut: true, dossier: D, libelle: 'confiance en exposant' },
  ],
  reducteursNoeud: [reducteurPoint],
  reducteursArete: [reducteurArete],
  rendreFiche: (p, v, defaut) => {
    const f = defaut()
    const aide = f.querySelector('.rsn-aide')
    const u = p < v.nU ? v.lecture.unites[p] : undefined
    const n = v.noeud(p)
    const a = etat?.arbres
    let texte = 'Clic : lignée · double-clic : cadrer · Échap : effacer'
    if (n.type === 'choix_modelisation') texte = 'Survol : énoncés qui en dépendent · clic : épingler'
    else if (u && u.membres.length > 1) texte = `Double-clic : déplier les ${u.membres.length} étapes (double trait) · clic : lignée`
    else if (u && dansDeplie(v, p)) texte = 'Double-clic : replier · clic : lignée'
    else if (!u) texte = 'Contexte : clic pour voir les énoncés qui l’utilisent'
    if (aide) aide.textContent = texte
    const bandeau = (t: string) => f.prepend(el('div', { class: 'r32-fiche-bandeau' }, t))
    const sv = etat?.survol
    if (a && p < v.nU) {
      if (sv?.genre === 'renvoi') {
        const k = a.renvois.get(p)?.length ?? 0
        bandeau(`Renvoi à la dérivation (${a.numeroDe.get(p)}) · citée ${k} fois`)
      } else if (a.indiceDe.has(p)) {
        const h = a.hypotheses.find((x) => x.point === p)
        const k = h?.portee.length ?? 0
        bandeau(`[H${a.indiceDe.get(p)}] hypothèse de modélisation · ${k} énoncé${k > 1 ? 's' : ''} en dépend${k > 1 ? 'ent' : ''}`)
      } else {
        const statut = n.piste === 'abandonnee' ? 'pointillé : piste abandonnée' : n.statut === 'valide' ? 'trait plein : validé' : n.statut === 'incertain' ? 'trait tireté : à vérifier' : 'trait barré : réfuté'
        const num = a.numeroDe.get(p)
        bandeau(`${num ? `(${num}) · ` : ''}${nomRegle(v, p)} · ${statut}`)
      }
      const fo = formuleDe(n)
      if (fo) {
        const e = el('div', { class: 'r32-fiche-formule' })
        e.innerHTML = htmlFormule(fo)
        f.querySelector('.r32-fiche-bandeau')?.after(e)
      }
    }
    return f
  },
  panneau: (p, v) => p.ajouterSection('r32', 'Arbre de preuve', construirePanneau(v), { position: 'lecture' }),
})

// Pastilles et liens sémantiques par défaut : remplacés par la composition des arbres.
vue.dessinsDessus.splice(0, 2)
etat = creerEtat(vue)
const E = etat

// ─── Mise en page ────────────────────────────────────────────────────────────

const appliquerDisposition = (d: Disposition, anime: boolean) =>
  (vue as unknown as { appliquerDisposition(d: Disposition, anime: boolean): void }).appliquerDisposition(d, anime)

function recalculer(): void {
  const R = vue.reglages
  const g = vue.lecture
  const a = construireArbres(g, R.lire<number>('seuilLemme'))
  E.arbres = a
  E.survol = null
  const { xs, ys } = construireFeuille(vue, E, a, {
    taillePolice: R.lire<number>('taillePolice'),
    ecart: R.lire<number>('ecartPremisses'),
    ecartDerivations: R.lire<number>('ecartDerivations'),
    largeurPage: R.lire<number>('largeurPage'),
    largeurListe: R.lire<number>('largeurListe'),
    exposants: R.lire<boolean>('exposants'),
  })
  const page = E.page!
  const b = page.bornes
  E.cx = b.x + b.w / 2
  E.cy = b.y + b.h / 2
  const nU = g.unites.length, nP = nU + g.masques.length
  const x = new Float32Array(nP), z = new Float32Array(nP), yCouche = new Float32Array(nP)
  const couche = new Int8Array(nP), rang = new Int32Array(nP)
  const numeroDe = new Map<number, number>()
  for (const d of a.derivations) {
    const marquer = (e: typeof d.racine) => {
      if (e.genre === 'regle' && !numeroDe.has(e.point)) numeroDe.set(e.point, d.numero)
      for (const q of e.premisses) marquer(q)
    }
    marquer(d.racine)
  }
  let wx0 = Infinity, wx1 = -Infinity, wz0 = Infinity, wz1 = -Infinity
  for (let p = 0; p < nP; p++) {
    x[p] = (xs[p]! - E.cx) * ECHELLE
    z[p] = -(ys[p]! - E.cy) * ECHELLE
    couche[p] = coucheDe(noeudDe(vue, p).type)
    yCouche[p] = (couche[p]! - 3) * vue.reglages.valeurs.ecartCouches
    rang[p] = numeroDe.get(p) ?? 0
    if (p < nU) {
      wx0 = Math.min(wx0, x[p]!); wx1 = Math.max(wx1, x[p]!)
      wz0 = Math.min(wz0, z[p]!); wz1 = Math.max(wz1, z[p]!)
    }
  }
  if (!Number.isFinite(wx0)) wx0 = wx1 = wz0 = wz1 = 0
  const disposition: Disposition = {
    moteur: 'dagre', nU, masques: g.masques, x, z, yCouche, couche, rang,
    xRangs: a.derivations.map((d) => (d.boite.x + d.boite.w / 2 - E.cx) * ECHELLE),
    xContexte: g.masques.length ? x[nU]! : NaN,
    bornes: { xmin: wx0, xmax: wx1, zmin: wz0, zmax: wz1 },
  }
  E.transformation = { ox: 0, oy: 0, s: 0 }
  attribuerEpingles()
  vue.margesSures = { gauche: 30, droite: -90, haut: 80, bas: 70 }
  appliquerDisposition(disposition, false)
  majTransformation(vue, E)
  majEtats(vue, E)
  if (cadrerApres) {
    cadrerApres = false
    vue.cadrerTout(1)
  }
  majPanneau()
}

/** Épingles : elles suivent les ids de nœuds d'une dérivation à l'autre. */
function attribuerEpingles(): void {
  E.epingles = new Set()
  for (const h of E.arbres?.hypotheses ?? []) if (epinglesIds.has(noeudDe(vue, h.point).id)) E.epingles.add(h.point)
}

// La vue appelle `redisposer` à chaque nouvelle dérivation ou réglage de disposition.
vue.redisposer = async () => recalculer()

// Suivi de la caméra : la feuille est retransformée à chaque image.
vue.on('image', () => majTransformation(vue, E))
vue.on('survol', () => majEtats(vue, E))
vue.on('selection', () => majEtats(vue, E))

// ─── Survol et clic ──────────────────────────────────────────────────────────

const pointSousDefaut = vue.pointSous.bind(vue)
vue.pointSous = (x: number, y: number, marge?: number) => {
  if (vue.extrusion > 0.3) return pointSousDefaut(x, y, marge)
  const c = cibleSous(E, x, y)
  const avant = E.survol
  E.survol = c
  if (avant?.genre !== c?.genre || avant?.point !== c?.point) majEtats(vue, E)
  return c ? c.point : null
}

// Clic sur une hypothèse (feuille ou liste) : épingler / désépingler (au lieu de la lignée).
const selectionnerDefaut = vue.selectionner.bind(vue)
vue.selectionner = (p: number | null) => {
  const g = E.survol?.genre
  if (p !== null && (g === 'hypothese' || g === 'entree') && E.arbres?.indiceDe.has(p)) {
    basculerEpingle(vue.noeud(p).id)
    return
  }
  selectionnerDefaut(p)
}

function basculerEpingle(id: string, voulu?: boolean): void {
  const actif = voulu ?? !epinglesIds.has(id)
  epinglesIds = new Set(epinglesIds)
  if (actif) epinglesIds.add(id)
  else epinglesIds.delete(id)
  attribuerEpingles()
  majEtats(vue, E)
  majPanneau()
}

// ─── Double-clic : déplier une étape repliée (double trait), la replier ──────

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
  if (p < vue.nU && E.survol?.genre === 'regle') {
    const u = vue.lecture.unites[p]!
    if (u.membres.length > 1) return deplier(p)
    const tete = dansDeplie(vue, p)
    if (tete) {
      replier(tete)
      vue.definirStrategie(vue.strategie)
      return
    }
  }
  selectionnerDefaut(p)
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
  else if (['taillePolice', 'ecartPremisses', 'ecartDerivations', 'largeurPage', 'seuilLemme', 'largeurListe', 'exposants', 'ecartCouches'].includes(cle)) {
    cadrerApres = cle !== 'exposants'
    recalculer()
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

// ─── Panneau ☰ ───────────────────────────────────────────────────────────────

function construirePanneau(v: VueRaisonnement): HTMLElement {
  corpsPanneau = el('div', { class: 'r32-panneau' })
  void v
  return corpsPanneau
}

function majPanneau(): void {
  const a = E.arbres
  if (!corpsPanneau || !a) return
  const v = vue
  const niveau = niveauDeStrategie(v.strategie.id)
  const s = v.lecture.stats
  const boutons = el('div', { class: 'r32-niveaux' }, NIVEAUX.map((n) =>
    el('button', { type: 'button', class: `rsn-bouton${n.id === niveau ? ' actif' : ''}`, onclick: () => definirNiveau(n.id) }, n.nom)))
  const ligne = (k: string, val: string | number) => el('div', { class: 'r32-ligne' }, el('span', {}, k), el('span', { class: 'r32-valeur' }, String(val)))
  const hyps = a.hypotheses.map((h) => {
    const n = noeudDe(v, h.point)
    const c = el('input', { type: 'checkbox' }) as HTMLInputElement
    c.checked = E.epingles.has(h.point)
    c.addEventListener('change', () => basculerEpingle(n.id, c.checked))
    const marque = el('span', { class: 'r32-marque-panneau' })
    marque.innerHTML = htmlFormule(`[H_{${h.indice}}]^{${h.indice}}`)
    return el('label', { class: 'r32-hyp-panneau' }, c, marque, el('span', { class: 'r32-hyp-panneau-nom' }, n.nom), el('span', { class: 'r32-valeur' }, `→${h.portee.length}`))
  })
  const exemple = (classe: string) => el('span', { class: `r32-exemple ${classe}` })
  corpsPanneau.replaceChildren(
    el('div', { class: 'rsn-doux rsn-petit' }, 'Niveau de détail'),
    boutons,
    el('div', { class: 'r32-nomenclature' },
      ligne('Unités affichées / nœuds', `${v.nU} / ${s.noeudsComplet}`),
      ligne('Règles · recopiées', `${a.stats.regles} · ${a.stats.copies}`),
      ligne('Dérivations · lemmes cités', `${a.stats.derivations} · ${a.stats.lemmes}`),
      ligne('Renvois ⋮ (k)', a.stats.renvois),
      ligne('Feuilles [H] · hypothèses', `${a.stats.feuillesHyp} · ${a.hypotheses.length}`),
    ),
    etatSquelette.deplies.size
      ? el('button', { type: 'button', class: 'rsn-bouton', onclick: () => {
          etatSquelette.ouvertes.clear()
          etatSquelette.deplies.clear()
          v.definirStrategie(v.strategie)
        } }, `Replier les étapes dépliées (${etatSquelette.deplies.size})`)
      : el('div', { class: 'rsn-doux rsn-petit' }, 'Double-clic sur une règle à double trait pour déplier ses étapes.'),
    el('div', { class: 'rsn-groupe-titre' }, 'Hypothèses de modélisation (épingler)'),
    el('div', { class: 'r32-liste-hyp' }, hyps),
    el('div', { class: 'rsn-groupe-titre' }, 'Légende'),
    el('div', { class: 'r32-legende-panneau' },
      el('div', {}, exemple('plein'), el('b', {}, 'Trait plein'), ' : validé'),
      el('div', {}, exemple('tirete'), el('b', {}, 'Tireté'), ' : à vérifier'),
      el('div', {}, exemple('refute'), el('b', {}, 'Barré'), ' : réfuté'),
      el('div', {}, exemple('double'), el('b', {}, 'Double trait'), ' : étapes repliées (×n)'),
      el('div', {}, exemple('abandon'), el('b', {}, 'Pointillé gris'), ' : piste abandonnée'),
      el('div', {}, el('b', {}, 'Étiquette'), ' : nom de la règle en petites capitales ; exposant = confiance (? à vérifier, † réfuté), indice = validation (H, IA, IA+H).'),
      el('div', {}, el('b', {}, '⋮ (k)'), ' : renvoi à la dérivation numérotée (k).'),
      el('div', {}, el('b', {}, '[Hₖ]ᵏ'), ' : hypothèse de modélisation ; l’indice en exposant à gauche d’un trait marque sa décharge.'),
    ),
  )
}

// ─── Démarrage ───────────────────────────────────────────────────────────────

{
  const n = vue.reglages.lire<string>('niveau') as Niveau
  if (STRATEGIE_NIVEAU[n] && vue.strategie.id !== STRATEGIE_NIVEAU[n]) vue.definirStrategie(STRATEGIE_NIVEAU[n])
  else recalculer()
}

// Les polices (Latin Modern, KaTeX) changent les mesures : nouvelle mise en page une fois chargées.
{
  let minuterie = 0
  const relancer = () => {
    clearTimeout(minuterie)
    minuterie = window.setTimeout(() => recalculer(), 60)
  }
  void document.fonts.ready.then(relancer)
  document.fonts.addEventListener('loadingdone', relancer)
}

// Convention : le script de capture lit window.rsnVue.
;(window as unknown as { rsnVue: typeof vue; r32: EtatRendu }).rsnVue = vue
;(window as unknown as { r32: EtatRendu }).r32 = E

// Sélecteur de jeu, sous le lien vers le catalogue.
{
  const choix = el('select', { class: 'r32-jeu-choix', 'aria-label': 'Raisonnement affiché' }) as HTMLSelectElement
  for (const [cle, libelle] of Object.entries(JEUX)) choix.append(new Option(libelle, cle, false, cle === jeuChoisi))
  choix.addEventListener('change', () => {
    const url = new URL(location.href)
    if (choix.value === 'fontaine') url.searchParams.delete('jeu')
    else url.searchParams.set('jeu', choix.value)
    location.href = url.toString()
  })
  document.body.append(el('label', { class: 'r32-jeu' }, el('span', {}, 'Jeu'), choix))
}
