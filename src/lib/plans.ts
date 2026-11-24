import type { PlanKey } from './types'
import { t } from './i18n'

// Cada módulo de la plataforma. "ready" = ya construido en esta versión.
export const MODULES = {
  reservas: { name: t('Reservas online'), ready: true },
  agenda: { name: t('Agenda del dueño'), ready: true },
  whatsapp: { name: t('Mensajes de WhatsApp'), ready: true },
  clientes: { name: t('Ficha de clientes'), ready: true },
  galeria: { name: t('Galería de trabajos'), ready: true },
  opiniones: { name: t('Opiniones'), ready: true },
  complementos: { name: t('Complementos o extras'), ready: true },
  espera: { name: t('Lista de espera'), ready: true },
  finanzas: { name: t('Cobros y estadísticas'), ready: true },
  descuentos: { name: t('Cupones de descuento'), ready: true },
  empleados: { name: t('Varios profesionales'), ready: true },
  sucursales: { name: t('Sucursales'), ready: false },
  recordatorios: { name: t('Recordatorios por WhatsApp'), ready: true },
  respaldo: { name: t('Respaldo de datos (Excel)'), ready: true },
} as const

export type ModuleKey = keyof typeof MODULES

// Dos planes (versión 1.4). En la base de datos: 'basico' = Citora Solo y 'ultra' = Citora Equipo
// ('plus' es de pagos antiguos y cuenta como Solo). La prueba gratis es con Equipo.
export type PaidPlan = 'basico' | 'ultra'
export const PLANS: Record<PaidPlan, { name: string; short: string; desc: string }> = {
  basico: { name: t('Citora Solo'), short: t('Solo'), desc: t('Para quien atiende solo: todo incluido, menos el equipo.') },
  ultra: { name: t('Citora Equipo'), short: t('Equipo'), desc: t('Para salones con varias personas: todo, más tu equipo con sus servicios y su agenda.') },
}
export const PLAN_LABEL = t('Plan Citora')
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
