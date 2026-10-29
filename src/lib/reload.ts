// Al publicar una versión nueva, GitHub Pages borra los archivos de la anterior. Quien tenía la app
// abierta y pasa a una parte que aún no había cargado (ej. de la web del negocio a "Reservar") pide
// un archivo que ya no existe: en vez de "Algo salió mal", se recarga sola y le llega la versión nueva.
import { lazy, type ComponentType } from 'react'

const KEY = 'citora:recarga'
let reloading = false

/** Solo una recarga cada 30 s: si el fallo sigue (ej. sin conexión) no se entra en un bucle */
export function canReload(last: number | null, now: number): boolean {
  return last === null || now - last > 30_000
}

/** Recarga la página si no se hizo hace poco. Devuelve true si la recarga está en marcha. */
export function reloadOnce(): boolean {
  if (reloading) return true
  try {
    const now = Date.now()
    if (!canReload(Number(sessionStorage.getItem(KEY)) || null, now)) return false
    sessionStorage.setItem(KEY, String(now))
  } catch {
    // Sin sessionStorage no hay forma de evitar un bucle: mejor no recargar
    return false
  }
  reloading = true
  window.location.reload()
  return true
}

/** Como React.lazy, pero si esa parte de la app ya no existe en el servidor, recarga la página */
export function lazyWithReload(factory: () => Promise<{ default: ComponentType }>) {
  return lazy(() =>
    factory().catch((err) => {
      // Mientras se recarga, se sigue mostrando "cargando" en vez de la pantalla de error
      if (reloadOnce()) return new Promise<never>(() => {})
      throw err
    }),
  )
}
