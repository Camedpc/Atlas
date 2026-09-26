// V1 · Atlas scientifique — rendu « figure de revue » : programmes sigma (bordures de
// validation, arêtes courbes fléchées), anneaux de confiance, territoires des domaines,
// placement de libellés maison sans chevauchement, repères d'axes.

import { createNodeBorderProgram } from '@sigma/node-border'
import { createEdgeCurveProgram } from '@sigma/edge-curve'
import {
  rgba, rgbaGL, melangerCouleurs, centreCouloir, formaterDateCourte, LIBELLES_TYPE, TYPES_NOEUD, Z_MAX,
  type ContexteDessin, type ReducteurArete, type ReducteurNoeud, type VueGraphe, type Statut,
} from '../../src/core'

// ─── État partagé de la variante ─────────────────────────────────────────────

export interface EtatFigure {
  vue: VueGraphe
  /** Sens de la dernière variation d'ouverture par catégorie : +1 ouverture, −1 fermeture. */
  sens: Int8Array
  /** Par catégorie : [validé, incertain, réfuté] parmi les feuilles actives. */
  statuts: Int32Array
  /** Couleurs dérivées du thème. */
  teintes: string[]
  encre: string
  estimation: Record<Statut, string>
  policeTexte: string
  policeTitre: string
  /** Feuilles triées par importance décroissante (candidates aux libellés). */
  ordreImportance: Int32Array
  mesures: Map<string, number>
}

const lire = <T extends number | boolean | string>(vue: VueGraphe, cle: string) => vue.reglages.lire<T>(cle)

export function creerEtat(vue: VueGraphe): EtatFigure {
  const { h } = vue
  const ordre = Int32Array.from({ length: h.nF }, (_, i) => i).sort((a, b) => h.importance[b]! - h.importance[a]!)
  const etat: EtatFigure = {
    vue,
    sens: new Int8Array(h.nC).fill(1),
    statuts: new Int32Array(h.nC * 3),
    teintes: [],
    encre: '#1f1d1a',
    estimation: { valide: '', incertain: '', refute: '' },
    policeTexte: 'Inter, sans-serif',
    policeTitre: 'Georgia, serif',
    ordreImportance: ordre,
    mesures: new Map(),
  }
  majCouleurs(etat)
  majStatuts(etat)
  return etat
}

/** Relit les couleurs et polices du thème courant (après un changement de thème ou de police). */
export function majCouleurs(etat: EtatFigure): void {
  const { vue } = etat
  const p = vue.palette
  const s = getComputedStyle(vue.racine)
  etat.policeTexte = s.getPropertyValue('--police').trim() || p.police
  etat.policeTitre = s.getPropertyValue('--police-titre').trim() || 'Georgia, serif'
  etat.encre = p.texte
  const sombre = vue.reglages.valeurs.theme === 'sombre'
  // Agrégats : teinte pâle de la couleur de domaine (disque « aquarelle » sur papier).
  etat.teintes = p.domaines.map((c) => melangerCouleurs(c, p.fond, sombre ? 0.62 : 0.66))
  for (const st of ['valide', 'incertain', 'refute'] as const) etat.estimation[st] = melangerCouleurs(p.statut[st], p.texte, sombre ? 0.1 : 0.32)
  etat.mesures.clear()
}

/** Composition en statuts des catégories (feuilles actives), recalculée aux filtres. */
export function majStatuts(etat: EtatFigure): void {
  const { h, filtres } = etat.vue
  const s = etat.statuts
  s.fill(0)
  const idx: Record<Statut, number> = { valide: 0, incertain: 1, refute: 2 }
  for (let f = 0; f < h.nF; f++) {
    if (!filtres.actives[f]) continue
    const k = idx[h.noeuds[f]!.statut]
    for (let n = 0; n < 3; n++) s[h.chaine[f * 3 + n]! * 3 + k]!++
  }
}

// ─── Programmes sigma ────────────────────────────────────────────────────────

const rien = () => {}

/** Nœud à trois bordures en pixels (A extérieure, B intervalle, C intérieure) + remplissage. */
export const programmesNoeud = {
  atlasFigure: createNodeBorderProgram({
    borders: [
      { size: { attribute: 'bA', defaultValue: 0, mode: 'pixels' }, color: { attribute: 'cA' } },
      { size: { attribute: 'bB', defaultValue: 0, mode: 'pixels' }, color: { attribute: 'cB' } },
      { size: { attribute: 'bC', defaultValue: 0, mode: 'pixels' }, color: { attribute: 'cC' } },
      { size: { fill: true }, color: { attribute: 'color' } },
    ],
    drawLabel: rien,
    drawHover: rien,
  }),
}

export const programmesArete = {
  courbe: createEdgeCurveProgram(),
  courbeFleche: createEdgeCurveProgram({
    arrowHead: { extremity: 'target', lengthToThicknessRatio: 4, widenessToThicknessRatio: 3 },
  }),
}

// ─── Réducteurs ──────────────────────────────────────────────────────────────

/** Motifs de bordure par validation : [A, B (vide), C] en multiples de l'épaisseur de base. */
const MOTIFS = {
  aucune: [0.55, 0, 0],
  ia: [1, 0, 0],
  humain: [0.9, 0.9, 0.9],
  ia_humain: [2.4, 0, 0],
} as const
const EPAISSEURS = { aucune: 0.45, ia: 1, humain: 1.7, ia_humain: 2.6 } as const

export function creerReducteurNoeud(etat: EtatFigure): ReducteurNoeud {
  const extra = { bA: 0, cA: '', bB: 0, cB: '', bC: 0, cC: '' }
  return (info, a, vue) => {
    const R = vue.reglages.valeurs
    const pal = vue.palette
    const u = info.unite
    // Libellés : tout est dessiné par notre placement maison (calque du dessus).
    a.libelle = null
    a.forceLibelle = false

    // Lisibilité au survol : le reste s'estompe plus franchement que par défaut.
    if (info.survol === 'autre') a.opacite *= lire<number>(vue, 'estompeSurvol') / Math.max(R.opaciteEstompe, 0.25)

    // Transitions : fondu retardé à la fermeture (on se resserre d'abord), parent qui gonfle.
    if (lire<boolean>(vue, 'jaillissement')) {
      const parent = info.estAgregat ? info.categorie!.parent : vue.h.chaine[u * 3 + 2]!
      const al = info.alpha
      if (parent >= 0 && etat.sens[parent]! < 0 && al > 0.001 && al < 0.999) a.opacite *= Math.min(1, al * 2.2) / al
      if (info.estAgregat) {
        const o = info.ouverture
        if (o > 0.001 && o < 0.999) {
          const ferme = etat.sens[info.categorie!.index]! < 0
          a.taille *= 1 + lire<number>(vue, 'gonflement') * Math.sin(Math.PI * (1 - o)) * (ferme ? 1 : 0.3)
        }
      }
    }

    const op = Math.max(0, Math.min(1, a.opacite))
    const w = lire<number>(vue, 'epaisseurBordure')
    const encre = etat.encre
    let bA = 0, bB = 0, bC = 0
    let cA = encre, cC = encre
    if (info.estAgregat) {
      a.couleur = etat.teintes[info.domaine % etat.teintes.length]!
      cA = pal.domaines[info.domaine % pal.domaines.length]!
      bA = 1.1 * w
    } else {
      const v = info.noeud!.validation
      const style = lire<string>(vue, 'styleBordure')
      if (style === 'motif') {
        const m = MOTIFS[v]
        bA = m[0] * w
        bB = m[1] * w
        bC = m[2] * w
        if (v === 'aucune') cA = pal.texteDoux
      } else if (style === 'epaisseur') {
        bA = EPAISSEURS[v] * w
      } else {
        bA = 0.8
        cA = pal.fond
      }
    }
    // Lignée : filet coloré à l'extérieur, le motif de validation se resserre à l'intérieur.
    if (a.surligne) {
      bC = bA || 0.8
      cC = cA
      bA = 2 * Math.max(1, w)
      cA = a.couleurBordure
      bB = 0.7
    } else if (info.survol === 'survole') {
      bC = bA
      cC = cA
      bA = 1.6
      cA = encre
      bB = bC ? 0.8 : 0
    }
    // Les bordures ne mangent jamais plus de 60 % du rayon.
    const total = bA + bB + bC
    const max = a.taille * 0.6
    const k = total > max ? max / total : 1
    extra.bA = bA * k
    extra.bB = bB * k
    extra.bC = bC * k
    extra.cA = rgbaGL(cA, op)
    extra.cB = rgbaGL(pal.fond, op)
    extra.cC = rgbaGL(cC, op)
    a.type = 'atlasFigure'
    a.extra = extra
  }
}

export function creerReducteurArete(): ReducteurArete {
  const extra = { curvature: 0 }
  return (info, a, vue) => {
    const courbure = lire<number>(vue, 'courbureAretes')
    extra.curvature = courbure
    a.type = info.feuille && lire<boolean>(vue, 'flechesAretes') ? 'courbeFleche' : 'courbe'
    a.extra = extra
    if (info.survol === 'incidente' && !info.lignee) a.couleur = vue.palette.texte
  }
}

// ─── Calque du dessous : territoires puis anneaux ───────────────────────────

let horsEcran: HTMLCanvasElement | null = null

/** Rapport entre l'échelle écran courante (px par unité monde) et celle de la vue d'ensemble. */
function echelleZoom(vue: VueGraphe, W: number, H: number): number {
  const cam = vue.camera
  const c = cam.cible
  const d = cam.droite
  const a = cam.projeterPoint([c[0], c[1], c[2]])
  const b = cam.projeterPoint([c[0] + d[0] * 0.1, c[1] + d[1] * 0.1, c[2] + d[2] * 0.1])
  const ppu = Math.hypot(b.x - a.x, b.y - a.y) / 0.1
  const k = ppu / (0.42 * Math.min(W, H))
  return Math.max(0.3, Math.min(8, k || 1))
}

/** Territoires des domaines : union de disques (teinte + contour), façon carte de figure. */
export function dessinerTerritoires(_etat: EtatFigure, c: ContexteDessin): void {
  const { vue, ctx, projection: p, largeur: W, hauteur: H } = c
  if (!lire<boolean>(vue, 'territoires')) return
  const teinte = lire<number>(vue, 'teinteTerritoire')
  const contour = lire<number>(vue, 'contourTerritoire')
  if (teinte <= 0 && contour <= 0) return
  // La marge suit le zoom : exprimée en pixels « vue d'ensemble », convertie à l'échelle courante.
  const marge = lire<number>(vue, 'margeTerritoire') * echelleZoom(vue, W, H)
  const { h, palette } = vue
  horsEcran ??= document.createElement('canvas')
  const oc = horsEcran
  if (oc.width !== Math.ceil(W) || oc.height !== Math.ceil(H)) {
    oc.width = Math.ceil(W)
    oc.height = Math.ceil(H)
  }
  const o = oc.getContext('2d')!
  const nbDom = h.domaines.length
  const chemins: Path2D[] = Array.from({ length: nbDom }, () => new Path2D())
  const cheminsInt: Path2D[] = Array.from({ length: nbDom }, () => new Path2D())
  const vides = new Uint8Array(nbDom).fill(1)
  const g = vue.granularite
  for (let u = 0; u < h.nU; u++) {
    if (vue.opaciteAffichee[u]! < 0.05 || g.alpha[u]! < 0.05 || !p.visible[u]) continue
    const d = h.domaine(u)
    const x = p.x[u]!, y = p.y[u]!
    const r = vue.tailleAffichee[u]! + marge
    chemins[d]!.moveTo(x + r + 1.2, y)
    chemins[d]!.arc(x, y, r + 1.2, 0, Math.PI * 2)
    cheminsInt[d]!.moveTo(x + r, y)
    cheminsInt[d]!.arc(x, y, r, 0, Math.PI * 2)
    vides[d] = 0
  }
  // Le territoire s'efface quand on survole ou qu'une lignée est active : il ne doit pas gêner.
  const attenuation = vue.survol !== null || vue.lignee.active ? 0.45 : 1
  for (let d = 0; d < nbDom; d++) {
    if (vides[d]) continue
    const couleur = palette.domaines[h.categories[h.domaines[d]!]!.domaine % palette.domaines.length]!
    if (teinte > 0) {
      o.globalCompositeOperation = 'source-over'
      o.clearRect(0, 0, oc.width, oc.height)
      o.fillStyle = couleur
      o.fill(cheminsInt[d]!, 'nonzero')
      ctx.globalAlpha = teinte * attenuation
      ctx.drawImage(oc, 0, 0, W, H)
    }
    if (contour > 0) {
      o.globalCompositeOperation = 'source-over'
      o.clearRect(0, 0, oc.width, oc.height)
      o.fillStyle = couleur
      o.fill(chemins[d]!, 'nonzero')
      o.globalCompositeOperation = 'destination-out'
      o.fill(cheminsInt[d]!, 'nonzero')
      ctx.globalAlpha = contour * attenuation
      ctx.drawImage(oc, 0, 0, W, H)
    }
  }
  o.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
}

const STATUTS_ORDRE: Statut[] = ['valide', 'incertain', 'refute']
const DEBUT = -Math.PI / 2
const TOUR = Math.PI * 2

/**
 * Anneaux de confiance. Feuille : arc foncé de 0 à l'estimation (sens horaire depuis midi),
 * arc clair couvrant [bas, haut], piste très fine pour la référence 0–1. Agrégat : couronne
 * de la composition en statuts. Tracés groupés par (couleur, palier d'opacité).
 */
export function dessinerAnneaux(etat: EtatFigure, c: ContexteDessin): void {
  const { vue, ctx, projection: p } = c
  if (!lire<boolean>(vue, 'anneau')) return
  const { h, palette } = vue
  const w = lire<number>(vue, 'epaisseurAnneau')
  const ecart = lire<number>(vue, 'ecartAnneau')
  const rMin = lire<number>(vue, 'anneauRayonMin')
  const aInt = lire<number>(vue, 'opaciteIntervalle')
  const PALIERS = 5
  const chemins = new Map<string, Path2D>()
  const chemin = (cle: string) => {
    let q = chemins.get(cle)
    if (!q) chemins.set(cle, (q = new Path2D()))
    return q
  }
  const arc = (q: Path2D, x: number, y: number, r: number, a0: number, a1: number) => {
    q.moveTo(x + r * Math.cos(a0), y + r * Math.sin(a0))
    q.arc(x, y, r, a0, a1)
  }
  for (let f = 0; f < h.nF; f++) {
    const op = vue.opaciteAffichee[f]!
    if (op < 0.04 || !p.visible[f]) continue
    const t = vue.tailleAffichee[f]!
    if (t < rMin) continue
    const n = h.noeuds[f]!
    const x = p.x[f]!, y = p.y[f]!
    const r = t + ecart + w / 2
    const palier = Math.ceil(op * PALIERS)
    const { estimation, bas, haut } = n.confiance
    const piste = chemin(`piste|${palier}`)
    piste.moveTo(x + r, y)
    piste.arc(x, y, r, 0, TOUR)
    if (haut > bas) arc(chemin(`int|${n.statut}|${palier}`), x, y, r, DEBUT + TOUR * bas, DEBUT + TOUR * haut)
    if (estimation > 0.001) arc(chemin(`est|${n.statut}|${palier}`), x, y, r, DEBUT, DEBUT + TOUR * Math.min(0.9999, estimation))
  }
  const s = etat.statuts
  for (let ci = 0; ci < h.nC; ci++) {
    const u = h.nF + ci
    const op = vue.opaciteAffichee[u]!
    if (op < 0.04 || !p.visible[u]) continue
    const total = s[ci * 3]! + s[ci * 3 + 1]! + s[ci * 3 + 2]!
    if (!total) continue
    const x = p.x[u]!, y = p.y[u]!
    const r = vue.tailleAffichee[u]! + ecart + w * 0.75
    const palier = Math.ceil(op * PALIERS)
    const jeu = Math.min(0.06, 1.2 / r)
    let a = DEBUT
    for (let k = 0; k < 3; k++) {
      const part = s[ci * 3 + k]! / total
      if (part <= 0) continue
      const a1 = a + TOUR * part
      if (a1 - a > jeu * 1.5) arc(chemin(`don|${STATUTS_ORDRE[k]}|${palier}`), x, y, r, a + jeu / 2, a1 - jeu / 2)
      a = a1
    }
  }
  ctx.save()
  ctx.lineCap = 'butt'
  for (const [cle, q] of chemins) {
    const morceaux = cle.split('|')
    const genre = morceaux[0]!
    const palier = Number(morceaux[morceaux.length - 1]) / PALIERS
    if (genre === 'piste') {
      ctx.strokeStyle = rgba(palette.texteDoux, 0.22 * palier)
      ctx.lineWidth = 0.6
    } else {
      const st = morceaux[1] as Statut
      if (genre === 'int') {
        ctx.strokeStyle = rgba(palette.statut[st], aInt * palier)
        ctx.lineWidth = w * 1.9
      } else if (genre === 'est') {
        ctx.strokeStyle = rgba(etat.estimation[st], palier)
        ctx.lineWidth = w
      } else {
        ctx.strokeStyle = rgba(palette.statut[st], 0.85 * palier)
        ctx.lineWidth = w * 1.5
      }
    }
    ctx.stroke(q)
  }
  ctx.restore()
}

// ─── Calque du dessus : libellés sans chevauchement ─────────────────────────

interface Candidat {
  u: number
  prio: number
  genre: 'survol' | 'agregat' | 'feuille'
  alpha: number
}

const candidats: Candidat[] = []
const boites: number[] = []

function mesurer(etat: EtatFigure, ctx: CanvasRenderingContext2D, police: string, espacement: string, texte: string): number {
  const cle = `${police}|${espacement}|${texte}`
  let l = etat.mesures.get(cle)
  if (l === undefined) {
    ctx.font = police
    l = ctx.measureText(texte).width
    if (etat.mesures.size > 6000) etat.mesures.clear()
    etat.mesures.set(cle, l)
  }
  return l
}

function libre(x0: number, y0: number, x1: number, y1: number, W: number, H: number): boolean {
  if (x0 < 2 || y0 < 2 || x1 > W - 2 || y1 > H - 2) return false
  for (let i = 0; i < boites.length; i += 4) {
    if (x0 < boites[i + 2]! && x1 > boites[i]! && y0 < boites[i + 3]! && y1 > boites[i + 1]!) return false
  }
  return true
}

const tronquer = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

export function dessinerLibelles(etat: EtatFigure, c: ContexteDessin): void {
  const { vue, ctx, projection: p, largeur: W, hauteur: H } = c
  const { h, granularite: g, palette } = vue
  const R = vue.reglages.valeurs
  const strategie = R.libelles
  const survol = vue.survol
  const voisins = vue.voisinsSurvol
  const lignee = vue.lignee
  candidats.length = 0
  boites.length = 0
  const visible = (u: number) => vue.opaciteAffichee[u]! > 0.04 && p.visible[u] === 1 && g.alpha[u]! > 0.05

  if (survol !== null && visible(survol)) candidats.push({ u: survol, prio: 1e9, genre: 'survol', alpha: 1 })
  if (lignee.selection !== null && lignee.selection !== survol && visible(lignee.selection)) {
    candidats.push({ u: lignee.selection, prio: 9e8, genre: 'survol', alpha: 1 })
  }
  if (survol !== null) {
    for (const v of voisins) if (visible(v)) candidats.push({ u: v, prio: 8e8 + (v < h.nF ? h.importance[v]! : 1e4), genre: v < h.nF ? 'feuille' : 'agregat', alpha: 1 })
  }
  if (strategie !== 'aucun' && lire<boolean>(vue, 'libellesAgregats')) {
    for (let ci = 0; ci < h.nC; ci++) {
      const u = h.nF + ci
      if (u === survol || voisins.has(u) || !visible(u)) continue
      const role = lignee.role(u)
      const bonus = role === 'ancetre' || role === 'descendant' ? 5e5 : 0
      candidats.push({ u, prio: 1e5 + bonus + g.nbActives[ci]!, genre: 'agregat', alpha: 1 })
    }
  }
  const nbFeuilles = lire<number>(vue, 'libellesFeuilles')
  if (strategie === 'auto' && nbFeuilles > 0) {
    let pris = 0
    const seuil = R.seuilLibelle * 0.5
    for (let i = 0; i < etat.ordreImportance.length && pris < nbFeuilles * 3; i++) {
      const f = etat.ordreImportance[i]!
      if (f === survol || voisins.has(f) || f === lignee.selection || !visible(f) || vue.tailleAffichee[f]! < seuil) continue
      const x = p.x[f]!, y = p.y[f]!
      if (x < 0 || y < 0 || x > W || y > H) continue
      if (g.alpha[f]! < 0.6) continue
      const role = lignee.role(f)
      const bonus = role === 'ancetre' || role === 'descendant' ? 5e5 : 0
      candidats.push({ u: f, prio: bonus + h.importance[f]!, genre: 'feuille', alpha: 1 })
      pris++
    }
  }
  candidats.sort((a, b) => b.prio - a.prio)

  const halo = lire<number>(vue, 'haloLibelles')
  const base = lire<number>(vue, 'tailleLibellesAgregats')
  const echelle = lire<number>(vue, 'echellePoids')
  const ecartAnneau = lire<boolean>(vue, 'anneau') ? lire<number>(vue, 'ecartAnneau') + lire<number>(vue, 'epaisseurAnneau') * 1.6 : 0
  const tailleTexte = R.tailleLibelle
  const attenue = survol !== null || lignee.active
  let feuillesPlacees = 0

  ctx.save()
  ctx.lineJoin = 'round'
  ctx.textBaseline = 'middle'
  for (const cand of candidats) {
    const u = cand.u
    const agr = u >= h.nF
    const x = p.x[u]!, y = p.y[u]!
    const r = vue.tailleAffichee[u]! + ecartAnneau
    let texte: string
    let police: string
    let couleur = palette.texte
    let taille: number
    let espacement = '0px'
    if (agr) {
      const cat = h.categories[u - h.nF]!
      taille = Math.max(9, base * (0.7 + echelle * Math.sqrt(g.nbActives[cat.index]! / h.nF) * 1.4))
      if (cat.niveau === 0) {
        texte = cat.nom.toUpperCase()
        police = `600 ${taille.toFixed(1)}px ${etat.policeTexte}`
        espacement = `${(taille * 0.09).toFixed(1)}px`
      } else if (cat.niveau === 1) {
        texte = cat.nom
        police = `600 ${taille.toFixed(1)}px ${etat.policeTitre}`
      } else {
        texte = cat.nom
        police = `italic 400 ${taille.toFixed(1)}px ${etat.policeTitre}`
      }
    } else if (cand.genre === 'survol') {
      taille = tailleTexte + 1
      texte = tronquer(h.nom(u), 60)
      police = `600 ${taille}px ${etat.policeTitre}`
    } else {
      if (feuillesPlacees >= nbFeuilles && cand.prio < 8e8) continue
      taille = tailleTexte - 1
      texte = tronquer(h.nom(u), 34)
      police = `400 ${taille}px ${etat.policeTexte}`
      couleur = palette.texteDoux
    }
    ctx.letterSpacing = espacement
    const l = mesurer(etat, ctx, police, espacement, texte)
    const hauteurBoite = taille * 1.15
    // Positions candidates : dedans (agrégat assez grand), dessous, dessus, droite, gauche.
    const essais: [number, number][] = []
    if (agr && l <= r * 1.7 && taille <= r * 0.75) essais.push([x, y])
    if (agr) essais.push([x, y + r + 3 + hauteurBoite / 2], [x, y - r - 3 - hauteurBoite / 2], [x + r + 4 + l / 2, y], [x - r - 4 - l / 2, y])
    else essais.push([x + r + 4 + l / 2, y], [x - r - 4 - l / 2, y], [x, y - r - 2 - hauteurBoite / 2], [x, y + r + 2 + hauteurBoite / 2])
    let place: [number, number] | null = null
    for (const [cx, cy] of essais) {
      if (libre(cx - l / 2 - 2, cy - hauteurBoite / 2, cx + l / 2 + 2, cy + hauteurBoite / 2, W, H)) {
        place = [cx, cy]
        break
      }
    }
    if (!place && cand.genre === 'survol') place = essais[0]!
    if (!place) continue
    const [cx, cy] = place
    boites.push(cx - l / 2 - 2, cy - hauteurBoite / 2, cx + l / 2 + 2, cy + hauteurBoite / 2)
    if (!agr && cand.genre === 'feuille') feuillesPlacees++

    // Opacité : suit le nœud ; les agrégats apparaissent quand ils sont bien formés.
    let alpha = Math.min(1, vue.opaciteAffichee[u]! * 1.5)
    if (agr) alpha *= Math.min(1, Math.max(0, (g.alpha[u]! - 0.3) / 0.45))
    const concerne = u === survol || voisins.has(u) || lignee.role(u) === 'selection' || lignee.role(u) === 'ancetre' || lignee.role(u) === 'descendant'
    if (attenue && !concerne) {
      // Au survol / en lignée : seuls les noms d'agrégats restent, en retrait.
      if (!agr) continue
      alpha = Math.min(alpha, 0.35)
    }
    if (cand.genre === 'survol') alpha = 1
    if (alpha < 0.03) continue
    ctx.globalAlpha = alpha
    ctx.font = police
    ctx.textAlign = 'center'
    if (halo > 0) {
      ctx.lineWidth = halo
      ctx.strokeStyle = rgba(palette.fond, 0.92)
      ctx.strokeText(texte, cx, cy + 0.5)
    }
    ctx.fillStyle = couleur
    ctx.fillText(texte, cx, cy + 0.5)
  }
  ctx.letterSpacing = '0px'
  ctx.restore()
}

// ─── Repères d'axes (vues de face et de droite) ─────────────────────────────

export function dessinerReperes(etat: EtatFigure, c: ContexteDessin): void {
  const { vue, ctx } = c
  if (!lire<boolean>(vue, 'reperes')) return
  const { camera: cam, h, palette, poidsFaces } = vue
  const cube = vue.reglages.valeurs.mode3D === 'cube'
  const av = cam.avant
  const wTemps = (cube ? 1 : poidsFaces[1]!) * (1 - Math.abs(av[0]))
  const wCouloirs = (cube ? 1 : poidsFaces[2]!) * (1 - Math.abs(av[1]))
  const bas = -Z_MAX - 0.07
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.font = `italic 11px ${etat.policeTitre}`
  if (wTemps > 0.05) {
    ctx.globalAlpha = Math.min(1, wTemps * 1.3)
    ctx.fillStyle = palette.texteDoux
    ctx.strokeStyle = rgba(palette.texteDoux, 0.5)
    ctx.lineWidth = 0.8
    const d = new Date(h.dateMin)
    d.setUTCDate(1)
    const p0 = cam.projeterPoint([-1, 0, bas]), p1 = cam.projeterPoint([1, 0, bas])
    if (p0.visible && p1.visible) {
      ctx.beginPath()
      ctx.moveTo(p0.x, p0.y)
      ctx.lineTo(p1.x, p1.y)
      ctx.stroke()
    }
    for (d.setUTCMonth(d.getUTCMonth() + 1); d.getTime() < h.dateMax; d.setUTCMonth(d.getUTCMonth() + 1)) {
      const x = -1 + (2 * (d.getTime() - h.dateMin)) / (h.dateMax - h.dateMin)
      const p = cam.projeterPoint([x, 0, bas])
      if (!p.visible) continue
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x, p.y - 5)
      ctx.stroke()
      ctx.fillText(formaterDateCourte(d.getTime()), p.x, p.y + 4)
    }
    if (p1.visible) {
      ctx.textAlign = 'right'
      ctx.font = `600 10px ${etat.policeTexte}`
      ctx.fillText('DATE DE CRÉATION →', p1.x, p1.y + 20)
    }
  }
  if (wCouloirs > 0.05) {
    ctx.globalAlpha = Math.min(1, wCouloirs * 1.3)
    ctx.fillStyle = palette.texteDoux
    ctx.textAlign = 'center'
    ctx.font = `italic 11px ${etat.policeTitre}`
    TYPES_NOEUD.forEach((t, i) => {
      const p = cam.projeterPoint([0, centreCouloir(i, 1), bas])
      if (p.visible) ctx.fillText(LIBELLES_TYPE[t], p.x, p.y + 4)
    })
  }
  ctx.restore()
}
