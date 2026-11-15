import { describe, expect, it } from 'vitest'
import { canReload } from './reload'
import { groupServices, keepStaff, staffDoes } from './staff'

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

  it('con servicios propios y ninguno creado todavía, no hace nada', () => {
    const nueva = { id: 'cami', service_ids: [], all_services: false }
    expect(staffDoes(nueva, ['corte'])).toBe(false)
    expect(staffDoes({ ...nueva, service_ids: ['cejas'] }, ['cejas'])).toBe(true)
    expect(staffDoes({ service_ids: [], all_services: true }, ['corte'])).toBe(true)
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

describe('servicios agrupados por especialidad', () => {
  const svc = (id: string) => ({ id })
  const leo = { id: 'leo', name: 'Leo', photo_url: null, specialty: 'Peluquería', service_ids: ['corte'], all_services: false }
  const yane = { id: 'yane', name: 'Yaneisy Pérez', photo_url: null, specialty: null, service_ids: ['mani', 'pedi'], all_services: false }
  const todo = { id: 'bea', name: 'Bea', photo_url: null, service_ids: [] as string[] }

  it('cada profesional con los suyos y lo de todos en "Del salón"', () => {
    const g = groupServices([svc('corte'), svc('mani'), svc('pedi'), svc('masaje')], [leo, yane, todo])
    expect(g.map((x) => [x.key, x.title, x.services.map((s) => s.id)])).toEqual([
      ['salon', 'Del salón', ['masaje']],
      ['leo', 'Peluquería', ['corte']],
      ['yane', 'Yaneisy Pérez', ['mani', 'pedi']],
    ])
  })

  it('un servicio que hacen dos va a "Del salón"', () => {
    const ana = { ...yane, id: 'ana', name: 'Ana', service_ids: ['mani'] }
    const g = groupServices([svc('mani'), svc('pedi')], [yane, ana])
    expect(g.find((x) => x.key === 'salon')?.services.map((s) => s.id)).toEqual(['mani'])
  })

  it('sin equipo o con un solo grupo, todo junto y sin título', () => {
    expect(groupServices([svc('a'), svc('b')], [])).toEqual([{ key: 'todos', title: null, staff: null, services: [svc('a'), svc('b')] }])
    expect(groupServices([svc('corte')], [leo])[0].title).toBeNull()
  })
})
