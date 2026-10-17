import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Cloud build: normal asset splitting, served by a static host behind the same
// origin as /api. The single-file demo build remains `npm run build`.
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    outDir: 'dist-cloud',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
