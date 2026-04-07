import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // Écoute sur 0.0.0.0 → accessible depuis le réseau local
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
