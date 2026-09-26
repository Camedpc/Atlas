import { defineConfig } from 'vite'

// En local, /api est servi par uvicorn (voir README) ; sur Vercel, par la fonction Python.
export default defineConfig({
  server: {
    proxy: { '/api': 'http://localhost:8000' },
  },
})
