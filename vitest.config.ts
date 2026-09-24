import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { loadEnv } from 'vite'

export default defineConfig({
  test: {
    // Node by default. A component test opts into a DOM with a
    // `// @vitest-environment jsdom` comment at the top of its file, so the
    // domain and database tests keep running without one.
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // vitest doesn't load .env files on its own; reuse Vite's loader so
    // DATABASE_URL from .env.local reaches process.env in test files.
    env: loadEnv('test', process.cwd(), ''),
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
