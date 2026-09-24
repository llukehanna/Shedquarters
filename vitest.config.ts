import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { loadEnv } from 'vite'

const TESTS = ['tests/**/*.test.ts', 'tests/**/*.test.tsx']
const NIGHTS = ['tests/set-teams-db.test.ts', 'tests/spikeball-db.test.ts']

export default defineConfig({
  test: {
    // Node by default. A component test opts into a DOM with a
    // `// @vitest-environment jsdom` comment at the top of its file, so the
    // domain and database tests keep running without one.
    environment: 'node',
    // vitest doesn't load .env files on its own; reuse Vite's loader so
    // DATABASE_URL from .env.local reaches process.env in test files.
    env: loadEnv('test', process.cwd(), ''),
    projects: [
      { extends: true, test: { name: 'unit', include: TESTS, exclude: NIGHTS } },
      // The files that open a night. The database allows one open night per
      // sport, so these run one file at a time instead of racing each other.
      { extends: true, test: { name: 'nights', include: NIGHTS, fileParallelism: false } },
    ],
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
