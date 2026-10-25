import { currencyFields, generateSlots, type CurrencyMode } from './format'
import { load, remove, save } from './storage'
import { supabase } from './supabase'
import { businessType, type ServiceTemplate } from './templates'

// Borrador del asistente "Crear mi app". Se guarda en el móvil para no perder nada.
export interface Draft {
  type: string
  name: string
  slug: string
  whatsapp: string
  address: string
  color: string
  currency?: CurrencyMode // los borradores antiguos no la tienen: CUP
  usd_rate?: number | null // CUP por 1 USD, con 'USD y CUP'
  services: ServiceTemplate[]
  days: number[]
  mode: 'turnos' | 'intervalo'
  turnos: string[]
  open: string
  close: string
  every: number
  capacity?: number // clientes por turno (los borradores antiguos no lo tienen: 1)
}

const KEY = 'citora:borrador'

export function newDraft(typeKey = 'otro', currency: CurrencyMode = 'CUP'): Draft {
  const t = businessType(typeKey)
  const fixed = typeKey === 'unas' || typeKey === 'tatuajes' || typeKey === 'maquillaje'
  return {
    type: t.key,
    name: '',
    slug: '',
    whatsapp: '',
    address: '',
    color: '#f0532e',
    currency,
    services: changeCurrency(t.services.map((s) => ({ ...s })), t.key, 'CUP', currency),
    days: [1, 2, 3, 4, 5, 6],
    mode: fixed ? 'turnos' : 'intervalo',
    turnos: fixed ? ['10:00', '13:00', '16:00'] : ['10:00', '13:00'],
    open: '09:00',
    close: '18:00',
    every: typeKey === 'barberia' ? 30 : 60,
  }
}

/** Los precios sugeridos están en CUP: en USD (o USD y CUP) se dejan a 0 para que el dueño ponga los suyos */
export function changeCurrency(services: ServiceTemplate[], typeKey: string, from: CurrencyMode, to: CurrencyMode): ServiceTemplate[] {
  if ((from === 'CUP') === (to === 'CUP')) return services
  const suggested = businessType(typeKey).services
  return services.map((s) => ({
    ...s,
    price: to === 'CUP' ? suggested.find((x) => x.name === s.name)?.price ?? 0 : 0,
  }))
}

export function loadDraft(): Draft | null {
  return load<Draft | null>(KEY, null)
}

export function saveDraft(d: Draft): void {
  save(KEY, d)
}

export function clearDraft(): void {
  remove(KEY)
}

export function draftSlots(d: Draft): string[] {
  const list = d.mode === 'turnos' ? d.turnos : generateSlots(d.open, d.close, d.every)
  return Array.from(new Set(list)).sort()
}

/** Crea el negocio en la base de datos a partir del borrador (requiere sesión) */
export async function createBusinessFromDraft(d: Draft): Promise<{ id: string; slug: string; code: string }> {
  const slots = draftSlots(d)
  const schedule = [0, 1, 2, 3, 4, 5, 6].map((w) => ({
    weekday: w,
    is_open: d.days.includes(w),
    slots,
  }))
  const money = currencyFields(d.currency || 'CUP')
  const { data, error } = await supabase.rpc('create_business', {
    p_name: d.name.trim(),
    p_slug: d.slug,
    p_type: d.type,
    p_whatsapp: d.whatsapp,
    p_address: d.address,
    p_color: d.color,
    p_services: d.services.filter((s) => s.name.trim()),
    p_schedule: schedule,
    p_currency: money.currency,
    p_usd_prices: money.usd_prices,
    p_usd_rate: money.usd_prices ? d.usd_rate ?? null : null,
  })
  if (error) throw error
  const created = data as { id: string; slug: string; code: string }
  // Clientes por turno: se guarda aparte (el dueño ya puede editar su negocio)
  const capacity = Math.min(50, Math.max(1, Math.round(d.capacity || 1)))
  if (capacity > 1) {
    const { error: e2 } = await supabase.from('businesses').update({ slot_capacity: capacity }).eq('id', created.id)
    if (e2) console.warn('No se pudo guardar los clientes por turno', e2)
  }
  clearDraft()
  return created
}
