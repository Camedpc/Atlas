// R11 · Rendu « figure d'article » sur les calques canvas de la vue.
//
// Même structure que R1 (colonnes, arêtes orthogonales, étapes repliées, décisions, choix, contexte),
// autre langage visuel : encre sur papier, filets fins à angles vifs, police à empattements, énoncés
// numérotés, statut et validation en symboles typographiques (✓ ? ✗, † * ‡), confiance écrite en
// chiffres avec une barre d'erreur miniature, renvois « Lem. 3 » comme des références d'équation,
// filets de tableau (booktabs) et légende « Fig. 1 — … » sous la figure. Sigma ne sert plus qu'aux
// liens complets (L) : ses points sont invisibles et le survol passe par `cibleSous`.

import {
  rgba, type ContexteDessinR, type ValeurReglage, type VueRaisonnement,
} from '../../src/raisonnement'
import { couperLignes, type Boite, type Jeton, type MiseEnPage } from './mise-en-page'
import { etatSquelette } from './squelette'
import { marqueValidation, policeTitre, SERIF, texteConfiance } from './typo'

export interface PaletteR11 {
  /** Encre du texte et des traits principaux. */
  encre: string
  /** Filets des cadres ordinaires. */
  filet: string
  surface2: string
  impasse: string
  /** Seule couleur franche : ce qui est réfuté. */
  refute: string
}

export function lirePaletteR11(el: HTMLElement): PaletteR11 {
  const s = getComputedStyle(el)
  const v = (n: string, d: string) => s.getPropertyValue(n).trim() || d
  return {
    encre: v('--r11-encre', '#15171c'),
    filet: v('--r11-filet', '#8c929c'),
    surface2: v('--surface-2', '#f4f4f2'),
    impasse: v('--r11-impasse', '#8d929b'),
    refute: v('--r11-refute', '#9f1d1d'),
  }
}

/** Élément interactif dessiné à la dernière image (pour le survol). */
export interface Cible {
  genre: 'carte' | 'pastille' | 'renvoi' | 'drapeau' | 'impasse' | 'masque'
  point: number
  /** Nœud de justification (pastille). */
  noeud: number
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface EtatRendu {
  page: MiseEnPage | null
  palette: PaletteR11
  cibles: Cible[]
  /** Élément survolé (déterminé par cibleSous). */
  survol: Cible | null
  /** Choix épinglés (points) : leur portée reste marquée. */
  epingles: Set<number>
  /** Choix présents (point → index stable). */
  couleurChoix: Map<number, number>
}

const lire = <T extends ValeurReglage>(vue: VueRaisonnement, cle: string) => vue.reglages.lire<T>(cle)

/** Écran : px par px de mise en page au point p. */
function echelle(vue: VueRaisonnement, page: MiseEnPage, p: number): number {
  return vue.camera.pixelsParUnite() * (vue.projection.echelle[p] || 1) * page.echelle
}

/** Choix (points) actifs : survolé + épinglés. */
export function choixActifs(_vue: VueRaisonnement, etat: EtatRendu): number[] {
  const r = [...etat.epingles]
  const s = etat.survol
  if (s && s.genre === 'drapeau' && !etat.epingles.has(s.point)) r.push(s.point)
  return r
}

/** Points qui dépendent d'au moins un choix actif (pour atténuer le reste). */
export function dependantsActifs(vue: VueRaisonnement, etat: EtatRendu): Set<number> | null {
  const page = etat.page
  if (!page) return null
  const actifs = choixActifs(vue, etat)
  if (!actifs.length) return null
  const s = new Set<number>(actifs)
  for (const c of actifs) for (const q of page.portees.get(c) ?? []) s.add(q)
  return s
}

// ─── Chemins ─────────────────────────────────────────────────────────────────

/** Ligne brisée à coins arrondis (écran). */
function tracerArrondi(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], rayon: number): void {
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  for (let k = 1; k < pts.length - 1; k++) {
    const a = pts[k - 1]!, b = pts[k]!, c = pts[k + 1]!
    const r = Math.min(rayon, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2)
    ctx.arcTo(b.x, b.y, c.x, c.y, Math.max(0.01, r))
  }
  const z = pts[pts.length - 1]!
  ctx.lineTo(z.x, z.y)
}

/** Courbe lissée passant par les stations (tangentes horizontales). */
function tracerLisse(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]): void {
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1]!, b = pts[k]!
    const dx = (b.x - a.x) * 0.5
    ctx.bezierCurveTo(a.x + dx, a.y, b.x - dx, b.y, b.x, b.y)
  }
}

/** Pointe de flèche fine et effilée (style figure imprimée). */
function fleche(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, t: number): void {
  const l = Math.hypot(dx, dy) || 1
  const ux = dx / l, uy = dy / l
  const L = t * 2.1, D = t * 0.62
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x - ux * L - uy * D, y - uy * L + ux * D)
  ctx.lineTo(x - ux * L * 0.78, y - uy * L * 0.78)
  ctx.lineTo(x - ux * L + uy * D, y - uy * L - ux * D)
  ctx.closePath()
  ctx.fill()
}

// ─── Calque « dessous » : filets, légende, groupes dépliés, arêtes ────────────

export function dessinerDessous(c: ContexteDessinR, etat: EtatRendu): void {
  const { ctx, vue } = c
  const page = etat.page
  if (!page || !page.boites.length) return
  const pal = vue.palette
  const encre = etat.palette.encre
  const e = vue.extrusion
  const cam = vue.camera
  const E = page.echelle
  const monde = (x: number, y: number, yw = 0): [number, number, number] => [(x - page.cx) * E, yw, -(y - page.cy) * E]
  const s0 = cam.pixelsParUnite() * E

  dessinerCadre(c, etat, s0)

  // Sous-arguments dépliés : cadre pointillé discret autour des énoncés qu'ils contenaient.
  dessinerDeplies(c, etat)

  // Arêtes de lecture.
  const pos = vue.positions
  const d = vue.disposition
  let transition = false
  for (let p = 0; p < vue.nU; p++) {
    if (Math.abs(pos[p * 3]! - d.x[p]!) + Math.abs(pos[p * 3 + 2]! - d.z[p]!) > 1e-4) {
      transition = true
      break
    }
  }
  const lisse = lire<string>(vue, 'aretes') === 'lissees'
  const rayon = lire<number>(vue, 'rayonCoins')
  const actifs = dependantsActifs(vue, etat)
  const survol = vue.survol
  const g = vue.lecture
  ctx.save()
  ctx.lineJoin = 'miter'
  ctx.lineCap = 'butt'
  for (const r of page.routes) {
    const a = g.aretes[r.arete]
    if (!a) continue
    const os = vue.opaciteAffichee[r.source]!, oc = vue.opaciteAffichee[r.cible]!
    let alpha = Math.min(1, Math.max(0.12, Math.min(os, oc)) * 1.1) * 0.78
    let couleur = encre
    let largeur = 0.9
    const incidente = survol !== null && (r.source === survol || r.cible === survol)
    if (incidente) {
      alpha = 1
      largeur = 1.6
    }
    if (vue.ligneeActive) {
      const ls = vue.lignee[r.source]!, lc = vue.lignee[r.cible]!
      const dans = ls > 0 && lc > 0 && !(ls === 2 && lc === 1) && !(ls === 1 && lc === 2) && !(ls === 3 && lc === 1) && !(ls === 2 && lc === 3)
      if (dans) {
        couleur = ls === 1 || lc === 1 ? pal.ancetre : pal.descendant
        alpha = 1
        largeur = 1.7
      } else alpha *= 0.35
    }
    if (actifs && !(actifs.has(r.source) && actifs.has(r.cible))) alpha *= 0.3
    if (r.abandon) {
      couleur = etat.palette.impasse
      ctx.setLineDash([3, 3])
    } else ctx.setLineDash([])
    let pts: { x: number; y: number }[]
    const ss = echelle(vue, page, r.source), sc = echelle(vue, page, r.cible)
    const bs = page.boites[r.source]!, bc = page.boites[r.cible]!
    const demi = (b: Boite) => (b.genre === 'decision' ? 19 : b.w / 2)
    if (transition || e > 0.02) {
      const pr = vue.projection
      const xa = pr.x[r.source]! + demi(bs) * ss, ya = pr.y[r.source]!
      const xb = pr.x[r.cible]! - demi(bc) * sc, yb = pr.y[r.cible]!
      if (transition) pts = [{ x: xa, y: ya }, { x: xb, y: yb }]
      else {
        const y0 = pos[r.source * 3 + 1]!, y1 = pos[r.cible * 3 + 1]!
        const n = r.points.length
        pts = r.points.map(([x, y], k) => cam.projeterPoint(monde(x, y, y0 + (y1 - y0) * (n > 1 ? k / (n - 1) : 0))))
      }
      if (transition) {
        ctx.strokeStyle = rgba(couleur, alpha)
        ctx.lineWidth = largeur
        ctx.beginPath()
        tracerLisse(ctx, pts)
        ctx.stroke()
        ctx.fillStyle = rgba(couleur, alpha)
        fleche(ctx, pts[1]!.x, pts[1]!.y, 1, 0, 2.6 + largeur)
        continue
      }
    } else pts = r.points.map(([x, y]) => cam.projeterPoint(monde(x, y)))
    ctx.strokeStyle = rgba(couleur, alpha)
    ctx.lineWidth = largeur
    ctx.beginPath()
    if (lisse) {
      const stations = pts.filter((_, k) => k === 0 || k === pts.length - 1 || (k < pts.length - 1 && Math.abs(pts[k]!.y - pts[k + 1]!.y) < 0.5 && Math.abs(pts[k]!.x - pts[k + 1]!.x) > 20))
      tracerLisse(ctx, stations)
    } else tracerArrondi(ctx, pts, rayon * Math.min(1.5, s0))
    ctx.stroke()
    const z = pts[pts.length - 1]!, y = pts[pts.length - 2] ?? pts[0]!
    ctx.fillStyle = rgba(couleur, alpha)
    ctx.setLineDash([])
    fleche(ctx, z.x, z.y, lisse ? 1 : z.x - y.x, lisse ? 0 : z.y - y.y, 2.6 + largeur)
  }
  ctx.restore()

  // Liens décision → choix dans la marge : filet fin vers l'hypothèse de travail.
  ctx.save()
  for (const l of page.liensMarge) {
    const pr = vue.projection
    const s = echelle(vue, page, l.source)
    const bc = page.boites[l.cible]!
    const xm = pr.x[l.cible]! - (bc.w / 2 - 6) * s
    const ya = pr.y[l.source]!, yb = pr.y[l.cible]! - (bc.h / 2 + 3) * s
    const xa = pr.x[l.source]! - 19 * s
    const op = Math.min(vue.opaciteAffichee[l.source]!, vue.opaciteAffichee[l.cible]!)
    ctx.strokeStyle = rgba(encre, 0.7 * op)
    ctx.fillStyle = rgba(encre, 0.7 * op)
    ctx.lineWidth = 0.9
    ctx.beginPath()
    tracerArrondi(ctx, [{ x: xa, y: ya }, { x: xm, y: ya }, { x: xm, y: yb }], 2 * s)
    ctx.stroke()
    fleche(ctx, xm, yb, 0, 1, 3.4)
  }
  ctx.restore()

  if (lire<boolean>(vue, 'liensSemantiques')) dessinerLiensSemantiques(c, etat)
}

// Légende de figure : recalculée seulement quand la mise en page change.
const cacheLegende = new WeakMap<MiseEnPage, { cle: string; lignes: string[] }>()

/** Texte de la légende « Fig. 1 — … », d'après ce qui est affiché. */
function texteLegende(vue: VueRaisonnement, page: MiseEnPage): string {
  let enonces = 0, choix = 0, decisions = 0, etapes = 0
  for (let p = 0; p < vue.nU; p++) {
    const b = page.boites[p]!
    if (b.genre === 'drapeau') choix++
    else {
      enonces++
      if (b.genre === 'decision') decisions++
      if (b.suffixe.includes('pas')) etapes++
    }
  }
  const s = vue.lecture.stats
  const renvois = page.usagesRenvoi.size
  return `Fig. 1 — Squelette déductif du raisonnement : ${enonces} énoncés numérotés dans l'ordre de lecture ` +
    `(dont ${decisions} décisions ◇ et ${etapes} sous-arguments repliés, cadre à feuillets, double-clic pour déplier) ` +
    `et ${choix} hypothèses de travail (M1–M${choix}), extraits d'un graphe de justification de ${s.noeudsComplet} nœuds ` +
    `et ${s.aretesComplet} prémisses. Une flèche relie une prémisse principale à sa conclusion ; ${renvois} prémisses lointaines ` +
    `sont citées par renvoi (« Lem. 3 », « (6) ») sous l'énoncé qui les utilise, suivies du contexte : hypothèses H, ` +
    `définitions D, lemmes admis L, axiomes Ax, littérature [k], auxiliaires a. En-tête : † validé par un humain, ` +
    `* par l'IA, ‡ par les deux ; ✓ établi, ? incertain, ✗ réfuté ; M k : dépend de l'hypothèse de travail (M k). ` +
    `Pied : confiance estimée [intervalle], et sa position sur [0 ; 1]. Cadre double : résultat principal. ` +
    `Pointillés : piste abandonnée ; texte barré : alternative écartée par une décision.`
}

/** Filets de tableau (haut, sous les en-têtes, bas), en-têtes de colonnes et légende. */
function dessinerCadre({ ctx, vue }: ContexteDessinR, etat: EtatRendu, s0: number): void {
  const page = etat.page!
  const alpha = Math.max(0, 1 - vue.extrusion * 1.6)
  if (alpha < 0.01) return
  const cam = vue.camera
  const E = page.echelle
  const P = (x: number, y: number) => cam.projeterPoint([(x - page.cx) * E, 0, -(y - page.cy) * E])
  const encre = etat.palette.encre
  const B = page.bornes
  const xG = Math.min(B.x0, ...page.zones.map((z) => z.x0)) - 4
  const xD = Math.max(B.x1, ...page.zones.map((z) => z.x1)) + 4
  const enTetes = lire<boolean>(vue, 'enTetes') && page.zones.length > 0
  const yHaut = B.y0 - (enTetes ? 54 : 24), yMilieu = B.y0 - 26, yBas = B.y1 + 20
  const filet = (y: number, l: number) => {
    const a = P(xG, y), b = P(xD, y)
    if (!a.visible || !b.visible) return
    ctx.strokeStyle = rgba(encre, alpha)
    ctx.lineWidth = l
    ctx.beginPath()
    ctx.moveTo(a.x, Math.round(a.y) + 0.5)
    ctx.lineTo(b.x, Math.round(b.y) + 0.5)
    ctx.stroke()
  }
  ctx.save()
  filet(yHaut, 1.1)
  filet(yBas, 1.1)
  if (enTetes) {
    filet(yMilieu, 0.55)
    const taille = Math.max(8.5, Math.min(15, 11.5 * s0))
    ctx.font = `italic 400 ${taille}px ${SERIF}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = rgba(encre, 0.75 * alpha)
    for (const z of page.zones) {
      const t = P((z.x0 + z.x1) / 2, yMilieu - 8)
      const a = P(z.x0, 0), b = P(z.x1, 0)
      if (ctx.measureText(z.nom).width < Math.abs(b.x - a.x) - 6) ctx.fillText(z.nom, t.x, t.y)
    }
  }
  // Légende sous le filet du bas, à la largeur de la figure (en px de mise en page, mise à l'échelle).
  if (lire<boolean>(vue, 'legende')) {
    const largeur = xD - xG
    const texte = texteLegende(vue, page)
    const cle = `${largeur}|${texte}`
    let cache = cacheLegende.get(page)
    if (!cache || cache.cle !== cle) {
      cache = { cle, lignes: couperLignes(texte, largeur, `400 11px ${SERIF}`, 12) }
      cacheLegende.set(page, cache)
    }
    const o = P(xG, yBas + 20)
    if (o.visible && s0 > 0.12) {
      ctx.translate(o.x, o.y)
      ctx.scale(s0, s0)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = rgba(encre, 0.88 * alpha)
      cache.lignes.forEach((l, k) => {
        const y = k * 14.5
        if (k === 0 && l.startsWith('Fig. 1')) {
          // « Fig. 1 » en gras, le reste en romain.
          ctx.font = `700 11px ${SERIF}`
          ctx.fillText('Fig. 1', 0, y)
          const w = ctx.measureText('Fig. 1').width
          ctx.font = `400 11px ${SERIF}`
          ctx.fillText(l.slice(6), w, y)
        } else {
          ctx.font = `400 11px ${SERIF}`
          ctx.fillText(l, 0, y)
        }
      })
    }
  }
  ctx.restore()
}

/** Cadres des sous-arguments dépliés. */
function dessinerDeplies({ ctx, vue }: ContexteDessinR, etat: EtatRendu): void {
  const page = etat.page!
  if (!etatSquelette.deplies.size) return
  const g = vue.lecture
  const j = g.justification
  const encre = etat.palette.encre
  ctx.save()
  for (const [tete, ids] of etatSquelette.deplies) {
    const ensemble = new Set([tete, ...ids])
    const pts: number[] = []
    for (let p = 0; p < vue.nU; p++) if (g.unites[p]!.membres.some((m) => ensemble.has(j.noeuds[m]!.id))) pts.push(p)
    if (pts.length < 2) continue
    for (const p of pts) {
      const b = page.boites[p]!, s = echelle(vue, page, p)
      const op = vue.opaciteAffichee[p]!
      const x = vue.projection.x[p]!, y = vue.projection.y[p]!
      const l = b.genre === 'decision' ? Math.max(24, b.w / 2) : b.w / 2
      ctx.strokeStyle = rgba(etat.palette.filet, 0.9 * op)
      ctx.setLineDash([2, 3])
      ctx.lineWidth = 0.8
      ctx.strokeRect(x - (l + 5) * s, y - (b.haut + 5) * s, (2 * l + 10) * s, (b.haut + b.bas + 8) * s)
      ctx.setLineDash([])
      if (j.noeuds[g.unites[p]!.conclusion]!.id === tete) {
        ctx.font = `italic 400 ${Math.max(8, 10 * s)}px ${SERIF}`
        ctx.textAlign = 'right'
        ctx.textBaseline = 'bottom'
        ctx.fillStyle = rgba(encre, 0.7 * op)
        ctx.fillText(`preuve dépliée (${pts.length}) — double-clic pour replier`, x + (l + 5) * s, y - (b.haut + 7) * s)
      }
    }
  }
  ctx.restore()
}

/** Contradictions, résolutions, abandons : arcs fins au-dessus du graphe, libellés en italique. */
function dessinerLiensSemantiques({ ctx, vue }: ContexteDessinR, etat: EtatRendu): void {
  const j = vue.justification
  const page = etat.page!
  const P = etat.palette
  ctx.save()
  ctx.font = `italic 400 10.5px ${SERIF}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const faits = new Set<string>()
  for (let i = 0; i < j.noeuds.length; i++) {
    const liens = j.noeuds[i]!.liens
    if (!liens) continue
    for (const l of liens) {
      const ci = j.index.get(l.cible)
      if (ci === undefined) continue
      const a = vue.pointDeNoeud(i), b = vue.pointDeNoeud(ci)
      if (a === null || b === null || a === b || a >= vue.nU || b >= vue.nU) continue
      const cle = `${a}>${b}:${l.genre}`
      if (faits.has(cle)) continue
      faits.add(cle)
      const op = Math.min(vue.opaciteAffichee[a]!, vue.opaciteAffichee[b]!)
      if (op < 0.05) continue
      const couleur = l.genre === 'contredit' ? P.refute : l.genre === 'resout' ? P.encre : P.impasse
      const pr = vue.projection
      const sa = echelle(vue, page, a), sb = echelle(vue, page, b)
      const x1 = pr.x[a]!, y1 = pr.y[a]! - page.boites[a]!.haut * sa
      const x2 = pr.x[b]!, y2 = pr.y[b]! - page.boites[b]!.haut * sb
      const my = Math.min(y1, y2) - Math.max(26, Math.abs(x2 - x1) * 0.18)
      ctx.strokeStyle = rgba(couleur, 0.75 * op)
      ctx.lineWidth = 0.9
      ctx.setLineDash(l.genre === 'resout' ? [] : [3, 3])
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.bezierCurveTo(x1, my, x2, my, x2, y2)
      ctx.stroke()
      ctx.setLineDash([])
      const tx = (x1 + x2) / 2, ty = my + (Math.min(y1, y2) - my) * 0.25
      const texte = l.genre === 'contredit' ? 'contredit' : l.genre === 'resout' ? 'résout' : l.genre === 'abandonne' ? 'abandonne' : 'remplace'
      const w = ctx.measureText(texte).width + 8
      ctx.fillStyle = rgba(vue.palette.surface, 0.95 * op)
      ctx.fillRect(tx - w / 2, ty - 7, w, 14)
      ctx.fillStyle = rgba(couleur, op)
      ctx.fillText(texte, tx, ty)
    }
  }
  ctx.restore()
}

// ─── Calque « dessus » : énoncés, décisions, hypothèses de travail, renvois ───

export function dessinerDessus(c: ContexteDessinR, etat: EtatRendu): void {
  const { ctx, vue } = c
  const page = etat.page
  etat.cibles = []
  if (!page) return
  const pr = vue.projection
  // Masqués (contexte pur) : visibles seulement avec les liens complets.
  ctx.save()
  for (let p = vue.nU; p < vue.nP; p++) {
    const pres = vue.presence[p]!
    if (pres < 0.05 || !pr.visible[p]) continue
    const s = echelle(vue, page, p)
    const x = pr.x[p]!, y = pr.y[p]!
    const n = vue.noeud(p)
    ctx.fillStyle = rgba(etat.palette.filet, 0.9 * pres)
    ctx.beginPath()
    ctx.arc(x, y, 2.6 * Math.min(1.4, s), 0, Math.PI * 2)
    ctx.fill()
    if (s > 0.55) {
      ctx.font = `400 ${10.5 * Math.min(1.3, s)}px ${SERIF}`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = rgba(vue.palette.texteDoux, pres)
      ctx.fillText(page.boites[p]!.lignes[0] ?? n.nom, x - 7 * s, y)
    }
    etat.cibles.push({ genre: 'masque', point: p, noeud: vue.indexNoeud(p), x0: x - 6, y0: y - 6, x1: x + 6, y1: y + 6 })
  }
  ctx.restore()

  const ordre: number[] = []
  for (let p = 0; p < vue.nU; p++) ordre.push(p)
  const devant = (p: number) => (p === vue.survol ? 3 : vue.lignee[p]! > 0 ? 2 : 0)
  ordre.sort((a, b) => devant(a) - devant(b) || pr.profondeur[b]! - pr.profondeur[a]!)
  const actifs = choixActifs(vue, etat)
  const toujours = lire<string>(vue, 'bandesChoix') === 'toujours'
  const drapeaux = [...etat.couleurChoix.keys()].sort((a, b) => page.boites[a]!.numero - page.boites[b]!.numero)
  for (const p of ordre) {
    if (!pr.visible[p]) continue
    const op = vue.opaciteAffichee[p]!
    if (op < 0.02) continue
    const b = page.boites[p]!
    const s = echelle(vue, page, p)
    ctx.save()
    ctx.translate(pr.x[p]!, pr.y[p]!)
    ctx.scale(s, s)
    ctx.globalAlpha = op
    // Hypothèses de travail dont dépend ce point : « M1 M3 » dans l'en-tête.
    const marques: string[] = []
    for (const q of drapeaux) {
      if (q === p) continue
      if ((toujours || actifs.includes(q)) && page.portees.get(q)?.includes(p)) marques.push(page.boites[q]!.ref)
    }
    if (b.genre === 'drapeau') dessinerHypotheseTravail(ctx, vue, etat, p, b)
    else if (b.genre === 'decision') dessinerDecision(ctx, vue, etat, p, b, marques)
    else dessinerEnonce(ctx, vue, etat, p, b, marques)
    ctx.restore()
    // Cibles (écran).
    const x = pr.x[p]!, y = pr.y[p]!
    if (b.genre === 'decision') {
      const l = Math.max(19, b.w / 2)
      etat.cibles.push({ genre: 'carte', point: p, noeud: -1, x0: x - l * s, y0: y - b.haut * s, x1: x + l * s, y1: y + 22 * s })
      if (b.impasse && lire<boolean>(vue, 'impasses')) etat.cibles.push({ genre: 'impasse', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y + 22 * s, x1: x + (b.w / 2) * s, y1: y + 48 * s })
    } else if (b.genre === 'drapeau') etat.cibles.push({ genre: 'drapeau', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y - (b.h / 2) * s, x1: x + (b.w / 2) * s, y1: y + (b.h / 2) * s })
    else etat.cibles.push({ genre: 'carte', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y - (b.h / 2) * s, x1: x + (b.w / 2) * s, y1: y + (b.h / 2) * s })
    const yj = yRangee(b)
    for (const jt of jetons(vue, b)) {
      const x0 = x + jt.x * s, x1 = x + (jt.x + jt.largeur) * s
      const cy = y + yj * s
      if (jt.renvoi >= 0) etat.cibles.push({ genre: 'renvoi', point: jt.renvoi, noeud: -1, x0: x0 - 2, y0: cy - 7 * s, x1: x1 + 2, y1: cy + 7 * s })
      else etat.cibles.push({ genre: 'pastille', point: p, noeud: jt.noeud, x0: x0 - 2, y0: cy - 7 * s, x1: x1 + 2, y1: cy + 7 * s })
    }
  }
}

/** Ordonnée (relative au point d'ancrage) de la rangée de renvois et de contexte. */
function yRangee(b: Boite): number {
  if (b.genre === 'decision') return 19 + (b.impasse ? 30 : 4) + 8
  return b.h / 2 + 10
}

/** Jetons affichés (le contexte peut être masqué par le réglage). */
function jetons(vue: VueRaisonnement, b: Boite): Jeton[] {
  return lire<boolean>(vue, 'pastillesContexte') ? b.jetons : b.jetons.filter((j) => j.renvoi >= 0)
}

/** Trait du cadre selon la lignée ou le survol ; null sinon. */
function traitLignee(vue: VueRaisonnement, etat: EtatRendu, p: number): { couleur: string; largeur: number } | null {
  const pal = vue.palette
  if (vue.ligneeActive) {
    const l = vue.lignee[p]!
    if (l === 3) return { couleur: etat.palette.encre, largeur: 2 }
    if (l === 1) return { couleur: pal.ancetre, largeur: 1.4 }
    if (l === 2) return { couleur: pal.descendant, largeur: 1.4 }
  }
  if (vue.survol === p) return { couleur: etat.palette.encre, largeur: 1.5 }
  return null
}

/** Rangée sous l'énoncé : renvois en romain, contexte en gris, « +n » au bout. */
function dessinerRangee(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, b: Boite): void {
  const items = jetons(vue, b)
  if (!items.length) return
  const encre = etat.palette.encre
  const y = yRangee(b)
  const sv = etat.survol
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = `400 10px ${SERIF}`
  for (const jt of items) {
    const allume = jt.renvoi >= 0 ? sv?.genre === 'renvoi' && sv.point === jt.renvoi : sv?.genre === 'pastille' && sv.noeud === jt.noeud
    ctx.fillStyle = allume ? encre : jt.renvoi >= 0 ? rgba(encre, 0.85) : vue.palette.texteDoux
    ctx.fillText(jt.texte, jt.x, y + 0.5)
    if (allume) {
      ctx.fillRect(jt.x, y + 6, jt.largeur, 0.8)
    }
  }
  const plus = lire<boolean>(vue, 'pastillesContexte') ? b.plus : 0
  if (plus) {
    const d = items[items.length - 1]!
    ctx.fillStyle = vue.palette.texteDoux
    ctx.fillText(`+${plus}`, d.x + d.largeur + 5, y + 0.5)
  }
}

/** En-tête « Lemme 3† » en petites capitales, mention en italique, marques M, statut à droite. */
function dessinerEnTete(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite,
  x: number, y: number, xDroite: number, marques: string[], gras: boolean): void {
  const n = vue.noeud(p)
  const encre = etat.palette.encre
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.font = `small-caps ${gras ? 700 : 600} 11px ${SERIF}`
  ctx.fillStyle = b.abandon ? etat.palette.impasse : encre
  ctx.fillText(b.etiquette, x, y)
  let cx = x + ctx.measureText(b.etiquette).width
  const marque = marqueValidation(n.validation)
  if (marque) {
    ctx.font = `400 8.5px ${SERIF}`
    ctx.fillText(marque, cx + 0.5, y - 3.5)
    cx += ctx.measureText(marque).width + 1
  }
  // Statut à droite : ✓ établi, ? incertain, ✗ réfuté (seul symbole en couleur).
  ctx.textAlign = 'right'
  ctx.font = `400 11px ${SERIF}`
  ctx.fillStyle = n.statut === 'refute' ? etat.palette.refute : encre
  const sym = n.statut === 'valide' ? '✓' : n.statut === 'incertain' ? '?' : '✗'
  ctx.fillText(sym, xDroite, y)
  let libre = xDroite - ctx.measureText(sym).width - 5
  // Marques M (hypothèses de travail) : en entier, sinon « M×k », sinon rien.
  if (marques.length) {
    ctx.font = `italic 400 9px ${SERIF}`
    ctx.fillStyle = vue.palette.texteDoux
    let t = marques.join(' ')
    if (ctx.measureText(t).width > libre - cx - 6) t = `M×${marques.length}`
    if (ctx.measureText(t).width <= libre - cx - 6) {
      ctx.fillText(t, libre, y)
      libre -= ctx.measureText(t).width + 5
    }
  }
  // Mention (sous-argument replié, piste abandonnée) si la place le permet.
  if (b.suffixe) {
    ctx.textAlign = 'left'
    ctx.font = `italic 400 9.5px ${SERIF}`
    ctx.fillStyle = vue.palette.texteDoux
    const long = ` — ${b.suffixe}`, court = ` ${b.suffixe}`
    const t = cx + 2 + ctx.measureText(long).width <= libre ? long : cx + 2 + ctx.measureText(court).width <= libre ? court : ''
    if (t) ctx.fillText(t, cx + 2, y)
  }
}

function dessinerEnonce(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, marques: string[]): void {
  const pal = vue.palette
  const P = etat.palette
  const n = vue.noeud(p)
  const w = b.w, h = b.h
  const x0 = -w / 2, y0 = -h / 2
  const taille = lire<number>(vue, 'taillePolice')
  const majeur = b.genre === 'majeur'
  // Sous-argument replié : deux feuillets décalés derrière (filets seuls).
  if (b.genre === 'etape' || (vue.lecture.unites[p]?.membres.length ?? 1) > 1) {
    for (const d of [5, 2.5]) {
      ctx.fillStyle = pal.surface
      ctx.fillRect(x0 + d, y0 - d, w, h)
      ctx.strokeStyle = rgba(b.abandon ? P.impasse : P.filet, 0.8)
      ctx.lineWidth = 0.7
      if (b.abandon) ctx.setLineDash([3, 3])
      ctx.strokeRect(x0 + d, y0 - d, w, h)
      ctx.setLineDash([])
    }
  }
  ctx.fillStyle = b.abandon ? P.surface2 : pal.surface
  ctx.fillRect(x0, y0, w, h)
  const tl = traitLignee(vue, etat, p)
  ctx.strokeStyle = tl ? tl.couleur : b.abandon ? P.impasse : n.statut === 'refute' ? P.refute : majeur ? P.encre : P.filet
  ctx.lineWidth = tl ? tl.largeur : majeur ? 0.9 : 0.7
  if (b.abandon && !tl) ctx.setLineDash([3, 3])
  ctx.strokeRect(x0, y0, w, h)
  ctx.setLineDash([])
  // Résultat principal : cadre double, comme un énoncé encadré dans un article.
  if (majeur) {
    ctx.strokeStyle = P.encre
    ctx.lineWidth = 0.5
    ctx.strokeRect(x0 + 2.5, y0 + 2.5, w - 5, h - 5)
  }
  const gauche = x0 + 8, droite = x0 + w - 7
  dessinerEnTete(ctx, vue, etat, p, b, gauche, y0 + 17, droite, marques, majeur)
  // Corps : italique pour ce qu'on démontre ou suppose (amsthm), romain sinon.
  ctx.textAlign = 'left'
  ctx.font = policeTitre(n, taille, majeur)
  ctx.fillStyle = b.abandon ? pal.texteDoux : P.encre
  b.lignes.forEach((l, k) => ctx.fillText(l, gauche, y0 + 20 + taille + k * (taille + 3) - 1))
  // Pied : confiance en chiffres et barre d'erreur miniature sur [0 ; 1].
  const c = n.confiance
  const yb = y0 + h - 6
  ctx.font = `400 9.5px ${SERIF}`
  ctx.fillStyle = pal.texteDoux
  const texte = texteConfiance(c)
  ctx.fillText(texte, gauche, yb)
  const xa = droite - 30, xz = droite
  if (xa > gauche + ctx.measureText(texte).width + 6) {
    const ym = yb - 3.5
    ctx.fillStyle = rgba(P.encre, 0.35)
    ctx.fillRect(xa, ym - 0.25, xz - xa, 0.5)
    ctx.fillRect(xa, ym - 2, 0.5, 4)
    ctx.fillRect(xz - 0.5, ym - 2, 0.5, 4)
    ctx.fillStyle = n.statut === 'refute' ? P.refute : P.encre
    ctx.fillRect(xa + (xz - xa) * c.bas, ym - 0.6, Math.max(1, (xz - xa) * (c.haut - c.bas)), 1.2)
    ctx.fillRect(xa + (xz - xa) * c.estimation - 0.5, ym - 2.5, 1, 5)
  }
  dessinerRangee(ctx, vue, etat, b)
}

function dessinerDecision(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, marques: string[]): void {
  const pal = vue.palette
  const P = etat.palette
  const taille = lire<number>(vue, 'taillePolice')
  const n = vue.noeud(p)
  const tl = traitLignee(vue, etat, p)
  const n0 = b.lignes.length
  // En-tête « Décision k » puis libellé, centrés au-dessus du losange.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `small-caps 600 11px ${SERIF}`
  ctx.fillStyle = P.encre
  const yTete = -25 - n0 * (taille + 3) + 1
  const tete = b.etiquette + (marques.length ? `  ${marques.join(' ')}` : '')
  ctx.fillText(tete, 0, yTete)
  ctx.font = policeTitre(n, taille, false)
  b.lignes.forEach((l, k) => ctx.fillText(l, 0, -25 - (n0 - 1 - k) * (taille + 3)))
  // Alternative écartée : filet pointillé puis texte barré, en gris.
  if (b.impasse && lire<boolean>(vue, 'impasses')) {
    ctx.strokeStyle = P.impasse
    ctx.lineWidth = 0.8
    ctx.setLineDash([2, 2])
    ctx.beginPath()
    ctx.moveTo(0, 19)
    ctx.lineTo(0, 28)
    ctx.stroke()
    ctx.setLineDash([])
    const prefixe = 'écartée : '
    const suffixe = b.impasse.autres ? `  +${b.impasse.autres}` : ''
    const fAlt = `italic 400 ${Math.max(9, taille - 2.5)}px ${SERIF}`
    const fPre = `400 ${Math.max(8.5, taille - 3.5)}px ${SERIF}`
    ctx.font = fPre
    const wPre = ctx.measureText(prefixe).width
    const wSuf = ctx.measureText(suffixe).width
    ctx.font = fAlt
    let t = b.impasse.texte
    const max = b.w - 8 - wPre - wSuf
    while (t.length > 3 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1)
    const alt = t === b.impasse.texte ? t : t.trimEnd() + '…'
    const wAlt = ctx.measureText(alt).width
    let x = -(wPre + wAlt + wSuf) / 2
    const y = 38
    ctx.textAlign = 'left'
    ctx.fillStyle = P.impasse
    ctx.font = fPre
    ctx.fillText(prefixe, x, y)
    x += wPre
    ctx.font = fAlt
    ctx.fillText(alt, x, y)
    ctx.fillRect(x, y - 3.6, wAlt, 0.7)
    x += wAlt
    if (suffixe) {
      ctx.font = fPre
      ctx.fillText(suffixe, x, y)
    }
  }
  // Losange : filet d'encre, fond papier.
  ctx.beginPath()
  ctx.moveTo(0, -19)
  ctx.lineTo(19, 0)
  ctx.lineTo(0, 19)
  ctx.lineTo(-19, 0)
  ctx.closePath()
  ctx.fillStyle = pal.surface
  ctx.fill()
  ctx.strokeStyle = tl ? tl.couleur : P.encre
  ctx.lineWidth = tl ? tl.largeur : 0.9
  ctx.stroke()
  dessinerRangee(ctx, vue, etat, b)
}

/** Hypothèse de travail (choix de modélisation) dans la marge : filets haut et bas, texte en italique. */
function dessinerHypotheseTravail(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite): void {
  const P = etat.palette
  const n = vue.noeud(p)
  const actif = etat.epingles.has(p) || (etat.survol?.genre === 'drapeau' && etat.survol.point === p)
  const taille = lire<number>(vue, 'taillePolice') - 0.5
  const w = b.w, h = b.h
  const x0 = -w / 2, y0 = -h / 2
  const tl = traitLignee(vue, etat, p)
  ctx.fillStyle = vue.palette.surface
  ctx.fillRect(x0, y0, w, h)
  const l = tl ? tl.largeur : actif ? 1.6 : 0.9
  ctx.fillStyle = tl ? tl.couleur : P.encre
  ctx.fillRect(x0, y0, w, l)
  ctx.fillRect(x0, y0 + h - l, w, l)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.font = `small-caps 700 11px ${SERIF}`
  ctx.fillStyle = P.encre
  ctx.fillText(b.etiquette, x0 + 2, y0 + 14)
  // Portée : énoncés de la figure qui en dépendent (graphe complet).
  const portee = etat.page?.portees.get(p)?.filter((q) => q < vue.nU).length ?? 0
  ctx.textAlign = 'right'
  ctx.font = `italic 400 9.5px ${SERIF}`
  ctx.fillStyle = vue.palette.texteDoux
  ctx.fillText(`${etat.epingles.has(p) ? 'épinglée · ' : ''}${portee} énoncé${portee > 1 ? 's' : ''}`, x0 + w - 2, y0 + 14)
  ctx.textAlign = 'left'
  ctx.font = policeTitre(n, taille, false)
  ctx.fillStyle = P.encre
  b.lignes.forEach((t, i) => ctx.fillText(t, x0 + 2, y0 + 19 + taille + i * (taille + 3) - 1))
}

// ─── Survol ──────────────────────────────────────────────────────────────────

/** Élément sous le pointeur (écran), d'après la dernière image. */
export function cibleSous(etat: EtatRendu, x: number, y: number): Cible | null {
  // Renvois, contexte et impasses d'abord (petits, au-dessus des cartes voisines), puis l'ordre inverse du dessin.
  for (let k = etat.cibles.length - 1; k >= 0; k--) {
    const c = etat.cibles[k]!
    if ((c.genre === 'pastille' || c.genre === 'renvoi' || c.genre === 'impasse') && x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) return c
  }
  for (let k = etat.cibles.length - 1; k >= 0; k--) {
    const c = etat.cibles[k]!
    if (x >= c.x0 - 2 && x <= c.x1 + 2 && y >= c.y0 - 2 && y <= c.y1 + 2) return c
  }
  return null
}
