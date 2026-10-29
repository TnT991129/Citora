// Medición de visitas para las estadísticas del administrador (ver track_event en schema.sql).
// Anónima: sin cookies, sin IP ni datos personales. Cada navegador guarda un número aleatorio
// (visitante) y cada pestaña otro (sesión). Nunca da error ni frena la página: si falla, no se mide.
import { detectSource, isBot } from './visitor'
import { supabase, supabaseConfigured } from './supabase'

type EventName = 'visita' | 'crear_paso' | 'negocio_creado' | 'reserva_hecha'
type Page = 'portada' | 'crear' | 'entrar' | 'negocio' | 'reservar'

const VISITOR = 'citora:visitante'
const SESSION = 'citora:sesion'
const SOURCE = 'citora:origen'
const OFF = 'citora:no-medir'

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  // Navegadores antiguos: UUID v4 con Math.random (suficiente para contar visitantes)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function stored(storage: Storage, key: string, make: () => string): string {
  const v = storage.getItem(key)
  if (v) return v
  const n = make()
  storage.setItem(key, n)
  return n
}

/** Deja de medir en este dispositivo (el administrador y los dueños no cuentan como visitas) */
export function stopTracking(): void {
  try {
    localStorage.setItem(OFF, '1')
  } catch {
    /* sin almacenamiento */
  }
}

/** Anota un evento. "once": solo una vez por sesión (para no contar dos veces una recarga) */
export function track(name: EventName, opts: { page?: Page; slug?: string; step?: number; once?: boolean } = {}): void {
  try {
    if (!import.meta.env.PROD || !supabaseConfigured) return
    if (localStorage.getItem(OFF) || isBot(navigator.userAgent, Boolean(navigator.webdriver))) return
    const onceKey = `citora:medido:${name}:${opts.page ?? ''}:${opts.slug ?? ''}:${opts.step ?? ''}`
    if (opts.once !== false && sessionStorage.getItem(onceKey)) return
    sessionStorage.setItem(onceKey, '1')

    const visitor = stored(localStorage, VISITOR, newId)
    const session = stored(sessionStorage, SESSION, newId)
    // El origen se mira al llegar (primera página de la pestaña) y se mantiene durante la visita
    const source = stored(sessionStorage, SOURCE, () => detectSource(location.search, document.referrer, navigator.userAgent, location.host))
    const device = window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 768 ? 'movil' : 'ordenador'

    supabase
      .rpc('track_event', {
        p_visitor: visitor, p_session: session, p_name: name, p_page: opts.page ?? null, p_slug: opts.slug ?? null,
        p_step: opts.step ?? null, p_source: source, p_device: device,
      })
      .then(() => {}, () => {})
  } catch {
    /* sin almacenamiento o sin red: no se mide */
  }
}
