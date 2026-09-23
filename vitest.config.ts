import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { loadEnv } from 'vite'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // vitest doesn't load .env files on its own; reuse Vite's loader so
    // DATABASE_URL from .env.local reaches process.env in test files.
    env: loadEnv('test', process.cwd(), ''),
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
