// Grilles, faces du cube, axes gradués et réticule.
//
// Calque « dessous » : faces du fond (façon graphique 3D scientifique : les trois faces les plus
// éloignées de l'œil), grilles sémantiques sur chacune, axes d'origine façon Blender, secteurs
// thématiques au sol (vue de dessus).
// Calque « dessus » : règles graduées posées sur les arêtes du cube (la plus basse pour un axe
// horizontal à l'écran, la plus à gauche pour un axe vertical), collées au bord du viewport quand
// on zoome (règle d'écran), et réticule de lecture au survol.

import {
  clamp, rgba, smoothstep, statistiquesCategorie, LIBELLES_ORIGINE, LIBELLES_TYPE, TYPES_NOEUD,
  Z_MAX, type ContexteDessin, type TypeNoeud, type Vec3, type VueGraphe,
} from '../../src/core'
import { dateIso, JOUR, type Echelles, type Graduation } from './echelles'

export const BORNES: Vec3 = [1.07, 1.07, Z_MAX + 0.07]

export interface Marges {
  haut: number
  bas: number
  gauche: number
  droite: number
}

export interface Semantique {
  cube: boolean
  /** Part « temps » de la coordonnée X, « couloirs » de Y, « carte » (vue de dessus). */
  temps: number
  couloirs: number
  carte: number
}

export function semantique(vue: VueGraphe): Semantique {
  const cube = vue.reglages.valeurs.mode3D === 'cube'
  const p = vue.poidsFaces
  return { cube, temps: cube ? 1 : p[1]!, couloirs: cube ? 1 : p[2]!, carte: cube ? 0 : p[0]! }
}

interface Point2 {
  x: number
  y: number
}

/** Arête du cube retenue pour porter la règle d'un axe (partagée avec le réticule). */
interface Regle {
  axe: 0 | 1 | 2
  /** Coordonnées fixes des deux autres axes. */
  fixe: Vec3
  visibilite: number
  horizontale: boolean
  /** Arête quasi alignée sur l'écran : on peut la coller au bord du viewport. */
  alignee: boolean
  normale: Point2
  collee: boolean
}

export interface EtatInstrument {
  regles: (Regle | null)[]
  marges: Marges
  sem: Semantique
}

export const etat: EtatInstrument = {
  regles: [null, null, null],
  marges: { haut: 40, bas: 90, gauche: 40, droite: 10 },
  sem: { cube: false, temps: 0, couloirs: 0, carte: 1 },
}

// ─── Aides ───────────────────────────────────────────────────────────────────

function pointAxe(axe: number, v: number, fixe: Vec3): Vec3 {
  const p: Vec3 = [fixe[0], fixe[1], fixe[2]]
  p[axe] = v
  return p
}

/** Pixels par unité monde le long d'un axe (raccourci par l'inclinaison). */
function pxParUnite(vue: VueGraphe, axe: number): number {
  const a = vue.camera.avant[axe]!
  return vue.camera.pixelsParUnite() * Math.sqrt(Math.max(0, 1 - a * a))
}

function graduationsAxe(vue: VueGraphe, ech: Echelles, axe: number, sem: Semantique): { liste: Graduation[]; poids: number }[] {
  const densite = vue.reglages.lire<number>('densiteGrille')
  const px = pxParUnite(vue, axe)
  const r: { liste: Graduation[]; poids: number }[] = []
  if (axe === 0) {
    if (sem.temps > 0.02) r.push({ liste: ech.graduationsTemps(px * ech.uniteJour, densite), poids: sem.temps })
    if (sem.temps < 0.98) r.push({ liste: ech.graduationsCarte(px, densite), poids: 1 - sem.temps })
  } else if (axe === 1) {
    if (sem.couloirs > 0.02) r.push({ liste: ech.graduationsCouloirs(px, densite), poids: sem.couloirs })
    if (sem.couloirs < 0.98) r.push({ liste: ech.graduationsCarte(px, densite), poids: 1 - sem.couloirs })
  } else r.push({ liste: ech.graduationsBandes(px, densite), poids: 1 })
  return r
}

const ALPHA_NIVEAU = [0.55, 0.34, 0.2, 0.11]

// ─── Calque dessous : faces, grilles, secteurs ──────────────────────────────

export function dessinerGrilles(c: ContexteDessin, ech: Echelles): void {
  const { ctx, vue } = c
  const R = vue.reglages
  const sem = (etat.sem = semantique(vue))
  if (!R.lire<boolean>('grille')) return
  const cam = vue.camera
  const pal = vue.palette
  const av = cam.avant
  const B = BORNES
  const opac = R.lire<number>('opaciteGrille')
  const encre = pal.texte
  ctx.save()
  ctx.lineCap = 'butt'
  for (let n = 0 as 0 | 1 | 2; n < 3; n = (n + 1) as 0 | 1 | 2) {
    const vis = smoothstep(0.1, 0.8, Math.abs(av[n]!))
    if (vis < 0.01) continue
    const s = av[n]! >= 0 ? B[n]! : -B[n]!
    const [b, cAxe] = n === 0 ? [1, 2] : n === 1 ? [0, 2] : [0, 1]
    const coin = (vb: number, vc: number) => {
      const p: Vec3 = [0, 0, 0]
      p[n] = s
      p[b] = vb
      p[cAxe] = vc
      return cam.projeterPoint(p)
    }
    // Fond de la face (teinte très légère) et cadre.
    const q = [coin(-B[b]!, -B[cAxe]!), coin(B[b]!, -B[cAxe]!), coin(B[b]!, B[cAxe]!), coin(-B[b]!, B[cAxe]!)]
    if (q.every((p) => p.visible)) {
      ctx.beginPath()
      q.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.closePath()
      if (R.lire<boolean>('facesTeintees')) {
        ctx.fillStyle = rgba(lireVar(vue, '--face-cube', pal.texte), vis * 0.5 * opac)
        ctx.fill()
      }
      ctx.strokeStyle = rgba(encre, 0.28 * vis * opac)
      ctx.lineWidth = 1
      ctx.stroke()
    }
    // Grilles : traits de chaque axe du plan, groupés par palier d'opacité.
    const chemins = new Map<number, Path2D>()
    for (const [axe, autre] of [[b, cAxe], [cAxe, b]] as [number, number][]) {
      for (const { liste, poids } of graduationsAxe(vue, ech, axe, sem)) {
        for (const g of liste) {
          if (!g.trait) continue
          const alpha = vis * poids * opac * ALPHA_NIVEAU[g.niveau]!
          if (alpha < 0.01) continue
          const cle = Math.round(alpha * 40)
          let chemin = chemins.get(cle)
          if (!chemin) chemins.set(cle, (chemin = new Path2D()))
          const p0: Vec3 = [0, 0, 0], p1: Vec3 = [0, 0, 0]
          p0[n] = p1[n] = s
          p0[axe] = p1[axe] = g.v
          p0[autre] = -B[autre]!
          p1[autre] = B[autre]!
          const a0 = cam.projeterPoint(p0), a1 = cam.projeterPoint(p1)
          if (!a0.visible || !a1.visible) continue
          chemin.moveTo(a0.x, a0.y)
          chemin.lineTo(a1.x, a1.y)
        }
      }
    }
    ctx.lineWidth = 1
    for (const [cle, chemin] of chemins) {
      ctx.strokeStyle = rgba(encre, cle / 40)
      ctx.stroke(chemin)
    }
    // Axes d'origine façon Blender (sol seulement) : X rouge, Y vert.
    if (n === 2 && R.lire<boolean>('axesOrigine')) {
      for (const axe of [0, 1] as const) {
        const p0: Vec3 = [0, 0, s], p1: Vec3 = [0, 0, s]
        p0[axe] = -B[axe]!
        p1[axe] = B[axe]!
        const a0 = cam.projeterPoint(p0), a1 = cam.projeterPoint(p1)
        if (!a0.visible || !a1.visible) continue
        ctx.strokeStyle = rgba(pal.axes[axe], 0.55 * vis)
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(a0.x, a0.y)
        ctx.lineTo(a1.x, a1.y)
        ctx.stroke()
      }
    }
    // Secteurs thématiques au sol (vue de dessus, faces sémantiques).
    if (n === 2 && sem.carte > 0.03 && R.lire<boolean>('secteurs')) dessinerSecteurs(c, ech, s, vis * sem.carte)
  }
  ctx.restore()
}

function dessinerSecteurs(c: ContexteDessin, ech: Echelles, z: number, poids: number): void {
  const { ctx, vue } = c
  const cam = vue.camera
  const pal = vue.palette
  const k = cam.pixelsParUnite()
  ctx.save()
  ctx.font = `600 11px ${pal.police}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  for (const s of ech.secteurs) {
    const rayonPx = s.r * k
    if (s.niveau === 1 && rayonPx < 34) continue
    const couleur = pal.domaines[s.domaine % pal.domaines.length]!
    ctx.beginPath()
    let ok = true
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2
      const p = cam.projeterPoint([s.cx + Math.cos(a) * s.r, s.cy + Math.sin(a) * s.r, z])
      if (!p.visible) {
        ok = false
        break
      }
      if (i) ctx.lineTo(p.x, p.y)
      else ctx.moveTo(p.x, p.y)
    }
    if (!ok) continue
    ctx.setLineDash(s.niveau === 0 ? [] : [3, 4])
    ctx.lineWidth = s.niveau === 0 ? 1.3 : 1
    ctx.strokeStyle = rgba(couleur, (s.niveau === 0 ? 0.6 : 0.4) * poids)
    ctx.stroke()
    if (s.niveau === 0) {
      ctx.fillStyle = rgba(couleur, 0.035 * poids)
      ctx.fill()
    }
    // Libellé au sommet du cercle.
    const p = cam.projeterPoint([s.cx, s.cy + s.r, z])
    if (!p.visible) continue
    ctx.setLineDash([])
    ctx.font = s.niveau === 0 ? `600 11.5px ${pal.police}` : `500 10px ${pal.police}`
    ctx.lineWidth = 3.5
    ctx.lineJoin = 'round'
    ctx.strokeStyle = rgba(pal.fond, 0.9 * poids)
    ctx.fillStyle = rgba(s.niveau === 0 ? couleur : pal.texteDoux, poids)
    const texte = s.niveau === 0 ? s.nom.toUpperCase() : s.nom
    ctx.strokeText(texte, p.x, p.y - 3)
    ctx.fillText(texte, p.x, p.y - 3)
  }
  ctx.restore()
}

// ─── Calque dessus : règles graduées ────────────────────────────────────────

/** Choisit l'arête du cube qui porte la règle de l'axe (la plus basse ou la plus à gauche). */
function choisirRegle(vue: VueGraphe, axe: 0 | 1 | 2): Regle | null {
  const cam = vue.camera
  const av = cam.avant
  const visibilite = smoothstep(0.06, 0.32, 1 - Math.abs(av[axe]!))
  if (visibilite < 0.01) return null
  const B = BORNES
  const [b, c] = axe === 0 ? [1, 2] : axe === 1 ? [0, 2] : [0, 1]
  let meilleure: { score: number; fixe: Vec3; p0: Point2; p1: Point2 } | null = null
  let horizontale = true
  const centre = cam.projeterPoint([0, 0, 0])
  for (const sb of [-1, 1]) {
    for (const sc of [-1, 1]) {
      const fixe: Vec3 = [0, 0, 0]
      fixe[b] = sb * B[b]!
      fixe[c] = sc * B[c]!
      const p0 = cam.projeterPoint(pointAxe(axe, -B[axe]!, fixe)), p1 = cam.projeterPoint(pointAxe(axe, B[axe]!, fixe))
      if (!p0.visible || !p1.visible) continue
      horizontale = Math.abs(p1.x - p0.x) >= Math.abs(p1.y - p0.y)
      // Plus bas (horizontale) ou plus à gauche (verticale) ; à égalité, la plus proche de l'œil.
      const m = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }
      const profondeur = fixe[0] * av[0] + fixe[1] * av[1] + fixe[2] * av[2]
      const score = (horizontale ? m.y : -m.x) - profondeur * 0.5
      if (!meilleure || score > meilleure.score + 0.01) meilleure = { score, fixe, p0, p1 }
    }
  }
  if (!meilleure) return null
  const { p0, p1, fixe } = meilleure
  const dx = p1.x - p0.x, dy = p1.y - p0.y
  const l = Math.hypot(dx, dy) || 1
  let normale = { x: -dy / l, y: dx / l }
  const m = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }
  if ((m.x - centre.x) * normale.x + (m.y - centre.y) * normale.y < 0) normale = { x: -normale.x, y: -normale.y }
  const angle = Math.abs(Math.atan2(dy, dx)) % Math.PI
  const alignee = horizontale ? Math.min(angle, Math.PI - angle) < 0.2 : Math.abs(angle - Math.PI / 2) < 0.2
  return { axe, fixe, visibilite, horizontale, alignee, normale, collee: false }
}

/** Projette un point de la règle, collé au bord du viewport si nécessaire. */
function surRegle(vue: VueGraphe, r: Regle, v: number): Point2 & { visible: boolean } {
  const p = vue.camera.projeterPoint(pointAxe(r.axe, v, r.fixe))
  if (!r.alignee || !vue.reglages.lire<boolean>('regleEcran')) return p
  const M = etat.marges
  const W = vue.rendu.largeur, H = vue.rendu.hauteur
  if (r.horizontale) return { x: p.x, y: clamp(p.y, M.haut + 14, H - M.bas), visible: p.visible }
  return { x: clamp(p.x, M.gauche, W - M.droite - 20), y: p.y, visible: p.visible }
}

export function dessinerRegles(c: ContexteDessin, ech: Echelles): void {
  const { ctx, vue } = c
  const R = vue.reglages
  etat.regles = [0, 1, 2].map((a) => choisirRegle(vue, a as 0 | 1 | 2))
  if (!R.lire<boolean>('graduations')) return
  const pal = vue.palette
  const sem = etat.sem
  const W = vue.rendu.largeur, H = vue.rendu.hauteur
  const taille = R.lire<number>('policeGraduations')
  const longTrait = R.lire<number>('longueurGraduations')
  const mono = lireVar(vue, '--police-mono', 'ui-monospace, monospace')
  ctx.save()
  for (const regle of etat.regles) {
    if (!regle) continue
    const B = BORNES[regle.axe]!
    const vis = regle.visibilite
    const couleurAxe = pal.axes[regle.axe]
    const e0 = surRegle(vue, regle, -B), e1 = surRegle(vue, regle, B)
    if (!e0.visible || !e1.visible) continue
    const brut0 = vue.camera.projeterPoint(pointAxe(regle.axe, -B, regle.fixe))
    regle.collee = Math.abs(brut0.x - e0.x) + Math.abs(brut0.y - e0.y) > 0.5
    // Règle verticale collée au bord gauche : les libellés passent à l'intérieur du viewport.
    // Idem quand la place manque à gauche (panneau ouvert) : l'épine reste, les libellés basculent.
    if (!regle.horizontale && regle.normale.x < 0 && (regle.collee || Math.min(e0.x, e1.x) < etat.marges.gauche + 140)) {
      regle.normale = { x: -regle.normale.x, y: -regle.normale.y }
      regle.collee = true
    }
    const n = regle.normale
    // Bandeau de règle quand l'arête est collée au bord de l'écran.
    if (regle.collee) {
      ctx.fillStyle = rgba(pal.fond, 0.88 * vis)
      ctx.strokeStyle = rgba(pal.texte, 0.14 * vis)
      ctx.lineWidth = 1
      if (regle.horizontale) {
        const y = e0.y
        ctx.fillRect(etat.marges.gauche - 6, n.y > 0 ? y : y - 28, W, 28)
        ctx.beginPath()
        ctx.moveTo(etat.marges.gauche - 6, y + 0.5)
        ctx.lineTo(W, y + 0.5)
        ctx.stroke()
      } else {
        const x = e0.x
        ctx.fillRect(n.x < 0 ? x - 150 : x, etat.marges.haut, 150, H - etat.marges.haut - etat.marges.bas)
      }
    }
    // Épine de l'axe.
    ctx.strokeStyle = rgba(couleurAxe, 0.85 * vis)
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(e0.x, e0.y)
    ctx.lineTo(e1.x, e1.y)
    ctx.stroke()
    // Graduations et libellés, par priorité (majeures d'abord), sans chevauchement.
    const occupes: [number, number, number, number][] = []
    const libre = (x0: number, y0: number, x1: number, y1: number) => {
      for (const o of occupes) if (x0 < o[2] && x1 > o[0] && y0 < o[3] && y1 > o[1]) return false
      occupes.push([x0, y0, x1, y1])
      return true
    }
    const ensembles = graduationsAxe(vue, ech, regle.axe, sem)
    const items: { g: Graduation; poids: number }[] = []
    for (const { liste, poids } of ensembles) for (const g of liste) items.push({ g, poids })
    items.sort((a, b) => a.g.niveau - b.g.niveau || b.poids - a.poids)
    ctx.textAlign = n.x < -0.5 ? 'right' : n.x > 0.5 ? 'left' : 'center'
    ctx.textBaseline = n.y > 0.5 ? 'top' : n.y < -0.5 ? 'bottom' : 'middle'
    for (const { g, poids } of items) {
      const alpha = vis * poids
      if (alpha < 0.03) continue
      const p = surRegle(vue, regle, g.v)
      if (!p.visible || p.x < etat.marges.gauche - 4 || p.x > W - etat.marges.droite || p.y < etat.marges.haut || p.y > H - etat.marges.bas + (regle.horizontale ? 2 : -6)) continue
      const lt = g.trait ? longTrait * (g.niveau === 0 ? 1.4 : g.niveau === 1 ? 1 : g.niveau === 2 ? 0.7 : 0.45) : longTrait * 0.5
      ctx.strokeStyle = rgba(pal.texte, (g.trait ? 0.55 : 0.3) * alpha)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x + n.x * lt, p.y + n.y * lt)
      ctx.stroke()
      if (!g.libelle) continue
      const t = g.niveau === 0 ? taille : g.niveau === 1 ? taille - 0.5 : taille - 1.5
      ctx.letterSpacing = '0px'
      ctx.font = regle.axe === 0 && sem.temps > 0.5
        ? `${g.niveau === 0 ? 600 : 400} ${t}px ${mono}`
        : g.domaine !== undefined
          ? `700 ${t - 1.5}px ${pal.police}`
          : `${g.niveau === 0 ? 600 : g.niveau === 1 ? 500 : 400} ${t}px ${pal.police}`
      if (g.domaine !== undefined) ctx.letterSpacing = '0.06em'
      const largeur = ctx.measureText(g.libelle).width
      // Deux rangées possibles pour les libellés majeurs (couloirs serrés, mois).
      let place = false, x = 0, y = 0
      for (let rang = 0; rang < (g.niveau === 0 && regle.horizontale ? 2 : 1) && !place; rang++) {
        const d = longTrait * 1.4 + 3 + rang * (t + 3)
        x = p.x + n.x * d
        y = p.y + n.y * d
        const x0 = ctx.textAlign === 'right' ? x - largeur : ctx.textAlign === 'left' ? x : x - largeur / 2
        const y0 = ctx.textBaseline === 'top' ? y : ctx.textBaseline === 'bottom' ? y - t : y - t / 2
        if (x0 < etat.marges.gauche - 30 || x0 + largeur > W - 4) break
        place = libre(x0 - 4, y0 - 1, x0 + largeur + 4, y0 + t + 1)
      }
      if (!place) continue
      ctx.fillStyle = rgba(g.domaine !== undefined ? pal.domaines[g.domaine % pal.domaines.length]! : g.niveau === 0 ? pal.texte : pal.texteDoux, alpha)
      ctx.fillText(g.libelle, x, y)
      ctx.letterSpacing = '0px'
    }
    ctx.letterSpacing = '0px'
    // Titre de l'axe au bout positif.
    const titre = titreAxe(regle.axe, sem)
    ctx.font = `600 10.5px ${mono}`
    const dx = e1.x - e0.x, dy = e1.y - e0.y
    const l = Math.hypot(dx, dy) || 1
    let tx = e1.x + (dx / l) * 10, ty = e1.y + (dy / l) * 10
    tx = clamp(tx, etat.marges.gauche + 4, W - etat.marges.droite - 90)
    ty = clamp(ty, etat.marges.haut + 10, H - etat.marges.bas - 4)
    ctx.textAlign = regle.horizontale ? 'left' : 'center'
    ctx.textBaseline = regle.horizontale ? 'middle' : 'bottom'
    const largeurT = ctx.measureText(titre).width
    if (libre(tx - 4, ty - 8, tx + largeurT + 4, ty + 8)) {
      ctx.lineWidth = 3
      ctx.lineJoin = 'round'
      ctx.strokeStyle = rgba(pal.fond, 0.9 * vis)
      ctx.strokeText(titre, tx, ty)
      ctx.fillStyle = rgba(couleurAxe, vis)
      ctx.fillText(titre, tx, ty)
    }
  }
  ctx.restore()
}

function titreAxe(axe: number, sem: Semantique): string {
  if (axe === 0) return sem.temps >= 0.5 ? 'X · date' : 'X · carte'
  if (axe === 1) return sem.couloirs >= 0.5 ? 'Y · type × origine' : 'Y · carte'
  return 'Z · thème'
}

// ─── Réticule ────────────────────────────────────────────────────────────────

const cacheEtendues = new Map<number, { x: [number, number]; y: [number, number]; z: [number, number] }>()

/** Étendue sémantique d'un agrégat (temps en X, couloirs en Y, bandes en Z). */
function etendue(vue: VueGraphe, u: number) {
  let e = cacheEtendues.get(u)
  if (e) return e
  const c = vue.h.categorieDe(u)!
  const d = vue.dispositions
  const x: [number, number] = [Infinity, -Infinity], y: [number, number] = [Infinity, -Infinity], z: [number, number] = [Infinity, -Infinity]
  for (const f of c.feuilles) {
    const tx = d.face[f * 3]!, ly = d.droite[f * 3 + 1]!, bz = d.face[f * 3 + 2]!
    x[0] = Math.min(x[0], tx); x[1] = Math.max(x[1], tx)
    y[0] = Math.min(y[0], ly); y[1] = Math.max(y[1], ly)
    z[0] = Math.min(z[0], bz); z[1] = Math.max(z[1], bz)
  }
  e = { x, y, z }
  cacheEtendues.set(u, e)
  return e
}
export function viderCacheReticule(): void {
  cacheEtendues.clear()
}

export function dessinerReticule(c: ContexteDessin, ech: Echelles): void {
  const { ctx, vue, projection } = c
  const R = vue.reglages
  const u = vue.survol
  if (u === null || !R.lire<boolean>('reticule')) return
  if (vue.opaciteAffichee[u]! < 0.05) return
  const pal = vue.palette
  const mono = lireVar(vue, '--police-mono', 'ui-monospace, monospace')
  const sem = etat.sem
  const px = projection.x[u]!, py = projection.y[u]!
  const P: Vec3 = [c.positions[u * 3]!, c.positions[u * 3 + 1]!, c.positions[u * 3 + 2]!]
  const r = vue.tailleAffichee[u]! + R.lire<number>('tailleReticule')
  const agr = vue.h.estAgregat(u)
  const f = agr ? -1 : u
  ctx.save()
  // Mire : cercle + quatre traits.
  ctx.strokeStyle = rgba(pal.accent, 0.95)
  ctx.lineWidth = 1.3
  ctx.beginPath()
  ctx.arc(px, py, r, 0, Math.PI * 2)
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    ctx.moveTo(px + dx! * (r + 2), py + dy! * (r + 2))
    ctx.lineTo(px + dx! * (r + 8), py + dy! * (r + 8))
  }
  ctx.stroke()

  for (const regle of etat.regles) {
    if (!regle || regle.visibilite < 0.15) continue
    const axe = regle.axe
    const couleur = pal.axes[axe]
    const pied = surRegle(vue, regle, P[axe]!)
    if (!pied.visible) continue
    const alpha = regle.visibilite
    // Ligne de rappel pointillée du point vers la règle.
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = rgba(couleur, 0.75 * alpha)
    ctx.lineWidth = 1
    ctx.beginPath()
    const l = Math.hypot(pied.x - px, pied.y - py)
    if (l > r + 2) {
      ctx.moveTo(px + ((pied.x - px) / l) * r, py + ((pied.y - py) / l) * r)
      ctx.lineTo(pied.x, pied.y)
      ctx.stroke()
    }
    ctx.setLineDash([])
    // Étendue d'un agrégat (crochet sur la règle).
    const poidsSem = axe === 0 ? sem.temps : axe === 1 ? sem.couloirs : 1
    if (agr && R.lire<boolean>('crochetsAgregat') && poidsSem > 0.5) {
      const e = etendue(vue, u)
      const [a0, a1] = axe === 0 ? e.x : axe === 1 ? e.y : e.z
      const q0 = surRegle(vue, regle, a0), q1 = surRegle(vue, regle, a1)
      const n = regle.normale
      ctx.strokeStyle = rgba(couleur, 0.9 * alpha)
      ctx.fillStyle = rgba(couleur, 0.16 * alpha)
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(q0.x - n.x * 5, q0.y - n.y * 5)
      ctx.lineTo(q0.x, q0.y)
      ctx.lineTo(q1.x, q1.y)
      ctx.lineTo(q1.x - n.x * 5, q1.y - n.y * 5)
      ctx.stroke()
    }
    // Pastille de valeur.
    if (!R.lire<boolean>('pastillesReticule')) continue
    const texte = lecture(vue, ech, axe, u, f, P, sem)
    if (!texte) continue
    ctx.font = `500 10.5px ${mono}`
    const w = ctx.measureText(texte).width + 10, h = 17
    const n = regle.normale
    const d = R.lire<number>('longueurGraduations') * 1.4 + 3
    let bx = pied.x + n.x * d, by = pied.y + n.y * d
    bx = n.x < -0.5 ? bx - w : n.x > 0.5 ? bx : bx - w / 2
    by = n.y > 0.5 ? by : n.y < -0.5 ? by - h : by - h / 2
    bx = clamp(bx, 2, vue.rendu.largeur - w - 2)
    by = clamp(by, 2, vue.rendu.hauteur - h - 2)
    ctx.fillStyle = rgba(couleur, 0.96 * alpha)
    ctx.beginPath()
    ctx.roundRect(bx, by, w, h, 3)
    ctx.fill()
    ctx.fillStyle = rgba('#ffffff', alpha)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(texte, bx + 5, by + h / 2 + 0.5)
  }
  ctx.restore()
}

/** Valeur lue sur un axe pour l'unité survolée. */
function lecture(vue: VueGraphe, ech: Echelles, axe: number, u: number, f: number, P: Vec3, sem: Semantique): string {
  const h = vue.h
  if (axe === 0) {
    if (sem.temps < 0.5) return `x = ${P[0].toFixed(3)}`
    if (f >= 0) return dateIso(h.dates[f]!)
    const s = statistiquesCategorie(h, u - h.nF, vue.filtres.actives)
    if (!s.nbActives) return ''
    return `${dateIso(s.dateMin, false)} → ${dateIso(s.dateMax, false)} (${Math.round((s.dateMax - s.dateMin) / JOUR)} j)`
  }
  if (axe === 1) {
    if (sem.couloirs < 0.5) return `y = ${P[1].toFixed(3)}`
    if (f >= 0) {
      const n = h.noeuds[f]!
      return `${LIBELLES_TYPE[n.type]} · ${LIBELLES_ORIGINE[n.origine]}`
    }
    const s = statistiquesCategorie(h, u - h.nF, vue.filtres.actives)
    let meilleur: TypeNoeud = TYPES_NOEUD[0], m = -1
    for (const t of TYPES_NOEUD) if (s.types[t] > m) (m = s.types[t]), (meilleur = t)
    return s.nbActives ? `surtout ${LIBELLES_TYPE[meilleur]} (${Math.round((100 * m) / s.nbActives)} %)` : ''
  }
  if (f >= 0) return ech.bandes[ech.bandeFeuille[f]!]?.nom ?? ''
  const b = ech.bandeDe(P[2])
  return b ? `z ≈ ${b.nom}` : `z = ${P[2].toFixed(3)}`
}


// ─── Variables CSS (mise en cache par thème) ────────────────────────────────

let cacheVars = new Map<string, string>()
let themeCache = ''
export function lireVar(vue: VueGraphe, nom: string, defaut: string): string {
  const theme = vue.racine.dataset.theme ?? ''
  if (theme !== themeCache) {
    cacheVars = new Map()
    themeCache = theme
  }
  let v = cacheVars.get(nom)
  if (v === undefined) {
    v = getComputedStyle(vue.racine).getPropertyValue(nom).trim() || defaut
    cacheVars.set(nom, v)
  }
  return v
}
