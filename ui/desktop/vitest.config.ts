/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const cfg = {
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    // React 19 requires NODE_ENV=development for act() to be available
    env: {
      NODE_ENV: 'development',
    },
    // Code coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/test/**',
        'src/types/**',
        'src/**/*.d.ts',
        'src/**/index.ts',
      ],
      all: true,
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,
    },
  },
} satisfies Record<string, any>

export default defineConfig(cfg as any)
