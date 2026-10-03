import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(url && key)

// Si faltan las claves, se crea un cliente "vacío" para que la app no se rompa al abrir
export const supabase = createClient(url || 'https://sin-configurar.supabase.co', key || 'sin-clave', {
  auth: { persistSession: true, autoRefreshToken: true },
})
