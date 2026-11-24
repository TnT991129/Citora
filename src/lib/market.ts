// Dos versiones de Citora en el mismo dominio y con el mismo código:
//   citora-app.com/       → Cuba (CUP, pago por transferencia)
//   citora-app.com/int/   → Internacional (negocios fuera de Cuba)
// La versión se decide por la dirección al abrir la página. Cada negocio tiene la suya guardada
// (businesses.market) y, si se abre en la otra, se le lleva a la buena (ver goToMarket).

export type Market = 'cu' | 'int'

/** Raíz del sitio, con barra al final (ej. "/" o "/citora/") */
export const SITE_BASE = import.meta.env.BASE_URL || '/'
const INT_PREFIX = `${SITE_BASE}int`

function marketOf(pathname: string): Market {
  return pathname === INT_PREFIX || pathname.startsWith(`${INT_PREFIX}/`) ? 'int' : 'cu'
}

/** Versión que se está viendo */
export const MARKET: Market = marketOf(typeof window === 'undefined' ? '/' : window.location.pathname)
export const IS_INT = MARKET === 'int'

/** Raíz de una versión, con barra al final (ej. "/" o "/int/") */
export function marketBase(m: Market): string {
  return m === 'int' ? `${INT_PREFIX}/` : SITE_BASE
}

/** Raíz de la versión que se está viendo: todas las rutas de la app cuelgan de aquí */
export const APP_BASE = marketBase(MARKET)

/**
 * Si el negocio es de la otra versión, abre la misma página en la suya (recargando: cada versión
 * arranca con lo suyo). path: ruta de la app a la que ir (ej. "/barberia-leo/panel-admin"); sin ella,
 * la misma que se está viendo. Devuelve true si va a cambiar de página.
 */
export function goToMarket(m: Market | null | undefined, path?: string): boolean {
  if (!m || m === MARKET) return false
  const { pathname, search, hash } = window.location
  const rest = path != null ? path.replace(/^\//, '') : pathname.startsWith(APP_BASE) ? pathname.slice(APP_BASE.length) : ''
  window.location.replace(`${marketBase(m)}${rest}${path != null ? '' : search + hash}`)
  return true
}

/**
 * Números de Cuba: 8 cifras sin el código (5xxx xxxx móviles, 7xxx xxxx fijos de La Habana…)
 * o con el 53 delante. Igual que _is_cuban_phone en schema.sql.
 */
export function isCubanPhone(raw: string): boolean {
  const p = raw.replace(/\D/g, '')
  return /^53[2-7]\d{7}$/.test(p) || /^[2-7]\d{7}$/.test(p)
}

/** Zona horaria del navegador (ej. "Europe/Madrid"), o null si no se sabe */
export function browserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}
