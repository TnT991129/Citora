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

// Los enlaces que se comparten apuntan a la portada con el negocio como parámetro
// (ej. https://usuario.github.io/Citora/?c=barberia-leo). GitHub Pages solo tiene la portada:
// cualquier otra dirección responde "404" aunque la app cargue, y algunos navegadores
// (WhatsApp, vistas previas) no la abren. Al arrancar, openSharedLink() lleva a la página buena.

/** Enlace para compartir de la web de clientes. sub: 'reservar' o 'mis-citas' */
export function publicUrl(slug: string, sub?: 'reservar' | 'mis-citas'): string {
  return `${siteUrl()}?c=${encodeURIComponent(slug)}${sub ? `&v=${sub}` : ''}`
}

/** Enlace para compartir del panel del dueño */
export function panelUrl(slug: string): string {
  return `${siteUrl()}?p=${encodeURIComponent(slug)}`
}

/** Enlace para compartir de una cita concreta */
export function bookingUrl(slug: string, token: string): string {
  return `${siteUrl()}?c=${encodeURIComponent(slug)}&cita=${encodeURIComponent(token)}`
}

/** Si la página se abrió con un enlace compartido (?c=… o ?p=…), cambia la dirección a la página real sin recargar */
export function openSharedLink(): void {
  const q = new URLSearchParams(window.location.search)
  const base = BASE.replace(/\/$/, '')
  const valid = (s: string | null): s is string => !!s && /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(s.toLowerCase())
  const c = q.get('c')
  const p = q.get('p')
  let path: string | null = null
  if (valid(c)) {
    const slug = c.toLowerCase()
    const cita = q.get('cita')
    const v = q.get('v')
    path = cita && /^[a-zA-Z0-9]{8,64}$/.test(cita)
      ? clientPath(slug, `cita/${cita}`)
      : clientPath(slug, v === 'reservar' || v === 'mis-citas' ? v : '')
  } else if (valid(p)) {
    path = panelPath(p.toLowerCase())
  }
  if (path) window.history.replaceState(null, '', `${base}${path}${window.location.hash}`)
}
