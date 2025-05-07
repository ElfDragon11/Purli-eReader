import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path, { dirname } from "path";

// https://vitejs.dev/config/
const __dirname = dirname(__filename);
export default defineConfig({
  base: '/', // absolute path for assets
  build: {
    outDir: 'dist',     // index.html and assets will be in the "waitlist" folder
    assetsDir: 'assets'
  },
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    proxy: {
      '/create-checkout-session': 'http://localhost:3000',
      '/session-status':          'http://localhost:3000',
    },
  },
});
