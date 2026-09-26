/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

// En local, /api est servi par uvicorn (voir README) ; sur Vercel, par la fonction Python.
export default defineConfig({
  server: {
    proxy: { '/api': 'http://localhost:8000' },
  },
  // Tests unitaires seulement ; les tests de bout en bout (e2e/) passent par Playwright.
  test: { include: ['src/**/*.test.ts'] },
})
