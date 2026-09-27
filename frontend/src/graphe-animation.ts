// Mouvements du pilotage (caméra, déplacements de nœuds) : `pas(u)` de u = 0 à 1 (adouci), puis `final`.
// Chaque pas attend l'image suivante, ou un minuteur si les images tardent (onglet ou panneau qui ne se redessine pas) ;
// un filet pose l'état final si tout s'arrête (onglet caché en cours de route).

export const DUREE_ANIMATION_MS = 450

/** Accélère puis ralentit (cubique). */
export const adoucir = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2)

export interface Animation {
  /** Se résout à la fin du mouvement (ou quand il est arrêté). */
  promesse: Promise<void>
  /** Saute à l'état final. */
  fin: () => void
  /** S'arrête là, sans l'état final (l'utilisateur reprend la main). */
  arreter: () => void
}

const PAS_MAX_MS = 34

export function animer(pas: (u: number) => void, final: () => void, duree = DUREE_ANIMATION_MS): Animation {
  let resoudre!: () => void
  const promesse = new Promise<void>((r) => (resoudre = r))
  const t0 = performance.now()
  let fini = false
  let annulerPas = () => {}
  const programmer = (f: (t: number) => void) => {
    let fait = false
    const lancer = () => {
      if (fait) return
      fait = true
      annulerPas()
      f(performance.now())
    }
    const image = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(lancer) : 0
    const minuteur = setTimeout(lancer, PAS_MAX_MS)
    annulerPas = () => {
      fait = true
      if (image) cancelAnimationFrame(image)
      clearTimeout(minuteur)
    }
  }
  const terminer = (appliquer: boolean) => {
    if (fini) return
    fini = true
    annulerPas()
    clearTimeout(garde)
    if (appliquer) final()
    resoudre()
  }
  const garde = setTimeout(() => terminer(true), duree + 250)
  const suivante = (t: number) => {
    const u = Math.min(1, (t - t0) / duree)
    if (u >= 1) return terminer(true)
    pas(adoucir(u))
    programmer(suivante)
  }
  programmer(suivante)
  return { promesse, fin: () => terminer(true), arreter: () => terminer(false) }
}
