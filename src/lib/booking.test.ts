import { describe, expect, it } from 'vitest'
import { canReload } from './reload'
import { keepStaff, staffDoes } from './staff'

const barbero = { id: 'leo', service_ids: ['corte', 'barba'] }
const manicura = { id: 'ana', service_ids: ['unas'] }
const todoterreno = { id: 'bea', service_ids: [] }
const team = [barbero, manicura, todoterreno]

describe('profesional elegido al cambiar los servicios', () => {
  it('sabe qué servicios hace cada profesional', () => {
    expect(staffDoes(barbero, ['corte'])).toBe(true)
    expect(staffDoes(barbero, ['corte', 'unas'])).toBe(false)
    expect(staffDoes(todoterreno, ['corte', 'unas']), 'sin servicios configurados hace todos').toBe(true)
    expect(staffDoes(barbero, []), 'sin servicios elegidos todavía').toBe(true)
  })

  it('se queda con el mismo si hace los servicios', () => {
    expect(keepStaff(team, 'leo', ['corte', 'barba'])).toBe('leo')
    expect(keepStaff(team, 'bea', ['unas'])).toBe('bea')
  })

  it('pasa a "Cualquiera disponible" si no los hace (antes no salía ninguna hora)', () => {
    expect(keepStaff(team, 'ana', ['corte'])).toBeNull()
    expect(keepStaff(team, 'leo', ['corte', 'unas'])).toBeNull()
  })

  it('pasa a "Cualquiera disponible" si ya no está en el equipo', () => {
    expect(keepStaff(team, 'se-fue', ['corte'])).toBeNull()
    expect(keepStaff([], 'leo', ['corte'])).toBeNull()
  })

  it('"Cualquiera disponible" sigue siéndolo', () => {
    expect(keepStaff(team, null, ['corte'])).toBeNull()
  })
})

describe('recarga tras publicar una versión nueva', () => {
  it('recarga la primera vez', () => {
    expect(canReload(null, 1_000_000)).toBe(true)
  })

  it('no vuelve a recargar enseguida (evita un bucle sin conexión)', () => {
    expect(canReload(1_000_000, 1_000_000 + 5_000)).toBe(false)
    expect(canReload(1_000_000, 1_000_000 + 30_000)).toBe(false)
  })

  it('vuelve a poder recargar pasado medio minuto', () => {
    expect(canReload(1_000_000, 1_000_000 + 31_000)).toBe(true)
  })
})
