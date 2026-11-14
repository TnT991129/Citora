// Datos y reglas del panel de administrador: qué es cada negocio, en qué estado está, qué pasos ha
// dado desde que creó su app y si está atascado. Las cifras vienen de admin_list_owners y
// admin_business_activity (ver schema.sql).
import { daysLeft, fullDateFromIso, MONTHS } from '../../lib/format'
import type { BusinessStatus, PlanKey } from '../../lib/types'

/** Hora de Cuba: la del administrador */
export const ADMIN_TZ = 'Etc/GMT+4'

// Una cuenta de dueño. Los campos del negocio son null si se registró pero no terminó de crearlo.
export interface AdminOwner {
  user_id: string
  email: string | null
  signed_up_at: string
  last_sign_in_at: string | null
  id: string | null
  name: string | null
  slug: string | null
  code: string | null
  business_type: string | null
  whatsapp: string | null
  plan: PlanKey | null
  trial_ends_at: string | null
  paid_until: string | null
  created_at: string | null
  comped: boolean
  timezone: string | null
  status: BusinessStatus | 'sin_negocio'
}

export type OwnerWithBusiness = AdminOwner & { id: string; name: string; code: string }

/** Actividad de un negocio (admin_business_activity) */
export interface Activity {
  id: string
  name: string
  slug: string
  code: string
  business_type: string
  whatsapp: string
  currency: string
  comped: boolean
  created_at: string
  status: BusinessStatus
  bookings_total: number
  bookings_30d: number
  bookings_7d: number
  web_30d: number
  web_7d: number
  web_total: number
  manual_total: number
  customers: number
  revenue_30d: number
  last_booking_at: string | null
  services: number
  customized: boolean
  push_on: boolean
  link_visits: number
  paid: boolean
}

/** Un dueño con la actividad de su negocio (si lo tiene) */
export interface AdminRow extends AdminOwner {
  act: Activity | null
}

export function mergeRows(owners: AdminOwner[], activity: Activity[]): AdminRow[] {
  const byId = new Map(activity.map((a) => [a.id, a]))
  return owners.map((o) => ({ ...o, act: o.id ? byId.get(o.id) || null : null }))
}

export const hasBusiness = (r: AdminOwner): r is OwnerWithBusiness => Boolean(r.id && r.name && r.code)

// ---------------------------------------------------------------------
// Primeros pasos: lo que ha hecho el dueño desde que creó su app
// ---------------------------------------------------------------------
export const STEPS = [
  { label: 'Personalizó su app', hint: 'Subió su logo o una foto, o cambió la apariencia' },
  { label: 'Activó los avisos', hint: 'Le suena el móvil cuando alguien reserva' },
  { label: 'Apuntó una cita en su agenda', hint: 'Usa Citora también para las citas que le piden por WhatsApp' },
  { label: 'Compartió su enlace', hint: 'Alguien abrió su página de reservas' },
  { label: 'Recibió su primera reserva por la web', hint: 'Un cliente reservó solo, desde su enlace' },
  { label: 'Recibió reservas esta semana', hint: 'Sigue usándolo' },
] as const

export function stepsDone(a: Activity | null): boolean[] {
  if (!a) return STEPS.map(() => false)
  return [a.customized, a.push_on, a.manual_total > 0, a.link_visits > 0, a.web_total > 0, a.web_7d > 0]
}

export const stepsCount = (a: Activity | null) => stepsDone(a).filter(Boolean).length

// ---------------------------------------------------------------------
// Atascados: en prueba, con la app creada hace días y ninguna reserva por la web
// ---------------------------------------------------------------------
export const STUCK_AFTER_DAYS = 3

export const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))

/** Por qué está atascado un negocio, o null si va bien */
export function stuckReason(r: AdminRow): string | null {
  const a = r.act
  if (!a || r.comped || r.status !== 'prueba') return null
  const days = daysSince(a.created_at)
  if (days < STUCK_AFTER_DAYS || a.web_total > 0) return null
  if (a.link_visits === 0) return `Lleva ${days} días y nadie ha abierto su enlace`
  return `Lleva ${days} días sin reservas (${a.link_visits} ${a.link_visits === 1 ? 'visita' : 'visitas'} a su enlace)`
}

// ---------------------------------------------------------------------
// Estado: etiqueta corta (siempre en una línea) y detalle aparte
// ---------------------------------------------------------------------
export type RowState = BusinessStatus | 'sin_negocio' | 'cortesia'

export const rowState = (r: AdminOwner): RowState => (r.comped ? 'cortesia' : r.status)

const STATE_STYLE: Record<RowState, [string, string]> = {
  prueba: ['Prueba', 'bg-sky-100 text-sky-800'],
  activo: ['Pagando', 'bg-emerald-100 text-emerald-800'],
  vencido: ['Vencido', 'bg-red-100 text-red-700'],
  cortesia: ['Cortesía', 'bg-violet-100 text-violet-800'],
  sin_negocio: ['Sin negocio', 'bg-slate-100 text-slate-600'],
}

/** "12 dic" en la hora de Cuba */
export function shortDay(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: ADMIN_TZ, day: 'numeric', month: 'numeric' }).formatToParts(new Date(iso))
  const day = Number(parts.find((p) => p.type === 'day')?.value || 1)
  const month = Number(parts.find((p) => p.type === 'month')?.value || 1)
  return `${day} ${MONTHS[month - 1].slice(0, 3)}`
}

/** Cuándo dejó de funcionar un negocio vencido */
export const expiredAt = (r: AdminOwner) => r.paid_until || r.trial_ends_at

export function stateInfo(r: AdminOwner): { label: string; cls: string; detail: string } {
  const s = rowState(r)
  const [label, cls] = STATE_STYLE[s]
  let detail = ''
  if (s === 'cortesia') detail = 'Gratis siempre'
  else if (s === 'sin_negocio') detail = 'No terminó de crearlo'
  else if (s === 'prueba' && r.trial_ends_at) {
    const d = daysLeft(r.trial_ends_at)
    detail = d <= 0 ? 'Termina hoy' : `Quedan ${d} ${d === 1 ? 'día' : 'días'}`
  } else if (s === 'activo' && r.paid_until) detail = `Hasta el ${shortDay(r.paid_until)}`
  else if (s === 'vencido') {
    const at = expiredAt(r)
    const d = at ? daysSince(at) : 0
    detail = !at ? 'Sin pagar' : d === 0 ? 'Desde hoy' : `Hace ${d} ${d === 1 ? 'día' : 'días'}`
  }
  return { label, cls, detail }
}

/** "hace 20 min", "hace 3 h", "ayer", "hace 5 días" */
export function agoShort(iso: string | null): string {
  if (!iso) return 'nunca'
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 60) return min <= 1 ? 'ahora mismo' : `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'ayer'
  if (d < 30) return `hace ${d} días`
  const m = Math.floor(d / 30)
  return `hace ${m} ${m === 1 ? 'mes' : 'meses'}`
}

// ---------------------------------------------------------------------
// Mensajes de WhatsApp para los dueños
// ---------------------------------------------------------------------

/** Para un dueño cuyo plan vence o cuya prueba termina pronto, con la fecha en la hora de su negocio */
export function expiringMessage(b: { name: string; kind: 'activo' | 'prueba'; ends_at: string; timezone?: string | null }): string {
  const day = fullDateFromIso(b.ends_at, b.timezone || ADMIN_TZ)
  return b.kind === 'activo'
    ? `Hola, te escribo de Citora. El plan de ${b.name} vence el ${day}. Para renovarlo entra en tu panel > Mensualidad. ¡Gracias!`
    : `Hola, te escribo de Citora. Tu prueba gratis de ${b.name} termina el ${day}. Para seguir recibiendo reservas entra en tu panel > Mensualidad. ¿Te ayudo con algo?`
}

export const helpMessage = (name: string) =>
  `Hola, te escribo de Citora. Vi que ${name} todavía no ha recibido su primera reserva. ¿Te ayudo a dejar tu app lista o a compartir tu enlace con tus clientes?`

export const expiredMessage = (name: string, wasTrial: boolean) =>
  `Hola, te escribo de Citora. La app de ${name} dejó de recibir reservas porque terminó ${wasTrial ? 'tu prueba gratis' : 'tu mensualidad'}. ` +
  'No se ha borrado nada: en cuanto pagues en tu panel > Mensualidad vuelve a funcionar. ¿Te ayudo?'

export const contactMessage = (name: string) => `Hola, te escribo de Citora sobre ${name}.`

/** 1240 → "1.240" (en español los miles llevan punto también con 4 cifras) */
export const int = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/** Porcentaje legible: "38 %", y con un decimal si es menos de 1 ("0,3 %") */
export function pct(part: number, whole: number): string {
  if (whole <= 0) return '—'
  const p = (part / whole) * 100
  return p > 0 && p < 1 ? `${p.toFixed(1).replace('.', ',')} %` : `${Math.round(p)} %`
}
