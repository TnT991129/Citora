// Políticas del negocio: temas con texto propio (o uno por defecto si se deja vacío), armado a
// partir de las reglas de reserva. Se usa igual en el panel (para la vista previa) y en la web
// pública (para lo que lee el cliente).

export type PolicyKey = 'cancelaciones' | 'cambios' | 'retrasos' | 'no_asistio' | 'reembolsos' | 'espera' | 'privacidad'

export type PolicySections = Partial<Record<PolicyKey, string>>

export const POLICY_SECTIONS: { key: PolicyKey; label: string; hint: string }[] = [
  { key: 'cancelaciones', label: 'Cancelaciones', hint: 'Hasta cuándo se puede cancelar sin problema.' },
  { key: 'cambios', label: 'Cambios de fecha u hora', hint: 'Hasta cuándo y cuántas veces se puede cambiar una cita.' },
  { key: 'retrasos', label: 'Retrasos', hint: 'Qué pasa si el cliente llega tarde.' },
  { key: 'no_asistio', label: 'Si no asiste', hint: 'Qué pasa si falta sin avisar.' },
  { key: 'reembolsos', label: 'Reembolsos', hint: 'Tu política si algo sale mal con el servicio.' },
  { key: 'espera', label: 'Tiempo de espera', hint: 'Si a veces hay que esperar un poco para empezar.' },
  { key: 'privacidad', label: 'Privacidad', hint: 'Qué haces con los datos del cliente.' },
]

export interface PolicyRules {
  cancel_notice_hours: number
  reschedule_notice_hours: number
  max_reschedules: number | null
}

/** Texto que ve el cliente si el dueño no escribió el suyo, usando las reglas reales del negocio */
export function defaultPolicyText(key: PolicyKey, r: PolicyRules): string {
  switch (key) {
    case 'cancelaciones':
      return r.cancel_notice_hours > 0
        ? `Puedes cancelar sin costo hasta ${r.cancel_notice_hours} horas antes de tu cita. Pasado ese plazo, escríbeme por WhatsApp.`
        : 'Puedes cancelar hasta la hora de tu cita. Avísame cuanto antes si no vas a venir.'
    case 'cambios': {
      const plazo = r.reschedule_notice_hours > 0 ? `hasta ${r.reschedule_notice_hours} horas antes` : 'hasta la hora de tu cita'
      const tope = r.max_reschedules
        ? ` Puedes hacerlo hasta ${r.max_reschedules} ${r.max_reschedules === 1 ? 'vez' : 'veces'}.`
        : ' No hay límite de cambios.'
      return `Puedes cambiar el día o la hora de tu cita desde tu enlace ${plazo}.${tope}`
    }
    case 'retrasos':
      return 'Si llegas tarde, puede que tengamos que acortar tu servicio o reprogramarlo para no afectar a la siguiente clienta.'
    case 'no_asistio':
      return 'Si faltas sin avisar, puede que te pida confirmar tus próximas citas por adelantado.'
    case 'reembolsos':
      return 'Si algo no quedó bien, escríbeme dentro de los primeros días y lo solucionamos.'
    case 'espera':
      return 'A veces el trabajo anterior se extiende un poco: gracias por tu paciencia.'
    case 'privacidad':
      return 'Guardo tu nombre, tu teléfono y tu historial de citas únicamente para gestionar tus reservas. No los comparto con nadie.'
  }
}

export interface PolicyEntry {
  key: PolicyKey
  label: string
  text: string
  isDefault: boolean
}

/** Las 7 secciones en orden, con el texto propio del negocio o el que corresponde por defecto */
export function policyEntries(sections: PolicySections | null | undefined, rules: PolicyRules): PolicyEntry[] {
  return POLICY_SECTIONS.map(({ key, label }) => {
    const custom = sections?.[key]?.trim()
    return { key, label, text: custom || defaultPolicyText(key, rules), isDefault: !custom }
  })
}
