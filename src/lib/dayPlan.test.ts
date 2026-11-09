import { describe, expect, it } from 'vitest'
import { dayBounds, freeRanges, freeSlotsMessage, hourLabel, layoutDay, slotStep } from './dayPlan'
import type { Appointment, AppointmentStatus } from './types'

const TZ = 'UTC'
let n = 0
function cita(from: string, to: string, status: AppointmentStatus = 'confirmada'): Appointment {
  return {
    id: `c${++n}`, business_id: 'b', token: 't', starts_at: `2026-11-10T${from}:00Z`, ends_at: `2026-11-10T${to}:00Z`,
    customer_name: 'Ana', customer_phone: '', customer_note: null, total: 0, usd_rate: null, status, source: 'web',
    cancelled_by: null, reschedule_count: 0, internal_note: null, created_at: '', discount_code: null, discount: 0,
    reminded_at: null, staff_id: null,
  }
}
const turnos = (list: string[], libres: string[]) => list.map((slot) => ({ slot, available: libres.includes(slot) }))

describe('línea de tiempo del día', () => {
  it('coloca las citas en minutos y deja fuera las canceladas (las de "no vino" se ven)', () => {
    const b = layoutDay([cita('09:00', '09:45'), cita('10:00', '11:00', 'cancelada'), cita('11:00', '11:30', 'no_asistio')], TZ)
    expect(b.map((x) => x.a.status)).toEqual(['confirmada', 'no_asistio'])
    expect([b[0].start, b[0].end, b[0].lane, b[0].lanes]).toEqual([540, 585, 0, 1])
  })

  it('pone una al lado de otra las citas que se pisan', () => {
    const b = layoutDay([cita('09:00', '10:00'), cita('09:30', '10:30'), cita('10:00', '11:00'), cita('12:00', '13:00')], TZ)
    expect(b.map((x) => [x.lane, x.lanes])).toEqual([[0, 2], [1, 2], [0, 2], [0, 1]])
  })

  it('una cita que termina a medianoche no se queda en cero minutos', () => {
    const [b] = layoutDay([{ ...cita('23:00', '23:30'), ends_at: '2026-11-11T00:00:00Z' }], TZ)
    expect(b.end).toBe(24 * 60)
  })

  it('sabe cada cuánto hay turno', () => {
    expect(slotStep(turnos(['09:00', '09:30', '10:00'], []))).toBe(30)
    expect(slotStep(turnos(['09:00', '10:00', '10:20'], []))).toBe(20)
    expect(slotStep([])).toBe(30)
  })

  it('junta los turnos libres seguidos y no pinta hueco donde ya hay una cita', () => {
    const slots = turnos(['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'], ['09:00', '09:30', '10:30', '11:00', '11:30'])
    const blocks = layoutDay([cita('11:00', '11:30')], TZ)
    expect(freeRanges(slots, blocks)).toEqual([
      { start: 540, end: 600, times: ['09:00', '09:30'] },
      { start: 630, end: 660, times: ['10:30'] },
      { start: 690, end: 720, times: ['11:30'] },
    ])
  })

  it('dibuja desde la primera hora hasta la última, en horas enteras', () => {
    const slots = turnos(['09:30', '10:00', '17:30'], [])
    expect(dayBounds(slots, [])).toEqual({ start: 540, end: 1080 })
    expect(dayBounds(slots, layoutDay([cita('18:00', '19:15')], TZ))).toEqual({ start: 540, end: 1200 })
    expect(dayBounds([], [])).toBeNull()
  })

  it('escribe la hora de cada raya', () => {
    expect(hourLabel(540)).toBe('9 a.m.')
    expect(hourLabel(720)).toBe('12 p.m.')
    expect(hourLabel(15 * 60)).toBe('3 p.m.')
  })
})

describe('mensaje de huecos libres', () => {
  it('lista las horas y el enlace', () => {
    expect(freeSlotsMessage('hoy', 'Barbería Leo', ['15:00', '16:30'], 'https://x.com/leo'))
      .toBe('✨ ¡Hoy me quedan huecos libres en Barbería Leo!\n🕒 3:00 p.m. · 4:30 p.m.\n\nReserva el tuyo aquí 👉 https://x.com/leo')
  })

  it('no pone más de 10 horas', () => {
    const times = Array.from({ length: 14 }, (_, i) => `${String(9 + i).padStart(2, '0')}:00`)
    const msg = freeSlotsMessage('mañana', 'Leo', times, 'u')
    expect(msg.startsWith('✨ ¡Mañana')).toBe(true)
    expect(msg).toContain('6:00 p.m. y más')
    expect(msg).not.toContain('7:00 p.m.')
  })
})
