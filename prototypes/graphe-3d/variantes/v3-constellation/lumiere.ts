// Tout ce qui « éclaire » la constellation, dessiné sur les deux calques canvas du moteur :
//   dessous : poussière d'étoiles (sombre), halos / nébuleuses, couronnes, anneaux de survol,
//             traînées d'étincelles ;
//   dessus  : impulsions de lignée, onde de réception et anneau « respirant » de la sélection.
//
// Les halos sont des sprites pré-rendus (dégradé radial par couleur × palier de netteté) posés
// avec drawImage : ~1 200 drawImage par image restent très rapides. Les effets animés en
// continu (scintillement, impulsions, fin des traînées) ont leur propre boucle
// requestAnimationFrame qui ne redessine que ces calques, sans relancer sigma.

import { centreCouloir, melangerCouleurs, pointSurAxe, poidsAxes, rgb, rgba, TYPES_NOEUD, type Vec3, type VueGraphe } from '../../src/core'
import { R } from './reglages'
import type { Squelette } from './squelette'

const TAILLE_SPRITE = 64
const PALIERS = 6
const TRAINEE_MAX = 25
const IMPULSIONS_MAX = 900
const DEUX_PI = Math.PI * 2

const lisse = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * Profil radial du halo : diffus (gaussienne à longue traîne) → net (disque bordé d'une lueur).
 * La traîne en 1/(1 + k r²) prolonge le dégradé : la lueur se voit loin sans épaissir le cœur.
 */
function profil(r: number, nettete: number): number {
  const traine = 0.35 / (1 + 22 * r * r)
  const doux = 0.7 * Math.exp(-r * r * 7) + traine
  const net = 0.2 * Math.exp(-r * r * 5) + 0.7 * (1 - lisse(0.36, 0.56, r)) + traine * 0.6
  return Math.min(1, doux + (net - doux) * nettete) * (1 - lisse(0.8, 1, r))
}

/** Variante plus saturée et un peu plus sombre d'une couleur (cœur des halos en thème clair). */
function saturer(couleur: string, k: number): [number, number, number] {
  const [r, g, b] = rgb(couleur).map((x) => x / 255) as [number, number, number]
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let hh = 0, ss = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    ss = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    hh = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    hh /= 6
  }
  ss = Math.min(1, ss * (1 + 0.6 * k))
  const l2 = l * (1 - 0.18 * k)
  const q = l2 < 0.5 ? l2 * (1 + ss) : l2 + ss - l2 * ss, p = 2 * l2 - q
  const f = (t: number) => {
    t = (t + 1) % 1
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p
  }
  return ss === 0 ? [l2 * 255, l2 * 255, l2 * 255] : [f(hh + 1 / 3) * 255, f(hh) * 255, f(hh - 1 / 3) * 255]
}

export class Lumiere {
  private sprites = new Map<string, HTMLCanvasElement>()
  /** Confiance moyenne et largeur moyenne de l'intervalle, par catégorie. */
  private confAgregat: Float32Array
  private largAgregat: Float32Array
  /** Historique des positions 3D (traînées) : anneau de TRAINEE_MAX points par unité. */
  private hist: Float32Array
  private tete: Int32Array
  private dernierMouvement: Int32Array
  private image = 0
  private dernierPush = -1
  private dernierDessin = -1
  private raf = 0
  private besoinContinu = false
  /** Impulsions : paires de représentants, décalage (en arêtes) et type (0 ancêtre, 1 descendant). */
  private impA = new Int32Array(IMPULSIONS_MAX)
  private impB = new Int32Array(IMPULSIONS_MAX)
  private impO = new Float32Array(IMPULSIONS_MAX)
  private impT = new Uint8Array(IMPULSIONS_MAX)
  private nbImp = 0
  private arriveeOnde = 0
  private cleImpulsions = ''
  private etoiles: { x: number; y: number; r: number; a: number }[] = []
  /** Voisins « allumés » supplémentaires (squelette : voisins des nœuds absorbés). */
  voisinsExtra = new Set<number>()
  private point: [number, number, number] = [0, 0, 0]

  constructor(private vue: VueGraphe, private squelette: Squelette) {
    const { h } = vue
    this.confAgregat = new Float32Array(h.nC)
    this.largAgregat = new Float32Array(h.nC)
    for (const c of h.categories) {
      let s = 0, l = 0
      for (const f of c.feuilles) {
        const k = h.noeuds[f]!.confiance
        s += k.estimation
        l += k.haut - k.bas
      }
      const n = Math.max(1, c.feuilles.length)
      this.confAgregat[c.index] = s / n
      this.largAgregat[c.index] = l / n
    }
    this.hist = new Float32Array(h.nU * TRAINEE_MAX * 3)
    this.tete = new Int32Array(h.nU)
    this.dernierMouvement = new Int32Array(h.nU).fill(-1e6)
    // Poussière d'étoiles déterministe (coordonnées normalisées).
    let graine = 1234567
    const alea = () => ((graine = (graine * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 260; i++) this.etoiles.push({ x: alea(), y: alea(), r: 0.3 + alea() * alea() * 1.3, a: 0.15 + alea() * 0.6 })
    vue.on('theme', () => this.sprites.clear())
    document.addEventListener('visibilitychange', () => this.planifier())
  }

  // ─── Sprites ─────────────────────────────────────────────────────────────

  private sprite(couleur: string, nettete: number): HTMLCanvasElement {
    const palier = Math.round(Math.min(1, Math.max(0, nettete)) * (PALIERS - 1))
    const coeur = R(this.vue).theme === 'clair' ? R(this.vue).haloCoeur : 0
    const cle = `${couleur}|${palier}|${coeur}`
    let c = this.sprites.get(cle)
    if (c) return c
    c = document.createElement('canvas')
    c.width = c.height = TAILLE_SPRITE
    const ctx = c.getContext('2d')!
    const m = TAILLE_SPRITE / 2
    const g = ctx.createRadialGradient(m, m, 0, m, m, m)
    const s = palier / (PALIERS - 1)
    const base = rgb(couleur)
    const sat = saturer(couleur, coeur)
    for (let i = 0; i <= 24; i++) {
      const r = i / 24
      // Cœur saturé qui se fond vers la teinte pastel de la palette en s'éloignant.
      const k = lisse(0.05, 0.55, r)
      const col = [0, 1, 2].map((j) => Math.round(sat[j]! + (base[j]! - sat[j]!) * k))
      g.addColorStop(r, `rgba(${col[0]},${col[1]},${col[2]},${profil(r, s).toFixed(4)})`)
    }
    ctx.fillStyle = g
    ctx.fillRect(0, 0, TAILLE_SPRITE, TAILLE_SPRITE)
    this.sprites.set(cle, c)
    return c
  }

  /** Tampon hors écran des halos : on y accumule, puis on compose avec un plafond d'opacité. */
  private tampon: HTMLCanvasElement | null = null
  private ctxTampon(): CanvasRenderingContext2D {
    const { largeur, hauteur, ratioPixel } = this.vue.rendu
    const w = Math.round(largeur * ratioPixel), hh = Math.round(hauteur * ratioPixel)
    if (!this.tampon) this.tampon = document.createElement('canvas')
    const t = this.tampon
    if (t.width !== w || t.height !== hh) {
      t.width = w
      t.height = hh
    }
    const ctx = t.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, w, hh)
    ctx.setTransform(ratioPixel, 0, 0, ratioPixel, 0, 0)
    return ctx
  }

  // ─── Couleurs ────────────────────────────────────────────────────────────

  couleurUnite(u: number): string {
    const { h, palette: p, lignee } = this.vue
    const V = R(this.vue)
    if (lignee.active) {
      const role = lignee.role(u)
      if (role === 'selection') return p.accent
      if (role === 'ancetre') return p.ancetre
      if (role === 'descendant') return p.descendant
    }
    if (V.haloCouleur === 'unie') return p.accent
    if (u >= h.nF) return p.domaines[h.categories[u - h.nF]!.domaine % p.domaines.length]!
    const n = h.noeuds[u]!
    if (V.haloCouleur === 'domaine') return p.domaines[h.domaine(u) % p.domaines.length]!
    if (V.haloCouleur === 'origine') return p.origine[n.origine]
    return p.statut[n.statut]
  }

  /**
   * Halo plein : agrégats, nœuds importants (rang d'importance dans la part choisie), survol et
   * voisins, lignée, clés du squelette. Les autres n'ont qu'un halo minimal.
   */
  estPlein(u: number): boolean {
    const vue = this.vue
    if (u >= vue.h.nF) return true
    const S = this.squelette
    if (S.rang[u]! >= 1 - R(vue).haloPleinPart) return true
    if (u === vue.survol || this.estAllume(u)) return true
    if (S.actif && S.cle[u]) return true
    const l = vue.lignee
    return l.active && l.role(u) !== 'hors'
  }

  private estAllume(u: number): boolean {
    return this.vue.voisinsSurvol.has(u) || this.voisinsExtra.has(u)
  }

  // ─── Boucle propre ───────────────────────────────────────────────────────

  private planifier(): void {
    if (this.raf || !this.besoinContinu || document.hidden) return
    this.raf = requestAnimationFrame(this.boucle)
  }

  private boucle = (t: number): void => {
    this.raf = 0
    if (t !== this.dernierDessin) {
      this.vue.rendu.preparerCalques()
      this.dessiner(t)
    } else this.planifier()
  }

  /**
   * Dessine tous les effets. Appelée par le crochet « dessous » du moteur (calques déjà
   * effacés) et par la boucle propre (qui efface elle-même).
   */
  dessiner(t: number): void {
    this.dernierDessin = t
    const vue = this.vue
    const V = R(vue)
    const cd = vue.rendu.ctxDessous
    const cu = vue.rendu.ctxDessus
    const additif = V.fusion === 'additif' || (V.fusion === 'auto' && V.theme === 'sombre')
    let continu = false

    if (V.theme === 'sombre' && V.poussiere > 0) this.dessinerPoussiere(cd, V.poussiere)

    if (V.traineesTemps) this.dessinerPeriodes(cd, additif)
    if (V.halo) {
      // Plafond de densité : les halos s'accumulent dans un tampon (source-over : l'alpha cumulé
      // sature à 1 au lieu de s'additionner), puis le tampon est posé avec une opacité plafonnée.
      const ct = this.ctxTampon()
      ct.globalCompositeOperation = additif ? 'lighter' : 'source-over'
      continu = this.dessinerHalos(ct, t) || continu
      cd.save()
      cd.setTransform(1, 0, 0, 1, 0, 0)
      cd.globalAlpha = V.plafondHalos
      cd.globalCompositeOperation = additif ? 'lighter' : 'source-over'
      cd.drawImage(this.tampon!, 0, 0)
      cd.restore()
    }
    cd.save()
    cd.globalCompositeOperation = additif ? 'lighter' : 'source-over'
    if (t !== this.dernierPush) {
      this.dernierPush = t
      this.image++
      this.enregistrerTrainees(V.trainee)
    }
    if (V.trainee > 0) continu = this.dessinerTrainees(cd, V.trainee, V.epaisseurTrainee) || continu
    cd.restore()
    this.dessinerAnneaux(cd, t)

    cu.save()
    cu.globalCompositeOperation = additif ? 'lighter' : 'source-over'
    continu = this.dessinerImpulsions(cu, t) || continu
    cu.restore()
    this.dessinerTerritoires(cu)

    this.besoinContinu = continu
    this.planifier()
  }

  // ─── Poussière (thème sombre) ────────────────────────────────────────────

  private dessinerPoussiere(ctx: CanvasRenderingContext2D, k: number): void {
    const { largeur: W, hauteur: H } = this.vue.rendu
    // Léger parallaxe : la poussière glisse avec l'orientation de la caméra.
    const av = this.vue.camera.avant
    const ox = av[0] * 40, oy = av[1] * 40
    ctx.save()
    ctx.fillStyle = '#cfd8ff'
    for (const e of this.etoiles) {
      ctx.globalAlpha = e.a * k * 0.7
      const x = (((e.x * W + ox * e.r) % W) + W) % W
      const y = (((e.y * H + oy * e.r) % H) + H) % H
      ctx.fillRect(x, y, e.r, e.r)
    }
    ctx.restore()
  }

  // ─── Halos ───────────────────────────────────────────────────────────────

  /** Renvoie vrai si un scintillement visible demande une animation continue. */
  private dessinerHalos(ctx: CanvasRenderingContext2D, t: number): boolean {
    const vue = this.vue
    const V = R(vue)
    const { h, projection: P, lignee } = vue
    const S = this.squelette
    const persp = vue.camera.perspective
    const survol = vue.survol
    const scint = V.scintillement && V.amplitudeScintillement > 0
    const w = DEUX_PI * V.frequenceScintillement * (t / 1000)
    let scintille = false
    const nettBase = 1 - V.haloFlou
    for (let u = 0; u < h.nU; u++) {
      const op = vue.opaciteAffichee[u]!
      if (op < 0.03 || !P.visible[u]) continue
      const agr = u >= h.nF
      const taille = vue.tailleAffichee[u]!
      let est: number, larg: number
      if (agr) {
        est = this.confAgregat[u - h.nF]!
        larg = this.largAgregat[u - h.nF]!
      } else {
        const c = h.noeuds[u]!.confiance
        est = c.estimation
        larg = c.haut - c.bas
      }
      // Profondeur de champ : flou ∝ écart à la mise au point (en perspective seulement).
      const dof = persp > 0.01 ? Math.min(1, V.profondeurChamp * persp * Math.abs(P.profondeurNormalisee(u) - V.miseAuPoint) * 1.4) : 0
      let nettete = est * nettBase * (1 - dof)
      let rayon = taille * V.haloRayon + larg * V.haloIncertitude * Math.max(0.35, P.echelle[u]!)
      let alpha = V.haloIntensite * (0.3 + 0.7 * est) * Math.pow(op, 0.8) * (1 - 0.3 * dof)
      rayon *= 1 + 1.3 * dof
      if (agr) {
        // Nébuleuse d'agrégat : plus large et plus douce.
        rayon = taille * (1.8 + V.haloRayon * 0.7) + larg * V.haloIncertitude * 0.8
        alpha *= 1.35 * V.haloAgregats
        nettete *= 0.75
      } else if (!this.estPlein(u)) {
        // Halo minimal : une lueur serrée qui garde la couleur sans former de nappe.
        rayon = (taille * V.haloMinimal + larg * V.haloIncertitude * 0.2) * (1 + 0.6 * dof)
        alpha *= 0.75
      } else if (S.engage && S.absorbes[u]! > 0) {
        rayon *= 1 + Math.min(0.8, 0.1 * Math.sqrt(S.absorbes[u]!))
      }
      // Mise en avant : survol puis lignée.
      if (survol !== null) {
        if (u === survol) alpha *= 1 + V.voisinsAllumes * 1.3
        else if (this.estAllume(u)) alpha *= 1 + V.voisinsAllumes
        else alpha *= V.estompeHalos
      }
      if (lignee.active) {
        const role = lignee.role(u)
        if (role === 'hors') alpha *= V.haloContexte
        else alpha *= role === 'selection' ? 1.9 : 1.35
      }
      if (scint && !agr && h.noeuds[u]!.statut === 'incertain') {
        const phase = h.graines[u]! * DEUX_PI
        // Scintillement doux : deux sinusoïdes désaccordées, amplitude bornée.
        const s = 0.5 + 0.5 * Math.sin(w + phase) * Math.sin(w * 0.37 + phase * 3)
        alpha *= 1 - V.amplitudeScintillement * 0.6 * s
        if (alpha > 0.01) scintille = true
      }
      if (alpha < 0.004 || rayon < 0.5) continue
      ctx.globalAlpha = Math.min(1, alpha)
      const img = this.sprite(this.couleurUnite(u), nettete)
      ctx.drawImage(img, P.x[u]! - rayon, P.y[u]! - rayon, rayon * 2, rayon * 2)
    }
    ctx.globalAlpha = 1
    return scintille
  }

  // ─── Couronnes (IA + humain) et anneaux de survol ────────────────────────

  private dessinerAnneaux(ctx: CanvasRenderingContext2D, t: number): void {
    const vue = this.vue
    const V = R(vue)
    const { h, projection: P, palette: pal } = vue
    ctx.save()
    if (V.couronne) {
      const chemins = [new Path2D(), new Path2D(), new Path2D()]
      const perles = [new Path2D(), new Path2D(), new Path2D()]
      for (let f = 0; f < h.nF; f++) {
        if (h.noeuds[f]!.validation !== 'ia_humain' || !this.estPlein(f)) continue
        const op = vue.opaciteAffichee[f]!
        if (op < 0.12 || !P.visible[f]) continue
        const b = op > 0.66 ? 2 : op > 0.33 ? 1 : 0
        const x = P.x[f]!, y = P.y[f]!
        const r = vue.tailleAffichee[f]! + V.couronneEcart
        if (vue.tailleAffichee[f]! < V.couronneTailleMin) continue
        chemins[b]!.moveTo(x + r, y)
        chemins[b]!.arc(x, y, r, 0, DEUX_PI)
        // Quatre perles aux points cardinaux : une couronne discrète, lisible même petite.
        const a0 = Math.PI / 4
        const rp = Math.max(0.7, Math.min(1.4, r * 0.12))
        for (let i = 0; i < 4; i++) {
          const a = a0 + (i * DEUX_PI) / 4
          const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r
          perles[b]!.moveTo(px + rp, py)
          perles[b]!.arc(px, py, rp, 0, DEUX_PI)
        }
      }
      ctx.lineWidth = 0.8
      for (let b = 0; b < 3; b++) {
        const a = [0.3, 0.6, 0.95][b]! * V.couronneOpacite
        ctx.strokeStyle = rgba(pal.validation.ia_humain, a * 0.55)
        ctx.stroke(chemins[b]!)
        ctx.fillStyle = rgba(pal.validation.ia_humain, a)
        ctx.fill(perles[b]!)
      }
    }
    // Survol : le nœud et ses voisins s'allument d'un fin anneau.
    const s = vue.survol
    if (s !== null && V.voisinsAllumes > 0) {
      const chemin = new Path2D()
      const ajouter = (u: number, ecart: number) => {
        if (vue.opaciteAffichee[u]! < 0.05 || !P.visible[u]) return
        const r = vue.tailleAffichee[u]! + ecart
        chemin.moveTo(P.x[u]! + r, P.y[u]!)
        chemin.arc(P.x[u]!, P.y[u]!, r, 0, DEUX_PI)
      }
      for (const u of vue.voisinsSurvol) ajouter(u, 2.5)
      for (const u of this.voisinsExtra) ajouter(u, 2.5)
      ctx.lineWidth = 1.1
      ctx.strokeStyle = rgba(pal.accent, Math.min(1, 0.45 * V.voisinsAllumes))
      ctx.stroke(chemin)
      const anneau = new Path2D()
      const r = vue.tailleAffichee[s]! + 4
      anneau.arc(P.x[s]!, P.y[s]!, r, 0, DEUX_PI)
      ctx.lineWidth = 1.6
      ctx.strokeStyle = rgba(pal.accent, 0.85)
      ctx.stroke(anneau)
    }
    ctx.restore()
    void t
  }

  // ─── Traînées d'étincelles ───────────────────────────────────────────────

  /** Unité en transition (sortie d'un parent / repli dans une clé). */
  private enTransition(u: number): boolean {
    const { h, granularite: g } = this.vue
    if (u < h.nF) {
      const o = g.facteur(u)
      return (o > 0.001 && o < 0.999) || (this.squelette.engage && this.squelette.enMouvement(u))
    }
    const c = h.categories[u - h.nF]!
    if (c.parent < 0) return false
    const o = g.ouverture[c.parent]!
    return o > 0.001 && o < 0.999
  }

  private enregistrerTrainees(longueur: number): void {
    if (longueur <= 0) return
    const { h, positions: pos } = this.vue
    const H = this.hist
    for (let u = 0; u < h.nU; u++) {
      const base = u * TRAINEE_MAX * 3
      const x = pos[u * 3]!, y = pos[u * 3 + 1]!, z = pos[u * 3 + 2]!
      const recente = this.image - this.dernierMouvement[u]! <= longueur
      if (this.enTransition(u)) {
        const i0 = base + this.tete[u]! * 3
        const bouge = Math.abs(H[i0]! - x) + Math.abs(H[i0 + 1]! - y) + Math.abs(H[i0 + 2]! - z) > 1e-6
        if (!recente) {
          // Nouveau départ : l'historique entier part de la position courante.
          for (let i = 0; i < TRAINEE_MAX; i++) {
            H[base + i * 3] = x
            H[base + i * 3 + 1] = y
            H[base + i * 3 + 2] = z
          }
        }
        if (bouge || !recente) this.dernierMouvement[u] = this.image
      } else if (!recente) continue
      const tete = (this.tete[u]! + 1) % TRAINEE_MAX
      this.tete[u] = tete
      H[base + tete * 3] = x
      H[base + tete * 3 + 1] = y
      H[base + tete * 3 + 2] = z
    }
  }

  /** Renvoie vrai si des traînées sont encore visibles (il faut continuer à animer). */
  private dessinerTrainees(ctx: CanvasRenderingContext2D, longueur: number, epaisseur: number): boolean {
    const vue = this.vue
    const { h, camera } = vue
    const H = this.hist
    const N = Math.min(TRAINEE_MAX - 1, longueur)
    const TRANCHES = 4
    const chemins = new Map<string, Path2D>()
    let actives = false
    const q = this.point
    for (let u = 0; u < h.nU; u++) {
      if (this.image - this.dernierMouvement[u]! > longueur) continue
      const op = vue.opaciteAffichee[u]!
      actives = true
      if (op < 0.03) continue
      const base = u * TRAINEE_MAX * 3
      const couleur = this.couleurUnite(u)
      const bucketOp = op > 0.6 ? 2 : op > 0.3 ? 1 : 0
      let px = 0, py = 0
      for (let i = 0; i <= N; i++) {
        const k = base + ((this.tete[u]! - i + TRAINEE_MAX) % TRAINEE_MAX) * 3
        q[0] = H[k]!
        q[1] = H[k + 1]!
        q[2] = H[k + 2]!
        const p = camera.projeterPoint(q)
        if (i > 0 && (Math.abs(p.x - px) + Math.abs(p.y - py) > 0.3)) {
          const tranche = Math.min(TRANCHES - 1, Math.floor(((i - 1) * TRANCHES) / N))
          const cle = `${couleur}|${tranche}|${bucketOp}`
          let c = chemins.get(cle)
          if (!c) chemins.set(cle, (c = new Path2D()))
          c.moveTo(px, py)
          c.lineTo(p.x, p.y)
        }
        px = p.x
        py = p.y
      }
    }
    ctx.lineCap = 'round'
    for (const [cle, c] of chemins) {
      const [couleur, tr, bo] = cle.split('|')
      const tranche = Number(tr), b = Number(bo)
      const f = 1 - tranche / TRANCHES
      ctx.globalAlpha = 1
      ctx.strokeStyle = rgba(couleur!, 0.75 * f * [0.35, 0.65, 1][b]!)
      ctx.lineWidth = epaisseur * (0.35 + 0.65 * f)
      ctx.stroke(c)
    }
    return actives
  }

  // ─── Impulsions de lignée ────────────────────────────────────────────────

  /** Recalcule les arêtes parcourues (représentants affichés, décalage en « arêtes »). */
  private majImpulsions(): void {
    const vue = this.vue
    const { h, lignee: l, granularite: g } = vue
    const S = this.squelette
    const cle = `${l.version}|${g.version}|${S.version}|${S.engage ? 1 : 0}`
    if (cle === this.cleImpulsions) return
    this.cleImpulsions = cle
    this.nbImp = 0
    if (!l.active) return
    const nF = h.nF
    // Profondeurs : distance (en arêtes) jusqu'à la sélection, côté ancêtres et descendants.
    const dA = new Int32Array(nF).fill(-1), dD = new Int32Array(nF).fill(-1)
    const bfs = (d: Int32Array, voisins: number[][], dans: Uint8Array) => {
      let front: number[] = []
      for (let f = 0; f < nF; f++) if (l.graines[f]) { d[f] = 0; front.push(f) }
      let max = 0
      while (front.length) {
        const suivant: number[] = []
        for (const x of front) for (const y of voisins[x]!) {
          if (d[y] !== -1 || !dans[y]) continue
          d[y] = d[x]! + 1
          if (d[y]! > max) max = d[y]!
          suivant.push(y)
        }
        front = suivant
      }
      return max
    }
    const maxA = bfs(dA, h.premisses, l.ancetres)
    bfs(dD, h.utilisePar, l.descendants)
    this.arriveeOnde = maxA
    const rep = (f: number) => (S.engage ? S.representant(f) : g.representant(f))
    const vus = new Map<number, number>()
    const { aretesSource: SA, aretesCible: TA } = h
    for (let e = 0; e < SA.length; e++) {
      const s = SA[e]!, t = TA[e]!
      let type: number, o: number
      if (dA[s]! > 0 && dA[t]! >= 0) {
        type = 0
        o = maxA - dA[s]!
      } else if (dD[t]! > 0 && dD[s]! >= 0 && dD[t]! === dD[s]! + 1) {
        type = 1
        o = maxA + dD[s]!
      } else continue
      const a = rep(s), b = rep(t)
      if (a === b) continue
      const k = a * h.nU + b
      const i = vus.get(k)
      if (i !== undefined) {
        if (o < this.impO[i]!) this.impO[i] = o
        continue
      }
      if (this.nbImp >= IMPULSIONS_MAX) break
      const j = this.nbImp++
      vus.set(k, j)
      this.impA[j] = a
      this.impB[j] = b
      this.impO[j] = o
      this.impT[j] = type
    }
  }

  private dessinerImpulsions(ctx: CanvasRenderingContext2D, t: number): boolean {
    const vue = this.vue
    const V = R(vue)
    const { projection: P, palette: pal, lignee } = vue
    if (!lignee.active) return false
    const sel = lignee.selection!
    const tau = (t / 1000) * V.vitesseImpulsions
    const E = V.espacementVagues
    const mod = (x: number) => ((x % E) + E) % E
    // Anneau « respirant » + onde de réception quand une vague atteint la sélection.
    if (vue.opaciteAffichee[sel]! > 0.03) {
      const x = P.x[sel]!, y = P.y[sel]!, r0 = vue.tailleAffichee[sel]! + 5
      ctx.lineWidth = 1.2
      ctx.strokeStyle = rgba(pal.accent, 0.35 + 0.25 * Math.sin(t / 420))
      ctx.beginPath()
      ctx.arc(x, y, r0 + 1.5 * Math.sin(t / 420), 0, DEUX_PI)
      ctx.stroke()
      if (V.impulsions) {
        const ph = mod(tau - this.arriveeOnde) / 1.2
        if (ph < 1) {
          ctx.lineWidth = 2 * (1 - ph)
          ctx.strokeStyle = rgba(pal.accent, 0.7 * (1 - ph))
          ctx.beginPath()
          ctx.arc(x, y, r0 + ph * 22, 0, DEUX_PI)
          ctx.stroke()
        }
      }
    }
    if (!V.impulsions) return true
    this.majImpulsions()
    const queue = V.queueImpulsion
    const queues = [new Path2D(), new Path2D()]
    const queuesVives = [new Path2D(), new Path2D()]
    const tetes: number[] = []
    for (let i = 0; i < this.nbImp; i++) {
      const a = this.impA[i]!, b = this.impB[i]!
      const op = Math.min(vue.opaciteAffichee[a]!, vue.opaciteAffichee[b]!)
      if (op < 0.02 || !P.visible[a] || !P.visible[b]) continue
      const m = mod(tau - this.impO[i]!)
      if (m >= 1) continue
      const f = m
      const ax = P.x[a]!, ay = P.y[a]!, bx = P.x[b]!, by = P.y[b]!
      const hx = ax + (bx - ax) * f, hy = ay + (by - ay) * f
      const q0 = Math.max(0, f - queue), q1 = Math.max(0, f - queue * 0.45)
      const type = this.impT[i]!
      queues[type]!.moveTo(ax + (bx - ax) * q0, ay + (by - ay) * q0)
      queues[type]!.lineTo(ax + (bx - ax) * q1, ay + (by - ay) * q1)
      queuesVives[type]!.moveTo(ax + (bx - ax) * q1, ay + (by - ay) * q1)
      queuesVives[type]!.lineTo(hx, hy)
      tetes.push(hx, hy, type)
    }
    const couleurs = [pal.ancetre, pal.descendant]
    const tp = V.tailleImpulsion
    ctx.lineCap = 'round'
    for (let k = 0; k < 2; k++) {
      ctx.lineWidth = tp * 0.35
      ctx.strokeStyle = rgba(couleurs[k]!, 0.28)
      ctx.stroke(queues[k]!)
      ctx.lineWidth = tp * 0.5
      ctx.strokeStyle = rgba(couleurs[k]!, 0.6)
      ctx.stroke(queuesVives[k]!)
    }
    const sprites = [this.sprite(couleurs[0]!, 0.6), this.sprite(couleurs[1]!, 0.6)]
    const rr = tp * 1.6
    for (let i = 0; i < tetes.length; i += 3) {
      ctx.globalAlpha = 0.95
      ctx.drawImage(sprites[tetes[i + 2]!]!, tetes[i]! - rr, tetes[i + 1]! - rr, rr * 2, rr * 2)
    }
    ctx.globalAlpha = 1
    ctx.fillStyle = V.theme === 'sombre' ? '#ffffff' : 'rgba(255,255,255,0.95)'
    ctx.beginPath()
    for (let i = 0; i < tetes.length; i += 3) {
      ctx.moveTo(tetes[i]! + tp * 0.28, tetes[i + 1]!)
      ctx.arc(tetes[i]!, tetes[i + 1]!, tp * 0.28, 0, DEUX_PI)
    }
    ctx.fill()
    return true
  }

  // ─── Vues temps (1) et type (3) : traînées de période ────────────────────

  /**
   * Remplace la capsule du moteur : chaque agrégat laisse une traînée lumineuse le long de sa
   * période (vue de face) — un chapelet de lueurs, une par semaine, d'éclat ∝ effectif, sur un
   * fil min–max et un trait vif q25–q75. En vue de droite, une lueur par couloir de type.
   */
  private dessinerPeriodes(ctx: CanvasRenderingContext2D, additif: boolean): void {
    const vue = this.vue
    const V = R(vue)
    const w = poidsAxes(vue)
    const temps = w.temps > 0.04, couloirs = w.couloirs > 0.04
    if (!temps && !couloirs) return
    const { h, palette, camera: cam, etendues: E } = vue
    const nT = E.nbTranches, nY = TYPES_NOEUD.length
    const k = V.intensiteTemps
    const proj = (p: Vec3) => cam.projeterPoint(p)
    ctx.save()
    ctx.globalCompositeOperation = additif ? 'lighter' : 'source-over'
    ctx.lineCap = 'round'
    const trait = (a: Vec3, b: Vec3, largeur: number, couleur: string, alpha: number) => {
      const pa = proj(a), pb = proj(b)
      if (!pa.visible || !pb.visible) return
      ctx.globalAlpha = 1
      ctx.strokeStyle = rgba(couleur, alpha)
      ctx.lineWidth = largeur
      ctx.beginPath()
      ctx.moveTo(pa.x, pa.y)
      ctx.lineTo(pb.x, pb.y)
      ctx.stroke()
    }
    // Lueur étirée le long de l'axe (ellipse) : les semaines voisines se fondent en une traînée.
    const allongee = (img: HTMLCanvasElement, x: number, y: number, ang: number, long: number, large: number, alpha: number) => {
      ctx.save()
      ctx.globalAlpha = Math.min(1, alpha)
      ctx.translate(x, y)
      ctx.rotate(ang)
      ctx.drawImage(img, -long, -large, 2 * long, 2 * large)
      ctx.restore()
    }
    for (const c of h.categories) {
      const u = c.unite
      const op = vue.opaciteAffichee[u]!
      if (op < 0.04) continue
      const coul = palette.domaines[c.domaine % palette.domaines.length]!
      const epais = Math.max(3, Math.min(14, vue.tailleAffichee[u]! * 0.8))
      const lueur = this.sprite(coul, 0.35)
      if (temps) {
        const a = op * Math.min(1, w.temps * 1.2) * k
        const q = E.quantilesTemps(c.index)
        const pt = (v: number) => pointSurAxe(vue, u, 'temps', v)
        trait(pt(q.min), pt(q.max), 0.8, coul, 0.35 * a)
        let max = 1
        for (let i = 0; i < nT; i++) max = Math.max(max, E.tranches[c.index * nT + i]!)
        const p0 = proj(pt(-1)), p1 = proj(pt(1))
        const pas = Math.hypot(p1.x - p0.x, p1.y - p0.y) / nT
        const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x)
        for (let i = 0; i < nT; i++) {
          const n = E.tranches[c.index * nT + i]!
          if (!n) continue
          const p = proj(pt(-1 + (2 * (i + 0.5)) / nT))
          if (!p.visible) continue
          const f = n / max
          allongee(lueur, p.x, p.y, ang, pas * 1.25, epais * (0.3 + 0.55 * Math.sqrt(f)), a * (0.3 + 0.6 * f))
        }
        trait(pt(q.q25), pt(q.q75), Math.max(1.4, epais * 0.22), coul, 0.75 * a)
      }
      if (couloirs && V.etenduesCouloirs) {
        const a = op * Math.min(1, w.couloirs * 1.2) * k
        let max = 1, premier = -1, dernier = -1
        for (let t = 0; t < nY; t++) {
          const n = E.types[c.index * nY + t]!
          if (!n) continue
          max = Math.max(max, n)
          if (premier < 0) premier = t
          dernier = t
        }
        if (premier < 0) continue
        const pt = (v: number) => pointSurAxe(vue, u, 'couloirs', v)
        trait(pt(centreCouloir(premier, 1)), pt(centreCouloir(dernier, 1)), 0.8, coul, 0.35 * a)
        const q0 = proj(pt(centreCouloir(0, 1))), q1 = proj(pt(centreCouloir(1, 1)))
        const ecart = Math.hypot(q1.x - q0.x, q1.y - q0.y)
        const ang = Math.atan2(q1.y - q0.y, q1.x - q0.x)
        for (let t = premier; t <= dernier; t++) {
          const n = E.types[c.index * nY + t]!
          if (!n) continue
          const p = proj(pt(centreCouloir(t, 1)))
          if (!p.visible) continue
          const f = n / max
          // Longueur ∝ effectif dans le couloir, comme le segment du moteur, mais lumineux.
          allongee(lueur, p.x, p.y, ang, Math.max(3, ecart * 0.5 * f), epais * (0.3 + 0.3 * Math.sqrt(f)), a * (0.35 + 0.55 * f))
        }
      }
    }
    ctx.restore()
  }

  // ─── Territoires : noms des thèmes au niveau des feuilles ────────────────

  /**
   * Quand les feuilles dominent (tout ouvert, squelette, lignée), les agrégats ont disparu et
   * l'on ne sait plus où l'on est : on écrit discrètement le nom de chaque thème au barycentre
   * écran de ses feuilles visibles (placement glouton sans chevauchement).
   */
  private dessinerTerritoires(ctx: CanvasRenderingContext2D): void {
    const vue = this.vue
    const V = R(vue)
    if (V.territoires === 'jamais' || V.opaciteTerritoires <= 0) return
    const { h, projection: P, palette: pal, granularite: g } = vue
    const niveauFeuilles = g.globale > 2.5 || this.squelette.actif
    if (V.territoires === 'auto' && !niveauFeuilles) return
    const themes = h.categories.filter((c) => c.niveau === 1)
    const sx = new Float64Array(h.nC), sy = new Float64Array(h.nC), n = new Int32Array(h.nC)
    for (let f = 0; f < h.nF; f++) {
      if (vue.opaciteAffichee[f]! < 0.02 || !P.visible[f]) continue
      const c = h.chaine[f * 3 + 1]!
      sx[c] += P.x[f]!
      sy[c] += P.y[f]!
      n[c]!++
    }
    const ordre = themes.filter((c) => n[c.index]! >= 3).sort((a, b) => n[b.index]! - n[a.index]!)
    const boites: [number, number, number, number][] = []
    ctx.save()
    ctx.font = `700 11px ${pal.police}`
    ;(ctx as unknown as { letterSpacing: string }).letterSpacing = '1.5px'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 4
    ctx.strokeStyle = rgba(pal.fond, 0.85)
    const a = V.opaciteTerritoires
    for (const c of ordre) {
      const x = sx[c.index]! / n[c.index]!, y = sy[c.index]! / n[c.index]!
      const texte = c.nom.toUpperCase()
      const l = ctx.measureText(texte).width + 8
      const b: [number, number, number, number] = [x - l / 2, y - 9, x + l / 2, y + 9]
      if (boites.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) continue
      boites.push(b)
      const coul = pal.domaines[c.domaine % pal.domaines.length]!
      ctx.globalAlpha = a
      ctx.strokeText(texte, x, y)
      ctx.fillStyle = V.theme === 'sombre' ? rgba(coul, 0.95) : melangerCouleurs(coul, pal.texte, 0.35)
      ctx.fillText(texte, x, y)
    }
    ctx.restore()
  }

  /** Nombre d'arêtes de lignée parcourues (pour le panneau / la console). */
  get nbImpulsions(): number {
    return this.nbImp
  }
}
