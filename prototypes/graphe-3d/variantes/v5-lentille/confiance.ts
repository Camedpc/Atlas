// Encodage de la confiance :
//   - bordure colorée par statut, épaisseur = certitude (1 − largeur de l'intervalle) ;
//   - remplissage = teinte adoucie du statut (la bordure reste l'information forte) ;
//   - arc fin autour du nœud = intervalle [bas, haut] sur un cadran (0 en haut, sens horaire),
//     petit trait = estimation ;
//   - badge de validation (IA / H / IA+H) près du nœud au survol et quand le zoom le permet ;
//   - agrégats : anneau segmenté par la répartition des statuts de leurs feuilles actives.

import {
  melangerCouleurs, rgba, STATUTS,
  type ContexteDessin, type ReducteurNoeud, type Statut, type Validation, type VueGraphe,
} from '../../src/core'

const TEXTE_BADGE: Record<Validation, string> = { aucune: '', ia: 'IA', humain: 'H', ia_humain: 'IA+H' }

export class Confiance {
  /** Par catégorie × statut : nombre de feuilles actives. */
  private statutsCat: Int32Array
  private teintes = new Map<string, string>()

  constructor(private vue: VueGraphe) {
    this.statutsCat = new Int32Array(vue.h.nC * 3)
    this.recompter()
    vue.on('filtres', () => this.recompter())
    vue.on('theme', () => this.teintes.clear())
    vue.on('reglage', ({ cle }) => cle === 'teinteRemplissage' && this.teintes.clear())
  }

  private recompter(): void {
    const { h, filtres } = this.vue
    this.statutsCat.fill(0)
    for (let f = 0; f < h.nF; f++) {
      if (!filtres.actives[f]) continue
      const k = STATUTS.indexOf(h.noeuds[f]!.statut)
      for (let i = 0; i < 3; i++) this.statutsCat[h.chaine[f * 3 + i]! * 3 + k]!++
    }
  }

  /** Teinte de remplissage d'un statut (mise en cache : sigma garde chaque couleur vue). */
  teinte(s: Statut): string {
    let c = this.teintes.get(s)
    if (!c) {
      const p = this.vue.palette
      c = melangerCouleurs(p.statut[s], p.fond, this.vue.reglages.lire<number>('teinteRemplissage'))
      this.teintes.set(s, c)
    }
    return c
  }

  readonly reducteur: ReducteurNoeud = (info, a, vue) => {
    const n = info.noeud
    if (!n) return
    const R = vue.reglages
    a.couleur = this.teinte(n.statut)
    // La lignée impose ses couleurs de bordure ; sinon bordure = statut, épaisseur = certitude.
    if (info.lignee === 'aucune' || info.lignee === 'hors') {
      const certitude = Math.max(0, Math.min(1, 1 - (n.confiance.haut - n.confiance.bas)))
      const min = R.lire<number>('bordureMin'), max = R.lire<number>('bordureMax')
      a.couleurBordure = vue.palette.statut[n.statut]
      a.tailleBordure = min + (max - min) * certitude
    }
  }

  /** Vrai si la feuille f mérite ses détails même petite (survol, voisinage, sélection). */
  private misEnAvant(f: number): boolean {
    const v = this.vue
    return v.survol === f || v.voisinsSurvol.has(f) || v.lignee.selection === f
  }

  /** Calque dessus : arcs d'intervalle, anneaux d'agrégats, badges de validation. */
  readonly dessiner = ({ ctx, vue, projection: p }: ContexteDessin): void => {
    const R = vue.reglages
    const { h, palette } = vue
    const op = vue.opaciteAffichee, taille = vue.tailleAffichee

    // Anneaux segmentés des agrégats.
    if (R.lire<boolean>('anneauAgregat')) {
      const ep = R.lire<number>('epaisseurAnneau')
      ctx.lineWidth = ep
      ctx.lineCap = 'butt'
      for (let c = 0; c < h.nC; c++) {
        const u = h.nF + c
        const o = op[u]!
        if (o < 0.15) continue
        const total = this.statutsCat[c * 3]! + this.statutsCat[c * 3 + 1]! + this.statutsCat[c * 3 + 2]!
        if (!total) continue
        const r = taille[u]! + 2 + ep / 2
        const ecart = Math.min(0.12, 2 / r) // ≈ 2 px d'espace entre segments
        let a0 = -Math.PI / 2
        for (let k = 0; k < 3; k++) {
          const n = this.statutsCat[c * 3 + k]!
          if (!n) continue
          const da = (n / total) * Math.PI * 2
          ctx.strokeStyle = rgba(palette.statut[STATUTS[k]!], 0.9 * o)
          ctx.beginPath()
          ctx.arc(p.x[u]!, p.y[u]!, r, a0 + ecart / 2, a0 + Math.max(ecart / 2 + 0.01, da - ecart / 2))
          ctx.stroke()
          a0 += da
        }
      }
    }

    // Arcs d'intervalle de confiance (un chemin par statut pour rester rapide).
    if (R.lire<boolean>('arcConfiance')) {
      const seuil = R.lire<number>('seuilArc')
      const ep = R.lire<number>('epaisseurArc')
      const chemins: Record<Statut, Path2D> = { valide: new Path2D(), incertain: new Path2D(), refute: new Path2D() }
      const piste = new Path2D(), estim = new Path2D()
      const TOUR = Math.PI * 2, HAUT = -Math.PI / 2
      for (let f = 0; f < h.nF; f++) {
        if (op[f]! < 0.3) continue
        const r0 = taille[f]!
        if (r0 < seuil && !this.misEnAvant(f)) continue
        const n = h.noeuds[f]!
        const x = p.x[f]!, y = p.y[f]!
        const r = r0 + 1.5 + ep / 2
        piste.moveTo(x + r, y)
        piste.arc(x, y, r, 0, TOUR)
        const c = chemins[n.statut]
        const a0 = HAUT + TOUR * n.confiance.bas, a1 = HAUT + TOUR * Math.max(n.confiance.haut, n.confiance.bas + 0.02)
        c.moveTo(x + r * Math.cos(a0), y + r * Math.sin(a0))
        c.arc(x, y, r, a0, a1)
        const ae = HAUT + TOUR * n.confiance.estimation
        estim.moveTo(x + (r - ep) * Math.cos(ae), y + (r - ep) * Math.sin(ae))
        estim.lineTo(x + (r + ep + 1.5) * Math.cos(ae), y + (r + ep + 1.5) * Math.sin(ae))
      }
      ctx.lineCap = 'round'
      ctx.lineWidth = ep
      ctx.strokeStyle = rgba(palette.texte, 0.08)
      ctx.stroke(piste)
      for (const s of STATUTS) {
        ctx.strokeStyle = rgba(palette.statut[s], 0.95)
        ctx.stroke(chemins[s])
      }
      ctx.lineWidth = 1
      ctx.strokeStyle = rgba(palette.texte, 0.75)
      ctx.stroke(estim)
    }

    // Badges de validation.
    if (R.lire<boolean>('badges')) {
      const seuil = R.lire<number>('seuilBadge')
      const max = R.lire<number>('maxBadges')
      const liste: number[] = []
      const W = vue.rendu.largeur, H = vue.rendu.hauteur
      for (let f = 0; f < h.nF; f++) {
        if (op[f]! < 0.3 || h.noeuds[f]!.validation === 'aucune') continue
        const x = p.x[f]!, y = p.y[f]!
        if (x < 0 || y < 0 || x > W || y > H) continue
        if (taille[f]! >= seuil || vue.survol === f || vue.voisinsSurvol.has(f) || vue.lignee.selection === f) liste.push(f)
      }
      // Priorité : survolé, puis voisins, puis les plus gros.
      const rang = (f: number) => (vue.survol === f ? 1e6 : vue.voisinsSurvol.has(f) ? 1e5 : 0) + taille[f]!
      liste.sort((a, b) => rang(b) - rang(a))
      ctx.font = `600 9px ${palette.police}`
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'
      for (const f of liste.slice(0, max)) {
        const v = h.noeuds[f]!.validation
        const texte = TEXTE_BADGE[v]
        const r = taille[f]!
        const w = ctx.measureText(texte).width + 7, hh = 12
        const bx = p.x[f]! + r * 0.72 + 1, by = p.y[f]! - r * 0.72 - hh - 1
        ctx.globalAlpha = Math.min(1, op[f]! * 1.2)
        ctx.fillStyle = palette.validation[v]
        ctx.strokeStyle = palette.fond
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.roundRect(bx, by, w, hh, 6)
        ctx.stroke()
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.fillText(texte, bx + w / 2, by + hh / 2 + 0.5)
      }
      ctx.globalAlpha = 1
    }
  }
}
