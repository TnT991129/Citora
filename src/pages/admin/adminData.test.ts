import { describe, expect, it, vi } from 'vitest'

// Las pruebas corren sin navegador: los enlaces necesitan window.location.origin
vi.stubGlobal('window', { location: { origin: 'https://citora-app.com', pathname: '/' } })

import { messageOptions, referralTree, setupHelpMessage, trialFunnel, trialReminderMessage, type Activity, type AdminRow } from './adminData'

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
    expect(text).toContain('Android: abre tu panel en Chrome')
    expect(text).toContain('iPhone: abre tu panel en Safari')
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

  it('el embudo cuenta solo los negocios nuevos del periodo, sin cortesías', () => {
    const now = Date.parse('2026-12-01T12:00:00Z')
    const act = (days: number, extra: Partial<Activity> = {}) => ({
      created_at: new Date(now - days * DAY).toISOString(), comped: false, status: 'prueba',
      push_on: false, link_visits: 0, web_total: 0, paid: false, ...extra,
    }) as Activity
    const acts = [
      act(5, { push_on: true, link_visits: 3, web_total: 2 }),
      act(10, { push_on: true, link_visits: 1 }),
      act(20, { push_on: true, link_visits: 4, web_total: 6, paid: true, status: 'activo' }),
      act(60, { paid: true, status: 'activo' }), // fuera de los 30 días
      act(3, { comped: true, push_on: true }), // cortesía: no cuenta
    ]
    const { steps, inTrial } = trialFunnel(acts, 30, now)
    expect(steps.map((s) => s.count)).toEqual([3, 3, 3, 2, 1])
    expect(inTrial).toBe(2)
    expect(trialFunnel(acts, 90, now).steps[0].count).toBe(4)
  })

  it('el árbol de invitaciones pone arriba a quien trajo a otros y cuelga a sus invitados', () => {
    const b = (id: string, extra: Partial<AdminRow> = {}) => ({ ...base, user_id: 'u' + id, id, name: 'Negocio ' + id, code: id.toUpperCase() + '-0001', ...extra })
    const owners = [
      b('a'),
      b('b', { referred_by: 'a', referral_rewarded: true }),
      b('c', { referred_by: 'b' }),
      b('d', { referred_by: 'a', referral_rewarded: true }),
      b('e'), // no invitó ni vino invitado: no sale
      b('f', { referred_by: 'borrado' }), // quien lo invitó ya no está: no sale (no tiene invitados)
      { ...base, user_id: 'sin', id: null, name: null, code: null, status: 'sin_negocio' as const },
    ]
    const t = referralTree(owners)
    expect(t.roots.map((n) => n.owner.id)).toEqual(['a'])
    expect(t.roots[0].descendants).toBe(3)
    expect(t.roots[0].children.map((n) => n.owner.id)).toEqual(['b', 'd'])
    expect(t.roots[0].children[0].children.map((n) => n.owner.id)).toEqual(['c'])
    expect(t).toMatchObject({ invited: 4, rewarded: 2, inviters: 2 })
  })

  it('a quien paga no le sale el aviso de la prueba', () => {
    const paid = { ...base, status: 'activo' as const, paid_until: new Date(Date.now() + 10 * DAY).toISOString() }
    const ids = messageOptions(paid, prices).map((o) => o.id)
    expect(ids).not.toContain('prueba')
    expect(ids).toContain('renovar')
  })
})
