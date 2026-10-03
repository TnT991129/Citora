import { generateSlots } from './format'
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
  services: ServiceTemplate[]
  days: number[]
  mode: 'turnos' | 'intervalo'
  turnos: string[]
  open: string
  close: string
  every: number
}

const KEY = 'citora:borrador'

export function newDraft(typeKey = 'otro'): Draft {
  const t = businessType(typeKey)
  const fixed = typeKey === 'unas' || typeKey === 'tatuajes' || typeKey === 'maquillaje'
  return {
    type: t.key,
    name: '',
    slug: '',
    whatsapp: '',
    address: '',
    color: '#5243e5',
    services: t.services.map((s) => ({ ...s })),
    days: [1, 2, 3, 4, 5, 6],
    mode: fixed ? 'turnos' : 'intervalo',
    turnos: fixed ? ['10:00', '13:00', '16:00'] : ['10:00', '13:00'],
    open: '09:00',
    close: '18:00',
    every: typeKey === 'barberia' ? 30 : 60,
  }
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
  const { data, error } = await supabase.rpc('create_business', {
    p_name: d.name.trim(),
    p_slug: d.slug,
    p_type: d.type,
    p_whatsapp: d.whatsapp,
    p_address: d.address,
    p_color: d.color,
    p_services: d.services.filter((s) => s.name.trim()),
    p_schedule: schedule,
  })
  if (error) throw error
  clearDraft()
  return data as { id: string; slug: string; code: string }
}
