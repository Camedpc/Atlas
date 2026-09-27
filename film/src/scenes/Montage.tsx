import React from 'react'
import { Img } from 'remotion'
import { useAudioData, visualizeAudio } from '@remotion/media-utils'
import { C, cartouche, Curseur, Ecran, FPS, Film, H, M, Marque, Mots, Papier, SANS, SERIF, W, kf, lisse, monte, sortie, useT } from '../lib'

export const DROP = 70.31
const BEAT = 0.6
export const VERDICTS = [74.11, 75.91, 77.71]
export const FIGURE = 79.51
export const VOIX = 85.91
export const ECHELLE = 96.11
export const FIN = 103.1

/** Mot frappé sur le temps. */
const Frappe: React.FC<{ texte: string; a: number; b: number }> = ({ texte, a, b }) => {
  const t = useT()
  if (t < a || t >= b) return null
  const p = monte(t, a, a + 0.18, sortie)
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'rgba(255,255,255,0.95)', padding: '26px 64px 34px', borderRadius: 22, boxShadow: '0 30px 80px rgba(22,22,40,0.2)',
        transform: `scale(${1.25 - 0.25 * p})`, opacity: p, fontFamily: SERIF, fontSize: 130, color: C.encre, letterSpacing: -2 }}>{texte}</div>
    </div>
  )
}

const TITRES_VERDICTS = [
  ['Résultat 21', 'Période exacte', '0,99'],
  ['Résultat 25', 'Correction de Borda', '0,99'],
  ['Observation 17', 'Concordance RK4–AGM', '1,00'],
]

export const Montage: React.FC = () => {
  const t = useT()
  let plan: React.ReactNode = null
  if (t < VERDICTS[0]) {
    const recul = monte(t, DROP, DROP + 0.25)
    plan = <div style={{ position: 'absolute', inset: 0, transform: `scale(${1.06 - 0.06 * recul})` }}><Film nom="g4-drop" debut={DROP} n={229} /></div>
  } else if (t < FIGURE) {
    const i = t < VERDICTS[1] ? 0 : t < VERDICTS[2] ? 1 : 2
    const nom = ['g7a-verdict', 'g7b-verdict', 'g7c-verdict'][i]
    plan = <Film nom={nom} debut={VERDICTS[i]} n={157} decalage={20} />
  } else if (t < VOIX) {
    const e = monte(t, FIGURE, FIGURE + 0.35, sortie)
    plan = <div style={{ position: 'absolute', inset: 0, transform: `scale(${1.1 - 0.1 * e})`, filter: e < 1 ? `blur(${(1 - e) * 8}px)` : undefined }}>
      <Film nom="g5-figure" debut={FIGURE} n={385} /></div>
  } else if (t < ECHELLE) {
    plan = <Voix />
  } else {
    plan = <Echelle />
  }

  const iv = t >= VERDICTS[0] && t < FIGURE ? (t < VERDICTS[1] ? 0 : t < VERDICTS[2] ? 1 : 2) : -1
  const debV = iv >= 0 ? VERDICTS[iv] : 0
  const pv = monte(t, debV + 0.15, debV + 0.55, sortie)
  const coche = monte(t, debV + 0.35, debV + 0.75, lisse)
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#fff' }}>
      {plan}
      <Frappe texte="Jugé." a={DROP} b={DROP + 2 * BEAT} />
      <Frappe texte="Noté." a={DROP + 2 * BEAT} b={DROP + 4 * BEAT} />
      <Frappe texte="Établi." a={DROP + 4 * BEAT} b={DROP + 6 * BEAT} />
      {iv >= 0 && (
        <div style={{ position: 'absolute', left: 90, bottom: 90, display: 'flex', alignItems: 'center', gap: 22, opacity: pv, transform: `translateX(${(1 - pv) * -40}px)`,
          background: '#fff', borderRadius: 18, padding: '22px 34px 22px 24px', boxShadow: '0 24px 64px rgba(22,22,40,0.18), 0 0 0 1px rgba(22,22,29,0.06)' }}>
          <svg width={64} height={64} viewBox="0 0 64 64">
            <circle cx={32} cy={32} r={29} fill={C.bleu} opacity={0.1 + 0.9 * coche} />
            <path d="M19 33 L28 42 L46 23" fill="none" stroke="#fff" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={42} strokeDashoffset={42 * (1 - coche)} />
          </svg>
          <div>
            <div style={{ fontFamily: SERIF, fontSize: 36, color: C.encre }}><b>{TITRES_VERDICTS[iv][0]}</b> ({TITRES_VERDICTS[iv][1]})</div>
            <div style={{ fontFamily: SANS, fontSize: 21, color: C.gris, marginTop: 4 }}>démonstration vérifiée · confiance {TITRES_VERDICTS[iv][2]} · établi</div>
          </div>
        </div>
      )}
      {t >= FIGURE && t < VOIX && (
        <div style={{ position: 'absolute', left: 90, top: 80, ...cartouche, opacity: monte(t, FIGURE + 0.4, FIGURE + 1) * (1 - monte(t, VOIX - 0.5, VOIX - 0.1)) }}>
          <div style={{ fontFamily: SANS, fontSize: 20, color: C.gris, textTransform: 'uppercase', letterSpacing: 3, marginBottom: 10 }}>Figures</div>
          <Mots texte="Chaque preuve reste attachée à son énoncé." debut={FIGURE + 0.9} pas={0.08} style={{ fontFamily: SERIF, fontSize: 52, color: C.encre, maxWidth: 900 }} italiques={['énoncé.']} />
        </div>
      )}
    </div>
  )
}

// ─── Appel vocal ──────────────────────────────────────────────────────────────
const C1 = 88.9, C2 = 92.0
const MICRO = { x: 900, y: 1037 }
const BARRES = 200

const Voix: React.FC = () => {
  const t = useT()
  const p = monte(t, VOIX, VOIX + 0.8, sortie)
  const a1 = useAudioData(`${M}/audio/vo/c1.wav`)
  const a2 = useAudioData(`${M}/audio/vo/c2.wav`)
  const niveau = (audio: ReturnType<typeof useAudioData>, debut: number) => {
    if (!audio) return new Array(64).fill(0)
    const f = Math.floor((t - debut) * FPS)
    if (f < 0 || f >= audio.durationInSeconds * FPS) return new Array(64).fill(0)
    return visualizeAudio({ fps: FPS, frame: f, audioData: audio, numberOfSamples: 64, smoothing: true })
  }
  const s1 = niveau(a1, C1), s2 = niveau(a2, C2)
  const e1 = s1.reduce((x, y) => x + y, 0) / 64, e2 = s2.reduce((x, y) => x + y, 0) / 64
  const appel = monte(t, 87.75, 88.2)
  const zoom = kf(t, [[VOIX, 1], [87.2, 1.2], [88.4, 1.38], [95.5, 1.48]])
  const cx = kf(t, [[VOIX, 960], [87.2, 800], [88.4, 800]])
  const cy = kf(t, [[VOIX, 540], [87.2, 780], [88.4, 860]])
  const poids = (x: number, qui: number) => { const u = qui === 0 ? x : 1 - x; return 0.03 + 0.97 * Math.exp(-(((u - 0.2) / 0.3) ** 2)) }
  const sortieV = monte(t, ECHELLE - 0.35, ECHELLE, lisse)
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Papier />
      <div style={{ position: 'absolute', inset: 0, opacity: 1 - sortieV, transform: `scale(${1 + sortieV * 0.2})` }}>
        <Ecran src={`${M}/capture/ui/session-agents-deplie.png`} cx={cx} cy={cy} zoom={zoom} tx={(1 - p) * -900} ry={18 * (1 - p) + 4} rx={4} echelle={0.9}>
          {/* vague de la pastille, comme dans le produit : bas de l'écran, Camille à gauche (rouge), Atlas à droite (bleu) */}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 150, opacity: appel,
            background: 'linear-gradient(to top, rgba(255,255,255,0.96) 45%, rgba(255,255,255,0))', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 14 }}>
            <svg width={BARRES * 8} height={96} viewBox={`0 0 ${BARRES * 8} 96`}>
              <rect x={0} y={87.5} width={BARRES * 8} height={1.5} fill="#e5e5e1" />
              {Array.from({ length: BARRES }, (_, i) => {
                const x = i / (BARRES - 1)
                const j = Math.floor((x < 0.5 ? x * 2 : (1 - x) * 2) * 40) % 64
                const a = Math.min(1, poids(x, 0) * (9 * s1[j] + 14 * e1))
                const b = Math.min(1, poids(x, 1) * (9 * s2[j] + 14 * e2))
                const v = 1 - (1 - a) * (1 - b)
                const h = 3 + 84 * Math.pow(v, 0.8)
                const col = e1 + e2 > 0.004 ? (b > a ? C.bleu : C.rouge) : '#d4d4cf'
                return <rect key={i} x={i * 8} y={88 - h} width={3.5} height={h} rx={1.75} fill={col} />
              })}
            </svg>
          </div>
          <Curseur x={kf(t, [[86.3, 1300], [87.4, MICRO.x]], sortie)} y={kf(t, [[86.3, 800], [87.4, MICRO.y]], sortie)} clics={[87.62]} opacite={monte(t, 86.3, 86.6) * (1 - monte(t, 88.3, 88.6))} taille={0.62} />
        </Ecran>
        <div style={{ position: 'absolute', left: 90, top: 80, ...cartouche, opacity: monte(t, VOIX + 0.5, VOIX + 1.1) }}>
          <div style={{ fontFamily: SANS, fontSize: 20, color: C.gris, textTransform: 'uppercase', letterSpacing: 3, marginBottom: 10 }}>Atlas voix</div>
          <Mots texte="Et vous pouvez même lui parler." debut={VOIX + 0.8} pas={0.09} style={{ fontFamily: SERIF, fontSize: 58, color: C.encre }} italiques={['parler.']} />
        </div>
        <Bulle qui="Camille" couleur={C.rouge} texte="Atlas, où en est la vérification ?" a={C1} b={ECHELLE} gauche />
        <Bulle qui="Atlas voix" couleur={C.bleu} texte="Les dix-neuf démonstrations sont validées. Je vous montre la figure ?" a={C2} b={ECHELLE} />
      </div>
    </div>
  )
}

const Bulle: React.FC<{ qui: string; couleur: string; texte: string; a: number; b: number; gauche?: boolean }> = ({ qui, couleur, texte, a, b, gauche }) => {
  const t = useT()
  const p = monte(t, a, a + 0.45, sortie)
  if (t < a) return null
  return (
    <div style={{ position: 'absolute', top: gauche ? 330 : 520, [gauche ? 'left' : 'right']: gauche ? 180 : 150, maxWidth: 760, opacity: p * (1 - monte(t, b - 0.4, b)),
      transform: `translateY(${(1 - p) * 24}px)`, background: '#fff', borderRadius: 20, padding: '24px 32px',
      boxShadow: '0 24px 60px rgba(22,22,40,0.16), 0 0 0 1px rgba(22,22,29,0.06)', fontFamily: SANS }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 19, color: C.gris, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: 5, background: couleur }} />{qui}
      </div>
      <div style={{ fontSize: 34, color: C.encre, lineHeight: 1.3 }}>{texte}</div>
    </div>
  )
}

// ─── Échelle et fin ───────────────────────────────────────────────────────────
const Echelle: React.FC = () => {
  const t = useT()
  const e = monte(t, ECHELLE, ECHELLE + 0.5, sortie)
  // après la dernière image : le plan bascule comme une carte posée sur la table
  const bascule = monte(t, FIN, FIN + 3.2, lisse)
  const logo = t >= 106.2
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Papier grille={bascule} />
      <div style={{ position: 'absolute', inset: 0, perspective: 1800, opacity: 1 - monte(t, 105.2, 106.4, lisse) }}>
        <div style={{ position: 'absolute', inset: 0, transform: `translateY(${bascule * 120}px) rotateX(${bascule * 58}deg) scale(${1 - bascule * 0.35})`, transformOrigin: '50% 60%',
          boxShadow: bascule > 0 ? `0 40px 100px rgba(22,22,40,${0.2 * bascule})` : undefined, opacity: e, filter: e < 1 ? `blur(${(1 - e) * 8}px)` : undefined }}>
          <Film nom="g6-echelle" debut={ECHELLE} n={421} />
        </div>
      </div>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: monte(t, 98.3, 98.9) * (1 - monte(t, 102.4, 102.9)) }}>
        <div style={{ background: 'rgba(255,255,255,0.94)', padding: '28px 56px', borderRadius: 20, boxShadow: '0 30px 80px rgba(22,22,40,0.16)' }}>
          <Mots texte="111 énoncés. Un seul raisonnement." debut={98.5} pas={0.1} style={{ fontFamily: SERIF, fontSize: 64, color: C.encre }} italiques={['raisonnement.']} />
        </div>
      </div>
      {logo && <Fin />}
    </div>
  )
}

export const FRAPPE_FIN = 111.71
const Fin: React.FC = () => {
  const t = useT()
  const o = monte(t, 106.2, 106.9)
  const coup = monte(t, FRAPPE_FIN, FRAPPE_FIN + 0.35, sortie)
  const rebond = t >= FRAPPE_FIN ? 1 + 0.025 * Math.sin(Math.min(1, (t - FRAPPE_FIN) / 0.35) * Math.PI) : 1
  const sortieF = monte(t, 118.4, 119.8, lisse)
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: o * (1 - sortieF) }}>
      <div style={{ transform: `scale(${rebond})`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 34 }}>
          <Marque debut={106.5} taille={1.25} />
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 168, color: C.encre, letterSpacing: -3, lineHeight: 1,
            clipPath: `inset(0 ${100 - monte(t, 107.2, 108.1, lisse) * 100}% 0 0)` }}>Atlas</div>
        </div>
        <div style={{ marginTop: 34, display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <Mots texte="Chaque idée, démontrée." debut={109.3} pas={0.2} duree={0.8} style={{ fontFamily: SERIF, fontSize: 64, color: C.encre }} italiques={['démontrée.']} />
          <div style={{ width: 30, height: 30, background: C.encre, opacity: coup, transform: `scale(${1.8 - 0.8 * coup})` }} />
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 90, fontFamily: SANS, fontSize: 24, color: C.gris, letterSpacing: 1, opacity: monte(t, 112.5, 113.2) }}>
        atlas-nine-bay.vercel.app
      </div>
    </div>
  )
}
