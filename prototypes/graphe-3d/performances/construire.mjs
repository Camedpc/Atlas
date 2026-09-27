// Assemble le banc TypeScript en un module Node (performances/.cache/banc.mjs) avec rolldown, déjà
// présent dans node_modules (dépendance de Vite) : rien à installer, pas de `vite build`.
// Toute importation de `…/src/raisonnement` (index : sigma, DOM) est redirigée vers le shim.
//
//   node performances/construire.mjs              # banc.mjs et banc-lod.mjs
//   node performances/construire.mjs banc-lod     # une seule entrée

import { build } from 'rolldown'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ici = dirname(fileURLToPath(import.meta.url))
const shim = join(ici, 'src', 'shim-raisonnement.ts')

const entrees = process.argv.slice(2).length ? process.argv.slice(2) : ['banc', 'banc-lod']
for (const entree of entrees) await build({
  input: join(ici, 'src', `${entree}.ts`),
  platform: 'node',
  logLevel: 'warn',
  plugins: [{
    name: 'shim-raisonnement',
    resolveId(source, importer) {
      if (!importer) return null
      const abs = resolve(dirname(importer), source).replace(/\\/g, '/')
      if (abs.endsWith('/src/raisonnement') || abs.endsWith('/src/raisonnement/index') || abs.endsWith('/src/raisonnement/index.ts')) return shim
      return null
    },
  }],
  output: { file: join(ici, '.cache', `${entree}.mjs`), format: 'esm', sourcemap: false },
})
console.log(`assemblé : performances/.cache/${entrees.join('.mjs, ')}.mjs`)
