import React from 'react'
import { C, cartouche, Ecran, Film, H, M, Mots, Papier, Rappel, SANS, SERIF, W, cameraPlan, entree, kf, lisse, monte, sortie, useT, versEcran, FPS } from '../lib'
import planPend from '../plan-pend.json'

export const G1 = 39.85, G2 = G1 + 373 / 60, G3 = 53.2, FICHE = 61.1
const clesG2 = planPend.plans.find((p: any) => p.nom === 'g2-premisses')!.cles

export const Graphe: React.FC = () => {
  const t = useT()
  const entreeG = monte(t, 39.7, 40.35, sortie)
  const op3 = monte(t, G3, G3 + 0.3, lisse)
  // caméra du plan 2 pour suivre les rappels
  const cam2 = cameraPlan(clesG2, Math.floor((t - G2) * FPS))
  const assertion = versEcran(cam2, 1357, 1552)
  const demo = versEcran(cam2, 1114, 1592)
  const fondFiche = monte(t, FICHE, FICHE + 0.7, lisse)

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#fff' }}>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${1.08 - 0.08 * entreeG})`, filter: entreeG < 1 ? `blur(${(1 - entreeG) * 12}px)` : undefined, opacity: entreeG }}>
        {t < G2 ? <Film nom="g1-apercu" debut={G1} n={373} /> : <Film nom="g2-premisses" debut={G2} n={445} />}
      </div>
      {t >= G3 && (
        <div style={{ position: 'absolute', inset: 0, opacity: op3, filter: fondFiche > 0 ? `blur(${fondFiche * 6}px)` : undefined }}>
          <Film nom="g3-lecture" debut={G3} n={493} />
        </div>
      )}

      {/* Titre de la vue */}
      <div style={{ position: 'absolute', right: 90, top: 80, textAlign: 'right', opacity: monte(t, 40.3, 41.0) * (1 - monte(t, 45.4, 45.9)) }}>
        <div style={{ fontFamily: SANS, fontSize: 20, color: C.gris, textTransform: 'uppercase', letterSpacing: 3, marginBottom: 10 }}>Graphe de raisonnement</div>
        <Mots texte="Chaque rapport devient un graphe." debut={40.5} pas={0.1} style={{ fontFamily: SERIF, fontSize: 58, color: C.encre }} italiques={['graphe.']} />
        <div style={{ fontFamily: SANS, fontSize: 22, color: C.gris, marginTop: 10, opacity: monte(t, 41.6, 42.2) }}>Pendule simple · 31 énoncés · 5 cadres · 3 figures</div>
      </div>

      {/* Rappels du plan 2 */}
      {t >= G2 && t < G3 + 0.3 && (
        <>
          <Rappel ax={assertion.x} ay={assertion.y} lx={assertion.x + 150} ly={assertion.y - 150} texte="Assertion" sous="un énoncé, un bloc" debut={46.9} fin={52.9} />
          <Rappel ax={demo.x} ay={demo.y} lx={demo.x - 170} ly={demo.y + 170} texte="Démonstration" sous="depuis ses prémisses (en bleu)" debut={49.0} fin={52.9} />
        </>
      )}

      {/* Plan 3 : lecture */}
      {t >= G3 && (
        <div style={{ position: 'absolute', left: 90, bottom: 90, opacity: 1 - fondFiche }}>
          <div style={{ background: 'rgba(255,255,255,0.93)', padding: '26px 36px', borderRadius: 16, boxShadow: '0 20px 50px rgba(22,22,40,0.12)', opacity: monte(t, 54.9, 55.4) }}>
            <Mots texte="Se lit comme un article." debut={55.0} pas={0.09} style={{ fontFamily: SERIF, fontSize: 50, color: C.encre }} italiques={['article.']} />
            <Mots texte="Se parcourt comme une carte." debut={58.1} pas={0.09} style={{ fontFamily: SERIF, fontSize: 50, color: C.encre, marginTop: 6 }} italiques={['carte.']} />
          </div>
        </div>
      )}
      {t >= FICHE - 0.1 && <Fiche />}
    </div>
  )
}

const Fiche: React.FC = () => {
  const t = useT()
  const p = monte(t, FICHE, FICHE + 0.9, sortie)
  const cx = kf(t, [[61.9, 960], [63.0, 1728], [64.3, 1716], [68.6, 1712], [70.31, 1660]])
  const cy = kf(t, [[61.9, 540], [63.0, 380], [64.3, 448], [68.6, 452], [70.31, 452]])
  const zoom = kf(t, [[61.9, 1], [63.0, 1.55], [64.3, 2.35], [68.6, 2.7]]) * kf(t, [[68.6, 1], [70.31, 1.9]], entree)
  const marque = monte(t, 63.5, 64.2, lisse)
  const verdict = monte(t, 66.2, 66.9, sortie)
  const arc = monte(t, 66.5, 67.8, lisse) * 0.99
  const flou = monte(t, 69.9, 70.31, entree) * 10
  const R = 54, circ = 2 * Math.PI * R
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', inset: 0, background: C.papier, opacity: p * 0.85 }} />
      <Ecran src={`${M}/capture/ui/session-fiche.png`} cx={cx} cy={cy} zoom={zoom} tx={(1 - p) * 1100} ry={-26 * (1 - p) + kf(t, [[62, -5], [64.3, -2]])}
        rx={kf(t, [[62, 4], [64.3, 1]])} echelle={0.86 + 0.14 * monte(t, 61.9, 63.2, lisse)} flou={flou}>
        <div style={{ position: 'absolute', left: 1556, top: 424, width: 326 * marque, height: 46, background: 'rgba(37,99,235,0.13)', borderRadius: 4 }} />
      </Ecran>
      <div style={{ position: 'absolute', left: 90, top: 80, ...cartouche, opacity: monte(t, 61.9, 62.5) * (1 - monte(t, 69.6, 70.0)) }}>
        <div style={{ fontFamily: SANS, fontSize: 20, color: C.gris, textTransform: 'uppercase', letterSpacing: 3, marginBottom: 10 }}>Vérificateur</div>
        <Mots texte="Chaque démonstration, jugée." debut={62.4} pas={0.1} style={{ fontFamily: SERIF, fontSize: 58, color: C.encre }} italiques={['jugée.']} />
      </div>
      {/* verdict */}
      <div style={{ position: 'absolute', left: 90, bottom: 110, opacity: verdict * (1 - monte(t, 69.8, 70.1)), transform: `translateY(${(1 - verdict) * 30}px)`,
        background: '#fff', borderRadius: 20, padding: '28px 40px 28px 30px', display: 'flex', alignItems: 'center', gap: 28,
        boxShadow: '0 26px 70px rgba(22,22,40,0.18), 0 0 0 1px rgba(22,22,29,0.06)' }}>
        <svg width={140} height={140} viewBox="0 0 140 140">
          <circle cx={70} cy={70} r={R} fill="none" stroke="#ebe9e3" strokeWidth={10} />
          <circle cx={70} cy={70} r={R} fill="none" stroke={C.bleu} strokeWidth={10} strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - arc)} transform="rotate(-90 70 70)" />
          <text x={70} y={80} textAnchor="middle" fontFamily={SERIF} fontSize={34} fill={C.encre}>{arc.toFixed(2).replace('.', ',')}</text>
        </svg>
        <div style={{ fontFamily: SANS }}>
          <div style={{ fontSize: 20, color: C.gris, textTransform: 'uppercase', letterSpacing: 2.5 }}>Verdict</div>
          <div style={{ fontFamily: SERIF, fontSize: 46, color: C.encre, margin: '4px 0' }}>valide</div>
          <div style={{ fontSize: 21, color: C.gris }}>confiance · recours si doute</div>
        </div>
      </div>
    </div>
  )
}
