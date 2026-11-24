import { describe, expect, it } from 'vitest'
import { currencyFields, currencyMode } from './format'
import { isCubanPhone } from './market'

describe('versión de Citora (Cuba o internacional)', () => {
  it('reconoce los WhatsApp de Cuba, con o sin el 53', () => {
    expect(isCubanPhone('+53 5 555 1234')).toBe(true)
    expect(isCubanPhone('5555 1234')).toBe(true)
    expect(isCubanPhone('7204 1234')).toBe(true)
  })
  it('no da por cubanos los de fuera ni los incompletos', () => {
    expect(isCubanPhone('+34 600 000 000')).toBe(false)
    expect(isCubanPhone('+1 305 555 1234')).toBe(false)
    expect(isCubanPhone('5355')).toBe(false)
    expect(isCubanPhone('')).toBe(false)
  })
})

describe('monedas', () => {
  it('fuera de Cuba guarda la moneda del país', () => {
    expect(currencyFields('EUR')).toEqual({ currency: 'EUR', usd_prices: false })
    expect(currencyMode({ currency: 'EUR' })).toBe('EUR')
  })
  it('en Cuba sigue igual: CUP, USD y "USD y CUP"', () => {
    expect(currencyFields('CUP')).toEqual({ currency: 'CUP', usd_prices: false })
    expect(currencyFields('AMBAS')).toEqual({ currency: 'USD', usd_prices: true })
    expect(currencyMode({ currency: 'USD', usd_prices: true })).toBe('AMBAS')
    expect(currencyMode({ currency: 'XYZ' })).toBe('CUP')
  })
})
