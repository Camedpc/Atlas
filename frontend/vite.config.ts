import { defineConfig } from 'vite'

// En local, /api est servi par uvicorn (voir README) ; sur Vercel, par la fonction Python.
// ATLAS_API_LOCAL vise un autre port (ex. un worktree qui tourne à côté du serveur principal).
export default defineConfig({
  server: {
    proxy: { '/api': process.env.ATLAS_API_LOCAL ?? 'http://localhost:8000' },
  },
})
