import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@main': resolve('src/main'),
      '@renderer': resolve('src/renderer')
    }
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    restoreMocks: true,
    clearMocks: true,
    testTimeout: 15_000
  }
})
