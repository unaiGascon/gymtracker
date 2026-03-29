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
})
