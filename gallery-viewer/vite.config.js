import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  base: '/web/gallery/',
  build: {
    outDir: '../web/gallery',
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/web/gallery/list': 'http://localhost:8082',
      '/web/gallery/folders': 'http://localhost:8082',
      '/web/gallery/thumbnail': 'http://localhost:8082',
      '/view': 'http://localhost:8082',
    }
  }
})
