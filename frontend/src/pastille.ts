// Vague de l'appel vocal (visuel retenu sur la branche visu/voix, étendu à toute la largeur de l'écran) : collée
// au bas de l'écran, basse pour ne pas empiéter, sur un blanc qui s'efface vers le haut. Vague montante : ligne de
// zéro plate, barres qui montent. Camille occupe la gauche (rouge), Atlas voix la droite (bleu) ; quand les deux parlent, chaque
// barre prend la couleur de la voix qui y domine.
// Les deux voix sont lues sur de vrais signaux : le micro après l'annulation d'écho (la voix d'Atlas n'y
// apparaît pas) et le son joué par le lecteur.
import './pastille.css'

// Réglages validés par Camille le 2026-09-27 (commit ef6188f de visu/voix), puis vague sur toute la largeur de
// l'écran et moins haute (20 → 12 px) : le nombre de barres suit la largeur de la fenêtre.
const R = {
  largeur: 2,
  ecart: 3,
  hauteurMax: 12,
  pied: 3,
  arrondi: 1,
  opaciteLigne: 1,
  gain: 2,
  attaque: 30,
  relachement: 12,
  centre: 0.2,
  etalement: 0.3,
  traine: 0.03,
  couleurToi: '#dc2626',
  couleurAtlas: '#2563eb',
  couleurRepos: '#d4d4cf',
  couleurLigne: '#e5e5e1',
  margeHaut: 4,
  opaciteFond: 0.96,
}

/** Les deux voix de l'appel, à lire en direct. */
export interface SourcesPastille {
  toi: AnalyserNode
  atlas: AnalyserNode
}

export function analyseur(ctx: AudioContext): AnalyserNode {
  const a = ctx.createAnalyser()
  // Assez fin pour des centaines de barres sur la bande de la voix (~12 Hz par case).
  a.fftSize = 4096
  a.smoothingTimeConstant = 0.6
  return a
}

function melanger(a: string, b: string, t: number): string {
  const ca = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const cb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  return `rgb(${ca.map((x, i) => Math.round(x + (cb[i] - x) * t)).join(',')})`
}

class Vague {
  sources: SourcesPastille | null = null
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private enveloppe = [0, 0]
  private spectres: number[][] = [[], []]
  private affichees: number[] = []
  private donnees: Uint8Array<ArrayBuffer> | null = null
  private n = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.dimensionner(window.innerWidth)
  }

  /** Autant de barres que la largeur en contient ; à rappeler quand la fenêtre change de taille. */
  dimensionner(largeurEcran: number) {
    const n = Math.max(8, Math.floor((largeurEcran + R.ecart) / (R.largeur + R.ecart)))
    const ajuster = (t: number[]) => Array.from({ length: n }, (_, i) => t[i] ?? 0)
    this.spectres = this.spectres.map(ajuster)
    this.affichees = ajuster(this.affichees)
    this.n = n
    const l = n * R.largeur + (n - 1) * R.ecart
    const h = R.hauteurMax + R.pied
    const dpr = window.devicePixelRatio || 1
    this.canvas.width = Math.round(l * dpr)
    this.canvas.height = Math.round(h * dpr)
    this.canvas.style.width = `${l}px`
    this.canvas.style.height = `${h}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  // Place de chaque voix : Camille à gauche, Atlas en miroir à droite.
  private poids(x: number, qui: number): number {
    const u = qui === 0 ? x : 1 - x
    return R.traine + (1 - R.traine) * Math.exp(-(((u - R.centre) / R.etalement) ** 2))
  }

  avancer(dt: number) {
    const sources = this.sources ? [this.sources.toi, this.sources.atlas] : [null, null]
    sources.forEach((a, q) => {
      const niveau = a ? this.lire(a, this.spectres[q]) : 0
      const k = niveau > this.enveloppe[q] ? 18 : 6
      this.enveloppe[q] += (niveau - this.enveloppe[q]) * Math.min(1, k * dt)
    })
    this.dessiner(dt)
  }

  // Bande de la voix (~90 Hz – 4 kHz) en échelle logarithmique sur les barres ; renvoie le niveau global.
  private lire(a: AnalyserNode, sortie: number[]): number {
    if (!this.donnees || this.donnees.length !== a.frequencyBinCount) this.donnees = new Uint8Array(a.frequencyBinCount)
    const donnees = this.donnees
    a.getByteFrequencyData(donnees)
    const hzParCase = a.context.sampleRate / a.fftSize
    const bas = Math.floor(90 / hzParCase)
    const haut = Math.floor(4000 / hzParCase)
    const n = sortie.length
    let somme = 0
    for (let i = 0; i < n; i++) {
      const d = Math.floor(bas * (haut / bas) ** (i / n))
      const f = Math.max(d + 1, Math.floor(bas * (haut / bas) ** ((i + 1) / n)))
      let m = 0
      for (let j = d; j < f; j++) m = Math.max(m, donnees[j])
      sortie[i] = Math.max(0, (m - 60) / 150)
      somme += sortie[i]
    }
    const niveau = Math.min(1, (somme / n) * 2.2)
    for (let i = 0; i < n; i++) sortie[i] = Math.min(1, sortie[i] / Math.max(0.15, niveau))
    return niveau
  }

  private dessiner(dt: number) {
    const n = this.n
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    const actifs = this.enveloppe[0] + this.enveloppe[1] > 0.04
    const zero = R.hauteurMax
    const rayon = (R.largeur / 2) * R.arrondi
    ctx.globalAlpha = R.opaciteLigne
    ctx.fillStyle = R.couleurLigne
    ctx.fillRect(0, zero - 0.5, n * (R.largeur + R.ecart) - R.ecart, 1)
    ctx.globalAlpha = 1
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 0.5 : i / (n - 1)
      const a = this.enveloppe[0] * this.poids(x, 0)
      const b = this.enveloppe[1] * this.poids(x, 1)
      // Union des deux voix : là où elles se chevauchent, la barre ne sature pas.
      const p = Math.min(1, R.gain * a * this.spectres[0][i])
      const q = Math.min(1, R.gain * b * this.spectres[1][i])
      const v = 1 - (1 - p) * (1 - q)
      const k = v > this.affichees[i] ? R.attaque : R.relachement
      this.affichees[i] += (v - this.affichees[i]) * Math.min(1, k * dt)
      ctx.fillStyle = actifs ? melanger(R.couleurToi, R.couleurAtlas, b / (a + b + 1e-6)) : R.couleurRepos
      const cx = i * (R.largeur + R.ecart)
      const haut = 1.5 + (zero - 1.5) * this.affichees[i]
      ctx.beginPath()
      ctx.roundRect(cx, zero - haut, R.largeur, haut, [rayon, rayon, 0, 0])
      ctx.fill()
    }
  }
}

/** La pastille : visible pendant l'appel ; conversation rangée, elle reste au repos et se clique pour appeler. */
export class Pastille {
  private readonly el: HTMLElement
  private readonly vague: Vague
  private enAppel = false
  private dernier = 0

  constructor(surClicRepos: () => void) {
    this.el = document.createElement('div')
    this.el.className = 'pastille-voix'
    this.el.setAttribute('role', 'status')
    this.el.setAttribute('aria-label', 'Appel vocal avec Atlas voix')
    this.el.innerHTML = '<canvas></canvas>'
    this.el.style.paddingTop = `${R.margeHaut}px`
    this.el.style.background = `linear-gradient(to top, rgba(255, 255, 255, ${R.opaciteFond}) 45%, rgba(255, 255, 255, 0))`
    document.body.append(this.el)
    this.vague = new Vague(this.el.querySelector('canvas')!)
    window.addEventListener('resize', () => this.vague.dimensionner(window.innerWidth))
    this.el.addEventListener('click', () => {
      if (!this.enAppel) surClicRepos()
    })
    // Conversation rangée (redimension.ts) : la pastille au repos reste le seul accès à la voix.
    new MutationObserver(() => this.majVisibilite()).observe(document.body, { attributeFilter: ['class'] })
    this.majVisibilite()
    requestAnimationFrame((t) => this.image(t))
  }

  /** Appel ouvert avec ses deux voix, ou terminé (null). */
  brancher(sources: SourcesPastille | null) {
    this.vague.sources = sources
    this.enAppel = sources !== null
    this.majVisibilite()
  }

  private majVisibilite() {
    const rangee = document.body.classList.contains('conversation-rangee')
    this.el.classList.toggle('visible', this.enAppel || rangee)
    this.el.classList.toggle('repos', !this.enAppel)
    this.el.title = this.enAppel ? '' : 'Appeler Atlas voix'
  }

  private image(t: number) {
    requestAnimationFrame((u) => this.image(u))
    const dt = Math.min(0.05, Math.max(0, (t - this.dernier) / 1000))
    this.dernier = t
    if (this.el.classList.contains('visible')) this.vague.avancer(dt)
  }
}
