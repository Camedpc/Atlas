// R3 · Arbre des décisions et de la modélisation.
//
// Les décisions et les choix de modélisation structurent la lecture : on voit d'abord quels choix
// ont été faits (bifurcations, alternatives rejetées), puis ce qu'ils ont permis (blocs de
// résultats proportionnels, dépliables). Survol d'un choix : sa portée ; clic : « et si ? ».
//
// Extension de la vue partagée : stratégie de lecture propre (modele.ts), disposition propre
// (disposition.ts, branchée en remplaçant `redisposer` de l'instance), calques canvas (dessin.ts),
// fiche et panneau (panneau.ts). Les autres stratégies retrouvent le rendu par défaut.

import {
  creerVueRaisonnement, dependantsDe, el, enregistrerStrategie, rgba,
  type Disposition, type ReducteurAreteR, type ReducteurPoint, type VueRaisonnement,
} from '../../src/raisonnement'
import { analyseActive, blocDuPoint, dessinerDessousR3, dessinerDessusR3 } from './dessin'
import { disposerR3, geometrie, type ParametresDispositionR3 } from './disposition'
import { etat } from './etat'
import { etatStrategie, etSi, ID_STRATEGIE, STRATEGIE_R3 } from './modele'
import { ficheR3, monterPanneau } from './panneau'
import meta from './meta.json'

enregistrerStrategie(STRATEGIE_R3)

// ─── Réducteurs ──────────────────────────────────────────────────────────────

const reducteurNoeud: ReducteurPoint = (info, a, vue) => {
  const an = analyseActive(vue)
  if (!an) return
  const p = info.point
  if (etat.alpha.length !== vue.nP) etat.alpha = new Float32Array(vue.nP)
  if (p >= vue.nU) return
  const pal = vue.palette
  const i = info.indexNoeud
  const genre = an.genre[i]
  // Survol d'un pivot : sa portée reste nette, le reste s'estompe.
  if (etat.portee) {
    const dedans = p === etat.portee.point || (etat.portee.parts.get(p) ?? 0) > 0
    a.opacite = info.presence * (dedans ? 1 : vue.reglages.lire<number>('estompe'))
  }
  a.libelle = null
  a.forceLibelle = false
  if (blocDuPoint(vue, an, p)) {
    // Bloc : la carte est dessinée sur le calque ; sigma ne garde qu'un point invisible.
    etat.alpha[p] = a.opacite
    a.opacite = 0.02
    a.taille = 2
    a.couleur = pal.fond
    a.couleurBordure = pal.fond
    a.zIndex = 0
    return
  }
  const k = vue.reglages.lire<number>('tailleGlyphe')
  const R = vue.reglages.valeurs.tailleNoeud
  const n = info.noeud
  if (genre === 'pivot') {
    a.taille = R * (n.type === 'decision' ? 1.95 : 1.75) * k
    a.couleur = pal.couches[2]!
  } else if (genre === 'cle') {
    a.taille = R * (n.type === 'resultat' ? 1.85 : n.type === 'theoreme' ? 1.7 : 1.35) * k
  } else if (genre === 'impasse') {
    a.taille = R * 1.3 * k
    a.couleur = pal.texteDoux
    a.opacite *= 0.8
  } else a.taille = R * 1.05 * k
  if (n.piste === 'abandonnee') a.opacite = Math.max(a.opacite, 0.5 * info.presence)
  // « Et si ? » : les suspendus prennent une bordure rouge.
  if (etat.etSi && etat.etSi.parts.has(p) && p !== etat.etSi.point) {
    a.couleurBordure = pal.contredit
    a.epaisseurBordure = 0.34
  }
  etat.alpha[p] = a.opacite
}

const reducteurArete: ReducteurAreteR = (info, a, vue) => {
  // Les arêtes de lecture sont dessinées en flux sur le calque (voir dessin.ts).
  if (info.genre === 'lecture' && analyseActive(vue)) a.cache = true
}

// ─── Vue ─────────────────────────────────────────────────────────────────────

const vue = creerVueRaisonnement(document.getElementById('app')!, {
  id: meta.id,
  strategie: ID_STRATEGIE,
  mode: '2d',
  reglages: { liensSemantiques: false, pastillesContexte: false, ecartRangs: 34, ecartNoeuds: 14, opaciteContexte: 0.14, tailleNoeud: 5 },
  reglagesSupplementaires: [
    { cle: 'alternatives', defaut: true, dossier: 'Vision R3', libelle: 'alternatives rejetées' },
    { cle: 'raisons', defaut: true, dossier: 'Vision R3', libelle: 'raison (une ligne)' },
    { cle: 'histoire', defaut: true, dossier: 'Vision R3', libelle: 'contradiction résolue' },
    { cle: 'motifs', defaut: true, dossier: 'Vision R3', libelle: 'motifs des décisions' },
    { cle: 'tailleTexte', defaut: 12, dossier: 'Vision R3', libelle: 'taille des textes', min: 9, max: 16, pas: 0.5 },
    { cle: 'largeurTexte', defaut: 140, dossier: 'Vision R3', libelle: 'largeur des libellés', min: 90, max: 260, pas: 5 },
    { cle: 'tailleGlyphe', defaut: 1, dossier: 'Vision R3', libelle: 'taille des glyphes', min: 0.5, max: 2, pas: 0.05 },
    { cle: 'hauteurParResultat', defaut: 1.25, dossier: 'Vision R3', libelle: 'hauteur / résultat', min: 0.3, max: 4, pas: 0.05 },
    { cle: 'hauteurMinBloc', defaut: 54, dossier: 'Vision R3', libelle: 'hauteur min. bloc', min: 24, max: 90, pas: 1 },
    { cle: 'largeurBloc', defaut: 124, dossier: 'Vision R3', libelle: 'largeur des blocs', min: 90, max: 260, pas: 5 },
    { cle: 'epaisseurFlux', defaut: 1, dossier: 'Vision R3', libelle: 'épaisseur des flux', min: 0, max: 3, pas: 0.05 },
    { cle: 'opaciteFlux', defaut: 0.5, dossier: 'Vision R3', libelle: 'opacité des flux', min: 0.1, max: 1, pas: 0.01 },
    { cle: 'estompe', defaut: 0.13, dossier: 'Vision R3', libelle: 'estompage hors portée', min: 0, max: 0.8, pas: 0.01 },
  ],
  reducteursNoeud: [reducteurNoeud],
  reducteursArete: [reducteurArete],
  dessinerDessous: dessinerDessousR3,
  dessinerDessus: dessinerDessusR3,
  rendreFiche: ficheR3,
  panneau: (p, v) => monterPanneau(p, v, (i) => centrer(v, i)),
})
// La barre (haut) et le compteur (bas) bornent la zone utile ; le gizmo n'occupe qu'un coin.
// Marges propres à R3 (le cadrage R3 voit l'emprise exacte des libellés) ; défaut ailleurs.
const MARGES_R3 = { haut: 0, gauche: 10, droite: -140, bas: 0 }
vue.margesSures = MARGES_R3
vue.on('lecture', () => { vue.margesSures = vue.strategie.id === ID_STRATEGIE ? MARGES_R3 : {} })
// Le gizmo ne sert qu'en 3D : masqué en 2D, il libère le coin haut droit.
const majGizmo = () => vue.racine.classList.toggle('r3-2d', vue.mode === '2d')
vue.on('mode', majGizmo)
majGizmo()

// ─── Disposition R3 branchée sur la vue ──────────────────────────────────────

const interne = vue as unknown as { appliquerDisposition(d: Disposition, anime: boolean): void }
const redisposerBase = vue.redisposer.bind(vue)

function parametresDisposition(): ParametresDispositionR3 {
  const R = vue.reglages.valeurs
  const m = vue.zoneSure()
  const W = vue.scene.clientWidth
  return {
    famille: vue.palette.police,
    taille: vue.reglages.lire<number>('tailleTexte'),
    ecartRangs: R.ecartRangs,
    ecartNoeuds: R.ecartNoeuds,
    ecartCouches: R.ecartCouches,
    largeurBloc: vue.reglages.lire<number>('largeurBloc'),
    hauteurParResultat: vue.reglages.lire<number>('hauteurParResultat'),
    hauteurMinBloc: vue.reglages.lire<number>('hauteurMinBloc'),
    largeurTexte: vue.reglages.lire<number>('largeurTexte'),
    largeurDispo: R.ajusterAspect ? Math.max(600, W - m.gauche - m.droite - 20) : 0,
    hauteurDispo: Math.max(400, vue.scene.clientHeight - m.haut - m.bas - 10),
    alternatives: vue.reglages.lire<boolean>('alternatives'),
    raisons: vue.reglages.lire<boolean>('raisons'),
  }
}

function disposerSiR3(anime: boolean): boolean {
  const an = etatStrategie.analyse
  if (vue.strategie.id !== ID_STRATEGIE || !an || an.j !== vue.justification) return false
  interne.appliquerDisposition(disposerR3(vue.lecture, an, parametresDisposition()), anime)
  return true
}

vue.redisposer = async (options) => {
  if (!disposerSiR3(true)) return redisposerBase(options)
  vue.cadrerTout()
}
// Cadrage 2D sur l'emprise des boîtes (libellés, embranchements, cartes), pas seulement des centres.
const cadrerBase = vue.cadrer.bind(vue)
vue.cadrer = (points = null, duree = vue.reglages.valeurs.dureeTransition, extrusion = vue.extrusion) => {
  if (points !== null || extrusion > 0.5 || !analyseActive(vue) || vue.reglages.valeurs.liensComplets) return cadrerBase(points, duree, extrusion)
  const e = geometrie.echelle
  const d = vue.disposition
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (let u = 0; u < vue.nU; u++) {
    const b = geometrie.boites[u]!
    x0 = Math.min(x0, d.x[u]! - b.gauche * e); x1 = Math.max(x1, d.x[u]! + b.droite * e)
    z0 = Math.min(z0, d.z[u]! - b.bas * e); z1 = Math.max(z1, d.z[u]! + b.haut * e)
  }
  const pos = new Float32Array([x0, 0, z0, x1, 0, z0, x0, 0, z1, x1, 0, z1])
  vue.camera.cadrer(pos, null, duree, 1.0, vue.zoneSure())
  vue.demanderRendu()
}
disposerSiR3(false)
vue.cadrerTout(1)

// ─── Interactions : portée au survol, « et si ? » au clic, blocs dépliables ────

vue.on('survol', ({ point }) => {
  const an = analyseActive(vue)
  etat.portee = null
  if (!an || point === null || point >= vue.nU || etat.etSi) return
  const i = vue.indexNoeud(point)
  if (an.genre[i] !== 'pivot') return
  const dep = new Uint8Array(an.j.noeuds.length)
  const liste = dependantsDe(an.j, i)
  for (const d of liste) dep[d] = 1
  const parts = new Map<number, number>()
  for (let q = 0; q < vue.nU; q++) {
    const u = vue.lecture.unites[q]!
    let k = 0
    for (const m of u.membres) if (dep[m]) k++
    if (k) parts.set(q, k / u.membres.length)
  }
  etat.portee = { point, noeud: i, parts, nb: liste.length }
})

const bandeau = el('div', { class: 'r3-bandeau', role: 'status' })
vue.interface.appendChild(bandeau)

function appliquerEtSi(): void {
  const s = etat.etSi
  if (!s) return
  vue.selection = s.point
  vue.lignee.fill(0)
  for (const q of s.parts.keys()) vue.lignee[q] = 2
  vue.lignee[s.point] = 3
  vue.ligneeActive = true
}

let entreeEtSi = 0
function entrerEtSi(p: number): void {
  entreeEtSi = performance.now()
  const an = analyseActive(vue)!
  const i = vue.indexNoeud(p)
  const res = etSi(an.j, an.topo, i)
  const parts = new Map<number, [number, number]>()
  for (let q = 0; q < vue.nU; q++) {
    if (q === p) continue
    const u = vue.lecture.unites[q]!
    let t = 0
    for (const m of u.membres) if (res.tombes[m]) t++
    if (t) parts.set(q, [t, u.membres.length])
  }
  etat.portee = null
  etat.etSi = { point: p, noeud: i, tombes: res.tombes, nbTombes: res.nbTombes, survivants: res.survivants, parts }
  appliquerEtSi()
  const N = an.j.noeuds
  const cles = [...res.tombes.keys()].filter((k) => res.tombes[k] && k !== i && (an.genre[k] === 'cle')).map((k) => N[k]!.nom)
  bandeau.replaceChildren(
    el('div', { class: 'r3-bandeau-titre' }, 'Et si l’on retirait ', el('b', {}, `« ${N[i]!.nom} »`), ' ?'),
    el('div', {},
      el('b', { class: 'r3-rouge' }, `${res.nbTombes} nœud(s) deviendraient suspendus`),
      res.survivants.length ? ` · ${res.survivants.length} tiennent grâce à une autre démonstration` : '',
      cles.length ? el('div', { class: 'r3-bandeau-cles' }, `Dont : ${cles.slice(0, 4).join(' · ')}${cles.length > 4 ? ` · +${cles.length - 4}` : ''}`) : null,
    ),
    el('button', { type: 'button', class: 'r3-bandeau-fermer', onclick: () => vue.selectionner(null) }, 'Quitter (Échap)'),
  )
  bandeau.classList.add('visible')
  vue.emettre('selection', { point: p })
  vue.demanderRendu()
}

function quitterEtSi(): void {
  if (!etat.etSi) return
  etat.etSi = null
  bandeau.classList.remove('visible')
}

// Dernier clic sur la scène (pour distinguer un clic dans le vide d'Échap).
let dernierClic = { t: 0, x: 0, y: 0 }
vue.scene.addEventListener('pointerup', (e) => {
  const r = vue.scene.getBoundingClientRect()
  dernierClic = { t: performance.now(), x: e.clientX - r.left, y: e.clientY - r.top }
})

function basculerBloc(id: string, deplier: boolean): void {
  if (deplier) etatStrategie.deplies.add(id)
  else etatStrategie.deplies.delete(id)
  quitterEtSi()
  etat.portee = null
  vue.definirStrategie(ID_STRATEGIE)
  if (!deplier) return
  // Cadrer sur les membres dépliés (et leurs voisins immédiats).
  const an = analyseActive(vue)
  const b = an?.blocs.find((x) => x.id === id)
  if (!an || !b) return
  const pts = new Set<number>()
  for (const m of b.membres) {
    const p = vue.pointDeNoeud(m)
    if (p === null || p >= vue.nU) continue
    pts.add(p)
    for (const e of vue.lecture.entrantes[p]!) pts.add(vue.lecture.aretes[e]!.source)
  }
  if (pts.size) vue.cadrer(pts)
}

const selectionnerBase = vue.selectionner.bind(vue)
vue.selectionner = (p: number | null) => {
  const an = analyseActive(vue)
  if (!an) return selectionnerBase(p)
  if (p === null) {
    const c = dernierClic
    if (performance.now() - c.t < 400) {
      const h = etat.entetes.find((x) => c.x >= x.rect.x0 && c.x <= x.rect.x1 && c.y >= x.rect.y0 && c.y <= x.rect.y1)
      if (h) return basculerBloc(h.id, false)
    }
    quitterEtSi()
    return selectionnerBase(null)
  }
  const b = blocDuPoint(vue, an, p)
  if (b) return basculerBloc(b.id, true)
  const i = vue.indexNoeud(p)
  if (p < vue.nU && an.genre[i] === 'pivot') {
    if (etat.etSi?.point === p) {
      // Un même clic peut arriver deux fois (nœud puis scène) : on ne ressort pas aussitôt.
      if (performance.now() - entreeEtSi < 400) return
      quitterEtSi()
      return selectionnerBase(null)
    }
    return entrerEtSi(p)
  }
  quitterEtSi()
  selectionnerBase(p)
}

// Les blocs (cartes) sont survolables et cliquables.
const pointSousBase = vue.pointSous.bind(vue)
vue.pointSous = (x: number, y: number, marge?: number) => {
  const q = pointSousBase(x, y, marge)
  if (q !== null || !analyseActive(vue)) return q
  for (const [p, c] of etat.cartes) if (x >= c.x0 - 2 && x <= c.x1 + 2 && y >= c.y0 - 18 && y <= c.y1 + 2) return p
  return null
}

vue.on('disposition', () => {
  // Nouvelle dérivation : les indices de points changent.
  if (etat.etSi && (etat.etSi.point >= vue.nU || vue.indexNoeud(etat.etSi.point) !== etat.etSi.noeud)) quitterEtSi()
  else appliquerEtSi()
})
vue.on('lecture', () => {
  quitterEtSi()
  etat.portee = null
})

vue.on('reglage', ({ cle, valeur }) => {
  if (['hauteurParResultat', 'hauteurMinBloc', 'largeurBloc', 'alternatives', 'raisons', 'tailleTexte', 'largeurTexte'].includes(cle)) void vue.redisposer()
  if (cle === 'motifs') {
    etatStrategie.options.motifs = valeur as boolean
    if (vue.strategie.id === ID_STRATEGIE) vue.definirStrategie(ID_STRATEGIE)
  }
})

// ─── Centrer une décision (journal) ──────────────────────────────────────────

function centrer(v: VueRaisonnement, i: number): void {
  if (v.strategie.id !== ID_STRATEGIE) v.definirStrategie(ID_STRATEGIE)
  const p = v.pointDeNoeud(i)
  if (p === null) return
  const m = v.zoneSure()
  const ppu = v.camera.pixelsParUnite()
  const X = v.positions[p * 3]!, Y = v.positions[p * 3 + 1]!, Z = v.positions[p * 3 + 2]!
  const dx = (m.gauche - m.droite) / 2 / ppu, dz = (m.haut - m.bas) / 2 / ppu
  const dr = v.camera.droite, dh = v.camera.haut
  v.camera.animerVers({ cible: [X - dr[0] * dx + dh[0] * dz, Y - dr[1] * dx + dh[1] * dz, Z - dr[2] * dx + dh[2] * dz] }, 600)
  etat.focus = { noeud: i, t0: performance.now() + 450 }
  const stop = v.animerEnContinu()
  window.setTimeout(stop, 2200)
}

// Pratique pour déboguer (et pour le script de capture).
;(window as unknown as { rsnVue: typeof vue; r3: unknown }).rsnVue = vue
;(window as unknown as { r3: unknown }).r3 = { etat, etatStrategie, rgba }
