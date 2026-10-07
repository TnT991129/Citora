const BASE = import.meta.env.BASE_URL || '/'

// Cada negocio tiene dos partes, colgando de su enlace:
//   /barberia-leo/client       → la web donde reservan sus clientes
//   /barberia-leo/panel-admin  → el panel del dueño

/** Ruta interna de la web de clientes, ej. clientPath('barberia-leo', 'reservar') = "/barberia-leo/client/reservar" */
export function clientPath(slug: string, sub = ''): string {
  return `/${slug}/client${sub ? `/${sub}` : ''}`
}

/** Ruta interna del panel del dueño, ej. panelPath('barberia-leo', 'agenda') = "/barberia-leo/panel-admin/agenda" */
export function panelPath(slug: string, sub = ''): string {
  return `/${slug}/panel-admin${sub ? `/${sub}` : ''}`
}

/** Dirección de la plataforma, ej. https://usuario.github.io/Citora/ */
export function siteUrl(): string {
  return `${window.location.origin}${BASE}`
}

/** Enlace público completo de la web de clientes, ej. https://citora.app/barberia-leo/client */
export function publicUrl(slug: string): string {
  return `${window.location.origin}${BASE}${clientPath(slug).slice(1)}`
}

/** Enlace completo del panel del dueño */
export function panelUrl(slug: string): string {
  return `${window.location.origin}${BASE}${panelPath(slug).slice(1)}`
}

export function bookingUrl(slug: string, token: string): string {
  return `${publicUrl(slug)}/cita/${token}`
}
