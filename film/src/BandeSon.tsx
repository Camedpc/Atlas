import React from 'react'
import { Audio, Sequence, interpolate, random } from 'remotion'
import { FPS, M, s } from './lib'
import vo from '../audio/vo.json'
import { CLIC_ENVOI, CLIC_SAISIE, DEBUT_FRAPPE, NB_FRAPPE, PAS_FRAPPE } from './scenes/Recherche'

export const DUREE = 119.8

// Voix off : [nom, instant où la parole commence]
export const VOIX: [string, number][] = [
  ['v01', 1.4], ['v02', 4.6], ['v03', 13.45], ['v04', 17.0], ['v05', 26.9], ['v06', 40.6], ['v07', 46.4], ['v08', 53.3],
  ['v09', 61.3], ['v10', 80.2], ['v11', 86.8], ['c1', 88.9], ['c2', 92.0], ['v12', 108.6],
]

type Bruit = [number, string, number, number?]
const BRUITS: Bruit[] = [
  [0.4, 'whoosh_long', 0.18],
  ...[0.7, 1.5, 2.4, 3.3, 4.2, 5.1, 6.3].map((t, i): Bruit => [t, 'pop', 0.1, 0.85 + i * 0.05]),
  [10.85, 'whoosh_long', 0.45], [12.5, 'tick_001', 0.18], [12.75, 'tick_001', 0.18, 1.1], [13.0, 'tick_001', 0.18, 1.2],
  [13.3, 'coup', 0.32], [14.35, 'pluck_001', 0.18],
  [16.12, 'whoosh_court', 0.45], [16.31, 'coup', 0.6],
  [CLIC_SAISIE, 'mouseclick1', 0.55], [CLIC_ENVOI, 'mouseclick1', 0.7], [CLIC_ENVOI + 0.03, 'select_002', 0.25], [22.36, 'whoosh_court', 0.45],
  [26.8, 'whoosh_long', 0.3], [27.6, 'select_001', 0.22], [29.5, 'select_001', 0.22, 1.08], [31.7, 'select_001', 0.22, 1.16], [33.9, 'select_001', 0.18, 0.92],
  [35.4, 'whoosh_court', 0.45], [38.3, 'tick_002', 0.25], [39.5, 'whoosh_descente', 0.55],
  [46.9, 'pop', 0.28], [48.67, 'select_006', 0.3], [49.0, 'pop', 0.28, 1.1], [53.15, 'whoosh_court', 0.25],
  [61.05, 'whoosh_long', 0.45], [63.5, 'scroll_002', 0.2], [66.2, 'pop', 0.3], [67.7, 'valide', 0.4],
  [67.1, 'montee', 0.75],
  [70.31, 'impact', 1.0], [71.51, 'coup', 0.55], [72.71, 'coup', 0.65],
  ...[74.11, 75.91, 77.71].flatMap((t, i): Bruit[] => [[t, 'coup', 0.42], [t + 0.38, 'valide', 0.42, 1 + i * 0.06]]),
  [79.4, 'whoosh_court', 0.5], [85.8, 'whoosh_long', 0.4], [87.62, 'mouseclick1', 0.6], [87.8, 'maximize_003', 0.3],
  [96.0, 'whoosh_descente', 0.45], [98.5, 'pop', 0.22], [103.1, 'whoosh_long', 0.35],
  [107.2, 'pluck_001', 0.2], [FRAPPE_FIN_S(), 'impact', 0.7],
]
function FRAPPE_FIN_S() { return 111.71 }

// Frappe au clavier : un clic par caractère, hauteur légèrement variée.
for (let i = 1; i < NB_FRAPPE; i++) {
  const k = 1 + Math.floor(random(`k${i}`) * 5)
  BRUITS.push([DEBUT_FRAPPE + i * PAS_FRAPPE - 0.01, `click${k}`, 0.13 + random(`v${i}`) * 0.05, 0.9 + random(`r${i}`) * 0.3])
}

const debutVoix = (nom: string) => Math.max(0, (vo as any)[nom].debut)
const plagesVoix = VOIX.map(([n, t]) => [t, t + (vo as any)[n].fin - debutVoix(n)])

function volumeMusique(f: number): number {
  const t = f / FPS
  let duck = 1
  for (const [a, b] of plagesVoix) {
    const d = interpolate(t, [a - 0.35, a, b, b + 0.5], [1, 0.42, 0.42, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    duck = Math.min(duck, d)
  }
  const bords = interpolate(t, [0, 1.2, 118.2, DUREE], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return 0.9 * duck * bords
}

export const BandeSon: React.FC = () => (
  <>
    <Audio src={`${M}/audio/music/musique.wav`} volume={volumeMusique} />
    {VOIX.map(([nom, t]) => (
      <Sequence key={nom} from={s(t)} name={`voix ${nom}`}>
        <Audio src={`${M}/audio/vo/${nom}.wav`} startFrom={s(debutVoix(nom))} volume={nom.startsWith('c') ? 0.95 : 1.05} />
      </Sequence>
    ))}
    {BRUITS.map(([t, nom, v, r], i) => (
      <Sequence key={i} from={s(t)} name={nom}>
        <Audio src={`${M}/audio/sfx/wav/${nom}.wav`} volume={v} playbackRate={r ?? 1} />
      </Sequence>
    ))}
  </>
)
