// Page d'étude autonome : `npx vite build --config ../prototypes/decisions/vite.config.mjs` depuis frontend/ (ses
// node_modules). Pas d'import de « vite » ici : ce dossier n'a pas de node_modules.
import { fileURLToPath } from 'node:url'

const ici = fileURLToPath(new URL('.', import.meta.url))

export default {
  root: ici,
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2023' },
  server: { port: 8772, fs: { allow: ['../..'] } },
}
