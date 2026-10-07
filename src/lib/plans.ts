import type { PlanKey } from './types'

// Cada módulo de la plataforma. "ready" = ya construido en esta versión.
export const MODULES = {
  reservas: { name: 'Reservas online', ready: true },
  agenda: { name: 'Agenda del dueño', ready: true },
  whatsapp: { name: 'Mensajes de WhatsApp', ready: true },
  clientes: { name: 'Ficha de clientes', ready: true },
  galeria: { name: 'Galería de trabajos', ready: true },
  opiniones: { name: 'Opiniones', ready: true },
  complementos: { name: 'Complementos o extras', ready: false },
  espera: { name: 'Lista de espera', ready: true },
  finanzas: { name: 'Cobros y estadísticas', ready: true },
  descuentos: { name: 'Cupones de descuento', ready: true },
  empleados: { name: 'Varios profesionales', ready: true },
  sucursales: { name: 'Sucursales', ready: false },
  recordatorios: { name: 'Recordatorios por WhatsApp', ready: true },
  respaldo: { name: 'Respaldo de datos (Excel)', ready: true },
} as const

export type ModuleKey = keyof typeof MODULES

// Hay un solo plan, con todo incluido. En la base de datos se guarda como 'ultra';
// los pagos antiguos pueden tener 'basico' o 'plus' y se muestran igual.
export const SINGLE_PLAN: PlanKey = 'ultra'
export const PLAN_LABEL = 'Plan Citora'
export const DEFAULT_PRICE = 1500

/** Lo que incluye el plan (lo que ya está construido) */
export const INCLUDED: ModuleKey[] = (Object.keys(MODULES) as ModuleKey[]).filter((m) => MODULES[m].ready)

/** Con un plan activo (pagado o en prueba) se tiene todo */
export function hasModule(plan: PlanKey | null | undefined, _module: ModuleKey): boolean {
  return Boolean(plan)
}
