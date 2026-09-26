// Axes des vues de face (temps) et de droite (type × origine), repris de V4 et recentrés :
//   · calque dessous : grille de fond propre à la face regardée (mois / semaines et bandes de
//     domaines en vue de face ; couloirs de types teintés en vue de droite), étendues temporelles
//     des agrégats en barres d'erreur, répartition par type en vue de droite ;
//   · calque dessus : règles graduées posées sur les arêtes du cube (la plus basse pour un axe
//     horizontal, la plus à gauche pour un axe vertical), collées au bord de la zone utile quand on
//     zoome, et réticule de lecture au survol (rappels pointillés + pastilles de valeur).
// En vue de dessus (thématique) : aucune graduation, la carte parle d'elle-même.

import {
  clamp, rgba, smoothstep, statistiquesCategorie, pointSurAxe, poidsAxes, centreCouloir,
  LIBELLES_ORIGINE, LIBELLES_TYPE, ORIGINES, TYPES_NOEUD, Z_MAX,
  type ContexteDessin, type Marges, type StatsCategorie, type TypeNoeud, type Vec3, type VueGraphe,
} from '../../src/core'
import type { EtatFigure } from './figure'
import { lire } from './reglages'

const JOUR = 86_400_000
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
export const BORNES: Vec3 = [1.07, 1.07, Z_MAX + 0.07]

interface Bande {
  nom: string
  zHaut: number
  zBas: number
  niveau: 0 | 1 | 2
  domaine: number
}

interface Graduation {
  v: number
  /** 0 majeure, 1 moyenne, 2 mineure, 3 micro. */
  niveau: number
  trait: boolean
  libelle?: string
  domaine?: number
}

interface Point2 {
  x: number
  y: number
}

interface Regle {
  axe: 0 | 1 | 2
  fixe: Vec3
  visibilite: number
  horizontale: boolean
  alignee: boolean
  normale: Point2
  collee: boolean
}

/** Poids sémantiques : part « temps » de X, « couloirs » de Y (1 en cube strict). */
interface Semantique {
  cube: boolean
  temps: number
  couloirs: number
}

const ALPHA_NIVEAU = [0.5, 0.3, 0.17, 0.09]

export class Axes {
  readonly bandes: Bande[] = []
  readonly bandeFeuille: Int32Array
  private hauteurBande: number
  private regles: (Regle | null)[] = [null, null, null]
  private sem: Semantique = { cube: false, temps: 0, couloirs: 0 }
  marges: Marges = { haut: 60, bas: 110, gauche: 12, droite: 12 }
  private derniereMesure = 0
  private stats = new Map<number, StatsCategorie>()

  constructor(private vue: VueGraphe, private etat: EtatFigure) {
    const { h } = vue
    const sous = h.categories.filter((c) => c.niveau === 2)
    this.hauteurBande = (2 * Z_MAX) / sous.length
    const etendue = new Map<number, [number, number]>()
    sous.forEach((c, k) => {
      for (let x = c.index; x >= 0; x = h.categories[x]!.parent) {
        const e = etendue.get(x)
        etendue.set(x, e ? [Math.min(e[0], k), Math.max(e[1], k)] : [k, k])
      }
    })
    const indexBande = new Map<number, number>()
    for (const c of h.categories) {
      const e = etendue.get(c.index)
      if (!e) continue
      if (c.niveau === 2) indexBande.set(c.index, this.bandes.length)
      this.bandes.push({ nom: c.nom, niveau: c.niveau, domaine: c.domaine, zHaut: Z_MAX - e[0] * this.hauteurBande, zBas: Z_MAX - (e[1] + 1) * this.hauteurBande })
    }
    this.bandeFeuille = new Int32Array(h.nF)
    for (let f = 0; f < h.nF; f++) this.bandeFeuille[f] = indexBande.get(h.chaine[f * 3 + 2]!) ?? 0
    vue.on('filtres', () => this.stats.clear())
  }

  /** Mesure la zone utile (barre, bas, panneau en surimpression) au plus toutes les 300 ms. */
  majMarges(forcer = false): void {
    const t = performance.now()
    if (!forcer && t - this.derniereMesure < 300) return
    this.derniereMesure = t
    const z = this.vue.zoneSure()
    this.marges = { haut: Math.max(52, z.haut + 4), bas: Math.max(24, z.bas + 4), gauche: Math.max(12, z.gauche), droite: Math.max(12, z.droite) }
  }

  private statsDe(u: number): StatsCategorie {
    let s = this.stats.get(u)
    if (!s) this.stats.set(u, (s = statistiquesCategorie(this.vue.h, u - this.vue.h.nF, this.vue.filtres.actives)))
    return s
  }

  // ─── Échelles ────────────────────────────────────────────────────────────

  private dateVersX(t: number): number {
    const h = this.vue.h
    return -1 + (2 * (t - h.dateMin)) / (h.dateMax - h.dateMin)
  }

  private get uniteJour(): number {
    const h = this.vue.h
    return (2 * JOUR) / (h.dateMax - h.dateMin)
  }

  private graduationsTemps(pxJour: number): Graduation[] {
    const h = this.vue.h
    const r: Graduation[] = []
    const debut = new Date(h.dateMin)
    const fin = h.dateMax
    if (pxJour > 13) {
      const d = new Date(Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth(), debut.getUTCDate() + 1))
      for (; d.getTime() < fin; d.setUTCDate(d.getUTCDate() + 1)) {
        if (d.getUTCDate() === 1) continue
        const lundi = d.getUTCDay() === 1
        r.push({ v: this.dateVersX(d.getTime()), niveau: lundi ? 2 : 3, trait: true, libelle: pxJour > 24 || lundi ? String(d.getUTCDate()) : undefined })
      }
    } else if (pxJour * 7 > 10) {
      const d = new Date(Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth(), debut.getUTCDate()))
      while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1)
      for (; d.getTime() < fin; d.setUTCDate(d.getUTCDate() + 7)) {
        if (d.getUTCDate() === 1) continue
        r.push({ v: this.dateVersX(d.getTime()), niveau: 2, trait: true, libelle: pxJour * 7 > 34 ? String(d.getUTCDate()) : undefined })
      }
    }
    const m = new Date(Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth() + 1, 1))
    for (; m.getTime() < fin; m.setUTCMonth(m.getUTCMonth() + 1)) {
      const mois = m.getUTCMonth()
      r.push({ v: this.dateVersX(m.getTime()), niveau: mois === 0 ? 0 : 1, trait: true, libelle: `${MOIS[mois]}${mois === 0 || pxJour * 30 > 80 ? ` ${m.getUTCFullYear()}` : ''}` })
    }
    return r
  }

  private graduationsCouloirs(pxUnite: number): Graduation[] {
    const r: Graduation[] = []
    const nO = ORIGINES.length
    const total = TYPES_NOEUD.length * (nO + 1) - 1
    const slot = (s: number) => -1 + (2 * s) / total
    const pxSlot = (2 / total) * pxUnite
    TYPES_NOEUD.forEach((t, i) => {
      r.push({ v: slot(i * (nO + 1)), niveau: 1, trait: true })
      r.push({ v: slot(i * (nO + 1) + nO), niveau: 1, trait: true })
      if (pxSlot > 7) for (let o = 1; o < nO; o++) r.push({ v: slot(i * (nO + 1) + o), niveau: 3, trait: true })
      r.push({ v: centreCouloir(i, 1), niveau: 0, trait: false, libelle: LIBELLES_TYPE[t] })
      if (pxSlot > 28) ORIGINES.forEach((o, k) => r.push({ v: centreCouloir(i, k), niveau: 2, trait: false, libelle: o === 'humain' ? 'H' : o === 'ia' ? 'IA' : 'Ord.' }))
    })
    return r
  }

  private graduationsBandes(pxUnite: number): Graduation[] {
    const r: Graduation[] = []
    const px = this.hauteurBande * pxUnite
    for (const b of this.bandes) {
      const pxB = (b.zHaut - b.zBas) * pxUnite
      if (b.niveau === 0) r.push({ v: b.zHaut, niveau: 0, trait: true })
      else if (b.niveau === 1 && px > 3) r.push({ v: b.zHaut, niveau: 1, trait: true })
      else if (b.niveau === 2 && px > 8) r.push({ v: b.zHaut, niveau: 3, trait: true })
      const lisible = b.niveau === 0 ? pxB > 12 : b.niveau === 1 ? pxB > 15 : pxB > 13
      if (lisible) r.push({ v: (b.zHaut + b.zBas) / 2, niveau: b.niveau, trait: false, libelle: b.niveau === 0 ? b.nom.toUpperCase() : b.nom, domaine: b.niveau === 0 ? b.domaine : undefined })
    }
    r.push({ v: -Z_MAX, niveau: 0, trait: true })
    return r
  }

  private pxParUnite(axe: number): number {
    const a = this.vue.camera.avant[axe]!
    return this.vue.camera.pixelsParUnite() * Math.sqrt(Math.max(0, 1 - a * a))
  }

  private graduations(axe: number): Graduation[] {
    const px = this.pxParUnite(axe)
    if (axe === 0) return this.graduationsTemps(px * this.uniteJour)
    if (axe === 1) return this.graduationsCouloirs(px)
    return this.graduationsBandes(px)
  }

  /** Poids de lecture d'un axe : temps pour X, couloirs pour Y, bandes pour Z. */
  private poidsAxe(axe: number): number {
    const s = this.sem
    if (axe === 0) return s.temps
    if (axe === 1) return s.couloirs
    return s.cube ? 1 : Math.max(s.temps, s.couloirs)
  }

  // ─── Calque dessous ──────────────────────────────────────────────────────

  dessous(c: ContexteDessin): void {
    const vue = this.vue
    const cube = vue.reglages.valeurs.mode3D === 'cube'
    const net = (w: number) => smoothstep(0.5, 0.92, w)
    this.sem = { cube, temps: cube ? 1 : net(vue.poidsFaces[1]!), couloirs: cube ? 1 : net(vue.poidsFaces[2]!) }
    if (this.sem.temps < 0.01 && this.sem.couloirs < 0.01) return
    this.majMarges()
    if (lire<boolean>(vue, 'grille')) this.grille(c)
    if (lire<boolean>(vue, 'barresErreur')) this.barresErreur(c)
  }

  private grille(c: ContexteDessin): void {
    const { ctx } = c
    const vue = this.vue
    const cam = vue.camera
    const pal = vue.palette
    const av = cam.avant
    const B = BORNES
    const opac = lire<number>(vue, 'opaciteGrille')
    ctx.save()
    // Faces du fond portant une lecture : n = 1 (face, temps × thème), n = 0 (droite, type × thème).
    for (const n of [1, 0] as const) {
      const poids = n === 1 ? this.sem.temps : this.sem.couloirs
      const vis = smoothstep(0.2, 0.85, Math.abs(av[n]!)) * poids
      if (vis < 0.01) continue
      const s = av[n]! >= 0 ? B[n]! : -B[n]!
      const b = n === 1 ? 0 : 1
      const point = (vb: number, vz: number) => {
        const p: Vec3 = [0, 0, 0]
        p[n] = s
        p[b] = vb
        p[2] = vz
        return cam.projeterPoint(p)
      }
      // Cadre de la face et fond papier légèrement plus soutenu.
      const q = [point(-B[b]!, -B[2]), point(B[b]!, -B[2]), point(B[b]!, B[2]), point(-B[b]!, B[2])]
      if (!q.every((p) => p.visible)) continue
      ctx.beginPath()
      q.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.closePath()
      ctx.fillStyle = rgba(pal.texte, 0.018 * vis * opac)
      ctx.fill()
      ctx.strokeStyle = rgba(pal.texte, 0.22 * vis * opac)
      ctx.lineWidth = 1
      ctx.stroke()
      // Couloirs de types teintés (vue de droite) : une bande sur deux.
      if (n === 0 && lire<boolean>(vue, 'couloirsTeintes')) {
        const nO = ORIGINES.length
        const total = TYPES_NOEUD.length * (nO + 1) - 1
        const slot = (k: number) => -1 + (2 * k) / total
        TYPES_NOEUD.forEach((_, i) => {
          const y0 = slot(i * (nO + 1)), y1 = slot(i * (nO + 1) + nO)
          const r = [point(y0, -B[2]), point(y1, -B[2]), point(y1, B[2]), point(y0, B[2])]
          ctx.beginPath()
          r.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
          ctx.closePath()
          ctx.fillStyle = rgba(pal.texte, (i % 2 ? 0.045 : 0.022) * vis * opac)
          ctx.fill()
        })
      }
      // Traits de grille : axe horizontal de la face puis bandes Z, groupés par palier d'opacité.
      const chemins = new Map<number, Path2D>()
      for (const axe of [b, 2]) {
        for (const g of this.graduations(axe)) {
          if (!g.trait) continue
          if (axe === 1 && g.niveau === 3) continue
          const alpha = vis * opac * ALPHA_NIVEAU[g.niveau]!
          if (alpha < 0.01) continue
          const cle = Math.round(alpha * 40)
          let chemin = chemins.get(cle)
          if (!chemin) chemins.set(cle, (chemin = new Path2D()))
          const a0 = axe === 2 ? point(-B[b]!, g.v) : point(g.v, -B[2])
          const a1 = axe === 2 ? point(B[b]!, g.v) : point(g.v, B[2])
          if (!a0.visible || !a1.visible) continue
          chemin.moveTo(a0.x, a0.y)
          chemin.lineTo(a1.x, a1.y)
        }
      }
      ctx.lineWidth = 1
      for (const [cle, chemin] of chemins) {
        ctx.strokeStyle = rgba(pal.texte, cle / 40)
        ctx.stroke(chemin)
      }
    }
    ctx.restore()
  }

  /** Étendues temporelles (face) en barres d'erreur, répartition par type (droite). */
  private barresErreur(c: ContexteDessin): void {
    const { ctx } = c
    const vue = this.vue
    const { h, palette, camera: cam } = vue
    const w = poidsAxes(vue)
    const temps = w.temps > 0.04
    const couloirs = lire<boolean>(vue, 'repartitionTypes') && w.couloirs > 0.04
    if (!temps && !couloirs) return
    const nY = TYPES_NOEUD.length
    ctx.save()
    ctx.lineCap = 'butt'
    for (const cat of h.categories) {
      const u = cat.unite
      const op = vue.opaciteAffichee[u]!
      if (op < 0.04 || vue.granularite.alpha[u]! < 0.05) continue
      const coul = palette.domaines[cat.domaine % palette.domaines.length]!
      const encre = this.etat.teintes[cat.domaine % this.etat.teintes.length]!
      if (temps) {
        const a = op * Math.min(1, w.temps * 1.2)
        const q = vue.etendues.quantilesTemps(cat.index)
        const pt = (v: number) => cam.projeterPoint(pointSurAxe(vue, u, 'temps', v))
        const p0 = pt(q.min), p1 = pt(q.max), b0 = pt(q.q25), b1 = pt(q.q75)
        if (!p0.visible || !p1.visible) continue
        const dx = p1.x - p0.x, dy = p1.y - p0.y
        const l = Math.hypot(dx, dy) || 1
        const nx = -dy / l, ny = dx / l
        const cap = Math.max(3, Math.min(7, vue.tailleAffichee[u]! * 0.55))
        // Boîte interquartile : bande pâle cernée.
        const e = Math.max(2, Math.min(5, vue.tailleAffichee[u]! * 0.32))
        ctx.fillStyle = rgba(encre, 0.9 * a)
        ctx.strokeStyle = rgba(coul, 0.55 * a)
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(b0.x + nx * e, b0.y + ny * e)
        ctx.lineTo(b1.x + nx * e, b1.y + ny * e)
        ctx.lineTo(b1.x - nx * e, b1.y - ny * e)
        ctx.lineTo(b0.x - nx * e, b0.y - ny * e)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        // Moustaches min–max avec butées.
        ctx.strokeStyle = rgba(coul, 0.75 * a)
        ctx.lineWidth = 1.1
        ctx.beginPath()
        ctx.moveTo(p0.x, p0.y)
        ctx.lineTo(b0.x, b0.y)
        ctx.moveTo(b1.x, b1.y)
        ctx.lineTo(p1.x, p1.y)
        ctx.moveTo(p0.x + nx * cap, p0.y + ny * cap)
        ctx.lineTo(p0.x - nx * cap, p0.y - ny * cap)
        ctx.moveTo(p1.x + nx * cap, p1.y + ny * cap)
        ctx.lineTo(p1.x - nx * cap, p1.y - ny * cap)
        ctx.stroke()
      }
      if (couloirs) {
        const a = op * Math.min(1, w.couloirs * 1.2)
        let max = 1, premier = -1, dernier = -1
        for (let t = 0; t < nY; t++) {
          const n = vue.etendues.types[cat.index * nY + t]!
          if (!n) continue
          max = Math.max(max, n)
          if (premier < 0) premier = t
          dernier = t
        }
        if (premier < 0) continue
        const pt = (v: number) => cam.projeterPoint(pointSurAxe(vue, u, 'couloirs', v))
        const p0 = pt(centreCouloir(premier, 1)), p1 = pt(centreCouloir(dernier, 1))
        if (!p0.visible || !p1.visible) continue
        ctx.strokeStyle = rgba(coul, 0.4 * a)
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(p0.x, p0.y)
        ctx.lineTo(p1.x, p1.y)
        ctx.stroke()
        const rMax = Math.max(2.5, Math.min(7, vue.tailleAffichee[u]! * 0.6))
        ctx.fillStyle = rgba(coul, 0.6 * a)
        for (let t = premier; t <= dernier; t++) {
          const n = vue.etendues.types[cat.index * nY + t]!
          if (!n) continue
          const p = pt(centreCouloir(t, 1))
          const r = Math.max(1.2, rMax * Math.sqrt(n / max))
          ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2)
        }
      }
    }
    ctx.restore()
  }

  // ─── Calque dessus : règles ───────────────────────────────────────────────

  private pointAxe(axe: number, v: number, fixe: Vec3): Vec3 {
    const p: Vec3 = [fixe[0], fixe[1], fixe[2]]
    p[axe] = v
    return p
  }

  private choisirRegle(axe: 0 | 1 | 2): Regle | null {
    const cam = this.vue.camera
    const av = cam.avant
    const visibilite = smoothstep(0.06, 0.32, 1 - Math.abs(av[axe]!)) * this.poidsAxe(axe)
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
        const p0 = cam.projeterPoint(this.pointAxe(axe, -B[axe]!, fixe)), p1 = cam.projeterPoint(this.pointAxe(axe, B[axe]!, fixe))
        if (!p0.visible || !p1.visible) continue
        horizontale = Math.abs(p1.x - p0.x) >= Math.abs(p1.y - p0.y)
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

  /** Point d'une règle, collé au bord de la zone utile si nécessaire. */
  private surRegle(r: Regle, v: number): Point2 & { visible: boolean } {
    const vue = this.vue
    const p = vue.camera.projeterPoint(this.pointAxe(r.axe, v, r.fixe))
    if (!r.alignee || !lire<boolean>(vue, 'regleEcran')) return p
    const M = this.marges
    const W = vue.rendu.largeur, H = vue.rendu.hauteur
    if (r.horizontale) return { x: p.x, y: clamp(p.y, M.haut + 14, H - M.bas - 26), visible: p.visible }
    return { x: clamp(p.x, M.gauche + 150, W - M.droite - 20), y: p.y, visible: p.visible }
  }

  /**
   * Choisit les règles de l'image et réserve leurs bandes de libellés (avant le placement des
   * noms de nœuds, pour qu'aucun nom ne vienne se poser sur une graduation).
   */
  preparer(zones: number[]): void {
    const vue = this.vue
    if (this.sem.temps < 0.01 && this.sem.couloirs < 0.01) {
      this.regles = [null, null, null]
      return
    }
    this.regles = [0, 1, 2].map((a) => this.choisirRegle(a as 0 | 1 | 2))
    if (!lire<boolean>(vue, 'axes')) return
    for (const r of this.regles) {
      if (!r || r.visibilite < 0.3) continue
      const B = BORNES[r.axe]!
      const e0 = this.surRegle(r, -B), e1 = this.surRegle(r, B)
      if (!e0.visible || !e1.visible) continue
      const n = r.normale
      if (r.horizontale) {
        const y2 = e0.y + (n.y >= 0 ? 34 : -34)
        zones.push(Math.min(e0.x, e1.x), Math.min(e0.y, y2), Math.max(e0.x, e1.x), Math.max(e0.y, y2))
      } else {
        const x2 = e0.x + (n.x >= 0 ? 165 : -165)
        zones.push(Math.min(e0.x, x2), Math.min(e0.y, e1.y), Math.max(e0.x, x2), Math.max(e0.y, e1.y))
      }
    }
  }

  dessus(c: ContexteDessin): void {
    const { ctx } = c
    const vue = this.vue
    if (this.sem.temps < 0.01 && this.sem.couloirs < 0.01) return
    if (lire<boolean>(vue, 'axes')) this.dessinerRegles(ctx)
    if (lire<boolean>(vue, 'reticule')) this.dessinerReticule(c)
  }

  private dessinerRegles(ctx: CanvasRenderingContext2D): void {
    const vue = this.vue
    const pal = vue.palette
    const W = vue.rendu.largeur, H = vue.rendu.hauteur
    const M = this.marges
    const taille = lire<number>(vue, 'policeGraduations')
    const longTrait = lire<number>(vue, 'longueurGraduations')
    const mono = this.etat.policeMono
    const serif = this.etat.policeTitre
    const sans = this.etat.policeTexte
    ctx.save()
    for (const regle of this.regles) {
      if (!regle) continue
      const B = BORNES[regle.axe]!
      const vis = regle.visibilite
      const couleurAxe = pal.axes[regle.axe]
      const e0 = this.surRegle(regle, -B), e1 = this.surRegle(regle, B)
      if (!e0.visible || !e1.visible) continue
      const brut0 = vue.camera.projeterPoint(this.pointAxe(regle.axe, -B, regle.fixe))
      regle.collee = Math.abs(brut0.x - e0.x) + Math.abs(brut0.y - e0.y) > 0.5
      const n = regle.normale
      // Bandeau papier quand la règle est collée au bord.
      if (regle.collee) {
        ctx.fillStyle = rgba(pal.fond, 0.9 * vis)
        ctx.strokeStyle = rgba(pal.texte, 0.12 * vis)
        ctx.lineWidth = 1
        if (regle.horizontale) {
          const y = e0.y
          ctx.fillRect(M.gauche, n.y > 0 ? y : y - 30, W - M.gauche - M.droite, 30)
          ctx.beginPath()
          ctx.moveTo(M.gauche, y + 0.5)
          ctx.lineTo(W - M.droite, y + 0.5)
          ctx.stroke()
        } else {
          const x = e0.x
          ctx.fillRect(n.x < 0 ? x - 150 : x, M.haut, 150, H - M.haut - M.bas)
        }
      }
      // Épine de l'axe (couleur Blender, adoucie par la palette papier).
      ctx.strokeStyle = rgba(couleurAxe, 0.8 * vis)
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(e0.x, e0.y)
      ctx.lineTo(e1.x, e1.y)
      ctx.stroke()
      // Graduations par priorité (majeures d'abord), libellés sans chevauchement.
      const occupes: number[] = []
      const libre = (x0: number, y0: number, x1: number, y1: number) => {
        for (let i = 0; i < occupes.length; i += 4) if (x0 < occupes[i + 2]! && x1 > occupes[i]! && y0 < occupes[i + 3]! && y1 > occupes[i + 1]!) return false
        occupes.push(x0, y0, x1, y1)
        return true
      }
      const items = this.graduations(regle.axe).sort((a, b) => a.niveau - b.niveau)
      ctx.textAlign = n.x < -0.5 ? 'right' : n.x > 0.5 ? 'left' : 'center'
      ctx.textBaseline = n.y > 0.5 ? 'top' : n.y < -0.5 ? 'bottom' : 'middle'
      for (const g of items) {
        const p = this.surRegle(regle, g.v)
        if (!p.visible || p.x < M.gauche - 4 || p.x > W - M.droite || p.y < M.haut || p.y > H - M.bas + 2) continue
        const lt = g.trait ? longTrait * (g.niveau === 0 ? 1.4 : g.niveau === 1 ? 1 : g.niveau === 2 ? 0.7 : 0.45) : longTrait * 0.5
        ctx.strokeStyle = rgba(pal.texte, (g.trait ? 0.5 : 0.28) * vis)
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x + n.x * lt, p.y + n.y * lt)
        ctx.stroke()
        if (!g.libelle) continue
        const t = g.niveau === 0 ? taille : g.niveau === 1 ? taille - 0.5 : taille - 1.5
        ctx.letterSpacing = '0px'
        if (regle.axe === 0) ctx.font = `${g.niveau === 0 ? 600 : 400} ${t - 0.5}px ${mono}`
        else if (g.domaine !== undefined) {
          ctx.font = `600 ${t - 1.5}px ${sans}`
          ctx.letterSpacing = '0.07em'
        } else if (regle.axe === 2) ctx.font = g.niveau === 1 ? `600 ${t}px ${serif}` : `italic 400 ${t - 0.5}px ${serif}`
        else ctx.font = g.niveau === 0 ? `500 ${t}px ${sans}` : `400 ${t - 1}px ${mono}`
        const largeur = ctx.measureText(g.libelle).width
        let place = false, x = 0, y = 0
        for (let rang = 0; rang < (g.niveau === 0 && regle.horizontale ? 2 : 1) && !place; rang++) {
          const d = longTrait * 1.4 + 3 + rang * (t + 3)
          x = p.x + n.x * d
          y = p.y + n.y * d
          const x0 = ctx.textAlign === 'right' ? x - largeur : ctx.textAlign === 'left' ? x : x - largeur / 2
          const y0 = ctx.textBaseline === 'top' ? y : ctx.textBaseline === 'bottom' ? y - t : y - t / 2
          if (x0 < 4 || x0 + largeur > W - 4) break
          place = libre(x0 - 4, y0 - 1, x0 + largeur + 4, y0 + t + 1)
        }
        if (!place) continue
        ctx.fillStyle = rgba(g.domaine !== undefined ? pal.domaines[g.domaine % pal.domaines.length]! : g.niveau === 0 ? pal.texte : pal.texteDoux, vis)
        ctx.fillText(g.libelle, x, y)
      }
      ctx.letterSpacing = '0px'
      // Titre de l'axe au bout positif.
      const titre = regle.axe === 0 ? 'X · date de création' : regle.axe === 1 ? 'Y · type × origine' : 'Z · thème'
      ctx.font = `600 10.5px ${sans}`
      const dx = e1.x - e0.x, dy = e1.y - e0.y
      const l = Math.hypot(dx, dy) || 1
      let tx = e1.x + (dx / l) * 10, ty = e1.y + (dy / l) * 10
      const largeurT = ctx.measureText(titre).width
      tx = clamp(tx, M.gauche + 4, W - M.droite - largeurT - 8)
      ty = clamp(ty, M.haut + 10, H - M.bas - 4)
      ctx.textAlign = regle.horizontale ? 'left' : 'center'
      ctx.textBaseline = regle.horizontale ? 'middle' : 'bottom'
      if (!regle.horizontale) tx = clamp(tx, M.gauche + largeurT / 2 + 4, W - M.droite - largeurT / 2 - 4)
      ctx.lineWidth = 3
      ctx.lineJoin = 'round'
      ctx.strokeStyle = rgba(pal.fond, 0.9 * vis)
      ctx.strokeText(titre, tx, ty)
      ctx.fillStyle = rgba(couleurAxe, vis)
      ctx.fillText(titre, tx, ty)
    }
    ctx.restore()
  }

  // ─── Réticule de lecture ─────────────────────────────────────────────────

  private dessinerReticule(c: ContexteDessin): void {
    const { ctx, projection } = c
    const vue = this.vue
    const u = vue.survol
    if (u === null || vue.opaciteAffichee[u]! < 0.05) return
    const pal = vue.palette
    const mono = this.etat.policeMono
    const px = projection.x[u]!, py = projection.y[u]!
    const P: Vec3 = [c.positions[u * 3]!, c.positions[u * 3 + 1]!, c.positions[u * 3 + 2]!]
    const r = vue.tailleAffichee[u]! + 6
    const agr = vue.h.estAgregat(u)
    ctx.save()
    ctx.strokeStyle = rgba(pal.texte, 0.85)
    ctx.lineWidth = 1
    ctx.beginPath()
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      ctx.moveTo(px + dx * (r + 1), py + dy * (r + 1))
      ctx.lineTo(px + dx * (r + 7), py + dy * (r + 7))
    }
    ctx.stroke()
    for (const regle of this.regles) {
      if (!regle || regle.visibilite < 0.15) continue
      const axe = regle.axe
      const couleur = pal.axes[axe]
      const pied = this.surRegle(regle, P[axe]!)
      if (!pied.visible) continue
      const alpha = regle.visibilite
      ctx.setLineDash([2, 3])
      ctx.strokeStyle = rgba(couleur, 0.7 * alpha)
      ctx.lineWidth = 1
      const l = Math.hypot(pied.x - px, pied.y - py)
      if (l > r + 2) {
        ctx.beginPath()
        ctx.moveTo(px + ((pied.x - px) / l) * r, py + ((pied.y - py) / l) * r)
        ctx.lineTo(pied.x, pied.y)
        ctx.stroke()
      }
      ctx.setLineDash([])
      // Étendue d'un agrégat sur la règle : crochet [min ; max].
      if (agr) {
        const e = this.etendueSemantique(u, axe)
        if (e) {
          const q0 = this.surRegle(regle, e[0]), q1 = this.surRegle(regle, e[1])
          const n = regle.normale
          ctx.strokeStyle = rgba(couleur, 0.9 * alpha)
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(q0.x - n.x * 5, q0.y - n.y * 5)
          ctx.lineTo(q0.x, q0.y)
          ctx.lineTo(q1.x, q1.y)
          ctx.lineTo(q1.x - n.x * 5, q1.y - n.y * 5)
          ctx.stroke()
        }
      }
      const texte = this.lecture(axe, u)
      if (!texte) continue
      ctx.font = `500 10.5px ${mono}`
      const w = ctx.measureText(texte).width + 12, hh = 18
      const n = regle.normale
      const d = lire<number>(vue, 'longueurGraduations') * 1.4 + 3
      let bx = pied.x + n.x * d, by = pied.y + n.y * d
      bx = n.x < -0.5 ? bx - w : n.x > 0.5 ? bx : bx - w / 2
      by = n.y > 0.5 ? by : n.y < -0.5 ? by - hh : by - hh / 2
      bx = clamp(bx, 2, vue.rendu.largeur - w - 2)
      by = clamp(by, 2, vue.rendu.hauteur - hh - 2)
      ctx.fillStyle = rgba(couleur, 0.95 * alpha)
      ctx.beginPath()
      ctx.roundRect(bx, by, w, hh, 3)
      ctx.fill()
      ctx.fillStyle = rgba('#ffffff', alpha)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(texte, bx + 6, by + hh / 2 + 0.5)
    }
    ctx.restore()
  }

  private etendueSemantique(u: number, axe: number): [number, number] | null {
    const vue = this.vue
    const cat = vue.h.categorieDe(u)
    if (!cat) return null
    if (axe === 2) {
      const b = this.bandes.find((x) => x.nom === cat.nom && x.niveau === cat.niveau)
      return b ? [b.zBas, b.zHaut] : null
    }
    const e = vue.etendues.etendue(u, axe === 0 ? 'face' : 'droite')
    if (!e) return null
    const med = (axe === 0 ? vue.dispositions.face : vue.dispositions.droite)[u * 3 + axe]!
    const pos = vue.positions[u * 3 + axe]!
    const k = vue.granularite.presence[u]!
    // Crochet décalé comme le point : suit la position affichée de l'agrégat.
    const q = axe === 0 ? e.x : e.y
    return [pos + (q.min - med) * k, pos + (q.max - med) * k]
  }

  /** Valeur lue sur un axe pour l'unité survolée. */
  private lecture(axe: number, u: number): string {
    const vue = this.vue
    const h = vue.h
    const agr = h.estAgregat(u)
    if (axe === 0) {
      if (!agr) return dateIso(h.dates[u]!)
      const s = this.statsDe(u)
      if (!s.nbActives) return ''
      return `${dateIso(s.dateMin, false)} → ${dateIso(s.dateMax, false)} (${Math.round((s.dateMax - s.dateMin) / JOUR)} j)`
    }
    if (axe === 1) {
      if (!agr) {
        const n = h.noeuds[u]!
        return `${LIBELLES_TYPE[n.type]} · ${LIBELLES_ORIGINE[n.origine]}`
      }
      const s = this.statsDe(u)
      let meilleur: TypeNoeud = TYPES_NOEUD[0], m = -1
      for (const t of TYPES_NOEUD) if (s.types[t] > m) (m = s.types[t]), (meilleur = t)
      return s.nbActives ? `surtout ${LIBELLES_TYPE[meilleur]} (${Math.round((100 * m) / s.nbActives)} %)` : ''
    }
    if (!agr) return this.bandes[this.bandeFeuille[u]!]?.nom ?? ''
    const cat = h.categorieDe(u)!
    return cat.chemin.join(' › ')
  }
}

/** Date ISO compacte (AAAA-MM-JJ hh:mm) pour les lectures d'instrument. */
export function dateIso(t: number, heure = true): string {
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  const j = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  return heure ? `${j} ${p(d.getHours())}:${p(d.getMinutes())}` : j
}
