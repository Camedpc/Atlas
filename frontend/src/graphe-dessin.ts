// Dessin du graphe de raisonnement sur canevas (thème LaTeX classique clair de R41) et composition HTML des blocs.
//
// - Cadres façon R18 : rectangle teinté translucide, barre de titre colorée, contour fin ; piste abandonnée hachurée.
// - Blocs façon R36 / R41 : fond blanc, statut par le trait (plein : établi ; tireté : à vérifier ; tireté gris :
//   suspendu ; barré : invalide ; pointillé gris : ouvert), double cadre des théorèmes et résultats démontrés.
// - Nœuds-fonctions façon R19 (cadre réduit) : copie décalée, broches ▷ d'entrée et ● de sortie.
// - Liaisons orthogonales au trait fin, pointe « to » de TikZ ; renvois « cf. 7 » pour les prémisses techniques ou
//   de contexte.
// - Niveaux de détail selon le zoom z (px d'écran par px de mise en page) : z < 0,225 → un carré de la couleur du
//   cadre par bloc, liaisons en un seul trait gris ; z < 0,6 → cadres et titres écrits sur le canevas ; au-delà →
//   contenu HTML (KaTeX) des seuls blocs visibles (graphe-contenu.ts). Seul ce qui touche l'écran est dessiné.
// - Figures (graphe-figures.ts) : cadre gris fin ; de loin, titre et icône ; au niveau « contenu », le tracé pgfplots
//   (ou l'image) et le titre, la légende et les titres d'axes en HTML. Un pointillé gris les relie au nœud illustré.

import type { Statut } from './api'
import type { Contenu } from './graphe-contenu'
import { echapper, enLigne, formulesAffichees, rendreTex, texConfiance, texteBrut } from './formules'
import { COULEURS_FIGURE, dessinerIcone, dessinerImage, dessinerTrace, geometrieBloc, htmlFigure, TETE_FIGURE, type ImagesFigures } from './graphe-figures'
import { CADRE, CLE_FONCTION, FONCTION, type Bloc, type Cadre, type Modele, type Rect } from './graphe-modele'

export const SERIF = `'CMU Serif Atlas', KaTeX_Main, 'Latin Modern Roman', 'CMU Serif', 'Computer Modern', 'Times New Roman', serif`

export const PALETTE = {
  encre: '#000000',
  gris: '#666666',
  grisClair: '#9a9a9a',
  surface: '#ffffff',
  accent: '#1c4fa0',
  erreur: '#b42318',
}

/** Seuils des niveaux de détail (z = px d'écran par px de mise en page). */
export const SEUIL_POINT = 0.175
export const SEUIL_CONTENU = 0.6
/** Corps du texte des blocs (px de mise en page). */
export const CORPS = 12.5
/** Taille minimale des titres à l'écran (px) : de loin, ils restent lisibles au lieu de disparaître. */
export const TITRE_MIN = 10

/** Titres des cadres (px à l'écran) : jamais plus petits, de loin comme de près ; de très loin, ils grossissent
 * jusqu'à TITRE_CADRE_MAX au milieu du cadre. */
export const TITRE_CADRE_MIN = 14
export const TITRE_CADRE_MAX = 40

/** Têtes abrégées des blocs, quand « Proposition 21 » ne tient pas (on garde toujours le numéro). */
const ABREGES: Record<string, string> = {
  Proposition: 'Prop. ', Théorème: 'Th. ', Lemme: 'L. ', Définition: 'Déf. ', Hypothèse: 'H. ', Axiome: 'Ax. ',
  Décision: 'Déc. ', Assertion: 'Ass. ', Expérience: 'Exp. ', Calcul: 'Calc. ', Observation: 'Obs. ',
  Résultat: 'Rés. ', Conjecture: 'Conj. ', 'Fait admis': 'F. ', Énoncé: 'É. ',
}

/** Corps des titres à l'écran (px) et grossissement par rapport au texte à l'échelle (≥ 1). */
function corpsTitre(z: number): { fs: number; g: number } {
  const fs = Math.max(CORPS * z, TITRE_MIN)
  return { fs, g: fs / (CORPS * z) }
}

export type Niveau = 'point' | 'titre' | 'contenu'

export function niveauDe(z: number): Niveau {
  return z < SEUIL_POINT ? 'point' : z < SEUIL_CONTENU ? 'titre' : 'contenu'
}

export interface Camera {
  x: number
  y: number
  z: number
}

export interface EtatDessin {
  modele: Modele
  cam: Camera
  largeur: number
  hauteur: number
  selection: Set<string>
  /** Représentant survolé (bloc ou « cadre:<id> »). */
  survol: string | null
  /** Renvoi survolé : id du nœud cité. */
  renvoiSurvole: string | null
  /** Barre de titre survolée. */
  titreSurvole: string | null
  /** Nœuds estompés (filtre « Cette conversation », filtres du pilotage). */
  estompes: Set<string> | null
  /** Nœuds surlignés par le pilotage (voix) : même accent que la sélection, sans leur lignée. */
  surlignes?: Set<string> | null
  /** Nœuds glissés posés sur une case occupée. */
  conflits: Set<string> | null
  /** Cadre sous le point de dépôt pendant un glisser. */
  cadreCible: string | null
  /** Hypothèse survolée : ses dépendants portent « sous (ii) ». */
  hypothese: Bloc | null
  /** Images des figures (chargées à la demande). */
  images: ImagesFigures | null
}

const LIBELLE_STATUT: Record<Statut, string> = {
  etabli: 'établi',
  a_verifier: 'à vérifier',
  suspendu: 'suspendu',
  invalide: 'invalide',
  ouvert: 'ouvert',
}

/** Motif et couleur du trait d'un bloc selon son statut. */
function trait(statut: Statut): { motif: number[]; couleur: string; barre: boolean } {
  switch (statut) {
    case 'a_verifier':
      return { motif: [4, 3], couleur: PALETTE.encre, barre: false }
    case 'suspendu':
      return { motif: [4, 3], couleur: PALETTE.grisClair, barre: false }
    case 'invalide':
      return { motif: [], couleur: PALETTE.encre, barre: true }
    case 'ouvert':
      return { motif: [1, 2.2], couleur: PALETTE.gris, barre: false }
    default:
      return { motif: [], couleur: PALETTE.encre, barre: false }
  }
}

const RANG_STATUT: Record<Statut, number> = { invalide: 0, suspendu: 1, ouvert: 2, a_verifier: 3, etabli: 4 }

export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

// ─── Texte sur canevas (titres) : lignes mesurées une fois par bloc, au corps de référence ───

let ctxMesure: CanvasRenderingContext2D | null = null
const lignesEnCache = new Map<string, string[]>()

export function oublierMesures(): void {
  lignesEnCache.clear()
}

function mesureur(): CanvasRenderingContext2D {
  if (!ctxMesure) {
    ctxMesure = document.createElement('canvas').getContext('2d')!
    ctxMesure.textRendering = 'optimizeSpeed'
  }
  return ctxMesure
}

function tronquer(ctx: CanvasRenderingContext2D, t: string, max: number): string {
  if (ctx.measureText(t).width <= max) return t
  let x = t
  while (x.length > 1 && ctx.measureText(x + '…').width > max) x = x.slice(0, -1)
  return x.trimEnd() + '…'
}

/** Coupe un texte en lignes de largeur `largeur` (au plus `max`, la dernière tronquée), mémorisé. */
function lignes(texte: string, largeur: number, max: number, gras = false): string[] {
  const cle = `${gras ? 1 : 0}|${largeur}|${max}|${texte}`
  const connu = lignesEnCache.get(cle)
  if (connu) return connu
  const ctx = mesureur()
  ctx.font = `${gras ? 700 : 400} ${CORPS}px ${SERIF}`
  const res: string[] = []
  let courante = ''
  const mots = texte.split(/\s+/).filter(Boolean)
  for (let i = 0; i < mots.length; i++) {
    const essai = courante ? `${courante} ${mots[i]}` : mots[i]!
    if (ctx.measureText(essai).width <= largeur || !courante) courante = essai
    else {
      res.push(courante)
      courante = mots[i]!
      if (res.length === max) {
        res[max - 1] = tronquer(ctx, `${res[max - 1]} ${mots.slice(i).join(' ')}`, largeur)
        courante = ''
        break
      }
    }
  }
  if (courante && res.length < max) res.push(courante)
  const final = res.map((l) => tronquer(ctx, l, largeur))
  if (lignesEnCache.size > 5000) lignesEnCache.clear()
  lignesEnCache.set(cle, final)
  return final
}

// ─── Primitives ──────────────────────────────────────────────────────────────

/** Pointe « to » de TikZ : deux barbes incurvées (ajoutées au chemin courant). */
function pointe(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, t: number): void {
  const l = Math.hypot(dx, dy) || 1
  const ux = dx / l, uy = dy / l
  const px = -uy, py = ux
  const L = t * 2.1, H = t * 1.35
  for (const sg of [1, -1]) {
    ctx.moveTo(x - ux * L + px * H * sg, y - uy * L + py * H * sg)
    ctx.quadraticCurveTo(x - ux * L * 0.3 + px * H * 0.15 * sg, y - uy * L * 0.3 + py * H * 0.15 * sg, x, y)
  }
}

function coupe(r: Rect, v: Rect): boolean {
  return !(r.x1 < v.x0 || r.x0 > v.x1 || r.y1 < v.y0 || r.y0 > v.y1)
}

// ─── Image ───────────────────────────────────────────────────────────────────

export function dessiner(ctx: CanvasRenderingContext2D, e: EtatDessin, contenu: Contenu): void {
  const { modele: m, cam } = e
  const z = cam.z
  const niveau = niveauDe(z)
  const X = (x: number) => x * z + cam.x
  const Y = (y: number) => y * z + cam.y
  // Fenêtre visible (px de mise en page), élargie pour les renvois et les pointes.
  const marge = 40
  const vue: Rect = { x0: -cam.x / z - marge, y0: -cam.y / z - marge, x1: (e.largeur - cam.x) / z + marge, y1: (e.hauteur - cam.y) / z + marge }
  ctx.clearRect(0, 0, e.largeur, e.hauteur)
  // La ligature « ff » de CMU Serif n'a pas de glyphe accessible au canevas : sans ligatures.
  ctx.textRendering = 'optimizeSpeed'
  contenu.debutImage()
  etiquettesPosees = []

  // 1. Cadres (parents d'abord).
  for (const c of m.cadresOrdonnes) if (c.rect && coupe(c.rect, vue)) dessinerCadre(ctx, e, c, X, Y)

  // 2. Liaisons, et pointillés des figures vers leur nœud.
  dessinerLiens(ctx, e, vue, niveau, X, Y)
  if (niveau !== 'point') dessinerAttaches(ctx, e, vue, X, Y)

  // 3. Blocs et nœuds-fonctions.
  const actifs = e.hypothese?.portee ?? null
  if (niveau === 'point') {
    const parCouleur = new Map<string, number[]>()
    for (const b of m.blocs.values()) {
      if (b.cache || b.x > vue.x1 || b.x + b.w < vue.x0 || b.y > vue.y1 || b.y + b.h < vue.y0) continue
      const cote = b.figure ? Math.max(3, Math.min(9, b.h * z * 0.3)) : Math.max(3, Math.min(7, b.w * z * 0.18))
      const couleur = e.selection.has(b.id) || e.survol === b.id || e.surlignes?.has(b.id) ? PALETTE.accent
        : b.figure ? COULEURS_FIGURE.cadre : b.groupe ? m.cadres.get(b.groupe)!.teinte : PALETTE.encre
      const cle = e.estompes?.has(b.id) ? `${couleur}|e` : couleur
      const liste = parCouleur.get(cle) ?? parCouleur.set(cle, []).get(cle)!
      liste.push(X(b.x + b.w / 2) - cote / 2, Y(b.y + b.h / 2) - cote / 2, cote)
    }
    for (const c of m.cadres.values()) {
      const f = c.fonction
      if (!f || f.x > vue.x1 || f.x + f.w < vue.x0 || f.y > vue.y1 || f.y + f.h < vue.y0) continue
      const cote = Math.max(4, Math.min(9, f.w * z * 0.22))
      const liste = parCouleur.get(c.teinte) ?? parCouleur.set(c.teinte, []).get(c.teinte)!
      liste.push(X(f.x + f.w / 2) - cote / 2, Y(f.y + f.h / 2) - cote / 2, cote)
    }
    // Un seul remplissage par couleur.
    for (const [cle, liste] of parCouleur) {
      const [couleur, estompe] = cle.split('|')
      ctx.fillStyle = estompe ? rgba(couleur!, 0.3) : couleur!
      ctx.beginPath()
      for (let i = 0; i < liste.length; i += 3) ctx.rect(liste[i]!, liste[i + 1]!, liste[i + 2]!, liste[i + 2]!)
      ctx.fill()
    }
  } else {
    for (const b of m.blocs.values()) {
      if (b.cache || b.x > vue.x1 || b.x + b.w < vue.x0 || b.y > vue.y1 || b.y + b.h < vue.y0) continue
      const estompe = !!e.estompes?.has(b.id)
      if (b.figure) {
        dessinerFigure(ctx, e, b, X, Y, niveau, estompe)
        const pose = niveau === 'contenu'
          && contenu.placer(b.id, cleFigure(b, m), () => htmlFigure(b.figure!, b.numero, referenceDe(m, b.figure!.noeud_id), b.w, b.h), X(b.x), Y(b.y), z, b.w, b.h, estompe)
        if (!pose) dessinerTitreFigure(ctx, b, X, Y, z, estompe)
        continue
      }
      const sous = actifs?.has(b.id) ?? false
      dessinerBloc(ctx, e, b, X, Y, estompe, sous)
      let pose = false
      if (niveau === 'contenu') {
        pose = contenu.placer(b.id, cleBloc(b), () => htmlBloc(b), X(b.x), Y(b.y), z, b.w, b.h, estompe)
        if (b.renvois.length) dessinerRenvois(ctx, e, b, X, Y)
        if (sous) dessinerSous(ctx, e, b, X, Y)
      }
      if (!pose) dessinerTitre(ctx, b, X, Y, z, estompe)
    }
    for (const c of m.cadres.values()) {
      const f = c.fonction
      if (!f || f.x > vue.x1 || f.x + f.w < vue.x0 || f.y > vue.y1 || f.y + f.h < vue.y0) continue
      dessinerFonction(ctx, e, c, X, Y)
      const pose = niveau === 'contenu'
        && contenu.placer(CLE_FONCTION + c.id, cleFonction(c, m), () => htmlFonction(c, m), X(f.x), Y(f.y), z, f.w, f.h, false)
      if (!pose) dessinerTitreFonction(ctx, c, X, Y, z)
    }
  }
  // 4. De très loin, les noms des cadres par-dessus tout : c'est ce qu'on lit d'abord.
  if (niveau === 'point') dessinerTitresDeLoin(ctx, e, vue, X, Y)
  contenu.finImage()
}

function dessinerCadre(ctx: CanvasRenderingContext2D, e: EtatDessin, c: Cadre, X: (x: number) => number, Y: (y: number) => number): void {
  const r = c.rect!
  const z = e.cam.z
  const x0 = X(r.x0), y0 = Y(r.y0), x1 = X(r.x1), y1 = Y(r.y1)
  const w = x1 - x0, h = y1 - y0
  const imbrique = c.profondeur > 0
  const hTitre = CADRE.titre * z
  const abandon = c.genre === 'piste_abandonnee'
  const cible = e.cadreCible === c.id
  const survole = e.titreSurvole === c.id
  ctx.fillStyle = rgba(c.teinte, imbrique ? 0.075 : 0.055)
  ctx.fillRect(x0, y0, w, h)
  if (abandon) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(x0, y0 + hTitre, w, h - hTitre)
    ctx.clip()
    ctx.strokeStyle = rgba(c.teinte, 0.14)
    ctx.lineWidth = 1
    ctx.beginPath()
    const pas = Math.max(6, 9 * z)
    for (let x = x0 - h; x < x1; x += pas) {
      ctx.moveTo(x, y1)
      ctx.lineTo(x + h, y0)
    }
    ctx.stroke()
    ctx.restore()
  }
  ctx.fillStyle = rgba(c.teinte, (imbrique ? 0.16 : 0.2) + (survole ? 0.08 : 0))
  ctx.fillRect(x0, y0, w, hTitre)
  ctx.strokeStyle = cible ? PALETTE.accent : rgba(c.teinte, imbrique ? 0.55 : 0.5)
  ctx.lineWidth = cible ? 1.6 : 1
  if (abandon) ctx.setLineDash([4, 3])
  ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(w) - 1, Math.round(h) - 1)
  ctx.setLineDash([])
  const taille = (imbrique ? 10.5 : 12) * z
  // Trop petit pour la barre du cadre : étiquette lisible au-dessus (titres) ou grand titre au milieu (points,
  // dessiné par-dessus les blocs : dessinerTitresDeLoin).
  if (taille < TITRE_CADRE_MIN - 3) {
    if (niveauDe(z) !== 'point') dessinerEtiquetteCadre(ctx, c, x0, y0, w, imbrique ? TITRE_CADRE_MIN - 2 : TITRE_CADRE_MIN)
    return
  }
  ctx.textBaseline = 'middle'
  const ym = y0 + hTitre / 2 + 0.5
  const compte = `${c.numero} · ${c.enonces} énoncé${c.enonces > 1 ? 's' : ''}`
  ctx.font = `italic 400 ${taille * 0.85}px ${SERIF}`
  const wCompte = ctx.measureText(compte).width
  ctx.font = `700 ${taille}px ${SERIF}`
  ctx.textAlign = 'left'
  const titre = `▾ ${abandon && !/abandon/i.test(c.nom) ? `Piste abandonnée · ${c.nom}` : c.nom}`
  const t = tronquer(ctx, titre, w - 14 * z - wCompte - 10 * z)
  ctx.fillStyle = c.teinte
  ctx.fillText(t, x0 + 7 * z, ym)
  if (ctx.measureText(t).width + wCompte + 30 * z < w) {
    ctx.font = `italic 400 ${taille * 0.85}px ${SERIF}`
    ctx.textAlign = 'right'
    ctx.fillStyle = PALETTE.gris
    ctx.fillText(compte, x1 - 7 * z, ym)
  }
}

function titreCadre(c: Cadre): string {
  return c.genre === 'piste_abandonnee' && !/abandon/i.test(c.nom) ? `Piste abandonnée · ${c.nom}` : c.nom
}

/** Étiquettes des cadres déjà posées dans l'image courante : une étiquette qui en chevaucherait une autre se
 * déplace, rétrécit ou renonce (comme les noms sur une carte). Vidé au début de chaque image. */
let etiquettesPosees: Rect[] = []

function libre(r: Rect): boolean {
  return !etiquettesPosees.some((o) => !(r.x1 < o.x0 || r.x0 > o.x1 || r.y1 < o.y0 || r.y0 > o.y1))
}

/** Étiquette du cadre juste au-dessus de lui (ou, si la place est prise, dans sa barre), lisible, sur un fond clair. */
function dessinerEtiquetteCadre(ctx: CanvasRenderingContext2D, c: Cadre, x0: number, y0: number, w: number, fs: number): void {
  ctx.save()
  ctx.font = `700 ${fs}px ${SERIF}`
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  const texte = tronquer(ctx, `${c.numero} ${titreCadre(c)}`, Math.max(w, fs * 18))
  const l = ctx.measureText(texte).width
  for (const y of [y0 - fs * 0.35, y0 + fs * 1.05]) {
    const r = { x0: x0 - 3, y0: y - fs * 1.05, x1: x0 + l + 3, y1: y + fs * 0.3 }
    if (!libre(r)) continue
    etiquettesPosees.push(r)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)'
    ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0)
    ctx.fillStyle = c.teinte
    ctx.fillText(texte, x0, y)
    break
  }
  ctx.restore()
}

/** Découpe `texte` en lignes d'au plus `largeur` px avec la police courante du contexte. */
function couper(ctx: CanvasRenderingContext2D, texte: string, largeur: number): string[] {
  const res: string[] = []
  let ligne = ''
  for (const mot of texte.split(/\s+/).filter(Boolean)) {
    const essai = ligne ? `${ligne} ${mot}` : mot
    if (!ligne || ctx.measureText(essai).width <= largeur) ligne = essai
    else {
      res.push(ligne)
      ligne = mot
    }
  }
  if (ligne) res.push(ligne)
  return res
}

/** De très loin (niveau « points ») : le nom des cadres en grand, centré sur le cadre et pouvant en déborder. Les
 * plus grands cadres d'abord ; un nom qui chevaucherait un autre rétrécit, puis renonce. */
function dessinerTitresDeLoin(ctx: CanvasRenderingContext2D, e: EtatDessin, vue: Rect, X: (x: number) => number, Y: (y: number) => number): void {
  const cadres = e.modele.cadresOrdonnes
    .filter((c) => c.rect && !c.cache && coupe(c.rect, vue))
    .map((c) => ({ c, x0: X(c.rect!.x0), y0: Y(c.rect!.y0), w: X(c.rect!.x1) - X(c.rect!.x0), h: Y(c.rect!.y1) - Y(c.rect!.y0) }))
    .sort((a, b) => a.c.profondeur - b.c.profondeur || b.w * b.h - a.w * a.h)
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  for (const { c, x0, y0, w, h } of cadres) {
    const cx = x0 + w / 2, cy = y0 + h / 2
    const largeur = Math.max(w - 12, TITRE_CADRE_MAX * 5)
    const plafond = c.profondeur > 0 ? TITRE_CADRE_MIN + 4 : TITRE_CADRE_MAX
    for (let fs = Math.max(TITRE_CADRE_MIN, Math.min(plafond, h * 0.3)); fs >= TITRE_CADRE_MIN - 2; fs -= 2) {
      ctx.font = `700 ${fs}px ${SERIF}`
      const lignes = couper(ctx, titreCadre(c), largeur).slice(0, 2)
      lignes[lignes.length - 1] = tronquer(ctx, lignes[lignes.length - 1]!, largeur)
      const numero = fs * 0.55
      const hauteur = lignes.length * fs * 1.15 + numero * 1.3
      const l = Math.max(...lignes.map((x) => ctx.measureText(x).width))
      const r = { x0: cx - l / 2 - 4, y0: cy - hauteur / 2, x1: cx + l / 2 + 4, y1: cy + hauteur / 2 }
      if (!libre(r)) continue
      etiquettesPosees.push(r)
      let y = r.y0 + numero * 0.65
      ctx.font = `italic 400 ${numero}px ${SERIF}`
      ctx.lineWidth = numero * 0.3
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.strokeText(c.numero, cx, y)
      ctx.fillStyle = PALETTE.gris
      ctx.fillText(c.numero, cx, y)
      y += numero * 0.65 + fs * 0.575
      ctx.font = `700 ${fs}px ${SERIF}`
      ctx.lineWidth = fs * 0.28
      ctx.fillStyle = c.teinte
      for (const x of lignes) {
        ctx.strokeText(x, cx, y)
        ctx.fillText(x, cx, y)
        y += fs * 1.15
      }
      break
    }
  }
  ctx.restore()
}

function dessinerLiens(ctx: CanvasRenderingContext2D, e: EtatDessin, vue: Rect, niveau: Niveau, X: (x: number) => number, Y: (y: number) => number): void {
  const z = e.cam.z
  const liens = e.modele.liens
  ctx.save()
  ctx.lineJoin = 'miter'
  ctx.lineCap = 'butt'
  if (niveau === 'point') {
    // Vue lointaine : toutes les liaisons en un seul trait gris, sans pointes.
    ctx.strokeStyle = rgba(PALETTE.gris, 0.35)
    ctx.lineWidth = 0.7
    ctx.beginPath()
    for (const l of liens) {
      if (!coupe(l.bbox, vue)) continue
      const p = l.points
      ctx.moveTo(X(p[0]!), Y(p[1]!))
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(X(p[i]!), Y(p[i + 1]!))
    }
    ctx.stroke()
    ctx.restore()
    return
  }
  // Regroupées par style : un chemin et un trait par style.
  const epaisseur = Math.max(0.7, Math.min(1, 0.85 * z))
  const tPointe = Math.max(2.2, Math.min(3.4, 2.9 * z))
  const styles = new Map<string, typeof liens>()
  const lignee = (id: string) => e.survol === id || e.selection.has(id)
  for (const l of liens) {
    if (!coupe(l.bbox, vue)) continue
    const accent = lignee(l.de) || lignee(l.vers)
    const estompe = !!e.estompes && (e.estompes.has(l.de) || e.estompes.has(l.vers))
    const cle = `${accent ? 'a' : l.role === 'auxiliaire' ? 'x' : 'p'}|${l.validite === 'invalide' ? 'i' : 'v'}|${estompe && !accent ? 'e' : ''}`
    ;(styles.get(cle) ?? styles.set(cle, []).get(cle)!).push(l)
  }
  // Les liaisons de la lignée en dernier (par-dessus).
  const cles = [...styles.keys()].sort((a, b) => (a[0] === 'a' ? 1 : 0) - (b[0] === 'a' ? 1 : 0))
  for (const cle of cles) {
    const [genre, validite, estompe] = cle.split('|')
    const couleur = genre === 'a' ? PALETTE.accent : genre === 'x' ? PALETTE.gris : PALETTE.encre
    ctx.strokeStyle = rgba(couleur, estompe ? 0.3 : 1)
    ctx.lineWidth = genre === 'a' ? epaisseur + 0.5 : genre === 'x' ? Math.max(0.6, epaisseur - 0.15) : epaisseur
    ctx.setLineDash(validite === 'i' ? [1, 2.2] : [])
    ctx.beginPath()
    for (const l of styles.get(cle)!) {
      const p = l.points
      ctx.moveTo(X(p[0]!), Y(p[1]!))
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(X(p[i]!), Y(p[i + 1]!))
    }
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    for (const l of styles.get(cle)!) {
      const p = l.points
      const n = p.length
      pointe(ctx, X(p[n - 2]!), Y(p[n - 1]!), X(p[n - 2]!) - X(p[n - 4]!), Y(p[n - 1]!) - Y(p[n - 3]!), tPointe)
    }
    ctx.stroke()
  }
  ctx.restore()
}

function dessinerBloc(ctx: CanvasRenderingContext2D, e: EtatDessin, b: Bloc, X: (x: number) => number, Y: (y: number) => number, estompe: boolean, sous: boolean): void {
  const z = e.cam.z
  const x0 = Math.round(X(b.x)) + 0.5, y0 = Math.round(Y(b.y)) + 0.5
  const w = Math.round(b.w * z) - 1, h = Math.round(b.h * z) - 1
  const t = trait(b.noeud.statut)
  const choisi = e.selection.has(b.id) || !!e.surlignes?.has(b.id)
  const conflit = !!e.conflits?.has(b.id)
  const survole = e.survol === b.id
  ctx.save()
  if (estompe) ctx.globalAlpha = 0.3
  ctx.fillStyle = PALETTE.surface
  ctx.fillRect(x0, y0, w, h)
  const couleur = conflit ? PALETTE.erreur : choisi || survole || sous ? PALETTE.accent : t.couleur
  ctx.strokeStyle = couleur
  ctx.lineWidth = conflit || choisi ? 1.6 : survole ? 1.4 : 0.9
  // La sélection se lit d'un trait plein ; le statut reste visible par le trait intérieur.
  ctx.setLineDash(choisi || conflit ? [] : t.motif)
  ctx.strokeRect(x0, y0, w, h)
  if (choisi && t.motif.length) {
    ctx.strokeStyle = t.couleur
    ctx.lineWidth = 0.8
    ctx.setLineDash(t.motif)
    ctx.strokeRect(x0 + 3, y0 + 3, w - 6, h - 6)
  }
  if (b.majeur) {
    ctx.lineWidth = 0.8
    ctx.setLineDash(t.motif)
    ctx.strokeStyle = choisi ? PALETTE.accent : t.couleur
    ctx.strokeRect(x0 + 2.5 * Math.min(1, z * 1.4), y0 + 2.5 * Math.min(1, z * 1.4), w - 5 * Math.min(1, z * 1.4), h - 5 * Math.min(1, z * 1.4))
  }
  ctx.setLineDash([])
  if (t.barre) {
    ctx.strokeStyle = rgba(PALETTE.encre, 0.55)
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(x0, y0 + h)
    ctx.lineTo(x0 + w, y0)
    ctx.stroke()
  }
  ctx.restore()
}

/** Titre seul (niveau intermédiaire, ou en attendant la composition HTML) : tête en gras puis le nom. */
function dessinerTitre(ctx: CanvasRenderingContext2D, b: Bloc, X: (x: number) => number, Y: (y: number) => number, z: number, estompe: boolean): void {
  // De loin, le titre est grossi (g) : moins de mots par ligne et moins de lignes, coupés au bord du bloc.
  const { fs, g } = corpsTitre(z)
  const larg = (b.w - 14) / g
  const interligne = CORPS * 1.2 * g
  const max = Math.max(1, Math.floor((b.h - 10) / interligne))
  ctx.font = `700 ${fs}px ${SERIF}`
  const tete = ctx.measureText(`${b.libelle} ${b.numero}`).width <= (b.w - 10) * z
    ? `${b.libelle} ${b.numero}` : `${ABREGES[b.libelle] ?? ''}${b.numero}`
  const suite = max > 1 ? lignes(texteBrut(b.noeud.nom), larg, max - 1) : []
  ctx.save()
  ctx.beginPath()
  ctx.rect(X(b.x), Y(b.y), b.w * z, b.h * z)
  ctx.clip()
  if (estompe) ctx.globalAlpha = 0.3
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillStyle = PALETTE.encre
  ctx.font = `700 ${fs}px ${SERIF}`
  const x0 = X(b.x + 7), y0 = Y(b.y + 6)
  ctx.fillText(tete, x0, y0)
  ctx.font = `${b.hypothese ? 'italic ' : ''}400 ${fs}px ${SERIF}`
  suite.forEach((l, k) => ctx.fillText(l, x0, y0 + (k + 1) * interligne * z))
  ctx.restore()
}

/** Renvois « cf. 7 » sous le bloc : prémisses techniques ou de contexte (au plus 5, puis « +k »). */
function dessinerRenvois(ctx: CanvasRenderingContext2D, e: EtatDessin, b: Bloc, X: (x: number) => number, Y: (y: number) => number): void {
  const z = e.cam.z
  ctx.save()
  ctx.font = `400 ${10 * z}px ${SERIF}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  const y = Y(b.y + b.h + 11)
  const items = positionsRenvois(b)
  for (const it of items) {
    const cite = e.modele.blocs.get(it.id)
    if (!cite) continue
    const allume = e.renvoiSurvole === it.id
    const t = `cf. ${cite.numero}`
    ctx.fillStyle = allume ? PALETTE.accent : PALETTE.encre
    ctx.fillText(t, X(it.x), y)
    if (allume) ctx.fillRect(X(it.x), y + 6 * z, ctx.measureText(t).width, Math.max(0.8, 0.8 * z))
  }
  if (b.renvois.length > items.length) {
    ctx.fillStyle = PALETTE.gris
    ctx.fillText(`+${b.renvois.length - items.length}`, X(b.x + 6 + items.length * 40), y)
  }
  ctx.restore()
}

/** Position (px de mise en page) des renvois d'un bloc : sous le bloc, de gauche à droite. */
export function positionsRenvois(b: Bloc): { id: string; x: number; y0: number; y1: number }[] {
  return b.renvois.slice(0, 5).map((id, k) => ({ id, x: b.x + 6 + k * 40, y0: b.y + b.h + 4, y1: b.y + b.h + 18 }))
}

/** « sous (ii) » au-dessus d'un bloc qui dépend de l'hypothèse survolée (R37). */
function dessinerSous(ctx: CanvasRenderingContext2D, e: EtatDessin, b: Bloc, X: (x: number) => number, Y: (y: number) => number): void {
  const z = e.cam.z
  ctx.save()
  ctx.font = `italic 400 ${10 * z}px ${SERIF}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = PALETTE.accent
  ctx.fillText(`sous ${e.hypothese!.numero}`, X(b.x + b.w), Y(b.y) - 2 * z)
  ctx.restore()
}

export interface Agregat {
  statut: Statut
  aVerifier: number
  invalides: number
  /** Maillon le plus faible : la plus basse confiance des membres. */
  confiance: number | null
  maillon: Bloc | null
}

const agregats = new WeakMap<Modele, Map<string, Agregat>>()

/** Statut le plus faible des membres d'un cadre (mémorisé par modèle). */
export function statutAgrege(c: Cadre, m: Modele): Agregat {
  let parCadre = agregats.get(m)
  if (!parCadre) agregats.set(m, (parCadre = new Map()))
  const connu = parCadre.get(c.id)
  if (connu) return connu
  const a = calculerAgregat(c, m)
  parCadre.set(c.id, a)
  return a
}

function calculerAgregat(c: Cadre, m: Modele): Agregat {
  let statut: Statut = 'etabli'
  let aVerifier = 0, invalides = 0
  let confiance: number | null = null
  let maillon: Bloc | null = null
  for (const b of m.blocs.values()) {
    if (b.figure || !b.groupe || !dansCadre(m, b.groupe, c.id)) continue
    const s = b.noeud.statut
    if (RANG_STATUT[s] < RANG_STATUT[statut]) statut = s
    if (s === 'a_verifier') aVerifier++
    if (s === 'invalide') invalides++
    if (b.confiance !== null && (confiance === null || b.confiance < confiance)) {
      confiance = b.confiance
      maillon = b
    }
  }
  return { statut, aVerifier, invalides, confiance, maillon }
}

export function dansCadre(m: Modele, groupe: string, cadre: string): boolean {
  for (let g: string | null = groupe, d = 0; g && d < 50; g = m.cadres.get(g)?.parent ?? null, d++) if (g === cadre) return true
  return false
}

function dessinerFonction(ctx: CanvasRenderingContext2D, e: EtatDessin, c: Cadre, X: (x: number) => number, Y: (y: number) => number): void {
  const f = c.fonction!
  const z = e.cam.z
  const ag = statutAgrege(c, e.modele)
  const t = trait(ag.statut)
  const x0 = Math.round(X(f.x)) + 0.5, y0 = Math.round(Y(f.y)) + 0.5
  const w = Math.round(f.w * z) - 1, h = Math.round(f.h * z) - 1
  const d = 3 * Math.min(1, z * 1.5)
  const cle = CLE_FONCTION + c.id
  const accent = e.survol === cle
  // Copie décalée : plusieurs énoncés derrière.
  ctx.save()
  ctx.fillStyle = PALETTE.surface
  ctx.fillRect(x0 + d, y0 - d, w, h)
  ctx.strokeStyle = rgba(PALETTE.encre, 0.6)
  ctx.lineWidth = 0.7
  ctx.setLineDash(t.motif)
  ctx.strokeRect(x0 + d, y0 - d, w, h)
  ctx.fillRect(x0, y0, w, h)
  ctx.strokeStyle = accent ? PALETTE.accent : t.couleur
  ctx.lineWidth = accent ? 1.4 : 0.9
  ctx.strokeRect(x0, y0, w, h)
  ctx.setLineDash([])
  // Barre de couleur du cadre en haut : le nœud-fonction garde la teinte de sa boîte.
  ctx.fillStyle = rgba(c.teinte, 0.2)
  ctx.fillRect(x0 + 0.5, y0 + 0.5, w - 1, Math.max(2, 4 * z))
  if (t.barre) {
    ctx.strokeStyle = rgba(PALETTE.encre, 0.55)
    ctx.beginPath()
    ctx.moveTo(x0, y0 + h)
    ctx.lineTo(x0 + w, y0)
    ctx.stroke()
  }
  if (z >= 0.3) {
    ctx.strokeStyle = rgba(PALETTE.encre, 0.5)
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(x0 + 6 * z, Y(f.yBroches))
    ctx.lineTo(x0 + w - 6 * z, Y(f.yBroches))
    ctx.moveTo(x0 + 6 * z, Y(f.yPied))
    ctx.lineTo(x0 + w - 6 * z, Y(f.yPied))
    ctx.stroke()
    ctx.strokeStyle = t.couleur
    ctx.fillStyle = t.couleur
    ctx.lineWidth = 0.8
    ctx.beginPath()
    for (const b of f.entrees) {
      const y = Y(b.y)
      ctx.moveTo(x0 + 1, y - 3.2 * z)
      ctx.lineTo(x0 + 6 * z, y)
      ctx.lineTo(x0 + 1, y + 3.2 * z)
      ctx.closePath()
    }
    ctx.stroke()
    ctx.beginPath()
    for (const s of f.sorties) {
      ctx.moveTo(x0 + w - 3.5 * z + 2.2 * z, Y(s.y))
      ctx.arc(x0 + w - 3.5 * z, Y(s.y), 2.2 * z, 0, Math.PI * 2)
    }
    ctx.fill()
  }
  ctx.restore()
}

function dessinerTitreFonction(ctx: CanvasRenderingContext2D, c: Cadre, X: (x: number) => number, Y: (y: number) => number, z: number): void {
  const f = c.fonction!
  const { fs, g } = corpsTitre(z)
  ctx.save()
  ctx.beginPath()
  ctx.rect(X(f.x), Y(f.y), f.w * z, f.h * z)
  ctx.clip()
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillStyle = PALETTE.encre
  ctx.font = `700 ${fs}px ${SERIF}`
  const x0 = X(f.x + 8), y0 = Y(f.y + 8)
  ctx.fillText(`Sous-problème ${c.numero}`, x0, y0)
  ctx.font = `400 ${fs}px ${SERIF}`
  lignes(`${texteBrut(c.nom)} — réduit, ${c.enonces} énoncés`, (f.w - 16) / g, 1).forEach((l, k) => ctx.fillText(l, x0, y0 + (k + 1) * CORPS * 1.2 * z * g))
  ctx.restore()
}

// ─── Figures ─────────────────────────────────────────────────────────────────

/** « Lemme 7 » : référence du nœud illustré par une figure (null s'il n'est pas dans le graphe). */
export function referenceDe(m: Modele, noeudId: string): string | null {
  const b = m.blocs.get(noeudId)
  return b && !b.figure ? `${b.libelle} ${b.numero}` : null
}

function cleFigure(b: Bloc, m: Modele): string {
  const f = b.figure!
  return `${b.id}|${b.numero}|${f.titre}|${f.modifie_le}|${b.w}|${b.h}|${referenceDe(m, f.noeud_id) ?? ''}`
}

/** Cadre de la figure, puis (niveau « contenu ») son tracé ou son image ; de loin, une icône. */
function dessinerFigure(ctx: CanvasRenderingContext2D, e: EtatDessin, b: Bloc, X: (x: number) => number, Y: (y: number) => number, niveau: Niveau, estompe: boolean): void {
  const z = e.cam.z
  const f = b.figure!
  const x0 = Math.round(X(b.x)) + 0.5, y0 = Math.round(Y(b.y)) + 0.5
  const w = Math.round(b.w * z) - 1, h = Math.round(b.h * z) - 1
  const choisi = e.selection.has(b.id) || !!e.surlignes?.has(b.id)
  const conflit = !!e.conflits?.has(b.id)
  const survole = e.survol === b.id
  ctx.save()
  if (estompe) ctx.globalAlpha = 0.3
  ctx.fillStyle = PALETTE.surface
  ctx.fillRect(x0, y0, w, h)
  if (niveau === 'contenu') {
    const g = geometrieBloc(f, b.w, b.h)
    ctx.save()
    ctx.beginPath()
    ctx.rect(x0, y0, w, h)
    ctx.clip()
    ctx.translate(X(b.x), Y(b.y))
    ctx.scale(z, z)
    if (f.trace) dessinerTrace(ctx, f.trace, g, z)
    else if (f.image) dessinerImage(ctx, f, g, e.images?.obtenir(f) ?? null)
    ctx.restore()
  } else {
    const t = Math.min(b.h - TETE_FIGURE - 16, b.w * 0.3, 70) * z
    if (t > 8) dessinerIcone(ctx, x0 + w / 2, y0 + (TETE_FIGURE * z + h) / 2, t, !f.trace)
  }
  ctx.strokeStyle = conflit ? PALETTE.erreur : choisi || survole ? PALETTE.accent : COULEURS_FIGURE.cadre
  ctx.lineWidth = conflit || choisi ? 1.6 : survole ? 1.4 : 0.8
  ctx.strokeRect(x0, y0, w, h)
  // Filet sous le bandeau du titre.
  if (z >= 0.3) {
    const yf = Math.round(Y(b.y + TETE_FIGURE)) + 0.5
    ctx.strokeStyle = '#d6d6d6'
    ctx.lineWidth = 0.6
    ctx.beginPath()
    ctx.moveTo(x0 + 6 * z, yf)
    ctx.lineTo(x0 + w - 6 * z, yf)
    ctx.stroke()
  }
  ctx.restore()
}

/** Titre d'une figure sur le canevas (vue intermédiaire, ou en attendant le HTML). */
function dessinerTitreFigure(ctx: CanvasRenderingContext2D, b: Bloc, X: (x: number) => number, Y: (y: number) => number, z: number, estompe: boolean): void {
  const { fs } = corpsTitre(z)
  ctx.save()
  ctx.beginPath()
  ctx.rect(X(b.x), Y(b.y), b.w * z, b.h * z)
  ctx.clip()
  if (estompe) ctx.globalAlpha = 0.3
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = PALETTE.encre
  const x0 = X(b.x + 8), ym = Y(b.y + TETE_FIGURE / 2)
  // Petites capitales imitées : la capitale, puis le reste en capitales réduites.
  ctx.font = `400 ${fs}px ${SERIF}`
  ctx.fillText('F', x0, ym)
  let x = x0 + ctx.measureText('F').width
  ctx.font = `400 ${fs * 0.78}px ${SERIF}`
  ctx.fillText('IGURE', x, ym)
  x += ctx.measureText('IGURE').width
  ctx.font = `400 ${fs}px ${SERIF}`
  const suite = ` ${b.numero} — ${texteBrut(b.figure!.titre)}`
  ctx.fillText(tronquer(ctx, suite, X(b.x + b.w - 8) - x), x, ym)
  ctx.restore()
}

/** Pointillé gris fin du nœud illustré (ou du cadre réduit qui le cache) vers chaque figure visible. */
function dessinerAttaches(ctx: CanvasRenderingContext2D, e: EtatDessin, vue: Rect, X: (x: number) => number, Y: (y: number) => number): void {
  const m = e.modele
  const segments: { accent: boolean; pts: number[] }[] = []
  for (const b of m.blocs.values()) {
    if (!b.figure || b.cache) continue
    const rep = m.representant.get(b.figure.noeud_id)
    if (!rep) continue
    let r: Rect | null = null
    if (rep.startsWith(CLE_FONCTION)) {
      const fo = m.cadres.get(rep.slice(CLE_FONCTION.length))?.fonction
      if (fo) r = { x0: fo.x, y0: fo.y, x1: fo.x + fo.w, y1: fo.y + fo.h }
    } else {
      const n = m.blocs.get(rep)
      if (n) r = { x0: n.x, y0: n.y, x1: n.x + n.w, y1: n.y + n.h }
    }
    if (!r) continue
    const fr: Rect = { x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h }
    const xm = (Math.max(fr.x0, r.x0) + Math.min(fr.x1, r.x1)) / 2
    let pts: number[] | null = null
    if (fr.x0 >= r.x1) pts = [r.x1, (r.y0 + r.y1) / 2, fr.x0, (fr.y0 + fr.y1) / 2]
    else if (fr.x1 <= r.x0) pts = [r.x0, (r.y0 + r.y1) / 2, fr.x1, (fr.y0 + fr.y1) / 2]
    else if (fr.y0 >= r.y1) pts = [xm, r.y1, xm, fr.y0]
    else if (fr.y1 <= r.y0) pts = [xm, r.y0, xm, fr.y1]
    if (!pts) continue
    const bbox = { x0: Math.min(pts[0]!, pts[2]!), y0: Math.min(pts[1]!, pts[3]!), x1: Math.max(pts[0]!, pts[2]!), y1: Math.max(pts[1]!, pts[3]!) }
    if (!coupe(bbox, vue)) continue
    const accent = e.selection.has(b.id) || e.survol === b.id || e.selection.has(rep) || e.survol === rep
    segments.push({ accent, pts })
  }
  if (!segments.length) return
  ctx.save()
  ctx.lineWidth = Math.max(0.7, Math.min(1, 0.9 * e.cam.z))
  ctx.setLineDash([1.5, 3])
  for (const accent of [false, true]) {
    ctx.strokeStyle = accent ? PALETTE.accent : PALETTE.grisClair
    ctx.beginPath()
    for (const s of segments) {
      if (s.accent !== accent) continue
      ctx.moveTo(X(s.pts[0]!), Y(s.pts[1]!))
      ctx.lineTo(X(s.pts[2]!), Y(s.pts[3]!))
    }
    ctx.stroke()
  }
  ctx.restore()
}

// ─── Composition HTML (niveau « contenu ») ───────────────────────────────────

const VALIDITE_COURTE = { valide: 'vérifiée', a_verifier: 'à vérifier', invalide: 'refusée' } as const

const texEnCache = new Map<string, string>()
function texDe(enonce: string): string {
  let t = texEnCache.get(enonce)
  if (t === undefined) {
    t = formulesAffichees(enonce)
    if (texEnCache.size > 5000) texEnCache.clear()
    texEnCache.set(enonce, t)
  }
  return t
}

export function cleBloc(b: Bloc): string {
  const n = b.noeud
  return `${b.id}|${b.numero}|${b.libelle}|${n.nom}|${n.enonce}|${n.statut}|${b.w}|${b.h}|${b.validite}|${b.confiance}|${b.portee?.size ?? ''}|${JSON.stringify(n.details ?? '')}`
}

function piedBloc(b: Bloc): string {
  const n = b.noeud
  const gauche = b.confiance !== null
    ? `<span class="gr-conf">${rendreTex(texConfiance(b.confiance), `c = ${b.confiance.toFixed(2)}`)}</span>`
    : n.admis ? '<span class="gr-doux"><i>admis</i></span>' : '<span class="gr-doux"><i>non jugé</i></span>'
  const droite = b.validite ? VALIDITE_COURTE[b.validite] : n.demonstrations.length ? '' : n.admis ? '' : 'sans démonstration'
  return `<div class="gr-pied">${gauche}<span class="gr-valid">${droite} · ${LIBELLE_STATUT[n.statut]}</span></div>`
}

export function htmlBloc(b: Bloc): string {
  const n = b.noeud
  if (b.hypothese) {
    // Présentation de R37 : un paragraphe \newtheorem, tête grasse, nom entre parenthèses, corps italique.
    const d = n.details as { hypothese?: unknown; portee?: unknown } | null
    const texte = typeof d?.hypothese === 'string' && d.hypothese ? d.hypothese : n.enonce
    const portee = b.portee?.size ?? 0
    const precision = typeof d?.portee === 'string' && d.portee ? ` — ${echapper(d.portee)}` : ''
    return `<div class="gr-corps"><div class="gr-corps-int"><p class="gr-hyp"><span class="gr-type">Hypothèse <span class="gr-num">${echapper(b.numero)}</span></span> `
      + `<span>(${enLigne(n.nom)}).</span> <span class="gr-hyp-texte">${enLigne(texte)}</span></p></div></div>`
      + `<div class="gr-pied gr-pied-hyp"><span>portée : ${portee} énoncé${portee === 1 ? '' : 's'}${precision}</span></div>`
  }
  const tex = texDe(n.enonce)
  const corps = tex
    ? `<div class="gr-formule"><span class="gr-f">${rendreTex(tex, n.enonce, true)}</span></div>`
    : `<div class="gr-prose">${enLigne(n.enonce)}</div>`
  return `<div class="gr-corps"><div class="gr-corps-int"><div class="gr-tete"><span class="gr-type">${echapper(b.libelle)} <span class="gr-num">${echapper(b.numero)}</span></span> (${enLigne(n.nom)}).</div>${corps}</div></div>`
    + piedBloc(b)
}

export function cleFonction(c: Cadre, m: Modele): string {
  const f = c.fonction!
  const ag = statutAgrege(c, m)
  return `${CLE_FONCTION}${c.id}|${c.nom}|${c.numero}|${c.enonces}|${f.w}|${f.h}|${f.entrees.map((x) => x.id).join(',')}>${f.sorties.map((x) => x.id).join(',')}|${f.plus}|${ag.statut}|${ag.aVerifier}|${ag.invalides}|${ag.confiance}`
}

export function htmlFonction(c: Cadre, m: Modele): string {
  const f = c.fonction!
  const ag = statutAgrege(c, m)
  const ligne = (y: number, t: string, droite: boolean) =>
    `<div class="gr-rangee${droite ? ' gr-droite' : ''}" style="top:${(y - f.y - FONCTION.rangee / 2).toFixed(1)}px;height:${FONCTION.rangee}px;line-height:${FONCTION.rangee}px">${t}</div>`
  const nomDe = (id: string) => {
    if (id.startsWith(CLE_FONCTION)) {
      const autre = m.cadres.get(id.slice(CLE_FONCTION.length))
      return `<span class="gr-doux">cf.</span> ${echapper(autre?.numero ?? '?')} <span class="gr-doux">(${enLigne(autre?.nom ?? '')})</span>`
    }
    const b = m.blocs.get(id)
    return `<span class="gr-doux">cf.</span> ${echapper(b?.numero ?? '?')} <span class="gr-doux">(${enLigne(b?.noeud.nom ?? id)})</span>`
  }
  const entrees = f.entrees.map((b) => ligne(b.y, nomDe(b.id), false)).join('')
  const sorties = f.sorties.map((s) => ligne(s.y, enLigne(m.blocs.get(s.id)?.noeud.nom ?? s.id), true)).join('')
  const detail = [ag.aVerifier ? `${ag.aVerifier} à vérifier` : '', ag.invalides ? `${ag.invalides} invalide${ag.invalides > 1 ? 's' : ''}` : '']
    .filter(Boolean).join(', ')
  const plus = f.plus ? ` · +${f.plus} broche${f.plus > 1 ? 's' : ''}` : ''
  const conf = ag.confiance !== null ? `min ${rendreTex(texConfiance(ag.confiance), ag.confiance.toFixed(2))}` : ''
  return `<div class="gr-tete-f" style="height:${FONCTION.tete}px"><span class="gr-type">Sous-problème <span class="gr-num">${echapper(c.numero)}</span></span> (${enLigne(c.nom)})`
    + ` <span class="gr-doux">— réduit, ${c.enonces} énoncé${c.enonces > 1 ? 's' : ''}</span>.</div>${entrees}${sorties}`
    + `<div class="gr-pied"><span>${detail || (ag.statut === 'etabli' ? 'tous établis' : LIBELLE_STATUT[ag.statut])}${plus}</span><span class="gr-conf">${conf}</span></div>`
}
