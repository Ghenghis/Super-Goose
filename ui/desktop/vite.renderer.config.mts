import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config
export default defineConfig({
  define: {
    // This replaces process.env.ALPHA with a literal at build time
    'process.env.ALPHA': JSON.stringify(process.env.ALPHA === 'true'),
    'process.env.GOOSE_TUNNEL': JSON.stringify(process.env.GOOSE_TUNNEL !== 'no' && process.env.GOOSE_TUNNEL !== 'none'),
  },

  plugins: [tailwindcss()],

  build: {
    target: 'esnext'
  },

  // Vite 7 + Node 25 race condition: dep-scan's esbuild resolve callbacks
  // fire after server close, causing "throwClosedServerError". This is a
  // non-fatal warning — Vite falls back to unbundled mode — but it clutters
  // logs. Setting noDiscovery=true skips the scanner entirely.
  optimizeDeps: {
    noDiscovery: true,
  },
});
