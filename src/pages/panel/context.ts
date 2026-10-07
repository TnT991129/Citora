import { createContext, useContext } from 'react'
import type { Business, MyStatus, Service } from '../../lib/types'

export interface PanelCtx {
  business: Business
  status: MyStatus
  services: Service[]
  reloadBusiness: () => Promise<void>
  reloadServices: () => Promise<void>
  /** Inicio del panel de este negocio, ej. "/barberia-leo/panel-admin" */
  base: string
  /** Ruta de una sección del panel, ej. link('agenda') */
  link: (sub?: string) => string
  /** El dueño cambió su enlace: se actualiza la dirección del panel */
  slugChanged: (slug: string) => void
}

export const PanelContext = createContext<PanelCtx | null>(null)

export function usePanel(): PanelCtx {
  const ctx = useContext(PanelContext)
  if (!ctx) throw new Error('usePanel fuera del panel')
  return ctx
}
