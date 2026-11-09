// Versión de Citora y lo nuevo en ella. Al publicar una versión nueva: cambiar APP_VERSION (y la de
// package.json) y escribir sus novedades aquí. A cada dueño se le muestran una sola vez al entrar a
// su panel (ver components/WhatsNew.tsx).
export const APP_VERSION: string = '1.3.0'

export interface ReleaseSection {
  icon: string
  title: string
  points: string[]
}

export const RELEASE_NOTES: ReleaseSection[] = [
  {
    icon: 'home',
    title: 'Tu día, de un vistazo',
    points: [
      'La pantalla Hoy ahora es una línea de tiempo: cada cita ocupa lo que dura y tiene un color según si está por confirmar, confirmada o hecha.',
      'Una raya roja marca la hora actual y ves enseguida dónde te quedan huecos libres.',
      'Pasa de Hoy a Mañana con un toque.',
      'Debajo de "Cobrado hoy", una barra con cuánto llevas cobrado de lo que esperas ganar.',
    ],
  },
  {
    icon: 'sparkles',
    title: 'Llena tus huecos libres',
    points: [
      'Toca un hueco libre y se abre "Nueva cita" con esa hora ya puesta.',
      'Botón "Publicar mis huecos": te escribe el mensaje con tus horas libres y tu enlace, listo para tu estado de WhatsApp o Instagram.',
    ],
  },
  {
    icon: 'bell',
    title: 'Recordatorios más rápidos',
    points: ['Con "Avisar a todos" vas enviando los recordatorios de mañana uno detrás de otro: al volver de WhatsApp ya tienes el siguiente listo.'],
  },
]

/** Consejo final para sacarle partido a la versión */
export const RELEASE_TIP = 'Por la mañana, pulsa "Publicar mis huecos" y ponlo en tu estado de WhatsApp: es la forma más fácil de llenar el día.'
