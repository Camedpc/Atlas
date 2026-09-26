import { defineConfig } from 'vite'
import { readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Pages à construire : le catalogue + chaque variantes/<id>/index.html et raisonnement/<id>/index.html
// découverte automatiquement.
const racine = import.meta.dirname
const pages: Record<string, string> = { catalogue: resolve(racine, 'index.html') }
for (const serie of ['variantes', 'raisonnement']) {
  const dossier = resolve(racine, serie)
  if (!existsSync(dossier)) continue
  for (const id of readdirSync(dossier)) {
    const page = resolve(dossier, id, 'index.html')
    if (existsSync(page)) pages[`${serie}/${id}`] = page
  }
}

export default defineConfig({
  root: racine,
  base: './',
  server: { port: 5180, host: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: { input: pages },
  },
})
