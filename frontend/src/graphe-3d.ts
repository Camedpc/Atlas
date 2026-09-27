// Mode 3D d'une figure (scène Plotly animée, atlas/figures3d.py), ouvert au double-clic sur sa case.
//
// Entrée : la vue 2D cadre la case, puis devient le plancher de la scène : pendant que la caméra de la scène descend de
// la verticale jusqu'à une vue plongeante (environ 30°), la vue 2D bascule en perspective CSS autour de la case, recule
// et se voile jusqu'à ne laisser qu'un disque estompé autour de la case ; la scène apparaît par-dessus, puis
// l'animation tourne en boucle. Le plancher suit ensuite la caméra (inclinaison, rotation, recul) : c'est un effet de
// style, pas la projection exacte de Plotly. Caméra fixe, que l'on peut tourner en glissant à la souris (et zoomer à la molette).
// Commandes : lecture / pause (Espace), vitesse ×0,5 / ×1 / ×2 (retenue), fermer (Échap, ×, double-clic).
// Appliquer une image redessine la scène avec la caméra de la mise en page, que Plotly ne met à jour qu'à la fin d'un
// geste : pendant qu'on tient la souris (ou qu'on tourne la molette), l'animation attend donc, puis la caméra laissée
// par le geste (plotly_relayout) est reprise dans la mise en page avant de repartir.
//
// Le graphe est figé pendant ce temps : la couche prend tous les événements et ne les laisse pas remonter à la vue.
// plotly.js (build gl3d, ~1,7 Mo) n'est chargé qu'à la première ouverture. Les images ne sont pas jouées par Plotly
// mais par une horloge commune, qui applique chaque image quand elle change (une seule en cours à la fois).

import './graphe-3d.css'
import type { FigureVue, SceneFigure } from './api'
import { animer } from './graphe-animation'
import { htmlTitreFigure } from './graphe-figures'

export const VITESSES = [0.5, 1, 2] as const
const CLE_VITESSE = 'atlas.vitesse3d'
/** Retour du plancher à plat, à la fermeture (ms). */
const DUREE_BASCULE = 450
const DUREE_CAMERA = 1200
const PERSPECTIVE = 1000
/** Plancher final : recul, opacité, et fondu en ellipse autour de la case, en fractions de l'ellipse qui touche les
 * bords de la vue (1 : le fondu s'éteint juste au bord, sans arête visible). */
const ECHELLE_PLANCHER = 0.85
const OPACITE_PLANCHER = 1
const FONDU_DEBUT = 0.55
const FONDU_FIN = 0.99
/** Champ vertical de la caméra de Plotly (gl-plot3d : π/4). */
const CHAMP_PLOTLY = Math.PI / 4
/** Case de la figure sur le plancher, rapportée à la base de la boîte : plus grande, pour que la scène tienne dans sa
 * case (le bandeau du titre et la marge compris). */
const CASE_SUR_BASE = 3

// Caméra (unités de la scène Plotly, centre en 0) : descente de la verticale jusqu'à 30°, en tournant de 45° (de face,
// l'axe x parallèle à l'horizontale de la case, à trois-quarts).
const AZIMUT_DEPART = -Math.PI / 2
const AZIMUT = -Math.PI / 4
const ELEVATION_DEPART = (86 * Math.PI) / 180
const ELEVATION_FIN = (30 * Math.PI) / 180
const DISTANCE_DEPART = 3.6
const DISTANCE_FIN = 3.0

/** Image à montrer au temps `t` (s) : la boucle de `n` images à `fps` ; −1 pour une scène sans animation. */
export function imageA(t: number, fps: number, n: number): number {
  if (n <= 0) return -1
  const i = Math.floor(t * fps) % n
  return i < 0 ? i + n : i
}

/** Œil de la caméra à l'avancement `u` (0 : presque à la verticale, 1 : vue plongeante). */
export function oeil(u: number): { x: number; y: number; z: number } {
  const el = ELEVATION_DEPART + (ELEVATION_FIN - ELEVATION_DEPART) * u
  const d = DISTANCE_DEPART + (DISTANCE_FIN - DISTANCE_DEPART) * u
  const az = AZIMUT_DEPART + (AZIMUT - AZIMUT_DEPART) * u
  return { x: d * Math.cos(el) * Math.cos(az), y: d * Math.cos(el) * Math.sin(az), z: d * Math.sin(el) }
}

type Oeil = { x: number; y: number; z: number }

/** Plancher : la vue 2D inclinée sous la scène (degrés, facteurs), `voile` de 0 (net partout) à 1 (disque estompé), et
 * `abaissement` (px d'écran) qui le descend du centre de la boîte de Plotly jusque sous sa face du bas. */
export interface Plancher {
  inclinaison: number
  rotation: number
  echelle: number
  opacite: number
  voile: number
  abaissement: number
}

export const PLANCHER_NEUTRE: Plancher = { inclinaison: 0, rotation: 0, echelle: 1, opacite: 1, voile: 0, abaissement: 0 }

/** Où tombe à l'écran, sous le centre de la boîte, le centre de sa face du bas (px) : Plotly centre sa boîte sur le point
 * visé, avec une demi-hauteur de aspectratio.z / 2 ; caméra en perspective de champ vertical π/4 sur `hauteurPx`. */
export function sousLaBoite(e: Oeil, demiHauteur: number, hauteurPx: number): number {
  const distance = Math.hypot(e.x, e.y, e.z)
  const elevation = Math.atan2(e.z, Math.hypot(e.x, e.y))
  const focale = hauteurPx / 2 / Math.tan(CHAMP_PLOTLY / 2)
  return (focale * demiHauteur * Math.cos(elevation)) / (distance + demiHauteur * Math.sin(elevation))
}

/** Largeur à l'écran (px) du bas de la boîte de Plotly, vu de l'œil `e` : sa base (aspectratio x × y, centrée, à
 * `demiHauteur` sous le centre) vue de travers selon l'azimut de l'œil. Sert à agrandir le plancher pour que la case de
 * la figure ait la taille de la base de la boîte. */
export function largeurBase(e: Oeil, largeurX: number, demiHauteur: number, hauteurPx: number): number {
  const distance = Math.hypot(e.x, e.y, e.z)
  const elevation = Math.atan2(e.z, Math.hypot(e.x, e.y))
  const focale = hauteurPx / 2 / Math.tan(CHAMP_PLOTLY / 2)
  // Le plancher tourne avec la caméra : l'horizontale de la case reste parallèle à l'axe x de la boîte, dont la
  // longueur se compare donc dans le plan du plancher, sans raccourci de biais.
  return (focale * largeurX) / (distance + demiHauteur * Math.sin(elevation))
}

/** Plancher pour un œil de caméra, à l'avancement `u` de l'entrée : incliné de 90° moins l'élévation de l'œil, tourné
 * comme l'œil autour de la verticale, reculé quand l'œil s'éloigne (molette). */
export function plancher(e: Oeil, u: number): Plancher {
  const horizontal = Math.hypot(e.x, e.y)
  const distance = Math.hypot(horizontal, e.z)
  const reference = DISTANCE_DEPART + (DISTANCE_FIN - DISTANCE_DEPART) * u
  return {
    inclinaison: 90 - (Math.atan2(e.z, horizontal) * 180) / Math.PI,
    // Rotation nulle vue de face (œil vers −y) : l'axe x de la boîte suit alors l'horizontale de la case.
    rotation: ((Math.atan2(e.y, e.x) - AZIMUT_DEPART) * 180) / Math.PI,
    echelle: (1 + (ECHELLE_PLANCHER - 1) * u) * (reference / distance),
    opacite: 1 + (OPACITE_PLANCHER - 1) * u,
    voile: u,
    abaissement: 0,
  }
}

/** Mélange de deux planchers (k = 0 : `a`, k = 1 : `b`). */
export function melanger(a: Plancher, b: Plancher, k: number): Plancher {
  const m = (x: number, y: number) => x + (y - x) * k
  return {
    inclinaison: m(a.inclinaison, b.inclinaison),
    rotation: m(a.rotation, b.rotation),
    echelle: m(a.echelle, b.echelle),
    opacite: m(a.opacite, b.opacite),
    voile: m(a.voile, b.voile),
    abaissement: m(a.abaissement, b.abaissement),
  }
}

function vitesseRetenue(): number {
  try {
    const v = Number(localStorage.getItem(CLE_VITESSE))
    return (VITESSES as readonly number[]).includes(v) ? v : 1
  } catch {
    return 1
  }
}

function retenirVitesse(v: number): void {
  try {
    localStorage.setItem(CLE_VITESSE, String(v))
  } catch {
    // Navigation privée, stockage bloqué : la vitesse vaut pour cette ouverture seulement.
  }
}

export interface OptionsMode3D {
  /** La scène de la vue du graphe : la couche 3D s'y ajoute. */
  scene: HTMLElement
  /** Ce qui devient le plancher (canevas et couche HTML de la vue). */
  calques: HTMLElement[]
  figure: FigureVue
  numero: string
  charger: () => Promise<SceneFigure>
  /** Cadre la case de la figure ; renvoie son centre et sa largeur à l'écran (px de la scène), null si elle n'est pas
   * visible. */
  cadrer: () => Promise<{ x: number; y: number; largeur: number } | null>
  surFermer: () => void
}

type Plotly = (typeof import('plotly.js-gl3d-dist-min'))['default']

/** Ouvre le mode 3D ; renvoie sa fermeture. */
export function ouvrir3d(o: OptionsMode3D): () => void {
  const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches
  const couche = document.createElement('div')
  couche.className = 'gr-3d'
  couche.setAttribute('role', 'dialog')
  couche.setAttribute('aria-modal', 'true')
  couche.setAttribute('aria-label', `Figure ${o.numero} en 3D`)
  couche.innerHTML = `
    <div class="gr-3d-trace"></div>
    <header class="gr-3d-tete"><span class="gr-3d-titre">${htmlTitreFigure(o.numero, o.figure.titre)}</span></header>
    <p class="gr-3d-etat" role="status">Chargement de la scène…</p>
    <div class="gr-3d-barre" role="toolbar" aria-label="Animation">
      <button type="button" class="gr-3d-lecture" aria-label="Pause" title="Pause (Espace)">❚❚</button>
      <span class="gr-3d-vitesses" role="group" aria-label="Vitesse">${VITESSES.map((v) =>
        `<button type="button" data-vitesse="${v}">×${String(v).replace('.', ',')}</button>`).join('')}</span>
      <button type="button" class="gr-3d-fermer" aria-label="Fermer" title="Fermer (Échap)">×</button>
    </div>`
  const trace = couche.querySelector<HTMLElement>('.gr-3d-trace')!
  const etat = couche.querySelector<HTMLElement>('.gr-3d-etat')!
  const lecture = couche.querySelector<HTMLButtonElement>('.gr-3d-lecture')!
  const boutonsVitesse = [...couche.querySelectorAll<HTMLButtonElement>('[data-vitesse]')]

  let ouvert = true
  let plotly: Plotly | null = null
  let boucle = 0
  let camera: ReturnType<typeof animer> | null = null
  /** Descente de la caméra en cours : c'est elle qui pose le plancher. */
  let animation = false
  let pause = false
  let vitesse = vitesseRetenue()
  // Plancher : centre de la case (px de la scène), décalage vers le centre de la scène 3D, état posé.
  let centre = { x: 0, y: 0 }
  let decalage = { x: 0, y: 0 }
  let pose: Plancher = PLANCHER_NEUTRE
  const poser = (p: Plancher) => {
    pose = p
    // Ellipse qui touche, depuis la case, le bord le plus proche dans chaque direction (closest-side) : le fondu va
    // aussi loin que le canevas le permet. Voile nul : tout est net ; voile 1 : net jusqu'à FONDU_DEBUT, effacé à
    // FONDU_FIN.
    const debut = 100 * FONDU_DEBUT + 1000 * (1 - p.voile)
    const fin = 100 * FONDU_FIN + 1500 * (1 - p.voile)
    const masque = `radial-gradient(closest-side at ${centre.x}px ${centre.y}px, #000 ${debut}%, transparent ${fin}%)`
    const transformation = `translate(${decalage.x * p.voile}px, ${decalage.y * p.voile + p.abaissement}px) `
      + `perspective(${PERSPECTIVE}px) rotateX(${p.inclinaison}deg) rotateZ(${p.rotation}deg) scale(${p.echelle})`
    for (const c of o.calques) {
      c.style.transformOrigin = `${centre.x}px ${centre.y}px`
      c.style.transform = transformation
      c.style.opacity = String(p.opacite)
      c.style.maskImage = c.style.webkitMaskImage = masque
    }
  }
  const nettoyerPlancher = () => {
    for (const c of o.calques) {
      c.style.transformOrigin = c.style.transform = c.style.opacity = ''
      c.style.maskImage = c.style.webkitMaskImage = ''
    }
  }
  const observateur = new ResizeObserver(() => {
    if (plotly && trace.isConnected) void plotly.Plots.resize(trace)
  })

  const montrerVitesse = () => {
    for (const b of boutonsVitesse) b.setAttribute('aria-pressed', String(Number(b.dataset.vitesse) === vitesse))
  }
  const montrerLecture = () => {
    lecture.textContent = pause ? '▶' : '❚❚'
    lecture.setAttribute('aria-label', pause ? 'Lecture' : 'Pause')
    lecture.title = `${pause ? 'Lecture' : 'Pause'} (Espace)`
  }
  montrerVitesse()
  for (const b of boutonsVitesse) {
    b.addEventListener('click', () => {
      vitesse = Number(b.dataset.vitesse)
      retenirVitesse(vitesse)
      montrerVitesse()
    })
  }
  lecture.addEventListener('click', () => {
    pause = !pause
    montrerLecture()
  })

  const fermer = () => {
    if (!ouvert) return
    ouvert = false
    cancelAnimationFrame(boucle)
    camera?.arreter()
    observateur.disconnect()
    document.removeEventListener('keydown', clavier, true)
    document.removeEventListener('pointerup', relacher, true)
    document.removeEventListener('pointercancel', relacher, true)
    couche.classList.remove('gr-3d-visible')
    o.scene.classList.remove('gr-scene-3d')
    // Le plancher revient à plat pendant que la scène s'efface.
    const depart = pose
    const retour = animer(
      (k) => poser(melanger(depart, PLANCHER_NEUTRE, k)),
      () => poser(PLANCHER_NEUTRE),
      reduit ? 0 : DUREE_BASCULE,
    )
    void retour.promesse.then(() => {
      if (plotly) plotly.purge(trace)
      couche.remove()
      nettoyerPlancher()
    })
    o.surFermer()
  }

  const clavier = (e: KeyboardEvent) => {
    if (e.key === 'Escape') fermer()
    else if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) {
      pause = !pause
      montrerLecture()
    } else return
    e.preventDefault()
    e.stopPropagation()
  }
  document.addEventListener('keydown', clavier, true)
  couche.querySelector('.gr-3d-fermer')!.addEventListener('click', fermer)
  couche.addEventListener('dblclick', fermer)
  // Le graphe est figé : rien ne remonte à la vue (glisser, molette, clavier, menu contextuel).
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'click', 'dblclick', 'wheel', 'keydown', 'contextmenu']) {
    couche.addEventListener(type, (e) => {
      e.stopPropagation()
      if (type === 'contextmenu') e.preventDefault()
    })
  }

  // Geste en cours sur la scène (glisser, molette) : l'animation attend.
  let tenu = false
  let libreA = 0
  const relacher = () => (tenu = false)
  trace.addEventListener('pointerdown', () => (tenu = true), true)
  trace.addEventListener('wheel', () => (libreA = performance.now() + 400), true)
  document.addEventListener('pointerup', relacher, true)
  document.addEventListener('pointercancel', relacher, true)

  /** Joue la boucle : une horloge commune (vitesse, pause), une image appliquée à la fois. */
  const jouer = (p: Plotly, fps: number, n: number) => {
    if (n <= 0) return
    let t = 0
    let courante = -1
    let enCours = false
    let avant = performance.now()
    const tic = (maintenant: number) => {
      if (!ouvert) return
      // Onglet caché puis revenu : pas de bond.
      const dt = Math.min(0.1, Math.max(0, (maintenant - avant) / 1000))
      avant = maintenant
      const geste = tenu || maintenant < libreA
      if (!pause && !geste) t += dt * vitesse
      const i = imageA(t, fps, n)
      if (i !== courante && !enCours && !geste) {
        courante = i
        enCours = true
        const options = { frame: { duration: 0, redraw: true }, transition: { duration: 0 }, mode: 'immediate' }
        void p.animate(trace, [String(i)], options).catch(() => {}).finally(() => (enCours = false))
      }
      boucle = requestAnimationFrame(tic)
    }
    boucle = requestAnimationFrame(tic)
  }

  const entrer = async () => {
    const scene = o.charger()
    const module = import('plotly.js-gl3d-dist-min')
    o.scene.append(couche)
    lecture.focus({ preventScroll: true })
    const case_ = await o.cadrer()
    if (!ouvert) return
    // Case hors de la vue (cadrage interrompu, vue qui se recadre) : le plancher tourne autour du milieu, sans être
    // mis à la taille de la boîte.
    const [w, h] = [o.scene.clientWidth, o.scene.clientHeight]
    const visible = case_ && case_.x >= 0 && case_.x <= w && case_.y >= 0 && case_.y <= h ? case_ : null
    centre = visible ?? { x: w / 2, y: h / 2 }
    o.scene.classList.add('gr-scene-3d')
    poser(PLANCHER_NEUTRE)
    couche.classList.add('gr-3d-visible')

    let donnees: SceneFigure
    try {
      ;[plotly, donnees] = await Promise.all([module.then((m) => m.default), scene])
    } catch (e) {
      etat.textContent = `Scène indisponible : ${e instanceof Error ? e.message : String(e)}`
      return
    }
    if (!ouvert) return
    const p = plotly
    const { figure, atlas } = donnees
    const layout: Record<string, unknown> = { ...figure.layout }
    delete layout.title // le titre est celui de la figure, dans l'en-tête
    // Fond de scène transparent (le plancher se voit autour de la boîte) ; les parois et la grille restent celles de
    // l'agent.
    layout.scene = {
      ...(layout.scene as Record<string, unknown> | undefined),
      bgcolor: 'rgba(0,0,0,0)',
      camera: { eye: oeil(reduit ? 1 : 0), up: { x: 0, y: 0, z: 1 } },
    }
    // Marges : le titre en haut, la barre de commandes en bas (les graphiques 2D ne passent pas dessous).
    const marges = { l: 12, r: 12, t: 44, b: 64 }
    Object.assign(layout, {
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      autosize: true,
      margin: marges,
      // Garde la caméra tournée par l'utilisateur d'une image à l'autre.
      uirevision: 'atlas',
    })
    const config = { displayModeBar: false, displaylogo: false, responsive: true, doubleClick: false, scrollZoom: true }
    const graphique = await p.newPlot(trace, figure.data, layout, config)
    if (!ouvert) return p.purge(trace)
    // Le plancher glisse sous le centre de la scène 3D (qui n'est pas au milieu si l'agent a mis des graphiques 2D).
    const domaine = (layout.scene as { domain?: { x?: number[]; y?: number[] } }).domain ?? {}
    const [x0 = 0, x1 = 1] = domaine.x ?? []
    const [y0 = 0, y1 = 1] = domaine.y ?? []
    const largeur = couche.clientWidth - marges.l - marges.r
    const hauteur = couche.clientHeight - marges.t - marges.b
    decalage = {
      x: marges.l + largeur * ((x0 + x1) / 2) - centre.x,
      y: marges.t + hauteur * (1 - (y0 + y1) / 2) - centre.y,
    }
    // Plotly réécrit dans la mise en page les proportions de la boîte qu'il a retenues.
    const lues = (graphique.layout.scene as { aspectratio?: { x?: number; y?: number; z?: number } } | undefined)
      ?.aspectratio
    const largeurX = lues?.x ?? 1
    const demiHauteur = (lues?.z ?? 1) / 2
    const hauteurScene = hauteur * (y1 - y0)
    // La case de la figure, sur le plancher, prend la taille de la base de la boîte : la scène couvre sa case, et les
    // nœuds voisins restent visibles autour (à la molette, le plancher suit le zoom).
    const plancherPour = (e: Oeil, u: number): Plancher => {
      const p = plancher(e, u)
      const cible = visible
        ? (CASE_SUR_BASE * largeurBase(e, largeurX, demiHauteur, hauteurScene)) / visible.largeur
        : p.echelle
      return { ...p, echelle: 1 + (cible - 1) * u, abaissement: sousLaBoite(e, demiHauteur, hauteurScene) }
    }
    const suivreCamera = (e: Record<string, unknown>, fin: boolean) => {
      const camera = e['scene.camera'] as { eye?: Oeil } | undefined
      const reglages = graphique.layout.scene as Record<string, unknown> | undefined
      if (fin && camera && reglages) reglages.camera = camera
      if (camera?.eye && !animation) poser(plancherPour(camera.eye, 1))
    }
    graphique.on('plotly_relayout', (e) => suivreCamera(e, true))
    // Pendant le geste : le plancher suit, sans toucher à la mise en page (Plotly l'écrit à la fin).
    graphique.on('plotly_relayouting', (e) => suivreCamera(e, false))
    const images = figure.frames.map((f, i) => {
      const image: Record<string, unknown> = { ...f, name: String(i) }
      // Une caméra dans une image la ferait sauter à chaque tour de boucle.
      const scene = (f.layout?.scene ?? null) as Record<string, unknown> | null
      if (scene && 'camera' in scene) image.layout = { ...f.layout, scene: { ...scene, camera: undefined } }
      return image
    })
    if (images.length) await p.addFrames(trace, images)
    else couche.classList.add('gr-3d-fixe')
    etat.textContent = ''
    observateur.observe(couche)
    if (!ouvert) return
    if (reduit) poser(plancherPour(oeil(1), 1))
    else {
      animation = true
      const pas = (u: number) => {
        void p.relayout(trace, { 'scene.camera.eye': oeil(u) })
        poser(plancherPour(oeil(u), u))
      }
      camera = animer(pas, () => pas(1), DUREE_CAMERA)
      await camera.promesse
      camera = null
      animation = false
    }
    if (ouvert) jouer(p, atlas.fps, images.length)
  }
  void entrer()
  return fermer
}
