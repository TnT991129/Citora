const BASE = import.meta.env.BASE_URL || '/'

/** Enlace público completo de un negocio, ej. https://citora.app/barberia-leo */
export function publicUrl(slug: string): string {
  return `${window.location.origin}${BASE}${slug}`
}

export function bookingUrl(slug: string, token: string): string {
  return `${publicUrl(slug)}/cita/${token}`
}
