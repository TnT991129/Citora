import { describe, expect, it } from 'vitest'
import { applyOptions, missingOption, optionsFor, toggleOption } from './serviceOptions'

const opts = [
  { id: 'o1', name: 'Francesa', price: 500 },
  { id: 'o2', name: 'Piedras', price: 300 },
]
const unas = { id: 'u', name: 'Uñas', price: 300, options: opts, multi_options: true }
const corte = { id: 'c', name: 'Corte', price: 300, options: opts, multi_options: false }
const barba = { id: 'b', name: 'Barba', price: 300 }

describe('opciones de precio', () => {
  it('usa el nombre y el precio de la opción elegida', () => {
    expect(applyOptions([corte, barba], { c: ['o2'] }).map((s) => [s.name, s.price])).toEqual([
      ['Corte · Piedras', 300],
      ['Barba', 300],
    ])
    expect(applyOptions([corte], { c: ['no-existe'] })[0].name).toBe('Corte')
  })

  it('con varias opciones las suma, en el orden del dueño', () => {
    expect(applyOptions([unas], { u: ['o2', 'o1'] }).map((s) => [s.name, s.price])).toEqual([['Uñas · Francesa + Piedras', 800]])
  })

  it('marca varias solo si el servicio lo permite', () => {
    expect(toggleOption(unas, { u: ['o1'] }, 'o2')).toEqual({ u: ['o1', 'o2'] })
    expect(toggleOption(corte, { c: ['o1'] }, 'o2')).toEqual({ c: ['o2'] })
    expect(toggleOption(unas, { u: ['o1', 'o2'] }, 'o1')).toEqual({ u: ['o2'] })
  })

  it('avisa del servicio elegido al que le falta la opción', () => {
    expect(missingOption([corte, barba], ['c', 'b'], {})?.id).toBe('c')
    expect(missingOption([corte, barba], ['c', 'b'], { c: [] })?.id).toBe('c')
    expect(missingOption([corte, barba], ['c', 'b'], { c: ['o1'] })).toBeUndefined()
    expect(missingOption([corte, barba], ['b'], {})).toBeUndefined()
  })

  it('solo manda las opciones de lo elegido', () => {
    expect(optionsFor(['b'], { c: ['o1'] })).toBeUndefined()
    expect(optionsFor(['c'], { c: [] })).toBeUndefined()
    expect(optionsFor(['c'], { c: ['o1'] })).toEqual({ c: ['o1'] })
  })
})
