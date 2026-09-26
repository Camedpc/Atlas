// Agrégats en anneaux (donuts) dessinés sur le calque « dessus » :
//   anneau épais = répartition des statuts (validé / incertain / réfuté) ;
//   anneau fin intérieur = validation (aucune / IA / humain / IA + humain) ;
//   centre = nom et effectif ; rayon ∝ √effectif.
// Pendant l'ouverture, l'anneau « se déroule » : ses secteurs s'écartent et s'éloignent du
// centre pendant que les enfants éclosent. Au survol, les secteurs se détachent ; survoler un
// secteur affiche « 23 incertains » et met ces nœuds en avant (ou leur aperçu s'ils sont repliés).
// Les feuilles gardent le rendu sigma ; au survol, un violon de confiance s'affiche dessous.

import {
  LIBELLES_VALIDATION, STATUTS, VALIDATIONS, clamp, formaterNombre, rgba,
  type ContexteDessin, type Statut, type Validation, type VueGraphe,
} from '../../src/core'

export type Anneau = 'statut' | 'validation'
export interface Secteur {
  u: number
  anneau: Anneau
  /** Statut, validation, ou 'hors' (feuilles hors filtre). */
  cle: string
  n: number
}

interface Segment {
  anneau: Anneau
  cle: string
  n: number
  a0: number
  a1: number
}

interface Geometrie {
  cx: number
  cy: number
  rExt: number
  rInt: number
  rValExt: number
  rValInt: number
  eclat: number
  segments: Segment[]
}

const TAU = Math.PI * 2

/** Libellé « 23 incertains », « 1 réfuté », « 8 validés IA + humain »… */
export function libelleSecteur(s: Pick<Secteur, 'anneau' | 'cle' | 'n'>): string {
  const pl = s.n > 1 ? 's' : ''
  if (s.cle === 'hors') return `${s.n} hors filtre`
  if (s.anneau === 'statut') {
    const m = { valide: `validé${pl}`, incertain: `incertain${pl}`, refute: `réfuté${pl}` }[s.cle as Statut]
    return `${s.n} ${m}`
  }
  const v = s.cle as Validation
  if (v === 'aucune') return `${s.n} sans validation`
  return `${s.n} validé${pl} · ${LIBELLES_VALIDATION[v]}`
}

export class Anneaux {
  /** Par catégorie : comptes des statuts (3), validations (4), feuilles actives, total. */
  statuts: Int32Array
  validations: Int32Array
  actives: Int32Array
  total: Int32Array
  /** Détachement animé (0…1) par unité, piloté par le survol. */
  private detache = new Map<number, number>()
  private geo = new Map<number, Geometrie>()
  secteur: Secteur | null = null
  /** Feuilles du secteur survolé (pour le réducteur). */
  feuillesSecteur = new Set<number>()

  constructor(private vue: VueGraphe) {
    const nC = vue.h.nC
    this.statuts = new Int32Array(nC * 3)
    this.validations = new Int32Array(nC * 4)
    this.actives = new Int32Array(nC)
    this.total = new Int32Array(nC)
    this.recompter()
  }

  private get R() {
    return this.vue.reglages
  }

  /** Recompte les compositions (au démarrage et à chaque changement de filtres). */
  recompter(): void {
    const { h, filtres } = this.vue
    this.statuts.fill(0)
    this.validations.fill(0)
    this.actives.fill(0)
    this.total.fill(0)
    for (let f = 0; f < h.nF; f++) {
      const n = h.noeuds[f]!
      const act = filtres.actives[f] === 1
      const is = STATUTS.indexOf(n.statut), iv = VALIDATIONS.indexOf(n.validation)
      for (let k = 0; k < 3; k++) {
        const c = h.chaine[f * 3 + k]!
        this.total[c]!++
        if (!act) continue
        this.actives[c]!++
        this.statuts[c * 3 + is]!++
        this.validations[c * 4 + iv]!++
      }
    }
  }

  /** Rayon extérieur (px, sans perspective) d'un agrégat de n feuilles. */
  rayon(n: number): number {
    return this.R.lire<number>('rayonMin') + this.R.lire<number>('tailleAnneau') * Math.sqrt(Math.max(1, n))
  }

  // ─── Animation du détachement au survol ───────────────────────────────────

  /** Avance les détachements vers leur cible ; renvoie vrai s'il faut encore des images. */
  avancer(dt: number): boolean {
    const survol = this.vue.survol
    if (survol !== null && survol >= this.vue.h.nF && !this.detache.has(survol)) this.detache.set(survol, 0)
    let encore = false
    const k = 1 - Math.exp(-dt / 90)
    for (const [u, d] of this.detache) {
      const cible = u === survol ? 1 : 0
      const nd = d + (cible - d) * k
      if (Math.abs(nd - cible) < 0.01) {
        if (cible === 0) this.detache.delete(u)
        else this.detache.set(u, 1)
      } else {
        this.detache.set(u, nd)
        encore = true
      }
    }
    return encore
  }

  // ─── Pointage d'un secteur ───────────────────────────────────────────────

  /** Secteur sous le point (x, y) pour l'agrégat u (géométrie de la dernière image). */
  secteurSous(u: number, x: number, y: number): Secteur | null {
    const g = this.geo.get(u)
    if (!g) return null
    const dx = x - g.cx, dy = y - g.cy
    const r = Math.hypot(dx, dy) - g.eclat
    let anneau: Anneau | null = null
    if (r >= g.rInt - 2 && r <= g.rExt + 4) anneau = 'statut'
    else if (r >= g.rValInt - 3 && r < g.rInt - 2) anneau = 'validation'
    if (!anneau) return null
    const a = Math.atan2(dy, dx)
    for (const s of g.segments) {
      if (s.anneau !== anneau) continue
      let b = a
      while (b < s.a0) b += TAU
      while (b > s.a0 + TAU) b -= TAU
      if (b <= s.a1) return { u, anneau, cle: s.cle, n: s.n }
    }
    return null
  }

  /** Met à jour le secteur survolé ; renvoie vrai s'il a changé. */
  definirSecteur(s: Secteur | null): boolean {
    const a = this.secteur
    if (a === s || (a && s && a.u === s.u && a.anneau === s.anneau && a.cle === s.cle)) return false
    this.secteur = s
    this.feuillesSecteur.clear()
    if (s) {
      const { h, filtres } = this.vue
      const c = h.categorieDe(s.u)!
      for (const f of c.feuilles) {
        const n = h.noeuds[f]!
        const ok = s.cle === 'hors' ? !filtres.actives[f] : filtres.actives[f] && (s.anneau === 'statut' ? n.statut === s.cle : n.validation === s.cle)
        if (ok) this.feuillesSecteur.add(f)
      }
    }
    return true
  }

  // ─── Dessin ───────────────────────────────────────────────────────────────

  dessiner(c: ContexteDessin): void {
    const { ctx, vue, projection } = c
    const { h, palette: pal, granularite: g } = vue
    const R = this.R
    const epais = R.lire<number>('epaisseurAnneau')
    const epaisVal = R.lire<number>('epaisseurValidation')
    const ecartAnneaux = R.lire<number>('ecartAnneaux')
    const ecartSecteurs = (R.lire<number>('ecartSecteurs') * Math.PI) / 180
    const deroulement = R.lire<number>('deroulement')
    const detacheMax = R.lire<number>('detacheSurvol')
    const teinte = R.lire<number>('teinteCentre')
    const ombre = R.lire<number>('ombreAnneaux')
    const nomCentre = R.lire<boolean>('nomCentre')
    const tailleNom = R.lire<number>('tailleNom')
    const seuilNom = R.lire<number>('seuilNom')
    const estomper = vue.filtres.restrictif && vue.filtres.etat.mode === 'estomper'
    const lignee = vue.lignee

    this.geo.clear()
    const etiquettes: { x: number; y: number; texte: string; l: number; priorite: number; alpha: number }[] = []
    // Ordre de peinture : du plus lointain au plus proche, le survolé en dernier.
    const ordre: number[] = []
    for (let u = h.nF; u < h.nU; u++) if (vue.opaciteAffichee[u]! > 0.015 && projection.visible[u]) ordre.push(u)
    ordre.sort((a, b) => (a === vue.survol ? 1 : b === vue.survol ? -1 : projection.profondeur[b]! - projection.profondeur[a]!))

    ctx.save()
    ctx.lineCap = 'butt'
    for (const u of ordre) {
      const ci = u - h.nF
      const cat = h.categories[ci]!
      const op = vue.opaciteAffichee[u]! * (1 - 0.45 * g.ouverture[u - h.nF]! * Math.min(1, deroulement))
      const o = g.ouverture[ci]!
      const cx = projection.x[u]!, cy = projection.y[u]!
      const rExt = vue.tailleAffichee[u]! * (1 + 0.25 * o * deroulement)
      // En se déroulant, l'anneau s'amincit et s'efface plus vite que la part visible seule.
      const ep = Math.max(2, rExt * epais * (1 - 0.55 * o * Math.min(1, deroulement)))
      const rInt = rExt - ep
      const rValExt = rInt - ecartAnneaux
      const rValInt = Math.max(1, rValExt - Math.max(epaisVal > 0 ? 1.5 : 0, rExt * epaisVal))
      const rCentre = Math.max(1, (epaisVal > 0 ? rValInt : rInt) - 0.5)
      const d = this.detache.get(u) ?? 0
      const eclat = d * detacheMax + o * deroulement * rExt * 0.35
      const ecart = ecartSecteurs + o * deroulement * 0.35
      const survole = u === vue.survol
      const coulDom = pal.domaines[cat.domaine % pal.domaines.length]!

      ctx.globalAlpha = op * (1 - o) * (1 - o)
      // Disque central (cache les arêtes et les enfants encore rentrés).
      ctx.save()
      if (ombre > 0) {
        ctx.shadowColor = rgba('#101828', 0.18 * ombre)
        ctx.shadowBlur = 10 * ombre + (survole ? 8 : 0)
        ctx.shadowOffsetY = 2 * ombre
      }
      ctx.fillStyle = pal.fond
      ctx.beginPath()
      ctx.arc(cx, cy, rInt + 0.5, 0, TAU)
      ctx.fill()
      ctx.restore()
      if (teinte > 0) {
        ctx.fillStyle = rgba(coulDom, teinte)
        ctx.beginPath()
        ctx.arc(cx, cy, rCentre, 0, TAU)
        ctx.fill()
      }

      // Segments (statuts, puis validation).
      const segments: Segment[] = []
      const total = this.total[ci]!, act = this.actives[ci]!
      const denom = estomper ? total : Math.max(1, act)
      const repartir = (anneau: Anneau, cles: readonly string[], comptes: Int32Array, base: number) => {
        let a = -Math.PI / 2
        const liste: { cle: string; n: number }[] = cles.map((k, i) => ({ cle: k, n: comptes[base + i]! }))
        if (estomper && total > act) liste.push({ cle: 'hors', n: total - act })
        const nonVides = liste.filter((x) => x.n > 0)
        const gap = nonVides.length > 1 ? ecart : 0
        for (const x of nonVides) {
          const da = (TAU * x.n) / Math.max(1, denom)
          segments.push({ anneau, cle: x.cle, n: x.n, a0: a + gap / 2, a1: a + Math.max(gap / 2 + 0.001, da - gap / 2) })
          a += da
        }
      }
      repartir('statut', STATUTS, this.statuts, ci * 3)
      if (epaisVal > 0) repartir('validation', VALIDATIONS, this.validations, ci * 4)
      if (!segments.length) {
        ctx.strokeStyle = rgba(pal.texteDoux, 0.35)
        ctx.lineWidth = ep
        ctx.beginPath()
        ctx.arc(cx, cy, rExt - ep / 2, 0, TAU)
        ctx.stroke()
      }

      const sec = this.secteur && this.secteur.u === u ? this.secteur : null
      for (const s of segments) {
        const mid = (s.a0 + s.a1) / 2
        const actif = sec && sec.anneau === s.anneau && sec.cle === s.cle
        const ex = eclat + (actif ? 3 : 0)
        const ox = Math.cos(mid) * ex, oy = Math.sin(mid) * ex
        const couleur = s.cle === 'hors' ? pal.texteDoux : s.anneau === 'statut' ? pal.statut[s.cle as Statut] : pal.validation[s.cle as Validation]
        const alphaSeg = s.cle === 'hors' ? 0.25 : sec && !actif ? 0.35 : 1
        ctx.globalAlpha = op * alphaSeg
        ctx.fillStyle = couleur
        const r0 = s.anneau === 'statut' ? rInt : rValInt
        const r1 = s.anneau === 'statut' ? rExt + (actif ? 2 : 0) : rValExt
        ctx.beginPath()
        ctx.arc(cx + ox, cy + oy, r1, s.a0, s.a1)
        ctx.arc(cx + ox, cy + oy, r0, s.a1, s.a0, true)
        ctx.closePath()
        ctx.fill()
      }
      ctx.globalAlpha = op

      // Lignée : jauge extérieure (part des feuilles ancêtres / descendantes / sélection).
      if (lignee.active) {
        const nb = Math.max(1, cat.feuilles.length)
        const parts: [number, string][] = [
          [lignee.nbGraines[ci]!, pal.accent],
          [lignee.nbAncetres[ci]!, pal.ancetre],
          [lignee.nbDescendants[ci]!, pal.descendant],
        ]
        let a = -Math.PI / 2
        const rj = rExt + eclat + 4
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        for (const [n, coul] of parts) {
          if (!n) continue
          const da = Math.max(0.08, (TAU * n) / nb)
          ctx.strokeStyle = coul
          ctx.beginPath()
          ctx.arc(cx, cy, rj, a, a + da)
          ctx.stroke()
          a += da
        }
        ctx.lineCap = 'butt'
      }

      // Nom et effectif au centre (ou sous l'anneau si trop petit).
      const alphaTexte = clamp(1 - o * 2.5, 0, 1)
      if (alphaTexte > 0.02) {
        ctx.globalAlpha = op * alphaTexte
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const effectif = estomper && act !== total ? `${act}/${total}` : String(act)
        const place = rCentre * 1.8
        // Le nom va au centre s'il y tient sans ellipse, sinon sous l'anneau.
        let lignes: string[] | null = null
        const fN = clamp(rCentre * 0.3, 8.5, tailleNom)
        if (nomCentre && rCentre >= 17) {
          ctx.font = `600 ${fN}px ${pal.police}`
          lignes = couper(ctx, cat.nom, place * 0.92, rCentre > 26 ? 2 : 1)
          if (lignes.some((l) => l.endsWith('…'))) lignes = null
        }
        if (lignes) {
          const fE = clamp(rCentre * 0.42, 10, tailleNom + 5)
          const hTot = lignes.length * fN * 1.15 + fE
          let y = cy - hTot / 2 + fN * 0.575
          ctx.fillStyle = pal.texte
          for (const l of lignes) {
            ctx.fillText(l, cx, y)
            y += fN * 1.15
          }
          ctx.font = `500 ${fE}px ${pal.police}`
          ctx.fillStyle = pal.texteDoux
          ctx.fillText(effectif, cx, y + fE * 0.45 - fN * 0.1)
        } else {
          if (rCentre >= 6) {
            const fE = clamp(rCentre * 0.55, 8, 16)
            ctx.font = `600 ${fE}px ${pal.police}`
            ctx.fillStyle = pal.texte
            ctx.fillText(effectif, cx, cy + 0.5)
          }
          if (nomCentre && (rExt >= seuilNom || survole)) {
            ctx.font = `600 ${Math.min(tailleNom, 11)}px ${pal.police}`
            const t = couper(ctx, cat.nom, 160, 1)[0]!
            etiquettes.push({ x: cx, y: cy + rExt + eclat + 4, texte: t, l: ctx.measureText(t).width, priorite: survole ? 1e9 : rExt, alpha: op * alphaTexte })
          }
        }
      }
      this.geo.set(u, { cx, cy, rExt, rInt, rValExt, rValInt, eclat, segments })
    }
    ctx.restore()

    this.dessinerEtiquettes(ctx, pal, etiquettes, Math.min(tailleNom, 11))
    this.dessinerApercu(c)
    this.dessinerBulle(c)
  }

  /** Noms sous les anneaux, des plus gros aux plus petits, sans chevauchement. */
  private dessinerEtiquettes(ctx: CanvasRenderingContext2D, pal: VueGraphe['palette'], liste: { x: number; y: number; texte: string; l: number; priorite: number; alpha: number }[], taille: number): void {
    liste.sort((a, b) => b.priorite - a.priorite)
    const poses: [number, number, number, number][] = []
    ctx.save()
    ctx.font = `600 ${taille}px ${pal.police}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3.5
    for (const e of liste) {
      const r: [number, number, number, number] = [e.x - e.l / 2 - 3, e.y - 1, e.x + e.l / 2 + 3, e.y + taille + 3]
      if (e.priorite < 1e9 && poses.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) continue
      poses.push(r)
      ctx.globalAlpha = e.alpha
      ctx.strokeStyle = pal.fond
      ctx.strokeText(e.texte, e.x, e.y)
      ctx.fillStyle = pal.texte
      ctx.fillText(e.texte, e.x, e.y)
    }
    ctx.restore()
  }

  /** Rayon où placer la bulle (au-delà de l'aperçu éventuel). */
  private rayonBulle = 0

  /**
   * Aperçu des feuilles repliées du secteur survolé : une « graine » par nœud, rangée en arcs
   * concentriques à l'extérieur du secteur (on compte d'un coup d'œil). La couleur des graines
   * donne l'autre dimension (validation pour un secteur de statut, et inversement).
   */
  private dessinerApercu({ ctx, vue }: ContexteDessin): void {
    const s = this.secteur
    const geo = s ? this.geo.get(s.u) : undefined
    this.rayonBulle = geo ? geo.rExt + geo.eclat + 14 : 0
    if (!s || !geo || !this.R.lire<boolean>('apercuSecteur') || s.cle === 'hors') return
    const seg = geo.segments.find((x) => x.anneau === s.anneau && x.cle === s.cle)
    if (!seg) return
    const { h, palette: pal, granularite: g } = vue
    const caches = [...this.feuillesSecteur].filter((f) => g.alpha[f]! <= 0.3)
    if (!caches.length) return
    const autre = (f: number) => (s.anneau === 'statut' ? VALIDATIONS.indexOf(h.noeuds[f]!.validation) : STATUTS.indexOf(h.noeuds[f]!.statut))
    caches.sort((a, b) => autre(b) - autre(a) || h.dates[a]! - h.dates[b]!)
    const pas = 7.5, rPoint = 2.6
    const mid = (seg.a0 + seg.a1) / 2
    const demiArc = Math.max(0.18, (seg.a1 - seg.a0) / 2)
    let r = geo.rExt + geo.eclat + 9
    let i = 0
    ctx.save()
    ctx.lineWidth = 1
    while (i < caches.length && i < 400) {
      const cap = Math.max(3, Math.floor((2 * demiArc * r) / pas))
      const nLigne = Math.min(cap, caches.length - i)
      const span = ((nLigne - 1) * pas) / r
      for (let k = 0; k < nLigne; k++, i++) {
        const f = caches[i]!
        const a = mid - span / 2 + (nLigne > 1 ? (span * k) / (nLigne - 1) : 0)
        const n = h.noeuds[f]!
        ctx.fillStyle = s.anneau === 'statut' ? pal.validation[n.validation] : pal.statut[n.statut]
        ctx.strokeStyle = pal.fond
        ctx.beginPath()
        ctx.arc(geo.cx + Math.cos(a) * r, geo.cy + Math.sin(a) * r, rPoint, 0, TAU)
        ctx.fill()
        ctx.stroke()
      }
      r += pas
    }
    ctx.restore()
    this.rayonBulle = r + 8
  }

  /** Bulle « 23 incertains » près du secteur survolé. */
  private dessinerBulle({ ctx, vue }: ContexteDessin): void {
    const s = this.secteur
    const geo = s ? this.geo.get(s.u) : undefined
    if (!s || !geo) return
    const seg = geo.segments.find((x) => x.anneau === s.anneau && x.cle === s.cle)
    if (!seg) return
    const pal = vue.palette
    const mid = (seg.a0 + seg.a1) / 2
    const r = Math.max(this.rayonBulle, geo.rExt + geo.eclat + 14)
    const x = geo.cx + Math.cos(mid) * r, y = geo.cy + Math.sin(mid) * r
    const total = Math.max(1, this.actives[s.u - vue.h.nF]!)
    const texte = libelleSecteur(s)
    const sous = s.cle === 'hors' ? '' : `${formaterNombre(Math.round((1000 * s.n) / total) / 10)} %`
    ctx.save()
    ctx.font = `600 12px ${pal.police}`
    const l1 = ctx.measureText(texte).width
    ctx.font = `500 11px ${pal.police}`
    const l2 = sous ? ctx.measureText(sous).width + 8 : 0
    const w = l1 + l2 + 22, hgt = 24
    const droite = Math.cos(mid) >= -0.2
    const bx = droite ? x : x - w, by = y - hgt / 2
    const coul = s.cle === 'hors' ? pal.texteDoux : s.anneau === 'statut' ? pal.statut[s.cle as Statut] : pal.validation[s.cle as Validation]
    ctx.shadowColor = rgba('#101828', 0.16)
    ctx.shadowBlur = 10
    ctx.shadowOffsetY = 2
    ctx.fillStyle = pal.fond
    ctx.beginPath()
    ctx.roundRect(bx, by, w, hgt, 12)
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.strokeStyle = rgba(coul, 0.6)
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = coul
    ctx.beginPath()
    ctx.arc(bx + 11, y, 4, 0, TAU)
    ctx.fill()
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillStyle = pal.texte
    ctx.font = `600 12px ${pal.police}`
    ctx.fillText(texte, bx + 19, y + 0.5)
    if (sous) {
      ctx.fillStyle = pal.texteDoux
      ctx.font = `500 11px ${pal.police}`
      ctx.fillText(sous, bx + 19 + l1 + 8, y + 0.5)
    }
    ctx.restore()
  }

  // ─── Violon de confiance d'une feuille ────────────────────────────────────

  dessinerViolon({ ctx, vue, projection }: ContexteDessin, f: number): void {
    const { h, palette: pal } = vue
    const n = h.noeuds[f]
    if (!n || vue.opaciteAffichee[f]! < 0.05) return
    const W = this.R.lire<number>('largeurViolon')
    const H = 9
    const { bas, haut, estimation: est } = n.confiance
    const x0 = projection.x[f]! - W / 2
    // Au-dessus du nœud (la fiche de survol s'ouvre en bas à droite du pointeur) ; dessous si
    // on manque de place en haut de l'écran.
    const r = vue.tailleAffichee[f]!
    let y0 = projection.y[f]! - r - H - 30
    if (y0 - H - 8 < 4) y0 = projection.y[f]! + r + H + 12
    const X = (v: number) => x0 + clamp(v, 0, 1) * W
    const coulS = pal.statut[n.statut]
    const coulV = pal.validation[n.validation]
    ctx.save()
    // Carte support.
    ctx.shadowColor = rgba('#101828', 0.14)
    ctx.shadowBlur = 10
    ctx.shadowOffsetY = 2
    ctx.fillStyle = pal.fond
    ctx.beginPath()
    ctx.roundRect(x0 - 10, y0 - H - 8, W + 20, 2 * H + 30, 8)
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.strokeStyle = rgba(pal.texte, 0.1)
    ctx.lineWidth = 1
    ctx.stroke()
    // Axe [0, 1] et graduations.
    ctx.strokeStyle = rgba(pal.texteDoux, 0.45)
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x0 + W, y0)
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      ctx.moveTo(X(v), y0 - (v === 0 || v === 1 || v === 0.5 ? 3 : 1.5))
      ctx.lineTo(X(v), y0 + (v === 0 || v === 1 || v === 0.5 ? 3 : 1.5))
    }
    ctx.stroke()
    // Violon : densité en cloche entre bas et haut, centrée sur l'estimation.
    const largeur = Math.max(0.004, haut - bas)
    const sigma = largeur / 3.2
    const N = 28
    const pts: [number, number][] = []
    for (let i = 0; i <= N; i++) {
      const v = bas + (largeur * i) / N
      const cote = v < est ? Math.max(1e-3, est - bas) : Math.max(1e-3, haut - est)
      const z = (v - est) / Math.max(sigma, cote / 2.2)
      const fenetre = Math.pow(Math.sin((Math.PI * i) / N), 0.35)
      pts.push([X(v), H * Math.exp(-0.5 * z * z) * fenetre + 0.8])
    }
    const chemin = new Path2D()
    chemin.moveTo(pts[0]![0], y0)
    for (const [x, dy] of pts) chemin.lineTo(x, y0 - dy)
    for (let i = pts.length - 1; i >= 0; i--) chemin.lineTo(pts[i]![0], y0 + pts[i]![1])
    chemin.closePath()
    ctx.fillStyle = rgba(coulS, 0.42)
    ctx.fill(chemin)
    // Bordure = validation : pointillés (aucune), fine (IA), moyenne (humain), double (IA + humain).
    ctx.strokeStyle = n.validation === 'aucune' ? rgba(pal.texteDoux, 0.8) : coulV
    ctx.setLineDash(n.validation === 'aucune' ? [2, 2] : [])
    ctx.lineWidth = n.validation === 'ia' ? 1.1 : n.validation === 'humain' ? 1.7 : n.validation === 'ia_humain' ? 3 : 1
    ctx.stroke(chemin)
    if (n.validation === 'ia_humain') {
      ctx.strokeStyle = pal.fond
      ctx.lineWidth = 0.9
      ctx.stroke(chemin)
    }
    ctx.setLineDash([])
    // Estimation.
    ctx.strokeStyle = coulS
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(X(est), y0 - H - 2)
    ctx.lineTo(X(est), y0 + H + 2)
    ctx.stroke()
    // Texte.
    ctx.font = `500 10.5px ${pal.police}`
    ctx.textBaseline = 'top'
    ctx.fillStyle = pal.texteDoux
    ctx.textAlign = 'left'
    ctx.fillText('0', x0 - 3, y0 + H + 4)
    ctx.textAlign = 'right'
    ctx.fillText('1', x0 + W + 3, y0 + H + 4)
    ctx.textAlign = 'center'
    ctx.fillStyle = pal.texte
    ctx.font = `600 10.5px ${pal.police}`
    ctx.fillText(`${formaterNombre(est)}  [${formaterNombre(bas)} – ${formaterNombre(haut)}]`, x0 + W / 2, y0 + H + 4)
    ctx.restore()
  }
}

/** Coupe un texte en au plus `max` lignes de largeur `l` (ellipse sur la dernière). */
function couper(ctx: CanvasRenderingContext2D, texte: string, l: number, max: number): string[] {
  const mots = texte.split(/\s+/)
  const lignes: string[] = []
  let cour = ''
  for (const m of mots) {
    const essai = cour ? `${cour} ${m}` : m
    if (ctx.measureText(essai).width <= l || !cour) cour = essai
    else {
      lignes.push(cour)
      cour = m
    }
  }
  if (cour) lignes.push(cour)
  if (lignes.length > max) {
    lignes.length = max
    lignes[max - 1] = `${lignes[max - 1]}…`
  }
  return lignes.map((x) => {
    if (ctx.measureText(x).width <= l) return x
    let t = x.replace(/…$/, '')
    while (t.length > 1 && ctx.measureText(`${t}…`).width > l) t = t.slice(0, -1)
    return `${t}…`
  })
}

