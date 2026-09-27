import React from 'react'
import { Img, interpolate, Easing, useCurrentFrame, staticFile, getInputProps } from 'remotion'
import { interpolateZoom } from 'd3-interpolate'
import * as d3e from 'd3-ease'

export const FPS = 60
export const W = 1920
export const H = 1080
// Médias : servis à côté du bundle (public/), ou par un serveur local en développement.
export const M: string = (getInputProps() as any).media ?? staticFile('media').replace(/\/media$/, '')
export const s = (sec: number) => Math.round(sec * FPS)

export const C = {
  papier: '#f6f5f1',
  encre: '#16161d',
  gris: '#6b6b72',
  trait: '#d9d7cf',
  bleu: '#2563eb',
  rouge: '#dc2626',
}
export const SERIF = "'CMU Serif Film', 'CMU Serif', Georgia, serif"
export const SANS = "Inter, 'Segoe UI', system-ui, sans-serif"

export const lisse = Easing.bezier(0.65, 0, 0.35, 1)
export const sortie = Easing.bezier(0.16, 1, 0.3, 1)
export const entree = Easing.bezier(0.7, 0, 0.84, 0)

/** Interpolation par clés en secondes : [[t, v], ...]. */
export function kf(t: number, cles: [number, number][], easing = lisse): number {
  if (t <= cles[0][0]) return cles[0][1]
  for (let i = 0; i < cles.length - 1; i++) {
    const [t0, v0] = cles[i], [t1, v1] = cles[i + 1]
    if (t <= t1) return interpolate(t, [t0, t1], [v0, v1], { easing, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  }
  return cles[cles.length - 1][1]
}

export const fondu = (t: number, a: number, b: number, c: number, d: number) =>
  interpolate(t, [a, b, c, d], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: lisse })
export const monte = (t: number, a: number, b: number, easing = sortie) =>
  interpolate(t, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing })

export function useT(): number {
  return useCurrentFrame() / FPS
}

/** Séquence d'images capturées (60 i/s) : image k = (t - debut) * 60 * vitesse + decalage. */
export const Film: React.FC<{ nom: string; debut: number; n: number; vitesse?: number; decalage?: number; style?: React.CSSProperties }> = ({ nom, debut, n, vitesse = 1, decalage = 0, style }) => {
  const t = useT()
  const k = Math.max(0, Math.min(n - 1, Math.floor((t - debut) * FPS * vitesse + decalage)))
  return <Img src={`${M}/capture/seq/${nom}/${String(k).padStart(5, '0')}.jpg`} style={{ width: W, height: H, display: 'block', ...style }} />
}

/** Caméra des plans du graphe, identique à capture/sequence.mjs : image k → centre et zoom. */
export function cameraPlan(cles: any[], k: number): { x: number; y: number; z: number } {
  let acc = 0
  for (let i = 0; i < cles.length - 1; i++) {
    const a = cles[i], c = cles[i + 1]
    const n = Math.round((c.t - a.t) * FPS)
    if (k < acc + n) {
      const interp = interpolateZoom([a.cx, a.cy, W / a.z], [c.cx, c.cy, W / c.z])
      const e = (d3e as any)[c.ease ?? 'easeCubicInOut']
      const [x, y, w] = interp(e((k - acc) / n))
      return { x, y, z: W / w }
    }
    acc += n
  }
  const d = cles[cles.length - 1]
  return { x: d.cx, y: d.cy, z: d.z }
}
export const versEcran = (cam: { x: number; y: number; z: number }, wx: number, wy: number) => ({
  x: W / 2 + (wx - cam.x) * cam.z,
  y: H / 2 + (wy - cam.y) * cam.z,
})

/** Fond papier, grille très légère façon Blueprint. */
export const Papier: React.FC<{ grille?: number }> = ({ grille = 1 }) => (
  <div style={{ position: 'absolute', inset: 0, background: C.papier }}>
    <div
      style={{
        position: 'absolute', inset: 0, opacity: 0.55 * grille,
        backgroundImage: `linear-gradient(rgba(22,22,29,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(22,22,29,0.045) 1px, transparent 1px),
          linear-gradient(rgba(22,22,29,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(22,22,29,0.03) 1px, transparent 1px)`,
        backgroundSize: '160px 160px, 160px 160px, 32px 32px, 32px 32px',
        backgroundPosition: 'center',
      }}
    />
    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, rgba(246,245,241,0) 45%, rgba(236,234,227,0.9) 100%)' }} />
  </div>
)

/** Capture d'écran (3840×2160) présentée comme une fenêtre flottante, avec une caméra intérieure (cx, cy, zoom). */
export const Ecran: React.FC<{
  src: string
  cx?: number; cy?: number; zoom?: number
  rx?: number; ry?: number; rz?: number; echelle?: number; tx?: number; ty?: number; tz?: number
  rayon?: number; ombre?: number; opacite?: number; flou?: number
  children?: React.ReactNode
  largeur?: number; hauteur?: number
}> = ({ src, cx = W / 2, cy = H / 2, zoom = 1, rx = 0, ry = 0, rz = 0, echelle = 1, tx = 0, ty = 0, tz = 0, rayon = 18, ombre = 1, opacite = 1, flou = 0, children, largeur = W, hauteur = H }) => (
  <div style={{ position: 'absolute', inset: 0, perspective: 2200, perspectiveOrigin: '50% 45%' }}>
    <div
      style={{
        position: 'absolute', left: (W - largeur) / 2, top: (H - hauteur) / 2, width: largeur, height: hauteur,
        transform: `translate3d(${tx}px, ${ty}px, ${tz}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${echelle})`,
        transformStyle: 'preserve-3d', opacity: opacite,
        borderRadius: rayon, overflow: 'hidden', background: '#fff',
        boxShadow: ombre ? `0 ${50 * ombre}px ${120 * ombre}px rgba(22,22,40,${0.16 * ombre}), 0 ${12 * ombre}px ${30 * ombre}px rgba(22,22,40,${0.08 * ombre}), 0 0 0 1px rgba(22,22,29,0.07)` : 'none',
        filter: flou ? `blur(${flou}px)` : undefined,
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, width: largeur, height: hauteur, transformOrigin: '0 0', transform: `translate(${largeur / 2 - cx * zoom}px, ${hauteur / 2 - cy * zoom}px) scale(${zoom})` }}>
        <Img src={src} style={{ width: W, height: H, display: 'block' }} />
        {children}
      </div>
    </div>
  </div>
)

/** Curseur façon macOS, avec l'enfoncement et l'onde d'un clic. */
export const Curseur: React.FC<{ x: number; y: number; clics?: number[]; opacite?: number; taille?: number }> = ({ x, y, clics = [], opacite = 1, taille = 1 }) => {
  const t = useT()
  let presse = 0, onde = -1
  for (const c of clics) {
    if (t >= c - 0.08 && t < c + 0.12) presse = 1 - Math.abs(t - c) / 0.12
    if (t >= c && t < c + 0.6) onde = (t - c) / 0.6
  }
  return (
    <div style={{ position: 'absolute', left: x, top: y, opacity: opacite, pointerEvents: 'none' }}>
      {onde >= 0 && (
        <div style={{ position: 'absolute', left: -40 * taille, top: -40 * taille, width: 80 * taille, height: 80 * taille, borderRadius: '50%',
          border: `${2.5 * taille}px solid ${C.bleu}`, opacity: (1 - onde) * 0.7, transform: `scale(${0.2 + onde * 0.9})` }} />
      )}
      <svg width={30 * taille} height={40 * taille} viewBox="0 0 30 40" style={{ position: 'absolute', left: -3 * taille, top: -2 * taille,
        transform: `scale(${1 - presse * 0.14})`, transformOrigin: '4px 4px', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.25))' }}>
        <path d="M3 2 L3 31 L10.5 24 L15.5 36 L20 34 L15 22.5 L25 22.5 Z" fill="#111" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

/** Texte révélé mot à mot (flou → net, montée). */
export const Mots: React.FC<{ texte: string; debut: number; pas?: number; duree?: number; style?: React.CSSProperties; sortieA?: number; italiques?: string[] }> = ({ texte, debut, pas = 0.09, duree = 0.7, style, sortieA, italiques = [] }) => {
  const t = useT()
  const mots = texte.split(' ')
  const out = sortieA !== undefined ? 1 - monte(t, sortieA, sortieA + 0.5, lisse) : 1
  return (
    <div style={{ ...style, opacity: out }}>
      {mots.map((m, i) => {
        const p = monte(t, debut + i * pas, debut + i * pas + duree)
        return (
          <span key={i} style={{ display: 'inline-block', opacity: p, transform: `translateY(${(1 - p) * 26}px)`, filter: `blur(${(1 - p) * 8}px)`,
            fontStyle: italiques.includes(m) ? 'italic' : undefined, marginRight: '0.26em' }}>{m}</span>
        )
      })}
    </div>
  )
}

/** Étiquette avec trait de rappel vers un point de l'image. */
export const Rappel: React.FC<{ ax: number; ay: number; lx: number; ly: number; texte: string; sous?: string; debut: number; fin: number; couleur?: string }> = ({ ax, ay, lx, ly, texte, sous, debut, fin, couleur = C.bleu }) => {
  const t = useT()
  const p = monte(t, debut, debut + 0.6)
  const q = monte(t, debut + 0.25, debut + 0.85)
  const o = 1 - monte(t, fin, fin + 0.4, lisse)
  const L = Math.hypot(lx - ax, ly - ay)
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: o }}>
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <circle cx={ax} cy={ay} r={7 * p} fill="#fff" stroke={couleur} strokeWidth={3} />
        <line x1={ax} y1={ay} x2={lx} y2={ly} stroke={couleur} strokeWidth={2} strokeDasharray={L} strokeDashoffset={L * (1 - p)} />
      </svg>
      <div style={{ position: 'absolute', left: lx, top: ly, transform: `translate(${lx < ax ? '-100%' : '0'}, -50%) translateY(${(1 - q) * 14}px)`, opacity: q,
        background: 'rgba(255,255,255,0.97)', border: `1.5px solid ${couleur}`, borderRadius: 12, padding: '12px 20px',
        boxShadow: '0 14px 34px rgba(22,22,40,0.14)', fontFamily: SANS, whiteSpace: 'nowrap' }}>
        <div style={{ fontSize: 28, fontWeight: 600, color: C.encre, letterSpacing: -0.3 }}>{texte}</div>
        {sous && <div style={{ fontSize: 19, color: C.gris, marginTop: 3 }}>{sous}</div>}
      </div>
    </div>
  )
}

/** Marque d'Atlas : deux prémisses reliées à une conclusion (liaisons orthogonales), dessinée au trait. */
export const Marque: React.FC<{ debut: number; taille?: number }> = ({ debut, taille = 1 }) => {
  const t = useT()
  const a = monte(t, debut, debut + 0.45)
  const b = monte(t, debut + 0.15, debut + 0.6)
  const l = monte(t, debut + 0.4, debut + 1.0, lisse)
  const c = monte(t, debut + 0.85, debut + 1.25)
  const chemin1 = 'M34 22 H62 V48 H82', chemin2 = 'M34 74 H62 V48'
  return (
    <svg width={120 * taille} height={96 * taille} viewBox="0 0 120 96">
      <rect x={8} y={10} width={26} height={24} rx={4} fill="none" stroke={C.encre} strokeWidth={4.5} opacity={a} transform={`translate(0 ${(1 - a) * 8})`} />
      <rect x={8} y={62} width={26} height={24} rx={4} fill="none" stroke={C.encre} strokeWidth={4.5} opacity={b} transform={`translate(0 ${(1 - b) * 8})`} />
      <path d={chemin1} fill="none" stroke={C.encre} strokeWidth={4.5} strokeDasharray={80} strokeDashoffset={80 * (1 - l)} />
      <path d={chemin2} fill="none" stroke={C.encre} strokeWidth={4.5} strokeDasharray={60} strokeDashoffset={60 * (1 - l)} />
      <rect x={84} y={34} width={30} height={28} rx={4} fill={C.encre} opacity={c} transform={`translate(99 48) scale(${0.6 + 0.4 * c}) translate(-99 -48)`} />
    </svg>
  )
}

/** Cartouche blanc des titres posés sur une capture. */
export const cartouche: React.CSSProperties = {
  background: 'rgba(255,255,255,0.96)', padding: '24px 34px 28px', borderRadius: 18,
  boxShadow: '0 22px 60px rgba(22,22,40,0.14), 0 0 0 1px rgba(22,22,29,0.05)',
}
