import { describe, expect, it } from 'vitest'
import { clockSafeStorage, clockSkewSeconds } from './clockSkew'

function memory() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}
const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
const jwt = (iat: number) => `x.${b64({ iat, exp: iat + 3600 })}.y`
const session = (iat: number) => JSON.stringify({ access_token: jwt(iat), refresh_token: 'r', expires_at: iat + 3600 })

const SERVER = 1_800_000_000 // hora del servidor al firmar la sesión (segundos)

describe('reloj del móvil mal puesto', () => {
  it('con el reloj 1 hora adelantado, la sesión recién hecha no parece caducada', () => {
    const base = memory()
    const store = clockSafeStorage(base, () => (SERVER + 3600) * 1000)
    store.setItem('sb', session(SERVER))
    expect(clockSkewSeconds(base)).toBe(3600)
    // Para el móvil faltan otra vez 3600 s, como si el reloj estuviera bien
    expect(JSON.parse(store.getItem('sb')!).expires_at).toBe(SERVER + 7200)
  })

  it('al volver a guardar la sesión leída no acumula la corrección', () => {
    const base = memory()
    const store = clockSafeStorage(base, () => (SERVER + 3600) * 1000)
    store.setItem('sb', session(SERVER))
    store.setItem('sb', store.getItem('sb')!)
    expect(JSON.parse(store.getItem('sb')!).expires_at).toBe(SERVER + 7200)
  })

  it('solo mide con sesiones nuevas: una vieja guardada otra vez no cambia el desfase', () => {
    const base = memory()
    let now = (SERVER + 3600) * 1000
    const store = clockSafeStorage(base, () => now)
    store.setItem('sb', session(SERVER))
    now += 50 * 60 * 1000
    store.setItem('sb', session(SERVER))
    expect(clockSkewSeconds(base)).toBe(3600)
  })

  it('con el reloj bien no toca nada', () => {
    const base = memory()
    const store = clockSafeStorage(base, () => (SERVER + 3) * 1000)
    store.setItem('sb', session(SERVER))
    expect(clockSkewSeconds(base)).toBe(0)
    expect(JSON.parse(store.getItem('sb')!).expires_at).toBe(SERVER + 3600)
    store.setItem('otra', 'cosa')
    expect(store.getItem('otra')).toBe('cosa')
  })
})
