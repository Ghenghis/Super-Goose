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

  server: {
    // Use port 5233 to avoid conflicts with Docker Desktop (which often
    // grabs 5173). strictPort=false lets Vite auto-increment if 5233 is
    // also taken, and electron-forge/plugin-vite reads the actual port.
    port: 5233,
  },

  build: {
    target: 'esnext'
  },

  // Vite 7 + Node 25 race condition: dep-scan's esbuild resolve callbacks
  // fire after server close, causing "throwClosedServerError". This is a
  // non-fatal warning — Vite falls back to unbundled mode — but it clutters
  // logs. Setting noDiscovery=true skips the scanner entirely.
  optimizeDeps: {
    noDiscovery: true,
    // CJS packages that need explicit pre-bundling since noDiscovery skips auto-detection.
    // Without this, named ESM imports (e.g. `import { parse } from 'shell-quote'`) fail
    // because Vite serves the raw CJS without interop transformation.
    include: ['shell-quote', 'lodash'],
  },
});
