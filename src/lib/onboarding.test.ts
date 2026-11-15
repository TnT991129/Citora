import { describe, expect, it, vi } from 'vitest'

// Estas pruebas no usan la base de datos (y en Node 20 el cliente de Supabase no se puede crear)
vi.mock('./supabase', () => ({ supabase: {} }))

import { activeTools, DEFAULT_TOOLS, mergeOnboarding, pricesUnreviewed, readOnboarding, stepsDone, type Progress } from './onboarding'

const progress = (p: Partial<Progress> = {}): Progress => ({ web_total: 0, web_real: 0, bookings: 0, revenue: 0, push_on: false, visits_7d: 0, ...p })

describe('primeros pasos', () => {
  it('sin datos de la base (versión anterior) usa lo de siempre', () => {
    expect(readOnboarding({})).toEqual({})
    expect(readOnboarding({ onboarding: [] as never })).toEqual({})
    expect(activeTools({})).toEqual(DEFAULT_TOOLS)
  })

  it('junta los pasos sin pisar los anteriores', () => {
    const a = { tools: ['cupones'], steps: { ver: '1' } }
    expect(mergeOnboarding(a, { steps: { compartir: '2' } })).toEqual({ tools: ['cupones'], steps: { ver: '1', compartir: '2' } })
    expect(mergeOnboarding(a, { tools: ['galeria'] }).tools).toEqual(['galeria'])
  })

  it('los precios están revisados si no saltó Servicios, o si los revisó después', () => {
    expect(stepsDone({}, null).precios).toBe(true)
    expect(stepsDone({ skipped: ['servicios'] }, null).precios).toBe(false)
    expect(pricesUnreviewed({ skipped: ['servicios'] })).toBe(true)
    expect(pricesUnreviewed({ skipped: ['servicios'], steps: { precios: 'x' } })).toBe(false)
    expect(pricesUnreviewed({ skipped: ['horario'] })).toBe(false)
  })

  it('la reserva de prueba (con su propio WhatsApp) no cuenta como primera reserva', () => {
    const d = stepsDone({}, progress({ web_total: 1, web_real: 0 }))
    expect(d.prueba).toBe(true)
    expect(d.primera).toBe(false)
    expect(stepsDone({}, progress({ web_total: 2, web_real: 1 })).primera).toBe(true)
  })

  it('los avisos y el enlace se marcan solos con los datos del servidor', () => {
    const d = stepsDone({}, progress({ push_on: true, visits_7d: 3 }))
    expect(d.avisos).toBe(true)
    expect(d.compartir).toBe(true)
    expect(stepsDone({}, progress()).avisos).toBe(false)
  })
})
