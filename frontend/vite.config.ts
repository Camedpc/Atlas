import { defineConfig, type Plugin } from 'vite'

// Trois pages : l'accueil (index.html), l'application (app.html, servie aussi sur /demo) et l'admin (admin.html).
// Sur Vercel, vercel.json fait les mêmes réécritures d'adresses ; ce greffon les reproduit en développement.
const PAGES: Record<string, string> = { '/app': '/app.html', '/demo': '/app.html', '/admin': '/admin.html' }

const adressesDesPages: Plugin = {
  name: 'adresses-des-pages',
  configureServer(serveur) {
    serveur.middlewares.use((requete, _reponse, suivant) => {
      const [chemin, requeteUrl] = (requete.url ?? '').split('?')
      const page = PAGES[chemin.replace(/\/$/, '')]
      if (page) requete.url = page + (requeteUrl ? `?${requeteUrl}` : '')
      suivant()
    })
  },
}

// En local, /api est servi par uvicorn (voir README) ; sur Vercel, par la fonction Python.
// ATLAS_API_LOCAL vise un autre port (ex. un worktree qui tourne à côté du serveur principal).
export default defineConfig({
  plugins: [adressesDesPages],
  server: {
    // ws : l'appel vocal (atlas/voix) passe par un WebSocket.
    proxy: { '/api': { target: process.env.ATLAS_API_LOCAL ?? 'http://localhost:8000', ws: true } },
  },
  build: {
    rollupOptions: { input: { accueil: 'index.html', app: 'app.html', admin: 'admin.html' } },
  },
})
