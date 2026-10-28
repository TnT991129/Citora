import { describe, expect, it } from 'vitest'
import { buildAppointmentIcs } from './ics'
import { waLink } from './whatsapp'

describe('WhatsApp', () => {
  it('deja solo los dígitos del teléfono y codifica el mensaje', () => {
    expect(waLink('+53 5 555-1234', 'Hola, ¿qué tal?')).toBe('https://wa.me/5355551234?text=Hola%2C%20%C2%BFqu%C3%A9%20tal%3F')
  })
})

describe('calendario (.ics)', () => {
  it('pone las horas en UTC y escapa los caracteres especiales', () => {
    const ics = buildAppointmentIcs({
      token: 'abc', startsAt: '2026-01-15T15:00:00.000Z', endsAt: '2026-01-15T15:30:00.000Z',
      title: 'Corte, barba; ok', location: null,
    })
    expect(ics).toContain('DTSTART:20260115T150000Z')
    expect(ics).toContain('DTEND:20260115T153000Z')
    expect(ics).toContain('SUMMARY:Corte\\, barba\\; ok')
    expect(ics).not.toContain('LOCATION')
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR')
  })
})
