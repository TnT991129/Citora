// Traduce los códigos de error de la base de datos a mensajes claros
const MESSAGES: Record<string, string> = {
  NEGOCIO_NO_EXISTE: 'Este negocio no existe.',
  NEGOCIO_INACTIVO: 'Este negocio no está recibiendo reservas en este momento.',
  NOMBRE_INVALIDO: 'Escribe tu nombre (al menos 2 letras).',
  TELEFONO_INVALIDO: 'Escribe un teléfono válido (al menos 8 dígitos).',
  SERVICIOS_INVALIDOS: 'Algún servicio ya no está disponible. Vuelve a elegirlos.',
  TURNO_INVALIDO: 'Ese turno ya no está disponible. Elige otro.',
  TURNO_OCUPADO: 'Ese horario se acaba de ocupar. Elige otro.',
  LIMITE_CITAS: 'Ya tienes varias citas pendientes con este teléfono. Si necesitas otra, escribe al negocio por WhatsApp.',
  CITA_NO_EXISTE: 'No encontramos esta cita.',
  CITA_NO_MODIFICABLE: 'Esta cita ya no se puede modificar.',
  FUERA_DE_PLAZO: 'Ya no se puede cambiar ni cancelar desde aquí. Escribe al negocio por WhatsApp.',
  LIMITE_CAMBIOS: 'Esta cita ya se cambió una vez. Para otro cambio, escribe al negocio por WhatsApp.',
  SIN_SESION: 'Tu sesión expiró. Vuelve a entrar.',
  YA_TIENE_NEGOCIO: 'Esta cuenta ya tiene un negocio creado.',
  ENLACE_NO_DISPONIBLE: 'Ese enlace ya está en uso o no es válido. Prueba otro.',
  ENLACE_INVALIDO: 'El enlace solo puede tener letras minúsculas, números y guiones (3 a 40 caracteres).',
  SIN_NEGOCIO: 'Todavía no has creado tu negocio.',
  NO_AUTORIZADO: 'No tienes permiso para hacer esto.',
  PLAN_INVALIDO: 'Plan no válido.',
  MESES_INVALIDOS: 'Número de meses no válido.',
  DIAS_INVALIDOS: 'Número de días no válido.',
  NO_DISPONIBLE: 'Tu plan actual no incluye esta función.',
  OPINION_NO_PERMITIDA: 'Podrás dejar tu opinión cuando hayas ido a tu cita.',
  OPINION_FUERA_DE_PLAZO: 'Ya pasó el plazo para opinar sobre esta cita.',
  VALORACION_INVALIDA: 'Elige de 1 a 5 estrellas.',
  RANGO_INVALIDO: 'Rango de fechas no válido.',
  CUPON_INVALIDO: 'Ese código de descuento no existe o ya no está activo.',
  CUPON_VENCIDO: 'Ese código de descuento ya venció.',
  CUPON_AGOTADO: 'Ese código de descuento ya se usó todas las veces permitidas.',
  PROFESIONAL_INVALIDO: 'Ese profesional no es de tu negocio.',
  LIMITE_ESPERA: 'Ya estás en la lista de espera de varios días. Espera a que el negocio te escriba.',
}

export function errorMessage(err: unknown): string {
  const raw =
    typeof err === 'string'
      ? err
      : (err as { message?: string })?.message || (err as { error_description?: string })?.error_description || ''
  for (const code of Object.keys(MESSAGES)) {
    if (raw.includes(code)) return MESSAGES[code]
  }
  if (/Invalid login credentials/i.test(raw)) return 'Correo o contraseña incorrectos.'
  if (/User already registered/i.test(raw)) return 'Ya existe una cuenta con ese correo. Entra con tu contraseña.'
  if (/Email not confirmed/i.test(raw)) return 'Confirma tu correo antes de entrar (revisa tu bandeja de entrada).'
  if (/Password should be at least/i.test(raw)) return 'La contraseña debe tener al menos 6 caracteres.'
  if (/rate limit/i.test(raw)) return 'Demasiados intentos. Espera unos minutos y vuelve a probar.'
  if (/Failed to fetch|NetworkError|network/i.test(raw)) return 'Sin conexión. Revisa tus datos o el wifi y vuelve a intentarlo.'
  if (/duplicate key|unique/i.test(raw)) return 'Ese dato ya existe.'
  return raw || 'Algo salió mal. Inténtalo de nuevo.'
}
