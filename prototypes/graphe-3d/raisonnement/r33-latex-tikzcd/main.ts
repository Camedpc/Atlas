// R33 · LaTeX · diagramme tikz-cd : le squelette déductif de R14 composé comme un diagramme commutatif.
//
// - Dérivation reprise de R14 / R1 (squelette.ts) : contexte hors des flèches, élagage vers les résultats
//   majeurs, réduction transitive, sous-arguments repliés (double-clic : ouvrir sur place).
// - Plus aucune boîte : chaque nœud est sa formule (extraite de l'énoncé, formules.ts) ou son nom en
//   romain, posé sur une matrice de rangs et de lignes (mise-en-page.ts).
// - Chaque démonstration est une flèche étiquetée : nom de l'argument au-dessus, repères des prémisses
//   non tracées au-dessous (contenu.ts) ; → ⇒ ⇢ ↛ selon la validité (rendu.ts).
// - Légende « où : » à gauche (prémisses citées, choix de modélisation), légende de figure en bas,
//   fiche détaillée au clic (fiche.ts), source tikz-cd exportable (tikz.ts).

import {
  creerVueRaisonnement, el, type Disposition, type ReducteurAreteR, type ReducteurPoint, type VueRaisonnement,
} from '../../src/raisonnement'
import { construireContenu, type Contenu } from './contenu'
import { ficheArete, ficheNoeud, ficheTalon } from './fiche'
import { formuleDuNoeud } from './formules'
import { jeuFontaine } from './jeu-fontaine'
import meta from './meta.json'
import { mettreEnPage } from './mise-en-page'
import { cibleSous, dessiner, liensSemantiques, lirePalette, memeCible, type EtatRendu, type Typo } from './rendu'
import { etatSquelette, NIVEAUX, niveauDeStrategie, STRATEGIE_NIVEAU, type Niveau } from './squelette'
import { sourceTikzcd } from './tikz'
import { chargerKatex, rendreTex, typographiePrete } from './typo'

void chargerKatex()

const etat: EtatRendu = {
  page: null,
  contenu: null,
  typo: null,
  palette: { encre: '#111111', gris: '#6b6f76', surface: '#ffffff' },
  survol: null,
  boites: [],
  fleches: [],
}

let corpsPanneau: HTMLElement | null = null
let cadrerApres = true
const souris = { x: 0, y: 0 }

// ─── Réducteurs : sigma ne dessine rien, la typographie est sur le calque HTML ─

const reducteurPoint: ReducteurPoint = (_info, a) => {
  a.taille = 0.01
  a.libelle = null
  a.forceLibelle = false
  a.surligne = false
}

const reducteurArete: ReducteurAreteR = (info, a) => {
  if (info.genre === 'lecture') a.cache = true
}

// ─── Jeu de données : la fontaine par défaut ─────────────────────────────────

const JEUX = { fontaine: 'Fontaine de chaîne', edp: 'EDP stochastique (synthétique)' } as const
type Jeu = keyof typeof JEUX
const jeuChoisi: Jeu = new URLSearchParams(location.search).get('jeu') === 'edp' ? 'edp' : 'fontaine'

// ─── Vue ─────────────────────────────────────────────────────────────────────

const D = 'Diagramme R33'
const vue = creerVueRaisonnement(document.getElementById('app')!, {
  id: jeuChoisi === 'fontaine' ? meta.id : `${meta.id}-${jeuChoisi}`,
  jeu: jeuChoisi === 'fontaine' ? jeuFontaine() : undefined,
  mode: '2d',
  strategie: STRATEGIE_NIVEAU.squelette,
  ui: { fiche: false },
  reglages: {
    ajusterAspect: false,
    pastillesContexte: false,
    liensSemantiques: true,
    opaciteContexte: 0.18,
    opaciteLiensComplets: 0.2,
  },
  reglagesSupplementaires: [
    { cle: 'niveau', defaut: 'squelette', dossier: D, libelle: 'niveau de détail', options: Object.fromEntries(NIVEAUX.map((n) => [n.nom, n.id])) },
    { cle: 'taille', defaut: 15, dossier: D, libelle: 'corps (px)', min: 10, max: 22, pas: 0.5 },
    { cle: 'ecartColonnes', defaut: 54, dossier: D, libelle: 'column sep', min: 24, max: 200, pas: 2 },
    { cle: 'ecartLignes', defaut: 58, dossier: D, libelle: 'row sep (pas)', min: 30, max: 140, pas: 2 },
    { cle: 'etiquettes', defaut: true, dossier: D, libelle: 'étiquettes de flèches' },
    { cle: 'legende', defaut: true, dossier: D, libelle: 'légende « où : »' },
    { cle: 'figure', defaut: true, dossier: D, libelle: 'légende de figure' },
  ],
  reducteursNoeud: [reducteurPoint],
  reducteursArete: [reducteurArete],
  dessinerDessous: (c) => dessiner(c, etat),
  panneau: (p, v) => p.ajouterSection('r33', 'Diagramme tikz-cd', construirePanneau(v), { position: 'lecture' }),
})

// Pastilles, liens sémantiques et en-tête du contexte par défaut : remplacés par ceux de la vision.
vue.dessinsDessus.splice(0, 3)

// Calque typographique : entre la scène (canvas) et l'interface (fiche, panneau).
const calque = el('div', { class: 'r33-calque', 'aria-hidden': 'true' })
vue.racine.insertBefore(calque, vue.interface)

// Fiche au clic.
const fiche = el('div', { class: 'r33-fiche', role: 'dialog', hidden: '' })
vue.interface.append(fiche)

// ─── Typographie : éléments HTML mesurés avant la mise en page ───────────────

function bloc(classe: string, ...enfants: (Node | string | null)[]): HTMLElement {
  const e = el('div', { class: `r33-el ${classe}` }, ...enfants)
  calque.append(e)
  return e
}

function formule(tex: string, classe = ''): HTMLElement {
  const s = el('span', { class: `r33-math ${classe}` })
  rendreTex(s, tex)
  return s
}

/** Unités rangées dans la légende : choix de modélisation sans aucune flèche de lecture. */
function dansLegende(p: number): boolean {
  const g = vue.lecture
  return g.justification.noeuds[g.unites[p]!.conclusion]!.type === 'choix_modelisation' && !g.entrantes[p]!.length && !g.sortantes[p]!.length
}

function construireTypo(c: Contenu): Typo {
  calque.replaceChildren()
  const g = vue.lecture
  const j = g.justification
  const R = vue.reglages
  calque.style.setProperty('--r33-corps', `${R.lire<number>('taille')}px`)
  const typo: Typo = {
    calque, unites: [], legende: new Map(), dessus: new Map(), dessous: new Map(), talons: new Map(),
    rejetees: new Map(), figure: null, liens: [], tailles: new Map(),
  }
  // Nœuds : formule, sinon nom en romain ; décisions en petites capitales ; résultats en gras.
  g.unites.forEach((u, p) => {
    if (dansLegende(p)) return typo.unites.push(null)
    const n = j.noeuds[u.conclusion]!
    const f = c.formules[p]
    const majeur = (n.type === 'theoreme' || n.type === 'resultat') && !n.admis
    const classes = ['r33-noeud', n.type === 'decision' ? 'decision' : '', majeur ? 'majeur' : '', n.piste === 'abandonnee' ? 'abandon' : '', n.statut === 'refute' ? 'refute' : ''].join(' ')
    let contenu: HTMLElement
    if (n.type === 'decision') contenu = el('span', { class: 'r33-nom r33-sc' }, n.nom)
    else if (f) contenu = formule(majeur ? `\\boldsymbol{${f}}` : f)
    else contenu = el('span', { class: 'r33-nom' }, n.nom)
    const replie = u.membres.length > 1 ? el('sup', { class: 'r33-replie', title: 'Argument replié' }, `[${u.membres.length}]`) : null
    typo.unites.push(bloc(classes, contenu, replie))
  })
  // Légende « où : ».
  if (R.lire<boolean>('legende') && c.legende.length) {
    typo.legende.set('titre', bloc('r33-legende-titre', 'où :'))
    for (const i of c.legende) {
      const n = j.noeuds[i]!
      const fo = formuleDuNoeud(n)
      typo.legende.set(i, bloc(`r33-entree${n.piste === 'abandonnee' ? ' abandon' : ''}`,
        el('span', { class: 'r33-rep' }, `(${c.reperes.get(i)})`),
        el('span', { class: 'r33-entree-texte' }, n.nom, fo ? el('span', {}, ' : ', formule(fo)) : null)))
    }
  }
  // Étiquettes de flèches.
  if (R.lire<boolean>('etiquettes')) {
    c.aretes.forEach((a, k) => {
      if (a.dessus) typo.dessus.set(k, bloc('r33-etiq', a.dessus))
      if (a.dessous.length) typo.dessous.set(k, bloc('r33-etiq r33-reperes', a.dessous.map((i) => c.reperes.get(i)).join(', ')))
    })
  }
  // Talons des racines : les repères y sont la source de la flèche (toujours affichés).
  for (const [u, t] of c.talons) {
    typo.talons.set(u, {
      reperes: bloc('r33-etiq r33-reperes r33-talon', t.dessous.map((i) => c.reperes.get(i)).join(', ')),
      dessus: t.dessus && R.lire<boolean>('etiquettes') ? bloc('r33-etiq', t.dessus) : null,
    })
  }
  for (const [u, alt] of c.rejetees) typo.rejetees.set(u, bloc('r33-etiq r33-rejetees', ...alt.map((x) => el('div', {}, x))))
  for (const l of liensSemantiques(vue)) {
    const texte = l.genre === 'contredit' ? 'contredit' : l.genre === 'resout' ? 'résout' : l.genre === 'abandonne' ? 'abandonne' : 'remplace'
    typo.liens.push(bloc('r33-etiq r33-lien', texte))
  }
  if (R.lire<boolean>('figure')) {
    const s = g.stats
    const niveau = NIVEAUX.find((n) => n.id === niveauDeStrategie(vue.strategie.id))?.nom ?? vue.strategie.nom
    typo.figure = bloc('r33-figure', el('b', {}, 'Figure 1. '), `${vue.jeu.titre}. `,
      `Diagramme de lecture au niveau « ${niveau} » : ${s.unites} énoncés sur ${s.noeudsComplet}, ${s.aretes} démonstrations tracées sur ${s.aretesComplet} arêtes de justification. `,
      'Au-dessus des flèches, l’argument ; au-dessous, les prémisses non tracées (voir « où : »). ',
      formule('\\to'), ' valide, ', formule('\\Rightarrow'), ' implication vers un résultat, ', formule('\\dashrightarrow'), ' à vérifier, ', formule('\\nrightarrow'), ' réfutée.')
  }
  // Mesure (échelle 1, une seule mise en page du navigateur).
  const els = [...calque.children] as HTMLElement[]
  for (const e of els) {
    const r = { w: e.offsetWidth, h: e.offsetHeight }
    typo.tailles.set(e, r)
  }
  return typo
}

const taille = (e: HTMLElement | null | undefined) => (e ? etat.typo?.tailles.get(e) ?? { w: 0, h: 0 } : { w: 0, h: 0 })

// ─── Mise en page ────────────────────────────────────────────────────────────

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
  const contenu = construireContenu(vue.lecture)
  etat.contenu = contenu
  const typo = construireTypo(contenu)
  etat.typo = typo
  const talon = (u: number) => {
    const t = typo.talons.get(u)
    if (!t) return 0
    return Math.max(taille(t.reperes).w + 34, taille(t.dessus).w)
  }
  const { disposition, page } = mettreEnPage(vue.lecture, {
    ecartColonnes: R.lire<number>('ecartColonnes'),
    ecartLignes: R.lire<number>('ecartLignes'),
    tailleUnite: (p) => taille(typo.unites[p]),
    reserveSous: (p) => (typo.rejetees.has(p) ? 26 + taille(typo.rejetees.get(p)).h : 0),
    largeurEtiquette: (a) => Math.max(taille(typo.dessus.get(a)).w, taille(typo.dessous.get(a)).w),
    largeurTalon: talon,
    dansLegende,
    legende: [...typo.legende].map(([cle, e]) => ({ cle, ...taille(e) })),
    figure: { w: 620, h: taille(typo.figure).h },
    precedent: anime ? positionsPrecedentes() : undefined,
  })
  // La légende de figure prend la largeur du diagramme (au plus 620 px) : re-mesurée à cette largeur.
  if (typo.figure) {
    const haut = page.figure.y - taille(typo.figure).h / 2
    typo.figure.style.width = `${page.figure.w}px`
    const t = { w: typo.figure.offsetWidth, h: typo.figure.offsetHeight }
    typo.tailles.set(typo.figure, t)
    page.figure.y = haut + t.h / 2
    page.bornes.y1 = Math.max(page.bornes.y1, haut + t.h)
  }
  etat.page = page
  etat.survol = null
  vue.margesSures = { gauche: 16, droite: -130, haut: 24, bas: 16 }
  appliquerDisposition(disposition, anime)
  if (cadrerApres) {
    cadrerApres = false
    vue.cadrerTout(anime ? undefined : 1)
  }
  majPanneau()
}

vue.redisposer = async () => recalculer(true)

// Cadrage 2D sur toute la feuille (légende « où : » et légende de figure comprises).
const cadrerToutDefaut = vue.cadrerTout.bind(vue)
vue.cadrerTout = (duree?: number) => {
  const page = etat.page
  if (!page || vue.mode !== '2d') return cadrerToutDefaut(duree)
  const b = page.bornes
  const E = page.echelle
  const pos = new Float32Array(12)
  const coins: [number, number][] = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]
  coins.forEach(([x, y], k) => {
    pos[k * 3] = (x - page.cx) * E
    pos[k * 3 + 2] = -(y - page.cy) * E
  })
  vue.camera.cadrer(pos, [0, 1, 2, 3], duree ?? vue.reglages.valeurs.dureeTransition, 1.04, vue.zoneSure())
  vue.demanderRendu()
}

// ─── Survol et clic ──────────────────────────────────────────────────────────

vue.pointSous = (x: number, y: number) => {
  const c = cibleSous(etat, x, y)
  if (!memeCible(c, etat.survol)) {
    etat.survol = c
    vue.demanderRendu()
  }
  if (!c) return null
  if (c.genre === 'noeud') return c.point
  if (c.genre === 'legende') return vue.pointDeNoeud(c.noeud)
  return null
}

vue.scene.addEventListener('pointermove', (e) => {
  const r = vue.racine.getBoundingClientRect()
  souris.x = e.clientX - r.left
  souris.y = e.clientY - r.top
  vue.scene.style.cursor = etat.survol ? 'pointer' : ''
})

function ouvrirFiche(contenu: HTMLElement): void {
  const fermer = el('button', { type: 'button', class: 'r33-fiche-fermer', 'aria-label': 'Fermer', onclick: () => fermerFiche() }, '×')
  fiche.replaceChildren(fermer, contenu)
  fiche.hidden = false
  const W = vue.racine.clientWidth, H = vue.racine.clientHeight
  const r = fiche.getBoundingClientRect()
  let x = souris.x + 18, y = souris.y - 20
  if (x + r.width > W - 12) x = souris.x - r.width - 18
  if (y + r.height > H - 12) y = H - r.height - 12
  fiche.style.left = `${Math.max(12, x)}px`
  fiche.style.top = `${Math.max(56, y)}px`
}

function fermerFiche(): void {
  fiche.hidden = true
}

const selectionnerDefaut = vue.selectionner.bind(vue)
vue.selectionner = (p: number | null) => {
  const s = etat.survol
  const c = etat.contenu
  if (c && s?.genre === 'arete') return ouvrirFiche(ficheArete(vue, c, s.arete))
  if (c && s?.genre === 'talon') return ouvrirFiche(ficheTalon(vue, c, s.unite))
  if (c && s?.genre === 'legende') {
    ouvrirFiche(ficheNoeud(vue, c, s.noeud))
    if (p !== null) selectionnerDefaut(p)
    return
  }
  selectionnerDefaut(p)
  if (p === null || !c) fermerFiche()
  else ouvrirFiche(ficheNoeud(vue, c, vue.indexNoeud(p)))
}

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  etat.survol = null
  fermerFiche()
}, true)

// ─── Double-clic : ouvrir un argument replié sur place, le refermer ──────────

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
    if (!etat.survol) vue.cadrerTout()
    return
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
  else if (['taille', 'ecartColonnes', 'ecartLignes', 'etiquettes', 'legende', 'figure'].includes(cle)) {
    cadrerApres = true
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
  fermerFiche()
})
vue.on('theme', () => {
  etat.palette = lirePalette(vue.racine)
})
etat.palette = lirePalette(vue.racine)

// ─── Panneau ☰ ───────────────────────────────────────────────────────────────

function construirePanneau(v: VueRaisonnement): HTMLElement {
  corpsPanneau = el('div', { class: 'r33-panneau' })
  void v
  return corpsPanneau
}

function majPanneau(): void {
  if (!corpsPanneau || !etat.page || !etat.contenu) return
  const v = vue
  const c = etat.contenu
  const niveau = niveauDeStrategie(v.strategie.id)
  const styles = { simple: 0, double: 0, pointillee: 0, barree: 0 }
  for (const a of c.aretes) styles[a.style]++
  const s = v.lecture.stats
  const ligne = (k: HTMLElement | string, val: string | number) => el('div', { class: 'r33-ligne' }, el('span', {}, k), el('span', { class: 'r33-valeur' }, String(val)))
  const glyphe = (t: string) => formule(t, 'r33-glyphe')
  const boutons = el('div', { class: 'r33-niveaux' }, NIVEAUX.map((n) =>
    el('button', { type: 'button', class: `rsn-bouton${n.id === niveau ? ' actif' : ''}`, onclick: () => definirNiveau(n.id) }, n.nom)))
  const source = sourceTikzcd(v.lecture, etat.page, c)
  const zone = el('textarea', { class: 'r33-code', readonly: '', spellcheck: 'false', rows: '8' }) as HTMLTextAreaElement
  zone.value = source
  const copier = el('button', { type: 'button', class: 'rsn-bouton', onclick: () => {
    void navigator.clipboard?.writeText(source).then(() => (copier.textContent = 'Copié'), () => zone.select())
  } }, 'Copier la source tikz-cd')
  corpsPanneau.replaceChildren(
    el('div', { class: 'rsn-doux rsn-petit' }, 'Niveau de détail'),
    boutons,
    el('div', { class: 'r33-nomenclature' },
      ligne('Énoncés affichés / nœuds', `${v.nU} / ${s.noeudsComplet}`),
      ligne('Flèches / arêtes', `${s.aretes} / ${s.aretesComplet}`),
      ligne(el('span', {}, glyphe('\\to'), ' valides'), styles.simple),
      ligne(el('span', {}, glyphe('\\Rightarrow'), ' implications fortes'), styles.double),
      ligne(el('span', {}, glyphe('\\dashrightarrow'), ' à vérifier'), styles.pointillee),
      ligne(el('span', {}, glyphe('\\nrightarrow'), ' réfutées'), styles.barree),
      ligne('Prémisses citées (légende)', c.legende.length),
      ligne('Formules extraites', `${c.formules.filter(Boolean).length} / ${v.nU}`),
    ),
    etatSquelette.deplies.size
      ? el('button', { type: 'button', class: 'rsn-bouton', onclick: () => {
          etatSquelette.ouvertes.clear()
          etatSquelette.deplies.clear()
          v.definirStrategie(v.strategie)
        } }, `Refermer les arguments ouverts (${etatSquelette.deplies.size})`)
      : el('div', { class: 'rsn-doux rsn-petit' }, 'Un exposant [n] marque un argument replié de n énoncés : double-clic pour l’ouvrir.'),
    el('div', { class: 'rsn-groupe-titre' }, 'Lecture'),
    el('div', { class: 'r33-legende-panneau' },
      el('div', {}, 'Nœud : sa formule (extraite de l’énoncé) ou, à défaut, son nom en romain ; ', el('span', { class: 'r33-sc' }, 'décision'), ' en petites capitales ; résultat en gras.'),
      el('div', {}, 'Au-dessus d’une flèche : l’argument (nom de la démonstration, ou outils invoqués). Au-dessous : les prémisses non tracées, par leur repère.'),
      el('div', {}, 'Décision : la branche retenue part en flèche étiquetée ; les alternatives rejetées sont sous une flèche barrée.'),
      el('div', {}, 'Survol : la flèche et ses extrémités en gras. Clic : fiche détaillée et lignée.'),
    ),
    el('div', { class: 'rsn-groupe-titre' }, 'Source tikz-cd'),
    zone,
    copier,
  )
}

// ─── Démarrage ───────────────────────────────────────────────────────────────

{
  const n = vue.reglages.lire<string>('niveau') as Niveau
  if (STRATEGIE_NIVEAU[n] && vue.strategie.id !== STRATEGIE_NIVEAU[n]) vue.definirStrategie(STRATEGIE_NIVEAU[n])
  else recalculer(false)
}

// KaTeX et Latin Modern arrivent après le premier rendu : les tailles changent, on recompose.
void typographiePrete().then(() => {
  cadrerApres = true
  recalculer(false)
})

;(window as unknown as { rsnVue: typeof vue; r33: EtatRendu }).rsnVue = vue
;(window as unknown as { r33: EtatRendu }).r33 = etat

// Sélecteur de jeu, sous le lien vers le catalogue.
{
  const choix = el('select', { class: 'r33-jeu-choix', 'aria-label': 'Raisonnement affiché' }) as HTMLSelectElement
  for (const [cle, libelle] of Object.entries(JEUX)) choix.append(new Option(libelle, cle, false, cle === jeuChoisi))
  choix.addEventListener('change', () => {
    const url = new URL(location.href)
    if (choix.value === 'fontaine') url.searchParams.delete('jeu')
    else url.searchParams.set('jeu', choix.value)
    location.href = url.toString()
  })
  document.body.append(el('label', { class: 'r33-jeu' }, el('span', {}, 'Jeu'), choix))
}
