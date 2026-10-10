import { applyAppearance } from './appearance'

/** Cambia el color de marca de la app (variable CSS usada por Tailwind "brand").
 *  También vuelve a la letra y botones de Citora: la web de cada negocio aplica los suyos después. */
export function setBrandColor(hex: string | null | undefined): void {
  applyAppearance(null)
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '')
  const rgb = m ? `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}` : '82 67 229'
  document.documentElement.style.setProperty('--brand-rgb', rgb)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', m ? `#${m[1]}${m[2]}${m[3]}` : '#5243e5')
}

export const CITORA_COLOR = '#5243e5'

// Colores listos para elegir, por familias (todos se leen bien con texto blanco)
export const COLOR_GROUPS: { name: string; colors: string[] }[] = [
  { name: 'Morados y azules', colors: ['#5243e5', '#4338ca', '#6d28d9', '#7c3aed', '#1d4ed8', '#2563eb', '#0369a1', '#0e7490'] },
  { name: 'Rosas y rojos', colors: ['#c026d3', '#a21caf', '#db2777', '#be185d', '#e11d48', '#dc2626', '#b91c1c', '#9f1239'] },
  { name: 'Cálidos', colors: ['#ea580c', '#c2410c', '#d97706', '#b45309', '#a16207', '#92400e', '#9a3412', '#78350f'] },
  { name: 'Verdes', colors: ['#15803d', '#166534', '#047857', '#0f766e', '#0d9488', '#4d7c0f', '#3f6212', '#065f46'] },
  { name: 'Neutros y elegantes', colors: ['#111827', '#1f2937', '#334155', '#475569', '#44403c', '#57534e', '#7f1d1d', '#1e3a8a'] },
]

export const COLOR_PRESETS = COLOR_GROUPS.flatMap((g) => g.colors)

/** true si el color es tan claro que el texto blanco encima no se leería bien */
export function isLightColor(hex: string): boolean {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '')
  if (!m) return false
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => {
    const c = parseInt(x, 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  // Contraste con blanco menor que 3:1
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05) < 3
}

/** Combinaciones de degradado listas para elegir: [nombre, color principal, segundo color] */
export const GRADIENT_PRESETS: [string, string, string][] = [
  ['Atardecer', '#ea580c', '#db2777'],
  ['Océano', '#0369a1', '#4338ca'],
  ['Uva', '#6d28d9', '#db2777'],
  ['Bosque', '#166534', '#0d9488'],
  ['Noche', '#111827', '#4338ca'],
  ['Fuego', '#b91c1c', '#d97706'],
  ['Rosa', '#be185d', '#7c3aed'],
  ['Oro', '#92400e', '#a16207'],
  ['Menta', '#0f766e', '#15803d'],
  ['Elegante', '#1f2937', '#7f1d1d'],
]
