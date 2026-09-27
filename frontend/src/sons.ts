// Petits sons de l'appel vocal : ouverture (Atlas voix est prêt à écouter) et fermeture (raccroché). Synthétisés
// avec Web Audio, sans fichier. Plusieurs familles à essayer : le choix se fait dans le menu du micro et reste
// dans ce navigateur.
// Hors communication, chacun dans son propre contexte (Windows baisse de 80 % par défaut les autres sons pendant
// une communication) : l'ouverture finit quand le micro commence à capter (voix.ts, juste avant) ; la fermeture
// une fois le micro et l'audio de l'appel relâchés. Chaque son est précédé d'un souffle inaudible qui réveille la sortie : un casque
// USB-C en veille avale sinon le début du son.

export type Sens = 'ouverture' | 'fermeture'

/** `duree` : partie audible du son d'ouverture (s), après laquelle le micro s'ouvre. */
export const SONS: { id: string; nom: string; description: string; duree: number }[] = [
  { id: 'carillon', nom: 'Carillon', description: 'Deux notes douces, montantes puis descendantes', duree: 0.45 },
  { id: 'bulle', nom: 'Bulle', description: 'Un « pop » qui monte, puis qui retombe', duree: 0.16 },
  { id: 'cristal', nom: 'Cristal', description: 'Une clochette claire, aux harmoniques de verre', duree: 0.4 },
  { id: 'marimba', nom: 'Marimba', description: 'Trois notes boisées en arpège', duree: 0.3 },
  { id: 'souffle', nom: 'Souffle', description: 'Un souffle filtré qui s’ouvre, puis se referme', duree: 0.42 },
  { id: 'declic', nom: 'Déclic', description: 'Un clic discret, presque imperceptible', duree: 0.11 },
  { id: 'aucun', nom: 'Aucun', description: 'Pas de son', duree: 0 },
]

const CLE = 'atlas.voix.son'

export function sonChoisi(): string {
  try {
    return localStorage.getItem(CLE) ?? 'carillon'
  } catch {
    return 'carillon'
  }
}

export function choisirSon(id: string) {
  try {
    localStorage.setItem(CLE, id)
  } catch {
    // navigation privée : le choix ne tiendra que le temps de la page
  }
}

/** Une note : oscillateur `forme` de `f` Hz, attaque courte, décroissance exponentielle sur `duree` s. */
function note(ctx: AudioContext, sortie: AudioNode, t: number, f: number, duree: number, volume: number, forme: OscillatorType = 'sine') {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = forme
  o.frequency.value = f
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(volume, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree)
  o.connect(g).connect(sortie)
  o.start(t)
  o.stop(t + duree + 0.02)
}

const RECETTES: Record<string, (ctx: AudioContext, sortie: AudioNode, t: number, sens: Sens) => void> = {
  carillon(ctx, sortie, t, sens) {
    const [a, b] = sens === 'ouverture' ? [659.3, 987.8] : [987.8, 659.3]
    note(ctx, sortie, t, a, 0.45, 0.12)
    note(ctx, sortie, t + 0.11, b, 0.6, 0.12)
  },
  bulle(ctx, sortie, t, sens) {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    const [de, a] = sens === 'ouverture' ? [320, 880] : [880, 320]
    o.frequency.setValueAtTime(de, t)
    o.frequency.exponentialRampToValueAtTime(a, t + 0.09)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
    o.connect(g).connect(sortie)
    o.start(t)
    o.stop(t + 0.2)
  },
  cristal(ctx, sortie, t, sens) {
    const cloche = (debut: number, f: number) => {
      // Partiels inharmoniques d'une petite cloche.
      for (const [r, v, d] of [[1, 0.07, 0.9], [2.76, 0.03, 0.5], [5.4, 0.015, 0.3]] as const) note(ctx, sortie, debut, f * r, d, v)
    }
    if (sens === 'ouverture') {
      cloche(t, 1318.5)
      cloche(t + 0.09, 1760)
    } else {
      cloche(t, 1174.7)
    }
  },
  marimba(ctx, sortie, t, sens) {
    const notes = sens === 'ouverture' ? [523.3, 659.3, 784] : [784, 659.3, 523.3]
    notes.forEach((f, i) => {
      note(ctx, sortie, t + i * 0.075, f, 0.28, 0.11, 'triangle')
      note(ctx, sortie, t + i * 0.075, f * 4, 0.06, 0.02) // attaque boisée
    })
  },
  souffle(ctx, sortie, t, sens) {
    const duree = 0.42
    const tampon = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duree), ctx.sampleRate)
    const d = tampon.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    const bruit = ctx.createBufferSource()
    bruit.buffer = tampon
    const filtre = ctx.createBiquadFilter()
    filtre.type = 'bandpass'
    filtre.Q.value = 4
    const [de, a] = sens === 'ouverture' ? [400, 2600] : [2600, 400]
    filtre.frequency.setValueAtTime(de, t)
    filtre.frequency.exponentialRampToValueAtTime(a, t + duree)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.25, t + duree * 0.45)
    g.gain.exponentialRampToValueAtTime(0.0001, t + duree)
    bruit.connect(filtre).connect(g).connect(sortie)
    bruit.start(t)
  },
  declic(ctx, sortie, t, sens) {
    note(ctx, sortie, t, sens === 'ouverture' ? 1400 : 900, 0.05, 0.1, 'triangle')
    if (sens === 'ouverture') note(ctx, sortie, t + 0.06, 1800, 0.05, 0.08, 'triangle')
  },
}

/** Souffle inaudible (−80 dB) qui réveille la sortie audio avant le son. */
export const REVEIL_S = 0.35

function souffleInaudible(ctx: AudioContext, sortie: AudioNode, t: number, duree: number) {
  const tampon = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duree), ctx.sampleRate)
  const d = tampon.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 1e-4
  const s = ctx.createBufferSource()
  s.buffer = tampon
  s.connect(sortie)
  s.start(t)
}

/** Joue le son choisi (ou `id`). Sans contexte fourni, un contexte audio éphémère est créé (sortie réveillée
 * d'abord), puis fermé. */
export function jouerSon(sens: Sens, id = sonChoisi(), ctx?: AudioContext, sortie?: AudioNode) {
  const recette = RECETTES[id]
  if (!recette) return
  const propre = !ctx
  const c = ctx ?? new AudioContext()
  const vers = sortie ?? c.destination
  void c.resume()
  let t = c.currentTime + 0.08 // de la marge : l'horloge avance pendant la programmation des notes
  if (propre) {
    souffleInaudible(c, vers, c.currentTime, REVEIL_S + 1)
    t = c.currentTime + REVEIL_S
  }
  recette(c, vers, t, sens)
  if (propre) window.setTimeout(() => void c.close(), (REVEIL_S + 1.5) * 1000)
}

/** Délai entre `jouerSon('ouverture')` et la fin du son choisi : le moment d'ouvrir le micro. */
export function finSonOuverture(id = sonChoisi()): number {
  const son = SONS.find((s) => s.id === id)
  return RECETTES[id] && son ? REVEIL_S + son.duree : 0
}

/** Aperçu : l'ouverture puis, un instant après, la fermeture. */
export function ecouterSon(id: string) {
  jouerSon('ouverture', id)
  window.setTimeout(() => jouerSon('fermeture', id), (REVEIL_S + 0.9) * 1000)
}
