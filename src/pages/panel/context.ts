import { createContext, useContext } from 'react'
import type { Business, MyStatus, Service } from '../../lib/types'

export interface PanelCtx {
  business: Business
  /** Todos los negocios de la cuenta (para cambiar de uno a otro) */
  businesses: Business[]
  status: MyStatus
  services: Service[]
  switchBusiness: (id: string) => Promise<void>
  reloadBusiness: () => Promise<void>
  reloadServices: () => Promise<void>
}

export const PanelContext = createContext<PanelCtx | null>(null)

export function usePanel(): PanelCtx {
  const ctx = useContext(PanelContext)
  if (!ctx) throw new Error('usePanel fuera del panel')
  return ctx
}
