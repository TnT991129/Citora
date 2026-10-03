import { addDays, dateKey, longDate, money, timeOf, zonedToIso } from './format'
import { supabase } from './supabase'
import type { Appointment, Business } from './types'
import { bookingUrl, publicUrl } from './url'

/** Citas entre dos días (incluidos), en la zona horaria del negocio */
export async function fetchAppointments(b: Business, fromKey: string, toKey: string): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*, appointment_services(name, price, duration_min)')
    .gte('starts_at', zonedToIso(fromKey, '00:00', b.timezone))
    .lt('starts_at', zonedToIso(addDays(toKey, 1), '00:00', b.timezone))
    .order('starts_at')
  if (error) throw error
  return (data as Appointment[]) || []
}

export function servicesText(a: Appointment): string {
  return (a.appointment_services || []).map((s) => s.name).join(', ') || 'Sin servicio'
}

export type MessageKind = 'confirmar' | 'recordatorio' | 'retraso' | 'gracias' | 'cancelacion'

export const MESSAGE_LABELS: Record<MessageKind, string> = {
  confirmar: 'Confirmar cita',
  recordatorio: 'Recordatorio',
  retraso: 'Aviso de retraso',
  gracias: 'Gracias por venir',
  cancelacion: 'Cancelación',
}

/** Mensajes de WhatsApp ya escritos para enviar al cliente */
export function buildMessage(kind: MessageKind, a: Appointment, b: Business): string {
  const day = longDate(dateKey(a.starts_at, b.timezone))
  const time = timeOf(a.starts_at, b.timezone)
  const first = a.customer_name.split(' ')[0]
  const link = bookingUrl(b.slug, a.token)
  switch (kind) {
    case 'confirmar':
      return `Hola ${first}, te confirmo tu cita en ${b.name} el ${day} a las ${time} (${servicesText(a)}). Total: ${money(a.total, b.currency)}.\n\nDetalles o cambios aquí: ${link}`
    case 'recordatorio':
      return `Hola ${first}, te recuerdo tu cita en ${b.name} el ${day} a las ${time}.${b.address ? `\n📍 ${b.address}` : ''}\n\nSi no puedes venir, avísame o cámbiala aquí: ${link}`
    case 'retraso':
      return `Hola ${first}, voy con unos minutos de retraso para tu cita de las ${time}. Disculpa las molestias.`
    case 'gracias':
      return `¡Gracias por venir a ${b.name}, ${first}! Espero que te haya encantado. Cuando quieras repetir, reserva aquí: ${publicUrl(b.slug)}`
    case 'cancelacion':
      return `Hola ${first}, lamentablemente tengo que cancelar tu cita del ${day} a las ${time}. Puedes reservar otro día aquí: ${publicUrl(b.slug)}`
  }
}

export function isActive(a: Appointment): boolean {
  return a.status !== 'cancelada' && a.status !== 'no_asistio'
}
