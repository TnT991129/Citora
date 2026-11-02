import { describe, expect, it } from 'vitest'
import { TIMEZONES, tzLabel, tzNow } from './timezones'

describe('zonas horarias', () => {
  it('da la hora y la diferencia con UTC, con horario de verano', () => {
    const invierno = new Date('2026-01-15T15:00:00Z')
    const verano = new Date('2026-07-15T15:00:00Z')
    expect(tzNow('America/Havana', invierno)).toEqual({ time: '10:00', offset: 'UTC−5' })
    expect(tzNow('America/Havana', verano)).toEqual({ time: '11:00', offset: 'UTC−4' })
    expect(tzNow('Europe/Madrid', invierno)).toEqual({ time: '16:00', offset: 'UTC+1' })
    expect(tzNow('Europe/Madrid', verano)).toEqual({ time: '17:00', offset: 'UTC+2' })
    expect(tzNow('Europe/London', invierno).offset).toBe('UTC+0')
  })

  it('no se confunde con los segundos del momento', () => {
    expect(tzNow('America/Bogota', new Date('2026-01-15T15:00:59.900Z'))).toEqual({ time: '10:00', offset: 'UTC−5' })
  })

  it('pone nombre a las zonas', () => {
    expect(tzLabel('America/Havana')).toBe('Cuba')
    expect(tzLabel('Asia/Ho_Chi_Minh'), 'una que no está en la lista').toBe('Asia/Ho Chi Minh')
  })

  it('todas las zonas de la lista existen y no se repiten', () => {
    expect(new Set(TIMEZONES.map((z) => z.tz)).size).toBe(TIMEZONES.length)
    for (const z of TIMEZONES) expect(() => tzNow(z.tz), z.tz).not.toThrow()
  })
})
