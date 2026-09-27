import React from 'react'
import { Composition } from 'remotion'
import { AtlasFilm } from './AtlasFilm'
import { DUREE } from './BandeSon'
import { FPS, H, W } from './lib'

export const Racine: React.FC = () => (
  <Composition id="Atlas" component={AtlasFilm} durationInFrames={Math.round(DUREE * FPS)} fps={FPS} width={W} height={H} />
)
