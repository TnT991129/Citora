// Zonas horarias que puede tener un negocio (la cambia el administrador: ver admin_set_timezone en
// schema.sql). Con nombre de país o ciudad, que "America/Argentina/Buenos_Aires" no se entiende.
import { serverNow } from './clockSkew'
export const TIMEZONES: { tz: string; label: string }[] = [
  // Cuba no cambia la hora en invierno, aunque "America/Havana" sí lo hace: UTC−4 fijo
  { tz: 'Etc/GMT+4', label: 'Cuba' },
  { tz: 'America/Mexico_City', label: 'México (Ciudad de México)' },
  { tz: 'America/Cancun', label: 'México (Cancún)' },
  { tz: 'America/Tijuana', label: 'México (Tijuana)' },
  { tz: 'America/Guatemala', label: 'Guatemala' },
  { tz: 'America/El_Salvador', label: 'El Salvador' },
  { tz: 'America/Tegucigalpa', label: 'Honduras' },
  { tz: 'America/Managua', label: 'Nicaragua' },
  { tz: 'America/Costa_Rica', label: 'Costa Rica' },
  { tz: 'America/Panama', label: 'Panamá' },
  { tz: 'America/Santo_Domingo', label: 'República Dominicana' },
  { tz: 'America/Puerto_Rico', label: 'Puerto Rico' },
  { tz: 'America/Bogota', label: 'Colombia' },
  { tz: 'America/Caracas', label: 'Venezuela' },
  { tz: 'America/Guayaquil', label: 'Ecuador' },
  { tz: 'America/Lima', label: 'Perú' },
  { tz: 'America/La_Paz', label: 'Bolivia' },
  { tz: 'America/Santiago', label: 'Chile' },
  { tz: 'America/Asuncion', label: 'Paraguay' },
  { tz: 'America/Argentina/Buenos_Aires', label: 'Argentina' },
  { tz: 'America/Montevideo', label: 'Uruguay' },
  { tz: 'America/Sao_Paulo', label: 'Brasil (São Paulo)' },
  { tz: 'America/New_York', label: 'EE. UU. (Miami, Nueva York)' },
  { tz: 'America/Chicago', label: 'EE. UU. (Houston, Chicago)' },
  { tz: 'America/Denver', label: 'EE. UU. (Denver)' },
  { tz: 'America/Los_Angeles', label: 'EE. UU. (Los Ángeles)' },
  { tz: 'America/Toronto', label: 'Canadá (Toronto)' },
  { tz: 'Europe/Madrid', label: 'España (península y Baleares)' },
  { tz: 'Atlantic/Canary', label: 'España (Canarias)' },
  { tz: 'Europe/Lisbon', label: 'Portugal' },
  { tz: 'Europe/London', label: 'Reino Unido' },
  { tz: 'Europe/Paris', label: 'Francia' },
  { tz: 'Europe/Berlin', label: 'Alemania' },
  { tz: 'Europe/Rome', label: 'Italia' },
]

/** Nombre para mostrar de una zona, ej. tzLabel('Europe/Madrid') = "España (península y Baleares)" */
export function tzLabel(tz: string): string {
  return TIMEZONES.find((z) => z.tz === tz)?.label || tz.replace(/_/g, ' ')
}

/** Hora y diferencia con UTC en una zona en un momento, ej. { time: '10:32', offset: 'UTC−5' } */
export function tzNow(tz: string, at: Date = new Date(serverNow())): { time: string; offset: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(at).map((p) => [p.type, p.value]),
  )
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute)
  const mins = Math.round((wall - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000)
  const abs = Math.abs(mins)
  const offset = `UTC${mins < 0 ? '−' : '+'}${Math.floor(abs / 60)}${abs % 60 ? `:${String(abs % 60).padStart(2, '0')}` : ''}`
  return { time: `${parts.hour}:${parts.minute}`, offset }
}
