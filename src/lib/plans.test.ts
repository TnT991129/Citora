import { describe, expect, it } from 'vitest'
import { monthsDiscount, monthsTotal } from './plans'

const d = { discount_3m: 10, discount_6m: 15 }

describe('descuento por pagar varios meses', () => {
  it('1 o 2 meses, sin descuento', () => {
    expect(monthsTotal(1500, 1, d)).toBe(1500)
    expect(monthsTotal(12.5, 2, d)).toBe(25)
  })
  it('desde 3 meses, el de 3; desde 6, el de 6 (igual que _months_total)', () => {
    expect(monthsDiscount(3, d)).toBe(10)
    expect(monthsTotal(1500, 3, d)).toBe(4050)
    expect(monthsTotal(12, 3, d)).toBe(32.4)
    expect(monthsTotal(12.5, 3, d)).toBe(33.75)
    expect(monthsTotal(25, 6, d)).toBe(127.5)
    expect(monthsTotal(23.5, 6, d)).toBe(119.85)
  })
  it('sin descuentos en los ajustes, el precio de siempre', () => {
    expect(monthsTotal(1500, 6, {})).toBe(9000)
  })
})
