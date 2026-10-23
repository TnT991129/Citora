// Fechas y dinero. Las fechas "clave" son textos YYYY-MM-DD en la zona horaria del negocio.

export const DEFAULT_TZ = 'America/Havana'

// Moneda del negocio. "Ambas": los precios van en USD y se muestra también su cambio en CUP
// con la tasa del día que pone el dueño (usd_rate = CUP por 1 USD).
export type CurrencyMode = 'CUP' | 'USD' | 'AMBAS'

export const CURRENCY_MODES: { key: CurrencyMode; name: string; hint: string }[] = [
  { key: 'CUP', name: 'CUP', hint: 'Pesos cubanos' },
  { key: 'USD', name: 'USD', hint: 'Dólares' },
  { key: 'AMBAS', name: 'USD y CUP', hint: 'Precios en USD y su cambio en CUP a la tasa del día' },
]

export function currencyMode(b: { currency?: string; usd_prices?: boolean }): CurrencyMode {
  return b.usd_prices ? 'AMBAS' : b.currency === 'USD' ? 'USD' : 'CUP'
}

/** Columnas del negocio para una moneda elegida */
export function currencyFields(m: CurrencyMode): { currency: string; usd_prices: boolean } {
  return { currency: m === 'CUP' ? 'CUP' : 'USD', usd_prices: m === 'AMBAS' }
}

/** Tasa con la que se muestra el cambio en CUP; null si el negocio no lo muestra */
export function cupRate(b: { usd_prices?: boolean; usd_rate?: number | string | null }): number | null {
  const r = Number(b.usd_rate)
  return b.usd_prices && r > 0 ? r : null
}

export function money(n: number | string | null | undefined, currency = 'CUP'): string {
  const v = Number(n ?? 0)
  const [int, dec] = Math.abs(v).toFixed(v % 1 ? 2 : 0).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${v < 0 ? '-' : ''}${grouped}${dec ? ',' + dec : ''} ${currency}`
}

/** Precio en la moneda del negocio y, con tasa, también su cambio en CUP: "5 USD · 1.500 CUP" */
export function price(n: number | string | null | undefined, currency: string, rate?: number | string | null): string {
  const r = Number(rate)
  return r > 0 ? `${money(n, currency)} · ${money(Math.round(Number(n ?? 0) * r), 'CUP')}` : money(n, currency)
}

export function duration(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

/** YYYY-MM-DD de un instante, visto en la zona horaria indicada */
export function dateKey(d: Date | string, tz = DEFAULT_TZ): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

/** Hora de un instante en la zona horaria indicada. hour12: true para "9:00 a.m." en vez de "09:00" */
export function timeOf(d: Date | string, tz = DEFAULT_TZ, hour12 = false): string {
  const date = typeof d === 'string' ? new Date(d) : d
  if (hour12) return time12(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(date))
  return new Intl.DateTimeFormat('es-ES', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}

/** Convierte "HH:MM" (24h) a 12h con a.m./p.m., para los turnos que elige el cliente al reservar */
export function time12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h < 12 ? 'a.m.' : 'p.m.'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

export function todayKey(tz = DEFAULT_TZ): string {
  return dateKey(new Date(), tz)
}

export function addDays(key: string, n: number): string {
  const d = new Date(key + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function weekdayOf(key: string): number {
  return new Date(key + 'T12:00:00Z').getUTCDay()
}

export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "lunes 5 de octubre" */
export function longDate(key: string): string {
  const d = new Date(key + 'T12:00:00Z')
  return `${WEEKDAYS[d.getUTCDay()].toLowerCase()} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`
}

/** "Lunes 5 de octubre" (para títulos) */
export function dayTitle(key: string): string {
  const s = longDate(key)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** "Lun 5 oct" */
export function shortDate(key: string): string {
  const d = new Date(key + 'T12:00:00Z')
  return `${WEEKDAYS_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`
}

/** "5 de octubre de 2026" desde una fecha ISO */
export function fullDateFromIso(iso: string, tz = DEFAULT_TZ): string {
  const key = dateKey(iso, tz)
  const d = new Date(key + 'T12:00:00Z')
  return `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`
}

/** Instante (ISO) que corresponde a "fecha + hora" en la zona del negocio. Para consultas por rango. */
export function zonedToIso(key: string, time: string, tz = DEFAULT_TZ): string {
  // Se prueba con el desfase de la zona en ese momento (sirve también con cambio de horario)
  const guess = new Date(`${key}T${time}:00Z`)
  const asTz = new Date(guess.toLocaleString('en-US', { timeZone: tz }))
  const asUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }))
  const offset = asTz.getTime() - asUtc.getTime()
  return new Date(guess.getTime() - offset).toISOString()
}

export function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000))
}

export function hoursLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 3600000))
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 40)
    .replace(/-+$/g, '')
}

export function cleanPhone(p: string): string {
  return (p || '').replace(/\D/g, '')
}

/** Convierte "HH:MM" en minutos y viceversa */
export const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
export const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** Turnos cada X minutos entre apertura y cierre (el último turno empieza antes del cierre) */
export function generateSlots(open: string, close: string, every: number): string[] {
  const out: string[] = []
  const end = toMin(close)
  for (let m = toMin(open); m < end && out.length < 48; m += Math.max(5, every)) out.push(fromMin(m))
  return out
}

export function normalizeSlot(t: string): string {
  return (t || '').slice(0, 5)
}
