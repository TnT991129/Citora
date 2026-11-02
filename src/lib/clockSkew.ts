// Móviles con la hora mal puesta (pasa mucho tras un cambio de horario): Supabase decide si la
// sesión caducó comparando su hora de caducidad con el reloj del móvil. Con el reloj una hora o más
// adelantado, la da por caducada nada más entrar, la intenta renovar sin parar y acaba cerrándola:
// el dueño vuelve a ver "Entrar" sin ningún error.
// Este almacén aprende el desfase con la hora a la que el servidor firmó cada sesión nueva ("iat") y
// corrige la caducidad al leerla, para que las cuentas de Supabase salgan como si el reloj estuviera bien.

type BaseStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const SKEW_KEY = 'citora:desfase-reloj'
/** Por debajo de esto no se corrige nada (lo que tarda la red, relojes casi en hora) */
const TOLERANCE_S = 120

interface SkewRecord {
  /** "iat" de la última sesión vista: solo se mide con sesiones recién firmadas */
  iat: number
  /** Segundos que va adelantado el móvil (negativo: atrasado) */
  skew: number
}

function decodeJwt(token: unknown): { iat?: number; exp?: number } | null {
  if (typeof token !== 'string') return null
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')))
  } catch {
    return null
  }
}

function readRecord(base: BaseStorage): SkewRecord | null {
  try {
    const r = JSON.parse(base.getItem(SKEW_KEY) || 'null')
    return r && typeof r.iat === 'number' && typeof r.skew === 'number' ? r : null
  } catch {
    return null
  }
}

/** Segundos que va adelantado el reloj del móvil respecto al servidor (0 si está bien o no se sabe) */
export function clockSkewSeconds(base: BaseStorage | null = safeLocalStorage()): number {
  return base ? readRecord(base)?.skew || 0 : 0
}

export function clockSafeStorage(base: BaseStorage, now: () => number = Date.now): BaseStorage {
  return {
    getItem(key) {
      const raw = base.getItem(key)
      if (!raw || key === SKEW_KEY) return raw
      const skew = clockSkewSeconds(base)
      if (!skew) return raw
      try {
        const s = JSON.parse(raw)
        if (s && typeof s.expires_at === 'number') return JSON.stringify({ ...s, expires_at: s.expires_at + skew })
      } catch {
        /* no es una sesión */
      }
      return raw
    },
    setItem(key, value) {
      if (key === SKEW_KEY) return base.setItem(key, value)
      try {
        const s = JSON.parse(value)
        const jwt = decodeJwt(s?.access_token)
        if (jwt && typeof jwt.exp === 'number') {
          // Sesión nueva: se mide el desfase ahora, que el servidor acaba de firmarla
          if (typeof jwt.iat === 'number' && readRecord(base)?.iat !== jwt.iat) {
            const skew = Math.round(now() / 1000 - jwt.iat)
            base.setItem(SKEW_KEY, JSON.stringify({ iat: jwt.iat, skew: Math.abs(skew) > TOLERANCE_S ? skew : 0 }))
          }
          // Se guarda siempre la caducidad del servidor; la corrección se aplica solo al leer
          return base.setItem(key, JSON.stringify({ ...s, expires_at: jwt.exp }))
        }
      } catch {
        /* no es una sesión */
      }
      base.setItem(key, value)
    },
    removeItem(key) {
      base.removeItem(key)
    },
  }
}

/** localStorage si se puede usar (en modo privado o con datos bloqueados puede fallar) */
export function safeLocalStorage(): BaseStorage | null {
  try {
    const k = 'citora:prueba'
    window.localStorage.setItem(k, '1')
    window.localStorage.removeItem(k)
    return window.localStorage
  } catch {
    return null
  }
}
