import type { PublicStaff } from './types'

/**
 * ¿Hace este profesional todos estos servicios? Como en la base de datos (_staff_can_do): si no
 * tiene ninguno marcado hace todos, salvo si tiene servicios propios (all_services = false).
 */
export function staffDoes(s: Pick<PublicStaff, 'service_ids' | 'all_services'>, serviceIds: string[]): boolean {
  const all = s.all_services ?? s.service_ids.length === 0
  return all || serviceIds.every((id) => s.service_ids.includes(id))
}

/**
 * Profesional que queda elegido al cambiar los servicios: el mismo si los hace todos; si no (o ya
 * no está en el equipo), null = "Cualquiera disponible". Sin esto, el cliente se quedaba con alguien
 * que no hace ese servicio y no le salía ninguna hora libre en ningún día.
 */
export function keepStaff(team: Pick<PublicStaff, 'id' | 'service_ids' | 'all_services'>[], staffId: string | null, serviceIds: string[]): string | null {
  if (!staffId) return null
  const s = team.find((x) => x.id === staffId)
  return s && staffDoes(s, serviceIds) ? staffId : null
}
