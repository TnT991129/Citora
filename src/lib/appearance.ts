// Personalización de la web de cada negocio (se guarda en businesses.appearance)

export type FontKey = 'inter' | 'poppins' | 'montserrat' | 'playfair' | 'nunito'
export type ButtonShape = 'rounded' | 'square' | 'pill'

export interface Appearance {
  font?: FontKey
  buttons?: ButtonShape
  cover_style?: 'color' | 'image'
  tagline?: string
  announcement?: string
  book_label?: string
  thanks_message?: string
  show_prices?: boolean
  show_durations?: boolean
  show_gallery?: boolean
  show_reviews?: boolean
  show_hours?: boolean
  instagram?: string
  facebook?: string
  tiktok?: string
  maps_url?: string
}

export const FONTS: Record<FontKey, { name: string; style: string; family: string; google: string | null }> = {
  inter: { name: 'Moderna', style: 'Limpia y fácil de leer', family: "'Inter', system-ui, sans-serif", google: null },
  poppins: { name: 'Geométrica', style: 'Actual y con carácter', family: "'Poppins', system-ui, sans-serif", google: 'Poppins:wght@400;500;600;700;800' },
  montserrat: { name: 'Urbana', style: 'Fuerte, de barbería', family: "'Montserrat', system-ui, sans-serif", google: 'Montserrat:wght@400;500;600;700;800' },
  playfair: { name: 'Elegante', style: 'Clásica, de salón o spa', family: "'Playfair Display', Georgia, serif", google: 'Playfair+Display:wght@400;600;700;800' },
  nunito: { name: 'Redondeada', style: 'Amable y cercana', family: "'Nunito', system-ui, sans-serif", google: 'Nunito:wght@400;600;700;800' },
}

export const BUTTON_SHAPES: Record<ButtonShape, { name: string; radius: string }> = {
  rounded: { name: 'Redondeados', radius: '0.75rem' },
  square: { name: 'Rectos', radius: '0.375rem' },
  pill: { name: 'Píldora', radius: '9999px' },
}

/** Por defecto todo se muestra */
export function shows(a: Appearance | null | undefined, key: 'show_prices' | 'show_durations' | 'show_gallery' | 'show_reviews' | 'show_hours'): boolean {
  return a?.[key] !== false
}

/** Descarga la letra de Google Fonts (una sola vez) */
export function loadFont(font: FontKey | undefined): void {
  const g = font ? FONTS[font]?.google : null
  if (!g) return
  const id = `font-${font}`
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${g}&display=swap`
  document.head.appendChild(link)
}

/** Aplica la letra y la forma de botones del negocio a toda la página (null = las de Citora) */
export function applyAppearance(a: Appearance | null | undefined): void {
  const root = document.documentElement.style
  const font = a?.font && FONTS[a.font] ? a.font : 'inter'
  loadFont(font)
  root.setProperty('--app-font', FONTS[font].family)
  root.setProperty('--btn-radius', BUTTON_SHAPES[a?.buttons && BUTTON_SHAPES[a.buttons] ? a.buttons : 'rounded'].radius)
}

export const socialUrl = {
  instagram: (u: string) => `https://instagram.com/${encodeURIComponent(u)}`,
  facebook: (u: string) => `https://facebook.com/${encodeURIComponent(u)}`,
  tiktok: (u: string) => `https://www.tiktok.com/@${encodeURIComponent(u)}`,
}
