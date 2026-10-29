// Funciones puras de la medición de visitas (ver analytics.ts). Aparte, sin Supabase, para poder
// probarlas sin cargar el cliente de la base de datos.

/** De dónde viene el visitante: ?utm_source=..., la app desde la que abrió el enlace o la web anterior */
export function detectSource(search: string, referrer: string, ua: string, host: string): string {
  const q = new URLSearchParams(search)
  const utm = (q.get('utm_source') || q.get('ref') || '').trim().toLowerCase()
  if (utm) return utm.slice(0, 30)
  const r = referrer.toLowerCase()
  if (/instagram/i.test(ua) || r.includes('instagram.')) return 'instagram'
  if (/FBAN|FBAV|FB_IAB/.test(ua) || /facebook\.|fb\.com|fb\.me/.test(r)) return 'facebook'
  if (r.includes('whatsapp') || r.includes('wa.me')) return 'whatsapp'
  if (/google\./.test(r)) return 'google'
  if (r.includes('tiktok')) return 'tiktok'
  if (/(^|\/\/)(t\.co|x\.com|twitter\.com)/.test(r)) return 'x'
  if (r && !r.includes(host)) return 'otra web'
  return 'directo'
}

/** Robots, vistas previas de enlaces y navegadores automáticos no cuentan como visitas */
export function isBot(ua: string, webdriver: boolean): boolean {
  return webdriver || /bot|crawl|spider|slurp|preview|facebookexternalhit|^WhatsApp\//i.test(ua)
}
