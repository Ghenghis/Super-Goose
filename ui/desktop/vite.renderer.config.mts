import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  CRITICAL: DO NOT REMOVE @vitejs/plugin-react OR optimizeDeps.include!     ║
// ║                                                                            ║
// ║  React 19 ships CJS modules. With noDiscovery:true, Vite skips            ║
// ║  auto-detection of CJS→ESM interop needs. Every CJS dependency that uses   ║
// ║  named exports MUST be listed in optimizeDeps.include or the app crashes   ║
// ║  with "does not provide an export named 'Fragment'" errors.                ║
// ║                                                                            ║
// ║  RULES:                                                                    ║
// ║  1. Only CJS packages go in `include` — ESM packages must NOT be listed    ║
// ║  2. ESM packages (type:"module" in package.json) handle their own imports  ║
// ║  3. Adding ESM packages here causes "Could not resolve" internal paths     ║
// ║  4. After editing, DELETE .vite/ cache AND test: `npm run start-gui`       ║
// ║                                                                            ║
// ║  This has broken 4 times. DO NOT MODIFY without testing the app startup.   ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

// https://vitejs.dev/config
export default defineConfig({
  define: {
    // This replaces process.env.ALPHA with a literal at build time
    'process.env.ALPHA': JSON.stringify(process.env.ALPHA === 'true'),
    'process.env.GOOSE_TUNNEL': JSON.stringify(process.env.GOOSE_TUNNEL !== 'no' && process.env.GOOSE_TUNNEL !== 'none'),
  },

  // CRITICAL: @vitejs/plugin-react MUST be first — it provides the JSX transform
  // and ensures react/jsx-runtime is resolved correctly. Without it, the app
  // crashes with "does not provide an export named 'Fragment'" at runtime.
  plugins: [react(), tailwindcss()],

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
  //
  // CONSEQUENCE: Every CJS package must be EXPLICITLY listed in `include`.
  // If you add a new CJS dependency, add it here or the app will crash.
  //
  // DO NOT add ESM packages (type:"module" in package.json) here!
  // ESM packages like date-fns, uuid, react-resizable-panels, react-markdown
  // will BREAK with esbuild "Could not resolve" errors if included.
  optimizeDeps: {
    noDiscovery: true,
    // CJS-ONLY packages that need explicit pre-bundling since noDiscovery
    // skips auto-detection. Without this, named ESM imports fail because
    // Vite serves the raw CJS without interop transformation.
    //
    // HOW TO DIAGNOSE: If you see "does not provide an export named 'X'" in
    // the browser console, check if the package is CJS (no "type":"module"
    // in its package.json). If CJS, add it here. If ESM, the issue is
    // something else.
    //
    // VERIFIED CJS (must be listed):
    //   react, react-dom, react-router-dom, react-toastify, react-select,
    //   react-syntax-highlighter, lucide-react, cronstrue, shell-quote,
    //   lodash, lodash/kebabCase, lodash/debounce, clsx, class-variance-authority, tailwind-merge,
    //   compare-versions, @radix-ui/*
    //
    // VERIFIED ESM (must NOT be listed):
    //   date-fns, uuid, react-resizable-panels, react-markdown
    include: [
      // --- React core (CJS in React 19) ---
      'react',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom',
      'react-dom/client',
      // --- React ecosystem (CJS) ---
      'react-router-dom',
      'react-toastify',
      'react-select',
      'react-syntax-highlighter',
      'lucide-react',
      // --- Utility libs (CJS) ---
      'cronstrue',
      'shell-quote',
      'lodash',
      'lodash/kebabCase',
      'lodash/debounce',
      'clsx',
      'class-variance-authority',
      'tailwind-merge',
      'compare-versions',
      // --- Radix UI (CJS internals) ---
      '@radix-ui/react-slot',
      '@radix-ui/react-dialog',
      '@radix-ui/react-popover',
      '@radix-ui/react-select',
      '@radix-ui/react-accordion',
      '@radix-ui/react-tabs',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-avatar',
      '@radix-ui/react-icons',
      // --- HTML/Style parsing (CJS) ---
      'style-to-js',
      'html-react-parser',
    ],
  },
});
