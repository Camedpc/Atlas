// Banc de mesure hors navigateur (Node). Une tâche par processus, résultat JSON sur la sortie standard :
//
//   node .cache/banc.mjs jeu      <N>
//   node .cache/banc.mjs lecture  <N> <strategie>          (defaut, r36-squelette, r36-tout, r19-squelette…)
//   node .cache/banc.mjs page     <N> <vision> <niveau>    (vision : r36 | r18 | r19 | r35 ; niveau : squelette | auxiliaires | tout)
//   node .cache/banc.mjs katex    <N> <niveau>             (composition HTML de R36 : enLigne + formulesHtml + confiance)
//   node .cache/banc.mjs rendu    <N> <vision> <niveau>    (une image : appels canvas comptés, temps JS avec un contexte vide)
//
// Lancé par `mesurer.mjs` (délai maximal par tâche, un processus chacun pour mesurer la mémoire proprement).

import { katex } from './environnement'
import { genererGrandJeu, decrireJeu } from './generateur'
import {
  construireJustification, deriverLecture, strategie, type EtapeLecture, type GrapheJustification, type GrapheLecture,
  type JeuRaisonnement, type StrategieLecture,
} from './shim-raisonnement'
import * as S36 from '../../raisonnement/r36-latex-classique-a/squelette'
import * as S18 from '../../raisonnement/r18-blueprint-equations/squelette'
import * as S19 from '../../raisonnement/r19-blueprint-reduction/squelette'
import * as S35 from '../../raisonnement/r35-latex-pgfplots/squelette'
import { mettreEnPage as page36 } from '../../raisonnement/r36-latex-classique-a/mise-en-page'
import { mettreEnPage as page18 } from '../../raisonnement/r18-blueprint-equations/mise-en-page'
import { mettreEnPage as page19, type OptionsGroupes } from '../../raisonnement/r19-blueprint-reduction/mise-en-page'
import { mettreEnPage as page35 } from '../../raisonnement/r35-latex-pgfplots/mise-en-page'
import { etatGroupes, groupeDeNoeud, horsGroupe, nomGroupe, resultatDe } from '../../raisonnement/r19-blueprint-reduction/groupes'
import { formulesDuNoeud as formules35 } from '../../raisonnement/r35-latex-pgfplots/formules'
import { enLigne, formulesAffichees, formulesHtml, rendreTex, texConfiance } from '../../raisonnement/r36-latex-classique-a/formules'
import * as R36 from '../../raisonnement/r36-latex-classique-a/rendu'
import * as R18 from '../../raisonnement/r18-blueprint-equations/rendu'
import * as R19 from '../../raisonnement/r19-blueprint-reduction/rendu'
import * as R35 from '../../raisonnement/r35-latex-pgfplots/rendu'
import { creerContexteCompteur } from './environnement'

type Vision = 'r36' | 'r18' | 'r19' | 'r35'
const NIVEAUX_STRAT: Record<Vision, Record<string, string>> = {
  r36: S36.STRATEGIE_NIVEAU, r18: S18.STRATEGIE_NIVEAU, r19: S19.STRATEGIE_NIVEAU, r35: S35.STRATEGIE_NIVEAU,
}

const maintenant = () => performance.now()
const gc = () => (globalThis as { gc?: () => void }).gc?.()
const tas = () => {
  gc()
  return process.memoryUsage().heapUsed
}
const Mo = (o: number) => +(o / 1048576).toFixed(1)
const ms = (x: number) => +x.toFixed(1)

function chronometrer<T>(f: () => T, repetitions = 1): { resultat: T; ms: number; toutes: number[] } {
  const toutes: number[] = []
  let resultat!: T
  for (let i = 0; i < repetitions; i++) {
    const t0 = maintenant()
    resultat = f()
    toutes.push(maintenant() - t0)
  }
  const tri = [...toutes].sort((a, b) => a - b)
  return { resultat, ms: ms(tri[Math.floor(tri.length / 2)]!), toutes: toutes.map(ms) }
}

/** Stratégie dont chaque étape est chronométrée. */
function chronometree(id: string, temps: { etape: string; ms: number }[]): StrategieLecture {
  const s = strategie(id)
  return {
    ...s,
    etapes: s.etapes.map((e: EtapeLecture, i) => (t, p) => {
      const t0 = maintenant()
      e(t, p)
      temps.push({ etape: e.name || `etape${i}`, ms: ms(maintenant() - t0) })
    }),
  }
}

function deriver(j: GrapheJustification, id: string): { g: GrapheLecture; ms: number; etapes: { etape: string; ms: number }[] } {
  const etapes: { etape: string; ms: number }[] = []
  const t0 = maintenant()
  const g = deriverLecture(j, chronometree(id, etapes))
  const total = maintenant() - t0
  const somme = etapes.reduce((s, e) => s + e.ms, 0)
  etapes.push({ etape: 'travail + finaliser + verifierCorrespondance', ms: ms(total - somme) })
  return { g, ms: ms(total), etapes }
}

// ─── Options de mise en page (défauts des visions) ───────────────────────────

const POLICE = `'Inter', system-ui, sans-serif`

function optionsGroupes(g: GrapheLecture, jeu: JeuRaisonnement): OptionsGroupes {
  const r = resultatDe(g)
  const noeuds = g.justification.noeuds
  const o: OptionsGroupes = {
    groupe: [], fonction: [], entree: [], sortie: [], onglet: r.onglet,
    ordre: jeu.sousProblemes.map((s) => s.id), nom: (id) => nomGroupe(jeu, id),
  }
  for (const u of g.unites) {
    const n = noeuds[u.conclusion]!
    const f = r.fonctions.get(n.id)
    o.groupe.push(horsGroupe(n) ? null : f ?? groupeDeNoeud(n))
    o.fonction.push(f !== undefined)
    o.entree.push(r.entrees.has(n.id))
    o.sortie.push(r.sorties.has(n.id))
  }
  return o
}

function mettreEnPageVision(v: Vision, g: GrapheLecture, jeu: JeuRaisonnement) {
  const commun = { maxPastilles: 5, ecartCouches: 1, police: POLICE }
  if (v === 'r36') return page36(g, { ...commun, largeurCarte: 184, ecartColonnes: 46, ecartLignes: 20, taillePolice: 13 })
  if (v === 'r18') return page18(g, { ...commun, largeurCarte: 150, ecartColonnes: 64, ecartLignes: 16, taillePolice: 12, sousProblemes: jeu.sousProblemes, maxFormules: 2, commentaires: true })
  if (v === 'r19') return page19(g, { ...commun, largeurCarte: 136, ecartColonnes: 48, ecartLignes: 18, taillePolice: 12.5, groupes: optionsGroupes(g, jeu) })
  return page35(g, {
    ...commun, largeurCarte: 180, ecartColonnes: 46, ecartLignes: 18, taillePolice: 12.5,
    formuleDe: (p) => {
      const u = g.unites[p]
      return u ? formules35(g.justification.noeuds[u.conclusion]!, 1)[0] ?? null : null
    },
    figuresDe: () => 0,
    hauteurFigure: 150,
  })
}

type Page = ReturnType<typeof mettreEnPageVision>['page']

function decrirePage(g: GrapheLecture, page: Page, disposition: ReturnType<typeof mettreEnPageVision>['disposition']) {
  const parRang = new Map<number, number>()
  for (let p = 0; p < disposition.nU; p++) parRang.set(disposition.rang[p]!, (parRang.get(disposition.rang[p]!) ?? 0) + 1)
  const points = page.routes.reduce((s, r) => s + r.points.length, 0)
  const b = page.bornes
  return {
    unites: g.unites.length,
    aretesLecture: g.aretes.length,
    masques: g.masques.length,
    rangs: disposition.xRangs.length,
    maxParRang: Math.max(0, ...parRang.values()),
    routes: page.routes.length,
    pointsDeRoutes: points,
    jonctions: page.jonctions.length,
    figurePx: { largeur: Math.round(b.x1 - b.x0), hauteur: Math.round(b.y1 - b.y0) },
  }
}

// ─── Tâches ──────────────────────────────────────────────────────────────────

function tacheJeu(N: number) {
  const gen = chronometrer(() => genererGrandJeu(N))
  const jeu = gen.resultat
  const avant = tas()
  const cj = chronometrer(() => construireJustification(jeu), N <= 5000 ? 5 : 3)
  const j = cj.resultat
  const apres = tas()
  return {
    jeu: decrireJeu(jeu), chapitres: (jeu as { chapitres?: number }).chapitres,
    generationMs: gen.ms, justificationMs: cj.ms, justificationToutes: cj.toutes,
    aretesJustification: j.aretes.length, tasJustificationMo: Mo(apres - avant),
  }
}

function tacheLecture(N: number, id: string) {
  const jeu = genererGrandJeu(N)
  const j = construireJustification(jeu)
  if (id === 'r19-squelette-reduits') {
    for (const s of jeu.sousProblemes) etatGroupes.reduits.add(s.id)
    id = 'r19-squelette'
  }
  const avant = tas()
  const d = deriver(j, id)
  const apres = tas()
  return { strategie: id, ms: d.ms, etapes: d.etapes, stats: d.g.stats, tasLectureMo: Mo(apres - avant) }
}

function tachePage(N: number, v: Vision, niveau: string) {
  const jeu = genererGrandJeu(N)
  const j = construireJustification(jeu)
  const d = deriver(j, NIVEAUX_STRAT[v][niveau]!)
  const avant = tas()
  const t0 = maintenant()
  const r = mettreEnPageVision(v, d.g, jeu)
  const t = maintenant() - t0
  const apres = tas()
  return {
    vision: v, niveau, strategie: d.g.strategie.id, lectureMs: d.ms, miseEnPageMs: ms(t), tasPageMo: Mo(apres - avant),
    rssMaxMo: Mo(process.resourceUsage().maxRSS * 1024), ...decrirePage(d.g, r.page, r.disposition),
  }
}

function compterBalises(html: string): number {
  let n = 0
  for (let i = html.indexOf('<'); i >= 0; i = html.indexOf('<', i + 1)) if (html.charCodeAt(i + 1) !== 47) n++
  return n
}

function tacheKatex(N: number, niveau: string) {
  if (!katex) return { erreur: 'katex.min.cjs absent (performances/.cache)' }
  const jeu = genererGrandJeu(N)
  const j = construireJustification(jeu)
  const g = deriverLecture(j, NIVEAUX_STRAT.r36[niveau]!)
  const noeuds = g.unites.map((u) => j.noeuds[u.conclusion]!)
  // 1. Extraction seule (règle Unicode → LaTeX).
  const ext = chronometrer(() => noeuds.map((n) => formulesAffichees(n.enonce)))
  // 2. Composition complète d'un bloc, comme Composition.composerUnite (HTML de KaTeX).
  const compo = chronometrer(() => noeuds.map((n) => enLigne(n.nom) + formulesHtml(n.enonce) + rendreTex(texConfiance(n.confiance), '')))
  const html = compo.resultat
  const octets = html.reduce((s, h) => s + h.length, 0)
  const balises = html.map(compterBalises)
  // 3. Avec cache chaîne TeX → HTML (même travail, les chaînes répétées ne sont rendues qu'une fois).
  const cache = new Map<string, string>()
  const k = katex
  const avecCache = chronometrer(() => {
    const rendre = (tex: string, display: boolean) => {
      const cle = (display ? 'D' : 'T') + tex
      let h = cache.get(cle)
      if (h === undefined) cache.set(cle, (h = k.renderToString(display ? `\\displaystyle ${tex}` : tex, { throwOnError: false, strict: false, output: 'html' })))
      return h
    }
    return noeuds.map((n) => {
      const f = formulesAffichees(n.enonce)
      return (f ? rendre(f, true) : '') + rendre(texConfiance(n.confiance), false)
    })
  })
  const texTotal = noeuds.length * 2
  return {
    niveau, unites: noeuds.length,
    extractionMs: ext.ms,
    compositionMs: compo.ms, compositionParBlocMs: +(compo.ms / Math.max(1, noeuds.length)).toFixed(3),
    htmlMo: Mo(octets * 2), htmlParBlocKo: +(octets / Math.max(1, noeuds.length) / 1024).toFixed(1),
    elementsParBloc: { moyenne: +(balises.reduce((s, b) => s + b, 0) / Math.max(1, balises.length)).toFixed(1), max: Math.max(0, ...balises) },
    elementsTotal: balises.reduce((s, b) => s + b, 0),
    formulesAvecCacheMs: avecCache.ms, chainesTexUniques: cache.size, chainesTex: texTotal,
    katexVersion: k.version,
  }
}

// ─── Rendu d'une image (vue simulée) ─────────────────────────────────────────

const REGLAGES: Record<string, unknown> = {
  axe: true, impasses: true, legende: true, liensSemantiques: true, pastillesContexte: true, bandesChoix: 'survol',
  enTetes: true, grille: true, cartouche: true, taillePolice: 12.5, niveau: 'squelette',
}

function vueSimulee(g: GrapheLecture, jeu: JeuRaisonnement, disposition: ReturnType<typeof mettreEnPageVision>['disposition'], zoom: 'tout' | 'lecture') {
  const nU = g.unites.length, nP = nU + g.masques.length
  const W = 1600, H = 1000
  const b = disposition.bornes
  let cx = (b.xmin + b.xmax) / 2, cz = (b.zmin + b.zmax) / 2
  if (zoom === 'lecture' && nU) {
    // Centré sur l'unité la plus proche du centre de la figure (sinon l'écran peut tomber dans un vide).
    let meilleur = 0, dMin = Infinity
    for (let p = 0; p < nU; p++) {
      const d = (disposition.x[p]! - cx) ** 2 + (disposition.z[p]! - cz) ** 2
      if (d < dMin) {
        dMin = d
        meilleur = p
      }
    }
    cx = disposition.x[meilleur]!
    cz = disposition.z[meilleur]!
  }
  // « tout » : la figure entière tient dans l'écran ; « lecture » : 1 px de mise en page = 1 px écran.
  const k = zoom === 'tout' ? Math.min(W / Math.max(1e-6, b.xmax - b.xmin + 4), H / Math.max(1e-6, b.zmax - b.zmin + 2)) : 100
  const positions = new Float32Array(nP * 3)
  const pr = { x: new Float32Array(nP), y: new Float32Array(nP), profondeur: new Float32Array(nP), echelle: new Float32Array(nP).fill(1), visible: new Uint8Array(nP).fill(1), n: nP }
  let dansEcran = 0
  for (let p = 0; p < nP; p++) {
    positions[p * 3] = disposition.x[p]!
    positions[p * 3 + 2] = disposition.z[p]!
    pr.x[p] = W / 2 + (disposition.x[p]! - cx) * k
    pr.y[p] = H / 2 - (disposition.z[p]! - cz) * k
    pr.profondeur[p] = 10
    if (p < nU && pr.x[p]! > -100 && pr.x[p]! < W + 100 && pr.y[p]! > -100 && pr.y[p]! < H + 100) dansEcran++
  }
  const camera = {
    largeur: W, hauteur: H,
    pixelsParUnite: () => k,
    projeterPoint: (q: [number, number, number]) => ({ x: W / 2 + (q[0] - cx) * k, y: H / 2 - (q[2] - cz) * k, profondeur: 10, echelle: 1, visible: true }),
  }
  const pointDe = new Map<number, number>()
  g.masques.forEach((m, i) => pointDe.set(m, nU + i))
  const vue = {
    nU, nP, lecture: g, justification: g.justification, jeu, disposition, positions, projection: pr, camera, extrusion: 0,
    opaciteAffichee: new Float32Array(nP).fill(1), tailleAffichee: new Float32Array(nP).fill(6),
    presence: Float32Array.from({ length: nP }, (_, p) => (p < nU ? 1 : 0)),
    lignee: new Uint8Array(nP), ligneeActive: false, survol: null, selection: null,
    palette: { police: POLICE },
    reglages: { lire: (c: string) => REGLAGES[c], valeurs: REGLAGES },
    noeud: (p: number) => g.justification.noeuds[p < nU ? g.unites[p]!.conclusion : g.masques[p - nU]!]!,
    indexNoeud: (p: number) => (p < nU ? g.unites[p]!.conclusion : g.masques[p - nU]!),
    pointDeNoeud: (i: number) => (g.uniteDe[i]! >= 0 ? g.uniteDe[i]! : pointDe.get(i) ?? null),
    demanderRendu: () => undefined,
  }
  return { vue, dansEcran, k }
}

/** Composition HTML simulée (R36) : compte placements et écritures de style comme la vraie classe. */
function compositionSimulee(nU: number) {
  const places = Array.from({ length: nU }, () => ({ cle: '', visible: false }))
  const marques = new Uint8Array(nU)
  const c = { placements: 0, ecrituresStyle: 0, parcoursFin: 0 }
  return {
    compteur: c,
    couche: { classList: { toggle: () => undefined } },
    debutImage: () => marques.fill(0),
    definirCite: () => undefined,
    placer(p: number, x: number, y: number, s: number, op: number, w: number, haut: number) {
      marques[p] = 1
      c.placements++
      const pl = places[p]!
      const cle = `translate(${(x - (w / 2) * s).toFixed(2)}px,${(y - haut * s).toFixed(2)}px) scale(${s.toFixed(4)})|${op.toFixed(3)}`
      if (!pl.visible) {
        pl.visible = true
        c.ecrituresStyle++
      }
      if (cle === pl.cle) return
      pl.cle = cle
      c.ecrituresStyle += 2
    },
    finImage() {
      for (let p = 0; p < nU; p++) {
        c.parcoursFin++
        if (!marques[p] && places[p]!.visible) {
          places[p]!.visible = false
          c.ecrituresStyle++
        }
      }
    },
    placerLegende: () => undefined,
    masquerLegende: () => undefined,
    hauteurLegende: () => 120,
    /** Invalide les clés : la prochaine image est « en mouvement ». */
    bouger: () => places.forEach((p) => (p.cle = '')),
  }
}

const PALETTE = {
  encre: '#000000', gris: '#666666', trait: '#000000', surface: '#ffffff', surface2: '#f2f2f2', accent: '#1c4fa0',
  texte: '#1d2433', texteDoux: '#687086', fond: '#ffffff', arete: '#8a94a8', grille: '#dde3ee', papier: '#ffffff',
}
const paletteProxy = new Proxy(PALETTE as Record<string, string>, { get: (t, k: string) => t[k] ?? '#888888' })

function tacheRendu(N: number, v: Vision, niveau: string) {
  const jeu = genererGrandJeu(N)
  const j = construireJustification(jeu)
  const g = deriverLecture(j, NIVEAUX_STRAT[v][niveau]!)
  const { disposition, page } = mettreEnPageVision(v, g, jeu)
  const module = { r36: R36, r18: R18, r19: R19, r35: R35 }[v] as unknown as {
    dessinerDessous: (c: unknown, e: unknown) => void
    dessinerDessus: (c: unknown, e: unknown) => void
  }
  const res: Record<string, unknown> = { vision: v, niveau, unites: g.unites.length, routes: page.routes.length }
  for (const zoom of ['tout', 'lecture'] as const) {
    const { vue, dansEcran, k } = vueSimulee(g, jeu, disposition, zoom)
    const comp = v === 'r36' ? compositionSimulee(g.unites.length) : null
    const calque = { placements: 0 }
    const etat: Record<string, unknown> = {
      page, palette: paletteProxy, cibles: [], survol: null, epingles: new Set(), hypotheses: new Map(),
      composition: comp, cartouche: null, ciblesGroupes: [], fantomes: null, figures: new Map(),
      calque: v === 'r35' ? { disponible: true, debut: () => undefined, fin: () => undefined, placer: () => void calque.placements++, vider: () => undefined } : null,
    }
    for (let p = 0; p < g.unites.length; p++) {
      const b = page.boites[p] as { genre: string; ref: string }
      if (b.genre === 'drapeau') (etat.hypotheses as Map<number, string>).set(p, b.ref)
    }
    const { ctx, appels, remettre } = creerContexteCompteur()
    const contexte = { ctx, vue, largeur: 1600, hauteur: 1000, projection: vue.projection, temps: 0 }
    try {
      // Image comptée (appels canvas, écritures DOM).
      remettre()
      comp?.bouger()
      module.dessinerDessous(contexte, etat)
      module.dessinerDessus(contexte, etat)
      const parMethode = Object.fromEntries([...appels].filter(([m]) => !m.startsWith('=')).sort((a, b) => b[1] - a[1]))
      const traces = ['stroke', 'fill', 'fillText', 'strokeText', 'fillRect', 'strokeRect'].reduce((s, m) => s + (appels.get(m) ?? 0), 0)
      const affectations = [...appels].filter(([m]) => m.startsWith('=')).reduce((s, [, n]) => s + n, 0)
      // Compteurs DOM de l'image comptée seulement (avant les répétitions chronométrées).
      const dom = comp ? { ...comp.compteur } : v === 'r35' ? { placementsFormules: calque.placements } : null
      // Temps JS d'une image (médiane de 5), même contexte compteur (majorant léger : le Proxy coûte).
      const temps: number[] = []
      for (let i = 0; i < 5; i++) {
        comp?.bouger()
        remettre()
        const t0 = maintenant()
        module.dessinerDessous(contexte, etat)
        module.dessinerDessus(contexte, etat)
        temps.push(maintenant() - t0)
      }
      temps.sort((a, b) => a - b)
      res[zoom] = {
        pxParUnite: +k.toFixed(2), unitesDansEcran: dansEcran,
        tracesCanvas: traces, appelsCanvas: [...appels].filter(([m]) => !m.startsWith('=')).reduce((s, [, n]) => s + n, 0),
        affectationsEtat: affectations, parMethode,
        cibles: (etat.cibles as unknown[]).length,
        dom,
        jsImageMs: ms(temps[2]!),
      }
    } catch (e) {
      res[zoom] = { erreur: String((e as Error).stack ?? e).split('\n').slice(0, 4).join(' | ') }
    }
  }
  return res
}

// ─── Entrée ──────────────────────────────────────────────────────────────────

const [tache, nTexte, a, b] = process.argv.slice(2)
const N = Number(nTexte)
const t0 = maintenant()
let sortie: unknown
if (tache === 'jeu') sortie = tacheJeu(N)
else if (tache === 'lecture') sortie = tacheLecture(N, a ?? 'defaut')
else if (tache === 'page') sortie = tachePage(N, (a ?? 'r36') as Vision, b ?? 'squelette')
else if (tache === 'katex') sortie = tacheKatex(N, a ?? 'squelette')
else if (tache === 'rendu') sortie = tacheRendu(N, (a ?? 'r36') as Vision, b ?? 'squelette')
else throw new Error(`tâche inconnue : ${tache}`)
process.stdout.write(JSON.stringify({ tache, N, args: [a, b].filter(Boolean), dureeTotaleMs: ms(maintenant() - t0), ...(sortie as object) }) + '\n')
