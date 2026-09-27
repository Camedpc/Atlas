import React from 'react'
import { Img } from 'remotion'
import { C, cartouche, Curseur, Ecran, H, M, Mots, Papier, SANS, SERIF, W, kf, lisse, monte, sortie, useT } from '../lib'

// Question tapée (67 images réelles de la saisie), envoi, puis la session : conversation et agent graph.
export const DEBUT_FRAPPE = 17.55
export const PAS_FRAPPE = 0.053
export const NB_FRAPPE = 68
export const CLIC_SAISIE = 17.3
export const CLIC_ENVOI = 22.31

type R = [number, number, number, number]
const FOCUS: { de: number; r: R }[] = [
  { de: 27.6, r: [1238, 482, 1408, 612] }, // orchestrateur
  { de: 29.5, r: [1474, 468, 1644, 574] }, // directeur de labo
  { de: 31.7, r: [1706, 456, 1882, 584] }, // littérature + expérimentateur
  { de: 33.9, r: [1026, 440, 1890, 664] }, // tout le monde
]
const ETIQUETTES = [
  { de: 27.8, a: 29.3, titre: 'Orchestrateur', sous: 'conduit la recherche, confie les missions' },
  { de: 29.7, a: 31.5, titre: 'Directeur de labo', sous: 'mène une mission, tient son journal' },
  { de: 31.9, a: 33.7, titre: 'Littérature · Expérimentateur', sous: 'ses propres sous-agents' },
]

function focusA(t: number): { r: R; op: number } {
  let i = -1
  for (let k = 0; k < FOCUS.length; k++) if (t >= FOCUS[k].de) i = k
  if (i < 0) return { r: FOCUS[0].r, op: 0 }
  const f = FOCUS[i], p = i > 0 ? FOCUS[i - 1] : f
  const k = lisse(Math.min(1, (t - f.de) / 0.55))
  const r = f.r.map((v, j) => p.r[j] + (v - p.r[j]) * k) as R
  const op = monte(t, FOCUS[0].de, FOCUS[0].de + 0.5) * (1 - monte(t, 34.4, 35.0))
  return { r, op }
}

export const Recherche: React.FC = () => {
  const t = useT()
  // Carte 3D de l'écran
  const entreeP = monte(t, 16.31, 17.5, sortie)
  const rx = kf(t, [[16.31, 16], [17.5, 7], [18.4, 3], [22.4, 3], [23.6, 5], [26.9, 4], [27.9, 0]])
  const ry = kf(t, [[16.31, -22], [17.5, -9], [18.4, -3], [22.4, -3], [23.6, -8], [26.9, -6], [27.9, 0]])
  const ech = kf(t, [[16.31, 0.74], [17.5, 0.9], [18.4, 0.98], [22.4, 0.98], [23.6, 0.9], [26.9, 0.92], [27.9, 1.04]])
  const ty = (1 - entreeP) * 240
  // Caméra intérieure
  const cx = kf(t, [[17.3, 960], [18.3, 640], [21.2, 690], [22.0, 780], [22.5, 780], [23.5, 960], [26.9, 900], [27.9, 1323], [29.5, 1323], [30.1, 1540], [31.7, 1560], [32.3, 1680], [33.9, 1690], [34.5, 1460]])
  const cy = kf(t, [[17.3, 540], [18.3, 985], [21.2, 990], [22.0, 1000], [22.5, 1000], [23.5, 540], [26.9, 560], [27.9, 555], [34.5, 555]])
  const zoom = kf(t, [[17.3, 1], [18.3, 1.9], [21.2, 1.9], [22.0, 1.55], [22.5, 1.55], [23.5, 1], [26.9, 1.06], [27.9, 2.25], [33.9, 2.3], [34.5, 1.95], [35.5, 2.0]])

  // Image de l'écran : accueil → frappe → session
  const k = Math.max(0, Math.min(NB_FRAPPE - 1, Math.floor((t - DEBUT_FRAPPE) / PAS_FRAPPE)))
  const srcFrappe = t < DEBUT_FRAPPE ? `${M}/capture/ui/accueil.png` : `${M}/capture/ui/frappe/${String(k).padStart(3, '0')}.jpg`
  const session = monte(t, 22.42, 22.72, lisse)

  // Curseur (coordonnées de l'écran capturé)
  const curX = kf(t, [[16.6, 1500], [17.25, 660], [17.5, 660], [18.3, 890], [21.3, 905], [22.2, 947]], sortie)
  const curY = kf(t, [[16.6, 760], [17.25, 993], [17.5, 993], [18.3, 1062], [21.3, 1062], [22.2, 1037]], sortie)
  const curOp = monte(t, 16.6, 16.9) * (1 - monte(t, 22.6, 22.9))

  const f = focusA(t)
  const pad = 10
  const [x0, y0, x1, y1] = f.r
  // Coordonnées écran d'un point de la capture (carte quasi de face pendant les agents)
  const versEcran = (px: number, py: number) => ({ x: W / 2 + (px - cx) * zoom * ech, y: H / 2 + (py - cy) * zoom * ech })

  const sortieScene = monte(t, 35.35, 35.6, lisse)
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Papier />
      <div style={{ position: 'absolute', inset: 0, opacity: 1 - sortieScene }}>
        <Ecran src={srcFrappe} cx={cx} cy={cy} zoom={zoom} rx={rx} ry={ry} echelle={ech} ty={ty} opacite={Math.min(1, entreeP * 1.6)}>
          <Img src={`${M}/capture/ui/session-agents-deplie.png`} style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, opacity: session }} />
          {/* projecteur sur l'agent nommé */}
          <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, opacity: f.op }}>
            <defs>
              <mask id="trou">
                <rect width={W} height={H} fill="#fff" />
                <rect x={x0 - pad} y={y0 - pad} width={x1 - x0 + 2 * pad} height={y1 - y0 + 2 * pad} rx={10} fill="#000" />
              </mask>
            </defs>
            <rect width={W} height={H} fill="rgba(246,245,241,0.62)" mask="url(#trou)" />
            <rect x={x0 - pad} y={y0 - pad} width={x1 - x0 + 2 * pad} height={y1 - y0 + 2 * pad} rx={10} fill="none" stroke={C.bleu} strokeWidth={1.6} />
          </svg>
          {t < 22.9 && <Curseur x={curX} y={curY} clics={[CLIC_SAISIE, CLIC_ENVOI]} opacite={curOp} taille={0.62} />}
        </Ecran>
        {/* étiquettes des agents, en coordonnées d'écran */}
        {ETIQUETTES.map((e, i) => {
          const r = FOCUS[i].r
          const p = versEcran((r[0] + r[2]) / 2, r[1])
          const o = monte(t, e.de + 0.2, e.de + 0.7) * (1 - monte(t, e.a, e.a + 0.35))
          if (o <= 0) return null
          return (
            <div key={i} style={{ position: 'absolute', left: p.x, top: p.y - 40, transform: `translate(-50%, -100%) translateY(${(1 - o) * 12}px)`, opacity: o,
              background: '#fff', borderRadius: 12, padding: '12px 22px', boxShadow: '0 16px 40px rgba(22,22,40,0.16)', border: '1px solid rgba(22,22,29,0.08)',
              fontFamily: SANS, whiteSpace: 'nowrap', textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 600, color: C.encre }}>{e.titre}</div>
              <div style={{ fontSize: 19, color: C.gris, marginTop: 2 }}>{e.sous}</div>
            </div>
          )
        })}
        {/* sous-titre de scène */}
        <Mots texte="Une question de recherche." debut={17.1} pas={0.08} sortieA={20.9}
          style={{ position: 'absolute', left: 90, top: 80, ...cartouche, fontFamily: SERIF, fontSize: 54, color: C.encre }} italiques={['recherche.']} />
      </div>
      <Fil />
    </div>
  )
}

/** Le fil de la conversation déroulé jusqu'aux lois établies (35,5 → 40). */
const Fil: React.FC = () => {
  const t = useT()
  if (t < 35.4) return null
  const p = monte(t, 35.51, 36.4, sortie)
  const defil = kf(t, [[35.51, 2350], [39.7, 3330]], lisse)
  const sortieP = monte(t, 39.55, 40.15, lisse)
  const E = 1.32 // échelle d'affichage du fil (736 px CSS de large)
  const L = 736 * E
  const marque = monte(t, 38.3, 38.9, lisse)
  return (
    <div style={{ position: 'absolute', inset: 0, perspective: 2000, opacity: 1 - sortieP }}>
      <div style={{ position: 'absolute', left: (W - L) / 2 + 60, top: -40, width: L, height: H + 80, borderRadius: 18, overflow: 'hidden', background: '#fff',
        transform: `translateY(${(1 - p) * 300}px) rotateX(${8 - 4 * p}deg) rotateY(${-16 + 6 * p}deg) scale(${1 + sortieP * 0.5})`,
        boxShadow: '0 50px 120px rgba(22,22,40,0.16), 0 12px 30px rgba(22,22,40,0.08)', filter: sortieP > 0 ? `blur(${sortieP * 12}px)` : undefined }}>
        <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `scale(${E}) translateY(${-defil}px)` }}>
          <Img src={`${M}/capture/ui/fil-complet.png`} style={{ width: 736, display: 'block' }} />
          <div style={{ position: 'absolute', left: 18, top: 3634, width: 372 * marque, height: 24, background: 'rgba(37,99,235,0.14)', borderRadius: 3 }} />
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(#fff 0%, rgba(255,255,255,0) 14%, rgba(255,255,255,0) 86%, #fff 100%)' }} />
      </div>
      <div style={{ position: 'absolute', left: 110, top: 470, width: 380, opacity: monte(t, 36.2, 36.9) * (1 - monte(t, 39.3, 39.7)) }}>
        <div style={{ fontFamily: SANS, fontSize: 20, color: C.gris, textTransform: 'uppercase', letterSpacing: 3, marginBottom: 14 }}>Le rapport</div>
        <div style={{ fontFamily: SERIF, fontSize: 48, color: C.encre, lineHeight: 1.15 }}>Formules, données, figures&nbsp;: <i>tout est tracé.</i></div>
      </div>
    </div>
  )
}
