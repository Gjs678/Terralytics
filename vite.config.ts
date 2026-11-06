import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('scheduler')) {
              return 'vendor-react'
            }
            if (
              id.includes('recharts') ||
              id.includes('d3-') ||
              id.includes('decimal.js-light') ||
              id.includes('immer') ||
              id.includes('es-toolkit')
            ) {
              return 'vendor-charts'
            }
            if (id.includes('mappls-web-maps')) {
              return 'vendor-maps'
            }
          }
        },
      },
    },
  },
})
