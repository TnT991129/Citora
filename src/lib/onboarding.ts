// Primeros pasos del dueño y herramientas activas de "Más" (columna businesses.onboarding, ver
// schema.sql). Si la base de datos aún no tiene la columna, todo funciona con los valores por defecto.
import { supabase } from './supabase'
import type { Business } from './types'

export type SkipKey = 'moneda' | 'servicios' | 'horario'
export type StepId = 'precios' | 'ver' | 'prueba' | 'avisos' | 'compartir' | 'primera'

export interface Onboarding {
  tools?: string[]
  skipped?: SkipKey[]
  steps?: Partial<Record<StepId, string>>
  tutorial?: string
  all_done?: string
}

/** Herramientas de "Más". Las tres primeras están activas al empezar; el resto se activa con un toque. */
export const TOOLS = [
  { id: 'recordatorios', label: 'Recordatorios', desc: 'Avisa por WhatsApp a los clientes de mañana', icon: 'bell' },
  { id: 'opiniones', label: 'Opiniones', desc: 'Lo que dicen tus clientes', icon: 'star' },
  { id: 'estadisticas', label: 'Estadísticas', desc: 'Ingresos, asistencia y lo más pedido', icon: 'chart' },
  { id: 'espera', label: 'Lista de espera', desc: 'Clientes que quieren un hueco si se libera', icon: 'hourglass' },
  { id: 'cupones', label: 'Cupones', desc: 'Códigos de descuento para tus clientes', icon: 'gift' },
  { id: 'bonos', label: 'Bonos', desc: 'Paquetes de sesiones pagadas por adelantado', icon: 'ticket' },
  { id: 'galeria', label: 'Galería', desc: 'Fotos de tus trabajos en tu página', icon: 'image' },
  { id: 'gastos', label: 'Gastos', desc: 'Apunta tus gastos y mira lo que ganas de verdad', icon: 'receipt' },
  { id: 'respaldo', label: 'Respaldo', desc: 'Descarga tus citas y clientes en Excel', icon: 'download' },
] as const

export type ToolId = (typeof TOOLS)[number]['id']

export const DEFAULT_TOOLS: ToolId[] = ['recordatorios', 'opiniones', 'estadisticas']

export function readOnboarding(b: Pick<Business, 'onboarding'> | null | undefined): Onboarding {
  const o = b?.onboarding
  return o && typeof o === 'object' && !Array.isArray(o) ? o : {}
}

export function activeTools(o: Onboarding): string[] {
  return Array.isArray(o.tools) ? o.tools : DEFAULT_TOOLS
}

/** Junta un cambio con lo que ya hay (los pasos se suman, no se pisan) */
export function mergeOnboarding(o: Onboarding, patch: Onboarding): Onboarding {
  return { ...o, ...patch, steps: { ...(o.steps || {}), ...(patch.steps || {}) } }
}

/** Guarda en el servidor. Nunca lanza error: si falla, el panel sigue funcionando. */
export async function saveOnboarding(businessId: string, value: Onboarding): Promise<boolean> {
  const { error } = await supabase.from('businesses').update({ onboarding: value }).eq('id', businessId)
  if (error) console.warn('No se pudo guardar los primeros pasos', error)
  return !error
}

/** Datos del servidor para Primeros pasos, Mi negocio y Mensualidad (get_my_progress) */
export interface Progress {
  web_total: number
  web_real: number
  bookings: number
  revenue: number
  push_on: boolean
  visits_7d: number
}

export async function fetchProgress(): Promise<Progress | null> {
  const { data, error } = await supabase.rpc('get_my_progress')
  if (error || !data) return null
  return data as Progress
}

/** Primeros pasos, en orden. "primera" se marca sola. */
export const FIRST_STEPS: { id: StepId; title: string; desc: string }[] = [
  { id: 'precios', title: 'Revisa tus servicios y precios', desc: 'Son lo primero que ven tus clientes.' },
  { id: 'ver', title: 'Mira tu página como un cliente', desc: 'Así sabes qué verán al abrir tu enlace.' },
  { id: 'prueba', title: 'Haz una reserva de prueba', desc: 'Resérvate una cita tú mismo y mira cómo te llega.' },
  { id: 'avisos', title: 'Activa los avisos en este móvil', desc: 'Sin esto no te enteras cuando alguien reserva.' },
  { id: 'compartir', title: 'Comparte tu enlace en WhatsApp', desc: 'Ponlo en tu estado: el mensaje ya está escrito.' },
  { id: 'primera', title: 'Recibe tu primera reserva', desc: 'Se marca sola cuando un cliente reserve.' },
]

/** Qué pasos están hechos, mezclando lo que apuntó el panel con lo que dicen los datos */
export function stepsDone(o: Onboarding, p: Progress | null): Record<StepId, boolean> {
  const s = o.steps || {}
  return {
    // Si no saltó el paso de Servicios al crear su app, ya los revisó ahí
    precios: Boolean(s.precios) || !(o.skipped || []).includes('servicios'),
    ver: Boolean(s.ver),
    prueba: Boolean(s.prueba) || Boolean(p && p.web_total > p.web_real),
    avisos: Boolean(s.avisos) || Boolean(p?.push_on),
    compartir: Boolean(s.compartir) || Boolean(p && p.visits_7d > 0),
    primera: Boolean(p && p.web_real > 0),
  }
}

/** Saltó los servicios al crear su app y aún no los ha revisado: sus clientes ven precios de ejemplo */
export const pricesUnreviewed = (o: Onboarding) => (o.skipped || []).includes('servicios') && !o.steps?.precios
