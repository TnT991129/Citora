import { addDays, dateKey, longDate, price, timeOf, zonedToIso } from './format'
import { supabase } from './supabase'
import type { Appointment, Business } from './types'
import { bookingUrl, publicUrl } from './url'
import { t } from './i18n'
import { cachePut, cacheUse, isNetworkError } from './offline'

/** Citas entre dos días (incluidos), en la zona horaria del negocio */
export async function fetchAppointments(b: Business, fromKey: string, toKey: string): Promise<Appointment[]> {
  const key = `citas:${b.id}:${fromKey}:${toKey}`
  const { data, error } = await supabase
    .from('appointments')
    .select('*, appointment_services(name, price, duration_min)')
    .gte('starts_at', zonedToIso(fromKey, '00:00', b.timezone))
    .lt('starts_at', zonedToIso(addDays(toKey, 1), '00:00', b.timezone))
    .order('starts_at')
  if (error) {
    // Sin conexión: las citas de la última vez que se vieron estos días (ver offline.ts)
    const cached = isNetworkError(error) ? cacheUse<Appointment[]>(key) : null
    if (cached) return cached
    throw error
  }
  cachePut(key, data)
  return (data as Appointment[]) || []
}

export function servicesText(a: Appointment): string {
  return (a.appointment_services || []).map((s) => s.name).join(', ') || t('Sin servicio')
}

export type MessageKind = 'confirmar' | 'recordatorio' | 'retraso' | 'gracias' | 'cancelacion'

export const MESSAGE_LABELS: Record<MessageKind, string> = {
  confirmar: t('Confirmar cita'),
  recordatorio: t('Recordatorio'),
  retraso: t('Aviso de retraso'),
  gracias: t('Gracias por venir'),
  cancelacion: t('Cancelación'),
}

/** Mensajes de WhatsApp ya escritos para enviar al cliente */
export function buildMessage(kind: MessageKind, a: Appointment, b: Business): string {
  const day = longDate(dateKey(a.starts_at, b.timezone))
  const time = timeOf(a.starts_at, b.timezone, true)
  const first = a.customer_name.split(' ')[0]
  const link = bookingUrl(b.slug, a.token)
  switch (kind) {
    case 'confirmar':
      return t('Hola {first}, te confirmo tu cita en {name} el {day} a las {time} ({servicesText}). Total: {price}.\n\nDetalles o cambios aquí: {link}', { first: first, name: b.name, day: day, time: time, servicesText: servicesText(a), price: price(a.total, b.currency, a.usd_rate), link: link })
    case 'recordatorio':
      return t('Hola {first}, te recuerdo tu cita en {name} el {day} a las {time}.{v}\n\nSi no puedes venir, avísame o cámbiala aquí: {link}', { first: first, name: b.name, day: day, time: time, v: b.address ? `\n📍 ${b.address}` : '', link: link })
    case 'retraso':
      return t('Hola {first}, voy con unos minutos de retraso para tu cita de las {time}. Disculpa las molestias.', { first: first, time: time })
    case 'gracias':
      return t('¡Gracias por venir a {name}, {first}! Espero que te haya encantado.\n\nSi tienes un minuto, cuéntanos qué tal te fue: {link}\n\nCuando quieras repetir, reserva aquí: {publicUrl}', { name: b.name, first: first, link: link, publicUrl: publicUrl(b.slug) })
    case 'cancelacion':
      return t('Hola {first}, lamentablemente tengo que cancelar tu cita del {day} a las {time}. Puedes reservar otro día aquí: {publicUrl}', { first: first, day: day, time: time, publicUrl: publicUrl(b.slug) })
  }
}

export function isActive(a: Appointment): boolean {
  return a.status !== 'cancelada' && a.status !== 'no_asistio'
}
