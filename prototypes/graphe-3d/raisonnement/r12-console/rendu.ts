// R12 · Rendu « console d'instrument » sur les calques canvas de la vue.
//
// Dessous : grille d'alignement, règle de profondeur (D0 … Dn) et zones, séparateurs de zones,
// arêtes orthogonales à angles vifs avec broches de sortie, liens sémantiques.
// Dessus : blocs à champs (en-tête : repère, statut, validation ; énoncé ; pied : confiance chiffrée,
// barre d'erreur, prémisses / dépendants / profondeur), losanges de décision, drapeaux de choix,
// cellules de contexte et renvois « ◁ LEM-03 » (étiquettes de réseau, comme sur un schéma).
// Sigma ne sert plus qu'aux liens complets (L) : ses points sont invisibles, le survol passe par `cibleSous`.

import { rgba, type ContexteDessinR, type ValeurReglage, type VueRaisonnement } from '../../src/raisonnement'
import { BLOC, type Boite, type MiseEnPage } from './mise-en-page'
import { etatSquelette } from './squelette'

export interface PaletteR12 {
  choix: string[]
  surface2: string
  impasse: string
  grille: string
  entete: string
  enteteMajeur: string
  texteEnteteMajeur: string
  filet: string
  mono: string
}

export function lirePaletteR12(el: HTMLElement): PaletteR12 {
  const s = getComputedStyle(el)
  const v = (n: string, d: string) => s.getPropertyValue(n).trim() || d
  return {
    choix: [0, 1, 2, 3, 4, 5].map((i) => v(`--r12-choix-${i}`, ['#8a5a78', '#4f6f96', '#5b7d5a', '#9a6b3f', '#6e6396', '#3f7f86'][i]!)),
    surface2: v('--surface-2', '#f2f4f7'),
    impasse: v('--r12-impasse', '#9aa1ae'),
    grille: v('--r12-grille', '#e9ecf1'),
    entete: v('--r12-entete', '#f1f3f6'),
    enteteMajeur: v('--r12-entete-majeur', '#2c3444'),
    texteEnteteMajeur: v('--r12-texte-entete-majeur', '#ffffff'),
    filet: v('--r12-filet', '#c9ced8'),
    mono: v('--r12-mono', "'JetBrains Mono', ui-monospace, Consolas, monospace"),
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
  palette: PaletteR12
  cibles: Cible[]
  /** Élément survolé (déterminé par cibleSous). */
  survol: Cible | null
  /** Choix épinglés (points) : leur portée reste marquée. */
  epingles: Set<number>
  /** Couleur de chaque choix (point → index de couleur). */
  couleurChoix: Map<number, number>
}

const lire = <T extends ValeurReglage>(vue: VueRaisonnement, cle: string) => vue.reglages.lire<T>(cle)

/** Écran : px par px de mise en page au point p. */
function echelle(vue: VueRaisonnement, page: MiseEnPage, p: number): number {
  return vue.camera.pixelsParUnite() * (vue.projection.echelle[p] || 1) * page.echelle
}

/** Libellés courts, sur trois lettres, en police à chasse fixe. */
export const CODE_STATUT = { valide: 'VAL', incertain: 'INC', refute: 'RÉF' } as const
export const CODE_VALIDATION = { aucune: '—', ia: 'IA', humain: 'H', ia_humain: 'IA+H' } as const

/** « 0.82 » : deux décimales, zéro initial conservé (lecture d'instrument). */
export const f2 = (x: number) => x.toFixed(2)
/** « .74 » : forme compacte pour les bornes d'intervalle. */
export const f2c = (x: number) => (x >= 1 ? '1.0' : x.toFixed(2).replace(/^0/, ''))

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

/** Ligne brisée (écran), coins vifs ou légèrement arrondis. */
function tracerArrondi(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], rayon: number): void {
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  for (let k = 1; k < pts.length - 1; k++) {
    const a = pts[k - 1]!, b = pts[k]!, c = pts[k + 1]!
    if (rayon <= 0.01) {
      ctx.lineTo(b.x, b.y)
      continue
    }
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

function fleche(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, t: number): void {
  const l = Math.hypot(dx, dy) || 1
  const ux = dx / l, uy = dy / l
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x - ux * t * 1.8 - uy * t * 0.7, y - uy * t * 1.8 + ux * t * 0.7)
  ctx.lineTo(x - ux * t * 1.8 + uy * t * 0.7, y - uy * t * 1.8 - ux * t * 0.7)
  ctx.closePath()
  ctx.fill()
}

// ─── Calque « dessous » : grille, règle, zones, arêtes ────────────────────────

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
  const alpha2D = Math.max(0, 1 - e * 1.6)
  const B = page.bornes
  const yRegle = B.y0 - 34

  // Grille d'alignement (plan 2D seulement) : pas fin = 4 × pas de grille, trait majeur tous les 4 pas fins.
  if (lire<boolean>(vue, 'grille') && alpha2D > 0.01) {
    const pas = page.grille * 4
    const ecran = pas * s0
    if (ecran >= 6) {
      const gx0 = Math.floor((B.x0 - 60) / pas) * pas, gx1 = Math.ceil((B.x1 + 60) / pas) * pas
      const gy0 = Math.floor((yRegle - 24) / pas) * pas, gy1 = Math.ceil((B.y1 + 40) / pas) * pas
      const a = cam.projeterPoint(monde(gx0, gy0)), b = cam.projeterPoint(monde(gx1, gy1))
      ctx.save()
      ctx.lineWidth = 1
      for (const majeur of [false, true]) {
        ctx.strokeStyle = rgba(etat.palette.grille, (majeur ? 1 : 0.55) * alpha2D * Math.min(1, (ecran - 6) / 6 + (majeur ? 1 : 0)))
        ctx.beginPath()
        for (let x = gx0; x <= gx1; x += pas) {
          if ((Math.round(x / pas) % 4 === 0) !== majeur) continue
          const px = Math.round(cam.projeterPoint(monde(x, 0)).x) + 0.5
          ctx.moveTo(px, a.y)
          ctx.lineTo(px, b.y)
        }
        for (let y = gy0; y <= gy1; y += pas) {
          if ((Math.round(y / pas) % 4 === 0) !== majeur) continue
          const py = Math.round(cam.projeterPoint(monde(0, y)).y) + 0.5
          ctx.moveTo(a.x, py)
          ctx.lineTo(b.x, py)
        }
        ctx.stroke()
      }
      ctx.restore()
    }
  }

  // Règle de profondeur et zones : « ENTRÉES · CHOIX | OUTILS | ÉTAPES | RÉSULTATS », puis D0 … Dn.
  if (lire<boolean>(vue, 'enTetes') && page.zones.length) {
    const op = Math.max(0.3, 1 - e)
    const mono = etat.palette.mono
    const taille = Math.max(8, Math.min(12, 9.5 * s0))
    ctx.save()
    ctx.textBaseline = 'middle'
    page.zones.forEach((z, k) => {
      const a = cam.projeterPoint(monde(z.x0, yRegle - 12)), b = cam.projeterPoint(monde(z.x1, B.y1 + 16))
      if (!a.visible || !b.visible) return
      // Séparateur de zone : trait fin pointillé sur toute la hauteur.
      if (k > 0 && alpha2D > 0.01) {
        ctx.strokeStyle = rgba(etat.palette.filet, 0.9 * alpha2D)
        ctx.lineWidth = 1
        ctx.setLineDash([2, 3])
        ctx.beginPath()
        ctx.moveTo(Math.round(a.x) + 0.5, a.y)
        ctx.lineTo(Math.round(a.x) + 0.5, b.y)
        ctx.stroke()
        ctx.setLineDash([])
      }
      // Nom de zone : capitales à chasse fixe, calé à gauche de la zone.
      const t = cam.projeterPoint(monde(z.x0 + 6, yRegle - 12))
      ctx.font = `600 ${taille}px ${mono}`
      ctx.textAlign = 'left'
      ctx.fillStyle = rgba(pal.texte, 0.78 * op)
      const nom = z.nom.toUpperCase()
      if (ctx.measureText(nom).width < Math.abs(b.x - a.x) - 8) ctx.fillText(nom, t.x, t.y)
      // Filet de règle sous le nom.
      const g = cam.projeterPoint(monde(z.x0 + 4, yRegle)), d = cam.projeterPoint(monde(z.x1 - 4, yRegle))
      ctx.strokeStyle = rgba(pal.texteDoux, 0.55 * op)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(g.x, Math.round(g.y) + 0.5)
      ctx.lineTo(d.x, Math.round(d.y) + 0.5)
      ctx.stroke()
    })
    // Graduations : une par rang (profondeur logique), libellé D0 … Dn.
    ctx.font = `500 ${Math.max(7.5, taille - 1)}px ${mono}`
    ctx.textAlign = 'center'
    ctx.fillStyle = rgba(pal.texteDoux, op)
    ctx.strokeStyle = rgba(pal.texteDoux, 0.55 * op)
    page.xRangs.forEach((x, r) => {
      const q = cam.projeterPoint(monde(x, yRegle))
      if (!q.visible) return
      ctx.beginPath()
      ctx.moveTo(Math.round(q.x) + 0.5, q.y)
      ctx.lineTo(Math.round(q.x) + 0.5, q.y + 4)
      ctx.stroke()
      ctx.fillText(`D${r}`, q.x, q.y + 4 + taille * 0.75)
    })
    ctx.restore()
  }

  // Sous-arguments dépliés : cadre pointillé autour des énoncés qu'ils contenaient.
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
    let alpha = Math.min(1, Math.max(0.12, Math.min(os, oc)) * 1.1) * 0.85
    let couleur = pal.arete
    let largeur = 1.1
    const incidente = survol !== null && (r.source === survol || r.cible === survol)
    if (incidente) {
      couleur = pal.accent
      alpha = 0.95
      largeur = 1.7
    }
    if (vue.ligneeActive) {
      const ls = vue.lignee[r.source]!, lc = vue.lignee[r.cible]!
      const dans = ls > 0 && lc > 0 && !(ls === 2 && lc === 1) && !(ls === 1 && lc === 2) && !(ls === 3 && lc === 1) && !(ls === 2 && lc === 3)
      if (dans) {
        couleur = ls === 1 || lc === 1 ? pal.ancetre : pal.descendant
        alpha = 0.95
        largeur = 1.8
      } else alpha *= 0.45
    }
    if (actifs && !(actifs.has(r.source) && actifs.has(r.cible))) alpha *= 0.35
    if (r.abandon) {
      couleur = etat.palette.impasse
      ctx.setLineDash([4, 3])
    } else ctx.setLineDash([])
    let pts: { x: number; y: number }[]
    const ss = echelle(vue, page, r.source), sc = echelle(vue, page, r.cible)
    const bs = page.boites[r.source]!, bc = page.boites[r.cible]!
    const demi = (b: Boite) => (b.genre === 'decision' ? 14 : b.w / 2)
    if (transition || e > 0.02) {
      const pr = vue.projection
      const xa = pr.x[r.source]! + demi(bs) * ss, ya = pr.y[r.source]!
      const xb = pr.x[r.cible]! - demi(bc) * sc, yb = pr.y[r.cible]!
      if (transition) {
        pts = [{ x: xa, y: ya }, { x: xb, y: yb }]
        ctx.strokeStyle = rgba(couleur, alpha)
        ctx.lineWidth = largeur
        ctx.beginPath()
        tracerLisse(ctx, pts)
        ctx.stroke()
        ctx.fillStyle = rgba(couleur, alpha)
        fleche(ctx, pts[1]!.x, pts[1]!.y, 1, 0, 2.4 + largeur)
        continue
      }
      // 3D : route projetée, profondeur interpolée le long du chemin.
      const y0 = pos[r.source * 3 + 1]!, y1 = pos[r.cible * 3 + 1]!
      const n = r.points.length
      pts = r.points.map(([x, y], k) => cam.projeterPoint(monde(x, y, y0 + (y1 - y0) * (n > 1 ? k / (n - 1) : 0))))
    } else pts = r.points.map(([x, y]) => cam.projeterPoint(monde(x, y)))
    // Alignement au pixel pour des traits nets (2D).
    if (e <= 0.02) for (const q of pts) {
      q.x = Math.round(q.x) + 0.5
      q.y = Math.round(q.y) + 0.5
    }
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
    fleche(ctx, z.x, z.y, lisse ? 1 : z.x - y.x, lisse ? 0 : z.y - y.y, 2.4 + largeur)
    // Broche de sortie : petit carré plein sur le bord droit du bloc source.
    const t = Math.max(2, Math.min(3.5, 3 * s0))
    ctx.fillRect(pts[0]!.x - t / 2, pts[0]!.y - t / 2, t, t)
  }
  ctx.restore()

  // Liens décision → choix dans la marge : trait coudé vers le drapeau.
  ctx.save()
  for (const l of page.liensMarge) {
    const pr = vue.projection
    const s = echelle(vue, page, l.source)
    const bc = page.boites[l.cible]!
    const xm = pr.x[l.cible]! - (bc.w / 2 - 6) * s
    const ya = pr.y[l.source]!, yb = pr.y[l.cible]! - (bc.h / 2 + 3) * s
    const xa = pr.x[l.source]! - 14 * s
    const op = Math.min(vue.opaciteAffichee[l.source]!, vue.opaciteAffichee[l.cible]!)
    ctx.strokeStyle = rgba(pal.arete, 0.8 * op)
    ctx.fillStyle = rgba(pal.arete, 0.8 * op)
    ctx.lineWidth = 1.1
    ctx.beginPath()
    tracerArrondi(ctx, [{ x: xa, y: ya }, { x: xm, y: ya }, { x: xm, y: yb }], 0)
    ctx.stroke()
    fleche(ctx, xm, yb, 0, 1, 3.4)
  }
  ctx.restore()

  if (lire<boolean>(vue, 'liensSemantiques')) dessinerLiensSemantiques(c, etat)
}

/** Sous-arguments dépliés : cadre pointillé autour de chaque énoncé issu du dépliage. */
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
    for (const p of pts) {
      const b = page.boites[p]!, s = echelle(vue, page, p)
      const op = vue.opaciteAffichee[p]!
      const x = vue.projection.x[p]!, y = vue.projection.y[p]!
      const l = b.genre === 'decision' ? Math.max(24, b.w / 2) : b.w / 2
      ctx.strokeStyle = rgba(pal.accent, 0.6 * op)
      ctx.setLineDash([3, 3])
      ctx.lineWidth = 1
      ctx.strokeRect(x - (l + 5) * s, y - (b.haut + 5) * s, (2 * l + 10) * s, (b.haut + b.bas + 8) * s)
      ctx.setLineDash([])
      if (j.noeuds[g.unites[p]!.conclusion]!.id === tete) {
        ctx.font = `600 ${Math.max(7.5, 8.5 * s)}px ${etat.palette.mono}`
        ctx.textAlign = 'right'
        ctx.textBaseline = 'bottom'
        ctx.fillStyle = rgba(pal.accent, 0.9 * op)
        ctx.fillText(`DÉPLIÉ ×${pts.length} · DOUBLE-CLIC : REPLIER`, x + (l + 5) * s, y - (b.haut + 7) * s)
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
  ctx.font = `600 8.5px ${etat.palette.mono}`
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
      const couleur = l.genre === 'contredit' ? pal.statut.refute : l.genre === 'resout' ? pal.statut.valide : etat.palette.impasse
      const pr = vue.projection
      const sa = echelle(vue, page, a), sb = echelle(vue, page, b)
      const x1 = pr.x[a]!, y1 = pr.y[a]! - page.boites[a]!.haut * sa
      const x2 = pr.x[b]!, y2 = pr.y[b]! - page.boites[b]!.haut * sb
      const my = Math.min(y1, y2) - Math.max(26, Math.abs(x2 - x1) * 0.18)
      ctx.strokeStyle = rgba(couleur, 0.8 * op)
      ctx.lineWidth = 1.1
      ctx.setLineDash(l.genre === 'resout' ? [] : [3, 3])
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.bezierCurveTo(x1, my, x2, my, x2, y2)
      ctx.stroke()
      ctx.setLineDash([])
      const tx = (x1 + x2) / 2, ty = my + (Math.min(y1, y2) - my) * 0.25
      const texte = l.genre === 'contredit' ? 'CONTREDIT' : l.genre === 'resout' ? 'RÉSOUT' : l.genre === 'abandonne' ? 'ABANDONNE' : 'REMPLACE'
      const w = ctx.measureText(texte).width + 8
      ctx.fillStyle = rgba(pal.surface, 0.95 * op)
      ctx.fillRect(tx - w / 2, ty - 6, w, 12)
      ctx.strokeStyle = rgba(couleur, 0.8 * op)
      ctx.strokeRect(Math.round(tx - w / 2) + 0.5, Math.round(ty - 6) + 0.5, Math.round(w), 12)
      ctx.fillStyle = rgba(couleur, op)
      ctx.fillText(texte, tx, ty + 0.5)
    }
  }
  ctx.restore()
}

// ─── Calque « dessus » : blocs, décisions, drapeaux, cellules de contexte ─────

export function dessinerDessus(c: ContexteDessinR, etat: EtatRendu): void {
  const { ctx, vue } = c
  const page = etat.page
  etat.cibles = []
  if (!page) return
  const pal = vue.palette
  const pr = vue.projection
  const mono = etat.palette.mono
  // Masqués (contexte pur) : visibles seulement avec les liens complets ; petits carrés + repère.
  ctx.save()
  for (let p = vue.nU; p < vue.nP; p++) {
    const pres = vue.presence[p]!
    if (pres < 0.05 || !pr.visible[p]) continue
    const s = echelle(vue, page, p)
    const x = pr.x[p]!, y = pr.y[p]!
    const t = 6 * Math.min(1.4, s)
    ctx.fillStyle = rgba(pal.surface, pres)
    ctx.strokeStyle = rgba(pal.texteDoux, 0.9 * pres)
    ctx.lineWidth = 1
    ctx.fillRect(x - t / 2, y - t / 2, t, t)
    ctx.strokeRect(Math.round(x - t / 2) + 0.5, Math.round(y - t / 2) + 0.5, Math.round(t), Math.round(t))
    if (s > 0.55) {
      ctx.font = `500 ${9 * Math.min(1.3, s)}px ${mono}`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = rgba(pal.texteDoux, pres)
      ctx.fillText(page.boites[p]!.ref, x - 7 * s, y)
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
    // Marques de portée : les choix actifs dont ce point dépend (repères au-dessus du bloc).
    const marques: { ref: string; couleur: string }[] = []
    for (const [q, k] of etat.couleurChoix) {
      if (q === p) continue
      if ((toujours || actifs.includes(q)) && page.portees.get(q)?.includes(p)) marques.push({ ref: page.boites[q]!.ref, couleur: etat.palette.choix[k % etat.palette.choix.length]! })
    }
    if (b.genre === 'drapeau') dessinerDrapeau(ctx, vue, etat, p, b)
    else if (b.genre === 'decision') dessinerDecision(ctx, vue, etat, p, b)
    else dessinerBloc(ctx, vue, etat, p, b, marques)
    ctx.restore()
    // Cibles (écran).
    const x = pr.x[p]!, y = pr.y[p]!
    if (b.genre === 'decision') {
      const l = Math.max(14, b.w / 2)
      etat.cibles.push({ genre: 'carte', point: p, noeud: -1, x0: x - l * s, y0: y - b.haut * s, x1: x + l * s, y1: y + 16 * s })
      if (b.impasse && lire<boolean>(vue, 'impasses')) etat.cibles.push({ genre: 'impasse', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y + 16 * s, x1: x + (b.w / 2) * s, y1: y + 38 * s })
    } else if (b.genre === 'drapeau') etat.cibles.push({ genre: 'drapeau', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y - (b.h / 2) * s, x1: x + (b.w / 2) * s, y1: y + (b.h / 2) * s })
    else etat.cibles.push({ genre: 'carte', point: p, noeud: -1, x0: x - (b.w / 2) * s, y0: y - (b.h / 2) * s, x1: x + (b.w / 2) * s, y1: y + (b.h / 2) * s })
    const y0 = yPastilles(b)
    for (const it of rangee(vue, b)) {
      const cx = x + it.x * s, cy = y + y0 * s
      if (it.renvoi >= 0) etat.cibles.push({ genre: 'renvoi', point: it.renvoi, noeud: -1, x0: cx, y0: cy - 6 * s, x1: cx + it.w * s, y1: cy + 6 * s })
      else etat.cibles.push({ genre: 'pastille', point: p, noeud: it.noeud, x0: cx - 6 * s, y0: cy - 6 * s, x1: cx + 6 * s, y1: cy + 6 * s })
    }
  }
}

/** Ordonnée (relative au point d'ancrage) de la rangée de renvois et de cellules de contexte. */
function yPastilles(b: Boite): number {
  if (b.genre === 'decision') return 14 + (b.impasse ? 24 : 4) + 7
  return b.h / 2 + 8
}

/** Bordure selon la lignée ou le survol ; null sinon. */
function bordureLignee(vue: VueRaisonnement, p: number): { couleur: string; largeur: number } | null {
  const pal = vue.palette
  if (vue.ligneeActive) {
    const l = vue.lignee[p]!
    if (l === 3) return { couleur: pal.accent, largeur: 2 }
    if (l === 1) return { couleur: pal.ancetre, largeur: 1.6 }
    if (l === 2) return { couleur: pal.descendant, largeur: 1.6 }
  }
  if (vue.survol === p) return { couleur: pal.accent, largeur: 1.6 }
  return null
}

/** Rangée sous le bloc : renvois « ◁ LEM-03 » (48 px) puis cellules de contexte (13 px). */
function rangee(vue: VueRaisonnement, b: Boite): { x: number; w: number; renvoi: number; noeud: number }[] {
  const r: { x: number; w: number; renvoi: number; noeud: number }[] = []
  let x = -b.w / 2
  for (const q of b.renvois) {
    r.push({ x, w: 45, renvoi: q, noeud: -1 })
    x += 48
  }
  x += 6
  if (lire<boolean>(vue, 'pastillesContexte')) for (const pa of b.pastilles) {
    r.push({ x, w: 11, renvoi: -1, noeud: pa.noeud })
    x += 13
  }
  return r
}

function dessinerPastilles(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, b: Boite): void {
  const items = rangee(vue, b)
  if (!items.length) return
  const pal = vue.palette
  const mono = etat.palette.mono
  const y = yPastilles(b)
  const sv = etat.survol
  const page = etat.page
  ctx.textBaseline = 'middle'
  // Renvois : étiquette de réseau (drapeau pointant vers la gauche) portant le repère cité.
  for (const it of items) {
    if (it.renvoi < 0) continue
    const ref = page?.boites[it.renvoi]?.ref ?? '?'
    const allume = sv?.genre === 'renvoi' && sv.point === it.renvoi
    const x0 = it.x, x1 = it.x + it.w
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x0 + 5, y - 5.5)
    ctx.lineTo(x1, y - 5.5)
    ctx.lineTo(x1, y + 5.5)
    ctx.lineTo(x0 + 5, y + 5.5)
    ctx.closePath()
    ctx.fillStyle = allume ? pal.accent : pal.surface
    ctx.fill()
    ctx.strokeStyle = pal.accent
    ctx.lineWidth = 0.9
    ctx.stroke()
    ctx.font = `600 7.5px ${mono}`
    ctx.textAlign = 'left'
    ctx.fillStyle = allume ? pal.surface : pal.accent
    ctx.fillText(ref, x0 + 7, y + 0.5)
  }
  // Cellules de contexte : carré à trait fin, lettre à chasse fixe (H, D, O, A, L, +).
  ctx.font = `600 7.5px ${mono}`
  ctx.textAlign = 'center'
  const cellules = items.filter((it) => it.renvoi < 0)
  cellules.forEach((it, k) => {
    const pa = b.pastilles[k]!
    const x = it.x + 5.5
    const allume = sv?.genre === 'pastille' && sv.noeud === pa.noeud
    ctx.fillStyle = allume ? pal.accent : etat.palette.entete
    ctx.fillRect(x - 5.5, y - 5.5, 11, 11)
    ctx.strokeStyle = allume ? pal.accent : etat.palette.filet
    ctx.lineWidth = 0.8
    if (pa.lettre === '+') ctx.setLineDash([1.5, 1.5])
    ctx.strokeRect(x - 5.5, y - 5.5, 11, 11)
    ctx.setLineDash([])
    ctx.fillStyle = allume ? pal.surface : pal.texteDoux
    ctx.fillText(pa.lettre, x, y + 0.5)
  })
  if (b.plus) {
    ctx.fillStyle = pal.texteDoux
    ctx.font = `500 7.5px ${mono}`
    ctx.textAlign = 'left'
    const dernier = items[items.length - 1]!
    ctx.fillText(`+${b.plus}`, dernier.x + dernier.w + 3, y + 0.5)
  }
}

/** Petit carré de statut + code (VAL / INC / RÉF), aligné à droite sur xDroite ; renvoie la largeur. */
function champStatut(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, xDroite: number, y: number, clair: boolean): number {
  const n = vue.noeud(p)
  const pal = vue.palette
  ctx.font = `600 8px ${etat.palette.mono}`
  ctx.textAlign = 'right'
  const code = CODE_STATUT[n.statut]
  const w = ctx.measureText(code).width
  ctx.fillStyle = clair ? etat.palette.texteEnteteMajeur : pal.statut[n.statut]
  ctx.fillText(code, xDroite, y)
  ctx.fillStyle = pal.statut[n.statut]
  ctx.fillRect(xDroite - w - 9, y - 3.5, 6, 6)
  if (clair) {
    ctx.strokeStyle = etat.palette.texteEnteteMajeur
    ctx.lineWidth = 0.6
    ctx.strokeRect(xDroite - w - 9, y - 3.5, 6, 6)
  }
  return w + 9
}

function dessinerBloc(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite, marques: { ref: string; couleur: string }[]): void {
  const pal = vue.palette
  const P = etat.palette
  const mono = P.mono
  const n = vue.noeud(p)
  const w = b.w, h = b.h
  const x0 = -w / 2, y0 = -h / 2
  const taille = lire<number>(vue, 'taillePolice')
  const majeur = b.genre === 'majeur'
  const unite = vue.lecture.unites[p]
  const membres = unite?.membres.length ?? 1
  // Étape repliée : un second cadre décalé derrière (pile de composants).
  if (membres > 1) {
    ctx.fillStyle = pal.surface
    ctx.fillRect(x0 + 3, y0 - 3, w, h)
    ctx.strokeStyle = b.abandon ? P.impasse : P.filet
    ctx.lineWidth = 1
    if (b.abandon) ctx.setLineDash([3, 2])
    ctx.strokeRect(x0 + 3, y0 - 3, w, h)
    ctx.setLineDash([])
  }
  // Corps.
  ctx.fillStyle = b.abandon ? P.surface2 : pal.surface
  ctx.fillRect(x0, y0, w, h)
  // En-tête : repère, [×membres], statut, validation — champs séparés par des filets.
  const clair = majeur && !b.abandon
  ctx.fillStyle = clair ? P.enteteMajeur : P.entete
  ctx.fillRect(x0, y0, w, BLOC.entete)
  const yT = y0 + BLOC.entete / 2 + 0.5
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.font = `700 8.5px ${mono}`
  ctx.fillStyle = clair ? P.texteEnteteMajeur : b.abandon ? P.impasse : pal.texte
  ctx.fillText(b.ref, x0 + 5, yT)
  let xg = x0 + 5 + ctx.measureText(b.ref).width + 5
  if (membres > 1) {
    ctx.font = `500 8px ${mono}`
    ctx.fillStyle = clair ? P.texteEnteteMajeur : pal.texteDoux
    ctx.fillText(`×${membres}`, xg, yT)
    xg += ctx.measureText(`×${membres}`).width + 5
  }
  if (b.abandon) {
    ctx.font = `500 8px ${mono}`
    ctx.fillStyle = P.impasse
    ctx.fillText('ABAND.', xg, yT)
  }
  // Validation (à droite), puis statut.
  const filetEntete = clair ? rgba(P.texteEnteteMajeur, 0.35) : P.filet
  ctx.font = `600 8px ${mono}`
  ctx.textAlign = 'right'
  const val = CODE_VALIDATION[n.validation]
  const wv = Math.max(ctx.measureText('IA+H').width, ctx.measureText(val).width)
  ctx.fillStyle = clair ? P.texteEnteteMajeur : n.validation === 'aucune' ? pal.texteDoux : pal.texte
  ctx.fillText(val, x0 + w - 5, yT)
  let xd = x0 + w - 5 - wv - 5
  ctx.fillStyle = filetEntete
  ctx.fillRect(xd, y0 + 3, 1, BLOC.entete - 6)
  xd -= 5
  const ws = champStatut(ctx, vue, etat, p, xd, yT, clair)
  xd -= ws + 5
  ctx.fillStyle = filetEntete
  ctx.fillRect(xd, y0 + 3, 1, BLOC.entete - 6)
  // Filet sous l'en-tête.
  ctx.fillStyle = clair ? P.enteteMajeur : P.filet
  ctx.fillRect(x0, y0 + BLOC.entete - 0.5, w, 1)
  // Énoncé (sans empattement).
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `${majeur ? 600 : 450} ${taille}px ${pal.police}`
  ctx.fillStyle = b.abandon ? pal.texteDoux : pal.texte
  b.lignes.forEach((l, k) => ctx.fillText(l, x0 + 6, y0 + BLOC.entete + BLOC.marge + taille - 1 + k * (taille + 3)))
  // Pied : confiance chiffrée, barre d'erreur, ←prémisses →dépendants, profondeur.
  const yP = y0 + h - BLOC.pied
  ctx.fillStyle = P.filet
  ctx.fillRect(x0, yP, w, 0.8)
  const yM = yP + BLOC.pied / 2 + 0.5
  const c = n.confiance
  ctx.textBaseline = 'middle'
  ctx.font = `600 8.5px ${mono}`
  ctx.fillStyle = pal.texte
  const est = f2(c.estimation)
  ctx.fillText(est, x0 + 5, yM)
  let xm = x0 + 5 + ctx.measureText(est).width + 3
  ctx.font = `400 8px ${mono}`
  ctx.fillStyle = pal.texteDoux
  const ic = `[${f2c(c.bas)},${f2c(c.haut)}]`
  ctx.fillText(ic, xm, yM)
  xm += ctx.measureText(ic).width + 5
  // Barre d'erreur sur l'axe [0, 1] : graduations 0 / 0,5 / 1, moustaches bas–haut, carré = estimation.
  const lb = 30
  ctx.fillStyle = rgba(pal.texteDoux, 0.45)
  ctx.fillRect(xm, yM, lb, 0.7)
  for (const t of [0, 0.5, 1]) ctx.fillRect(xm + t * lb - 0.35, yM - (t === 0.5 ? 1.5 : 2.5), 0.7, t === 0.5 ? 3 : 5)
  const couleurStatut = pal.statut[n.statut]
  ctx.fillStyle = couleurStatut
  const xb = xm + c.bas * lb, xh = xm + c.haut * lb
  ctx.fillRect(xb, yM - 0.6, Math.max(0.8, xh - xb), 1.4)
  ctx.fillRect(xb - 0.5, yM - 2.5, 1, 5.2)
  ctx.fillRect(xh - 0.5, yM - 2.5, 1, 5.2)
  ctx.fillRect(xm + c.estimation * lb - 1.7, yM - 1.6, 3.4, 3.4)
  // Compteurs de lecture et profondeur (à droite).
  const entrees = vue.lecture.entrantes[p]?.length ?? 0
  const sorties = vue.lecture.sortantes[p]?.length ?? 0
  ctx.font = `500 8px ${mono}`
  ctx.textAlign = 'right'
  ctx.fillStyle = pal.texteDoux
  ctx.fillText(`←${entrees} →${sorties} D${Math.max(0, b.rang)}`, x0 + w - 5, yM)
  // Cadre (par-dessus), puis bordure de lignée / survol.
  const bl = bordureLignee(vue, p)
  ctx.strokeStyle = bl ? bl.couleur : b.abandon ? P.impasse : majeur ? P.enteteMajeur : n.statut === 'refute' ? pal.statut.refute : P.filet
  ctx.lineWidth = bl ? bl.largeur : majeur ? 1.4 : 1
  if (b.abandon && !bl) ctx.setLineDash([3, 2])
  ctx.strokeRect(x0, y0, w, h)
  ctx.setLineDash([])
  // Marques de portée des choix actifs : repères en couleur au-dessus du bloc, alignés à droite.
  if (marques.length) {
    ctx.font = `600 7.5px ${mono}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    let x = x0 + w
    for (const m of marques) {
      const t = m.ref
      const wt = ctx.measureText(t).width + 6
      x -= wt
      ctx.fillStyle = pal.surface
      ctx.fillRect(x, y0 - 11, wt, 10)
      ctx.strokeStyle = m.couleur
      ctx.lineWidth = 0.9
      ctx.strokeRect(x, y0 - 11, wt, 10)
      ctx.fillStyle = m.couleur
      ctx.fillText(t, x + 3, y0 - 5.5)
      x -= 2
    }
  }
  dessinerPastilles(ctx, vue, etat, b)
}

function dessinerDecision(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite): void {
  const pal = vue.palette
  const P = etat.palette
  const taille = lire<number>(vue, 'taillePolice')
  const bl = bordureLignee(vue, p)
  const n = vue.noeud(p)
  const n0 = b.lignes.length
  const inter = taille + 3
  // Repère et statut, puis titre, au-dessus du losange.
  const yRef = -14 - 6 - n0 * inter - 1
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'center'
  ctx.font = `700 8.5px ${P.mono}`
  ctx.fillStyle = pal.texte
  const val = CODE_VALIDATION[n.validation]
  ctx.fillText(`${b.ref} · ${CODE_STATUT[n.statut]} · ${val}`, 0, yRef)
  ctx.font = `600 ${taille}px ${pal.police}`
  b.lignes.forEach((l, k) => ctx.fillText(l, 0, -14 - 6 - (n0 - 1 - k) * inter))
  // Alternative rejetée : lien pointillé vers un cadre grisé.
  if (b.impasse && lire<boolean>(vue, 'impasses')) {
    const texte = b.impasse.texte
    ctx.strokeStyle = P.impasse
    ctx.lineWidth = 1
    ctx.setLineDash([2, 2])
    ctx.beginPath()
    ctx.moveTo(0, 14)
    ctx.lineTo(0, 20)
    ctx.stroke()
    ctx.font = `500 ${Math.max(8.5, taille - 2)}px ${pal.police}`
    const prefixe = 'REJ '
    const suffixe = b.impasse.autres ? `  +${b.impasse.autres}` : ''
    let t = texte
    const max = b.w - 30
    while (t.length > 3 && ctx.measureText(`${t}…${suffixe}`).width > max) t = t.slice(0, -1)
    const affiche = `${t === texte ? t : t.trimEnd() + '…'}${suffixe}`
    ctx.font = `600 7.5px ${P.mono}`
    const wp = ctx.measureText(prefixe).width
    ctx.font = `500 ${Math.max(8.5, taille - 2)}px ${pal.police}`
    const wt = ctx.measureText(affiche).width + wp + 12
    ctx.fillStyle = P.surface2
    ctx.fillRect(-wt / 2, 20, wt, 16)
    ctx.strokeRect(-wt / 2, 20, wt, 16)
    ctx.setLineDash([])
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillStyle = P.impasse
    ctx.font = `600 7.5px ${P.mono}`
    ctx.fillText(prefixe, -wt / 2 + 6, 28.5)
    ctx.font = `500 ${Math.max(8.5, taille - 2)}px ${pal.police}`
    ctx.fillText(affiche, -wt / 2 + 6 + wp, 28.5)
    ctx.textBaseline = 'alphabetic'
  }
  // Losange : trait fin, fond d'en-tête ; carré de statut au centre.
  ctx.beginPath()
  ctx.moveTo(0, -14)
  ctx.lineTo(14, 0)
  ctx.lineTo(0, 14)
  ctx.lineTo(-14, 0)
  ctx.closePath()
  ctx.fillStyle = P.entete
  ctx.fill()
  ctx.strokeStyle = bl ? bl.couleur : pal.texte
  ctx.lineWidth = bl ? bl.largeur : 1.2
  ctx.stroke()
  ctx.fillStyle = pal.statut[n.statut]
  ctx.fillRect(-3, -3, 6, 6)
  dessinerPastilles(ctx, vue, etat, b)
}

function dessinerDrapeau(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, etat: EtatRendu, p: number, b: Boite): void {
  const pal = vue.palette
  const P = etat.palette
  const k = etat.couleurChoix.get(p) ?? 0
  const couleur = P.choix[k % P.choix.length]!
  const epingle = etat.epingles.has(p)
  const actif = epingle || (etat.survol?.genre === 'drapeau' && etat.survol.point === p)
  const taille = lire<number>(vue, 'taillePolice') - 0.5
  const w = b.w, h = b.h
  const x0 = -w / 2, y0 = -h / 2
  const bl = bordureLignee(vue, p)
  // Hampe.
  ctx.fillStyle = couleur
  ctx.fillRect(x0 + 1, y0 - 3, 1.5, h + 8)
  // Pennon à queue d'aronde, angles vifs.
  ctx.beginPath()
  ctx.moveTo(x0 + 3, y0)
  ctx.lineTo(x0 + w, y0)
  ctx.lineTo(x0 + w - 8, y0 + h / 2)
  ctx.lineTo(x0 + w, y0 + h)
  ctx.lineTo(x0 + 3, y0 + h)
  ctx.closePath()
  ctx.fillStyle = pal.surface
  ctx.fill()
  ctx.fillStyle = rgba(couleur, actif ? 0.16 : 0.07)
  ctx.fill()
  ctx.strokeStyle = bl ? bl.couleur : couleur
  ctx.lineWidth = bl ? bl.largeur : actif ? 1.4 : 1
  ctx.stroke()
  // En-tête : repère, portée (blocs visibles qui en dépendent), état d'épingle.
  const portee = etat.page?.portees.get(p)?.filter((q) => q < vue.nU).length ?? 0
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = `700 8.5px ${P.mono}`
  ctx.fillStyle = couleur
  ctx.fillText(b.ref, x0 + 8, y0 + BLOC.entete / 2 + 0.5)
  const wr = ctx.measureText(b.ref).width
  ctx.font = `500 8px ${P.mono}`
  ctx.fillStyle = pal.texteDoux
  ctx.fillText(`portée ${portee}${epingle ? ' · ÉPINGLÉ' : ''}`, x0 + 8 + wr + 6, y0 + BLOC.entete / 2 + 0.5)
  ctx.fillStyle = rgba(couleur, 0.5)
  ctx.fillRect(x0 + 3, y0 + BLOC.entete - 0.5, w - 15, 0.8)
  ctx.textBaseline = 'alphabetic'
  ctx.font = `550 ${taille}px ${pal.police}`
  ctx.fillStyle = pal.texte
  b.lignes.forEach((l, i) => ctx.fillText(l, x0 + 8, y0 + BLOC.entete + BLOC.marge + taille - 1 + i * (taille + 3)))
}

// ─── Survol ──────────────────────────────────────────────────────────────────

/** Élément sous le pointeur (écran), d'après la dernière image. */
export function cibleSous(etat: EtatRendu, x: number, y: number): Cible | null {
  // Cellules, renvois et impasses d'abord (petits, au-dessus des blocs voisins), puis l'ordre inverse du dessin.
  for (let k = etat.cibles.length - 1; k >= 0; k--) {
    const c = etat.cibles[k]!
    if ((c.genre === 'pastille' || c.genre === 'impasse' || c.genre === 'renvoi') && x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) return c
  }
  for (let k = etat.cibles.length - 1; k >= 0; k--) {
    const c = etat.cibles[k]!
    if (x >= c.x0 - 2 && x <= c.x1 + 2 && y >= c.y0 - 2 && y <= c.y1 + 2) return c
  }
  return null
}
