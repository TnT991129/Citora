import type { PublicStaff } from './types'

/** ¿Hace este profesional todos estos servicios? Si no configuró ninguno, hace todos (como en la base de datos) */
export function staffDoes(s: Pick<PublicStaff, 'service_ids'>, serviceIds: string[]): boolean {
  return s.service_ids.length === 0 || serviceIds.every((id) => s.service_ids.includes(id))
}

/**
 * Profesional que queda elegido al cambiar los servicios: el mismo si los hace todos; si no (o ya
 * no está en el equipo), null = "Cualquiera disponible". Sin esto, el cliente se quedaba con alguien
 * que no hace ese servicio y no le salía ninguna hora libre en ningún día.
 */
export function keepStaff(team: Pick<PublicStaff, 'id' | 'service_ids'>[], staffId: string | null, serviceIds: string[]): string | null {
  if (!staffId) return null
  const s = team.find((x) => x.id === staffId)
  return s && staffDoes(s, serviceIds) ? staffId : null
}
