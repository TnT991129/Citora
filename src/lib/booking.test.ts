import { describe, expect, it } from 'vitest'
import { hasModule, includedIn, planName } from './plans'
import { canReload } from './reload'
import { groupServices, keepStaff, ownerInfo, requiredIds, staffDoes, whoAttends } from './staff'

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

  it('cada profesional con los suyos y los que no son de nadie, del dueño', () => {
    const g = groupServices([svc('corte'), svc('mani'), svc('pedi'), svc('masaje')], [leo, yane, todo], { name: 'Osmel', specialty: 'Masajes' })
    expect(g.map((x) => [x.key, x.title, x.services.map((s) => s.id)])).toEqual([
      ['dueno', 'Masajes', ['masaje']],
      ['leo', 'Peluquería', ['corte']],
      ['yane', 'Yaneisy Pérez', ['mani', 'pedi']],
    ])
    expect(g[0].staff?.name).toBe('Osmel')
  })

  it('el dueño sin especialidad: el tipo de negocio; si no, su nombre; si no, "Servicios"', () => {
    expect(groupServices([svc('masaje'), svc('corte')], [leo], { name: 'Osmel', typeName: 'Barbería' })[0].title).toBe('Barbería')
    expect(groupServices([svc('masaje'), svc('corte')], [leo], { name: 'Osmel' })[0].title).toBe('Osmel')
    const g = groupServices([svc('masaje'), svc('corte')], [leo])
    expect([g[0].title, g[0].staff]).toEqual(['Servicios', null])
  })

  it('un servicio que hacen dos va a "Con varias personas del equipo"', () => {
    const ana = { ...yane, id: 'ana', name: 'Ana', service_ids: ['mani'] }
    const g = groupServices([svc('mani'), svc('pedi')], [yane, ana])
    expect(g.find((x) => x.key === 'varios')?.services.map((s) => s.id)).toEqual(['mani'])
  })

  it('sin equipo o con un solo grupo, todo junto y sin título', () => {
    expect(groupServices([svc('a'), svc('b')], [])).toEqual([{ key: 'todos', title: null, staff: null, services: [svc('a'), svc('b')] }])
    expect(groupServices([svc('corte')], [leo])[0].title).toBeNull()
  })
})

describe('quién atiende una cita', () => {
  const services = [{ id: 'corte' }, { id: 'mani' }, { id: 'masaje' }, { id: 'diseno', is_extra: true }]
  const leo = { id: 'leo', service_ids: ['corte'], all_services: false }
  const yane = { id: 'yane', service_ids: ['mani'], all_services: false }

  it('alguien del equipo, el dueño o nadie', () => {
    expect(whoAttends(['corte'], services, [leo, yane])).toBe('equipo')
    expect(whoAttends(['masaje'], services, [leo, yane])).toBe('dueno')
    expect(whoAttends(['corte', 'mani'], services, [leo, yane])).toBeNull()
    expect(whoAttends(['masaje', 'mani'], services, [leo, yane])).toBeNull()
    expect(whoAttends(['corte', 'mani'], services, [])).toBe('dueno')
  })

  it('un extra del dueño se puede sumar al servicio de una profesional', () => {
    expect(requiredIds(['mani', 'diseno'], services, [leo, yane])).toEqual(['mani'])
    expect(whoAttends(['mani', 'diseno'], services, [leo, yane])).toBe('equipo')
  })

  it('si alguien del equipo hace todo, el dueño no atiende', () => {
    const todo = { id: 'bea', service_ids: [] as string[] }
    expect(whoAttends(['masaje'], services, [leo, todo])).toBe('equipo')
  })
})

describe('planes Solo y Equipo', () => {
  it('el equipo solo en Equipo, lo demás en los dos', () => {
    expect(hasModule('ultra', 'empleados')).toBe(true)
    expect(hasModule('basico', 'empleados')).toBe(false)
    expect(hasModule('plus', 'empleados')).toBe(false)
    expect(hasModule('basico', 'clientes')).toBe(true)
    expect(hasModule(null, 'clientes')).toBe(false)
    expect(includedIn('basico')).not.toContain('empleados')
    expect(includedIn('ultra')).toContain('empleados')
    expect([planName('ultra'), planName('basico'), planName('plus')]).toEqual(['Citora Equipo', 'Citora Solo', 'Citora Solo'])
  })
})

describe('título de los servicios del dueño', () => {
  it('el tipo de negocio, salvo "otro" o uno desconocido', () => {
    expect(ownerInfo({ business_type: 'barberia' }).typeName).toBe('Barbería')
    expect(ownerInfo({ business_type: 'otro' }).typeName).toBeNull()
    expect(ownerInfo({ business_type: 'inventado' }).typeName).toBeNull()
  })
})
