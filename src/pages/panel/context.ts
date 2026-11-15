import { createContext, useContext } from 'react'
import type { Onboarding, Progress, StepId } from '../../lib/onboarding'
import type { Business, MyStatus, Service, Staff } from '../../lib/types'
import type { TourStep } from './tutorial'

export interface PanelCtx {
  business: Business
  status: MyStatus
  services: Service[]
  /** Profesionales del negocio (vacío si no usa varios profesionales) */
  staff: Staff[]
  reloadStaff: () => Promise<void>
  reloadBusiness: () => Promise<void>
  reloadServices: () => Promise<void>
  /** Inicio del panel de este negocio, ej. "/barberia-leo/panel-admin" */
  base: string
  /** Ruta de una sección del panel, ej. link('agenda') */
  link: (sub?: string) => string
  /** El dueño cambió su enlace: se actualiza la dirección del panel */
  slugChanged: (slug: string) => void
  /** Abre el tutorial paso a paso */
  showTour: () => void
  /** Vuelve a mostrar las novedades de la versión actual */
  showNews: () => void
  /** Primeros pasos y herramientas activas (ver lib/onboarding.ts) */
  onboarding: Onboarding
  updateOnboarding: (patch: Onboarding) => void
  /** Apunta que hizo un primer paso (una sola vez) */
  markStep: (id: StepId) => void
  /** Cifras del servidor para Primeros pasos, Mi negocio y Mensualidad (null si no cargaron) */
  progress: Progress | null
  refreshProgress: () => Promise<void>
  /** Tutorial en marcha: Hoy enseña citas de ejemplo y nada se guarda */
  tutorial: { active: boolean; step: TourStep | null }
}

export const PanelContext = createContext<PanelCtx | null>(null)

export function usePanel(): PanelCtx {
  const ctx = useContext(PanelContext)
  if (!ctx) throw new Error('usePanel fuera del panel')
  return ctx
}
