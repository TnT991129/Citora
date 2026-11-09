import { fromMin, time12, timeOf, toMin } from './format'
import type { Appointment } from './types'

/** Una cita colocada en la línea de tiempo del día (minutos desde las 0:00, en la zona del negocio) */
export interface DayBlock {
  a: Appointment
  start: number
  end: number
  /** Columna dentro de su grupo de citas que se pisan (0, 1, 2…) y cuántas columnas tiene ese grupo */
  lane: number
  lanes: number
}

/** Hueco libre de la línea de tiempo: turnos seguidos sin ninguna cita encima */
export interface FreeRange {
  start: number
  end: number
  times: string[]
}

export interface Slot {
  slot: string
  available: boolean
}

/** Minutos desde las 0:00 de un instante, en la zona del negocio */
export function minuteOf(iso: string | Date, tz: string): number {
  return toMin(timeOf(iso, tz))
}

/**
 * Coloca las citas del día (menos las canceladas; las de "no vino" salen apagadas). Las que se pisan (varios clientes a la vez o varios
 * profesionales) van una al lado de otra, cada una en su columna.
 */
export function layoutDay(list: Appointment[], tz: string): DayBlock[] {
  const items = list
    .filter((a) => a.status !== 'cancelada')
    .map((a) => {
      const start = minuteOf(a.starts_at, tz)
      let end = minuteOf(a.ends_at, tz)
      if (end <= start) end = Math.min(start + Math.max(15, (new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60000), 24 * 60)
      return { a, start, end, lane: 0, lanes: 1 }
    })
    .sort((x, y) => x.start - y.start || y.end - x.end)

  let group: DayBlock[] = []
  let groupEnd = -1
  const close = () => {
    const n = Math.max(1, ...group.map((b) => b.lane + 1))
    group.forEach((b) => (b.lanes = n))
    group = []
  }
  for (const b of items) {
    if (b.start >= groupEnd && group.length) close()
    // Primera columna libre del grupo
    const used = group.filter((g) => g.end > b.start).map((g) => g.lane)
    let lane = 0
    while (used.includes(lane)) lane++
    b.lane = lane
    group.push(b)
    groupEnd = Math.max(groupEnd, b.end)
  }
  if (group.length) close()
  return items
}

/** Cada cuántos minutos hay turno (lo más corto entre dos turnos seguidos); 30 si no se sabe */
export function slotStep(slots: Slot[]): number {
  const mins = slots.map((s) => toMin(s.slot)).sort((a, b) => a - b)
  let step = Infinity
  for (let i = 1; i < mins.length; i++) if (mins[i] > mins[i - 1]) step = Math.min(step, mins[i] - mins[i - 1])
  return Number.isFinite(step) ? Math.min(step, 120) : 30
}

/**
 * Huecos para pintar en la línea de tiempo: turnos libres seguidos que no tienen ninguna cita
 * encima. (Si caben varios clientes a la vez, un turno puede estar libre aunque ya haya una cita:
 * ese no se pinta como hueco, pero sí sale en "Publicar mis huecos").
 */
export function freeRanges(slots: Slot[], blocks: DayBlock[]): FreeRange[] {
  const step = slotStep(slots)
  const out: FreeRange[] = []
  const free = slots
    .filter((s) => s.available)
    .map((s) => ({ t: s.slot, m: toMin(s.slot) }))
    .sort((a, b) => a.m - b.m)
  for (const s of free) {
    const end = s.m + step
    if (blocks.some((b) => b.start < end && b.end > s.m)) continue
    const last = out[out.length - 1]
    if (last && last.end === s.m) {
      last.end = end
      last.times.push(s.t)
    } else {
      out.push({ start: s.m, end, times: [s.t] })
    }
  }
  return out
}

/** Desde qué hora hasta qué hora se dibuja el día (en horas enteras) */
export function dayBounds(slots: Slot[], blocks: DayBlock[]): { start: number; end: number } | null {
  const step = slotStep(slots)
  const starts = [...slots.map((s) => toMin(s.slot)), ...blocks.map((b) => b.start)]
  const ends = [...slots.map((s) => toMin(s.slot) + step), ...blocks.map((b) => b.end)]
  if (!starts.length) return null
  const start = Math.floor(Math.min(...starts) / 60) * 60
  const end = Math.min(24 * 60, Math.max(start + 60, Math.ceil(Math.max(...ends) / 60) * 60))
  return { start, end }
}

/** "9 a.m.", "12 p.m." para las rayas de cada hora */
export function hourLabel(min: number): string {
  return time12(fromMin(min)).replace(':00', '')
}

/** Mensaje para el estado de WhatsApp o Instagram con los huecos libres */
export function freeSlotsMessage(when: 'hoy' | 'mañana', businessName: string, times: string[], url: string): string {
  const max = 10
  const list = times.slice(0, max).map(time12).join(' · ') + (times.length > max ? ' y más' : '')
  const day = when === 'hoy' ? 'Hoy' : 'Mañana'
  return `✨ ¡${day} me quedan huecos libres en ${businessName}!\n🕒 ${list}\n\nReserva el tuyo aquí 👉 ${url}`
}
