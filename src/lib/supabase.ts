import { createClient } from '@supabase/supabase-js'

// Limpia lo que se pegó en los secretos: espacios, comillas, barra final o "/rest/v1"
function clean(v: string | undefined): string {
  return (v || '').trim().replace(/^["']|["']$/g, '').trim()
}

function cleanUrl(v: string | undefined): string {
  let u = clean(v).replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '')
  if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`
  try {
    return new URL(u).origin
  } catch {
    return ''
  }
}

const url = cleanUrl(import.meta.env.VITE_SUPABASE_URL)
const key = clean(import.meta.env.VITE_SUPABASE_ANON_KEY)

export const supabaseConfigured = Boolean(url && key)

// Si faltan las claves, se crea un cliente "vacío" para que la app muestre el aviso en vez de quedarse en blanco
export const supabase = createClient(url || 'https://sin-configurar.supabase.co', key || 'sin-clave', {
  auth: { persistSession: true, autoRefreshToken: true },
})