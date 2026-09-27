import React, { useEffect, useState } from 'react'
import { AbsoluteFill, continueRender, delayRender, getInputProps } from 'remotion'
import { loadFont } from '@remotion/google-fonts/Inter'
import { BandeSon } from './BandeSon'
import { M, useT } from './lib'
import { Ouverture } from './scenes/Ouverture'
import { Recherche } from './scenes/Recherche'
import { Graphe } from './scenes/Graphe'
import { Montage } from './scenes/Montage'

loadFont('normal', { weights: ['400', '500', '600'], subsets: ['latin', 'latin-ext'] })

const CSS = `
@font-face { font-family: 'CMU Serif Film'; src: url('${M}/fonts/cmunrm.woff') format('woff'); font-weight: 400; font-style: normal; }
@font-face { font-family: 'CMU Serif Film'; src: url('${M}/fonts/cmunbx.woff') format('woff'); font-weight: 700; font-style: normal; }
@font-face { font-family: 'CMU Serif Film'; src: url('${M}/fonts/cmunti.woff') format('woff'); font-weight: 400; font-style: italic; }
@font-face { font-family: 'CMU Serif Film'; src: url('${M}/fonts/cmunbi.woff') format('woff'); font-weight: 700; font-style: italic; }
`

export const AtlasFilm: React.FC = () => {
  const t = useT()
  const [poignee] = useState(() => delayRender('polices'))
  useEffect(() => {
    Promise.all(['400 20px "CMU Serif Film"', '700 20px "CMU Serif Film"', 'italic 400 20px "CMU Serif Film"'].map((f) => document.fonts.load(f)))
      .then(() => continueRender(poignee))
      .catch(() => continueRender(poignee))
  }, [poignee])
  return (
    <AbsoluteFill style={{ background: '#f6f5f1' }}>
      <style>{CSS}</style>
      {t < 16.31 && <AbsoluteFill><Ouverture /></AbsoluteFill>}
      {t >= 16.31 && t < 40.35 && <AbsoluteFill><Recherche /></AbsoluteFill>}
      {t >= 39.7 && t < 70.31 && <AbsoluteFill><Graphe /></AbsoluteFill>}
      {t >= 70.31 && <AbsoluteFill><Montage /></AbsoluteFill>}
      {!(getInputProps() as any).muet && <BandeSon />}
    </AbsoluteFill>
  )
}
