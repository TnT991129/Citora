import { t as tx } from './i18n'
// Tipos de negocio y servicios sugeridos para cada uno
export interface ServiceTemplate {
  name: string
  price: number // en CUP
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
    key: 'unas', name: tx('Uñas'), emoji: '💅',
    services: [
      { name: tx('Manicura'), price: 1500, duration_min: 60 },
      { name: tx('Pedicura'), price: 1800, duration_min: 60 },
      { name: tx('Uñas acrílicas'), price: 3500, duration_min: 120 },
      { name: tx('Retoque'), price: 1200, duration_min: 60 },
    ],
  },
  {
    key: 'barberia', name: tx('Barbería'), emoji: '💈',
    services: [
      { name: tx('Corte'), price: 600, duration_min: 30 },
      { name: tx('Barba'), price: 400, duration_min: 30 },
      { name: tx('Corte + barba'), price: 900, duration_min: 60 },
    ],
  },
  {
    key: 'peluqueria', name: tx('Peluquería'), emoji: '💇‍♀️',
    services: [
      { name: tx('Corte de pelo'), price: 1000, duration_min: 45 },
      { name: tx('Peinado'), price: 1200, duration_min: 60 },
      { name: tx('Tinte'), price: 3000, duration_min: 120 },
      { name: tx('Alisado'), price: 4000, duration_min: 150 },
    ],
  },
  {
    key: 'cejas', name: tx('Cejas y pestañas'), emoji: '👁️',
    services: [
      { name: tx('Diseño de cejas'), price: 800, duration_min: 30 },
      { name: tx('Extensión de pestañas'), price: 3000, duration_min: 90 },
      { name: tx('Lifting de pestañas'), price: 2000, duration_min: 60 },
    ],
  },
  {
    key: 'spa', name: tx('Spa y masajes'), emoji: '💆',
    services: [
      { name: tx('Masaje relajante'), price: 2500, duration_min: 60 },
      { name: tx('Limpieza facial'), price: 2000, duration_min: 60 },
    ],
  },
  {
    key: 'maquillaje', name: tx('Maquillaje'), emoji: '💄',
    services: [
      { name: tx('Maquillaje social'), price: 2500, duration_min: 60 },
      { name: tx('Maquillaje de novia'), price: 6000, duration_min: 120 },
    ],
  },
  {
    key: 'tatuajes', name: tx('Tatuajes'), emoji: '🖋️',
    services: [
      { name: tx('Tatuaje pequeño'), price: 3000, duration_min: 60 },
      { name: tx('Consulta de diseño'), price: 0, duration_min: 30 },
    ],
  },
  {
    key: 'consulta', name: tx('Consulta'), emoji: '🩺',
    services: [
      { name: tx('Consulta'), price: 1000, duration_min: 30 },
      { name: tx('Seguimiento'), price: 600, duration_min: 30 },
    ],
  },
  {
    key: 'otro', name: tx('Otro'), emoji: '✨',
    services: [{ name: tx('Servicio'), price: 1000, duration_min: 60 }],
  },
]

export function businessType(key: string | null | undefined): BusinessType {
  return BUSINESS_TYPES.find((t) => t.key === key) || BUSINESS_TYPES[BUSINESS_TYPES.length - 1]
}
