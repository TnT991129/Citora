/** Cambia el color de marca de la app (variable CSS usada por Tailwind "brand") */
export function setBrandColor(hex: string | null | undefined): void {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '')
  const rgb = m ? `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}` : '82 67 229'
  document.documentElement.style.setProperty('--brand-rgb', rgb)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', m ? `#${m[1]}${m[2]}${m[3]}` : '#5243e5')
}

export const CITORA_COLOR = '#5243e5'

// Colores listos para elegir (todos se leen bien con texto blanco)
export const COLOR_PRESETS = [
  '#5243e5', '#7c3aed', '#c026d3', '#db2777', '#e11d48', '#dc2626',
  '#ea580c', '#b45309', '#15803d', '#0f766e', '#0369a1', '#1d4ed8',
  '#334155', '#111827',
]
