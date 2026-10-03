import { createContext, useContext } from 'react'
import type { Business, MyStatus, Service } from '../../lib/types'

export interface PanelCtx {
  business: Business
  status: MyStatus
  services: Service[]
  reloadBusiness: () => Promise<void>
  reloadServices: () => Promise<void>
}

export const PanelContext = createContext<PanelCtx | null>(null)

export function usePanel(): PanelCtx {
  const ctx = useContext(PanelContext)
  if (!ctx) throw new Error('usePanel fuera del panel')
  return ctx
}
