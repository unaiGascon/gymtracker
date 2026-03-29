import { createClient } from '@supabase/supabase-js'

// Lee las credenciales del archivo .env
// Las variables VITE_* son las únicas expuestas al frontend por Vite
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Cliente único de Supabase — lo importamos en los componentes que lo necesiten
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
