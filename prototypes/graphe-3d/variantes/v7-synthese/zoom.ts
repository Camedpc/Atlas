// Zoom sémantique (repris de V2, en option) : la granularité suit le zoom de la caméra.
// Facteur z = pixels par unité × 2 / min(L, H) (≈ 1 quand la carte remplit l'écran).
//   · « paliers » : niveau entier, changé avec hystérésis puis transition animée ;
//   · « continu » : g = Σ smoothstep autour de chaque seuil (en log) : zoomer fait défiler la transition ;
//   · « manuel » (défaut) : le curseur de granularité garde la main.
// Toucher au curseur de granularité ou aux touches [ ] repasse en manuel.

import { smoothstep, type VueGraphe } from '../../src/core'
import { lire } from './reglages'

export type ModeZoom = 'manuel' | 'paliers' | 'continu'

export class ZoomSemantique {
  private niveau = -1

  constructor(private vue: VueGraphe) {
    vue.on('image', () => this.mettreAJour())
    vue.on('reglage', ({ cle }) => {
      if (cle === 'zoomSemantique' || cle.startsWith('seuil') || cle === 'hysteresis' || cle === 'largeurContinu') {
        this.niveau = -1
        this.mettreAJour()
      }
    })
    // Reprise en main manuelle : curseur de granularité, boutons − / +, touches [ ].
    const manuel = () => this.mode !== 'manuel' && vue.reglages.definir('zoomSemantique', 'manuel')
    vue.racine.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest?.('.atlas-gran')) manuel()
    }, { capture: true })
    window.addEventListener('keydown', (e) => {
      if (e.key === '[' || e.key === ']') manuel()
    }, { capture: true })
  }

  get mode(): ModeZoom {
    return lire<ModeZoom>(this.vue, 'zoomSemantique')
  }

  facteur(): number {
    const c = this.vue.camera
    return (c.pixelsParUnite() * 2) / Math.min(c.largeur, c.hauteur)
  }

  private seuils(): [number, number, number] {
    const v = this.vue
    return [lire<number>(v, 'seuilThemes'), lire<number>(v, 'seuilSousThemes'), lire<number>(v, 'seuilNoeuds')]
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
      const w = lire<number>(this.vue, 'largeurContinu')
      const lz = Math.log(z)
      let g = 0
      for (const t of T) g += smoothstep(Math.log(t) - w, Math.log(t) + w, lz)
      if (Math.abs(g - this.vue.granularite.globale) > 0.002) this.vue.definirGranularite(g, false)
      return
    }
    const h = lire<number>(this.vue, 'hysteresis')
    let L = this.niveau < 0 ? T.filter((t) => z >= t).length : this.niveau
    while (L < 3 && z > T[L]! * (1 + h)) L++
    while (L > 0 && z < T[L - 1]! * (1 - h)) L--
    if (L !== this.niveau) {
      this.niveau = L
      if (Math.abs(this.vue.granularite.globale - L) > 1e-3) this.vue.definirGranularite(L, true)
    }
  }
}
