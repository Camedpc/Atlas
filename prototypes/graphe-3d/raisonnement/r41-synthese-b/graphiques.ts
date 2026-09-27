// R41 · Graphiques « pgfplots » repris de R35 (règle de construction, style, dessin sur le canvas), plus la
// règle des FIGURES CLÉS (voir `figuresCles`) : seules les figures clés sont affichées d'office, les autres
// le sont à la demande (renvoi « fig. n » sous le bloc, ou panneau ☰).
//
// Règle de construction (générique, aucun identifiant de jeu) :
//
//   1. Lois. Chaque énoncé actif et non réfuté fournit ses formules (lois.ts). Une formule est une loi
//      traçable si elle s'écrit « Y / X = f » (rapport : Y = X·f) ou « Y = f » avec Y symbole ou puissance
//      de symbole (« v² ») et f une expression arithmétique (nombres, symboles, + − · / ², parenthèses).
//   2. Données. Séries du champ optionnel `mesures` (mesures.ts) ; pentes déclarées dans les énoncés
//      (« h₁ / h₂ = 0,13 ± 0,03 », « pente de v² contre h₂ : 11,4 ± 0,6 ») ; plages « X de a à b ».
//      Une loi devient une figure quand une série ou une pente porte sur le même couple (X, Y) ; pour une
//      loi explicite, X est la variable de la série, qui doit figurer dans f.
//   3. Paramètres. Tout autre symbole de f prend une valeur « symbole (= | ≈) nombre [± σ] » lue dans les
//      énoncés, en écartant les énoncés qui dépendent des mesures tracées (la prédiction doit en être
//      indépendante, sinon la confrontation est circulaire) et les pistes abandonnées ou réfutées. Priorité :
//      valeur hors parenthèses, puis type (résultat, observation, calcul, expérience, autre), puis l'énoncé
//      le plus récent. Sans valeur pour un paramètre, pas de figure.
//   4. Bande ±1σ : f évaluée aux coins du pavé des incertitudes des paramètres.
//
// Figures clés (R41, générique) : une figure est candidate si elle confronte une loi à des MESURES (série
// du champ `mesures`) ; une loi seulement confrontée à une pente déclarée ne l'est pas. Les candidates sont
// classées par (a) la loi est un résultat majeur (théorème / résultat non admis), (b) le nombre d'énoncés
// qui dépendent de la loi dans le graphe complet (poids dans le raisonnement), (c) le nombre de points
// mesurés. Les `max` premières (2 par défaut, 3 au plus) sont affichées d'office ; les autres, et celles
// qui ne sont pas candidates, restent disponibles à la demande.
//
// Rendu : style pgfplots par défaut (axe encadré, graduations vers l'intérieur sur les quatre côtés, pas de
// grille, Computer Modern, virgule décimale, légende en haut à gauche), noir et gris seulement : la
// prédiction est en trait plein noir (R41 garde le bleu pour l'interaction).

import { dependantsDe, type GrapheJustification, type NoeudR, type TypeRaisonnement } from '../../src/raisonnement'
import {
  analyserLoi, evaluer, EXPOSANTS, extraireFormules, extrairePentes, extraireValeurs, INDICES, lettreGrasse, symbolesExpr,
  type Loi, type PenteDeclaree, type Valeur,
} from './lois'
import type { SerieMesuree } from './mesures'


/** Computer Modern (fontes de KaTeX), comme le reste de la figure. */
export const ROMAN = `KaTeX_Main, 'Latin Modern Roman', 'CMU Serif', 'Computer Modern Serif', 'Times New Roman', serif`

// ─── Mathématiques sur canvas ────────────────────────────────────────────────

const LETTRE_ITALIQUE = /^[A-Za-zα-ωϑϕϵ]$/u
const OPERATEUR = /^[=≈≃≠<>≤≥→∝≡⇒+−±∓×·]$/u

/**
 * Dessine (ou mesure) une petite formule unicode en ligne : variables en italique, chiffres et opérateurs
 * droits, indices (₀…, _x) et exposants (²…) réduits. Ligne de base en `y`, aligné à gauche en `x`.
 * Renvoie la largeur.
 */
export function dessinerMath(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, taille: number, dessiner = true): number {
  const c = [...s]
  let w = 0
  const poser = (t: string, style: 'italic' | 'normal' | 'bold', k: number, dy: number) => {
    ctx.font = `${style === 'italic' ? 'italic 400' : style === 'bold' ? '700' : '400'} ${taille * k}px ${ROMAN}`
    if (dessiner) ctx.fillText(t, x + w, y + dy)
    w += ctx.measureText(t).width
  }
  for (let i = 0; i < c.length; i++) {
    const ch = c[i]!
    if (INDICES[ch] !== undefined) {
      const t = INDICES[ch]!
      poser(/[a-z]/.test(t) ? t : t.replace('-', '−'), /[a-z]/.test(t) ? 'italic' : 'normal', 0.7, taille * 0.22)
    } else if (EXPOSANTS[ch] !== undefined) {
      poser(EXPOSANTS[ch]!.replace('-', '−'), 'normal', 0.7, -taille * 0.38)
    } else if (ch === '_' && c[i + 1]) {
      poser(c[++i]!, LETTRE_ITALIQUE.test(c[i]!) ? 'italic' : 'normal', 0.7, taille * 0.22)
    } else if (lettreGrasse(ch)) poser(lettreGrasse(ch)!, 'bold', 1, 0)
    else if (LETTRE_ITALIQUE.test(ch)) poser(ch, 'italic', 1, 0)
    else if (OPERATEUR.test(ch)) poser(ch, 'normal', 1, 0)
    else if (ch === ' ') w += taille * 0.24
    else poser(ch, 'normal', 1, 0)
  }
  return w
}

// ─── Texte riche (légendes) ──────────────────────────────────────────────────

/** Mot d'une légende : morceaux de texte romain et de mathématiques ($…$), sans espace entre eux. */
type MotRiche = { math: boolean; t: string }[]

function motsRiches(texte: string): MotRiche[] {
  const mots: MotRiche[] = []
  let mot: MotRiche = []
  let courant = ''
  let math = false
  const pousser = () => {
    if (courant) mot.push({ math, t: courant })
    courant = ''
  }
  for (const ch of texte) {
    if (ch === '$') {
      pousser()
      math = !math
    } else if (ch === ' ' && !math) {
      pousser()
      if (mot.length) mots.push(mot)
      mot = []
    } else courant += ch
  }
  pousser()
  if (mot.length) mots.push(mot)
  return mots
}

function largeurMot(ctx: CanvasRenderingContext2D, m: MotRiche, taille: number): number {
  let w = 0
  for (const p of m) {
    if (p.math) w += dessinerMath(ctx, p.t, 0, 0, taille, false)
    else {
      ctx.font = `400 ${taille}px ${ROMAN}`
      w += ctx.measureText(p.t).width
    }
  }
  return w
}

/** Coupe une légende en lignes (au plus `max`, la dernière terminée par « … » si le texte déborde). */
export function couperRiche(ctx: CanvasRenderingContext2D, texte: string, largeur: number, taille: number, max: number): MotRiche[][] {
  ctx.font = `400 ${taille}px ${ROMAN}`
  const espace = ctx.measureText(' ').width
  const lignes: MotRiche[][] = []
  let ligne: MotRiche[] = []
  let w = 0
  for (const m of motsRiches(texte)) {
    const lm = largeurMot(ctx, m, taille)
    if (ligne.length && w + espace + lm > largeur) {
      lignes.push(ligne)
      ligne = []
      w = 0
    }
    w += (ligne.length ? espace : 0) + lm
    ligne.push(m)
  }
  if (ligne.length) lignes.push(ligne)
  if (lignes.length > max) {
    lignes.length = max
    lignes[max - 1]!.push([{ math: false, t: '…' }])
  }
  return lignes
}

/** Dessine une ligne de texte riche, alignée à gauche (ligne de base en y). */
export function dessinerRiche(ctx: CanvasRenderingContext2D, ligne: MotRiche[], x: number, y: number, taille: number): void {
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `400 ${taille}px ${ROMAN}`
  const espace = ctx.measureText(' ').width
  let cx = x
  for (const m of ligne) {
    for (const p of m) {
      if (p.math) cx += dessinerMath(ctx, p.t, cx, y, taille)
      else {
        ctx.font = `400 ${taille}px ${ROMAN}`
        ctx.fillText(p.t, cx, y)
        cx += ctx.measureText(p.t).width
      }
    }
    cx += espace
  }
}


export interface ValeurSource extends Valeur {
  noeud: number
}

export interface Figure {
  cle: string
  /** Nœud qui énonce la loi (ancre de la figure). */
  noeudLoi: number
  loi: Loi
  x: string
  y: string
  uniteX: string
  uniteY: string
  parametres: ValeurSource[]
  series: { noeud: number; serie: SerieMesuree }[]
  pente: (PenteDeclaree & { noeud: number }) | null
  prediction: (x: number) => number
  bande: ((x: number) => [number, number]) | null
  xmin: number
  xmax: number
  ymin: number
  ymax: number
  ticksX: number[]
  ticksY: number[]
  decX: number
  decY: number
  /** Les mesures tracées sont-elles déclarées illustratives (note de la série ou énoncé) ? */
  illustratives: boolean
}

const RANG_TYPE: Partial<Record<TypeRaisonnement, number>> = { resultat: 0, observation: 1, calcul: 2, experience: 3 }
const RE_PLAGE = /(?<![\p{L}\p{N}_])((?:[A-Za-z]|[α-ωΑ-Ω])′*(?:[₀-₉ₐ-ₜ]+)?) de (\d+(?:,\d+)?) à (\d+(?:,\d+)?)(?:\s*(m|s|kg|cm|mm|Hz|K))?/gu

const actif = (n: NoeudR) => n.piste === 'active' && n.statut !== 'refute'
const mesuresDuNoeud = (n: NoeudR): SerieMesuree[] | undefined => (n as NoeudR & { mesures?: SerieMesuree[] }).mesures

/** Toutes les valeurs numériques lues dans les énoncés (pour le panneau et les paramètres). */
export function valeursDuJeu(j: GrapheJustification): ValeurSource[] {
  const r: ValeurSource[] = []
  j.noeuds.forEach((n, i) => {
    if (!actif(n)) return
    for (const v of extraireValeurs(n.enonce)) r.push({ ...v, noeud: i })
  })
  return r
}

function meilleureValeur(j: GrapheJustification, valeurs: ValeurSource[], symbole: string, exclus: Set<number>): ValeurSource | null {
  const c = valeurs.filter((v) => v.symbole === symbole && !exclus.has(v.noeud))
  c.sort((a, b) =>
    Number(a.aparte) - Number(b.aparte)
    || (RANG_TYPE[j.noeuds[a.noeud]!.type] ?? 4) - (RANG_TYPE[j.noeuds[b.noeud]!.type] ?? 4)
    || b.noeud - a.noeud)
  return c[0] ?? null
}

// ─── Graduations ─────────────────────────────────────────────────────────────

function pasGraduation(etendue: number, cible = 5): number {
  const brut = etendue / Math.max(1, cible - 1)
  const p = 10 ** Math.floor(Math.log10(brut))
  const m = brut / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p
}

function decimalesDe(pas: number): number {
  for (let d = 0; d < 4; d++) if (Math.abs(Math.round(pas * 10 ** d) - pas * 10 ** d) < 1e-9) return d
  return 4
}

function axe(min: number, maxDonnees: number): { max: number; ticks: number[]; dec: number } {
  const pas = pasGraduation(maxDonnees - min)
  const max = Math.ceil((min + (maxDonnees - min) * 1.06) / pas - 1e-9) * pas
  const ticks: number[] = []
  for (let v = min; v <= max + pas * 1e-6; v += pas) ticks.push(Math.round(v / pas) * pas)
  return { max, ticks, dec: decimalesDe(pas) }
}

/** Nombre au format français, sans zéros inutiles sauf `dec` imposé. */
export function fr(v: number, dec?: number): string {
  const d = dec ?? Math.min(3, (String(Math.round(v * 1000) / 1000).split('.')[1] ?? '').length)
  return v.toFixed(d).replace('-', '−').replace('.', ',')
}

function decimalesValeur(v: Valeur): number {
  const n = (x: number) => Math.min(3, (String(Math.round(x * 1000) / 1000).split('.')[1] ?? '').length)
  return v.sigma ? Math.max(n(v.sigma), n(v.valeur)) : n(v.valeur)
}

export function texteValeur(v: Valeur): string {
  const d = decimalesValeur(v)
  return `${v.symbole} = ${fr(v.valeur, d)}${v.sigma ? ` ± ${fr(v.sigma, d)}` : ''}`
}

// ─── Construction ────────────────────────────────────────────────────────────

/** Figures d'un jeu (voir la règle en tête du fichier). `table` : mesures du dossier (id → séries). */
export function construireFigures(j: GrapheJustification, table: Record<string, SerieMesuree[]> = {}): Figure[] {
  const valeurs = valeursDuJeu(j)
  // Séries mesurées.
  const series: { noeud: number; serie: SerieMesuree }[] = []
  j.noeuds.forEach((n, i) => {
    if (!actif(n)) return
    for (const s of mesuresDuNoeud(n) ?? table[n.id] ?? []) series.push({ noeud: i, serie: s })
  })
  // Pentes déclarées et plages.
  const pentes: (PenteDeclaree & { noeud: number })[] = []
  const plages = new Map<string, { a: number; b: number; unite: string }>()
  j.noeuds.forEach((n, i) => {
    if (!actif(n)) return
    for (const p of extrairePentes(n.enonce)) pentes.push({ ...p, noeud: i })
    for (const m of n.enonce.matchAll(RE_PLAGE)) {
      if (!plages.has(m[1]!)) plages.set(m[1]!, { a: Number(m[2]!.replace(',', '.')), b: Number(m[3]!.replace(',', '.')), unite: m[4] ?? '' })
    }
  })

  const figures: Figure[] = []
  const vues = new Set<string>()
  j.noeuds.forEach((n, i) => {
    if (!actif(n)) return
    for (const f of extraireFormules(n.enonce, 3)) {
      const loi = analyserLoi(f)
      if (!loi) continue
      const libres = symbolesExpr(loi.droite)
      // Couples (X, Y) candidats : ceux des séries et des pentes.
      const couples = new Map<string, { x: string; y: string }>()
      for (const s of series) couples.set(`${s.serie.x}|${s.serie.y}`, { x: s.serie.x, y: s.serie.y })
      for (const p of pentes) couples.set(`${p.x}|${p.y}`, { x: p.x, y: p.y })
      for (const { x, y } of couples.values()) {
        if (y !== loi.y) continue
        if (loi.forme === 'rapport' ? loi.x !== x : !libres.has(x)) continue
        const cle = `${i}|${x}|${y}`
        if (vues.has(cle)) continue
        const ss = series.filter((s) => s.serie.x === x && s.serie.y === y && s.noeud !== i)
        const noeudsMesure = new Set(ss.map((s) => s.noeud))
        const pente = pentes.find((p) => p.x === x && p.y === y && noeudsMesure.has(p.noeud))
          ?? pentes.find((p) => p.x === x && p.y === y && p.noeud !== i) ?? null
        if (pente) noeudsMesure.add(pente.noeud)
        if (!ss.length && !pente) continue
        // Paramètres : indépendants des mesures tracées.
        const exclus = new Set<number>(noeudsMesure)
        for (const m of noeudsMesure) for (const d of dependantsDe(j, m)) exclus.add(d)
        const parametres: ValeurSource[] = []
        let complet = true
        for (const s of libres) {
          if (s === x) continue
          const v = meilleureValeur(j, valeurs, s, exclus)
          if (!v) {
            complet = false
            break
          }
          parametres.push(v)
        }
        if (!complet) continue
        vues.add(cle)
        const fig = assembler(j, i, loi, x, y, parametres, ss, pente, plages.get(x))
        if (fig) figures.push(fig)
      }
    }
  })
  return figures
}

function assembler(
  j: GrapheJustification, noeudLoi: number, loi: Loi, x: string, y: string, parametres: ValeurSource[],
  series: { noeud: number; serie: SerieMesuree }[], pente: (PenteDeclaree & { noeud: number }) | null,
  plage: { a: number; b: number; unite: string } | undefined,
): Figure | null {
  const env = (vals: Map<string, number>) => (s: string) => vals.get(s) ?? NaN
  const base = new Map(parametres.map((p) => [p.symbole, p.valeur]))
  const f = (vals: Map<string, number>) => (xv: number) => {
    const m = new Map(vals)
    m.set(x, xv)
    const r = evaluer(loi.droite, env(m))
    return loi.forme === 'rapport' ? xv * r : r
  }
  const prediction = f(base)
  // Bande : coins du pavé des incertitudes (au plus 4 paramètres incertains).
  const incertains = parametres.filter((p) => p.sigma > 0).slice(0, 4)
  let bande: Figure['bande'] = null
  if (incertains.length) {
    const coins: ((x: number) => number)[] = []
    for (let k = 0; k < 1 << incertains.length; k++) {
      const m = new Map(base)
      incertains.forEach((p, b) => m.set(p.symbole, p.valeur + ((k >> b) & 1 ? p.sigma : -p.sigma)))
      coins.push(f(m))
    }
    bande = (xv) => {
      let a = Infinity, b = -Infinity
      for (const c of coins) {
        const v = c(xv)
        if (Number.isFinite(v)) {
          a = Math.min(a, v)
          b = Math.max(b, v)
        }
      }
      return [a, b]
    }
  }
  // Domaine.
  const xs = series.flatMap((s) => s.serie.points.map((p) => p[0]))
  if (!xs.length && plage) xs.push(plage.a, plage.b)
  if (!xs.length) xs.push(1)
  const xmaxD = Math.max(...xs)
  const xmin = Math.min(0, ...xs)
  const ax = axe(xmin, xmaxD)
  const ysD = series.flatMap((s) => s.serie.points.map((p) => p[1] + p[2]))
  ysD.push(prediction(xmaxD))
  if (bande) ysD.push(bande(xmaxD)[1])
  if (pente) ysD.push(pente.valeur * xmaxD)
  const ymaxD = Math.max(...ysD.filter(Number.isFinite))
  if (!Number.isFinite(ymaxD) || ymaxD <= 0 || !Number.isFinite(prediction(xmaxD))) return null
  const ymin = Math.min(0, ...series.flatMap((s) => s.serie.points.map((p) => p[1] - p[2])))
  const ay = axe(ymin, ymaxD)
  const illustratives = series.some((s) => /illustrati/i.test(s.serie.note ?? '') || /illustrati/i.test(j.noeuds[s.noeud]!.enonce))
    || (!!pente && /illustrati/i.test(j.noeuds[pente.noeud]!.enonce))
  return {
    cle: `${noeudLoi}|${x}|${y}`, noeudLoi, loi, x, y,
    uniteX: series[0]?.serie.uniteX ?? plage?.unite ?? '', uniteY: series[0]?.serie.uniteY ?? '',
    parametres, series, pente, prediction, bande,
    xmin, xmax: ax.max, ymin, ymax: ay.max, ticksX: ax.ticks, ticksY: ay.ticks, decX: ax.dec, decY: ay.dec,
    illustratives,
  }
}

/** Légende (\caption) : texte riche, mathématiques entre $…$ ; `ref(i)` donne le repère du bloc d'un nœud. */
export function legendeFigure(fig: Figure, numero: number, ref: (i: number) => string | null): string {
  const r = (i: number) => {
    const t = ref(i)
    return t ? ` (${t})` : ''
  }
  const params = fig.parametres.map((p) => `$${texteValeur(p)}$${r(p.noeud)}`)
  const morceaux = [`Figure ${numero} – $${fig.y}$ en fonction de $${fig.x}$. Trait plein : prédiction${r(fig.noeudLoi)}${params.length ? `, ${params.join(', ')}` : ''}`]
  if (fig.bande) morceaux.push('pointillés : ±1σ')
  if (fig.series.length) {
    const refs = [...new Set(fig.series.map((s) => ref(s.noeud)).filter(Boolean))]
    morceaux.push(`points : mesures${refs.length ? ` (${refs.join(', ')})` : ''}${fig.illustratives ? ', illustratives' : ''}`)
  }
  if (fig.pente) {
    const d = decimalesValeur({ symbole: '', valeur: fig.pente.valeur, sigma: fig.pente.sigma, aparte: false })
    morceaux.push(`tirets : pente déclarée $${fr(fig.pente.valeur, d)}${fig.pente.sigma ? ` ± ${fr(fig.pente.sigma, d)}` : ''}$${r(fig.pente.noeud)}`)
  }
  return `${morceaux.join(' ; ')}.`
}

// ─── Géométrie et rendu ──────────────────────────────────────────────────────

const MARGE_G = 30, MARGE_D = 5, HAUT = 3, SOUS_AXE = 22
const TAILLE_LEGENDE = 7, INTERLIGNE = 8.6, LIGNES_LEGENDE = 5

export function geometrieFigure(W: number): { bx: number; bw: number; bh: number; h: number } {
  const bw = W - MARGE_G - MARGE_D
  const bh = Math.round(bw * 0.66)
  return { bx: MARGE_G, bw, bh, h: HAUT + bh + SOUS_AXE + LIGNES_LEGENDE * INTERLIGNE + 3 }
}

export interface CouleursFigure {
  encre: string
  gris: string
  surface: string
  /** blue!60!black. */
  prediction: string
}

/**
 * Dessine une figure dans le repère local du bloc (px de mise en page) : coin haut gauche (x0, y0),
 * largeur W. Le contexte est déjà translaté et mis à l'échelle.
 */
export function dessinerFigure(ctx: CanvasRenderingContext2D, fig: Figure, legende: string, x0: number, y0: number, W: number, C: CouleursFigure): void {
  const g = geometrieFigure(W)
  const bx = x0 + g.bx, by = y0 + HAUT, bw = g.bw, bh = g.bh
  const X = (v: number) => bx + ((v - fig.xmin) / (fig.xmax - fig.xmin)) * bw
  const Y = (v: number) => by + bh - ((v - fig.ymin) / (fig.ymax - fig.ymin)) * bh
  ctx.save()
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'
  // Fond blanc de la figure (sous les liaisons éventuelles).
  ctx.fillStyle = C.surface
  ctx.fillRect(x0, y0, W, g.h)

  // Tracés, découpés au cadre de l'axe.
  ctx.save()
  ctx.beginPath()
  ctx.rect(bx, by, bw, bh)
  ctx.clip()
  const N = 48
  const courbe = (fn: (x: number) => number) => {
    ctx.beginPath()
    let debut = true
    for (let k = 0; k <= N; k++) {
      const xv = fig.xmin + ((fig.xmax - fig.xmin) * k) / N
      const yv = fn(xv)
      if (!Number.isFinite(yv)) {
        debut = true
        continue
      }
      if (debut) ctx.moveTo(X(xv), Y(yv))
      else ctx.lineTo(X(xv), Y(yv))
      debut = false
    }
    ctx.stroke()
  }
  if (fig.bande) {
    const b = fig.bande
    ctx.strokeStyle = C.prediction
    ctx.lineWidth = 0.55
    ctx.setLineDash([0.8, 1.6])
    courbe((x) => b(x)[0])
    courbe((x) => b(x)[1])
    ctx.setLineDash([])
  }
  if (fig.pente) {
    const p = fig.pente
    ctx.strokeStyle = C.gris
    ctx.lineWidth = 0.6
    ctx.setLineDash([3, 2])
    courbe((x) => p.valeur * x)
    ctx.setLineDash([])
  }
  ctx.strokeStyle = C.prediction
  ctx.lineWidth = 0.95
  courbe(fig.prediction)
  // Mesures : barres d'erreur (avec taquets) puis marques pleines.
  ctx.strokeStyle = C.encre
  ctx.fillStyle = C.encre
  ctx.lineWidth = 0.55
  for (const s of fig.series) {
    for (const [xv, yv, e] of s.serie.points) {
      const px = X(xv)
      ctx.beginPath()
      ctx.moveTo(px, Y(yv - e))
      ctx.lineTo(px, Y(yv + e))
      ctx.moveTo(px - 1.6, Y(yv - e))
      ctx.lineTo(px + 1.6, Y(yv - e))
      ctx.moveTo(px - 1.6, Y(yv + e))
      ctx.lineTo(px + 1.6, Y(yv + e))
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(px, Y(yv), 1.35, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()

  // Cadre et graduations vers l'intérieur, sur les quatre côtés (pgfplots par défaut).
  ctx.strokeStyle = C.encre
  ctx.lineWidth = 0.6
  ctx.strokeRect(bx, by, bw, bh)
  ctx.beginPath()
  const t = 2.6
  for (const v of fig.ticksX) {
    const px = X(v)
    if (px < bx - 0.1 || px > bx + bw + 0.1) continue
    ctx.moveTo(px, by + bh)
    ctx.lineTo(px, by + bh - t)
    ctx.moveTo(px, by)
    ctx.lineTo(px, by + t)
  }
  for (const v of fig.ticksY) {
    const py = Y(v)
    if (py < by - 0.1 || py > by + bh + 0.1) continue
    ctx.moveTo(bx, py)
    ctx.lineTo(bx + t, py)
    ctx.moveTo(bx + bw, py)
    ctx.lineTo(bx + bw - t, py)
  }
  ctx.stroke()
  // Étiquettes des graduations (chiffres droits, virgule décimale).
  ctx.fillStyle = C.encre
  ctx.font = `400 6.6px ${ROMAN}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (const v of fig.ticksX) ctx.fillText(fr(v, fig.decX), X(v), by + bh + 2.2)
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (const v of fig.ticksY) ctx.fillText(fr(v, fig.decY), bx - 2.2, Y(v))
  // Titres d'axes : « $h_2$ (m) ».
  ctx.textBaseline = 'alphabetic'
  const titreAxe = (sym: string, unite: string, taille: number, mesurer: boolean, xg: number, yb: number) => {
    const w = dessinerMath(ctx, sym, xg, yb, taille, !mesurer)
    return unite ? w + dessinerUnite(ctx, ` (${unite})`, xg + w, yb, taille, !mesurer) : w
  }
  const wx = titreAxe(fig.x, fig.uniteX, 7.4, true, 0, 0)
  titreAxe(fig.x, fig.uniteX, 7.4, false, bx + bw / 2 - wx / 2, by + bh + 17.5)
  ctx.save()
  ctx.translate(x0 + 7.5, by + bh / 2)
  ctx.rotate(-Math.PI / 2)
  const wy = titreAxe(fig.y, fig.uniteY, 7.4, true, 0, 0)
  titreAxe(fig.y, fig.uniteY, 7.4, false, -wy / 2, 0)
  ctx.restore()

  // Légende (north west) : cadre fin, fond blanc, échantillon puis texte.
  const entrees: { dessin: (x: number, y: number) => void; texte: string }[] = [
    { texte: 'prédiction', dessin: (x, y) => ligneEchantillon(ctx, x, y, C.prediction, 0.95, []) },
  ]
  if (fig.bande) entrees.push({ texte: '$±1σ$', dessin: (x, y) => ligneEchantillon(ctx, x, y, C.prediction, 0.55, [0.8, 1.6]) })
  if (fig.series.length) {
    entrees.push({
      texte: 'mesures', dessin: (x, y) => {
        ctx.strokeStyle = C.encre
        ctx.fillStyle = C.encre
        ctx.lineWidth = 0.55
        ctx.beginPath()
        ctx.moveTo(x + 6, y - 2.6)
        ctx.lineTo(x + 6, y + 2.6)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(x + 6, y, 1.35, 0, Math.PI * 2)
        ctx.fill()
      },
    })
  }
  if (fig.pente) entrees.push({ texte: 'pente déclarée', dessin: (x, y) => ligneEchantillon(ctx, x, y, C.gris, 0.6, [3, 2]) })
  const tl = 6.4, hl = 7.6
  const largeurEntree = (texte: string): number => {
    if (texte.startsWith('$')) return dessinerMath(ctx, texte.slice(1, -1), 0, 0, tl, false)
    ctx.font = `400 ${tl}px ${ROMAN}`
    return ctx.measureText(texte).width
  }
  let wl = 0
  for (const e of entrees) wl = Math.max(wl, largeurEntree(e.texte))
  const lx = bx + 3, ly = by + 3, lw = 12 + 3 + wl + 4, lh = entrees.length * hl + 3
  ctx.fillStyle = C.surface
  ctx.fillRect(lx, ly, lw, lh)
  ctx.strokeStyle = C.encre
  ctx.lineWidth = 0.45
  ctx.strokeRect(lx, ly, lw, lh)
  entrees.forEach((e, k) => {
    const yy = ly + 1.5 + hl * (k + 0.5)
    e.dessin(lx + 2, yy)
    ctx.fillStyle = C.encre
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    if (e.texte.startsWith('$')) {
      ctx.textBaseline = 'alphabetic'
      dessinerMath(ctx, e.texte.slice(1, -1), lx + 2 + 12 + 3, yy + tl * 0.34, tl)
    } else {
      ctx.font = `400 ${tl}px ${ROMAN}`
      ctx.fillText(e.texte, lx + 2 + 12 + 3, yy + 0.3)
    }
  })

  // Légende de la figure (\caption), sous l'axe.
  ctx.fillStyle = C.encre
  const lignes = couperRiche(ctx, legende, W - 2, TAILLE_LEGENDE, LIGNES_LEGENDE)
  const yc = by + bh + SOUS_AXE + TAILLE_LEGENDE
  lignes.forEach((l, k) => dessinerRiche(ctx, l, x0 + 1, yc + k * INTERLIGNE, TAILLE_LEGENDE))
  ctx.restore()
}

function ligneEchantillon(ctx: CanvasRenderingContext2D, x: number, y: number, couleur: string, largeur: number, motif: number[]): void {
  ctx.strokeStyle = couleur
  ctx.lineWidth = largeur
  ctx.setLineDash(motif)
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + 12, y)
  ctx.stroke()
  ctx.setLineDash([])
}

/** Unité droite (\mathrm) avec exposants unicode réduits. */
function dessinerUnite(ctx: CanvasRenderingContext2D, u: string, x: number, y: number, taille: number, dessiner = true): number {
  let w = 0
  for (const ch of u) {
    const exp = '⁰¹²³⁴⁵⁶⁷⁸⁹⁻'.indexOf(ch)
    if (exp >= 0) {
      ctx.font = `400 ${taille * 0.7}px ${ROMAN}`
      const t = exp === 10 ? '−' : String(exp)
      if (dessiner) ctx.fillText(t, x + w, y - taille * 0.38)
      w += ctx.measureText(t).width
    } else {
      ctx.font = `400 ${taille}px ${ROMAN}`
      if (dessiner) ctx.fillText(ch, x + w, y)
      w += ctx.measureText(ch).width
    }
  }
  return w
}

// ─── Figures clés (R41) ──────────────────────────────────────────────────────

/** Figures affichées d'office (clés de `construireFigures`), selon la règle en tête du fichier. */
export function figuresCles(j: GrapheJustification, figures: Figure[], max: number): Set<string> {
  const majeur = (n: NoeudR) => (n.type === 'theoreme' || n.type === 'resultat') && !n.admis
  const poids = new Map<number, number>()
  const poidsDe = (i: number) => {
    let v = poids.get(i)
    if (v === undefined) poids.set(i, (v = dependantsDe(j, i).length))
    return v
  }
  const candidates = figures.filter((f) => f.series.length > 0)
  const points = (f: Figure) => f.series.reduce((t, s) => t + s.serie.points.length, 0)
  candidates.sort((a, b) =>
    Number(majeur(j.noeuds[b.noeudLoi]!)) - Number(majeur(j.noeuds[a.noeudLoi]!))
    || poidsDe(b.noeudLoi) - poidsDe(a.noeudLoi)
    || points(b) - points(a)
    || a.noeudLoi - b.noeudLoi)
  return new Set(candidates.slice(0, Math.max(0, Math.min(3, max))).map((f) => f.cle))
}
