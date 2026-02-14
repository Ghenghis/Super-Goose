import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  define: {
    'process.env.GITHUB_OWNER': JSON.stringify(process.env.GITHUB_OWNER || 'Ghenghis'),
    'process.env.GITHUB_REPO': JSON.stringify(process.env.GITHUB_REPO || 'Super-Goose'),
  },
});
