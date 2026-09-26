// R13 · Rendu du blueprint sur calques canvas : sections, arêtes orthogonales, énoncés (identifiant
// monospace, état de preuve codé par la bordure et un symbole), points de branchement des décisions,
// déclarations de variables (choix de modélisation), contexte en lettres encadrées. Sigma ne sert plus
// qu'aux liens complets (L) : ses points sont invisibles et le survol passe par `cibleSous`.

import { rgba, type ContexteDessinR, type ValeurReglage, type VueRaisonnement } from '../../src/raisonnement'
import type { Boite, MiseEnPage } from './mise-en-page'
import { indice, motAdmis, SYMBOLE_ETAT, type EtatPreuve } from './preuve'
import { etatSquelette } from './squelette'

export interface PaletteR13 {
  etats: Record<EtatPreuve, string>
  /** Mot-clé `variable` et variables actives. */
  variable: string
  surface2: string
  impasse: string
  mono: string
}

export function lirePaletteR13(el: HTMLElement): PaletteR13 {
  const s = getComputedStyle(el)
  const v = (n: string, d: string) => s.getPropertyValue(n).trim() || d
  return {
    etats: {
      verifie: v('--r13-verifie', '#1d7a4c'),
      a_verifier: v('--r13-a-verifier', '#a86400'),
      en_cours: v('--r13-en-cours', '#2458b3'),
      echec: v('--r13-echec', '#c02a2a'),
      admis: v('--r13-admis', '#6b7280'),
    },
    variable: v('--r13-variable', '#6a3fb5'),
    surface2: v('--surface-2', '#f2f4f8'),
    impasse: v('--r13-impasse', '#9aa1ae'),
    mono: v('--r13-mono', "'JetBrains Mono', 'Cascadia Mono', Consolas, ui-monospace, monospace"),
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
  palette: PaletteR13
  cibles: Cible[]
  /** Élément survolé (déterminé par cibleSous). */
  survol: Cible | null
  /** Variables épinglées (points de choix) : leur portée reste mise en avant. */
  epingles: Set<number>
  /** Choix de modélisation visibles (point → numéro de variable). */
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

  // Sections : « §k nom » en monospace, filet dessous, séparateurs verticaux fins (s'estompent en 3D).
  if (lire<boolean>(vue, 'enTetes') && page.zones.length) {
    const alpha = Math.max(0, 1 - e * 1.6)
    const yH = page.bornes.y0 - 40, yB = page.bornes.y1 + 18
    const mono = etat.palette.mono
    ctx.save()
    page.zones.forEach((z, k) => {
      const a = cam.projeterPoint(monde(z.x0, yH - 16)), b = cam.projeterPoint(monde(z.x1, yB))
      if (!a.visible || !b.visible || alpha < 0.01) return
      const taille = Math.max(8.5, Math.min(13, 10.5 * s0))
      const g = cam.projeterPoint(monde(z.x0 + 6, yH)), d = cam.projeterPoint(monde(z.x1 - 6, yH + 9))
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      const num = `§${k + 1}`
      ctx.font = `600 ${taille}px ${mono}`
      const wNum = ctx.measureText(num + ' ').width
      ctx.font = `500 ${taille}px ${mono}`
      // Nom seulement s'il tient dans la colonne (sinon il chevaucherait la voisine).
      const tient = wNum + ctx.measureText(z.nom).width < Math.abs(b.x - a.x) - 12
      ctx.fillStyle = rgba(pal.texte, 0.85 * alpha)
      ctx.font = `600 ${taille}px ${mono}`
      ctx.fillText(num, g.x, g.y)
      if (tient) {
        ctx.fillStyle = rgba(pal.texteDoux, alpha)
        ctx.font = `500 ${taille}px ${mono}`
        ctx.fillText(z.nom, g.x + wNum, g.y)
      }
      ctx.strokeStyle = rgba(pal.texte, 0.28 * alpha)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(g.x, d.y)
      ctx.lineTo(d.x, d.y)
      ctx.stroke()
      // Séparateur vertical fin entre sections.
      if (k > 0) {
        const h0 = cam.projeterPoint(monde(z.x0, yH - 12)), h1 = cam.projeterPoint(monde(z.x0, yB))
        ctx.strokeStyle = rgba(pal.texteDoux, 0.16 * alpha)
        ctx.setLineDash([2, 4])
        ctx.beginPath()
        ctx.moveTo(h0.x, h0.y)
        ctx.lineTo(h1.x, h1.y)
        ctx.stroke()
        ctx.setLineDash([])
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
    let largeur = 1.1
    const incidente = survol !== null && (r.source === survol || r.cible === survol)
    if (incidente) {
      couleur = pal.accent
      alpha = 0.95
      largeur = 1.8
    }
    if (vue.ligneeActive) {
      const ls = vue.lignee[r.source]!, lc = vue.lignee[r.cible]!
      const dans = ls > 0 && lc > 0 && !(ls === 2 && lc === 1) && !(ls === 1 && lc === 2) && !(ls === 3 && lc === 1) && !(ls === 2 && lc === 3)
      if (dans) {
        couleur = ls === 1 || lc === 1 ? pal.ancetre : pal.descendant
        alpha = 0.95
        largeur = 1.8
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
      ctx.strokeStyle = rgba(pal.texteDoux, 0.55 * op)
      ctx.setLineDash([2, 3])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.rect(x - (l + 6) * s, y - (b.haut + 6) * s, (2 * l + 12) * s, (b.haut + b.bas + 10) * s)
      ctx.stroke()
      ctx.setLineDash([])
      if (j.noeuds[g.unites[p]!.conclusion]!.id === tete) {
        ctx.font = `500 ${Math.max(8, 9 * s)}px ${etat.palette.mono}`
        ctx.textAlign = 'right'
        ctx.textBaseline = 'bottom'
        ctx.fillStyle = rgba(pal.texteDoux, op)
        ctx.fillText(`▾ preuve dépliée (${pts.length}) · double-clic : replier`, x + (l + 6) * s, y - (b.haut + 8) * s)
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
  ctx.font = `500 9.5px ${etat.palette.mono}`
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

// ─── Calque « dessus » : énoncés, branchements, variables, contexte ─────────────

/** Numéros des variables actives (survolée + épinglées). */
export function variablesActives(vue: VueRaisonnement, etat: EtatRendu): Set<number> {
  const r = new Set<number>()
  for (const q of choixActifs(vue, etat)) {
    const k = etat.page?.boites[q]?.variable
    if (k) r.add(k)
  }
  return r
}

export function dessinerDessus(c: ContexteDessinR, etat: EtatRendu): void {
  const { ctx, vue } = c
  const page = etat.page
  etat.cibles = []
  if (!page) return
  const pal = vue.palette
  const pr = vue.projection
  // Masqués (contexte pur) : petits carrés, visibles seulement avec les liens complets.
  ctx.save()
  for (let p = vue.nU; p < vue.nP; p++) {
    const pres = vue.presence[p]!
    if (pres < 0.05 || !pr.visible[p]) continue
    const s = echelle(vue, page, p)
    const x = pr.x[p]!, y = pr.y[p]!
    const r = 3.5 * Math.min(1.4, s)
    ctx.strokeStyle = rgba(pal.texteDoux, 0.8 * pres)
    ctx.lineWidth = 1
    ctx.strokeRect(x - r, y - r, 2 * r, 2 * r)
    if (s > 0.55) {
      ctx.font = `500 ${9.5 * Math.min(1.3, s)}px ${etat.palette.mono}`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = rgba(pal.texteDoux, pres)
      ctx.fillText(page.boites[p]!.etiquette, x - 8 * s, y)
    }
    etat.cibles.push({ genre: 'masque', point: p, noeud: vue.indexNoeud(p), x0: x - 6, y0: y - 6, x1: x + 6, y1: y + 6 })
  }
  ctx.restore()

  // Unités : les plus en avant en dernier (survol, lignée), et de l'arrière vers l'avant en 3D.
  const ordre: number[] = []
  for (let p = 0; p < vue.nU; p++) ordre.push(p)
  const devant = (p: number) => (p === vue.survol ? 3 : vue.lignee[p]! > 0 ? 2 : 0)
  ordre.sort((a, b) => devant(a) - devant(b) || pr.profondeur[b]! - pr.profondeur[a]!)
  const actives = variablesActives(vue, etat)
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
    if (b.genre === 'drapeau') dessinerVariable(ctx, vue, etat, p, b)
    else if (b.genre === 'decision') dessinerBranchement(ctx, vue, etat, p, b)
    else dessinerEnonce(ctx, vue, etat, p, b, actives)
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

/** Ordonnée (relative au point d'ancrage) de la rangée de contexte. */
function yPastilles(b: Boite): number {
  if (b.genre === 'decision') return 19 + (b.impasse ? 30 : 4) + 8
  return b.h / 2 + 11
}

/** Cadre de lignée ou de survol (dessiné autour du cadre d'état, qui reste lisible) ; null sinon. */
function cadreLignee(vue: VueRaisonnement, p: number): { couleur: string; largeur: number } | null {
  const pal = vue.palette
  if (vue.ligneeActive) {
    const l = vue.lignee[p]!
    if (l === 3) return { couleur: pal.accent, largeur: 2 }
    if (l === 1) return { couleur: pal.ancetre, largeur: 1.5 }
    if (l === 2) return { couleur: pal.descendant, largeur: 1.5 }
  }
  if (vue.survol === p) return { couleur: pal.texte, largeur: 1.2 }
  return null
}

/** Rangée sous l'énoncé : renvois « (k) » puis lettres de contexte (abscisses relatives). */
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

/** Numéro « (k) » d'un énoncé cité par renvoi : onglet carré au-dessus, à gauche. */
function dessinerNumero(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, b: Boite, p: number, x: number, y: number): void {
  if (!b.numero) return
  const pal = vue.palette
  const sv = etat.survol
  const allume = sv?.genre === 'renvoi' && sv.point === p
  const t = `(${b.numero})`
  ctx.font = `600 9px ${etat.palette.mono}`
  const w = ctx.measureText(t).width + 8
  ctx.fillStyle = allume ? pal.texte : pal.surface
  ctx.strokeStyle = rgba(pal.texte, 0.55)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.rect(x, y - 12, w, 12)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = allume ? pal.surface : pal.texte
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(t, x + 4, y - 5.5)
}

/** Contexte sous l'énoncé : lettres encadrées (H, D, O, A, L, +) et renvois « (k) ». */
function dessinerContexte(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, b: Boite): void {
  const items = rangee(vue, b)
  if (!items.length) return
  const pal = vue.palette
  const mono = etat.palette.mono
  const y = yPastilles(b)
  const sv = etat.survol
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const it of items) {
    if (it.renvoi < 0) continue
    const n = etat.page?.boites[it.renvoi]?.numero ?? 0
    const allume = sv?.genre === 'renvoi' && sv.point === it.renvoi
    ctx.font = `600 9px ${mono}`
    ctx.fillStyle = allume ? pal.texte : pal.surface
    ctx.strokeStyle = rgba(pal.texte, 0.55)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.rect(it.x - 10.5, y - 6, 21, 12)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = allume ? pal.surface : pal.texte
    ctx.fillText(`(${n})`, it.x, y + 0.5)
  }
  ctx.font = `600 8.5px ${mono}`
  const pastilles = items.filter((it) => it.renvoi < 0)
  pastilles.forEach((it, k) => {
    const pa = b.pastilles[k]!
    const allume = sv?.genre === 'pastille' && sv.noeud === pa.noeud
    ctx.beginPath()
    ctx.rect(it.x - 5.5, y - 5.5, 11, 11)
    ctx.fillStyle = allume ? pal.texte : pal.surface
    ctx.fill()
    ctx.strokeStyle = rgba(pal.texteDoux, allume ? 1 : 0.6)
    ctx.lineWidth = 1
    if (pa.lettre === '+') ctx.setLineDash([1.5, 1.5])
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = allume ? pal.surface : pal.texteDoux
    ctx.fillText(pa.lettre, it.x, y + 0.5)
  })
  if (b.plus) {
    ctx.fillStyle = pal.texteDoux
    ctx.font = `500 9px ${mono}`
    ctx.textAlign = 'left'
    const dernier = items[items.length - 1]!
    ctx.fillText(`+${b.plus}`, dernier.x + 8, y + 0.5)
  }
}

/** Trait de l'état de preuve : couleur, épaisseur, pointillé. */
function traitEtat(etat: EtatRendu, e: EtatPreuve): { couleur: string; largeur: number; tirets: number[] } {
  const couleur = etat.palette.etats[e]
  if (e === 'verifie') return { couleur, largeur: 1.4, tirets: [] }
  if (e === 'echec') return { couleur, largeur: 2, tirets: [] }
  if (e === 'en_cours') return { couleur, largeur: 1.3, tirets: [5, 3] }
  if (e === 'admis') return { couleur, largeur: 1.2, tirets: [1.5, 2.5] }
  return { couleur, largeur: 1.1, tirets: [] }
}

/** Texte d'état en haut à droite : symbole (ou `sorry` / `admis`), fraction pour une étape. */
function texteEtat(vue: VueRaisonnement, p: number, b: Boite): string {
  const e = b.etat
  if (e.total > 1) return `${e.verifies}/${e.total} ${SYMBOLE_ETAT[e.etat]}`
  if (e.etat === 'admis') return motAdmis(vue.noeud(p))
  return SYMBOLE_ETAT[e.etat]
}

/** Coupe un texte monospace à une largeur. */
function tronquer(ctx: CanvasRenderingContext2D, t: string, largeur: number): string {
  if (ctx.measureText(t).width <= largeur) return t
  let x = t
  while (x.length > 2 && ctx.measureText(x + '…').width > largeur) x = x.slice(0, -1)
  return x + '…'
}

function dessinerEnonce(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, actives: Set<number>): void {
  const pal = vue.palette
  const mono = etat.palette.mono
  const n = vue.noeud(p)
  const w = b.w, h = b.h
  const x0 = -w / 2, y0 = -h / 2
  const taille = lire<number>(vue, 'taillePolice')
  const majeur = b.genre === 'majeur'
  const replie = (vue.lecture.unites[p]?.membres.length ?? 1) > 1
  const t = b.abandon ? { couleur: etat.palette.impasse, largeur: 1, tirets: [4, 3] } : traitEtat(etat, b.etat.etat)
  // Preuve repliée : un seul feuillet décalé, en filet.
  if (replie) {
    ctx.strokeStyle = rgba(pal.texteDoux, 0.45)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x0 + 3.5, y0 - 3.5)
    ctx.lineTo(x0 + w + 3.5, y0 - 3.5)
    ctx.lineTo(x0 + w + 3.5, y0 + h - 3.5)
    ctx.stroke()
  }
  // Corps : fond neutre, jamais d'aplat de couleur.
  ctx.fillStyle = b.abandon ? etat.palette.surface2 : pal.surface
  ctx.fillRect(x0, y0, w, h)
  // Cadre d'état ; résultat majeur : double cadre (comme le théorème principal d'un blueprint).
  ctx.strokeStyle = t.couleur
  ctx.lineWidth = t.largeur
  ctx.setLineDash(t.tirets)
  ctx.strokeRect(x0, y0, w, h)
  if (majeur) {
    ctx.lineWidth = 0.9
    ctx.strokeRect(x0 - 3, y0 - 3, w + 6, h + 6)
  }
  ctx.setLineDash([])
  const cl = cadreLignee(vue, p)
  if (cl) {
    const d = majeur ? 6 : 3.5
    ctx.strokeStyle = cl.couleur
    ctx.lineWidth = cl.largeur
    ctx.strokeRect(x0 - d, y0 - d, w + 2 * d, h + 2 * d)
  }
  // En-tête monospace : identifiant à gauche, validation et état à droite, filet dessous.
  const gauche = x0 + 7
  const yEntete = y0 + 13
  ctx.textBaseline = 'alphabetic'
  const droite = texteEtat(vue, p, b)
  const val = n.validation === 'aucune' ? '' : n.validation === 'ia_humain' ? 'IA+H' : n.validation === 'humain' ? 'H' : 'IA'
  ctx.font = `700 9.5px ${mono}`
  const wEtat = ctx.measureText(droite).width
  ctx.font = `500 8.5px ${mono}`
  const wVal = val ? ctx.measureText(val).width + 5 : 0
  ctx.textAlign = 'right'
  ctx.fillStyle = b.abandon ? etat.palette.impasse : etat.palette.etats[b.etat.etat]
  ctx.font = `700 9.5px ${mono}`
  ctx.fillText(droite, x0 + w - 6, yEntete)
  if (val) {
    ctx.font = `500 8.5px ${mono}`
    ctx.fillStyle = pal.texteDoux
    ctx.fillText(val, x0 + w - 6 - wEtat - 5, yEntete)
  }
  ctx.textAlign = 'left'
  ctx.font = `${majeur ? 700 : 600} 9.5px ${mono}`
  ctx.fillStyle = b.abandon ? pal.texteDoux : pal.texte
  const prefixe = replie ? '▸ ' : ''
  ctx.fillText(tronquer(ctx, prefixe + b.etiquette, w - 14 - wEtat - wVal - 4), gauche, yEntete)
  ctx.strokeStyle = rgba(pal.texteDoux, 0.25)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x0 + 1, y0 + 18.5)
  ctx.lineTo(x0 + w - 1, y0 + 18.5)
  ctx.stroke()
  // Énoncé (sans-empattement).
  ctx.font = `${majeur ? 600 : 450} ${taille}px ${pal.police}`
  ctx.fillStyle = b.abandon ? pal.texteDoux : pal.texte
  const yTexte = y0 + 23 + taille - 2
  b.lignes.forEach((l, k) => ctx.fillText(l, gauche, yTexte + k * (taille + 3)))
  // Variables portées : « [c₁ c₃] », les actives en couleur.
  let yPied = yTexte + (b.lignes.length - 1) * (taille + 3) + 4
  if (b.variables.length) {
    yPied += 11
    ctx.font = `500 9px ${mono}`
    let x = gauche
    const ecrire = (texte: string, couleur: string, gras = false) => {
      ctx.font = `${gras ? 700 : 500} 9px ${mono}`
      ctx.fillStyle = couleur
      ctx.fillText(texte, x, yPied)
      x += ctx.measureText(texte).width
    }
    ecrire('[', pal.texteDoux)
    b.variables.forEach((k, i) => {
      if (x > x0 + w - 22) return
      const actif = actives.has(k)
      ecrire(`${i ? ' ' : ''}c${indice(k)}`, actif ? etat.palette.variable : pal.texteDoux, actif)
    })
    ecrire(']', pal.texteDoux)
  }
  // Intervalle de confiance : filet neutre, intervalle, repère de l'estimation (couleur d'état).
  const c = n.confiance
  const xa = gauche, xb = x0 + w - 7, yb = y0 + h - 5
  ctx.fillStyle = rgba(pal.texteDoux, 0.16)
  ctx.fillRect(xa, yb - 0.5, xb - xa, 1)
  ctx.fillStyle = rgba(pal.texteDoux, 0.5)
  ctx.fillRect(xa + (xb - xa) * c.bas, yb - 1, Math.max(1.5, (xb - xa) * (c.haut - c.bas)), 2)
  ctx.fillStyle = b.abandon ? etat.palette.impasse : etat.palette.etats[b.etat.etat]
  ctx.fillRect(xa + (xb - xa) * c.estimation - 0.75, yb - 3, 1.5, 6)
  dessinerContexte(ctx, vue, etat, b)
  dessinerNumero(ctx, vue, etat, b, p, x0, y0 - (majeur ? 3 : 0))
}

/** Décision : point de branchement annoté (identifiant, choix retenu au-dessus, branche écartée dessous). */
function dessinerBranchement(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite): void {
  const pal = vue.palette
  const mono = etat.palette.mono
  const taille = lire<number>(vue, 'taillePolice')
  const cl = cadreLignee(vue, p)
  const n0 = b.lignes.length
  // Identifiant puis choix retenu, au-dessus du point.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `600 9.5px ${mono}`
  ctx.fillStyle = pal.texteDoux
  ctx.fillText(`${b.etiquette}`, 0, -19 - 6 - n0 * (taille + 3) - 1)
  ctx.font = `600 ${taille}px ${pal.police}`
  ctx.fillStyle = pal.texte
  b.lignes.forEach((l, k) => ctx.fillText(l, 0, -19 - 6 - (n0 - 1 - k) * (taille + 3)))
  // Branche écartée : pointillé vers le bas, alternative rejetée en monospace.
  if (b.impasse && lire<boolean>(vue, 'impasses')) {
    const texte = b.impasse.texte
    ctx.strokeStyle = etat.palette.impasse
    ctx.lineWidth = 1
    ctx.setLineDash([2, 2])
    ctx.beginPath()
    ctx.moveTo(0, 8)
    ctx.lineTo(0, 28)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.font = `500 ${Math.max(8.5, taille - 3)}px ${mono}`
    const suffixe = b.impasse.autres ? ` +${b.impasse.autres}` : ''
    let t = texte
    const max = b.w - 14
    while (t.length > 3 && ctx.measureText(`✗ ${t}…${suffixe}`).width > max) t = t.slice(0, -1)
    const affiche = `✗ ${t === texte ? t : t.trimEnd() + '…'}${suffixe}`
    const wt = ctx.measureText(affiche).width + 12
    ctx.fillStyle = etat.palette.surface2
    ctx.fillRect(-wt / 2, 28, wt, 16)
    ctx.strokeStyle = rgba(etat.palette.impasse, 0.9)
    ctx.setLineDash([2, 2])
    ctx.strokeRect(-wt / 2, 28, wt, 16)
    ctx.setLineDash([])
    ctx.fillStyle = etat.palette.impasse
    ctx.textBaseline = 'middle'
    ctx.fillText(affiche, 0, 36.5)
    ctx.textBaseline = 'alphabetic'
  }
  // Point de branchement : petit losange au trait, prolongé jusqu'aux ports (±19).
  ctx.strokeStyle = cl ? cl.couleur : pal.texte
  ctx.lineWidth = cl ? cl.largeur : 1.2
  ctx.beginPath()
  ctx.moveTo(-19, 0)
  ctx.lineTo(-8, 0)
  ctx.moveTo(8, 0)
  ctx.lineTo(19, 0)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(0, -8)
  ctx.lineTo(8, 0)
  ctx.lineTo(0, 8)
  ctx.lineTo(-8, 0)
  ctx.closePath()
  ctx.fillStyle = pal.surface
  ctx.fill()
  ctx.stroke()
  // Branche retenue : le libellé au-dessus ; marque ✓ discrète dans le losange.
  ctx.fillStyle = pal.texte
  ctx.font = `700 8px ${mono}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('✓', 0, 0.5)
  dessinerContexte(ctx, vue, etat, b)
}

/** Choix de modélisation : déclaration `variable cₖ` dans la section de gauche. */
function dessinerVariable(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite): void {
  const pal = vue.palette
  const mono = etat.palette.mono
  const kv = etat.palette.variable
  const epinglee = etat.epingles.has(p)
  const actif = epinglee || (etat.survol?.genre === 'drapeau' && etat.survol.point === p)
  const taille = lire<number>(vue, 'taillePolice') - 0.5
  const w = b.w, h = b.h
  const x0 = -w / 2, y0 = -h / 2
  const cl = cadreLignee(vue, p)
  ctx.fillStyle = pal.surface
  ctx.fillRect(x0, y0, w, h)
  ctx.strokeStyle = actif ? kv : rgba(pal.texteDoux, 0.55)
  ctx.lineWidth = actif ? 1.5 : 1
  ctx.strokeRect(x0, y0, w, h)
  if (cl) {
    ctx.strokeStyle = cl.couleur
    ctx.lineWidth = cl.largeur
    ctx.strokeRect(x0 - 3.5, y0 - 3.5, w + 7, h + 7)
  }
  // `variable c₁` · portée (énoncés visibles qui en dépendent).
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `600 9.5px ${mono}`
  ctx.fillStyle = kv
  ctx.fillText('variable', x0 + 7, y0 + 12)
  const wk = ctx.measureText('variable ').width
  ctx.fillStyle = pal.texte
  ctx.font = `700 9.5px ${mono}`
  ctx.fillText(`c${indice(b.variable)}`, x0 + 7 + wk, y0 + 12)
  const portee = etat.page?.portees.get(p)?.filter((q) => q < vue.nU).length ?? 0
  ctx.textAlign = 'right'
  ctx.font = `500 8.5px ${mono}`
  ctx.fillStyle = pal.texteDoux
  ctx.fillText(`${epinglee ? '• ' : ''}→ ${portee}`, x0 + w - 6, y0 + 12)
  ctx.textAlign = 'left'
  ctx.font = `500 ${taille}px ${pal.police}`
  ctx.fillStyle = pal.texte
  b.lignes.forEach((l, i) => ctx.fillText(l, x0 + 7, y0 + 16 + taille + i * (taille + 3) - 1))
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
