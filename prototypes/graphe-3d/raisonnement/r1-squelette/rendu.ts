// R1 · Rendu sur calques canvas : zones nommées, arêtes orthogonales, cartes, losanges de décision,
// impasses, drapeaux de choix, pastilles de contexte. Sigma ne sert plus qu'aux liens complets (L) :
// ses points sont rendus invisibles par un réducteur et le survol passe par `cibleSous`.

import {
  LIBELLES_VALIDATION, rgba, type ContexteDessinR, type ValeurReglage, type VueRaisonnement,
} from '../../src/raisonnement'
import type { Boite, MiseEnPage } from './mise-en-page'
import { etatSquelette } from './squelette'

export interface PaletteR1 {
  choix: string[]
  surface2: string
  impasse: string
}

export function lirePaletteR1(el: HTMLElement): PaletteR1 {
  const s = getComputedStyle(el)
  const v = (n: string, d: string) => s.getPropertyValue(n).trim() || d
  return {
    choix: [0, 1, 2, 3, 4, 5].map((i) => v(`--r1-choix-${i}`, ['#c2255c', '#1c7ed6', '#2b8a3e', '#e67700', '#7048e8', '#0b7285'][i]!)),
    surface2: v('--surface-2', '#f2f4f8'),
    impasse: v('--r1-impasse', '#9aa1ae'),
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
  palette: PaletteR1
  cibles: Cible[]
  /** Élément survolé (déterminé par cibleSous). */
  survol: Cible | null
  /** Choix épinglés (points) : leur bande de portée reste affichée. */
  epingles: Set<number>
  /** Couleur de chaque choix (point → index de couleur). */
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
  // On ne garde que les points de passage horizontaux (début, fin, stations des nœuds fictifs).
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1]!, b = pts[k]!
    const dx = (b.x - a.x) * 0.5
    ctx.bezierCurveTo(a.x + dx, a.y, b.x - dx, b.y, b.x, b.y)
  }
}

function fleche(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, t: number): void {
  const l = Math.hypot(dx, dy) || 1
  const ux = dx / l, uy = dy / l
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x - ux * t * 1.7 - uy * t * 0.8, y - uy * t * 1.7 + ux * t * 0.8)
  ctx.lineTo(x - ux * t * 1.7 + uy * t * 0.8, y - uy * t * 1.7 - ux * t * 0.8)
  ctx.closePath()
  ctx.fill()
}

// ─── Calque « dessous » : zones, groupes dépliés, arêtes ──────────────────────

export function dessinerDessous(c: ContexteDessinR, etat: EtatRendu): void {
  const { ctx, vue } = c
  const page = etat.page
  if (!page || !page.boites.length) return
  const pal = vue.palette
  const e = vue.extrusion
  const cam = vue.camera
  const E = page.echelle
  const monde = (x: number, y: number, yw = 0): [number, number, number] => [(x - page.cx) * E, yw, -(y - page.cy) * E]
  const s0 = cam.pixelsParUnite() * E

  // Zones nommées : bandes alternées + en-têtes (s'estompent en 3D).
  if (lire<boolean>(vue, 'enTetes') && page.zones.length) {
    const alpha = Math.max(0, 1 - e * 1.6)
    const yH = page.bornes.y0 - 40, yB = page.bornes.y1 + 18
    ctx.save()
    page.zones.forEach((z, k) => {
      const a = cam.projeterPoint(monde(z.x0, yH - 16)), b = cam.projeterPoint(monde(z.x1, yB))
      if (!a.visible || !b.visible) return
      if (alpha > 0.01 && k % 2 === 1) {
        ctx.fillStyle = rgba(etat.palette.surface2, 0.55 * alpha)
        ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y)
      }
      // En-tête : nom en petites capitales, filet dessous, flèche de progression entre zones.
      const t = cam.projeterPoint(monde((z.x0 + z.x1) / 2, yH))
      const taille = Math.max(9, Math.min(15, 11.5 * s0))
      ctx.font = `650 ${taille}px ${pal.police}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = rgba(pal.texteDoux, Math.max(0.35, 1 - e))
      // Nom seulement s'il tient dans la colonne (sinon il chevaucherait la voisine).
      if (ctx.measureText(z.nom.toUpperCase()).width < Math.abs(b.x - a.x) - 6) ctx.fillText(z.nom.toUpperCase(), t.x, t.y)
      const g = cam.projeterPoint(monde(z.x0 + 10, yH + 14)), d = cam.projeterPoint(monde(z.x1 - 10, yH + 14))
      ctx.strokeStyle = rgba(pal.texteDoux, 0.35 * Math.max(0.3, 1 - e))
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(g.x, g.y)
      ctx.lineTo(d.x, d.y)
      ctx.stroke()
      if (k + 1 < page.zones.length) {
        const f = cam.projeterPoint(monde(z.x1, yH))
        ctx.fillStyle = rgba(pal.texteDoux, 0.5 * Math.max(0.3, 1 - e))
        ctx.font = `500 ${taille}px ${pal.police}`
        ctx.fillText('→', f.x, f.y)
      }
    })
    ctx.restore()
  }

  // Sous-arguments dépliés : enveloppe discrète autour des énoncés qu'ils contenaient.
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
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  for (const r of page.routes) {
    const a = g.aretes[r.arete]
    if (!a) continue
    const os = vue.opaciteAffichee[r.source]!, oc = vue.opaciteAffichee[r.cible]!
    let alpha = Math.min(1, Math.max(0.12, Math.min(os, oc)) * 1.1) * 0.8
    let couleur = pal.arete
    let largeur = 1.35
    const incidente = survol !== null && (r.source === survol || r.cible === survol)
    if (incidente) {
      couleur = pal.accent
      alpha = 0.95
      largeur = 2.1
    }
    if (vue.ligneeActive) {
      const ls = vue.lignee[r.source]!, lc = vue.lignee[r.cible]!
      const dans = ls > 0 && lc > 0 && !(ls === 2 && lc === 1) && !(ls === 1 && lc === 2) && !(ls === 3 && lc === 1) && !(ls === 2 && lc === 3)
      if (dans) {
        couleur = ls === 1 || lc === 1 ? pal.ancetre : pal.descendant
        alpha = 0.95
        largeur = 2.2
      } else alpha *= 0.5
    }
    if (actifs && !(actifs.has(r.source) && actifs.has(r.cible))) alpha *= 0.35
    if (r.abandon) {
      couleur = etat.palette.impasse
      ctx.setLineDash([5, 4])
    } else ctx.setLineDash([])
    // Points écran.
    let pts: { x: number; y: number }[]
    const ss = echelle(vue, page, r.source), sc = echelle(vue, page, r.cible)
    const bs = page.boites[r.source]!, bc = page.boites[r.cible]!
    const demi = (b: Boite) => (b.genre === 'decision' ? 19 : b.w / 2)
    if (transition || e > 0.02) {
      // Pendant une transition (ou en 3D) : chemin depuis les positions courantes.
      const pr = vue.projection
      const xa = pr.x[r.source]! + demi(bs) * ss, ya = pr.y[r.source]!
      const xb = pr.x[r.cible]! - demi(bc) * sc, yb = pr.y[r.cible]!
      if (transition) pts = [{ x: xa, y: ya }, { x: xb, y: yb }]
      else {
        // 3D : route projetée, profondeur interpolée le long du chemin.
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
        fleche(ctx, pts[1]!.x, pts[1]!.y, 1, 0, 3.2 + largeur)
        continue
      }
    } else pts = r.points.map(([x, y]) => cam.projeterPoint(monde(x, y)))
    ctx.strokeStyle = rgba(couleur, alpha)
    ctx.lineWidth = largeur
    ctx.beginPath()
    if (lisse) {
      // Lissée : on relie les stations horizontales (ports et couloirs) par des courbes en S.
      const stations = pts.filter((_, k) => k === 0 || k === pts.length - 1 || (k < pts.length - 1 && Math.abs(pts[k]!.y - pts[k + 1]!.y) < 0.5 && Math.abs(pts[k]!.x - pts[k + 1]!.x) > 20))
      tracerLisse(ctx, stations)
    } else tracerArrondi(ctx, pts, rayon * Math.min(1.5, s0))
    ctx.stroke()
    const z = pts[pts.length - 1]!, y = pts[pts.length - 2] ?? pts[0]!
    ctx.fillStyle = rgba(couleur, alpha)
    ctx.setLineDash([])
    fleche(ctx, z.x, z.y, lisse ? 1 : z.x - y.x, lisse ? 0 : z.y - y.y, 3.2 + largeur)
  }
  ctx.restore()

  // Liens décision → choix dans la marge : petit trait vertical vers le drapeau.
  ctx.save()
  for (const l of page.liensMarge) {
    const pr = vue.projection
    const s = echelle(vue, page, l.source)
    const bd = page.boites[l.source]!, bc = page.boites[l.cible]!
    const xm = pr.x[l.cible]! - (bc.w / 2 - 6) * s
    const ya = pr.y[l.source]!, yb = pr.y[l.cible]! - (bc.h / 2 + 4) * s
    const xa = pr.x[l.source]! - 19 * s
    const op = Math.min(vue.opaciteAffichee[l.source]!, vue.opaciteAffichee[l.cible]!)
    ctx.strokeStyle = rgba(pal.arete, 0.8 * op)
    ctx.fillStyle = rgba(pal.arete, 0.8 * op)
    ctx.lineWidth = 1.3
    ctx.beginPath()
    tracerArrondi(ctx, [{ x: xa, y: ya }, { x: xm, y: ya }, { x: xm, y: yb }], 6 * s)
    ctx.stroke()
    fleche(ctx, xm, yb, 0, 1, 4.2)
    void bd
  }
  ctx.restore()

  if (lire<boolean>(vue, 'liensSemantiques')) dessinerLiensSemantiques(c, etat)
}

/** Enveloppes des sous-arguments dépliés. */
function dessinerDeplies({ ctx, vue }: ContexteDessinR, etat: EtatRendu): void {
  const page = etat.page!
  if (!etatSquelette.deplies.size) return
  const g = vue.lecture
  const j = g.justification
  const pal = vue.palette
  ctx.save()
  for (const [tete, ids] of etatSquelette.deplies) {
    const ensemble = new Set([tete, ...ids])
    const pts: number[] = []
    for (let p = 0; p < vue.nU; p++) if (g.unites[p]!.membres.some((m) => ensemble.has(j.noeuds[m]!.id))) pts.push(p)
    if (pts.length < 2) continue
    // Un halo pointillé autour de chaque énoncé issu du dépliage (pas d'enveloppe globale : elle
    // engloberait des cartes étrangères), et une mention au-dessus de la conclusion.
    for (const p of pts) {
      const b = page.boites[p]!, s = echelle(vue, page, p)
      const op = vue.opaciteAffichee[p]!
      const x = vue.projection.x[p]!, y = vue.projection.y[p]!
      const l = b.genre === 'decision' ? Math.max(24, b.w / 2) : b.w / 2
      ctx.fillStyle = rgba(pal.accent, 0.06 * op)
      ctx.strokeStyle = rgba(pal.accent, 0.55 * op)
      ctx.setLineDash([4, 3])
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.roundRect(x - (l + 6) * s, y - (b.haut + 6) * s, (2 * l + 12) * s, (b.haut + b.bas + 10) * s, 9 * s)
      ctx.fill()
      ctx.stroke()
      ctx.setLineDash([])
      if (j.noeuds[g.unites[p]!.conclusion]!.id === tete) {
        ctx.font = `600 ${Math.max(8, 9.5 * s)}px ${pal.police}`
        ctx.textAlign = 'right'
        ctx.textBaseline = 'bottom'
        ctx.fillStyle = rgba(pal.accent, 0.9 * op)
        ctx.fillText(`▾ déplié (${pts.length}) · double-clic : replier`, x + (l + 6) * s, y - (b.haut + 8) * s)
      }
    }
  }
  ctx.restore()
}

/** Contradictions, résolutions, abandons : arcs pointillés au-dessus du graphe. */
function dessinerLiensSemantiques({ ctx, vue }: ContexteDessinR, etat: EtatRendu): void {
  const j = vue.justification
  const pal = vue.palette
  const page = etat.page!
  ctx.save()
  ctx.font = `600 10px ${pal.police}`
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
      const couleur = l.genre === 'contredit' ? pal.contredit : l.genre === 'resout' ? pal.statut.valide : etat.palette.impasse
      const pr = vue.projection
      const sa = echelle(vue, page, a), sb = echelle(vue, page, b)
      const x1 = pr.x[a]!, y1 = pr.y[a]! - page.boites[a]!.haut * sa
      const x2 = pr.x[b]!, y2 = pr.y[b]! - page.boites[b]!.haut * sb
      const my = Math.min(y1, y2) - Math.max(26, Math.abs(x2 - x1) * 0.18)
      ctx.strokeStyle = rgba(couleur, 0.8 * op)
      ctx.lineWidth = 1.3
      ctx.setLineDash(l.genre === 'resout' ? [] : [4, 4])
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.bezierCurveTo(x1, my, x2, my, x2, y2)
      ctx.stroke()
      ctx.setLineDash([])
      const tx = (x1 + x2) / 2, ty = my + (Math.min(y1, y2) - my) * 0.25
      const texte = l.genre === 'contredit' ? 'contredit' : l.genre === 'resout' ? 'résout' : l.genre === 'abandonne' ? 'abandonne' : 'remplace'
      const w = ctx.measureText(texte).width + 10
      ctx.fillStyle = rgba(pal.surface, 0.95 * op)
      ctx.fillRect(tx - w / 2, ty - 7, w, 14)
      ctx.fillStyle = rgba(couleur, op)
      ctx.fillText(texte, tx, ty)
    }
  }
  ctx.restore()
}

// ─── Calque « dessus » : cartes, décisions, drapeaux, pastilles ───────────────

export function dessinerDessus(c: ContexteDessinR, etat: EtatRendu): void {
  const { ctx, vue } = c
  const page = etat.page
  etat.cibles = []
  if (!page) return
  const pal = vue.palette
  const pr = vue.projection
  // Masqués (contexte pur) : visibles seulement avec les liens complets.
  ctx.save()
  for (let p = vue.nU; p < vue.nP; p++) {
    const pres = vue.presence[p]!
    if (pres < 0.05 || !pr.visible[p]) continue
    const s = echelle(vue, page, p)
    const x = pr.x[p]!, y = pr.y[p]!
    const n = vue.noeud(p)
    ctx.fillStyle = rgba(pal.couches[vue.disposition.couche[p]!]!, 0.85 * pres)
    ctx.beginPath()
    ctx.arc(x, y, 4 * Math.min(1.4, s), 0, Math.PI * 2)
    ctx.fill()
    if (s > 0.55) {
      ctx.font = `500 ${10.5 * Math.min(1.3, s)}px ${pal.police}`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = rgba(pal.texteDoux, pres)
      ctx.fillText(page.boites[p]!.lignes[0] ?? n.nom, x - 8 * s, y)
    }
    etat.cibles.push({ genre: 'masque', point: p, noeud: vue.indexNoeud(p), x0: x - 6, y0: y - 6, x1: x + 6, y1: y + 6 })
  }
  ctx.restore()

  // Unités : les plus en avant en dernier (survol, lignée), et de l'arrière vers l'avant en 3D.
  const ordre: number[] = []
  for (let p = 0; p < vue.nU; p++) ordre.push(p)
  const devant = (p: number) => (p === vue.survol ? 3 : vue.lignee[p]! > 0 ? 2 : 0)
  ordre.sort((a, b) => devant(a) - devant(b) || pr.profondeur[b]! - pr.profondeur[a]!)
  const actifs = choixActifs(vue, etat)
  const toujours = lire<string>(vue, 'bandesChoix') === 'toujours'
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
    // Bandes de choix : les choix actifs dont ce point dépend.
    const bandes: string[] = []
    for (const [q, k] of etat.couleurChoix) {
      if (q === p) continue
      if ((toujours || actifs.includes(q)) && page.portees.get(q)?.includes(p)) bandes.push(etat.palette.choix[k % etat.palette.choix.length]!)
    }
    if (b.genre === 'drapeau') dessinerDrapeau(ctx, vue, etat, p, b)
    else if (b.genre === 'decision') dessinerDecision(ctx, vue, etat, p, b, bandes)
    else dessinerCarte(ctx, vue, etat, p, b, bandes)
    ctx.restore()
    // Cibles (écran).
    const x = pr.x[p]!, y = pr.y[p]!
    if (b.genre === 'decision') {
      const l = Math.max(19, b.w / 2)
      etat.cibles.push({ genre: 'carte', point: p, noeud: -1, x0: x - l * s, y0: y - b.haut * s, x1: x + l * s, y1: y + 22 * s })
      if (b.impasse && lire<boolean>(vue, 'impasses')) etat.cibles.push({ genre: 'impasse', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y + 22 * s, x1: x + (b.w / 2) * s, y1: y + 48 * s })
    } else if (b.genre === 'drapeau') etat.cibles.push({ genre: 'drapeau', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y - (b.h / 2) * s, x1: x + (b.w / 2) * s, y1: y + (b.h / 2) * s })
    else etat.cibles.push({ genre: 'carte', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y - (b.h / 2) * s, x1: x + (b.w / 2) * s, y1: y + (b.h / 2) * s })
    const y0 = yPastilles(b)
    for (const it of rangee(vue, b)) {
      const cx = x + it.x * s, cy = y + y0 * s
      if (it.renvoi >= 0) etat.cibles.push({ genre: 'renvoi', point: it.renvoi, noeud: -1, x0: cx - 11 * s, y0: cy - 7 * s, x1: cx + 11 * s, y1: cy + 7 * s })
      else etat.cibles.push({ genre: 'pastille', point: p, noeud: it.noeud, x0: cx - 7 * s, y0: cy - 7 * s, x1: cx + 7 * s, y1: cy + 7 * s })
    }
  }
}

/** Ordonnée (relative au point d'ancrage) de la rangée de pastilles. */
function yPastilles(b: Boite): number {
  if (b.genre === 'decision') return 19 + (b.impasse ? 30 : 4) + 8
  return b.h / 2 + 11
}

/** Bordure selon la lignée ou le survol ; null sinon. */
function bordureLignee(vue: VueRaisonnement, p: number): { couleur: string; largeur: number } | null {
  const pal = vue.palette
  if (vue.ligneeActive) {
    const l = vue.lignee[p]!
    if (l === 3) return { couleur: pal.accent, largeur: 2.4 }
    if (l === 1) return { couleur: pal.ancetre, largeur: 2 }
    if (l === 2) return { couleur: pal.descendant, largeur: 2 }
  }
  if (vue.survol === p) return { couleur: pal.accent, largeur: 2 }
  return null
}

/** Rangée sous la carte : renvois « (k) » puis pastilles de contexte (abscisses relatives). */
function rangee(vue: VueRaisonnement, b: Boite): { x: number; renvoi: number; noeud: number }[] {
  const r: { x: number; renvoi: number; noeud: number }[] = []
  let x = -b.w / 2 + 9
  for (const q of b.renvois) {
    r.push({ x: x + 5, renvoi: q, noeud: -1 })
    x += 24
  }
  if (lire<boolean>(vue, 'pastillesContexte')) for (const pa of b.pastilles) {
    r.push({ x, renvoi: -1, noeud: pa.noeud })
    x += 15
  }
  return r
}

/** Numéro « (k) » d'une carte citée par renvoi : onglet en haut à gauche. */
function dessinerNumero(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, b: Boite, p: number, x: number, y: number): void {
  if (!b.numero) return
  const pal = vue.palette
  const sv = etat.survol
  const allume = sv?.genre === 'renvoi' && sv.point === p
  const t = `(${b.numero})`
  ctx.font = `700 9.5px ${pal.police}`
  const w = ctx.measureText(t).width + 8
  ctx.fillStyle = allume ? pal.accent : pal.surface
  ctx.strokeStyle = pal.accent
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(x, y - 13, w, 13, [4, 4, 0, 0])
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = allume ? '#ffffff' : pal.accent
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(t, x + 4, y - 6)
}

function dessinerPastilles(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, b: Boite): void {
  const items = rangee(vue, b)
  if (!items.length) return
  const pal = vue.palette
  const y = yPastilles(b)
  const sv = etat.survol
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Renvois : « (k) » encadré, couleur d'accent.
  for (const it of items) {
    if (it.renvoi < 0) continue
    const n = etat.page?.boites[it.renvoi]?.numero ?? 0
    const allume = sv?.genre === 'renvoi' && sv.point === it.renvoi
    ctx.font = `700 9.5px ${pal.police}`
    ctx.fillStyle = allume ? pal.accent : pal.surface
    ctx.strokeStyle = pal.accent
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(it.x - 10.5, y - 6.5, 21, 13, 6.5)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = allume ? '#ffffff' : pal.accent
    ctx.fillText(`(${n})`, it.x, y + 0.5)
  }
  ctx.font = `700 8.5px ${pal.police}`
  const pastilles = items.filter((it) => it.renvoi < 0)
  pastilles.forEach((it, k) => {
    const pa = b.pastilles[k]!
    const x = it.x
    const allume = sv?.genre === 'pastille' && sv.noeud === pa.noeud
    const couleur = pal.couches[pa.couche]!
    ctx.beginPath()
    ctx.arc(x, y, allume ? 7.5 : 6, 0, Math.PI * 2)
    if (pa.lettre === '+') {
      ctx.fillStyle = pal.surface
      ctx.fill()
      ctx.strokeStyle = couleur
      ctx.lineWidth = 1.2
      ctx.stroke()
      ctx.fillStyle = couleur
    } else {
      ctx.fillStyle = allume ? pal.accent : rgba(couleur, 0.9)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
    }
    if (allume) {
      ctx.strokeStyle = pal.accent
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x, y, 10, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = '#ffffff'
    }
    ctx.fillText(pa.lettre, x, y + 0.5)
  })
  if (b.plus) {
    ctx.fillStyle = pal.texteDoux
    ctx.font = `600 9px ${pal.police}`
    ctx.textAlign = 'left'
    const dernier = items[items.length - 1]!
    ctx.fillText(`+${b.plus}`, dernier.x + 8, y + 0.5)
  }
}

function dessinerCarte(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, bandes: string[]): void {
  const pal = vue.palette
  const n = vue.noeud(p)
  const w = b.w, h = b.h
  const x0 = -w / 2, y0 = -h / 2
  const taille = lire<number>(vue, 'taillePolice')
  const majeur = b.genre === 'majeur'
  const couleurType = pal.couches[vue.disposition.couche[p]!]!
  // Étape repliée : feuillets empilés derrière.
  if (b.genre === 'etape' || (vue.lecture.unites[p]?.membres.length ?? 1) > 1) {
    for (const d of [7, 3.5]) {
      ctx.fillStyle = pal.surface
      ctx.strokeStyle = rgba(b.abandon ? etat.palette.impasse : pal.texteDoux, 0.45)
      ctx.lineWidth = 1
      if (b.abandon) ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.roundRect(x0 + d, y0 - d, w, h, 6)
      ctx.fill()
      ctx.stroke()
      ctx.setLineDash([])
    }
  }
  if (vue.survol === p) {
    ctx.shadowColor = rgba(pal.texte, 0.22)
    ctx.shadowBlur = 14
    ctx.shadowOffsetY = 3
  }
  ctx.fillStyle = b.abandon ? etat.palette.surface2 : pal.surface
  ctx.beginPath()
  ctx.roundRect(x0, y0, w, h, 6)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  if (majeur) {
    ctx.fillStyle = rgba(couleurType, 0.07)
    ctx.fill()
  }
  // Teinte des choix actifs + bandes fines à gauche.
  if (bandes.length) {
    ctx.fillStyle = rgba(bandes[0]!, 0.07)
    ctx.fill()
    ctx.save()
    ctx.clip()
    bandes.forEach((cl, k) => {
      ctx.fillStyle = cl
      ctx.fillRect(x0 + k * 4, y0, 4, h)
    })
    ctx.restore()
  }
  const bl = bordureLignee(vue, p)
  ctx.strokeStyle = bl ? bl.couleur : b.abandon ? etat.palette.impasse : majeur ? rgba(couleurType, 0.9) : n.statut === 'refute' ? pal.statut.refute : rgba(pal.texteDoux, 0.45)
  ctx.lineWidth = bl ? bl.largeur : majeur ? 1.6 : 1
  if (b.abandon && !bl) ctx.setLineDash([4, 3])
  ctx.beginPath()
  ctx.roundRect(x0, y0, w, h, 6)
  ctx.stroke()
  ctx.setLineDash([])
  // Étiquette de type (petites capitales) et statut / validation à droite.
  const gauche = x0 + 8 + bandes.length * 4
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.font = `700 8.5px ${pal.police}`
  ctx.fillStyle = b.abandon ? etat.palette.impasse : b.genre === 'etape' ? pal.accent : couleurType
  ctx.fillText(b.etiquette, gauche, y0 + 15)
  dessinerStatut(ctx, vue, p, x0 + w - 7, y0 + 15)
  // Titre.
  ctx.textAlign = 'left'
  ctx.font = `${majeur ? 650 : 560} ${taille}px ${pal.police}`
  ctx.fillStyle = b.abandon ? pal.texteDoux : pal.texte
  b.lignes.forEach((l, k) => ctx.fillText(l, gauche, y0 + 22 + taille + k * (taille + 3) - 2))
  // Intervalle de confiance : piste, intervalle, estimation.
  const c = n.confiance
  const xa = gauche, xb = x0 + w - 8, yb = y0 + h - 6
  ctx.fillStyle = rgba(pal.texteDoux, 0.18)
  ctx.fillRect(xa, yb - 1, xb - xa, 2)
  ctx.fillStyle = rgba(pal.statut[n.statut], 0.55)
  ctx.fillRect(xa + (xb - xa) * c.bas, yb - 1.5, Math.max(1.5, (xb - xa) * (c.haut - c.bas)), 3)
  ctx.fillStyle = pal.statut[n.statut]
  ctx.fillRect(xa + (xb - xa) * c.estimation - 1, yb - 3.5, 2, 7)
  dessinerPastilles(ctx, vue, etat, b)
  dessinerNumero(ctx, vue, etat, b, p, x0 + 6, y0)
}

/** Statut (✓ ? ✕) et validation (H, IA, IA+H) en haut à droite. */
function dessinerStatut(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, p: number, xDroite: number, y: number): void {
  const pal = vue.palette
  const n = vue.noeud(p)
  const val = n.validation === 'aucune' ? '—' : n.validation === 'ia_humain' ? 'IA+H' : n.validation === 'humain' ? 'H' : 'IA'
  ctx.textAlign = 'right'
  ctx.font = `600 8.5px ${pal.police}`
  ctx.fillStyle = pal.validation[n.validation]
  ctx.fillText(val, xDroite, y)
  const wv = ctx.measureText(val).width
  ctx.font = `800 10px ${pal.police}`
  ctx.fillStyle = pal.statut[n.statut]
  ctx.fillText(n.statut === 'valide' ? '✓' : n.statut === 'incertain' ? '?' : '✕', xDroite - wv - 4, y + 0.5)
  void LIBELLES_VALIDATION
}

function dessinerDecision(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, bandes: string[]): void {
  const pal = vue.palette
  const taille = lire<number>(vue, 'taillePolice')
  const couleur = pal.couches[2]!
  const bl = bordureLignee(vue, p)
  // Libellé au-dessus du losange.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `650 ${taille}px ${pal.police}`
  ctx.fillStyle = pal.texte
  const n0 = b.lignes.length
  b.lignes.forEach((l, k) => ctx.fillText(l, 0, -19 - 6 - (n0 - 1 - k) * (taille + 3)))
  // Bandes des choix actifs : petits traits sous le libellé.
  bandes.forEach((cl, k) => {
    ctx.fillStyle = cl
    ctx.fillRect(-b.w / 2 + 4 + k * 5, -19 - 4 - n0 * (taille + 3) - 2, 3, n0 * (taille + 3))
  })
  // Impasse : alternative rejetée, en pointillé vers une boîte grisée.
  if (b.impasse && lire<boolean>(vue, 'impasses')) {
    const texte = b.impasse.texte
    ctx.strokeStyle = etat.palette.impasse
    ctx.lineWidth = 1.2
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(0, 19)
    ctx.lineTo(0, 27)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.font = `500 ${Math.max(9, taille - 2.5)}px ${pal.police}`
    const suffixe = b.impasse.autres ? `  +${b.impasse.autres}` : ''
    let t = texte
    const max = b.w - 22
    while (t.length > 3 && ctx.measureText(`✕ ${t}…${suffixe}`).width > max) t = t.slice(0, -1)
    const affiche = `✕ ${t === texte ? t : t.trimEnd() + '…'}${suffixe}`
    const wt = ctx.measureText(affiche).width + 14
    ctx.fillStyle = etat.palette.surface2
    ctx.strokeStyle = rgba(etat.palette.impasse, 0.8)
    ctx.setLineDash([3, 2])
    ctx.beginPath()
    ctx.roundRect(-wt / 2, 27, wt, 18, 9)
    ctx.fill()
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = etat.palette.impasse
    ctx.textBaseline = 'middle'
    ctx.fillText(affiche, 0, 36.5)
    ctx.textBaseline = 'alphabetic'
  }
  // Losange.
  if (vue.survol === p) {
    ctx.shadowColor = rgba(pal.texte, 0.25)
    ctx.shadowBlur = 12
  }
  ctx.beginPath()
  ctx.moveTo(0, -19)
  ctx.lineTo(19, 0)
  ctx.lineTo(0, 19)
  ctx.lineTo(-19, 0)
  ctx.closePath()
  ctx.fillStyle = pal.surface
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.fillStyle = rgba(couleur, 0.16)
  ctx.fill()
  ctx.strokeStyle = bl ? bl.couleur : couleur
  ctx.lineWidth = bl ? bl.largeur + 0.4 : 1.8
  ctx.stroke()
  ctx.fillStyle = couleur
  ctx.font = `800 12px ${pal.police}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('✓', 0, 1)
  dessinerPastilles(ctx, vue, etat, b)
}

function dessinerDrapeau(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite): void {
  const pal = vue.palette
  const k = etat.couleurChoix.get(p) ?? 0
  const couleur = etat.palette.choix[k % etat.palette.choix.length]!
  const actif = etat.epingles.has(p) || (etat.survol?.genre === 'drapeau' && etat.survol.point === p)
  const taille = lire<number>(vue, 'taillePolice') - 0.5
  const w = b.w, h = b.h
  const x0 = -w / 2, y0 = -h / 2
  const bl = bordureLignee(vue, p)
  // Hampe.
  ctx.strokeStyle = couleur
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x0 + 3, y0 - 4)
  ctx.lineTo(x0 + 3, y0 + h + 9)
  ctx.stroke()
  // Pennon à queue d'aronde.
  ctx.beginPath()
  ctx.moveTo(x0 + 4, y0)
  ctx.lineTo(x0 + w, y0)
  ctx.lineTo(x0 + w - 9, y0 + h / 2)
  ctx.lineTo(x0 + w, y0 + h)
  ctx.lineTo(x0 + 4, y0 + h)
  ctx.closePath()
  ctx.fillStyle = pal.surface
  ctx.fill()
  ctx.fillStyle = rgba(couleur, actif ? 0.3 : 0.14)
  ctx.fill()
  ctx.strokeStyle = bl ? bl.couleur : rgba(couleur, actif ? 1 : 0.7)
  ctx.lineWidth = bl ? bl.largeur : actif ? 1.8 : 1.1
  ctx.stroke()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `700 8.5px ${pal.police}`
  ctx.fillStyle = couleur
  // Portée visible : cartes du squelette qui dépendent de ce choix (graphe complet).
  const portee = etat.page?.portees.get(p)?.filter((q) => q < vue.nU).length ?? 0
  ctx.fillText(`CHOIX · ${portee} carte${portee > 1 ? 's' : ''}${etat.epingles.has(p) ? ' · épinglé' : ''}`, x0 + 11, y0 + 12)
  ctx.font = `600 ${taille}px ${pal.police}`
  ctx.fillStyle = pal.texte
  b.lignes.forEach((l, i) => ctx.fillText(l, x0 + 11, y0 + 16 + taille + i * (taille + 3) - 1))
}

// ─── Survol ──────────────────────────────────────────────────────────────────

/** Élément sous le pointeur (écran), d'après la dernière image. */
export function cibleSous(etat: EtatRendu, x: number, y: number): Cible | null {
  // Les pastilles et impasses d'abord (petites, au-dessus des cartes voisines), puis l'ordre inverse du dessin.
  for (let k = etat.cibles.length - 1; k >= 0; k--) {
    const c = etat.cibles[k]!
    if ((c.genre === 'pastille' || c.genre === 'impasse') && x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) return c
  }
  for (let k = etat.cibles.length - 1; k >= 0; k--) {
    const c = etat.cibles[k]!
    if (x >= c.x0 - 2 && x <= c.x1 + 2 && y >= c.y0 - 2 && y <= c.y1 + 2) return c
  }
  return null
}
