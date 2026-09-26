// Calques cartographiques de la variante V2 :
//   dessous : feuille (quadrillage + cadre en damier), territoires (champ de densité → isolignes
//             lissées), courbes de niveau, halos de confiance ;
//   dessus  : toponymes en capitales espacées.
//
// Principe des territoires : chaque feuille dépose un noyau compact (1 − d²/R²)² sur une grille
// écran, dans le champ de chacune des catégories de sa chaîne qui sont « exposées » (leur parent
// est au moins un peu ouvert). Le territoire d'une catégorie est l'isoligne F = seuil, extraite
// par marching squares puis lissée (courbes quadratiques par les milieux).
// Quand un parent s'ouvre (t : 0 → 1), le champ dessiné pour un enfant est (1 − t)·F_parent + t·F_enfant :
// à t = 0 chaque enfant a exactement la forme du parent, puis il se rétracte vers la sienne —
// le territoire « se fend ». Au repli, le mouvement s'inverse.

import {
  COURBES, Projection, Z_MAX, clamp, melangerCouleurs, rgb, rgba, statistiquesCategorie, STATUTS,
  type ContexteDessin, type Statut, type VueGraphe,
} from '../../src/core'

/** Échantillons du champ d'une catégorie sur sa boîte englobante (indices de la grille écran). */
interface Champ {
  i0: number
  j0: number
  i1: number
  j1: number
  nx: number
  data: Float32Array
  utilise: boolean
}

interface Contour {
  chemin: Path2D
  xmin: number
  xmax: number
  ymin: number
  ymax: number
  ok: boolean
}

interface Toponyme {
  cat: number
  x: number
  y: number
  alpha: number
  lignes: string[]
  taille: number
  niveau: number
}

/** Rotation de teinte (degrés) et décalage de luminosité d'une couleur. */
function nuancer(couleur: string, dh: number, dl: number): string {
  const [r, g, b] = rgb(couleur).map((v) => v / 255) as [number, number, number]
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h /= 6
  }
  h = (((h + dh / 360) % 1) + 1) % 1
  const l2 = clamp(l + dl, 0.08, 0.92)
  const q = l2 < 0.5 ? l2 * (1 + s) : l2 + s - l2 * s
  const p = 2 * l2 - q
  const f = (t: number) => {
    t = ((t % 1) + 1) % 1
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p
  }
  const hx = (v: number) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')
  return `#${hx(f(h + 1 / 3))}${hx(f(h))}${hx(f(h - 1 / 3))}`
}

/** Pas « rond » (1, 2, 5 × 10ⁿ) proche de v. */
function pasJoli(v: number): number {
  const e = Math.pow(10, Math.floor(Math.log10(v)))
  const m = v / e
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e
}

/** Coupe un nom long en deux lignes au blanc le plus proche du milieu. */
function couper(nom: string, max = 18): string[] {
  const t = nom.toUpperCase()
  if (t.length <= max) return [t]
  const milieu = t.length / 2
  let meilleur = -1
  for (let i = 0; i < t.length; i++) if (t[i] === ' ' && (meilleur < 0 || Math.abs(i - milieu) < Math.abs(meilleur - milieu))) meilleur = i
  return meilleur < 0 ? [t] : [t.slice(0, meilleur), t.slice(meilleur + 1)]
}

export class Carte {
  /** Projection des positions « cibles » (avant granularité) : le terrain ne bouge pas quand on agrège. */
  readonly proj: Projection
  /** Largeur écran (px) du territoire dessiné de chaque catégorie (0 si absent). */
  readonly largeurTerritoire: Float32Array
  /** Teinte de remplissage, de trait et de texte par catégorie. */
  teintes: string[] = []
  teintesTrait: string[] = []
  teintesTexte: string[] = []
  /** Catégories mises en avant (survol, lignée) ; null = pas de restriction. */
  relies: Uint8Array | null = null
  /** Statistiques de confiance par catégorie : parts de statut et largeur moyenne d'intervalle. */
  private confAgregats: { parts: Record<Statut, number>; largeur: number }[] = []

  private champs: Champ[]
  private etendue: Int32Array
  private rayons: Float32Array
  private besoin: Uint8Array
  private pas = 8
  /** Multiplicateur du pas de grille (qualité adaptative, ≥ 1). */
  qualite = 1
  private tampon = new Float32Array(0)
  private suivant = new Int32Array(0)
  private vu = new Uint8Array(0)
  private departs: number[] = []
  private points: number[] = []
  private sprites = new Map<string, HTMLCanvasElement>()
  private toponymes: Toponyme[] = []

  constructor(private vue: VueGraphe) {
    const { h } = vue
    this.proj = new Projection(h.nU)
    this.largeurTerritoire = new Float32Array(h.nC)
    this.champs = h.categories.map(() => ({ i0: 0, j0: 0, i1: -1, j1: -1, nx: 0, data: new Float32Array(0), utilise: false }))
    this.etendue = new Int32Array(h.nF * 4)
    this.rayons = new Float32Array(h.nF)
    this.besoin = new Uint8Array(h.nC)
    this.calculerTeintes()
    this.calculerConfianceAgregats()
    vue.on('theme', () => {
      this.sprites.clear()
      this.calculerTeintes()
    })
    vue.on('filtres', () => this.calculerConfianceAgregats())
  }

  private lire<T extends number | boolean | string>(cle: string): T {
    return this.vue.reglages.lire<T>(cle)
  }

  /** Teintes par catégorie : les thèmes d'un domaine sont des voisins de teinte, idem sous-thèmes. */
  calculerTeintes(): void {
    const { h, palette } = this.vue
    const t: string[] = []
    for (const c of h.categories) {
      if (c.niveau === 0) {
        t[c.index] = palette.domaines[c.domaine % palette.domaines.length]!
        continue
      }
      const freres = h.categories[c.parent]!.enfants
      const k = freres.indexOf(c.index), n = freres.length
      const ecart = c.niveau === 1 ? 26 : 12
      const dh = n > 1 ? ((k - (n - 1) / 2) / ((n - 1) / 2)) * ecart : 0
      const dl = (k % 2 ? 0.05 : -0.035) * (c.niveau === 1 ? 1 : 0.8)
      t[c.index] = nuancer(t[c.parent]!, dh, dl)
    }
    this.teintes = t
    this.teintesTrait = t.map((x) => melangerCouleurs(x, palette.texte, 0.28))
    this.teintesTexte = t.map((x) => melangerCouleurs(x, palette.texte, 0.55))
  }

  private calculerConfianceAgregats(): void {
    const { h, filtres } = this.vue
    this.confAgregats = h.categories.map((c) => {
      const s = statistiquesCategorie(h, c.index, filtres.actives)
      let somme = 0, n = 0
      for (const f of c.feuilles) {
        if (!filtres.actives[f]) continue
        const k = h.noeuds[f]!.confiance
        somme += k.haut - k.bas
        n++
      }
      const tot = Math.max(1, s.nbActives)
      return {
        parts: { valide: s.statuts.valide / tot, incertain: s.statuts.incertain / tot, refute: s.statuts.refute / tot },
        largeur: n ? somme / n : 0,
      }
    })
  }

  /** Atténuation des territoires hors vue de dessus (la carte est une vue « thématique »). */
  private facteurVue(): number {
    const v = this.vue
    const k = this.lire<number>('territoiresHorsDessus')
    if (v.reglages.valeurs.mode3D === 'cube') return k
    return k + (1 - k) * v.poidsFaces[0]!
  }

  // ─── Calque dessous ────────────────────────────────────────────────────────

  dessinerDessous(c: ContexteDessin): void {
    const { ctx, vue, largeur: W, hauteur: H } = c
    vue.camera.projeter(vue.positionsBase, this.proj)
    this.largeurTerritoire.fill(0)
    if (this.lire<boolean>('graticule') || this.lire<boolean>('cadre')) this.dessinerFeuille(ctx, W, H)
    const terr = this.lire<boolean>('territoires'), courbes = this.lire<boolean>('courbes'), topo = this.lire<boolean>('toponymes')
    if (terr || courbes || topo) {
      const t0 = performance.now()
      this.calculerChamps(W, H)
      const fVue = this.facteurVue()
      this.dessinerTerritoires(ctx, fVue, terr)
      if (courbes) this.dessinerCourbes(ctx, fVue)
      // Qualité adaptative : si la carte coûte plus que le budget, la grille s'élargit (et inversement).
      const cout = performance.now() - t0
      const budget = this.lire<number>('budgetCarte')
      if (cout > budget) this.qualite = Math.min(3, this.qualite * 1.12)
      else if (cout < budget * 0.45) this.qualite = Math.max(1, this.qualite / 1.06)
    }
    if (this.lire<boolean>('halo')) this.dessinerHalos(ctx)
  }

  /** Quadrillage adaptatif et cadre de feuille en damier, sur le plan Z = sol. */
  private dessinerFeuille(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const { camera: cam, palette } = this.vue
    const z = -Z_MAX - 0.05
    const B = 1.1
    const p = (x: number, y: number) => cam.projeterPoint([x, y, z])
    ctx.save()
    if (this.lire<boolean>('graticule')) {
      const visible = Math.max(W, H) / cam.pixelsParUnite()
      const pas = pasJoli(visible / 9)
      const op = this.lire<number>('opaciteGraticule')
      const n0 = Math.ceil(-B / pas), n1 = Math.floor(B / pas)
      if (n1 - n0 < 400) {
        const mineur = new Path2D(), majeur = new Path2D()
        for (let n = n0; n <= n1; n++) {
          const v = n * pas
          const chemin = n % 5 === 0 ? majeur : mineur
          for (const [a, b] of [[p(v, -B), p(v, B)], [p(-B, v), p(B, v)]] as const) {
            if (!a.visible || !b.visible) continue
            chemin.moveTo(a.x, a.y)
            chemin.lineTo(b.x, b.y)
          }
        }
        ctx.lineWidth = 0.6
        ctx.strokeStyle = rgba(palette.texte, op)
        ctx.stroke(mineur)
        ctx.lineWidth = 0.9
        ctx.strokeStyle = rgba(palette.texte, op * 1.7)
        ctx.stroke(majeur)
      }
    }
    if (this.lire<boolean>('cadre')) {
      const e = 0.016
      const coins = [p(-B, -B), p(B, -B), p(B, B), p(-B, B)]
      const ext = [p(-B - e, -B - e), p(B + e, -B - e), p(B + e, B + e), p(-B - e, B + e)]
      if (coins.every((q) => q.visible) && ext.every((q) => q.visible)) {
        // Damier : segments alternés entre la ligne de cadre intérieure et extérieure.
        const damier = new Path2D()
        const segs = 22
        const cotes: [number, number, number, number][] = [[-B, -B, 1, 0], [B, -B, 0, 1], [B, B, -1, 0], [-B, B, 0, -1]]
        cotes.forEach(([x0, y0, dx, dy], ci) => {
          const L = 2 * B / segs
          // normale extérieure
          const nx = dy, ny = -dx
          for (let s = ci % 2; s < segs; s += 2) {
            const ax = x0 + dx * L * s, ay = y0 + dy * L * s
            const bx = ax + dx * L, by = ay + dy * L
            const q = [p(ax, ay), p(bx, by), p(bx + nx * e, by + ny * e), p(ax + nx * e, ay + ny * e)]
            damier.moveTo(q[0]!.x, q[0]!.y)
            for (let i = 1; i < 4; i++) damier.lineTo(q[i]!.x, q[i]!.y)
            damier.closePath()
          }
        })
        ctx.fillStyle = rgba(palette.texte, 0.38)
        ctx.fill(damier)
        ctx.lineWidth = 0.8
        ctx.strokeStyle = rgba(palette.texte, 0.5)
        for (const q of [coins, ext]) {
          ctx.beginPath()
          q.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)))
          ctx.closePath()
          ctx.stroke()
        }
      }
    }
    ctx.restore()
  }

  /** Remplit les champs de densité des catégories exposées (grille écran de pas adaptatif). */
  private calculerChamps(W: number, H: number): void {
    const { h, granularite: g, filtres, camera } = this.vue
    const P = this.proj
    const Rpx = this.lire<number>('douceur') * camera.pixelsParUnite()
    const pas = (this.pas = clamp(Math.round((Rpx / this.lire<number>('finesse')) * this.qualite), 3, 64))
    const NX = Math.ceil(W / pas), NY = Math.ceil(H / pas)
    const besoin = this.besoin
    for (const c of h.categories) {
      besoin[c.index] = c.niveau === 0 || g.ouverture[c.parent]! > 0.002 ? 1 : 0
      const ch = this.champs[c.index]!
      ch.utilise = false
      ch.i0 = ch.j0 = 1e9
      ch.i1 = ch.j1 = -1
    }
    const masquer = filtres.etat.mode === 'masquer'
    const E = this.etendue
    for (let f = 0; f < h.nF; f++) {
      E[f * 4 + 2] = -1
      if ((masquer && !filtres.actives[f]) || !P.visible[f]) continue
      const r = Rpx * P.echelle[f]!
      const x = P.x[f]!, y = P.y[f]!
      const ia = Math.max(0, Math.ceil((x - r) / pas)), ib = Math.min(NX, Math.floor((x + r) / pas))
      const ja = Math.max(0, Math.ceil((y - r) / pas)), jb = Math.min(NY, Math.floor((y + r) / pas))
      if (ia > ib || ja > jb) continue
      E[f * 4] = ia
      E[f * 4 + 1] = ja
      E[f * 4 + 2] = ib
      E[f * 4 + 3] = jb
      this.rayons[f] = r
      for (let k = 0; k < 3; k++) {
        const c = h.chaine[f * 3 + k]!
        if (!besoin[c]) continue
        const ch = this.champs[c]!
        if (ia < ch.i0) ch.i0 = ia
        if (ib > ch.i1) ch.i1 = ib
        if (ja < ch.j0) ch.j0 = ja
        if (jb > ch.j1) ch.j1 = jb
      }
    }
    for (const ch of this.champs) {
      if (ch.i1 < ch.i0) continue
      ch.nx = ch.i1 - ch.i0 + 1
      const n = ch.nx * (ch.j1 - ch.j0 + 1)
      if (ch.data.length < n) ch.data = new Float32Array(Math.ceil(n * 1.3))
      else ch.data.fill(0, 0, n)
      ch.utilise = true
    }
    const cibles: Champ[] = []
    const inv: number[] = []
    const res = this.lire<number>('resserrement')
    const invNiveau = [1, 1 / (res * res), 1 / Math.pow(res, 4)]
    for (let f = 0; f < h.nF; f++) {
      const ib = E[f * 4 + 2]!
      if (ib < 0) continue
      const ia = E[f * 4]!, ja = E[f * 4 + 1]!, jb = E[f * 4 + 3]!
      cibles.length = 0
      inv.length = 0
      for (let k = 0; k < 3; k++) {
        const c = h.chaine[f * 3 + k]!
        if (!besoin[c]) continue
        cibles.push(this.champs[c]!)
        inv.push(invNiveau[k]!)
      }
      const r = this.rayons[f]!, r2 = r * r
      const x = P.x[f]!, y = P.y[f]!
      for (let j = ja; j <= jb; j++) {
        const dy = j * pas - y
        const dy2 = dy * dy
        if (dy2 >= r2) continue
        for (let i = ia; i <= ib; i++) {
          const dx = i * pas - x
          const q = (dx * dx + dy2) / r2
          if (q >= 1) continue
          // Rayon resserré pour les niveaux fins : les sous-territoires se séparent mieux.
          for (let k = 0; k < cibles.length; k++) {
            const qk = q * inv[k]!
            if (qk >= 1) continue
            const ch = cibles[k]!
            ch.data[(j - ch.j0) * ch.nx + (i - ch.i0)] += (1 - qk) * (1 - qk)
          }
        }
      }
    }
  }

  /** Remplit le tampon (avec une marge nulle d'un échantillon) : (1 − t)·a + t·b sur la boîte de a. */
  private remplir(a: Champ, b: Champ | null, t: number): { w: number; hh: number; i0: number; j0: number } {
    const w = a.nx + 2, hh = a.j1 - a.j0 + 3
    const n = w * hh
    if (this.tampon.length < n) this.tampon = new Float32Array(Math.ceil(n * 1.3))
    const v = this.tampon
    v.fill(0, 0, n)
    const wa = b ? 1 - t : 1
    const ny = a.j1 - a.j0 + 1
    for (let j = 0; j < ny; j++) {
      const src = j * a.nx, dst = (j + 1) * w + 1
      for (let i = 0; i < a.nx; i++) v[dst + i] = a.data[src + i]! * wa
    }
    if (b && b.utilise) {
      const nyb = b.j1 - b.j0 + 1
      for (let j = 0; j < nyb; j++) {
        const src = j * b.nx, dst = (b.j0 - a.j0 + j + 1) * w + (b.i0 - a.i0 + 1)
        for (let i = 0; i < b.nx; i++) v[dst + i] += b.data[src + i]! * t
      }
    }
    return { w, hh, i0: a.i0 - 1, j0: a.j0 - 1 }
  }

  /**
   * Marching squares orienté sur le tampon (w × hh), segments chaînés en boucles fermées, lissées.
   * Orientation cohérente : chaque arête d'intersection a un seul successeur.
   */
  private marcher(w: number, hh: number, i0: number, j0: number, s: number): Contour {
    const nAretes = 2 * w * hh
    if (this.suivant.length < nAretes) {
      this.suivant = new Int32Array(Math.ceil(nAretes * 1.3)).fill(-1)
      this.vu = new Uint8Array(this.suivant.length)
    }
    const v = this.tampon, suiv = this.suivant, vu = this.vu, departs = this.departs
    departs.length = 0
    const lier = (a: number, b: number) => {
      suiv[a] = b
      departs.push(a)
    }
    for (let jj = 0; jj < hh - 1; jj++) {
      const ligne = jj * w
      for (let ii = 0; ii < w - 1; ii++) {
        const n = ligne + ii
        const tl = v[n]!, tr = v[n + 1]!, bl = v[n + w]!, br = v[n + w + 1]!
        const cas = (tl >= s ? 8 : 0) | (tr >= s ? 4 : 0) | (br >= s ? 2 : 0) | (bl >= s ? 1 : 0)
        if (cas === 0 || cas === 15) continue
        const T = 2 * n, B = 2 * (n + w), L = 2 * n + 1, R = 2 * (n + 1) + 1
        switch (cas) {
          case 8: lier(L, T); break
          case 4: lier(T, R); break
          case 2: lier(R, B); break
          case 1: lier(B, L); break
          case 12: lier(L, R); break
          case 6: lier(T, B); break
          case 3: lier(R, L); break
          case 9: lier(B, T); break
          case 7: lier(T, L); break
          case 11: lier(R, T); break
          case 13: lier(B, R); break
          case 14: lier(L, B); break
          case 10:
            if ((tl + tr + bl + br) / 4 >= s) { lier(R, T); lier(L, B) } else { lier(L, T); lier(R, B) }
            break
          case 5:
            if ((tl + tr + bl + br) / 4 >= s) { lier(T, L); lier(B, R) } else { lier(T, R); lier(B, L) }
            break
        }
      }
    }
    const pas = this.pas
    const chemin = new Path2D()
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity
    const pts = this.points
    for (const a of departs) {
      if (vu[a]) continue
      pts.length = 0
      let cur = a
      while (cur >= 0 && !vu[cur]) {
        vu[cur] = 1
        const n = cur >> 1
        const ii = n % w, jj = (n - ii) / w
        let x: number, y: number
        if (cur & 1) {
          const va = v[n]!, vb = v[n + w]!
          x = ii
          y = jj + (s - va) / (vb - va)
        } else {
          const va = v[n]!, vb = v[n + 1]!
          x = ii + (s - va) / (vb - va)
          y = jj
        }
        x = (x + i0) * pas
        y = (y + j0) * pas
        pts.push(x, y)
        if (x < xmin) xmin = x
        if (x > xmax) xmax = x
        if (y < ymin) ymin = y
        if (y > ymax) ymax = y
        cur = suiv[cur]!
      }
      const m = pts.length / 2
      if (m < 3) continue
      // Lissage : courbes quadratiques passant par les milieux des segments.
      const mx = (i: number) => (pts[(i % m) * 2]! + pts[((i + 1) % m) * 2]!) / 2
      const my = (i: number) => (pts[(i % m) * 2 + 1]! + pts[((i + 1) % m) * 2 + 1]!) / 2
      chemin.moveTo(mx(m - 1), my(m - 1))
      for (let i = 0; i < m; i++) chemin.quadraticCurveTo(pts[i * 2]!, pts[i * 2 + 1]!, mx(i), my(i))
      chemin.closePath()
    }
    for (const a of departs) {
      suiv[a] = -1
      vu[a] = 0
    }
    return { chemin, xmin, xmax, ymin, ymax, ok: xmax > xmin }
  }

  private contour(a: Champ, b: Champ | null, t: number, seuil: number): Contour {
    const r = this.remplir(a, b, t)
    return this.marcher(r.w, r.hh, r.i0, r.j0, seuil)
  }

  private dessinerTerritoires(ctx: CanvasRenderingContext2D, fVue: number, dessiner: boolean): void {
    const { h, granularite: g } = this.vue
    const A = this.lire<number>('opaciteTerritoires') * fVue
    const seuil = this.lire<number>('seuilTerritoire')
    const epais = this.lire<number>('epaisseurCote')
    const courbe = COURBES[this.vue.reglages.valeurs.courbe] ?? COURBES.douce
    const relies = this.relies
    ctx.save()
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    for (const niveau of [0, 1, 2] as const) {
      for (const c of h.categories) {
        if (c.niveau !== niveau) continue
        const ch = this.champs[c.index]!
        if (!ch.utilise) continue
        let t = 1
        let contour: Contour
        if (niveau === 0) contour = this.contour(ch, null, 0, seuil)
        else {
          t = courbe(clamp(g.ouverture[c.parent]!, 0, 1))
          if (t < 0.01) continue
          const parent = this.champs[c.parent]!
          contour = t >= 0.999 || !parent.utilise ? this.contour(ch, null, 0, seuil) : this.contour(parent, ch, t, seuil)
        }
        if (!contour.ok) continue
        this.largeurTerritoire[c.index] = contour.xmax - contour.xmin
        if (!dessiner) continue
        const mis = relies && !relies[c.index] ? 0.3 : 1
        const propre = niveau < 2 ? g.ouverture[c.index]! : 0
        ctx.fillStyle = rgba(this.teintes[c.index]!, A * t * t * (1 - 0.55 * propre) * mis)
        ctx.fill(contour.chemin, 'evenodd')
        if (epais <= 0) continue
        const trait = this.teintesTrait[c.index]!
        if (niveau === 0) {
          ctx.setLineDash([])
          ctx.lineWidth = epais * 1.25
          ctx.strokeStyle = rgba(trait, 0.6 * fVue * mis)
        } else if (niveau === 1) {
          ctx.setLineDash([6, 3.5])
          ctx.lineWidth = epais
          ctx.strokeStyle = rgba(trait, 0.55 * t * fVue * mis)
        } else {
          ctx.setLineDash([0.1, 3.2])
          ctx.lineWidth = epais * 1.5
          ctx.strokeStyle = rgba(trait, 0.55 * t * fVue * mis)
        }
        ctx.stroke(contour.chemin)
      }
    }
    ctx.restore()
  }

  /** Courbes de niveau de densité (par domaine), une courbe maîtresse toutes les quatre. */
  private dessinerCourbes(ctx: CanvasRenderingContext2D, fVue: number): void {
    const { h } = this.vue
    const seuil = this.lire<number>('seuilTerritoire')
    const n = this.lire<number>('nbCourbes')
    const rapport = this.lire<number>('rapportCourbes')
    const op = this.lire<number>('opaciteCourbes') * fVue
    ctx.save()
    ctx.lineJoin = 'round'
    for (const d of h.domaines) {
      const ch = this.champs[d]!
      if (!ch.utilise) continue
      const mis = this.relies && !this.relies[d] ? 0.3 : 1
      const r = this.remplir(ch, null, 0)
      for (let m = 1; m <= n; m++) {
        const c = this.marcher(r.w, r.hh, r.i0, r.j0, seuil * Math.pow(rapport, m))
        if (!c.ok) break
        const maitresse = m % 4 === 0
        ctx.lineWidth = maitresse ? 1.15 : 0.7
        ctx.strokeStyle = rgba(this.teintesTrait[d]!, op * mis * (maitresse ? 1.3 : 1))
        ctx.stroke(c.chemin)
      }
    }
    ctx.restore()
  }

  /** Sprite de halo (dégradé radial) par couleur, mis en cache. */
  private sprite(couleur: string): HTMLCanvasElement {
    let s = this.sprites.get(couleur)
    if (s) return s
    s = document.createElement('canvas')
    s.width = s.height = 64
    const c = s.getContext('2d')!
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, rgba(couleur, 0.95))
    g.addColorStop(0.3, rgba(couleur, 0.6))
    g.addColorStop(0.65, rgba(couleur, 0.18))
    g.addColorStop(1, rgba(couleur, 0))
    c.fillStyle = g
    c.fillRect(0, 0, 64, 64)
    this.sprites.set(couleur, s)
    return s
  }

  /**
   * Halo de confiance : rayon = taille + largeur de l'intervalle × k (plus c'est incertain, plus
   * c'est large et diffus), couleur = statut. Agrégats : un halo par statut, au prorata.
   */
  private dessinerHalos(ctx: CanvasRenderingContext2D): void {
    const { h, palette, projection: P } = this.vue
    const op = this.vue.opaciteAffichee, taille = this.vue.tailleAffichee
    const K = this.lire<number>('rayonHalo'), I = this.lire<number>('intensiteHalo')
    if (I <= 0) return
    const sprites = { valide: this.sprite(palette.statut.valide), incertain: this.sprite(palette.statut.incertain), refute: this.sprite(palette.statut.refute) }
    ctx.save()
    for (let f = 0; f < h.nF; f++) {
      const o = op[f]!
      if (o < 0.03 || !P.visible[f]) continue
      const n = h.noeuds[f]!
      const w = n.confiance.haut - n.confiance.bas
      const r = taille[f]! + 2 + w * K
      ctx.globalAlpha = clamp(I * o * (1 - 0.6 * Math.min(1, w * 1.6)), 0, 1)
      ctx.drawImage(sprites[n.statut], P.x[f]! - r, P.y[f]! - r, 2 * r, 2 * r)
    }
    if (this.lire<boolean>('haloAgregats')) {
      for (const c of h.categories) {
        const u = c.unite
        const o = op[u]!
        if (o < 0.03 || !P.visible[u]) continue
        const conf = this.confAgregats[c.index]!
        const r = taille[u]! * 1.15 + 3 + conf.largeur * K * 1.4
        for (const s of STATUTS) {
          const part = conf.parts[s]
          if (part < 0.02) continue
          ctx.globalAlpha = clamp(I * o * part * 0.8, 0, 1)
          ctx.drawImage(sprites[s], P.x[u]! - r, P.y[u]! - r, 2 * r, 2 * r)
        }
      }
    }
    ctx.restore()
  }

  // ─── Calque dessus : toponymes ─────────────────────────────────────────────

  dessinerToponymes(c: ContexteDessin): void {
    if (!this.lire<boolean>('toponymes')) return
    const { ctx, vue, largeur: W, hauteur: H } = c
    const { h, granularite: g, palette } = vue
    const T = this.lire<number>('tailleToponymes')
    const esp = this.lire<number>('espacementToponymes')
    const opG = this.lire<number>('opaciteToponymes') * (0.4 + 0.6 * this.facteurVue())
    const lisibilite = this.lire<number>('lisibiliteToponymes')
    const P = this.proj
    const survol = vue.survol !== null
    const liste = this.toponymes
    liste.length = 0
    for (const cat of h.categories) {
      if (g.nbActives[cat.index] === 0) continue
      const u = cat.unite
      if (!P.visible[u]) continue
      const o = g.ouverture[cat.index]!
      let a: number
      if (cat.niveau === 0) a = 1 - 0.8 * o
      else a = g.ouverture[cat.parent]! * (1 - (cat.niveau === 1 ? 0.75 : 0.7) * o)
      if (a < 0.02) continue
      const taille = T * [1.45, 1.1, 0.86][cat.niveau]!
      const lignes = couper(cat.nom, cat.niveau === 0 ? 22 : 18)
      // Le nom apparaît quand son territoire est assez large à l'écran pour le porter.
      const largeurNom = Math.max(...lignes.map((l) => l.length)) * taille * (0.68 + esp)
      const lt = this.largeurTerritoire[cat.index]!
      if (lt <= 0) continue
      a *= clamp((lt / largeurNom - lisibilite * 0.4) / (lisibilite * 0.8), 0, 1)
      if (this.relies && !this.relies[cat.index]) a *= 0.25
      else if (survol) a *= 0.8
      a *= opG
      if (a < 0.03) continue
      const x = P.x[u]!, y = P.y[u]! - (1 - o) * (vue.tailleAffichee[u]! + taille * 0.9)
      if (x < -200 || x > W + 200 || y < -60 || y > H + 60) continue
      liste.push({ cat: cat.index, x, y, alpha: a, lignes, taille, niveau: cat.niveau })
    }
    // Priorité : les plus visibles d'abord, puis les niveaux hauts ; on saute ce qui chevauche.
    liste.sort((p, q) => q.alpha - p.alpha || p.niveau - q.niveau)
    const places: [number, number, number, number][] = []
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    const avecEspacement = 'letterSpacing' in ctx
    for (const t of liste) {
      const poids = t.niveau === 2 ? 500 : 600
      ctx.font = `${t.niveau === 2 ? 'italic ' : ''}${poids} ${t.taille}px ${palette.police}`
      const espPx = t.taille * esp * (t.niveau === 0 ? 1.4 : t.niveau === 1 ? 1 : 0.7)
      if (avecEspacement) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${espPx.toFixed(1)}px`
      const hLigne = t.taille * 1.18
      const largeur = Math.max(...t.lignes.map((l) => ctx.measureText(l).width))
      const hauteur = hLigne * t.lignes.length
      const r: [number, number, number, number] = [t.x - largeur / 2 - 4, t.y - hauteur / 2 - 2, t.x + largeur / 2 + 4, t.y + hauteur / 2 + 2]
      if (places.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) continue
      places.push(r)
      ctx.globalAlpha = t.alpha
      ctx.lineWidth = t.niveau === 0 ? 4 : 3.2
      ctx.strokeStyle = rgba(palette.fond, 0.85)
      ctx.fillStyle = this.teintesTexte[t.cat]!
      t.lignes.forEach((l, i) => {
        // letterSpacing ajoute un espace après la dernière lettre : on recentre.
        const x = t.x + (avecEspacement ? espPx / 2 : 0)
        const y = t.y + (i - (t.lignes.length - 1) / 2) * hLigne
        ctx.strokeText(l, x, y)
        ctx.fillText(l, x, y)
      })
    }
    ctx.restore()
  }
}
