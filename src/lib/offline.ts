// Panel sin internet: cada vez que algo se carga bien, se guarda una copia en el móvil. Si después no
// hay conexión, se enseña esa copia (solo para ver: los cambios necesitan internet) con un aviso de
// la hora de los datos. Cuando vuelve la conexión, la página se recarga sola con lo último.
import { useEffect, useState } from 'react'
import { load, remove, save } from './storage'
import { supabase } from './supabase'

const PREFIX = 'citora:sin-conexion:'
const INDEX = PREFIX + 'lista'
/** Como mucho tantas copias (las más recientes): cada semana o mes de la agenda es una */
const MAX = 40

let offlineSince: number | null = null
const listeners = new Set<() => void>()

/** ¿El error es por no tener conexión? (y no un error de la base de datos) */
export function isNetworkError(e: unknown): boolean {
  const msg = typeof e === 'string' ? e : (e as { message?: string } | null)?.message || ''
  return /Failed to fetch|NetworkError|Load failed|network|fetch failed/i.test(msg) || (typeof navigator !== 'undefined' && navigator.onLine === false)
}

/** Guarda una copia de lo que se acaba de cargar bien */
export function cachePut(key: string, value: unknown): void {
  save(PREFIX + key, { at: Date.now(), value })
  const keys = [key, ...load<string[]>(INDEX, []).filter((k) => k !== key)]
  keys.slice(MAX).forEach((k) => remove(PREFIX + k))
  save(INDEX, keys.slice(0, MAX))
}

/** Borra todas las copias (al cerrar sesión: no quedan datos de clientes en el móvil) */
export function clearOfflineCache(): void {
  load<string[]>(INDEX, []).forEach((k) => remove(PREFIX + k))
  remove(INDEX)
}

if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') clearOfflineCache()
  })
}

/** La copia guardada (y de cuándo es), o null si no hay. Al usarla, el panel pasa a "sin conexión". */
export function cacheUse<T>(key: string): T | null {
  const c = load<{ at: number; value: T } | null>(PREFIX + key, null)
  if (!c) return null
  if (offlineSince === null || c.at < offlineSince) {
    offlineSince = c.at
    listeners.forEach((l) => l())
  }
  return c.value
}

/** Hora de los datos que se están viendo sin conexión, o null si hay conexión */
export function useOffline(): number | null {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    // Al volver la conexión, se recarga con lo último
    const back = () => {
      if (offlineSince !== null) window.location.reload()
    }
    window.addEventListener('online', back)
    return () => {
      listeners.delete(l)
      window.removeEventListener('online', back)
    }
  }, [])
  return offlineSince
}
