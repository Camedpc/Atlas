// Lentille focus + contexte (reprise de V5, option désactivée par défaut) : dans un disque autour
// du curseur, les agrégats s'ouvrent localement (délais + hystérésis), avec un fisheye optionnel ;
// hors du disque, ils reviennent à la granularité globale. `L` épingle la lentille, Maj + molette
// change son rayon.

import { NOMS_NIVEAUX, rgba, type ContexteDessin, type Projection, type ReducteurNoeud, type VueGraphe } from '../../src/core'
import type { EtatFigure } from './figure'
import { lire } from './reglages'

export class Lentille {
  x = 0
  y = 0
  dedans = false
  epinglee = false
  /** Présence affichée 0…1, lissée. */
  intensite = 0
  /** Catégories ouvertes par la lentille : instant de sortie (0 = touche encore). */
  private suivies = new Map<number, number>()
  private candidates = new Map<number, number>()

  constructor(private vue: VueGraphe, private etat: EtatFigure) {
    const scene = vue.scene
    const local = (e: { clientX: number; clientY: number }) => {
      const r = scene.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    scene.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return
      this.dedans = true
      if (!this.epinglee) {
        const q = local(e)
        this.x = q.x
        this.y = q.y
      }
      if (this.active) vue.demanderRendu()
    })
    scene.addEventListener('pointerleave', () => {
      this.dedans = false
      if (this.active) vue.demanderRendu()
    })
    // Maj + molette : rayon (capture, avant le zoom du moteur).
    scene.addEventListener('wheel', (e) => {
      if (!this.active || !e.shiftKey) return
      e.preventDefault()
      e.stopImmediatePropagation()
      const r = Math.round(Math.min(420, Math.max(50, this.rayon * Math.pow(1.08, -Math.sign(e.deltaY || e.deltaX)))))
      vue.reglages.definir('rayonLentille', r)
    }, { capture: true, passive: false })
    vue.on('image', ({ dt }) => {
      if (this.lisser(dt)) vue.demanderRendu()
    })
    vue.on('reglage', ({ cle, valeur }) => {
      if (cle === 'lentille' && valeur === false) this.toutFermer()
    })
    window.setInterval(() => this.mettreAJour(performance.now()), 50)
  }

  get active(): boolean {
    return lire<boolean>(this.vue, 'lentille')
  }

  get rayon(): number {
    return lire<number>(this.vue, 'rayonLentille')
  }

  get voulue(): boolean {
    return this.active && (this.dedans || this.epinglee)
  }

  epingler(etat = !this.epinglee): void {
    this.epinglee = etat
    if (etat && !this.dedans && this.x === 0 && this.y === 0) {
      this.x = this.vue.rendu.largeur / 2
      this.y = this.vue.rendu.hauteur / 2
    }
    this.vue.demanderRendu()
  }

  private lisser(dt: number): boolean {
    const cible = this.voulue ? 1 : 0
    const tau = lire<number>(this.vue, 'lissageLentille')
    const k = tau <= 0 ? 1 : 1 - Math.exp(-dt / tau)
    this.intensite += (cible - this.intensite) * k
    if (Math.abs(cible - this.intensite) < 0.004) this.intensite = cible
    return this.intensite !== cible
  }

  /** Fisheye de Sarkar & Brown, d' = R(k+1)t/(kt+1), appliqué en place à la projection. */
  deformer = (p: Projection): void => {
    const k = lire<number>(this.vue, 'fisheye') * this.intensite
    if (k <= 0.001) return
    const R = this.rayon, cx = this.x, cy = this.y
    for (let u = 0; u < p.n; u++) {
      const dx = p.x[u]! - cx, dy = p.y[u]! - cy
      if (Math.abs(dx) >= R || Math.abs(dy) >= R) continue
      const d = Math.hypot(dx, dy)
      if (d >= R || d < 1e-6) continue
      const s = (k + 1) / ((k * d) / R + 1)
      p.x[u] = cx + dx * s
      p.y[u] = cy + dy * s
    }
  }

  /** Réducteur : grossissement dans la lentille, contexte estompé autour. */
  reducteur: ReducteurNoeud = (info, a, vue) => {
    const I = this.intensite
    this.etat.priorite[info.unite] = 0
    if (I <= 0.001) return
    const d = Math.hypot(info.x - this.x, info.y - this.y) / this.rayon
    if (d < 1) {
      a.taille *= 1 + lire<number>(vue, 'grossissement') * (1 - d) * I
      // Seul le cœur de la lentille réclame des libellés (le calque en plafonne le nombre).
      if (!info.estAgregat && d < 0.7) this.etat.priorite[info.unite] = (1 - d) * I
    } else if (!a.surligne && info.survol !== 'survole' && info.survol !== 'voisin') {
      a.opacite *= 1 - lire<number>(vue, 'estompeHors') * I * Math.min(1, (d - 1) / 0.25)
    }
  }

  private distance(u: number): number {
    const p = this.vue.projection
    return Math.hypot(p.x[u]! - this.x, p.y[u]! - this.y)
  }

  private touche(c: number, r: number): boolean {
    const { h, granularite: g } = this.vue
    const cat = h.categories[c]!
    if (this.distance(cat.unite) < r) return true
    if (cat.niveau === 2) {
      for (const f of cat.feuilles) if (g.alpha[f]! > 0.05 && this.distance(f) < r) return true
      return false
    }
    for (const e of cat.enfants) {
      if (this.suivies.has(e) ? this.touche(e, r) : this.distance(h.categories[e]!.unite) < r + this.vue.tailleAffichee[h.categories[e]!.unite]! * 0.5) return true
    }
    return false
  }

  private fermer(c: number): void {
    const { h, granularite: g } = this.vue
    const u = h.categories[c]!.unite
    const liste = [...this.suivies.keys()].filter((d) => h.contient(u, h.categories[d]!.unite))
    liste.sort((a, b) => h.categories[b]!.niveau - h.categories[a]!.niveau)
    for (const d of liste) {
      this.suivies.delete(d)
      g.revenirAuGlobal(d)
    }
  }

  toutFermer(): void {
    const { h } = this.vue
    const racines = [...this.suivies.keys()].filter((c) => {
      const p = h.categories[c]!.parent
      return p < 0 || !this.suivies.has(p)
    })
    for (const c of racines) this.fermer(c)
    this.candidates.clear()
    this.vue.demanderRendu()
  }

  private mettreAJour(t: number): void {
    const v = this.vue
    if (!this.active && !this.suivies.size) return
    const { h, granularite: g } = v
    const actif = this.voulue
    const R = this.rayon
    const hyst = lire<number>(v, 'hysteresisLentille')
    const base = Math.floor(g.globale + 1e-3)
    const profondeur = lire<number>(v, 'profondeurLentille')
    const dOuv = lire<number>(v, 'delaiOuverture')
    const dFerm = lire<number>(v, 'delaiFermeture')
    let change = false
    for (const [c, sortie] of [...this.suivies]) {
      if (!this.suivies.has(c)) continue
      const u = h.categories[c]!.unite
      if (g.presence[u]! < 0.1 || g.ouvertureGlobale(c) >= 0.999) {
        this.fermer(c)
        change = true
        continue
      }
      if (actif && this.touche(c, R * hyst)) this.suivies.set(c, 0)
      else if (!sortie) this.suivies.set(c, t)
      else if (t - sortie >= dFerm) {
        this.fermer(c)
        change = true
      }
    }
    if (actif) {
      const vus = new Set<number>()
      for (const cat of h.categories) {
        const c = cat.index
        if (cat.niveau >= base + profondeur || this.suivies.has(c)) continue
        const u = cat.unite
        if (g.presence[u]! < 0.9 || g.ouverture[c]! > 0.5 || g.nbActives[c] === 0 || g.surcharge(c) !== null) continue
        if (this.distance(u) >= R + v.tailleAffichee[u]! * 0.5) continue
        vus.add(c)
        const debut = this.candidates.get(c)
        if (debut === undefined) this.candidates.set(c, t)
        else if (t - debut >= dOuv) {
          this.candidates.delete(c)
          this.suivies.set(c, 0)
          g.ouvrir(c)
          change = true
        }
      }
      for (const c of [...this.candidates.keys()]) if (!vus.has(c)) this.candidates.delete(c)
    } else this.candidates.clear()
    if (change) v.demanderRendu()
  }

  /** Calque dessous : ombre portée douce, voile très léger (la loupe « flotte »). */
  dessous = ({ ctx, vue }: ContexteDessin): void => {
    const I = this.intensite
    if (I < 0.01) return
    const { x, y } = this
    const r = this.rayon
    const pal = vue.palette
    const sombre = vue.reglages.valeurs.theme === 'sombre'
    const ombre = ctx.createRadialGradient(x, y, r * 0.97, x, y, r + 26)
    ombre.addColorStop(0, rgba(sombre ? '#000000' : pal.texte, (sombre ? 0.45 : 0.07) * I))
    ombre.addColorStop(1, rgba(sombre ? '#000000' : pal.texte, 0))
    ctx.fillStyle = ombre
    ctx.beginPath()
    ctx.arc(x, y, r + 26, 0, Math.PI * 2)
    ctx.arc(x, y, r, 0, Math.PI * 2, true)
    ctx.fill()
    ctx.fillStyle = rgba(pal.fond, 0.55 * I)
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  /** Calque dessus : cercle gradué et étiquette des niveaux ouverts. */
  dessus = ({ ctx, vue }: ContexteDessin): void => {
    const I = this.intensite
    if (I < 0.01) return
    const { x, y } = this
    const r = this.rayon
    const pal = vue.palette
    ctx.save()
    const oc = lire<number>(vue, 'opaciteCercle')
    ctx.strokeStyle = rgba(this.epinglee ? pal.accent : pal.texte, (this.epinglee ? 1 : 0.7) * oc * I)
    ctx.lineWidth = this.epinglee ? 1.6 : 1.2
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2
      const l = k % 6 === 0 ? 7 : 3
      ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
      ctx.lineTo(x + Math.cos(a) * (r + l), y + Math.sin(a) * (r + l))
    }
    ctx.stroke()
    const base = Math.floor(vue.granularite.globale + 1e-3)
    const jusque = Math.min(3, base + lire<number>(vue, 'profondeurLentille'))
    const texte = `${this.epinglee ? 'épinglée · ' : ''}${NOMS_NIVEAUX[base]} → ${NOMS_NIVEAUX[jusque].toLowerCase()}`
    ctx.font = `500 10.5px ${pal.police}`
    const w = ctx.measureText(texte).width + 12
    const a = -Math.PI / 4
    let tx = x + Math.cos(a) * (r + 10), ty = y + Math.sin(a) * (r + 10) - 16
    if (tx + w > vue.rendu.largeur - 8) tx = x - Math.cos(a) * (r + 10) - w
    if (ty < 8) ty = y + r + 10
    ctx.globalAlpha = I
    ctx.fillStyle = pal.fond
    ctx.strokeStyle = this.epinglee ? rgba(pal.accent, 0.6) : rgba(pal.texte, 0.14)
    ctx.beginPath()
    ctx.roundRect(tx, ty, w, 18, 9)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = this.epinglee ? pal.accent : pal.texteDoux
    ctx.textBaseline = 'middle'
    ctx.fillText(texte, tx + 6, ty + 9.5)
    ctx.restore()
  }
}
