import type { PlanKey } from './types'

// Cada módulo de la plataforma. "ready" = ya construido en esta versión.
export const MODULES = {
  reservas: { name: 'Reservas online', ready: true },
  agenda: { name: 'Agenda del dueño', ready: true },
  whatsapp: { name: 'Mensajes de WhatsApp', ready: true },
  clientes: { name: 'Ficha de clientes', ready: true },
  galeria: { name: 'Galería de trabajos', ready: true },
  opiniones: { name: 'Opiniones', ready: true },
  complementos: { name: 'Complementos o extras', ready: true },
  espera: { name: 'Lista de espera', ready: true },
  finanzas: { name: 'Cobros y estadísticas', ready: true },
  descuentos: { name: 'Cupones de descuento', ready: true },
  empleados: { name: 'Varios profesionales', ready: true },
  sucursales: { name: 'Sucursales', ready: false },
  recordatorios: { name: 'Recordatorios por WhatsApp', ready: true },
  respaldo: { name: 'Respaldo de datos (Excel)', ready: true },
} as const

export type ModuleKey = keyof typeof MODULES

// Dos planes (versión 1.4). En la base de datos: 'basico' = Citora Solo y 'ultra' = Citora Equipo
// ('plus' es de pagos antiguos y cuenta como Solo). La prueba gratis es con Equipo.
export type PaidPlan = 'basico' | 'ultra'
export const PLANS: Record<PaidPlan, { name: string; short: string; desc: string }> = {
  basico: { name: 'Citora Solo', short: 'Solo', desc: 'Para quien atiende solo: todo incluido, menos el equipo.' },
  ultra: { name: 'Citora Equipo', short: 'Equipo', desc: 'Para salones con varias personas: todo, más tu equipo con sus servicios y su agenda.' },
}
export const PLAN_LABEL = 'Plan Citora'
export const DEFAULT_PRICE = 1500
export const DEFAULT_TEAM_PRICE = 3000

/** Nombre del plan para enseñarlo ("Citora Solo" / "Citora Equipo") */
export function planName(plan: string | null | undefined): string {
  return plan === 'ultra' ? PLANS.ultra.name : plan ? PLANS.basico.name : PLAN_LABEL
}

/** Lo que incluye el plan (lo que ya está construido) */
export const INCLUDED: ModuleKey[] = (Object.keys(MODULES) as ModuleKey[]).filter((m) => MODULES[m].ready)

/** Lo que incluye un plan concreto: Solo, todo menos el equipo */
export function includedIn(plan: PaidPlan): ModuleKey[] {
  return INCLUDED.filter((m) => plan === 'ultra' || m !== 'empleados')
}

/** Con un plan activo (pagado o en prueba) se tiene todo; el equipo, solo con Equipo (como plan_has) */
export function hasModule(plan: PlanKey | null | undefined, module: ModuleKey): boolean {
  return Boolean(plan) && (module !== 'empleados' || plan === 'ultra')
}
