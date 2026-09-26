// Rendu du plan de métro sur les calques canvas de la vue (sous et au-dessus des nœuds sigma).
//
// Sigma ne dessine que des disques de la couleur du fond des stations (cibles du survol) ; les
// lignes, les symboles, les zones et les libellés sont dessinés ici, en coordonnées écran à partir
// de la caméra (2D comme 3D : les tracés interpolent la profondeur de couche entre leurs stations).

import { clamp, rgba, type ContexteDessinR, type NoeudR, type ValeurReglage, type VueRaisonnement } from '../../src/raisonnement'
import type { PlanM, Pt, StationM, TronconM } from './plan'

// ─── État partagé ────────────────────────────────────────────────────────────

export interface CouleursMetro {
  lignes: string[]
  zoneFond: string[]
  zoneTrait: string[]
  zoneTexte: string[]
  stationFond: string
  stationTrait: string
}

export function lireCouleurs(el: HTMLElement): CouleursMetro {
  const s = getComputedStyle(el)
  const v = (n: string, d: string) => s.getPropertyValue(n).trim() || d
  return {
    lignes: [1, 2, 3, 4, 5, 6].map((i) => v(`--ligne-${i}`, ['#1f6fcf', '#c2255c', '#0a8f86', '#b07d12', '#6d4fc2', '#2f9e44'][i - 1]!)),
    zoneFond: [0, 1, 2].map((i) => v(`--zone-fond-${i}`, '#eee')),
    zoneTrait: [0, 1, 2].map((i) => v(`--zone-trait-${i}`, '#bbb')),
    zoneTexte: [0, 1, 2].map((i) => v(`--zone-texte-${i}`, '#777')),
    stationFond: v('--station-fond', '#ffffff'),
    stationTrait: v('--station-trait', '#1b2130'),
  }
}

export interface TraceEcran {
  troncon: number
  ligne: number
  pts: Float32Array
}

export interface EtatMetro {
  plan: PlanM | null
  /** Tronçons dépliés (indices). */
  deplies: Set<number>
  survolTroncon: number | null
  survolLigne: number | null
  /** Zone tarifaire survolée dans la légende. */
  survolZone: number | null
  /** Ligne mise en avant depuis la légende (clic). */
  ligneEpinglee: number | null
  lignesMasquees: Set<number>
  couleurs: CouleursMetro
  /** Tracés écran du dernier rendu (tests de survol et de clic). */
  ecran: TraceEcran[]
  /** Fractions de longueur des sommets de chaque tracé de ligne (profondeur 3D interpolée). */
  fractions: Map<string, number[]>
}

export function couleurLigne(etat: EtatMetro, l: number): string {
  return etat.couleurs.lignes[l % etat.couleurs.lignes.length]!
}

/** Ligne mise en avant : survol (tracé ou légende) sinon épinglée. */
export function ligneFocus(etat: EtatMetro): number | null {
  return etat.survolLigne ?? etat.ligneEpinglee
}

const R = <T extends ValeurReglage>(vue: VueRaisonnement, cle: string) => vue.reglages.lire<T>(cle)

// ─── Mesures ─────────────────────────────────────────────────────────────────

interface Mesures {
  ppu: number
  lw: number
  r: number
}

function mesures(vue: VueRaisonnement): Mesures {
  const ppu = vue.camera.pixelsParUnite()
  return {
    ppu,
    lw: clamp(R<number>(vue, 'epaisseurLigne') * ppu, 2, 11),
    r: clamp(R<number>(vue, 'tailleStation') * ppu, 4, 13),
  }
}

/** Fractions cumulées de longueur des sommets d'un tracé. */
export function fractionsDe(pts: Pt[]): number[] {
  const f = [0]
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1])
    f.push(total)
  }
  return f.map((x) => (total ? x / total : 0))
}

/** Projette les tracés de tous les tronçons (une polyligne écran par ligne). */
function projeterTraces(vue: VueRaisonnement, etat: EtatMetro): void {
  const plan = etat.plan!
  const d = vue.disposition
  const e = vue.extrusion
  etat.ecran = []
  for (const t of plan.troncons) {
    const yA = d.yCouche[t.de]!, yB = d.yCouche[t.vers]!
    t.traces.forEach((tr, k) => {
      const fr = etat.fractions.get(`${t.index}:${k}`)!
      const pts = new Float32Array(tr.length * 2)
      tr.forEach((p, i) => {
        const q = vue.camera.projeterPoint([p[0], (yA + (yB - yA) * fr[i]!) * e, -p[1]])
        pts[i * 2] = q.x
        pts[i * 2 + 1] = q.y
      })
      etat.ecran.push({ troncon: t.index, ligne: t.lignes[k]!, pts })
    })
  }
}

// ─── Opacités (focus, lignée, survol) ────────────────────────────────────────

function dansLignee(vue: VueRaisonnement, a: number, b: number): boolean {
  const la = vue.lignee[a]!, lb = vue.lignee[b]!
  if (!la || !lb) return false
  // Ancêtre → ancêtre / sélection, sélection / descendant → descendant.
  return !((la === 2 && lb === 1) || (la === 1 && lb === 2) || (la === 3 && lb === 1) || (la === 2 && lb === 3))
}

export function opaciteTrace(vue: VueRaisonnement, etat: EtatMetro, t: TronconM, l: number): number {
  const estompe = R<number>(vue, 'estompe')
  if (etat.lignesMasquees.has(l)) return 0
  let o = 1
  const focus = ligneFocus(etat)
  if (focus !== null) o *= l === focus ? 1 : estompe
  if (etat.survolZone !== null && !vue.ligneeActive) o *= etat.plan!.zones[etat.survolZone]?.troncons.includes(t.index) ? 1 : estompe
  if (vue.ligneeActive) o *= dansLignee(vue, t.de, t.vers) ? 1 : estompe
  else if (vue.survol !== null && focus === null) o *= t.de === vue.survol || t.vers === vue.survol ? 1 : 0.45
  if (etat.survolTroncon !== null && focus === null && etat.survolTroncon !== t.index) o *= 0.8
  return o
}

export function opaciteStation(vue: VueRaisonnement, etat: EtatMetro, s: StationM): number {
  const estompe = R<number>(vue, 'estompe')
  if (s.horsPlan) return 0
  let o = vue.presence[s.u] ?? 1
  if (s.lignes.length && s.lignes.every((l) => etat.lignesMasquees.has(l))) return 0
  if (etat.survolZone !== null && !vue.ligneeActive) o *= etat.plan!.zones[etat.survolZone]?.stations.includes(s.u) ? 1 : estompe
  const focus = ligneFocus(etat)
  if (focus !== null && s.genre !== 'zone') o *= s.lignes.includes(focus) ? 1 : estompe
  if (vue.ligneeActive) o *= vue.lignee[s.u] ? 1 : estompe
  else if (vue.survol !== null && focus === null && s.genre !== 'zone') o *= s.u === vue.survol || vue.voisinsSurvol.has(s.u) ? 1 : 0.5
  return o
}

// ─── Calque dessous : zones tarifaires et lignes ─────────────────────────────

let horsEcran: HTMLCanvasElement | null = null

function dessinerZones(c: ContexteDessinR, etat: EtatMetro, m: Mesures): void {
  const { ctx, vue, largeur, hauteur, projection } = c
  const plan = etat.plan!
  if (!R<boolean>(vue, 'zones') || !plan.zones.length) return
  const ratio = window.devicePixelRatio || 1
  horsEcran ??= document.createElement('canvas')
  const hc = horsEcran
  if (hc.width !== Math.round(largeur * ratio) || hc.height !== Math.round(hauteur * ratio)) {
    hc.width = Math.round(largeur * ratio)
    hc.height = Math.round(hauteur * ratio)
  }
  const h = hc.getContext('2d')!
  const rayon = clamp(R<number>(vue, 'rayonZone') * m.ppu, 10, 90)
  const focus = ligneFocus(etat)
  const attenue = (vue.ligneeActive || focus !== null ? 0.5 : 1) * (1 - 0.75 * vue.extrusion)
  if (attenue < 0.02) return
  plan.zones.forEach((z, zi) => {
    const accent = etat.survolZone === null ? 1 : etat.survolZone === zi ? 1.35 : 0.35
    const k = Math.min(zi, etat.couleurs.zoneFond.length - 1)
    h.setTransform(1, 0, 0, 1, 0, 0)
    h.clearRect(0, 0, hc.width, hc.height)
    h.setTransform(ratio, 0, 0, ratio, 0, 0)
    h.lineCap = 'round'
    h.lineJoin = 'round'
    // Deux passes : trait (plus large), puis fond : une tache unie bordée.
    for (const [couleur, marge] of [[etat.couleurs.zoneTrait[k]!, 1.1], [etat.couleurs.zoneFond[k]!, 0]] as const) {
      h.strokeStyle = couleur
      h.fillStyle = couleur
      h.lineWidth = (rayon + marge) * 2
      for (const ti of z.troncons) {
        const t = plan.troncons[ti]!
        const sa = plan.stations[plan.stationDe[t.de]!]!, sb = plan.stations[plan.stationDe[t.vers]!]!
        if (sb.colonne - sa.colonne > 2) continue
        for (const tr of etat.ecran) {
          if (tr.troncon !== ti) continue
          h.beginPath()
          h.moveTo(tr.pts[0]!, tr.pts[1]!)
          for (let i = 2; i < tr.pts.length; i += 2) h.lineTo(tr.pts[i]!, tr.pts[i + 1]!)
          h.stroke()
          break
        }
      }
      for (const u of z.stations) {
        if (plan.stations[plan.stationDe[u]!]!.horsPlan) continue
        h.beginPath()
        h.arc(projection.x[u]!, projection.y[u]!, rayon + marge, 0, Math.PI * 2)
        h.fill()
      }
    }
    ctx.save()
    ctx.globalAlpha = Math.min(1, R<number>(vue, 'opaciteZones') * attenue * accent)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(hc, 0, 0)
    ctx.restore()
  })
}

function tracer(ctx: CanvasRenderingContext2D, pts: Float32Array, fin = pts.length): void {
  ctx.beginPath()
  ctx.moveTo(pts[0]!, pts[1]!)
  for (let i = 2; i < fin; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!)
}

/** Raccourcit une polyligne écran de `d` pixels à la fin (terminus barré). */
function raccourcir(pts: Float32Array, d: number): { pts: Float32Array; fin: Pt; dir: Pt } {
  const n = pts.length / 2
  let reste = d
  for (let i = n - 1; i > 0; i--) {
    const x1 = pts[(i - 1) * 2]!, y1 = pts[(i - 1) * 2 + 1]!, x2 = pts[i * 2]!, y2 = pts[i * 2 + 1]!
    const l = Math.hypot(x2 - x1, y2 - y1)
    if (l >= reste || i === 1) {
      const t = l ? Math.max(0, (l - reste) / l) : 0
      const fx = x1 + (x2 - x1) * t, fy = y1 + (y2 - y1) * t
      const out = new Float32Array(i * 2 + 2)
      out.set(pts.subarray(0, i * 2))
      out[i * 2] = fx
      out[i * 2 + 1] = fy
      return { pts: out, fin: [fx, fy], dir: l ? [(x2 - x1) / l, (y2 - y1) / l] : [1, 0] }
    }
    reste -= l
  }
  return { pts, fin: [pts[0]!, pts[1]!], dir: [1, 0] }
}

/** Ligne abandonnée arrivant sur un aiguillage : terminus barré avant la station. */
export function estTerminusBarre(plan: PlanM, t: TronconM, l: number): boolean {
  const L = plan.lignes[l]!
  const s = plan.stations[plan.stationDe[t.vers]!]!
  return L.abandonnee && s.genre === 'aiguillage' && !s.lignes.every((x) => plan.lignes[x]!.abandonnee)
}

function dessinerLignes(c: ContexteDessinR, etat: EtatMetro, m: Mesures): void {
  const { ctx, vue } = c
  const plan = etat.plan!
  const pal = vue.palette
  const focus = ligneFocus(etat)
  // Ordre : lignes estompées d'abord, ligne en avant et tronçon survolé à la fin.
  const ordre = [...etat.ecran].sort((a, b) => {
    const pa = (a.ligne === focus ? 2 : 0) + (a.troncon === etat.survolTroncon ? 1 : 0)
    const pb = (b.ligne === focus ? 2 : 0) + (b.troncon === etat.survolTroncon ? 1 : 0)
    return pa - pb
  })
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const perles = R<boolean>(vue, 'perles')
  for (const tr of ordre) {
    const t = plan.troncons[tr.troncon]!
    const o = opaciteTrace(vue, etat, t, tr.ligne)
    if (o < 0.01) continue
    const L = plan.lignes[tr.ligne]!
    const coul = couleurLigne(etat, tr.ligne)
    const survole = etat.survolTroncon === t.index
    const lw = m.lw * (survole ? 1.25 : 1)
    let pts = tr.pts
    let barre: { fin: Pt; dir: Pt } | null = null
    if (estTerminusBarre(plan, t, tr.ligne)) {
      const r = raccourcir(tr.pts, m.r * 1.6 + 10)
      pts = r.pts
      barre = { fin: r.fin, dir: r.dir }
    }
    // Liseré couleur du fond : les croisements restent lisibles (comme sur un plan imprimé).
    ctx.strokeStyle = rgba(pal.fond, 0.95 * Math.min(1, o * 1.4))
    ctx.lineWidth = lw + 4
    tracer(ctx, pts)
    ctx.stroke()
    ctx.strokeStyle = rgba(coul, o)
    ctx.lineWidth = lw
    tracer(ctx, pts)
    ctx.stroke()
    if (L.abandonnee) {
      // Voie abandonnée : ligne creuse (deux rails).
      ctx.strokeStyle = rgba(pal.fond, o)
      ctx.lineWidth = lw * 0.42
      tracer(ctx, pts)
      ctx.stroke()
    }
    if (barre) {
      const [fx, fy] = barre.fin, [dx, dy] = barre.dir
      const h = m.r * 1.5
      ctx.strokeStyle = rgba(coul, o)
      ctx.lineWidth = Math.max(3, lw * 0.9)
      ctx.lineCap = 'butt'
      ctx.beginPath()
      ctx.moveTo(fx - dy * h, fy + dx * h)
      ctx.lineTo(fx + dy * h, fy - dx * h)
      ctx.stroke()
      ctx.lineCap = 'round'
    }
    // Perles : une par étape masquée (au plus 12), dans l'épaisseur de la ligne propre.
    if (perles && !etat.deplies.has(t.index) && t.etapes.length && tr.ligne === t.lignes[0] && !L.abandonnee) {
      const n = Math.min(12, t.etapes.length)
      const tr0 = t.traces[0]!
      const fr = etat.fractions.get(`${t.index}:0`)!
      ctx.fillStyle = rgba(pal.fond, 0.95 * o)
      for (let k = 0; k < n; k++) {
        const f = 0.2 + (0.6 * (k + 0.5)) / n
        const q = pointEcran(vue, tr0, fr, f, t)
        ctx.beginPath()
        ctx.arc(q[0], q[1], Math.max(1.1, lw * 0.2), 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  ctx.restore()
}

/** Point écran à la fraction f d'un tracé de tronçon (profondeur interpolée en 3D). */
function pointEcran(vue: VueRaisonnement, pts: Pt[], fr: number[], f: number, t: TronconM): Pt {
  let i = 1
  while (i < fr.length - 1 && fr[i]! < f) i++
  const a = pts[i - 1]!, b = pts[i]!
  const ta = fr[i]! - fr[i - 1]! ? (f - fr[i - 1]!) / (fr[i]! - fr[i - 1]!) : 0
  const x = a[0] + (b[0] - a[0]) * ta, y = a[1] + (b[1] - a[1]) * ta
  const d = vue.disposition
  const yc = d.yCouche[t.de]! + (d.yCouche[t.vers]! - d.yCouche[t.de]!) * f
  const q = vue.camera.projeterPoint([x, yc * vue.extrusion, -y])
  return [q.x, q.y]
}

/** Voies rejetées d'un aiguillage : courtes voies en tirets finissant par un butoir. */
function voiesRejetees(plan: PlanM, s: StationM, n: NoeudR): { libelle: string; raison?: string }[] {
  const alt = n.decision?.alternatives.filter((a) => !a.retenue) ?? []
  // Une ligne abandonnée arrive déjà sur l'aiguillage : sa voie n'est pas redessinée.
  const arrivees = plan.troncons.filter((t) => t.vers === s.u).flatMap((t) => t.lignes).filter((l) => plan.lignes[l]!.abandonnee)
  if (!arrivees.length) return alt
  const mots = new Set(arrivees.flatMap((l) => plan.lignes[l]!.nom.toLowerCase().split(/[^a-zà-ÿ]+/).filter((w) => w.length > 4)))
  return alt.filter((a) => !a.libelle.toLowerCase().split(/[^a-zà-ÿ]+/).some((w) => mots.has(w)))
}

export function rejeteeDeLigne(plan: PlanM, t: TronconM, n: NoeudR): { libelle: string; raison?: string } | undefined {
  const alt = n.decision?.alternatives.filter((a) => !a.retenue) ?? []
  const mots = new Set(t.lignes.flatMap((l) => plan.lignes[l]!.nom.toLowerCase().split(/[^a-zà-ÿ]+/).filter((w) => w.length > 4)))
  return alt.find((a) => a.libelle.toLowerCase().split(/[^a-zà-ÿ]+/).some((w) => mots.has(w))) ?? alt[0]
}

/** Libellés des voies rejetées du rendu courant (posés par dessinerLibelles). */
let libellesVoies: { x: number; y: number; texte: string; o: number }[] = []

function dessinerVoiesRejetees(c: ContexteDessinR, etat: EtatMetro, m: Mesures): void {
  const { ctx, vue, projection } = c
  if (!R<boolean>(vue, 'voiesRejetees')) return
  const plan = etat.plan!
  const pal = vue.palette
  ctx.save()
  for (const s of plan.stations) {
    if (s.genre !== 'aiguillage' || s.horsPlan) continue
    const o = opaciteStation(vue, etat, s)
    if (o < 0.05) continue
    const n = vue.noeud(s.u)
    const voies = voiesRejetees(plan, s, n)
    const x = projection.x[s.u]!, y = projection.y[s.u]!
    const detail = vue.survol === s.u || vue.selection === s.u || m.ppu > 95
    voies.forEach((v, k) => {
      const haut = k % 2 === 0
      const dir: Pt = [Math.SQRT1_2, haut ? -Math.SQRT1_2 : Math.SQRT1_2]
      const long = clamp(0.62 * m.ppu, 18, 60) * (1 + Math.floor(k / 2) * 0.5)
      const x0 = x + dir[0] * m.r * 1.2, y0 = y + dir[1] * m.r * 1.2
      const x1 = x0 + dir[0] * long, y1 = y0 + dir[1] * long
      ctx.strokeStyle = rgba(pal.texteDoux, 0.75 * o)
      ctx.lineWidth = 1.6
      ctx.setLineDash([3.5, 3])
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.stroke()
      ctx.setLineDash([])
      // Butoir : barre perpendiculaire.
      ctx.lineWidth = 2.4
      ctx.beginPath()
      ctx.moveTo(x1 - dir[1] * 5, y1 + dir[0] * 5)
      ctx.lineTo(x1 + dir[1] * 5, y1 - dir[0] * 5)
      ctx.stroke()
      // Libellé : placé avec les autres (anticollision) sur le calque du dessus.
      if (detail) libellesVoies.push({ x: x1, y: y1, texte: `✗ ${v.libelle}`, o })
    })
  }
  ctx.restore()
}

export function dessinerDessousMetro(c: ContexteDessinR, etat: EtatMetro): void {
  if (!etat.plan) return
  const m = mesures(c.vue)
  projeterTraces(c.vue, etat)
  libellesVoies = []
  dessinerZones(c, etat, m)
  dessinerLignes(c, etat, m)
  dessinerVoiesRejetees(c, etat, m)
}

// ─── Calque dessus : stations, étapes dépliées, liens, libellés ──────────────

function couleurZone(etat: EtatMetro, u: number): string | null {
  const plan = etat.plan!
  // Zone la plus spécifique (la dernière) qui couvre la station.
  for (let i = plan.zones.length - 1; i >= 0; i--) {
    if (plan.zones[i]!.stations.includes(u)) return etat.couleurs.zoneFond[Math.min(i, etat.couleurs.zoneFond.length - 1)]!
  }
  return null
}

/** Couleur de remplissage d'une station (teinte de zone), utilisée aussi par le disque sigma. */
export function fondStation(vue: VueRaisonnement, etat: EtatMetro, u: number): string {
  if (!R<boolean>(vue, 'teinteZones')) return etat.couleurs.stationFond
  return couleurZone(etat, u) ?? etat.couleurs.stationFond
}

function dessinerStations(c: ContexteDessinR, etat: EtatMetro, m: Mesures): void {
  const { ctx, vue, projection } = c
  const plan = etat.plan!
  const pal = vue.palette
  const trait = etat.couleurs.stationTrait
  ctx.save()
  for (const s of plan.stations) {
    if (s.horsPlan) continue
    const o = opaciteStation(vue, etat, s)
    if (o < 0.02 || !projection.visible[s.u]) continue
    const n = vue.noeud(s.u)
    const x = projection.x[s.u]!, y = projection.y[s.u]!
    const ech = vue.camera.perspective > 0 ? clamp(projection.echelle[s.u]!, 0.5, 1.6) : 1
    const r = m.r * ech * (n.type === 'resultat' || n.type === 'theoreme' ? 1.3 : 1)
    const fond = fondStation(vue, etat, s.u)
    const coulL = s.lignes.length ? couleurLigne(etat, s.lignes[0]!) : pal.texteDoux
    const correspondance = s.lignes.length > 1
    const refute = n.statut === 'refute', incertain = n.statut === 'incertain'
    ctx.lineWidth = Math.max(2, m.lw * 0.5)
    ctx.setLineDash(incertain ? [3, 2.2] : [])
    ctx.fillStyle = rgba(fond, o)
    ctx.strokeStyle = rgba(refute ? pal.statut.refute : incertain ? pal.statut.incertain : correspondance || s.genre !== 'station' ? trait : coulL, o)
    ctx.beginPath()
    if (s.genre === 'terminus') {
      // Terminus de départ : carré arrondi.
      const h = r * 1.05
      ctx.roundRect(x - h, y - h + s.haut * m.ppu, h * 2, h * 2 + (s.bas - s.haut) * m.ppu, 2.5)
    } else if (s.genre === 'aiguillage') {
      const h = r * 1.45
      ctx.moveTo(x, y - h + s.haut * m.ppu)
      ctx.lineTo(x + h, y + ((s.haut + s.bas) / 2) * m.ppu)
      ctx.lineTo(x, y + h + s.bas * m.ppu)
      ctx.lineTo(x - h, y + ((s.haut + s.bas) / 2) * m.ppu)
      ctx.closePath()
    } else if (correspondance) {
      // Correspondance : capsule verticale qui englobe les lignes parallèles.
      ctx.roundRect(x - r, y - r + s.haut * m.ppu, r * 2, r * 2 + (s.bas - s.haut) * m.ppu, r)
    } else ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.setLineDash([])
    // Résultat / théorème : point central.
    if ((n.type === 'resultat' || n.type === 'theoreme') && !correspondance) {
      ctx.fillStyle = rgba(trait, o)
      ctx.beginPath()
      ctx.arc(x, y, r * 0.38, 0, Math.PI * 2)
      ctx.fill()
    } else if ((n.type === 'resultat' || n.type === 'theoreme') && correspondance) {
      ctx.fillStyle = rgba(trait, o)
      ctx.beginPath()
      ctx.roundRect(x - r * 0.38, y - r * 0.38 + s.haut * m.ppu, r * 0.76, r * 0.76 + (s.bas - s.haut) * m.ppu, r * 0.38)
      ctx.fill()
    }
    if (refute) {
      // Réfuté : croix rouge.
      const k = r * 0.55
      ctx.strokeStyle = rgba(pal.statut.refute, o)
      ctx.lineWidth = 2.2
      ctx.beginPath()
      ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k)
      ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k)
      ctx.stroke()
    }
    // Pastille de validation (qui a validé), en haut à droite.
    if (R<boolean>(vue, 'pastillesValidation') && n.validation !== 'aucune' && s.genre !== 'terminus') {
      const px = x + r * 0.95, py = y - r * 0.95 + (s.genre === 'aiguillage' ? -r * 0.2 : s.haut * m.ppu)
      ctx.fillStyle = rgba(pal.validation[n.validation], o)
      ctx.strokeStyle = rgba(pal.fond, o)
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(px, py, 3.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    // Sélection / survol : anneau d'accent.
    if (vue.selection === s.u || vue.survol === s.u) {
      ctx.strokeStyle = rgba(pal.accent, vue.selection === s.u ? 0.95 : 0.6)
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(x - r - 5, y - r - 5 + s.haut * m.ppu, (r + 5) * 2, (r + 5) * 2 + (s.bas - s.haut) * m.ppu, r + 5)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function dessinerEtapesDepliees(c: ContexteDessinR, etat: EtatMetro, m: Mesures): void {
  const { ctx, vue, projection } = c
  const plan = etat.plan!
  const pal = vue.palette
  ctx.save()
  ctx.lineJoin = 'round'
  for (const ti of etat.deplies) {
    const t = plan.troncons[ti]
    if (!t) continue
    const o = opaciteTrace(vue, etat, t, t.lignes[0]!)
    if (o < 0.05) continue
    const coul = couleurLigne(etat, t.lignes[0]!)
    ctx.font = `500 10.5px ${pal.police}`
    for (const u of t.etapes) {
      const x = projection.x[u]!, y = projection.y[u]!
      const n = vue.noeud(u)
      ctx.fillStyle = rgba(etat.couleurs.stationFond, o)
      ctx.strokeStyle = rgba(n.statut === 'refute' ? pal.statut.refute : n.statut === 'incertain' ? pal.statut.incertain : coul, o)
      ctx.lineWidth = 1.8
      ctx.beginPath()
      ctx.arc(x, y, Math.max(3, m.r * 0.5), 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      if (vue.survol === u) {
        ctx.strokeStyle = rgba(pal.accent, 0.8)
        ctx.beginPath()
        ctx.arc(x, y, Math.max(3, m.r * 0.5) + 4, 0, Math.PI * 2)
        ctx.stroke()
      }
      // Libellé incliné à 45°, au-dessus de la ligne.
      ctx.save()
      ctx.translate(x + 3, y - Math.max(3, m.r * 0.5) - 3)
      ctx.rotate(-Math.PI / 4)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      const txt = n.nom.length > 38 ? n.nom.slice(0, 37) + '…' : n.nom
      ctx.lineWidth = 3
      ctx.strokeStyle = rgba(pal.fond, 0.9 * o)
      ctx.strokeText(txt, 0, 0)
      ctx.fillStyle = rgba(pal.texte, o)
      ctx.fillText(txt, 0, 0)
      ctx.restore()
    }
  }
  // Annexes (impasses) de la station sélectionnée : voie de service en tirets.
  const sel = vue.selection
  const an = sel !== null && sel < vue.nU ? plan.annexes.find((a) => a.station === sel) : undefined
  if (an) {
    const x0 = projection.x[an.station]!, y0 = projection.y[an.station]!
    const der = an.etapes[an.etapes.length - 1]!
    ctx.strokeStyle = rgba(pal.texteDoux, 0.8)
    ctx.lineWidth = 1.6
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(projection.x[der]!, projection.y[der]!)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.font = `500 10.5px ${pal.police}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    for (const u of an.etapes) {
      const x = projection.x[u]!, y = projection.y[u]!
      ctx.fillStyle = etat.couleurs.stationFond
      ctx.strokeStyle = rgba(pal.texteDoux, 0.9)
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.arc(x, y, 3.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      const txt = vue.noeud(u).nom
      ctx.lineWidth = 3
      ctx.strokeStyle = rgba(pal.fond, 0.9)
      ctx.strokeText(txt, x + 7, y)
      ctx.fillStyle = pal.texteDoux
      ctx.fillText(txt, x + 7, y)
    }
  }
  ctx.restore()
}

/** Contradiction et résolution : arcs annotés (l'abandon est déjà dit par le terminus barré). */
function dessinerLiens(c: ContexteDessinR, etat: EtatMetro, m: Mesures): void {
  const { ctx, vue, projection } = c
  if (!R<boolean>(vue, 'liensSemantiques')) return
  const plan = etat.plan!
  const pal = vue.palette
  const j = vue.justification
  ctx.save()
  ctx.font = `600 10px ${pal.police}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const s of plan.stations) {
    const n = vue.noeud(s.u)
    for (const l of n.liens ?? []) {
      if (l.genre === 'abandonne') continue
      const ci = j.index.get(l.cible)
      if (ci === undefined) continue
      const b = vue.pointDeNoeud(ci)
      if (b === null || b >= vue.nU || plan.stationDe[b]! < 0) continue
      const o = Math.min(opaciteStation(vue, etat, s), opaciteStation(vue, etat, plan.stations[plan.stationDe[b]!]!))
      if (o < 0.05) continue
      const coul = l.genre === 'contredit' ? pal.contredit : pal.statut.valide
      const x1 = projection.x[s.u]!, y1 = projection.y[s.u]!, x2 = projection.x[b]!, y2 = projection.y[b]!
      // Arc au-dessus (contradiction) ou au-dessous (résolution).
      const sens = l.genre === 'contredit' ? -1 : 1
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + sens * Math.max(26, Math.abs(x2 - x1) * 0.22)
      ctx.strokeStyle = rgba(coul, 0.85 * o)
      ctx.lineWidth = 1.5
      ctx.setLineDash(l.genre === 'contredit' ? [5, 4] : [])
      ctx.beginPath()
      ctx.moveTo(x1, y1 + sens * m.r)
      ctx.quadraticCurveTo(mx, my, x2, y2 + sens * m.r)
      ctx.stroke()
      ctx.setLineDash([])
      const tx = (x1 + 2 * mx + x2) / 4, ty = (y1 + 2 * my + y2) / 4
      const texte = l.genre === 'contredit' ? 'contredit' : l.genre === 'resout' ? 'résout' : 'remplace'
      const w = ctx.measureText(texte).width + 10
      ctx.fillStyle = rgba(pal.surface, 0.95 * o)
      ctx.strokeStyle = rgba(coul, 0.6 * o)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(tx - w / 2, ty - 8, w, 16, 8)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = rgba(coul, o)
      ctx.fillText(texte, tx, ty + 0.5)
      obstaclesLiens.push([tx - w / 2, ty - 8, tx + w / 2, ty + 8])
    }
  }
  ctx.restore()
}
let obstaclesLiens: [number, number, number, number][] = []

// ─── Libellés : placement glouton sans chevauchement ─────────────────────────

type Position = 'droite' | 'gauche' | 'dessus' | 'dessous' | 'dessusDroite' | 'dessousDroite' | 'dessusGauche' | 'dessousGauche'

interface Etiquette {
  u: number
  lignes: string[]
  x: number
  y: number
  /** Demi-largeur du symbole, et extension verticale (haut < 0, bas > 0). */
  rx: number
  haut: number
  bas: number
  priorite: number
  positions: Position[]
  police: string
  couleur: string
  largeurMax: number
  italique?: boolean
  lignesMax?: number
}

const cacheCoupe = new Map<string, string[]>()

function couperTexte(ctx: CanvasRenderingContext2D, texte: string, police: string, max: number, lignesMax = 2): string[] {
  const cle = `${police}|${max}|${texte}`
  const c = cacheCoupe.get(cle)
  if (c) return c
  ctx.font = police
  const mots = texte.split(' ')
  const res: string[] = []
  let cour = ''
  for (let i = 0; i < mots.length; i++) {
    const essai = cour ? `${cour} ${mots[i]}` : mots[i]!
    if (ctx.measureText(essai).width <= max || !cour) cour = essai
    else {
      res.push(cour)
      cour = mots[i]!
      if (res.length === lignesMax - 1) {
        cour = mots.slice(i).join(' ')
        break
      }
    }
  }
  if (cour) res.push(cour)
  const der = res.length - 1
  if (ctx.measureText(res[der]!).width > max) {
    let t = res[der]!
    while (t.length > 3 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1)
    res[der] = t.trimEnd() + '…'
  }
  cacheCoupe.set(cle, res)
  if (cacheCoupe.size > 800) cacheCoupe.clear()
  return res
}

function dessinerLibelles(c: ContexteDessinR, etat: EtatMetro, m: Mesures): void {
  const { ctx, vue, projection, largeur, hauteur } = c
  const plan = etat.plan!
  const pal = vue.palette
  const taille = R<number>(vue, 'policeStations')
  const largeurMax = R<number>(vue, 'largeurLibelles')
  const etiquettes: Etiquette[] = []
  for (const s of plan.stations) {
    if (s.horsPlan) continue
    const o = opaciteStation(vue, etat, s)
    if (o < 0.08 || !projection.visible[s.u]) continue
    const n = vue.noeud(s.u)
    const cle = n.type === 'resultat' || n.type === 'theoreme'
    const r = m.r * (cle ? 1.3 : 1) * (s.genre === 'aiguillage' ? 1.45 : 1)
    const poids = cle ? 700 : s.genre === 'aiguillage' ? 600 : 500
    const couleur = n.piste === 'abandonnee' ? pal.texteDoux : pal.texte
    etiquettes.push({
      u: s.u, lignes: [n.nom], x: projection.x[s.u]!, y: projection.y[s.u]!, rx: r, haut: s.haut * m.ppu - r, bas: s.bas * m.ppu + r,
      priorite: cle ? 5 : s.genre === 'aiguillage' ? 4 : s.genre === 'terminus' ? 3.5 : 2,
      positions: s.genre === 'terminus'
        ? ['gauche', 'dessusGauche', 'dessousGauche', 'dessus', 'dessous']
        : ['dessus', 'dessous', 'dessusDroite', 'dessousDroite', 'droite', 'dessusGauche', 'dessousGauche', 'gauche'],
      police: `${s.genre === 'aiguillage' ? 'italic ' : ''}${poids} ${cle ? taille + 0.5 : taille}px ${pal.police}`,
      couleur: rgba(couleur, Math.min(1, o * 1.1)),
      largeurMax: s.genre === 'terminus' ? largeurMax * 0.95 : largeurMax,
      italique: s.genre === 'aiguillage',
    })
  }
  // Terminus barré d'une ligne abandonnée : sa raison est un libellé à part entière.
  for (const t of plan.troncons) {
    t.lignes.forEach((l) => {
      if (!estTerminusBarre(plan, t, l)) return
      const o = opaciteTrace(vue, etat, t, l)
      if (o < 0.08) return
      const alt = rejeteeDeLigne(plan, t, vue.noeud(t.vers))
      if (!alt) return
      const tr = etat.ecran.find((e) => e.troncon === t.index && e.ligne === l)
      if (!tr) return
      const r = raccourcir(tr.pts, m.r * 1.6 + 10)
      etiquettes.push({
        u: -1, lignes: [`Terminus : ${alt.raison ?? alt.libelle}`], x: r.fin[0], y: r.fin[1], rx: 6, haut: -m.r * 1.5, bas: m.r * 1.5,
        priorite: 4.5, positions: ['dessous', 'dessousGauche', 'dessus', 'dessusGauche'],
        police: `italic 500 ${taille - 1}px ${pal.police}`, couleur: rgba(couleurLigne(etat, l), Math.min(1, o * 1.2)),
        largeurMax: largeurMax * 1.1, lignesMax: 3,
      })
    })
  }
  // Voies rejetées d'un aiguillage survolé ou sélectionné : prioritaires (demandées explicitement).
  for (const lv of libellesVoies) {
    etiquettes.push({
      u: -1, lignes: [lv.texte], x: lv.x, y: lv.y, rx: 6, haut: -6, bas: 6,
      priorite: 6, positions: ['droite', 'dessousDroite', 'dessusDroite', 'dessous', 'dessus', 'gauche'],
      police: `italic 500 ${taille - 1.5}px ${pal.police}`, couleur: rgba(pal.texteDoux, Math.min(1, lv.o * 1.2)),
      largeurMax: largeurMax * 1.3, lignesMax: 2,
    })
  }
  etiquettes.sort((a, b) => b.priorite - a.priorite || a.x - b.x)

  // Obstacles : symboles, tracés échantillonnés (grille), libellés posés.
  const posees: [number, number, number, number][] = [...obstaclesLiens]
  const symboles: [number, number, number, number][] = etiquettes.map((e) => [e.x - e.rx, e.y + e.haut, e.x + e.rx, e.y + e.bas])
  const cellule = 20
  const grille = new Map<number, number[]>()
  const ajouter = (x: number, y: number) => {
    const k = Math.floor(x / cellule) * 100003 + Math.floor(y / cellule)
    let l = grille.get(k)
    if (!l) grille.set(k, (l = []))
    l.push(x, y)
  }
  for (const tr of etat.ecran) {
    if (opaciteTrace(vue, etat, etat.plan!.troncons[tr.troncon]!, tr.ligne) < 0.3) continue
    for (let i = 2; i < tr.pts.length; i += 2) {
      const x1 = tr.pts[i - 2]!, y1 = tr.pts[i - 1]!, x2 = tr.pts[i]!, y2 = tr.pts[i + 1]!
      const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 6))
      for (let k = 0; k <= n; k++) ajouter(x1 + ((x2 - x1) * k) / n, y1 + ((y2 - y1) * k) / n)
    }
  }
  const pointsDans = (x0: number, y0: number, x1: number, y1: number) => {
    let n = 0
    for (let cx = Math.floor(x0 / cellule); cx <= Math.floor(x1 / cellule); cx++) {
      for (let cy = Math.floor(y0 / cellule); cy <= Math.floor(y1 / cellule); cy++) {
        const l = grille.get(cx * 100003 + cy)
        if (!l) continue
        for (let i = 0; i < l.length; i += 2) if (l[i]! >= x0 && l[i]! <= x1 && l[i + 1]! >= y0 && l[i + 1]! <= y1) n++
      }
    }
    return n
  }
  const recouvre = (a: [number, number, number, number], b: [number, number, number, number]) => {
    const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h = Math.min(a[3], b[3]) - Math.max(a[1], b[1])
    return w > 0 && h > 0 ? w * h : 0
  }
  const interligne = taille * 1.2
  ctx.save()
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  for (const e of etiquettes) {
    const lignesTxt = couperTexte(ctx, e.lignes[0]!, e.police, e.largeurMax, e.lignesMax ?? 2)
    ctx.font = e.police
    const w = Math.max(...lignesTxt.map((t) => ctx.measureText(t).width))
    const h = lignesTxt.length * interligne
    const g = 5
    let meilleur: { box: [number, number, number, number]; align: CanvasTextAlign; tx: number; ty: number } | null = null
    let score = Infinity, recouvrement = 0
    e.positions.forEach((pos, rangPos) => {
      let x0: number, y0: number, align: CanvasTextAlign = 'left', tx: number
      switch (pos) {
        case 'droite': x0 = e.x + e.rx + g; y0 = e.y - h / 2; break
        case 'gauche': x0 = e.x - e.rx - g - w; y0 = e.y - h / 2; break
        case 'dessus': x0 = e.x - w / 2; y0 = e.y + e.haut - g - h; break
        case 'dessous': x0 = e.x - w / 2; y0 = e.y + e.bas + g; break
        case 'dessusDroite': x0 = e.x + e.rx * 0.2; y0 = e.y + e.haut - g - h; break
        case 'dessousDroite': x0 = e.x + e.rx * 0.2; y0 = e.y + e.bas + g; break
        case 'dessusGauche': x0 = e.x - e.rx * 0.2 - w; y0 = e.y + e.haut - g - h; break
        case 'dessousGauche': x0 = e.x - e.rx * 0.2 - w; y0 = e.y + e.bas + g; break
      }
      const box: [number, number, number, number] = [x0 - 2, y0 - 1, x0 + w + 2, y0 + h + 1]
      let sc = rangPos * 6
      // Écart minimal entre libellés (sinon deux libellés voisins se lisent comme un seul).
      const marge: [number, number, number, number] = [box[0] - 7, box[1] - 2, box[2] + 7, box[3] + 2]
      let rec = 0, proche = 0
      for (const p of posees) {
        rec += recouvre(box, p)
        proche += recouvre(marge, p)
      }
      sc += rec * 6 + proche * 2
      for (const sb of symboles) sc += recouvre(box, sb) * 4
      sc += pointsDans(box[0], box[1], box[2], box[3]) * 9
      if (box[0] < 4 || box[2] > largeur - 4 || box[1] < 4 || box[3] > hauteur - 4) sc += 4000
      if (sc < score) {
        score = sc
        recouvrement = rec
        tx = x0
        if (pos === 'gauche' || pos === 'dessusGauche' || pos === 'dessousGauche') { align = 'right'; tx = x0 + w }
        else if (pos === 'dessus' || pos === 'dessous') { align = 'center'; tx = x0 + w / 2 }
        meilleur = { box, align, tx, ty: y0 + interligne / 2 }
      }
    })
    if (!meilleur) continue
    // Pas de place sans chevaucher un autre libellé : on l'omet (il revient au zoom et au survol).
    if (recouvrement > 30 && e.priorite < 5 && e.u !== vue.survol && e.u !== vue.selection) continue
    const mm = meilleur as { box: [number, number, number, number]; align: CanvasTextAlign; tx: number; ty: number }
    posees.push(mm.box)
    ctx.font = e.police
    ctx.textAlign = mm.align
    lignesTxt.forEach((t, k) => {
      ctx.lineWidth = 3.5
      ctx.strokeStyle = rgba(pal.fond, 0.92)
      ctx.strokeText(t, mm.tx, mm.ty + k * interligne)
      ctx.fillStyle = e.couleur
      ctx.fillText(t, mm.tx, mm.ty + k * interligne)
    })
  }
  ctx.restore()
}

export function dessinerDessusMetro(c: ContexteDessinR, etat: EtatMetro): void {
  if (!etat.plan) return
  const m = mesures(c.vue)
  if (!etat.ecran.length) projeterTraces(c.vue, etat)
  obstaclesLiens = []
  dessinerLiens(c, etat, m)
  dessinerEtapesDepliees(c, etat, m)
  dessinerStations(c, etat, m)
  dessinerLibelles(c, etat, m)
}

// ─── Tests de survol ─────────────────────────────────────────────────────────

/** Tracé le plus proche d'un point écran (distance ≤ tolérance), ou null. */
export function traceSous(etat: EtatMetro, vue: VueRaisonnement, x: number, y: number, tolerance = 7): TraceEcran | null {
  const plan = etat.plan
  if (!plan) return null
  let meilleur: TraceEcran | null = null, dMin = tolerance
  for (const tr of etat.ecran) {
    if (opaciteTrace(vue, etat, plan.troncons[tr.troncon]!, tr.ligne) < 0.1) continue
    for (let i = 2; i < tr.pts.length; i += 2) {
      const x1 = tr.pts[i - 2]!, y1 = tr.pts[i - 1]!, x2 = tr.pts[i]!, y2 = tr.pts[i + 1]!
      const dx = x2 - x1, dy = y2 - y1
      const l2 = dx * dx + dy * dy
      const t = l2 ? clamp(((x - x1) * dx + (y - y1) * dy) / l2, 0, 1) : 0
      const d = Math.hypot(x - (x1 + dx * t), y - (y1 + dy * t))
      if (d < dMin) {
        dMin = d
        meilleur = tr
      }
    }
  }
  return meilleur
}
