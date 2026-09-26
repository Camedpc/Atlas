// Rendu « figure scientifique » (hérité de V1, allégé) : programmes sigma, réducteurs, territoires
// des domaines, anneaux de confiance des feuilles et anneau segmenté des statuts sur les agrégats
// (lecture de V6, en version discrète).

import { createNodeBorderProgram } from '@sigma/node-border'
import { createEdgeCurveProgram } from '@sigma/edge-curve'
import {
  rgba, rgbaGL, melangerCouleurs, TRAJECTOIRES,
  type ContexteDessin, type PointTrajectoire, type ReducteurArete, type ReducteurNoeud, type Statut, type VueGraphe,
} from '../../src/core'
import { lire } from './reglages'

// ─── État partagé ────────────────────────────────────────────────────────────

export interface EtatFigure {
  vue: VueGraphe
  /** Par catégorie : [validé, incertain, réfuté] parmi les feuilles actives. */
  statuts: Int32Array
  /** Disques d'agrégats : teinte pâle du domaine. */
  teintes: string[]
  /** Couleur foncée de l'estimation par statut (arc de l'anneau). */
  estimation: Record<Statut, string>
  policeTexte: string
  policeTitre: string
  policeMono: string
  /** Feuilles triées par importance décroissante (candidates aux libellés). */
  ordreImportance: Int32Array
  /** Largeurs de texte mesurées (clé police|texte). */
  mesures: Map<string, number>
  /** Unités mises en avant par un module (lentille…) : bonus de priorité des libellés. */
  priorite: Float32Array
}

export function creerEtat(vue: VueGraphe): EtatFigure {
  const { h } = vue
  const etat: EtatFigure = {
    vue,
    statuts: new Int32Array(h.nC * 3),
    teintes: [],
    estimation: { valide: '', incertain: '', refute: '' },
    policeTexte: 'Inter, sans-serif',
    policeTitre: 'Georgia, serif',
    policeMono: 'ui-monospace, monospace',
    ordreImportance: Int32Array.from({ length: h.nF }, (_, i) => i).sort((a, b) => h.importance[b]! - h.importance[a]!),
    mesures: new Map(),
    priorite: new Float32Array(h.nU),
  }
  majCouleurs(etat)
  majStatuts(etat)
  return etat
}

/** Relit couleurs et polices du thème courant. */
export function majCouleurs(etat: EtatFigure): void {
  const { vue } = etat
  const p = vue.palette
  const s = getComputedStyle(vue.racine)
  etat.policeTexte = s.getPropertyValue('--police').trim() || p.police
  etat.policeTitre = s.getPropertyValue('--police-titre').trim() || 'Georgia, serif'
  etat.policeMono = s.getPropertyValue('--police-mono').trim() || 'ui-monospace, monospace'
  const sombre = vue.reglages.valeurs.theme === 'sombre'
  const k = lire<number>(vue, 'teinteAgregat')
  etat.teintes = p.domaines.map((c) => melangerCouleurs(c, p.fond, sombre ? Math.min(0.9, k * 0.92) : k))
  for (const st of ['valide', 'incertain', 'refute'] as const) etat.estimation[st] = melangerCouleurs(p.statut[st], p.texte, sombre ? 0.1 : 0.3)
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

/** Nœud à trois bordures en pixels (A extérieure, B séparation, C intérieure) + remplissage. */
export const programmesNoeud = {
  v7Noeud: createNodeBorderProgram({
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

// ─── Transitions : jaillir (ressort) à la sortie, se resserrer à la rentrée ─

/**
 * Trajectoire de la synthèse (V1, via le point d'extension `PointTrajectoire.sens` du moteur) :
 * à l'ouverture, k(o) = 1 − e^(−a·o)·cos(b·o)·(1 − o) : les enfants jaillissent et dépassent
 * légèrement ; à la fermeture, k(o) = o^γ : ils se resserrent d'abord, puis fondent dans le parent.
 */
export function creerTrajectoire(vue: VueGraphe): (p: PointTrajectoire) => void {
  return (p) => {
    if (!lire<boolean>(vue, 'jaillissement') || p.o === undefined) {
      const t = TRAJECTOIRES[vue.reglages.valeurs.trajectoire] ?? TRAJECTOIRES.droite
      return t(p)
    }
    const o = p.o
    const a = lire<number>(vue, 'amortissement'), b = lire<number>(vue, 'raideurRessort'), g = lire<number>(vue, 'resserrement')
    const k = o <= 0 ? 0 : o >= 1 ? 1 : p.sens === -1 ? Math.pow(o, g) : 1 - Math.exp(-a * o) * Math.cos(b * o) * (1 - o)
    p.x = p.dx + (p.ax - p.dx) * k
    p.y = p.dy + (p.ay - p.dy) * k
    p.z = p.dz + (p.az - p.dz) * k
  }
}

// ─── Réducteurs ──────────────────────────────────────────────────────────────

/** Motifs de bordure par validation : [A, B (séparation), C] en multiples de l'épaisseur de base. */
const MOTIFS = { aucune: [0.55, 0, 0], ia: [1, 0, 0], humain: [0.9, 0.9, 0.9], ia_humain: [2.4, 0, 0] } as const
const EPAISSEURS = { aucune: 0.45, ia: 1, humain: 1.7, ia_humain: 2.6 } as const

export function creerReducteurNoeud(etat: EtatFigure): ReducteurNoeud {
  const extra = { bA: 0, cA: '', bB: 0, cB: '', bC: 0, cC: '' }
  return (info, a, vue) => {
    const R = vue.reglages.valeurs
    const pal = vue.palette
    const u = info.unite
    const g = vue.granularite
    // Tous les libellés sont posés par notre calque (placement sans chevauchement).
    a.libelle = null
    a.forceLibelle = false

    // Survol : le contexte s'estompe plus franchement (réglable).
    if (info.survol === 'autre') a.opacite *= lire<number>(vue, 'estompeSurvol') / Math.max(R.opaciteContexte ?? 0.3, 0.05)

    // Lignée : ce qui n'en fait pas partie recule davantage (les anneaux amplifiaient le contexte).
    if (info.lignee === 'hors') a.opacite *= lire<number>(vue, 'contexteLignee')

    // Transitions : fondu retardé à la rentrée (on se resserre d'abord), parent qui gonfle.
    if (lire<boolean>(vue, 'jaillissement')) {
      const parent = info.estAgregat ? info.categorie!.parent : vue.h.chaine[u * 3 + 2]!
      const al = info.alpha
      if (parent >= 0 && g.sens[parent]! < 0 && al > 0.001 && al < 0.999) a.opacite *= Math.min(1, al * 2.2) / al
      if (info.estAgregat) {
        const o = info.ouverture
        if (o > 0.001 && o < 0.999) a.taille *= 1 + lire<number>(vue, 'gonflement') * Math.sin(Math.PI * (1 - o)) * (g.sens[info.categorie!.index]! < 0 ? 1 : 0.3)
      }
    }

    const op = Math.max(0, Math.min(1, a.opacite))
    const w = lire<number>(vue, 'epaisseurBordure')
    const encre = pal.texte
    let bA = 0, bB = 0, bC = 0
    let cA = encre, cC = encre
    if (info.estAgregat) {
      // Vues temps / type : disques plus petits, pour que barres d'erreur et couloirs se lisent.
      const red = lire<number>(vue, 'reductionAxes')
      if (red > 0) {
        const wAxe = R.mode3D === 'cube' ? 1 - Math.abs(vue.camera.avant[2]) : Math.max(vue.poidsFaces[1]!, vue.poidsFaces[2]!)
        a.taille *= 1 - red * wAxe * wAxe
      }
      a.couleur = etat.teintes[info.domaine % etat.teintes.length]!
      cA = pal.domaines[info.domaine % pal.domaines.length]!
      bA = lire<number>(vue, 'filetAgregat')
    } else {
      const v = info.noeud!.validation
      const style = lire<string>(vue, 'styleBordure')
      if (style === 'motif') {
        const m = MOTIFS[v]
        bA = m[0] * w
        bB = m[1] * w
        bC = m[2] * w
        if (v === 'aucune') cA = pal.texteDoux
      } else if (style === 'epaisseur') bA = EPAISSEURS[v] * w
      else {
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
    a.type = 'v7Noeud'
    a.extra = extra
  }
}

export function creerReducteurArete(): ReducteurArete {
  const extra = { curvature: 0 }
  return (info, a, vue) => {
    extra.curvature = lire<number>(vue, 'courbureAretes')
    a.type = info.feuille && lire<boolean>(vue, 'flechesAretes') ? 'courbeFleche' : 'courbe'
    a.extra = extra
    if (info.survol === 'incidente' && !info.lignee) a.couleur = vue.palette.texte
  }
}

// ─── Calque du dessous : territoires ─────────────────────────────────────────

let horsEcran: HTMLCanvasElement | null = null

/** Rapport entre l'échelle écran courante et celle de la vue d'ensemble. */
export function echelleZoom(vue: VueGraphe): number {
  const cam = vue.camera
  const k = (cam.pixelsParUnite() * 2) / Math.min(cam.largeur, cam.hauteur) / 0.84
  return Math.max(0.3, Math.min(8, k || 1))
}

/** Territoires des domaines : union de disques teintée et cernée (vue de dessus surtout). */
export function dessinerTerritoires(_etat: EtatFigure, c: ContexteDessin): void {
  const { vue, ctx, projection: p, largeur: W, hauteur: H } = c
  if (!lire<boolean>(vue, 'territoires')) return
  // Hors vue de dessus, les territoires suivent des bandes temps / couloirs : on les efface.
  const poids = vue.reglages.valeurs.mode3D === 'cube' ? 0 : Math.pow(vue.poidsFaces[0]!, 1.5)
  if (poids < 0.03) return
  const teinte = lire<number>(vue, 'teinteTerritoire') * poids
  const contour = lire<number>(vue, 'contourTerritoire') * poids
  if (teinte <= 0 && contour <= 0) return
  const marge = lire<number>(vue, 'margeTerritoire') * echelleZoom(vue)
  const { h, palette } = vue
  horsEcran ??= document.createElement('canvas')
  const oc = horsEcran
  if (oc.width !== Math.ceil(W) || oc.height !== Math.ceil(H)) {
    oc.width = Math.ceil(W)
    oc.height = Math.ceil(H)
  }
  const o = oc.getContext('2d')!
  const nbDom = h.domaines.length
  const ext: Path2D[] = Array.from({ length: nbDom }, () => new Path2D())
  const int: Path2D[] = Array.from({ length: nbDom }, () => new Path2D())
  const vides = new Uint8Array(nbDom).fill(1)
  const g = vue.granularite
  for (let u = 0; u < h.nU; u++) {
    if (vue.opaciteAffichee[u]! < 0.05 || g.alpha[u]! < 0.05 || !p.visible[u]) continue
    const d = h.domaine(u)
    const x = p.x[u]!, y = p.y[u]!
    const r = vue.tailleAffichee[u]! + marge
    ext[d]!.moveTo(x + r + 1.2, y)
    ext[d]!.arc(x, y, r + 1.2, 0, Math.PI * 2)
    int[d]!.moveTo(x + r, y)
    int[d]!.arc(x, y, r, 0, Math.PI * 2)
    vides[d] = 0
  }
  const attenuation = vue.survol !== null || vue.lignee.active ? 0.5 : 1
  for (let d = 0; d < nbDom; d++) {
    if (vides[d]) continue
    const couleur = palette.domaines[h.categories[h.domaines[d]!]!.domaine % palette.domaines.length]!
    if (teinte > 0) {
      o.globalCompositeOperation = 'source-over'
      o.clearRect(0, 0, oc.width, oc.height)
      o.fillStyle = couleur
      o.fill(int[d]!, 'nonzero')
      ctx.globalAlpha = teinte * attenuation
      ctx.drawImage(oc, 0, 0, W, H)
    }
    if (contour > 0) {
      o.globalCompositeOperation = 'source-over'
      o.clearRect(0, 0, oc.width, oc.height)
      o.fillStyle = couleur
      o.fill(ext[d]!, 'nonzero')
      o.globalCompositeOperation = 'destination-out'
      o.fill(int[d]!, 'nonzero')
      ctx.globalAlpha = contour * attenuation
      ctx.drawImage(oc, 0, 0, W, H)
    }
  }
  o.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
}

// ─── Calque du dessous : anneaux ────────────────────────────────────────────

const STATUTS_ORDRE: Statut[] = ['valide', 'incertain', 'refute']
const DEBUT = -Math.PI / 2
const TOUR = Math.PI * 2
const PALIERS = 5

/**
 * Feuilles : anneau de confiance (piste 0–1 très fine, arc clair = intervalle [bas ; haut], arc
 * foncé = estimation, sens horaire depuis midi), seulement au-delà d'un rayon lisible.
 * Agrégats : anneau fin segmenté par statut (validé, incertain, réfuté), avec un jeu constant en
 * pixels entre segments ; en lignée, une jauge extérieure dit la part des feuilles concernées.
 * Tracés groupés par (genre, couleur, palier d'opacité) : quelques dizaines de `stroke()`.
 */
export function dessinerAnneaux(etat: EtatFigure, c: ContexteDessin): void {
  const { vue, ctx, projection: p } = c
  const { h, palette } = vue
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
  const w = lire<number>(vue, 'epaisseurAnneau')
  if (lire<boolean>(vue, 'anneauConfiance')) {
    const ecart = lire<number>(vue, 'ecartAnneau')
    const rMin = lire<number>(vue, 'anneauRayonMin')
    for (let f = 0; f < h.nF; f++) {
      const op = vue.opaciteAffichee[f]!
      if (op < 0.04 || !p.visible[f]) continue
      const t = vue.tailleAffichee[f]!
      if (t < rMin && vue.survol !== f) continue
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
  }
  const wS = lire<number>(vue, 'epaisseurStatuts')
  const ecartS = lire<number>(vue, 'ecartStatuts')
  const jeuPx = lire<number>(vue, 'jeuSegments')
  const jauge = lire<boolean>(vue, 'jaugeLignee') && vue.lignee.active
  if (lire<boolean>(vue, 'anneauStatuts') || jauge) {
    const s = etat.statuts
    for (let ci = 0; ci < h.nC; ci++) {
      const u = h.nF + ci
      const op = vue.opaciteAffichee[u]!
      if (op < 0.04 || !p.visible[u]) continue
      const x = p.x[u]!, y = p.y[u]!
      const r = vue.tailleAffichee[u]! + ecartS + wS / 2
      const palier = Math.ceil(op * PALIERS)
      const total = s[ci * 3]! + s[ci * 3 + 1]! + s[ci * 3 + 2]!
      if (total && lire<boolean>(vue, 'anneauStatuts')) {
        const jeu = Math.min(0.35, jeuPx / r)
        let a = DEBUT
        for (let k = 0; k < 3; k++) {
          const part = s[ci * 3 + k]! / total
          if (part <= 0) continue
          const a1 = a + TOUR * part
          if (a1 - a > jeu * 1.3) arc(chemin(`don|${STATUTS_ORDRE[k]}|${palier}`), x, y, r, a + jeu / 2, a1 - jeu / 2)
          a = a1
        }
      }
      if (jauge) {
        const l = vue.lignee
        const nA = l.nbAncetres[ci]!, nD = l.nbDescendants[ci]!, nG = l.nbGraines[ci]!
        const tot = h.categories[ci]!.feuilles.length
        if (nA + nD + nG > 0) {
          const rj = r + wS / 2 + 2.2
          let a = DEBUT
          for (const [n, genre] of [[nG, 'jsel'], [nA, 'janc'], [nD, 'jdes']] as const) {
            if (!n) continue
            const a1 = a + TOUR * (n / tot)
            arc(chemin(`${genre}|x|${Math.ceil(PALIERS * Math.max(0.2, vue.granularite.alpha[u]!))}`), x, y, rj, a, a1)
            a = a1
          }
        }
      }
    }
  }
  const aInt = lire<number>(vue, 'opaciteIntervalle')
  ctx.save()
  ctx.lineCap = 'butt'
  for (const [cle, q] of chemins) {
    const morceaux = cle.split('|')
    const genre = morceaux[0]!
    const palier = Number(morceaux[morceaux.length - 1]) / PALIERS
    const st = morceaux[1] as Statut
    switch (genre) {
      case 'piste':
        ctx.strokeStyle = rgba(palette.texteDoux, 0.2 * palier)
        ctx.lineWidth = 0.6
        break
      case 'int':
        ctx.strokeStyle = rgba(palette.statut[st], aInt * palier)
        ctx.lineWidth = w * 1.9
        break
      case 'est':
        ctx.strokeStyle = rgba(etat.estimation[st], palier)
        ctx.lineWidth = w
        break
      case 'don':
        ctx.strokeStyle = rgba(palette.statut[st], 0.9 * palier)
        ctx.lineWidth = wS
        break
      default:
        ctx.strokeStyle = rgba(genre === 'jsel' ? palette.accent : genre === 'janc' ? palette.ancetre : palette.descendant, 0.9 * palier)
        ctx.lineWidth = 1.5
    }
    ctx.stroke(q)
  }
  ctx.restore()
}
