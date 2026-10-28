import { describe, expect, it } from 'vitest'
import {
  addDays, currencyFields, currencyMode, cupRate, duration, generateSlots, longDate, money, price,
  slugify, time12, weekdayOf, zonedToIso,
} from './format'

describe('dinero', () => {
  it('agrupa miles con punto y decimales con coma', () => {
    expect(money(1500)).toBe('1.500 CUP')
    expect(money(1500.5)).toBe('1.500,50 CUP')
    expect(money('250', 'USD')).toBe('250 USD')
    expect(money(-200)).toBe('-200 CUP')
    expect(money(null)).toBe('0 CUP')
  })

  it('muestra el cambio en CUP solo si hay tasa', () => {
    expect(price(5, 'USD', 300)).toBe('5 USD · 1.500 CUP')
    expect(price(5, 'USD', null)).toBe('5 USD')
    expect(price(5, 'USD', 0)).toBe('5 USD')
  })

  it('traduce la moneda del negocio a sus columnas y al revés', () => {
    expect(currencyMode({ currency: 'CUP' })).toBe('CUP')
    expect(currencyMode({ currency: 'USD' })).toBe('USD')
    expect(currencyMode({ currency: 'USD', usd_prices: true })).toBe('AMBAS')
    expect(currencyFields('AMBAS')).toEqual({ currency: 'USD', usd_prices: true })
    expect(currencyFields('CUP')).toEqual({ currency: 'CUP', usd_prices: false })
    expect(cupRate({ usd_prices: true, usd_rate: '320' })).toBe(320)
    expect(cupRate({ usd_prices: false, usd_rate: 320 })).toBeNull()
  })
})

describe('fechas y horas', () => {
  it('duración legible', () => {
    expect(duration(45)).toBe('45 min')
    expect(duration(60)).toBe('1 h')
    expect(duration(90)).toBe('1 h 30 min')
  })

  it('hora en formato 12 h', () => {
    expect(time12('00:00')).toBe('12:00 a.m.')
    expect(time12('09:30')).toBe('9:30 a.m.')
    expect(time12('12:00')).toBe('12:00 p.m.')
    expect(time12('13:05')).toBe('1:05 p.m.')
  })

  it('suma días cruzando mes y año', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('día de la semana y fecha larga', () => {
    expect(weekdayOf('2026-10-28')).toBe(3)
    expect(longDate('2026-10-05')).toBe('lunes 5 de octubre')
  })

  it('convierte la hora del negocio a UTC con y sin horario de verano (Cuba)', () => {
    expect(zonedToIso('2026-01-15', '10:00', 'America/Havana')).toBe('2026-01-15T15:00:00.000Z')
    expect(zonedToIso('2026-07-15', '10:00', 'America/Havana')).toBe('2026-07-15T14:00:00.000Z')
  })

  it('genera los turnos sin pasarse del cierre', () => {
    expect(generateSlots('09:00', '11:00', 30)).toEqual(['09:00', '09:30', '10:00', '10:30'])
    expect(generateSlots('09:00', '09:00', 30)).toEqual([])
  })
})

describe('enlaces', () => {
  it('slug sin tildes ni símbolos', () => {
    expect(slugify('Barbería Leo!!')).toBe('barberia-leo')
    expect(slugify('  Uñas & Más  ')).toBe('unas-mas')
  })
})
