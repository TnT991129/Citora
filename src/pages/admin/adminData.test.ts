import { describe, expect, it, vi } from 'vitest'

// Las pruebas corren sin navegador: los enlaces necesitan window.location.origin
vi.stubGlobal('window', { location: { origin: 'https://citora-app.com', pathname: '/' } })

import { messageOptions, setupHelpMessage, trialReminderMessage, type Activity, type AdminRow } from './adminData'

const DAY = 86400000
const base: AdminRow = {
  user_id: 'u1', email: 'ana@ejemplo.com', signed_up_at: new Date().toISOString(), last_sign_in_at: null,
  id: 'b1', name: 'Salón Ana', slug: 'salon-ana', code: 'ANA1', business_type: 'salon', whatsapp: '5355555555',
  plan: 'ultra', trial_ends_at: new Date(Date.now() + 5 * DAY - 60000).toISOString(), paid_until: null,
  created_at: new Date().toISOString(), comped: false, timezone: null, market: 'cu', status: 'prueba', act: null,
}
const prices = { solo: '1.500 CUP', equipo: '3.000 CUP', discount: true }

describe('mensajes para los dueños', () => {
  it('el aviso de la prueba dice cuántos días quedan y los planes con su precio', () => {
    const text = trialReminderMessage({ name: 'Salón Ana', ends_at: base.trial_ends_at!, slug: 'salon-ana', prices })
    expect(text).toContain('le quedan 5 días')
    expect(text).toContain('Citora Solo: 1.500 CUP al mes')
    expect(text).toContain('Citora Equipo: 3.000 CUP al mes')
    expect(text).toContain('3 o 6 meses')
    expect(text).toContain('?p=salon-ana')
  })

  it('con menos de un día lo dice en horas', () => {
    const text = trialReminderMessage({ name: 'Salón Ana', ends_at: new Date(Date.now() + 3 * 3600000).toISOString() })
    expect(text).toContain('le quedan menos de 24 horas')
  })

  it('la ayuda para configurar no pide lo que ya hizo', () => {
    const act = { push_on: true, customized: false } as Activity
    const text = setupHelpMessage({ name: 'Salón Ana', slug: 'salon-ana', act })
    expect(text).not.toContain('Activa los avisos')
    expect(text).toContain('Añadir a pantalla de inicio')
    // Anclar la app va antes que los avisos (en iPhone, los avisos solo funcionan con la app anclada)
    const all = setupHelpMessage({ name: 'Salón Ana', slug: 'salon-ana' })
    expect(all.indexOf('pantalla de inicio')).toBeLessThan(all.indexOf('Activa los avisos'))
    expect(text).toContain('Mi negocio > Apariencia')
    expect(text).toContain('?c=salon-ana')
  })

  it('una prueba recién empezada ofrece primero la ayuda; una que acaba pronto, el aviso', () => {
    const fresh = { ...base, trial_ends_at: new Date(Date.now() + 20 * DAY).toISOString() }
    expect(messageOptions(fresh, prices)[0].id).toBe('configurar')
    expect(messageOptions(base, prices)[0].id).toBe('prueba')
    expect(messageOptions(base, prices).map((o) => o.id)).toContain('configurar')
  })

  it('a quien paga no le sale el aviso de la prueba', () => {
    const paid = { ...base, status: 'activo' as const, paid_until: new Date(Date.now() + 10 * DAY).toISOString() }
    const ids = messageOptions(paid, prices).map((o) => o.id)
    expect(ids).not.toContain('prueba')
    expect(ids).toContain('renovar')
  })
})
