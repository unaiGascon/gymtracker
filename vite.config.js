import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Tailwind v4 se integra como plugin de Vite (más rápido que PostCSS)
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  // Pre-bundlear Supabase para que Rolldown (Vite 8) resuelva sus deps correctamente
  optimizeDeps: {
    include: ['@supabase/supabase-js'],
  },
  build: {
    // Dividir dependencias pesadas en chunks separados para reducir el bundle inicial
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@supabase'))                     return 'vendor-supabase'
          if (id.includes('recharts') || id.includes('/d3-')) return 'vendor-recharts'
          if (id.includes('qrcode'))                       return 'vendor-qrcode'
          if (id.includes('node_modules'))                  return 'vendor'
        },
      },
    },
  },
})
