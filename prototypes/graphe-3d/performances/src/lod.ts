// Prototype : niveaux de détail + culling par grille + recyclage des éléments HTML, sans DOM obligatoire
// (testable dans Node, réutilisable tel quel dans une page). Ne touche à aucune vision.
//
// Idée : à chaque image, on ne travaille que sur ce qui est dans la fenêtre (requête sur une grille
// uniforme), et on choisit le niveau d'après l'échelle écran s = px écran par px de mise en page :
//
//   s < seuilTitres      « points »   : un carré plein par bloc (couleur de famille), dessiné en lots :
//                                      un seul chemin + un seul fill() par couleur (≤ 16 tracés par image).
//   seuilTitres ≤ s      « titres »   : cadre + titre en canvas (fillText), toujours sans DOM.
//   s ≥ seuilContenu     « contenu »  : en plus, un élément HTML (KaTeX) par bloc visible, pris dans un
//                                      pool recyclé ; le HTML vient d'un cache chaîne → HTML.
//
// Le nombre d'éléments HTML vivants est donc borné par la surface de l'écran, pas par la taille du graphe.

export interface Boites {
  n: number
  /** Centre et demi-dimensions (px de mise en page). */
  x: Float32Array
  y: Float32Array
  dx: Float32Array
  dy: Float32Array
  /** Index de couleur (famille, statut…). */
  couleur: Uint8Array
}

export interface Camera2D {
  /** Centre de l'écran en px de mise en page, et échelle (px écran par px de mise en page). */
  cx: number
  cy: number
  s: number
  largeur: number
  hauteur: number
}

export type Niveau = 'points' | 'titres' | 'contenu'

export interface Seuils {
  titres: number
  contenu: number
}

export const SEUILS_DEFAUT: Seuils = { titres: 0.3, contenu: 0.6 }

export function niveauDe(s: number, seuils: Seuils = SEUILS_DEFAUT): Niveau {
  return s >= seuils.contenu ? 'contenu' : s >= seuils.titres ? 'titres' : 'points'
}

// ─── Grille uniforme ─────────────────────────────────────────────────────────

/** Index spatial : chaque boîte est rangée dans toutes les cellules qu'elle touche (CSR, sans objet par boîte). */
export class GrilleSpatiale {
  readonly x0: number
  readonly y0: number
  readonly taille: number
  readonly nx: number
  readonly ny: number
  private readonly debut: Int32Array
  private readonly contenu: Int32Array
  private readonly vu: Uint32Array
  private epoque = 0

  constructor(readonly b: Boites, taille = 512) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (let i = 0; i < b.n; i++) {
      x0 = Math.min(x0, b.x[i]! - b.dx[i]!); x1 = Math.max(x1, b.x[i]! + b.dx[i]!)
      y0 = Math.min(y0, b.y[i]! - b.dy[i]!); y1 = Math.max(y1, b.y[i]! + b.dy[i]!)
    }
    if (!Number.isFinite(x0)) x0 = y0 = x1 = y1 = 0
    this.x0 = x0
    this.y0 = y0
    this.taille = taille
    this.nx = Math.max(1, Math.ceil((x1 - x0) / taille) + 1)
    this.ny = Math.max(1, Math.ceil((y1 - y0) / taille) + 1)
    const nc = this.nx * this.ny
    const compte = new Int32Array(nc + 1)
    const pour = (i: number, f: (c: number) => void) => {
      const cx0 = this.cellX(b.x[i]! - b.dx[i]!), cx1 = this.cellX(b.x[i]! + b.dx[i]!)
      const cy0 = this.cellY(b.y[i]! - b.dy[i]!), cy1 = this.cellY(b.y[i]! + b.dy[i]!)
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) f(cy * this.nx + cx)
    }
    for (let i = 0; i < b.n; i++) pour(i, (c) => compte[c + 1]!++)
    for (let c = 0; c < nc; c++) compte[c + 1]! += compte[c]!
    this.debut = compte
    this.contenu = new Int32Array(compte[nc]!)
    const pos = compte.slice(0, nc)
    for (let i = 0; i < b.n; i++) pour(i, (c) => (this.contenu[pos[c]!++] = i))
    this.vu = new Uint32Array(b.n)
  }

  private cellX(x: number): number {
    return Math.min(this.nx - 1, Math.max(0, Math.floor((x - this.x0) / this.taille)))
  }

  private cellY(y: number): number {
    return Math.min(this.ny - 1, Math.max(0, Math.floor((y - this.y0) / this.taille)))
  }

  /** Boîtes qui intersectent le rectangle (px de mise en page) ; écrit leurs indices dans `sortie`, renvoie leur nombre. */
  requete(x0: number, y0: number, x1: number, y1: number, sortie: Int32Array): number {
    const b = this.b
    const e = ++this.epoque
    let n = 0
    const cx0 = this.cellX(x0), cx1 = this.cellX(x1), cy0 = this.cellY(y0), cy1 = this.cellY(y1)
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const c = cy * this.nx + cx
      for (let k = this.debut[c]!; k < this.debut[c + 1]!; k++) {
        const i = this.contenu[k]!
        if (this.vu[i] === e) continue
        this.vu[i] = e
        if (b.x[i]! + b.dx[i]! < x0 || b.x[i]! - b.dx[i]! > x1 || b.y[i]! + b.dy[i]! < y0 || b.y[i]! - b.dy[i]! > y1) continue
        sortie[n++] = i
      }
    }
    return n
  }
}

/** Fenêtre de la caméra en px de mise en page, élargie d'une marge (px écran). */
export function fenetre(c: Camera2D, margeEcran = 64): [number, number, number, number] {
  const hx = (c.largeur / 2 + margeEcran) / c.s, hy = (c.hauteur / 2 + margeEcran) / c.s
  return [c.cx - hx, c.cy - hy, c.cx + hx, c.cy + hy]
}

// ─── Dessin canvas en lots ───────────────────────────────────────────────────

/** Sous-ensemble de CanvasRenderingContext2D utilisé (un contexte réel convient). */
export interface Ctx2D {
  fillStyle: string | CanvasGradient | CanvasPattern
  strokeStyle: string | CanvasGradient | CanvasPattern
  lineWidth: number
  font: string
  beginPath(): void
  rect(x: number, y: number, w: number, h: number): void
  fill(): void
  stroke(): void
  fillText(t: string, x: number, y: number): void
}

/**
 * Niveau « points » : un seul chemin par couleur. Un carré fait au moins `minPx` px à l'écran pour
 * rester visible au zoom minimal (20 000 blocs tiennent alors en ≈ 16 fill()).
 */
export function dessinerPoints(ctx: Ctx2D, b: Boites, visibles: Int32Array, n: number, c: Camera2D, palette: string[], minPx = 2): number {
  const W2 = c.largeur / 2, H2 = c.hauteur / 2
  // Tri par couleur par comptage (pas d'allocation d'objets).
  const nb = palette.length
  const compte = new Int32Array(nb + 1)
  for (let k = 0; k < n; k++) compte[b.couleur[visibles[k]!]! + 1]!++
  for (let q = 0; q < nb; q++) compte[q + 1]! += compte[q]!
  const ordre = new Int32Array(n)
  const pos = compte.slice(0, nb)
  for (let k = 0; k < n; k++) ordre[pos[b.couleur[visibles[k]!]!]!++] = visibles[k]!
  let traces = 0
  for (let q = 0; q < nb; q++) {
    if (compte[q + 1] === compte[q]) continue
    ctx.fillStyle = palette[q]!
    ctx.beginPath()
    for (let k = compte[q]!; k < compte[q + 1]!; k++) {
      const i = ordre[k]!
      const w = Math.max(minPx, 2 * b.dx[i]! * c.s), h = Math.max(minPx, 2 * b.dy[i]! * c.s)
      ctx.rect(W2 + (b.x[i]! - c.cx) * c.s - w / 2, H2 + (b.y[i]! - c.cy) * c.s - h / 2, w, h)
    }
    ctx.fill()
    traces++
  }
  return traces
}

/** Niveau « titres » : cadres en un seul stroke(), puis un fillText par bloc (police fixée une fois). */
export function dessinerTitres(ctx: Ctx2D, b: Boites, visibles: Int32Array, n: number, c: Camera2D, titres: string[], police: string): number {
  const W2 = c.largeur / 2, H2 = c.hauteur / 2
  ctx.beginPath()
  for (let k = 0; k < n; k++) {
    const i = visibles[k]!
    ctx.rect(W2 + (b.x[i]! - b.dx[i]! - c.cx) * c.s, H2 + (b.y[i]! - b.dy[i]! - c.cy) * c.s, 2 * b.dx[i]! * c.s, 2 * b.dy[i]! * c.s)
  }
  ctx.stroke()
  const corps = Math.max(6, Math.min(14, 13 * c.s))
  ctx.font = `${corps.toFixed(1)}px ${police}`
  for (let k = 0; k < n; k++) {
    const i = visibles[k]!
    ctx.fillText(titres[i]!, W2 + (b.x[i]! - b.dx[i]! - c.cx) * c.s + 6 * c.s, H2 + (b.y[i]! - b.dy[i]! - c.cy) * c.s + 18 * c.s)
  }
  return 1 + n
}

// ─── Pool HTML recyclé + cache KaTeX ─────────────────────────────────────────

/** Élément du pool (un vrai HTMLElement dans une page ; un objet simple dans Node). */
export interface ElementPool {
  html: string
  transform: string
  visible: boolean
}

/**
 * Garde au plus un élément par bloc visible. Un bloc qui sort de l'écran rend son élément au pool ;
 * un bloc qui entre en prend un (création seulement si le pool est vide). Le contenu (HTML KaTeX) vient
 * d'un cache : chaîne rendue une fois pour toute la session.
 */
export class PoolHtml<E extends ElementPool = ElementPool> {
  private readonly attribue = new Map<number, E>()
  private readonly libres: E[] = []
  readonly cache = new Map<string, string>()
  readonly compteur = { crees: 0, reutilises: 0, rendus: 0, cacheTouches: 0, ecrituresHtml: 0, ecrituresTransform: 0 }

  constructor(
    private readonly creer: () => E,
    private readonly rendre: (i: number) => string,
    private readonly cle: (i: number) => string,
    private readonly ecrireHtml: (e: E, html: string) => void = (e, h) => (e.html = h),
    private readonly ecrireTransform: (e: E, t: string, visible: boolean) => void = (e, t, v) => {
      e.transform = t
      e.visible = v
    },
  ) {}

  get vivants(): number {
    return this.attribue.size + this.libres.length
  }

  /** Une image : `visibles` = blocs au niveau « contenu » dans la fenêtre. */
  image(b: Boites, visibles: Int32Array, n: number, c: Camera2D): void {
    const W2 = c.largeur / 2, H2 = c.hauteur / 2
    const garde = new Set<number>()
    for (let k = 0; k < n; k++) garde.add(visibles[k]!)
    for (const [i, e] of this.attribue) if (!garde.has(i)) {
      this.attribue.delete(i)
      this.ecrireTransform(e, e.transform, false)
      this.libres.push(e)
    }
    for (let k = 0; k < n; k++) {
      const i = visibles[k]!
      let e = this.attribue.get(i)
      if (!e) {
        e = this.libres.pop()
        if (e) this.compteur.reutilises++
        else {
          e = this.creer()
          this.compteur.crees++
        }
        const cle = this.cle(i)
        let html = this.cache.get(cle)
        if (html === undefined) {
          html = this.rendre(i)
          this.cache.set(cle, html)
          this.compteur.rendus++
        } else this.compteur.cacheTouches++
        if (e.html !== html) {
          this.ecrireHtml(e, html)
          this.compteur.ecrituresHtml++
        }
        this.attribue.set(i, e)
      }
      const t = `translate(${(W2 + (b.x[i]! - b.dx[i]! - c.cx) * c.s).toFixed(1)}px,${(H2 + (b.y[i]! - b.dy[i]! - c.cy) * c.s).toFixed(1)}px) scale(${c.s.toFixed(3)})`
      if (t !== e.transform || !e.visible) {
        this.ecrireTransform(e, t, true)
        this.compteur.ecrituresTransform++
      }
    }
  }
}
