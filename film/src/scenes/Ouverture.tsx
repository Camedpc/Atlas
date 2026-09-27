import React from 'react'
import { Img, random } from 'remotion'
import { C, H, M, Marque, Mots, Papier, SANS, SERIF, W, kf, lisse, monte, useT } from '../lib'

const CARTES = [
  'prop_exacte', 'prop_borda', 'prop_equation', 'prop_t0', 'prop_quadrature', 'prop_energie', 'prop_croissance', 'prop_serie',
  'prop_separatrice', 'obs_concordance', 'hyp_contrainte', 'choix_modele_ideal', 'def_elliptique', 'fait_agm', 'obs_convergence',
  'prop_orbites', 'prop_rk4', 'obs_seuils', 'prop_impact_vertical', 'prop_projectile', 'prop_quadratique_t', 'prop_deviation_est',
  'prop_orbite_circulaire', 'prop_estimateur_g', 'prop_lineaire', 'prop_champ_central', 'prop_tenseur_marees', 'prop_vitesse_radiale',
]
const LW = 478 * 0.62, LH = 254 * 0.62

// Disposition finale : colonnes façon graphe de raisonnement (les prémisses à gauche).
const COLS = 7
const cible = (i: number) => {
  const c = i % COLS, r = Math.floor(i / COLS)
  return { x: (c - (COLS - 1) / 2) * 340, y: (r - 1.5) * 200 + (c % 2) * 40, z: 0 }
}
const depart = (i: number) => {
  const ang = random(`a${i}`) * Math.PI * 2
  const rad = 500 + random(`r${i}`) * 900
  return {
    x: Math.cos(ang) * rad * 1.3,
    y: Math.sin(ang) * rad * 0.7,
    z: -3400 + random(`z${i}`) * 3000,
    ry: (random(`ry${i}`) - 0.5) * 50,
    rx: (random(`rx${i}`) - 0.5) * 30,
    rz: (random(`rz${i}`) - 0.5) * 16,
  }
}

export const Ouverture: React.FC = () => {
  const t = useT()
  // Travelling avant, puis assemblage (11,0 → 13,2), puis recul vers le logo.
  const camZ = kf(t, [[0, -700], [10.9, 800], [12.9, -250], [15.2, -1500]], lisse)
  const camRy = kf(t, [[0, 8], [11, -5], [13.2, 0]], lisse)
  const camRx = kf(t, [[0, 6], [11, -3], [13.2, 0]], lisse)
  const asm = monte(t, 10.9, 12.6, lisse)
  const cartesOp = 1 - monte(t, 12.95, 13.55, lisse)
  const liens = monte(t, 12.1, 12.9, lisse)
  const logo = monte(t, 13.4, 14.1)

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Papier grille={kf(t, [[0, 0.3], [13, 0.5], [15, 1]])} />
      <div style={{ position: 'absolute', inset: 0, perspective: 1400, perspectiveOrigin: '50% 50%', opacity: cartesOp }}>
        <div style={{ position: 'absolute', left: W / 2, top: H / 2, transformStyle: 'preserve-3d',
          transform: `translateZ(${camZ}px) rotateX(${camRx}deg) rotateY(${camRy}deg)` }}>
          {/* liaisons orthogonales entre colonnes, dans le plan final */}
          <svg width={2600} height={1200} viewBox="-1300 -600 2600 1200" style={{ position: 'absolute', left: -1300, top: -600, opacity: liens, overflow: 'visible' }}>
            {CARTES.map((_, i) => {
              if (i % COLS === COLS - 1) return null
              const a = cible(i), b = cible(i + 1 + (random(`l${i}`) > 0.6 ? COLS : 0))
              if (i + 1 + COLS >= CARTES.length && b.y !== a.y && random(`l${i}`) > 0.6) return null
              const x0 = a.x + LW / 2, x1 = b.x - LW / 2, xm = (x0 + x1) / 2
              const d = `M${x0} ${a.y} H${xm} V${b.y} H${x1}`
              return <path key={i} d={d} fill="none" stroke={C.encre} strokeOpacity={0.55} strokeWidth={2} strokeDasharray={600} strokeDashoffset={600 * (1 - liens)} />
            })}
          </svg>
          {CARTES.map((id, i) => {
            const d = depart(i), c = cible(i)
            const e = Math.max(0, Math.min(1, asm * 1.25 - (i % 7) * 0.035))
            const k = lisse(e)
            const x = d.x + (c.x - d.x) * k, y = d.y + (c.y - d.y) * k, z = d.z + (c.z - d.z) * k
            const prof = z + camZ
            const brume = Math.max(0, Math.min(1, (prof + 3200) / 2200)) * Math.max(0, Math.min(1, (1050 - prof) / 450))
            const flou = Math.max(0, Math.min(10, -(prof + 500) / 260)) * (1 - k)
            const apparition = monte(t, 0.2 + random(`p${i}`) * 3.5, 1.6 + random(`p${i}`) * 3.5)
            const flottement = Math.sin(t * 0.7 + i) * 14 * (1 - k)
            return (
              <div key={id} style={{ position: 'absolute', left: -LW / 2, top: -LH / 2, width: LW, height: LH,
                transform: `translate3d(${x}px, ${y + flottement}px, ${z}px) rotateX(${d.rx * (1 - k)}deg) rotateY(${d.ry * (1 - k)}deg) rotateZ(${d.rz * (1 - k)}deg)`,
                opacity: brume * apparition, filter: flou > 0.3 ? `blur(${flou}px)` : undefined,
                background: '#fff', borderRadius: 4, boxShadow: `0 ${24 * (1 - k) + 4}px ${60 * (1 - k) + 10}px rgba(22,22,40,${0.14 * (1 - k) + 0.06})` }}>
                <Img src={`${M}/capture/cartes/${id}.png`} style={{ width: '100%', height: '100%', display: 'block', clipPath: 'inset(3px)' }} />
              </div>
            )
          })}
        </div>
      </div>

      {/* Textes d'ouverture */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', width: 1500, height: 360, background: 'radial-gradient(ellipse at center, rgba(246,245,241,0.94) 30%, rgba(246,245,241,0) 70%)',
          opacity: 1 - monte(t, 10.6, 11.4, lisse) }} />
        <Mots texte="Toute découverte commence par une question." debut={1.35} pas={0.13} sortieA={4.1}
          style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: SERIF, fontSize: 76, color: C.encre, letterSpacing: -0.5 }} italiques={['question.']} />
        <Mots texte="Derrière chaque réponse, des dizaines d’étapes de raisonnement…" debut={4.6} pas={0.11} sortieA={7.9}
          style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: SERIF, fontSize: 64, color: C.encre, letterSpacing: -0.4, }} />
        <Mots texte="…qu’il faut pouvoir vérifier." debut={8.2} pas={0.14} sortieA={10.6}
          style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: SERIF, fontSize: 84, color: C.encre, letterSpacing: -0.6 }} italiques={['vérifier.']} />
      </div>

      {/* Logo */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: logo }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 34, transform: `scale(${0.94 + 0.06 * logo})` }}>
          <Marque debut={13.4} taille={1.25} />
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 168, color: C.encre, letterSpacing: -3, lineHeight: 1,
            clipPath: `inset(0 ${100 - monte(t, 13.6, 14.4, lisse) * 100}% 0 -10px)` }}>Atlas</div>
        </div>
        <Mots texte="Le harnais de recherche scientifique" debut={14.4} pas={0.07}
          style={{ marginTop: 30, fontFamily: SANS, fontSize: 32, color: C.gris, letterSpacing: 0.2 }} />
      </div>
    </div>
  )
}
