import { defineConfig } from 'vite'
import { readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Pages à construire : le catalogue + chaque variantes/<id>/index.html découverte automatiquement.
const racine = import.meta.dirname
const dossierVariantes = resolve(racine, 'variantes')
const pages: Record<string, string> = { catalogue: resolve(racine, 'index.html') }
if (existsSync(dossierVariantes)) {
  for (const id of readdirSync(dossierVariantes)) {
    const page = resolve(dossierVariantes, id, 'index.html')
    if (existsSync(page)) pages[`variantes/${id}`] = page
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
