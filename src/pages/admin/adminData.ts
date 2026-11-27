// Datos y reglas del panel de administrador: qué es cada negocio, en qué estado está, qué pasos ha
// dado desde que creó su app y si está atascado. Las cifras vienen de admin_list_owners y
// admin_business_activity (ver schema.sql).
import { serverNow } from '../../lib/clockSkew'
import { daysLeft, fullDateFromIso, MONTHS } from '../../lib/format'
import { marketBase } from '../../lib/market'
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
  /** Versión de Citora: 'cu' (Cuba) o 'int' (internacional). Null si aún no creó su negocio. */
  market?: 'cu' | 'int' | null
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

// ---------------------------------------------------------------------
// Prueba gratis: cuánto le queda y, si acabó sin pagar, cuándo se borra sola
// ---------------------------------------------------------------------

/** Días tras el fin de la prueba sin pagar en los que se borra el negocio (ver _purge_expired_trials en schema.sql) */
export const PURGE_AFTER_DAYS = 5

/** "Quedan 3 días", "Quedan 5 h", "Acaba en menos de 1 h" */
export function trialLeft(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - serverNow()
  if (ms <= 0) return 'Terminada'
  const h = Math.floor(ms / 3600000)
  if (h < 1) return 'Acaba en menos de 1 h'
  if (h < 24) return `Quedan ${h} h`
  const d = daysLeft(endsAt)
  return `Quedan ${d} ${d === 1 ? 'día' : 'días'}`
}

/** Qué parte de la prueba ha usado ya (0 a 100), para la barra */
export function trialUsed(r: AdminOwner): number {
  const start = new Date(r.created_at || r.signed_up_at).getTime()
  const end = r.trial_ends_at ? new Date(r.trial_ends_at).getTime() : start
  if (end <= start) return 100
  return Math.min(100, Math.max(0, Math.round(((serverNow() - start) / (end - start)) * 100)))
}

/** Si es una prueba que acabó sin pagar nunca, cuándo se borra; si no, null */
export function purgeAt(r: AdminOwner): string | null {
  if (r.comped || r.status !== 'vencido' || r.paid_until || !r.trial_ends_at) return null
  return new Date(new Date(r.trial_ends_at).getTime() + PURGE_AFTER_DAYS * 86400000).toISOString()
}

/** "Se borra en 3 días", "Se borra hoy" */
export function purgeText(at: string): string {
  const d = daysLeft(at)
  return d <= 0 ? 'Se borra hoy' : d === 1 ? 'Se borra mañana' : `Se borra en ${d} días`
}

/**
 * Estado: etiqueta, color y detalle. urgent: hay que mirarlo ya (la prueba acaba en 2 días o
 * menos, o el negocio se va a borrar).
 */
export function stateInfo(r: AdminOwner): { label: string; cls: string; detail: string; urgent: boolean } {
  const s = rowState(r)
  const [label, cls] = STATE_STYLE[s]
  let detail = ''
  let urgent = false
  if (s === 'cortesia') detail = 'Gratis siempre'
  else if (s === 'sin_negocio') detail = 'No terminó de crearlo'
  else if (s === 'prueba' && r.trial_ends_at) {
    detail = trialLeft(r.trial_ends_at)
    urgent = daysLeft(r.trial_ends_at) <= 2
  } else if (s === 'activo' && r.paid_until) detail = `Hasta el ${shortDay(r.paid_until)}`
  else if (s === 'vencido') {
    const purge = purgeAt(r)
    if (purge) {
      detail = purgeText(purge)
      urgent = true
    } else {
      const at = expiredAt(r)
      const d = at ? daysSince(at) : 0
      detail = !at ? 'Sin pagar' : d === 0 ? 'Desde hoy' : `Hace ${d} ${d === 1 ? 'día' : 'días'}`
    }
  }
  return { label, cls, detail, urgent }
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
/** Enlace al panel de un negocio, en su versión (Cuba o /int/). Con ?p= para que abra bien desde WhatsApp. */
export function ownerPanelUrl(slug: string | null | undefined, market?: 'cu' | 'int' | null): string | null {
  if (!slug) return null
  return `${window.location.origin}${marketBase(market === 'int' ? 'int' : 'cu')}?p=${encodeURIComponent(slug)}`
}

export function expiringMessage(b: { name: string; kind: 'activo' | 'prueba'; ends_at: string; timezone?: string | null; slug?: string | null; market?: 'cu' | 'int' | null }): string {
  const day = fullDateFromIso(b.ends_at, b.timezone || ADMIN_TZ)
  const link = ownerPanelUrl(b.slug, b.market)
  if (b.kind === 'activo') {
    return `Hola, te escribo de Citora. El plan de ${b.name} vence el ${day}. Para renovarlo entra en tu panel > Mensualidad${link ? `: ${link}` : ''}. ¡Gracias!`
  }
  return `Hola 👋, te escribo de Citora. La prueba gratis de ${b.name} termina el ${day}.\n\n` +
    `Para que tus clientas puedan seguir reservando sin cortes, activa tu plan en tu panel > Mensualidad${link ? `: ${link}` : '.'}\n\n` +
    'Todo lo que ya tienes (servicios, horario, citas y clientas) se queda igual. Si tienes alguna duda, dime y te ayudo.'
}

/** ¿La prueba gratis acaba en 7 días o menos? (para ofrecer el mensaje de aviso) */
export const trialEndingSoon = (r: AdminOwner) =>
  !r.comped && r.status === 'prueba' && !!r.trial_ends_at && daysLeft(r.trial_ends_at) <= 7

/** Página de reservas de un negocio, en su versión (Cuba o /int/) */
export function ownerPublicUrl(slug: string | null | undefined, market?: 'cu' | 'int' | null): string | null {
  if (!slug) return null
  return `${window.location.origin}${marketBase(market === 'int' ? 'int' : 'cu')}?c=${encodeURIComponent(slug)}`
}

/** Precios ya escritos ("1.500 CUP"), para ponerlos en los mensajes */
export interface PlanPrices { solo: string; equipo: string; discount: boolean }

/** "le quedan 3 días", "le queda 1 día", "le quedan menos de 24 horas" */
function trialDaysText(endsAt: string): string {
  if (new Date(endsAt).getTime() - serverNow() < 86400000) return 'le quedan menos de 24 horas'
  const d = daysLeft(endsAt)
  return d === 1 ? 'le queda 1 día' : `le quedan ${d} días`
}

/** Aviso de cuántos días le quedan de prueba, para que elija un plan antes de que se acabe */
export function trialReminderMessage(b: {
  name: string; ends_at: string; timezone?: string | null; slug?: string | null; market?: 'cu' | 'int' | null; prices?: PlanPrices
}): string {
  const day = fullDateFromIso(b.ends_at, b.timezone || ADMIN_TZ)
  const link = ownerPanelUrl(b.slug, b.market)
  const p = b.prices
  return `Hola 👋, te escribo de Citora. A la prueba gratis de ${b.name} ${trialDaysText(b.ends_at)} (termina el ${day}).\n\n` +
    'Para que tus clientas puedan seguir reservando sin cortes, elige tu plan antes de esa fecha:\n' +
    `• Citora Solo${p ? `: ${p.solo} al mes` : ''}. Para quien atiende sola.\n` +
    `• Citora Equipo${p ? `: ${p.equipo} al mes` : ''}. Para salones con varias personas.\n` +
    (p?.discount ? 'Si pagas 3 o 6 meses de una vez, te sale más barato.\n' : '') +
    `\nLo activas en tu panel > Más > Mensualidad${link ? `: ${link}` : '.'}\n\n` +
    'Todo lo que ya tienes (servicios, horario, citas y clientas) se queda igual. Si quieres, te ayudo a elegir el plan.'
}

/**
 * Ayuda para dejar la app lista: los pasos en orden, con dónde está cada cosa en el panel.
 * Si sabemos qué ha hecho ya (act), no le pedimos lo que ya hizo.
 */
export function setupHelpMessage(b: { name: string; slug?: string | null; market?: 'cu' | 'int' | null; act?: Activity | null }): string {
  const a = b.act
  const pub = ownerPublicUrl(b.slug, b.market)
  const steps = [
    'Revisa tus servicios y precios (los que salen son de ejemplo): Mi negocio > Servicios.',
    'Pon tus días y horas de trabajo: Mi negocio > Horario.',
    'Ancla la app a la pantalla de inicio de tu móvil para abrirla como cualquier otra app. Abre tu panel y, en el menú del navegador, elige «Añadir a pantalla de inicio». En iPhone, desde Safari: botón Compartir > «Añadir a pantalla de inicio».',
    !a?.push_on && 'Activa los avisos para que te suene el móvil cuando alguien reserve: Más > Ajustes.',
    !a?.customized && 'Sube tu logo o una foto de tu trabajo: Mi negocio > Apariencia.',
    `Haz una reserva de prueba desde tu enlace, para ver lo que verán tus clientas${pub ? `: ${pub}` : '.'}`,
    'Comparte ese enlace con tus clientas por WhatsApp, en tu estado, en Instagram o en Facebook. Desde ahí reservan solas.',
  ].filter((s): s is string => Boolean(s))
  const panel = ownerPanelUrl(b.slug, b.market)
  return `Hola 👋, te escribo de Citora. ¡Bienvenida! Te dejo los pasos para que ${b.name} empiece a recibir reservas. Te toma unos 10 minutos:\n\n` +
    steps.map((s, i) => `${i + 1}. ${s}`).join('\n') +
    (panel ? `\n\nEntra en tu panel desde aquí: ${panel}` : '') +
    '\n\nSi te trabas en algún paso, escríbeme y te ayudo.'
}

/** Mensajes que se le pueden mandar a un dueño desde su ficha. El primero es el que más le hace falta. */
export type MessageKind = 'prueba' | 'configurar' | 'vencida' | 'renovar' | 'ayuda' | 'saludo'

export function messageOptions(r: AdminRow, prices?: PlanPrices): { id: MessageKind; label: string; text: string }[] {
  const name = r.name || r.email || ''
  const list: { id: MessageKind; label: string; text: string }[] = []
  const inTrial = !r.comped && r.status === 'prueba' && !!r.trial_ends_at
  const purge = purgeAt(r)
  if (purge) list.push({ id: 'vencida', label: 'Se le acabó la prueba', text: expiredMessage(name, true) })
  else if (!r.comped && r.status === 'vencido') list.push({ id: 'vencida', label: 'Se le acabó el plan', text: expiredMessage(name, false) })
  if (inTrial) list.push({ id: 'prueba', label: 'Días que le quedan de prueba', text: trialReminderMessage({ name, ends_at: r.trial_ends_at!, timezone: r.timezone, slug: r.slug, market: r.market, prices }) })
  if (!r.comped && r.status === 'activo' && r.paid_until) list.push({ id: 'renovar', label: 'Su plan vence pronto', text: expiringMessage({ name, kind: 'activo', ends_at: r.paid_until, timezone: r.timezone, slug: r.slug, market: r.market }) })
  if (hasBusiness(r)) list.push({ id: 'configurar', label: 'Ayuda para configurar la app', text: setupHelpMessage({ name, slug: r.slug, market: r.market, act: r.act }) })
  if (stuckReason(r)) list.push({ id: 'ayuda', label: 'Todavía no le reservan', text: helpMessage(name) })
  list.push({ id: 'saludo', label: 'Mensaje en blanco', text: contactMessage(name) })
  // Recién creada y con mucha prueba por delante: lo que más le sirve es la ayuda para configurar
  if (inTrial && !purge && !trialEndingSoon(r)) {
    const i = list.findIndex((m) => m.id === 'configurar')
    if (i > 0) list.unshift(...list.splice(i, 1))
  }
  return list
}

export const helpMessage = (name: string) =>
  `Hola, te escribo de Citora. Vi que ${name} todavía no ha recibido su primera reserva. ¿Te ayudo a dejar tu app lista o a compartir tu enlace con tus clientes?`

export const expiredMessage = (name: string, wasTrial: boolean) =>
  `Hola, te escribo de Citora. La app de ${name} dejó de recibir reservas porque terminó ${wasTrial ? 'tu prueba gratis' : 'tu mensualidad'}. ` +
  (wasTrial
    ? `Si pagas en tu panel > Mensualidad en los ${PURGE_AFTER_DAYS} días siguientes, vuelve a funcionar con todo lo que tenías; si no, se borra. ¿Te ayudo?`
    : 'No se ha borrado nada: en cuanto pagues en tu panel > Mensualidad vuelve a funcionar. ¿Te ayudo?')

export const contactMessage = (name: string) => `Hola, te escribo de Citora sobre ${name}.`

/** 1240 → "1.240" (en español los miles llevan punto también con 4 cifras) */
export const int = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/** Porcentaje legible: "38 %", y con un decimal si es menos de 1 ("0,3 %") */
export function pct(part: number, whole: number): string {
  if (whole <= 0) return '—'
  const p = (part / whole) * 100
  return p > 0 && p < 1 ? `${p.toFixed(1).replace('.', ',')} %` : `${Math.round(p)} %`
}
