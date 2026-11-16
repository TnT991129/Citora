// Versión de Citora y lo nuevo en ella. Al publicar una versión nueva: cambiar APP_VERSION (y la de
// package.json) y escribir sus novedades aquí. A cada dueño se le muestran una sola vez al entrar a
// su panel (ver components/WhatsNew.tsx).
export const APP_VERSION: string = '1.4.0'

export interface ReleaseSection {
  icon: string
  title: string
  points: string[]
}

export const RELEASE_NOTES: ReleaseSection[] = [
  {
    icon: 'grid',
    title: 'Un panel más sencillo',
    points: [
      'Abajo tienes ahora "Mi negocio": tu enlace para compartir, tus servicios, tu horario y la apariencia de tu página, todo junto.',
      'En "Más" solo ves las herramientas que usas. Las demás siguen ahí: actívalas con un toque cuando las necesites.',
      'Los días que te quedan de prueba se ven arriba, junto a tu nombre.',
    ],
  },
  {
    icon: 'home',
    title: 'Hoy, más claro',
    points: [
      'Arriba, en una línea: cuántas citas tienes, cuántas faltan por confirmar y cuánto vas a cobrar.',
      'Las citas por confirmar tienen su botón "Confirmar" a la vista.',
      'Para apuntar una cita, el botón + de abajo a la derecha.',
    ],
  },
  {
    icon: 'sparkles',
    title: 'Tutorial paso a paso',
    points: ['Te enseña a usar tu panel sobre la pantalla de verdad, con citas de ejemplo. Lo tienes en Más → Tutorial paso a paso.'],
  },
  {
    icon: 'scissors',
    title: 'Cada profesional, sus servicios',
    points: [
      'Al añadir a alguien en Mi negocio → Equipo, se abre "Su enlace": mándaselo por WhatsApp y desde su móvil crea sus servicios, sus precios y su horario, sin crear cuenta. Lo anulas cuando quieras.',
      'Ponle a cada uno su especialidad (Uñas, Pestañas, Peluquería…): en tu página, los servicios ya no salen mezclados, sino agrupados por especialidad y con quién los hace.',
    ],
  },
  {
    icon: 'card',
    title: 'Dos planes: Solo y Equipo',
    points: [
      'Citora Solo, para quien atiende solo, con todo incluido menos el equipo.',
      'Citora Equipo, para salones con varias personas. Los elegirás al pagar en Más → Mensualidad.',
    ],
  },
  {
    icon: 'users',
    title: 'Recupera clientes',
    points: ['En Clientes, el filtro "Hace tiempo que no vienen" y el botón "Escribirle", con un mensaje de "te echamos de menos" ya escrito.'],
  },
]

/** Consejo final para sacarle partido a la versión */
export const RELEASE_TIP = 'Entra en Clientes → "Hace tiempo que no vienen" y escríbeles: es la forma más fácil de llenar tu agenda esta semana.'
