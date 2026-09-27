// Mode 3D d'une figure (scène Plotly animée, atlas/figures3d.py), ouvert au double-clic sur sa case.
//
// Entrée : la vue 2D cadre la case, bascule vers l'arrière (perspective CSS centrée sur la case) et s'efface ; la
// scène apparaît par-dessus, sa caméra descend de la verticale jusqu'à une vue plongeante (environ 30°), puis
// l'animation tourne en boucle. Caméra fixe, que l'on peut tourner en glissant à la souris (et zoomer à la molette).
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
/** Bascule de la vue 2D (ms) ; la scène apparaît pendant sa seconde moitié. */
const DUREE_BASCULE = 450
const DUREE_CAMERA = 900
const BASCULE = 'perspective(900px) rotateX(38deg) scale(1.7)'

// Caméra (unités de la scène Plotly, centre en 0) : de face et un peu de côté, descente de la verticale jusqu'à 30°.
const AZIMUT = -Math.PI / 4
const ELEVATION_DEPART = (86 * Math.PI) / 180
const ELEVATION_FIN = (30 * Math.PI) / 180
const DISTANCE_DEPART = 2.8
const DISTANCE_FIN = 2.35

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
  return { x: d * Math.cos(el) * Math.cos(AZIMUT), y: d * Math.cos(el) * Math.sin(AZIMUT), z: d * Math.sin(el) }
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
  /** Ce qui bascule puis s'efface (canevas et couche HTML de la vue). */
  calques: HTMLElement[]
  figure: FigureVue
  numero: string
  charger: () => Promise<SceneFigure>
  /** Cadre la case de la figure ; renvoie son centre à l'écran (px de la scène), null si elle n'est pas visible. */
  cadrer: () => Promise<{ x: number; y: number } | null>
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
  let pause = false
  let vitesse = vitesseRetenue()
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
    for (const c of o.calques) {
      c.style.transition = `transform ${DUREE_BASCULE}ms ease-out, opacity ${DUREE_BASCULE}ms ease-out`
      c.style.transform = ''
      c.style.opacity = ''
    }
    setTimeout(() => {
      if (plotly) plotly.purge(trace)
      couche.remove()
      for (const c of o.calques) c.style.transition = c.style.transformOrigin = ''
    }, DUREE_BASCULE)
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
    const centre = await o.cadrer()
    if (!ouvert) return
    o.scene.classList.add('gr-scene-3d')
    for (const c of o.calques) {
      if (centre) c.style.transformOrigin = `${centre.x}px ${centre.y}px`
      c.style.transition = `transform ${DUREE_BASCULE}ms ease-in, opacity ${DUREE_BASCULE}ms ease-in`
      c.style.transform = reduit ? '' : BASCULE
      c.style.opacity = '0'
    }
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
    layout.scene = { ...(layout.scene as Record<string, unknown> | undefined), camera: { eye: oeil(reduit ? 1 : 0), up: { x: 0, y: 0, z: 1 } } }
    Object.assign(layout, {
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      autosize: true,
      margin: { l: 0, r: 0, t: 0, b: 0 },
      // Garde la caméra tournée par l'utilisateur d'une image à l'autre.
      uirevision: 'atlas',
    })
    const config = { displayModeBar: false, displaylogo: false, responsive: true, doubleClick: false, scrollZoom: true }
    const graphique = await p.newPlot(trace, figure.data, layout, config)
    if (!ouvert) return p.purge(trace)
    const suivreCamera = (e: Record<string, unknown>) => {
      const camera = e['scene.camera']
      const reglages = graphique.layout.scene as Record<string, unknown> | undefined
      if (camera && reglages) reglages.camera = camera
    }
    graphique.on('plotly_relayout', suivreCamera)
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
    if (!reduit) {
      camera = animer((u) => void p.relayout(trace, { 'scene.camera.eye': oeil(u) }), () => void p.relayout(trace, { 'scene.camera.eye': oeil(1) }), DUREE_CAMERA)
      await camera.promesse
      camera = null
    }
    if (ouvert) jouer(p, atlas.fps, images.length)
  }
  void entrer()
  return fermer
}
