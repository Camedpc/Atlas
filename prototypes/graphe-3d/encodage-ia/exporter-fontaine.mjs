// Exporte le jeu « fontaine de chaîne » (modèle des prototypes, JeuRaisonnement) en JSON, point de départ de
// tous les encodages : node --experimental-strip-types encodage-ia/exporter-fontaine.mjs
import { mkdirSync, writeFileSync } from 'node:fs'

const { jeuFontaine } = await import('../raisonnement/r14-schema-technique/jeu-fontaine.ts')
const dossier = new URL('./fontaine/', import.meta.url)
mkdirSync(dossier, { recursive: true })
writeFileSync(new URL('03-prototype.json', dossier), JSON.stringify(jeuFontaine(), null, 2) + '\n')
console.log('fontaine/03-prototype.json écrit')
