import { defineConfig } from 'vite'

// En local, /api est servi par uvicorn (voir README) ; sur Vercel, par la fonction Python.
export default defineConfig({
  server: {
    // ws : l'appel vocal (atlas/voix) passe par un WebSocket.
    proxy: { '/api': { target: 'http://localhost:8000', ws: true } },
  },
})
