// Tipos de negocio y servicios sugeridos para cada uno
export interface ServiceTemplate {
  name: string
  price: number
  duration_min: number
}

export interface BusinessType {
  key: string
  name: string
  emoji: string
  services: ServiceTemplate[]
}

export const BUSINESS_TYPES: BusinessType[] = [
  {
    key: 'unas', name: 'Uñas', emoji: '💅',
    services: [
      { name: 'Manicura', price: 1500, duration_min: 60 },
      { name: 'Pedicura', price: 1800, duration_min: 60 },
      { name: 'Uñas acrílicas', price: 3500, duration_min: 120 },
      { name: 'Retoque', price: 1200, duration_min: 60 },
    ],
  },
  {
    key: 'barberia', name: 'Barbería', emoji: '💈',
    services: [
      { name: 'Corte', price: 600, duration_min: 30 },
      { name: 'Barba', price: 400, duration_min: 30 },
      { name: 'Corte + barba', price: 900, duration_min: 60 },
    ],
  },
  {
    key: 'peluqueria', name: 'Peluquería', emoji: '💇‍♀️',
    services: [
      { name: 'Corte de pelo', price: 1000, duration_min: 45 },
      { name: 'Peinado', price: 1200, duration_min: 60 },
      { name: 'Tinte', price: 3000, duration_min: 120 },
      { name: 'Alisado', price: 4000, duration_min: 150 },
    ],
  },
  {
    key: 'cejas', name: 'Cejas y pestañas', emoji: '👁️',
    services: [
      { name: 'Diseño de cejas', price: 800, duration_min: 30 },
      { name: 'Extensión de pestañas', price: 3000, duration_min: 90 },
      { name: 'Lifting de pestañas', price: 2000, duration_min: 60 },
    ],
  },
  {
    key: 'spa', name: 'Spa y masajes', emoji: '💆',
    services: [
      { name: 'Masaje relajante', price: 2500, duration_min: 60 },
      { name: 'Limpieza facial', price: 2000, duration_min: 60 },
    ],
  },
  {
    key: 'maquillaje', name: 'Maquillaje', emoji: '💄',
    services: [
      { name: 'Maquillaje social', price: 2500, duration_min: 60 },
      { name: 'Maquillaje de novia', price: 6000, duration_min: 120 },
    ],
  },
  {
    key: 'tatuajes', name: 'Tatuajes', emoji: '🖋️',
    services: [
      { name: 'Tatuaje pequeño', price: 3000, duration_min: 60 },
      { name: 'Consulta de diseño', price: 0, duration_min: 30 },
    ],
  },
  {
    key: 'consulta', name: 'Consulta', emoji: '🩺',
    services: [
      { name: 'Consulta', price: 1000, duration_min: 30 },
      { name: 'Seguimiento', price: 600, duration_min: 30 },
    ],
  },
  {
    key: 'otro', name: 'Otro', emoji: '✨',
    services: [{ name: 'Servicio', price: 1000, duration_min: 60 }],
  },
]

export function businessType(key: string | null | undefined): BusinessType {
  return BUSINESS_TYPES.find((t) => t.key === key) || BUSINESS_TYPES[BUSINESS_TYPES.length - 1]
}
