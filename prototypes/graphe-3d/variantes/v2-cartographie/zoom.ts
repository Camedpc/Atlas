// Zoom sémantique : la granularité suit le zoom de la caméra, comme les niveaux d'une carte en ligne.
//
// Facteur de zoom z = pixels par unité monde × 2 / min(largeur, hauteur) : z = 1 quand le carré
// [-1, 1]² remplit la plus petite dimension de l'écran (vue d'ensemble ≈ 0,77).
//   - « paliers » : niveau entier, changé avec hystérésis (on monte au-delà de T·(1 + h), on
//     redescend en deçà de T·(1 − h)), puis transition animée ;
//   - « continu » : g = Σ smoothstep autour de chaque seuil (en log) → zoomer fait défiler la transition ;
//   - « manuel » : le curseur de granularité reprend la main.

import { NOMS_NIVEAUX, smoothstep, type VueGraphe } from '../../src/core'

export type ModeZoom = 'paliers' | 'continu' | 'manuel'

export class ZoomSemantique {
  /** Niveau courant en mode « paliers » (−1 = à déterminer). */
  niveau = -1

  constructor(private vue: VueGraphe) {
    vue.on('image', () => this.mettreAJour())
    vue.on('reglage', ({ cle }) => {
      if (cle === 'zoomSemantique' || cle.startsWith('seuil') || cle === 'hysteresis' || cle === 'largeurContinu') {
        this.niveau = -1
        this.mettreAJour()
      }
    })
  }

  get mode(): ModeZoom {
    return this.vue.reglages.lire<ModeZoom>('zoomSemantique')
  }

  definirMode(m: ModeZoom): void {
    if (m !== this.mode) this.vue.reglages.definir('zoomSemantique', m)
  }

  /** Facteur de zoom courant (1 = le carré de la carte remplit l'écran). */
  facteur(): number {
    const c = this.vue.camera
    return (c.pixelsParUnite() * 2) / Math.min(c.largeur, c.hauteur)
  }

  private seuils(): [number, number, number] {
    const r = this.vue.reglages
    return [r.lire<number>('seuilThemes'), r.lire<number>('seuilSousThemes'), r.lire<number>('seuilNoeuds')]
  }

  /** Niveau que donnerait le zoom z sans hystérésis. */
  niveauBrut(z = this.facteur()): number {
    return this.seuils().filter((t) => z >= t).length
  }

  /** Libellé du niveau affiché (pour la mini-carte). */
  libelle(): string {
    const g = this.vue.granularite.globale
    const n = Math.round(g)
    return Math.abs(g - n) < 0.02 ? NOMS_NIVEAUX[n]! : `${NOMS_NIVEAUX[Math.floor(g)]} → ${NOMS_NIVEAUX[Math.min(3, Math.floor(g) + 1)]}`
  }

  mettreAJour(): void {
    const mode = this.mode
    if (mode === 'manuel') {
      this.niveau = -1
      return
    }
    const z = this.facteur()
    const T = this.seuils()
    if (mode === 'continu') {
      const w = this.vue.reglages.lire<number>('largeurContinu')
      const lz = Math.log(z)
      let g = 0
      for (const t of T) g += smoothstep(Math.log(t) - w, Math.log(t) + w, lz)
      if (Math.abs(g - this.vue.granularite.globale) > 0.002) this.vue.definirGranularite(g, false)
      this.niveau = -1
      return
    }
    const h = this.vue.reglages.lire<number>('hysteresis')
    const premier = this.niveau < 0
    let L = premier ? this.niveauBrut(z) : this.niveau
    while (L < 3 && z > T[L]! * (1 + h)) L++
    while (L > 0 && z < T[L - 1]! * (1 - h)) L--
    if (L !== this.niveau) {
      this.niveau = L
      // Au premier calcul (ou au retour en automatique), on anime aussi : la carte « se règle ».
      if (Math.abs(this.vue.granularite.globale - L) > 1e-3) this.vue.definirGranularite(L, true)
    }
  }
}
