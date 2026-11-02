import { describe, expect, it } from 'vitest'
import { applyOptions, missingOption, optionsFor } from './serviceOptions'

const corte = {
  id: 'c',
  name: 'Corte',
  price: 500,
  options: [
    { id: 'o1', name: 'Niño', price: 500 },
    { id: 'o2', name: 'Adulto', price: 800 },
  ],
}
const barba = { id: 'b', name: 'Barba', price: 300 }

describe('opciones de precio', () => {
  it('usa el nombre y el precio de la opción elegida', () => {
    expect(applyOptions([corte, barba], { c: 'o2' }).map((s) => [s.name, s.price])).toEqual([
      ['Corte · Adulto', 800],
      ['Barba', 300],
    ])
    expect(applyOptions([corte], { c: 'no-existe' })[0].name).toBe('Corte')
  })

  it('avisa del servicio elegido al que le falta la opción', () => {
    expect(missingOption([corte, barba], ['c', 'b'], {})?.id).toBe('c')
    expect(missingOption([corte, barba], ['c', 'b'], { c: 'o1' })).toBeUndefined()
    expect(missingOption([corte, barba], ['b'], {})).toBeUndefined()
  })

  it('solo manda las opciones de lo elegido', () => {
    expect(optionsFor(['b'], { c: 'o1' })).toBeUndefined()
    expect(optionsFor(['c'], { c: 'o1' })).toEqual({ c: 'o1' })
  })
})
