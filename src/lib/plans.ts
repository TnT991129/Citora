import type { PlanKey } from './types'

// Cada módulo de la plataforma. "ready" = ya construido en esta versión.
export const MODULES = {
  reservas: { name: 'Reservas online', ready: true },
  agenda: { name: 'Agenda del dueño', ready: true },
  whatsapp: { name: 'Mensajes de WhatsApp', ready: true },
  clientes: { name: 'Ficha de clientes', ready: false },
  galeria: { name: 'Galería de trabajos', ready: false },
  opiniones: { name: 'Opiniones', ready: false },
  complementos: { name: 'Complementos o extras', ready: false },
  espera: { name: 'Lista de espera', ready: false },
  finanzas: { name: 'Cobros y estadísticas', ready: false },
  descuentos: { name: 'Descuentos y fidelidad', ready: false },
  empleados: { name: 'Varios empleados', ready: false },
  sucursales: { name: 'Sucursales', ready: false },
  recordatorios: { name: 'Recordatorios por email', ready: false },
  respaldo: { name: 'Respaldo y permisos', ready: false },
} as const

export type ModuleKey = keyof typeof MODULES

const BASICO: ModuleKey[] = ['reservas', 'agenda', 'whatsapp']
const PLUS: ModuleKey[] = [...BASICO, 'clientes', 'galeria', 'opiniones']
const ULTRA: ModuleKey[] = Object.keys(MODULES) as ModuleKey[]

export const PLAN_MODULES: Record<PlanKey, ModuleKey[]> = { basico: BASICO, plus: PLUS, ultra: ULTRA }

// Lo que cada plan añade sobre el anterior (para mostrar en las tarjetas)
export const PLAN_ADDS: Record<PlanKey, ModuleKey[]> = {
  basico: BASICO,
  plus: PLUS.filter((m) => !BASICO.includes(m)),
  ultra: ULTRA.filter((m) => !PLUS.includes(m)),
}

export const PLAN_NAMES: Record<PlanKey, string> = { basico: 'Básico', plus: 'Plus', ultra: 'Ultra' }
export const PLAN_ORDER: PlanKey[] = ['basico', 'plus', 'ultra']
export const DEFAULT_PRICES = { basico: 1500, plus: 2000, ultra: 2500 }

export function hasModule(plan: PlanKey | null | undefined, module: ModuleKey): boolean {
  if (!plan) return false
  return PLAN_MODULES[plan].includes(module)
}
