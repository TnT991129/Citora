// Versión de Citora y lo nuevo en ella. Al publicar una versión nueva: cambiar APP_VERSION (y la de
// package.json) y escribir sus novedades aquí. A cada dueño se le muestran una sola vez al entrar a
// su panel (ver components/WhatsNew.tsx).
export const APP_VERSION: string = '1.2.0'

export interface ReleaseSection {
  icon: string
  title: string
  points: string[]
}

export const RELEASE_NOTES: ReleaseSection[] = [
  {
    icon: 'globe',
    title: 'Tu web de reservas, renovada',
    points: [
      'Nuevo diseño, más moderno y profesional.',
      'Ahora se ven las fotos de tus servicios y de tu equipo.',
      'Botón "Cómo llegar" junto a tu dirección y tu horario más claro.',
      'En ordenador, la reserva queda siempre a mano en una tarjeta al lado.',
    ],
  },
  {
    icon: 'users',
    title: 'Reservar es más fácil para tus clientes',
    points: [
      'Ven en qué paso van ("Paso 2 de 4") y el servicio elegido se resalta.',
      'Si eligen a alguien de tu equipo que no hace ese servicio, pasa solo a "Cualquiera disponible" y siempre ven horas libres.',
    ],
  },
  {
    icon: 'home',
    title: 'Tu panel, más claro',
    points: [
      'La pantalla Hoy, rediseñada: tu próxima cita con cuenta atrás y cada cita con un color según si está pendiente, confirmada o hecha.',
      '"Más" ahora está ordenado por temas.',
      'En ordenador, un menú a la izquierda con todo a mano.',
      'El modo oscuro se ve mejor en todas las pantallas.',
    ],
  },
  {
    icon: 'shield',
    title: 'Más estable',
    points: ['Cuando actualicemos Citora, la app se pone al día sola, sin errores, aunque la tengas abierta.'],
  },
]

/** Consejo final para sacarle partido a la versión */
export const RELEASE_TIP = 'Si tienes fotos de tus servicios o de tu equipo, súbelas en Servicios y en Equipo: ahora lucen en tu web.'
