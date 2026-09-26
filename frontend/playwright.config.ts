import { defineConfig, devices } from '@playwright/test'

// Tests de bout en bout du front (npm run e2e). Les appels /api/* sont interceptés par les tests, qui
// servent des données fixes (aucun réseau, aucune base).
const PORT = 5175

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1280, height: 800 }, colorScheme: 'light' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
  },
})
