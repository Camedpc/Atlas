import { defineConfig } from 'vite'

// En local, /api est servi par uvicorn (voir README) ; sur Vercel, par la fonction Python.
// ATLAS_API_LOCAL vise un autre port (ex. un worktree qui tourne à côté du serveur principal).
export default defineConfig({
  server: {
    // ws : l'appel vocal (atlas/voix) passe par un WebSocket.
    proxy: { '/api': { target: process.env.ATLAS_API_LOCAL ?? 'http://localhost:8000', ws: true } },
  },
})
