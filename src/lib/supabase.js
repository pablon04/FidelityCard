import { createClient } from '@supabase/supabase-js'
import { env } from './env.js'

if (!env.supabaseUrl || !env.supabaseAnonKey) {
  console.warn(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (copia .env.example a .env.local).',
  )
}

// createClient lanza si la URL esta vacia: usamos un placeholder para que la app arranque sin .env.
export const supabase = createClient(
  env.supabaseUrl || 'http://127.0.0.1:54321',
  env.supabaseAnonKey || 'missing-anon-key',
)
